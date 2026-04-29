# Data Models & Persistence Reference

Complete reference for all data models, schemas, relationships, and persistence patterns in osionos.

## Table of Contents

1. [Data Model Overview](#data-model-overview)
2. [User Model](#user-model)
3. [Workspace Model](#workspace-model)
4. [Page Model](#page-model)
5. [Block Model](#block-model)
6. [Relationships & Hierarchies](#relationships--hierarchies)
7. [CRUD Operations](#crud-operations)
8. [Query Patterns](#query-patterns)
9. [Transactions & Consistency](#transactions--consistency)
10. [Indexing Strategy](#indexing-strategy)

---

## Data Model Overview

### Entity Relationship Diagram

```
User
  ├─ owns many: Workspace
  └─ has many: Session

Workspace
  ├─ belongs to: User
  └─ contains many: Page

Page
  ├─ belongs to: Workspace
  ├─ may have: parent Page
  └─ contains many: Block

Block
  ├─ belongs to: Page
  └─ may have: parent Block
```

### Core Models

| Model | Purpose | Key Fields | Lifecycle |
|-------|---------|-----------|-----------|
| **User** | Authentication & authorization | email, password, preferences | Created at signup, soft-deleted |
| **Workspace** | Project/database grouping | name, plan, settings, domain | Created by user, archived when deleted |
| **Page** | Hierarchical content container | title, icon, properties, parent | Created by user, sorted by updated |
| **Block** | Granular content units | type, content, properties, order | Created by page user, lexicographic sort |

---

## User Model

### Mongoose Schema

```typescript
// src/models/User.ts
import { Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';

const UserSchema = new Schema({
  _id: { 
    type: String, 
    default: () => generateId('user') 
  },
  
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    match: /.+@.+\..+/,
    index: true,
  },
  
  password: { 
    type: String, 
    required: true,
    minlength: 8,
    // Never select by default
    select: false,
  },
  
  name: {
    type: String,
    default: '',
  },
  
  avatar: {
    type: String,
    default: null,
  },
  
  preferences: {
    theme: { 
      type: String, 
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    language: { 
      type: String, 
      default: 'en',
    },
    notifications: { 
      type: Boolean, 
      default: true,
    },
  },
  
  lastLoginAt: {
    type: Date,
    default: null,
  },
  
  archived: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1,
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now,
  },
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to verify password
UserSchema.methods.verifyPassword = async function (password: string) {
  return bcrypt.compare(password, this.password);
};

export const User = model('User', UserSchema);
```

### User CRUD Examples

```typescript
// Create user
const user = await User.create({
  email: 'alice@example.com',
  password: 'secure-password-123',  // Will be hashed by pre-save hook
  name: 'Alice',
});

// Read user
const user = await User.findById(userId).lean();

// Read with password (for login)
const user = await User.findOne({ email }).select('+password');
const isValid = await user.verifyPassword(password);

// Update user
const updated = await User.findByIdAndUpdate(
  userId,
  { 
    $set: { 
      lastLoginAt: new Date(),
      'preferences.theme': 'dark',
    } 
  },
  { new: true }
).lean();

// Soft delete
await User.findByIdAndUpdate(userId, { archived: true });

// List active users
const users = await User.find({ archived: { $ne: true } }).lean();
```

---

## Workspace Model

### Mongoose Schema

```typescript
// src/models/Workspace.ts
import { Schema, model } from 'mongoose';

const WorkspaceSchema = new Schema({
  _id: { 
    type: String, 
    default: () => generateId('workspace') 
  },
  
  name: { 
    type: String, 
    required: true,
    minlength: 1,
    maxlength: 255,
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
    timezone: { 
      type: String, 
      default: 'UTC',
    },
    language: { 
      type: String, 
      default: 'en',
    },
    publicSharingEnabled: { 
      type: Boolean, 
      default: false,
    },
  },
  
  domain: {
    type: String,
    default: null,
    sparse: true,  // Allow multiple null values
    unique: true,
  },
  
  archived: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1,
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now,
  },
});

// Compound index for common queries
WorkspaceSchema.index({ ownerId: 1, archived: 1 });

export const Workspace = model('Workspace', WorkspaceSchema);
```

### Workspace CRUD Examples

```typescript
// Create workspace
const workspace = await Workspace.create({
  name: 'My Workspace',
  ownerId: userId,
  plan: 'pro',
  settings: {
    timezone: 'America/Los_Angeles',
    language: 'en',
  },
});

// List user's workspaces
const workspaces = await Workspace.find({
  ownerId: userId,
  archived: { $ne: true },
}).lean();

// Update workspace settings
const updated = await Workspace.findByIdAndUpdate(
  workspaceId,
  {
    $set: {
      name: 'New Name',
      'settings.timezone': 'UTC',
    }
  },
  { new: true }
).lean();

// Upgrade plan
await Workspace.findByIdAndUpdate(workspaceId, { plan: 'enterprise' });

// Archive workspace
await Workspace.findByIdAndUpdate(workspaceId, { archived: true });
```

---

## Page Model

### Mongoose Schema

```typescript
// src/models/Page.ts
import { Schema, model } from 'mongoose';

const PageSchema = new Schema({
  _id: { 
    type: String, 
    default: () => generateId('page') 
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
    maxlength: 1000,
  },
  
  icon: {
    type: String,
    default: '📄',  // Emoji
    maxlength: 2,
  },
  
  cover: {
    type: String,  // URL to cover image
    default: null,
  },
  
  properties: {
    type: Schema.Types.Mixed,  // Arbitrary JSON object
    default: {},
  },
  
  archived: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1,
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now,
    index: -1,
  },
});

// Indexes for common queries
PageSchema.index({ workspaceId: 1, archived: 1 });
PageSchema.index({ workspaceId: 1, parentPageId: 1 });  // For hierarchy
PageSchema.index({ workspaceId: 1, updatedAt: -1 });   // For sorting

export const Page = model('Page', PageSchema);
```

### Page Hierarchy

Pages form a tree structure via `parentPageId`:

```
Workspace
  └─ Page (parentPageId: null)    — Top-level page
      ├─ Page (parentPageId: A)   — Nested under A
      │   └─ Page (parentPageId: B) — Nested under B
      └─ Page (parentPageId: A)   — Another nested under A
```

**Query all pages in hierarchy**:

```typescript
async function getPageHierarchy(workspaceId: string) {
  // Get all pages in workspace
  const pages = await Page.find({
    workspaceId,
    archived: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .lean();

  // Build tree structure
  const map = new Map(pages.map((p) => [p._id, { ...p, children: [] }]));
  const roots = [];

  for (const page of Array.from(map.values())) {
    if (page.parentPageId && map.has(page.parentPageId)) {
      map.get(page.parentPageId)!.children.push(page);
    } else {
      roots.push(page);
    }
  }

  return roots;
}
```

### Page CRUD Examples

```typescript
// Create page
const page = await Page.create({
  workspaceId,
  parentPageId: null,  // Top-level
  title: 'Welcome',
  icon: '🏠',
  properties: {
    customField1: 'value',
  },
});

// Get page with all blocks
const page = await Page.findById(pageId).lean();
const blocks = await Block.find({ pageId })
  .sort({ order: 1 })
  .lean();

// Update page
await Page.findByIdAndUpdate(pageId, {
  $set: {
    title: 'New Title',
    icon: '✨',
    'properties.customField': 'new-value',
  }
});

// Move page (change parent)
await Page.findByIdAndUpdate(pageId, {
  parentPageId: newParentId,
});

// Archive page
await Page.findByIdAndUpdate(pageId, { archived: true });

// Get all pages at root level
const rootPages = await Page.find({
  workspaceId,
  parentPageId: null,
  archived: { $ne: true },
}).lean();

// Get direct children of a page
const children = await Page.find({
  parentPageId: pageId,
  archived: { $ne: true },
}).lean();
```

---

## Block Model

### Mongoose Schema

```typescript
// src/models/Block.ts
import { Schema, model } from 'mongoose';

const BlockSchema = new Schema({
  _id: { 
    type: String, 
    default: () => generateId('block') 
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
    index: true,
  },
  
  type: { 
    type: String,
    required: true,
    enum: [
      'heading',    // Heading 1, 2, 3
      'text',       // Paragraph text
      'bulleted',   // Bullet list item
      'numbered',   // Numbered list item
      'image',      // Image block
      'code',       // Code block
      'quote',      // Block quote
      'divider',    // Horizontal divider
      'database',   // Database/table
      'callout',    // Info/warning callout
    ],
    index: true,
  },
  
  // Lexicographic ordering for efficient reordering
  // Example: 'a0', 'a1', 'a2', ..., 'a9', 'b0', 'b1', ...
  // Insert between 'a0' and 'a1' by creating 'a0a'
  order: { 
    type: String, 
    required: true,
    index: true,
  },
  
  properties: {
    type: Schema.Types.Mixed,  // Type-specific properties
    default: {},
    // Examples:
    // heading: { level: 1 }
    // code: { language: 'javascript' }
    // callout: { type: 'info' | 'warning' | 'success' | 'error' }
  },
  
  content: {
    type: String,
    default: '',
  },
  
  archived: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now,
  },
});

// Indexes for common queries
BlockSchema.index({ pageId: 1, order: 1 });  // Sort blocks on page
BlockSchema.index({ pageId: 1, archived: 1 });

export const Block = model('Block', BlockSchema);
```

### Block Ordering (Lexicographic)

Blocks use lexicographic (alphabetic) ordering for efficient insertion:

```
0. Block A (order: 'a0')
1. Block B (order: 'a1')
2. Block C (order: 'a2')    ← Insert here

Result: Insert new block with order: 'a1a' (between 'a1' and 'a2')

0. Block A (order: 'a0')
1. Block B (order: 'a1')
N. Block N (order: 'a1a')   ← New block
2. Block C (order: 'a2')
```

**Calculate new order between two blocks**:

```typescript
function getOrderBetween(
  prevOrder: string | null,
  nextOrder: string | null
): string {
  if (prevOrder === null && nextOrder === null) {
    return 'a0';  // First block
  }
  if (prevOrder === null) {
    return nextOrder!.charCodeAt(0) - 1 + '0';  // Insert before first
  }
  if (nextOrder === null) {
    return prevOrder + 'a';  // Append after last
  }

  // Insert between: add character to previous order
  if (prevOrder[prevOrder.length - 1] !== 'z') {
    return prevOrder + 'a';
  }

  // Fallback: add numeric suffix
  return prevOrder + Math.random().toString(36).substring(2, 8);
}
```

### Block CRUD Examples

```typescript
// Create block at end of page
const lastBlock = await Block.findOne({ pageId })
  .sort({ order: -1 })
  .lean();

const newBlock = await Block.create({
  pageId,
  type: 'text',
  order: getOrderBetween(lastBlock?.order || null, null),
  content: 'New paragraph',
});

// Get all blocks on page (sorted)
const blocks = await Block.find({ pageId, archived: { $ne: true } })
  .sort({ order: 1 })
  .lean();

// Update block content
await Block.findByIdAndUpdate(blockId, {
  $set: {
    content: 'Updated text',
    type: 'heading',
    'properties.level': 2,
  }
});

// Move block (change order)
const blockBefore = await Block.findById(moveBeforeBlockId).lean();
const newOrder = getOrderBetween(blockBefore?.order || null, null);

await Block.findByIdAndUpdate(blockId, { order: newOrder });

// Delete block
await Block.findByIdAndUpdate(blockId, { archived: true });

// Get nested blocks (children)
const children = await Block.find({
  parentBlockId: blockId,
  archived: { $ne: true },
}).lean();
```

---

## Relationships & Hierarchies

### Page Hierarchy

```typescript
// Get full page tree
async function getPageTree(workspaceId: string): Promise<PageNode[]> {
  const pages = await Page.find({
    workspaceId,
    archived: { $ne: true },
  }).lean();

  const map = new Map<string, PageNode>(
    pages.map((p) => [p._id, { ...p, children: [] }])
  );

  const roots: PageNode[] = [];
  for (const page of Array.from(map.values())) {
    if (page.parentPageId) {
      const parent = map.get(page.parentPageId);
      if (parent) parent.children.push(page);
    } else {
      roots.push(page);
    }
  }

  return roots;
}
```

### Block Nesting

```typescript
// Get block with all children recursively
async function getBlockTree(blockId: string): Promise<BlockNode> {
  const block = await Block.findById(blockId).lean();
  if (!block) throw new Error('Block not found');

  const children = await Block.find({
    parentBlockId: blockId,
    archived: { $ne: true },
  }).lean();

  return {
    ...block,
    children: await Promise.all(
      children.map((child) => getBlockTree(child._id))
    ),
  };
}
```

### Cross-Reference Queries

```typescript
// Get all blocks in a page and its child pages
async function getBlocksInPageTree(pageId: string): Promise<Block[]> {
  // Get page and all child pages
  const pages = await getChildPages(pageId);
  const pageIds = [pageId, ...pages.map((p) => p._id)];

  // Get all blocks in these pages
  return Block.find({ pageId: { $in: pageIds } })
    .sort({ order: 1 })
    .lean();
}

async function getChildPages(
  pageId: string,
  allPages: Page[] = []
): Promise<Page[]> {
  const children = await Page.find({ parentPageId: pageId }).lean();
  
  for (const child of children) {
    allPages.push(child);
    await getChildPages(child._id, allPages);
  }

  return allPages;
}
```

---

## CRUD Operations

### Create

```typescript
// Single document
const page = await Page.create({
  workspaceId,
  title: 'New Page',
});

// Bulk insert (many blocks)
const blocks = await Block.insertMany([
  { pageId, type: 'heading', order: 'a0', content: 'Title' },
  { pageId, type: 'text', order: 'a1', content: 'Body' },
  { pageId, type: 'text', order: 'a2', content: 'Footer' },
]);

// With partial fields
const page = await Page.create({
  workspaceId,
  parentPageId: parentId,
  // title defaults to 'Untitled'
  // archived defaults to false
});
```

### Read

```typescript
// Single by ID
const page = await Page.findById(pageId).lean();

// Single by query
const user = await User.findOne({ email: 'alice@example.com' }).lean();

// Multiple with filter
const pages = await Page.find({
  workspaceId,
  archived: { $ne: true },
}).lean();

// With pagination
const pages = await Page.find({ workspaceId })
  .lean()
  .limit(50)
  .skip(50 * pageNumber)
  .sort({ updatedAt: -1 });

// With projection (select specific fields)
const pages = await Page.find({ workspaceId })
  .select('_id title icon')
  .lean();

// With populate (join)
const page = await Page.findById(pageId)
  .populate('workspaceId')  // Replace ID with full doc
  .lean();
```

### Update

```typescript
// Single field
await Page.findByIdAndUpdate(pageId, { title: 'New Title' });

// Multiple fields
await Page.findByIdAndUpdate(pageId, {
  title: 'New Title',
  icon: '✨',
});

// Nested field (dot notation)
await Page.findByIdAndUpdate(pageId, {
  $set: { 'properties.customField': 'value' }
});

// Increment a number
await Workspace.findByIdAndUpdate(workspaceId, {
  $inc: { pageCount: 1 }
});

// Return updated document
const updated = await Page.findByIdAndUpdate(
  pageId,
  { title: 'New Title' },
  { new: true }  // Return updated doc
).lean();

// Update many documents
await Block.updateMany(
  { pageId },
  { $set: { archived: true } }
);
```

### Delete

```typescript
// Soft delete (mark archived)
await Page.findByIdAndUpdate(pageId, { archived: true });

// Soft delete many
await Block.updateMany({ pageId }, { archived: true });

// Hard delete (not recommended — data loss)
await Page.findByIdAndRemove(pageId);
```

---

## Query Patterns

### Sorting

```typescript
// Oldest first
const blocks = await Block.find({ pageId })
  .sort({ createdAt: 1 });

// Newest first
const pages = await Page.find({ workspaceId })
  .sort({ updatedAt: -1 });

// By multiple fields
const blocks = await Block.find({ pageId })
  .sort({ archived: 1, order: 1 });  // Active first, then by order
```

### Filtering

```typescript
// Simple equality
const pages = await Page.find({ workspaceId, parentPageId: null });

// Not equal
const active = await User.find({ archived: { $ne: true } });

// In array
const pages = await Page.find({ _id: { $in: pageIds } });

// Range
const recent = await Page.find({
  createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
});

// Text search (requires text index)
const results = await Page.find({ $text: { $search: 'hello world' } });

// Regex
const users = await User.find({ email: { $regex: /@example\.com$/ } });
```

### Aggregation

```typescript
// Count documents
const count = await Page.countDocuments({ workspaceId });

// Group by type
const blocksByType = await Block.aggregate([
  { $match: { pageId } },
  { $group: { _id: '$type', count: { $sum: 1 } } },
]);

// Get statistics
const stats = await Page.aggregate([
  { $match: { workspaceId } },
  {
    $group: {
      _id: null,
      totalPages: { $sum: 1 },
      avgTitleLength: { $avg: { $strLenCP: '$title' } },
    }
  }
]);
```

---

## Transactions & Consistency

### Single Document Atomicity

By default, Mongoose/MongoDB provides **atomic updates for single documents**:

```typescript
// ✅ Atomic: All fields updated together
await Page.findByIdAndUpdate(pageId, {
  $set: {
    title: 'New Title',
    updatedAt: new Date(),
    'properties.field': 'value',
  }
});
```

### Multi-Document Transactions

⚠️ **Current limitation**: osionos does NOT use multi-document transactions.

For operations that must be consistent across multiple documents (MongoDB 4.0+):

```typescript
// ❌ NOT atomic: Could fail between operations
await Page.create({ workspaceId, title: 'Page' });
await Block.create({ pageId: createdPage._id, type: 'text' });

// ✅ Use session-based transaction
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    const [page] = await Page.create([{
      workspaceId,
      title: 'Page'
    }], { session });

    await Block.create([{
      pageId: page._id,
      type: 'text'
    }], { session });
  });
} catch (error) {
  console.error('Transaction failed:', error);
  throw error;
} finally {
  await session.endSession();
}
```

### Optimistic Concurrency

For handling concurrent updates, use versioning:

```typescript
// Add version field to schema
const PageSchema = new Schema({
  // ... fields
  version: { type: Number, default: 0 },
});

// Update only if version hasn't changed
async function updatePageSafe(pageId: string, currentVersion: number, updates: any) {
  const result = await Page.findOneAndUpdate(
    {
      _id: pageId,
      version: currentVersion,  // Check version
    },
    {
      $set: updates,
      $inc: { version: 1 },  // Increment version
    },
    { new: true }
  );

  if (!result) {
    throw new Error('Document was modified by another process (conflict)');
  }

  return result;
}
```

---

## Indexing Strategy

### Indexes by Model

**User**:

```typescript
// Email lookup (auth)
UserSchema.index({ email: 1 }, { unique: true });

// List active users
UserSchema.index({ archived: 1, createdAt: -1 });
```

**Workspace**:

```typescript
// User's workspaces
WorkspaceSchema.index({ ownerId: 1, archived: 1 });

// Custom domain lookup
WorkspaceSchema.index({ domain: 1 }, { sparse: true, unique: true });
```

**Page**:

```typescript
// Pages in workspace
PageSchema.index({ workspaceId: 1, archived: 1 });

// Page hierarchy
PageSchema.index({ workspaceId: 1, parentPageId: 1 });

// Sorting by updated
PageSchema.index({ workspaceId: 1, updatedAt: -1 });
```

**Block**:

```typescript
// Blocks on page (sorted)
BlockSchema.index({ pageId: 1, order: 1 });

// Active blocks
BlockSchema.index({ pageId: 1, archived: 1 });

// Block type queries
BlockSchema.index({ pageId: 1, type: 1 });
```

### Creating Indexes

**Automatic** (on app startup):

```typescript
// Syncs all indexes from schemas to database
await syncIndexes();
```

**Manual** (for existing data):

```bash
# Connect to MongoDB directly
mongosh mongodb://user:pass@localhost:27017/notion_db

# View indexes
db.pages.getIndexes()

# Create new index
db.pages.createIndex({ "workspaceId": 1, "archived": 1 })

# Delete index
db.pages.dropIndex("workspaceId_1_archived_1")
```

### Index Performance

**Monitor queries**:

```typescript
// Enable query profiling
db.setProfilingLevel(1, { slowms: 100 });  // Log queries slower than 100ms

// View profiling data
db.system.profile.find().sort({ ts: -1 }).limit(5)
```

**Explain query execution**:

```typescript
const explanation = await Page.find({ workspaceId })
  .explain('executionStats');

console.log(explanation.executionStats);
```

---

## Data Validation

### Schema Validation

Mongoose provides built-in validation:

```typescript
const PageSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    minlength: [1, 'Title cannot be empty'],
    maxlength: [1000, 'Title is too long'],
  },
  
  icon: {
    type: String,
    validate: [
      (v) => /^[\p{Emoji}]{1,2}$/u.test(v),
      'Icon must be 1-2 emoji'
    ],
  },
});
```

### Custom Validation

```typescript
// Validate page belongs to workspace
async function validatePageBelongsToWorkspace(
  pageId: string,
  workspaceId: string
) {
  const page = await Page.findOne({
    _id: pageId,
    workspaceId,
  });

  if (!page) {
    throw new Error('Page does not belong to workspace');
  }

  return page;
}
```

---

## Data Integrity

### Cascade Operations

⚠️ **Not automatically enforced** — implement in code:

```typescript
// When workspace is archived, archive all pages
async function archiveWorkspace(workspaceId: string) {
  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { archived: true }
  );

  // Archive all pages in workspace
  await Page.updateMany(
    { workspaceId },
    { archived: true }
  );

  // Archive all blocks in those pages
  const pages = await Page.find({ workspaceId });
  const pageIds = pages.map((p) => p._id);
  await Block.updateMany(
    { pageId: { $in: pageIds } },
    { archived: true }
  );
}
```

### Referential Integrity

```typescript
// Ensure referenced document exists
async function createBlock(data: CreateBlockInput) {
  // Verify page exists
  const page = await Page.findById(data.pageId);
  if (!page) throw new Error('Page not found');

  // Verify parent block exists (if provided)
  if (data.parentBlockId) {
    const parentBlock = await Block.findById(data.parentBlockId);
    if (!parentBlock) throw new Error('Parent block not found');
  }

  return Block.create(data);
}
```

---

## References

- [Mongoose Documentation](https://mongoosejs.com/)
- [MongoDB Query Language](https://docs.mongodb.com/manual/reference/operator/)
- [Data Modeling Best Practices](https://docs.mongodb.com/manual/core/data-model-design/)
- [Transactions in MongoDB](https://docs.mongodb.com/manual/core/transactions/)
