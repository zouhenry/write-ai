.PHONY: help run run-no-gpu dev dev-no-gpu install lint format clean health

VENV := .venv
PYTHON := $(VENV)/bin/python3
PIP := $(VENV)/bin/pip

help:
	@echo "WriteAI Makefile commands:"
	@echo ""
	@echo "Local Development:"
	@echo "  make install      - Create venv and install dependencies"
	@echo "  make dev          - Run with auto-reload (development, GPU)"
	@echo "  make dev-no-gpu   - Run with auto-reload (development, CPU only)"
	@echo "  make run          - Run the FastAPI server (production, GPU)"
	@echo "  make run-no-gpu   - Run the FastAPI server (production, CPU only)"
	@echo "  make health       - Check server health"
	@echo ""
	@echo "Docker Deployment:"
	@echo "  make docker-up    - Build and start Docker container"
	@echo "  make docker-down  - Stop Docker container"
	@echo "  make docker-logs  - View Docker container logs"
	@echo "  make docker-build - Rebuild Docker image"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Lint Python code"
	@echo "  make format       - Format code with black"
	@echo "  make clean        - Remove cache files"
	@echo "  make clean-venv   - Remove virtual environment"

$(VENV)/bin/activate:
	python3 -m venv $(VENV)

install: $(VENV)/bin/activate
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	@echo "✓ Virtual environment ready. Run 'source .venv/bin/activate' to use it."

run: $(VENV)/bin/activate
	$(PYTHON) main.py

run-no-gpu: $(VENV)/bin/activate
	NO_GPU=1 $(PYTHON) main.py

dev: $(VENV)/bin/activate
	$(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-no-gpu: $(VENV)/bin/activate
	NO_GPU=1 $(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

health: $(VENV)/bin/activate
	curl -s http://localhost:8000/health | $(PYTHON) -m json.tool

lint: $(VENV)/bin/activate
	$(PYTHON) -m pylint main.py

format: $(VENV)/bin/activate
	$(PYTHON) -m black main.py

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true

clean-venv:
	rm -rf $(VENV)

# Docker commands
docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-build:
	docker compose build --no-cache

docker-restart:
	docker compose restart
