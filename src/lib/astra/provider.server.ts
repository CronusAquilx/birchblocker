import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Astra provider abstraction. Every model in the registry resolves to an
 * OpenAI-compatible endpoint. The built-in "local" provider reads AI_BASE_URL /
 * AI_API_KEY / AI_MODEL; other registry rows can name their own env vars in
 * `config` ({ baseUrlEnv, apiKeyEnv, model }).
 */
export type ModelRow = {
  id: string;
  provider: string;
  config: unknown;
};

export type ResolvedProvider =
  | { ok: true; model: LanguageModel; baseURL: string; modelName: string; hosted: boolean; providerOptions?: Record<string, Record<string, any>> }
  | { ok: false; reason: string };

function normalizeBase(url: string) {
  const trimmed = url.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export function resolveEndpoint(row: ModelRow) {
  const cfg = (row.config ?? {}) as { baseUrlEnv?: string; apiKeyEnv?: string; model?: string; modelEnv?: string };
  const baseUrl = process.env[cfg.baseUrlEnv ?? "AI_BASE_URL"];
  const apiKey = process.env[cfg.apiKeyEnv ?? "AI_API_KEY"];
  const modelName = cfg.model ?? process.env[cfg.modelEnv ?? "AI_MODEL"];
  return { baseUrl, apiKey, modelName };
}

const HOSTED_MODEL = "openai/gpt-6-astra";

/** Built-in hosted fallback used only while no self-hosted server is configured. */
export function hostedFallback(): ResolvedProvider | null {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  return {
    ok: true,
    model: provider.responses(HOSTED_MODEL),
    baseURL: "hosted",
    modelName: HOSTED_MODEL,
    hosted: true,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  };
}

export function resolveProvider(row: ModelRow, override?: { baseUrl: string; apiKey?: string }): ResolvedProvider {
  const env = resolveEndpoint(row);
  const baseUrl = override?.baseUrl ?? env.baseUrl;
  const apiKey = override ? override.apiKey : env.apiKey;
  const modelName = env.modelName;
  if (!baseUrl) return { ok: false, reason: "The model server address is not configured yet." };
  if (!modelName) return { ok: false, reason: "The model name is not configured yet." };
  const baseURL = normalizeBase(baseUrl);
  const provider = createOpenAICompatible({
    name: row.provider === "local" ? "astra-local" : row.provider,
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  });
  return { ok: true, model: provider.chatModel(modelName), baseURL, modelName, hosted: false };
}

export async function probeEndpoint(row: ModelRow) {
  const { baseUrl, apiKey, modelName } = resolveEndpoint(row);
  if (!baseUrl || !modelName) {
    return { configured: false, reachable: false, modelName: modelName ?? null, detail: "Not configured" };
  }
  try {
    const res = await fetch(`${normalizeBase(baseUrl)}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { configured: true, reachable: false, modelName, detail: `Server answered ${res.status}` };
    const json = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
    const ids = json?.data?.map((m) => m.id) ?? [];
    const found = ids.length === 0 || ids.includes(modelName);
    return {
      configured: true,
      reachable: true,
      modelName,
      detail: found ? "Connected" : `Connected, but "${modelName}" is not in the server's model list`,
    };
  } catch {
    return { configured: true, reachable: false, modelName, detail: "Could not reach the model server" };
  }
}
