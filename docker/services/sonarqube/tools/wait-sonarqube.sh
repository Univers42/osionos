#!/usr/bin/env bash
# wait-sonarqube.sh
#
# Polls the SonarQube health endpoint until the server reports UP.
# Used by `make sonar-up` and `make audit` to avoid running the scanner
# before the server is ready.  The first boot can take 30-90 seconds.
#
# Usage:
#   bash services/sonarqube/tools/wait-sonarqube.sh [url] [timeout_seconds]
#
# Defaults:
#   url     = http://localhost:9000
#   timeout = 180
set -euo pipefail

SONAR_URL="${1:-http://localhost:9000}"
TIMEOUT="${2:-180}"
INTERVAL=5
ELAPSED=0

echo "⏳ Waiting for SonarQube at ${SONAR_URL} (timeout: ${TIMEOUT}s)…"

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  STATUS=$(curl -sf "${SONAR_URL}/api/system/status" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "UNREACHABLE")
  if [ "$STATUS" = "UP" ]; then
    echo "✔ SonarQube is UP (took ${ELAPSED}s)"
    exit 0
  fi
  echo "  status=${STATUS} … retrying in ${INTERVAL}s"
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "✘ Timed out after ${TIMEOUT}s waiting for SonarQube"
exit 1
