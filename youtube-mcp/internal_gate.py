"""Bearer gate for Fly / local Docker. On Cloud Run, IAM restricts invokers (same as kroger-mcp)."""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def env(name: str) -> str:
    return os.getenv(name, "").strip()


def bearer_safe(value: str) -> str:
    """Strip NUL/CR/LF/TAB — invalid in HTTP Bearer vs Secret Manager payloads."""
    v = value.strip().replace("\r", "").replace("\n", "").replace("\t", "")
    return "".join(ch for ch in v if ord(ch) != 0)


def _is_cloud_run() -> bool:
    return bool(os.getenv("K_SERVICE"))


def _is_fly() -> bool:
    return bool(os.getenv("FLY_MACHINE_ID"))


class InternalSidecarGate(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _is_cloud_run():
            return await call_next(request)

        secret = bearer_safe(env("INTERNAL_SIDECAR_SECRET"))
        if _is_fly() and not secret:
            return JSONResponse(
                {"detail": "INTERNAL_SIDECAR_SECRET must be set on Fly (fly secrets set)."},
                status_code=503,
            )
        if not secret:
            return await call_next(request)

        auth = request.headers.get("authorization") or ""
        token = ""
        if auth.lower().startswith("bearer "):
            token = bearer_safe(auth[7:])
        if token != secret:
            return JSONResponse({"detail": "Unauthorized"}, status_code=403)

        return await call_next(request)
