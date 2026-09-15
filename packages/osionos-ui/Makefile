# Standalone library targets. `make` with no argument prints this list.
.DEFAULT_GOAL := help
.PHONY: help install typecheck lint test tokens check clean

help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dev dependencies
	npm install

typecheck: ## Type-check the sources
	npm run typecheck

lint: typecheck ## Alias: the type checker is the lint gate here

test: ## Run the unit tests
	npm test

tokens: ## Verify tokens.css matches the tokens the kit actually reads
	npm run check:tokens

check: typecheck test tokens ## Everything CI runs

clean: ## Remove build and dependency artifacts
	rm -rf node_modules dist coverage
