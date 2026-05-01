from __future__ import annotations

import base64
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import token_urlsafe
from typing import Any
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, Header, HTTPException
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

BASE_URL = "https://api.kroger.com/v1"
AUTH_URL = f"{BASE_URL}/connect/oauth2/authorize"
TOKEN_URL = f"{BASE_URL}/connect/oauth2/token"
OPEN_CART_URL = "https://www.kroger.com/cart"
DATA_DIR = Path(__file__).resolve().parent / "data" / "sessions"
CLIENT_TOKEN_PATH = Path(__file__).resolve().parent / "data" / "client_token.json"

MOCK_PRODUCTS = [
    {"productId": "mock-ground-beef", "upc": "0001111000001", "description": "Kroger Ground Beef 80/20", "brand": "Kroger", "size": "1 lb", "priceValue": 7.99, "priceLabel": "$7.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-buns", "upc": "0001111000002", "description": "Kroger Hamburger Buns", "brand": "Kroger", "size": "8 ct", "priceValue": 2.79, "priceLabel": "$2.79", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-cheese", "upc": "0001111000003", "description": "Kroger American Cheese Slices", "brand": "Kroger", "size": "16 ct", "priceValue": 3.49, "priceLabel": "$3.49", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-lettuce", "upc": "0001111000004", "description": "Fresh Romaine Lettuce Hearts", "brand": None, "size": "3 ct", "priceValue": 3.99, "priceLabel": "$3.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-tomato", "upc": "0001111000005", "description": "Vine Ripe Tomatoes", "brand": None, "size": "1 lb", "priceValue": 2.49, "priceLabel": "$2.49", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-onion", "upc": "0001111000006", "description": "Yellow Onion", "brand": None, "size": "1 ct", "priceValue": 0.99, "priceLabel": "$0.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-pickles", "upc": "0001111000007", "description": "Kroger Dill Pickle Chips", "brand": "Kroger", "size": "24 oz", "priceValue": 3.29, "priceLabel": "$3.29", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-ketchup", "upc": "0001111000008", "description": "Kroger Tomato Ketchup", "brand": "Kroger", "size": "20 oz", "priceValue": 2.39, "priceLabel": "$2.39", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-mustard", "upc": "0001111000009", "description": "Kroger Yellow Mustard", "brand": "Kroger", "size": "20 oz", "priceValue": 1.89, "priceLabel": "$1.89", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-mayo", "upc": "0001111000010", "description": "Kroger Real Mayonnaise", "brand": "Kroger", "size": "30 oz", "priceValue": 4.59, "priceLabel": "$4.59", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-chicken", "upc": "0001111000011", "description": "Kroger Boneless Skinless Chicken Breast", "brand": "Kroger", "size": "1.5 lb", "priceValue": 8.99, "priceLabel": "$8.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-fettuccine", "upc": "0001111000012", "description": "Private Selection Fettuccine Pasta", "brand": "Private Selection", "size": "16 oz", "priceValue": 2.19, "priceLabel": "$2.19", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-heavy-cream", "upc": "0001111000013", "description": "Kroger Heavy Whipping Cream", "brand": "Kroger", "size": "16 fl oz", "priceValue": 3.79, "priceLabel": "$3.79", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-parm", "upc": "0001111000014", "description": "Kroger Grated Parmesan Cheese", "brand": "Kroger", "size": "8 oz", "priceValue": 4.99, "priceLabel": "$4.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-flour", "upc": "0001111000015", "description": "Kroger All Purpose Flour", "brand": "Kroger", "size": "5 lb", "priceValue": 3.69, "priceLabel": "$3.69", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-butter", "upc": "0001111000016", "description": "Kroger Salted Butter", "brand": "Kroger", "size": "16 oz", "priceValue": 4.79, "priceLabel": "$4.79", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-sugar", "upc": "0001111000017", "description": "Kroger Granulated Sugar", "brand": "Kroger", "size": "4 lb", "priceValue": 3.29, "priceLabel": "$3.29", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-brown-sugar", "upc": "0001111000018", "description": "Kroger Brown Sugar", "brand": "Kroger", "size": "2 lb", "priceValue": 2.99, "priceLabel": "$2.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-eggs", "upc": "0001111000019", "description": "Kroger Large Eggs", "brand": "Kroger", "size": "12 ct", "priceValue": 3.49, "priceLabel": "$3.49", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-chips", "upc": "0001111000020", "description": "Kroger Semi Sweet Chocolate Chips", "brand": "Kroger", "size": "12 oz", "priceValue": 2.99, "priceLabel": "$2.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-romaine", "upc": "0001111000021", "description": "Fresh Romaine Hearts", "brand": None, "size": "3 ct", "priceValue": 3.99, "priceLabel": "$3.99", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-croutons", "upc": "0001111000022", "description": "Kroger Caesar Croutons", "brand": "Kroger", "size": "5 oz", "priceValue": 2.49, "priceLabel": "$2.49", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-lemon", "upc": "0001111000023", "description": "Fresh Lemon", "brand": None, "size": "1 ct", "priceValue": 0.79, "priceLabel": "$0.79", "imageUrl": None, "modality": "PICKUP"},
    {"productId": "mock-milk", "upc": "0001111000024", "description": "Kroger 2% Reduced Fat Milk", "brand": "Kroger", "size": "1 gal", "priceValue": 3.59, "priceLabel": "$3.59", "imageUrl": None, "modality": "PICKUP"},
]


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


def is_mock_mode() -> bool:
    value = env("KROGER_MOCK_MODE").lower()
    return value in {"1", "true", "yes", "on"} or not (
        env("KROGER_CLIENT_ID") and env("KROGER_CLIENT_SECRET") and env("KROGER_REDIRECT_URI")
    )


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


def token_is_valid(token: dict[str, Any] | None) -> bool:
    if not token:
        return False
    return float(token.get("expires_at", 0)) > time.time() + 30


def request_client_token() -> dict[str, Any]:
    response = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        data={
            "grant_type": "client_credentials",
            "scope": "product.compact",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 1800))
    CLIENT_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLIENT_TOKEN_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_client_token() -> dict[str, Any]:
    if CLIENT_TOKEN_PATH.exists():
        cached = json.loads(CLIENT_TOKEN_PATH.read_text(encoding="utf-8"))
        if token_is_valid(cached):
            return cached
    return request_client_token()


def exchange_code(code: str) -> dict[str, Any]:
    response = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": env("KROGER_REDIRECT_URI"),
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 1800))
    return payload


def refresh_user_token(refresh_token: str) -> dict[str, Any]:
    response = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
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
    if is_mock_mode():
        return {"access_token": "mock-token", "expires_at": time.time() + 3600}

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
    response = requests.get(
        f"{BASE_URL}/identity/profile",
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


def search_mock_products(query: str) -> list[dict[str, Any]]:
    normalized = query.lower()
    tokens = [token for token in normalized.replace("/", " ").split() if token]
    ranked = []
    for product in MOCK_PRODUCTS:
        description = product["description"].lower()
        token_score = sum(1 for token in tokens if token in description)
        score = token_score + 3 if normalized in description else token_score
        if score > 0:
            ranked.append((score, product["priceValue"], product))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in ranked[:5]]


def add_single_item_to_cart(access_token: str, item: CartItemPayload) -> None:
    response = requests.put(
        f"{BASE_URL}/cart/add",
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
    if is_mock_mode():
        return {
            "ok": True,
            "authenticated": True,
            "mockMode": True,
            "configured": False,
            "authUrl": "/auth/kroger",
        }

    token = get_user_token(session_id)
    return {
        "ok": True,
        "authenticated": bool(token),
        "mockMode": False,
        "configured": is_configured(),
        "authUrl": "/auth/kroger",
    }


@mcp.tool()
def search_kroger_products(query: str, location_id: str | None = None, limit: int = 10) -> dict[str, Any]:
    resolved_location = location_id or default_location_id()

    if is_mock_mode():
        return {"ok": True, "products": search_mock_products(query)[: max(1, min(limit, 10))]}

    if not is_configured():
        return {"ok": False, "message": "Kroger credentials are not configured.", "products": []}

    token = load_client_token()
    response = requests.get(
        f"{BASE_URL}/products",
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Accept": "application/json",
        },
        params={
            "filter.term": query,
            "filter.locationId": resolved_location,
            "filter.limit": max(1, min(limit, 10)),
        },
        timeout=30,
    )

    try:
        response.raise_for_status()
    except requests.RequestException as error:
        return {"ok": False, "message": f"Kroger product search failed: {error}", "products": []}

    items = response.json().get("data", [])
    return {
        "ok": True,
        "products": [normalize_product(item, resolved_location) for item in items],
    }


@mcp.tool()
def add_kroger_items_to_cart(session_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    if is_mock_mode():
        results = [
            {
                "upc": item.get("upc"),
                "quantity": int(item.get("quantity", 1)),
                "success": True,
                "message": f"Mock-added {item.get('upc')}",
            }
            for item in items
        ]
        store_last_cart_summary(session_id, results)
        return {"ok": True, "authenticated": True, "results": results, "openCartUrl": OPEN_CART_URL}

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
        "authenticated": True if is_mock_mode() else bool(get_user_token(session_id)),
        **summary,
    }


mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp_app.router.lifespan_context(mcp_app):
        yield


# Starlette/HostHeaderMiddleware can be strict about Host header values.
# In Docker, the client sends Host like `kroger-mcp:8000`, so we allow those.
fastapi = FastAPI(
    title="CraveCart Kroger MCP",
    lifespan=lifespan,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "kroger-mcp",
        "kroger-mcp:8000",
    ],
)
fastapi.mount("/mcp", mcp_app)


@fastapi.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": is_configured(),
        "mockMode": is_mock_mode(),
    }


@fastapi.post("/auth/start")
def auth_start(x_cravecart_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = require_session(x_cravecart_session)

    if is_mock_mode():
        return {"authUrl": "/"}

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
        "scope": "cart.basic:write profile.compact",
        "state": state,
    }
    auth_url = f"{AUTH_URL}?{urlencode(params)}"

    return {"authUrl": auth_url}


@fastapi.post("/auth/callback")
def auth_callback(payload: AuthCallbackPayload, x_cravecart_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = require_session(x_cravecart_session)

    if is_mock_mode():
        return {"ok": True, "connected": True, "profileId": "mock-profile"}

    session = load_session_data(session_id)
    if session.get("oauth_state") != payload.state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch.")

    try:
        token = exchange_code(payload.code)
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
