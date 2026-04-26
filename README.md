# WriteAI

Grammar correction, paraphrasing, and AI chat powered by fine-tuned LLMs (GRMR + Qwen3.5). GPU-accelerated (GPU) by default, with CPU-only fallback.

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

### Prerequisites

- Python 3.11+
- `make` (optional, but recommended)

### 1. Clone the repository

```bash
git clone https://github.com/zouhenry/write-ai.git
cd write-ai
```

### 2. Install dependencies

```bash
make install
```

Or without `make`:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Run the server

```bash
make dev            # Development server with GPU (auto-reload)
make dev-no-gpu     # Development server CPU-only (auto-reload)
make run            # Production server with GPU
make run-no-gpu     # Production server CPU-only
```

Or without `make`:
```bash
python3 main.py              # GPU (default)
NO_GPU=1 python3 main.py     # CPU only
```

Then open `http://localhost:8000`

**Note:** First run downloads models (~4.13GB). Subsequent runs are instant.

### Docker

```bash
make docker-up  # Build and run in Docker
```

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
make dev            # Development server (GPU)
make dev-no-gpu     # Development server (CPU only)
make run            # Production server (GPU)
make run-no-gpu     # Production server (CPU only)
make docker-up      # Docker deployment
make docker-down    # Stop Docker
make docker-logs    # View logs
make health         # Health check
make install        # Install dependencies
make lint           # Lint code
make format         # Format with Black
make help           # Show all commands
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

**Grammar:** GRMR-V3-G4B (4096 ctx)
**Paraphrase/Chat:** Qwen3.5-0.8B (2048 ctx)

Both quantized to 8-bit, run via llama.cpp with GPU acceleration (or CPU-only with `NO_GPU=1`).

Browse more GGUF models on [Hugging Face](https://huggingface.co/models?search=gguf). To swap a model, update the `repo_id` and `filename` in `main.py`'s `initialize_model()`.

## Contributing

Fork → Branch → Change → Test → PR

See [whiteh4cker-tr/grammar-llm](https://github.com/whiteh4cker-tr/grammar-llm) for the original project.

## License

Same as original project. See LICENSE file.
