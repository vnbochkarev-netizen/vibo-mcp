# Using ViBo memory with cc-connect

[cc-connect](https://github.com/chenhg5/cc-connect) bridges local agent CLIs
(Claude Code, Codex, Gemini CLI, Cursor, OpenCode, tmux, ...) to chat platforms.
The bridge solves *reaching* the agent from anywhere. ViBo covers the other half:
the agent keeps its memory between sessions without carrying a growing context window.

## Setup (any MCP-capable agent you run under cc-connect)

Add the ViBo MCP server to that agent's MCP config:

```json
{
  "mcpServers": {
    "vibo": {
      "command": "npx",
      "args": ["-y", "@vibo-dev/vibo-mcp@0.2.6"],
      "env": { "VIBO_API_KEY": "YOUR_VIBO_KEY" }
    }
  }
}
```

Claude Code one-liner:

```bash
claude mcp add vibo -- npx -y @vibo-dev/vibo-mcp@0.2.6
```

Then set `VIBO_API_KEY` in the environment (or in the agent's MCP config as shown above).

## Tools the agent gets

| Tool | What it does |
| --- | --- |
| `memory_search` | retrieve only the facts relevant to the current question |
| `memory_add` | store a durable fact (deduplicated) |
| `memory_verify` | check claims against stored facts: CONFIRMED / CONTRADICTS / NOT FOUND |
| `web_search` | fetch a page and compress it through ViBo |
| `memory_stats` | memory size and savings counters |

## Why it pairs well with a chat bridge

A session bridged to a messenger grows context quickly: long threads, pasted logs,
sessions resumed days later. `memory_search` returns facts instead of history, so the
session stays small and answers stay grounded in what the user already told the agent.

Measured on our own agents: 96-99% token reduction on fetched pages, 50-150x on
repeated context.

## Verify it works

Ask the bridged agent to run, in order: `memory_add` with any label/content, then
`memory_search` for that label, then `memory_stats`.
