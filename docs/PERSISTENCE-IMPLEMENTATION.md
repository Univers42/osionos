# Data Persistence Implementation Guide

Step-by-step checklist to enable full data persistence in osionos using the database component.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Environment & Infrastructure](#phase-1-environment--infrastructure)
3. [Phase 2: Data Models](#phase-2-data-models)
4. [Phase 3: Authentication](#phase-3-authentication)
5. [Phase 4: Backend API](#phase-4-backend-api)
6. [Phase 5: Frontend Integration](#phase-5-frontend-integration)
7. [Phase 6: Testing & Validation](#phase-6-testing--validation)
8. [Phase 7: Migration & Deployment](#phase-7-migration--deployment)

---

## Prerequisites

### Technology Stack

- ✅ Node.js 18+ (`node --version`)
- ✅ pnpm (`pnpm --version`)
- ✅ Docker & Docker Compose (`docker --version`)
- ✅ MongoDB (via Docker)
- ✅ Git (`git --version`)

### Verify Installation

```bash
# Check all dependencies
node --version  # v18+
pnpm --version  # v8+
docker --version  # 20+
docker-compose --version  # v2+
```

### Current Branch

Ensure you're on the feature branch:

```bash
git checkout feat/database-component-integration
git pull origin feat/database-component-integration
```

---

## Phase 1: Environment & Infrastructure

### ✓ Step 1.1: Create Environment File

Create `.env` file in project root with MongoDB credentials:

```bash
# .env

# MongoDB Configuration
MONGO_USER=notion_user
MONGO_PASSWORD=notion_pass
MONGO_DB=notion_db
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_URI=mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin

# API Configuration
API_HOST=0.0.0.0
API_PORT=4000
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m

# Frontend Configuration
VITE_API_URL=http://localhost:4000
VITE_PORT=3001

# Optional: PostgreSQL (not used by default)
# POSTGRES_USER=notion_user
# POSTGRES_PASSWORD=notion_pass
# POSTGRES_DB=notion_db
# DATABASE_URL=postgresql://notion_user:notion_pass@localhost:5432/notion_db
```

**Verification**:

```bash
# Show environment variables (verify they're loaded)
env | grep MONGO
env | grep API
```

### ✓ Step 1.2: Start MongoDB Container

```bash
# Start MongoDB via Docker Compose
docker-compose up -d

# Verify MongoDB is running
docker-compose ps
# Should show: playground_mongodb ... Up

# Check MongoDB logs (optional)
docker-compose logs mongodb
```

### ✓ Step 1.3: Verify Database Connection

```bash
# Test MongoDB connection
pnpm run db:ping

# Expected output:
# [core] Connected to MongoDB: notion_db
# ✓ Ping successful
```

If ping fails:

```bash
# Check if container is running
docker ps | grep mongo

# Restart container
docker-compose restart mongodb

# View logs
docker-compose logs mongodb --tail=20
```

---

## Phase 2: Data Models

### ✓ Step 2.1: Create User Model

Create file: `src/components/database/packages/core/src/models/User.ts`

```typescript
import { Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';

const UserSchema = new Schema({
  _id: { 
    type: String, 
    default: () => `user_${Date.now()}_${Math.random().toString(36).substring(7)}`
  },
  
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    index: true,
  },
  
  password: { 
    type: String, 
    required: true,
    select: false,  // Never select by default
  },
  
  name: {
    type: String,
    default: 'User',
  },
  
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language: { type: String, default: 'en' },
  },
  
  lastLoginAt: Date,
  
  createdAt: { type: Date, default: Date.now, index: -1 },
  updatedAt: { type: Date, default: Date.now },
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to verify password
UserSchema.methods.verifyPassword = async function (password: string) {
  return bcrypt.compare(password, this.password);
};

export const User = model('User', UserSchema);
```

### ✓ Step 2.2: Create Workspace Model

Create file: `src/components/database/packages/core/src/models/Workspace.ts`

```typescript
import { Schema, model } from 'mongoose';

const WorkspaceSchema = new Schema({
  _id: { 
    type: String, 
    default: () => `workspace_${Date.now()}_${Math.random().toString(36).substring(7)}`
  },
  
  name: { 
    type: String, 
    required: true,
    index: true,
  },
  
  ownerId: { 
    type: String, 
    required: true,
    ref: 'User',
    index: true,
  },
  
  plan: { 
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free',
  },
  
  settings: {
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'en' },
  },
  
  createdAt: { type: Date, default: Date.now, index: -1 },
  updatedAt: { type: Date, default: Date.now },
});

// Compound index for common queries
WorkspaceSchema.index({ ownerId: 1, createdAt: -1 });

export const Workspace = model('Workspace', WorkspaceSchema);
```

### ✓ Step 2.3: Create Page Model

Create file: `src/components/database/packages/core/src/models/Page.ts`

```typescript
import { Schema, model } from 'mongoose';

const PageSchema = new Schema({
  _id: { 
    type: String, 
    default: () => `page_${Date.now()}_${Math.random().toString(36).substring(7)}`
  },
  
  workspaceId: { 
    type: String, 
    required: true,
    ref: 'Workspace',
    index: true,
  },
  
  parentPageId: { 
    type: String, 
    ref: 'Page',
    default: null,
    index: true,
  },
  
  title: { 
    type: String, 
    required: true,
    default: 'Untitled',
  },
  
  icon: {
    type: String,
    default: '📄',
  },
  
  cover: String,
  
  properties: {
    type: Schema.Types.Mixed,
    default: {},
  },
  
  archived: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  createdAt: { type: Date, default: Date.now, index: -1 },
  updatedAt: { type: Date, default: Date.now, index: -1 },
});

// Indexes for common queries
PageSchema.index({ workspaceId: 1, archived: 1 });
PageSchema.index({ workspaceId: 1, parentPageId: 1 });

export const Page = model('Page', PageSchema);
```

### ✓ Step 2.4: Create Block Model

Create file: `src/components/database/packages/core/src/models/Block.ts`

```typescript
import { Schema, model } from 'mongoose';

const BlockSchema = new Schema({
  _id: { 
    type: String, 
    default: () => `block_${Date.now()}_${Math.random().toString(36).substring(7)}`
  },
  
  pageId: { 
    type: String, 
    required: true,
    ref: 'Page',
    index: true,
  },
  
  parentBlockId: { 
    type: String, 
    ref: 'Block',
    default: null,
  },
  
  type: { 
    type: String,
    required: true,
    enum: ['heading', 'text', 'bulleted', 'numbered', 'image', 'code', 'quote', 'divider'],
  },
  
  order: { 
    type: String, 
    required: true,
    index: true,
  },
  
  content: {
    type: String,
    default: '',
  },
  
  properties: {
    type: Schema.Types.Mixed,
    default: {},
  },
  
  archived: {
    type: Boolean,
    default: false,
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes
BlockSchema.index({ pageId: 1, order: 1 });
BlockSchema.index({ pageId: 1, archived: 1 });

export const Block = model('Block', BlockSchema);
```

### ✓ Step 2.5: Register Models

Create/update file: `src/components/database/packages/core/src/models/index.ts`

```typescript
export { User } from './User.js';
export { Workspace } from './Workspace.js';
export { Page } from './Page.js';
export { Block } from './Block.js';
```

### ✓ Step 2.6: Verify Models

```bash
# Run TypeScript check
pnpm run typecheck

# Expected: No errors in models

# Run tests (if exist)
pnpm run test:models

# Expected: All model tests pass
```

---

## Phase 3: Authentication

### ✓ Step 3.1: Create Auth Service

Create file: `src/components/database/packages/core/src/services/AuthService.ts`

```typescript
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export class AuthService {
  constructor(
    private jwtSecret: string,
    private jwtExpiresIn: string
  ) {}

  /**
   * Authenticate user by email and password
   */
  async authenticate(email: string, password: string): Promise<string> {
    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new Error('User not found');

    const isValid = await user.verifyPassword(password);
    if (!isValid) throw new Error('Invalid password');

    return user._id.toString();
  }

  /**
   * Create JWT token
   */
  createToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): { sub: string; email: string } {
    return jwt.verify(token, this.jwtSecret) as { sub: string; email: string };
  }

  /**
   * Create session for user (optional: for refresh tokens)
   */
  async createSession(userId: string, metadata: any): Promise<string> {
    // Simple implementation: return a session ID
    // In production, store sessions in database or Redis
    return `session_${userId}_${Date.now()}`;
  }
}
```

### ✓ Step 3.2: Create Auth Routes

Create file: `src/components/database/packages/api/src/routes/auth.routes.ts`

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '@notion-db/core';
import { User } from '@notion-db/core';

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(
    process.env.JWT_SECRET ?? 'dev-secret',
    process.env.JWT_EXPIRES_IN ?? '15m'
  );

  /**
   * POST /api/auth/register
   * Create new user account
   */
  app.post<{ Body: { email: string; password: string; name?: string } }>(
    '/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { email, password, name } = request.body;

        // Check if user exists
        const existing = await User.findOne({ email });
        if (existing) {
          return reply.code(400).send({ error: 'User already exists' });
        }

        // Create user
        const user = await User.create({
          email,
          password,
          name: name || 'User',
        });

        const token = authService.createToken(user._id.toString(), user.email);

        return reply.code(201).send({
          user: { id: user._id, email: user.email, name: user.name },
          accessToken: token,
        });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  app.post<{ Body: { email: string; password: string } }>(
    '/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { email, password } = request.body;

        // Authenticate
        const userId = await authService.authenticate(email, password);
        const user = await User.findById(userId);

        if (!user) throw new Error('User not found');

        // Create token
        const accessToken = authService.createToken(userId, user.email);
        const refreshToken = await authService.createSession(userId, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });

        // Update last login
        await User.findByIdAndUpdate(userId, { lastLoginAt: new Date() });

        return reply.code(200).send({
          user: { id: user._id, email: user.email, name: user.name },
          accessToken,
          refreshToken,
        });
      } catch (err) {
        return reply.code(401).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /api/auth/logout
   * Logout (protected)
   */
  app.post<{ Body: { refreshToken: string } }>(
    '/logout',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // In production, invalidate refresh token in database/Redis
      return reply.code(204).send();
    }
  );
}
```

### ✓ Step 3.3: Create Auth Hook (Middleware)

Create file: `src/components/database/packages/api/src/hooks/auth.hook.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// Extend Fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authHook;
  }
}

// Extend JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
  }
}
```

---

## Phase 4: Backend API

### ✓ Step 4.1: Set Up Fastify App

Create/update file: `src/components/database/packages/api/src/app.ts`

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { connectDatabase, syncIndexes } from '@notion-db/core';
import { authHook } from './hooks/auth.hook.js';
import { authRoutes } from './routes/auth.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
  });

  await app.register(websocket);

  // ── Auth decorator ─────────────────────────────────────────────────────────
  app.decorate('authenticate', authHook);

  // ── Connect to Database ────────────────────────────────────────────────────
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/notion_db';
  const mongoDb = process.env.MONGO_DB ?? 'notion_db';

  await connectDatabase({ uri: mongoUri, dbName: mongoDb });

  // Sync indexes
  if (process.env.SYNC_INDEXES !== 'false') {
    await syncIndexes();
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
```

### ✓ Step 4.2: Create Entry Point

Create/update file: `src/components/database/packages/api/src/index.ts`

```typescript
import 'dotenv/config';
import { buildApp } from './app.js';

async function main() {
  const PORT = Number(process.env.API_PORT ?? 4000);
  const HOST = process.env.API_HOST ?? '0.0.0.0';

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`✓ API server listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

### ✓ Step 4.3: Test API Server

```bash
# Start API server
pnpm run dev:api

# Expected output:
# ✓ [core] Connected to MongoDB: notion_db
# ✓ [core] Synced indexes for 4 models
# ✓ API server listening on 0.0.0.0:4000

# In another terminal, test endpoints
curl http://localhost:4000/health
# Expected: {"status":"ok","timestamp":"2024-..."}

# Test login (should fail with no user)
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
# Expected: {"error":"User not found"}
```

---

## Phase 5: Frontend Integration

### ✓ Step 5.1: Update API Client

Update file: `src/shared/api/client.ts`

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_RETRIES = 3;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry<T>(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);

    // Retry on 5xx
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await delay(1000 * (attempt + 1));
      return fetchWithRetry<T>(endpoint, options, attempt + 1);
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      await delay(1000 * (attempt + 1));
      return fetchWithRetry<T>(endpoint, options, attempt + 1);
    }
    throw error;
  }
}

function getHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export const apiClient = {
  async get<T>(endpoint: string): Promise<T> {
    return fetchWithRetry<T>(endpoint, {
      method: 'GET',
      headers: getHeaders(),
    });
  },

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return fetchWithRetry<T>(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
  },

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return fetchWithRetry<T>(endpoint, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
  },

  async delete(endpoint: string): Promise<void> {
    await fetchWithRetry(endpoint, {
      method: 'DELETE',
      headers: getHeaders(),
    });
  },
};
```

### ✓ Step 5.2: Update Auth Store

Update file: `src/store/useAuthStore.ts`

```typescript
import { create } from 'zustand';
import { apiClient } from '../shared/api/client';

interface AuthState {
  user: { id: string; email: string; name: string } | null;
  token: string | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  async login(email: string, password: string) {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/auth/login', {
        email,
        password,
      });

      set({
        user: response.user,
        token: response.accessToken,
        loading: false,
      });

      // Store token in localStorage for persistence
      localStorage.setItem('authToken', response.accessToken);
    } catch (error) {
      set({
        error: (error as Error).message,
        loading: false,
      });
      throw error;
    }
  },

  async logout() {
    try {
      await apiClient.post('/api/auth/logout', {});
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({ user: null, token: null });
      localStorage.removeItem('authToken');
    }
  },

  async register(email: string, password: string, name: string) {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/auth/register', {
        email,
        password,
        name,
      });

      set({
        user: response.user,
        token: response.accessToken,
        loading: false,
      });

      localStorage.setItem('authToken', response.accessToken);
    } catch (error) {
      set({
        error: (error as Error).message,
        loading: false,
      });
      throw error;
    }
  },
}));
```

### ✓ Step 5.3: Update Database Store

Update file: `src/store/useDatabaseStore.ts`

```typescript
import { create } from 'zustand';
import { apiClient } from '../shared/api/client';

interface Page {
  id: string;
  title: string;
  icon: string;
  blocks: Block[];
}

interface Block {
  id: string;
  type: string;
  content: string;
}

interface DatabaseState {
  pages: Page[];
  loading: boolean;
  error: string | null;

  fetchPages: (workspaceId: string) => Promise<void>;
  createPage: (workspaceId: string, data: any) => Promise<Page>;
  updatePage: (pageId: string, data: any) => Promise<Page>;
  deletePage: (pageId: string) => Promise<void>;
}

export const useDatabaseStore = create<DatabaseState>((set) => ({
  pages: [],
  loading: false,
  error: null,

  async fetchPages(workspaceId: string) {
    set({ loading: true });
    try {
      const pages = await apiClient.get<Page[]>(
        `/api/pages?workspaceId=${workspaceId}`
      );
      set({ pages, error: null, loading: false });
    } catch (error) {
      set({
        error: (error as Error).message,
        loading: false,
      });
    }
  },

  async createPage(workspaceId: string, data: any) {
    try {
      const page = await apiClient.post<Page>('/api/pages', {
        workspaceId,
        ...data,
      });
      set((state) => ({
        pages: [...state.pages, page],
      }));
      return page;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  async updatePage(pageId: string, data: any) {
    try {
      const updated = await apiClient.patch<Page>(
        `/api/pages/${pageId}`,
        data
      );
      set((state) => ({
        pages: state.pages.map((p) => (p.id === pageId ? updated : p)),
      }));
      return updated;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  async deletePage(pageId: string) {
    try {
      await apiClient.delete(`/api/pages/${pageId}`);
      set((state) => ({
        pages: state.pages.filter((p) => p.id !== pageId),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },
}));
```

---

## Phase 6: Testing & Validation

### ✓ Step 6.1: Manual Testing with cURL

```bash
# Start both frontend and API
pnpm run dev

# In new terminal:

# 1. Test API health
curl http://localhost:4000/health

# 2. Register new user
USER_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }')

echo "Register response:"
echo $USER_RESPONSE | jq

# Extract token
TOKEN=$(echo $USER_RESPONSE | jq -r '.accessToken')
echo "Token: $TOKEN"

# 3. Login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq

# 4. Create workspace
WORKSPACE=$(curl -s -X POST http://localhost:4000/api/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Workspace"}')

echo $WORKSPACE | jq
WORKSPACE_ID=$(echo $WORKSPACE | jq -r '.id')

# 5. Create page
PAGE=$(curl -s -X POST http://localhost:4000/api/pages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"title\":\"Home\"}")

echo $PAGE | jq

# 6. List pages
curl -s -X GET "http://localhost:4000/api/pages?workspaceId=$WORKSPACE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### ✓ Step 6.2: Frontend Testing

1. **Login Page**:
   - Fill email/password
   - Click "Login"
   - Verify: Token stored in Zustand + localStorage
   - Verify: User info displayed

2. **Pages List**:
   - Create new page
   - Verify: Page appears in list
   - Verify: Title/icon display correctly

3. **Page Editor**:
   - Edit page title
   - Verify: Changes persist in MongoDB
   - Refresh page
   - Verify: Changes still there

4. **Data Persistence**:
   - Create page
   - Stop API server
   - Restart API server
   - Verify: Pages still there

### ✓ Step 6.3: Database Verification

```bash
# Connect to MongoDB
mongosh -u notion_user -p "notion_pass" mongodb://localhost:27017/notion_db

# List users
db.users.find()

# List workspaces
db.workspaces.find()

# List pages
db.pages.find()

# Count documents
db.users.countDocuments()
```

---

## Phase 7: Migration & Deployment

### ✓ Step 7.1: Data Migration (if needed)

If migrating from offline seed data to persistent database:

```typescript
// scripts/migrate-seed-data.ts
import { User, Workspace, Page, Block } from '@notion-db/core';
import seedUsers from '../src/data/seedUsers.json';
import seedPages from '../src/data/seedPages';

async function migrateData() {
  // Create seed users
  for (const seedUser of seedUsers) {
    const existing = await User.findOne({ email: seedUser.email });
    if (!existing) {
      await User.create({
        email: seedUser.email,
        password: seedUser.password,
        name: seedUser.name,
      });
    }
  }

  // Create seed pages (if available)
  // ... similar pattern

  console.log('✓ Migration complete');
}

migrateData().catch(console.error);
```

### ✓ Step 7.2: Prepare for Production

**Environment Variables**:

```bash
# .env.production
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4000
JWT_SECRET=use-strong-random-key-from-env-secret
JWT_EXPIRES_IN=1h

MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/notion_db
MONGO_DB=notion_db

VITE_API_URL=https://api.example.com
```

**Database Backup**:

```bash
# Backup MongoDB
mongodump -u notion_user -p "notion_pass" \
  -h localhost:27017 \
  -d notion_db \
  -o ./backups/$(date +%Y%m%d)

# Restore from backup
mongorestore -u notion_user -p "notion_pass" \
  -h localhost:27017 \
  ./backups/20240115
```

### ✓ Step 7.3: Verification Checklist

Before deploying to production:

- [ ] All environment variables set correctly
- [ ] JWT_SECRET changed from default
- [ ] Database backups in place
- [ ] API responds to health check
- [ ] All tests pass: `pnpm test`
- [ ] No TypeScript errors: `pnpm typecheck`
- [ ] No linting errors: `pnpm lint`
- [ ] Frontend connects to API
- [ ] Data persists after API restart
- [ ] Auth tokens expire correctly
- [ ] CORS configured for frontend domain
- [ ] Database indexes created
- [ ] Logging configured appropriately

---

## Troubleshooting

### API Won't Start

```bash
# Check MongoDB connection
pnpm run db:ping

# Check environment variables
env | grep MONGO

# Check port is not in use
lsof -i :4000

# View API logs
docker logs playground_mongodb
```

### 401 Unauthorized Errors

```bash
# Verify JWT_SECRET matches between components
grep JWT_SECRET .env

# Check token expiration
node -e "console.log(require('jsonwebtoken').decode('your-token'))"

# Regenerate test token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### CORS Errors

```typescript
// In app.ts, ensure CORS is properly configured
await app.register(cors, {
  origin: true,  // Accept all origins (restrict in production)
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

### Data Not Persisting

```bash
# Verify MongoDB is storing data
mongosh
> use notion_db
> db.pages.find().pretty()

# Check database connectivity in API logs
tail -f .logs/api.log | grep -i "mongodb"
```

---

## References

- [DATABASE-SETUP.md](./DATABASE-SETUP.md) — Detailed connection configuration
- [API-INTEGRATION-GUIDE.md](./API-INTEGRATION-GUIDE.md) — API endpoints and auth flow
- [DATA-MODELS.md](./DATA-MODELS.md) — Schema definitions and CRUD patterns
- [Fastify Documentation](https://www.fastify.io/)
- [Mongoose Documentation](https://mongoosejs.com/)
