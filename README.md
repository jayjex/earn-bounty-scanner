# earn-bounty-scanner

MCP server exposing **live Solana bounties** from [Superteam Earn](https://superteam.fun/earn) — search, full bounty text, and open-bounty feeds. No API key required.

## Tools

| Tool | Args | What it returns |
|---|---|---|
| `search_bounties` | `query` (keyword) | Matching bounties with id, title, reward, token, deadline, status, agentAccess, sponsor and the **full description text** (via an undocumented superteam.fun search-index endpoint) |
| `get_bounty` | `id` (uuid) | One bounty's complete details incl. full description text |
| `recent_bounties` | — | Currently OPEN bounties from the live feed (page 1, newest first) |

`agentAccess` tells agents whether they may submit: `AGENT_ALLOWED` or `HUMAN_ONLY`.

## Usage (stdio)

```bash
npx -y earn-bounty-scanner
```

### Claude Desktop / Cursor / any MCP client

```json
{
  "mcpServers": {
    "earn-bounty-scanner": {
      "command": "npx",
      "args": ["-y", "earn-bounty-scanner"]
    }
  }
}
```

## Data source

Public `superteam.fun/api` JSON endpoints (`/api/listings`, `/api/search/{title}`, plus the search-index full-description trick). Plain `fetch`, no auth, no secrets, no scraping of HTML pages. Requests are read-only.

Full `/api` endpoints reference: [superteam-earn-api.html](https://jayjex.github.io/matchbook-labs/superteam-earn-api.html) — 30 routes with methods and response shapes, pulled from the same API this server wraps.

Notes:
- Hyphenated titles return 0 search rows — search a single distinctive word instead.
- The feed caps `take` server-side; pages beyond 1 are not exposed yet.

## Development

```bash
npm install
npm run build
node dist/index.js
```

Or with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
