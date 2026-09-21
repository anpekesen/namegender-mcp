# NameGender MCP server

[![namegender-mcp MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/anpekesen/namegender-mcp/badges/score.svg)](https://glama.ai/mcp/servers/anpekesen/namegender-mcp)

Turns names, email addresses and usernames into a gender — **with the
evidence next to every answer**: the probability, the sample size, the
source and the name it matched.

Works in any client that speaks the Model Context Protocol: Claude Desktop,
Claude Code, Cursor and others.

[![namegender-mcp MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/anpekesen/namegender-mcp/badges/card.svg)](https://glama.ai/mcp/servers/anpekesen/namegender-mcp)

## Setup

Get an API key from the [namegender.com](https://namegender.com) dashboard.
Sign-up needs no card and comes with free credits every day.

Claude Desktop / Claude Code configuration:

```json
{
  "mcpServers": {
    "namegender": {
      "command": "npx",
      "args": ["-y", "namegender-mcp"],
      "env": { "NAMEGENDER_API_KEY": "ng_live_..." }
    }
  }
}
```

Claude Code from the command line:

```sh
claude mcp add namegender -e NAMEGENDER_API_KEY=ng_live_... -- npx -y namegender-mcp
```

## Tools

| Tool | What it does |
|---|---|
| `gender_from_name` | Gender from a first or full name |
| `gender_from_email` | Extracts a name from the local part of an email address |
| `gender_from_username` | Extracts a name from a username or handle |
| `gender_bulk` | Up to 100 values in one request, with a match-rate summary |
| `name_countries` | Countries a name is recorded in — not a claim about origin |
| `account_status` | Remaining credits, daily free quota, data version |

The gender tools take an optional two-letter `country` code. The same name
can have a different gender from one country to the next; with a code, the
answer is weighted by that country's data.

## What an answer looks like

```
Ayşe: female · probability 99% · sample 12,345 · source ssa · country TR
```

An answer from a source without counts **says so**:

```
Kamon: male · probability 95% · no sample (unverified) · source wgnd
```

The distinction is deliberate. A 95% backed by counted people and a 95%
backed by nothing are not the same thing and should not look the same.

## Countries are not origin

`name_countries` keeps two lists apart. Counted birth registrations are
published for only seven countries (US, UK, France, Canada, Spain, Ireland,
Norway), so the ranked shares compare those seven only. Every other country
where the name is recorded appears in a separate, unranked list. Reading the
ranking as "where the name comes from" is wrong: Mehmet ranks first in
France there, and Turkey is not in the ranking at all.

## Errors

Errors do not break the session. The tool returns `isError` and says what to
do — where to top up when credits run out, which variable to check when the
key is invalid — and includes the request ID so support can trace it.

## Environment variables

| Variable | Default |
|---|---|
| `NAMEGENDER_API_KEY` | *(required)* |
| `NAMEGENDER_BASE_URL` | `https://namegender.com/api/v1` |

## Development

```sh
npm install
npm test
```

MIT licensed.

## Releasing

```sh
npm version patch   # also updates server.json
git push --follow-tags
```

The `v*` tag runs `.github/workflows/release.yml`: tests, then npm (trusted
publishing, no token), then the MCP registry (GitHub OIDC). Re-running the
workflow skips whatever is already published.
