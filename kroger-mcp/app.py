from __future__ import annotations

import base64
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import token_urlsafe
from typing import Any
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, Header, HTTPException
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from internal_gate import InternalSidecarGate
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

def kroger_v1_root() -> str:
    """OAuth + REST API base URL. Certification/Sandbox hosts (e.g. api-ce.kroger.com) need KROGER_API_HOST set."""
    raw = (os.getenv("KROGER_API_HOST") or "").strip()
    host = raw.lower().replace("https://", "").replace("http://", "").split("/")[0].strip().rstrip("/") if raw else ""
    return f"https://{host or 'api.kroger.com'}/v1"


def kroger_auth_base() -> str:
    return f"{kroger_v1_root()}/connect/oauth2/authorize"


def kroger_token_url() -> str:
    return f"{kroger_v1_root()}/connect/oauth2/token"


def client_credentials_scope() -> str:
    scope = (os.getenv("KROGER_CLIENT_CREDENTIALS_SCOPE") or "").strip()
    return scope or "product.compact"
OPEN_CART_URL = "https://www.kroger.com/cart"
DATA_DIR = Path(__file__).resolve().parent / "data" / "sessions"
CLIENT_TOKEN_PATH = Path(__file__).resolve().parent / "data" / "client_token.json"

logger = logging.getLogger(__name__)

# Akamai on api.kroger.com often blocks bare python-requests / datacenter-looking clients.
# Keep a shared Session so Set-Cookie from /token survives on follow-up GET /products, and use browser-adjacent defaults.
_KROGER_SESSION = requests.Session()
_KROGER_SESSION.headers.update(
    {
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36 CraveCart/1 KrogerDeveloperAPI"
        ),
    }
)

# OAuth authorize scopes must include product.compact or shopper tokens cannot call GET /products (API/WAF may reject).
KROGER_USER_OAUTH_SCOPES = "cart.basic:write profile.compact product.compact"


def _product_catalog_request_headers(access_token: str) -> dict[str, str]:
    """Extra headers for GET /products only (Akamai sometimes keys off browser-like fetch metadata)."""
    referer = (os.getenv("KROGER_PRODUCT_REQUEST_REFERER") or "https://www.kroger.com/").strip()
    return {
        "Authorization": f"Bearer {access_token}",
        "Referer": referer,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        # Browser calling api.kroger.com from a www.kroger.com context uses cross-site.
        "Sec-Fetch-Site": "cross-site",
    }


def _products_catalog_http_get(
    url: str, headers: dict[str, str], params: dict[str, Any]
) -> Any:
    """GET /products: Akamai often fingerprints plain `requests` TLS; prefer curl_cffi Chrome impersonation."""
    impersonate = (os.getenv("KROGER_CURL_IMPERSONATE") or "chrome131").strip()
    try:
        from curl_cffi import requests as curl_requests

        return curl_requests.get(
            url,
            params=params,
            headers=headers,
            impersonate=impersonate,
            timeout=30,
        )
    except ImportError:
        logger.info("curl_cffi_unavailable_use_requests_for_products")
    except Exception as exc:
        logger.warning("curl_cffi_products_get_failed: %s", exc)

    return _KROGER_SESSION.get(url, headers=headers, params=params, timeout=30)


def _parse_product_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("data")
    if isinstance(raw, list):
        return raw
    if isinstance(payload.get("products"), list):
        return payload["products"]
    return []


def _kroger_products_get(
    access_token: str, term: str, location_id: str | None, limit: int
) -> tuple[bool, str | None, list[dict[str, Any]]]:
    capped = max(1, min(limit, 50))
    params: dict[str, Any] = {"filter.term": term, "filter.limit": capped}
    if location_id:
        params["filter.locationId"] = location_id

    url = f"{kroger_v1_root()}/products"
    hdrs = _product_catalog_request_headers(access_token)
    try:
        response = _products_catalog_http_get(url, hdrs, params)
    except Exception as exc:
        return False, str(exc), []

    payload: dict[str, Any]
    try:
        payload = response.json()
    except json.JSONDecodeError:
        snippet = response.text[:800].replace("\n", " ")
        logger.warning("kroger_products_non_json status=%s url=%s body=%s", response.status_code, response.url, snippet)
        return False, f"invalid JSON ({response.status_code}): {snippet}", []

    errors = payload.get("errors")

    if response.status_code >= 400:
        err_body = ""
        try:
            err_body = (json.dumps(errors) if errors else "").strip()
        except (TypeError, ValueError):
            err_body = ""
        if not err_body:
            err_body = (payload.get("message") or payload.get("error") or response.text[:1200]).strip()
        reason = getattr(response, "reason", "") or ""
        logger.warning(
            "kroger_products_http status=%s reason=%s final_url=%s params_keys=%s err=%s",
            response.status_code,
            reason,
            getattr(response, "url", ""),
            sorted(params.keys()),
            err_body[:800],
        )
        snippet = err_body[:500] if err_body else response.text[:400]
        return False, f"{response.status_code} Client Error: {reason} for url {getattr(response, 'url', url)} {snippet}", []

    if errors:
        return False, json.dumps(errors)[:800], []

    items = _parse_product_items(payload)
    return True, None, items


class AuthCallbackPayload(BaseModel):
    code: str
    state: str


class CartItemPayload(BaseModel):
    upc: str
    quantity: int = Field(default=1, ge=1)
    modality: str = "PICKUP"


def env(name: str) -> str:
    return os.getenv(name, "").strip()


def is_configured() -> bool:
    return bool(env("KROGER_CLIENT_ID") and env("KROGER_CLIENT_SECRET") and env("KROGER_REDIRECT_URI"))


def default_location_id() -> str:
    return env("KROGER_LOCATION_ID")


def session_path(session_id: str) -> Path:
    safe_id = "".join(ch for ch in session_id if ch.isalnum() or ch in {"-", "_"})
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{safe_id}.json"


def load_session_data(session_id: str) -> dict[str, Any]:
    path = session_path(session_id)
    if not path.exists():
        return {"sessionId": session_id}
    return json.loads(path.read_text(encoding="utf-8"))


def save_session_data(session_id: str, data: dict[str, Any]) -> None:
    path = session_path(session_id)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def basic_auth_header() -> str:
    raw = f"{env('KROGER_CLIENT_ID')}:{env('KROGER_CLIENT_SECRET')}".encode("utf-8")
    return f"Basic {base64.b64encode(raw).decode('utf-8')}"


def _token_exchange_error_detail(response: requests.Response) -> str:
    snippet = (response.text or "").strip().replace("\n", " ")[:600]
    detail = snippet
    try:
        data = response.json()
        if isinstance(data, dict):
            err = data.get("error_description") or data.get("error")
            if err:
                detail = str(err)[:600]
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    hint = (
        f"Token URL was {kroger_token_url()}. "
        "If your Kroger application is in Certification (not Production), set env KROGER_API_HOST=api-ce.kroger.com "
        "on kroger-mcp and redeploy. Otherwise confirm KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in Secret Manager, "
        "and that the redirect URI registered in Kroger Developer exactly matches KROGER_REDIRECT_URI for this Cloud Run URL "
        "(https, no wrong host or trailing slash)."
    )
    return f"{response.status_code} {detail}. {hint}"


def token_is_valid(token: dict[str, Any] | None) -> bool:
    if not token:
        return False
    return float(token.get("expires_at", 0)) > time.time() + 30


def _persist_client_token_bundle(payload: dict[str, Any]) -> None:
    CLIENT_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        **payload,
        "_cookies": requests.utils.dict_from_cookiejar(_KROGER_SESSION.cookies),
    }
    CLIENT_TOKEN_PATH.write_text(json.dumps(bundle, indent=2), encoding="utf-8")


def _restore_client_cookies_from_bundle(raw: dict[str, Any]) -> dict[str, Any]:
    cookies = raw.pop("_cookies", None)
    if isinstance(cookies, dict) and cookies:
        try:
            _KROGER_SESSION.cookies.update(cookies)
        except (TypeError, ValueError):
            logger.warning("kroger_client_cookies_restore_failed")
    return raw


def request_client_token() -> dict[str, Any]:
    response = _KROGER_SESSION.post(
        kroger_token_url(),
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "client_credentials",
            "scope": client_credentials_scope(),
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 1800))
    _persist_client_token_bundle(payload)
    return payload


def load_client_token() -> dict[str, Any]:
    if CLIENT_TOKEN_PATH.exists():
        cached_all = json.loads(CLIENT_TOKEN_PATH.read_text(encoding="utf-8"))
        cached = _restore_client_cookies_from_bundle(dict(cached_all))
        if token_is_valid(cached):
            return cached
    return request_client_token()


def exchange_code(code: str) -> dict[str, Any]:
    redirect_uri = env("KROGER_REDIRECT_URI")
    if not redirect_uri:
        raise ValueError(
            "KROGER_REDIRECT_URI is not set on kroger-mcp. Run the Cloud Build sync-public-urls step or "
            "gcloud run services update cravecart-kroger-mcp --update-env-vars KROGER_REDIRECT_URI=https://<web-url>/auth/kroger/callback"
        )

    response = _KROGER_SESSION.post(
        kroger_token_url(),
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        msg = _token_exchange_error_detail(response)
        logger.warning("kroger_authorization_code_exchange_failed %s", msg[:1200])
        raise requests.HTTPError(msg, response=response)

    payload = response.json()
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 1800))
    return payload


def refresh_user_token(refresh_token: str) -> dict[str, Any]:
    response = _KROGER_SESSION.post(
        kroger_token_url(),
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 1800))
    return payload


def get_user_token(session_id: str) -> dict[str, Any] | None:
    session = load_session_data(session_id)
    token = session.get("token")

    if token_is_valid(token):
        return token

    refresh_token_value = token.get("refresh_token") if token else None
    if not refresh_token_value:
        return None

    try:
        refreshed = refresh_user_token(refresh_token_value)
    except requests.RequestException:
        return None

    session["token"] = refreshed
    save_session_data(session_id, session)
    return refreshed


def build_session_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def get_profile_id(access_token: str) -> str | None:
    response = _KROGER_SESSION.get(
        f"{kroger_v1_root()}/identity/profile",
        headers=build_session_headers(access_token),
        timeout=30,
    )
    if not response.ok:
        return None
    payload = response.json()
    return payload.get("data", {}).get("id")


def normalize_product(product: dict[str, Any], location_id: str) -> dict[str, Any]:
    items = product.get("items") or []
    selected_item = items[0] if items else {}
    item_price = selected_item.get("price") or {}
    price_value = item_price.get("promo") or item_price.get("regular")
    item_info = selected_item.get("itemInformation") or {}
    images = product.get("images") or []
    image_url = None

    if images:
        first_image = images[0]
        image_url = first_image.get("sizes", [{}])[0].get("url") or first_image.get("url")

    modality = "IN_STORE"
    fulfillment = selected_item.get("fulfillment") or {}
    if fulfillment.get("curbside"):
        modality = "PICKUP"
    elif fulfillment.get("delivery"):
        modality = "DELIVERY"

    return {
        "productId": product.get("productId") or selected_item.get("upc"),
        "upc": selected_item.get("upc") or product.get("upc") or product.get("productId"),
        "description": product.get("description") or selected_item.get("description") or "Kroger item",
        "brand": product.get("brand"),
        "size": item_info.get("size") or selected_item.get("size"),
        "priceValue": price_value,
        "priceLabel": f"${price_value:.2f}" if isinstance(price_value, (int, float)) else None,
        "imageUrl": image_url,
        "modality": modality,
        "raw": {"locationId": location_id},
    }


def add_single_item_to_cart(access_token: str, item: CartItemPayload) -> None:
    response = _KROGER_SESSION.put(
        f"{kroger_v1_root()}/cart/add",
        headers=build_session_headers(access_token),
        json={
            "items": [
                {
                    "upc": item.upc,
                    "quantity": item.quantity,
                    "modality": item.modality,
                }
            ]
        },
        timeout=30,
    )
    response.raise_for_status()


def store_last_cart_summary(session_id: str, items: list[dict[str, Any]]) -> None:
    session = load_session_data(session_id)
    session["last_cart_summary"] = {
        "retailer": "Kroger",
        "items": items,
        "openCartUrl": OPEN_CART_URL,
        "updatedAt": time.time(),
    }
    save_session_data(session_id, session)


def require_session(session_id: str | None) -> str:
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-CraveCart-Session header.")
    return session_id


mcp = FastMCP(
    "CraveCart Kroger MCP",
    instructions=(
        "Use these tools for Kroger auth state, product lookup, and cart mutation. "
        "Product search uses a fixed demo store location, and cart writes are intended for explicit buy flows."
    ),
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    # FastMCP validates incoming Host headers against this host/port pair.
    host="kroger-mcp",
    port=8000,
)


@mcp.tool()
def get_kroger_auth_status(session_id: str) -> dict[str, Any]:
    token = get_user_token(session_id)
    return {
        "ok": True,
        "authenticated": bool(token),
        "configured": is_configured(),
        "authUrl": "/auth/kroger",
    }


@mcp.tool()
def search_kroger_products(
    query: str,
    session_id: str | None = None,
    location_id: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    # Canonical store id for tagging / cart UX (still forwarded to callers in normalized products).
    resolved_location = location_id or default_location_id()

    if not is_configured():
        return {"ok": False, "message": "Kroger credentials are not configured.", "products": []}

    def run_search(access_token: str, use_location: str | None) -> tuple[bool, str | None, list[dict[str, Any]]]:
        return _kroger_products_get(access_token, query, use_location, limit)

    ok = False
    err_msg: str | None = None
    items: list[dict[str, Any]] = []

    # Prefer the shopper's OAuth access token when connected — Akamai often allows these more
    # reliably than client_credentials from cloud egress, and supports store-scoped search.
    user_token = get_user_token(session_id) if session_id else None
    if user_token:
        loc = (resolved_location or "").strip() or None
        ok, err_msg, items = run_search(user_token["access_token"], loc)
        if not ok and loc:
            ok, err_msg, items = run_search(user_token["access_token"], None)

    if not ok:
        token = load_client_token()
        # product.compact + filter.locationId often yields API 403; try catalog-only first.
        ok, err_msg, items = run_search(token["access_token"], None)
        if not ok and "403" in (err_msg or "") and "Access Denied" in (err_msg or ""):
            logger.warning("kroger_products_retry_after_token_refresh")
            token = request_client_token()
            ok, err_msg, items = run_search(token["access_token"], None)

    if not ok:
        msg = f"Kroger product search failed: {err_msg}"
        if err_msg and "Access Denied" in err_msg:
            msg += (
                " Try disconnecting Kroger and signing in again so the consent screen includes **product** "
                "catalog access (product.compact scope). If it still fails, Kroger’s CDN may be blocking "
                "requests from this deployment’s network."
            )
        return {"ok": False, "message": msg, "products": []}

    normalized: list[dict[str, Any]] = []
    for raw in items:
        try:
            normalized.append(normalize_product(raw, resolved_location))
        except Exception as exc:  # pragma: no cover - defensive parse
            logger.warning("normalize_product_failed: %s", exc)

    return {"ok": True, "products": normalized}


@mcp.tool()
def add_kroger_items_to_cart(session_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    token = get_user_token(session_id)
    if not token:
        return {"ok": True, "authenticated": False, "results": [], "openCartUrl": OPEN_CART_URL}

    results: list[dict[str, Any]] = []
    for raw_item in items:
        item = CartItemPayload.model_validate(raw_item)
        try:
            add_single_item_to_cart(token["access_token"], item)
            results.append(
                {
                    "upc": item.upc,
                    "quantity": item.quantity,
                    "success": True,
                    "message": "Added to Kroger cart.",
                }
            )
        except requests.RequestException as error:
            results.append(
                {
                    "upc": item.upc,
                    "quantity": item.quantity,
                    "success": False,
                    "message": str(error),
                }
            )

    store_last_cart_summary(session_id, results)
    return {"ok": True, "authenticated": True, "results": results, "openCartUrl": OPEN_CART_URL}


@mcp.tool()
def get_kroger_cart_summary(session_id: str) -> dict[str, Any]:
    session = load_session_data(session_id)
    summary = session.get("last_cart_summary") or {
        "retailer": "Kroger",
        "items": [],
        "openCartUrl": OPEN_CART_URL,
    }
    return {
        "ok": True,
        "authenticated": bool(get_user_token(session_id)),
        **summary,
    }


mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp_app.router.lifespan_context(mcp_app):
        yield


# Host allowlist: docker service names + Cloud Run / Fly hostnames. Lock down with IAM (GCP) or INTERNAL_SIDECAR_SECRET (Fly).
fastapi = FastAPI(
    title="CraveCart Kroger MCP",
    lifespan=lifespan,
    allowed_hosts=["*"],
)
fastapi.add_middleware(InternalSidecarGate)
fastapi.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
fastapi.mount("/mcp", mcp_app)


@fastapi.get("/health")
def health() -> dict[str, Any]:
    redir = env("KROGER_REDIRECT_URI")
    try:
        import curl_cffi  # noqa: F401

        curl_ok = True
    except ImportError:
        curl_ok = False
    return {
        "ok": True,
        "configured": is_configured(),
        "krogerRedirectUriConfigured": bool(redir),
        "krogerApiV1Root": kroger_v1_root(),
        "clientCredentialScopeRequested": client_credentials_scope(),
        "userOAuthScopesRequested": KROGER_USER_OAUTH_SCOPES,
        "productCatalogTlsImpersonation": curl_ok,
        "notes": "OAuth + Products use the same api host — set KROGER_API_HOST to api-ce.kroger.com if your client was issued in Certification.",
    }


@fastapi.post("/auth/start")
def auth_start(x_cravecart_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = require_session(x_cravecart_session)

    if not is_configured():
        raise HTTPException(status_code=400, detail="Kroger credentials are not configured.")

    state = token_urlsafe(24)
    session = load_session_data(session_id)
    session["oauth_state"] = state
    save_session_data(session_id, session)

    # Build the OAuth URL in steps to avoid f-string/braces parsing issues.
    params = {
        "response_type": "code",
        "client_id": env("KROGER_CLIENT_ID"),
        "redirect_uri": env("KROGER_REDIRECT_URI"),
        "scope": KROGER_USER_OAUTH_SCOPES,
        "state": state,
    }
    auth_url = f"{kroger_auth_base()}?{urlencode(params)}"

    return {"authUrl": auth_url}


@fastapi.post("/auth/callback")
def auth_callback(payload: AuthCallbackPayload, x_cravecart_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = require_session(x_cravecart_session)

    session = load_session_data(session_id)
    if session.get("oauth_state") != payload.state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch.")

    try:
        token = exchange_code(payload.code)
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail=f"Kroger token exchange failed: {error}") from error

    session["token"] = token
    session["connected_at"] = time.time()
    save_session_data(session_id, session)

    return {
        "ok": True,
        "connected": True,
        "profileId": get_profile_id(token["access_token"]),
    }


app = fastapi
