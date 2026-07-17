# Todo List on Steroids

A minimalist, dark-mode-only todo list that uses [OpenRouter](https://openrouter.ai)
to generate a short suggestion, follow-up, and clarifying question for each item.
Everything is stored locally in your browser via IndexedDB. No accounts, no server.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
```

Then open **Settings** (top-right) and paste your OpenRouter API key. The key is
stored only in this browser's `localStorage` and is sent solely to OpenRouter to
generate notes for your items.

## How AI generation works

- A note is generated **once** when an item is created.
- On edit, a signature (`sha256` of the normalized text) is compared to the last
  one the model saw. If it changed, generation is re-enqueued (debounced 800ms).
- You can also trigger **Regenerate** manually from an item's expanded panel.
- Generation never runs on read, mount, or focus — only on create / meaningful
  edit / explicit action.
- In-flight requests are abortable, so rapid edits don't race.

## Privacy

- Your API key lives only in `localStorage`; it is never logged and never sent
  anywhere except OpenRouter.
- Item text is sent to OpenRouter for generation — that is the only external
  call. There is no analytics or telemetry.
- Use **Settings → Clear all data** to wipe every item from IndexedDB.

## Tech

- Vite + React + TypeScript
- IndexedDB via `idb-keyval`
- Plain CSS, dark palette hardcoded (no theme system by design)
- OpenRouter Chat Completions (default model `openrouter/z-ai/glm-5.2`,
  configurable in Settings)

## Project layout

```
src/
  main.tsx, App.tsx
  db/store.ts        # IndexedDB wrapper
  ai/openrouter.ts   # client, prompt, JSON parsing, signature
  ai/types.ts
  components/        # ItemList, Item, ItemEditor, AIPanel, AddItem, Settings
  hooks/             # useItems, useAI, useSettings
  styles.css         # dark-only
```
