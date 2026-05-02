#!/usr/bin/env python3
"""Print the numeric Secret Manager version id for INTERNAL_SIDECAR_SECRET (latest ENABLED by version number)."""

from __future__ import annotations

import json
import subprocess
import sys

SECRET_NAME = "INTERNAL_SIDECAR_SECRET"


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("Usage: pin_internal_sidecar_secret_version.py <GCP_PROJECT_ID>", file=sys.stderr)
        sys.exit(2)
    project = sys.argv[1].strip()

    cmd = ["gcloud", "secrets", "versions", "list", SECRET_NAME, f"--project={project}", "--format=json"]

    try:
        out = subprocess.check_output(cmd, stderr=subprocess.PIPE, text=True, timeout=120)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr if isinstance(e.stderr, str) else (e.stderr or b"").decode()
        sys.stderr.write(stderr)
        print(
            f"Could not list {SECRET_NAME} (missing secret or secretmanager.secretAccessor for this principal).",
            file=sys.stderr,
        )
        sys.exit(1)

    rows = json.loads(out)
    if not isinstance(rows, list):
        print("Unexpected gcloud JSON output (expected a list).", file=sys.stderr)
        sys.exit(1)

    enabled: list[dict] = [r for r in rows if isinstance(r, dict) and r.get("state") == "ENABLED"]
    if not enabled:
        print(
            f"No ENABLED versions for {SECRET_NAME}; add a payload or enable one in Secret Manager.",
            file=sys.stderr,
        )
        sys.exit(1)

    def version_num(row: dict) -> int:
        name = str(row.get("name") or "")
        tail = name.rsplit("/", maxsplit=1)[-1]
        try:
            return int(tail)
        except ValueError:
            return -1

    enabled.sort(key=version_num, reverse=True)
    name = str(enabled[0].get("name") or "")
    tail = name.rsplit("/", maxsplit=1)[-1]
    print(tail)


if __name__ == "__main__":
    main()
