# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/08 19:07:11 by dlesieur          #+#    #+#              #
#    Updated: 2026/04/15 11:34:20 by rstancu          ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

SHELL := /bin/bash
ROOT  := $(dir $(lastword $(MAKEFILE_LIST)))
-include $(ROOT).env
export

CYAN  := \033[36m
GREEN := \033[32m
RED   := \033[31m
RESET := \033[0m

DC := docker compose -f $(ROOT)docker-compose.yml

.DEFAULT_GOAL := help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "$(CYAN)%-22s$(RESET) %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────────────────────

install: ## Install Node dependencies locally (requires Node 22+)
	@echo -e "$(CYAN)Installing dependencies…$(RESET)"
	npm install
	@echo -e "$(GREEN)✔ Dependencies installed$(RESET)"

dev: ## Start Vite dev server locally on :3001 (offline mode)
	@echo -e "$(CYAN)Starting playground on http://localhost:3001 (offline mode)$(RESET)"
	npm install
	npx vite --port 3001

dev-docker: ## Start full stack via Docker (Vite :3001 + MongoDB)
	@echo -e "$(CYAN)Starting playground stack via Docker…$(RESET)"
	$(DC) up -d
	@echo -e "$(GREEN)✔ Stack running:$(RESET)"
	@echo -e "  Playground: http://localhost:$${VITE_PORT:-3001}"
	@echo -e "  MongoDB:    localhost:$${MONGO_PORT:-27017}"

up: dev-docker ## Alias for dev-docker

stop: ## Stop Docker stack
	$(DC) stop
	@echo -e "$(GREEN)✔ Stack stopped$(RESET)"

down: ## Stop and remove Docker containers + networks
	$(DC) down
	@echo -e "$(GREEN)✔ Stack removed$(RESET)"

# ── Build ────────────────────────────────────────────────────────────────

build: ## Build for production
	@echo -e "$(CYAN)Building playground…$(RESET)"
	npx tsc --noEmit && npx vite build
	@echo -e "$(GREEN)✔ Built to ./build$(RESET)"

typecheck: ## Run TypeScript type-checking
	@echo -e "$(CYAN)Type-checking…$(RESET)"
	npx tsc --noEmit
	@echo -e "$(GREEN)✔ No type errors$(RESET)"

# ── Analysis & Quality ──────────────────────────────────────────────────

lint: ## Run ESLint with zero-tolerance for warnings
	@echo -e "$(CYAN)Linting all source files…$(RESET)"
	npx eslint src/ --max-warnings=0
	@echo -e "$(GREEN)✔ No lint errors$(RESET)"

lint-fix: ## Automatically fix linting errors where possible
	@echo -e "$(CYAN)Fixing lint errors…$(RESET)"
	npx eslint src/ --fix
	@echo -e "$(GREEN)✔ Lint fix complete$(RESET)"

sonar: ## Run SonarQube Scan (requires SonarQube container up)
	@echo -e "$(CYAN)Step: SonarQube Scan…$(RESET)"
	@if [ "$$(docker ps -q -f name=sonarqube)" ]; then \
		echo -e "$(CYAN)Running Sonar scanner…$(RESET)"; \
		npx sonar-scanner || echo -e "$(RED)✘ Sonar scan failed$(RESET)"; \
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
	@if [ "$$(docker ps -q -f name=sonarqube)" ]; then \
		echo -e "$(CYAN)Running Sonar scanner…$(RESET)"; \
		# Comando para ejecutar el scanner (ajusta la ruta si tienes sonar-scanner local) \
		npx sonar-scanner || echo -e "$(RED)✘ Sonar scan failed$(RESET)"; \
	else \
		echo -e "$(YELLOW)⚠ SonarQube container not running, skipping scan$(RESET)"; \
	fi

ci: typecheck lint ## Run the same checks as GitHub Actions locally

# ── Database ─────────────────────────────────────────────────────────────

db-up: ## Start only MongoDB
	$(DC) up -d mongodb
	@echo -e "$(GREEN)✔ MongoDB running on :$${MONGO_PORT:-27017}$(RESET)"

db-shell: ## Open mongosh in the running MongoDB container
	$(DC) exec mongodb mongosh -u $${MONGO_USER:-notion_user} -p $${MONGO_PASS:-notion_pass} --authenticationDatabase admin $${MONGO_DB:-playground_db}

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
	rm -rf build node_modules .vite
	@echo -e "$(GREEN)✔ Cleaned$(RESET)"

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
	@git submodule update --init --recursive --remote
	@echo -e "$(GREEN)✔ Submodules updated$(RESET)"

.PHONY: help install dev dev-docker up stop down build typecheck \
        db-up db-shell db-reset re clean logs logs-vite logs-mongo \
        kill-ports status lint lint-fix audit ci sonar update-submodules
