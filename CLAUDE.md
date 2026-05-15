# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (uses pre-built wheels from wheels/)
make install

# Development server with auto-reload (GPU, default model size)
make dev

# Development server variants
make dev-sm          # small model (~2.4GB, Q3)
make dev-md          # medium model (~3.2GB, Q4)
make dev-lg          # large model (~4.2GB, Q6)
make dev-no-gpu      # CPU-only
make dev-lm-studio   # remote model via LM Studio at localhost:1234

# Run tests
.venv/bin/python -m pytest tests/

# Run a single test file
.venv/bin/python -m pytest tests/test_prompt_gen.py -v

# Run a single test
.venv/bin/python -m pytest tests/test_prompt_gen.py::test_prompt_gen_interrogation_turn -v

# Lint and format Python
make lint
make format

# Format frontend (JS/CSS/HTML via prettier)
make format-ui
```

## Architecture

WriteAI is a FastAPI app serving a Vue 3 SPA. There is no frontend build step — Vue is loaded via ESM CDN, and all JS is native ES modules served as static files.

### Backend (`main.py`, `models.py`, `text_processing.py`)

- **`main.py`** — All FastAPI routes and Pydantic models. Endpoints: `POST /correct`, `POST /restructure`, `POST /chat`, `POST /chat/stream` (SSE), `POST /prompt-gen`, and helpers (`/apply-suggestion`, `/apply-suggestions`).
- **`models.py`** — LLM lifecycle. `models.llm` is a global that is either a `llama_cpp.Llama` instance (local) or a `_RemoteModel` wrapper (when `LLM_API_BASE` env var is set). Both expose `create_chat_completion(messages, **kwargs)`. Only local models have `create_chat_completion_stream`. Model size is controlled by `MODEL_SIZE` env var (`sm`/`md`/`lg`); GPU is disabled by `NO_GPU=1`.
- **`text_processing.py`** — Sentence splitting and diff utilities for the grammar tab. Not AI-dependent.

Tests mock `models.llm` directly (see `tests/conftest.py` — autouse fixture resets `models.llm` after each test).

### Frontend (`writeai/static/`)

The app is a single `index.html` with four tabs managed by a root Vue `App` component in `main.js`. Active tab is persisted in `localStorage` and the URL hash.

**Tab components** (`components/`):
- `GrammarTab.js` — grammar correction with sentence-level suggestions and PDF export
- `ParaphraseTab.js` — calls `/restructure`, shows formal/casual/concise variants
- `ChatTab.js` — AI chat with persistent conversation history (sidebar + messages panel)
- `PromptGenTab.js` — prompt engineering wizard with persistent history (sidebar + messages panel)

**Shared components:**
- `ChatSidebar.js` — reused by both `ChatTab` and `PromptGenTab`; pure UI, emits `select`/`delete`/`new-chat`
- `ChatMessages.js` — reused by both tabs; accepts `endpoint`, `streaming`, `rawInput`, `useCase`, and `storageAdapter` props. Streaming mode (`streaming: true`, default) uses SSE for `/chat/stream`. Non-streaming mode (`streaming: false`) calls `/prompt-gen` and renders `isGenerated` prompt blocks with a copy button

**State and storage (`utils/storage.js`):**
- Chat tab uses module-level functions (key: `grammarLlmConversations`)
- Prompt Gen tab uses `createStorageAdapter('promptGenConversations', 'promptGenActiveId')` — a factory that returns the same interface scoped to different keys
- `ChatMessages` receives a `storageAdapter` prop (defaults to the Chat tab's global functions) so writes always go to the correct key

**Composables** (`composables/`): `useTheme`, `useApiStatus`, `usePwa` — loaded by the root `App`.

### `/prompt-gen` endpoint contract

Request: `{ raw_input, use_case, history: [{role, content}], phase: "interrogation" }`  
Response: `{ phase: "interrogation" | "generation", message: string }`

The backend always drives phase transitions — the client always sends `phase: "interrogation"`. When the model determines all required fields are collected, it returns `phase: "generation"` with the final structured prompt. `SYSTEM_PROMPTS` in `main.py` defines the per-use-case prompt and required fields (coding, remix_architect, creative_writing, data_analysis, summarization, general).

### Deployment

Docker is the deployment target (`docker-compose.yml`, `Dockerfile`). `fly.toml` is stale and not used.
