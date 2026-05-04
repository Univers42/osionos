# Osionos Codebase Exploration Summary

## Overview

This document maps the key architectural components of osionos, a Notion-like database application supporting multiple backends (JSON, CSV, MongoDB, PostgreSQL).

---

## 1. Server-Side Code Structure

### 1.1 Development Server Setup

**File:** [vite.config.ts](../src/components/database/src/vite.config.ts) (main database component)

- **Port:** 3000 (host 0.0.0.0)
- **Architecture:** Vite dev server with custom middleware plugin
- **Key Plugin:** `dbms-api` plugin that integrates DBMS middleware into Vite's server

```typescript
{
  name: 'dbms-api',
  configureServer(server) {
    dbmsMiddleware(server);
  },
}
```

**Why this design:**

- No separate backend process needed during development
- Same-origin API calls (no CORS issues)
- Hot Module Replacement (HMR) works naturally with frontend code

### 1.2 DBMS Middleware

**File:** [src/components/database/src/server/dbmsMiddleware.ts](../src/components/database/src/server/dbmsMiddleware.ts)

**Responsibilities:**

- Routes all `/api/dbms/*` requests to appropriate handlers
- Manages file watchers for data changes
- Initializes logging system
- Handles errors and returns JSON responses

**Route Tables:**

**Exact Routes (no parameters):**
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/dbms/state` | `handleGetState` |
| GET | `/api/dbms/source` | `handleGetSource` |
| PUT | `/api/dbms/source` | `handlePutSource` |
| POST | `/api/dbms/records` | `handlePostRecord` |
| POST | `/api/dbms/columns` | `handlePostColumn` |
| GET | `/api/dbms/query-log` | `handleGetQueryLog` |
| DELETE | `/api/dbms/query-log` | `handleDeleteQueryLog` |
| POST | `/api/dbms/ops` | `handlePostOps` |
| PATCH | `/api/dbms/state` | `handlePatchState` |
| POST | `/api/dbms/views` | `handlePostView` |

**Parameterized Routes:**

```
PATCH   /api/dbms/pages/:pageId
DELETE  /api/dbms/records/:recordId
DELETE  /api/dbms/columns/:databaseId/:propId
PATCH   /api/dbms/columns/:databaseId/:propId/type
PUT     /api/dbms/databases/:databaseId
PUT     /api/dbms/views/:viewId
DELETE  /api/dbms/views/:viewId
```

### 1.3 Route Handlers

**CRUD Handlers:** [src/components/database/src/server/routeHandlersCrud.ts](../src/components/database/src/server/routeHandlersCrud.ts)

- `handlePatchPage()` - Update page properties
- `handlePostRecord()` - Create new record
- `handleDeleteRecord()` - Delete record

**Admin Handlers:** [src/components/database/src/server/routeHandlersAdmin.ts](../src/components/database/src/server/routeHandlersAdmin.ts)

- `handleGetState()` / `handlePutSource()` - State management
- `handlePostColumn()` / `handleDeleteColumn()` / `handleChangeColumnType()` - Schema operations
- `handlePutDatabase()` - Database updates
- `handlePostView()` / `handlePutView()` / `handleDeleteView()` - View management
- `handlePostOps()` - Execute database operations

### 1.4 Production API Server

**Location:** [src/components/database/packages/api/src/app.ts](../src/components/database/packages/api/src/app.ts)

Built with **Fastify** for multi-user scenarios:

```typescript
export async function buildApp() {
  const app = Fastify({...});

  // Plugins
  await app.register(cors);        // CORS support
  await app.register(jwt);         // JWT authentication
  await app.register(websocket);   // WebSocket for real-time sync

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/workspaces' });
  await app.register(pageRoutes, { prefix: '/api/pages' });
  await app.register(blockRoutes, { prefix: '/api/blocks' });
  await app.register(viewRoutes, { prefix: '/api/views' });
  await app.register(wsRoutes, { prefix: '/ws' });

  return app;
}
```

**Key Differences from Dev Server:**

- Multi-user support with JWT authentication
- MongoDB persistence by default
- WebSocket real-time sync
- CORS configuration for cross-origin requests

---

## 2. DBMS Adapter Layer

### 2.1 Adapter Architecture

**Type Definitions:** [docker/services/dbms/types.ts](../docker/services/dbms/types.ts)

```typescript
export interface DbAdapter {
  readonly sourceName: string;
  readonly sourceType: DbSourceType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listEntities(): Promise<string[]>;
  getRecords(entity: string): Promise<DbRecord[]>;
  getRecord(entity: string, id: string): Promise<DbRecord | null>;
  updateRecord(
    entity: string,
    id: string,
    field: string,
    value: unknown,
  ): Promise<DbRecord>;
  insertRecord(entity: string, record: Omit<DbRecord, "id">): Promise<DbRecord>;
  getSchema(entity: string): Promise<DbEntitySchema>;
  ping(): Promise<boolean>;
}
```

**Supported Sources:**

- `'json'` - File-based JSON storage
- `'csv'` - File-based CSV storage
- `'mongodb'` - Live MongoDB containers
- `'postgresql'` - Live PostgreSQL databases

### 2.2 Adapter Factory

**File:** [docker/services/dbms/DbAdapterFactory.ts](../docker/services/dbms/DbAdapterFactory.ts)

```typescript
export async function createActiveAdapter(
  env: Record<string, string | undefined> = {},
): Promise<DbAdapter> {
  const sourceType = (env.ACTIVE_DB_SOURCE ?? "json") as DbSourceType;
  const config = configFromEnv(env);

  const adapter = createAdapter(sourceType, config);
  await adapter.connect();
  return adapter;
}
```

**Connection Config:**

```typescript
export interface DbConnectionConfig {
  basePath?: string; // For JSON/CSV
  mongoUri?: string; // For MongoDB
  mongoDb?: string;
  databaseUrl?: string; // For PostgreSQL
}
```

### 2.3 Implementations

**Existing Adapters:**

- `JsonDbAdapter` - Reads/writes JSON files
- `CsvDbAdapter` - Reads/writes CSV files
- `MongoDbAdapter` - MongoDB container
- `PostgresDbAdapter` - PostgreSQL container

**Barrel Export:** [docker/services/dbms/index.ts](../docker/services/dbms/index.ts)

### 2.4 Schema Inference

**File:** [docker/services/dbms/inferSchema.ts](../docker/services/dbms/inferSchema.ts)

Automatically detects field types:

- `'string'` | `'number'` | `'boolean'` | `'date'` | `'array'` | `'object'` | `'unknown'`

---

## 3. Operations Layer (Ops Dispatcher)

### 3.1 Query Dispatch

**File:** [src/components/database/src/server/ops/index.ts](../src/components/database/src/server/ops/index.ts)

Routes CRUD/DDL operations to active source:

```typescript
export async function dispatchInsert(
  source: DbSource,
  dbId: string,
  record: Record<string, unknown>,
  fieldMap: FieldMap,
): Promise<DispatchResult>

export async function dispatchUpdate(
  source: DbSource,
  dbId: string,
  flatId: string,
  fieldName: string,
  value: unknown,
  fieldMap: FieldMap,
): Promise<DispatchResult>

export async function dispatchDelete(
  source: DbSource,
  dbId: string,
  flatId: string,
  fieldMap: FieldMap,
): Promise<DispatchResult>

export async function dispatchAddColumn(...)
export async function dispatchDropColumn(...)
export async function dispatchChangeType(...)
```

### 3.2 Query Logging

- Maintains in-memory `queryLog` of executed SQL/Mongo operations
- Available via `GET /api/dbms/query-log?limit=50`
- Useful for debugging and UI inspection

### 3.3 Helpers

**File:** [src/components/database/src/server/ops/helpers.ts](../src/components/database/src/server/ops/helpers.ts)

- `sqlId(name)` - SQL identifier escaping (e.g., `"column_name"`)
- `sqlLit(value)` - SQL literal escaping (e.g., `'string'`, `123`)
- `mongoLit(value)` - MongoDB literal conversion
- `getPgPool()` - Get PostgreSQL connection pool
- `getMongoDb()` - Get MongoDB instance
- `resolveTableName(dbId)` - Map database ID to table/collection name

---

## 4. Persistence API Endpoints

### 4.1 State Management

| Endpoint           | Method | Purpose                                              |
| ------------------ | ------ | ---------------------------------------------------- |
| `/api/dbms/state`  | GET    | Fetch full database state (pages, databases, views)  |
| `/api/dbms/state`  | PATCH  | Update database and view metadata                    |
| `/api/dbms/source` | GET    | Get active data source (json/csv/mongodb/postgresql) |
| `/api/dbms/source` | PUT    | Switch active data source                            |

### 4.2 Record Operations

| Endpoint                      | Method | Purpose                |
| ----------------------------- | ------ | ---------------------- |
| `/api/dbms/records`           | POST   | Insert new record      |
| `/api/dbms/records/:recordId` | DELETE | Delete record          |
| `/api/dbms/pages/:pageId`     | PATCH  | Update page properties |

**Record Format:**

```json
{
  "id": "string",
  "databaseId": "string",
  "properties": {
    /* heterogeneous property values */
  },
  "content": [
    /* Block[] */
  ],
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "createdBy": "string",
  "lastEditedBy": "string"
}
```

### 4.3 Schema Operations

| Endpoint                                     | Method | Purpose                |
| -------------------------------------------- | ------ | ---------------------- |
| `/api/dbms/columns`                          | POST   | Add column to database |
| `/api/dbms/columns/:databaseId/:propId`      | DELETE | Remove column          |
| `/api/dbms/columns/:databaseId/:propId/type` | PATCH  | Change column type     |

### 4.4 Database Operations

| Endpoint                          | Method | Purpose                  |
| --------------------------------- | ------ | ------------------------ |
| `/api/dbms/databases/:databaseId` | PUT    | Update database metadata |

### 4.5 View Operations

| Endpoint                  | Method | Purpose     |
| ------------------------- | ------ | ----------- |
| `/api/dbms/views`         | POST   | Create view |
| `/api/dbms/views/:viewId` | PUT    | Update view |
| `/api/dbms/views/:viewId` | DELETE | Delete view |

### 4.6 Operations & Query Log

| Endpoint              | Method | Purpose                           |
| --------------------- | ------ | --------------------------------- |
| `/api/dbms/ops`       | POST   | Execute custom database operation |
| `/api/dbms/query-log` | GET    | Fetch query execution log         |
| `/api/dbms/query-log` | DELETE | Clear query log                   |

---

## 5. Frontend State Management (Zustand Stores)

### 5.1 Main Page Store

**File:** [src/store/usePageStore.ts](../src/store/usePageStore.ts)

```typescript
interface PageStore {
  pages: Record<string, PageEntry[]>;        // keyed by workspaceId
  activePage: ActivePage | null;
  navigationPath: ActivePage[];              // breadcrumb
  recents: ActivePage[];                     // last 10 opened
  loadingIds: Set<string>;                   // workspaceIds fetching
  seeded: boolean;                           // seed data loaded
  showTrash: boolean;

  // Actions
  fetchPages(workspaceId: string, jwt: string): Promise<void>;
  fetchPageContent(pageId: string, jwt: string): Promise<void>;
  seedOfflinePages(): void;
  addPage(workspaceId, title, jwt, parentPageId?): Promise<PageEntry | null>;
  archivePage/deletePage/restorePage/duplicatePage(...)
  movePage(pageId, targetParentId, targetWorkspaceId): void;
  openPage(page: ActivePage): void;
  clearWorkspace(workspaceId: string): void;
}
```

**Type:** [src/entities/page/model/types.ts](../src/entities/page/model/types.ts)

```typescript
export interface PageEntry {
  _id: string;
  title: string;
  icon?: string;
  cover?: string;
  updatedAt?: string;
  workspaceId: string;
  ownerId?: string | null;
  visibility?: PageVisibility;
  collaborators?: PageCollaborator[];
  parentPageId?: string | null;
  databaseId?: string | null;
  archivedAt?: string | null;
  content?: Block[];
}
```

### 5.2 Database Store (Database Component)

**File:** [src/components/database/src/store/slices/databaseSlice.ts](../src/components/database/src/store/slices/databaseSlice.ts)

```typescript
export interface DatabaseSliceState {
  databases: Record<string, DatabaseSchema>;
}

export interface DatabaseSliceActions {
  renameDatabase(databaseId: string, name: string): void;
  updateDatabaseIcon(databaseId: string, icon: string): void;
  addProperty(databaseId: string, name: string, type: PropertyType): void;
  updateProperty(
    databaseId: string,
    propertyId: string,
    updates: Partial<SchemaProperty>,
  ): void;
  deleteProperty(databaseId: string, propertyId: string): void;
  addSelectOption(
    databaseId: string,
    propertyId: string,
    option: SelectOption,
  ): void;
}
```

### 5.3 Page Slice (Database Component)

**File:** [src/components/database/src/store/slices/pageSlice.ts](../src/components/database/src/store/slices/pageSlice.ts)

```typescript
export interface PageSliceActions {
  addPage(databaseId: string, properties?: Record<string, unknown>): string;
  updatePageProperty(pageId: string, propertyId: string, value: unknown): void;
  deletePage(pageId: string): void;
  updatePageContent(pageId: string, content: Block[]): void;
  insertBlock/deleteBlock/moveBlock/updateBlock(...): void;
  openPage(pageId: string | null): void;
}
```

### 5.4 View Slice (Database Component)

**File:** [src/components/database/src/store/slices/viewSlice.ts](../src/components/database/src/store/slices/viewSlice.ts)

```typescript
export interface ViewSliceActions {
  addView(view: ViewConfig): void;
  updateView(viewId: string, updates: Partial<ViewConfig>): void;
  updateViewSettings(viewId: string, settings: ViewSettings): void;
  deleteView(viewId: string): void;
  setActiveViewId(viewId: string): void;
  // Filter, sort, grouping actions...
}
```

### 5.5 Slice Composition

**File:** [src/components/database/src/store/slices/index.ts](../src/components/database/src/store/slices/index.ts)

Exports all slice creators:

```typescript
export { createDatabaseSlice };
export { createPageSlice };
export { createViewSlice };
export { createSelectionSlice };
```

---

## 6. Type Definitions for Database Entities

### 6.1 Core Database Types

**File:** [src/components/database/src/types/database.ts](../src/components/database/src/types/database.ts)

```typescript
export interface DatabaseSchema {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  properties: Record<string, SchemaProperty>;
  titlePropertyId: string;
}

export interface SchemaProperty {
  id: string;
  name: string;
  type: PropertyType;
  icon?: string;
  options?: SelectOption[];
  statusGroups?: StatusGroup[];
  formulaConfig?: FormulaConfig;
  rollupConfig?: RollupConfig;
  relationConfig?: RelationConfig;
  buttonConfig?: ButtonConfig;
  customConfig?: CustomFieldConfig;
  prefix?: string;
  autoIncrement?: number;
}

export interface Page {
  id: string;
  databaseId: string;
  icon?: string;
  cover?: string;
  properties: Record<string, PropertyValue>; // heterogeneous
  content: Block[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastEditedBy: string;
  archived?: boolean;
  parentPageId?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  children?: Block[];
  checked?: boolean;
  language?: string;
  color?: string;
  url?: string;
  caption?: string;
  collapsed?: boolean;
  // ... 20+ other optional fields
}
```

### 6.2 Property Types

```typescript
export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "person"
  | "user"
  | "url"
  | "email"
  | "phone"
  | "files_media"
  | "relation"
  | "formula"
  | "rollup"
  | "button"
  | "place"
  | "id"
  | "created_time"
  | "last_edited_time"
  | "created_by"
  | "last_edited_by"
  | "assigned_to"
  | "due_date"
  | "custom";
```

### 6.3 Block Types

30+ types including:

```typescript
'paragraph' | 'heading_1' | 'heading_2' | 'bulleted_list' | 'numbered_list'
| 'to_do' | 'code' | 'quote' | 'callout' | 'divider' | 'image' | 'video'
| 'database_inline' | 'database_full_page' | 'table_view' | 'board_view'
| ...
```

### 6.4 View Types

**File:** [src/components/database/src/types/views.ts](../src/components/database/src/types/views.ts)

```typescript
export type ViewType =
  | "table"
  | "board"
  | "gallery"
  | "list"
  | "calendar"
  | "timeline"
  | "dashboard";

export interface ViewConfig {
  id: string;
  databaseId: string;
  name: string;
  type: ViewType;
  icon?: string;
  properties: Record<string, unknown>;
  visibleProperties: string[];
  filters: Filter[];
  sorts: Sort[];
  grouping?: Grouping;
  settings: ViewSettings;
}

export interface ViewSettings {
  [key: string]: unknown;
}
```

### 6.5 Select Options

```typescript
export interface SelectOption {
  id: string;
  value: string;
  color: string;
}
```

---

## 7. Frontend Persistence Flow

### 7.1 Persistence Actions

**File:** [src/components/database/src/store/dbmsStoreActions.ts](../src/components/database/src/store/dbmsStoreActions.ts)

```typescript
export function createDbmsPersistenceActions(set: SetState, get: GetState) {
  return {
    renameDatabase(databaseId, name) {
      /* ... */
    },
    updateDatabaseIcon(databaseId, icon) {
      /* ... */
    },
    addView(view) {
      /* ... */
    },
    updateView(viewId, updates) {
      /* ... */
    },
    updateViewSettings(viewId, settings) {
      /* ... */
    },
    deleteView(viewId) {
      /* ... */
    },
  };
}
```

### 7.2 Persistence Helpers

**File:** [src/components/database/src/store/dbmsStoreHelpers.ts](../src/components/database/src/store/dbmsStoreHelpers.ts)

```typescript
export async function persistDatabaseMetadata(
  databaseId: string,
  metadata: { name?: string; icon?: string },
  source: string,
): Promise<void>;

export async function persistViewCreate(
  view: Record<string, unknown>,
  source: string,
): Promise<void>;

export async function persistViewUpdate(
  viewId: string,
  updates: Record<string, unknown>,
  source: string,
): Promise<void>;

export async function persistViewDelete(
  viewId: string,
  source: string,
): Promise<void>;

export async function persistPageProperty(
  pageId: string,
  propertyId: string,
  value: unknown,
  sourceAtCallTime: string,
): Promise<void>;
```

**Debouncing:**

- Property changes debounced with `persistTimers` Map
- Full state flush with debounce window (default 400ms)
- Source staleness check: if source changed after edit scheduled, API returns 409

---

## 8. File Locations Summary

| Component                   | Location                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Dev Server Config**       | [vite.config.ts](../src/components/database/src/vite.config.ts)                                                         |
| **DBMS Middleware**         | [src/components/database/src/server/dbmsMiddleware.ts](../src/components/database/src/server/dbmsMiddleware.ts)         |
| **Route Handlers (CRUD)**   | [src/components/database/src/server/routeHandlersCrud.ts](../src/components/database/src/server/routeHandlersCrud.ts)   |
| **Route Handlers (Admin)**  | [src/components/database/src/server/routeHandlersAdmin.ts](../src/components/database/src/server/routeHandlersAdmin.ts) |
| **Adapter Interface**       | [docker/services/dbms/types.ts](../docker/services/dbms/types.ts)                                                       |
| **Adapter Factory**         | [docker/services/dbms/DbAdapterFactory.ts](../docker/services/dbms/DbAdapterFactory.ts)                                 |
| **Operations Dispatcher**   | [src/components/database/src/server/ops/index.ts](../src/components/database/src/server/ops/index.ts)                   |
| **Page Store**              | [src/store/usePageStore.ts](../src/store/usePageStore.ts)                                                               |
| **Database Store (slices)** | [src/components/database/src/store/slices/](../src/components/database/src/store/slices/)                               |
| **Database Types**          | [src/components/database/src/types/database.ts](../src/components/database/src/types/database.ts)                       |
| **View Types**              | [src/components/database/src/types/views.ts](../src/components/database/src/types/views.ts)                             |
| **Page Entity Types**       | [src/entities/page/model/types.ts](../src/entities/page/model/types.ts)                                                 |
| **Persistence Helpers**     | [src/components/database/src/store/dbmsStoreHelpers.ts](../src/components/database/src/store/dbmsStoreHelpers.ts)       |
| **Production API App**      | [src/components/database/packages/api/src/app.ts](../src/components/database/packages/api/src/app.ts)                   |

---

## 9. Architecture Decision Summary

| Decision                         | Rationale                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Middleware + Vite**            | No separate backend process in dev; same-origin API removes CORS complexity                    |
| **Dual Server (Vite + Fastify)** | Dev uses middleware (simple), production uses Fastify (multi-user, auth, WebSocket)            |
| **Adapter Factory**              | Single source switch (env var) without code changes; new adapters are purely additive          |
| **Ops Dispatcher Layer**         | Decouples store mutations (sync) from database writes (async); provides query logging          |
| **Debounced Persistence**        | Reduces API load from frequent property edits; guards against stale writes with source version |
| **Zustand Slices**               | Composable store architecture; easier to test and reason about state transitions               |
| **Schema Inference**             | Automatic type detection for lazy adapters; reduces manual schema definitions                  |

---

## 10. What Needs to Be Created

Based on the exploration, the following areas may need enhancement:

1. **Error Handling Middleware** - Centralized error response formatting
2. **Request Validation** - Input validation layer for API endpoints
3. **Transaction Support** - For multi-step operations (database + view creation)
4. **Caching Strategy** - For frequently accessed database schemas
5. **Real-time Synchronization** - WebSocket handlers for multi-user scenarios
6. **Migration System** - For schema version management
7. **Audit Logging** - Track all data mutations by user
8. **Query Optimization** - Batch operations, connection pooling tuning
9. **Testing Infrastructure** - Unit tests for adapters and route handlers
10. **Documentation Generation** - API docs from route handlers

---

## 11. Key Design Patterns

1. **Factory Pattern** - `DbAdapterFactory` creates adapters based on source type
2. **Adapter Pattern** - Uniform `DbAdapter` interface for heterogeneous backends
3. **Observer Pattern** - File watcher notifies frontend of external changes
4. **Decorator Pattern** - Logger system wraps operations with styling and context
5. **Middleware Pattern** - Vite middleware chain for request handling
6. **Slice Pattern** - Zustand slices for composable store state
7. **Debounce Pattern** - Frontend persistence uses debounced timers

---

## 12. Data Flow Diagrams

### Create Page Flow

```
Frontend (usePageStore)
    ↓
handlePostRecord() [/api/dbms/records POST]
    ↓
dispatchInsert() [ops layer]
    ↓
Active Adapter (PostgreSQL/MongoDB/JSON/CSV)
    ↓
Database / File
```

### Update Property Flow

```
Frontend (property editor)
    ↓
debouncePersistContent() [400ms debounce]
    ↓
handlePatchPage() [/api/dbms/pages/:id PATCH]
    ↓
dispatchUpdate() [ops layer]
    ↓
Active Adapter
    ↓
Database / File
```

### Source Switch Flow

```
Frontend (source picker)
    ↓
handlePutSource() [/api/dbms/source PUT]
    ↓
setActiveSource(newSource)
    ↓
invalidateLiveCache()
    ↓
getEffectiveState(newSource)
    ↓
Return merged seed + live data
```
