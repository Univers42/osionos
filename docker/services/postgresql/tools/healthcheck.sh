#!/bin/sh
set -e
pg_isready -U "${POSTGRES_USER:-notion_user}" -d "${POSTGRES_DB:-notion_db}" -q
