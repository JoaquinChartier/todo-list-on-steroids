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
- **Styling:** Plain CSS or Tailwind. Dark palette hardcoded. No theming system. Responsive: works on phone browsers (single-column fluid layout, touch-friendly hit targets).
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
  aiStatus: AIStatus;      // lifecycle state of AI generation for this item
};

type AIStatus =
  | 'pending'          // created, awaiting first generation (e.g. no key set at creation time)
  | 'generating'       // a request is in-flight
  | 'success'          // ai + aiTextSignature are set
  | 'failed'           // a generation was attempted and failed (network/parse/rate-limit) — auto-retryable on mount
  | 'skipped-no-key';  // item created while no API key was set — NOT auto-retryable on mount

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
- Manual "regenerate" button per item (optional, opt-in). Bypasses the threshold check and forces a fresh call. Disabled when the item is done.
- **Done items:** no generation (auto or manual-via-edit) fires while `done === true`. See "Item AI drawer / inline panel" below.
- Never auto-regenerate on read, mount, or focus.

### No-key / offline state

- When no OpenRouter API key is set, the app behaves as a plain todo list: full CRUD, persistence, dark UI. No AI calls are attempted.
- The AI panel for each item shows a "Set API key in Settings" hint instead of a spinner or error.
- Items created while no key is set get `aiStatus: 'skipped-no-key'`. Adding a key later does **not** retroactively generate for these items — they stay `skipped-no-key` until the user manually hits "regenerate" or edits the text. This is distinct from `failed` (which *is* auto-retryable on mount).

### AI error UX

The AI panel distinguishes failure states rather than silently going blank:

- **No key:** "Set API key in Settings" hint. No retry button (retrying without a key is pointless).
- **Rate limited (429):** "Rate limited — wait a moment" + retry button.
- **Network error / non-2xx:** "Couldn't reach OpenRouter" + retry button.
- **Bad JSON / truncated response:** "Couldn't parse AI response" + retry button.
- **Loading:** spinner + cancellable "stop" affordance.
- **Success:** shows suggestion / followup / question, generated-at timestamp, model name.

Each failure sets `aiStatus: 'failed'` (and does **not** set `aiTextSignature`), so the item is still eligible for a future auto-retry on mount (see below).

### Interrupted vs failed generations across reloads

- A generation that was in-flight when the tab closed leaves the item with `aiStatus: 'generating'` (no `ai`, no signature). On next mount, `useItems` treats any item still stuck in `'generating'` as interrupted and enqueues **one** auto-retry per item.
- A generation that **failed** has `aiStatus: 'failed'` — same one-auto-retry-on-mount rule.
- Items with `aiStatus: 'skipped-no-key'` are **not** auto-retried on mount (see No-key state above). They only generate when the user acts on them manually.
- A generation that **succeeded** has `aiStatus: 'success'` with `ai` + `aiTextSignature` set. These are never touched on mount.

Net effect: on reload, any item that was mid-generation or failed gets exactly one fresh attempt automatically; items skipped due to no-key and items already successful are left alone.

## Features / UX

1. **List view**
   - Single column of items. Checkbox to complete, strikethrough on done.
   - **Order:** newest first (by `createdAt` desc). Done items stay in place (not shuffled to bottom) to preserve context; user can delete completed ones manually.
   - Inline edit on click; Enter saves, Esc cancels.
   - **Empty input:** pressing Enter on an empty "add item" input does nothing — no empty items are ever created. Editing an existing item to empty text is blocked (save is refused; the item keeps its previous text).
   - Delete on hover (small ×).
   - "Add item" input pinned at top.

2. **Item AI drawer / inline panel**
   - Expandable area under each item showing Suggestion / Followup / Question.
   - Shows a subtle "generated at" timestamp + model name.
   - "Regenerate" action triggers a fresh call (updates signature).
   - Loading state while generating; does not block the rest of the list.
   - **Done items are collapsed:** when `done === true`, the AI panel is collapsed (hidden) by default and **AI generation is disabled** for that item — no auto-regen on edit, no background calls. The user can still expand the panel to read existing `ai` output, but no new generation fires while the item stays done. Un-checking the item re-enables generation per the normal rules.

3. **Settings (minimal)**
   - OpenRouter API key input (stored in `localStorage`).
   - Model picker (default to a small/cheap model).
   - "Clear all data" button.

4. **Dark mode only**
   - Hardcoded dark palette. No toggle. No theme infrastructure.

5. **First-run / empty state**
   - When the list is empty: friendly placeholder ("Nothing to do yet — add your first item above.").
   - When no OpenRouter key is set, the empty state also shows a subtle prompt: "Tip: add your OpenRouter API key in Settings to get AI suggestions, follow-ups, and questions on each item." This persists (not a one-time toast) until a key is set, so it's discoverable without being intrusive.
   - Once at least one item exists and a key is set, the empty-state UI is gone entirely.

## AI Prompt

System prompt (concise, deterministic-ish):

> You are a minimalist productivity assistant. For the given todo item, return JSON with three short strings: `suggestion` (a concrete tip to start or finish it), `followup` (the natural next step after it's done), `question` (one clarifying question). Max ~12 words each. No preamble.

User content: the item text.

Response parsed as JSON; on parse error or API failure, leave `ai` unset and do **not** set `aiTextSignature` (so the item stays eligible for auto-retry on next mount). Allow a manual retry.

### Input caps

- Item text is capped at **500 characters** (soft client-side limit, enforced in the editor with a counter).
- When building the prompt, if text somehow exceeds the cap (e.g. imported), truncate to 500 chars and append `…` — never send unbounded input to the model.
- Number of items: no hard cap, but the AI generation queue is sequential (concurrency=1) so a huge backlog degrades gracefully rather than flooding OpenRouter.

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
- **Concurrency & cancellation rule:** the generation queue runs with concurrency=1 per item id. If a new edit arrives for an item while a generation for that same id is in-flight, the in-flight request is **aborted** (via `AbortController`), the pending generation is cancelled, and a fresh one is enqueued 800ms after the last keystroke. Only one generation per item id is ever active at a time. Edits to *other* items are unaffected and queue independently.

## Privacy & Safety

- API key lives only in the browser's `localStorage`; never logged, never sent anywhere except OpenRouter.
- Item text is sent to OpenRouter for generation — that's the only external call. Documented in Settings.
- No analytics, no telemetry.

## Build / Dev

- `npm run dev` — Vite dev server.
- `npm run build` — production build to `dist/`, served as static files.
- **Hosting:** local-only. No deploy target (no GitHub Pages / Vercel). The built `dist/` is opened/served locally by the user; Vite base path stays default. The repo is not wired to any CI/CD.
- `.env` only holds non-secret defaults (e.g. default model id). The API key is NOT in env.

## Milestones

1. **Skeleton:** Vite + React + TS, dark styles, list CRUD with IndexedDB persistence. No AI yet.
2. **AI integration:** OpenRouter client, signature + edit-distance regen logic (keyed by `(id, signature)`), no-key fallback state, interrupted/failed-on-mount auto-retry, error UX (no-key / rate-limited / network / bad-JSON states), input caps, inline AI panel, loading/error states.
3. **Settings:** API key + model picker + data reset.
4. **Polish:** keyboard nav, empty states, responsive/mobile tuning, micro-interactions, README.

## Open Questions

- IndexedDB vs `localStorage`: IndexedDB is more capable; do we want the extra dep (`idb-keyval`)?
- Should "regenerate" be per-item only, or also a global "regenerate stale" sweep?
- Do we want the AI panel inline (expanding the row) or as a side drawer for the selected item?
