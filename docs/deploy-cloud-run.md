# Deploy CraveCart on Google Cloud Run (Cloud Run–first)

This document matches the three-service layout from [docker-compose.yml](../docker-compose.yml): **Next.js web**, **youtube-mcp**, and **kroger-mcp**. The automated path is [cloudbuild.yaml](../cloudbuild.yaml) (build, push, deploy, sync OAuth redirect URLs).

## Sidecar network security (not public)

Only **`cravecart-web`** stays **public** (unauthenticated ingress for the UI). **YouTube MCP** and **Kroger MCP** must not be anonymously callable from the internet:

- **Cloud Run MCPs** (`cravecart-youtube-mcp`, and `cravecart-kroger-mcp` if used): **no** `--allow-unauthenticated`; only identities with **`roles/run.invoker`** reach the service. **`cravecart-web`** uses Google **ID tokens** (see [`lib/server/sidecarGatewayFetch.ts`](../lib/server/sidecarGatewayFetch.ts)).
- **Fly Kroger MCP**: not on GCP IAM. The app requires **`Authorization: Bearer <INTERNAL_SIDECAR_SECRET>`**, and Fly must have the same secret as Secret Manager / **`.env`** for local docker (see [`kroger-mcp/internal_gate.py`](../kroger-mcp/internal_gate.py)).
- **`INTERNAL_SIDECAR_SECRET`**: never shipped to the browser; only server-side `fetch` attaches it.

`allowed_hosts=["*"]` **does not** make services public—it only disables strict `Host`-header rejects behind proxies (`*.run.app`, docker service names).

## Credentials: `.env` (local) vs Secret Manager (prod)

| Scope | Kroger/Gemini/YouTube keys |
| ----- | -------------------------- |
| **Local / Docker Compose** | Repo-root `.env` (from [.env.example](../.env.example)); never committed with real prod secrets |
| **Cloud Run (this pipeline)** | [Secret Manager](https://console.cloud.google.com/security/secret-manager) referenced in `cloudbuild.yaml` (`--set-secrets`) |
| **Fly.io (hybrid Kroger MCP)** | Not deployed by Cloud Build. Use [`kroger-mcp/deploy-fly.ps1`](../kroger-mcp/deploy-fly.ps1) with **`-FromGcpSecretManager`** so Fly gets the same **`INTERNAL_SIDECAR_SECRET`**, `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` as GCP |

Do **not** use `-UseParentEnv` for production Fly deployments; it reads `.env`, which often holds dev-only Kroger apps and mismatches Kroger Developer redirect URIs.

## Architecture

| Service              | Cloud Run name              | Port | Purpose                          |
| -------------------- | --------------------------- | ---- | -------------------------------- |
| Web (Next.js)        | `cravecart-web`             | 3000 | UI, `/api/chat` SSE, Gemini, MCP client |
| YouTube MCP sidecar  | `cravecart-youtube-mcp`     | 8100 | YouTube tools + `/health`        |
| Kroger MCP sidecar   | `cravecart-kroger-mcp`      | 8000 | Kroger MCP on Cloud Run (optional if Kroger MCP lives on Fly; omit deploy via `_EXTERNAL_KROGER_SIDECAR_URL` in [`cloudbuild.yaml`](../cloudbuild.yaml)) |

After deployment, the build sets on **web** (and **kroger-mcp**, when deployed on Cloud Run):

- `APP_BASE_URL` = public `https://…run.app` URL of the web service  
- `KROGER_REDIRECT_URI` = `{APP_BASE_URL}/auth/kroger/callback`

Register **exactly** that redirect URI in the Kroger developer console.

## One-time GCP setup

1. **Enable APIs** (replace `PROJECT_ID`):

   ```bash
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
   ```

2. **Artifact Registry** (must match `cloudbuild.yaml` substitutions `_AR_HOSTNAME` / `_AR_REPO` and deploy region):

   ```bash
   gcloud artifacts repositories create cravecart \
     --repository-format=docker \
     --location=us-central1 \
     --description="CraveCart images"
   ```

3. **Secrets** in Secret Manager (version `latest` is what Cloud Run references):

   | Secret name                 | Used by |
   | --------------------------- | ------- |
   | `GEMINI_API_KEY`            | web |
   | `YOUTUBE_API_KEY`           | web + `cravecart-youtube-mcp` |
   | `KROGER_CLIENT_ID`          | web (+ `cravecart-kroger-mcp` if that service exists) |
   | `KROGER_CLIENT_SECRET`      | web (+ `cravecart-kroger-mcp` if that service exists) |
   | `INTERNAL_SIDECAR_SECRET`   | **`cravecart-web`** (outbound auth) + **Fly Kroger MCP** (bearer gate). Create once, e.g. `openssl rand -base64 32 \| gcloud secrets create INTERNAL_SIDECAR_SECRET --data-file=-` |

   Grant the Cloud Run **runtime** service account **`roles/secretmanager.secretAccessor`** on `INTERNAL_SIDECAR_SECRET`.

   Example:

   ```bash
   echo -n "YOUR_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
   ```

4. **IAM**

   - Cloud Build default service account (`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`): grant **Cloud Run Admin**, **Artifact Registry Writer**, and **Service Account User** on the Cloud Run **runtime** service account (default is the project’s compute service account).
   - Cloud Run runtime service account: grant **Secret Manager Secret Accessor** on each secret used in deploy flags.

## Deploy with Cloud Build

Align `_AR_HOSTNAME` with where you deploy Cloud Run (e.g. `us-central1` → `us-central1-docker.pkg.dev`). Bash deploy steps pin `us-central1`; change [`cloudbuild.yaml`](../cloudbuild.yaml) if you use another region.

Set `_KROGER_LOCATION_ID` to your Kroger store location (required for product search). Ensure **API + `INTERNAL_SIDECAR_SECRET`** exist in Secret Manager (see table above).

Hybrid Kroger MCP on Fly requires **`_EXTERNAL_KROGER_SIDECAR_URL=https://YOUR_APP.fly.dev`** on each **`gcloud builds submit`** (no production hostname checked into the repo defaults).

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_AR_HOSTNAME=us-central1-docker.pkg.dev,_AR_REPO=cravecart,_KROGER_LOCATION_ID=YOUR_LOCATION_ID,_EXTERNAL_KROGER_SIDECAR_URL=https://YOUR_APP.fly.dev
```

On **PowerShell**, wrap substitutions in **single quotes** so commas do not split the argument (otherwise `_AR_HOSTNAME` can silently absorb the rest of the flags and break the build):

```powershell
gcloud builds submit --config=cloudbuild.yaml `
  '--substitutions=_AR_HOSTNAME=us-central1-docker.pkg.dev,_AR_REPO=cravecart,_KROGER_LOCATION_ID=YOUR_LOCATION_ID,_EXTERNAL_KROGER_SIDECAR_URL=https://YOUR_APP.fly.dev'
```

After the first deploy, copy the printed redirect URI into the Kroger app settings.

### Hybrid Kroger on Fly (`_EXTERNAL_KROGER_SIDECAR_URL` substitution)

Set Fly’s **HTTPS origin** (**`https://YOUR_APP.fly.dev`**, no `/mcp/`) via Cloud Build substitutions every deploy (substitution defaults to empty in-repo).

Effects when non-empty:

- **`deploy-web`** sets `KROGER_SIDECAR_URL` / `KROGER_MCP_URL` to that origin.
- **`deploy-kroger-mcp`** and **`sync-public-urls`** skip Cloud Run **`cravecart-kroger-mcp`**.

Per-submit override (different Fly app):

```powershell
gcloud builds submit --config=cloudbuild.yaml `
  '--substitutions=_AR_HOSTNAME=us-central1-docker.pkg.dev,_AR_REPO=cravecart,_KROGER_LOCATION_ID=YOUR_LOCATION,_EXTERNAL_KROGER_SIDECAR_URL=https://OTHER_APP.fly.dev'
```

Returning Kroger MCP to **Cloud Run** only (not Fly): edit [`cloudbuild.yaml`](../cloudbuild.yaml) **`_EXTERNAL_KROGER_SIDECAR_URL`** to **`""`**, recreate/deploy **`cravecart-kroger-mcp`** on Cloud Run so **`describe`** works, then run the pipeline again.

The image **build/push for `kroger-mcp`** still runs so the Dockerfile stays reproducible locally and for Fly builds; Artifact Registry retention is negligible vs an always-on Cloud Run instance.

### Cloud Run `cravecart-kroger-mcp` (optional / legacy)

This project has migrated Kroger MCP to Fly by default and may have deleted **`cravecart-kroger-mcp`** on Cloud Run for cost savings. Keep **`_EXTERNAL_KROGER_SIDECAR_URL`** non-empty unless you recreate that service **and** clear the substitution above.

### Scaling defaults in `cloudbuild.yaml`

| Service           | `min-instances` | `max-instances` | Notes                                              |
| ----------------- | --------------- | --------------- | -------------------------------------------------- |
| web               | 0               | **1**           | Avoids split in-memory agent state across instances |
| kroger-mcp (GCP) | 0               | **1**           | Legacy Cloud Run path only; skipped when Kroger MCP is external (Fly). |
| youtube-mcp       | 0               | **1**           | Lowest idle cost; first YouTube MCP call after idle may cold-start. |

Fly [`kroger-mcp/fly.toml`](../kroger-mcp/fly.toml) uses **`min_machines_running = 0`** — machine can stop when idle (session files stay on the volume).

**Before a demo**, after idle time run one **full craving** flow (including YouTube and Kroger) so stacked cold starts are done, or expect the **first** request after long idle to be slower.

Increasing **`cravecart-web` `max-instances` above 1** without a shared session store can cause users to lose agent carry-over state when load balancing sends them to another instance. See **Scaling follow-up** below.

### Request timeout

`cravecart-web` is deployed with `--timeout 3600` so long SSE agent turns can finish.

### Optional: custom domain

Map a domain to `cravecart-web` in Cloud Run, then update env:

- `APP_BASE_URL=https://your.domain`
- `KROGER_REDIRECT_URI=https://your.domain/auth/kroger/callback`

…and update the Kroger console to the same redirect.

## Local verification after infra changes

- `pnpm install && pnpm build` (or Docker `docker compose build web && docker compose up`).
- Open `/api/health` and confirm sidecars respond when URLs in `.env` match your local or compose network.

## Observability

- **Logs**: Cloud Logging for each Cloud Run service (stdout/stderr).
- **Uptime**: configure a check against `GET https://<web-url>/api/health`.
- **Revision metadata**: the web service exposes `revision`, `gitSha` (when `GIT_SHA` is set at deploy), and `service` in the JSON from `/api/health` (see [app/api/health/route.ts](../app/api/health/route.ts)).

## Scaling follow-up (when `max-instances` must exceed 1 on web)

Today, [lib/agent/sessionState.ts](../lib/agent/sessionState.ts) keeps agent tool carry-over in a **process-local `Map`**. Plans for horizontal scale:

1. **Web**: Introduce a small adapter backed by **Memorystore (Redis)** or **Firestore** keyed by `cravecart_session` cookie id; replace get/set in `sessionState.ts` with async I/O while keeping the same shapes.
2. **Kroger MCP**: Session JSON under `data/sessions` is on **ephemeral** disk on Cloud Run. Options: **Cloud Run volume** (where available), **GCS** with per-session objects, or **Firestore**; keep the same file-like API in `kroger-mcp/app.py` behind a storage abstraction.

Until then, keep **`max-instances: 1`** on `cravecart-web` for correct multi-user isolation of agent state under load.

## Troubleshooting

- **`The following reserved env names were provided: K_SERVICE`**: Do not set `K_SERVICE` (or `K_REVISION`, `PORT`, etc.) in `--set-env-vars`. Cloud Run injects them; `/api/health` still reads `K_SERVICE` correctly.
- **`Setting IAM policy failed` / public URL returns 403**: Run the suggested `gcloud beta run services add-iam-policy-binding … --member=allUsers --role=roles/run.invoker` per service, or allow unauthenticated ingress in the Console if your org policy permits it.
- **`Access Denied` (Akamai HTML) on `GET .../v1/products` from prod, but localhost works**: Kroger’s CDN often treats **Google Cloud egress** differently from home/residential IPs. OAuth and cart can succeed while **catalog search** fails. Mitigation below.

### Hybrid: Kroger MCP **outside** Cloud Run (recommended workaround)

Keep **Next.js + YouTube MCP** on Cloud Run as today. Deploy **`kroger-mcp` only** to a host with **different network egress** (e.g. **[Fly.io](https://fly.io)**), then point the web service at it.

1. Install the Fly CLI (`flyctl`) and run **`flyctl auth login`** (browser flow).
2. **Windows (recommended):** use the **same** Kroger secrets as Cloud Run (`gcloud auth` required):

   ```powershell
   cd kroger-mcp
   .\deploy-fly.ps1 `
     -KrogerRedirectUri "https://YOUR_WEB_SERVICE.run.app/auth/kroger/callback" `
     -FromGcpSecretManager `
     -GcpProject YOUR_GCP_PROJECT_ID
   ```

   Omit `-FromGcpSecretManager` to type ID/secret at prompts (fine for experiments). Optionally pass `-KrogerLocationId` if `cravecart-web` env cannot be read. **`-UseParentEnv`** reads repo `.env` and is **dev-only** — do not rely on it for prod.

   If the global name `cravecart-kroger-mcp` is taken, use `-AppName your-unique-name` (writes `fly.toml`).

   The first `fly deploy` can create the volume from **`[mounts]` + `initial_size`** in `fly.toml`; if deploy asks for a volume, create one in the same region as `primary_region`.

3. **Manual path:** edit `app` in [`kroger-mcp/fly.toml`](../kroger-mcp/fly.toml) if needed, then from `kroger-mcp/` set secrets to match prod Kroger registration (same **redirect URI** as your Cloud Run web app):

   ```bash
   fly secrets set \
     KROGER_CLIENT_ID=YOUR_ID \
     KROGER_CLIENT_SECRET=YOUR_SECRET \
     KROGER_REDIRECT_URI=https://YOUR_WEB_SERVICE.run.app/auth/kroger/callback \
     KROGER_LOCATION_ID=YOUR_LOCATION_ID \
     INTERNAL_SIDECAR_SECRET=YOUR_INTERNAL_SECRET
   ```

4. `fly deploy` from `kroger-mcp/`. Confirm Kroger MCP is up (**`/health` is not anonymous** anymore):

   ```powershell
   $t = "<paste INTERNAL_SIDECAR_SECRET value>"
   curl.exe -sS -H "Authorization: Bearer $t" "https://YOUR_APP.fly.dev/health"
   ```

   Expect JSON with **`"ok": true`**.

   **Verify Fly matches Secret Manager:** the VM’s Kroger **`client_id`** must be the **same string** as in GCP Secret Manager (`KROGER_CLIENT_ID` used by `cravecart-web`). If Fly still has an old dev id from `.env`, Kroger OAuth can fail with `redirect_uri did not match` even when Kroger Developer is configured correctly.

   On **Windows / PowerShell**, use `--pty=false` so SSH does not complain about allocating a pseudo-TTY:

   ```bash
   fly ssh console -a YOUR_FLY_APP -q --pty=false -C "printenv KROGER_CLIENT_ID"
   ```

   Replace `cravecart-kroger-mcp` with your `fly.toml` `app` name if different. PowerShell sometimes prints a benign PTY/`handle is invalid` line after stdout; rely on the printed `client_id` line above it.

   Compare that output with:

   ```powershell
   gcloud secrets versions access latest --secret=KROGER_CLIENT_ID --project=YOUR_GCP_PROJECT_ID
   ```

   You can use the same `fly ssh … -C "printenv …"` pattern for **`KROGER_REDIRECT_URI`** (it must be exactly `https://<your-live-web-host>/auth/kroger/callback`).

5. On **Cloud Run** `cravecart-web`, override sidecar URLs (Console → Edit deployment → Variables, or CLI):

   - `KROGER_SIDECAR_URL` = `https://YOUR_APP.fly.dev` (no trailing path)
   - `KROGER_MCP_URL` = same origin; the web app normalizes `…/mcp/` internally (e.g. set `https://YOUR_APP.fly.dev`).

6. Deploy **`cravecart-web`** with **`_EXTERNAL_KROGER_SIDECAR_URL`** (see **Hybrid Kroger on Fly**). Delete **`cravecart-kroger-mcp`** on Cloud Run once if unused (**`gcloud run services delete`** in `us-central1`).

   With **`KROGER_SIDECAR_URL`** / **`KROGER_MCP_URL`** pointing at Fly, **`deploy-fly.ps1 -FromGcpSecretManager`**, and Kroger Developer redirect URIs aligned, production Kroger OAuth and catalog calls should succeed end-to-end.

**Notes:** Kroger redirects the **browser** to your **web** `/auth/kroger/callback`; the browser never needs to hit Fly for OAuth UI. Sessions and MCP tools must reach Fly (`X-CraveCart-Session` header), so keep Fly reachable from the internet. **`min_machines_running = 0`** scales the Fly machine down when idle (cheaper); the first Kroger MCP request after idle may cold-start.

## Continuous deployment from `main` (GitHub Actions)

The workflow [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml) runs when **`main`** is pushed (and can be **[Run workflow](https://docs.github.com/en/actions/using-workflows/manually-running-a-workflow)** manually). It submits **[`cloudbuild.yaml`](../cloudbuild.yaml)** from the repo checkout, then syncs Kroger MCP to Fly using **[`kroger-mcp/deploy-fly-ci.sh`](../kroger-mcp/deploy-fly-ci.sh)** (`gcloud`/Secret Manager → `flyctl secrets set` → `flyctl deploy`). Order is intentional: **`cravecart-web`** must reach the **`sync-public-urls`** revision first so Kroger redirects come from **`gcloud run services describe cravecart-web`** before Fly publishes **`KROGER_REDIRECT_URI`**.

### One-time repo configuration (GitHub)

**Repository Variables** (**Settings → Secrets and variables → Actions → Variables**):

| Variable | Example | Purpose |
| -------- | ------- | ------- |
| `GCP_PROJECT_ID` | `youtube-recipe-494816` | Project passed to **`gcloud builds submit`** |
| `KROGER_LOCATION_ID` | `01400513` | Substitution for **`_KROGER_LOCATION_ID`** in Cloud Build (must match Kroger/store config) |
| `EXTERNAL_KROGER_SIDECAR_URL` | `https://cravecart-kroger-mcp.fly.dev` | Substitution for **`_EXTERNAL_KROGER_SIDECAR_URL`** (Fly origin **without** `/mcp/`). |
| `FLY_ORG` | _(omit)_ → `personal` | Only if **`flyctl apps create`** cannot default your org slug when bootstrapping a new Fly app. |
| `KROGER_API_HOST` | _empty or_ `api-ce.kroger.com` | Optional; forwarded as **`_KROGER_API_HOST`** (_empty_ ⇒ production Kroger API) |
| `GCP_USE_WIF` | `true` or omit | **`true`** uses Workload Identity below; omit or **`false`** uses a stored JSON service account |

**Secrets** (**Actions → Secrets**):

| Secret | When |
| ------ | ----- |
| `FLY_API_TOKEN` | Always. Create via **`fly tokens create`** scoped to deploy. |
| `GCP_SA_KEY` | If **`GCP_USE_WIF`** is not **`true`** — JSON key for an SA that may **submit builds** (**`roles/cloudbuild.builds.editor`** or **`roles/run.admin`** + Artifact Registry **`writer`**, plus **`roles/iam.serviceAccountUser`** on the Cloud Build / runtime principals your project expects). If you use **`deploy-fly-ci.sh`**, the same principal must **`secretAccessor`** on **`KROGER_CLIENT_ID`**, **`KROGER_CLIENT_SECRET`**, **`INTERNAL_SIDECAR_SECRET`** (optional **`KROGER_LOCATION_ID`**), matching local **`deploy-fly.ps1 -FromGcpSecretManager`** expectations. Mirrors what you already use locally for **`gcloud builds submit`**. |

**Workload Identity Federation** (recommended over long-lived SA keys):

| Secret | Value |
| ------ | ----- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource (`projects/.../locations/global/workloadIdentityPools/...` / `providers/...`) |
| `GCP_SERVICE_ACCOUNT` | **`name@YOUR_PROJECT_ID.iam.gserviceaccount.com`** to impersonate from GitHub |

Set **`GCP_USE_WIF=true`** after following [Google’s “Configure Workload Identity Federation”](https://github.com/google-github-actions/auth/blob/main/README.md).

### How this stays in sync with GCP Secret Manager

| Surface | Mechanism |
| ------- | --------- |
| **Cloud Run (`cravecart-web`, MCPs)** | [`cloudbuild.yaml`](../cloudbuild.yaml) **`--set-secrets …=SECRET_NAME:latest`**. Containers receive env vars from mounted Secret Manager payloads (no plaintext values in YAML). Rotate by adding Secret Manager versions; redeploy pulls **`latest`** (usually what you want for CI/CD). |
| **Fly Kroger MCP** | [`kroger-mcp/deploy-fly-ci.sh`](../kroger-mcp/deploy-fly-ci.sh) runs **`gcloud secrets versions access`** for **`KROGER_CLIENT_*`**, **`INTERNAL_SIDECAR_SECRET`**, optionally **`KROGER_LOCATION_ID`**, then **`fly secrets import`** on each **`main`** deploy so Fly stays aligned with GCP. **`INTERNAL_SIDECAR_SECRET`** must be the **same logical value** GCP uses for **`cravecart-web`** (`--set-secrets INTERNAL_SIDECAR_SECRET=INTERNAL_SIDECAR_SECRET:latest`). |
| **`KROGER_LOCATION_ID`** | Prefer the Cloud Build **`_KROGER_LOCATION_ID`** substitution (GitHub **`KROGER_LOCATION_ID`** repo variable → deploy env); the script falls back to **Secret Manager secret** `KROGER_LOCATION_ID` or the live **`cravecart-web`** env if present. |

### Security notes (reasonable defaults)

- **Trusted path only**: **`deploy-main`** triggers on **`push` to `main`** (maintainer merges), so untrusted forks do not automatically receive **`GCP_*` / `FLY_*`** secrets on PRs — see [GitHub Actions secret availability](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#using-secrets-in-a-workflow). The lightweight [**`ci-deploy-infra-scripts.yml`**](../.github/workflows/ci-deploy-infra-scripts.yml) runs on PRs without credentials.
- **Prefer Workload Identity Federation** (**`GCP_USE_WIF=true`**) instead of **`GCP_SA_KEY`**: OIDC exchanges short-lived GCP tokens (`id-token` permission enables this); long‑lived JSON keys increase blast radius if leaked.
- **Grant least IAM to the CI identity**: e.g. **submit Cloud Build**, **Artifact Registry Writer**, **`serviceAccountUser`** as your project requires, plus **`secretmanager.secretAccessor`** only on the secrets the Fly sync script reads (**`KROGER_CLIENT_ID`**, **`KROGER_CLIENT_SECRET`**, **`INTERNAL_SIDECAR_SECRET`**, optional **`KROGER_LOCATION_ID`**). Avoid **`roles/editor`** or **`roles/owner`** on the key or SA.
- **Fly**: [`deploy-fly-ci.sh`](../kroger-mcp/deploy-fly-ci.sh) publishes secrets via **stdin** to **`fly secrets import`** so values are less likely than **`fly secrets set`** to appear in **`ps`**/`argv`; still treat tokens as sensitive (masked **`FLY_API_TOKEN`** keeps logs clean).
- **Action logs**: **`deploy-fly-ci.sh`** registers **`::add-mask::`** for OAuth / **`INTERNAL_SIDECAR_SECRET`** / location id strings after reading Secret Manager (substrings appearing later in that job log are redacted). The deploy workflow sets **`CLOUDSDK_VERBOSITY=error`**. Avoid **`ACTIONS_STEP_DEBUG`** on this workflow (bash **xtrace** can print sensitive lines).
- **Remaining risk**: any CI that can read secrets and call deploy can pivot (standard for automated deploy pipelines). Rotate **`FLY_API_TOKEN`** periodically; revoke compromised SA keys/WIF attachments immediately.

### Operational notes

- Runs on **`ubuntu-latest`**: CI steps are POSIX **`bash`** (avoid PowerShell-only syntax in **`deploy-fly-ci.sh`**).
- GitHub-hosted runners already handle **`--substitutions`** as single arguments; local **PowerShell** still needs quoting (see **[Deploy with Cloud Build](#deploy-with-cloud-build)** above).

## Related files

- [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml) — push-to-**`main`** deploy
- [`.github/workflows/ci-deploy-infra-scripts.yml`](../.github/workflows/ci-deploy-infra-scripts.yml) — validates **`deploy-fly-ci.sh`** + workflow YAML without secrets
- [`kroger-mcp/deploy-fly-ci.sh`](../kroger-mcp/deploy-fly-ci.sh) — Fly step used by Actions
- [`cloudbuild.yaml`](../cloudbuild.yaml)
- [Dockerfile](../Dockerfile) (Next.js `output: "standalone"`)
- [.env.example](../.env.example)
- [kroger-mcp/fly.toml](../kroger-mcp/fly.toml) — optional Fly.io deployment for Kroger MCP
- [ARCHITECTURE.md](../ARCHITECTURE.md) — session model and limitations
