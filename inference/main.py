from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator

from pun_detector.agent import PunAnalysis
from pun_detector.features import MAX_CHARS

app = FastAPI(title="pun-analysis-agent inference")
analysis = PunAnalysis()


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Sentence must not be blank")
        return value


class ClassProbabilities(BaseModel):
    non_pun: float = Field(ge=0, le=1)
    homographic: float = Field(ge=0, le=1)
    homophonic: float = Field(ge=0, le=1)


class AnalyzeResponse(BaseModel):
    is_pun: bool | None
    pun_type: Literal["homographic", "homophonic"] | None
    words_involved: list[str]
    explanation: str
    confidence: float | None = Field(ge=0, le=1)
    probabilities: ClassProbabilities | None = None
    sense_source: Literal["wordnet", "wiktionary", "llm_fallback"] | None


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return AnalyzeResponse.model_validate(analysis.analyze(request.text))
