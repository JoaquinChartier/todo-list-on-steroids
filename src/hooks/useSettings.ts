import { useCallback, useEffect, useState } from "react";

const KEY_API = "tos.openrouter.apiKey";
const KEY_MODEL = "tos.openrouter.model";

const DEFAULT_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL ?? "openrouter/z-ai/glm-5.2";

type Settings = {
  apiKey: string;
  model: string;
  setApiKey: (v: string) => void;
  setModel: (v: string) => void;
};

export function useSettings(): Settings {
  const [apiKey, setApiKeyState] = useState("");
  const [model, setModelState] = useState(DEFAULT_MODEL);

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_API);
      const m = localStorage.getItem(KEY_MODEL);
      if (k) setApiKeyState(k);
      if (m) setModelState(m);
    } catch {
      // ignore
    }
  }, []);

  const setApiKey = useCallback((v: string) => {
    setApiKeyState(v);
    try {
      if (v) localStorage.setItem(KEY_API, v);
      else localStorage.removeItem(KEY_API);
    } catch {
      // ignore
    }
  }, []);

  const setModel = useCallback((v: string) => {
    setModelState(v);
    try {
      localStorage.setItem(KEY_MODEL, v);
    } catch {
      // ignore
    }
  }, []);

  return { apiKey, model, setApiKey, setModel };
}
