import os
import time
import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

llm = None          # GRMR for grammar correction
llm_paraphrase = None  # Qwen for paraphrasing and general chat


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


class _LocalModel:
    """Wraps a local Llama instance to add inference timing."""

    def __init__(self, model, label: str):
        self._model = model
        self._label = label

    def create_chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        return self._model.create_chat_completion(messages=messages, **kwargs)


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
        n_ctx=16384,
        n_gpu_layers=n_gpu_layers,
        verbose=False,
    )
    logger.info(f"{label} loaded in {time.time() - t0:.1f}s")
    return model


def initialize_model():
    global llm, llm_paraphrase

    grmr_api = os.getenv("GRMR_API_BASE")
    qwen_api = os.getenv("QWEN_API_BASE")
    n_gpu_layers = 0 if os.getenv("NO_GPU", "").lower() in ("1", "true", "yes") else -1

    def load_grmr():
        if grmr_api:
            logger.info(f"GRMR backend: {grmr_api}")
            return _RemoteModel(grmr_api, "grmr")
        logger.info(f"GRMR backend: local ({'GPU' if n_gpu_layers else 'CPU'})")
        return _LocalModel(_load_local("qingy2024/GRMR-V3-G4B-GGUF", "GRMR-V3-G4B-Q8_0.gguf", n_gpu_layers, "GRMR model (~4GB)"), "grmr")

    def load_qwen():
        if qwen_api:
            logger.info(f"Qwen backend: {qwen_api}")
            model_name = "ai/qwen2.5:1.5B-F16" if "model-runner.docker.internal" in qwen_api else "qwen"
            return _RemoteModel(qwen_api, model_name)
        logger.info(f"Qwen backend: local ({'GPU' if n_gpu_layers else 'CPU'})")
        return _LocalModel(_load_local("Qwen/Qwen2.5-1.5B-Instruct-GGUF", "qwen2.5-1.5b-instruct-q8_0.gguf", n_gpu_layers, "Qwen model (~2GB)"), "qwen")

    with ThreadPoolExecutor(max_workers=2) as pool:
        grmr_future = pool.submit(load_grmr)
        qwen_future = pool.submit(load_qwen)
        llm = grmr_future.result()
        llm_paraphrase = qwen_future.result()
