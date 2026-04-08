# SonarQube / SonarCloud — Cheatsheet

> **Image**: `sonarqube:community` · **Port**: 9000 · **Default login**: `admin`/`admin`
> Two modes: **local** (Docker SonarQube CE) and **cloud** (SonarCloud CI)

---

## Table of contents

1. [How it works in this project](#how-it-works-in-this-project)
2. [Local SonarQube (Docker)](#local-sonarqube-docker)
3. [SonarCloud (CI)](#sonarcloud-ci)
4. [sonar-scanner — the CLI](#sonar-scanner--the-cli)
5. [sonar-project.properties](#sonar-projectproperties)
6. [Quality gates](#quality-gates)
7. [Issue types & severities](#issue-types--severities)
8. [The Web API](#the-web-api)
9. [Common rules we care about](#common-rules-we-care-about)
10. [Troubleshooting](#troubleshooting)

---

## How it works in this project

We use SonarQube/SonarCloud for **static code analysis** — finding bugs, code smells,
security vulnerabilities, and duplications without running the code.

Two analysis modes:

| Mode      | When              | Where                            | URL                     |
| --------- | ----------------- | -------------------------------- | ----------------------- |
| **Local** | Manual, on demand | Docker container on your machine | `http://localhost:9000` |
| **Cloud** | Every push / PR   | GitHub Actions CI                | `https://sonarcloud.io` |

Both use the same config file: `sonar-project.properties` at project root.

```
Project root
├── sonar-project.properties    ← Scanner config (shared by both modes)
├── docker-compose.yml          ← Local SonarQube service (profile: sonar)
└── docker/services/sonarqube/
    ├── conf/sonar.properties   ← SonarQube server config (JVM, ports, etc.)
    └── tools/
        ├── run-scan.sh         ← Local scan wrapper
        └── wait-sonarqube.sh   ← Wait for server startup
```

---

## Local SonarQube (Docker)

### Starting the server

```bash
# Start SonarQube (takes ~60s to boot)
make up-sonar

# Check if it's ready
make sonar-status

# Or wait for it programmatically
bash docker/services/sonarqube/tools/wait-sonarqube.sh

# Open in browser
open http://localhost:9000
```

First-time login: **admin / admin** — you'll be asked to change the password.

### Creating a local project

1. Go to `http://localhost:9000` → **Create Project** → **Manually**
2. Project key: `Univers42_notion-database-sys` (must match `sonar-project.properties`)
3. Display name: `Notion Database System`
4. Go to **My Account** → **Security** → **Generate Token**
5. Save the token — you'll need it for the scanner

### Running a local scan

```bash
# Using the wrapper script (reads token from .env)
bash docker/services/sonarqube/tools/run-scan.sh

# Or run the scanner directly
npx -y sonarqube-scanner \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.token=YOUR_TOKEN_HERE

# CI mode (don't wait for quality gate)
bash docker/services/sonarqube/tools/run-scan.sh --ci
```

### Stopping

```bash
# Stop SonarQube
docker compose --profile sonar down

# Stop and wipe all data (fresh start)
docker compose --profile sonar down -v
```

### Server configuration

The server config at `conf/sonar.properties` controls JVM memory and logging:

```properties
sonar.web.host=0.0.0.0
sonar.web.port=9000
sonar.log.level=WARN
sonar.telemetry.enable=false
sonar.search.javaOpts=-Xmx256m -Xms256m   # Elasticsearch
sonar.web.javaOpts=-Xmx512m -Xms128m      # Web server
sonar.ce.javaOpts=-Xmx512m -Xms128m       # Compute engine
```

If SonarQube crashes on startup with an OOM error, increase these values.
The Elasticsearch heap (`search.javaOpts`) alone needs 256 MB minimum.

---

## SonarCloud (CI)

SonarCloud is the hosted version — no server to maintain. Our CI workflow
runs the scanner on every push and pull request.

### Setup (one-time)

1. Go to [sonarcloud.io](https://sonarcloud.io) → **Sign in with GitHub**
2. Import the repository (`Univers42/notion-database-sys`)
3. Note the **project key** and **organization** (must match `sonar-project.properties`)
4. Go to **My Account** → **Security** → **Generate Token** (type: `Project Analysis Token`)
5. In GitHub repo → **Settings** → **Secrets** → Add `SONAR_TOKEN` with the token value

### How the CI job works

```yaml
# .github/workflows/ci.yml (simplified)
sonarqube:
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: https://sonarcloud.io
  steps:
    - uses: SonarSource/sonarqube-scan-action@v6 # runs the scanner
    - uses: SonarSource/sonarqube-quality-gate-action@v1 # checks the gate
```

The scanner:

1. Reads `sonar-project.properties` for project key, sources, exclusions
2. Uses `SONAR_HOST_URL` env var for the server URL
3. Uses `SONAR_TOKEN` env var for authentication
4. Uploads results → SonarCloud runs the analysis server-side

### Verifying your setup

```bash
# Check if the project exists on SonarCloud
curl -sf "https://sonarcloud.io/api/projects/search?organization=univers42" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool

# Check if the token is valid
curl -sf "https://sonarcloud.io/api/authentication/validate" \
  -H "Authorization: Bearer YOUR_TOKEN"
# → {"valid": true}

# Check if the GitHub secret is set (from GitHub CLI)
gh secret list
```

### Disabling automatic analysis

If SonarCloud's automatic analysis is enabled alongside CI-based scanning,
they can conflict. Disable it:

**SonarCloud** → Project → **Administration** → **Analysis Method** → Turn off **Automatic Analysis**.

---

## sonar-scanner — the CLI

The scanner is the client that collects source code and sends it to the server.
It can run as a standalone binary or via `npx`.

### Installation

```bash
# Via npx (no install, uses project's Node)
npx -y sonarqube-scanner -Dsonar.host.url=http://localhost:9000

# Via npm (global install)
npm install -g sonarqube-scanner

# Via Homebrew
brew install sonar-scanner

# Check version
sonar-scanner --version
```

### Key command-line flags

```bash
# Override any sonar-project.properties value
sonar-scanner -Dsonar.host.url=http://localhost:9000
sonar-scanner -Dsonar.token=YOUR_TOKEN
sonar-scanner -Dsonar.projectKey=my-project
sonar-scanner -Dsonar.sources=src

# Skip the quality gate wait
sonar-scanner -Dsonar.qualitygate.wait=false

# Debug mode (very verbose)
sonar-scanner -X

# Specify a different config file
sonar-scanner -Dproject.settings=custom-sonar.properties

# Skip specific file patterns
sonar-scanner -Dsonar.exclusions="**/*.test.ts,**/dist/**"
```

### How the scanner resolves config

Priority (highest wins):

1. Command-line `-D` flags
2. Environment variables (`SONAR_TOKEN`, `SONAR_HOST_URL`)
3. `sonar-project.properties` file
4. SonarQube server defaults

**Important**: `sonar.host.url` is NOT set in our properties file on purpose.
The scanner picks it up from `SONAR_HOST_URL` env var instead. This prevents
conflicts between local (`localhost:9000`) and cloud (`sonarcloud.io`) modes.

---

## sonar-project.properties

This is the main config file. Here's what each section does:

```properties
# === Identity (must match SonarCloud project exactly) ===
sonar.projectKey=Univers42_notion-database-sys   # CASE-SENSITIVE!
sonar.projectName=Notion Database System
sonar.projectVersion=1.0.0
sonar.organization=univers42

# === What to scan ===
sonar.sources=src,packages,playground,docker/services/dbms
sonar.tests=              # empty = no test directory yet
sonar.inclusions=**/*.ts,**/*.tsx

# === What to skip ===
sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,...

# === TypeScript config ===
sonar.typescript.tsconfigPaths=tsconfig.json,packages/*/tsconfig.json,...

# === Quality gate ===
sonar.qualitygate.wait=true      # block until gate result
sonar.qualitygate.timeout=120    # seconds to wait
```

### Adding a new package

If you add a new TypeScript package, update:

1. `sonar.sources` — add its directory
2. `sonar.typescript.tsconfigPaths` — add its tsconfig path

---

## Quality gates

A quality gate is a set of conditions your code must pass. If any condition fails,
the gate status is "Failed" and the CI check goes red.

### Default SonarCloud conditions

| Metric                     | Condition                              |
| -------------------------- | -------------------------------------- |
| New code coverage          | ≥ 80%                                  |
| New duplicated lines       | ≤ 3%                                   |
| New reliability rating     | A (no new bugs)                        |
| New security rating        | A (no new vulnerabilities)             |
| New maintainability rating | A (no new code smells above threshold) |

### Checking the gate locally

```bash
# Via the web API
curl -sf "http://localhost:9000/api/qualitygates/project_status?projectKey=Univers42_notion-database-sys" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool

# Or check in the browser
open "http://localhost:9000/dashboard?id=Univers42_notion-database-sys"
```

### On SonarCloud

```bash
# Quality gate status
curl -sf "https://sonarcloud.io/api/qualitygates/project_status?projectKey=Univers42_notion-database-sys" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

---

## Issue types & severities

SonarQube classifies findings into three types:

| Type              | Icon | What it means                                 |
| ----------------- | ---- | --------------------------------------------- |
| **Bug**           | 🪲   | Code that is demonstrably wrong or will crash |
| **Vulnerability** | 🔓   | Code that could be exploited (security)       |
| **Code Smell**    | 💩   | Code that works but is hard to maintain       |

Severities (from worst to meh):

| Severity     | Impact                                                  |
| ------------ | ------------------------------------------------------- |
| **Blocker**  | Will crash in production or is a critical security hole |
| **Critical** | High risk of bugs or security issues                    |
| **Major**    | Significant quality issue worth fixing                  |
| **Minor**    | Low-impact improvement                                  |
| **Info**     | Nice to know, not urgent                                |

### Browsing issues

```bash
# Get all issues for the project (paginated)
curl -sf "http://localhost:9000/api/issues/search?projectKeys=Univers42_notion-database-sys&ps=50" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool

# Filter by type
curl -sf "...&types=BUG"
curl -sf "...&types=VULNERABILITY"
curl -sf "...&types=CODE_SMELL"

# Filter by severity
curl -sf "...&severities=CRITICAL,BLOCKER"

# Filter by file
curl -sf "...&componentKeys=Univers42_notion-database-sys:src/store/useStore.ts"

# Count by rule
curl -sf "http://localhost:9000/api/issues/search?projectKeys=Univers42_notion-database-sys&facets=rules&ps=1" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool | grep -A2 '"val"'
```

---

## The Web API

SonarQube/SonarCloud has a comprehensive REST API. Everything you can do in the UI,
you can do via API.

### Useful endpoints

```bash
BASE="http://localhost:9000"  # or https://sonarcloud.io
KEY="Univers42_notion-database-sys"
TOKEN="your-token"

# Server health
curl -sf "$BASE/api/system/status"

# Project metrics (lines, bugs, smells, coverage, duplication)
curl -sf "$BASE/api/measures/component?component=$KEY&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# List all available metrics
curl -sf "$BASE/api/metrics/search?ps=500" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep '"key"'

# Project analyses history
curl -sf "$BASE/api/project_analyses/search?project=$KEY" \
  -H "Authorization: Bearer $TOKEN"

# Source code with issues highlighted
curl -sf "$BASE/api/sources/show?key=$KEY:src/store/useStore.ts" \
  -H "Authorization: Bearer $TOKEN"

# List quality profiles
curl -sf "$BASE/api/qualityprofiles/search?project=$KEY" \
  -H "Authorization: Bearer $TOKEN"

# List quality gates
curl -sf "$BASE/api/qualitygates/list" \
  -H "Authorization: Bearer $TOKEN"

# Search rules (find what a rule does)
curl -sf "$BASE/api/rules/search?rule_key=typescript:S1854" \
  -H "Authorization: Bearer $TOKEN"

# Full API docs (open in browser)
open "$BASE/web_api"
```

### Batch operations

```bash
# Bulk resolve issues as "won't fix"
curl -sf "$BASE/api/issues/bulk_change" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d "issues=AYx1234,AYx5678&do_transition=wontfix"

# Bulk change severity
curl -sf "$BASE/api/issues/bulk_change" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -d "issues=AYx1234&set_severity=MINOR"
```

---

## Common rules we care about

These are the TypeScript rules that come up most often in this project.
The rule key format is `typescript:SXXXX` (SonarSource rules) or
`typescript:XXXX` (ESLint-derived rules).

| Rule    | What it catches                     | Fix                                         |
| ------- | ----------------------------------- | ------------------------------------------- |
| `S1854` | Dead stores (unused assignments)    | Remove the assignment or use the variable   |
| `S1481` | Unused variables                    | Remove or prefix with `_`                   |
| `S3776` | Cognitive complexity too high       | Break into smaller functions                |
| `S1066` | Collapsible `if` statements         | Merge `if (a) { if (b) }` → `if (a && b)`   |
| `S4144` | Duplicate function bodies           | Extract shared logic                        |
| `S1135` | `TODO` / `FIXME` in comments        | Just resolve them                           |
| `S6606` | Prefer nullish coalescing (`??`)    | Replace `\|\|` with `??` for null/undefined |
| `S6582` | Prefer optional chaining (`?.`)     | Replace `a && a.b` with `a?.b`              |
| `S4138` | Use `for...of` instead of `forEach` | Swap to `for (const x of arr)`              |
| `S6747` | JSX uses `any`                      | Add proper types                            |
| `S6666` | Use `Array.isArray()`               | Replace `instanceof Array`                  |

### Suppressing false positives

Sometimes the scanner is wrong. You can suppress with a comment:

```typescript
// NOSONAR — reason why this is intentional
const x = eval(dynamicCode); // NOSONAR

// Or suppress a specific rule
/* @SuppressWarnings("typescript:S1854") */
```

But be careful — if you suppress everything, you lose the point of static analysis.

---

## Troubleshooting

| Problem                               | Fix                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Project not found`** in CI         | The project doesn't exist on SonarCloud, or `SONAR_TOKEN` is wrong/expired. See [Verifying your setup](#verifying-your-setup).                |
| `SONAR_TOKEN` not set                 | Add it to GitHub repo secrets (for CI) or to `.env` (for local).                                                                              |
| Scanner can't find TypeScript files   | Check `sonar.sources` and `sonar.inclusions` in `sonar-project.properties`.                                                                   |
| Scanner fails with invalid URL        | `sonar.host.url` might be set both in properties AND env var. We keep it out of the properties file on purpose — see the comment in the file. |
| Quality gate always fails on coverage | We have no tests yet → 0% coverage. Either add tests or customize the quality gate to relax the coverage threshold.                           |
| Local SonarQube won't start           | Needs ~1 GB RAM. Check `docker logs notion_sonarqube` and increase JVM heap in `conf/sonar.properties`.                                       |
| SonarQube takes forever to boot       | Normal — first boot takes 60-90s. Use `wait-sonarqube.sh` to wait.                                                                            |
| `Elasticsearch exception`             | ES needs `vm.max_map_count >= 262144`. On Linux: `sudo sysctl -w vm.max_map_count=262144`.                                                    |
| Analysis runs but shows 0 lines       | `sonar.sources` doesn't point to the right directories, or `sonar.exclusions` is too aggressive.                                              |
| Duplicate code false positives        | SonarQube flags similar-looking code as duplicates. If it's intentional, just accept it.                                                      |

### The "Project not found" CI fix (step by step)

This is the most common CI error. Here's the full diagnostic:

```bash
# 1. Check if the token works
curl -sf "https://sonarcloud.io/api/authentication/validate" \
  -H "Authorization: Bearer $SONAR_TOKEN"
# Expected: {"valid": true}

# 2. Check if the project exists
curl -sf "https://sonarcloud.io/api/projects/search?organization=univers42" \
  -H "Authorization: Bearer $SONAR_TOKEN" | python3 -m json.tool
# Look for "Univers42_notion-database-sys" in the results

# 3. If the project doesn't exist, create it
curl -sf "https://sonarcloud.io/api/projects/create" \
  -X POST \
  -H "Authorization: Bearer $SONAR_TOKEN" \
  -d "name=Notion Database System&project=Univers42_notion-database-sys&organization=univers42"

# 4. If the token is invalid, generate a new one
# Go to: https://sonarcloud.io/account/security
# Generate → Type: Project Analysis Token → Copy → Update GitHub secret

# 5. Verify the GitHub secret exists
gh secret list
# Should show SONAR_TOKEN

# 6. Update the secret if needed
gh secret set SONAR_TOKEN
# Paste the token when prompted
```

---

_Last updated: April 2026_
