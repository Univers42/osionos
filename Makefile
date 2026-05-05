# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/08 19:07:11 by dlesieur          #+#    #+#              #
#    Updated: 2026/05/05 02:24:32 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

SHELL := /bin/bash
ROOT  := $(dir $(lastword $(MAKEFILE_LIST)))
-include $(ROOT).env
export

CYAN  := \033[36m
GREEN := \033[32m
RED   := \033[31m
YELLOW := \033[33m
RESET := \033[0m

DC := docker compose -f $(ROOT)docker-compose.yml
TEST_WORKERS ?= 1
IMAGE ?= dlesieur/osionos

.DEFAULT_GOAL := help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "$(CYAN)%-22s$(RESET) %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────────────────────

pnpm-lock: ## Regenerate pnpm-lock.yaml inside Docker after package changes
	@echo -e "$(CYAN)Regenerating pnpm lockfile inside Docker…$(RESET)"
	$(DC) build playground
	$(DC) run --rm --no-deps --entrypoint sh playground -lc 'pnpm install --lockfile-only --store-dir /pnpm/store'
	@echo -e "$(GREEN)✔ pnpm-lock.yaml updated$(RESET)"

install: ## Install pnpm dependencies inside Docker volumes
	@echo -e "$(CYAN)Installing dependencies inside Docker…$(RESET)"
	$(DC) build playground
	$(DC) run --rm --no-deps playground pnpm install --frozen-lockfile --store-dir /pnpm/store
	@echo -e "$(GREEN)✔ Docker dependencies installed$(RESET)"

pnpm-install: install ## Alias for Docker-only pnpm install

dev: up ## Start full Docker dev stack (alias for up)

dev-docker: up ## Alias for up

up: update-submodules ## Start full stack via Docker (Vite :3001 + MongoDB)
	@echo -e "$(CYAN)Starting playground stack via Docker…$(RESET)"
	$(DC) up -d
	@echo -e "$(GREEN)✔ Stack running:$(RESET)"
	@echo -e "  Playground: http://localhost:$${VITE_PORT:-3001}"
	@echo -e "  MongoDB:    localhost:$${MONGO_PORT:-27017}"

stop: ## Stop Docker stack
	$(DC) stop
	@echo -e "$(GREEN)✔ Stack stopped$(RESET)"

down: ## Stop and remove Docker containers + networks
	$(DC) down
	@echo -e "$(GREEN)✔ Stack removed$(RESET)"

shell: ## Open a shell in the Docker Node service
	$(DC) exec playground sh

# ── Build ────────────────────────────────────────────────────────────────

build: ## Build for production inside Docker
	@echo -e "$(CYAN)Building playground…$(RESET)"
	$(DC) run --rm --no-deps playground pnpm run build
	@echo -e "$(GREEN)✔ Built to ./build$(RESET)"

typecheck: ## Run TypeScript type-checking inside Docker
	@echo -e "$(CYAN)Type-checking…$(RESET)"
	$(DC) run --rm --no-deps playground pnpm run typecheck
	@echo -e "$(GREEN)✔ No type errors$(RESET)"

image-build: ## Build the production Docker image locally (IMAGE=... VERSION=...)
	@version="$${VERSION:-dev}"; \
	echo -e "$(CYAN)Building Docker image $(IMAGE):$${version}…$(RESET)"; \
	docker build -f $(ROOT)docker/services/node/Dockerfile.prod -t $(IMAGE):$${version} -t $(IMAGE):latest $(ROOT); \
	echo -e "$(GREEN)✔ Docker image built: $(IMAGE):$${version}$(RESET)"

# ── Analysis & Quality ──────────────────────────────────────────────────

lint: ## Run ESLint with zero-tolerance for warnings inside Docker
	@echo -e "$(CYAN)Linting all source files…$(RESET)"
	$(DC) run --rm --no-deps playground pnpm run lint
	@echo -e "$(GREEN)✔ No lint errors$(RESET)"

lint-fix: ## Automatically fix linting errors inside Docker where possible
	@echo -e "$(CYAN)Fixing lint errors…$(RESET)"
	$(DC) run --rm --no-deps playground pnpm run lint:fix
	@echo -e "$(GREEN)✔ Lint fix complete$(RESET)"

sonar: ## Run SonarQube Scan (requires SonarQube container up)
	@echo -e "$(CYAN)Step: SonarQube Scan…$(RESET)"
	@if [ "$$(docker ps -q -f name=sonarqube)" ]; then \
		echo -e "$(CYAN)Running Sonar scanner in Docker…$(RESET)"; \
		docker run --rm --network host -e SONAR_HOST_URL="$${SONAR_HOST_URL:-http://localhost:9000}" -e SONAR_TOKEN="$${SONAR_TOKEN:-}" -v "$(ROOT):/usr/src" sonarsource/sonar-scanner-cli || echo -e "$(RED)✘ Sonar scan failed$(RESET)"; \
	else \
		echo -e "$(YELLOW)⚠ SonarQube container not running, skipping scan$(RESET)"; \
	fi

audit: ## Full analysis: Typecheck + Lint + SonarQube (requires SonarQube up)
	@echo -e "$(CYAN)══════════════════════════════════════════════════$(RESET)"
	@echo -e "$(CYAN)  Full Audit — TypeScript + ESLint + SonarQube    $(RESET)"
	@echo -e "$(CYAN)══════════════════════════════════════════════════$(RESET)"
	@$(MAKE) typecheck
	@$(MAKE) lint
	@echo -e "$(CYAN)Step 3/3: SonarQube Scan…$(RESET)"
	@$(MAKE) sonar

ci: typecheck lint ## Run the fast quality gates inside Docker

test: test-docker ## Run browser regression tests inside Docker

test-serial: ## Run browser regression tests inside Docker with a single worker
	@echo -e "$(CYAN)Running browser regression tests inside Docker in serial mode…$(RESET)"
	@if [ -n "$(strip $(TEST_FILTER))" ]; then \
		echo -e "$(CYAN)Filter: $(TEST_FILTER)$(RESET)"; \
		$(DC) run --rm --no-deps browser-tests pnpm exec playwright test --workers=1 --grep "$(TEST_FILTER)"; \
	else \
		$(DC) run --rm --no-deps browser-tests pnpm exec playwright test --workers=1; \
	fi

test-smoke: ## Run the browser smoke/harness subset inside Docker
	@echo -e "$(CYAN)Running browser smoke tests inside Docker…$(RESET)"
	@if [ -n "$(strip $(TEST_FILTER))" ]; then \
		echo -e "$(CYAN)Filter: $(TEST_FILTER)$(RESET)"; \
		$(DC) run --rm --no-deps browser-tests pnpm exec playwright test tests/e2e/smoke --grep "$(TEST_FILTER)"; \
	else \
		$(DC) run --rm --no-deps browser-tests pnpm exec playwright test tests/e2e/smoke; \
	fi

test-setup: ## Validate browser test environment inside Docker
	@echo -e "$(CYAN)Preparing browser test environment…$(RESET)"
	$(DC) run --rm --no-deps browser-tests pnpm run test:doctor

test-doctor: ## Validate Docker browser test prerequisites
	@echo -e "$(CYAN)Checking browser test environment…$(RESET)"
	$(DC) run --rm --no-deps browser-tests pnpm run test:doctor

test-ci: test-docker ## Alias for Docker browser test command

test-docker: ## Run browser tests inside Docker using Playwright Test
	@echo -e "$(CYAN)Running browser regression tests inside Docker…$(RESET)"
	@if [ -n "$(strip $(TEST_FILTER))" ]; then \
		echo -e "$(CYAN)Filter: $(TEST_FILTER)$(RESET)"; \
		$(DC) run --rm --no-deps browser-tests pnpm exec playwright test --grep "$(TEST_FILTER)"; \
	else \
		$(DC) run --rm --no-deps browser-tests; \
	fi

# ── Database ─────────────────────────────────────────────────────────────

db-up: ## Start only MongoDB
	$(DC) up -d mongodb
	@echo -e "$(GREEN)✔ MongoDB running on :$${MONGO_PORT:-27017}$(RESET)"

db-shell: ## Open mongosh in the running MongoDB container
	$(DC) exec mongodb mongosh -u $${MONGO_USER:-osionos_user} -p $${MONGO_PASS:-osionos_pass} --authenticationDatabase admin $${MONGO_DB:-playground_db}

db-reset: ## Wipe MongoDB data and restart
	@echo -e "$(RED)Wiping MongoDB data…$(RESET)"
	$(DC) down -v mongodb
	$(DC) up -d mongodb
	@echo -e "$(GREEN)✔ MongoDB reset$(RESET)"

# ── Reset ────────────────────────────────────────────────────────────────

re: ## Full restart: wipe everything and start fresh
	@echo -e "$(CYAN)══ Full restart ══$(RESET)"
	$(DC) down -v --remove-orphans 2>/dev/null || true
	$(DC) up -d
	@echo -e "$(GREEN)══ Restart complete ══$(RESET)"

clean: ## Remove build artifacts and node_modules
	rm -rf build node_modules .vite playwright-report playwright-report.stale test-results
	@echo -e "$(GREEN)✔ Cleaned$(RESET)"

# ── Release ──────────────────────────────────────────────────────────────

guard-version:
	@if [ -z "$(VERSION)" ]; then \
		echo -e "$(RED)✘ VERSION is required. Usage: make tag VERSION=v1.0.0$(RESET)"; \
		exit 1; \
	fi

guard-docker-credentials:
	@if [ -z "$${DOCKER_USER:-}" ] || [ -z "$${DOCKER_PAT:-}" ]; then \
		echo -e "$(RED)✘ DOCKER_USER and DOCKER_PAT must be set in .env$(RESET)"; \
		exit 1; \
	fi

tag: guard-version guard-docker-credentials ## Build, tag, push git and Docker image (VERSION=vX.Y.Z)
	@echo -e "$(CYAN)Building release image $(IMAGE):$(VERSION)…$(RESET)"
	docker build -f $(ROOT)docker/services/node/Dockerfile.prod -t $(IMAGE):$(VERSION) -t $(IMAGE):latest $(ROOT)
	@echo -e "$(CYAN)Committing release changes if needed…$(RESET)"
	@if ! git diff --quiet || ! git diff --cached --quiet; then \
		git add -A && git commit -m "release: $(VERSION)"; \
	else \
		echo "Working tree already clean; no release commit needed."; \
	fi
	@git tag -a $(VERSION) -m "Release $(VERSION)"
	@echo -e "$(CYAN)Logging in to Docker registry…$(RESET)"
	@printf '%s' "$${DOCKER_PAT}" | docker login -u "$${DOCKER_USER}" --password-stdin
	docker push $(IMAGE):$(VERSION)
	docker push $(IMAGE):latest
	git push origin HEAD
	git push origin $(VERSION)
	@echo -e "$(GREEN)✔ Released $(VERSION) as $(IMAGE):$(VERSION)$(RESET)"

# ── Logs ─────────────────────────────────────────────────────────────────

logs: ## Tail all Docker stack logs
	$(DC) logs -f --tail=50

logs-vite: ## Tail only playground (Vite) logs
	$(DC) logs -f --tail=50 playground

logs-mongo: ## Tail only MongoDB logs
	$(DC) logs -f --tail=50 mongodb

# ── Utilities ────────────────────────────────────────────────────────────

kill-ports: ## Kill any process occupying playground-related ports (3001)
	@echo -e "$(CYAN)Killing processes on port 3001…$(RESET)"
	@pids=$$(lsof -ti :3001 2>/dev/null || true); \
	if [ -n "$$pids" ]; then \
		echo "  Killing PID(s) $$pids on :3001"; \
		echo "$$pids" | xargs kill -9 2>/dev/null || true; \
	else \
		echo "  Port :3001 is free"; \
	fi
	@echo -e "$(GREEN)✔ Ports freed$(RESET)"

status: ## Show status of Docker services
	$(DC) ps

update-submodules: ## Update git submodules (if any)
	@git submodule update --init --recursive
	@echo -e "$(GREEN)✔ Submodules updated$(RESET)"

.PHONY: help pnpm-lock install pnpm-install dev dev-docker up stop down shell build typecheck image-build \
        db-up db-shell db-reset re clean logs logs-vite logs-mongo \
        kill-ports status lint lint-fix audit ci sonar update-submodules \
	test test-serial test-smoke test-setup test-doctor test-ci test-docker \
	guard-version guard-docker-credentials tag
