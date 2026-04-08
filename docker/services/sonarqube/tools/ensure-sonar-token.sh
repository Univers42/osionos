#!/usr/bin/env bash
# ensure-sonar-token.sh — Provision a SonarQube analysis token for local dev.
#
# On first boot the default credentials are admin/admin.  This script:
#   1. Checks if SONAR_TOKEN is already present (and valid) in .env — exits early.
#   2. Authenticates with admin/<SONAR_ADMIN_PASSWORD|admin>.
#   3. Generates a GLOBAL_ANALYSIS_TOKEN named "notion-dbms-local".
#   4. Appends SONAR_TOKEN=<value> to .env so future runs pick it up.
#
# Usage:
#   bash docker/services/sonarqube/tools/ensure-sonar-token.sh [.env path]
set -euo pipefail

ENV_FILE="${1:-.env}"
SONAR_PORT="${SONAR_PORT:-9000}"
SONAR_URL="${SONAR_HOST_URL:-http://localhost:${SONAR_PORT}}"
TOKEN_NAME="notion-dbms-local"

# ── 1. Already set? ──────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  EXISTING=$(grep -E '^SONAR_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)
  if [ -n "$EXISTING" ]; then
    # Quick validation — try authenticated system/status
    if curl -sf -H "Authorization: Bearer ${EXISTING}" \
         "${SONAR_URL}/api/system/status" >/dev/null 2>&1; then
      echo -e "\033[32m✔ SONAR_TOKEN already set and valid\033[0m"
      exit 0
    else
      echo -e "\033[33m⚠ SONAR_TOKEN in .env is invalid — regenerating…\033[0m"
    fi
  fi
fi

# ── 2. Discover working admin password ───────────────────────────────────────
ADMIN_PASS="${SONAR_ADMIN_PASSWORD:-admin}"

auth_ok() {
  curl -sf -u "admin:$1" "${SONAR_URL}/api/authentication/validate" 2>/dev/null \
    | grep -q '"valid":true'
}

if ! auth_ok "$ADMIN_PASS"; then
  if [ "$ADMIN_PASS" != "admin" ] && auth_ok "admin"; then
    ADMIN_PASS="admin"
  else
    echo -e "\033[31m✘ Cannot authenticate with SonarQube admin.\033[0m"
    echo "  Set SONAR_ADMIN_PASSWORD in .env or generate a token manually:"
    echo "    ${SONAR_URL}/account/security"
    exit 1
  fi
fi

# ── 3. Revoke stale token with the same name (ignore errors) ────────────────
curl -sf -u "admin:${ADMIN_PASS}" -X POST \
  "${SONAR_URL}/api/user_tokens/revoke" \
  -d "name=${TOKEN_NAME}" >/dev/null 2>&1 || true

# ── 4. Generate new analysis token ──────────────────────────────────────────
RESPONSE=$(curl -sf -u "admin:${ADMIN_PASS}" -X POST \
  "${SONAR_URL}/api/user_tokens/generate" \
  -d "name=${TOKEN_NAME}&type=GLOBAL_ANALYSIS_TOKEN" 2>&1) || {
    echo -e "\033[31m✘ Token generation request failed\033[0m"
    echo "  Response: ${RESPONSE:-<empty>}"
    exit 1
  }

TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "\033[31m✘ Failed to extract token from API response\033[0m"
  echo "  Response: $RESPONSE"
  exit 1
fi

# ── 5. Persist to .env ──────────────────────────────────────────────────────
if grep -q '^SONAR_TOKEN=' "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^SONAR_TOKEN=.*|SONAR_TOKEN=${TOKEN}|" "$ENV_FILE"
else
  {
    echo ""
    echo "# SonarQube analysis token (auto-provisioned by ensure-sonar-token.sh)"
    echo "SONAR_TOKEN=${TOKEN}"
  } >> "$ENV_FILE"
fi

echo -e "\033[32m✔ SonarQube token provisioned and saved to ${ENV_FILE}\033[0m"
