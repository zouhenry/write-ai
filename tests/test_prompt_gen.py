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
