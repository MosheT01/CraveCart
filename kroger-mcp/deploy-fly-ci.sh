#!/usr/bin/env bash
# CI helper (Linux/GitHub Actions): sync Fly secrets from Secret Manager and deploy.
# Requires: gcloud authenticated, flyctl authenticated (FLY_API_TOKEN), NETWORK.
set -euo pipefail

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

WEB_URL="${WEB_URL:-}"
if [[ -z "$WEB_URL" ]]; then
  WEB_URL="$(gcloud run services describe cravecart-web --region="$GCP_REGION" --project="$GCP_PROJECT" --format='value(status.url)')"
fi
REDIRECT_URI="${WEB_URL}/auth/kroger/callback"

echo "GCP project=$GCP_PROJECT Fly app=$FLY_APP Kroger redirect=$REDIRECT_URI"

read_sm_required() {
  local name="$1" out
  out="$(gcloud secrets versions access latest --secret="$name" --project="$GCP_PROJECT")" ||
    {
      echo "Could not read required Secret Manager secret $name (check IAM roles/secretmanager.secretAccessor for this CI identity)." >&2
      return 1
    }
  printf '%s' "$out"
}

read_sm_optional() {
  local name="$1"
  gcloud secrets versions access latest --secret="$name" --project="$GCP_PROJECT" 2>/dev/null || true
}

KROGER_CLIENT_ID="$(read_sm_required KROGER_CLIENT_ID)"
KROGER_CLIENT_SECRET="$(read_sm_required KROGER_CLIENT_SECRET)"
INTERNAL_SIDECAR_SECRET="$(read_sm_required INTERNAL_SIDECAR_SECRET)"
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

# Do not call `flyctl apps list` / `apps create` here: a deploy-scoped token
# (`fly tokens create deploy -a MYAPP`) returns 401 for those APIs and yields a false "missing app".
# Create the Fly app once from your laptop if needed (`flyctl launch`/`apps create`).
echo "Applying Fly secrets (import via stdin; avoids leaking values in argv)..."
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
