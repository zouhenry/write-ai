import pytest
import models


@pytest.fixture(autouse=True)
def reset_llm():
    original = models.llm
    yield
    models.llm = original
