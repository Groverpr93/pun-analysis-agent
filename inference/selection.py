"""Sense selection end to end: steps 1-6 and Tiers 0-2 of docs/design/sense-selection.md.

Runs the earlier steps (candidates, context, senses, scoring) over one parsed
sentence and picks the pair of senses to explain the pun with:
  1. Which candidates have a pun reading, best first? -> pun_readings()
  2. What does /analyze say about the first one?      -> select_senses()
Detection (pun_detector/) calls select_senses() only once it has decided the
text is a homographic pun; calibration calls pun_readings() to measure the
same pipeline production runs.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Literal, TypedDict

from spacy.tokens import Doc

from candidates import CandidateWord, extract_candidates
from context import LocalContext, local_contexts
from scoring import (
    GLOSS_DISTINCT_THRESHOLD,
    MARGIN_THRESHOLD,
    Embed,
    PunSignal,
    gloss_similarity,
    has_pun_tension,
    pun_margin,
    score_senses,
)
from senses import alternative_lemmas, get_candidate_senses

# Bounds the sense lookups and embeddings one sentence can cost: /analyze
# accepts up to 2,000 characters, a few hundred words. Preferred candidates are
# always kept, so this can't drop a word the detector ranked.
MAX_CANDIDATES = 32


class SenseSelection(TypedDict):
    """The /analyze fields sense selection fills (docs/contracts.md)."""

    words_involved: list[str]
    explanation: str
    sense_source: Literal["wordnet", "wiktionary"]


@dataclass(frozen=True)
class PunReading:
    """A candidate word whose two senses passed every filter in pun_readings()."""

    candidate: CandidateWord
    context: LocalContext
    signal: PunSignal


def pun_readings(
    doc: Doc,
    embed: Embed,
    *,
    preferred: Sequence[int] = (),
    threshold: float = MARGIN_THRESHOLD,
) -> Iterator[PunReading]:
    """Candidates whose top two senses read as a pun, in the order they're tried.

    `preferred` lists token indexes to try first, in order (production passes
    the detector's ranking); the other candidates follow in sentence order.
    A candidate's pair counts when all of these hold:
      - margin <= `threshold`: both senses fit about as well (design doc step 5);
      - the runner-up's score is positive: two senses that both fit badly
        aren't a pun just because they fit equally badly;
      - the senses share no other WordNet word: senses that do are usually
        near-synonyms, even when their lexfiles differ;
      - their glosses aren't similar (cosine < GLOSS_DISTINCT_THRESHOLD), on
        top of pun_margin()'s category check: different lexfiles can still
        hold near-identical glosses.
    Calibration can pass threshold=math.inf to see every margin the other
    filters let through. To measure exactly what production runs, it must also
    pass the detector's ranking as `preferred`: the order decides which reading
    comes first. Not safe to run on threads alongside a loaded PunDetector:
    the detector's own WordNet object shares wn's connection without
    senses.py's lock. Lazy, so select_senses() stops at the first reading.
    """
    rank = {index: position for position, index in enumerate(preferred)}
    candidates = [
        candidate
        for position, candidate in enumerate(extract_candidates(doc))
        if position < MAX_CANDIDATES or candidate.index in rank
    ]
    contexts = local_contexts(doc, candidates)
    ordered = sorted(
        zip(candidates, contexts, strict=True),
        key=lambda item: (rank.get(item[0].index, len(rank)), item[0].index),
    )
    for candidate, context in ordered:
        senses = get_candidate_senses(candidate)
        scored = score_senses(senses, doc.text, context.predicate, context.relation, embed)
        signal = pun_margin(scored, embed)
        if not has_pun_tension(signal, threshold) or signal.runner_up.score <= 0:
            continue
        if _share_another_word(candidate, signal):
            continue
        if (
            gloss_similarity(signal.top.sense, signal.runner_up.sense, embed)
            >= GLOSS_DISTINCT_THRESHOLD
        ):
            continue
        yield PunReading(candidate, context, signal)


def select_senses(
    doc: Doc, embed: Embed, *, preferred: Sequence[int] = ()
) -> SenseSelection | None:
    """The /analyze fields sense selection fills, from the first pun reading.

    None when no candidate has one: the caller then hands off with
    sense_source "llm_fallback" (Tier 3).
    """
    reading = next(pun_readings(doc, embed, preferred=preferred), None)
    if reading is None:
        return None
    candidate, context, signal = reading.candidate, reading.context, reading.signal
    evidence = (
        f"Both meanings match the seeded '{context.predicate}' / '{context.relation}' slot."
        if signal.method == "selectional_preference"
        else "Both definitions have positive similarity to the sentence."
    )
    explanation = (
        f'"{candidate.text}" can mean {signal.top.sense.gloss} or '
        f"{signal.runner_up.sense.gloss}. {evidence} "
        f"Their score difference is {signal.margin:.3f}. "
        "This is a proposed interpretation, not proof that both readings work."
    )
    return {
        "words_involved": [candidate.text],
        "explanation": explanation,
        "sense_source": signal.sense_source,
    }


def _share_another_word(candidate: CandidateWord, signal: PunSignal) -> bool:
    """Do both senses list a common other word in WordNet? Unknown counts as no.

    A coverage tradeoff, not a claim the synsets mean the same: a shared
    word can itself be polysemous.
    """
    top = alternative_lemmas(candidate, signal.top.sense)
    runner_up = alternative_lemmas(candidate, signal.runner_up.sense)
    return top is not None and runner_up is not None and bool(top & runner_up)
