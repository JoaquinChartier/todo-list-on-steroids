import { useCallback, useState } from "react";
import { AddItem } from "./components/AddItem";
import { ItemList } from "./components/ItemList";
import { Settings } from "./components/Settings";
import { useItems } from "./hooks/useItems";
import { useSettings } from "./hooks/useSettings";
import { useAI } from "./hooks/useAI";
import { computeSignature } from "./ai/openrouter";
import { clearAllItems } from "./db/store";
import type { Item } from "./ai/types";

export function App() {
  const { items, loaded, createItem, updateItem, removeItem } = useItems();
  const settings = useSettings();
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const applyResult = useCallback(
    (itemId: string, result: Item["ai"], signature: string) => {
      updateItem(itemId, { ai: result, aiSignature: signature });
    },
    [updateItem],
  );

  const markLoading = useCallback((itemId: string, loading: boolean) => {
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (loading) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const { generate, cancelAll } = useAI(
    { apiKey: settings.apiKey || null, model: settings.model },
    applyResult,
    markLoading,
  );

  const handleAdd = useCallback(
    async (text: string) => {
      const item = await createItem({ text });
      generate(item, { immediate: true });
    },
    [createItem, generate],
  );

  const handleCommitEdit = useCallback(
    async (item: Item, nextText: string) => {
      const nextSig = await computeSignature(nextText);
      const updated = await updateItem(item.id, { text: nextText });
      if (updated && nextSig !== updated.aiSignature) {
        generate(updated, { immediate: false });
      }
    },
    [updateItem, generate],
  );

  const handleToggleDone = useCallback(
    (item: Item) => {
      updateItem(item.id, { done: !item.done });
    },
    [updateItem],
  );

  const handleDelete = useCallback(
    (item: Item) => {
      cancelAll();
      removeItem(item.id);
    },
    [removeItem, cancelAll],
  );

  const handleClearAll = useCallback(async () => {
    cancelAll();
    await clearAllItems();
    window.location.reload();
  }, [cancelAll]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>TODOs <span>on Steroids</span></h1>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </button>
      </header>

      <AddItem onAdd={handleAdd} />

      <main>
        {loaded ? (
          <ItemList
            items={items}
            loadingIds={loadingIds}
            hasApiKey={!!settings.apiKey}
            onToggleDone={handleToggleDone}
            onCommitEdit={handleCommitEdit}
            onDelete={handleDelete}
          />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </main>

      <footer className="app-footer">
        <span>Local-first. Dark mode only. AI via OpenRouter.</span>
      </footer>

      {settingsOpen && (
        <Settings
          apiKey={settings.apiKey}
          model={settings.model}
          onApiKeyChange={settings.setApiKey}
          onModelChange={settings.setModel}
          onClearAll={handleClearAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
