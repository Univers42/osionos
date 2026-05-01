# Data Persistence

This project persists data through a small DBMS layer that sits between the UI and the active storage backend. The same app can work with file-backed data sets or with live databases, and the frontend talks to all of them through the same `/api/dbms/*` routes.

## The Big Picture

The persistence flow is:

1. The React app updates its local Zustand state.
2. The store sends a persistence request to the DBMS middleware.
3. The server routes the request to the adapter for the active source.
4. The adapter writes either to seed files or to a live database.

The active source is selected with `ACTIVE_DB_SOURCE` in the environment. The supported values are `json`, `csv`, `mongodb`, and `postgresql`.

## Storage Modes

### JSON and CSV

When the active source is `json` or `csv`, the project stores data directly in files under the corresponding DBMS directories. The server reads the seed state from disk and writes updates back to those files with atomic writes.

The file-backed mode is the simplest persistence path:

- state is loaded from disk on server startup or on request
- writes go back to the same source files
- the frontend receives the updated state through the API

### MongoDB and PostgreSQL

When the active source is `mongodb` or `postgresql`, the project uses a live database container instead of plain files for page records. The seed files still exist, but they act as the canonical source for schema, views, and bootstrap data.

In live mode:

- the server loads the seed state from disk
- page records are fetched from the live database
- seed metadata is merged with the live records
- schema and view updates are still persisted through the DBMS state endpoint

If the container is unavailable, the server falls back to the seed state so the app can still load.

## Frontend Persist Flow

The frontend persistence logic lives in the DBMS store helpers. It debounces writes, then sends them to the server.

- `flushState()` sends the full database state to `PATCH /api/dbms/state`
- in live DB mode, `flushState()` only sends `databases` and `views` because pages are stored in the container
- `sendPersistRequest()` sends page-level changes to `PATCH /api/dbms/pages/:pageId`
- `dispatchOps()` posts fire-and-forget operations to `POST /api/dbms/ops`

The app also guards against stale writes by including the active source in the request body. If the source changed after the edit was scheduled, the server rejects the mutation with a `409` response.

## Server-Side Persistence

The Vite dev server installs DBMS middleware that owns the persistence API.

- `/api/dbms/state` loads and saves the current database state
- `/api/dbms/source` switches the active backend
- `/api/dbms/pages/:id` updates a page record
- `/api/dbms/ops` logs generated database operations

State for file-backed sources is written with atomic file writes so updates do not leave partial JSON behind. For live databases, the server keeps an in-memory cache of the resolved state to avoid reloading the container data on every request.

## Adapter Layer

The DBMS package under `docker/services/dbms/` provides the common adapter interface used by all backends.

Each adapter implements the same contract for:

- `connect()` and `disconnect()`
- `listEntities()`
- `getRecords()` and `getRecord()`
- `insertRecord()` and `updateRecord()`
- `getSchema()` and `ping()`

`DbAdapterFactory.ts` chooses the correct adapter from `ACTIVE_DB_SOURCE`, so the rest of the app does not need backend-specific code paths.

## Source Switching

The active source can be changed at runtime. When that happens, the server updates its active source, reloads the matching state, and the frontend writes the new source into the URL hash so the view can be restored later.

This keeps the app consistent across reloads and makes the current backend visible in the UI.

## Why This Design Works

The project uses one shared API layer and one shared adapter contract so the UI does not need to know where data lives. File-backed storage is fast to bootstrap, while live databases allow testing against real persistence engines. The seed-state merge keeps schema and page data aligned across both modes.
