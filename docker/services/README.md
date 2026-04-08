# services/ — Docker Service Configs

Configuration files for the two database containers: **MongoDB 7** and **PostgreSQL 16**. These are mounted into stock Docker images — no custom Dockerfiles needed for dev.

The `dbms/` subdirectory contains the TypeScript database adapter layer used by the main app.

## Directory structure

```
services/
├── dbms/                      # Database adapter layer (TypeScript)
│   ├── types.ts               # Shared adapter interface
│   ├── DbAdapterFactory.ts    # Picks adapter based on ACTIVE_DB_SOURCE
│   ├── JsonDbAdapter.ts       # JSON flat-file adapter
│   ├── CsvDbAdapter.ts        # CSV flat-file adapter
│   ├── MongoDbAdapter.ts      # MongoDB adapter
│   ├── PostgresDbAdapter.ts   # PostgreSQL adapter
│   ├── DbMemoCache.ts         # In-memory cache layer
│   ├── inferSchema.ts         # Auto-infer schema from data
│   └── smoke-test.ts          # Quick adapter smoke test
├── mongodb/
│   ├── conf/
│   │   └── mongod.conf        # MongoDB server config
│   └── tools/
│       ├── init-collections.js # Runs on first container start
│       ├── healthcheck.sh      # Container health check script
│       └── seed.sh             # Seed script
├── postgresql/
│   ├── conf/
│   │   ├── postgresql.conf    # PostgreSQL server config
│   │   └── pg_hba.conf        # Client authentication config
│   └── tools/
│       ├── healthcheck.sh     # Container health check script
│       └── seed.sh            # Seed script
```

## How configs are mounted

From `docker-compose.yml`:

**PostgreSQL**:
- `services/postgresql/conf/postgresql.conf` → `/etc/postgresql/postgresql.conf`
- `services/postgresql/conf/pg_hba.conf` → `/etc/postgresql/pg_hba.conf`
- `docker/init-databases.sql` → `/docker-entrypoint-initdb.d/01-init-databases.sql`

**MongoDB**:
- `services/mongodb/tools/init-collections.js` → `/docker-entrypoint-initdb.d/01-init-collections.js`

All mounted as read-only (`:ro`). Data persists in named Docker volumes (`postgres_data`, `mongo_data`).

## Default credentials

| Service | User | Password | Database | Port |
|---|---|---|---|---|
| PostgreSQL | `notion_user` | `notion_pass` | `notion_db` | 5432 |
| MongoDB | `notion_user` | `notion_pass` | `notion_db` | 27017 |

All configurable via `.env` at project root.

## Health checks

Both containers have built-in health checks (defined in `docker-compose.yml`):

```bash
# PostgreSQL
pg_isready -U notion_user -d notion_db

# MongoDB
mongosh --quiet --eval "db.adminCommand('ping')"
```

Check status:
```bash
make db-status
```

## Accessing database shells

```bash
# PostgreSQL
make psql

# MongoDB
make mongo-shell
```

## Wiping everything

```bash
# Destroy volumes + recreate containers
make db-reset
```

This drops all data. You'll need to re-seed after (`make seed-all` from `src/` or `make seed` from `playground/`).
