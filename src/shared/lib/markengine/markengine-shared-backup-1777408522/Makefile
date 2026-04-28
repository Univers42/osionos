SHELL := /usr/bin/bash
.SHELLFLAGS := -ec

GREEN := \033[0;32m
YELLOW := \033[0;33m
RESET := \033[0m
CYAN := \033[0;36m
RED := \033[0;31m
SUCCESS := $(GREEN)✓
INFO := $(CYAN)ℹ
WARN := $(YELLOW)⚠

PYTHON_FILES := md-to-pdf.py
NPM := npm
TSC := $(NPM) exec tsc --
PYTHON := python3
NODE := node
DOCKER := docker
COMPOSE := $(DOCKER) compose

.PHONY: \
	help setup deps reinstall doctor \
	build-engine run-ci build dev start playground preview test typecheck py-check lint check ci \
	pdf clean clean-all \
	docker-build docker-prod docker-dev docker-stop docker-rm docker-logs
.DEFAULT_GOAL := help

help: ## Show available targets
	@echo -e "$(CYAN)List of available targets$(RESET)"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*## .*$$' Makefile | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

setup: deps ## Bootstrap local environment
	@echo -e "$(SUCCESS) Setup complete$(RESET)"

deps: ## Install project dependencies
	@echo -e "$(INFO) Installing npm dependencies...$(RESET)"
	@$(NPM) install
	@echo -e "$(SUCCESS) Dependencies installed$(RESET)"

reinstall: ## Reinstall dependencies from scratch
	@echo -e "$(INFO) Reinstalling dependencies from scratch...$(RESET)"
	@rm -rf node_modules
	@$(NPM) install
	@echo -e "$(SUCCESS) Reinstall complete$(RESET)"

doctor: ## Verify required tooling and key files
	@echo -e "$(INFO) Running environment checks...$(RESET)"
	@command -v $(NPM) >/dev/null || { echo -e "$(RED)npm not found$(RESET)"; exit 1; }
	@command -v $(DOCKER) >/dev/null || echo -e "$(WARN) Docker not found (docker targets unavailable)$(RESET)"
	@test -f package.json || { echo -e "$(RED)package.json not found$(RESET)"; exit 1; }
	@test -f tsconfig.json || { echo -e "$(RED)tsconfig.json not found$(RESET)"; exit 1; }
	@echo -e "$(SUCCESS) Environment checks passed$(RESET)"

build-engine: ## Compile only the markdown engine to dist/
	@echo -e "$(INFO) Building TypeScript engine...$(RESET)"
	@$(NPM) run build:engine
	@echo -e "$(SUCCESS) Engine build complete$(RESET)"

typecheck: ## Type-check the TypeScript sources
	@echo -e "$(INFO) Running TypeScript type checks...$(RESET)"
	@$(TSC) --noEmit -p tsconfig.json
	@echo -e "$(SUCCESS) TypeScript type checks passed$(RESET)"

py-check: ## Syntax-check the Python tooling
	@if [[ ! -f "$(PYTHON_FILES)" ]]; then \
		echo -e "$(WARN) $(PYTHON_FILES) not found; skipping Python checks$(RESET)"; \
	else \
		echo -e "$(INFO) Running Python syntax checks...$(RESET)"; \
		$(PYTHON) -m py_compile $(PYTHON_FILES); \
		echo -e "$(SUCCESS) Python syntax checks passed$(RESET)"; \
	fi

lint: ## Run the available code-quality checks
	@echo -e "$(INFO) Running lint checks...$(RESET)"
	@$(MAKE) -s typecheck
	@$(MAKE) -s py-check
	@echo -e "$(SUCCESS) Lint checks passed$(RESET)"

check: ## Run all validation checks
	@echo -e "$(INFO) Running validation checks...$(RESET)"
	@$(MAKE) -s doctor
	@$(MAKE) -s deps
	@$(MAKE) -s lint
	@$(MAKE) -s typecheck
	@$(MAKE) -s test
	@echo -e "$(SUCCESS) Validation complete$(RESET)"

run-ci: ## Run all checks without extra output (for CI pipelines)
	@$(MAKE) -s lint
	@$(MAKE) -s typecheck
	@echo -e "$(SUCCESS) CI checks passed$(RESET)"

build: ## Build engine + Vite assets
	@echo -e "$(INFO) Building project...$(RESET)"
	@$(NPM) run build:engine
	@$(NPM) exec vite build -- --emptyOutDir false
	@echo -e "$(SUCCESS) Project build complete$(RESET)"

test: ## Build the engine and run the test suite
	@echo -e "$(INFO) Running tests...$(RESET)"
	@$(MAKE) -s build-engine
	@$(NODE) --test tests/*.test.js
	@echo -e "$(SUCCESS) All tests passed$(RESET)"

dev: ## Start playground in dev mode (Vite + TS watch)
	@echo -e "$(INFO) Starting playground in dev mode...$(RESET)"
	@$(NPM) run dev

playground: dev ## Alias for dev playground

start: ## Start built playground preview server
	@echo -e "$(INFO) Starting playground preview...$(RESET)"
	@$(NPM) run start

preview: start ## Alias for start

ci: ## Run CI-equivalent pipeline
	@$(MAKE) -s check
	@$(MAKE) -s build

docker-build: ## Build the Docker images for production and development
	@echo -e "$(INFO) Building Docker images...$(RESET)"
	@$(MAKE) -s doctor
	@$(COMPOSE) build prod dev
	@echo -e "$(SUCCESS) Docker images built$(RESET)"

docker-prod: ## Run the production Docker container
	@echo -e "$(INFO) Starting production container...$(RESET)"
	@$(COMPOSE) up -d prod
	@echo -e "$(SUCCESS) Production container started$(RESET)"

docker-dev: ## Run the development Docker container with live restarts
	@echo -e "$(INFO) Starting development container with live restarts...$(RESET)"
	@$(COMPOSE) up -d --build dev
	@echo -e "$(SUCCESS) Development container started$(RESET)"

docker-stop: ## Stop Docker containers
	@echo -e "$(INFO) Stopping Docker containers...$(RESET)"
	@$(COMPOSE) down
	@echo -e "$(SUCCESS) Docker containers stopped$(RESET)"

docker-rm: ## Remove Docker images built by compose
	@echo -e "$(INFO) Removing Docker images and volumes...$(RESET)"
	@$(COMPOSE) down --rmi all --volumes --remove-orphans
	@echo -e "$(SUCCESS) Docker cleanup complete$(RESET)"

docker-logs: ## Tail compose logs (usage: make docker-logs [SERVICE=dev])
	@$(COMPOSE) logs -f --tail=200 $(SERVICE)

pdf: ## Build a PDF from a Markdown document (usage: make pdf INPUT=README.md [ARGS='...'])
	@if [[ ! -f "$(PYTHON_FILES)" ]]; then \
		echo -e "$(RED)$(PYTHON_FILES) not found$(RESET)"; \
		exit 1; \
	fi
	@if [[ -z "$(INPUT)" ]]; then \
		echo -e "$(RED)Set INPUT=path/to/file.md$(RESET)"; \
		exit 1; \
	fi
	@$(PYTHON) md-to-pdf.py "$(INPUT)" $(ARGS)

clean: ## Remove common build and cache artifacts
	@echo -e "$(INFO) Cleaning build and cache artifacts...$(RESET)"
	@rm -rf dist .vite .pytest_cache .mypy_cache .ruff_cache .mermaid-cache __pycache__ src/__pycache__
	@echo -e "$(SUCCESS) Clean complete$(RESET)"

clean-all: clean ## Remove build artifacts and dependencies
	@echo -e "$(INFO) Removing node_modules and lock caches...$(RESET)"
	@rm -rf node_modules
	@echo -e "$(SUCCESS) Full cleanup complete$(RESET)"
