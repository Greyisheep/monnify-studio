# Monnify Studio - shortcuts. The one that matters is `make up`.
.DEFAULT_GOAL := help

.PHONY: help up down logs test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'

up: ## Start the whole studio at http://localhost:3000 (same as: docker compose up)
	docker compose up --build

down: ## Stop everything
	docker compose down

logs: ## Tail logs
	docker compose logs -f

test: ## Run the backend suite (170+ tests, no keys needed)
	cd apps/api && uv run pytest -q
