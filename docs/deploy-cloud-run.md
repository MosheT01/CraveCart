# Deploy CraveCart on Google Cloud Run (Cloud Run–first)

This document matches the three-service layout from [docker-compose.yml](../docker-compose.yml): **Next.js web**, **youtube-mcp**, and **kroger-mcp**. The automated path is [cloudbuild.yaml](../cloudbuild.yaml) (build, push, deploy, sync OAuth redirect URLs).

## Credentials: `.env` (local) vs Secret Manager (prod)

| Scope | Kroger/Gemini/YouTube keys |
| ----- | -------------------------- |
| **Local / Docker Compose** | Repo-root `.env` (from [.env.example](../.env.example)); never committed with real prod secrets |
| **Cloud Run (this pipeline)** | [Secret Manager](https://console.cloud.google.com/security/secret-manager) referenced in `cloudbuild.yaml` (`--set-secrets`) |
| **Fly.io (hybrid Kroger MCP)** | Not deployed by Cloud Build. Use [`kroger-mcp/deploy-fly.ps1`](../kroger-mcp/deploy-fly.ps1) with **`-FromGcpSecretManager -GcpProject YOUR_PROJECT`** so Fly gets the **same** `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` as Cloud Run |

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

   | Secret name             | Used by                         |
   | ----------------------- | ------------------------------- |
   | `GEMINI_API_KEY`        | web                             |
   | `YOUTUBE_API_KEY`       | web + `cravecart-youtube-mcp`   |
   | `KROGER_CLIENT_ID`      | web (+ `cravecart-kroger-mcp` if that service exists) |
   | `KROGER_CLIENT_SECRET`  | web (+ `cravecart-kroger-mcp` if that service exists) |

   Example:

   ```bash
   echo -n "YOUR_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
   ```

4. **IAM**

   - Cloud Build default service account (`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`): grant **Cloud Run Admin**, **Artifact Registry Writer**, and **Service Account User** on the Cloud Run **runtime** service account (default is the project’s compute service account).
   - Cloud Run runtime service account: grant **Secret Manager Secret Accessor** on each secret used in deploy flags.

## Deploy with Cloud Build

Align `_AR_HOSTNAME` with where you deploy Cloud Run (e.g. `us-central1` → `us-central1-docker.pkg.dev`). Bash deploy steps pin `us-central1`; change [`cloudbuild.yaml`](../cloudbuild.yaml) if you use another region.

Set `_KROGER_LOCATION_ID` to your Kroger store location (required for product search). Ensure all four API secrets exist in Secret Manager.

[`cloudbuild.yaml`](../cloudbuild.yaml) defaults **`_EXTERNAL_KROGER_SIDECAR_URL`** to **`https://cravecart-kroger-mcp.fly.dev`** so **`cravecart-web`** ships pointing at Fly for Kroger (no passing it every submit). Override that substitution if your Fly app hostname differs.

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_AR_HOSTNAME=us-central1-docker.pkg.dev,_AR_REPO=cravecart,_KROGER_LOCATION_ID=YOUR_LOCATION_ID
```

On **PowerShell**, wrap substitutions in **single quotes** so commas do not split the argument (otherwise `_AR_HOSTNAME` can silently absorb the rest of the flags and break the build):

```powershell
gcloud builds submit --config=cloudbuild.yaml `
  '--substitutions=_AR_HOSTNAME=us-central1-docker.pkg.dev,_AR_REPO=cravecart,_KROGER_LOCATION_ID=YOUR_LOCATION_ID'
```

After the first deploy, copy the printed redirect URI into the Kroger app settings.

### Hybrid Kroger on Fly (`_EXTERNAL_KROGER_SIDECAR_URL` substitution)

**Default:** Fly base URL **`https://cravecart-kroger-mcp.fly.dev`** (no `/mcp/`) — see substitutions in [`cloudbuild.yaml`](../cloudbuild.yaml).

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
     KROGER_LOCATION_ID=YOUR_LOCATION_ID
   ```

4. `fly deploy` from `kroger-mcp/`. Confirm `https://YOUR_APP.fly.dev/health` returns JSON with `"ok": true`.

   **Verify Fly matches Secret Manager:** the VM’s Kroger **`client_id`** must be the **same string** as in GCP Secret Manager (`KROGER_CLIENT_ID` used by `cravecart-web`). If Fly still has an old dev id from `.env`, Kroger OAuth can fail with `redirect_uri did not match` even when Kroger Developer is configured correctly.

   On **Windows / PowerShell**, use `--pty=false` so SSH does not complain about allocating a pseudo-TTY:

   ```bash
   fly ssh console -a cravecart-kroger-mcp -q --pty=false -C "printenv KROGER_CLIENT_ID"
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

6. Deploy **`cravecart-web`** so env points at Fly (manual step **5** if needed; Cloud Build **`_EXTERNAL_KROGER_SIDECAR_URL`** default is **`https://cravecart-kroger-mcp.fly.dev`** — see **Hybrid Kroger on Fly**). Delete **`cravecart-kroger-mcp`** on Cloud Run once if it still exists (**`gcloud run services delete`** in `us-central1`) to drop unused **`min-instances`** spend.

   With **`KROGER_SIDECAR_URL`** / **`KROGER_MCP_URL`** pointing at Fly, **`deploy-fly.ps1 -FromGcpSecretManager`**, and Kroger Developer redirect URIs aligned, production Kroger OAuth and catalog calls should succeed end-to-end.

**Notes:** Kroger redirects the **browser** to your **web** `/auth/kroger/callback`; the browser never needs to hit Fly for OAuth UI. Sessions and MCP tools must reach Fly (`X-CraveCart-Session` header), so keep Fly reachable from the internet. **`min_machines_running = 0`** scales the Fly machine down when idle (cheaper); the first Kroger MCP request after idle may cold-start.

## Related files

- [cloudbuild.yaml](../cloudbuild.yaml)
- [Dockerfile](../Dockerfile) (Next.js `output: "standalone"`)
- [.env.example](../.env.example)
- [kroger-mcp/fly.toml](../kroger-mcp/fly.toml) — optional Fly.io deployment for Kroger MCP
- [ARCHITECTURE.md](../ARCHITECTURE.md) — session model and limitations
