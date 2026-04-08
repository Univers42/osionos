SHELL := /bin/bash
ROOT  := $(realpath $(dir $(lastword $(MAKEFILE_LIST)))/..)
-include $(ROOT)/.env
export

CYAN  := \033[36m
GREEN := \033[32m
RED   := \033[31m
RESET := \033[0m

DC := docker compose -f $(ROOT)/docker-compose.yml

.DEFAULT_GOAL := help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "$(CYAN)%-22s$(RESET) %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────────────────────

dev: ## Start playground stack (Vite :3001 + API :4000 + Mongo)
	@echo -e "$(CYAN)Starting playground on http://localhost:3001$(RESET)"
	cd $(ROOT) && $(DC) up -d mongodb api playground
	@echo "Waiting for API to become healthy…"
	@until docker inspect --format='{{.State.Health.Status}}' notion_api 2>/dev/null | grep -q healthy; do sleep 2; done
	@echo -e "$(GREEN)✔ API ready$(RESET)"
	@$(MAKE) check-seed --no-print-directory
	@echo -e "$(GREEN)✔ Stack up — tailing playground logs (Ctrl-C to stop)$(RESET)"
	@trap '$(MAKE) -C $(ROOT)/playground stop --no-print-directory' EXIT; \
	 cd $(ROOT) && $(DC) logs -f --tail=10 playground || true

dev-d: ## Start playground stack (detached)
	cd $(ROOT) && $(DC) up -d mongodb api playground
	@echo -e "$(GREEN)✔ playground stack running (detached)$(RESET)"

stop: ## Stop playground stack
	cd $(ROOT) && $(DC) stop playground api mongodb
	@echo -e "$(GREEN)✔ playground stack stopped$(RESET)"

# ── Build (destroy volumes, rebuild, seed) ───────────────────────────────

build: ## Full rebuild: destroy volumes, rebuild images, start + seed
	@echo -e "$(CYAN)══ playground: Full rebuild ══$(RESET)"
	cd $(ROOT) && $(DC) down -v --remove-orphans 2>/dev/null || true
	cd $(ROOT) && $(MAKE) build-app --no-print-directory
	cd $(ROOT) && $(DC) up -d mongodb api playground
	@sleep 2
	@$(MAKE) seed --no-print-directory
	@echo -e "$(GREEN)══ playground: Build complete ══$(RESET)"

# ── Seed ─────────────────────────────────────────────────────────────────

API_URL := http://localhost:$${API_PORT:-4000}

check-seed: ## Verify whether the DB has been seeded; warn if not
	@status=$$(curl -s -o /dev/null -w '%{http_code}' -X POST $(API_URL)/api/auth/login \
	  -H 'Content-Type: application/json' \
	  -d '{"email":"admin@playground.local","password":"playground123"}' 2>/dev/null); \
	if [ "$$status" = "200" ]; then \
	  echo -e "$(GREEN)✔ Database already seeded$(RESET)"; \
	else \
	  echo -e "$(RED)⚠  Database is NOT seeded — playground will run in offline mode (no persistence).$(RESET)"; \
	  echo -e "$(RED)   Run $(CYAN)make seed$(RED) first to enable persistent storage.$(RESET)"; \
	fi

seed: ## Seed MongoDB with playground data (3 users + workspaces)
	@echo -e "$(CYAN)Seeding playground data…$(RESET)"
	cd $(ROOT) && $(DC) exec api node scripts/seed-playground.mjs
	@echo -e "$(GREEN)✔ Playground seeded$(RESET)"

# ── Reset ────────────────────────────────────────────────────────────────

re: ## Full restart: wipe DBs, re-seed
	@echo -e "$(CYAN)══ playground: Full restart ══$(RESET)"
	@echo "1/3  Stopping containers…"
	cd $(ROOT) && $(DC) down -v --remove-orphans
	@echo "2/3  Starting fresh containers…"
	cd $(ROOT) && $(DC) up -d
	@echo "3/3  Seeding playground database…"
	@sleep 3
	@$(MAKE) seed --no-print-directory
	@echo -e "$(GREEN)══ playground: restart complete ══$(RESET)"

# ── Packages ─────────────────────────────────────────────────────────────

build-packages: ## Build all packages (types → core → api)
	@echo -e "$(CYAN)Building packages…$(RESET)"
	cd $(ROOT) && $(DC) exec playground pnpm turbo run build --filter='./packages/*'
	@echo -e "$(GREEN)✔ All packages built$(RESET)"

logs: ## Tail playground stack logs
	cd $(ROOT) && $(DC) logs -f --tail=50 playground

kill-ports: ## Kill any process occupying playground-related ports (3001, 4000)
	@echo -e "$(CYAN)Killing processes on ports 3001, 4000…$(RESET)"
	@for port in 3001 4000; do \
		pids=$$(lsof -ti :$$port 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "  Killing PID(s) $$pids on :$$port"; \
			echo "$$pids" | xargs kill -9 2>/dev/null || true; \
		else \
			echo "  Port :$$port is free"; \
		fi; \
	done
	@echo -e "$(GREEN)✔ Ports freed$(RESET)"

.PHONY: help dev dev-d stop build check-seed seed re build-packages logs kill-ports
