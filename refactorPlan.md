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
│             │         │                      │──▶ MailChannels (magic links)
└─────────────┘         └──────────────────────┘
```

- **Client** stays 100% static. No secrets in the bundle. AdSense ids
  hardcoded in `src/components/AdSlot.tsx` (not secret — visible on any
  AdSense page by design).
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
  isAuthenticated: boolean;  // true when a valid worker cookie is present
  email?: string;            // pro-only, from /api/auth/me
  expiresAt?: number;        // pro-only, unix ms — when the worker cookie/JWT expires
  // byok-only
  apiKey?: string;           // moved here from useSettings
};
```

- Default tier when nothing is configured: **`byok`** (preserves current
  behavior — existing users keep working without change).
- Tier switcher in Settings. Switching to `free` or `pro` removes the
  apiKey input; switching to `byok` hides the ad slot.
- The JWT cookie is `HttpOnly`, so JS cannot read it — `useAccess` only
  knows `isAuthenticated` (via `/api/auth/me` returning 200/401) and
  `expiresAt` (returned in the `/api/auth/me` body, not from the cookie).
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
| POST | `/api/auth/anonymous` | none | — | Issues a free-tier cookie (signed) |
| GET  | `/api/auth/me` | tier cookie/JWT | — | Returns `{ tier, email?, expiresAt }` for the current cookie |
| POST | `/api/auth/request` | none | `{ email }` | Send magic login link (passwordless) |
| GET  | `/api/auth/verify?token=...` | magic token | — | Verify token, set tier cookie, redirect to app |
| POST | `/api/auth/refresh` | tier cookie/JWT | — | Refresh token |
| POST | `/api/auth/logout` | tier cookie/JWT | — | Clear cookie + revoke JWT |
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

### Authentication: passwordless magic links

Email-only login, no passwords, no OAuth.

**Flow:**
1. User enters email in `<TierSwitcher/>` (Pro tab) → POST `/api/auth/request` with `{ email }`.
2. Worker generates a 32-byte base64url token, stores in KV:
   `magic:<token>` → `{ email, expires: now+15min }`, TTL 15 min.
3. Worker emails a link `https://api.todosonsteroids.app/api/auth/verify?token=...`
   to the user via **MailChannels** (free on Cloudflare Workers, no signup).
   Fallback provider: Resend ($0 for 100/day) if delivery proves unreliable.
4. User clicks the link. Worker looks up the token in KV, deletes it
   (one-shot — can't be replayed), issues a signed JWT in an
   `HttpOnly; Secure; SameSite=Lax` cookie, then HTTP 302 redirects to
   `https://app.todosonsteroids.app/?welcome=1`.
5. Client's `useAccess` reads the cookie on next load (or via
   `/api/auth/me`), tier becomes `pro`, ad slot hidden, API key input
   hidden.

**Why magic links:**
- No password to store, hash, or leak.
- No OAuth provider to set up (Google/GitHub buttons, client ids, etc.).
- Same UX on desktop and mobile — just tap a link in the email app.
- Token is one-shot + 15-min TTL, so a leaked/forwarded email grants no
  persistent access.

**Token lifecycle & security:**
- Magic tokens: KV key `magic:<token>`, single-use, deleted on read,
  15-min TTL.
- Session JWT: HMAC-signed with a worker secret, short-lived (e.g. 7 days),
  `HttpOnly` cookie so JS can't read it (prevents XSS exfil).
- Refresh: `/api/auth/refresh` extends the JWT silently before expiry.
- Logout: `/api/auth/logout` clears the cookie and adds the JWT jti to
  a `revoked` KV namespace until natural expiry.
- Revocation list is checked on every authenticated request.

**Anonymous free tier:**
- `/api/auth/anonymous` issues a cookie with `tier: "free"` and no email.
- The anonymous JWT still has a `sub` (stable random id), so rate limits
  are keyed to that `sub` as usual. Rotating the cookie (calling
  `/api/auth/anonymous` again) mints a new `sub` → resets quotas. This is
  the accepted soft-abuse vector (see Risks §1). Mitigation is IP-based
  throttle on `/api/auth/anonymous` itself, not on the proxy endpoints.

**What `useAccess` sees:**
- An opaque boolean `isAuthenticated` and `tier`. The JWT itself never
  leaves the cookie, so the client never holds a token it can lose.

### Cookie refresh UX

The session JWT is short-lived (7 days). The client never sees the token,
so it can't inspect `exp` directly — it relies on `expiresAt` returned by
`/api/auth/me`. Two trigger points for silent refresh:

1. **On app load.** `useAccess` calls `GET /api/auth/me` on mount.
   - 200 → `isAuthenticated = true`, store `expiresAt` from the body.
   - 401 → `isAuthenticated = false`, fall back to byok UX (or prompt
     re-login if tier is `pro` and a stale `email` is in localStorage).
   - If the response sets a fresh `Set-Cookie` (silent refresh), the new
     expiry is used. Worker always sends a refreshed cookie when the
     current one is >50% expired.
2. **On 401 from `/api/chat` or `/api/stt`.** The client calls
   `/api/auth/refresh` once. If that returns 200, retry the original
   request. If it returns 401, mark `isAuthenticated = false` and surface
   a "Your session expired — log in again" prompt. No silent infinite
   retry loops.

**Worker refresh policy:**
- Worker checks `exp` on every authenticated request. If the JWT is
  within the last 50% of its lifetime, the response includes a
  `Set-Cookie` with a fresh JWT (sliding window).
- `/api/auth/refresh` is an explicit endpoint that does the same — used
  when the client doesn't have another request in flight.
- Logout invalidates the JWT jti immediately (added to `revoked` KV),
  so refresh after logout returns 401.

**Client behavior on tier switch mid-session:**
- Switching `byok` ↔ `free`/`pro` cancels in-flight `AIClient` requests
  via `AbortController` (same mechanism `useAI` already uses for rapid
  edits). No silent retry — the user explicitly chose to switch.
- Switching to `byok` while a worker request is in flight: abort, no
  retry (the BYOK path uses different credentials).
- Switching to `free`/`pro` while a BYOK request is in flight: abort,
  re-generate via the worker path.

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
  bindings for rate limits, magic tokens, and revocation list. Uses
  MailChannels for magic link emails. Local dev reads secrets
  (OpenRouter key, JWT HMAC key, MailChannels send key) from a `.dev.vars`
  file (gitignored) — `wrangler dev` picks this up automatically.

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
- Implement `useAdSense`, `<AdSlot/>`.
- AdSense publisher id + slot ids hardcoded in `src/components/AdSlot.tsx`
  (they're not secret — visible on any AdSense page by design).
- Replace the fallback nudge with real AdSense slots.
- **Ship:** free tier monetized.

### Phase 4 — Subscription (magic-link login)
- Pick payment provider (Stripe / LemonSqueezy) — separate decision.
- Implement `/api/auth/request` + `/api/auth/verify` (magic links via
  MailChannels), `/api/auth/refresh`, `/api/auth/logout`, `/api/billing/*`,
  and the `magic:` + `revoked` KV namespaces.
- `<TierSwitcher/>` Pro tab: single email input → "Check your email"
  confirmation → on return, cookie is set, tier becomes `pro`.
- Ad slot hidden when `tier === "pro"`.
- **Ship:** pro tier works end-to-end.

### Phase 5 — Polish
- Per-tier model picker for `pro`.
- Rate-limit UI (remaining requests today).
- Smooth tier-switch UX (warn before mid-conversation switch).
- Telemetry via Cloudflare Workers Analytics + custom events logged to a
  `telemetry` KV namespace (counter-style: chat calls per tier, STT calls
  per tier, 503s from cost breaker, magic-link issue/verify counts).

## 10. Security model

The client's `tier` field is **cosmetic** — it controls UI hints (ad slot
visibility, API-key input visibility, which `AIClient` to build) but grants
no server-side access. All real security lives on the worker.

| Attack | Mitigation |
| --- | --- |
| Edit localStorage `tier` → `"pro"` | Hides ads locally for themselves. They were ad-free under BYOK anyway. No server gain. |
| Edit localStorage `tier` → `"free"` | `/api/chat` still 401s without a valid cookie from `/api/auth/anonymous`. |
| Forge a pro JWT | Can't — worker's HMAC secret never leaves Cloudflare. Signature check fails → 401. |
| Steal someone else's cookie | `HttpOnly` blocks XSS exfil. Victim can hit `/api/auth/logout` to revoke via KV. |
| Spam `/api/auth/anonymous` for fresh quotas | IP throttle + soft rate cap (see Risks §2). |
| Extract the app's OpenRouter key | Impossible — stored as `wrangler secret`, never in any response payload. |
| Edit the JWT payload directly | HMAC signature mismatch → 401. JWTs are signed, not just base64. |

**Where the trust actually lives:**
1. **Worker secret** (HMAC key) — never leaves Cloudflare.
2. **OpenRouter key** — stored as `wrangler secret`, only the worker reads it.
3. **`HttpOnly; Secure; SameSite=Lax` cookie** — JS can't read it; only the worker sets/clears it.
4. **KV revocation list** — checked on every authenticated request; logged-out JWTs die immediately.
5. **Rate limits keyed to JWT `sub` (user id), not IP** — cookie rotation doesn't reset them.
6. **Cost circuit breaker** — worker returns 503 when monthly spend hits cap, regardless of who's asking.

The worst case for client tampering is a user hiding their own ad slot locally — they get nothing they couldn't already have by using BYOK with their own OpenRouter key.

## 11. Risks & open questions

1. **Free-tier abuse**: anonymous cookies can be rotated to reset quotas.
   **Decision: Soft mitigation.** Anonymous cookie issued freely; IP-based
   throttle kicks in only after obvious abuse pattern (many requests per
   IP in a short window). No CAPTCHA on issue — keeps the first-run UX
   clean. Re-evaluate in Phase 5 if abuse becomes real.
2. **Subscription provider**: **Deferred to Phase 4.** The client-side
   `useAccess` interface is provider-agnostic (opaque `authToken` +
   `expiresAt`), so the worker can swap Stripe / LemonSqueezy / Clerk
   without touching the client. Decide at Phase 4 start based on the
   competitive landscape then.
3. **Cost ceiling**: **Decision: $10/month hard stop.** Worker checks
   OpenRouter spend via their API (or a KV counter updated per request
   using a per-request cost estimate). When monthly spend hits $10, worker
   returns `503` for free + pro tiers until the 1st of the next month.
   BYOK is unaffected (user pays their own OpenRouter bill).
   Monthly budget alert configured on the OpenRouter dashboard as a
   secondary notification channel.
4. **CORS + cookies**: **Decision: Subdomains.** Static site on
   `app.todosonsteroids.app`, worker on `api.todosonsteroids.app`.
   `SameSite=Lax` cookies work because both are subdomains of
   `todosonsteroids.app`. Cloudflare provides the TLS certs. Local dev
   uses `localhost` for both (Vite on :5173, wrangler on :8787) with
   `SameSite=Lax; Secure` relaxed via a dev-only cookie variant.
5. **EU VAT / tax**: folded into the Phase 4 subscription provider
   decision. If LemonSqueezy (merchant of record), VAT is handled. If
   Stripe direct, we need Stripe Tax or manual VAT handling. Decide at
   Phase 4 start.

## 12. What this plan does NOT change

- IndexedDB schema.
- The `Item` / `AIOutput` / `Priority` types.
- The subtask-creation flow in `App.tsx`.
- The signature-based re-generation logic in `useAI.ts`.
- Dark-only styling.
- 80-char text clamp.

## 13. Definition of done (per phase)

- Phase 1: `npm run build` clean, existing UX unchanged, `useAccess` and
  `AIClient` exist and BYOK path uses them.
- Phase 2: free tier works without a user-supplied key; worker enforces
  daily limits; `wrangler deploy` documented in README.
- Phase 3: AdSense serving on free tier; ad slot hidden on byok/pro.
- Phase 4: paying user can request a magic link, click it, land on the
  app ad-free with tier `pro`; subscription expiry downgrades tier to
  `free`.
- Phase 5: telemetry dashboard, rate-limit UI, polished switcher.
