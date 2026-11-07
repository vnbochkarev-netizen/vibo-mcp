# ViBo MCP Server

**Local-first memory for AI agents.** Facts live on your machine in one JSON file,
each one chained to the previous by hash, so you can prove later where a fact came
from and that nobody edited it. Works with any MCP client: Claude Desktop, Claude Code,
Cursor, Codex, VS Code, Windsurf.

No account, no key, no network call required.

## Install

```bash
npm install -g @vibo-dev/vibo-mcp
```

Client config (Claude Desktop example):

```json
{
  "mcpServers": {
    "vibo": {
      "command": "npx",
      "args": ["-y", "@vibo-dev/vibo-mcp"]
    }
  }
}
```

Memory is stored in `~/.vibo/mcp/memory.json`. Override with `VIBO_MEM_FILE`
(file path) or `VIBO_HOME` (directory).

## Tools

| Tool | What it does |
|---|---|
| `memory_add` | Save a fact. Deduplicated by label + content. Levels L1 / L2 / L3 (secret). |
| `memory_search` | Find facts by words, ranks by relevance. L3 hidden unless `include_secrets`. |
| `memory_verify` | Check claims: CONFIRMED / CONTRADICTS / PARTIAL / NOT FOUND. Catches wrong numbers. |
| `memory_provenance` | Verify the hash chain and list facts with origin and timestamps. |
| `memory_forget` | Delete by label or id. Refuses without `confirm=true`. |
| `memory_usage` | Facts, tokens stored, average tokens returned per search. |
| `thread_memory` | Conversation memory: add, context, ask, compress older messages. |
| `web_search` | Not in this build — returns an honest "unavailable" instead of failing silently. |

## Example

```
memory_add(label="client-anna-prefs", content="Anna orders coffee without sugar, budget 24000 RUB per month")
memory_search(query="what does Anna prefer")
  -> [L1] client-anna-prefs: Anna orders coffee without sugar, budget 24000 RUB per month (0.86)

memory_verify(claims=["Anna budget is 24000 RUB per month", "Anna budget is 99000 RUB per month"])
  -> CONFIRMED "Anna budget is 24000 RUB per month" — memory: client-anna-prefs (L1)
  -> CONTRADICTS "Anna budget is 99000 RUB per month" — memory: client-anna-prefs (L1)
```

## Design

- **Local only by default.** The server never phones home. If you set `VIBO_API_KEY`
  and `VIBO_BASE_URL`, facts are mirrored best-effort; failure never breaks a tool call.
- **Provenance built in.** Every fact carries `hash` and `prev`; `memory_provenance`
  recomputes the chain and reports the first break.
- **Secrets stay put.** L3 facts are excluded from search results unless explicitly requested.
- **Deterministic recall.** Lexical ranking with light stemming, no embeddings, no
  background "consolidation" that silently rewrites your memory.

## Tests

```bash
npm run build
python3 tests/smoke.py    # 20 checks over the real stdio protocol
```

## Links

- Site: https://wwwvibo.com
- Bot: @ViBomemorybot
- Memory engine with L1/L2/L3 encryption: https://github.com/vnbochkarev-netizen/ViBo-memory
- Poisoning defense: [memory-shield](https://github.com/vnbochkarev-netizen/memory-shield)
- Archive format: [CloudArc](https://github.com/vnbochkarev-netizen/cloudarc)

## Integrations

- **cc-connect** (bridge agent CLIs to messengers): [docs/cc-connect.md](docs/cc-connect.md)
