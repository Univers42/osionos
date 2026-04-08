#!/usr/bin/env bash
# run-scan.sh
#
# Runs sonar-scanner against the project root.
# Reads sonar-project.properties for source paths, exclusions, etc.
#
# Usage:
#   bash services/sonarqube/tools/run-scan.sh            # local scan (localhost:9000)
#   bash services/sonarqube/tools/run-scan.sh --cloud     # scan against SonarCloud
#   bash services/sonarqube/tools/run-scan.sh --ci        # CI mode (skips quality gate wait)
#
# Environment variables:
#   SONAR_HOST_URL  Scanner target URL.  Defaults to http://localhost:9000
#                   (overridden to https://sonarcloud.io with --cloud).
#   SONAR_TOKEN     Authentication token.  Required for SonarCloud,
#                   optional for local Community Edition.
#
# The script installs sonar-scanner via npx if it is not already on PATH.
set -euo pipefail

# Load .env if present (for SONAR_TOKEN)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SONAR_URL="${SONAR_HOST_URL:-http://localhost:9000}"
SONAR_TOKEN="${SONAR_TOKEN:-}"
CI_MODE=false
CLOUD_MODE=false

for arg in "$@"; do
  case "$arg" in
    --ci)    CI_MODE=true ;;
    --cloud) CLOUD_MODE=true ;;
  esac
done

# --cloud overrides the host to SonarCloud
if [ "$CLOUD_MODE" = true ]; then
  SONAR_URL="https://sonarcloud.io"
fi

# Use the official SonarSource npm package (sonarqube-scanner).
# The old 'sonar-scanner' 3.x npm package is abandoned and fails on SonarCloud.
SCANNER="npx -y sonarqube-scanner"

# Build command-line arguments
ARGS=(
  "-Dsonar.host.url=${SONAR_URL}"
)

if [ -n "$SONAR_TOKEN" ]; then
  ARGS+=("-Dsonar.token=${SONAR_TOKEN}")
fi

if [ "$CI_MODE" = true ]; then
  # In CI the quality gate is checked by a separate GitHub Actions step.
  ARGS+=("-Dsonar.qualitygate.wait=false")
fi

echo "Running SonarQube analysis"
echo "  URL   : ${SONAR_URL}"
echo "  Token : $([ -n "$SONAR_TOKEN" ] && echo "(set)" || echo "(not set)")"
echo "  Mode  : $([ "$CLOUD_MODE" = true ] && echo "cloud" || echo "local")"
echo ""

$SCANNER "${ARGS[@]}"
