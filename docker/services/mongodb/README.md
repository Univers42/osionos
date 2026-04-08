# MongoDB 7 — Cheatsheet

> **Image**: `mongo:7.0` · **Port**: 27017 · **Shell**: `mongosh`  
> Default creds: `notion_user` / `notion_pass` · DB: `notion_db`

---

## Table of contents

1. [How it works in this project](#how-it-works-in-this-project)
2. [Connecting](#connecting)
3. [mongosh — the interactive shell](#mongosh--the-interactive-shell)
4. [CRUD operations](#crud-operations)
5. [Querying & filtering](#querying--filtering)
6. [Indexes](#indexes)
7. [Aggregation pipeline](#aggregation-pipeline)
8. [Import / Export](#import--export)
9. [Administration](#administration)
10. [Troubleshooting](#troubleshooting)

---

## How it works in this project

MongoDB runs as a Docker container (`notion_mongodb`). On first start, the init script
at `tools/init-collections.js` creates 6 collections (tasks, contacts, content, inventory,
projects, products) with useful indexes.

Two databases are used:
- **`notion_src_db`** — for the src app (`:3000`)
- **`notion_playground_db`** — for the playground app (`:3001` + API `:4000`)

The seed data lives in `src/store/dbms/mongodb/*.seed.json` and is imported via `mongoimport`.

```
docker-compose.yml
  └─ mongodb service
       ├─ Volume: mongo_data:/data/db (persists across restarts)
       ├─ Init:   tools/init-collections.js → /docker-entrypoint-initdb.d/
       └─ Seed:   src/store/dbms/mongodb/ → /seed/ (read-only mount)
```

---

## Connecting

### From the host (via Make)

```bash
# Open an interactive mongosh session
make mongo-shell

# One-liner from anywhere
docker exec -it notion_mongodb mongosh \
  "mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin"
```

### From inside a container

```bash
# From the src-app container (uses Docker network hostnames)
mongosh "mongodb://notion_user:notion_pass@mongodb:27017/notion_db?authSource=admin"
```

### Connection string anatomy

```
mongodb://USER:PASS@HOST:PORT/DATABASE?authSource=admin
         ────  ────  ────────  ──────   ───────────────
          │     │      │         │        └─ authenticate against the admin DB
          │     │      │         └─ default database to use
          │     │      └─ hostname (localhost on host, mongodb in Docker network)
          │     └─ password
          └─ username
```

---

## mongosh — the interactive shell

mongosh is the modern MongoDB shell (replaces the old `mongo` binary).
It's a full JavaScript/Node.js REPL with autocomplete and syntax highlighting.

### Navigation

```javascript
// Show all databases
show dbs

// Switch to a database (creates it if it doesn't exist)
use notion_src_db

// Show current database
db

// Show all collections in current database
show collections

// Show database stats (size, collections, indexes)
db.stats()

// Show collection stats
db.tasks.stats()

// Show server status
db.serverStatus()

// Show current operations
db.currentOp()

// Clear the screen
cls
```

### Getting help

```javascript
// Help on a collection
db.tasks.help()

// Explain a query (shows execution plan)
db.tasks.find({ status: "done" }).explain("executionStats")

// Show collection indexes
db.tasks.getIndexes()

// Show collection validation rules
db.getCollectionInfos({ name: "tasks" })
```

---

## CRUD operations

### Create (insert)

```javascript
// Insert one document
db.tasks.insertOne({
  title: "Fix login bug",
  status: "todo",
  priority: "high",
  assignee: "alice",
  tags: ["bug", "auth"],
  created: new Date()
})

// Insert many documents
db.tasks.insertMany([
  { title: "Write tests", status: "in_progress", priority: "medium" },
  { title: "Update docs", status: "todo", priority: "low" },
  { title: "Deploy v2",   status: "todo", priority: "high" }
])
```

### Read (find)

```javascript
// Find all documents in a collection
db.tasks.find()

// Find with a filter
db.tasks.find({ status: "todo" })

// Find one specific document
db.tasks.findOne({ title: "Fix login bug" })

// Pretty-print results
db.tasks.find().pretty()

// Limit results
db.tasks.find().limit(5)

// Skip + limit (pagination)
db.tasks.find().skip(10).limit(5)

// Sort (1 = ascending, -1 = descending)
db.tasks.find().sort({ priority: 1, created: -1 })

// Count documents
db.tasks.countDocuments({ status: "todo" })

// Return only specific fields (projection)
db.tasks.find({}, { title: 1, status: 1, _id: 0 })

// Check if any document matches
db.tasks.findOne({ priority: "critical" }) !== null
```

### Update

```javascript
// Update one document (set a field)
db.tasks.updateOne(
  { title: "Fix login bug" },
  { $set: { status: "done", completed: new Date() } }
)

// Update many documents
db.tasks.updateMany(
  { status: "todo" },
  { $set: { status: "backlog" } }
)

// Increment a numeric field
db.tasks.updateOne(
  { title: "Deploy v2" },
  { $inc: { attempt_count: 1 } }
)

// Push to an array field
db.tasks.updateOne(
  { title: "Fix login bug" },
  { $push: { tags: "resolved" } }
)

// Remove a field from a document
db.tasks.updateOne(
  { title: "Fix login bug" },
  { $unset: { temporary_field: "" } }
)

// Upsert — update if exists, insert if not
db.tasks.updateOne(
  { title: "New task" },
  { $set: { status: "todo", priority: "medium" } },
  { upsert: true }
)

// Replace entire document (keeps same _id)
db.tasks.replaceOne(
  { title: "Old task" },
  { title: "New task", status: "todo", priority: "high" }
)
```

### Delete

```javascript
// Delete one document
db.tasks.deleteOne({ title: "Old task" })

// Delete many documents
db.tasks.deleteMany({ status: "archived" })

// Delete ALL documents in a collection (keeps collection + indexes)
db.tasks.deleteMany({})

// Drop an entire collection (gone forever)
db.tasks.drop()

// Drop an entire database
db.dropDatabase()
```

---

## Querying & filtering

MongoDB's query language is powerful. Here's a cheatsheet of operators.

### Comparison operators

```javascript
// Equal
db.tasks.find({ priority: "high" })

// Not equal
db.tasks.find({ priority: { $ne: "low" } })

// Greater than / less than
db.tasks.find({ attempt_count: { $gt: 3 } })
db.tasks.find({ attempt_count: { $gte: 1, $lte: 5 } })

// In a set of values
db.tasks.find({ status: { $in: ["todo", "in_progress"] } })

// Not in a set
db.tasks.find({ status: { $nin: ["done", "archived"] } })
```

### Logical operators

```javascript
// AND (implicit — just add more fields)
db.tasks.find({ status: "todo", priority: "high" })

// AND (explicit)
db.tasks.find({ $and: [{ priority: "high" }, { assignee: "alice" }] })

// OR
db.tasks.find({ $or: [{ priority: "high" }, { priority: "critical" }] })

// NOT
db.tasks.find({ priority: { $not: { $eq: "low" } } })

// NOR (none of these)
db.tasks.find({ $nor: [{ status: "done" }, { status: "archived" }] })
```

### Array operators

```javascript
// Array contains a value
db.tasks.find({ tags: "bug" })

// Array contains ALL of these values
db.tasks.find({ tags: { $all: ["bug", "auth"] } })

// Array has exactly N elements
db.tasks.find({ tags: { $size: 3 } })

// Array element matches multiple conditions
db.tasks.find({ tags: { $elemMatch: { $eq: "bug" } } })
```

### Field operators

```javascript
// Field exists
db.tasks.find({ assignee: { $exists: true } })

// Field doesn't exist
db.tasks.find({ deadline: { $exists: false } })

// Field is a specific type (string = 2, number = 1, boolean = 8)
db.tasks.find({ priority: { $type: "string" } })

// Regex match
db.tasks.find({ title: { $regex: /bug/i } })

// Regex (string syntax — for passing from app code)
db.tasks.find({ title: { $regex: "^Fix", $options: "i" } })
```

### Nested documents

```javascript
// Query nested field (dot notation)
db.contacts.find({ "address.city": "Paris" })

// Update nested field
db.contacts.updateOne(
  { name: "Alice" },
  { $set: { "address.zip": "75001" } }
)
```

---

## Indexes

Indexes make queries fast. Without them, MongoDB has to scan every document (collection scan).

```javascript
// Create a single-field index
db.tasks.createIndex({ status: 1 })

// Create a compound index (order matters!)
db.tasks.createIndex({ status: 1, priority: -1 })

// Create a unique index
db.contacts.createIndex({ email: 1 }, { unique: true })

// Create a sparse index (ignores docs missing the field)
db.contacts.createIndex({ phone: 1 }, { sparse: true })

// Create a TTL index (auto-delete after 30 days)
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })

// Create a text index (full-text search)
db.tasks.createIndex({ title: "text", description: "text" })

// Use a text index
db.tasks.find({ $text: { $search: "login bug" } })

// List all indexes on a collection
db.tasks.getIndexes()

// Drop an index by name
db.tasks.dropIndex("status_1")

// Drop all indexes (except _id)
db.tasks.dropIndexes()

// Check if a query uses an index
db.tasks.find({ status: "todo" }).explain("executionStats")
// Look for "IXSCAN" (good) vs "COLLSCAN" (bad)
```

---

## Aggregation pipeline

The aggregation framework is MongoDB's version of SQL GROUP BY + JOINs.
It processes documents through a pipeline of stages.

```javascript
// Count tasks per status
db.tasks.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])

// Average price per category
db.products.aggregate([
  { $group: {
    _id: "$category",
    avgPrice: { $avg: "$price" },
    minPrice: { $min: "$price" },
    maxPrice: { $max: "$price" },
    count: { $sum: 1 }
  }},
  { $sort: { avgPrice: -1 } }
])

// Filter → group → sort
db.tasks.aggregate([
  { $match: { status: { $ne: "archived" } } },
  { $group: { _id: "$assignee", tasks: { $sum: 1 } } },
  { $sort: { tasks: -1 } },
  { $limit: 10 }
])

// Unwind an array (one doc per tag)
db.tasks.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])

// Lookup (left join)
db.tasks.aggregate([
  { $lookup: {
    from: "contacts",
    localField: "assignee",
    foreignField: "name",
    as: "assigneeInfo"
  }},
  { $unwind: { path: "$assigneeInfo", preserveNullAndEmptyArrays: true } }
])

// Project — reshape output
db.tasks.aggregate([
  { $project: {
    title: 1,
    status: 1,
    tagCount: { $size: { $ifNull: ["$tags", []] } },
    upperTitle: { $toUpper: "$title" }
  }}
])
```

---

## Import / Export

### mongoimport / mongoexport

```bash
# Import a JSON array file into a collection (drop existing)
mongoimport --uri="mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin" \
  --collection=tasks --jsonArray --drop --file=tasks.seed.json

# Export a collection to JSON
mongoexport --uri="mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin" \
  --collection=tasks --jsonArray --out=tasks-backup.json

# Export with a query filter
mongoexport --uri="..." --collection=tasks \
  --query='{"status":"done"}' --jsonArray --out=done-tasks.json

# Import CSV
mongoimport --uri="..." --collection=products \
  --type=csv --headerline --file=products.csv
```

### mongodump / mongorestore (binary backup)

```bash
# Full database backup
mongodump --uri="mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin" \
  --out=./backup/

# Backup a single collection
mongodump --uri="..." --collection=tasks --out=./backup/

# Restore from backup
mongorestore --uri="..." --drop ./backup/

# Restore a single collection
mongorestore --uri="..." --collection=tasks --drop ./backup/notion_db/tasks.bson
```

### Using our Makefile

```bash
# Seed MongoDB for the src app
make -C src seed-mongo

# Seed MongoDB for the playground
make -C playground seed

# Verify collections have data
make -C src verify-mongo
```

---

## Administration

```javascript
// Show current connections
db.serverStatus().connections

// Show slow queries (profiling)
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().sort({ ts: -1 }).limit(5)

// Turn off profiling
db.setProfilingLevel(0)

// Compact a collection (reclaim disk space)
db.runCommand({ compact: "tasks" })

// Validate a collection (check for corruption)
db.tasks.validate()

// Show storage usage
db.tasks.stats().storageSize
db.tasks.stats().totalIndexSize

// List all users
db.getUsers()

// Create a read-only user (if needed)
db.createUser({
  user: "readonly",
  pwd: "readonly_pass",
  roles: [{ role: "read", db: "notion_db" }]
})
```

### Docker-specific

```bash
# View MongoDB container logs
docker logs -f notion_mongodb

# Restart MongoDB
docker restart notion_mongodb

# Check container health
docker inspect --format='{{.State.Health.Status}}' notion_mongodb

# Open a raw shell in the container
docker exec -it notion_mongodb bash

# Check disk usage of data volume
docker exec notion_mongodb du -sh /data/db

# Run the seed script manually
docker exec notion_mongodb /usr/local/bin/seed.sh
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `MongoServerError: Authentication failed` | Check user/password in `.env`. The auth DB is `admin` — make sure `?authSource=admin` is in the URI. |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB container not running. `docker compose --profile src up -d mongodb`. |
| `MongoServerError: ns not found` | Collection doesn't exist yet. Run `make -C src seed-mongo` to create and seed. |
| Collections exist but are empty | Seed data wasn't imported. Run `make -C src seed-mongo` or `make -C playground seed`. |
| Slow queries | Add an index. Use `.explain("executionStats")` to check for `COLLSCAN`. |
| Disk full | `docker system prune -a --volumes` to nuke everything, or `db.runCommand({compact: "collection"})`. |
| Can't connect from host | Port 27017 must be exposed. Check `docker compose ps` for port mapping. |
| Data gone after `make build` | Expected — `make build` wipes volumes for a clean seed. Use `make dev` for persistence. |

---

*Last updated: April 2026*
