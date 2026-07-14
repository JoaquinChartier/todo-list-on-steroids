# Todo List on Steroids — Plan

A minimalist, dark-mode-only todo list app that uses OpenRouter to generate small suggestions, follow-ups, and questions for each item. Suggestions are generated once per item (or when the item is updated) and stored locally.

## Goals

- Minimal, distraction-free UI. Dark mode only.
- Each todo item can carry AI-generated micro-notes: a suggestion, a follow-up, a clarifying question.
- AI runs once per item on creation, and re-runs only when the item's text is meaningfully updated.
- Everything persists locally on the user's machine. No accounts, no server-side storage of user data.

## Non-Goals

- Light theme / theme toggle.
- Collaboration, sharing, multi-device sync.
- Reminders, calendars, due-date engines.
- Tags, projects, subtasks beyond what's strictly needed.

## Tech Stack

- **Frontend:** Vite + React + TypeScript (minimal, fast, no framework bloat).
- **Styling:** Plain CSS or Tailwind. Dark palette hardcoded. No theming system.
- **AI:** OpenRouter Chat Completions API (`openrouter/z-ai/glm-5.2` or a cheap small model).
- **Storage:** IndexedDB (via a tiny wrapper like `idb-keyval`) for items + AI outputs. Survives reloads, holds blobs, async-friendly. `localStorage` is a fallback if we want zero deps.
- **Key management:** OpenRouter API key stored in `localStorage` under a known key, entered via a Settings panel. Acceptable for a personal local app; documented as a tradeoff.

## Data Model

```ts
type Item = {
  id: string;              // uuid
  text: string;            // the todo content
  done: boolean;
  createdAt: number;
  updatedAt: number;
  ai?: AIOutput;           // generated notes, if any
  aiSignature?: string;   // hash of the text the AI last saw
};

type AIOutput = {
  suggestion: string;     // one short line: a tip to get it done
  followup: string;       // one short line: a logical next step
  question: string;       // one short line: a clarifying question
  generatedAt: number;
  model: string;
};
```

### When to (re)generate AI output

- On item creation: generate once.
- On item edit: compute a signature (e.g. `sha256(text.trim().toLowerCase())`). If it differs from `aiSignature`, regenerate.
- Manual "regenerate" button per item (optional, opt-in).
- Never auto-regenerate on read, mount, or focus.

## Features / UX

1. **List view**
   - Single column of items. Checkbox to complete, strikethrough on done.
   - Inline edit on click; Enter saves, Esc cancels.
   - Delete on hover (small ×).
   - "Add item" input pinned at top.

2. **Item AI drawer / inline panel**
   - Expandable area under each item showing Suggestion / Followup / Question.
   - Shows a subtle "generated at" timestamp + model name.
   - "Regenerate" action triggers a fresh call (updates signature).
   - Loading state while generating; does not block the rest of the list.

3. **Settings (minimal)**
   - OpenRouter API key input (stored in `localStorage`).
   - Model picker (default to a small/cheap model).
   - "Clear all data" button.

4. **Dark mode only**
   - Hardcoded dark palette. No toggle. No theme infrastructure.

## AI Prompt

System prompt (concise, deterministic-ish):

> You are a minimalist productivity assistant. For the given todo item, return JSON with three short strings: `suggestion` (a concrete tip to start or finish it), `followup` (the natural next step after it's done), `question` (one clarifying question). Max ~12 words each. No preamble.

User content: the item text.

Response parsed as JSON; on parse error or API failure, leave `ai` unset and mark `aiSignature` so we don't retry in a loop. Allow a manual retry.

## Architecture / File Layout

```
src/
  main.tsx
  App.tsx
  db/
    store.ts          # IndexedDB wrapper: get/put/delete/list items
  ai/
    openrouter.ts     # client, prompt, JSON parsing, signature
    types.ts
  components/
    ItemList.tsx
    Item.tsx
    ItemEditor.tsx
    AIPanel.tsx
    AddItem.tsx
    Settings.tsx
  hooks/
    useItems.ts       # CRUD + reactive list
    useAI.ts          # generate-on-change logic
  styles.css         # dark-only
```

## State & Flow

- `useItems` loads all items from IndexedDB on mount, keeps an in-memory list, writes through on every mutation.
- Creating an item: persist → enqueue AI generation → on success, persist updated `ai` + `aiSignature`.
- Editing an item: persist → if signature changed, enqueue AI generation.
- AI generation is debounced (e.g. 800ms after edit) and in-flight requests are cancellable to avoid races on rapid edits.

## Privacy & Safety

- API key lives only in the browser's `localStorage`; never logged, never sent anywhere except OpenRouter.
- Item text is sent to OpenRouter for generation — that's the only external call. Documented in Settings.
- No analytics, no telemetry.

## Build / Dev

- `npm run dev` — Vite dev server.
- `npm run build` — production build to `dist/`, served as static files.
- `.env` only holds non-secret defaults (e.g. default model id). The API key is NOT in env.

## Milestones

1. **Skeleton:** Vite + React + TS, dark styles, list CRUD with IndexedDB persistence. No AI yet.
2. **AI integration:** OpenRouter client, signature-based regen, inline AI panel, loading/error states.
3. **Settings:** API key + model picker + data reset.
4. **Polish:** keyboard nav, empty states, micro-interactions, README.

## Open Questions

- IndexedDB vs `localStorage`: IndexedDB is more capable; do we want the extra dep (`idb-keyval`)?
- Model default: pick `openrouter/z-ai/glm-5.2` or a cheaper/smaller model? (Plan defaults to glm-5.2.)
- Should "regenerate" be per-item only, or also a global "regenerate stale" sweep?
- Do we want the AI panel inline (expanding the row) or as a side drawer for the selected item?
