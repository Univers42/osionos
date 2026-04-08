# Redis 7 — Cheatsheet

> **Image**: `redis:7-alpine` · **Port**: 6379 · **Shell**: `redis-cli`  
> No authentication (dev mode) · `protected-mode no`

---

## Table of contents

1. [How it works in this project](#how-it-works-in-this-project)
2. [Connecting](#connecting)
3. [redis-cli — the interactive shell](#redis-cli--the-interactive-shell)
4. [Data types](#data-types)
5. [Strings](#strings)
6. [Hashes](#hashes)
7. [Lists](#lists)
8. [Sets](#sets)
9. [Sorted sets](#sorted-sets)
10. [Keys & expiration](#keys--expiration)
11. [Pub/Sub](#pubsub)
12. [Transactions](#transactions)
13. [Scripting with Lua](#scripting-with-lua)
14. [Administration](#administration)
15. [Troubleshooting](#troubleshooting)

---

## How it works in this project

Redis runs as a Docker container (`notion_redis`) in both `src` and `playground` profiles.
It's configured as a **pure in-memory cache** — no persistence, no AOF, no RDB snapshots.
When the container stops, all data is gone. That's fine for dev — we use it for caching
and ephemeral state, not as a database.

Config highlights (`conf/redis.conf`):
- **128 MB** max memory with **LRU eviction** (`allkeys-lru`)
- No persistence (`save ""`, `appendonly no`)
- No password (`protected-mode no`)
- 5-minute idle timeout

```
docker-compose.yml
  └─ redis service
       ├─ Volume:  redis_data:/data (mostly unused since no persistence)
       ├─ Config:  conf/redis.conf → /usr/local/etc/redis/redis.conf
       └─ Health:  redis-cli ping → PONG
```

---

## Connecting

### From the host (via Make)

```bash
# Open an interactive redis-cli session
make redis-cli
```

### Direct connection

```bash
# From host
redis-cli -h localhost -p 6379

# From inside a Docker container (using Docker network)
redis-cli -h redis -p 6379

# Shorthand (localhost:6379 is the default)
redis-cli
```

### One-liner

```bash
# Run a single command
docker exec notion_redis redis-cli PING
# → PONG

# Run multiple commands
docker exec notion_redis redis-cli <<'EOF'
SET greeting "hello"
GET greeting
DEL greeting
EOF
```

---

## redis-cli — the interactive shell

redis-cli is beautifully simple. Type a command, get a result. No semicolons, no SQL.

### Navigation & info

```bash
# Ping the server (health check)
PING
# → PONG

# Server info (everything)
INFO

# Just memory info
INFO memory

# Just stats
INFO stats

# Current database size (number of keys)
DBSIZE

# Show all config values
CONFIG GET *

# Show a specific config value
CONFIG GET maxmemory

# Monitor all commands in real-time (careful — floods your terminal)
MONITOR

# Slow log — queries that took too long
SLOWLOG GET 10

# Switch between databases (0-15, default is 0)
SELECT 1

# Clear current database
FLUSHDB

# Clear ALL databases
FLUSHALL
```

---

## Data types

Redis has 5 primary data types. Think of Redis as a giant dictionary where each key
maps to a typed value.

| Type | What it is | Use case |
|---|---|---|
| **String** | Binary-safe string/number | Counters, cache values, flags |
| **Hash** | Field-value map (like a JS object) | User profiles, session data |
| **List** | Ordered doubly-linked list | Queues, recent items, feeds |
| **Set** | Unordered collection of unique strings | Tags, memberships, dedup |
| **Sorted Set** | Set with a score per member | Leaderboards, rankings, timelines |

---

## Strings

The simplest type. A key maps to a single value (string, number, or binary blob).

```bash
# Set a value
SET user:1:name "Alice"

# Get a value
GET user:1:name
# → "Alice"

# Set with expiration (60 seconds)
SET session:abc123 "user:1" EX 60

# Set with expiration in milliseconds
SET session:abc123 "user:1" PX 5000

# Set only if key does NOT exist (atomic lock)
SET lock:deploy "worker-1" NX EX 30

# Set only if key ALREADY exists
SET user:1:name "Bob" XX

# Get old value and set new one (atomic swap)
GETSET counter "0"

# Set multiple keys at once
MSET user:1:name "Alice" user:1:email "alice@example.com"

# Get multiple keys at once
MGET user:1:name user:1:email

# Append to a string
APPEND user:1:name " Smith"

# Get string length
STRLEN user:1:name

# Increment a number (atomic counter)
SET page:views 0
INCR page:views
INCR page:views
GET page:views
# → "2"

# Increment by N
INCRBY page:views 10

# Decrement
DECR page:views
DECRBY page:views 5

# Increment by float
INCRBYFLOAT price 0.99

# Get a substring
GETRANGE user:1:name 0 4
```

---

## Hashes

A hash is like a JavaScript object — a key that holds field-value pairs.
Perfect for representing entities without serializing to JSON.

```bash
# Set a single field
HSET user:1 name "Alice"
HSET user:1 email "alice@example.com"
HSET user:1 role "admin"

# Set multiple fields at once
HSET user:2 name "Bob" email "bob@example.com" role "user"

# Get a single field
HGET user:1 name
# → "Alice"

# Get multiple fields
HMGET user:1 name email role

# Get ALL fields and values
HGETALL user:1
# → 1) "name"   2) "Alice"   3) "email"   4) "alice@example.com"   5) "role"   6) "admin"

# Check if a field exists
HEXISTS user:1 phone
# → (integer) 0

# Get all field names
HKEYS user:1

# Get all values
HVALS user:1

# Count fields
HLEN user:1
# → (integer) 3

# Delete a field
HDEL user:1 role

# Increment a numeric field
HSET user:1 login_count 0
HINCRBY user:1 login_count 1

# Increment by float
HINCRBYFLOAT user:1 balance 9.99
```

---

## Lists

Lists are ordered sequences. You push/pop from either end — they work as
queues (FIFO) or stacks (LIFO).

```bash
# Push to the left (head) — newest first
LPUSH notifications:user1 "New message from Bob"
LPUSH notifications:user1 "Task assigned to you"

# Push to the right (tail)
RPUSH queue:emails "email:1" "email:2" "email:3"

# Pop from the left (oldest in a queue)
LPOP queue:emails
# → "email:1"

# Pop from the right
RPOP queue:emails

# Blocking pop — wait up to 5 seconds for an item (great for worker queues)
BLPOP queue:emails 5

# Get an element by index (0-based)
LINDEX notifications:user1 0

# Get a range of elements
LRANGE notifications:user1 0 -1    # all elements
LRANGE notifications:user1 0 4     # first 5

# Get list length
LLEN notifications:user1

# Trim to keep only last 100 items (great for "recent" lists)
LTRIM notifications:user1 0 99

# Remove occurrences of a value
LREM notifications:user1 1 "old notification"

# Set value at index
LSET notifications:user1 0 "Updated notification"

# Move between lists (atomic)
LMOVE source_queue dest_queue LEFT RIGHT
```

---

## Sets

Unordered collections of unique strings. Lightning fast membership checks.

```bash
# Add members
SADD tags:task1 "bug" "frontend" "urgent"

# Check if member exists
SISMEMBER tags:task1 "bug"
# → (integer) 1

# Get all members
SMEMBERS tags:task1

# Count members
SCARD tags:task1
# → (integer) 3

# Remove a member
SREM tags:task1 "urgent"

# Pop a random member
SPOP tags:task1

# Get random members without removing
SRANDMEMBER tags:task1 2

# Union (all tags from multiple tasks)
SUNION tags:task1 tags:task2

# Intersection (tags in common)
SINTER tags:task1 tags:task2

# Difference (in task1 but not task2)
SDIFF tags:task1 tags:task2

# Store result of union in a new key
SUNIONSTORE all_tags tags:task1 tags:task2 tags:task3

# Move a member from one set to another
SMOVE tags:task1 tags:task2 "bug"
```

---

## Sorted sets

Like sets, but every member has a numeric score. Members are auto-sorted by score.
This is one of Redis's killer features — leaderboards, priority queues, time-series.

```bash
# Add members with scores
ZADD leaderboard 100 "alice" 85 "bob" 92 "charlie"

# Get score of a member
ZSCORE leaderboard "alice"
# → "100"

# Get rank (0-based, lowest score first)
ZRANK leaderboard "bob"
# → (integer) 0

# Get reverse rank (highest score first)
ZREVRANK leaderboard "alice"
# → (integer) 0

# Get members by rank range (ascending)
ZRANGE leaderboard 0 -1
ZRANGE leaderboard 0 -1 WITHSCORES

# Get members by rank range (descending — top 3)
ZREVRANGE leaderboard 0 2 WITHSCORES

# Get members by score range
ZRANGEBYSCORE leaderboard 80 100 WITHSCORES

# Count members in a score range
ZCOUNT leaderboard 80 100

# Increment a score (atomic)
ZINCRBY leaderboard 5 "bob"

# Remove a member
ZREM leaderboard "charlie"

# Remove by rank range (remove bottom 3)
ZREMRANGEBYRANK leaderboard 0 2

# Remove by score range
ZREMRANGEBYSCORE leaderboard 0 50

# Count total members
ZCARD leaderboard

# Union of sorted sets (combine scores)
ZUNIONSTORE combined_board 2 leaderboard:week1 leaderboard:week2 AGGREGATE SUM
```

---

## Keys & expiration

These commands work on any key regardless of its type.

```bash
# Check if a key exists
EXISTS user:1

# Get the type of a key
TYPE user:1
# → hash

# Find keys matching a pattern (DON'T use in production — use SCAN instead)
KEYS user:*

# (Better) Iterate keys safely with SCAN
SCAN 0 MATCH user:* COUNT 100

# Rename a key
RENAME old_key new_key

# Rename only if new key doesn't exist
RENAMENX old_key new_key

# Delete a key (blocking)
DEL user:1

# Delete a key (non-blocking, asynchronous)
UNLINK user:1

# Set expiration (seconds)
EXPIRE session:abc 3600

# Set expiration at a specific Unix timestamp
EXPIREAT session:abc 1712300000

# Set expiration (milliseconds)
PEXPIRE session:abc 60000

# Check remaining TTL (seconds)
TTL session:abc
# → (integer) 3542  (or -1 if no expiry, -2 if key doesn't exist)

# Check remaining TTL (milliseconds)
PTTL session:abc

# Remove expiration (make key permanent again)
PERSIST session:abc

# Dump a key's value (binary serialization)
DUMP user:1

# Restore a key from dump
RESTORE user:1 0 "\x00\x03..."
```

---

## Pub/Sub

Redis Pub/Sub lets you send messages between services in real-time.
Publishers don't know who's listening. Subscribers don't know who's publishing.

```bash
# Terminal 1 — Subscribe to a channel
SUBSCRIBE notifications

# Terminal 2 — Publish a message
PUBLISH notifications "New task assigned"

# Subscribe to multiple channels matching a pattern
PSUBSCRIBE user:*

# Unsubscribe
UNSUBSCRIBE notifications

# Check active channels
PUBSUB CHANNELS

# Count subscribers per channel
PUBSUB NUMSUB notifications
```

---

## Transactions

Redis transactions bundle multiple commands into a single atomic execution.
No other client can interrupt between the commands.

```bash
# Start a transaction
MULTI

# Queue commands (they don't execute yet)
SET balance:alice 100
DECRBY balance:alice 30
INCRBY balance:bob 30

# Execute all commands atomically
EXEC

# Abort a transaction
DISCARD

# Watch a key — transaction aborts if key changes before EXEC
WATCH balance:alice
MULTI
DECRBY balance:alice 50
EXEC
# → (nil) if balance:alice was modified by another client between WATCH and EXEC
```

---

## Scripting with Lua

For complex atomic operations, you can run Lua scripts server-side.
The entire script runs atomically — no other commands can interleave.

```bash
# Simple script — return a value
EVAL "return 'hello'" 0

# Script with keys and args
EVAL "return redis.call('GET', KEYS[1])" 1 user:1:name

# Atomic transfer (debit + credit in one shot)
EVAL "
  local balance = tonumber(redis.call('GET', KEYS[1]))
  if balance >= tonumber(ARGV[1]) then
    redis.call('DECRBY', KEYS[1], ARGV[1])
    redis.call('INCRBY', KEYS[2], ARGV[1])
    return 1
  end
  return 0
" 2 balance:alice balance:bob 50

# Cache a script and call by SHA
SCRIPT LOAD "return redis.call('GET', KEYS[1])"
# → "a42059b..."
EVALSHA "a42059b..." 1 user:1:name
```

---

## Administration

```bash
# Memory usage of a specific key
MEMORY USAGE user:1

# Overall memory stats
INFO memory

# Max memory and eviction policy
CONFIG GET maxmemory
CONFIG GET maxmemory-policy

# Change max memory at runtime (no restart)
CONFIG SET maxmemory 256mb

# Check connected clients
CLIENT LIST

# Kill a client
CLIENT KILL ID 42

# Get server time
TIME

# Reset stats
CONFIG RESETSTAT

# Check replication status
INFO replication

# Background save (if persistence was enabled)
BGSAVE

# Last save timestamp
LASTSAVE
```

### Docker-specific

```bash
# View Redis container logs
docker logs -f notion_redis

# Restart Redis
docker restart notion_redis

# Check container health
docker inspect --format='{{.State.Health.Status}}' notion_redis

# Quick ping from host
docker exec notion_redis redis-cli PING

# Check memory usage
docker exec notion_redis redis-cli INFO memory | grep used_memory_human

# Check number of keys
docker exec notion_redis redis-cli DBSIZE

# Flush everything
docker exec notion_redis redis-cli FLUSHALL
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `PONG` not returned | Container not running. `docker compose --profile src up -d redis`. |
| `MISCONF Redis is configured to save RDB snapshots` | Shouldn't happen (we disabled persistence). If it does: `CONFIG SET stop-writes-on-bgsave-error no`. |
| `OOM command not allowed` | Memory limit reached. `redis-cli INFO memory` to check. Increase `maxmemory` or let LRU evict keys. |
| Keys disappear randomly | Expected — LRU eviction (`allkeys-lru`). If a key is important, don't store it in Redis alone. |
| Data gone after restart | Expected — no persistence is configured. Redis is cache-only in this project. |
| Can't connect from host | Port 6379 must be exposed. Check `docker compose ps` for port mapping. |
| `WRONGTYPE` error | You're running a string command on a hash (or similar). `TYPE key` to check, `DEL key` to reset. |
| Slow operations | Avoid `KEYS *` in production. Use `SCAN`. Check `SLOWLOG GET 10`. |

---

*Last updated: April 2026*
