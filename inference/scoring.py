"""TASK-19: score candidate senses against their local context and compute the pun margin.

Steps 4-5 + Tier 1 of docs/design/sense-selection.md. Takes the senses
get_candidate_senses() found for one candidate word (TASK-17) plus that
word's predicate/relation slot (TASK-18), and answers two questions:
  1. How well does each sense fit this sentence?      -> score_senses()
  2. Are two clearly different senses both plausible? -> pun_margin()
"""

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt
from fastembed import TextEmbedding

from senses import Sense

# Takes a list of texts, returns one vector per text, in the same order.
# Passed in as a parameter (not called directly) so tests can swap in a fake
# with hand-picked vectors -- no model download, and exact control over scores.
Embed = Callable[[list[str]], Sequence[npt.ArrayLike]]

# Which scorer produced a score; score_senses() picks one per word.
Method = Literal["selectional_preference", "embedding_lesk"]

# Hand-seeded selectional preferences (design doc step 4): for a
# (predicate lemma, relation) slot, the WordNet hypernym lemmas of things that
# typically fill it. Keys match what TASK-18's local_contexts() reports:
# spaCy labels ("dobj", "nsubj", ...) plus prep_<prep> for prepositional
# objects, e.g. ("hide", "prep_in"). For a copula complement the predicate is
# the subject noun (("batter", "acomp") for "the batter was ready").
# Classes checked against OEWN 2025 chains: food senses reach "food" or
# "solid food" (bread goes baked goods -> solid food, never "food"), and money
# senses meet at "medium of exchange" (cash goes currency -> medium of exchange).
#
# A seed set spanning two categories (need -> food and money) makes the slot
# pun-capable: a word with a sense in each gets a tie. Only do that on purpose.
_FOOD = frozenset({"food", "solid food"})
_MONEY = frozenset({"medium of exchange"})

SELECTIONAL_PREFERENCES: dict[tuple[str, str], frozenset[str]] = {
    ("need", "dobj"): _FOOD | _MONEY,
    ("want", "dobj"): _FOOD | _MONEY,
    ("bake", "dobj"): _FOOD,
    ("cook", "dobj"): _FOOD,
    ("eat", "dobj"): _FOOD,
    ("knead", "dobj"): frozenset({"foodstuff", "solid food"}),
    ("rise", "nsubj"): frozenset({"foodstuff", "solid food"}),
    ("drink", "dobj"): frozenset({"beverage"}),
    ("pour", "dobj"): frozenset({"beverage", "dish"}),
    ("spend", "dobj"): _MONEY,
    ("earn", "dobj"): _MONEY,
    ("owe", "dobj"): _MONEY,
    ("save", "dobj"): _MONEY,
    ("steal", "dobj"): _MONEY,
    ("hide", "prep_in"): frozenset({"container", "substance"}),
    ("deposit", "prep_in"): frozenset({"financial institution"}),
    ("fill", "dobj"): frozenset({"container"}),
    ("swing", "dobj"): frozenset({"sports implement", "sports equipment"}),
}

# Calibrated by TASK-2.4 (scripts/calibrate_margin.py): tuned on the detector's
# dev split, reported on its test split. Numbers, scope and rationale:
# docs/design/sense-selection.md, open questions.
MARGIN_THRESHOLD = 0.01
# Two glosses with cosine similarity below this count as different senses
# (used only when lexfiles can't tell -- see _distinct()). Not yet calibrated.
GLOSS_DISTINCT_THRESHOLD = 0.5

# Nearly every WordNet adjective shares this lexfile, so it can't tell two
# adjective senses apart.
_UNINFORMATIVE_LEXFILES = frozenset({"adj.all"})


@dataclass(frozen=True)
class ScoredSense:
    sense: Sense
    score: float
    method: Method


@dataclass(frozen=True)
class PunSignal:
    top: ScoredSense
    runner_up: ScoredSense
    margin: float
    sense_source: Literal["wordnet", "wiktionary"]

    @property
    def method(self) -> Method:
        # Both senses come from one score_senses() call, so they share a method.
        return self.top.method


def score_senses(
    senses: list[Sense],
    text: str,
    predicate: str | None,
    relation: str,
    embed: Embed,
) -> list[ScoredSense]:
    """Score every sense with ONE method (never mix scales across senses).

    Selectional preference if SELECTIONAL_PREFERENCES has a seed for
    (predicate, relation), every sense is from WordNet, AND at least one
    sense matches; otherwise embedding-Lesk. Returns results in the same
    order as `senses`, each tagged with the method used.
    """
    if not senses:
        return []
    seeds = SELECTIONAL_PREFERENCES.get((predicate, relation))
    # Wiktionary senses have no hypernym chain, so seeds can't judge them:
    # they'd score 0.0 ("doesn't fit") when the truth is "unknown".
    if not all(sense.source == "wordnet" for sense in senses):
        seeds = None
    scores = [_selectional_preference_score(sense, seeds) for sense in senses] if seeds else []
    method: Method = "selectional_preference"
    if 1.0 not in scores:
        # No seed, or a seed no sense fits: all-zero scores would read as a
        # margin of 0 (a fake pun), so score by gloss similarity instead.
        scores = _embedding_lesk_scores(senses, text, embed)
        method = "embedding_lesk"
    return [ScoredSense(sense, score, method) for sense, score in zip(senses, scores)]


def _selectional_preference_score(sense: Sense, seeds: frozenset[str]) -> float:
    """1.0 if any seed class appears anywhere in the sense's hypernym chain, else 0.0.

    Binary on purpose: our hand-made seeds can only say "fits the slot or
    not". A depth-based score mostly reflects which seed word was picked
    (e.g. "food" vs "foodstuff"), and called "dough" not-a-pun.
    """
    return 1.0 if seeds.intersection(sense.hypernyms) else 0.0


def _embedding_lesk_scores(senses: list[Sense], text: str, embed: Embed) -> list[float]:
    """Cosine similarity between the sentence and each sense's gloss."""
    # One batched call: the first vector is the sentence, the rest the glosses in order.
    sentence_vector, *gloss_vectors = embed([text, *(sense.gloss for sense in senses)])
    return [_cosine(sentence_vector, gloss_vector) for gloss_vector in gloss_vectors]


def _cosine(a: npt.ArrayLike, b: npt.ArrayLike) -> float:
    """dot(a, b) / (|a| * |b|); 1.0 = same direction (similar meaning)."""
    a, b = np.asarray(a), np.asarray(b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / norm) if norm else 0.0


def pun_margin(scored: list[ScoredSense], embed: Embed) -> PunSignal | None:
    """Margin between the top sense and the best sense of a *different* category.

    None when there's no pun story to tell: fewer than 2 senses, or no sense
    distinct from the top one. None is a normal result, not an error --
    /analyze must never 500 (design doc, Tier 3).
    """
    if len(scored) < 2:
        return None
    # sorted() is stable, so ties keep WordNet's order (roughly most common first).
    top, *rest = sorted(scored, key=lambda scored_sense: scored_sense.score, reverse=True)
    runner_up = next((other for other in rest if _distinct(top.sense, other.sense, embed)), None)
    if runner_up is None:
        return None
    # A WordNet sense paired with a Wiktionary one needed Tier 2 to exist at all.
    sources = {top.sense.source, runner_up.sense.source}
    return PunSignal(
        top=top,
        runner_up=runner_up,
        margin=top.score - runner_up.score,
        sense_source="wiktionary" if "wiktionary" in sources else "wordnet",
    )


def _distinct(a: Sense, b: Sense, embed: Embed) -> bool:
    """Are these clearly different senses ("different top-level hypernym")?

    Compare lexfiles when both have an informative one (noun.food vs
    noun.possession). Otherwise -- Wiktionary senses (lexfile None) or
    adjectives (adj.all) -- fall back to gloss embeddings being far apart.
    """
    if _informative(a.lexfile) and _informative(b.lexfile):
        return a.lexfile != b.lexfile
    return gloss_similarity(a, b, embed) < GLOSS_DISTINCT_THRESHOLD


def gloss_similarity(a: Sense, b: Sense, embed: Embed) -> float:
    """Cosine similarity between two senses' glosses; 1.0 = same meaning."""
    gloss_a, gloss_b = embed([a.gloss, b.gloss])
    return _cosine(gloss_a, gloss_b)


def _informative(lexfile: str | None) -> bool:
    return lexfile is not None and lexfile not in _UNINFORMATIVE_LEXFILES


def has_pun_tension(signal: PunSignal | None, threshold: float = MARGIN_THRESHOLD) -> bool:
    """True when both senses are close enough in score to read as a pun."""
    return signal is not None and signal.margin <= threshold


# Baked into the image at build time (Dockerfile), which must name the same model.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_embedder: TextEmbedding | None = None
_embedder_lock = threading.Lock()


def default_embed(texts: list[str], batch_size: int = 256) -> list[npt.NDArray[np.float32]]:
    """Production Embed: all-MiniLM-L6-v2 via fastembed, loaded lazily on first use.

    Lazy + locked for the same reasons as senses._get_wordnet(): don't pay the
    model load at import time (Cloud Run cold start, see AGENTS.md), and don't
    let two concurrent first requests both load it.

    `batch_size` forwards to fastembed's own default (256); pun_detector's
    onnx_embed passes a smaller value to cap peak memory (TASK-55).
    """
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                _embedder = TextEmbedding(EMBEDDING_MODEL)
    return list(_embedder.embed(texts, batch_size=batch_size))
