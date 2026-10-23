# Local engine — what browsers allow, what each engine answers, and a design (P7b)

Research note for osionos "This device" AI connections. Browser facts move fast:
re-check before building (see Caveat).

## 1. What it is / what it is not

A "This device" connection is the browser calling the user's own engine directly
(Ollama, llama.cpp, LM Studio or `opencode serve`) for inference, with only the
workspace retrieval coming from our server. No server-side relay, no stored
subscription tokens: the engine runs on the user's machine and the page talks to
`http://localhost`. Claude Pro/Max is **not** offered through this path —
Anthropic explicitly prohibits it.

## 2. The facts

| # | Question | Answer | Source (fetched?) | Quote / output | Date / version |
|---|----------|--------|-------------------|----------------|----------------|
| 1 | Chrome LNA: since which version does a public https page fetching `http://localhost` get a permission prompt or block? What fetch option? Is `http://localhost` mixed content or "potentially trustworthy"? | Permission prompt (`loopback-network`) ships in Chrome 142 (Oct 2025); opt-in from Chrome 138 via `chrome://flags/#local-network-access-check`. Fetch must set `targetAddressSpace: 'loopback'` (or `'local'`). Loopback addresses (127.0.0.0/8, ::1, localhost) are "potentially trustworthy" per the Secure Contexts spec, so they are not mixed content in Chrome. | https://developer.chrome.com/blog/local-network-access (yes); https://www.w3.org/TR/secure-contexts/ (yes) | "The Local Network Access permission prompt is launching in Chrome 142." / "If origin's host matches one of the CIDR notations `127.0.0.0/8` or `::1/128` … return `Potentially Trustworthy`." | Chrome 142 (2025-10); spec CRD 2023-11-10 |
| 2 | Firefox: same two questions | Firefox ships LNA in 151 (gradual rollout; ETP-strict users from 147/150), permission names `local-network`/`loopback-network` from 150/153. Mixed content on loopback is allowed (127.0.0.1 since Firefox 55, `localhost` since 84). `targetAddressSpace` is supported on `Request`/`fetch`. | https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access (yes); https://help.duo.com/s/article/9470 (no) | "In browsers that support the local network access specification, loopback and local requests are gated behind specific permissions — `local-network` and `loopback-network`" / "Firefox version 151 or later" | Firefox 151 (2026-04); MDN 2026-08-12 |
| 3 | Safari / WebKit: same | No LNA support (WebKit: no signal as of chromestatus). Mixed content from `localhost`/loopback is historically blocked in WebKit; bug 171934 remains open, so an https page cannot reliably fetch `http://localhost`. | https://bugs.webkit.org/show_bug.cgi?id=171934 (no) | "content from loopback addresses should no longer be treated as mixed content … Safari does not allow any mixed content" (Stack Overflow summary of WebKit stance) | open bug; no ship date |
| 4 | Ollama: allow a web origin (`OLLAMA_ORIGINS`), default allowed origins, does `/v1/chat/completions` stream SSE? | `OLLAMA_ORIGINS` comma-separated allow-list, added to a built-in list. Defaults: `localhost`, `127.0.0.1`, `0.0.0.0` (http+https, any port) plus `app://*`, `file://*`, `tauri://*`, `vscode-webview://*`, `vscode-file://*`. `/v1/chat/completions` streams SSE (`text/event-stream`, `data: …`, `data: [DONE]`). | https://docs.ollama.com/faq (yes); https://github.com/ollama/ollama/blob/main/envconfig/config.go (no, via search); https://github.com/ollama/ollama/blob/main/middleware/openai.go (no, via search) | "Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` by default. Additional origins can be configured with `OLLAMA_ORIGINS`." / `w.ResponseWriter.Header().Set("Content-Type", "text/event-stream")` | Ollama 0.40.3 (2026-10) |
| 5 | llama.cpp `llama-server`: CORS behaviour (default `Access-Control-Allow-Origin`), flags, `--api-key` | By default reflects any `Origin` back with credentials allowed (`--cors-origins` defaults to `*`). `--cors-origins`, `--cors-methods`, `--cors-headers`, `--cors-credentials`. `--api-key` / `--api-key-file` for auth. | https://github.com/ggml-org/llama.cpp/blob/HEAD/tools/server/README.md (yes) | "`--cors-origins ORIGINS` … (default: *) if set to special value 'localhost', reflect the Origin header only if it is localhost" / "`--api-key KEY` … (default: none)" | server-b11580 (image pinned below) |
| 6 | LM Studio local server: CORS setting and default | CORS is **off by default**; enable with `--cors` flag or the "Enable CORS" switch in Server Settings. When on, allows any origin. | https://lmstudio.ai/docs/developer/core/server/settings (yes); https://lmstudio.ai/docs/cli/serve/server-start (no, via search) | "Enable CORS : Switch — Enable Cross-Origin Resource Sharing (CORS) to allow applications from different origins to access the API." / "`--cors` … Enable CORS support … When not set, CORS is disabled" | LM Studio current (2026) |
| 7 | `opencode serve`: `--cors` flag, auth, browser cross-origin with auth | `--cors <origin>` (repeatable, default `[]`) allow-lists additional browser origins; localhost/127.0.0.1/tauri/opencode.ai built in. Auth via `OPENCODE_SERVER_PASSWORD` (HTTP basic, user default `opencode` / `OPENCODE_SERVER_USERNAME`). Preflight `OPTIONS` is handled without auth, so a browser can call cross-origin when the origin is allow-listed. | https://opencode.ai/docs/server/ (yes) | "`--cors` \| Additional browser origins to allow \| `[]`" / "Set `OPENCODE_SERVER_PASSWORD` to protect the server with HTTP basic auth." | OpenCode docs (2026-10-22) |
| 8 | List a local engine's models from the browser (`GET /v1/models`)? | Yes for Ollama, llama.cpp and LM Studio — all expose `/v1/models` (OpenAI-compatible). `opencode serve` does **not** expose `/v1/models` today (feature request #31724); models are listed via `/config/providers` and `/provider`. | https://docs.ollama.com/api/openai-compatibility (no, via search); https://github.com/ggml-org/llama.cpp/blob/HEAD/tools/server/README.md (yes); https://lmstudio.ai/docs/developer/openai-compat/models (no, via search); https://github.com/anomalyco/opencode/issues/31724 (no, via search) | "`GET /v1/models` … Lists registered models in OpenAI format" (llama.cpp README/OpenAPI); opencode issue #31724 proposes `GET /v1/models` | n/a |

## 3. The proof

Pinned image: `ghcr.io/ggml-org/llama.cpp@sha256:ba384e66b3f3b6474dc0285ed44466b6f025c7106865d915f1fe5ae2a2da7411`
(server-b11580). Volume `osionos_ai_models_llm` mounted read-only.

```sh
$ docker volume ls | grep -E "osionos_ai_(a1_data|models_llm)"
local  osionos_ai_a1_data
local  osionos_ai_models_llm

$ docker run --rm -v osionos_ai_models_llm:/m:ro alpine:3.20 \
    find /m -name '*.gguf' -size -3G | head
/m/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/snapshots/.../Qwen3-4B-Instruct-2507-Q4_K_M.gguf

$ docker run --rm -d --name p7b-llama -p 127.0.0.1:18123:8080 \
    --memory 3g --cpus 2 -v osionos_ai_models_llm:/m:ro \
    ghcr.io/ggml-org/llama.cpp@sha256:ba384e66... \
    -m /m/.../Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
    --host 0.0.0.0 --port 8080 -c 512 -np 1 -t 2
fcd12d0a1c8682c02cc76a176f525a301aac6ff71ae252f9bc88f8beab61eaae

# waited for health
$ curl -s 127.0.0.1:18123/health
{"status":"ok"}
```

Preflight (1):

```text
$ curl -s -D - -o /dev/null -X OPTIONS \
  -H 'Origin: https://osionos.example' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization' \
  http://127.0.0.1:18123/v1/chat/completions

HTTP/1.1 200 OK
Server: llama.cpp
Access-Control-Allow-Origin: https://osionos.example
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: *
Content-Type: text/html
Keep-Alive: timeout=5, max=100
Content-Length: 0
```

`GET /v1/models` with Origin (2):

```text
$ curl -s -D - -o /dev/null -H 'Origin: https://osionos.example' \
  http://127.0.0.1:18123/v1/models

HTTP/1.1 200 OK
Server: llama.cpp
Access-Control-Allow-Origin: https://osionos.example
Content-Type: application/json; charset=utf-8
Content-Length: 1160
Keep-Alive: timeout=5, max=100
```

Teardown:

```sh
$ docker rm -f p7b-llama
p7b-llama
$ docker ps -a --filter name=p7b
# (empty — 0 containers)
```

Observation: with default flags (no `--api-key`, `--cors-origins *`), llama-server reflects the requesting Origin and allows credentials, so a public https page's preflight succeeds. Note that `--tools`/`--agent` flip the default CORS origin to `localhost` (README).

## 4. The design

Grounded in the current code.

- **Second `InferencePort` for "device".** `src/features/ai/model/aiInferencePort.ts:80`
  (`aiInferencePort`) is the service adapter; `selectInferencePort()` at
  `src/features/ai/model/aiInferencePort.ts:153` picks it when `isAiConfigured()`
  (`src/features/ai/api/aiClient.ts:98`). A device port would mirror that shape but
  call the engine's `/v1/chat/completions` directly with `targetAddressSpace:
  'loopback'`, and be selected when the connection kind is `device`. The kind union
  lives at `services/osionos-ai/src/connections/service.ts:27` (`'platform' |
  'api_key' | 'oauth' | 'endpoint'`) — add `'device'`. Note the existing form
  explicitly rejects localhost endpoints (`src/features/ai/model/aiConnectionForm.ts:50`
  `isLocalHost`, `:64` `validateEndpointUrl`, `LOCALHOST_MESSAGE`); a device
  connection inverts that: localhost is the whole point, and the check moves to the
  browser.

- **Where sources come from.** Today `retrieve()` runs inside the service run loop
  (`services/osionos-ai/src/retrieval/search.ts:279`), with ACL re-checks via
  `readablePages()` (`:217`) applying `canReadPageRowAsMember` and live workspace
  membership (`:289` `liveMemberWorkspaces`). A device run needs a new route (e.g.
  `POST /sources` or a `retrieve`-only variant of `/runs`) that returns only the
  retrieved chunks, re-running the same ACL path (`readablePages` + `liveMemberWorkspaces`)
  so a stale index can never leak a page. The browser then injects those chunks as
  `context` into the engine call. Run framing/cancellation stays client-side
  (`src/features/ai/model/runStream.ts:77` `streamRun`).

- **What does NOT work in device mode.** Approvals and write tools run in the
  service's run loop; MCP (read tools registry) runs there too; usage/budget
  metering is service-side. In device mode none of these run, so the UI must say so
  plainly on the connection card ("This device: no approvals, no write tools, no
  MCP, no usage metering"). Only retrieval (sources) comes from our server.

- **Security notes.** The engine URL is user input evaluated in the user's own
  browser, so there is no SSRF against our server (unlike `endpoint` connections,
  which the service fetches via `guardedShortFetch`). A hostile page cannot read
  our sources: they are gated by the session bearer on the retrieval route and
  re-checked with `canReadPageRowAsMember` (`search.ts:227`). Chrome's
  `loopback-network` prompt means the first device connection requires a user
  gesture and a permission grant; the UI should pre-check
  `navigator.permissions.query({ name: 'loopback-network' })` and gate on a click.

## 5. Open questions

- Every "unknown" above: Safari has no LNA ship date and blocks loopback mixed
  content in practice (WebKit bug 171934) — measure whether Safari users can use
  device mode at all, or need a native companion.
- Firefox version at which `loopback-network` permission query works in the wild
  (150 vs 153 discrepancy between permission API and caniuse) — measure.
- Whether Ollama's default origins (no `localhost` web origin unless on the
  built-in list) cover a public https osionos origin — they do not; user must set
  `OLLAMA_ORIGINS`. Measure the onboarding friction.
- Whether `opencode serve` will gain `/v1/models` (issue #31724) — track.
- Latency/cost of a retrieval-only route vs. full run; whether streaming the
  engine response through the browser's SSE parser matches `pumpSseStream` usage.
- Whether `targetAddressSpace: 'loopback'` is honoured for `127.0.0.1` and
  `localhost` identically across Chrome versions.

What to measure next: a spike implementing the device port behind a flag, with
the retrieval-only route, and a manual permission-prompt walkthrough on Chrome 142+.

## 6. Caveat

The browser facts above are as of the sources' dates and move fast; re-check
before building.

