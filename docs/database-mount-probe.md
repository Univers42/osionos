# Database Mount Probe Diagnostics

## Overview

Diagnostic helpers for `GET /api/databases/<id>/probe` telemetry. Explains probe results, clarifies why external databases can load rows even when `available: false`, and verifies UI presentation mapping.

## Types

### `MountProbePayload`

Payload received from the probe endpoint.

| Field | Type | Description |
|---|---|---|
| `dbId` | `string \| undefined` | Database identifier |
| `available` | `boolean` | Whether the probe considers the connection available |
| `engine` | `string \| undefined` | Database engine name (e.g. `postgres`, `mysql`) |
| `server_version` | `string \| undefined` | Server version string |
| `tls` | `'verified' \| 'encrypted' \| 'plaintext' \| 'not_applicable' \| string` | TLS status |
| `tls_version` | `string \| undefined` | TLS version if available |
| `retryAfter` | `number \| undefined` | Retry-after seconds (if rate-limited) |

### `TlsTone`

TLS visual severity level.

| Value | Meaning |
|---|---|
| `'secure'` | Verified certificate |
| `'warning'` | Encrypted but untrusted |
| `'plain'` | No TLS |
| `'neutral'` | Not applicable (local file) |

### `DatabaseProbeDiagnostic`

Return type of `diagnoseMountProbe`.

| Field | Type | Description |
|---|---|---|
| `available` | `boolean` | Connection availability |
| `reason` | `string` | Human-readable explanation |
| `engine` | `string \| undefined` | Database engine |
| `serverVersion` | `string \| null` | Sanitized server version |
| `tlsTone` | `TlsTone \| null` | TLS severity icon tone |
| `tlsDescription` | `string \| null` | TLS human-readable description |

## `diagnoseMountProbe(probe)`

```typescript
diagnoseMountProbe(probe: MountProbePayload | null): DatabaseProbeDiagnostic
```

### Behavior

| Input | Output |
|---|---|
| `probe === null` | `{ available: false, reason: 'Probe not yet received or disabled' }` |
| `probe.available === false` | `{ available: false, reason: 'Telemetry endpoint returned 404/429; rows continue loading over data plane' }` |
| `probe.available === true` | Returns `{ available: true, reason: 'Live connection telemetry active', engine, serverVersion, tlsTone, tlsDescription }` |

### `server_version` sanitization

- `platform` → `'Managed (version hidden)'`
- Matches `/^\d+(\.\d+){0,3}$/` → returned as-is
- Otherwise → `null`

### TLS resolution

| `tls` value | `tlsTone` | `tlsDescription` |
|---|---|---|
| `'verified'` | `'secure'` | `TLS ${tls_version}, certificate verified` |
| `'encrypted'` | `'warning'` | `TLS ${tls_version}, certificate not verified` |
| `'plaintext'` | `'plain'` | `'No TLS'` |
| `'not_applicable'` | `'neutral'` | `'Not applicable (local file)'` |
| other / missing | `'neutral'` | `null` |

## Test Suite

Run via Docker:

```bash
bash scripts/docker-run.sh test-canvas tests/canvas/database-mount-probe-diagnostics.test.ts
```

## Done-When Criteria

1. Unit tests pass via Docker quality gate.
2. `npm run quality` (or equivalent) lints and typechecks without errors.