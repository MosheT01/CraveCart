#!/usr/bin/env bash
# CI helper (Linux/GitHub Actions): sync Fly secrets from Secret Manager and deploy.
# Requires: gcloud authenticated, flyctl authenticated (FLY_API_TOKEN), NETWORK.
set -euo pipefail
set +o xtrace
# Do not enable bash xtrace in CI (e.g. ACTIONS_STEP_DEBUG); it would print secret-bearing lines.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GCP_PROJECT="${GCP_PROJECT:?GCP_PROJECT required}"
GCP_REGION="${GCP_REGION:-us-central1}"
FLY_ORG="${FLY_ORG:-personal}"

if [[ -z "${FLY_APP:-}" ]]; then
  if ! FLY_APP="$(grep -E '^\s*app\s*=' fly.toml | head -1 | sed -E 's/.*=\s*"([^"]+)".*/\1/')" || [[ -z "$FLY_APP" ]]; then
    echo "Could not parse app from fly.toml; set FLY_APP."
    exit 1
  fi
fi
# Normalize slug (GH Actions secrets may store a trailing newline; breaks https://slug.fly.dev).
FLY_APP="$(printf '%s' "$FLY_APP" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

WEB_URL="${WEB_URL:-}"
if [[ -z "$WEB_URL" ]]; then
  WEB_URL="$(gcloud run services describe cravecart-web --region="$GCP_REGION" --project="$GCP_PROJECT" --format='value(status.url)')"
fi
REDIRECT_URI="${WEB_URL}/auth/kroger/callback"

# Register values with GitHub Actions so echoes are redacted in the web log (no-op elsewhere).
gh_mask() {
  [[ -n "${GITHUB_ACTIONS:-}" ]] || return 0
  local val="$1"
  [[ -n "$val" ]] || return 0
  if [[ "$val" == *$'\n'* ]]; then
    echo "warning: skipping ::add-mask:: for a multiline value (secret name redacted)" >&2
    return 0
  fi
  if [[ "$val" == *'::'* ]]; then
    echo "warning: value contains '::' — ::add-mask:: may be unreliable; avoid logging this job verbosely" >&2
  fi
  echo "::add-mask::${val}"
}

if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  gh_mask "$GCP_PROJECT"
  gh_mask "$WEB_URL"
  gh_mask "$REDIRECT_URI"
  gh_mask "$FLY_APP"
  echo "Starting Kroger MCP sidecar sync (build + secrets + deploy)."
else
  echo "GCP project=$GCP_PROJECT Fly app=$FLY_APP Kroger redirect=$REDIRECT_URI"
fi

read_sm_required() {
  local name="$1"
  local ver="${2:-latest}"
  local out
  if ! out="$(gcloud secrets versions access "$ver" --secret="$name" --project="$GCP_PROJECT" 2>/dev/null)"; then
    echo "Could not read required Secret Manager secret $name version $ver (check IAM roles/secretmanager.secretAccessor for this CI identity)." >&2
    return 1
  fi
  printf '%s' "$out"
}

read_sm_optional() {
  local name="$1"
  gcloud secrets versions access latest --secret="$name" --project="$GCP_PROJECT" 2>/dev/null || true
}

# Embedded CR/LF/TAB/NUL in INTERNAL_SIDECAR_SECRET break HTTP Bearer (often **400**) and Fly vs GCP comparisons.
normalize_internal_sidecar_secret() {
  LC_ALL=C printf '%s' "$1" | tr -d '\000\r\n\t'
}

INTERNAL_SIDECAR_SECRET_VERSION="${INTERNAL_SIDECAR_SECRET_VERSION:-latest}"

KROGER_CLIENT_ID="$(read_sm_required KROGER_CLIENT_ID)"
KROGER_CLIENT_SECRET="$(read_sm_required KROGER_CLIENT_SECRET)"
INTERNAL_SIDECAR_SECRET="$(normalize_internal_sidecar_secret "$(read_sm_required INTERNAL_SIDECAR_SECRET "$INTERNAL_SIDECAR_SECRET_VERSION")")"
KROGER_LOCATION_ID="$(read_sm_optional KROGER_LOCATION_ID)"

for nm in KROGER_CLIENT_ID KROGER_CLIENT_SECRET INTERNAL_SIDECAR_SECRET; do
  if [[ -z "${!nm:-}" ]]; then
    echo "Secret Manager value for $nm is missing or empty." >&2
    exit 1
  fi
done

if [[ -z "${KROGER_LOCATION_ID:-}" ]]; then
  echo "Reading KROGER_LOCATION_ID from Cloud Run cravecart-web env..."
  KROGER_LOCATION_ID="$(
    gcloud run services describe cravecart-web --region="$GCP_REGION" --project="$GCP_PROJECT" --format=json |
      python3 -c '
import sys, json
d = json.load(sys.stdin)
t = d.get("spec") or {}
tpl = t.get("template") or {}
pod = tpl.get("spec") or {}
containers = pod.get("containers") or [{}]
env = containers[0].get("env") or []
for row in env:
    if isinstance(row, dict) and row.get("name") == "KROGER_LOCATION_ID":
        print(row.get("value") or "")
        break
'
  )"
fi

if [[ -z "${KROGER_LOCATION_ID:-}" ]]; then
  echo "KROGER_LOCATION_ID not in Secret Manager and not on cravecart-web. Set GCP secret KROGER_LOCATION_ID or redeploy web with _KROGER_LOCATION_ID substitution."
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl not on PATH"
  exit 1
fi

gh_mask "$KROGER_CLIENT_ID"
gh_mask "$KROGER_CLIENT_SECRET"
gh_mask "$INTERNAL_SIDECAR_SECRET"
gh_mask "$KROGER_LOCATION_ID"

# Do not call `flyctl apps list` / `apps create` here: a deploy-scoped token
# (`fly tokens create deploy -a MYAPP`) returns 401 for those APIs and yields a false "missing app".
# Create the Fly app once from your laptop if needed (`flyctl launch`/`apps create`).
# Use `secrets import` *without* `--stage`: Fly restarts machines so the vault env is live before we build/deploy
# a new image. In practice, `--stage` + `fly deploy --remote-only` left some machines serving traffic without
# refreshed INTERNAL_SIDECAR_SECRET (Bearer /health smoke got 403 despite correct GCP sync).
echo "Applying Fly secrets (import via stdin — non-staged so machines pick up vault env; avoids argv leaks)..."
IMPORT_LINES="$(
  KROGER_CLIENT_ID="$KROGER_CLIENT_ID" \
    KROGER_CLIENT_SECRET="$KROGER_CLIENT_SECRET" \
    KROGER_REDIRECT_URI="$REDIRECT_URI" \
    KROGER_LOCATION_ID="$KROGER_LOCATION_ID" \
    INTERNAL_SIDECAR_SECRET="$INTERNAL_SIDECAR_SECRET" \
    python3 - <<'PY'
import json
import os

pairs = (
    ("KROGER_CLIENT_ID", os.environ["KROGER_CLIENT_ID"]),
    ("KROGER_CLIENT_SECRET", os.environ["KROGER_CLIENT_SECRET"]),
    ("KROGER_REDIRECT_URI", os.environ["KROGER_REDIRECT_URI"]),
    ("KROGER_LOCATION_ID", os.environ["KROGER_LOCATION_ID"]),
    ("INTERNAL_SIDECAR_SECRET", os.environ["INTERNAL_SIDECAR_SECRET"]),
)
lines = "".join(f"{k}={json.dumps(v)}\n" for k, v in pairs)
print(lines, end="")
PY
)"

printf '%s' "$IMPORT_LINES" | flyctl secrets import --app "$FLY_APP"
unset IMPORT_LINES

unset KROGER_CLIENT_ID KROGER_CLIENT_SECRET INTERNAL_SIDECAR_SECRET KROGER_LOCATION_ID REDIRECT_URI

echo "Flying deploy (--remote-only)..."
flyctl deploy --app "$FLY_APP" --remote-only

# Bearer smoke: probes the SAME app slug we deployed. Do NOT use EXTERNAL_KROGER_SIDECAR_URL here — Actions often
# store a typo/path vs FLY_APP (e.g. wrong slug or .../mcp), which yields 403 even when Fly vault matches GCP.
readonly FLY_HEALTH_HOST="$(printf '%s' "$FLY_APP" | tr '[:upper:]' '[:lower:]').fly.dev"
readonly HEALTH_BASE="https://${FLY_HEALTH_HOST}"

if [[ -n "${EXTERNAL_KROGER_SIDECAR_URL:-}" ]]; then
  ext="$(printf '%s' "$EXTERNAL_KROGER_SIDECAR_URL" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  ext="${ext#https://}"
  ext="${ext#http://}"
  ext="$(printf '%s' "$ext" | cut -d/ -f1 | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$ext" && "$ext" == *fly.dev* && "$ext" != "$FLY_HEALTH_HOST" && -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::warning::EXTERNAL_KROGER_SIDECAR_URL host (${ext}) differs from deployed app (${FLY_HEALTH_HOST}). Cloud Build URL for web stays EXTERNAL_*; Fly smoke uses ${FLY_HEALTH_HOST}. Fix EXTERNAL_* or FLY_APP_NAME alignment."
  fi
fi

# Optional: set SKIP_FLY_BEARER_HEALTH=1 in the workflow if you only want deploy+secrets without this gate.
if [[ "${SKIP_FLY_BEARER_HEALTH:-0}" == "1" ]]; then
  echo "SKIP_FLY_BEARER_HEALTH=1 — skipping GET ${HEALTH_BASE}/health Bearer check."
  exit 0
fi

SMOKE="$(normalize_internal_sidecar_secret "$(read_sm_required INTERNAL_SIDECAR_SECRET "$INTERNAL_SIDECAR_SECRET_VERSION")")"
gh_mask "$SMOKE"
HBODY="$(mktemp "${TMPDIR:-/tmp}/cravecart-health.XXXXXX")"
trap 'rm -f "${HBODY}"' EXIT
code=""
for attempt in 1 2 3 4 5 6; do
  # Same path production uses: TLS to fly.dev, then your FastAPI app.
  code="$(
    curl -sS --http1.1 --max-time 45 -o "${HBODY}" -w "%{http_code}" \
      -H "Authorization: Bearer ${SMOKE}" "${HEALTH_BASE}/health" 2>/dev/null || printf '000'
  )"
  [[ "$code" == "200" ]] && break
  [[ "$attempt" -eq 6 ]] || sleep 5
done
unset SMOKE

if [[ "$code" == "200" ]]; then
  echo "Fly /health bearer check OK (${HEALTH_BASE})."
  exit 0
fi

echo "GET ${HEALTH_BASE}/health with Bearer from GCP Secret Manager (version ${INTERNAL_SIDECAR_SECRET_VERSION:-latest}) failed." >&2
echo "HTTP status: ${code:-unknown}" >&2
echo "Response body (first 800 bytes, cat -v so control chars are visible):" >&2
head -c 800 "${HBODY}" 2>/dev/null | cat -v >&2 || true
echo >&2
echo "How to read this:" >&2
echo "  • 200 + JSON ok → pass (you should not see this block)." >&2
echo "  • 403 + {\"detail\":\"Unauthorized\"} → InternalSidecarGate: Bearer token ≠ INTERNAL_SIDECAR_SECRET in the Fly process." >&2
echo "  • 503 + INTERNAL_SIDECAR_SECRET must be set → secret missing in Fly env." >&2
echo "  • 400 + HTML or empty → usually edge/proxy; compare with a manual curl from your laptop." >&2
echo "  • 000 → curl got no response (DNS/TLS/timeout)." >&2
exit 1
