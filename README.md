# WriteAI

Grammar correction, paraphrasing, and AI chat powered by fine-tuned LLMs (GRMR + Gemma 4). GPU-accelerated by default, with CPU-only fallback.

> **Note:** Fork of [whiteh4cker-tr/grammar-llm](https://github.com/whiteh4cker-tr/grammar-llm) with PWA deployment, Qwen3.5-0.8B support, and simplified workflows.

![WriteAI](static/img/grammar-llm.png)

## Features

- **Grammar Check**: Real-time correction with writing quality scores (0-100)
- **Paraphrase**: Multiple styles (formal, casual, concise)
- **AI Chat**: Conversational assistant with history
- **PDF Reports**: Download detailed correction reports
- **PWA**: Works offline, installable on desktop/mobile
- **REST API**: Full programmatic access
- **GPU Accelerated**: GPU by default, CPU-only fallback via `NO_GPU=1`

## Getting Started

> **Note:** The first run downloads models (~4.13GB), which can take 10+ minutes depending on your connection. Subsequent runs are instant.

Choose the method that fits your setup:

---

### Option A — `uvx` (no clone needed)

The quickest way to run WriteAI. Requires [uv](https://docs.astral.sh/uv/):

**Install uv** (if you don't have it):
```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# macOS (Homebrew)
brew install uv
```

**Run:**
```bash
uvx --from git+https://github.com/zouhenry/write-ai.git write-ai
```

**Select model size** (`sm` default, `md`, or `lg`):
```bash
MODEL_SIZE=lg uvx --from git+https://github.com/zouhenry/write-ai.git write-ai
```

**Force update to latest version:**
```bash
uvx --refresh --from git+https://github.com/zouhenry/write-ai.git write-ai
```

Then open `http://localhost:8000`

---

### Option B — `pipx` (no clone needed)

Requires [pipx](https://pipx.pypa.io/):

**Install pipx** (if you don't have it):
```bash
# macOS (Homebrew)
brew install pipx

# Any platform
pip install pipx
```

**Run:**
```bash
pipx run --spec git+https://github.com/zouhenry/write-ai.git write-ai
```

**Select model size** (`sm` default, `md`, or `lg`):
```bash
MODEL_SIZE=md pipx run --spec git+https://github.com/zouhenry/write-ai.git write-ai
```

**Force update to latest version:**
```bash
pipx run --no-cache --spec git+https://github.com/zouhenry/write-ai.git write-ai
```

Then open `http://localhost:8000`

---

### Option C — Clone and run

Traditional setup. Requires Python 3.10+ and `make`.

```bash
git clone https://github.com/zouhenry/write-ai.git
cd write-ai
make install
make run
```

A pre-built `llama-cpp-python` wheel for **macOS Apple Silicon** is included in `wheels/`. If you're on that platform, `make install` uses it automatically — no compiler toolchain needed. On other platforms (Linux, Intel Mac, Windows), pip falls back to building from source, which requires `build-essential` / Xcode CLT and takes a few minutes.

Or without `make`:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install --find-links wheels -r requirements.txt
python3 main.py
```

Then open `http://localhost:8000`

**Want to compile from source instead?** (e.g. to enable a specific GPU backend):
```bash
make install-compile   # compiles with Metal/GPU support on Apple Silicon
```

See the [Docker GPU Support](#docker-gpu-support) section for other platform flags.

---

### Option D — Docker

**One-liner (no clone needed):**
```bash
docker pull ghcr.io/zouhenry/write-ai && docker run -p 8000:8000 ghcr.io/zouhenry/write-ai
```

**Or build locally from the cloned repo:**
```bash
make docker-up
```

Then open `http://localhost:8000`

> **Apple Silicon:** Docker Desktop runs a Linux VM with no access to Metal, so Docker is always CPU-only on macOS. For GPU acceleration, run natively with `make run`.

#### Docker GPU Support

To enable GPU in Docker, rebuild `llama-cpp-python` with the appropriate backend in the Dockerfile:

| Platform | Build flag |
|----------|-----------|
| NVIDIA (CUDA) | `CMAKE_ARGS="-DGGML_CUDA=on"` |
| AMD (ROCm) | `CMAKE_ARGS="-DGGML_HIPBLAS=on"` |
| Vulkan | `CMAKE_ARGS="-DGGML_VULKAN=on"` |

For NVIDIA, also add GPU access in `docker-compose.yml`:
```yaml
services:
  grammar-llm:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

## Available Commands

```bash
make install            # Install dependencies (uses pre-built wheel if compatible)
make install-compile    # Compile llama-cpp-python from source (Metal/GPU)
make check              # Verify environment is set up correctly
make dev                # Development server (GPU)
make dev-no-gpu         # Development server (CPU only)
make dev-lm-studio      # Development server, proxying to LM Studio at localhost:1234
make run                # Production server (GPU)
make run-no-gpu         # Production server (CPU only)
make docker-up          # Docker deployment
make docker-down        # Stop Docker
make docker-logs        # View logs
make health             # Health check
make lint               # Lint code
make format             # Format with Black
make help               # Show all commands
```

**Maintainers only** (update wheels in the repo):
```bash
make build-wheel-gpu    # Build llama-cpp-python wheel with Metal support
make build-wheel-cpu    # Build llama-cpp-python wheel without GPU
```

## API Reference

### Grammar Correction
```bash
curl -X POST http://localhost:8000/correct \
  -H "Content-Type: application/json" \
  -d '{"text": "she dont like the apples"}'
```

**Response:**
```json
{
  "suggestions": [
    {
      "original": "she dont like the apples",
      "corrected": "She doesn't like the apples",
      "sentence": "Sentence 1",
      "start_index": 0,
      "end_index": 24,
      "original_highlighted": "...",
      "corrected_highlighted": "..."
    }
  ],
  "corrected_text": "She doesn't like the apples"
}
```

### Paraphrasing
```bash
curl -X POST http://localhost:8000/restructure \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text here"}'
```

Returns: `original`, `corrected`, `formal`, `casual`, `concise`

### Chat
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I improve my writing?", "history": []}'
```

### Health Check
```bash
curl http://localhost:8000/health
```

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/correct` | POST | Grammar correction |
| `/restructure` | POST | Paraphrasing (4 styles) |
| `/chat` | POST | AI conversation |
| `/apply-suggestion` | POST | Apply single correction |
| `/apply-suggestions` | POST | Apply multiple corrections |
| `/health` | GET | Health status |

## Models

A single [Gemma-4-E2B](https://huggingface.co/lmstudio-community/gemma-4-E2B-it-GGUF) model handles all tasks (grammar, paraphrase, chat), run via llama.cpp with GPU acceleration or CPU-only with `NO_GPU=1`.

### Local model size

Select a model size with the `MODEL_SIZE` env var (default: `sm`):

| `MODEL_SIZE` | Size | Notes |
|--------------|------|-------|
| `sm` | ~2.4GB | Default, good for low-memory systems |
| `md` | ~3.2GB | Better quality/size balance |
| `lg` | ~4.2GB | Higher quality, more RAM required |

```bash
make run-sm   # or run-md, run-lg
```

For Docker, edit the `environment` section in `docker-compose.yml`:
```yaml
environment:
  - MODEL_SIZE=sm  # or md, lg
```

### External LLM server (LM Studio, llama.cpp server, Ollama, etc.)

Point WriteAI at any OpenAI-compatible server by setting `LLM_API_BASE`. No local model will be downloaded.

```bash
# Development (auto-reload), LM Studio default port
make dev-lm-studio

# Or set vars manually for any server
LLM_API_BASE=http://localhost:11434 LLM_MODEL_NAME=llama3 make dev
```

| Variable | Description |
|----------|-------------|
| `LLM_API_BASE` | Base URL of the server (e.g. `http://localhost:1234`) |
| `LLM_MODEL_NAME` | Model name to pass in requests (default: `model`) |

**Model cache location:** `~/.cache/huggingface/hub/` — downloaded automatically on first run. In Docker, this directory is bind-mounted from the host so models are never re-downloaded across container rebuilds.

## Troubleshooting

### Changes not appearing in the browser

WriteAI ships as a PWA with a service worker that caches `script.js`, `style.css`, and other static assets. If you update those files and the browser still shows old behavior:

1. **Hard reload:** `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows/Linux)
2. **Or via DevTools:** Application → Service Workers → click "Skip waiting", then reload

If you're shipping a new version of the frontend, bump `CACHE_VERSION` in `writeai/static/sw.js` (e.g. `v1.2` → `v1.3`) to force all clients to fetch fresh assets on their next visit.

## Contributing

Fork → Branch → Change → Test → PR

See [whiteh4cker-tr/grammar-llm](https://github.com/whiteh4cker-tr/grammar-llm) for the original project.

## License

Same as original project. See LICENSE file.
