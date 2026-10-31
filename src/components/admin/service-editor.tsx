"use client";

import * as React from "react";
import { Archive, CircleAlert, CircleCheck, CircleDashed, Copy, Info, LoaderCircle, Lock, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { PlatformTile } from "@/components/brand";
import { ConfirmDialog, Switch } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_META, CATEGORY_ORDER, isQuantityBased, PLATFORM_BY_ID, PLATFORMS } from "@/lib/catalog";
import {
  eligibility,
  modelsFor,
  PRICING_MODELS,
  priceError,
  quote,
  requiredFields,
  serviceExists,
  type ServiceRecord,
  pricingStatus,
  purchaseStatus,
  uniqueId,
  unitMargin,
} from "@/lib/admin-services";
import { useProviders } from "@/lib/admin-providers";
import { cn } from "@/lib/utils";
import { describe, Field, Segmented, SelectInput, TextArea, TextInput } from "./form";
import { PricingBadge, PurchaseBadge } from "./service-status";

/* -------------------------------------------------------------------------- */
/*  Form state                                                                */
/* -------------------------------------------------------------------------- */

export type EditorMode = "new" | "edit";

interface Form {
  r: ServiceRecord;
  cost: string;
  price: string;
  min: string;
  max: string;
  /** For new services the id follows the name until it's edited by hand. */
  idEdited: boolean;
}

const toText = (n: number | null) => (n === null ? "" : String(n));
const toForm = (r: ServiceRecord): Form => ({
  r,
  cost: toText(r.pricing.cost),
  price: toText(r.pricing.price),
  min: toText(r.limits.min),
  max: toText(r.limits.max),
  idEdited: Boolean(r.id),
});
const fromForm = (f: Form): ServiceRecord => ({
  ...f.r,
  name: f.r.name.trim(),
  pricing: { ...f.r.pricing, cost: f.cost.trim() ? Number(f.cost) : null, price: f.price.trim() ? Number(f.price) : null },
  limits: { min: f.min.trim() ? Number(f.min) : null, max: f.max.trim() ? Number(f.max) : null },
});

const SECRET = /(api[_ -]?key|secret|token|password|bearer|sk_)/i;

type Errors = Partial<Record<"name" | "id" | "cost" | "price" | "min" | "max" | "providerRef", string>>;

/** Live mode saves to the catalog database; demo mode to this browser. */
const EditorEnv = React.createContext<{ live: boolean; exists: (id: string) => boolean }>({ live: false, exists: serviceExists });

/** Draft saves only check identity and number formats; full saves check everything. */
function validate(f: Form, mode: EditorMode, full: boolean, exists: (id: string) => boolean): Errors {
  const e: Errors = {};
  const r = f.r;
  if (!r.name.trim()) e.name = "Enter a service name.";
  else if (r.name.trim().length < 3) e.name = "Use at least 3 characters.";
  if (mode === "new") {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) e.id = "Use lowercase letters, numbers and single dashes.";
    else if (exists(r.id)) e.id = "A service with this ID already exists.";
  }
  const label = PRICING_MODELS[r.pricing.model].percent ? "fee" : "price";
  e.cost = priceError(f.cost, r.pricing.model, `Supplier ${label === "fee" ? "fee" : "cost"}`) ?? undefined;
  e.price = priceError(f.price, r.pricing.model, `Selling ${label}`) ?? undefined;
  if (!e.cost && !e.price && f.cost.trim() && f.price.trim() && Number(f.price) < Number(f.cost)) e.price = "Selling price can't be below the supplier cost.";
  for (const k of ["min", "max"] as const) {
    const v = f[k].trim();
    if (v && (!/^\d+$/.test(v) || Number(v) < 1)) e[k] = "Use a whole number of 1 or more.";
  }
  if (!e.min && !e.max && f.min.trim() && f.max.trim() && Number(f.max) < Number(f.min)) e.max = "Maximum must be at least the minimum.";
  if (r.fulfillment.type === "provider") {
    const ref = r.fulfillment.providerRef.trim();
    if (SECRET.test(ref)) e.providerRef = "Never store API keys or credentials here — use a reference name only.";
    else if (ref && !/^[A-Za-z0-9 ._-]{2,40}$/.test(ref)) e.providerRef = "Use 2–40 letters, numbers, spaces, dots, dashes or underscores.";
  }
  if (full) {
    if (!f.cost.trim() && f.price.trim()) e.cost = e.cost ?? "Set the supplier cost too, or leave both empty.";
    if (f.cost.trim() && !f.price.trim()) e.price = e.price ?? "Set the selling price too, or leave both empty.";
  }
  for (const k of Object.keys(e) as (keyof Errors)[]) if (!e[k]) delete e[k];
  return e;
}

const FIELD_ORDER: (keyof Errors)[] = ["name", "id", "min", "max", "cost", "price", "providerRef"];
const FIELD_ID: Record<keyof Errors, string> = { name: "svc-name", id: "svc-id", min: "svc-min", max: "svc-max", cost: "svc-cost", price: "svc-price", providerRef: "svc-provider-ref" };

/* -------------------------------------------------------------------------- */
/*  Editor                                                                    */
/* -------------------------------------------------------------------------- */

export function ServiceEditor({
  open,
  mode,
  initial,
  onClose,
  onSave,
  onDuplicate,
  onArchive,
  initialSection,
  live = false,
  exists = serviceExists,
}: {
  open: boolean;
  /** Live mode: saves go to the server and may fail; the editor stays open with the error. */
  live?: boolean;
  exists?: (id: string) => boolean;
  mode: EditorMode;
  initial: ServiceRecord | null;
  /** Open scrolled to a section, e.g. "pricing" from a row's Set price action. */
  initialSection?: "pricing";
  onClose: () => void;
  onSave: (record: ServiceRecord, kind: "draft" | "full") => void | Promise<void>;
  onDuplicate: (record: ServiceRecord) => void;
  onArchive: (record: ServiceRecord, archived: boolean) => void;
}) {
  const env = React.useMemo(() => ({ live, exists }), [live, exists]);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const dirty = React.useRef(false);
  const requestClose = () => (dirty.current ? setConfirmClose(true) : onClose());

  return (
    <EditorEnv value={env}>
      <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[42rem]">
          {initial ? (
            <EditorBody
              key={`${mode}-${initial.id}-${initial.updatedAt}-${initial.version ?? 0}`}
              mode={mode}
              initial={initial}
              onDirty={(d) => (dirty.current = d)}
              initialSection={initialSection}
              onClose={requestClose}
              onSave={onSave}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved changes?"
        description="Your edits to this service haven't been saved. Closing now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          dirty.current = false;
          onClose();
        }}
      />
    </EditorEnv>
  );
}

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "order", label: "Order setup" },
  { id: "pricing", label: "Pricing" },
  { id: "fulfilment", label: "Fulfilment" },
  { id: "eligibility", label: "Activation" },
] as const;

function EditorBody({
  mode,
  initial,
  initialSection,
  onDirty,
  onClose,
  onSave,
  onDuplicate,
  onArchive,
}: {
  mode: EditorMode;
  initial: ServiceRecord;
  initialSection?: "pricing";
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSave: (record: ServiceRecord, kind: "draft" | "full") => void | Promise<void>;
  onDuplicate: (record: ServiceRecord) => void;
  onArchive: (record: ServiceRecord, archived: boolean) => void;
}) {
  const env = React.use(EditorEnv);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [start] = React.useState(() => toForm(initial));
  const [f, setF] = React.useState(start);
  const [attempt, setAttempt] = React.useState<"draft" | "full" | null>(null);
  const [archiveAsk, setArchiveAsk] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(f) !== JSON.stringify(start);
  React.useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const errors = validate(f, mode, attempt === "full", env.exists);
  // Before the first save, show format problems as you type, but not "enter a name" on an empty new form.
  const shown: Errors = attempt ? errors : { ...errors, name: undefined, id: f.r.name.trim() ? errors.id : undefined };

  const r = f.r;
  const set = (patch: Partial<ServiceRecord>) => setF((cur) => ({ ...cur, r: { ...cur.r, ...patch } }));
  const platform = PLATFORM_BY_ID[r.platformId];
  const qty = isQuantityBased(r.category);
  const model = PRICING_MODELS[r.pricing.model];
  const current = fromForm(f);
  const isNew = mode === "new";

  const save = async (kind: "draft" | "full") => {
    if (saving) return;
    setAttempt(kind);
    setSaveError(null);
    const e = validate(f, mode, kind === "full", env.exists);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(FIELD_ID[first])?.focus());
      return;
    }
    onDirty(false);
    const result = onSave({ ...current, draft: kind === "draft" ? true : false }, kind);
    if (!result) return;
    // Live: the server has the final say. On failure the editor stays open with every edit intact.
    setSaving(true);
    try {
      await result;
    } catch (err) {
      onDirty(true);
      setSaveError(err instanceof Error ? err.message : "The service wasn't saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Set price opens straight to the pricing fields.
  React.useEffect(() => {
    if (initialSection !== "pricing") return;
    const id = requestAnimationFrame(() => {
      const el = document.getElementById("svc-sec-pricing");
      if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 8;
      document.getElementById("svc-cost")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [initialSection]);

  const jump = (id: string) => {
    const el = document.getElementById(`svc-sec-${id}`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b px-5 pt-5 pb-3 sm:px-6">
        <div className="flex items-start gap-3">
          {platform ? <PlatformTile platform={platform} size="md" className="size-11 rounded-xl" /> : null}
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{isNew ? "New service" : initial.name}</SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {isNew ? (env.live ? "Saved to the catalog as a draft until you publish it." : "Saved in this browser only — customers never see it.") : <span className="font-mono text-[0.8rem]">{initial.id}</span>}
              {/* Saved state: pricing is accepted on save; purchase depends on every activation requirement. */}
              {!isNew ? <PricingBadge status={pricingStatus(initial)} /> : null}
              {!isNew ? <PurchaseBadge status={purchaseStatus(initial)} /> : null}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <nav aria-label="Editor sections" className="-mx-1 mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className="h-8 shrink-0 rounded-full px-3 text-[0.8rem] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div ref={scroller} className="relative min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-6">
        {saveError ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>
              <span className="font-semibold">Not saved.</span> {saveError}
            </span>
          </p>
        ) : null}
        {attempt && Object.keys(errors).length ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Fix {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? "" : "s"} before saving.
          </p>
        ) : null}

        <EditorSection id="general" title="General" description="How the service is named and where it appears.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="svc-name" label="Service name" error={shown.name} className="sm:col-span-2">
              <TextInput
                {...describe("svc-name", shown.name)}
                value={r.name}
                maxLength={120}
                onChange={(e) => {
                  const name = e.target.value;
                  setF((cur) => ({ ...cur, r: { ...cur.r, name, id: isNew && !cur.idEdited ? uniqueId(name, env.exists) : cur.r.id } }));
                }}
              />
            </Field>
            <Field id="svc-desc" label="Description" optional help="Shown to customers on the service card." className="sm:col-span-2">
              <TextArea {...describe("svc-desc", null, true)} value={r.description} maxLength={600} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field id="svc-platform" label="Platform">
              <SelectInput id="svc-platform" value={r.platformId} onChange={(e) => set({ platformId: e.target.value })}>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="svc-category" label="Service type" help="Sets the order fields and pricing models.">
              <SelectInput
                {...describe("svc-category", null, true)}
                value={r.category}
                onChange={(e) => {
                  const category = e.target.value as ServiceRecord["category"];
                  const models = modelsFor(category);
                  set({ category, pricing: { ...r.pricing, model: models.includes(r.pricing.model) ? r.pricing.model : models[0] } });
                }}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field
              id="svc-id"
              label="Service ID"
              error={shown.id}
              help={isNew ? "Generated from the name. It can't change after saving." : "Permanent. Used by orders and integrations."}
              className="sm:col-span-2"
            >
              <TextInput
                {...describe("svc-id", shown.id, true)}
                value={r.id}
                readOnly={!isNew}
                spellCheck={false}
                className="font-mono read-only:bg-muted/60"
                onChange={(e) => setF((cur) => ({ ...cur, idEdited: true, r: { ...cur.r, id: e.target.value.toLowerCase().replace(/\s+/g, "-") } }))}
              />
            </Field>
          </div>
          <ToggleRow
            id="svc-visible"
            title="Visible in catalog"
            description="Lets customers find this service. It does not enable ordering — purchase needs every eligibility check."
            checked={r.visible}
            onChange={(v) => set({ visible: v })}
          />
        </EditorSection>

        <EditorSection id="order" title="Order setup" description="What customers provide and the limits that apply.">
          <div>
            <p className="text-sm font-semibold">Required fields</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Set by the service type ({CATEGORY_META[r.category].label.toLowerCase()}).</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {requiredFields(r.category).map((fld) => (
                <li key={fld.id} className="rounded-lg bg-muted px-2 py-1 text-xs font-medium">
                  {fld.kind === "consent" ? "Confirmation" : fld.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="svc-min" label={qty ? "Minimum quantity" : "Minimum budget (USD)"} optional error={shown.min}>
              <TextInput {...describe("svc-min", shown.min)} inputMode="numeric" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="Not set" />
            </Field>
            <Field id="svc-max" label={qty ? "Maximum quantity" : "Maximum budget (USD)"} optional error={shown.max}>
              <TextInput {...describe("svc-max", shown.max)} inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="Not set" />
            </Field>
            <Field id="svc-instructions" label="Customer instructions" optional help="Shown while ordering, e.g. how to prepare the link." className="sm:col-span-2">
              <TextArea {...describe("svc-instructions", null, true)} value={r.instructions} maxLength={1000} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
            <Field id="svc-notes" label="Internal notes" optional help="Staff only. Never shown to customers." className="sm:col-span-2">
              <TextArea {...describe("svc-notes", null, true)} value={r.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        </EditorSection>

        <EditorSection id="pricing" title="Pricing" description="In USD. Saving a valid cost and price marks the service Priced straight away.">
          <Segmented
            name="svc-model"
            label="Pricing model"
            value={r.pricing.model}
            options={modelsFor(r.category).map((m) => ({ value: m, label: PRICING_MODELS[m].label }))}
            onChange={(model) => set({ pricing: { ...r.pricing, model } })}
          />
          <p className="-mt-2 text-xs text-muted-foreground">{model.help}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField id="svc-cost" label={model.percent ? "Your cost (supplier fee)" : "Your cost (supplier)"} unit={model.unit} percent={model.percent} value={f.cost} error={shown.cost} onChange={(v) => setF({ ...f, cost: v })} />
            <PriceField id="svc-price" label={model.percent ? "Customer fee" : "Customer price"} unit={model.unit} percent={model.percent} value={f.price} error={shown.price} onChange={(v) => setF({ ...f, price: v })} />
          </div>
          <PricingPreview record={current} hasErrors={Boolean(errors.cost || errors.price)} />
        </EditorSection>

        <EditorSection id="fulfilment" title="Fulfilment" description="How orders for this service get delivered.">
          <Segmented
            name="svc-fulfilment"
            label="Fulfilment type"
            value={r.fulfillment.type}
            options={[
              { value: "manual", label: "Manual" },
              { value: "provider", label: "Approved provider" },
            ]}
            onChange={(type) => set({ fulfillment: { ...r.fulfillment, type } })}
          />
          {r.fulfillment.type === "provider" ? (
            <Field
              id="svc-provider-ref"
              label="Provider reference"
              optional
              error={shown.providerRef}
              help="A name or internal ID only. No provider is connected, and credentials are never stored here."
            >
              <TextInput
                {...describe("svc-provider-ref", shown.providerRef, true)}
                value={r.fulfillment.providerRef}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => set({ fulfillment: { ...r.fulfillment, providerRef: e.target.value } })}
                placeholder="e.g. Provider A · Service 214"
              />
            </Field>
          ) : null}
          <Field id="svc-ops" label="Operational notes" optional help="Requirements and steps for the team fulfilling orders.">
            <TextArea {...describe("svc-ops", null, true)} value={r.fulfillment.notes} maxLength={1000} onChange={(e) => set({ fulfillment: { ...r.fulfillment, notes: e.target.value } })} />
          </Field>
          {!isNew ? <ProviderMappings serviceId={initial.id} /> : null}
        </EditorSection>

        <EditorSection id="eligibility" title="Purchase activation" description="Separate from pricing. Every requirement must be met before customers can order.">
          <Eligibility record={current} onCheck={(checks) => set({ checks: { ...r.checks, ...checks } })} />
        </EditorSection>

        {!isNew ? (
          <div className="flex flex-wrap gap-2 border-t pt-5">
            <button
              type="button"
              onClick={() => onDuplicate(current)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Copy className="size-3.5" aria-hidden /> Duplicate
            </button>
            {initial.archived ? (
              <button
                type="button"
                onClick={() => onArchive(initial, false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <RotateCcw className="size-3.5" aria-hidden /> Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setArchiveAsk(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 bg-card px-3.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-destructive/30 focus-visible:outline-none"
              >
                <Archive className="size-3.5" aria-hidden /> Archive
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex flex-col-reverse gap-2 border-t bg-card px-5 py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "No changes"} · {env.live ? "saved to the catalog and audited" : "admin demo, saved in this browser"}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {isNew || initial.draft ? (
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              Save draft
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => save("full")}
            disabled={saving || (!isNew && !initial.draft && !dirty)}
            aria-busy={saving || undefined}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {saving ? <LoaderCircle className="me-1.5 size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {saving ? "Saving…" : isNew || initial.draft ? "Save service" : "Save changes"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={archiveAsk}
        onOpenChange={setArchiveAsk}
        title={`Archive ${initial.name}?`}
        description="It's hidden from the catalog and the active list. You can restore it at any time; its ID stays reserved."
        confirmLabel="Archive service"
        tone="danger"
        icon={Archive}
        onConfirm={() => onArchive(initial, true)}
      />
    </div>
  );
}

/** Read-only: which providers map this service. Mappings are managed in Fulfillment Providers. */
function ProviderMappings({ serviceId }: { serviceId: string }) {
  const { live } = React.use(EditorEnv);
  const providers = useProviders();
  if (live)
    return (
      <div className="rounded-xl bg-muted/40 p-3.5 text-sm">
        <p className="font-semibold">Provider mappings</p>
        <p className="mt-0.5 text-[0.82rem] text-muted-foreground">Provider connections aren&apos;t switched on yet. The reference above is stored with the service.</p>
      </div>
    );
  const mapped = providers.filter((p) => !p.archived).flatMap((p) => p.mappings.filter((m) => m.serviceId === serviceId).map((m) => ({ p, ref: m.ref })));
  return (
    <div className="rounded-xl bg-muted/40 p-3.5 text-sm">
      <p className="font-semibold">Provider mappings</p>
      {mapped.length ? (
        <ul className="mt-1.5 space-y-1">
          {mapped.map(({ p, ref }) => (
            <li key={p.id} className="text-[0.82rem]">
              <Link href={`/admin/providers?provider=${p.id}`} className="font-medium text-primary hover:underline">
                {p.name}
              </Link>{" "}
              <span className="text-muted-foreground">
                → <span className="font-mono">{ref}</span> · not connected
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-[0.82rem] text-muted-foreground">
          Not mapped to any provider.{" "}
          <Link href="/admin/providers" className="font-semibold text-primary hover:underline">
            Fulfillment Providers
          </Link>
        </p>
      )}
    </div>
  );
}

function EditorSection({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={`svc-sec-${id}`} aria-labelledby={`svc-sec-${id}-title`} className="scroll-mt-2 space-y-4">
      <div>
        <h3 id={`svc-sec-${id}-title`} className="text-base font-bold">
          {title}
        </h3>
        <p className="mt-0.5 text-[0.82rem] text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({ id, title, description, checked, onChange, disabled }: { id: string; title: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {disabled ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <Lock className="size-3" aria-hidden /> Off
        </span>
      ) : (
        <Switch id={id} label={title} describedBy={`${id}-desc`} checked={checked} onChange={onChange} />
      )}
    </div>
  );
}

function PriceField({
  id,
  label,
  unit,
  percent,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  percent?: boolean;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error} help={value.trim() ? `${percent ? "" : "USD "}${unit}` : "Not set"}>
      <div className="relative">
        {!percent ? (
          <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>
            $
          </span>
        ) : null}
        <TextInput
          {...describe(id, error, true)}
          inputMode="decimal"
          value={value}
          placeholder="Not set"
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className={cn("tabular-nums", percent ? "pe-14" : "ps-7 pe-24")}
        />
        <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden>
          {percent ? "%" : unit}
        </span>
      </div>
    </Field>
  );
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/** Live preview for a sample order, so admins see real totals rather than per-unit figures alone. */
function PricingPreview({ record, hasErrors }: { record: ServiceRecord; hasErrors: boolean }) {
  const p = record.pricing;
  const model = PRICING_MODELS[p.model];
  const qty = p.model === "per1000" || p.model === "unit";
  const [sample, setSample] = React.useState(qty ? "1000" : "500");
  const amount = Math.max(0, Number(sample) || 0);
  const q = hasErrors ? null : quote(p, amount);
  const unit = hasErrors ? null : unitMargin(p);
  const cell = (label: string, value: string | null, strong?: boolean) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 tabular-nums", strong ? "font-heading text-lg font-extrabold" : "text-[0.95rem] font-semibold", value === null && "text-sm font-medium text-muted-foreground")}>
        {value ?? "Not set"}
      </dd>
    </div>
  );
  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Preview</p>
        {p.model !== "fixed" ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {qty ? "Sample quantity" : "Sample budget ($)"}
            <input
              type="text"
              inputMode="numeric"
              value={sample}
              onChange={(e) => setSample(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
              className="h-8 w-24 rounded-lg border bg-background px-2 text-end text-sm text-foreground tabular-nums outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </label>
        ) : (
          <span className="text-xs text-muted-foreground">One order</span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cell(model.percent ? "Customer fee" : "Customer price", q ? fmt(q.customer) : null, true)}
        {cell(model.percent ? "Supplier fee" : "Supplier cost", q ? fmt(q.cost) : null)}
        {cell("Gross profit", q ? fmt(q.profit) : null)}
        {cell("Gross margin", q && q.margin !== null ? `${q.margin.toFixed(1)}%` : q ? "—" : null)}
      </dl>
      <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
        {unit
          ? `Per ${model.percent ? "budget" : model.unit.replace("per ", "")}: ${model.percent ? `${(p.price! - p.cost!).toFixed(2)} percentage points` : fmt(unit.profit)} profit${unit.margin !== null ? `, ${unit.margin.toFixed(1)}% margin` : ""}. `
          : "Set both supplier cost and selling price to see profit. "}
        Margin = profit ÷ customer price. Totals round to the nearest cent; the server should apply the same rule.
      </p>
    </div>
  );
}

function Eligibility({ record, onCheck }: { record: ServiceRecord; onCheck: (c: Partial<ServiceRecord["checks"]>) => void }) {
  const { live } = React.use(EditorEnv);
  const { items, ready, done, total } = eligibility(record);
  const toggles: Record<string, keyof ServiceRecord["checks"]> = { fulfillment: "fulfillmentVerified", policy: "policyReviewed" };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold tabular-nums">
          {done} of {total} requirements met
        </p>
        <span className="flex flex-1 gap-1" aria-hidden>
          {items.map((i) => (
            <span key={i.id} className={cn("h-1.5 flex-1 rounded-full", i.ok ? "bg-ok" : "bg-muted")} />
          ))}
        </span>
      </div>
      <ul className="divide-y rounded-xl border">
        {items.map((i) => {
          const key = toggles[i.id];
          return (
            <li key={i.id} className="flex items-start gap-3 px-3.5 py-3">
              <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", i.ok ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
                {i.ok ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {i.label}
                  <span className="sr-only">{i.ok ? ", passed" : ", not yet"}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
              </div>
              {key ? (
                <Switch label={live ? i.label : `${i.label} (simulated)`} checked={record.checks[key]} onChange={(v) => onCheck({ [key]: v })} />
              ) : i.id === "payments" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> Locked
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {live
          ? "Fulfilment and policy confirmations are recorded with your name and the time when you save. Pricing never changes them."
          : "Fulfilment and policy are simulated confirmations in this demo. Pricing never changes them."}
      </p>
      <ToggleRow
        id="svc-purchase"
        title="Enabled for purchase"
        description={
          ready
            ? "All checks pass."
            : live
              ? "Off until every check passes. Payment-provider approval needs a connected payment provider, so checkout stays off for now."
              : "Off until every check passes. Payment-provider approval needs a connected payment provider, so checkout can't be enabled in this demo."
        }
        checked={false}
        onChange={() => {}}
        disabled
      />
    </div>
  );
}
