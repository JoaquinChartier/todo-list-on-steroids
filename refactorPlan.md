# Refactor Plan: Access Tiers (BYOK / Free+Ads / Subscription)

Branch: `refactor/access-tiers-plan` (planning phase)

## 1. Goals

Introduce three access tiers for the app without breaking the existing
local-first, dark-mode-only, OpenRouter-backed experience.

| Tier | API key | Ads | Subscription | Cost to user |
| --- | --- | --- | --- | --- |
| **BYOK** | User's own OpenRouter key | None | None | Pay OpenRouter directly |
| **Free** | None (uses app's key via proxy) | Yes (Google AdSense) | None | $0, see ads |
| **Pro** | None (uses app's key via proxy) | None | Paid | Monthly/annual fee |

### Non-goals
- Multi-user sync, cloud storage of items (still local-first, IndexedDB).
- Themes other than dark.
- New AI features — this refactor is purely about access/routing.

## 2. Architecture overview

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  Client     │  BYOK   │  Cloudflare Worker   │  proxy  │ OpenRouter  │
│  (Vite)     │────────▶│  /api/chat           │────────▶│             │
│             │         │  /api/stt            │         └─────────────┘
│             │ free/pro│  /api/auth/*         │
│             │────────▶│  /api/billing/*      │──▶ Stripe / Lemon / etc (TBD)
│             │         │  /api/ads/config     │──▶ AdSense
└─────────────┘         └──────────────────────┘
```

- **Client** stays 100% static. No secrets in the bundle.
- **Worker** holds the app's OpenRouter key in a Cloudflare secret, validates
  the user's tier (JWT / signed cookie), enforces per-tier rate limits, and
  proxies chat + STT requests to OpenRouter.
- **AdSense** is loaded only when the active tier is `free`. AdSense script
  is injected lazily; never loaded for `byok` or `pro`.

## 3. Tier detection & state

Single source of truth on the client: a new `useAccess()` hook backed by
`localStorage` key `tos.access`:

```ts
type Tier = "byok" | "free" | "pro";
type AccessState = {
  tier: Tier;
  // pro-only
  authToken?: string;     // JWT from worker, refreshed silently
  expiresAt?: number;     // unix ms
  // byok-only
  apiKey?: string;        // moved here from useSettings
};
```

- Default tier when nothing is configured: **`byok`** (preserves current
  behavior — existing users keep working without change).
- Tier switcher in Settings. Switching to `free` or `pro` removes the
  apiKey input; switching to `byok` hides the ad slot.
- `useSettings.apiKey` is deprecated; folded into `AccessState.apiKey`.
  The model selector stays in `useSettings` (still applies to all tiers).

## 4. AI provider abstraction

Introduce a single `AIClient` interface so the UI does not care whether the
call is going to OpenRouter directly (BYOK) or through the worker (free/pro).

```ts
// src/ai/client.ts (new)
export interface AIClient {
  generate(opts: GenerateOpts): Promise<AIOutput>;
  transcribe(opts: TranscribeOpts): Promise<string>;
  listModels?(signal?: AbortSignal): Promise<ModelInfo[]>;
}

export function createAIClient(access: AccessState): AIClient { ... }
```

- `byok`  → returns `OpenRouterDirectClient` (today's `openrouter.ts`,
  refactored into a class).
- `free`/`pro` → returns `WorkerProxyClient` (new; hits `/api/chat` and
  `/api/stt`).
- `useAI` consumes an `AIClient` instead of `{apiKey, model}`. The hook
  re-subscribes when the client changes (tier switch) and cancels in-flight
  requests.
- `listModels()` only available in BYOK (free/pro use a fixed model picked
  server-side to control cost).

## 5. Worker API contract (Cloudflare Workers)

All endpoints are JSON, CORS-preflight, cookie or `Authorization: Bearer`.

| Method | Path | Auth | Body | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/chat` | tier cookie/JWT | `{ text, model?, signature }` | Proxy to OpenRouter chat |
| POST | `/api/stt` | tier cookie/JWT | `{ audio, format, language? }` | Proxy to OpenRouter STT |
| GET | `/api/ads/config` | none | — | Returns AdSense client id + slot ids |
| POST | `/api/auth/anonymous` | none | — | Issues a free-tier cookie (signed) |
| POST | `/api/auth/login` | TBD | TBD | Subscription login (TBD) |
| POST | `/api/auth/refresh` | tier cookie/JWT | — | Refresh token |
| POST | `/api/billing/checkout` | tier cookie/JWT | `{ plan }` | Returns checkout URL (TBD provider) |
| POST | `/api/billing/portal` | tier cookie/JWT | — | Returns portal URL |
| POST | `/api/billing/webhook` | provider sig | provider payload | Subscription status updates |

### Worker-side rate limits (rough draft)
- `free`: 20 chat requests/day, 5 STT requests/day (sliding window in KV).
- `pro`: 500 chat requests/day, 100 STT requests/day.
- `byok`: no proxying (client calls OpenRouter directly).

### Worker-side cost guard
The worker always sets a fixed `max_tokens` and rejects requests with `text`
longer than N chars. Free tier uses a single cheap model (e.g. the current
default `openrouter/z-ai/glm-5.2`). Pro tier allows a small curated list.

## 6. AdSense integration

- New `<AdSlot />` component, mounted only when `access.tier === "free"`.
- AdSense script loaded once on demand via a `useAdSense()` hook that
  injects `<script async src=...>` only when entering `free` tier, and
  removes it when leaving.
- Slot placement (kept minimal/non-intrusive):
  - One rectangle ad in the footer, only on the main list view.
  - Never inside the item list, never in Settings, never in modals.
- If AdSense rejects the site (common for new apps), the slot renders a
  fallback "Enjoying TODOs on Steroids? Consider going Pro." nudge — this is
  just a styled div, not a third-party ad.

## 7. Migration / backwards compatibility

- Existing users have `tos.openrouter.apiKey` in localStorage. On first
  load with the new build, `useAccess` initializes `tier = "byok"` and
  copies `tos.openrouter.apiKey` into `access.apiKey`. Old key is left in
  place; nothing breaks.
- IndexedDB schema is unchanged.
- `useSettings.apiKey` is removed; components that read it migrate to
  `useAccess`.

## 8. File-by-file change list

### New
- `src/ai/client.ts` — `AIClient` interface + `createAIClient(access)`.
- `src/ai/openrouterDirect.ts` — refactor of `openrouter.ts` into a class
  implementing `AIClient`. Pure rename/move; logic unchanged.
- `src/ai/workerProxy.ts` — `WorkerProxyClient` (chat + STT via worker).
- `src/hooks/useAccess.ts` — tier state, tier switching, token refresh.
- `src/hooks/useAdSense.ts` — lazy AdSense script injection.
- `src/components/AdSlot.tsx` — AdSense slot component.
- `src/components/TierSwitcher.tsx` — UI in Settings for picking tier.
- `worker/` — Cloudflare Worker project (Wrangler). Separate `package.json`
  and `wrangler.toml`. Endpoints as listed above. Uses `@cloudflare/kv`
  bindings for rate limits + revocation list.

### Modified
- `src/App.tsx` — wire `useAccess`, build `AIClient`, pass to `useAI`.
  Hide/show `<AdSlot/>` based on tier.
- `src/hooks/useAI.ts` — accept `AIClient` instead of `{apiKey, model}`.
  Cancel + resubscribe on client change.
- `src/hooks/useSettings.ts` — drop `apiKey`; keep only `model`.
- `src/hooks/useVoiceInput.ts` — take `AIClient` for STT (was passing
  raw `apiKey`).
- `src/components/Settings.tsx` — replace API key input with
  `<TierSwitcher/>`. Show key input only when tier is `byok`. Hide model
  selector when tier is `free` (model is fixed server-side).
- `src/components/AddItem.tsx` — mic button visibility now depends on
  `access.tier` having either an apiKey (byok) or being free/pro
  (proxy has STT).
- `src/styles.css` — add `.ad-slot`, `.tier-switcher`, `.pro-badge`,
  `.free-badge`. Keep dark palette.
- `package.json` — add `wrangler` as dev dep, add `dev:worker` and
  `deploy:worker` scripts.

### Removed / deprecated
- `src/ai/openrouter.ts` — moved to `openrouterDirect.ts`.
- `useSettings.apiKey` — moved to `useAccess`.

## 9. Phasing

The plan is deliberately split so each phase is independently shippable.

### Phase 1 — Client refactor (no backend yet)
- Introduce `AIClient` interface and `OpenRouterDirectClient`.
- Move `apiKey` into `useAccess`, add `tier` field defaulting to `byok`.
- `useAI` and `useVoiceInput` consume `AIClient`.
- Settings shows the new `<TierSwitcher/>` with `free` and `pro` greyed
  out ("coming soon").
- **Ship:** behaviour identical to today, but the seam is in place.

### Phase 2 — Worker skeleton (BYOK still default)
- Stand up `worker/` with `/api/chat`, `/api/stt`, `/api/auth/anonymous`.
- Implement `WorkerProxyClient` on the client.
- Free tier selectable in `<TierSwitcher/>`. Ad slot renders the
  fallback nudge (no AdSense yet).
- **Ship:** free tier works end-to-end with the app's key + rate limits.

### Phase 3 — AdSense
- Implement `useAdSense`, `<AdSlot/>`, `/api/ads/config`.
- Replace the fallback nudge with real AdSense slots.
- **Ship:** free tier monetized.

### Phase 4 — Subscription
- Pick provider (Stripe / LemonSqueezy / Clerk) — separate decision.
- Implement `/api/auth/login`, `/api/billing/*`, token refresh, portal.
- Pro tier selectable. Ad slot hidden when `tier === "pro"`.
- **Ship:** pro tier works.

### Phase 5 — Polish
- Per-tier model picker for `pro`.
- Rate-limit UI (remaining requests today).
- Smooth tier-switch UX (warn before mid-conversation switch).
- Telemetry on the worker (deno chronograf or Cloudflare analytics).

## 10. Risks & open questions

1. **OpenRouter key exposure**: the worker's key must never reach the
   client. All requests proxy through the worker; the client only ever
   sees the response.
2. **Free-tier abuse**: anonymous cookies can be rotated to reset quotas.
   Mitigations: CAPTCHA on anonymous issue, IP-based throttle, hard daily
   cap per IP. Decide how aggressive to be in Phase 2.
3. **AdSense approval**: AdSense has a content/app approval process. The
   fallback nudge in Phase 2 lets us ship before approval.
4. **Subscription provider**: left open. Picking before Phase 4 is fine,
   but the client-side `useAccess` interface must be provider-agnostic
   (just an opaque `authToken` + `expiresAt`).
5. **Cost ceiling**: free + pro use the app's OpenRouter credit. Need a
   monthly budget alert on the OpenRouter account and a circuit breaker
   in the worker (return 503 when over budget).
6. **CORS + cookies**: Cloudflare Workers can set `SameSite=Lax` cookies
   on a custom domain. We will need a domain (e.g. `api.todosonsteroids.app`)
   so cookies work cross-origin from the static site. The static site must
   also be on a sibling subdomain (`app.todosonsteroids.app`) for
   `SameSite=Lax` to apply, or we use `SameSite=None; Secure` with a real
   cert (Cloudflare provides this).
7. **Local dev**: worker needs `wrangler dev` running alongside Vite. Add
   a `concurrently` script and a `.env.local` for the client pointing at
   `http://localhost:8787`.
8. **EU VAT / tax**: if we use Stripe directly we handle VAT; if we use
   LemonSqueezy they handle it as merchant of record. Defer to Phase 4
   decision.

## 11. What this plan does NOT change

- IndexedDB schema.
- The `Item` / `AIOutput` / `Priority` types.
- The subtask-creation flow in `App.tsx`.
- The signature-based re-generation logic in `useAI.ts`.
- Dark-only styling.
- 80-char text clamp.

## 12. Definition of done (per phase)

- Phase 1: `npm run build` clean, existing UX unchanged, `useAccess` and
  `AIClient` exist and BYOK path uses them.
- Phase 2: free tier works without a user-supplied key; worker enforces
  daily limits; `wrangler deploy` documented in README.
- Phase 3: AdSense serving on free tier; ad slot hidden on byok/pro.
- Phase 4: paying user can complete checkout, log in, use the app ad-free;
  subscription expiry downgrades tier to `free`.
- Phase 5: telemetry dashboard, rate-limit UI, polished switcher.
