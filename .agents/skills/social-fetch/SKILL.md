---
name: social-fetch
description: Resolve an Instagram, TikTok, or X (Twitter) post URL to its actual downloaded media (video or images) plus post metadata. Use this WHENEVER you have a tiktok.com, instagram.com, or x.com/twitter.com post link and need the real media file(s) — a Reel, a TikTok video, a TikTok photo slideshow, an Instagram carousel, or an X post with video/photos. This is the media-resolution step of brain-ingest for social links, and the reliable replacement for yt-dlp on these platforms (yt-dlp silently drops slideshows, truncates carousels, and hits Instagram login walls). Emits a manifest.json tagging each media item video|image so the caller routes videos to /watch and images to a direct Read.
allowed-tools: ["Bash(python3:*)", "Read"]
metadata:
  source: custom jung-os / BRAIN-OS
---

# social-fetch

Source: `/Users/jungsek/jung-os/.harness/skills/social-fetch/SKILL.md` (custom
jung-os / BRAIN-OS).

Turn one social post URL into downloaded media on disk plus a `manifest.json`.
This skill is a **pure resolver** — it downloads and describes; it does not do
visual analysis. Videos are handed to `/watch`; images are Read directly by the
caller (usually `brain-ingest`).

## Why this exists

`yt-dlp` is video-first and fails on social posts in ways that are worse than a
clean error: a TikTok photo slideshow downloads only the background audio (zero
frames), an Instagram carousel is truncated to its first item, and Instagram
Reels hit login walls. Apify returns the real CDN URLs for **every** media type
— video, slideshow, carousel, photo — so we fetch the actual files and let
`/watch` analyze videos from the local path (bypassing yt-dlp entirely).

## Media routing

| Platform | Fetcher | Cost |
|----------|---------|------|
| TikTok, Instagram | Apify actor (`clockworks/tiktok-scraper`, `apify/instagram-scraper`) | small per-run Apify credit |
| X / Twitter | free public syndication endpoint | none (no token) |

## Setup — Apify token (TikTok + Instagram only)

`resolve.py` reads the token from, in order:
1. `$APIFY_API_TOKEN`
2. `~/.config/social-fetch/.env` (a `KEY=VALUE` file, gitignored, machine-local)

X/Twitter needs no token. If the token is missing for a TikTok/IG URL the
script stops with a precise message. Never inline the token into any repo file
— the machine-local `.env` is the only place it lives.

## Run it

```bash
python3 /Users/jungsek/jung-os-2/.agents/skills/social-fetch/scripts/resolve.py \
  "<social-post-url>" "<out-dir>"
```

`resolve.py`:
1. resolves short/share URLs (`vt.tiktok.com`, `t.co`, IG share links) to canonical
2. detects the platform
3. scrapes post metadata + real media CDN URLs
4. downloads each media file into `<out-dir>/media/`
5. writes `<out-dir>/manifest.json` (also printed to stdout)

Exit code is `0` when at least one media file downloaded, `1` otherwise (a
deleted/private post, `not_found`, or a rate limit surfaces as an entry in the
manifest's `errors` array — read it, don't retry blindly).

## manifest.json — the contract

```json
{
  "url": "…", "canonical_url": "…",
  "platform": "tiktok|instagram|x",
  "source": "apify:clockworks/tiktok-scraper | twitter-syndication",
  "is_multi": true,
  "post": { "author", "author_name", "caption", "hashtags": [], "likes", "timestamp", "type" },
  "media": [
    { "index": 0, "kind": "video", "path": "media/0.mp4", "abs_path": "…", "bytes": 2618603, "source_url": "…" }
  ],
  "errors": []
}
```

`kind` is confirmed from the downloaded file's real extension, not just the
scrape hint — trust it.

## How the caller uses the manifest

For each item in `manifest.media`:

- **`kind == "video"`** → run `/watch` on the **local file** (`abs_path`), e.g.
  `python3 /Users/jungsek/jung-os-2/.agents/skills/watch/scripts/watch.py "<abs_path>" --detail balanced`.
  `/watch` accepts local paths and will extract frames + transcript (Whisper on
  the audio, since social clips rarely ship captions). yt-dlp is never involved.
- **`kind == "image"`** → `Read` the JPEG/PNG path directly to view it. A photo
  post has no transcript; the `post.caption` is the text context.

A single post can mix kinds (an X post with a video and a photo; a TikTok
slideshow rendered with music). Route each item by its own `kind`.

## Blockers

Stop with a precise blocker (not a workaround) when:
- the URL host is not TikTok/Instagram/X (this skill does not handle it),
- the Apify token is missing for a TikTok/IG URL,
- `manifest.errors` is non-empty and `media` is empty (post gone/private, or
  Apify FREE-plan credit exhausted).

## Output

Report: platform, post author/caption, the media items downloaded (kind +
path), and any `errors`. Then hand each media item to its route above.
