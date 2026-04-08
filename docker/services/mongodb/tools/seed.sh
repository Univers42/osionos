#!/bin/bash
set -e
MONGO_USER="${MONGO_INITDB_ROOT_USERNAME:-notion_user}"
MONGO_PASS="${MONGO_INITDB_ROOT_PASSWORD:-notion_pass}"
MONGO_DB="${MONGO_INITDB_DATABASE:-notion_db}"
URI="mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/${MONGO_DB}?authSource=admin"

echo "[mongo-seed] Waiting for MongoDB to accept connections..."
until mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do sleep 1; done

echo "[mongo-seed] Importing seed data..."
for f in /seed/*.seed.json; do
  [ -f "$f" ] || continue
  collection=$(basename "$f" .seed.json)
  echo "  Importing ${collection}..."
  mongoimport --uri="$URI" --collection="$collection" --jsonArray --drop --file="$f"
done

echo "[mongo-seed] Done — MongoDB seeded successfully."
