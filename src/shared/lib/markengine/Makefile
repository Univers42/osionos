SHELL := /usr/bin/bash
.SHELLFLAGS := -ec

BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RESET := \033[0m
CYAN := \033[0;36m
ORANGE := \033[0;31m
RED := \033[0;31m
SUCCESS := $(GREEN)✓
FAIL := $(RED)✗
INFO := $(CYAN)ℹ
WARN := $(YELLOW)⚠

TS_FILES := markdown.ts src/*.ts
PYTHON_FILES := md-to-pdf.py
TSC := tsc
PYTHON := python3
NODE := node
DOCKER := docker
COMPOSE := $(DOCKER) compose

.PHONY: help check lint typecheck py-check build test clean pdf playground docker-build docker-rm docker-prod docker-dev docker-stop
.DEFAULT_GOAL := help

help: ## Show available targets
	@echo -e "$(CYAN)List of available targets$(RESET)"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*## .*$$' Makefile | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

typecheck: ## Type-check the TypeScript sources
	@echo -e "$(INFO) Running TypeScript type checks...$(RESET)"
	@$(TSC) --noEmit -p tsconfig.json
	@echo -e "$(SUCCESS) TypeScript type checks passed$(RESET)"

py-check: ## Syntax-check the Python tooling
	@echo -e "$(INFO) Running Python syntax checks...$(RESET)"
	@$(PYTHON) -m py_compile $(PYTHON_FILES)
	@echo -e "$(SUCCESS) Python syntax checks passed$(RESET)"

lint: ## Run the available code-quality checks
	@echo -e "$(INFO) Running lint checks...$(RESET)"
	@$(MAKE) -s typecheck
	@$(MAKE) -s py-check
	@echo -e "$(SUCCESS) Lint checks passed$(RESET)"

check: ## Run all validation checks
	@echo -e "$(INFO) Running validation checks...$(RESET)"
	@$(MAKE) -s lint
	@$(MAKE) -s test
	@echo -e "$(SUCCESS) Validation complete$(RESET)"

build: ## Compile the TypeScript engine to dist/
	@echo -e "$(INFO) Building the engine...$(RESET)"
	@rm -rf dist
	@$(TSC) -p tsconfig.json --outDir dist --module commonjs --declaration false --target ES2020
	@echo -e "$(SUCCESS) Build complete$(RESET)"

test: ## Build the engine and run the test suite
	@echo -e "$(INFO) Running tests...$(RESET)"
	@$(MAKE) -s build
	@$(NODE) --test tests/*.test.js
	@echo -e "$(SUCCESS) All tests passed$(RESET)"

playground: ## Start the markdown playground server on PORT=3000
	@echo -e "$(INFO) Starting markdown playground server...$(RESET)"
	@$(MAKE) -s build
	@$(NODE) playground/server.js

docker-build: ## Build the Docker images for production and development
	@echo -e "$(INFO) Building Docker images...$(RESET)"
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

pdf: ## Build a PDF from a Markdown document (usage: make pdf INPUT=README.md [ARGS='...'])
	@if [[ -z "$(INPUT)" ]]; then \
		echo -e "$(RED)✗$(RESET) Set INPUT=path/to/file.md"; \
		exit 1; \
	fi
	@$(PYTHON) md-to-pdf.py "$(INPUT)" $(ARGS)

clean: ## Remove common build and cache artifacts
	@echo -e "$(INFO) Cleaning build and cache artifacts...$(RESET)"
	@rm -rf .pytest_cache .mypy_cache .ruff_cache .mermaid-cache __pycache__ src/__pycache__
	@echo -e "$(SUCCESS) Clean complete$(RESET)"
