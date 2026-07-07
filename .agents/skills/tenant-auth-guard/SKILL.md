---
name: tenant-auth-guard
description: Use when touching Fastify routes, Prisma queries, auth flows, billing, library, device, frame, or user-settings code in this repo, especially when tenant isolation or client identity handling could be affected.
---

# Tenant Auth Guard

## Overview

This repo is multi-tenant. Account isolation is mandatory.

Identity must come from verified auth context, not client-supplied `userId`.

## Use Rules

- For protected user routes, resolve identity from session cookie or bearer auth, then use `request.userId`.
- For device routes, resolve identity from device bearer auth.
- Only narrow bootstrap or operational endpoints may be public.

## Query Rules

- Tenant-owned reads and writes must be scoped by `userId` or an owned relation.
- If a record is fetched by a non-tenant key first, assert ownership before returning, mutating, or traversing it.
- Prefer service methods that already take `userId` instead of adding ad-hoc route queries.
- Cross-tenant access must fail closed.

## Transport Rules

- Never accept raw `userId` from client body, query, or path on protected endpoints.
- Never use plain `userId` as an external transport value between clients and server.
- If external identity must travel, use a signed bearer token or JWT-style envelope, not a raw id.
- Keep raw `userId` server-internal after auth resolution.

## Route Rules

- Protected user routes must register auth before business handlers.
- Subscription-sensitive routes must also register entitlement guards.
- Public endpoints must stay limited to auth/bootstrap, device bootstrap, health, or webhooks.

## Red Flags

- `prisma.*.findMany()` without tenant scope on tenant-owned data
- `findUnique({ id })` followed by direct return without ownership check
- adding `userId` to request schemas for protected routes
- returning another account's existence through detailed errors
- pushing tenant checks only into the frontend

## Expected Pattern

1. Authenticate.
2. Derive tenant identity server-side.
3. Scope or assert ownership in Prisma access.
4. Return only tenant-safe data.
