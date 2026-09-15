# @osionos/http-gate

A JSON-over-HTTP client with request hygiene built in, plus a Server-Sent Events
reader. Zero runtime dependencies.

## Why this is a package

Two mechanisms in here are worth having exactly once:

- **Bounded concurrency.** A view that needs fifty resources fires fifty
  requests, and a rate-limited server answers with `429`/`502`. The gate caps
  simultaneous requests and hands a released slot straight to the next waiter,
  so the queue drains in FIFO order and never stalls.
- **In-flight de-duplication.** Three components asking for the same resource in
  the same tick share one network call and one result. This is *not* a response
  cache — the entry is dropped as soon as the promise settles, including on
  rejection, so a failure is never replayed.

## The boundary contract

The client resolves **nothing** from ambient state — no environment variables,
no globals, no framework. The host passes a `baseUrl` and, per call, an optional
bearer token. Token policy (which session, which audience, how it refreshes) is
host policy and stays there.

The root entry is framework-free so hosts that load TypeScript by type-stripping
alone (`node --experimental-strip-types`) can import it. React lives behind
`./react` as an optional peer.

## Usage

```ts
import { createHttpClient, ApiError } from '@osionos/http-gate';

const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  maxConcurrent: 6,
  missingBaseUrlMessage: 'API_URL is not configured.',
});

try {
  const page = await api.get<Page>('/v1/pages/p1', token);
} catch (error) {
  if (error instanceof ApiError && error.status === 403) { /* … */ }
}
```

Reading a stream:

```ts
import { openSseStream, pumpSseStream } from '@osionos/http-gate';

const response = await openSseStream(['https://api.example.com'], '/v1/chat', { prompt });
await pumpSseStream(response, (event, data) => {
  if (event === 'token') append(data.text ?? '');
});
```

In React:

```tsx
import { useSseStream } from '@osionos/http-gate/react';

const { send, streaming } = useSseStream({ endpoint: '/v1/chat', origins });
```

## API

| Entry | Exports |
|---|---|
| `.` | `createHttpClient`, `createRequestGate`, `createInflightDedupe`, `ApiError`, `parseSseBlock`, `openSseStream`, `pumpSseStream` |
| `./react` | `useSseStream` |

`createRequestGate` and `createInflightDedupe` are generic over any awaitable
task, so they are useful on their own — neither one knows what HTTP is.

## Layout

```
src/errors.ts   ApiError and the server error envelope
src/gate.ts     concurrency gate + in-flight de-duplication (no HTTP)
src/client.ts   the verb helpers, composed over the two primitives
src/sse.ts      parse / open / pump, framework-free
src/react.ts    the React binding (optional peer)
```

## Development

```sh
make check      # typecheck + tests
```
