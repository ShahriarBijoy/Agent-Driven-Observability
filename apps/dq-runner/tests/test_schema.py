from dq_runner.checks.schema_check import count_schema_failures, validate_response

VALID = {
    "completion": "Based on the context, the answer is 42.",
    "model": "mock-llm-v1",
    "usage": {"promptTokens": 12, "completionTokens": 7},
    "retrieved": [{"chunkId": "c0", "docId": "d0", "score": 0.9, "snippet": "x"}],
    "cached": False,
}


def test_validate_response_accepts_a_well_formed_chat_response():
    assert validate_response(VALID) is None


def test_validate_response_rejects_missing_fields():
    bad = {k: v for k, v in VALID.items() if k != "usage"}
    assert validate_response(bad) is not None


def test_validate_response_rejects_an_empty_completion():
    bad = {**VALID, "completion": "   "}
    assert validate_response(bad) is not None


def test_validate_response_rejects_a_non_object():
    assert validate_response("not-an-object") is not None


def test_count_schema_failures_counts_only_the_bad_ones():
    bad = {**VALID, "completion": ""}
    count, errors = count_schema_failures([VALID, bad, VALID])
    assert count == 1
    assert len(errors) == 1
