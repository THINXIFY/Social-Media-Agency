import * as React from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { menuItem, menuPopup } from "./menu";

/* Form primitives shared by admin editors. Every control has a visible label, help and inline error. */

export const inputClass =
  "w-full rounded-xl border bg-background px-3.5 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive/60 aria-invalid:focus-visible:ring-destructive/15 dark:bg-muted/30";

export function Field({
  id,
  label,
  help,
  error,
  optional,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** aria wiring for a control inside <Field>. */
export const describe = (id: string, error?: string | null, help?: unknown) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : help ? `${id}-help` : undefined,
});

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, "h-10", className)} />;
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputClass, "min-h-20 resize-y py-2.5 leading-relaxed", className)} />;
}

type SelectOption = { value: string; label: React.ReactNode; disabled: boolean };

/** Reads `<option>` children (including inside fragments and arrays), so call sites keep native-select markup. */
function optionsOf(children: React.ReactNode, out: SelectOption[] = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: unknown; children?: React.ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === "option") out.push({ value: String(child.props.value ?? ""), label: child.props.children, disabled: Boolean(child.props.disabled) });
    else optionsOf(child.props.children, out);
  });
  return out;
}

/**
 * The admin dropdown: same props as a native `<select>` (value, onChange, `<option>` children),
 * rendered as an accessible custom listbox with checkmarks, typeahead and collision-aware placement.
 */
export function SelectInput({
  id,
  value,
  onChange,
  children,
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
}: React.ComponentProps<"select">) {
  const options = optionsOf(children);
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  const current = String(value ?? "");
  return (
    <Select.Root
      items={items}
      value={current}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === null) return;
        const target = { value: String(v) };
        onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <Select.Trigger
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        className={cn(
          inputClass,
          "flex h-10 cursor-default items-center justify-between gap-2 pe-2.5 text-start data-popup-open:border-primary/50 data-popup-open:ring-3 data-popup-open:ring-primary/15",
          className,
        )}
      >
        <Select.Value className="min-w-0 truncate" />
        <Select.Icon className="shrink-0 text-muted-foreground transition-transform duration-150 in-data-popup-open:rotate-180 motion-reduce:transition-none">
          <ChevronDown className="size-4" aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} collisionPadding={12} className="z-[60] outline-none">
          <Select.Popup className={cn(menuPopup, "max-w-[min(22rem,calc(100vw-1.5rem))] min-w-(--anchor-width)")}>
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} disabled={o.disabled} data-value={o.value} className={cn(menuItem, "pe-9 data-selected:font-semibold data-selected:text-primary")}>
                <Select.ItemText className="min-w-0 flex-1 truncate">{o.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute end-2.5 flex items-center">
                  <Check className="size-4 text-primary" strokeWidth={2.5} aria-hidden />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** A segmented single choice built on native radios, so arrow keys work. */
export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-auto">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-[0.82rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors select-none hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-primary/40 sm:flex-none",
              value === o.value && "bg-card text-foreground shadow-sm",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
