import { describe, expect, it } from "vitest";
import { z } from "zod";
import { anthropicProvider } from "@/server/ai/anthropic";
import { costMicros, priceFor, worstCaseMicros } from "@/server/ai/pricing";
import { generationStatus, ProviderError, providerStatus } from "@/server/ai/provider";
import { envSchema } from "@/server/env";

/*
 * The Anthropic adapter against a mocked HTTP layer (isolated test — no
 * network, no real key). Live behaviour is verified separately with
 * `npm run ai:verify` once credentials exist.
 */

const KEY = "sk-ant-test-0000000000000000000000";
const env = (over: Record<string, string> = {}) => envSchema.parse({ APP_ENV: "test", AI_PROVIDER: "anthropic", AI_API_KEY: KEY, AI_MODEL: "claude-haiku-5-5", AI_DAILY_BUDGET_MICROS: "1000000", ...over });
const schema = z.object({ captions: z.array(z.string()).min(1) }).strict();

type Seen = { url: string; headers: Headers; body: Record<string, unknown> };
function fakeFetch(respond: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const seen = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(seen);
    if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return respond(seen);
  }) as typeof fetch;
  return { fn, calls };
}
const message = (over: Record<string, unknown> = {}) =>
  Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: '{"captions":["Autumn' }, { type: "text", text: ' is here"]}' }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...over,
  });
const apiError = (status: number, type: string) => Response.json({ type: "error", error: { type, message: "test" } }, { status });
const request = (signal = new AbortController().signal) => ({ system: "SYSTEM RULES", input: "<brief>{}</brief>", output: schema, maxOutputTokens: 4000, signal });

describe("Anthropic adapter (mocked HTTP)", () => {
  it("sends one structured request with the server key, low effort and the tool's JSON schema", async () => {
    const f = fakeFetch(() => message());
    const res = await anthropicProvider(env(), { fetch: f.fn }).generate(request());
    expect(f.calls).toHaveLength(1);
    const { url, headers, body } = f.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`); // this SDK sends the key as a bearer token
    expect(headers.get("anthropic-version")).toBeTruthy();
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 4000, system: "SYSTEM RULES", messages: [{ role: "user", content: "<brief>{}</brief>" }], output_config: { effort: "low", format: { type: "json_schema" } } });
    expect(JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema)).toContain("captions");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).not.toHaveProperty("thinking");
    // Text blocks are joined; cost uses the model's price: 1000 × $0.10 + 2000 × $0.50 per MTok = 1,100 micros.
    expect(res).toEqual({ text: '{"captions":["Autumn is here"]}', model: "claude-haiku-5-5", usage: { inputTokens: 1000, outputTokens: 2000, costMicros: 1100 } });
  });

  it("ignores ambient SDK credentials and endpoints", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { ANTHROPIC_API_KEY: "sk-ant-ambient-should-not-be-used", ANTHROPIC_AUTH_TOKEN: "ambient-token", ANTHROPIC_BASE_URL: "https://evil.example" });
    try {
      const f = fakeFetch(() => message());
      await anthropicProvider(env(), { fetch: f.fn }).generate(request());
      expect(f.calls[0].url.startsWith("https://api.anthropic.com/")).toBe(true);
      expect(f.calls[0].headers.get("authorization")).toBe(`Bearer ${KEY}`);
      expect(f.calls[0].headers.get("x-api-key")).toBeNull();
    } finally {
      for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("maps failures to safe kinds, and never retries inside the SDK", async () => {
    const cases: [Response | Error, string][] = [
      [apiError(429, "rate_limit_error"), "rate_limited"],
      [apiError(529, "overloaded_error"), "outage"],
      [apiError(500, "api_error"), "outage"],
      [apiError(401, "authentication_error"), "rejected"],
      [apiError(400, "invalid_request_error"), "rejected"],
      [new TypeError("fetch failed"), "outage"],
    ];
    for (const [answer, kind] of cases) {
      const f = fakeFetch(() => {
        if (answer instanceof Error) throw answer;
        return answer;
      });
      const err = await anthropicProvider(env(), { fetch: f.fn })
        .generate(request())
        .catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.kind).toBe(kind);
      expect(f.calls).toHaveLength(1); // the pipeline owns its single retry
      expect(String(err.message)).not.toContain(KEY);
    }
  });

  it("treats a refusal as rejected and a cancelled call as a timeout", async () => {
    const refused = await anthropicProvider(env(), { fetch: fakeFetch(() => message({ stop_reason: "refusal", content: [] })).fn })
      .generate(request())
      .catch((e) => e);
    expect(refused).toMatchObject({ kind: "rejected" });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await anthropicProvider(env(), { fetch: fakeFetch(() => message()).fn })
      .generate(request(controller.signal))
      .catch((e) => e);
    expect(cancelled).toMatchObject({ kind: "timeout" });
  });

  it("returns truncated text on max_tokens so the pipeline rejects it (cost still counted)", async () => {
    const res = await anthropicProvider(env(), { fetch: fakeFetch(() => message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"captions":["cut' }] })).fn }).generate(request());
    expect(() => JSON.parse(res.text)).toThrow();
    expect(res.usage.costMicros).toBe(1100);
  });
});

describe("pricing and readiness (fail closed)", () => {
  it("knows current Anthropic prices, honours overrides, and refuses unknown models", () => {
    expect(priceFor(env({ AI_MODEL: "claude-opus-5-5" }))).toEqual({ input: 4, output: 20 });
    expect(priceFor(env({ AI_MODEL: "claude-sonnet-5-5" }))).toEqual({ input: 2, output: 10 });
    expect(priceFor(env({ AI_MODEL: "some-future-model" }))).toBeNull();
    expect(priceFor(env({ AI_MODEL: "some-future-model", AI_PRICE_INPUT_PER_MTOK: "1", AI_PRICE_OUTPUT_PER_MTOK: "3" }))).toEqual({ input: 1, output: 3 });
    expect(() => env({ AI_PRICE_INPUT_PER_MTOK: "1" })).toThrow(/set together/);
    // Blank values (as copied from .env.example) mean "not set" — never a $0 price.
    expect(priceFor(env({ AI_MODEL: "some-future-model", AI_PRICE_INPUT_PER_MTOK: "", AI_PRICE_OUTPUT_PER_MTOK: "" }))).toBeNull();
    expect(() => env({ AI_API_KEY: "" })).toThrow(/AI_API_KEY/);
    expect(costMicros({ input: 4, output: 20 }, 1000, 1000)).toBe(24_000);
    // Opus 5.5 worst case for a Content Studio call fits the 100,000-micro ceiling.
    expect(worstCaseMicros({ input: 4, output: 20 }, 6_000, 4_000)).toBe(92_000);
  });

  it("generation needs a ready provider AND the launch switch", () => {
    expect(providerStatus(env())).toMatchObject({ ok: true });
    expect(generationStatus(env())).toMatchObject({ ok: false, reason: expect.stringMatching(/AI_GENERATION_ENABLED/) });
    expect(generationStatus(env({ AI_GENERATION_ENABLED: "true" }))).toMatchObject({ ok: true });
    expect(generationStatus(env({ AI_GENERATION_ENABLED: "true", AI_MODEL: "unknown-model" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/price/) });
    expect(generationStatus(env({ AI_GENERATION_ENABLED: "true", AI_DAILY_BUDGET_MICROS: "0" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/budget/) });
    expect(generationStatus(env({ AI_GENERATION_ENABLED: "true", AI_PROVIDER: "openai" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/isn't built/) });
    expect(generationStatus(envSchema.parse({ APP_ENV: "test", AI_GENERATION_ENABLED: "true" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/No AI provider/) });
  });
});
