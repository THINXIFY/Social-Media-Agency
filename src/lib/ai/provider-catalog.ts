/*
 * AI provider catalog for the Admin AI Control Center. Static, secret-free
 * descriptions shared by the server and the admin UI.
 *
 * Listing a provider here does NOT mean it works. Each entry states how far
 * SociVanta's support actually goes:
 *  - generation: "native" (own adapter), "openai_compatible" (shared transport
 *    over the provider's documented OpenAI-compatible endpoint) or "pending"
 *    (no adapter yet: keys can't be used for generation).
 *  - validation: a documented, non-billed endpoint used to test a key
 *    (listing models), or null when no free check is wired up.
 *
 * Endpoints, headers and auth methods follow each provider's public API
 * reference (see `docs`). Re-check them against the docs before activating a
 * provider; the in-app "Verified" state only ever comes from a passing test.
 */

export type GenerationSupport = "native" | "openai_compatible" | "pending";
export type ProviderGroup = "major" | "enterprise";

export interface ProviderInfo {
  id: string;
  name: string;
  product: string;
  group: ProviderGroup;
  docs: string;
  /** How the key is sent, in plain words. */
  auth: string;
  /** API base URL used by the transport (https only). Null for providers needing per-account endpoints. */
  baseUrl: string | null;
  generation: GenerationSupport;
  /** Non-billed key check: GET <baseUrl><path> with the provider's auth header. */
  validation: { path: string; header: "bearer" | "x-api-key" | "x-goog-api-key" } | null;
  /** Shown beside the provider; honest notes on what isn't built. */
  note: string;
}

export const AI_PROVIDERS: ProviderInfo[] = [
  { id: "anthropic", name: "Anthropic", product: "Claude", group: "major", docs: "https://docs.anthropic.com/en/api/overview", auth: "x-api-key header with anthropic-version", baseUrl: "https://api.anthropic.com/v1", generation: "native", validation: { path: "/models", header: "x-api-key" }, note: "Native adapter through the official SDK, with structured outputs." },
  { id: "openai", name: "OpenAI", product: "GPT", group: "major", docs: "https://platform.openai.com/docs/api-reference", auth: "Bearer token", baseUrl: "https://api.openai.com/v1", generation: "native", validation: { path: "/models", header: "bearer" }, note: "Native adapter (Chat Completions with JSON-schema output)." },
  { id: "gemini", name: "Google", product: "Gemini API", group: "major", docs: "https://ai.google.dev/api", auth: "x-goog-api-key header", baseUrl: "https://generativelanguage.googleapis.com/v1beta", generation: "native", validation: { path: "/models", header: "x-goog-api-key" }, note: "Native adapter (generateContent with a JSON response schema)." },
  { id: "xai", name: "xAI", product: "Grok", group: "major", docs: "https://docs.x.ai/docs/api-reference", auth: "Bearer token", baseUrl: "https://api.x.ai/v1", generation: "openai_compatible", validation: { path: "/models", header: "bearer" }, note: "Shared OpenAI-compatible transport." },
  { id: "deepseek", name: "DeepSeek", product: "DeepSeek API", group: "major", docs: "https://api-docs.deepseek.com/", auth: "Bearer token", baseUrl: "https://api.deepseek.com", generation: "openai_compatible", validation: { path: "/models", header: "bearer" }, note: "Shared OpenAI-compatible transport. Check each model's JSON-output support before assigning it." },
  { id: "mistral", name: "Mistral AI", product: "La Plateforme", group: "major", docs: "https://docs.mistral.ai/api/", auth: "Bearer token", baseUrl: "https://api.mistral.ai/v1", generation: "pending", validation: { path: "/models", header: "bearer" }, note: "Keys can be stored and tested; a generation adapter isn't built yet." },
  { id: "cohere", name: "Cohere", product: "Command", group: "major", docs: "https://docs.cohere.com/reference/about", auth: "Bearer token", baseUrl: "https://api.cohere.com/v1", generation: "pending", validation: { path: "/models", header: "bearer" }, note: "Keys can be stored and tested; a generation adapter isn't built yet." },
  { id: "groq", name: "Groq", product: "GroqCloud", group: "major", docs: "https://console.groq.com/docs/api-reference", auth: "Bearer token", baseUrl: "https://api.groq.com/openai/v1", generation: "openai_compatible", validation: { path: "/models", header: "bearer" }, note: "Shared OpenAI-compatible transport." },
  { id: "openrouter", name: "OpenRouter", product: "OpenRouter", group: "major", docs: "https://openrouter.ai/docs/api-reference/overview", auth: "Bearer token", baseUrl: "https://openrouter.ai/api/v1", generation: "openai_compatible", validation: { path: "/key", header: "bearer" }, note: "Shared OpenAI-compatible transport. Routes to many upstream models; check each one's capabilities." },
  { id: "together", name: "Together AI", product: "Together API", group: "major", docs: "https://docs.together.ai/reference", auth: "Bearer token", baseUrl: "https://api.together.xyz/v1", generation: "openai_compatible", validation: { path: "/models", header: "bearer" }, note: "Shared OpenAI-compatible transport." },
  { id: "fireworks", name: "Fireworks AI", product: "Fireworks API", group: "major", docs: "https://docs.fireworks.ai/api-reference", auth: "Bearer token", baseUrl: "https://api.fireworks.ai/inference/v1", generation: "openai_compatible", validation: null, note: "Shared OpenAI-compatible transport. No free key check is wired up, so testing needs a confirmed, billable request." },
  { id: "moonshot", name: "Moonshot AI", product: "Kimi", group: "major", docs: "https://platform.moonshot.ai/docs/api/chat", auth: "Bearer token", baseUrl: "https://api.moonshot.ai/v1", generation: "openai_compatible", validation: { path: "/models", header: "bearer" }, note: "Shared OpenAI-compatible transport." },
  { id: "azure-openai", name: "Microsoft", product: "Azure OpenAI / Foundry", group: "enterprise", docs: "https://learn.microsoft.com/azure/ai-foundry/openai/reference", auth: "api-key header or Microsoft Entra ID, per resource endpoint", baseUrl: null, generation: "pending", validation: null, note: "Capability definition only: needs a per-resource endpoint and deployment names. Adapter pending." },
  { id: "bedrock", name: "Amazon", product: "Bedrock", group: "enterprise", docs: "https://docs.aws.amazon.com/bedrock/latest/APIReference/welcome.html", auth: "AWS Signature Version 4 (IAM credentials)", baseUrl: null, generation: "pending", validation: null, note: "Capability definition only: needs IAM signing. Adapter pending." },
  { id: "vertex", name: "Google Cloud", product: "Vertex AI", group: "enterprise", docs: "https://cloud.google.com/vertex-ai/docs/reference/rest", auth: "Google OAuth 2.0 (service account)", baseUrl: null, generation: "pending", validation: null, note: "Capability definition only: needs service-account OAuth. Adapter pending." },
  { id: "custom-openai", name: "Custom", product: "OpenAI-compatible endpoint", group: "enterprise", docs: "https://platform.openai.com/docs/api-reference/chat", auth: "Bearer token to an approved https endpoint", baseUrl: null, generation: "pending", validation: null, note: "Reserved for an approved endpoint added through code review. Not configurable from the UI." },
];

export const AI_PROVIDER_BY_ID = Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p])) as Record<string, ProviderInfo>;

export type ProviderDisplayState = "verified" | "supported" | "configuration_available" | "adapter_pending" | "disabled";
export const PROVIDER_STATE_LABEL: Record<ProviderDisplayState, string> = {
  verified: "Verified",
  supported: "Supported",
  configuration_available: "Configuration available",
  adapter_pending: "Adapter pending",
  disabled: "Disabled",
};

/** The honest state shown for a provider. "Verified" needs an active credential that passed a test. */
export function providerDisplayState(p: ProviderInfo, opts: { disabled: boolean; activeVerified: boolean }): ProviderDisplayState {
  if (opts.disabled) return "disabled";
  if (opts.activeVerified && p.generation !== "pending") return "verified";
  if (p.generation !== "pending") return "supported";
  if (p.validation) return "configuration_available";
  return "adapter_pending";
}

export type Capability = "structured_output" | "streaming" | "tool_use" | "vision";
export const CAPABILITY_LABEL: Record<Capability, string> = { structured_output: "Structured JSON output", streaming: "Streaming", tool_use: "Tool use", vision: "Image input" };
/** true = documented as supported, false = documented as unsupported, null = not verified (never assumed). */
export type Capabilities = Partial<Record<Capability, boolean | null>>;

/** Every SociVanta AI tool returns validated JSON, so its model must support structured output. */
export const TOOL_REQUIREMENTS: Capability[] = ["structured_output"];
