import { useEffect, useState } from "react";
import { listModels, type ModelInfo } from "../ai/openrouter";

type Props = {
  apiKey: string;
  model: string;
  onApiKeyChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onClearAll: () => void;
  onClose: () => void;
};

export function Settings({
  apiKey,
  model,
  onApiKeyChange,
  onModelChange,
  onClearAll,
  onClose,
}: Props) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [modelDraft, setModelDraft] = useState(model);
  const [confirming, setConfirming] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setModelsLoading(true);
    setModelsError(null);
    listModels(controller.signal)
      .then(setModels)
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setModelsError((err as Error).message);
      })
      .finally(() => setModelsLoading(false));
    return () => controller.abort();
  }, []);

  const save = () => {
    onApiKeyChange(keyDraft.trim());
    onModelChange(modelDraft.trim());
    onClose();
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span>OpenRouter API key</span>
          <input
            type="password"
            value={keyDraft}
            placeholder="sk-or-…"
            onChange={(e) => setKeyDraft(e.target.value)}
          />
        </label>
        <p className="hint">
          Stored only in this browser's localStorage. Sent solely to OpenRouter
          to generate notes for your items.
        </p>

        <label className="field">
          <span>Model</span>
          <input
            type="text"
            list="tos-models"
            value={modelDraft}
            placeholder="openrouter/z-ai/glm-5.2"
            onChange={(e) => setModelDraft(e.target.value)}
          />
          <datalist id="tos-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.pricePerMillion === 0
                  ? "free"
                  : `$${m.pricePerMillion.toFixed(2)}/M`}
                {" — "}
                {m.name}
              </option>
            ))}
          </datalist>
          {modelsLoading && <small className="hint">Loading models…</small>}
          {modelsError && (
            <small className="hint err">
              Couldn't load models ({modelsError}). You can still type an id
              manually.
            </small>
          )}
        </label>

        <div className="settings-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={save}>
            Save
          </button>
        </div>

        <hr />

        <div className="danger">
          {confirming ? (
            <>
              <span>Delete all items permanently?</span>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  onClearAll();
                  setConfirming(false);
                }}
              >
                Yes, delete
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="danger-btn"
              onClick={() => setConfirming(true)}
            >
              Clear all data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
