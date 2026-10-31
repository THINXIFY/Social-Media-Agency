import { Client } from "pg";
import { runMigrations } from "./migrate";
import { describeTarget, fail, loadEnvFiles, requireSafeTarget } from "./shared";

/**
 * Non-destructive UTF-8 copy of a local development database (AI-07).
 *
 * Windows embedded PostgreSQL clusters default to WIN1252, which can't store
 * emoji or most non-Latin text. This creates `<name>_utf8` on the same server,
 * applies every migration, copies all rows of every public table (in foreign
 * key order, with triggers paused only for this copy session), resets
 * sequences and verifies row counts table by table.
 *
 * The source database is only read. Nothing in .env is changed: after a
 * successful copy, point DATABASE_URL at the new database yourself (the old
 * one stays as your backup). The pg-boss job schema is not copied (transient).
 *
 *   npm run db:utf8-copy                 # create and verify the copy
 *   npm run db:utf8-copy -- --replace    # drop an earlier COPY and redo it
 */

async function main() {
  loadEnvFiles();
  const source = new URL(requireSafeTarget("db:utf8-copy"));
  const name = source.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error("Unexpected database name.");
  const copyName = `${name}_utf8`;
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const target = new URL(source);
  target.pathname = `/${copyName}`;

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const enc = (await admin.query("select pg_encoding_to_char(encoding) as e from pg_database where datname = $1", [name])).rows[0]?.e;
  console.log(`Source ${describeTarget(source.toString())} is ${enc}.`);
  if (enc === "UTF8") {
    console.log("✔ Already UTF-8 — nothing to do.");
    await admin.end();
    return;
  }
  const exists = (await admin.query("select 1 from pg_database where datname = $1", [copyName])).rowCount;
  if (exists && !process.argv.includes("--replace")) throw new Error(`${copyName} already exists. Re-run with --replace to drop that COPY and make a new one (the source is never touched).`);
  if (exists) await admin.query(`drop database ${copyName} with (force)`);
  await admin.query(`create database ${copyName} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  await admin.end();

  console.log(`Applying migrations to ${copyName} …`);
  await runMigrations(target.toString());

  const src = new Client({ connectionString: source.toString() });
  const dst = new Client({ connectionString: target.toString() });
  await src.connect();
  await dst.connect();
  // Read source text as UTF-8; PostgreSQL converts from WIN1252 losslessly.
  await src.query("set client_encoding = 'UTF8'");
  await src.query("begin isolation level repeatable read read only");

  const tables: string[] = (await src.query("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows.map((r) => r.tablename);
  const fks: { child: string; parent: string }[] = (
    await src.query(`select c.relname as child, p.relname as parent from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid join pg_namespace n on n.oid = c.relnamespace where k.contype = 'f' and n.nspname = 'public' and c.relname <> p.relname`)
  ).rows;
  const order: string[] = [];
  const pending = new Set(tables);
  while (pending.size) {
    const ready = [...pending].filter((t) => !fks.some((f) => f.child === t && pending.has(f.parent)));
    if (!ready.length) throw new Error("Couldn't order tables by foreign keys (cycle).");
    for (const t of ready.sort()) {
      order.push(t);
      pending.delete(t);
    }
  }

  await dst.query("begin");
  await dst.query("set local session_replication_role = replica");
  await dst.query(`truncate ${order.map((t) => `"${t}"`).join(", ")}`);
  const counts: Record<string, number> = {};
  for (const t of order) {
    const { rows } = await src.query(`select row_to_json(x) as r from "${t}" x`);
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => r.r);
      await dst.query(`insert into "${t}" overriding system value select * from json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(chunk)]);
    }
    counts[t] = rows.length;
  }
  const seqs = (await dst.query(`select s.relname as seq, t.relname as tbl, a.attname as col from pg_class s join pg_depend d on d.objid = s.oid join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid join pg_namespace n on n.oid = s.relnamespace where s.relkind = 'S' and n.nspname = 'public'`)).rows;
  for (const s of seqs) await dst.query(`select setval('"${s.seq}"', coalesce((select max("${s.col}") from "${s.tbl}"), 0) + 1, false)`);
  await dst.query("commit");
  await src.query("commit");

  let bad = 0;
  for (const t of order) {
    const n = Number((await dst.query(`select count(*)::int as n from "${t}"`)).rows[0].n);
    if (n !== counts[t]) {
      bad++;
      console.error(`✖ ${t}: source ${counts[t]}, copy ${n}`);
    }
  }
  await src.end();
  await dst.end();
  if (bad) throw new Error(`${bad} table(s) didn't match. The copy is incomplete; the source is unchanged.`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`✔ Copied ${total} rows across ${order.length} tables into ${copyName} (UTF-8); every table's row count matches.`);
  console.log(`Next: set DATABASE_URL to …/${copyName} in .env.local and restart. Keep ${name} as your backup until you're happy.`);
}

main().catch(fail);
