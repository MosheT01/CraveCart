#!/usr/bin/env python3
"""Print the numeric Secret Manager version id that :latest resolved to for INTERNAL_SIDECAR_SECRET.

GitHub Actions WIF SAs are often granted only roles/secretmanager.secretAccessor, which includes
secretmanager.versions.access but NOT secretmanager.versions.get (describe) or versions.list.
Calling access:latest returns JSON whose "name" field contains the concrete version number.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request

SECRET_NAME = "INTERNAL_SIDECAR_SECRET"


def _gcloud_token() -> str:
    out = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"],
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
    )
    return out.strip()


def _version_from_access_name(name: str) -> str:
    tail = name.rsplit("/", maxsplit=1)[-1]
    if tail.isdigit():
        return tail
    raise RuntimeError(f"Could not parse version id from access name: {name!r}")


def version_via_access_api(project: str) -> str:
    url = (
        "https://secretmanager.googleapis.com/v1/"
        f"projects/{project}/secrets/{SECRET_NAME}/versions/latest:access"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {_gcloud_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = ""
        try:
            err = e.read().decode()
        except OSError:
            pass
        raise RuntimeError(f"secretmanager versions.access ({e.code}): {err}") from None

    name = str(data.get("name") or "")
    return _version_from_access_name(name)


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print(f"Usage: {sys.argv[0]} <GCP_PROJECT_ID>", file=sys.stderr)
        sys.exit(2)
    project = sys.argv[1].strip()

    try:
        vid = version_via_access_api(project)
    except subprocess.CalledProcessError as e:
        print(e.stderr.decode() if isinstance(e.stderr, bytes) else (e.stderr or ""), file=sys.stderr)
        print("Could not mint gcloud credentials (is auth configured?).", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        print(
            f"Ensure the CI identity may secretmanager.versions.access {SECRET_NAME} "
            "(roles/secretmanager.secretAccessor on that secret is sufficient).",
            file=sys.stderr,
        )
        sys.exit(1)

    print(vid)


if __name__ == "__main__":
    main()
