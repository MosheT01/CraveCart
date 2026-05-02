from __future__ import annotations

import html
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Any

import requests
from fastapi import FastAPI
from internal_gate import InternalSidecarGate
from mcp.server.fastmcp import FastMCP
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    YouTubeTranscriptApiException,
)

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript"
TRANSCRIPT_PROBE_LIMIT = 5
TRANSCRIPT_LANGUAGES = ["en", "en-US", "en-GB"]
TRANSCRIPT_CACHE_TTL_SECONDS = 15 * 60
TRANSCRIPT_PROBE_CACHE_TTL_SECONDS = 10 * 60
TRANSCRIPT_TRANSIENT_CACHE_TTL_SECONDS = 60
SUPADATA_POLL_INTERVAL_SECONDS = 1.0
SUPADATA_POLL_TIMEOUT_SECONDS = 30.0

_transcript_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_transcript_probe_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def env(name: str, fallback: str = "") -> str:
    return os.getenv(name, fallback).strip()


def is_configured() -> bool:
    return bool(env("YOUTUBE_API_KEY"))


def is_supadata_configured() -> bool:
    return bool(env("SUPADATA_API_KEY"))


def parse_iso_duration_to_seconds(value: str | None) -> int:
    if not value:
        return 0

    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not match:
        return 0

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def format_iso_duration(value: str | None) -> str | None:
    total_seconds = parse_iso_duration_to_seconds(value)
    if not total_seconds:
      return None

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def score_video(query: str, title: str, description: str, duration_seconds: int | None) -> int:
    haystack = f"{title} {description}".lower()
    score = 0
    query_root = query.lower().replace(" recipe", "")

    if query_root and query_root in haystack:
        score += 10

    for token in [
        "recipe",
        "how to make",
        "cooking",
        "kitchen",
        "chef",
        "burger",
        "cheeseburger",
        "alfredo",
        "cookies",
        "salad",
    ]:
        if token in haystack:
            score += 4

    if "shorts" in haystack:
        score -= 10

    if re.search(r"\b(\d+|three|four|five|six|seven|eight|nine|ten)\b", title.lower()) and re.search(
        r"\b(recipes|ways|ideas|roundup|collection)\b", haystack
    ):
        score -= 7

    if "hungarian language" in haystack or "in hungarian" in haystack:
        score -= 8

    if re.search(r"\b(business|restaurant|menu|food truck|catering)\b", haystack):
        score -= 10

    if duration_seconds is not None:
        if 180 <= duration_seconds <= 1200:
            score += 5
        elif duration_seconds < 60:
            score -= 6

    return score


def clean_transcript(text: str) -> str:
    cleaned = html.unescape(text)
    cleaned = re.sub(r"\[.*?\]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    for phrase in [
        "subscribe",
        "like this video",
        "turn on notifications",
        "welcome back to my channel",
    ]:
        cleaned = cleaned.replace(phrase, "")

    return cleaned.strip()


def cache_get(
    cache: dict[str, tuple[float, dict[str, Any]]],
    key: str,
) -> dict[str, Any] | None:
    cached = cache.get(key)
    if not cached:
        return None

    expires_at, payload = cached
    if expires_at <= time.monotonic():
        cache.pop(key, None)
        return None

    return dict(payload)


def cache_set(
    cache: dict[str, tuple[float, dict[str, Any]]],
    key: str,
    ttl_seconds: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    cache[key] = (time.monotonic() + ttl_seconds, dict(payload))
    return payload


def cache_ttl_for_payload(success_ttl_seconds: int, payload: dict[str, Any]) -> int:
    status = payload.get("transcriptStatus")
    if status in {"blocked", "error"}:
        return TRANSCRIPT_TRANSIENT_CACHE_TTL_SECONDS
    return success_ttl_seconds


def build_transcript_error_payload(error: Exception) -> dict[str, Any]:
    if isinstance(error, (RequestBlocked, IpBlocked)):
        return {
            "ok": False,
            "transcriptAvailable": False,
            "transcriptStatus": "blocked",
            "message": (
                "YouTube temporarily blocked transcript retrieval for this video. "
                "The transcript may still exist, but the server could not fetch it right now."
            ),
        }

    if isinstance(error, (NoTranscriptFound, TranscriptsDisabled)):
        return {
            "ok": False,
            "transcriptAvailable": False,
            "transcriptStatus": "unavailable",
            "message": "Transcript unavailable for this video.",
        }

    if isinstance(error, YouTubeTranscriptApiException):
        return {
            "ok": False,
            "transcriptAvailable": False,
            "transcriptStatus": "error",
            "message": "Could not retrieve the transcript right now.",
        }

    return {
        "ok": False,
        "transcriptAvailable": False,
        "transcriptStatus": "error",
        "message": "Could not retrieve the transcript right now.",
    }


def youtube_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def supadata_get(path: str = "", params: dict[str, Any] | None = None) -> requests.Response:
    response = requests.get(
        f"{SUPADATA_TRANSCRIPT_URL}{path}",
        params=params or None,
        headers={"x-api-key": env("SUPADATA_API_KEY")},
        timeout=60,
    )
    return response


def normalize_query(query: str) -> str:
    normalized = query.lower()
    patterns = [
        r"\bwith (a )?transcript\b",
        r"\bauto cc\b",
        r"\bclosed captions?\b",
        r"\bcaptions?\b",
        r"\btell me about\b",
        r"\bfind me\b",
        r"\bshow me\b",
        r"\bsearch for\b",
        r"\byoutube\b",
        r"\bvideos?\b",
    ]

    for pattern in patterns:
        normalized = re.sub(pattern, " ", normalized)

    normalized = re.sub(r"\s+", " ", normalized).strip(" ?")
    normalized = re.sub(r"^(a|an|the)\s+", "", normalized)

    if normalized and not re.search(r"\b(recipe|how to|tutorial)\b", normalized):
        normalized = f"{normalized} recipe"

    return normalized or query


def fetch_video_lookup(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not video_ids:
        return {}

    payload = youtube_get(
        VIDEOS_URL,
        {
            "part": "snippet,contentDetails",
            "id": ",".join(video_ids),
            "key": env("YOUTUBE_API_KEY"),
        },
    )
    return {item["id"]: item for item in payload.get("items", [])}


def search_videos(query: str, max_results: int) -> list[dict[str, Any]]:
    query = normalize_query(query)
    payload = youtube_get(
        SEARCH_URL,
        {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max(12, min(max_results * 6, 24)),
            "relevanceLanguage": "en",
            "key": env("YOUTUBE_API_KEY"),
        },
    )

    ids = [item.get("id", {}).get("videoId") for item in payload.get("items", [])]
    ids = [item for item in ids if item]
    lookup = fetch_video_lookup(ids)

    videos: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        video_id = item.get("id", {}).get("videoId")
        if not video_id:
            continue

        details = lookup.get(video_id, {})
        snippet = details.get("snippet") or item.get("snippet", {})
        duration_raw = (details.get("contentDetails") or {}).get("duration")
        duration_seconds = parse_iso_duration_to_seconds(duration_raw) if duration_raw else None

        videos.append(
            {
                "videoId": video_id,
                "title": snippet.get("title", ""),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "channel": snippet.get("channelTitle", ""),
                "description": snippet.get("description", ""),
                "duration": format_iso_duration(duration_raw),
                "durationSeconds": duration_seconds,
                "score": score_video(
                    query=query,
                    title=snippet.get("title", ""),
                    description=snippet.get("description", ""),
                    duration_seconds=duration_seconds,
                ),
            }
        )

    videos.sort(key=lambda item: item["score"], reverse=True)
    top_candidates = videos[: min(len(videos), TRANSCRIPT_PROBE_LIMIT)]

    for video in top_candidates:
        transcript_probe = probe_transcript(video["videoId"])
        transcript_available = bool(transcript_probe.get("transcriptAvailable"))
        video["transcriptAvailable"] = transcript_available
        if transcript_probe.get("transcriptStatus"):
            video["transcriptStatus"] = transcript_probe["transcriptStatus"]
        if transcript_probe.get("message"):
            video["transcriptMessage"] = transcript_probe["message"]
        if transcript_available:
            video["score"] += 12
        elif transcript_probe.get("transcriptStatus") == "unavailable":
            video["score"] -= 2

    transcript_backed = [video for video in top_candidates if video.get("transcriptAvailable")]
    if transcript_backed:
        videos = transcript_backed
    else:
        videos = top_candidates

    videos.sort(
        key=lambda item: (
            1 if item.get("transcriptAvailable") else 0,
            item["score"],
        ),
        reverse=True,
    )
    return videos[: max(1, min(max_results, 5))]


def probe_transcript(video_id: str) -> dict[str, Any]:
    cached = cache_get(_transcript_probe_cache, video_id)
    if cached:
        return cached

    try:
        transcript_list = YouTubeTranscriptApi().list(video_id)
        transcript_list.find_transcript(TRANSCRIPT_LANGUAGES)
        payload = {
            "ok": True,
            "transcriptAvailable": True,
            "transcriptStatus": "available",
        }
        return cache_set(
            _transcript_probe_cache,
            video_id,
            cache_ttl_for_payload(TRANSCRIPT_PROBE_CACHE_TTL_SECONDS, payload),
            payload,
        )
    except Exception as error:
        payload = build_transcript_error_payload(error)
        return cache_set(
            _transcript_probe_cache,
            video_id,
            cache_ttl_for_payload(TRANSCRIPT_PROBE_CACHE_TTL_SECONDS, payload),
            payload,
        )


def build_supadata_unavailable_payload(message: str = "Transcript unavailable for this video.") -> dict[str, Any]:
    return {
        "ok": False,
        "transcriptAvailable": False,
        "transcriptStatus": "unavailable",
        "message": message,
    }


def build_supadata_error_payload(message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "transcriptAvailable": False,
        "transcriptStatus": "error",
        "message": message,
    }


def build_supadata_transcript_payload(data: dict[str, Any]) -> dict[str, Any]:
    content = data.get("content")

    if isinstance(content, list):
        text = " ".join(
            str(chunk.get("text", "")).strip()
            for chunk in content
            if isinstance(chunk, dict) and chunk.get("text")
        )
    else:
        text = str(content or "")

    cleaned = clean_transcript(text)
    if not cleaned:
        return build_supadata_error_payload("Supadata returned an empty transcript.")

    return {
        "ok": True,
        "transcriptAvailable": True,
        "transcriptStatus": "available",
        "wordCount": len(cleaned.split()),
        "transcript": cleaned[:16000],
    }


def poll_supadata_transcript_job(job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + SUPADATA_POLL_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        response = supadata_get(f"/{job_id}")
        if response.status_code >= 400:
            return build_supadata_error_payload(
                f"Supadata transcript job failed with HTTP {response.status_code}."
            )

        data = response.json()
        status = str(data.get("status") or "").lower()

        if status == "completed":
            result = data.get("result")
            if isinstance(result, dict):
                return build_supadata_transcript_payload(result)
            return build_supadata_transcript_payload(data)

        if status == "failed":
            error_message = data.get("error")
            if isinstance(error_message, dict):
                error_message = error_message.get("message") or error_message.get("details")
            return build_supadata_error_payload(
                str(error_message or "Supadata transcript job failed.")
            )

        time.sleep(SUPADATA_POLL_INTERVAL_SECONDS)

    return build_supadata_error_payload("Supadata transcript job timed out.")


def try_fetch_supadata_transcript_payload(video_id: str) -> tuple[dict[str, Any] | None, bool]:
    if not is_supadata_configured():
        return None, False

    response = supadata_get(
        params={
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "mode": "native",
            "text": "true",
        }
    )

    if response.status_code == 200:
        return build_supadata_transcript_payload(response.json()), False

    if response.status_code == 202:
        job_id = str((response.json() or {}).get("jobId") or "").strip()
        if not job_id:
            return build_supadata_error_payload("Supadata returned an empty transcript job id."), False
        return poll_supadata_transcript_job(job_id), False

    if response.status_code == 206:
        return build_supadata_unavailable_payload(), False

    if response.status_code in {401, 403}:
        return (
            build_supadata_error_payload(
                f"Supadata transcript API rejected the request with HTTP {response.status_code}."
            ),
            False,
        )

    if response.status_code == 404:
        return build_supadata_unavailable_payload(), False

    if response.status_code == 429:
        return (
            build_supadata_error_payload(
                "Supadata transcript API rate limit exceeded. Falling back to direct YouTube retrieval."
            ),
            True,
        )

    return (
        build_supadata_error_payload(
            f"Supadata transcript API failed with HTTP {response.status_code}."
        ),
        True,
    )


def fetch_youtube_transcript_payload(video_id: str) -> dict[str, Any]:
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id, languages=TRANSCRIPT_LANGUAGES)
        text = " ".join(part.text for part in transcript)
        cleaned = clean_transcript(text)
        if not cleaned:
            return {
                "ok": False,
                "transcriptAvailable": False,
                "transcriptStatus": "error",
                "message": "Could not retrieve the transcript right now.",
            }

        return {
            "ok": True,
            "transcriptAvailable": True,
            "transcriptStatus": "available",
            "wordCount": len(cleaned.split()),
            "transcript": cleaned[:16000],
        }
    except Exception as error:
        return build_transcript_error_payload(error)


def merge_transcript_failures(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    primary_message = str(primary.get("message") or "").strip()
    fallback_message = str(fallback.get("message") or "").strip()

    if primary_message and fallback_message and fallback_message != primary_message:
        message = f"{primary_message} {fallback_message}"
    else:
        message = primary_message or fallback_message or "Could not retrieve the transcript right now."

    return {
        "ok": False,
        "transcriptAvailable": False,
        "transcriptStatus": primary.get("transcriptStatus") or fallback.get("transcriptStatus") or "error",
        "message": message,
    }


def fetch_transcript_payload(video_id: str) -> dict[str, Any]:
    cached = cache_get(_transcript_cache, video_id)
    if cached:
        return cached

    payload: dict[str, Any]
    supadata_payload, can_fallback = try_fetch_supadata_transcript_payload(video_id)
    if supadata_payload and (supadata_payload.get("ok") or not can_fallback):
        payload = supadata_payload
    else:
        youtube_payload = fetch_youtube_transcript_payload(video_id)
        if youtube_payload.get("ok"):
            payload = youtube_payload
        elif supadata_payload:
            payload = merge_transcript_failures(supadata_payload, youtube_payload)
        else:
            payload = youtube_payload

    return cache_set(
        _transcript_cache,
        video_id,
        cache_ttl_for_payload(TRANSCRIPT_CACHE_TTL_SECONDS, payload),
        payload,
    )


def get_video_detail(video_id: str) -> dict[str, Any]:
    lookup = fetch_video_lookup([video_id])
    details = lookup.get(video_id)
    if not details:
        return {
            "videoId": video_id,
            "title": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "channel": "",
            "description": "",
            "duration": None,
            "durationSeconds": None,
            "score": 0,
        }

    snippet = details.get("snippet") or {}
    duration_raw = (details.get("contentDetails") or {}).get("duration")
    return {
        "videoId": video_id,
        "title": snippet.get("title", ""),
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "channel": snippet.get("channelTitle", ""),
        "description": snippet.get("description", ""),
        "duration": format_iso_duration(duration_raw),
        "durationSeconds": parse_iso_duration_to_seconds(duration_raw) if duration_raw else None,
        "score": 0,
    }


mcp = FastMCP(
    "CraveCart YouTube MCP",
    instructions=(
        "Use these tools for YouTube cooking-video discovery and transcript retrieval. "
        "Prefer get_video_context after search when you need a transcript and metadata together."
    ),
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    # FastMCP validates incoming Host headers against this host/port pair.
    host="youtube-mcp",
    port=8100,
)


@mcp.tool()
def search_youtube_videos(query: str, max_results: int = 5) -> dict[str, Any]:
    if not is_configured():
        return {"ok": False, "message": "YOUTUBE_API_KEY is not configured.", "videos": []}

    try:
        normalized_max_results = max(3, min(max_results, 5))
        return {"ok": True, "videos": search_videos(query=query, max_results=normalized_max_results)}
    except requests.RequestException as error:
        return {"ok": False, "message": f"YouTube search failed: {error}", "videos": []}


@mcp.tool()
def get_video_transcript(video_id: str) -> dict[str, Any]:
    return fetch_transcript_payload(video_id)


@mcp.tool()
def get_video_context(video_id: str) -> dict[str, Any]:
    video = get_video_detail(video_id)
    transcript_payload = get_video_transcript(video_id)

    return {
        "ok": True,
        "video": video,
        "transcriptAvailable": bool(transcript_payload.get("transcriptAvailable")),
        "transcriptStatus": transcript_payload.get("transcriptStatus"),
        "transcript": transcript_payload.get("transcript"),
        "wordCount": transcript_payload.get("wordCount"),
        "transcriptMessage": transcript_payload.get("message"),
    }


mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp_app.router.lifespan_context(mcp_app):
        yield


# Host allowlist: Compose uses service hostnames; Cloud Run uses *.run.app — public invoke is disabled there (IAM).
fastapi = FastAPI(
    title="CraveCart YouTube MCP",
    lifespan=lifespan,
    allowed_hosts=["*"],
)
# Bearer gate when INTERNAL_SIDECAR_SECRET is set (local/docker); Cloud Run uses IAM at the edge.
fastapi.add_middleware(InternalSidecarGate)
# TLS / scheme from reverse proxy (Cloud Run, Fly).
fastapi.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
fastapi.mount("/mcp", mcp_app)


@fastapi.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": is_configured(),
        "supadataConfigured": is_supadata_configured(),
    }


app = fastapi
