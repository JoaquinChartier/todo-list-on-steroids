import { useCallback, useEffect, useRef } from "react";
import { computeSignature, generateAIOutput } from "../ai/openrouter";
import type { Item } from "../ai/types";

type Config = {
  apiKey: string | null;
  model: string;
};

type Pending = {
  itemId: string;
  text: string;
  controller: AbortController;
  debounceTimer: number | null;
};

type GenerateFn = (item: Item, opts?: { immediate?: boolean }) => void;

export function useAI(
  config: Config,
  applyResult: (itemId: string, result: Item["ai"], signature: string) => void,
  markLoading: (itemId: string, loading: boolean) => void,
): { generate: GenerateFn; cancelAll: () => void } {
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  const applyResultRef = useRef(applyResult);
  const markLoadingRef = useRef(markLoading);
  const configRef = useRef(config);
  applyResultRef.current = applyResult;
  markLoadingRef.current = markLoading;
  configRef.current = config;

  const run = useCallback(async (itemId: string, text: string) => {
    const pending = pendingRef.current.get(itemId);
    if (!pending) return;
    const { apiKey, model } = configRef.current;
    if (!apiKey) {
      markLoadingRef.current(itemId, false);
      pendingRef.current.delete(itemId);
      return;
    }
    try {
      const result = await generateAIOutput({
        apiKey,
        model,
        text,
        signal: pending.controller.signal,
      });
      const signature = await computeSignature(text);
      applyResultRef.current(itemId, result, signature);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // Preserve existing AI result — do not overwrite with undefined on error.
      // Signature stays from last successful generation so future edits can retry.
    } finally {
      if (pendingRef.current.get(itemId) === pending) {
        pendingRef.current.delete(itemId);
        markLoadingRef.current(itemId, false);
      }
    }
  }, []);

  const generate = useCallback(
    (item: Item, opts?: { immediate?: boolean }) => {
      const { apiKey, model } = configRef.current;
      if (!apiKey || !model) return;
      const text = item.text.trim();
      if (!text) return;

      const existing = pendingRef.current.get(item.id);
      if (existing) {
        if (existing.debounceTimer) clearTimeout(existing.debounceTimer);
        existing.controller.abort();
        pendingRef.current.delete(item.id);
      }

      const controller = new AbortController();
      const pending: Pending = { itemId: item.id, text, controller, debounceTimer: null };
      pendingRef.current.set(item.id, pending);
      markLoadingRef.current(item.id, true);

      if (opts?.immediate) {
        run(item.id, text).catch(() => {});
        return;
      }
      pending.debounceTimer = window.setTimeout(() => {
        pending.debounceTimer = null;
        run(item.id, text).catch(() => {});
      }, 800);
    },
    [run],
  );

  const cancelAll = useCallback(() => {
    pendingRef.current.forEach((p) => {
      if (p.debounceTimer) clearTimeout(p.debounceTimer);
      p.controller.abort();
    });
    pendingRef.current.clear();
  }, []);

  useEffect(() => () => cancelAll(), [cancelAll]);

  return { generate, cancelAll };
}
