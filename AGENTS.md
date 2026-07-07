# Digital Shelf SaaS Repo Guide

## Primary Goal

Build and operate the cloud SaaS version of Digital Shelf:

- multi-tenant Fastify API for web, mobile, and device clients
- Steam-based identity bootstrap
- subscription-aware billing and entitlements
- tenant-scoped library sync, device management, and frame generation
- a React web app that consumes `/api/v1/*`

This repo is not a single-user demo. Tenant isolation is a product requirement, not an implementation detail.

## Mandatory Repo Skill

Always load and follow `.agents/skills/tenant-auth-guard/SKILL.md` before changing:

- Prisma queries
- Fastify routes or middleware
- auth or token handling
- billing, library, device, frame, or user-settings flows

If a task can affect account boundaries, this skill is required.

## Project Structure

| Path | Purpose |
| --- | --- |
| `apps/saas-server/` | Fastify API, Prisma schema, auth, billing routes, tenant-scoped services |
| `apps/saas-web/` | React/Vite web app, built into `apps/saas-server/public/` |
| `packages/shared-types/` | shared domain types, ids, settings, schemas |
| `packages/device-protocol/` | API payload schemas for admin/device/v1 surfaces |
| `packages/billing/` | entitlements, sales flags, PayPal/Apple/Google helpers |
| `packages/core/` | domain logic shared across runtime surfaces |
| `packages/platform-steam/` | Steam OpenID and Steam API integrations |
| `packages/renderer/` | frame rendering and image generation helpers |
| `docs/superpowers/specs/` | approved design specs |
| `docs/superpowers/plans/` | implementation plans |
| `.agents/skills/` | repo-local skills and durable agent guidance |

## Established Patterns

### Server composition

- `apps/saas-server/src/app.ts` is the composition root.
- Route registration is split by domain under `src/routes/`.
- Request auth is applied with `registerAuthPlugin(...)`.
- Subscription gating is applied with `registerEntitlementGuard(...)` only where the product requires an active plan.

### Identity handling

- Web identity comes from the session cookie.
- Mobile identity comes from a signed bearer token resolved in `tenant-context.ts`.
- Device identity comes from device bearer auth in `lib/device-auth.ts`.
- Protected routes must derive identity from verified auth context, never from user-supplied `userId`.

### Tenant isolation

- Service methods accept a server-derived tenant identity and scope DB access with it.
- If a record is loaded by a non-tenant key first, ownership must be asserted before use.
- Cross-tenant reads should return `404` or the domain-specific guarded error, not leak existence.

### Validation and errors

- Validate request payloads with Zod or shared protocol schemas at the route boundary.
- Convert domain/service failures into structured `{ error: { code, message } }` responses.
- Keep validation in routes and business rules in services.

### Web app contract

- The web app talks to `/api/v1/*`.
- Vite proxies `/api` to `localhost:8080` in dev.
- Production web assets are emitted to `apps/saas-server/public/`.

### Tests

- Server tests live close to the code they verify.
- Tenant isolation and auth boundaries are first-class test targets.
- For server tests, Postgres must be available on `localhost:5433`.

## Do

- Derive tenant identity from verified auth, then pass it downward.
- Scope Prisma queries by `userId` or an owned relation whenever data is tenant-owned.
- Keep route files thin and put business logic in services.
- Use existing auth, entitlement, and device-ownership patterns before inventing new ones.
- Preserve the `/api/v1` contract for user-facing clients and `/api/device/v1` for device clients.
- Add or update tests when changing auth, tenant filters, ownership checks, or entitlement behavior.
- Document meaningful repo workflow changes in `README.md` or `AGENTS.md`.

## Do Not

- Do not accept raw `userId` from body, query, or path on protected client endpoints.
- Do not expose plain `userId` as a transport mechanism between clients and server.
- Do not write unscoped Prisma queries for tenant-owned tables.
- Do not trust `findUnique({ id })` alone when the id is not guaranteed tenant-scoped.
- Do not mix public bootstrap endpoints with protected application behavior.
- Do not put tenant checks only in the frontend.
- Do not introduce parallel auth patterns when the existing cookie, bearer, and device-token flows already apply.

## Public Endpoint Rule

Public endpoints must stay narrow and intentional. In this repo they are limited to bootstrap or operational surfaces such as:

- health
- Steam login and callback flows
- auth code exchange
- device register and claim-status bootstrap
- billing webhooks

Everything else should be protected by auth, and subscription-sensitive features should additionally use entitlement guards.

## README Relationship

Use `README.md` for setup and runtime instructions.
Use this file for repo behavior, architecture expectations, and agent operating rules.
