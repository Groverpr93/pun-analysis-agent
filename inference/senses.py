import logging
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import wn

from candidates import CandidateWord

_WORDNET_POS = {
    "NOUN": ["n"],
    "VERB": ["v"],
    "ADJ": ["a", "s"],
}

_WIKTIONARY_POS = {
    "NOUN": "noun",
    "VERB": "verb",
    "ADJ": "adj",
}

_MAX_HYPERNYM_DEPTH = 50

logger = logging.getLogger(__name__)

_WIKTIONARY_DB_PATH = Path(__file__).parent / "data" / "wiktionary.sqlite"


@dataclass(frozen=True)
class Sense:
    """One candidate meaning of a word.

    `lexfile` is WordNet's coarse category (e.g. "noun.food"). It is None for
    Wiktionary senses, meaning "category unknown", NOT "a different category"
    -- TASK-19 must not count a WordNet/Wiktionary pair as crossing categories.
    """

    gloss: str
    hypernyms: tuple[str, ...]
    lexfile: str | None
    source: Literal["wordnet", "wiktionary"]


_wordnet: wn.Wordnet | None = None
_wordnet_lock = threading.Lock()


def _get_wordnet() -> wn.Wordnet:
    global _wordnet
    if _wordnet is None:
        with _wordnet_lock:
            if _wordnet is None:
                # wn's SQLite connection is bound to its creating thread unless
                # this is set; FastAPI runs sync /analyze on threadpool workers.
                # It only lifts that check -- lookups still hold the lock, since
                # wn shares one connection and concurrent queries on it collide.
                wn.config.allow_multithreading = True
                _wordnet = wn.Wordnet("oewn:2025")
    return _wordnet


def get_wordnet_senses(candidate: CandidateWord) -> list[Sense]:
    """Tier 0: candidate's WordNet synsets, as glosses + hypernym chains."""
    wordnet = _get_wordnet()
    pos_tags = _WORDNET_POS.get(candidate.pos, [])

    senses = []
    with _wordnet_lock:
        for pos in pos_tags:
            for synset in wordnet.synsets(candidate.lemma, pos=pos):
                senses.append(
                    Sense(
                        gloss=synset.definition(),
                        hypernyms=_hypernym_chain(synset),
                        lexfile=synset.lexfile(),
                        source="wordnet",
                    )
                )
    return senses


def _hypernym_chain(synset: wn.Synset) -> tuple[str, ...]:
    chain = []
    current = synset
    hypernyms = current.hypernyms()
    while hypernyms and len(chain) < _MAX_HYPERNYM_DEPTH:
        current = hypernyms[0]
        chain.append(current.lemmas()[0])
        hypernyms = current.hypernyms()
    return tuple(chain)


def alternative_lemmas(candidate: CandidateWord, sense: Sense) -> frozenset[str] | None:
    """The other words WordNet lists for `sense`, normalized, without the candidate itself.

    `Sense` records no synset ID, so this finds the synset among the candidate's
    by gloss and lexfile. None when `sense` isn't from WordNet or that match
    isn't unique: "couldn't tell", not "has no other words".
    """
    if sense.source != "wordnet":
        return None
    wordnet = _get_wordnet()
    with _wordnet_lock:
        synsets = {
            synset.id: synset
            for pos in _WORDNET_POS.get(candidate.pos, [])
            for synset in wordnet.synsets(candidate.lemma, pos=pos)
        }
        matches = [
            synset
            for synset in synsets.values()
            if synset.definition() == sense.gloss and synset.lexfile() == sense.lexfile
        ]
        if len(matches) != 1:
            return None
        lemmas = matches[0].lemmas()
    return frozenset(map(_normalize, lemmas)) - {
        _normalize(candidate.lemma),
        _normalize(candidate.text),
    }


def _normalize(word: str) -> str:
    """'Piggy_Bank ' -> 'piggy bank', so WordNet lemmas and spaCy tokens compare equal."""
    return " ".join(word.lower().replace("_", " ").split())


_wiktionary: sqlite3.Connection | None = None
_wiktionary_lock = threading.Lock()


def _get_wiktionary() -> sqlite3.Connection:
    global _wiktionary
    if _wiktionary is None:
        with _wiktionary_lock:
            if _wiktionary is None:
                # Read-only, so a missing file raises instead of creating an empty
                # database. Shared across threadpool workers like WordNet above,
                # so lookups hold the lock too.
                _wiktionary = sqlite3.connect(
                    f"{_WIKTIONARY_DB_PATH.as_uri()}?mode=ro", uri=True, check_same_thread=False
                )
    return _wiktionary


def get_wiktionary_senses(candidate: CandidateWord) -> list[Sense]:
    """Tier 2 fallback: Wiktionary definitions, used when WordNet coverage is thin."""
    pos = _WIKTIONARY_POS.get(candidate.pos)
    if pos is None:
        return []
    try:
        connection = _get_wiktionary()
        with _wiktionary_lock:
            rows = connection.execute(
                "SELECT gloss FROM senses WHERE word = ? AND pos = ?", (candidate.lemma, pos)
            ).fetchall()
    except sqlite3.DatabaseError:
        # Tier 2 is a fallback: degrade to "no extra senses", never a 500 --
        # but log it so a broken data file doesn't read as a coverage gap.
        logger.warning("Wiktionary lookup failed for %r", candidate.lemma, exc_info=True)
        return []
    return [
        Sense(gloss=gloss, hypernyms=(), lexfile=None, source="wiktionary") for (gloss,) in rows
    ]


def get_candidate_senses(candidate: CandidateWord) -> list[Sense]:
    """Orchestrator: WordNet first; fall back to Wiktionary if coverage is thin (<2 senses)."""
    senses = get_wordnet_senses(candidate)
    if len(senses) < 2:
        senses.extend(get_wiktionary_senses(candidate))
    return senses
