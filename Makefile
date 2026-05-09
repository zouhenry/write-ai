.PHONY: help run run-no-gpu dev dev-no-gpu install install-compile build-wheel-gpu build-wheel-cpu lint format format-ui clean clean-venv health check

VENV := .venv
PYTHON := $(VENV)/bin/python3
PIP := $(VENV)/bin/pip
WHEELS_DIR := wheels

help:
	@echo "WriteAI Makefile commands:"
	@echo ""
	@echo "Local Development:"
	@echo "  make install          - Install dependencies (uses pre-built wheel if compatible)"
	@echo "  make install-compile  - Compile llama-cpp-python from source with Metal/GPU support"
	@echo "  make dev              - Run with auto-reload (development, GPU)"
	@echo "  make dev-no-gpu       - Run with auto-reload (development, CPU only)"
	@echo "  make run              - Run the FastAPI server (production, GPU)"
	@echo "  make run-no-gpu       - Run the FastAPI server (production, CPU only)"
	@echo "  make health           - Check server health"
	@echo "  make check            - Verify environment is set up correctly"
	@echo ""
	@echo "Wheel Building (maintainers):"
	@echo "  make build-wheel-gpu  - Build llama-cpp-python wheel with Metal/GPU support"
	@echo "  make build-wheel-cpu  - Build llama-cpp-python wheel without GPU support"
	@echo ""
	@echo "Docker Deployment:"
	@echo "  make docker-up        - Build and start Docker container"
	@echo "  make docker-down      - Stop Docker container"
	@echo "  make docker-logs      - View Docker container logs"
	@echo "  make docker-build     - Rebuild Docker image"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint             - Lint Python code"
	@echo "  make format           - Format Python code with black"
	@echo "  make format-ui        - Format JS/CSS/HTML in writeai/static with prettier"
	@echo "  make clean            - Remove cache files"
	@echo "  make clean-venv       - Remove virtual environment"

$(VENV)/bin/activate:
	python3 -m venv $(VENV)

install: $(VENV)/bin/activate
	$(PIP) install --upgrade pip
	$(PIP) install --find-links $(WHEELS_DIR) -r requirements.txt
	@echo "✓ Virtual environment ready. Run 'source .venv/bin/activate' to use it."

install-compile: $(VENV)/bin/activate
	$(PIP) install --upgrade pip
	CMAKE_ARGS="-DGGML_METAL=on" $(PIP) install llama-cpp-python==0.3.22 --no-binary llama-cpp-python
	$(PIP) install -r requirements.txt
	@echo "✓ Compiled and installed with Metal/GPU support."

build-wheel-gpu: $(VENV)/bin/activate
	@mkdir -p $(WHEELS_DIR)
	CMAKE_ARGS="-DGGML_METAL=on" $(PIP) wheel llama-cpp-python==0.3.22 --no-binary llama-cpp-python -w $(WHEELS_DIR)
	@echo "✓ GPU wheel built in $(WHEELS_DIR)/"

build-wheel-cpu: $(VENV)/bin/activate
	@mkdir -p $(WHEELS_DIR)
	$(PIP) wheel llama-cpp-python==0.3.22 --no-binary llama-cpp-python -w $(WHEELS_DIR)
	@echo "✓ CPU wheel built in $(WHEELS_DIR)/"

run: $(VENV)/bin/activate
	$(PYTHON) main.py

run-no-gpu: $(VENV)/bin/activate
	NO_GPU=1 $(PYTHON) main.py

dev: $(VENV)/bin/activate
	$(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-no-gpu: $(VENV)/bin/activate
	NO_GPU=1 $(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

check:
	@echo "=== WriteAI Environment Check ==="
	@echo ""
	@printf "Python version:       "; python3 --version 2>&1
	@python3 -c "import sys; code=0 if sys.version_info>=(3,10) else 1; print('  status: OK' if code==0 else '  status: FAIL — need 3.10+')" && \
	 python3 -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)"
	@echo ""
	@printf "Virtual environment:  "
	@if [ -f "$(VENV)/bin/activate" ]; then echo "$(VENV)/ (OK)"; else echo "MISSING — run: make install"; fi
	@echo ""
	@printf "llama-cpp-python:     "
	@$(PYTHON) -c "import llama_cpp; print('OK (' + llama_cpp.__version__ + ')')" 2>/dev/null || echo "MISSING — run: make install"
	@echo ""
	@printf "HuggingFace cache:    "
	@$(PYTHON) -c "\
from huggingface_hub import try_to_load_from_cache; \
models = [('qingy2024/GRMR-V3-G4B-GGUF','GRMR-V3-G4B-Q8_0.gguf'), ('Qwen/Qwen2.5-1.5B-Instruct-GGUF','qwen2.5-1.5b-instruct-q8_0.gguf')]; \
cached = [f for r,f in models if try_to_load_from_cache(repo_id=r,filename=f) not in (None,'does_not_exist')]; \
print(f'{len(cached)}/2 models cached' + (' (will download on first run)' if len(cached)<2 else ' (OK)'))" \
	2>/dev/null || echo "MISSING — run: make install"
	@echo ""
	@echo "================================="

health: $(VENV)/bin/activate
	curl -s http://localhost:8000/health | $(PYTHON) -m json.tool

lint: $(VENV)/bin/activate
	$(PYTHON) -m pylint main.py

format: $(VENV)/bin/activate
	$(PYTHON) -m black main.py

format-ui:
	npx prettier --single-quote --write 'writeai/static/**/*.{js,css,html}' --ignore-path ''

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
