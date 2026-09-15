/**
 * @osionos/http-gate — JSON-over-HTTP with request hygiene, plus an SSE reader.
 *
 * This root entry is deliberately framework-free: no React, no JSX. Hosts that
 * load TypeScript by type-stripping alone (`node --experimental-strip-types`)
 * must be able to import it. The React binding lives behind `./react`.
 */

export { ApiError, type ApiErrorBody } from './errors.ts';
export {
  createInflightDedupe,
  createRequestGate,
  type InflightDedupe,
  type RequestGate,
} from './gate.ts';
export {
  createHttpClient,
  type FetchLike,
  type HttpClient,
  type HttpClientOptions,
} from './client.ts';
export {
  openSseStream,
  parseSseBlock,
  pumpSseStream,
  type StreamEventHandler,
  type StreamPayload,
} from './sse.ts';
