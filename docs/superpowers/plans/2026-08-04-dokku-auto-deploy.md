# Dokku Auto-Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire test-gated automatic deploys to Dokku on every push to `master`, and leave operators with a complete bootstrap path documented in the approved spec.

**Architecture:** A single self-hosted GitHub Actions workflow runs `npm ci` → lint → build → test (with Compose Postgres), then `git push`es the same commit to `dokku@$DOKKU_HOST:$DOKKU_APP` over a deploy SSH key. Dokku builds `apps/saas-server/Dockerfile` with repo-root context. One-time VPS bootstrap (app, Postgres plugin, env, key) follows `docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md` and is executed by an operator, not by CI.

**Tech Stack:** GitHub Actions (self-hosted), Dokku Dockerfile builder, Dokku Postgres plugin, OpenSSH deploy keys, Node 22 / npm, Docker Compose (runner test DB)

**Spec:** `docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md`

## Global Constraints

- Trigger branch is `master` only (repo default).
- Runner is `self-hosted` only — do not use `ubuntu-latest` for deploy.
- Deploy mechanism is `git push dokku HEAD:refs/heads/master` — no registry, no `dokku git:sync` admin SSH.
- Dockerfile path on Dokku must be `apps/saas-server/Dockerfile`; do **not** set `build-dir` to `apps/saas-server`.
- Runtime secrets (`SESSION_SECRET`, billing keys, etc.) live only in `dokku config` — never in Actions secrets or the workflow file.
- Actions secrets are only: `DOKKU_SSH_PRIVATE_KEY`, `DOKKU_HOST`, `DOKKU_APP`.
- Domain + Let's Encrypt are out of scope for this plan (HTTP default Dokku host only).
- Do not duplicate the ops runbook in README — link to the spec.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `.github/workflows/deploy.yml` | CI gate + Dokku git push on `master` |
| `README.md` | Short Production subsection pointing at the deploy spec |
| `docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md` | Already written — operator source of truth (bootstrap, rollback, verification) |
| `docs/superpowers/plans/2026-08-04-dokku-auto-deploy.md` | This plan |

No application source, Dockerfile, or Prisma changes are required for v1.

---

### Task 1: Create feature branch for in-repo deploy wiring

**Files:**
- None (git only)

**Interfaces:**
- Consumes: approved spec on `master`
- Produces: working branch `feat/dokku-auto-deploy` based on current `master`

- [ ] **Step 1: Create and check out the branch**

```bash
cd /Users/rdeeb/Development/digital-shelf-saas
git checkout master
git pull --ff-only origin master
git checkout -b feat/dokku-auto-deploy
```

Expected: branch `feat/dokku-auto-deploy` checked out.

- [ ] **Step 2: Confirm clean starting point for workflow work**

```bash
git status
ls docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md
```

Expected: design spec present. Unrelated local changes (e.g. `package-lock.json`) must not be staged in later commits unless intentionally included.

- [ ] **Step 3: Commit this implementation plan on the feature branch**

```bash
git add docs/superpowers/plans/2026-08-04-dokku-auto-deploy.md
git commit -m "$(cat <<'EOF'
docs: add Dokku auto-deploy implementation plan

Task-by-task plan for workflow, README link, and operator bootstrap.
EOF
)"
```

---

### Task 2: Add the Deploy GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: GitHub secrets `DOKKU_SSH_PRIVATE_KEY`, `DOKKU_HOST`, `DOKKU_APP` (configured in Task 4)
- Produces: workflow that on `push` to `master` runs lint/build/test then pushes to Dokku

- [ ] **Step 1: Create the workflows directory if missing**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write `.github/workflows/deploy.yml`**

Create the file with exactly this content:

```yaml
name: Deploy

on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Start test Postgres
        run: |
          set -euo pipefail
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
          if [ -z "${DOKKU_SSH_PRIVATE_KEY:-}" ] || [ -z "${DOKKU_HOST:-}" ] || [ -z "${DOKKU_APP:-}" ]; then
            echo "Missing DOKKU_SSH_PRIVATE_KEY, DOKKU_HOST, or DOKKU_APP secret" >&2
            exit 1
          fi
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

- [ ] **Step 3: Validate YAML parses**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('ok')"
```

Expected: `ok`

If PyYAML is missing:

```bash
python3 -c "import json,sys; from pathlib import Path; print('skip-pyyaml'); Path('.github/workflows/deploy.yml').read_text()"
```

Then install and re-run the parse check:

```bash
pip3 install pyyaml
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "$(cat <<'EOF'
ci: add self-hosted Dokku deploy workflow on master

Gate deploy on lint, build, and test, then git push to the Dokku app remote.
EOF
)"
```

---

### Task 3: Point README Production section at the deploy spec

**Files:**
- Modify: `README.md` (after the existing `## Production` / Docker sections, before `## Useful Commands`)

**Interfaces:**
- Consumes: spec path `docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md`
- Produces: discoverable link from README without duplicating bootstrap commands

- [ ] **Step 1: Insert the Dokku subsection into README**

In `README.md`, immediately after the “Local production-style compose run” subsection (after the paragraph that ends with “reads optional env values from `.env`.”) and before `## Useful Commands`, insert:

```markdown
### Dokku production deploy

Merges to `master` deploy via a self-hosted GitHub Actions workflow that runs lint, build, and test, then `git push`es to Dokku.

One-time server bootstrap, secrets, runner requirements, rollback, and verification are documented in:

[`docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md`](docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md)
```

- [ ] **Step 2: Verify the link target exists**

```bash
test -f docs/superpowers/specs/2026-08-04-dokku-auto-deploy-design.md && echo exists
```

Expected: `exists`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: link README production section to Dokku deploy spec

Keep the runbook in the design doc; README only points operators there.
EOF
)"
```

---

### Task 4: Operator bootstrap on Dokku + GitHub secrets

**Files:**
- None in git (server + GitHub settings only)

**Interfaces:**
- Consumes: deploy key material; Dokku host with Dokku installed
- Produces: running (or ready) Dokku app + Actions secrets so Task 2’s workflow can push

This task is performed by a human with SSH to the VPS and admin access to the GitHub repo. Follow the spec sections “One-Time Dokku Bootstrap” and “GitHub Actions secrets” verbatim; commands below are the checklist copy.

- [ ] **Step 1: Install Postgres plugin if missing**

On the VPS:

```bash
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres
```

Expected: plugin reports installed / already installed.

- [ ] **Step 2: Create app and linked database**

```bash
APP=digital-shelf-saas
DB=digital-shelf-saas-db

dokku apps:create "$APP"
dokku postgres:create "$DB"
dokku postgres:link "$DB" "$APP"
dokku config:show "$APP"
```

Expected: `DATABASE_URL` present in config output.

- [ ] **Step 3: Configure Dockerfile builder and HTTP→8080 ports**

```bash
dokku builder:set "$APP" selected dockerfile
dokku builder-dockerfile:set "$APP" dockerfile-path apps/saas-server/Dockerfile
dokku ports:set "$APP" http:80:8080
dokku config:set "$APP" SERVER_PORT=8080 SERVER_HOST=0.0.0.0 APP_MODE=cloud NODE_ENV=production
```

- [ ] **Step 4: Set `SERVER_PUBLIC_URL` from Dokku default domain**

```bash
dokku domains:report "$APP"
dokku config:set "$APP" SERVER_PUBLIC_URL="http://YOUR_DEFAULT_HOST"
```

Replace `YOUR_DEFAULT_HOST` with the hostname from `domains:report` (no trailing slash).

- [ ] **Step 5: Set required runtime secrets**

```bash
dokku config:set "$APP" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  MOBILE_TOKEN_SECRET="$(openssl rand -hex 32)"
```

Set optional Steam/billing/storage vars when ready (see spec §5). For local frames on a single VPS, also apply the storage mount block from the spec.

- [ ] **Step 6: Create deploy key and register with Dokku**

On a trusted machine:

```bash
APP=digital-shelf-saas
ssh-keygen -t ed25519 -C "github-actions-dokku-$APP" -f ./dokku_deploy_key -N ""
```

Copy `dokku_deploy_key.pub` to the VPS, then:

```bash
dokku ssh-keys:add "github-actions-$APP" /path/to/dokku_deploy_key.pub
dokku ssh-keys:list
```

Expected: key name `github-actions-digital-shelf-saas` (or your `$APP`) listed.

- [ ] **Step 7: Add GitHub Actions repository secrets**

In the GitHub repo → Settings → Secrets and variables → Actions, create:

| Name | Value |
| --- | --- |
| `DOKKU_SSH_PRIVATE_KEY` | Full contents of `dokku_deploy_key` (private key) |
| `DOKKU_HOST` | Hostname or IP reachable from the self-hosted runner |
| `DOKKU_APP` | `digital-shelf-saas` (or your chosen `$APP`) |

- [ ] **Step 8: Confirm self-hosted runner is online**

In GitHub → Settings → Actions → Runners: runner shows Idle/Online with `self-hosted` label. Runner host can `ssh -i dokku_deploy_key dokku@$DOKKU_HOST` (or equivalent) and has Docker + Node 22 for the workflow.

- [ ] **Step 9: Optional manual smoke push before CI**

From a machine with the deploy key and a checkout of `master` (or this feature branch once merged):

```bash
HOST=YOUR_DOKKU_HOST
APP=digital-shelf-saas
git remote remove dokku 2>/dev/null || true
git remote add dokku "dokku@${HOST}:${APP}"
GIT_SSH_COMMAND='ssh -i ./dokku_deploy_key -o IdentitiesOnly=yes' \
  git push dokku HEAD:refs/heads/master
dokku logs "$APP" -t
```

Expected: build succeeds; `curl -fsS "http://YOUR_DEFAULT_HOST/api/health"` returns success.

- [ ] **Step 10: Secure key material**

Remove or vault local `dokku_deploy_key` private key copies after the GitHub secret is stored. Do not commit key files.

---

### Task 5: Merge workflow branch and verify end-to-end deploy

**Files:**
- None new (merge + observe CI)

**Interfaces:**
- Consumes: Tasks 2–4 complete
- Produces: green `Deploy` workflow on `master` and healthy Dokku app

- [ ] **Step 1: Push the feature branch and open a PR**

```bash
git push -u origin feat/dokku-auto-deploy
gh pr create --title "ci: Dokku auto-deploy on master" --body "$(cat <<'EOF'
## Summary
- Add self-hosted Actions workflow: lint/build/test then git push to Dokku
- Link README Production section to the Dokku deploy design/runbook

## Test plan
- [ ] Operator bootstrap (app, Postgres, secrets, deploy key) complete per spec
- [ ] Merge to master and confirm Deploy workflow is green
- [ ] `curl` `/api/health` on Dokku default host succeeds
- [ ] `dokku logs` shows migrate deploy + server start
EOF
)"
```

- [ ] **Step 2: Merge the PR to `master`**

```bash
gh pr merge --merge
```

(Or merge via GitHub UI.)

- [ ] **Step 3: Watch the Deploy workflow on `master`**

```bash
gh run watch
```

Or: GitHub → Actions → Deploy → latest run on `master`.

Expected: all steps green, including Deploy to Dokku.

- [ ] **Step 4: Verify production health**

On the VPS (replace placeholders):

```bash
APP=digital-shelf-saas
DB=digital-shelf-saas-db
dokku ps:report "$APP"
dokku postgres:info "$DB"
curl -fsS "http://YOUR_DEFAULT_HOST/api/health"
dokku logs "$APP" --num 80
```

Expected checklist (from spec):

- [ ] Workflow green on `master`
- [ ] `ps:report` shows running processes
- [ ] Postgres linked
- [ ] `/api/health` succeeds
- [ ] Logs show migrate deploy + listen, no crash loop
- [ ] Config has `DATABASE_URL`, `SESSION_SECRET`, `MOBILE_TOKEN_SECRET`, `SERVER_PUBLIC_URL`

- [ ] **Step 5: Confirm failure gate (optional but recommended)**

Temporarily break a test on a branch, merge only if you intend to prove the gate — prefer a dry run by inspecting the workflow: Deploy step must not run if Test fails. Do not leave `master` red; revert any intentional break immediately.

---

## Spec Coverage Self-Review

| Spec requirement | Task |
| --- | --- |
| `.github/workflows/deploy.yml` test-gated push | Task 2 |
| Self-hosted runner only | Task 2 (`runs-on: self-hosted`) |
| Lint → build → test → deploy order | Task 2 |
| Compose Postgres + readiness wait | Task 2 |
| Secrets: only SSH/host/app | Task 2 + Task 4 |
| README pointer, no duplicated runbook | Task 3 |
| Greenfield Dokku bootstrap (app, Postgres, builder, ports, env, key) | Task 4 |
| Optional local frame storage | Task 4 Step 5 → spec §5 |
| Manual smoke + verification checklist | Task 4 Step 9 + Task 5 Step 4 |
| Domain/TLS deferred | Global Constraints + not tasked |

No placeholder TBD/TODO left in tasks. No app code changes required.
