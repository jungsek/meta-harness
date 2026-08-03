#!/usr/bin/env python3
"""Resolve a single Instagram / TikTok / X (Twitter) post URL to downloaded media.

Given one social post URL this script:
  1. resolves short/share URLs (vt.tiktok.com, t.co, instagram share links) to canonical
  2. detects the platform
  3. fetches post metadata + real media CDN URLs:
       - TikTok / Instagram -> Apify actor (run-sync, downloads nothing on Apify's side
         beyond scraping; we pull the actual files ourselves)
       - X / Twitter        -> the FREE public syndication endpoint (no token, no cost)
  4. downloads every media file into <out-dir>/media/
  5. writes <out-dir>/manifest.json (also printed to stdout)

The manifest is the contract with the caller (brain-ingest): each media item is
tagged kind=video|image so the caller can route videos to /watch and images to a
direct Read. This script does NO visual analysis itself — it is a pure resolver.

Stdlib only (urllib) to match the /watch skill's zero-dependency posture.

Apify token lookup order (needed only for TikTok + Instagram):
  1. $APIFY_API_TOKEN
  2. ~/.config/social-fetch/.env   (KEY=VALUE lines, gitignored, machine-local)

Usage:
  python3 resolve.py <social-post-url> <out-dir>
"""
from __future__ import annotations

import json
import math
import mimetypes
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

CONFIG_ENV = Path.home() / ".config" / "social-fetch" / ".env"

TIKTOK_ACTOR = os.environ.get("APIFY_TIKTOK_ACTOR", "clockworks/tiktok-scraper")
IG_ACTOR = os.environ.get("APIFY_INSTAGRAM_ACTOR", "apify/instagram-scraper")

APIFY_BASE = "https://api.apify.com/v2"
APIFY_RUN_TIMEOUT = 300  # seconds; run-sync aborts server-side past this


# ---------------------------------------------------------------- token / http
def read_env_file(path: Path) -> dict:
    values: dict = {}
    if not path.exists():
        return values
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, _, value = raw.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def apify_token() -> str | None:
    tok = os.environ.get("APIFY_API_TOKEN")
    if tok:
        return tok.strip()
    return read_env_file(CONFIG_ENV).get("APIFY_API_TOKEN") or None


def http_get(url: str, timeout: int = 30, headers: dict | None = None) -> bytes:
    req = Request(url, headers={"User-Agent": UA, **(headers or {})})
    last = None
    for attempt in range(4):
        try:
            with urlopen(req, timeout=timeout) as r:
                return r.read()
        except (HTTPError, URLError, TimeoutError) as e:
            last = e
            # 4xx (except 429) won't get better with a retry.
            if isinstance(e, HTTPError) and e.code not in (429, 500, 502, 503, 504):
                raise
            time.sleep(2 * (attempt + 1))
    raise last  # type: ignore[misc]


def resolve_redirects(url: str) -> str:
    """Follow redirects to the canonical URL (share/short links)."""
    try:
        req = Request(url, headers={"User-Agent": UA})
        with urlopen(req, timeout=20) as r:
            return r.geturl()
    except Exception:
        return url


def platform_of(url: str) -> str:
    h = urlparse(url).netloc.lower()
    if "tiktok" in h:
        return "tiktok"
    if "instagram" in h:
        return "instagram"
    if "twitter" in h or "x.com" in h:
        return "x"
    return "web"


# ------------------------------------------------------------------ apify call
def apify_run(actor: str, run_input: dict, token: str) -> list:
    """Run an actor synchronously and return its dataset items.

    run-sync-get-dataset-items blocks until the run finishes (or timeout) and
    returns the dataset items directly as JSON — no polling loop needed.
    """
    actor_path = actor.replace("/", "~")
    url = (f"{APIFY_BASE}/acts/{actor_path}/run-sync-get-dataset-items"
           f"?token={token}&timeout={APIFY_RUN_TIMEOUT}")
    body = json.dumps(run_input).encode("utf-8")
    last = None
    for attempt in range(3):
        try:
            req = Request(url, data=body,
                          headers={"User-Agent": UA, "Content-Type": "application/json"})
            with urlopen(req, timeout=APIFY_RUN_TIMEOUT + 30) as r:
                data = json.loads(r.read() or b"[]")
                return data if isinstance(data, list) else data.get("items", [])
        except HTTPError as e:
            last = e
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                pass
            if e.code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f"Apify {actor} HTTP {e.code}: {detail}") from e
            time.sleep(5 * (attempt + 1))
        except (URLError, TimeoutError) as e:
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Apify {actor} failed after retries: {last}")


# ---------------------------------------------------------------- per-platform
def _as_url(x) -> str | None:
    """Slideshow / image link fields come as bare strings or dicts — normalize."""
    if isinstance(x, str):
        return x
    if isinstance(x, dict):
        return x.get("url") or x.get("downloadLink") or x.get("downloadAddr")
    return None


def scrape_tiktok(url: str, token: str) -> tuple[dict, list, bool]:
    items = apify_run(TIKTOK_ACTOR, {
        "postURLs": [url],
        "resultsPerPage": 1,
        "shouldDownloadVideos": True,
        "shouldDownloadSlideshowImages": True,
        "shouldDownloadCovers": False,
        "shouldDownloadAvatars": False,
    }, token)
    if not items:
        raise RuntimeError("TikTok actor returned no items")
    it = items[0]
    if it.get("error"):
        raise RuntimeError(f"TikTok actor error: {it.get('error')}")
    is_slideshow = bool(it.get("slideshowImageLinks") or it.get("imagePost"))
    meta = {
        "author": (it.get("authorMeta") or {}).get("name") or it.get("authorName"),
        "author_name": (it.get("authorMeta") or {}).get("nickName"),
        "caption": it.get("text"),
        "hashtags": [h.get("name") for h in (it.get("hashtags") or []) if h.get("name")],
        "likes": it.get("diggCount"),
        "timestamp": it.get("createTimeISO") or it.get("createTime"),
        "type": "slideshow" if is_slideshow else "video",
    }
    media: list[dict] = []
    # Slideshow images take priority when present (a photo post has no real video).
    for link in (it.get("slideshowImageLinks") or []):
        u = _as_url(link)
        if u:
            media.append({"url": u, "kind": "image"})
    if not media:
        # Regular video post.
        vurl = (it.get("videoMeta") or {}).get("downloadAddr") or None
        for u in (it.get("mediaUrls") or []):
            media.append({"url": u, "kind": None})  # kind confirmed post-download
        if not media and vurl:
            media.append({"url": vurl, "kind": "video"})
    return meta, media, is_slideshow


def scrape_instagram(url: str, token: str) -> tuple[dict, list, bool]:
    items = apify_run(IG_ACTOR, {
        "directUrls": [url],
        "resultsType": "posts",
        "resultsLimit": 1,
        "addParentData": False,
    }, token)
    if not items:
        raise RuntimeError("Instagram actor returned no items")
    it = items[0]
    if it.get("error"):
        raise RuntimeError(f"Instagram actor error: {it.get('error')}")
    post_type = it.get("type")  # "Image" | "Video" | "Sidecar" (carousel)
    meta = {
        "author": it.get("ownerUsername"),
        "author_name": it.get("ownerFullName"),
        "caption": it.get("caption"),
        "hashtags": it.get("hashtags") or [],
        "likes": it.get("likesCount"),
        "timestamp": it.get("timestamp"),
        "type": post_type,
    }
    media: list[dict] = []

    def add_from(node: dict) -> None:
        if node.get("videoUrl"):
            media.append({"url": node["videoUrl"], "kind": "video"})
        elif node.get("displayUrl"):
            media.append({"url": node["displayUrl"], "kind": "image"})

    children = it.get("childPosts") or it.get("sidecarChildren") or []
    if children:
        for child in children:
            add_from(child)
    else:
        if it.get("videoUrl"):
            media.append({"url": it["videoUrl"], "kind": "video"})
        elif it.get("images"):
            media.extend({"url": u, "kind": "image"} for u in it["images"] if u)
        elif it.get("displayUrl"):
            media.append({"url": it["displayUrl"], "kind": "image"})

    is_carousel = (post_type == "Sidecar") or len(media) > 1
    return meta, media, is_carousel


def _tweet_token(tid: str) -> str:
    """react-tweet token: base36 of id/1e15*pi with 0s and dots stripped."""
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    x = (int(tid) / 1e15) * math.pi
    intpart = int(x)
    frac = x - intpart
    s = "0" if intpart == 0 else ""
    while intpart > 0:
        s = digits[intpart % 36] + s
        intpart //= 36
    out = s + "."
    for _ in range(20):
        frac *= 36
        d = int(frac)
        out += digits[d]
        frac -= d
    return re.sub(r"[0.]", "", out)


def scrape_twitter(url: str, token: str | None) -> tuple[dict, list, bool]:
    """Free path: Twitter's public syndication endpoint (no Apify, no auth)."""
    m = re.search(r"/status(?:es)?/(\d+)", url)
    if not m:
        raise RuntimeError("Could not find a tweet id in the URL")
    tid = m.group(1)
    api = (f"https://cdn.syndication.twimg.com/tweet-result?id={tid}"
           f"&lang=en&token={_tweet_token(tid)}")
    raw = http_get(api, timeout=20)
    it = json.loads(raw)
    user = it.get("user") or {}
    meta = {
        "author": user.get("screen_name"),
        "author_name": user.get("name"),
        "caption": it.get("text"),
        "hashtags": [h.get("text") for h in ((it.get("entities") or {}).get("hashtags") or [])],
        "likes": it.get("favorite_count"),
        "timestamp": it.get("created_at"),
        "type": "tweet",
    }
    media: list[dict] = []
    for md in (it.get("mediaDetails") or []):
        if md.get("type") == "video" and md.get("video_info"):
            variants = [v for v in md["video_info"].get("variants", [])
                        if v.get("content_type") == "video/mp4"]
            if variants:
                best = max(variants, key=lambda v: v.get("bitrate", 0))
                media.append({"url": best["url"], "kind": "video"})
        elif md.get("media_url_https"):
            media.append({"url": md["media_url_https"], "kind": "image"})
    return meta, media, len(media) > 1


SCRAPERS = {
    "tiktok": scrape_tiktok,
    "instagram": scrape_instagram,
    "x": scrape_twitter,
}


# ------------------------------------------------------------------- download
def ext_for(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    e = os.path.splitext(path)[1].lower()
    if e and len(e) <= 5:
        return e
    if content_type:
        guess = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guess:
            return ".jpg" if guess == ".jpe" else guess
    return ".bin"


def kind_for(ext: str, hinted: str | None) -> str:
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    return hinted or "image"


def download(url: str, dest_stem: Path, hinted_kind: str | None) -> dict | None:
    try:
        req = Request(url, headers={"User-Agent": UA})
        with urlopen(req, timeout=120) as r:
            ct = r.headers.get("content-type", "")
            ext = ext_for(url, ct)
            dest = dest_stem.with_suffix(ext)
            total = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    total += len(chunk)
        return {
            "path": dest.name,
            "abs_path": str(dest),
            "kind": kind_for(ext, hinted_kind),
            "bytes": total,
            "source_url": url,
        }
    except Exception as e:  # noqa: BLE001 - one bad media item shouldn't kill the post
        print(f"[social-fetch] download failed {url[:70]}: {e}", file=sys.stderr)
        return None


# ----------------------------------------------------------------------- main
def resolve(url: str, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    media_dir = out_dir / "media"
    media_dir.mkdir(exist_ok=True)

    canonical = resolve_redirects(url)
    platform = platform_of(canonical)
    if platform not in SCRAPERS:
        raise SystemExit(f"Unsupported platform for URL: {canonical} (host not TikTok/Instagram/X)")

    token = apify_token()
    if platform in ("tiktok", "instagram") and not token:
        raise SystemExit(
            "APIFY_API_TOKEN not found. Set it in the environment or in "
            f"{CONFIG_ENV} (KEY=VALUE). Required for TikTok and Instagram."
        )

    print(f"[social-fetch] {platform}: scraping {canonical}", file=sys.stderr)
    media: list[dict] = []
    errors: list[str] = []
    # A scrape failure (deleted/private post, actor "not_found", rate limit) is a
    # clean blocker for the caller, not a crash — capture it in the manifest so
    # brain-ingest can report it and move on instead of seeing a traceback.
    try:
        meta, media_specs, is_multi = SCRAPERS[platform](canonical, token)
    except Exception as e:  # noqa: BLE001
        meta, media_specs, is_multi = {}, [], False
        errors.append(f"scrape failed: {e}")

    for i, spec in enumerate(media_specs):
        entry = download(spec["url"], media_dir / f"{i}", spec.get("kind"))
        if entry is None:
            errors.append(f"failed to download media[{i}]: {spec['url'][:70]}")
            continue
        entry["index"] = len(media)
        entry["path"] = f"media/{Path(entry['path']).name}"
        media.append(entry)

    if not media:
        errors.append("no media downloaded")

    source = ("twitter-syndication" if platform == "x"
              else f"apify:{TIKTOK_ACTOR if platform == 'tiktok' else IG_ACTOR}")

    manifest = {
        "url": url,
        "canonical_url": canonical,
        "platform": platform,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "is_multi": is_multi,
        "post": meta,
        "media": media,
        "errors": errors,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: resolve.py <social-post-url> <out-dir>", file=sys.stderr)
        return 2
    manifest = resolve(sys.argv[1], Path(sys.argv[2]).expanduser().resolve())
    print(json.dumps(manifest, indent=2))
    n_video = sum(1 for m in manifest["media"] if m["kind"] == "video")
    n_image = sum(1 for m in manifest["media"] if m["kind"] == "image")
    print(f"[social-fetch] done: {n_video} video, {n_image} image, "
          f"{len(manifest['errors'])} error(s)", file=sys.stderr)
    return 0 if manifest["media"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
