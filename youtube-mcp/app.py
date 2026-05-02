from __future__ import annotations

import html
import os
import re
from contextlib import asynccontextmanager
from typing import Any

import requests
from fastapi import FastAPI
from internal_gate import InternalSidecarGate
from mcp.server.fastmcp import FastMCP
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
TRANSCRIPT_PROBE_LIMIT = 5


def env(name: str, fallback: str = "") -> str:
    return os.getenv(name, fallback).strip()


def is_configured() -> bool:
    return bool(env("YOUTUBE_API_KEY"))


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


def youtube_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


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
        transcript_available = has_transcript(video["videoId"])
        video["transcriptAvailable"] = transcript_available
        if transcript_available:
            video["score"] += 12
        else:
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


def fetch_transcript(video_id: str) -> str | None:
    transcript = YouTubeTranscriptApi().fetch(video_id, languages=["en", "en-US", "en-GB"])
    text = " ".join(part.text for part in transcript)
    cleaned = clean_transcript(text)
    return cleaned or None


def has_transcript(video_id: str) -> bool:
    try:
        return bool(fetch_transcript(video_id))
    except Exception:
        return False


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
    try:
        transcript = fetch_transcript(video_id)
        if not transcript:
            return {"ok": False, "transcriptAvailable": False, "message": "Transcript unavailable."}

        return {
            "ok": True,
            "transcriptAvailable": True,
            "wordCount": len(transcript.split()),
            "transcript": transcript[:16000],
        }
    except (NoTranscriptFound, TranscriptsDisabled):
        return {"ok": False, "transcriptAvailable": False, "message": "Transcript unavailable."}
    except Exception:
        return {"ok": False, "transcriptAvailable": False, "message": "Transcript unavailable."}


@mcp.tool()
def get_video_context(video_id: str) -> dict[str, Any]:
    video = get_video_detail(video_id)
    transcript_payload = get_video_transcript(video_id)

    return {
        "ok": True,
        "video": video,
        "transcriptAvailable": bool(transcript_payload.get("transcriptAvailable")),
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
    }


app = fastapi
