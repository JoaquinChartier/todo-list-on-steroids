import type { AIOutput } from "./types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_URL = `${OPENROUTER_BASE}/chat/completions`;
const MODELS_URL = `${OPENROUTER_BASE}/models`;

const SYSTEM_PROMPT =
  "You are a minimalist productivity assistant. For the given todo item, " +
  "return JSON with three short strings: `suggestion` (a concrete tip to start " +
  "or finish it), `followup` (the natural next step after it's done), " +
  "`question` (one clarifying question). Max ~12 words each. No preamble. " +
  "Return only the JSON object.";

export type GenerateOptions = {
  apiKey: string;
  model: string;
  text: string;
  signal?: AbortSignal;
};

export class AIGenerationError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "AIGenerationError";
  }
}

export async function generateAIOutput(
  opts: GenerateOptions,
): Promise<AIOutput> {
  const { apiKey, model, text, signal } = opts;
  if (!apiKey) {
    throw new AIGenerationError("Missing OpenRouter API key", false);
  }

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Todo List on Steroids",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.4,
        max_tokens: 220,
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new AIGenerationError(
      `Network error: ${(err as Error).message}`,
      true,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    throw new AIGenerationError(
      `OpenRouter error ${res.status}: ${body.slice(0, 200)}`,
      retryable,
    );
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AIGenerationError("Empty response from model", true);
  }

  const parsed = parseAIContent(content);
  return {
    ...parsed,
    generatedAt: Date.now(),
    model,
  };
}

function parseAIContent(content: string): Omit<AIOutput, "generatedAt" | "model"> {
  const jsonStr = extractJSON(content);
  if (!jsonStr) {
    throw new AIGenerationError("Could not find JSON in model response", true);
  }
  let obj: unknown;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    throw new AIGenerationError("Model response was not valid JSON", true);
  }
  const o = obj as Record<string, unknown>;
  const suggestion = asString(o.suggestion);
  const followup = asString(o.followup);
  const question = asString(o.question);
  if (!suggestion || !followup || !question) {
    throw new AIGenerationError("Model response missing required fields", true);
  }
  return { suggestion, followup, question };
}

function extractJSON(content: string): string | null {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function computeSignature(text: string): Promise<string> {
  const normalized = text.trim().toLowerCase();
  const buf = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function signatureChanged(item: { text: string; aiSignature?: string }, nextSignature: string): boolean {
  return item.aiSignature !== nextSignature;
}

export type ModelInfo = {
  id: string;
  name: string;
};

export async function listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  let res: Response;
  try {
    res = await fetch(MODELS_URL, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(`Network error: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}`);
  }
  const data = await res.json();
  const list: unknown[] = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((m) => {
      const o = m as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const name = typeof o.name === "string" ? o.name : id;
      return id ? { id, name } : null;
    })
    .filter((m): m is ModelInfo => m != null)
    .sort((a, b) => a.id.localeCompare(b.id));
}
