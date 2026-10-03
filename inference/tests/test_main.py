import pytest
from fastapi.testclient import TestClient

import main
from pun_detector.agent import PunAnalysis
from tests.fakes import BrokenDetector, FakeDetector, RecordingSelector, selected

# A server error comes back as a 500 response instead of raising in the test.
client = TestClient(main.app, raise_server_exceptions=False)

# Each builds a fresh PunAnalysis, so no fake's state outlives its test.
ANALYSES = {
    "undetermined": lambda: PunAnalysis(BrokenDetector()),
    "not a pun": lambda: PunAnalysis(FakeDetector(pun_type=None)),
    "llm_fallback": lambda: PunAnalysis(FakeDetector(pun_type="homophonic")),
    "wordnet": lambda: PunAnalysis(FakeDetector(), RecordingSelector(selected("wordnet"))),
    "wiktionary": lambda: PunAnalysis(FakeDetector(), RecordingSelector(selected("wiktionary"))),
}


@pytest.mark.parametrize("build", ANALYSES.values(), ids=ANALYSES.keys())
def test_analyze_returns_every_result_shape_unchanged(monkeypatch, build):
    # AnalyzeResponse must neither 500 on a contract-valid result (e.g. the undetermined
    # result's nulls, or a sense_source it doesn't list) nor drop or alter a field.
    analysis = build()
    expected = analysis.analyze("The baker needed more dough.")
    monkeypatch.setattr(main, "analysis", build())

    response = client.post("/analyze", json={"text": "The baker needed more dough."})

    assert response.status_code == 200
    assert response.json() == expected


@pytest.mark.parametrize("text", ["", "   ", "x" * (main.MAX_CHARS + 1)])
def test_analyze_rejects_empty_blank_and_overlong_text(text):
    response = client.post("/analyze", json={"text": text})

    assert response.status_code == 422
