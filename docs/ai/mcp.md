# Remote MCP endpoint

`POST /api/ai/mcp` lets an outside agent search and read osionos pages, and
propose changes to them, with a personal access token (PAT). It is off unless the service runs with
`OSIONOS_AI_PAT=on`; the public stack keeps it off.

## What it does

- Tools: the read tools of the assistant, from one registry (`search_workspace`,
  `read_page`, `graph_neighbors`), with the `read` scope. With the
  `write_approval` scope, also `create_page`, `rename_page`, `archive_page` and
  `add_blocks`. A write never runs from the agent: it files an approval that
  you accept or refuse in osionos, and only then does it reach the page.
  Content is only ever added (`add_blocks`, through the bridge's atomic
  append); existing text is never rewritten. There is no `build_plan`.
- Rights: the token owner's own, inside the workspaces the token names, checked
  against live membership on every call. A removed member loses access on the
  next call; a revoked or expired token gets 401 on the next call (no cache).
- Transport: stateless Streamable HTTP, JSON responses, `POST` only (`GET` and
  `DELETE` answer 405). Bearer header only; a token in the URL is refused.
- Limits: 60 calls a minute per token and 120 per user. A POST carries one
  JSON-RPC message: a batch (an array) is refused with 400, so a call is one
  unit of the limit. Every tool call runs in a small in-process lane (4
  running, 16 waiting).
- Host and Origin: `OSIONOS_AI_MCP_ALLOWED_HOSTS` (default `localhost,127.0.0.1`,
  extended with your values). Any request with an `Origin` header is refused 403
  and no CORS header is ever sent. Agents are not browsers and send no Origin.
  `OSIONOS_AI_MCP_ALLOWED_ORIGINS` is empty by default.

## Configure an agent

Create a token in Settings, scope `read` (add `write_approval` to let the agent
propose changes), then export it. Never paste the token
into a config file.

```sh
export OSIONOS_PAT="<the token you just copied>"
```

opencode (`opencode.json`):

```json
{
  "mcp": {
    "osionos": {
      "type": "remote",
      "url": "https://<your-ai-host>/api/ai/mcp",
      "headers": { "Authorization": "Bearer {env:OSIONOS_PAT}" }
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`, through the `mcp-remote` bridge,
which reads the variable at start):

```json
{
  "mcpServers": {
    "osionos": {
      "command": "npx",
      "args": ["mcp-remote", "https://<your-ai-host>/api/ai/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer ${OSIONOS_PAT}" }
    }
  }
}
```

Caveat: client config syntax for env expansion differs between versions; check
your client's docs. The rule that does not change: the token lives in an
environment variable, never in the file.

## Read this before you connect an agent

The agent reads text that other members of your workspaces wrote. That text can
contain instructions aimed at the agent. osionos fences every page as quoted
data and marks who wrote it (`authoredBy`, `otherAuthor`), and the server tells
the agent to treat results as untrusted. osionos cannot control the agent's
other tools: an agent that can also send mail or run commands can be misled by a
page. Give it only the tools you accept that risk for.

## Not built

- A rewrite of existing text (C227): an agent can add blocks, never change them.
- Two-way file sync: pages are not mirrored to files on disk.
- A PAT reads only workspaces with a live members row; the private workspace of
  an app session is not reachable.
- `authoredBy` is the page owner, not the last editor. `graph_neighbors` results
  carry escaped titles but no `authoredBy`.
