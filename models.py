import os
import time
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

llm = None  # Gemma-4-E2B for all tasks


class _RemoteModel:
    """Thin wrapper around a llama.cpp server that mimics llama-cpp-python's
    create_chat_completion interface."""

    def __init__(self, base_url: str, model_name: str):
        import httpx
        self._client = httpx.Client(base_url=base_url, timeout=120)
        self._model = model_name

    def create_chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        payload = {"model": self._model, "messages": messages, **kwargs}
        resp = self._client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()
        return resp.json()


def _is_cached(repo_id: str, filename: str) -> bool:
    from huggingface_hub import try_to_load_from_cache
    result = try_to_load_from_cache(repo_id=repo_id, filename=filename)
    return result is not None and result != "does_not_exist"


def _load_local(repo_id: str, filename: str, n_gpu_layers: int, label: str):
    from llama_cpp import Llama
    if not _is_cached(repo_id, filename):
        logger.info(f"Downloading {label} — this may take a few minutes...")
    else:
        logger.info(f"Loading {label}...")
    t0 = time.time()
    model = Llama.from_pretrained(
        repo_id=repo_id,
        filename=filename,
        n_ctx=4096,
        n_gpu_layers=n_gpu_layers,
        use_mmap=True,
        use_mlock=False,
        verbose=False,
    )
    logger.info(f"{label} loaded in {time.time() - t0:.1f}s")
    return model


def initialize_model():
    global llm

    gemma_api = os.getenv("GEMMA_API_BASE")
    n_gpu_layers = 0 if os.getenv("NO_GPU", "").lower() in ("1", "true", "yes") else -1

    _GEMMA_VARIANTS = {
        "sm": ("dahus/gemma-4-e2b-it-Q3_K_M-GGUF", "gemma-4-e2b-Q3_K_M.gguf", "Gemma-4-E2B Q3_K_M (~2.4GB)"),
        "md": ("lmstudio-community/gemma-4-E2B-it-GGUF", "gemma-4-E2B-it-Q4_K_M.gguf", "Gemma-4-E2B Q4_K_M (~3.2GB)"),
        "lg": ("lmstudio-community/gemma-4-E2B-it-GGUF", "gemma-4-E2B-it-Q6_K.gguf", "Gemma-4-E2B Q6_K (~4.2GB)"),
    }
    quant = os.getenv("GEMMA_QUANT", "sm").lower()
    repo_id, filename, label = _GEMMA_VARIANTS.get(quant, _GEMMA_VARIANTS["sm"])

    if gemma_api:
        logger.info(f"Gemma backend: {gemma_api}")
        llm = _RemoteModel(gemma_api, "gemma")
    else:
        logger.info(f"Gemma backend: local ({'GPU' if n_gpu_layers else 'CPU'})")
        llm = _load_local(repo_id, filename, n_gpu_layers, label)
