from fastapi.testclient import TestClient

from main import app

client = TestClient(app, raise_server_exceptions=False)


def test_analyze_endpoint_exists():
    # Missing local model resources degrade to the documented undetermined result.
    response = client.post("/analyze", json={"text": "I used to be a banker but I lost interest."})
    assert response.status_code == 200
    assert "probabilities" in response.json()
    assert "sense_source" in response.json()
