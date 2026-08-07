# Digital Shelf SaaS

Multi-tenant SaaS server and web app for Digital Shelf. This repo contains the cloud API, billing integrations, tenant-scoped library and device flows, and the React web client.

## Stack

- Node.js 20+
- npm 10+
- TypeScript
- Turborepo workspaces
- Fastify
- Prisma + PostgreSQL
- React 19 + Vite
- Docker Compose for local Postgres

## Repo Layout

| Path | Purpose |
| --- | --- |
| `apps/saas-server/` | Fastify API, Prisma schema, auth, storage, routes |
| `apps/saas-web/` | React web client |
| `packages/` | shared packages for types, billing, Steam, rendering, and protocol schemas |
| `docs/superpowers/` | design specs and implementation plans |

## Identity Model

- `User` is the sole internal account and tenant boundary.
- Email/password is optional (`User.passwordHash` is nullable) — Google/Apple-only accounts can sign in without a password. Google and Apple OAuth flows themselves are implemented in a later task; only the schema and services exist today.
- Google and Apple identities are stored in `AuthIdentity`, unique per `(provider, providerSubject)` globally and per `(userId, provider)` per account (one Google + one Apple per account).
- Steam is a linked gaming-platform account, not a login method. It is stored only in `PlatformAccount { platform: 'steam' }`, and every account must connect Steam after registering (password or provider) before the product is usable — see `docs/superpowers/specs/2026-07-07-account-activation-and-steam-linking-design.md`.
- `GET /api/v1/auth/me` returns only safe status (`steamConnected`, `hasPassword`, `authProviders`) — never provider subjects, raw claims, or internal identity record ids.

## Prerequisites

- Node.js `>=20`
- npm `>=10`
- Docker Desktop or a compatible Docker runtime

## Environment

1. Copy `.env.example` to `.env`.
2. Set required secrets:
   - `SESSION_SECRET`
   - `MOBILE_TOKEN_SECRET`
3. Fill optional integration keys as needed:
   - `STEAM_API_KEY`
   - PayPal, Apple, and Google billing settings
   - S3 storage settings when `FRAME_STORAGE_DRIVER=s3`

Important local defaults:

- app URL: `http://localhost:8080`
- web dev URL: `http://localhost:5173`
- Postgres: `postgresql://digitalshelf:digitalshelf@localhost:5433/digitalshelf`

## Install

```bash
npm install
```

## Local Development

### 1. Start Postgres

```bash
docker compose up -d postgres
```

### 2. Generate Prisma client

```bash
npm run prisma:generate -w @digital-shelf-saas/server
```

### 3. Apply local migrations

```bash
npm run prisma:migrate
```

### 4. Start the app stack

```bash
npm run dev
```

This runs the workspace dev processes through Turbo:

- server: `http://localhost:8080`
- web: `http://localhost:5173`

The web app proxies `/api` requests to the server in development.

## Tests

Run everything:

```bash
npm test
```

Run the main server suite:

```bash
npm run test -w @digital-shelf-saas/server
```

Note: server tests require Postgres on `localhost:5433`.

## Build

Run the workspace build:

```bash
npm run build
```

The web build is emitted into `apps/saas-server/public/`.

## Production

### Docker image

The production image lives at `apps/saas-server/Dockerfile`.

It:

- installs workspace dependencies
- generates Prisma client
- builds packages and apps
- runs `prisma migrate deploy` on container start
- starts the SaaS server on port `8080`

### Local production-style compose run

```bash
docker compose up --build
```

`docker-compose.yml` starts:

- `postgres`
- `saas-server`

The server container uses the compose-network Postgres host and reads optional env values from `.env`.

### Dokku production deploy

Merges to `master` deploy via a self-hosted GitHub Actions workflow that runs lint, build, and test, then `git push`es to Dokku.

One-time server bootstrap, secrets, runner requirements, rollback, and verification are documented in:

[`docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md`](docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md)

## Useful Commands

```bash
npm run build
npm run lint
npm test
npm run test -w @digital-shelf-saas/server
npm run build -w @digital-shelf-saas/server
npm run prisma:migrate
npm run prisma:generate -w @digital-shelf-saas/server
```

## Important Repo Rules

- Treat tenant isolation as a hard requirement.
- Never trust client-provided `userId` on protected endpoints.
- Derive identity from session, bearer auth, or device auth.
- Scope tenant-owned Prisma queries by the resolved tenant.
- Read `AGENTS.md` and `.agents/skills/tenant-auth-guard/SKILL.md` before auth, route, or DB work.
