import type { AIOutput } from "./types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_URL = `${OPENROUTER_BASE}/chat/completions`;
const MODELS_URL = `${OPENROUTER_BASE}/models`;
const STT_URL = `${OPENROUTER_BASE}/audio/transcriptions`;

const SYSTEM_PROMPT =
  "You are a minimalist productivity assistant. For the given todo item, " +
  "return JSON with three short strings: `suggestion` (a concrete tip to start " +
  "or finish it), `followup` (the natural next step after it's done), " +
  "`question` (one clarifying question). Max ~12 words each. No preamble. " +
  "Return only the JSON object.";

type GenerateOptions = {
  apiKey: string;
  model: string;
  text: string;
  signal?: AbortSignal;
};

class AIGenerationError extends Error {
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

const DEFAULT_STT_MODEL = "openai/whisper-1";

type TranscribeOptions = {
  apiKey: string;
  audio: Blob;
  model?: string;
  language?: string;
  signal?: AbortSignal;
};

export async function transcribeAudio(
  opts: TranscribeOptions,
): Promise<string> {
  const { apiKey, audio, model = DEFAULT_STT_MODEL, language, signal } = opts;
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key");
  }

  const format = (audio.type.split("/")[1] || "webm").split(";")[0];
  const arrayBuffer = await audio.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  let res: Response;
  try {
    res = await fetch(STT_URL, {
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
        input_audio: { data: base64, format },
        ...(language ? { language } : {}),
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(`Network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter STT error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.text;
  return (text || "").trim();
}

export type ModelInfo = {
  id: string;
  name: string;
  pricePerMillion: number;
};

// Max combined prompt+completion price per token we consider "cheap"
// ($0.50 / 1M tokens). Free models (price 0) are always included.
const CHEAP_THRESHOLD = 5e-7;

function combinedPrice(pricing: unknown): number {
  if (!pricing || typeof pricing !== "object") return Infinity;
  const p = pricing as Record<string, unknown>;
  const prompt = numOr(p.prompt);
  const completion = numOr(p.completion);
  if (!isFinite(prompt) || !isFinite(completion)) return Infinity;
  return prompt + completion;
}

function numOr(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

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
    .map((m): ModelInfo | null => {
      const o = m as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      if (!id) return null;
      const name = typeof o.name === "string" ? o.name : id;
      const price = combinedPrice(o.pricing);
      if (price > CHEAP_THRESHOLD) return null;
      return {
        id,
        name,
        pricePerMillion: price * 1_000_000,
      };
    })
    .filter((m): m is ModelInfo => m != null)
    .sort((a, b) => a.pricePerMillion - b.pricePerMillion || a.id.localeCompare(b.id));
}
