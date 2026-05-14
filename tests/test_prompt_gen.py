import pytest
from pydantic import ValidationError


def test_prompt_gen_request_defaults():
    from main import PromptGenRequest
    req = PromptGenRequest(raw_input="make my API faster", use_case="coding")
    assert req.history == []
    assert req.phase == "interrogation"


def test_prompt_gen_request_requires_raw_input():
    from main import PromptGenRequest
    with pytest.raises(ValidationError):
        PromptGenRequest(use_case="coding")


def test_prompt_gen_request_requires_use_case():
    from main import PromptGenRequest
    with pytest.raises(ValidationError):
        PromptGenRequest(raw_input="make my API faster")


def test_prompt_gen_request_accepts_any_use_case_string():
    from main import PromptGenRequest
    # The model accepts any string; the endpoint validates against SYSTEM_PROMPTS
    req = PromptGenRequest(raw_input="test", use_case="unknown_value")
    assert req.use_case == "unknown_value"


def test_prompt_gen_response_fields():
    from main import PromptGenResponse
    resp = PromptGenResponse(phase="interrogation", message="What language?")
    assert resp.phase == "interrogation"
    assert resp.message == "What language?"


def test_system_prompts_has_all_use_cases():
    from main import SYSTEM_PROMPTS
    for key in ["coding", "remix_architect", "creative_writing", "data_analysis", "summarization", "general"]:
        assert key in SYSTEM_PROMPTS, f"Missing use case: {key}"
        assert len(SYSTEM_PROMPTS[key]) > 50, f"System prompt for {key} is suspiciously short"


import json
from unittest.mock import MagicMock
from fastapi.testclient import TestClient


def _make_llm_response(phase: str, message: str):
    """Build a mock llama-cpp-python response that returns JSON."""
    payload = json.dumps({"phase": phase, "message": message})
    mock_resp = {"choices": [{"message": {"content": payload}}], "usage": {}}
    mock_llm = MagicMock()
    mock_llm.create_chat_completion.return_value = mock_resp
    return mock_llm


def test_prompt_gen_interrogation_turn():
    from main import app
    import models
    models.llm = _make_llm_response("interrogation", "What language are you using?")
    client = TestClient(app)
    resp = client.post("/prompt-gen", json={
        "raw_input": "make my API faster",
        "use_case": "coding",
        "history": [],
        "phase": "interrogation",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "interrogation"
    assert "language" in data["message"].lower()


def test_prompt_gen_generation_turn():
    from main import app
    import models
    models.llm = _make_llm_response("generation", "You are an expert Python developer...")
    client = TestClient(app)
    resp = client.post("/prompt-gen", json={
        "raw_input": "make my API faster",
        "use_case": "coding",
        "history": [
            {"role": "assistant", "content": "What language?"},
            {"role": "user", "content": "Python, FastAPI"},
            {"role": "assistant", "content": "What experience level?"},
            {"role": "user", "content": "Intermediate"},
            {"role": "assistant", "content": "Any constraints?"},
            {"role": "user", "content": "No external libs"},
            {"role": "assistant", "content": "What is the specific goal?"},
            {"role": "user", "content": "Reduce p99 latency on /items endpoint"},
        ],
        "phase": "interrogation",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "generation"
    assert len(data["message"]) > 20


def test_prompt_gen_empty_raw_input_returns_400():
    from main import app
    import models
    models.llm = MagicMock()
    client = TestClient(app)
    resp = client.post("/prompt-gen", json={
        "raw_input": "   ",
        "use_case": "coding",
    })
    assert resp.status_code == 400
    assert "prompt idea" in resp.json()["detail"].lower()


def test_prompt_gen_unknown_use_case_returns_400():
    from main import app
    import models
    models.llm = MagicMock()
    client = TestClient(app)
    resp = client.post("/prompt-gen", json={
        "raw_input": "help me write something",
        "use_case": "nonexistent_case",
    })
    assert resp.status_code == 400
    assert "use case" in resp.json()["detail"].lower()


def test_prompt_gen_json_parse_failure_returns_graceful_message():
    from main import app
    import models
    # LLM returns non-JSON garbage
    mock_llm = MagicMock()
    mock_llm.create_chat_completion.return_value = {
        "choices": [{"message": {"content": "Sure! Here is my question for you..."}}],
        "usage": {},
    }
    models.llm = mock_llm
    client = TestClient(app)
    resp = client.post("/prompt-gen", json={
        "raw_input": "write a poem",
        "use_case": "creative_writing",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "interrogation"
    assert "rephrase" in data["message"].lower()
