# NameGender MCP server

[![Glama quality score](https://glama.ai/mcp/servers/anpekesen/namegender-mcp/badges/score.svg)](https://glama.ai/mcp/servers/anpekesen/namegender-mcp)

Turns names, email addresses and usernames into a gender — **with the
evidence next to every answer**: the probability, the sample size, the
source and the name it matched. It also writes letter salutations in ten
languages, flags junk names in form entries, and tells you how old the
people with a first name are.

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
| `salutation` | Opening line of a letter in the letter's language, with a neutral form when the gender is not certain |
| `name_check` | Whether a name typed into a form looks real, with the reasons; never calls a name fake |
| `age_from_name` | Median age and age ranges of the living people with a first name (US, France, Norway) |
| `account_status` | Remaining credits, daily free quota, data version |

`salutation`, `name_check` and `age_from_name` take one `name` or up to 100
`names` in a single call.

The tools take an optional `country`: a code of two or three letters (`IT`
or `ITA`) or the country name (`Italy`, `Italia`). The same name can have a different gender from one country to the
next; with a code, the answer is weighted by that country's data.

When the country is not known, as in a sign-up form, pass what you have
instead: `locale` (a language tag such as `it-IT`, from the browser) or `ip`
(the person's IP address, not stored). The API uses `country` first, then the
locale's region, then the IP; a tag without a region (`en`) sets no country.
The answer says when the country was inferred:

```
Andrea: male · probability 95% · country IT (from locale)
```

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

## Salutations, name checks and ages

```
Anna Müller: Sehr geehrte Frau Müller, · informal "Liebe Anna," · female 100% · language de
Kim Lee: Dear Kim Lee, · informal "Hi Kim," · neutral form (gender_unknown) · language en
asdf qwerty: implausible · score 0/100 · signals: placeholder (high), keyboard_pattern (high)
Jennifer Null: plausible · score 100/100 · no signals against it
Brittany: median age 36 · half between 32 and 38 · 80% between 28 and 41 · born around 1990 · 353,775 living people · country US (default, no country given)
```

A salutation is never guessed: below the probability threshold (90 by
default) the neutral form is used and the reason is given. A name check
never calls a name fake; use it to flag a record, not to reject a person.
An age describes the group of people with the name, not one person, so the
range always comes with the median. Age covers the United States, France
and Norway; another country returns no age and costs no credit.

## Countries are not origin

`name_countries` keeps two lists apart. Counted birth registrations are
published by only a small set of countries (the US, UK, France, Spain and a
few others), so the ranked shares compare those countries only. Every other country
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
| `NAMEGENDER_BASE_URL` | `https://namegender.com/api/v1` (also when set but empty) |

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
