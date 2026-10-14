#!/usr/bin/env python3
"""Rotate the GEMINI_API_KEY Secret Manager secret and roll Cloud Run web safely.

This script:
1. Validates a new Gemini API key directly against the Gemini API.
2. Adds the key as a new Secret Manager version for GEMINI_API_KEY.
3. Rolls a Cloud Run service so it picks up GEMINI_API_KEY:latest.
4. Verifies the live /api/health endpoint after rollout.
5. Optionally updates a local .env, preserving the old GEMINI_API_KEY as a comment.

It does NOT delete the old Google AI / API Console key resource. Do that manually
after you confirm production is healthy.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


DEFAULT_SECRET = "GEMINI_API_KEY"
DEFAULT_SERVICE = "cravecart-web"
DEFAULT_REGION = "us-central1"
DEFAULT_MODEL = "gemini-2.5-flash"


def die(message: str, code: int = 1) -> "NoReturn":
    print(message, file=sys.stderr)
    raise SystemExit(code)


def resolve_gcloud() -> str:
    candidates: list[str] = []
    if os.name == "nt":
      candidates.extend(["gcloud.cmd", "gcloud.exe", "gcloud"])
    else:
      candidates.append("gcloud")

    seen: set[str] = set()
    for candidate in candidates:
        path = shutil.which(candidate)
        if path and path not in seen:
            seen.add(path)
            return path

    cloudsdk_root = os.getenv("CLOUDSDK_ROOT_DIR", "").strip()
    if cloudsdk_root:
        suffixes = ["bin/gcloud.cmd", "bin/gcloud.exe", "bin/gcloud"]
        for suffix in suffixes:
            path = pathlib.Path(cloudsdk_root, *suffix.split("/"))
            if path.is_file():
                return str(path)

    die(
        "Could not find gcloud on PATH. Install Google Cloud SDK, or add "
        "C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin to PATH."
    )


def run(cmd: list[str], *, input_text: str | None = None, timeout: int = 300) -> str:
    if cmd and cmd[0] == "gcloud":
        cmd = [resolve_gcloud(), *cmd[1:]]
    proc = subprocess.run(
        cmd,
        input=input_text,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        msg = proc.stderr.strip() or proc.stdout.strip() or f"Command failed: {' '.join(cmd)}"
        die(msg)
    return proc.stdout.strip()


def get_project(project: str | None) -> str:
    if project:
        return project
    value = run(["gcloud", "config", "get-value", "project"], timeout=60).strip()
    if not value or value == "(unset)":
        die("Could not determine GCP project. Pass --project or configure gcloud.")
    return value


def validate_gemini_key(api_key: str, model: str) -> None:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model, safe='')}:" "generateContent"
        f"?key={urllib.parse.quote(api_key, safe='')}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": "Reply with OK only."
                    }
                ]
            }
        ]
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        die(f"Gemini key validation failed ({exc.code}): {detail}")
    except urllib.error.URLError as exc:
        die(f"Gemini key validation failed: {exc}")

    text = ""
    candidates = body.get("candidates") or []
    if candidates:
        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        text = "".join(str(part.get("text") or "") for part in parts).strip()

    if not text:
        die("Gemini key validation succeeded technically, but the response contained no text.")


def add_secret_version(project: str, secret: str, value: str) -> str:
    output = run(
        ["gcloud", "secrets", "versions", "add", secret, "--project", project, "--data-file=-"],
        input_text=value,
        timeout=120,
    )
    marker = "Created version ["
    if marker in output:
        tail = output.split(marker, 1)[1]
        version = tail.split("]", 1)[0].strip()
        if version:
            return version
    return "unknown"


def service_url(service: str, region: str, project: str) -> str:
    url = run(
        [
            "gcloud",
            "run",
            "services",
            "describe",
            service,
            "--project",
            project,
            "--region",
            region,
            "--format=value(status.url)",
        ],
        timeout=120,
    ).strip()
    if not url:
        die(f"Could not read status.url for Cloud Run service {service}.")
    return url


def latest_revision(service: str, region: str, project: str) -> str:
    revision = run(
        [
            "gcloud",
            "run",
            "services",
            "describe",
            service,
            "--project",
            project,
            "--region",
            region,
            "--format=value(status.latestReadyRevisionName)",
        ],
        timeout=120,
    ).strip()
    if not revision:
        die(f"Could not read latest revision for Cloud Run service {service}.")
    return revision


def roll_service(service: str, region: str, project: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    run(
        [
            "gcloud",
            "run",
            "services",
            "update",
            service,
            "--project",
            project,
            "--region",
            region,
            "--update-labels",
            f"gemini-rotate={stamp}",
        ],
        timeout=900,
    )


def health_url(base_url: str, health_path: str) -> str:
    return f"{base_url.rstrip('/')}/{health_path.lstrip('/')}"


def fetch_json(url: str, timeout: int = 60) -> dict[str, object]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        die(f"Health check failed ({exc.code}) at {url}: {detail}")
    except urllib.error.URLError as exc:
        die(f"Health check failed for {url}: {exc}")


def verify_health(base_url: str, health_path: str) -> dict[str, object]:
    url = health_url(base_url, health_path)
    body = fetch_json(url)
    if not body.get("geminiConfigured"):
        die(f"Health check at {url} did not report geminiConfigured=true.")
    return body


def update_dotenv(path: pathlib.Path, new_key: str) -> tuple[bool, str | None]:
    if not path.exists():
        die(f".env file not found: {path}")

    content = path.read_text(encoding="utf-8").splitlines()
    updated: list[str] = []
    found = False
    old_key: str | None = None

    for line in content:
        if line.startswith("GEMINI_API_KEY="):
            found = True
            old_key = line.split("=", 1)[1]
            if old_key and old_key != new_key:
                updated.append(f"# Previous GEMINI_API_KEY={old_key}")
            updated.append(f"GEMINI_API_KEY={new_key}")
        else:
            updated.append(line)

    if not found:
        updated.append(f"GEMINI_API_KEY={new_key}")

    path.write_text("\n".join(updated) + "\n", encoding="utf-8")
    return found, old_key


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--new-key",
        help="New Gemini API key. Prefer the interactive prompt so the key is not exposed in shell history or process listings.",
    )
    parser.add_argument("--project", help="GCP project id. Defaults to current gcloud project.")
    parser.add_argument("--region", default=DEFAULT_REGION, help=f"Cloud Run region. Default: {DEFAULT_REGION}")
    parser.add_argument("--service", default=DEFAULT_SERVICE, help=f"Cloud Run service to roll. Default: {DEFAULT_SERVICE}")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help=f"Secret Manager secret name. Default: {DEFAULT_SECRET}")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Gemini model used for validation. Default: {DEFAULT_MODEL}")
    parser.add_argument("--health-path", default="/api/health", help="Health endpoint path. Default: /api/health")
    parser.add_argument(
        "--update-dotenv",
        metavar="PATH",
        help="Optional local .env path to update. Preserves the previous GEMINI_API_KEY as a comment.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    new_key = args.new_key or getpass.getpass("New Gemini API key: ").strip()
    placeholder = new_key.strip()
    if placeholder in {"PASTE_NEW_KEY_HERE", "YOUR_NEW_KEY_HERE", ""}:
        die("Replace the placeholder with a real Gemini API key before running the script.")

    project = get_project(args.project)

    print("Validating new Gemini key...")
    validate_gemini_key(new_key, args.model)
    print("New Gemini key is valid.")

    before_revision = latest_revision(args.service, args.region, project)
    stable_url = service_url(args.service, args.region, project)

    print(f"Adding new Secret Manager version to {args.secret}...")
    version = add_secret_version(project, args.secret, new_key)
    print(f"Created secret version: {version}")

    if args.update_dotenv:
        dotenv_path = pathlib.Path(args.update_dotenv)
        found, old_key = update_dotenv(dotenv_path, new_key)
        if found:
            print(f"Updated {dotenv_path} and preserved the previous local GEMINI_API_KEY as a comment.")
            if old_key == new_key:
                print(f"{dotenv_path} already had the new key; no old value was preserved.")
        else:
            print(f"Added GEMINI_API_KEY to {dotenv_path}.")

    print(f"Rolling Cloud Run service {args.service} in {args.region}...")
    roll_service(args.service, args.region, project)

    after_revision = latest_revision(args.service, args.region, project)
    if after_revision == before_revision:
        print("Warning: Cloud Run latest revision name did not change.")
    else:
        print(f"Rolled from {before_revision} to {after_revision}.")

    print("Verifying live health endpoint...")
    body = verify_health(stable_url, args.health_path)
    print(json.dumps({"url": stable_url, "revision": after_revision, "health": body}, indent=2))

    print("\nNext step: manually revoke/delete the old Gemini key in Google AI Studio / Cloud Console once you are satisfied.")


if __name__ == "__main__":
    main()
