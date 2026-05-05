#!/bin/sh
set -e
pg_isready -U "${POSTGRES_USER:-osionos_user}" -d "${POSTGRES_DB:-osionos_db}" -q
