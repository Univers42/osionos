# Database Configuration & Setup Guide

Complete guide to database connections, environment configuration, and persistence setup for osionos data layer.

## Table of Contents

1. [Quick Start](#quick-start)
2. [DBMS Connection Architecture](#dbms-connection-architecture)
3. [Environment Configuration](#environment-configuration)
4. [Connection Initialization](#connection-initialization)
5. [Data Models & Schemas](#data-models--schemas)
6. [Persistence Patterns](#persistence-patterns)
7. [Implementation Checklist](#implementation-checklist)

---

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Docker & Docker Compose
- MongoDB (or PostgreSQL) running

### Start with Docker Compose

```bash
# Start MongoDB container
docker-compose up -d

# Install dependencies
pnpm install

# Run migrations and start API
make build
make dev
```

### Environment Setup

Create `.env` file in project root:

```bash
# MongoDB Configuration
MONGO_USER=notion_user
MONGO_PASSWORD=notion_pass
MONGO_DB=notion_db
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_URI=mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin

# PostgreSQL Configuration (optional)
POSTGRES_USER=notion_user
POSTGRES_PASSWORD=notion_pass
POSTGRES_DB=notion_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://notion_user:notion_pass@localhost:5432/notion_db

# API Configuration
API_HOST=0.0.0.0
API_PORT=4000
JWT_SECRET=your-dev-secret-here
JWT_EXPIRES_IN=15m

# Frontend Configuration
VITE_API_URL=http://localhost:4000
VITE_PORT=3001
```

Verify connection:

```bash
pnpm run db:ping
```

---

## DBMS Connection Architecture

### Supported Databases

osionos supports a pluggable architecture for multiple database backends:

| Database | Location | Best For | Status |
|----------|----------|----------|--------|
| **MongoDB** | Native in packages/core | Production, rich JSON objects | ✅ Recommended |
| **PostgreSQL** | Via DbAdapterFactory | Relational data, complex queries | ✅ Supported |
| **JSON File** | docker/services/dbms/ | Prototyping, offline mode | ✅ Fallback |
| **CSV File** | docker/services/dbms/ | Data export/import | ✅ Optional |

### MongoDB Connection (Recommended)

**Mongoose Setup** (`packages/core/src/database.ts`):

```typescript
import mongoose from 'mongoose';

export interface DatabaseConfig {
  uri: string;
  dbName?: string;
  maxPoolSize?: number;
}

/**
 * Connect to MongoDB — idempotent, safe to call multiple times.
 * Uses mongoose's built-in connection pooling.
 */
export async function connectDatabase(config: DatabaseConfig): Promise<typeof mongoose> {
  if (isConnected) return mongoose;

  const conn = await mongoose.connect(config.uri, {
    dbName: config.dbName,
    maxPoolSize: config.maxPoolSize ?? 10,  // Connection pool size
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  isConnected = true;
  console.log(`[core] Connected to MongoDB: ${config.dbName ?? 'default'}`);
  return conn;
}

export async function syncIndexes(): Promise<void> {
  const modelNames = mongoose.modelNames();
  for (const name of modelNames) {
    await mongoose.model(name).syncIndexes();
  }
  console.log(`[core] Synced indexes for ${modelNames.length} models`);
}
```

**Connection Features**:
- ✅ Idempotent — safe to call multiple times
- ✅ Connection pooling — default max 10 connections
- ✅ Auto-reconnect — Mongoose handles transient failures
- ✅ Index synchronization — Ensures database schema consistency

### PostgreSQL Connection (Alternative)

**Singleton Pool Pattern** (`docker/services/dbms/PostgresDbAdapter.ts`):

```typescript
import pg from 'pg';
const { Pool } = pg;

export class PostgresDbAdapter implements DbAdapter {
  readonly sourceName = 'PostgreSQL';
  readonly sourceType = 'postgresql' as const;

  private pool: InstanceType<typeof Pool> | null = null;
  private readonly connectionString: string;

  constructor(config: DbConnectionConfig) {
    if (!config.databaseUrl) throw new Error('PostgresDbAdapter requires databaseUrl');
    this.connectionString = config.databaseUrl;
  }

  async connect(): Promise<void> {
    if (this.pool) return;  // Idempotent

    this.pool = new Pool({ connectionString: this.connectionString });
    
    // Verify the connection works
    const client = await this.pool.connect();
    await client.query('SELECT 1');
    client.release();
  }

  async ping(): Promise<boolean> {
    try {
      const pool = this.ensureConnected();
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private ensureConnected(): InstanceType<typeof Pool> {
    if (!this.pool) throw new Error('PostgresDbAdapter: not connected. Call connect() first.');
    return this.pool;
  }
}
```

**Connection Configuration** (`src/server/db/connections.ts`):

```typescript
let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'notion_user',
      password: process.env.POSTGRES_PASSWORD || 'notion_pass',
      database: process.env.POSTGRES_DB || 'notion_db',
      max: 5,                    // Pool size limit
      idleTimeoutMillis: 30_000, // 30s connection timeout
    });
  }
  return pool;
}
```

**Pool Configuration**:
- ✅ Max 5 connections (adjustable via `max` parameter)
- ✅ 30s idle timeout (prevents stale connections)
- ✅ Connection verification on first use
- ✅ Singleton pattern ensures single pool instance

---

## Environment Configuration

### MongoDB Environment Variables

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `MONGO_URI` | ✅ Yes | `mongodb://user:pass@localhost:27017/db` | Connection string with auth |
| `MONGO_DB` | ✅ Yes | `notion_db` | Database name |
| `MONGO_USER` | ✅ Yes | `notion_user` | Docker container username |
| `MONGO_PASSWORD` | ✅ Yes | `secure-password` | Docker container password |
| `MONGO_PORT` | Optional | `27017` | Container port (default: 27017) |
| `SRC_MONGO_URI` | Optional | (same as MONGO_URI) | Isolated source context |
| `SRC_MONGO_DB` | Optional | `notion_src_db` | Source database for migrations |

### PostgreSQL Environment Variables

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ Yes | `postgresql://user:pass@host:5432/db` | Connection string |
| `POSTGRES_USER` | ✅ Yes | `notion_user` | Docker container username |
| `POSTGRES_PASSWORD` | ✅ Yes | `secure-password` | Docker container password |
| `POSTGRES_DB` | ✅ Yes | `notion_db` | Container database name |
| `POSTGRES_HOST` | Optional | `localhost` | Container hostname |
| `POSTGRES_PORT` | Optional | `5432` | Container port |
| `SRC_DATABASE_URL` | Optional | (separate DB) | Isolated source context |
| `SRC_POSTGRES_DB` | Optional | `notion_src_db` | Source database for migrations |

### API & Authentication

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `API_HOST` | Optional | `0.0.0.0` | API bind address |
| `API_PORT` | Optional | `4000` | API port (default: 4000) |
| `JWT_SECRET` | ✅ Yes | `your-super-secret-key` | JWT signing key (change in production!) |
| `JWT_EXPIRES_IN` | Optional | `15m` | Token expiration (default: 15m) |
| `LOG_LEVEL` | Optional | `debug` \| `info` | Logging level |

### File-Based Options

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `JSON_DB_PATH` | Optional | `./src/store/dbms/json` | JSON storage directory |
| `CSV_DB_PATH` | Optional | `./src/store/dbms/csv` | CSV storage directory |
| `ACTIVE_DB_SOURCE` | Optional | `mongodb` | Active database: `json` \| `csv` \| `mongodb` \| `postgresql` |

### Frontend Configuration

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | Optional | `http://localhost:4000` | Backend API URL (empty = offline mode) |
| `VITE_PORT` | Optional | `3001` | Frontend dev server port |

---

## Connection Initialization

### API Server Initialization Sequence

**File**: `packages/api/src/app.ts`

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { connectDatabase, syncIndexes } from '@notion-db/core';
import { authRoutes } from './routes/auth.routes.js';
// ... other imports

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // Step 1: Register CORS plugin
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Step 2: Register JWT plugin
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
  });

  // Step 3: Register WebSocket plugin
  await app.register(websocket);

  // Step 4: Attach authentication hook
  app.decorate('authenticate', authHook);

  // Step 5: Connect to MongoDB
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/notion_db';
  await connectDatabase({ 
    uri: mongoUri, 
    dbName: process.env.MONGO_DB 
  });

  // Step 6: Sync indexes
  if (process.env.SYNC_INDEXES !== 'false') {
    await syncIndexes();
  }

  // Step 7: Register route handlers
  await app.register(authRoutes, { prefix: '/api/auth' });
  // ... other route registrations

  // Step 8: Register health check endpoint
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}
```

**Entry Point**: `packages/api/src/index.ts`

```typescript
import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = Number.parseInt(process.env.API_PORT ?? '4000', 10);
const HOST = process.env.API_HOST ?? '0.0.0.0';

const app = await buildApp();

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

### Startup Health Checks

After API starts, verify:

```bash
# 1. API is running
curl http://localhost:4000/health
# Expected: { "status": "ok", "timestamp": "..." }

# 2. Database connection is alive
pnpm run db:ping
# Expected: Connection successful

# 3. Frontend can reach API
curl http://localhost:4000/api/auth/login -X POST
# Expected: 400 (bad request) or 401 (no credentials)
```

---

## Data Models & Schemas

### User Model

**Mongoose Schema** (`packages/core/src/models/User.ts`):

```typescript
import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  _id: { type: String, default: () => generateId() },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },  // bcrypted
  name: String,
  avatar: String,
  preferences: {
    theme: { type: String, default: 'light' },
    notifications: { type: Boolean, default: true },
  },
  lastLoginAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = model('User', UserSchema);
```

**Usage**:

```typescript
// Create
const user = await User.create({
  email: 'user@example.com',
  password: hashedPassword,
  name: 'John Doe',
});

// Read
const user = await User.findById(userId).lean();

// Update
const updated = await User.findByIdAndUpdate(
  userId,
  { $set: { lastLoginAt: new Date() } },
  { new: true }
);

// Delete (soft)
await User.updateOne({ _id: userId }, { $set: { archived: true } });
```

### Workspace Model

```typescript
const WorkspaceSchema = new Schema({
  _id: String,
  name: { type: String, required: true },
  ownerId: { type: String, required: true, ref: 'User' },
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  settings: {
    timezone: String,
    language: { type: String, default: 'en' },
  },
  domain: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
```

### Page Model

```typescript
const PageSchema = new Schema({
  _id: String,
  workspaceId: { type: String, required: true, ref: 'Workspace' },
  parentPageId: String,  // Creates hierarchy
  title: { type: String, required: true },
  icon: String,
  cover: String,
  archived: { type: Boolean, default: false },
  properties: Schema.Types.Mixed,  // Dynamic properties
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
```

### Block Model

```typescript
const BlockSchema = new Schema({
  _id: String,
  pageId: { type: String, required: true, ref: 'Page' },
  parentBlockId: String,  // For nesting
  type: { type: String, required: true },  // 'text', 'heading', 'image', etc.
  order: String,          // Lexicographic ordering for stability
  properties: Schema.Types.Mixed,  // Type-specific data
  content: String,
  archived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
```

---

## Persistence Patterns

### CRUD Operations

#### Create

```typescript
// Single document
const page = await Page.create({
  workspaceId: workspace._id,
  title: 'New Page',
  icon: '📄',
});

// With bulk insert
const blocks = await Block.insertMany([
  { pageId: page._id, type: 'heading', order: 'a0' },
  { pageId: page._id, type: 'text', order: 'a1' },
]);
```

#### Read

```typescript
// Single
const page = await Page.findById(pageId).lean();

// Multiple with filter
const pages = await Page.find({
  workspaceId,
  archived: { $ne: true },
}).lean();

// With pagination
const pages = await Page.find({ workspaceId })
  .lean()
  .limit(50)
  .skip(0)
  .sort({ createdAt: -1 });
```

#### Update

```typescript
// Single field
await Page.findByIdAndUpdate(pageId, { $set: { title: 'New Title' } });

// Nested field
await Page.findByIdAndUpdate(pageId, {
  $set: { 'properties.customField': 'value' }
});

// Return updated document
const updated = await Page.findByIdAndUpdate(
  pageId,
  { $set: { updatedAt: new Date() } },
  { new: true }
).lean();
```

#### Delete (Soft)

```typescript
// Mark as archived (no hard deletes)
await Page.findByIdAndUpdate(pageId, { $set: { archived: true } });

// Query excludes archived
const activePages = await Page.find({ archived: { $ne: true } }).lean();
```

### Transactions & Consistency

**Note**: osionos currently uses **single-document atomicity only**.

For multi-document operations requiring consistency:

```typescript
// ⚠️ NOT atomic — could fail mid-operation
await Page.create({ workspaceId, title: 'Page' });
await Block.create({ pageId: createdPage._id, type: 'text' });

// ✅ Use Mongoose sessions for transactions (MongoDB 4.0+)
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    const page = await Page.create([{ workspaceId, title: 'Page' }], { session });
    await Block.create([{ pageId: page._id, type: 'text' }], { session });
  });
} finally {
  await session.endSession();
}
```

### Indexes & Query Performance

**Automatic Synchronization**:

```typescript
// Called on app startup via syncIndexes()
// Ensures all Mongoose model indexes exist in MongoDB
```

**Define indexes in schemas**:

```typescript
const PageSchema = new Schema({
  // ... fields ...
  workspaceId: { type: String, index: true },  // For fast lookups
  parentPageId: { type: String, index: true },
  createdAt: { type: Date, index: -1 },        // Reverse for sorting
});

// Compound index
PageSchema.index({ workspaceId: 1, archived: 1 });
```

---

## Implementation Checklist

### Phase 1: Environment & Connection

- [ ] Create `.env` file with MongoDB credentials (from `docker-compose.yml`)
- [ ] Run `docker-compose up -d` to start MongoDB
- [ ] Verify connection: `pnpm run db:ping`
- [ ] Check API health: `curl http://localhost:4000/health`

### Phase 2: Data Models

- [ ] Define User, Workspace, Page, Block Mongoose schemas
- [ ] Add indexes for common queries (workspaceId, parentPageId, createdAt)
- [ ] Register models in `packages/core/src/models/index.ts`
- [ ] Update `syncIndexes()` to include new models

### Phase 3: Authentication

- [ ] Implement `AuthService` for login/logout/token refresh
- [ ] Add JWT middleware hook to protect routes
- [ ] Test auth flow: login → get token → use Bearer token

### Phase 4: API Routes

- [ ] Create `/api/auth` routes (login, logout, refresh)
- [ ] Create `/api/pages` CRUD routes (GET, POST, PATCH, DELETE)
- [ ] Create `/api/blocks` CRUD routes
- [ ] Attach `app.authenticate` middleware to protected routes

### Phase 5: Frontend Integration

- [ ] Update API client to use `VITE_API_URL`
- [ ] Update Zustand store to call API instead of in-memory data
- [ ] Update auth flow to store JWT from `/api/auth/login`
- [ ] Test end-to-end: frontend → API → MongoDB

### Phase 6: Testing & Validation

- [ ] Write integration tests for API routes
- [ ] Test CRUD operations with Postman or similar
- [ ] Verify data persists after API restart
- [ ] Load test with `make load-test`

---

## Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB is running
docker-compose ps

# View MongoDB logs
docker-compose logs mongodb

# Verify credentials
mongosh -u notion_user -p "your_password" mongodb://localhost:27017/notion_db
```

### API Server Issues

```bash
# Check logs
tail -f .env  # Verify all required vars are set

# Restart services
docker-compose restart
pnpm run dev:api
```

### JWT Token Issues

```bash
# Generate new JWT_SECRET if needed
openssl rand -base64 32 > .env.jwt_secret

# Decode token (for debugging)
node -e "console.log(require('jsonwebtoken').decode(token))"
```

---

## References

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Mongoose Guide](https://mongoosejs.com/docs/)
- [Fastify Documentation](https://www.fastify.io/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)
