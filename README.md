# WriteAI

Grammar correction, paraphrasing, and AI chat powered by fine-tuned LLMs (GRMR + Qwen3.5). No GPU required.

> **Note:** Fork of [whiteh4cker-tr/grammar-llm](https://github.com/whiteh4cker-tr/grammar-llm) with PWA deployment, Qwen3.5-0.8B support, and simplified workflows.

## Features

- **Grammar Check**: Real-time correction with writing quality scores (0-100)
- **Paraphrase**: Multiple styles (formal, casual, concise)
- **AI Chat**: Conversational assistant with history
- **PDF Reports**: Download detailed correction reports
- **PWA**: Works offline, installable on desktop/mobile
- **REST API**: Full programmatic access
- **CPU-only**: No GPU required

## Quick Start

### Local Development
```bash
make install    # Create virtual environment
make dev        # Run dev server (auto-reload)
```

### Docker
```bash
make docker-up  # Build and run in Docker
```

Then open `http://localhost:8000`

**Note:** First run downloads models (~4.13GB). Subsequent runs are instant.

## Available Commands

```bash
make dev            # Development server
make run            # Production server
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

Both quantized to 8-bit, run on CPU via llama.cpp.

## Installation Details

1. Clone:
```bash
git clone https://github.com/zouhenry/write-ai.git
cd write-ai
```

2. Run:
```bash
make install
make dev
```

## Contributing

Fork → Branch → Change → Test → PR

See [whiteh4cker-tr/grammar-llm](https://github.com/whiteh4cker-tr/grammar-llm) for the original project.

## License

Same as original project. See LICENSE file.
