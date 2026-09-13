# 🦞 ViBo MCP Server

**Memory for AI agents** — persistent memory (L1/L2/L3 encryption),
web-search savings and thread memory. Works with **any MCP client**:
Claude Desktop, Cursor, OpenClaw, Windsurf, Codex, and more.

## Install

```bash
npm install -g @vibo-dev/vibo-mcp
```

## Configuration

Add to your MCP client config (Claude Desktop example):

```json
{
  "mcpServers": {
    "vibo": {
      "command": "npx",
      "args": ["-y", "@vibo-dev/vibo-mcp"],
      "env": {
        "VIBO_API_KEY": "YOUR_VIBO_KEY"
      }
    }
  }
}
```

Get a key: **https://wwwvibo.com** — free 2-day trial, then $5/month.

## Tools

| Tool | Description |
|---|---|
| `memory_search` | Find relevant facts (returns token savings) |
| `memory_add` | Save a fact (dedup by exact match) |
| `memory_usage` | Your real savings statistics |
| `thread_memory` | Thread: add / compress / ask / context |

## Example

Agent: "What does client Anna prefer?"
→ `memory_search("Anna preferences")`
→ `• [L1] client-anna: Anna likes coffee without sugar, order #42`
→ `💾 Saved 13,452 tokens (97.5%)`

## Honest numbers

- Memory: 97.5% fewer tokens on 118 facts (grows with memory, 50-150× on 10K+).
- Web search: 99.6% (measured 47,443 → 186 tokens).
- Threads: -72%.
- Secrets (L3) never reach the LLM — encrypted by design.

## Links

- Site: https://wwwvibo.com
- Bot: @ViBomemorybot
- Docs: https://github.com/vnbochkarev-netizen/ViBo-memory

---

## Related projects

* [**CloudArc**](https://github.com/vnbochkarev-netizen/cloudarc) — pack a 10 GiB folder into one
  `.vibo` archive at a flat ~26 MiB peak RSS, and read its index over HTTP without fetching the
  payload (Apache-2.0). [Docs site](https://vnbochkarev-netizen.github.io/cloudarc/)
* [**memory-shield**](https://github.com/vnbochkarev-netizen/memory-shield) — poisoning defense for
  agent memory (MIT).
* [**ViBo-memory**](https://github.com/vnbochkarev-netizen/ViBo-memory) — persistent agent memory
  with L1/L2/L3 encryption.
