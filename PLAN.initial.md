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
- **AI:** OpenRouter Chat Completions API. Default model `openrouter/openai/gpt-4o-mini` (cheap, fast, good enough for one-liners). Configurable in Settings.
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
  aiTextSignature?: string; // hash of the text the AI last saw (text-only, not whole item)
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
- On item edit: compute a signature from normalized text and compare against the **last signature stored for this specific item id**. Regeneration key is `(id, signature)` so reordering, merging, or splitting items that happen to share text doesn't cause false skips or false regens across siblings.
- Normalization: `text.trim().toLowerCase()`. Regen triggers when the normalized text has **meaningfully changed** — measured by a small edit-distance threshold (e.g. Levenshtein distance > 3 chars or > 10% of length) rather than an exact hash. This avoids firing regens on 1-char typo fixes while still catching real edits.
- Manual "regenerate" button per item (optional, opt-in). Bypasses the threshold check and forces a fresh call.
- Never auto-regenerate on read, mount, or focus.

### No-key / offline state

- When no OpenRouter API key is set, the app behaves as a plain todo list: full CRUD, persistence, dark UI. No AI calls are attempted.
- The AI panel for each item shows a "Set API key in Settings" hint instead of a spinner or error.
- Adding a key later does not retroactively generate for existing items — only new items and subsequent edits trigger generation. (User can use the per-item "regenerate" button to backfill.)

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

Response parsed as JSON; on parse error or API failure, leave `ai` unset and mark `aiTextSignature` so we don't retry in a loop. Allow a manual retry.

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
- Creating an item: persist → enqueue AI generation → on success, persist updated `ai` + `aiTextSignature` (keyed to the item's id).
- Editing an item: persist → if signature changed beyond the edit-distance threshold, enqueue AI generation.
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
2. **AI integration:** OpenRouter client, signature + edit-distance regen logic (keyed by `(id, signature)`), no-key fallback state, inline AI panel, loading/error states.
3. **Settings:** API key + model picker + data reset.
4. **Polish:** keyboard nav, empty states, micro-interactions, README.

## Open Questions

- IndexedDB vs `localStorage`: IndexedDB is more capable; do we want the extra dep (`idb-keyval`)?
- Should "regenerate" be per-item only, or also a global "regenerate stale" sweep?
- Do we want the AI panel inline (expanding the row) or as a side drawer for the selected item?
