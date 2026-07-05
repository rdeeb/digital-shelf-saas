# SaaS Premium Cloud Server Design

**Date:** 2026-07-05  
**Status:** Approved  
**Scope:** Cloud-hosted multi-user Digital Shelf premium server with Steam OpenID auth, PayPal + Apple + Google billing, mobile-ready REST API, and ESP32 device support

## Summary

Build the Digital Shelf **Premium** product in the `saas/` repository: a cloud-hosted backend so users can run shelf frames on ESP32 hardware without self-hosting the open-source server. Users authenticate with **Steam OpenID only** (Steam account = identity). Access requires a **paid subscription** via **PayPal (web)**, **Apple IAP**, or **Google Play**. Two plans: **Basic** (1 device) and **Pro** (unlimited devices), each with monthly and annual billing cycles.

The server exposes a **versioned REST API** (`/api/v1/*`) shared by the web app and a future React Native mobile app. Mobile-assisted device pairing reduces setup friction. Platform **sales control flags** allow ops to halt new sales and/or renewals without shutting down the service.

**Architecture:** Copy-and-extend monorepo (Approach 1). Copy shared packages from `server/` initially; add SaaS-only apps (`saas-server`, `saas-web`) and `packages/billing`.

## Decisions

| Decision | Choice |
|----------|--------|
| Product model | Cloud server; users still pair ESP32 displays |
| Auth | Steam OpenID only — no email/password |
| Billing | PayPal (web) + Apple IAP + Google Play from v1 |
| Free tier | None — paid subscription required before library sync / device claim |
| Plans | Basic (1 device) vs Pro (unlimited devices) |
| Billing cycles | Monthly + annual for all providers |
| Code sharing | Copy packages from `server/` into `saas/` initially |
| Database | PostgreSQL (production); SQLite optional for local dev |
| Frame storage | S3-compatible (R2/S3) in production; local filesystem in dev |
| Mobile app | Separate repo; this server provides `/api/v1` API contract |
| Sales controls | Platform flags to block new sales and/or renewals |

## Product & User Journey

### v1 user journey (web)

```txt
Landing → Sign in with Steam → Subscribe (PayPal) → Sync library → Pair ESP32 → Manage in web app
```

### v1 user journey (mobile)

```txt
Sign in with Steam (browser + deep link) → Subscribe (Apple/Google) → Scan QR / claim device → BLE provision Wi-Fi + server URL → Display loop
```

### Key difference from OSS

- Users **never** provide a Steam API key. The platform holds one server-side `STEAM_API_KEY` for all library syncs.
- Steam OpenID establishes identity; the platform key powers `GetOwnedGames` and metadata enrichment.
- Every user action is tenant-scoped by `userId`.

### Out of scope (v1)

- Themes / premium visual styles / theme marketplace
- React Native mobile app (separate project; server delivers API only)
- BLE provisioning implementation (firmware + mobile; server provides claim API)
- Email notifications
- Ops admin UI (platform flags via DB/env in v1)
- Free tier / trials
- Virtual-only mode (browser shelf without ESP32)

## Repository Layout

```txt
saas/
  apps/
    saas-server/          # Fastify API (cloud mode)
    saas-web/             # React consumer web app
  packages/
    shared-types/         # copied from server, extended with SaaS types
    core/                 # copied as-is
    platform-steam/       # copied as-is (OpenID helpers reused)
    renderer/             # copied as-is
    device-protocol/      # copied + /api/v1 schemas
    billing/              # NEW — PayPal, Apple, Google, entitlements
  docs/
    superpowers/specs/
  docker-compose.yml      # Postgres + server (dev)
```

### Runtime stack

| Layer | Choice |
|-------|--------|
| API | Fastify + Zod + Prisma |
| DB | PostgreSQL (production) |
| Web sessions | HTTP-only signed cookies |
| Mobile auth | Bearer access token + refresh token |
| Frame storage | S3-compatible object storage; local in dev |
| Payments | PayPal Subscriptions + App Store + Google Play |
| UI | React + Vite + Tailwind (adapted from OSS web) |

## Architecture

### Request flow

```txt
saas-web / mobile app
  → session cookie OR Bearer token
  → tenant middleware (resolve userId)
  → auth guard
  → entitlement guard (active subscription)
  → /api/v1 routes
  → tenant-scoped services

ESP32 → /api/device/v1/* → device token auth → tenant via device.userId
PayPal / Apple / Google → /api/billing/*/webhook → update subscriptions
```

### Middleware order (user-facing routes)

1. **Session / token** — resolve `userId`; 401 if missing.
2. **Entitlement** — require `subscription.status === 'active'` (or `grace_period` if added later) for library sync, device claim, frame generation.
3. **Tenant scope** — inject `userId` into every service call.

### Device routes

`/api/device/v1/*` contract is **unchanged** for firmware compatibility. Auth via device bearer token. Tenant isolation via `device.userId` on token lookup.

### Deployment (production)

- Single `saas-server` container + managed Postgres + object storage
- `saas-web` built into `saas-server/public/` (same pattern as OSS)
- Webhooks: `POST /api/billing/paypal/webhook`, `/apple/webhook`, `/google/webhook`

## API Surface

### Route prefixes

| Prefix | Consumers | Auth |
|--------|-----------|------|
| `/api/auth/*` | Web, mobile | Public (login/callback/exchange) |
| `/api/v1/*` | Web, mobile | Session cookie or Bearer token |
| `/api/device/v1/*` | ESP32 firmware | Device bearer token |
| `/api/billing/*/webhook` | Payment providers | Provider signature verification |

### `/api/v1/` endpoints (representative)

| Area | Endpoints |
|------|-----------|
| Auth | `GET /auth/me`, `POST /auth/logout` |
| Billing | `GET /billing/plans`, `GET /billing/status`, `POST /billing/paypal/subscribe` |
| Billing (mobile) | `POST /billing/apple/verify`, `POST /billing/google/verify` |
| Library | `GET /library`, `POST /library/sync`, `PATCH /library/games/:id` |
| Devices | `GET /devices`, `POST /devices/claim`, `GET /devices/:id`, `PATCH /devices/:id/config` |
| Settings | `GET /settings`, `PATCH /settings` |
| Onboarding | `GET /onboarding/status` |

Web UI calls the same `/api/v1/*` routes as the mobile app.

## Data Model

### New tables

#### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | `user_` prefix |
| `steamId64` | String @unique | From OpenID |
| `displayName` | String? | From Steam profile after first sync |
| `avatarUrl` | String? | Optional |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime @updatedAt | |

#### `sessions` (web)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | `sess_` prefix |
| `userId` | String | FK → users |
| `expiresAt` | DateTime | |
| `createdAt` | DateTime | |

#### `refresh_tokens` (mobile)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | |
| `userId` | String | FK → users |
| `tokenHash` | String | Hashed refresh token |
| `expiresAt` | DateTime | |
| `createdAt` | DateTime | |

#### `plans` (seeded)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | `plan_basic`, `plan_pro` |
| `name` | String | "Basic", "Pro" |
| `deviceLimit` | Int? | `1` for Basic; `null` = unlimited for Pro |
| `paypalPlanIdMonthly` | String | |
| `paypalPlanIdAnnual` | String | |
| `appleProductIdMonthly` | String | |
| `appleProductIdAnnual` | String | |
| `googleProductIdMonthly` | String | |
| `googleProductIdAnnual` | String | |

#### `subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | `sub_` prefix |
| `userId` | String @unique | One subscription per user in v1 |
| `planId` | String | FK → plans |
| `provider` | String | `paypal` \| `apple` \| `google` |
| `status` | String | See status enum below |
| `billingCycle` | String | `monthly` \| `annual` |
| `providerSubscriptionId` | String? @unique | |
| `providerProductId` | String? | Store SKU / PayPal plan ID |
| `currentPeriodStart` | DateTime? | |
| `currentPeriodEnd` | DateTime? | |
| `cancelledAt` | DateTime? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime @updatedAt | |

Subscription status: `pending`, `active`, `cancelled`, `expired`, `past_due`, `grace_period`.

#### `subscription_events` (audit)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String @id | |
| `subscriptionId` | String? | FK → subscriptions |
| `userId` | String | |
| `provider` | String | |
| `eventType` | String | |
| `payload` | Json | Raw webhook/receipt payload |
| `createdAt` | DateTime | |

#### `user_settings`

| Column | Type | Notes |
|--------|------|-------|
| `userId` | String | FK → users |
| `key` | String | From `USER_SETTING_KEYS` |
| `value` | String | Opaque; typed parsing in services |
| `updatedAt` | DateTime @updatedAt | |

Primary key: `@@id([userId, key])`

Resolution precedence: **DB `user_settings` → env default → hardcoded default**.

Initial keys:

| Key | Purpose | Default |
|-----|---------|---------|
| `display.show_publisher` | Default for new devices | `true` |
| `display.show_playtime` | Default for new devices | `false` |
| `display.games_per_frame` | Default for new devices | `3` |
| `display.rotation_interval_seconds` | Default rotation | `300` |
| `display.selection_mode` | Default selection mode | `random` |
| `display.avoid_recent_repeats` | Repeat avoidance | `true` |
| `notifications.email_opt_in` | Future use | `false` |

`user_settings` are **defaults** for new devices. Per-device overrides remain in `device_configs`. On device claim, seed `device_configs` from resolved user defaults.

#### `platform_settings`

| Column | Type | Notes |
|--------|------|-------|
| `key` | String @id | From `PLATFORM_SETTING_KEYS` |
| `value` | String | |
| `updatedAt` | DateTime @updatedAt | |

### Modified OSS tables

| Table | Change |
|-------|--------|
| `platform_accounts` | Add `userId` FK; one Steam account per user |
| `devices` | Add `userId` FK; enforce plan device limit on claim |
| `games` | **Stay global** — shared metadata cache |
| `user_games` | Scoped via `platformAccount.userId` |
| `display_frames` | Scoped via `device.userId` |
| `sync_runs` | Scoped via `platformAccount.userId` |
| `settings` | **Removed** — platform config in env + `platform_settings`; user prefs in `user_settings` |

### Tenant isolation

Every query/mutation on user-owned data must filter by `userId`. Device token auth resolves device → `userId`. No cross-tenant access on frame downloads.

### Entitlement checks

| Action | Gate |
|--------|------|
| Steam library sync | Active subscription |
| Device claim | Active subscription + device count < plan limit |
| Frame generation | Active subscription + device belongs to user |
| Account settings | Authenticated (expired sub → show renew CTA) |

Device limit: count only **claimed** devices (token set), not pending registrations.

## Auth & Steam Integration

### Web flow

```txt
User clicks Sign in with Steam
  → GET /api/auth/steam/login
  → Steam OpenID
  → GET /api/auth/steam/callback
  → Verify assertion, upsert users by steamId64
  → Create session + Set-Cookie ds_session
  → Redirect based on onboarding state
```

### Mobile flow

```txt
App opens Steam OpenID in system browser
  → Callback on server
  → Redirect digitalshelf://auth/callback?code=...
  → POST /api/auth/steam/exchange { code }
  → Returns accessToken + refreshToken
  → Mobile sends Authorization: Bearer <accessToken>
```

Reuse `platform-steam` OpenID helpers from copied package.

### Post-login routing

| User state | Redirect |
|------------|----------|
| No subscription | `/subscribe` |
| Active sub, no sync | `/onboarding/sync` |
| Active sub, no devices | `/devices` |
| Fully set up | `/dashboard` |

### Platform Steam API key

Single `STEAM_API_KEY` in server env. Never exposed to browser, devices, or logs.

### `platform_accounts` lifecycle

1. User signs in → `users` row exists.
2. First library sync (post-subscription) → create `platform_accounts` with `userId`, `platform: 'steam'`, `externalId: steamId64`.
3. One platform account per user in v1.

## Billing & Entitlements

### Unified model

All providers write to the same `subscriptions` table. One `packages/billing` module with:

```txt
billing/
  entitlements.ts
  paypal/
  apple/
  google/
  types.ts
```

### Provider flows

**PayPal (web):** `POST /api/v1/billing/paypal/subscribe` → PayPal approval → webhook `SUBSCRIPTION.ACTIVATED` → `status: active`.

**Apple IAP:** App purchases SKU → `POST /api/v1/billing/apple/verify` → App Store Server API validation → App Store Server Notifications V2 webhook for renewals.

**Google Play:** App purchases SKU → `POST /api/v1/billing/google/verify` → Play Developer API validation → RTDN webhook for renewals.

### Cross-provider rules (v1)

- One subscription per user. New provider purchase supersedes old (warn in UI).
- Plan upgrades (Basic → Pro) via provider-specific upgrade flow.
- `GET /api/v1/billing/status` on mobile launch; re-validate near `currentPeriodEnd`.

### Entitlement service

```ts
requireActiveSubscription(userId)
getDeviceLimit(userId)      // 1 or null (unlimited)
canClaimDevice(userId)
```

## Sales & Renewal Controls

### Platform flags (`platform_settings`)

| Key | Default | Purpose |
|-----|---------|---------|
| `sales.new_enabled` | `true` | Allow new subscriptions |
| `sales.renewals_enabled` | `true` | Allow period extensions via renewal webhooks |
| `sales.stop_message` | `""` | User-facing message when sales blocked |

Convenience mode mapping:

| Mode | `new_enabled` | `renewals_enabled` |
|------|---------------|-------------------|
| `open` | true | true |
| `grandfather` | false | true |
| `closed` | false | false |

### Enforcement

- `sales.new_enabled = false` → block PayPal checkout, Apple/Google first-time verify, upgrades. Existing active subs keep service until period end.
- `sales.renewals_enabled = false` → renewal webhooks do not extend `currentPeriodEnd`; sub expires at end of current period.
- `GET /api/v1/billing/plans` includes `salesFlags` for web/mobile banners.

Ops updates flags via DB or env in v1 (no admin UI).

## Mobile-Assisted Device Pairing

```txt
ESP32 shows QR (deviceId + claim code)
  → Mobile scans QR
  → POST /api/v1/devices/claim { deviceId, claimCode }  (authenticated + subscribed)
  → Mobile sends Wi-Fi + server URL to ESP32 over BLE
  → ESP32 completes /api/device/v1/* registration and display loop
```

BLE provisioning is implemented in firmware + mobile app. Server provides claim API and stable public URL.

## Copy Map

### Copy from `server/`

| Source | Changes |
|--------|---------|
| `packages/shared-types` | Add SaaS types, setting keys |
| `packages/core` | As-is |
| `packages/platform-steam` | As-is |
| `packages/renderer` | As-is |
| `packages/device-protocol` | Add `/api/v1` schemas |
| OSS services | Add `userId` scoping |
| OSS device routes | Tenant scope on token lookup |
| OSS storage | Add S3 adapter |
| OSS web | Rebrand; subscribe flow; `/api/v1` client |

### Build net-new

- Auth routes (Steam OpenID, sessions, mobile token exchange)
- `/api/v1/*` REST API
- `packages/billing`
- `platform_settings` + `user_settings` services
- Postgres Prisma schema
- S3 frame storage driver

## Implementation Phases

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **P1 — Foundation** | Monorepo scaffold, copied packages, Postgres schema | `npm run build` passes; migrations apply |
| **P2 — Auth & API** | Steam login (web + mobile), `/api/v1` skeleton | Mobile can auth and call `GET /auth/me` |
| **P3 — Billing** | PayPal + Apple + Google + sales flags | Active sub unlocks API; stop-sale blocks checkout |
| **P4 — Core product** | Tenant-scoped sync, frames, devices | ESP32 pairs to cloud server and displays frames |
| **P5 — Web UI** | Consumer app: login → subscribe → manage | Full web journey works |
| **P6 — Ship** | Production deploy, monitoring, docs | Staging environment live |

Mobile app is a separate repo consuming `/api/v1` from P2 onward.

## Error Codes

Stable codes for mobile clients:

```txt
SUBSCRIPTION_REQUIRED
SALES_DISABLED
RENEWALS_DISABLED
DEVICE_LIMIT_REACHED
STEAM_OPENID_FAILED
INVALID_RECEIPT
SUBSCRIPTION_EXPIRED
```

All responses: `{ error: { code, message } }` (OSS shape).

## Testing

| Area | Approach |
|------|----------|
| `packages/billing` | Unit tests with mocked provider payloads |
| Sales flags | Unit tests for all flag combinations |
| Tenant isolation | Integration: user A cannot access user B devices |
| Device API | Port OSS tests + cross-tenant cases |
| Auth | Mocked OpenID; token refresh flow |
| E2E staging | Steam + PayPal + store sandboxes |

## Environment Variables

```env
APP_MODE=cloud
NODE_ENV=development

SERVER_HOST=0.0.0.0
SERVER_PORT=8080
SERVER_PUBLIC_URL=https://app.digitalshelf.example

DATABASE_URL=postgresql://...

STEAM_API_KEY=

FRAME_STORAGE_DRIVER=s3
FRAME_STORAGE_BUCKET=
FRAME_STORAGE_ENDPOINT=
FRAME_STORAGE_ACCESS_KEY=
FRAME_STORAGE_SECRET_KEY=

SESSION_SECRET=
MOBILE_TOKEN_SECRET=

PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=

APPLE_BUNDLE_ID=
APPLE_KEY_ID=
APPLE_ISSUER_ID=
APPLE_PRIVATE_KEY=

GOOGLE_PLAY_PACKAGE_NAME=
GOOGLE_SERVICE_ACCOUNT_JSON=

DEFAULT_SCREEN_WIDTH=172
DEFAULT_SCREEN_HEIGHT=320
LOG_LEVEL=info
```

## Acceptance Criteria

1. User can sign in with Steam OpenID (web and mobile token flow).
2. User must subscribe (PayPal, Apple, or Google) before library sync or device claim.
3. Basic plan limits to 1 claimed device; Pro allows unlimited.
4. ESP32 registers and displays frames from cloud server using unchanged `/api/device/v1` contract.
5. `/api/v1` API supports mobile app: auth, billing verify, library, devices, settings.
6. Sales flags block new sales and/or renewals per configuration.
7. Per-user settings persist and seed new device configs.
8. Tenant isolation verified — no cross-user data access.
9. `npm run build` and `npm run test` pass in `saas/` monorepo.

## Next Step

Implementation plan via writing-plans skill after spec review.
