# Dokku Auto-Deploy On Master Merge

Date: 2026-08-04  
Repo: `digital-shelf-saas`

## Summary

Greenfield production deploy for Digital Shelf SaaS on a Dokku VPS. Merges to `master` run lint, build, and test on a self-hosted GitHub Actions runner, then `git push` the same commit to a Dokku git remote so Dokku builds `apps/saas-server/Dockerfile` on the server and restarts the app.

This document is the complete ops and design reference for bootstrap, CI, secrets, verification, rollback, and deferred work (custom domain / TLS).

## Goals

- Deploy automatically when `master` is updated (typically via merged PR).
- Gate deploy on lint, build, and test on the self-hosted runner.
- Use idiomatic Dokku: git receive → Dockerfile build → release.
- Provision Postgres on the same Dokku host via the Postgres plugin.
- Document one-time server setup end-to-end for a greenfield box.
- Keep deploy credentials scoped to a per-app Dokku deploy key.

## Non-Goals (v1)

- Custom domain and Let's Encrypt (deferred; start on Dokku default HTTP hostname).
- Staging environment or multi-app promotion.
- Building/pushing images via a container registry.
- GitHub-hosted runners for deploy.
- Automatic database down-migrations or automated rollback of schema.
- Changing app runtime architecture (still one `saas-server` container + linked Postgres).

## Chosen Approach

**Classic Dokku git remote from a self-hosted Actions runner.**

| Decision | Choice |
| --- | --- |
| Trigger | Push / merge to `master` |
| Runner | Self-hosted only |
| Pre-deploy gate | `npm ci` → lint → build → test |
| Ship mechanism | `git push dokku HEAD:master` over SSH |
| Build location | Dokku server (Dockerfile builder) |
| Database | Dokku Postgres plugin, linked to the app |
| Public URL (v1) | Dokku default hostname, HTTP only |
| Secrets | `dokku config:set` on the server; deploy SSH key in GitHub Actions secrets |

### Why this approach

- Matches Dokku’s normal workflow and is easy to debug (`dokku logs`, failed builds on the VPS).
- Keeps CI identity as a deploy key, not a broad root SSH login.
- Reuses the existing production Dockerfile (migrate-on-start, port 8080, monorepo build).

## Architecture

```text
PR merge → push to master
        → self-hosted runner
            → checkout
            → npm ci / lint / build / test
            → SSH (deploy key) git push dokku@HOST:APP HEAD:master
        → Dokku
            → docker build -f apps/saas-server/Dockerfile (context: repo root)
            → link env (incl. DATABASE_URL from Postgres plugin)
            → run container
                → prisma migrate deploy
                → npm start (saas-server on 8080)
```

### Trust boundaries

- **GitHub → runner:** workflow runs only on the labeled self-hosted runner; secrets are Actions secrets.
- **Runner → Dokku:** SSH as `dokku@HOST` with a key registered via `dokku ssh-keys:add`. No root SSH required for deploys.
- **App config:** runtime secrets live only in Dokku config. The workflow does not inject `SESSION_SECRET`, billing keys, etc.

### Monorepo Dockerfile note

The production image is `apps/saas-server/Dockerfile` with **build context = repository root** (it `COPY`s root `package.json`, `apps/`, and `packages/`).

Configure Dokku:

```bash
dokku builder-dockerfile:set "$APP" dockerfile-path apps/saas-server/Dockerfile
```

Do **not** set `builder:set "$APP" build-dir apps/saas-server` — that would break root-relative `COPY` paths in the Dockerfile.

Force the Dockerfile builder if needed:

```bash
dokku builder:set "$APP" selected dockerfile
```

## Components And Deliverables

### In-repo (implementation follow-up)

| Artifact | Purpose |
| --- | --- |
| `.github/workflows/deploy.yml` | Test-gated deploy on `master` |
| README short “Production deploy” pointer | Link here; do not duplicate the runbook |
| This spec | Source of truth for ops and design |

### On Dokku (one-time)

| Resource | Purpose |
| --- | --- |
| Dokku app | Runs the SaaS container |
| Postgres service | Linked DB → `DATABASE_URL` |
| Dockerfile path config | Monorepo Dockerfile location |
| Proxy / ports | Map HTTP → container `8080` |
| Config/env | Secrets and public URL |
| Optional storage mount | Persist local frame files if not using S3 |
| Deploy SSH key | Authorize the Actions private key |

### GitHub Actions secrets

| Secret | Meaning |
| --- | --- |
| `DOKKU_SSH_PRIVATE_KEY` | PEM/OpenSSH private key for the Dokku deploy user |
| `DOKKU_HOST` | Hostname or IP reachable **from the self-hosted runner** |
| `DOKKU_APP` | Dokku app name (git remote path `dokku@HOST:APP`) |

Optional later: pin a runner label (e.g. `runs-on: [self-hosted, linux, dokku-deploy]`) if the host has multiple runners.

## One-Time Dokku Bootstrap

Replace placeholders:

- `APP` — e.g. `digital-shelf-saas`
- `DB` — e.g. `digital-shelf-saas-db`
- `HOST` — Dokku server hostname/IP
- `DEFAULT_HOST` — Dokku’s vhost for the app (from `dokku domains:report` after create)

Commands assume SSH access to the server as a user that can run `dokku` (often root or a sudoers user). Deploy itself uses the `dokku` git user.

### 1. Prerequisites on the VPS

- Dokku installed and working.
- Docker available (Dokku dependency).
- Postgres plugin installed:

```bash
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres
```

- Enough disk for Node image builds (monorepo `npm ci` + build is not tiny).
- Outbound network from the VPS for base image pulls (`node:22-alpine`).

### 2. Create app and database

```bash
APP=digital-shelf-saas
DB=digital-shelf-saas-db

dokku apps:create "$APP"
dokku postgres:create "$DB"
dokku postgres:link "$DB" "$APP"
```

Linking sets `DATABASE_URL` on the app. Confirm:

```bash
dokku config:show "$APP"
dokku postgres:info "$DB"
```

### 3. Builder and ports

```bash
dokku builder:set "$APP" selected dockerfile
dokku builder-dockerfile:set "$APP" dockerfile-path apps/saas-server/Dockerfile

# Map public HTTP port 80 to container port 8080 (matches Dockerfile EXPOSE / SERVER_PORT)
dokku ports:set "$APP" http:80:8080
```

Ensure the process listens on `8080` inside the container (repo default `SERVER_PORT=8080`). Set explicitly:

```bash
dokku config:set "$APP" SERVER_PORT=8080 SERVER_HOST=0.0.0.0 APP_MODE=cloud NODE_ENV=production
```

### 4. Public URL (v1 — default host, HTTP)

After app create, list domains:

```bash
dokku domains:report "$APP"
```

Set app URL to the HTTP default host Dokku assigned (example shape `http://digital-shelf-saas.HOST`):

```bash
dokku config:set "$APP" SERVER_PUBLIC_URL="http://YOUR_DEFAULT_HOST"
```

Steam callbacks, cookies, and absolute links depend on `SERVER_PUBLIC_URL`. Update this when you later attach a real domain and TLS.

### 5. Required and optional env

Generate strong secrets locally; set on Dokku (never commit them):

```bash
dokku config:set "$APP" \
  SESSION_SECRET="..." \
  MOBILE_TOKEN_SECRET="..."
```

Optional integrations (set when ready):

```bash
dokku config:set "$APP" \
  STEAM_API_KEY="..." \
  PAYPAL_CLIENT_ID="..." \
  PAYPAL_CLIENT_SECRET="..." \
  PAYPAL_WEBHOOK_ID="..." \
  APPLE_BUNDLE_ID="..." \
  APPLE_KEY_ID="..." \
  APPLE_ISSUER_ID="..." \
  APPLE_PRIVATE_KEY="..." \
  GOOGLE_PLAY_PACKAGE_NAME="..." \
  GOOGLE_SERVICE_ACCOUNT_JSON="..."
```

Frame storage:

- **S3 (recommended for multi-host / durable object storage):** set `FRAME_STORAGE_DRIVER=s3` and the `FRAME_STORAGE_*` bucket/endpoint/key vars from `.env.example`.
- **Local disk (simple single-VPS):** set `FRAME_STORAGE_DRIVER=local` and mount persistent storage so frames survive rebuilds:

```bash
mkdir -p /var/lib/dokku/data/storage/"$APP"/frames
chown dokku:dokku /var/lib/dokku/data/storage/"$APP"/frames
dokku storage:mount "$APP" /var/lib/dokku/data/storage/"$APP"/frames:/app/data/frames
dokku config:set "$APP" FRAME_STORAGE_DRIVER=local FRAME_STORAGE_PATH=/app/data/frames
```

### 6. Deploy SSH key for GitHub Actions

On a trusted machine (not the public repo):

```bash
ssh-keygen -t ed25519 -C "github-actions-dokku-$APP" -f ./dokku_deploy_key -N ""
```

On the Dokku server, install the **public** key:

```bash
dokku ssh-keys:add "github-actions-$APP" /path/to/dokku_deploy_key.pub
```

In the GitHub repo → Settings → Secrets and variables → Actions, create:

- `DOKKU_SSH_PRIVATE_KEY` — full contents of `dokku_deploy_key` (private)
- `DOKKU_HOST` — server host/IP as seen from the runner
- `DOKKU_APP` — same as `$APP`

Delete local copies of the private key after storing the secret, or keep them in a password manager only.

### 7. First manual smoke push (optional but recommended)

From a machine with the deploy key and git access:

```bash
git remote add dokku "dokku@${HOST}:${APP}"
GIT_SSH_COMMAND='ssh -i /path/to/dokku_deploy_key -o IdentitiesOnly=yes' \
  git push dokku master:master
```

Watch:

```bash
dokku logs "$APP" -t
dokku ps:report "$APP"
```

Hit `http://YOUR_DEFAULT_HOST/api/health` and confirm a healthy response.

## Self-Hosted Runner Requirements

The runner that executes `deploy.yml` must:

1. Be registered to this GitHub repo/org and idle with a `self-hosted` label (add extra labels if you pin them in the workflow).
2. Reach `DOKKU_HOST` on SSH port 22 (or your Dokku SSH port).
3. Have Node.js **≥ 20** (22 preferred; matches the Dockerfile) and npm 10+.
4. Provide Postgres for server tests the same way local dev does — typically:

```bash
docker compose up -d postgres
```

so tests can use `postgresql://digitalshelf:digitalshelf@localhost:5433/digitalshelf` (see README / `.env.example`).

5. Have Docker available if compose/Postgres is used on that host.
6. Use a clean workspace checkout per job (default Actions behavior).

If tests fail because Postgres is down, the workflow must not deploy. The workflow starts Compose Postgres and waits until it accepts connections before lint/build/test.

## GitHub Actions Workflow Design

File: `.github/workflows/deploy.yml`

Behavior:

- **on:** `push` branches: `[master]`
- **runs-on:** `self-hosted` (optionally a tighter label set)
- **steps (logical order):**
  1. `actions/checkout` (use full history if you ever need tags/blame; default depth is fine for `git push HEAD:master`)
  2. Setup Node 22 + npm cache
  3. `npm ci`
  4. Ensure Postgres for tests (`docker compose up -d postgres` + `pg_isready` wait)
  5. `npm run lint`
  6. `npm run build`
  7. `npm test` (server suite needs Postgres on `localhost:5433`)
  8. Write `DOKKU_SSH_PRIVATE_KEY` to a key file (`chmod 600`), `ssh-keyscan` host → `known_hosts`
  9. `git remote add dokku dokku@$DOKKU_HOST:$DOKKU_APP` (or `set-url` if re-run)
  10. `GIT_SSH_COMMAND=ssh -i … -o IdentitiesOnly=yes` → `git push dokku HEAD:refs/heads/master`

Rules:

- No Dokku push if any prior step fails.
- Do not echo private keys.
- Do not store runtime app secrets in Actions; only deploy SSH + host + app name.

### Example workflow sketch (implementation may adjust actions versions)

```yaml
name: Deploy
on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Start test Postgres
        run: |
          docker compose up -d postgres
          for i in $(seq 1 30); do
            if docker compose exec -T postgres pg_isready -U digitalshelf -d digitalshelf; then
              exit 0
            fi
            sleep 1
          done
          echo "Postgres did not become ready in time" >&2
          exit 1

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Deploy to Dokku
        env:
          DOKKU_SSH_PRIVATE_KEY: ${{ secrets.DOKKU_SSH_PRIVATE_KEY }}
          DOKKU_HOST: ${{ secrets.DOKKU_HOST }}
          DOKKU_APP: ${{ secrets.DOKKU_APP }}
        run: |
          set -euo pipefail
          KEY_FILE="${RUNNER_TEMP}/dokku_deploy_key"
          printf '%s\n' "$DOKKU_SSH_PRIVATE_KEY" > "$KEY_FILE"
          chmod 600 "$KEY_FILE"
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          ssh-keyscan -H "$DOKKU_HOST" >> ~/.ssh/known_hosts
          git remote remove dokku 2>/dev/null || true
          git remote add dokku "dokku@${DOKKU_HOST}:${DOKKU_APP}"
          export GIT_SSH_COMMAND="ssh -i ${KEY_FILE} -o IdentitiesOnly=yes"
          git push dokku HEAD:refs/heads/master
```

## Runtime Behavior After Deploy

On container start (Dockerfile `CMD`):

1. `npx prisma migrate deploy --schema apps/saas-server/prisma/schema.prisma`
2. `npm run start --workspace @digital-shelf-saas/server`

Implications:

- Schema migrations apply automatically on each successful new release boot.
- A bad migration can loop the container; fix forward with a corrective migration or repair `DATABASE_URL` / DB state, then redeploy.
- Prefer expand/contract migrations; avoid destructive one-shot drops without a backup.

Web assets: `saas-web` build output is included in the image under `apps/saas-server/public/` via the monorepo build.

Health check path: `GET /api/health`.

## Failure Modes

| Failure | Effect | What to do |
| --- | --- | --- |
| Lint/build/test fail | No `git push` to Dokku | Fix on a branch; merge again |
| Runner offline / wrong labels | Job queued or fails to start | Fix runner service/labels; re-run job |
| SSH / deploy key invalid | Push rejected | Check secrets, `dokku ssh-keys:list`, host reachability from runner |
| Dokku Docker build fails | Release aborted; previous app usually still running | `dokku logs` / build output; fix Dockerfile or deps; redeploy |
| `prisma migrate deploy` fails | New container unhealthy | Inspect DB, migrations, `DATABASE_URL`; fix forward; redeploy |
| App up but wrong URL/cookies | Auth redirects broken | Fix `SERVER_PUBLIC_URL` and related config |
| Tests fail: no Postgres on runner | Deploy blocked | Start compose Postgres; align `.env` / defaults with README |

## Rollback And Backups

### App rollback

Redeploy a known-good git SHA to Dokku:

```bash
GIT_SSH_COMMAND='ssh -i /path/to/dokku_deploy_key -o IdentitiesOnly=yes' \
  git push dokku <good-sha>:refs/heads/master
```

Or re-run the Actions workflow from that commit if GitHub allows workflow re-run on the historical SHA.

### Database

- Migrations are **forward-only** in normal operation; rolling back the app image does not undo migrations already applied.
- Before risky schema changes, export:

```bash
dokku postgres:export "$DB" > "backup-${APP}-$(date +%Y%m%d).sql"
```

- Restore only with a deliberate plan (`postgres:import`) and accept downtime.

## Verification Checklist

After bootstrap + first successful Actions deploy:

- [ ] GitHub Actions `Deploy` workflow is green on `master`
- [ ] `dokku ps:report "$APP"` shows processes running
- [ ] `dokku postgres:info "$DB"` shows linked service
- [ ] `curl -fsS "http://YOUR_DEFAULT_HOST/api/health"` succeeds
- [ ] `dokku logs "$APP"` shows migrate deploy + server listen, no crash loop
- [ ] `dokku config:show "$APP"` has `DATABASE_URL`, `SESSION_SECRET`, `MOBILE_TOKEN_SECRET`, `SERVER_PUBLIC_URL`
- [ ] (If local frames) storage mount present: `dokku storage:report "$APP"`

## Deferred: Domain And TLS

When ready (out of v1 automation scope):

1. Point DNS A/AAAA (or CNAME) at the Dokku host.
2. `dokku domains:set "$APP" your.domain.tld`
3. Install/enable letsencrypt plugin; obtain certs.
4. Update `SERVER_PUBLIC_URL` to `https://your.domain.tld`.
5. Re-check Steam return URLs and billing webhook URLs with the new origin.

## Implementation Plan Handoff

When implementing (separate plan/session):

1. Add `.github/workflows/deploy.yml` per this design.
2. Add a short README “Production / Dokku” section linking to this spec.
3. Operator executes the bootstrap section on the VPS and configures GitHub secrets.
4. Merge a small PR to `master` to validate the full path.
5. Record the real `APP`, `DB`, and default host in private ops notes (not necessarily in git).

## Success Criteria

- Merging to `master` deploys to Dokku without manual SSH git pushes.
- Failed tests never update production.
- A new environment can be brought up by following this document alone (plus Dokku install on a blank VPS).
- Runtime secrets never appear in the repo or workflow logs.
