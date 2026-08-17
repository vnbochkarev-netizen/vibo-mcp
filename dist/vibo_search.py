#!/usr/bin/env python3
"""ViBo Web Search — compress web pages via ViBo before they reach the agent.

Any agent calls this script instead of reading a URL directly:
    python3 vibo_search.py <URL> "<topic>"

→ downloads the page
→ compresses via ViBo (96-99%)
→ writes web_compress to vibo_usage.jsonl
→ prints ONLY the compressed text (into the agent's context)

This is the correct way: web search ALWAYS through ViBo.
"""

import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from vibo_web import compress_article


def fetch(url: str, max_bytes: int = 512_000) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ViBo-Web/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read(max_bytes + 1).decode(errors="ignore")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 vibo_search.py <URL> \"<topic>\"")
        print("Example: python3 vibo_search.py https://example.com/article \"market trends\"")
        return 1

    url = sys.argv[1]
    query = sys.argv[2] if len(sys.argv) > 2 else url

    try:
        print(f"[ViBo] Downloading: {url}", file=sys.stderr)
        text = fetch(url)

        comp, stats = compress_article(text, query)
        print(f"[ViBo] 💾 {stats['orig_tokens']:,} → {stats['comp_tokens']:,} tokens "
              f"({stats['saved_pct']:.1f}% saved)", file=sys.stderr)

        # stdout — ONLY the compressed text (the agent reads it)
        print(comp)
        return 0
    except Exception as e:
        print(f"[ViBo] Error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
