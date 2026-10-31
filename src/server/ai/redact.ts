import "server-only";

/**
 * Removes personal and secret-looking data from text before it can reach an
 * AI provider. Conservative by design: it's better to lose a phone number in
 * a caption brief than to send someone's card number to a third party.
 * Order matters: longer, more specific patterns run before generic digit runs.
 */
const RULES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key removed]"],
  [/\b(sk|pk|rk|ghp|gho|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}\b/g, "[key removed]"],
  [/\b(?:api[_-]?key|secret|token|password|passcode|otp)\s*[:=]\s*\S+/gi, "[secret removed]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]"],
  // Account numbers (IBAN-like) before digit runs, so no half-number is left behind.
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "[account number removed]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[number removed]"],
  [/\+?\d[\d ().-]{8,}\d/g, "[phone removed]"],
];

export function redact(text: string): { text: string; redactions: number } {
  let out = text;
  let redactions = 0;
  for (const [re, label] of RULES) {
    out = out.replace(re, () => {
      redactions++;
      return label;
    });
  }
  return { text: out, redactions };
}
