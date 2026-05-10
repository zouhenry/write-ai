import os
import time
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

llm = None


class _RemoteModel:
    """Thin wrapper around a llama.cpp server that mimics llama-cpp-python's
    create_chat_completion interface."""

    def __init__(self, base_url: str, model_name: str):
        import httpx
        self._client = httpx.Client(base_url=base_url, timeout=120)
        self._async_client = httpx.AsyncClient(base_url=base_url, timeout=120)
        self._model = model_name

    def create_chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        payload = {"model": self._model, "messages": messages, **kwargs}
        resp = self._client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def create_chat_completion_stream(self, messages: List[Dict], **kwargs):
        """Yields raw SSE lines from the upstream server."""
        payload = {"model": self._model, "messages": messages, "stream": True, **kwargs}
        async with self._async_client.stream("POST", "/v1/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                yield line


def _is_cached(repo_id: str, filename: str) -> bool:
    from huggingface_hub import try_to_load_from_cache
    result = try_to_load_from_cache(repo_id=repo_id, filename=filename)
    return result is not None and result != "does_not_exist"


def _load_local(repo_id: str, filename: str, n_gpu_layers: int, n_ctx: int, label: str):
    from llama_cpp import Llama
    if not _is_cached(repo_id, filename):
        logger.info(f"Downloading {label} — this may take a few minutes...")
    else:
        logger.info(f"Loading {label}...")
    t0 = time.time()
    model = Llama.from_pretrained(
        repo_id=repo_id,
        filename=filename,
        n_ctx=n_ctx,
        n_gpu_layers=n_gpu_layers,
        use_mmap=True,
        use_mlock=False,
        verbose=False,
    )
    logger.info(f"{label} loaded in {time.time() - t0:.1f}s")
    return model


def initialize_model():
    global llm

    api_base = os.getenv("LLM_API_BASE")
    n_gpu_layers = 0 if os.getenv("NO_GPU", "").lower() in ("1", "true", "yes") else -1

    _MODEL_VARIANTS = {
        "sm": ("dahus/gemma-4-e2b-it-Q3_K_M-GGUF", "gemma-4-e2b-Q3_K_M.gguf", 4096,  "Gemma-4-E2B Q3_K_M (~2.4GB)"),
        "md": ("lmstudio-community/gemma-4-E2B-it-GGUF", "gemma-4-E2B-it-Q4_K_M.gguf", 8192,  "Gemma-4-E2B Q4_K_M (~3.2GB)"),
        "lg": ("lmstudio-community/gemma-4-E2B-it-GGUF", "gemma-4-E2B-it-Q6_K.gguf",   16384, "Gemma-4-E2B Q6_K (~4.2GB)"),
    }
    size = os.getenv("MODEL_SIZE", "sm").lower()
    repo_id, filename, n_ctx, label = _MODEL_VARIANTS.get(size, _MODEL_VARIANTS["sm"])

    if api_base:
        remote_model_name = os.getenv("LLM_MODEL_NAME", "model")
        logger.info(f"LLM backend: {api_base} (model: {remote_model_name})")
        llm = _RemoteModel(api_base, remote_model_name)
    else:
        logger.info(f"LLM backend: local ({'GPU' if n_gpu_layers else 'CPU'})")
        llm = _load_local(repo_id, filename, n_gpu_layers, n_ctx, label)
