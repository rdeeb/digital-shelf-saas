# SaaS Premium Cloud Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Digital Shelf Premium cloud server in `saas/` — multi-tenant Fastify API with Steam OpenID auth, PayPal + Apple + Google billing, `/api/v1` mobile-ready REST API, and ESP32 device support — by copying and extending the open-source `server/` monorepo.

**Architecture:** Copy-and-extend monorepo. Shared packages (`core`, `renderer`, `platform-steam`, `device-protocol`, `shared-types`) copied from `../server/`. New `packages/billing` for unified entitlements. `saas-server` adds tenant-scoped services, Postgres Prisma schema, auth sessions + mobile tokens. `saas-web` consumes `/api/v1/*` (same contract as future mobile app).

**Tech Stack:** Node.js 20+, TypeScript, Turborepo, Fastify, Zod, Prisma/PostgreSQL, React 19, Vite, Tailwind, Vitest, PayPal Subscriptions API, App Store Server API, Google Play Developer API, S3-compatible storage

**Spec:** `docs/superpowers/specs/2026-07-05-saas-premium-design.md`

**Source repo for copies:** `../server/` (sibling `virtual-shelf/server`)

**Remote:** `git@github.com:rdeeb/digital-shelf-saas.git`

---

## Phase P0 — Repository setup (run once before P1)

### Task 0: Git remote, initial commit, and work branch

**Prerequisite:** Complete before Task 1. `master` holds only the approved spec and plan; all implementation work happens on a feature branch.

**Files:**
- Track: `docs/superpowers/specs/2026-07-05-saas-premium-design.md`
- Track: `docs/superpowers/plans/2026-07-05-saas-premium.md`

- [ ] **Step 1: Ensure repo is on `master` with a clean slate for the initial commit**

If prior commits exist with only partial docs, reset to orphan or soft-reset so the first commit can include both files:

```bash
cd saas
git checkout master
git reset --soft $(git rev-list --max-parents=0 HEAD) 2>/dev/null || true
# If repo has commits to squash into one initial commit:
git reset --soft HEAD~1  # only when exactly one prior commit exists
```

- [ ] **Step 2: Stage spec and plan**

```bash
git add docs/superpowers/specs/2026-07-05-saas-premium-design.md
git add docs/superpowers/plans/2026-07-05-saas-premium.md
```

- [ ] **Step 3: Create initial commit on `master`**

```bash
git commit -m "$(cat <<'EOF'
Add SaaS premium design spec and implementation plan.

Establishes the approved architecture for the cloud multi-tenant server
and the task-by-task plan for implementation.
EOF
)"
```

- [ ] **Step 4: Add GitHub remote**

```bash
git remote add origin git@github.com:rdeeb/digital-shelf-saas.git
```

If `origin` already exists, update instead:

```bash
git remote set-url origin git@github.com:rdeeb/digital-shelf-saas.git
```

- [ ] **Step 5: Verify remote**

```bash
git remote -v
```

Expected: `origin git@github.com:rdeeb/digital-shelf-saas.git (fetch/push)`

- [ ] **Step 6: Create and switch to implementation branch**

```bash
git checkout -b feat/saas-premium-implementation
```

All tasks from Task 1 onward are committed on this branch, not `master`.

- [ ] **Step 7: (Optional) Push branches to GitHub**

```bash
git push -u origin master
git push -u origin feat/saas-premium-implementation
```

Only run when ready to publish; requires SSH access to GitHub.

---

## File Map

| Path | Responsibility |
|------|----------------|
| `package.json` | Root workspaces `@digital-shelf-saas/root` |
| `apps/saas-server/` | Fastify API, Prisma, auth, billing routes, device API |
| `apps/saas-server/prisma/schema.prisma` | Full SaaS schema (users, billing, tenant FKs) |
| `apps/saas-server/src/config/env.ts` | Zod-validated cloud env |
| `apps/saas-server/src/db/client.ts` | Prisma singleton |
| `apps/saas-server/src/lib/session.ts` | Web session cookie helpers |
| `apps/saas-server/src/lib/mobile-token.ts` | Bearer + refresh token issue/verify |
| `apps/saas-server/src/lib/tenant-context.ts` | Fastify decorator for `userId` |
| `apps/saas-server/src/middleware/auth.ts` | Session or Bearer resolution |
| `apps/saas-server/src/middleware/entitlement.ts` | Active subscription guard |
| `apps/saas-server/src/routes/auth/` | Steam OpenID + mobile exchange |
| `apps/saas-server/src/routes/v1/` | User-facing REST API |
| `apps/saas-server/src/routes/billing/webhooks.ts` | PayPal/Apple/Google webhooks |
| `apps/saas-server/src/routes/device/v1/` | Copied from OSS + tenant scope |
| `apps/saas-server/src/services/` | Tenant-scoped copies of OSS services |
| `apps/saas-server/src/storage/` | `local-frame-storage.ts`, `s3-frame-storage.ts` |
| `apps/saas-web/` | Consumer React app |
| `packages/billing/` | Entitlements, PayPal, Apple, Google |
| `packages/shared-types/src/saas.ts` | User, subscription, setting key types |
| `packages/device-protocol/src/v1/` | `/api/v1` Zod schemas |

---

## Phase P1 — Foundation

### Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "@digital-shelf-saas/root",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "prisma:migrate": "npm run prisma:migrate -w @digital-shelf-saas/server",
    "docker:dev": "docker compose up --build"
  },
  "devDependencies": {
    "@eslint/js": "^9.28.0",
    "eslint": "^9.28.0",
    "prettier": "^3.5.3",
    "turbo": "^2.5.4",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.34.0",
    "vitest": "^3.2.4"
  },
  "engines": { "node": ">=20" },
  "packageManager": "npm@10.9.2"
}
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "../saas-server/public/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 3: Copy shared config from OSS**

Run from `saas/`:

```bash
cp ../server/tsconfig.base.json .
cp ../server/eslint.config.js .
cp ../server/.prettierrc .
```

- [ ] **Step 4: Create `.gitignore`**

```gitignore
node_modules/
dist/
data/
.env
*.db
apps/saas-server/public/*
!apps/saas-server/public/.gitkeep
.turbo/
```

- [ ] **Step 5: Create `.env.example`** (per spec Environment Variables section)

- [ ] **Step 6: Install and verify**

```bash
npm install
```

Expected: workspaces resolve (may be empty until Task 2).

- [ ] **Step 7: Commit**

```bash
git add package.json turbo.json tsconfig.base.json eslint.config.js .prettierrc .gitignore .env.example
git commit -m "chore: scaffold saas monorepo root"
```

---

### Task 2: Copy shared packages from OSS

**Files:**
- Create: `packages/shared-types/`, `packages/core/`, `packages/platform-steam/`, `packages/renderer/`, `packages/device-protocol/` (copied)

- [ ] **Step 1: Copy package directories**

```bash
cd saas
mkdir -p packages
cp -r ../server/packages/shared-types packages/
cp -r ../server/packages/core packages/
cp -r ../server/packages/platform-steam packages/
cp -r ../server/packages/renderer packages/
cp -r ../server/packages/device-protocol packages/
```

Remove build artifacts from copies:

```bash
find packages -name dist -type d -exec rm -rf {} + 2>/dev/null
find packages -name node_modules -type d -exec rm -rf {} + 2>/dev/null
find packages -name .turbo -type d -exec rm -rf {} + 2>/dev/null
```

- [ ] **Step 2: Rename package scopes in each `packages/*/package.json`**

Replace `@digital-shelf/` with `@digital-shelf-saas/` in `name` and `dependencies` fields across all five packages.

- [ ] **Step 3: Build packages**

```bash
npm install
npm run build -w @digital-shelf-saas/shared-types
npm run build -w @digital-shelf-saas/core
npm run build -w @digital-shelf-saas/platform-steam
npm run build -w @digital-shelf-saas/renderer
npm run build -w @digital-shelf-saas/device-protocol
```

Expected: all five packages build without error.

- [ ] **Step 4: Run package tests**

```bash
npm run test -w @digital-shelf-saas/shared-types
npm run test -w @digital-shelf-saas/core
```

Expected: PASS (copied OSS tests).

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "chore: copy shared packages from open-source server"
```

---

### Task 3: Extend shared-types with SaaS domain types

**Files:**
- Create: `packages/shared-types/src/saas.ts`, `packages/shared-types/src/user-settings.ts`, `packages/shared-types/src/platform-settings.ts`
- Modify: `packages/shared-types/src/ids.ts`, `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/saas.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/shared-types/src/saas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  subscriptionStatusSchema,
  billingProviderSchema,
  USER_SETTING_KEYS,
  PLATFORM_SETTING_KEYS,
  createId,
} from './index.js';

describe('saas types', () => {
  it('validates subscription status', () => {
    expect(subscriptionStatusSchema.parse('active')).toBe('active');
    expect(() => subscriptionStatusSchema.parse('bogus')).toThrow();
  });

  it('creates user-prefixed ids', () => {
    expect(createId('user')).toMatch(/^user_/);
    expect(createId('sub')).toMatch(/^sub_/);
  });

  it('exports setting keys', () => {
    expect(USER_SETTING_KEYS.DISPLAY_SELECTION_MODE).toBe('display.selection_mode');
    expect(PLATFORM_SETTING_KEYS.SALES_NEW_ENABLED).toBe('sales.new_enabled');
  });

  it('validates billing provider', () => {
    expect(billingProviderSchema.parse('paypal')).toBe('paypal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -w @digital-shelf-saas/shared-types
```

Expected: FAIL — exports not found.

- [ ] **Step 3: Add ID prefixes to `ids.ts`**

Add to `ID_PREFIX`:

```ts
user: 'user',
session: 'sess',
sub: 'sub',
subEvent: 'subev',
authCode: 'acode',
```

- [ ] **Step 4: Create `user-settings.ts`**

```ts
export const USER_SETTING_KEYS = {
  DISPLAY_SHOW_PUBLISHER: 'display.show_publisher',
  DISPLAY_SHOW_PLAYTIME: 'display.show_playtime',
  DISPLAY_GAMES_PER_FRAME: 'display.games_per_frame',
  DISPLAY_ROTATION_INTERVAL_SECONDS: 'display.rotation_interval_seconds',
  DISPLAY_SELECTION_MODE: 'display.selection_mode',
  DISPLAY_AVOID_RECENT_REPEATS: 'display.avoid_recent_repeats',
  NOTIFICATIONS_EMAIL_OPT_IN: 'notifications.email_opt_in',
} as const;

export type UserSettingKey = (typeof USER_SETTING_KEYS)[keyof typeof USER_SETTING_KEYS];
```

- [ ] **Step 5: Create `platform-settings.ts`**

```ts
export const PLATFORM_SETTING_KEYS = {
  SALES_NEW_ENABLED: 'sales.new_enabled',
  SALES_RENEWALS_ENABLED: 'sales.renewals_enabled',
  SALES_STOP_MESSAGE: 'sales.stop_message',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];
```

- [ ] **Step 6: Create `saas.ts`**

```ts
import { z } from 'zod';
import { selectionModeSchema } from './schemas.js';

export const billingProviderSchema = z.enum(['paypal', 'apple', 'google']);
export type BillingProvider = z.infer<typeof billingProviderSchema>;

export const billingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const subscriptionStatusSchema = z.enum([
  'pending',
  'active',
  'cancelled',
  'expired',
  'past_due',
  'grace_period',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export type User = {
  id: string;
  steamId64: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Plan = {
  id: string;
  name: string;
  deviceLimit: number | null;
};

export type Subscription = {
  id: string;
  userId: string;
  planId: string;
  provider: BillingProvider;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  providerSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
};

export const DEFAULT_USER_DISPLAY_SETTINGS = {
  gamesPerFrame: 3 as const,
  rotationIntervalSeconds: 300,
  selectionMode: 'random' as z.infer<typeof selectionModeSchema>,
  showPublisher: true,
  showPlaytime: false,
  avoidRecentRepeats: true,
};
```

- [ ] **Step 7: Re-export from `index.ts`**

- [ ] **Step 8: Run tests**

```bash
npm run test -w @digital-shelf-saas/shared-types
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(shared-types): add SaaS domain types and setting keys"
```

---

### Task 4: saas-server skeleton + health endpoint

**Files:**
- Create: `apps/saas-server/package.json`, `tsconfig.json`, `src/index.ts`, `src/app.ts`, `src/config/env.ts`, `src/routes/health.ts`, `src/routes/health.test.ts`
- Create: `apps/saas-server/public/.gitkeep`

- [ ] **Step 1: Write failing health test**

Create `apps/saas-server/src/routes/health.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', mode: 'cloud' });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test -w @digital-shelf-saas/server
```

- [ ] **Step 3: Create `package.json` for saas-server**

Copy structure from `../server/apps/open-source-server/package.json`, rename to `@digital-shelf-saas/server`, add dependencies: `@fastify/cookie`, `@fastify/cors`, `@aws-sdk/client-s3`, `bcrypt` or `node:crypto` for token hashing.

- [ ] **Step 4: Create `env.ts`**

Zod schema with `APP_MODE: z.literal('cloud')`, `DATABASE_URL`, `SESSION_SECRET`, `MOBILE_TOKEN_SECRET`, `STEAM_API_KEY`, `SERVER_PUBLIC_URL`, billing vars (optional in dev with defaults for tests).

- [ ] **Step 5: Create `health.ts`**

```ts
import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'ok', mode: 'cloud', version: '0.0.0' });
  });
}
```

- [ ] **Step 6: Create `app.ts` and `index.ts`** (mirror OSS pattern)

- [ ] **Step 7: Run test — expect PASS**

- [ ] **Step 8: Commit**

```bash
git add apps/saas-server/
git commit -m "feat(saas-server): add skeleton with health endpoint"
```

---

### Task 5: Prisma schema + Postgres migration

**Files:**
- Create: `apps/saas-server/prisma/schema.prisma`
- Create: `apps/saas-server/prisma/migrations/`
- Create: `apps/saas-server/prisma/seed.ts`
- Test: `apps/saas-server/src/db/schema.test.ts`

- [ ] **Step 1: Write failing schema smoke test**

```ts
import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

describe('prisma schema', () => {
  it('can query users model', async () => {
    const prisma = new PrismaClient();
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Create `schema.prisma`**

Start from `../server/apps/open-source-server/prisma/schema.prisma`. Changes:

1. `datasource db` → `provider = "postgresql"`
2. Remove `Setting` model
3. Add: `User`, `Session`, `RefreshToken`, `Plan`, `Subscription`, `SubscriptionEvent`, `UserSetting`, `PlatformSetting`
4. Add `userId String` + relation to `Device`, `PlatformAccount`
5. Add `@@map` for all tables

`Plan` seed data IDs: `plan_basic`, `plan_pro`. `deviceLimit`: `1` and `null`.

- [ ] **Step 3: Create `docker-compose.yml` at repo root**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: digitalshelf
      POSTGRES_PASSWORD: digitalshelf
      POSTGRES_DB: digitalshelf
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  saas-server:
    build: ./apps/saas-server
    ports: ["8080:8080"]
    env_file: .env
    depends_on: [postgres]

volumes:
  pgdata:
```

- [ ] **Step 4: Run migration**

```bash
docker compose up -d postgres
# DATABASE_URL=postgresql://digitalshelf:digitalshelf@localhost:5432/digitalshelf
npm run prisma:migrate
```

- [ ] **Step 5: Create `seed.ts`** — insert `plan_basic` and `plan_pro` rows with placeholder PayPal/Apple/Google product IDs from env.

- [ ] **Step 6: Run schema test — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add apps/saas-server/prisma/ docker-compose.yml
git commit -m "feat(saas-server): add Postgres schema and plan seed"
```

---

## Phase P2 — Auth & API skeleton

### Task 6: Session and mobile token services

**Files:**
- Create: `apps/saas-server/src/lib/session.ts`, `apps/saas-server/src/lib/mobile-token.ts`
- Create: `apps/saas-server/src/services/auth-service.ts`
- Test: `apps/saas-server/src/services/auth-service.test.ts`

- [ ] **Step 1: Write failing test for session creation**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAuthService } from './auth-service.js';
import { createId } from '@digital-shelf-saas/shared-types';

describe('auth-service', () => {
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, { sessionTtlDays: 30, mobileAccessTtlMinutes: 60 });

  it('creates session for user', async () => {
    const user = await prisma.user.create({
      data: { id: createId('user'), steamId64: '76561198000000000' },
    });
    const session = await auth.createWebSession(user.id);
    expect(session.id).toMatch(/^sess_/);
    expect(session.userId).toBe(user.id);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement `auth-service.ts`**

Methods:
- `upsertUserBySteamId64(steamId64: string): Promise<User>`
- `createWebSession(userId: string): Promise<Session>`
- `resolveWebSession(sessionId: string): Promise<User | null>`
- `deleteWebSession(sessionId: string): Promise<void>`
- `createMobileTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }>`
- `resolveAccessToken(token: string): Promise<User | null>`
- `rotateRefreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`

Hash refresh tokens with SHA-256 before DB storage.

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

---

### Task 7: Steam OpenID auth routes

**Files:**
- Create: `apps/saas-server/src/routes/auth/steam.ts`, `apps/saas-server/src/routes/auth/exchange.ts`
- Test: `apps/saas-server/src/routes/auth/steam.test.ts`

- [ ] **Step 1: Write failing test** (mock `verifySteamOpenIdCallback` from `@digital-shelf-saas/platform-steam`)

Test `GET /api/auth/steam/callback` with mocked query params → 302 redirect + `Set-Cookie` header containing `ds_session`.

- [ ] **Step 2: Implement routes**

`GET /api/auth/steam/login` — redirect to Steam (requires `STEAM_API_KEY` set in env, not user-provided).

`GET /api/auth/steam/callback` — verify, `upsertUserBySteamId64`, `createWebSession`, set cookie, redirect to `/dashboard` or onboarding path.

`POST /api/auth/steam/exchange` — body `{ code: string }` — one-time auth code from mobile deep link, returns `{ accessToken, refreshToken, expiresIn }`.

- [ ] **Step 3: Run tests — PASS**

- [ ] **Step 4: Commit**

---

### Task 8: Auth + entitlement middleware

**Files:**
- Create: `apps/saas-server/src/middleware/auth.ts`, `apps/saas-server/src/middleware/entitlement.ts`
- Create: `apps/saas-server/src/lib/tenant-context.ts`
- Test: `apps/saas-server/src/middleware/auth.test.ts`

- [ ] **Step 1: Write failing test**

Inject request with `Cookie: ds_session=...` → middleware sets `request.userId`.

Inject `Authorization: Bearer ...` → same.

Missing auth → 401 `{ error: { code: 'UNAUTHORIZED' } }`.

- [ ] **Step 2: Implement middleware**

`authPlugin` registers `request.userId` decorator.

`entitlementPlugin` calls `requireActiveSubscription(userId)` from billing package (stub returning active in test until Task 10).

- [ ] **Step 3: Run tests — PASS**

- [ ] **Step 4: Commit**

---

### Task 9: `/api/v1` skeleton routes

**Files:**
- Create: `apps/saas-server/src/routes/v1/index.ts`, `auth.ts`, `onboarding.ts`
- Create: `packages/device-protocol/src/v1/auth.ts`, `onboarding.ts`
- Test: `apps/saas-server/src/routes/v1/auth.test.ts`

- [ ] **Step 1: Write failing test for `GET /api/v1/auth/me`**

Authenticated request returns `{ user: { id, steamId64, displayName } }`.

- [ ] **Step 2: Implement `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`**

- [ ] **Step 3: Implement `GET /api/v1/onboarding/status`**

Returns:

```json
{
  "hasActiveSubscription": false,
  "hasSyncedLibrary": false,
  "hasClaimedDevice": false,
  "nextStep": "subscribe"
}
```

- [ ] **Step 4: Register v1 routes behind auth middleware in `app.ts`**

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

## Phase P3 — Billing

### Task 10: billing package — entitlements + sales flags

**Files:**
- Create: `packages/billing/package.json`, `src/index.ts`, `src/entitlements.ts`, `src/sales-flags.ts`, `src/types.ts`
- Test: `packages/billing/src/entitlements.test.ts`, `packages/billing/src/sales-flags.test.ts`

- [ ] **Step 1: Write failing entitlement test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEntitlementService } from './entitlements.js';

describe('entitlements', () => {
  it('requireActiveSubscription throws SUBSCRIPTION_REQUIRED when inactive', async () => {
    const prisma = {
      subscription: { findUnique: vi.fn().mockResolvedValue({ status: 'expired', planId: 'plan_basic' }) },
      plan: { findUnique: vi.fn() },
      device: { count: vi.fn() },
    };
    const svc = createEntitlementService(prisma as never);
    await expect(svc.requireActiveSubscription('user_1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('getDeviceLimit returns 1 for basic plan', async () => {
    const prisma = {
      subscription: { findUnique: vi.fn().mockResolvedValue({ status: 'active', planId: 'plan_basic' }) },
      plan: { findUnique: vi.fn().mockResolvedValue({ deviceLimit: 1 }) },
      device: { count: vi.fn() },
    };
    const svc = createEntitlementService(prisma as never);
    await expect(svc.getDeviceLimit('user_1')).resolves.toBe(1);
  });
});
```

- [ ] **Step 2: Implement `entitlements.ts`**

```ts
export function createEntitlementService(prisma: PrismaClient) {
  return {
    async requireActiveSubscription(userId: string) { /* throw if not active */ },
    async getDeviceLimit(userId: string): Promise<number | null> { /* 1 or null */ },
    async canClaimDevice(userId: string): Promise<boolean> { /* count claimed vs limit */ },
  };
}
```

- [ ] **Step 3: Write failing sales-flags test**

When `sales.new_enabled` is `'false'`, `assertNewSalesAllowed()` throws `SALES_DISABLED`.

When `sales.renewals_enabled` is `'false'`, `shouldExtendRenewal()` returns `false`.

- [ ] **Step 4: Implement `sales-flags.ts`** reading from `platform_settings` with env fallback defaults.

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

### Task 11: PayPal subscriptions

**Files:**
- Create: `packages/billing/src/paypal/client.ts`, `webhook.ts`, `map-event.ts`
- Create: `apps/saas-server/src/routes/v1/billing.ts`, `apps/saas-server/src/routes/billing/paypal-webhook.ts`
- Test: `packages/billing/src/paypal/webhook.test.ts`

- [ ] **Step 1: Write failing webhook test**

Simulate `BILLING.SUBSCRIPTION.ACTIVATED` payload → subscription upserted with `status: 'active'`.

Simulate renewal with `sales.renewals_enabled = false` → `currentPeriodEnd` unchanged.

- [ ] **Step 2: Implement PayPal client** — `createSubscription(planId, cycle, returnUrl, cancelUrl)` returns `{ approvalUrl }`.

- [ ] **Step 3: Implement routes**

`GET /api/v1/billing/plans` — plans + `salesFlags`.

`GET /api/v1/billing/status` — current subscription.

`POST /api/v1/billing/paypal/subscribe` — body `{ planId, billingCycle }`, checks `assertNewSalesAllowed()`.

`POST /api/billing/paypal/webhook` — verify signature, log `subscription_events`, update `subscriptions`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

---

### Task 12: Apple IAP verification

**Files:**
- Create: `packages/billing/src/apple/verify.ts`, `webhook.ts`
- Modify: `apps/saas-server/src/routes/v1/billing.ts`
- Test: `packages/billing/src/apple/verify.test.ts`

- [ ] **Step 1: Write failing test** with fixture JWS payload → maps `productId` to `planId`, creates subscription.

- [ ] **Step 2: Implement `verifyApplePurchase(transactionJws: string, userId: string)`**

Use App Store Server API (or mock in unit tests).

- [ ] **Step 3: Add `POST /api/v1/billing/apple/verify`** — Bearer auth, checks `assertNewSalesAllowed()` for new subs.

- [ ] **Step 4: Add `POST /api/billing/apple/webhook`** — parse ASN V2, handle renewals with sales flag.

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

### Task 13: Google Play verification

**Files:**
- Create: `packages/billing/src/google/verify.ts`, `webhook.ts`, `map-purchase.ts`
- Modify: `apps/saas-server/src/routes/v1/billing.ts`
- Test: `packages/billing/src/google/verify.test.ts`

- [ ] **Step 1: Write failing test** with fixture purchase token → maps `productId` to `planId`, creates `subscriptions` row with `provider: 'google'`.

```ts
import { describe, expect, it, vi } from 'vitest';
import { verifyGooglePurchase } from './verify.js';

describe('google verify', () => {
  it('activates subscription for valid purchase token', async () => {
    const playClient = {
      purchases: {
        subscriptions: {
          get: vi.fn().mockResolvedValue({
            data: { paymentState: 1, expiryTimeMillis: String(Date.now() + 86400000) },
          }),
        },
      },
    };
    const result = await verifyGooglePurchase(
      { playClient: playClient as never, productId: 'pro_monthly', purchaseToken: 'tok', userId: 'user_1' },
    );
    expect(result.planId).toBe('plan_pro');
    expect(result.status).toBe('active');
  });
});
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement `verify.ts`** — call Google Play Developer API `purchases.subscriptions.get`, map SKU via `plans` table, upsert subscription.

- [ ] **Step 4: Add `POST /api/v1/billing/google/verify`** — Bearer auth, `assertNewSalesAllowed()` for new subs.

- [ ] **Step 5: Implement `webhook.ts`** — parse RTDN Pub/Sub payload, handle `SUBSCRIPTION_RENEWED` / `SUBSCRIPTION_REVOKED`, respect `sales.renewals_enabled`.

- [ ] **Step 6: Add `POST /api/billing/google/webhook`**

- [ ] **Step 7: Run tests — PASS**

- [ ] **Step 8: Commit**

```bash
git add packages/billing/src/google/ apps/saas-server/src/routes/
git commit -m "feat(billing): add Google Play purchase verification"
```

---

## Phase P4 — Core product (tenant-scoped services)

### Task 14: user-settings-service

**Files:**
- Create: `apps/saas-server/src/services/user-settings-service.ts`
- Test: `apps/saas-server/src/services/user-settings-service.test.ts`

- [ ] **Step 1: Write failing test** — `resolveDisplayDefaults(userId)` returns defaults; after `setSetting`, returns stored value.

- [ ] **Step 2: Implement** — layered resolution per spec (DB → env default → hardcoded).

- [ ] **Step 3: Add `GET/PATCH /api/v1/settings`**

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

---

### Task 15: Port steam-sync-service with tenant scope

**Files:**
- Copy: `../server/apps/open-source-server/src/services/steam-sync-service.ts` → `apps/saas-server/src/services/`
- Copy: `metadata-service.ts`, `library-service.ts`
- Modify: all queries scoped by `userId` / `platformAccountId`
- Test: port `steam-sync-service.test.ts`

- [ ] **Step 1: Copy services and tests from OSS**

- [ ] **Step 2: Replace global settings** — use env `STEAM_API_KEY` + user's `platform_accounts` row (create on first sync from `users.steamId64`).

- [ ] **Step 3: Wrap routes** — `POST /api/v1/library/sync` behind auth + entitlement middleware.

- [ ] **Step 4: Add `GET /api/v1/library`**, `PATCH /api/v1/library/games/:id`

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

### Task 16: Port device-service with tenant scope + device limits

**Files:**
- Copy: `device-service.ts`, `device-auth.ts`, `routes/device/v1/*`, `routes/admin/devices.ts` patterns
- Create: `apps/saas-server/src/routes/v1/devices.ts`
- Test: `device-service.test.ts` + cross-tenant test

- [ ] **Step 1: Copy device service from OSS**

- [ ] **Step 2: Add `userId` to `Device` model operations**

- [ ] **Step 3: On claim** — call `canClaimDevice(userId)`; seed `device_configs` from `user-settings-service.resolveDisplayDefaults(userId)`.

- [ ] **Step 4: Add routes**

`GET /api/v1/devices`, `POST /api/v1/devices/claim`, `GET /api/v1/devices/:id`, `PATCH /api/v1/devices/:id/config`

- [ ] **Step 5: Write cross-tenant test** — user A cannot claim user B's device.

- [ ] **Step 6: Port `/api/device/v1/*`** — token lookup includes `userId` check on frame download.

- [ ] **Step 7: Run tests — PASS**

- [ ] **Step 8: Commit**

---

### Task 17: Port frame-service + storage drivers

**Files:**
- Copy: `frame-service.ts`, `local-frame-storage.ts` from OSS
- Create: `apps/saas-server/src/storage/s3-frame-storage.ts`, `storage/index.ts`
- Test: `local-frame-storage.test.ts`, `s3-frame-storage.test.ts` (mock S3 client)

- [ ] **Step 1: Copy frame service**

- [ ] **Step 2: Implement storage factory** — `FRAME_STORAGE_DRIVER=local|s3` from env.

- [ ] **Step 3: Scope frame queries** by `device.userId`.

- [ ] **Step 4: Gate frame generation** behind entitlement middleware.

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

## Phase P5 — Web UI

### Task 18: saas-web scaffold

**Files:**
- Copy: `../server/apps/open-source-web/` → `apps/saas-web/`
- Modify: package name, API base path `/api/v1`, remove OSS setup API-key flow

- [ ] **Step 1: Copy web app**

```bash
cp -r ../server/apps/open-source-web apps/saas-web
```

Update `package.json` name to `@digital-shelf-saas/web`, `build.outDir` → `../saas-server/public`.

- [ ] **Step 2: Replace `api/client.ts`** — `credentials: 'include'`, base path `/api/v1`.

- [ ] **Step 3: Verify dev proxy** — Vite proxies `/api` → `localhost:8080`.

- [ ] **Step 4: Commit**

---

### Task 19: Auth + subscribe pages

**Files:**
- Create: `apps/saas-web/src/pages/LoginPage.tsx`, `SubscribePage.tsx`
- Modify: `App.tsx`, `SetupGate.tsx` → subscription gate

- [ ] **Step 1: LoginPage** — "Sign in with Steam" → `window.location = '/api/auth/steam/login'`

- [ ] **Step 2: SubscribePage** — fetch `GET /api/v1/billing/plans`, show Basic/Pro cards with monthly/annual toggle, PayPal button calls `POST /api/v1/billing/paypal/subscribe`, redirect to `approvalUrl`.

- [ ] **Step 3: Subscription gate** — if no active sub, redirect to `/subscribe`. Show `salesFlags.stopMessage` banner when `newEnabled === false`.

- [ ] **Step 4: Manual smoke test** — `npm run dev`, visit `/login`.

- [ ] **Step 5: Commit**

---

### Task 20: Library, devices, settings pages

**Files:**
- Modify: `LibraryPage.tsx`, `DevicesPage.tsx`, `SettingsPage.tsx` — use `/api/v1/*` endpoints

- [ ] **Step 1: Remove Steam API key UI** from all pages.

- [ ] **Step 2: LibraryPage** — `GET /api/v1/library`, sync button → `POST /api/v1/library/sync`.

- [ ] **Step 3: DevicesPage** — claim form for web users (manual deviceId + claimCode); show device limit from billing status.

- [ ] **Step 4: SettingsPage** — `GET/PATCH /api/v1/settings` for user display defaults.

- [ ] **Step 5: Commit**

---

## Phase P6 — Ship

### Task 21: Production Dockerfile + integration tests

**Files:**
- Create: `apps/saas-server/Dockerfile`
- Create: `apps/saas-server/src/integration/tenant-isolation.test.ts`

- [ ] **Step 1: Dockerfile** — multi-stage build, `npm run build`, expose 8080, run migrations on start.

- [ ] **Step 2: Tenant isolation integration test** — create two users, two devices, verify cross-access returns 404/403.

- [ ] **Step 3: Full test suite**

```bash
npm run test
npm run build
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: production docker and tenant isolation tests"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Steam OpenID web auth | Task 7 |
| Mobile token exchange | Task 7 |
| PayPal billing | Task 11 |
| Apple IAP | Task 12 |
| Google Play | Task 13 |
| Sales stop flags | Task 10 |
| Basic 1 / Pro unlimited devices | Task 10, 16 |
| `/api/v1` mobile API | Tasks 9, 11–17 |
| Per-user settings | Task 14 |
| Tenant isolation | Tasks 16, 21 |
| ESP32 device API unchanged | Task 16 |
| S3 frame storage | Task 17 |
| Postgres schema | Task 5 |
| Copy packages from OSS | Task 2 |
| Consumer web UI | Tasks 18–20 |

---

## Manual Test Plan (staging)

1. Sign in with Steam on web → session cookie set.
2. Subscribe via PayPal sandbox → `billing/status` shows active.
3. Sync library → games appear in `/library`.
4. Register ESP32 against cloud URL → claim in web → frame displays.
5. Set `sales.new_enabled` to `false` in DB → subscribe button hidden.
6. Mobile: exchange auth code → Bearer token → `GET /api/v1/auth/me` succeeds.
7. iOS sandbox purchase → `POST /api/v1/billing/apple/verify` → subscription active.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-saas-premium.md`.
