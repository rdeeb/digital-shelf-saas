# Auth Identity Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Digital Shelf's internal account (`User`) from provider authentication identity by adding a new `AuthIdentity` model for Google/Apple sign-in, making `User.passwordHash` optional, and removing `User.steamId64` so Steam is stored exclusively as a tenant-owned `PlatformAccount`, with all resolution/linking rules enforced server-side and fail-closed.

**Architecture:** Additive Prisma model (`AuthIdentity`) plus a destructive pre-production migration that drops `users.steamId64` and relaxes `users.passwordHash` to nullable. A new `auth-identity-service.ts` owns provider-identity resolution/linking with stable domain result types and DB-unique-constraint-backed concurrency safety. `auth-service.ts`, Steam routes, `steam-sync-service.ts`, and `billing.ts` are refactored to read/write Steam identity only through `PlatformAccount`. Shared contracts (`shared-types`, `device-protocol`, `saas-web` types) and `/api/v1/auth/me` are updated to expose only safe status fields. This task does not add Google/Apple OAuth routes — only the schema, services, and refactors those routes will later depend on.

**Tech Stack:** Node.js 20+, TypeScript, Fastify, Prisma 6 + PostgreSQL, Zod, Vitest, Turborepo workspaces

## Global Constraints

- `User.passwordHash` is nullable so Google/Apple-only accounts require no password.
- `User.email` remains required and unique; canonical account email is stored normalized lowercase (trim + toLowerCase).
- A social-only account uses the provider's verified email as its initial account email. Apple's private-relay email is valid.
- Adding Google or Apple to an existing account does not create a second `User`.
- `AuthIdentity` provider is limited to `google | apple`; `(provider, providerSubject)` is globally unique; `(userId, provider)` is unique (one Google + one Apple per account for MVP); deleting a `User` cascades to its `AuthIdentity` rows.
- Raw ID tokens, access tokens, refresh tokens, authorization codes, nonces, and complete provider claim payloads are never persisted in `AuthIdentity`.
- Resolve an existing account by `provider + providerSubject` first; provider email changes must never change ownership.
- For a previously unseen provider subject, automatic linking is permitted only when the provider email is verified and uniquely matches the normalized email of an existing `User`.
- If the email is unverified, missing, ambiguous, or the existing user already has a different identity for that provider, do not auto-link — return a stable collision/reauthentication-required domain result, never leak account existence.
- A provider subject already linked to another user must never be moved or relinked automatically.
- Linking APIs accept only verified provider data produced server-side; they never accept a client-supplied internal `userId` on a public endpoint.
- Concurrent first-login/link attempts must converge on one identity/account or fail safely — never create duplicate tenants.
- Remove `User.steamId64`, `upsertUserBySteamId64`, and the `@steam.placeholder.local` account-creation behavior entirely.
- Steam identity is stored only as `PlatformAccount { platform: 'steam', externalId: steamId64 }`, scoped by server-derived `userId`.
- A bare Steam callback (no completion token) must never create a `User`.
- Steam relinking must reject an external Steam ID already owned by another user and must not modify either tenant's data when it does.
- No Google/Apple OAuth redirects, callbacks, native credential exchange, provider SDK/client configuration, provider token/claim validation, or login/linking UI in this task.
- Pre-production: destructive clean migration is acceptable; no data preservation or backfill logic is needed.
- Identity from verified auth context only — never accept client-supplied `userId`; scope all tenant-owned Prisma queries by `userId`; fail closed on any ownership conflict.

## File Structure

| Path | Responsibility |
| --- | --- |
| `apps/saas-server/prisma/schema.prisma` | `AuthIdentity` model, `AuthProvider` enum, nullable `passwordHash`, removed `steamId64` |
| `apps/saas-server/prisma/migrations/20260805120000_separate_auth_and_platform_identities/migration.sql` | Destructive migration: drop `steamId64`, nullable `passwordHash`, create `auth_identities` |
| `packages/shared-types/src/ids.ts` | Adds `authIdentity: 'authid'` id prefix |
| `apps/saas-server/src/db/schema.test.ts` | Schema-level constraint/cascade tests for `AuthIdentity` |
| `apps/saas-server/src/services/auth-identity-service.ts` | `normalizeEmail`, `createAuthIdentityService`, resolve/link domain logic |
| `apps/saas-server/src/services/auth-identity-service.test.ts` | Resolve/link/collision/concurrency/tenant tests |
| `apps/saas-server/src/services/auth-service.ts` | Refactored: nullable password, normalized email, Steam via `PlatformAccount`, no `upsertUserBySteamId64` |
| `apps/saas-server/src/services/auth-service.test.ts` | Updated login/activation/relink tests |
| `apps/saas-server/src/routes/auth/steam.ts` | Bare callback/mobile-callback no longer create users; completion flow uses refactored `auth-service` |
| `apps/saas-server/src/routes/auth/steam.test.ts` | Updated + new bare-callback and ownership-conflict tests |
| `apps/saas-server/src/services/steam-sync-service.ts` | Reads Steam identity only from `PlatformAccount` |
| `apps/saas-server/src/services/steam-sync-service.test.ts` | Updated fixtures for `PlatformAccount`-only Steam identity |
| `apps/saas-server/src/routes/v1/billing.ts` | `assertSteamLinked` reads `PlatformAccount`, not `User.steamId64` |
| `apps/saas-server/src/routes/v1/billing.test.ts` | Updated fixtures |
| `apps/saas-server/src/routes/v1/index.ts` | `/api/v1/auth/me` returns safe status only |
| `apps/saas-server/src/routes/v1/auth.test.ts` | Route contract tests for the new `/auth/me` shape |
| `packages/shared-types/src/saas.ts` | `User` type no longer exposes `steamId64` |
| `packages/device-protocol/src/v1/auth.ts` | `authMeResponseSchema` updated to safe status shape |
| `apps/saas-web/src/api/types.ts` | `AuthMeResponse` updated to safe status shape |
| `apps/saas-server/src/test-support/user-fixtures.ts` | Shared `createTestUser` helper (User + optional Steam `PlatformAccount`) |
| `apps/saas-server/src/routes/v1/settings.test.ts`, `.../auth/account.test.ts`, `.../services/user-settings-service.test.ts`, `.../integration/tenant-isolation.test.ts`, `.../services/device-service.test.ts`, `.../middleware/auth.test.ts`, `.../routes/v1/devices-frame.test.ts` | Fixture cleanup: use `createTestUser`, drop `steamId64` |
| `README.md`, `AGENTS.md` | Document the new identity model boundary |

---

### Task 1: Prisma schema, migration, and id prefix

**Files:**
- Modify: `apps/saas-server/prisma/schema.prisma`
- Create: `apps/saas-server/prisma/migrations/20260805120000_separate_auth_and_platform_identities/migration.sql`
- Modify: `packages/shared-types/src/ids.ts`

**Interfaces:**
- Produces: `ID_PREFIX.authIdentity = 'authid'`, Prisma models `AuthIdentity` and enum `AuthProvider` (`'google' | 'apple'`), `User.passwordHash: String?`, `User.authIdentities: AuthIdentity[]`.

- [ ] **Step 1: Ensure local Postgres is running**

```bash
docker compose up -d postgres
```

Expected: `postgres` container reports healthy (or already running).

- [ ] **Step 2: Edit `User` model in `apps/saas-server/prisma/schema.prisma`**

Replace:

```prisma
model User {
  id              String   @id
  email           String   @unique
  passwordHash    String
  emailVerifiedAt DateTime?
  activationState String   @default("account_created")
  steamId64       String?  @unique
  displayName     String?
  avatarUrl       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  sessions          Session[]
  refreshTokens     RefreshToken[]
  completionTokens  AccountCompletionToken[]
  platformAccounts  PlatformAccount[]
  devices           Device[]
  subscription      Subscription?
  userSettings      UserSetting[]

  @@map("users")
}
```

With:

```prisma
model User {
  id              String    @id
  email           String    @unique
  passwordHash    String?
  emailVerifiedAt DateTime?
  activationState String    @default("account_created")
  displayName     String?
  avatarUrl       String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sessions          Session[]
  refreshTokens     RefreshToken[]
  completionTokens  AccountCompletionToken[]
  platformAccounts  PlatformAccount[]
  authIdentities    AuthIdentity[]
  devices           Device[]
  subscription      Subscription?
  userSettings      UserSetting[]

  @@map("users")
}
```

- [ ] **Step 3: Add the `AuthProvider` enum and `AuthIdentity` model**

Insert immediately after the `User` model in `apps/saas-server/prisma/schema.prisma`:

```prisma
enum AuthProvider {
  google
  apple
}

model AuthIdentity {
  id              String       @id
  userId          String
  provider        AuthProvider
  providerSubject String
  email           String?
  emailVerifiedAt DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSubject])
  @@unique([userId, provider])
  @@map("auth_identities")
}
```

- [ ] **Step 4: Add the `authIdentity` id prefix**

In `packages/shared-types/src/ids.ts`, update `ID_PREFIX`:

```ts
export const ID_PREFIX = {
  game: 'game',
  userGame: 'ug',
  platformAccount: 'plat',
  device: 'dev',
  frame: 'frame',
  sync: 'sync',
  metadata: 'meta',
  err: 'err',
  user: 'user',
  session: 'sess',
  sub: 'sub',
  subEvent: 'subev',
  authCode: 'acode',
  authIdentity: 'authid',
} as const;
```

- [ ] **Step 5: Create the migration file**

Create `apps/saas-server/prisma/migrations/20260805120000_separate_auth_and_platform_identities/migration.sql`:

```sql
-- DropIndex
DROP INDEX "users_steamId64_key";

-- AlterTable
ALTER TABLE "users"
    DROP COLUMN "steamId64",
    ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('google', 'apple');

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_providerSubject_key" ON "auth_identities"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_userId_provider_key" ON "auth_identities"("userId", "provider");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: Generate the Prisma client**

```bash
npm run prisma:generate -w @digital-shelf-saas/server
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 7: Apply the migration to local Postgres**

```bash
npm run prisma:migrate
```

Expected: Prisma reports the new `separate_auth_and_platform_identities` migration folder as already present and applies it (no new migration is generated, since the schema now matches the hand-written SQL exactly).

- [ ] **Step 8: Confirm the existing schema smoke test still passes**

```bash
npm run test -w @digital-shelf-saas/server -- src/db/schema.test.ts
```

Expected: PASS (existing tests still provide a `passwordHash`, so nullability doesn't break them).

Note: many other test files still reference the now-removed `steamId64` field and will fail at runtime with a Prisma validation error until Task 9. This is expected and resolved incrementally through Task 9.

- [ ] **Step 9: Commit**

```bash
git add apps/saas-server/prisma/schema.prisma apps/saas-server/prisma/migrations/20260805120000_separate_auth_and_platform_identities packages/shared-types/src/ids.ts
git commit -m "$(cat <<'EOF'
feat(schema): add AuthIdentity model and drop User.steamId64

Introduces the provider-identity model (Google/Apple) separate from
Steam, makes passwordHash nullable for social-only accounts, and
removes steamId64 so Steam identity lives only in PlatformAccount.
EOF
)"
```

---

### Task 2: Schema constraint and cascade tests for `AuthIdentity`

**Files:**
- Modify: `apps/saas-server/src/db/schema.test.ts`

**Interfaces:**
- Consumes: `prisma.authIdentity` (from Task 1), `createId('authIdentity')`, `createId('user')`.

- [ ] **Step 1: Add the following tests to `apps/saas-server/src/db/schema.test.ts`** (inside the existing `describe('prisma schema', ...)` block, after the existing tests)

```ts
  it('creates a social-only user with a null password hash', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-social@example.com`,
        passwordHash: null,
        activationState: 'pending_activation',
      },
    });

    expect(user.passwordHash).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('attaches Google and Apple identities to the same user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dual-provider@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `google-sub-${Date.now()}`,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'apple',
        providerSubject: `apple-sub-${Date.now()}`,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });

    const identities = await prisma.authIdentity.findMany({ where: { userId: user.id } });
    expect(identities).toHaveLength(2);
    expect(identities.map((identity) => identity.provider).sort()).toEqual(['apple', 'google']);

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects duplicate provider + providerSubject across different users', async () => {
    const subject = `dup-sub-${Date.now()}`;
    const userA = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dup-a@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-dup-b@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: userA.id,
        provider: 'google',
        providerSubject: subject,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await expect(
      prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: userB.id,
          provider: 'google',
          providerSubject: subject,
          email: null,
          emailVerifiedAt: null,
        },
      }),
    ).rejects.toThrow();

    await prisma.authIdentity.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('rejects two subjects for the same userId + provider', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-same-provider@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `sub-1-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await expect(
      prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: user.id,
          provider: 'google',
          providerSubject: `sub-2-${Date.now()}`,
          email: null,
          emailVerifiedAt: null,
        },
      }),
    ).rejects.toThrow();

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('cascades auth identity deletion when the user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-cascade@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `cascade-sub-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.authIdentity.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests**

```bash
npm run test -w @digital-shelf-saas/server -- src/db/schema.test.ts
```

Expected: PASS (5 new tests + 2 existing).

- [ ] **Step 3: Commit**

```bash
git add apps/saas-server/src/db/schema.test.ts
git commit -m "$(cat <<'EOF'
test(schema): cover AuthIdentity constraints and cascade delete

Verifies null-password social accounts, dual Google+Apple linking,
the provider+subject and userId+provider unique constraints, and
cascade deletion when a User is removed.
EOF
)"
```

---

### Task 3: `auth-identity-service.ts` — resolve/link core logic

**Files:**
- Create: `apps/saas-server/src/services/auth-identity-service.ts`
- Create: `apps/saas-server/src/services/auth-identity-service.test.ts`

**Interfaces:**
- Consumes: `prisma.authIdentity`, `prisma.user`, `createId('authIdentity')`, `createId('user')` (Task 1).
- Produces:
  ```typescript
  export type AuthProvider = 'google' | 'apple';

  export type AuthIdentityResolveResult =
    | { kind: 'resolved'; userId: string }
    | { kind: 'linked'; userId: string; created: boolean }
    | { kind: 'created'; userId: string }
    | { kind: 'collision'; reason: 'unverified_email' | 'missing_email' | 'ambiguous_email' | 'provider_already_linked' | 'subject_owned_by_other_user' };

  export type LinkVerifiedProviderInput = {
    provider: AuthProvider;
    providerSubject: string;
    email: string | null;
    emailVerified: boolean;
    userId?: string;
  };

  export function normalizeEmail(email: string): string;
  export function createAuthIdentityService(prisma: PrismaClient): {
    resolveOrLinkProviderIdentity(input: LinkVerifiedProviderInput): Promise<AuthIdentityResolveResult>;
  };
  export type AuthIdentityService = ReturnType<typeof createAuthIdentityService>;
  ```
  These are consumed by Task 4 (more tests) and Task 5 (`auth-service.ts` imports `normalizeEmail`).

- [ ] **Step 1: Write the failing test file**

Create `apps/saas-server/src/services/auth-identity-service.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { createAuthIdentityService } from './auth-identity-service.js';

describe('auth-identity-service', () => {
  const prisma = new PrismaClient();
  const service = createAuthIdentityService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves the original user by provider subject even when the provider email changes', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-subject-stable@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    const subject = `stable-sub-${Date.now()}`;
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: subject,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: subject,
      email: 'a-completely-different-email@example.com',
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'resolved', userId: user.id });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('auto-links a new subject when the verified email uniquely matches an existing user', async () => {
    const email = `${Date.now()}-autolink@example.com`;
    const user = await prisma.user.create({
      data: { id: createId('user'), email, passwordHash: 'existing-hash', activationState: 'active' },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `new-sub-${Date.now()}`,
      email: `  ${email.toUpperCase()}  `,
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'linked', userId: user.id, created: true });
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
    });
    expect(identity.email).toBe(email);

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('does not auto-link when the provider email is missing or unverified', async () => {
    const missingEmailResult = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `missing-email-sub-${Date.now()}`,
      email: null,
      emailVerified: false,
    });
    expect(missingEmailResult).toEqual({ kind: 'collision', reason: 'missing_email' });

    const unverifiedResult = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `unverified-sub-${Date.now()}`,
      email: `${Date.now()}-unverified@example.com`,
      emailVerified: false,
    });
    expect(unverifiedResult).toEqual({ kind: 'collision', reason: 'unverified_email' });
  });

  it('creates a new social-only account when no existing user matches the verified email', async () => {
    const email = `${Date.now()}-brand-new@example.com`;

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: `brand-new-sub-${Date.now()}`,
      email,
      emailVerified: true,
    });

    expect(result.kind).toBe('created');
    const userId = (result as { kind: 'created'; userId: string }).userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBeNull();
    expect(user.activationState).toBe('pending_activation');

    await prisma.authIdentity.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/auth-identity-service.test.ts
```

Expected: FAIL — `Cannot find module './auth-identity-service.js'`.

- [ ] **Step 3: Implement `apps/saas-server/src/services/auth-identity-service.ts`**

```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';

export type AuthProvider = 'google' | 'apple';

export type AuthIdentityResolveResult =
  | { kind: 'resolved'; userId: string }
  | { kind: 'linked'; userId: string; created: boolean }
  | { kind: 'created'; userId: string }
  | {
      kind: 'collision';
      reason:
        | 'unverified_email'
        | 'missing_email'
        | 'ambiguous_email'
        | 'provider_already_linked'
        | 'subject_owned_by_other_user';
    };

export type LinkVerifiedProviderInput = {
  provider: AuthProvider;
  providerSubject: string;
  email: string | null;
  emailVerified: boolean;
  /** When set, link to this already-authenticated user (server-derived). When unset, resolve/create by subject then verified email. */
  userId?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function createAuthIdentityService(prisma: PrismaClient) {
  async function linkToExistingUser(
    userId: string,
    provider: AuthProvider,
    providerSubject: string,
    email: string | null,
    emailVerified: boolean,
  ): Promise<AuthIdentityResolveResult> {
    const bySubject = await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider, providerSubject } },
    });
    if (bySubject) {
      return bySubject.userId === userId
        ? { kind: 'resolved', userId }
        : { kind: 'collision', reason: 'subject_owned_by_other_user' };
    }

    const byProvider = await prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (byProvider) {
      return { kind: 'collision', reason: 'provider_already_linked' };
    }

    try {
      await prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId,
          provider,
          providerSubject,
          email: email ? normalizeEmail(email) : null,
          emailVerifiedAt: emailVerified ? new Date() : null,
        },
      });
      return { kind: 'linked', userId, created: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return linkToExistingUser(userId, provider, providerSubject, email, emailVerified);
      }
      throw error;
    }
  }

  async function resolveOrCreate(
    provider: AuthProvider,
    providerSubject: string,
    email: string | null,
    emailVerified: boolean,
  ): Promise<AuthIdentityResolveResult> {
    const existing = await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider, providerSubject } },
    });
    if (existing) {
      return { kind: 'resolved', userId: existing.userId };
    }

    if (!email) {
      return { kind: 'collision', reason: 'missing_email' };
    }
    if (!emailVerified) {
      return { kind: 'collision', reason: 'unverified_email' };
    }

    const normalizedEmail = normalizeEmail(email);
    const matches = await prisma.user.findMany({ where: { email: normalizedEmail } });

    if (matches.length > 1) {
      return { kind: 'collision', reason: 'ambiguous_email' };
    }

    try {
      if (matches.length === 0) {
        const userId = createId('user');
        await prisma.$transaction([
          prisma.user.create({
            data: {
              id: userId,
              email: normalizedEmail,
              passwordHash: null,
              activationState: 'pending_activation',
            },
          }),
          prisma.authIdentity.create({
            data: {
              id: createId('authIdentity'),
              userId,
              provider,
              providerSubject,
              email: normalizedEmail,
              emailVerifiedAt: new Date(),
            },
          }),
        ]);
        return { kind: 'created', userId };
      }

      const matchedUser = matches[0];
      const alreadyLinked = await prisma.authIdentity.findUnique({
        where: { userId_provider: { userId: matchedUser.id, provider } },
      });
      if (alreadyLinked) {
        return { kind: 'collision', reason: 'provider_already_linked' };
      }

      await prisma.authIdentity.create({
        data: {
          id: createId('authIdentity'),
          userId: matchedUser.id,
          provider,
          providerSubject,
          email: normalizedEmail,
          emailVerifiedAt: new Date(),
        },
      });
      return { kind: 'linked', userId: matchedUser.id, created: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return resolveOrCreate(provider, providerSubject, email, emailVerified);
      }
      throw error;
    }
  }

  return {
    async resolveOrLinkProviderIdentity(
      input: LinkVerifiedProviderInput,
    ): Promise<AuthIdentityResolveResult> {
      if (input.userId) {
        return linkToExistingUser(
          input.userId,
          input.provider,
          input.providerSubject,
          input.email,
          input.emailVerified,
        );
      }
      return resolveOrCreate(input.provider, input.providerSubject, input.email, input.emailVerified);
    },
  };
}

export type AuthIdentityService = ReturnType<typeof createAuthIdentityService>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/auth-identity-service.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/saas-server/src/services/auth-identity-service.ts apps/saas-server/src/services/auth-identity-service.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add auth-identity-service resolve/link core logic

Resolves by provider+subject first (email changes never move
ownership), auto-links a new subject only on a unique verified-email
match, and otherwise creates a new social-only account.
EOF
)"
```

---

### Task 4: `auth-identity-service.ts` — collision, concurrency, and tenant tests

**Files:**
- Modify: `apps/saas-server/src/services/auth-identity-service.test.ts`

**Interfaces:**
- Consumes: `AuthIdentityService`, `LinkVerifiedProviderInput` (Task 3). No source changes — the branches under test are already implemented in Task 3.

- [ ] **Step 1: Append the following tests to `apps/saas-server/src/services/auth-identity-service.test.ts`** (inside the existing `describe` block)

```ts
  it('does not auto-link when the matched user already has a different identity for the provider', async () => {
    const email = `${Date.now()}-already-has-google@example.com`;
    const user = await prisma.user.create({
      data: { id: createId('user'), email, passwordHash: null, activationState: 'active' },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `original-sub-${Date.now()}`,
        email,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `impostor-sub-${Date.now()}`,
      email,
      emailVerified: true,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'provider_already_linked' });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns collision when linking mode targets a user who already has a different subject for the provider', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-existing-google@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `first-sub-${Date.now()}`,
        email: null,
        emailVerifiedAt: null,
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'google',
      providerSubject: `second-sub-${Date.now()}`,
      email: null,
      emailVerified: false,
      userId: user.id,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'provider_already_linked' });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('never moves a provider subject from one user to another', async () => {
    const subject = `owned-sub-${Date.now()}`;
    const userA = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-owner@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: userA.id,
        provider: 'apple',
        providerSubject: subject,
        email: null,
        emailVerifiedAt: null,
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-intruder@example.com`,
        passwordHash: null,
        activationState: 'active',
      },
    });

    const result = await service.resolveOrLinkProviderIdentity({
      provider: 'apple',
      providerSubject: subject,
      email: null,
      emailVerified: false,
      userId: userB.id,
    });

    expect(result).toEqual({ kind: 'collision', reason: 'subject_owned_by_other_user' });
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_providerSubject: { provider: 'apple', providerSubject: subject } },
    });
    expect(identity.userId).toBe(userA.id);

    await prisma.authIdentity.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('converges concurrent first-login attempts for the same subject on a single account', async () => {
    const subject = `concurrent-sub-${Date.now()}`;
    const email = `${Date.now()}-concurrent@example.com`;

    const [resultA, resultB] = await Promise.all([
      service.resolveOrLinkProviderIdentity({
        provider: 'google',
        providerSubject: subject,
        email,
        emailVerified: true,
      }),
      service.resolveOrLinkProviderIdentity({
        provider: 'google',
        providerSubject: subject,
        email,
        emailVerified: true,
      }),
    ]);

    const userIds = new Set(
      [resultA, resultB].map((result) => ('userId' in result ? result.userId : null)),
    );
    expect(userIds.size).toBe(1);
    expect(userIds.has(null)).toBe(false);

    const userId = [...userIds][0] as string;
    const identities = await prisma.authIdentity.findMany({
      where: { provider: 'google', providerSubject: subject },
    });
    expect(identities).toHaveLength(1);
    const users = await prisma.user.findMany({ where: { id: userId } });
    expect(users).toHaveLength(1);

    await prisma.authIdentity.deleteMany({ where: { providerSubject: subject } });
    await prisma.user.delete({ where: { id: userId } });
  });
```

- [ ] **Step 2: Run the full file**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/auth-identity-service.test.ts
```

Expected: PASS (8/8). No source changes were needed — Task 3's implementation already handles these branches; this step adds regression coverage for them.

- [ ] **Step 3: Commit**

```bash
git add apps/saas-server/src/services/auth-identity-service.test.ts
git commit -m "$(cat <<'EOF'
test(auth): cover identity collision, concurrency, and tenant cases

Adds coverage for provider-already-linked collisions in both linking
modes, cross-tenant subject theft protection, and concurrent
first-login convergence on a single account.
EOF
)"
```

---

### Task 5: Refactor `auth-service.ts` to `PlatformAccount`-based Steam identity

**Files:**
- Modify: `apps/saas-server/src/services/auth-service.ts`
- Modify: `apps/saas-server/src/services/auth-service.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail` (Task 3), `resetSteamLibraryForUser` (existing, from `steam-sync-service.js`).
- Produces: `export class SteamIdOwnedError extends Error { readonly code = 'STEAM_ID_OWNED' }`, consumed by Task 6 (`steam.ts`).
- Removes: `upsertUserBySteamId64` (no longer exported).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/saas-server/src/services/auth-service.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { createAuthService, SteamIdOwnedError } from './auth-service.js';

describe('auth-service', () => {
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(overrides: Partial<User> = {}) {
    return prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-${Math.random()}@example.com`,
        passwordHash: 'placeholder-password-hash',
        activationState: 'active',
        ...overrides,
      },
    });
  }

  async function linkSteamAccount(userId: string, externalId: string) {
    return prisma.platformAccount.create({
      data: { id: createId('platformAccount'), userId, platform: 'steam', externalId },
    });
  }

  it('creates session for user', async () => {
    const user = await createUser();
    const session = await auth.createWebSession(user.id);
    expect(session.id).toMatch(/^sess_/);
    expect(session.userId).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('resolves web session to user', async () => {
    const user = await createUser();
    const session = await auth.createWebSession(user.id);
    const resolved = await auth.resolveWebSession(session.id);
    expect(resolved?.id).toBe(user.id);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('issues and resolves mobile access token', async () => {
    const user = await createUser();
    const tokens = await auth.createMobileTokens(user.id);
    const resolved = await auth.resolveAccessToken(tokens.accessToken);
    expect(resolved?.id).toBe(user.id);
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns completion-required for password login without a linked steam account', async () => {
    const user = await createUser({
      email: `${Date.now()}-pending@example.com`,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'pending_activation',
    });

    const result = await auth.loginWithPassword(user.email, 'hunter2');

    expect(result).toEqual({
      kind: 'completion_required',
      userId: user.id,
      completionToken: expect.any(String),
    });

    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('creates full tokens for active accounts with a linked steam platform account', async () => {
    const user = await createUser({
      email: `${Date.now()}-active@example.com`,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'active',
    });
    await linkSteamAccount(user.id, `${Date.now()}76561198000000123`);

    const result = await auth.loginWithPassword(user.email, 'hunter2');
    expect(result.kind).toBe('authenticated');

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns the same invalid-credentials error for a social-only account as for an unknown email', async () => {
    const socialUser = await createUser({
      email: `${Date.now()}-social-only@example.com`,
      passwordHash: null,
      activationState: 'pending_activation',
    });

    await expect(auth.loginWithPassword(socialUser.email, 'anything')).rejects.toThrow(
      'INVALID_CREDENTIALS',
    );
    await expect(
      auth.loginWithPassword(`${Date.now()}-does-not-exist@example.com`, 'anything'),
    ).rejects.toThrow('INVALID_CREDENTIALS');

    await prisma.user.delete({ where: { id: socialUser.id } });
  });

  it('normalizes email case and surrounding whitespace on login', async () => {
    const email = `${Date.now()}-normalize@example.com`;
    const user = await createUser({
      email,
      passwordHash: await auth.hashPassword('hunter2'),
      activationState: 'active',
    });
    await linkSteamAccount(user.id, `${Date.now()}76561198000000456`);

    const result = await auth.loginWithPassword(`  ${email.toUpperCase()}  `, 'hunter2');
    expect(result.kind).toBe('authenticated');

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('activation creates exactly one tenant-scoped steam platform account', async () => {
    const user = await createUser({
      email: `${Date.now()}-activate@example.com`,
      activationState: 'pending_activation',
    });
    const steamId64 = `${Date.now()}76561198000000789`;

    const activated = await auth.activateAccountWithSteam(user.id, steamId64);
    expect(activated.activationState).toBe('active');

    const accounts = await prisma.platformAccount.findMany({
      where: { userId: user.id, platform: 'steam' },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].externalId).toBe(steamId64);

    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('fails closed and preserves the original owner when a steam id is already linked', async () => {
    const owner = await createUser({ email: `${Date.now()}-owner@example.com` });
    const steamId64 = `${Date.now()}76561198000000999`;
    await linkSteamAccount(owner.id, steamId64);

    const intruder = await createUser({
      email: `${Date.now()}-intruder@example.com`,
      activationState: 'pending_activation',
    });

    await expect(auth.activateAccountWithSteam(intruder.id, steamId64)).rejects.toThrow(
      SteamIdOwnedError,
    );

    const ownerAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: owner.id, platform: 'steam' } },
    });
    expect(ownerAccount.externalId).toBe(steamId64);
    const intruderAccounts = await prisma.platformAccount.findMany({ where: { userId: intruder.id } });
    expect(intruderAccounts).toHaveLength(0);
    const refreshedIntruder = await prisma.user.findUniqueOrThrow({ where: { id: intruder.id } });
    expect(refreshedIntruder.activationState).toBe('pending_activation');

    await prisma.platformAccount.deleteMany({ where: { userId: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/auth-service.test.ts
```

Expected: FAIL — `SteamIdOwnedError` is not exported, and `activateAccountWithSteam`/`loginWithPassword` still read `user.steamId64`.

- [ ] **Step 3: Replace the full contents of `apps/saas-server/src/services/auth-service.ts`**

```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AccountCompletionToken, PrismaClient, Session, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';
import { generateToken, hashToken } from '../lib/crypto.js';
import { normalizeEmail } from './auth-identity-service.js';
import { resetSteamLibraryForUser } from './steam-sync-service.js';

export type AuthServiceConfig = {
  sessionTtlDays: number;
  mobileAccessTtlMinutes: number;
  mobileRefreshTtlDays: number;
  mobileTokenSecret: string;
};

type PendingAuthCode = {
  userId: string;
  expiresAt: number;
};

const pendingAuthCodes = new Map<string, PendingAuthCode>();

export type PasswordLoginResult =
  | {
      kind: 'authenticated';
      user: User;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { kind: 'completion_required'; userId: string; completionToken: string };

export class SteamIdOwnedError extends Error {
  readonly code = 'STEAM_ID_OWNED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SteamIdOwnedError';
  }
}

type PlatformAccountDb = Pick<PrismaClient, 'platformAccount'>;

function sessionExpiresAt(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

function signAccessToken(userId: string, secret: string, ttlMinutes: number): string {
  const exp = Date.now() + ttlMinutes * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAccessToken(token: string, secret: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId: string;
      exp: number;
    };
    if (parsed.exp < Date.now()) {
      return null;
    }
    return parsed.userId;
  } catch {
    return null;
  }
}

function hashPasswordValue(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function assertSteamIdAvailable(
  db: PlatformAccountDb,
  steamId64: string,
  userId: string,
): Promise<void> {
  const ownedByOther = await db.platformAccount.findFirst({
    where: { platform: 'steam', externalId: steamId64, NOT: { userId } },
  });
  if (ownedByOther) {
    throw new SteamIdOwnedError(
      'That Steam account is already linked to another Digital Shelf account.',
    );
  }
}

async function upsertSteamPlatformAccount(
  db: PlatformAccountDb,
  userId: string,
  steamId64: string,
) {
  await assertSteamIdAvailable(db, steamId64, userId);
  try {
    return await db.platformAccount.upsert({
      where: { userId_platform: { userId, platform: 'steam' } },
      create: { id: createId('platformAccount'), userId, platform: 'steam', externalId: steamId64 },
      update: { externalId: steamId64 },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SteamIdOwnedError(
        'That Steam account is already linked to another Digital Shelf account.',
      );
    }
    throw error;
  }
}

export function createAuthService(prisma: PrismaClient, config: AuthServiceConfig) {
  return {
    async hashPassword(password: string): Promise<string> {
      return hashPasswordValue(password);
    },

    async createPendingUser(email: string, password: string): Promise<User> {
      return prisma.user.create({
        data: {
          id: createId('user'),
          email: normalizeEmail(email),
          passwordHash: hashPasswordValue(password),
          activationState: 'pending_activation',
        },
      });
    },

    async createWebSession(userId: string): Promise<Session> {
      return prisma.session.create({
        data: {
          id: createId('session'),
          userId,
          expiresAt: sessionExpiresAt(config.sessionTtlDays),
        },
      });
    },

    async resolveWebSession(sessionId: string): Promise<User | null> {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date()) {
        if (session) {
          await prisma.session.delete({ where: { id: sessionId } });
        }
        return null;
      }
      return session.user;
    },

    async deleteWebSession(sessionId: string): Promise<void> {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async createMobileTokens(
      userId: string,
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
      const accessToken = signAccessToken(
        userId,
        config.mobileTokenSecret,
        config.mobileAccessTtlMinutes,
      );
      const refreshToken = generateToken();
      await prisma.refreshToken.create({
        data: {
          id: createId('session'),
          userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: sessionExpiresAt(config.mobileRefreshTtlDays),
        },
      });
      return {
        accessToken,
        refreshToken,
        expiresIn: config.mobileAccessTtlMinutes * 60,
      };
    },

    async resolveAccessToken(token: string): Promise<User | null> {
      const userId = verifyAccessToken(token, config.mobileTokenSecret);
      if (!userId) {
        return null;
      }
      return prisma.user.findUnique({ where: { id: userId } });
    },

    async rotateRefreshToken(
      refreshToken: string,
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
      const tokenHash = hashToken(refreshToken);
      const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!existing || existing.expiresAt < new Date()) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }
      await prisma.refreshToken.delete({ where: { id: existing.id } });
      return this.createMobileTokens(existing.userId);
    },

    async createCompletionToken(userId: string, purpose: string): Promise<string> {
      const token = generateToken();
      await prisma.accountCompletionToken.create({
        data: {
          id: createId('session'),
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return token;
    },

    async assertCompletionTokenAvailable(token: string, purpose: string): Promise<AccountCompletionToken | null> {
      const existing = await prisma.accountCompletionToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!existing || existing.purpose !== purpose || existing.consumedAt || existing.expiresAt < new Date()) {
        return null;
      }
      return existing;
    },

    async consumeCompletionToken(token: string, purpose: string): Promise<AccountCompletionToken | null> {
      const existing = await prisma.accountCompletionToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!existing || existing.purpose !== purpose || existing.consumedAt || existing.expiresAt < new Date()) {
        return null;
      }
      return prisma.accountCompletionToken.update({
        where: { id: existing.id },
        data: { consumedAt: new Date() },
      });
    },

    async activateAccountWithSteam(userId: string, steamId64: string): Promise<User> {
      await prisma.$transaction(async (tx) => {
        await upsertSteamPlatformAccount(tx, userId, steamId64);
        await tx.user.update({ where: { id: userId }, data: { activationState: 'active' } });
      });
      return prisma.user.findUniqueOrThrow({ where: { id: userId } });
    },

    async relinkSteamAccount(userId: string, steamId64: string): Promise<User> {
      await prisma.$transaction(async (tx) => {
        await assertSteamIdAvailable(tx, steamId64, userId);
        await resetSteamLibraryForUser(tx, userId);
        await upsertSteamPlatformAccount(tx, userId, steamId64);
        await tx.user.update({ where: { id: userId }, data: { activationState: 'active' } });
      });

      return prisma.user.findUniqueOrThrow({ where: { id: userId } });
    },

    async loginWithPassword(email: string, password: string): Promise<PasswordLoginResult> {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user || !user.passwordHash || user.passwordHash !== hashPasswordValue(password)) {
        throw new Error('INVALID_CREDENTIALS');
      }

      const steamAccount = await prisma.platformAccount.findUnique({
        where: { userId_platform: { userId: user.id, platform: 'steam' } },
      });

      if (!steamAccount || user.activationState !== 'active') {
        const completionToken = await this.createCompletionToken(user.id, 'account_activation');
        return {
          kind: 'completion_required',
          userId: user.id,
          completionToken,
        };
      }

      const tokens = await this.createMobileTokens(user.id);
      return {
        kind: 'authenticated',
        user,
        ...tokens,
      };
    },

    createAuthCode(userId: string): string {
      const code = createId('authCode');
      pendingAuthCodes.set(code, {
        userId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return code;
    },

    consumeAuthCode(code: string): string | null {
      const entry = pendingAuthCodes.get(code);
      if (!entry) {
        return null;
      }
      pendingAuthCodes.delete(code);
      if (entry.expiresAt < Date.now()) {
        return null;
      }
      return entry.userId;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/auth-service.test.ts
```

Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add apps/saas-server/src/services/auth-service.ts apps/saas-server/src/services/auth-service.test.ts
git commit -m "$(cat <<'EOF'
refactor(auth): move Steam identity to PlatformAccount in auth-service

Removes upsertUserBySteamId64 and User.steamId64 usage. Activation
and relink now upsert a tenant-scoped Steam PlatformAccount and fail
closed with SteamIdOwnedError on cross-tenant ownership conflicts.
Password login normalizes email and treats a null passwordHash as
invalid credentials without revealing account existence.
EOF
)"
```

---

### Task 6: Steam auth routes — bare callback safety and ownership conflicts

**Files:**
- Modify: `apps/saas-server/src/routes/auth/steam.ts`
- Modify: `apps/saas-server/src/routes/auth/steam.test.ts`

**Interfaces:**
- Consumes: `SteamIdOwnedError`, `activateAccountWithSteam`, `relinkSteamAccount` (Task 5).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/saas-server/src/routes/auth/steam.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import * as platformSteam from '@digital-shelf-saas/platform-steam';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';

describe('Steam auth routes', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient();
  const auth = createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: 'test-mobile-secret-32-chars-min!!!',
  });

  beforeAll(async () => {
    process.env.STEAM_API_KEY = 'test-key';
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('redirects to login with STEAM_ACCOUNT_REQUIRED when the callback has no completion token', async () => {
    const usersBefore = await prisma.user.count();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/steam/callback?openid.mode=id_res',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login?error=STEAM_ACCOUNT_REQUIRED');
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('redirects to the mobile deep link with STEAM_ACCOUNT_REQUIRED for a bare mobile callback', async () => {
    const usersBefore = await prisma.user.count();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/steam/mobile-callback?openid.mode=id_res',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'digitalshelf://auth/callback?error=STEAM_ACCOUNT_REQUIRED',
    );
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('consumes completion token and activates account on steam callback', async () => {
    const steamId64 = `${Date.now()}76561198000000099`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-pending-steam@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
    });
    const token = await auth.createCompletionToken(user.id, 'account_activation');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(steamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=account_activation&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('digitalshelf://auth/callback');

    const platformAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'steam' } },
    });
    expect(platformAccount.externalId).toBe(steamId64);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });

  it('redirects with STEAM_ID_OWNED and preserves the original owner when the steam id is already linked', async () => {
    const steamId64 = `${Date.now()}76561198000000222`;
    const owner = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-owner@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
      },
    });
    await prisma.platformAccount.create({
      data: { id: createId('platformAccount'), userId: owner.id, platform: 'steam', externalId: steamId64 },
    });
    const intruder = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-intruder@example.com`,
        passwordHash: 'hash',
        activationState: 'pending_activation',
      },
    });
    const token = await auth.createCompletionToken(intruder.id, 'account_activation');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(steamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=account_activation&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login?error=STEAM_ID_OWNED');

    const ownerAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: owner.id, platform: 'steam' } },
    });
    expect(ownerAccount.externalId).toBe(steamId64);
    expect(await prisma.platformAccount.findMany({ where: { userId: intruder.id } })).toHaveLength(0);

    await prisma.platformAccount.deleteMany({ where: { userId: owner.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: intruder.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
    vi.restoreAllMocks();
  });

  it('relink keeps subscription and clears steam-derived library data', async () => {
    const previousSteamId64 = `${Date.now()}76561198000000088`;
    const nextSteamId64 = `${Date.now()}76561198000000777`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-relink@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: previousSteamId64,
      },
    });
    await prisma.subscription.create({
      data: {
        id: createId('sub'),
        userId: user.id,
        planId: 'plan_basic',
        provider: 'paypal',
        status: 'active',
        billingCycle: 'monthly',
      },
    });
    await prisma.syncRun.create({
      data: {
        id: createId('sync'),
        platformAccountId: platformAccount.id,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    const token = await auth.createCompletionToken(user.id, 'steam_relink');

    vi.spyOn(platformSteam, 'verifySteamOpenIdCallback').mockResolvedValue(nextSteamId64);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/steam/callback?purpose=steam_relink&token=${encodeURIComponent(token)}&openid.mode=id_res`,
    });

    expect(response.statusCode).toBe(302);
    expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).not.toBeNull();
    const relinkedAccount = await prisma.platformAccount.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'steam' } },
    });
    expect(relinkedAccount.externalId).toBe(nextSteamId64);
    expect(
      await prisma.syncRun.count({ where: { platformAccount: { userId: user.id } } }),
    ).toBe(0);

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.accountCompletionToken.deleteMany({ where: { userId: user.id } });
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -w @digital-shelf-saas/server -- src/routes/auth/steam.test.ts
```

Expected: FAIL — bare callback still calls the removed `upsertUserBySteamId64`, and `SteamIdOwnedError` handling doesn't exist yet.

- [ ] **Step 3: Replace the full contents of `apps/saas-server/src/routes/auth/steam.ts`**

```ts
import {
  buildSteamOpenIdLoginUrl,
  verifySteamOpenIdCallback,
} from '@digital-shelf-saas/platform-steam';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadEnv } from '../../config/env.js';
import { createAuthServiceFromEnv } from '../../lib/auth-deps.js';
import { clearSessionCookie } from '../../lib/session.js';
import { SteamIdOwnedError, type AuthService } from '../../services/auth-service.js';

function buildOpenIdUrls(publicUrl: string) {
  const normalized = publicUrl.replace(/\/$/, '');
  return {
    realm: normalized,
    returnTo: `${normalized}/api/auth/steam/callback`,
  };
}

function buildReturnTo(publicUrl: string, params: Record<string, string>): string {
  const callback = new URL('/api/auth/steam/callback', publicUrl);
  for (const [key, value] of Object.entries(params)) {
    callback.searchParams.set(key, value);
  }
  return callback.toString();
}

function queryToRecord(query: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function buildMobileReturnUrl(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): string {
  const url = new URL('digitalshelf://auth/callback');
  url.searchParams.set('accessToken', tokens.accessToken);
  url.searchParams.set('refreshToken', tokens.refreshToken);
  url.searchParams.set('expiresIn', String(tokens.expiresIn));
  return url.toString();
}

export async function registerSteamAuthRoutes(
  app: FastifyInstance,
  deps: { auth?: AuthService } = {},
): Promise<void> {
  const env = loadEnv();
  const auth = deps.auth ?? createAuthServiceFromEnv();

  app.get('/api/auth/steam/login', async (request, reply) => {
    if (!env.STEAM_API_KEY) {
      return reply.status(503).send({
        error: {
          code: 'STEAM_API_KEY_MISSING',
          message: 'Steam integration is not configured.',
        },
      });
    }

    const query = request.query as { client?: string; token?: string; purpose?: string };
    const { realm, returnTo } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
    let effectiveReturnTo =
      query.client === 'mobile' ? returnTo.replace('/callback', '/mobile-callback') : returnTo;

    if (query.token && query.purpose) {
      const tokenOk = await auth.assertCompletionTokenAvailable(query.token, query.purpose);
      if (!tokenOk) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_COMPLETION_TOKEN',
            message: 'Completion token is invalid or expired.',
          },
        });
      }
      effectiveReturnTo = buildReturnTo(env.SERVER_PUBLIC_URL, {
        purpose: query.purpose,
        token: query.token,
      });
    }

    const loginUrl = buildSteamOpenIdLoginUrl({ returnTo: effectiveReturnTo, realm });
    return reply.redirect(loginUrl);
  });

  app.get('/api/auth/steam/callback', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const purpose = typeof query.purpose === 'string' ? query.purpose : null;
    const token = typeof query.token === 'string' ? query.token : null;

    if (!token || !purpose) {
      return reply.redirect('/login?error=STEAM_ACCOUNT_REQUIRED');
    }

    try {
      const { realm } = buildOpenIdUrls(env.SERVER_PUBLIC_URL);
      const effectiveReturnTo = buildReturnTo(env.SERVER_PUBLIC_URL, { purpose, token });
      const steamId64 = await verifySteamOpenIdCallback({
        query: queryToRecord(query),
        returnTo: effectiveReturnTo,
        realm,
      });

      const pending = await auth.consumeCompletionToken(token, purpose);
      if (!pending) {
        return reply.redirect('/login?error=INVALID_COMPLETION_TOKEN');
      }

      const user =
        purpose === 'steam_relink'
          ? await auth.relinkSteamAccount(pending.userId, steamId64)
          : await auth.activateAccountWithSteam(pending.userId, steamId64);
      const tokens = await auth.createMobileTokens(user.id);
      return reply.redirect(buildMobileReturnUrl(tokens));
    } catch (error) {
      if (error instanceof SteamIdOwnedError) {
        return reply.redirect('/login?error=STEAM_ID_OWNED');
      }
      return reply.redirect('/login?error=STEAM_OPENID_FAILED');
    }
  });

  app.get('/api/auth/steam/mobile-callback', async (_request, reply) => {
    return reply.redirect('digitalshelf://auth/callback?error=STEAM_ACCOUNT_REQUIRED');
  });

  const exchangeSchema = z.object({ code: z.string().min(1) });

  app.post('/api/auth/steam/exchange', async (request, reply) => {
    const parsed = exchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Invalid exchange payload.' },
      });
    }

    const userId = auth.consumeAuthCode(parsed.data.code);
    if (!userId) {
      return reply.status(400).send({
        error: { code: 'INVALID_AUTH_CODE', message: 'Auth code is invalid or expired.' },
      });
    }

    const tokens = await auth.createMobileTokens(userId);
    return reply.send(tokens);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies.ds_session;
    if (sessionId) {
      await auth.deleteWebSession(sessionId);
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -w @digital-shelf-saas/server -- src/routes/auth/steam.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add apps/saas-server/src/routes/auth/steam.ts apps/saas-server/src/routes/auth/steam.test.ts
git commit -m "$(cat <<'EOF'
fix(auth): stop bare Steam callbacks from creating accounts

The callback and mobile-callback routes now require an active
completion token before touching Steam identity at all, redirecting
with STEAM_ACCOUNT_REQUIRED otherwise. Ownership conflicts during
activation/relink now surface as STEAM_ID_OWNED redirects.
EOF
)"
```

---

### Task 7: `steam-sync-service.ts` and billing Steam check → `PlatformAccount`

**Files:**
- Modify: `apps/saas-server/src/services/steam-sync-service.ts`
- Modify: `apps/saas-server/src/services/steam-sync-service.test.ts`
- Modify: `apps/saas-server/src/routes/v1/billing.ts`
- Modify: `apps/saas-server/src/routes/v1/billing.test.ts`

**Interfaces:**
- Produces: `requireSteamAccount(userId): Promise<PlatformAccount>` (replaces the removed `resolveSteamId64` + `ensurePlatformAccount` pair internally in `steam-sync-service.ts`).

- [ ] **Step 1: Update `apps/saas-server/src/services/steam-sync-service.ts`**

Replace:

```ts
  async function resolveSteamId64(userId: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.steamId64) {
      throw new SteamError('STEAM_API_ERROR', 'Steam account is not linked for this user.');
    }
    return user.steamId64;
  }

  async function ensurePlatformAccount(userId: string, steamId64: string) {
    const existing = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (existing) {
      if (existing.externalId !== steamId64) {
        return prisma.platformAccount.update({
          where: { id: existing.id },
          data: { externalId: steamId64 },
        });
      }
      return existing;
    }

    return prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId,
        platform: 'steam',
        externalId: steamId64,
      },
    });
  }
```

With:

```ts
  async function requireSteamAccount(userId: string) {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (!account) {
      throw new SteamError('STEAM_API_ERROR', 'Steam account is not linked for this user.');
    }
    return account;
  }
```

Replace, inside `runSyncJob`:

```ts
      const steamId64 = await resolveSteamId64(userId);
      const account = await ensurePlatformAccount(userId, steamId64);
```

With:

```ts
      const account = await requireSteamAccount(userId);
      const steamId64 = account.externalId;
```

Replace, inside `startSync`:

```ts
    const steamId64 = await resolveSteamId64(userId);
    const account = await ensurePlatformAccount(userId, steamId64);
```

With:

```ts
    const account = await requireSteamAccount(userId);
```

- [ ] **Step 2: Update `apps/saas-server/src/services/steam-sync-service.test.ts`**

Replace:

```ts
async function createTestUser() {
  return prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-sync@example.com`,
      passwordHash: 'hash',
      activationState: 'active',
      steamId64: `${Date.now()}76561198000000000`,
    },
  });
}
```

With:

```ts
async function createTestUser() {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-sync@example.com`,
      passwordHash: 'hash',
      activationState: 'active',
    },
  });
  await prisma.platformAccount.create({
    data: {
      id: createId('platformAccount'),
      userId: user.id,
      platform: 'steam',
      externalId: `${Date.now()}76561198000000000`,
    },
  });
  return user;
}
```

Replace, in the `'resets steam-derived library data without deleting subscriptions'` test:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-reset@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000456`,
        subscription: {
          create: {
            id: createId('subscription'),
            planId: 'plan_basic',
            provider: 'paypal',
            status: 'active',
            billingCycle: 'monthly',
          },
        },
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: user.steamId64!,
      },
    });
```

With:

```ts
    const steamId64 = `${Date.now()}76561198000000456`;
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-reset@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        subscription: {
          create: {
            id: createId('sub'),
            planId: 'plan_basic',
            provider: 'paypal',
            status: 'active',
            billingCycle: 'monthly',
          },
        },
      },
    });
    const platformAccount = await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: steamId64,
      },
    });
```

- [ ] **Step 3: Update `apps/saas-server/src/routes/v1/billing.ts`**

Replace:

```ts
  async function assertSteamLinked(userId: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { steamId64: true },
    });
    if (!user.steamId64) {
      throw new BillingError('STEAM_LINK_REQUIRED', 'Link your Steam account before subscribing.');
    }
  }
```

With:

```ts
  async function assertSteamLinked(userId: string): Promise<void> {
    const account = await prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform: 'steam' } },
    });
    if (!account) {
      throw new BillingError('STEAM_LINK_REQUIRED', 'Link your Steam account before subscribing.');
    }
  }
```

- [ ] **Step 4: Remove the stray `steamId64` fixture field from `apps/saas-server/src/routes/v1/billing.test.ts`**

In the `'GET /api/v1/billing/plans returns plans and sales flags'` test, replace:

```ts
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000033`,
      },
    });
```

With:

```ts
        activationState: 'active',
      },
    });
```

In the `'GET /api/v1/billing/status includes device limit fields'` test, replace:

```ts
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000034`,
      },
    });
```

With:

```ts
        activationState: 'active',
      },
    });
```

- [ ] **Step 5: Run the affected tests**

```bash
npm run test -w @digital-shelf-saas/server -- src/services/steam-sync-service.test.ts src/routes/v1/billing.test.ts
```

Expected: PASS (all tests in both files, including `'rejects subscription creation when steam is not linked'`).

- [ ] **Step 6: Commit**

```bash
git add apps/saas-server/src/services/steam-sync-service.ts apps/saas-server/src/services/steam-sync-service.test.ts apps/saas-server/src/routes/v1/billing.ts apps/saas-server/src/routes/v1/billing.test.ts
git commit -m "$(cat <<'EOF'
refactor(steam): read Steam identity from PlatformAccount everywhere

steam-sync-service and the billing Steam-link check now derive the
linked Steam account solely from PlatformAccount instead of the
removed User.steamId64 field.
EOF
)"
```

---

### Task 8: Shared contracts and `/api/v1/auth/me` safe status

**Files:**
- Modify: `packages/shared-types/src/saas.ts`
- Modify: `packages/device-protocol/src/v1/auth.ts`
- Modify: `apps/saas-web/src/api/types.ts`
- Modify: `apps/saas-server/src/routes/v1/index.ts`
- Modify: `apps/saas-server/src/routes/v1/auth.test.ts`

**Interfaces:**
- Consumes: `prisma.platformAccount`, `prisma.authIdentity` (Task 1).
- Produces: `/api/v1/auth/me` response shape `{ user: { id, email, activationState, displayName, avatarUrl, steamConnected, hasPassword, authProviders } }` — no `steamId64`, no provider subjects, no identity record ids.

- [ ] **Step 1: Update `packages/shared-types/src/saas.ts`**

Replace:

```ts
export type User = {
  id: string;
  steamId64: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

With:

```ts
export type User = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

- [ ] **Step 2: Update `packages/device-protocol/src/v1/auth.ts`**

Replace:

```ts
import { z } from 'zod';

export const authMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    steamId64: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
});
```

With:

```ts
import { z } from 'zod';

export const authMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    activationState: z.enum(['account_created', 'pending_activation', 'active']),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    steamConnected: z.boolean(),
    hasPassword: z.boolean(),
    authProviders: z.array(z.enum(['google', 'apple'])),
  }),
});
```

- [ ] **Step 3: Update `apps/saas-web/src/api/types.ts`**

Replace:

```ts
export type AuthMeResponse = {
  user: {
    id: string;
    email: string;
    steamId64: string | null;
    activationState: 'account_created' | 'pending_activation' | 'active';
    displayName: string | null;
    avatarUrl: string | null;
  };
};
```

With:

```ts
export type AuthMeResponse = {
  user: {
    id: string;
    email: string;
    activationState: 'account_created' | 'pending_activation' | 'active';
    displayName: string | null;
    avatarUrl: string | null;
    steamConnected: boolean;
    hasPassword: boolean;
    authProviders: Array<'google' | 'apple'>;
  };
};
```

- [ ] **Step 4: Update the `/auth/me` handler in `apps/saas-server/src/routes/v1/index.ts`**

Replace:

```ts
      protectedApp.get('/auth/me', async (request, reply) => {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: request.userId! },
        });
        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            steamId64: user.steamId64,
            activationState: user.activationState,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        });
      });
```

With:

```ts
      protectedApp.get('/auth/me', async (request, reply) => {
        const userId = request.userId!;
        const [user, steamAccount, authIdentities] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: userId } }),
          prisma.platformAccount.findUnique({
            where: { userId_platform: { userId, platform: 'steam' } },
          }),
          prisma.authIdentity.findMany({ where: { userId }, select: { provider: true } }),
        ]);
        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            activationState: user.activationState,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            steamConnected: steamAccount !== null,
            hasPassword: user.passwordHash !== null,
            authProviders: authIdentities.map((identity) => identity.provider),
          },
        });
      });
```

- [ ] **Step 5: Update the failing `/auth/me` test in `apps/saas-server/src/routes/v1/auth.test.ts`**

Replace the `'returns authenticated user'` test:

```ts
  it('returns authenticated user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-auth@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000055`,
        displayName: 'Test User',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        email: user.email,
        steamId64: user.steamId64,
        activationState: 'active',
        displayName: 'Test User',
        avatarUrl: null,
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
```

With:

```ts
  it('returns only safe connection and method status for a fully linked user', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-auth@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        displayName: 'Test User',
      },
    });
    await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId: `${Date.now()}76561198000000055`,
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: createId('authIdentity'),
        userId: user.id,
        provider: 'google',
        providerSubject: `${Date.now()}-google-sub`,
        email: user.email,
        emailVerifiedAt: new Date(),
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        email: user.email,
        activationState: 'active',
        displayName: 'Test User',
        avatarUrl: null,
        steamConnected: true,
        hasPassword: true,
        authProviders: ['google'],
      },
    });

    await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.platformAccount.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('reports no steam connection and no password for a social-only account', async () => {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-social@example.com`,
        passwordHash: null,
        activationState: 'pending_activation',
      },
    });
    const session = await auth.createWebSession(user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { [SESSION_COOKIE]: session.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        email: user.email,
        activationState: 'pending_activation',
        displayName: null,
        avatarUrl: null,
        steamConnected: false,
        hasPassword: false,
        authProviders: [],
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
```

- [ ] **Step 6: Run the affected tests**

```bash
npm run test -w @digital-shelf-saas/server -- src/routes/v1/auth.test.ts
npm run test -w @digital-shelf-saas/shared-types
```

Expected: PASS for both (the onboarding test in `auth.test.ts` is unaffected).

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/saas.ts packages/device-protocol/src/v1/auth.ts apps/saas-web/src/api/types.ts apps/saas-server/src/routes/v1/index.ts apps/saas-server/src/routes/v1/auth.test.ts
git commit -m "$(cat <<'EOF'
feat(api): expose only safe auth/me status across shared contracts

/api/v1/auth/me now returns steamConnected, hasPassword, and
authProviders instead of steamId64. shared-types, device-protocol,
and saas-web types are updated to match.
EOF
)"
```

---

### Task 9: Shared test fixture helper and remaining `steamId64` cleanup

**Files:**
- Create: `apps/saas-server/src/test-support/user-fixtures.ts`
- Modify: `apps/saas-server/src/routes/v1/settings.test.ts`
- Modify: `apps/saas-server/src/services/user-settings-service.test.ts`
- Modify: `apps/saas-server/src/integration/tenant-isolation.test.ts`
- Modify: `apps/saas-server/src/services/device-service.test.ts`
- Modify: `apps/saas-server/src/middleware/auth.test.ts`
- Modify: `apps/saas-server/src/routes/v1/devices-frame.test.ts`
- Modify: `apps/saas-server/src/routes/auth/account.test.ts`

**Interfaces:**
- Produces: `createTestUser(prisma, options?): Promise<User>` where `options` is `{ email?, passwordHash?, activationState?, displayName?, withSteam?, steamExternalId? }`.

- [ ] **Step 1: Create `apps/saas-server/src/test-support/user-fixtures.ts`**

```ts
import type { PrismaClient, User } from '@prisma/client';
import { createId } from '@digital-shelf-saas/shared-types';

export type CreateTestUserOptions = {
  email?: string;
  passwordHash?: string | null;
  activationState?: string;
  displayName?: string | null;
  withSteam?: boolean;
  steamExternalId?: string;
};

export async function createTestUser(
  prisma: PrismaClient,
  options: CreateTestUserOptions = {},
): Promise<User> {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: options.email ?? `${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: options.passwordHash === undefined ? 'test-hash' : options.passwordHash,
      activationState: options.activationState ?? 'active',
      displayName: options.displayName ?? null,
    },
  });

  if (options.withSteam || options.steamExternalId) {
    await prisma.platformAccount.create({
      data: {
        id: createId('platformAccount'),
        userId: user.id,
        platform: 'steam',
        externalId:
          options.steamExternalId ?? `${Date.now()}${Math.floor(Math.random() * 1_000_000_000)}`,
      },
    });
  }

  return user;
}
```

- [ ] **Step 2: Update `apps/saas-server/src/routes/v1/settings.test.ts`**

Replace the import block:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';
import { SESSION_COOKIE } from '../../lib/session.js';
```

With (dropping the now-unused `createId` import and adding the fixture helper):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { createAuthService } from '../../services/auth-service.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createTestUser } from '../../test-support/user-fixtures.js';
```

Replace, in `'returns default settings'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-settings-default@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000066`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-settings-default@test.local` });
```

Replace, in `'patches display settings'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-settings-patch@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000067`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-settings-patch@test.local` });
```

- [ ] **Step 3: Update `apps/saas-server/src/services/user-settings-service.test.ts`**

Replace the import block:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createId, USER_SETTING_KEYS } from '@digital-shelf-saas/shared-types';
import { createUserSettingsService } from './user-settings-service.js';
```

With (dropping the now-unused `createId` import and adding the fixture helper):

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { USER_SETTING_KEYS } from '@digital-shelf-saas/shared-types';
import { createUserSettingsService } from './user-settings-service.js';
import { createTestUser } from '../test-support/user-fixtures.js';
```

Replace, in `'resolveDisplayDefaults returns hardcoded defaults'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-010@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000010`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-010@test.local` });
```

Replace, in `'resolveDisplayDefaults returns stored value after setSetting'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-011@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000011`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-011@test.local` });
```

Replace, in `'prefers env default over hardcoded when DB empty'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-012@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000012`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-012@test.local` });
```

- [ ] **Step 4: Update `apps/saas-server/src/integration/tenant-isolation.test.ts`**

Add the import:

```ts
import { createTestUser } from '../test-support/user-fixtures.js';
```

Replace the `seedUser` function:

```ts
async function seedUser(suffix: string) {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-${suffix}@test.local`,
      passwordHash: 'test-hash',
      activationState: 'active',
      steamId64: `${Date.now()}76561198000000${suffix}`,
    },
  });
  await prisma.subscription.create({
```

With:

```ts
async function seedUser(suffix: string) {
  const user = await createTestUser(prisma, { email: `${Date.now()}-${suffix}@test.local` });
  await prisma.subscription.create({
```

(leave the rest of the function body, including the `data: { ... }` object passed to `prisma.subscription.create`, unchanged).

- [ ] **Step 5: Update `apps/saas-server/src/services/device-service.test.ts`**

Add the import:

```ts
import { createTestUser } from '../test-support/user-fixtures.js';
```

Replace the `seedUserWithSub` function:

```ts
  async function seedUserWithSub(steamSuffix: string) {
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-${steamSuffix}@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000${steamSuffix}`,
      },
    });
    await prisma.subscription.create({
```

With:

```ts
  async function seedUserWithSub(steamSuffix: string) {
    const user = await createTestUser(prisma, { email: `${Date.now()}-${steamSuffix}@test.local` });
    await prisma.subscription.create({
```

- [ ] **Step 6: Update `apps/saas-server/src/middleware/auth.test.ts`**

Replace the import block:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createId } from '@digital-shelf-saas/shared-types';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';
import { SESSION_COOKIE } from '../lib/session.js';
```

With (dropping the now-unused `createId` import and adding the fixture helper):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';
import { SESSION_COOKIE } from '../lib/session.js';
import { createTestUser } from '../test-support/user-fixtures.js';
```

Replace, in `'accepts session cookie'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-cookie@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000077`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-cookie@test.local` });
```

Replace, in `'accepts bearer token'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-bearer@test.local`,
        passwordHash: 'test-hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000066`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-bearer@test.local` });
```

- [ ] **Step 7: Update `apps/saas-server/src/routes/v1/devices-frame.test.ts`**

Add the import:

```ts
import { createTestUser } from '../../test-support/user-fixtures.js';
```

Replace the `seedUser` function:

```ts
async function seedUser(suffix: string, subscribed = true) {
  const user = await prisma.user.create({
    data: {
      id: createId('user'),
      email: `${Date.now()}-${suffix}@test.local`,
      passwordHash: 'test-hash',
      activationState: 'active',
      steamId64: `${Date.now()}76561198000000${suffix}`,
    },
  });
  if (subscribed) {
```

With:

```ts
async function seedUser(suffix: string, subscribed = true) {
  const user = await createTestUser(prisma, { email: `${Date.now()}-${suffix}@test.local` });
  if (subscribed) {
```

- [ ] **Step 8: Update `apps/saas-server/src/routes/auth/account.test.ts`**

Replace the import block:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createAuthService } from '../../services/auth-service.js';
import { createId } from '@digital-shelf-saas/shared-types';
```

With (dropping the now-unused `createId` import and adding the fixture helper):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createAuthService } from '../../services/auth-service.js';
import { createTestUser } from '../../test-support/user-fixtures.js';
```

Replace, in `'issues a steam relink completion token from settings flow'`:

```ts
    const user = await prisma.user.create({
      data: {
        id: createId('user'),
        email: `${Date.now()}-active@example.com`,
        passwordHash: 'hash',
        activationState: 'active',
        steamId64: `${Date.now()}76561198000000321`,
      },
    });
```

With:

```ts
    const user = await createTestUser(prisma, { email: `${Date.now()}-active@example.com` });
```

- [ ] **Step 9: Run the full server test suite**

```bash
npm run test -w @digital-shelf-saas/server
```

Expected: PASS across every file (no remaining references to `steamId64`).

- [ ] **Step 10: Confirm no `steamId64` references remain on the `User` model**

```bash
grep -rn "steamId64" apps/saas-server/src apps/saas-web/src packages/shared-types/src packages/device-protocol/src
```

Expected: no output (the only prior non-`User.steamId64` hit, the unrelated `SetupPage.tsx` local admin-settings form field, is out of scope for this task and untouched).

- [ ] **Step 11: Commit**

```bash
git add apps/saas-server/src/test-support/user-fixtures.ts apps/saas-server/src/routes/v1/settings.test.ts apps/saas-server/src/services/user-settings-service.test.ts apps/saas-server/src/integration/tenant-isolation.test.ts apps/saas-server/src/services/device-service.test.ts apps/saas-server/src/middleware/auth.test.ts apps/saas-server/src/routes/v1/devices-frame.test.ts apps/saas-server/src/routes/auth/account.test.ts
git commit -m "$(cat <<'EOF'
test: replace remaining steamId64 fixtures with createTestUser helper

Adds a shared user-fixtures helper and updates every remaining test
file that seeded the removed User.steamId64 field.
EOF
)"
```

---

### Task 10: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add an Identity Model section to `README.md`**

Insert a new section after `## Repo Layout` and before `## Prerequisites`:

```md
## Identity Model

- `User` is the sole internal account and tenant boundary.
- Email/password is optional (`User.passwordHash` is nullable) — Google/Apple-only accounts can sign in without a password. Google and Apple OAuth flows themselves are implemented in a later task; only the schema and services exist today.
- Google and Apple identities are stored in `AuthIdentity`, unique per `(provider, providerSubject)` globally and per `(userId, provider)` per account (one Google + one Apple per account).
- Steam is a linked gaming-platform account, not a login method. It is stored only in `PlatformAccount { platform: 'steam' }`, and every account must connect Steam after registering (password or provider) before the product is usable — see `docs/superpowers/specs/2026-07-07-account-activation-and-steam-linking-design.md`.
- `GET /api/v1/auth/me` returns only safe status (`steamConnected`, `hasPassword`, `authProviders`) — never provider subjects, raw claims, or internal identity record ids.
```

- [ ] **Step 2: Update the Identity handling section in `AGENTS.md`**

Replace:

```md
### Identity handling

- Web identity comes from the session cookie.
- Mobile identity comes from a signed bearer token resolved in `tenant-context.ts`.
- Device identity comes from device bearer auth in `lib/device-auth.ts`.
- Protected routes must derive identity from verified auth context, never from user-supplied `userId`.
```

With:

```md
### Identity handling

- Web identity comes from the session cookie.
- Mobile identity comes from a signed bearer token resolved in `tenant-context.ts`.
- Device identity comes from device bearer auth in `lib/device-auth.ts`.
- Protected routes must derive identity from verified auth context, never from user-supplied `userId`.

### Account and provider identity model

- `User` is the only account/tenant boundary. `User.passwordHash` is nullable; a `User` may have password auth, one Google `AuthIdentity`, and one Apple `AuthIdentity` simultaneously.
- `AuthIdentity` (`packages` n/a — server-only Prisma model) resolves by `(provider, providerSubject)` first; a verified, uniquely-matching email may auto-link a new subject to an existing account, but never moves a subject between accounts. Use `auth-identity-service.ts` for all resolve/link logic — do not hand-roll new resolution logic in routes.
- Steam identity lives only in `PlatformAccount { platform: 'steam' }`, scoped by `userId`. There is no `User.steamId64` field and no `upsertUserBySteamId64` helper — do not reintroduce either. A bare Steam OpenID callback (no completion token) must never create or modify a `User`.
```

- [ ] **Step 3: Add a "do not" bullet to `AGENTS.md`**

In the `## Do Not` list, add:

```md
- Do not reintroduce `User.steamId64`, `upsertUserBySteamId64`, or Steam-as-primary-login. Steam identity lives only in `PlatformAccount`.
```

- [ ] **Step 4: Migration smoke test — reset the disposable local database and reapply the full chain**

```bash
cd apps/saas-server && npx prisma migrate reset --force --schema prisma/schema.prisma && cd ../..
```

Expected: all migrations from `20260705183009_init` through `20260805120000_separate_auth_and_platform_identities` apply cleanly, followed by the seed script running successfully.

- [ ] **Step 5: Run the full workspace verification**

```bash
npm run build
```

Expected: PASS — all packages and apps build.

```bash
npm run lint
```

Expected: PASS — no lint errors.

```bash
npm test
```

Expected: PASS — every workspace's test suite passes, including `apps/saas-server` (Postgres must be reachable on `localhost:5433`).

- [ ] **Step 6: Manual verification of the schema via Prisma Studio (optional but recommended)**

```bash
npx prisma studio --schema apps/saas-server/prisma/schema.prisma
```

Confirm: `users.passwordHash` is nullable, `users` has no `steamId64` column, `auth_identities` exists with the `(provider, providerSubject)` and `(userId, provider)` unique constraints, and `platform_accounts` is the only table holding Steam external ids.

- [ ] **Step 7: Commit**

```bash
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: document the account and provider identity model

Describes optional password auth, the AuthIdentity provider model,
and the Steam-as-linked-PlatformAccount boundary in README and
AGENTS so future work doesn't reintroduce steamId64 or Steam-as-login.
EOF
)"
```

---

## Spec Coverage Checklist

| Acceptance criterion | Task |
| --- | --- |
| `User` remains the sole internal account/tenant boundary | 1, 3 |
| `User` can exist with `passwordHash = null` | 1, 2 |
| One user can have password + Google + Apple simultaneously | 1, 2 |
| `provider + providerSubject` maps to exactly one user globally | 1, 2, 3 |
| A user cannot link two subjects for the same provider | 1, 2, 3, 4 |
| Provider identity deletion cascades when user is deleted | 1, 2 |
| Provider credentials/tokens/raw claims are never stored | 3 (only subject/email/verification snapshot persisted) |
| Email inputs normalized before create/login/matching | 3, 5 |
| New verified provider identity auto-links to unique matching account | 3 |
| Missing/unverified/ambiguous/collision cases fail closed, no existence leak | 3, 4 |
| Concurrent identity creation/linking cannot duplicate accounts | 3, 4 |
| `User.steamId64`, `upsertUserBySteamId64`, placeholder emails removed | 1, 5 |
| Steam identity stored only in tenant-owned `PlatformAccount` | 5, 6, 7 |
| Steam relinking rejects an already-owned external id, preserves owner | 5, 6 |
| Password signup/login, sessions, mobile tokens, onboarding, billing, sync compile/behave through new model | 5, 6, 7, 9 |
| Public auth responses expose only safe status | 8 |
| Fresh disposable database applies the full migration chain | 1, 10 |
| `npm run build`, `npm run lint`, `npm test` pass | 10 |

## Automated Tests Checklist

| # | Test | Task |
| --- | --- | --- |
| 1 | Social-only user with null password hash | 2 |
| 2 | Google + Apple identities on same user | 2 |
| 3 | Reject duplicate `provider + providerSubject` | 2 |
| 4 | Reject two subjects for same `userId + provider` | 2 |
| 5 | Cascade delete | 2 |
| 6 | Resolve by subject despite email change | 3 |
| 7 | Auto-link on unique verified email match | 3 |
| 8 | Missing/unverified email cannot auto-link | 3 |
| 9 | Existing different identity → collision, not overwrite | 4 |
| 10 | Concurrency converges on one account | 4 |
| 11 | Tenant: subject can't move between users | 4 |
| 12 | Social-only login = generic invalid-credentials | 5 |
| 13 | Email normalization on login | 5 |
| 14 | Activation creates exactly one tenant-scoped Steam `PlatformAccount` | 5 |
| 15 | Duplicate Steam ownership fails closed, no mutation | 5, 6 |
| 16 | Sync/billing/onboarding derive from `PlatformAccount` | 7 |
| 17 | `/api/v1/auth/me` exposes only safe status | 8 |
| 18 | Migration smoke test on disposable database | 1, 10 |

## Manual Test Plan

1. `docker compose up -d postgres`, then `cd apps/saas-server && npx prisma migrate reset --force --schema prisma/schema.prisma`.
2. Open Prisma Studio; confirm `users.passwordHash` nullable, no `steamId64` column, `auth_identities` unique constraints present, Steam ids only in `platform_accounts`.
3. Sign up with email/password, then log in with mixed-case/whitespace email — confirm one account, one session.
4. Using the identity-service test harness (Task 3/4), create a Google-only user with no password and confirm a session/mobile token can still be issued after resolution.
5. Link Apple to that same account via the service and confirm only one `users` row exists.
6. Attempt to link a second Google subject to that account and confirm the operation stops without modifying the existing link.
7. Attempt to attach another user's Steam id via `activateAccountWithSteam`/`relinkSteamAccount` and confirm the original owner is unchanged and a `STEAM_ID_OWNED` error surfaces.
8. Link/relink Steam through the web flow and run a library sync; confirm games belong to the correct `PlatformAccount`.
9. Call `GET /api/v1/auth/me` and confirm the response only contains `steamConnected`, `hasPassword`, `authProviders`, and no provider subjects or identity ids.
10. Confirm email/password signup and login still work end-to-end through the HTTP routes.
11. Run `npm run build`, `npm run lint`, `npm test` from the repo root.
