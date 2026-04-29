# API Integration Guide

Complete reference for integrating the osionos frontend with the persistent backend API.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Patterns](#requestresponse-patterns)
5. [Error Handling](#error-handling)
6. [WebSocket Integration](#websocket-integration)
7. [Frontend Integration](#frontend-integration)
8. [Testing](#testing)

---

## Architecture Overview

### High-Level Data Flow

```
Frontend (React + Zustand)
    ↓
HTTP/WebSocket
    ↓
Fastify API Server
    ↓
Mongoose + MongoDB
    ↓
Data Persistence
```

### API Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Server** | Fastify 4.x | HTTP/WebSocket server |
| **ORM** | Mongoose | MongoDB schema & validation |
| **Auth** | @fastify/jwt | JWT token validation |
| **CORS** | @fastify/cors | Cross-origin requests |
| **WebSocket** | @fastify/websocket | Real-time updates |

### Route Structure

```
/api
├── /auth              # Authentication (login, logout, refresh)
├── /workspaces        # Workspace CRUD
├── /pages             # Page hierarchy & content
├── /blocks            # Block content (text, images, etc.)
├── /views             # Database views & filters
└── /ws                # WebSocket for real-time updates
```

---

## Authentication Flow

### Login & Token Generation

```
Client                              API
  │                                 │
  ├─ POST /api/auth/login ─────────>│
  │  { email, password }            │
  │                                 │
  │<─ 200 OK ────────────────────────┤
  │ {                                │
  │   accessToken,                   │
  │   refreshToken,                  │
  │   user: { id, email }            │
  │ }                                │
  │                                 │
  └─ Store tokens in Zustand ──────>│
```

**Example Request**:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure-password"
  }'
```

**Response**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "session-id-uuid",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com"
  }
}
```

### Protected Requests with Bearer Token

```
Client                                API
  │                                   │
  ├─ GET /api/pages ─────────────────>│
  │  Authorization: Bearer <token>    │
  │                                   │
  │<─ 200 OK ──────────────────────────┤
  │ [ { id, title, ... }, ... ]        │
  │                                   │
  │                                   │ JWT Verification
  │                                   │ ✓ Token valid?
  │                                   │ ✓ Not expired?
  │                                   │ ✓ User exists?
```

**Implementation in Frontend**:

```typescript
// src/shared/api/client.ts
export function getHeaders(): HeadersInit {
  const token = useAuthStore((s) => s.token);
  
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  
  if (response.status === 401) {
    // Token expired — refresh
    await refreshToken();
    return get<T>(endpoint);  // Retry
  }
  
  return response.json();
}
```

### Token Refresh

```
Client                              API
  │                                 │
  │ [Token approaching expiry]      │
  │                                 │
  ├─ POST /api/auth/refresh ──────>│
  │  { refreshToken }               │
  │                                 │
  │<─ 200 OK ──────────────────────┤
  │ { accessToken }                 │
  │                                 │
  └─ Update Zustand store ────────>│
```

**Implementation**:

```typescript
async function refreshToken(): Promise<void> {
  const { refreshToken: oldToken } = useAuthStore.getState();
  
  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: oldToken }),
  });
  
  if (response.ok) {
    const { accessToken } = await response.json();
    useAuthStore.setState({ token: accessToken });
  } else {
    // Refresh failed — redirect to login
    useAuthStore.setState({ user: null, token: null });
  }
}
```

### JWT Token Structure

**Header & Payload**:

```json
{
  "header": { "alg": "HS256", "typ": "JWT" },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "iat": 1682500000,
    "exp": 1682500900
  },
  "signature": "HMACSHA256(...)"
}
```

**Decode (for debugging)**:

```typescript
const decoded = jwt_decode(token);
console.log('Expires in:', new Date(decoded.exp * 1000));
```

---

## API Endpoints

### Authentication Routes

#### POST /api/auth/login

Login with email & password.

**Request**:

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response** (200 OK):

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "session-uuid",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

**Errors**:
- `401 Unauthorized` — Invalid credentials
- `400 Bad Request` — Missing fields

---

#### POST /api/auth/refresh

Refresh access token using refresh token.

**Request**:

```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "session-uuid"
}
```

**Response** (200 OK):

```json
{
  "accessToken": "eyJhbGc..."
}
```

**Errors**:
- `401 Unauthorized` — Invalid or expired refresh token
- `400 Bad Request` — Missing refreshToken

---

#### POST /api/auth/logout

Logout and revoke session. **Protected** ✓

**Request**:

```bash
POST /api/auth/logout
Authorization: Bearer <token>
Content-Type: application/json

{
  "refreshToken": "session-uuid"
}
```

**Response** (204 No Content):

```
(empty)
```

---

### Workspace Routes

#### GET /api/workspaces

List all workspaces for current user. **Protected** ✓

**Request**:

```bash
GET /api/workspaces
Authorization: Bearer <token>
```

**Response** (200 OK):

```json
[
  {
    "id": "workspace-uuid",
    "name": "My Workspace",
    "ownerId": "user-uuid",
    "plan": "pro",
    "settings": {
      "timezone": "UTC",
      "language": "en"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

#### POST /api/workspaces

Create new workspace. **Protected** ✓

**Request**:

```bash
POST /api/workspaces
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Workspace",
  "settings": {
    "timezone": "UTC",
    "language": "en"
  }
}
```

**Response** (201 Created):

```json
{
  "id": "workspace-uuid",
  "name": "New Workspace",
  "ownerId": "user-uuid",
  "plan": "free",
  "settings": { ... },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

### Page Routes

#### GET /api/pages?workspaceId={id}

List pages in workspace. **Protected** ✓

**Request**:

```bash
GET /api/pages?workspaceId=workspace-uuid
Authorization: Bearer <token>
```

**Response** (200 OK):

```json
[
  {
    "id": "page-uuid",
    "workspaceId": "workspace-uuid",
    "parentPageId": null,
    "title": "Home Page",
    "icon": "🏠",
    "cover": "https://...",
    "properties": { "customField": "value" },
    "archived": false,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

#### POST /api/pages

Create new page. **Protected** ✓

**Request**:

```bash
POST /api/pages
Authorization: Bearer <token>
Content-Type: application/json

{
  "workspaceId": "workspace-uuid",
  "parentPageId": null,
  "title": "New Page",
  "icon": "📄",
  "properties": {}
}
```

**Response** (201 Created):

```json
{
  "id": "page-uuid",
  "workspaceId": "workspace-uuid",
  "parentPageId": null,
  "title": "New Page",
  "icon": "📄",
  "properties": {},
  "archived": false,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

#### GET /api/pages/{id}

Get single page with all blocks. **Protected** ✓

**Request**:

```bash
GET /api/pages/page-uuid
Authorization: Bearer <token>
```

**Response** (200 OK):

```json
{
  "id": "page-uuid",
  "title": "My Page",
  "blocks": [
    {
      "id": "block-uuid",
      "type": "heading",
      "order": "a0",
      "properties": { "level": 1 },
      "content": "Page Title"
    },
    {
      "id": "block-uuid-2",
      "type": "text",
      "order": "a1",
      "content": "Page content here..."
    }
  ]
}
```

---

#### PATCH /api/pages/{id}

Update page. **Protected** ✓

**Request**:

```bash
PATCH /api/pages/page-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "icon": "✨",
  "properties": { "customField": "new-value" }
}
```

**Response** (200 OK):

```json
{
  "id": "page-uuid",
  "title": "Updated Title",
  "icon": "✨",
  "properties": { "customField": "new-value" },
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

---

#### DELETE /api/pages/{id}

Soft-delete page (mark as archived). **Protected** ✓

**Request**:

```bash
DELETE /api/pages/page-uuid
Authorization: Bearer <token>
```

**Response** (204 No Content):

```
(empty)
```

---

### Block Routes

#### GET /api/blocks?pageId={id}

List blocks in page. **Protected** ✓

**Request**:

```bash
GET /api/blocks?pageId=page-uuid
Authorization: Bearer <token>
```

**Response** (200 OK):

```json
[
  {
    "id": "block-uuid",
    "pageId": "page-uuid",
    "type": "heading",
    "order": "a0",
    "properties": { "level": 1 },
    "content": "Heading Text",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": "block-uuid-2",
    "pageId": "page-uuid",
    "type": "text",
    "order": "a1",
    "content": "Body text...",
    "createdAt": "2024-01-15T10:31:00Z"
  }
]
```

---

#### POST /api/blocks

Create new block. **Protected** ✓

**Request**:

```bash
POST /api/blocks
Authorization: Bearer <token>
Content-Type: application/json

{
  "pageId": "page-uuid",
  "type": "text",
  "order": "a2",
  "content": "New block text"
}
```

**Response** (201 Created):

```json
{
  "id": "block-uuid-new",
  "pageId": "page-uuid",
  "type": "text",
  "order": "a2",
  "content": "New block text",
  "createdAt": "2024-01-15T10:32:00Z"
}
```

---

#### PATCH /api/blocks/{id}

Update block content. **Protected** ✓

**Request**:

```bash
PATCH /api/blocks/block-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated text content",
  "type": "heading",
  "properties": { "level": 2 }
}
```

**Response** (200 OK):

```json
{
  "id": "block-uuid",
  "content": "Updated text content",
  "type": "heading",
  "properties": { "level": 2 },
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

---

#### DELETE /api/blocks/{id}

Delete block. **Protected** ✓

**Request**:

```bash
DELETE /api/blocks/block-uuid
Authorization: Bearer <token>
```

**Response** (204 No Content):

```
(empty)
```

---

## Request/Response Patterns

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| **200** | OK | GET successful, updated resource |
| **201** | Created | POST created new resource |
| **204** | No Content | DELETE successful |
| **400** | Bad Request | Missing required fields |
| **401** | Unauthorized | Invalid/expired token |
| **404** | Not Found | Resource doesn't exist |
| **500** | Server Error | Database connection failed |

### Error Response Format

All errors follow this format:

```json
{
  "error": "Error message describing what went wrong",
  "code": "UNIQUE_ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Examples**:

```bash
# 401 Unauthorized
{
  "error": "Invalid token",
  "code": "AUTH_INVALID_TOKEN",
  "timestamp": "2024-01-15T10:30:00Z"
}

# 404 Not Found
{
  "error": "Page not found",
  "code": "PAGE_NOT_FOUND",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Request Headers

**Required for all requests**:

```
Content-Type: application/json
```

**Required for protected endpoints**:

```
Authorization: Bearer <accessToken>
```

**Optional**:

```
X-Idempotency-Key: unique-uuid  # For idempotent POST requests
```

### Response Headers

**All responses include**:

```
Content-Type: application/json
X-Request-Id: request-uuid       # For tracing
X-RateLimit-Limit: 100           # Requests per minute
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## Error Handling

### Retry Strategy

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;  // ms

export async function fetchWithRetry<T>(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    
    // Retry on 5xx errors or network timeouts
    if (response.status >= 500) {
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * (attempt + 1));  // Exponential backoff
        return fetchWithRetry<T>(endpoint, options, attempt + 1);
      }
    }
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
    
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      await delay(RETRY_DELAY * (attempt + 1));
      return fetchWithRetry<T>(endpoint, options, attempt + 1);
    }
    throw error;
  }
}
```

### Token Expiry Handling

```typescript
export async function apiGet<T>(endpoint: string): Promise<T> {
  const headers = getHeaders();
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    headers,
  });

  // Token expired?
  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry with new token
      return apiGet<T>(endpoint);
    } else {
      // Refresh failed — redirect to login
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    throw new ApiError(
      `API Error: ${response.status}`,
      response.status,
      await response.json()
    );
  }

  return response.json();
}
```

### Error Class

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## WebSocket Integration

### Connecting to WebSocket

```typescript
// src/services/websocket.ts
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    this.url = `${wsUrl}/ws?token=${token}`;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        resolve();
      };

      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = (event) => this.handleMessage(event.data);
      this.ws.onclose = () => this.reconnect();
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.emit('message', message);
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  }

  send(event: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }

  disconnect(): void {
    this.ws?.close();
  }

  private reconnect(): void {
    setTimeout(() => this.connect(), 3000);
  }
}
```

### WebSocket Event Types

```typescript
// Subscribe to page updates
ws.send('subscribe', { pageId: 'page-uuid' });

// Listen for block changes
ws.on('message', (msg) => {
  if (msg.event === 'page:updated') {
    console.log('Page changed:', msg.payload);
  }
});

// Update block in real-time
ws.send('block:update', {
  blockId: 'block-uuid',
  content: 'Updated content'
});
```

---

## Frontend Integration

### API Client Setup

```typescript
// src/shared/api/client.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const MAX_RETRIES = 3;

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

function getHeaders(): HeadersInit {
  const { token } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}
```

### Zustand Store Integration

```typescript
// src/store/useDatabaseStore.ts
import { create } from 'zustand';
import { apiClient } from '../shared/api/client';

interface Page {
  id: string;
  title: string;
  blocks: Block[];
}

interface Block {
  id: string;
  content: string;
  type: string;
}

export const useDatabaseStore = create<{
  pages: Page[];
  loading: boolean;
  error: string | null;
  
  fetchPages: (workspaceId: string) => Promise<void>;
  createPage: (data: unknown) => Promise<Page>;
  updatePage: (id: string, data: unknown) => Promise<Page>;
  deletePage: (id: string) => Promise<void>;
}>((set) => ({
  pages: [],
  loading: false,
  error: null,

  async fetchPages(workspaceId: string) {
    set({ loading: true });
    try {
      const pages = await apiClient.get<Page[]>(
        `/api/pages?workspaceId=${workspaceId}`
      );
      set({ pages, error: null });
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  async createPage(data: unknown) {
    const page = await apiClient.post<Page>('/api/pages', data);
    set((state) => ({ pages: [...state.pages, page] }));
    return page;
  },

  async updatePage(id: string, data: unknown) {
    const updated = await apiClient.patch<Page>(`/api/pages/${id}`, data);
    set((state) => ({
      pages: state.pages.map((p) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  async deletePage(id: string) {
    await apiClient.delete(`/api/pages/${id}`);
    set((state) => ({
      pages: state.pages.filter((p) => p.id !== id),
    }));
  },
}));
```

### Component Usage

```typescript
// src/components/PageList.tsx
import { useDatabaseStore } from '../store/useDatabaseStore';

export function PageList({ workspaceId }: { workspaceId: string }) {
  const { pages, loading, error, fetchPages } = useDatabaseStore();

  useEffect(() => {
    fetchPages(workspaceId);
  }, [workspaceId, fetchPages]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {pages.map((page) => (
        <li key={page.id}>{page.title}</li>
      ))}
    </ul>
  );
}
```

---

## Testing

### Manual Testing with cURL

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.accessToken')

echo "Token: $TOKEN"

# 2. List pages
curl -s -X GET http://localhost:4000/api/pages \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Create page
curl -s -X POST http://localhost:4000/api/pages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-uuid",
    "title": "Test Page",
    "icon": "📄"
  }' | jq
```

### Integration Testing with Jest

```typescript
// src/__tests__/api.test.ts
describe('API Integration', () => {
  let token: string;

  beforeAll(async () => {
    const response = await apiClient.post('/api/auth/login', {
      email: 'test@example.com',
      password: 'password',
    });
    token = response.accessToken;
  });

  it('should fetch pages', async () => {
    const pages = await apiClient.get('/api/pages');
    expect(Array.isArray(pages)).toBe(true);
  });

  it('should create a page', async () => {
    const page = await apiClient.post('/api/pages', {
      workspaceId: 'test-workspace',
      title: 'New Page',
    });
    expect(page.id).toBeDefined();
    expect(page.title).toBe('New Page');
  });

  it('should update a page', async () => {
    const updated = await apiClient.patch(`/api/pages/${page.id}`, {
      title: 'Updated Title',
    });
    expect(updated.title).toBe('Updated Title');
  });

  it('should delete a page', async () => {
    await apiClient.delete(`/api/pages/${page.id}`);
    const pages = await apiClient.get('/api/pages');
    expect(pages.find((p) => p.id === page.id)).toBeUndefined();
  });
});
```

---

## Common Issues & Solutions

### CORS Errors

**Problem**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**: Ensure API is configured with proper CORS headers:

```typescript
await app.register(cors, {
  origin: true,  // Accept all origins (restrict in production)
  credentials: true,
});
```

### 401 Unauthorized on Protected Routes

**Problem**: API returns `401 Unauthorized` even with valid token

**Solutions**:
1. Check token is included in `Authorization: Bearer <token>` header
2. Verify token hasn't expired: `jwt_decode(token).exp > Date.now() / 1000`
3. Check JWT_SECRET matches between frontend and API

### WebSocket Connection Refused

**Problem**: `WebSocket connection to 'ws://...' failed`

**Solutions**:
1. Ensure API is running and listening on correct port
2. Check that WebSocket route is registered: `/ws`
3. Verify firewall allows WebSocket connections

---

## References

- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [JWT.io](https://jwt.io/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
