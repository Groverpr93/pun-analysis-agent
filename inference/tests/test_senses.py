import json
from concurrent.futures import ThreadPoolExecutor

import pytest

import senses
from candidates import CandidateWord
from scripts.build_wiktionary_db import build_db, entry_glosses, keep_entry
from senses import (
    Sense,
    _get_wordnet,
    alternative_lemmas,
    get_candidate_senses,
    get_wiktionary_senses,
    get_wordnet_senses,
)

FAKE_KAIKKI = [
    {
        "word": "rizz",
        "pos": "noun",
        "lang_code": "en",
        "senses": [{"glosses": ["A person's ability to attract a love interest."]}],
    },
    {
        "word": "dance",
        "pos": "verb",
        "lang_code": "en",
        "senses": [{"glosses": ["To move rhythmically to music."]}],
    },
    {
        "word": "pun",
        "pos": "noun",
        "lang_code": "en",
        "senses": [
            {"glosses": ["A joke exploiting multiple meanings."]},
            {"glosses": ["Alternative form of bun."], "tags": ["alt-of"]},
        ],
    },
    {
        "word": "doughs",
        "pos": "noun",
        "lang_code": "en",
        "senses": [{"glosses": ["plural of dough"], "tags": ["form-of"]}],
    },
    {
        "word": "pain",
        "pos": "noun",
        "lang_code": "fr",
        "senses": [{"glosses": ["bread"]}],
    },
    {
        "word": "pun intended",
        "pos": "noun",
        "lang_code": "en",
        "senses": [{"glosses": ["Used to point out a pun."]}],
    },
]


@pytest.fixture
def wiktionary_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wiktionary.sqlite"
    build_db((json.dumps(entry) for entry in FAKE_KAIKKI), db_path)
    monkeypatch.setattr(senses, "_WIKTIONARY_DB_PATH", db_path)
    monkeypatch.setattr(senses, "_wiktionary", None)
    return db_path


def test_wordnet_returns_multiple_senses_for_dough():
    candidate = CandidateWord(text="dough", lemma="dough", pos="NOUN", index=0)

    senses = get_wordnet_senses(candidate)

    assert len(senses) > 1
    assert all(s.source == "wordnet" for s in senses)

    glosses = {s.gloss for s in senses}
    assert "a flour mixture stiff enough to knead or roll" in glosses
    assert "informal terms for money" in glosses

    food_sense = next(
        s for s in senses if s.gloss == "a flour mixture stiff enough to knead or roll"
    )
    money_sense = next(s for s in senses if s.gloss == "informal terms for money")
    assert food_sense.hypernyms[:3] == ("concoction", "foodstuff", "food")
    assert money_sense.hypernyms[:2] == ("money", "medium of exchange")
    assert food_sense.hypernyms[-1] == "entity"
    assert money_sense.hypernyms[-1] == "entity"
    assert food_sense.lexfile == "noun.food"
    assert money_sense.lexfile == "noun.possession"


def test_wordnet_covers_verb_pos():
    running = CandidateWord(text="running", lemma="run", pos="VERB", index=0)

    senses = get_wordnet_senses(running)

    assert len(senses) > 1
    assert all(s.source == "wordnet" for s in senses)


def test_wordnet_covers_both_adjective_pos_tags():
    # "light" has senses under WordNet's plain ("a") AND satellite ("s")
    # adjective tags -- this pins down that _WORDNET_POS["ADJ"] queries both,
    # not just one.
    light = CandidateWord(text="light", lemma="light", pos="ADJ", index=0)
    wordnet = _get_wordnet()

    plain_only = len(wordnet.synsets("light", pos="a"))
    satellite_only = len(wordnet.synsets("light", pos="s"))

    senses = get_wordnet_senses(light)

    assert len(senses) == plain_only + satellite_only
    assert len(senses) > max(plain_only, satellite_only)


def test_wordnet_usable_from_another_thread_after_loading():
    # FastAPI runs sync endpoints on threadpool workers, so WordNet loaded on
    # one thread must still work on another (wn.config.allow_multithreading).
    dough = CandidateWord(text="dough", lemma="dough", pos="NOUN", index=0)
    get_wordnet_senses(dough)

    with ThreadPoolExecutor(max_workers=1) as pool:
        senses_ = pool.submit(get_wordnet_senses, dough).result()

    assert len(senses_) > 1


def test_sense_is_hashable():
    dough = CandidateWord(text="dough", lemma="dough", pos="NOUN", index=0)
    senses = get_wordnet_senses(dough)
    assert len(set(senses)) == len(senses)


def test_keep_entry_filters_language_pos_and_multiword():
    by_word = {entry["word"]: entry for entry in FAKE_KAIKKI}

    assert keep_entry(by_word["rizz"])
    assert not keep_entry(by_word["pain"])
    assert not keep_entry(by_word["pun intended"])
    assert not keep_entry({"word": "quickly", "pos": "adv", "lang_code": "en"})
    assert not keep_entry({})


def test_entry_glosses_skips_form_of_and_keeps_last_gloss():
    by_word = {entry["word"]: entry for entry in FAKE_KAIKKI}

    assert entry_glosses(by_word["pun"]) == ["A joke exploiting multiple meanings."]
    assert entry_glosses(by_word["doughs"]) == []
    sub_senses = {"senses": [{"glosses": ["parent", "own"]}, {"glosses": []}, {"tags": ["plural"]}]}
    assert entry_glosses(sub_senses) == ["own"]


def test_wiktionary_fallback_for_coverage_gap(wiktionary_db):
    candidate = CandidateWord(text="rizz", lemma="rizz", pos="NOUN", index=0)

    assert len(get_wordnet_senses(candidate)) == 0

    senses_ = get_wiktionary_senses(candidate)
    assert [s.gloss for s in senses_] == ["A person's ability to attract a love interest."]
    assert all(s.source == "wiktionary" for s in senses_)
    assert all(s.hypernyms == () for s in senses_)
    assert all(s.lexfile is None for s in senses_)


def test_wiktionary_senses_looks_up_lemma_not_surface_text(wiktionary_db):
    dancing = CandidateWord(text="dancing", lemma="dance", pos="VERB", index=0)

    assert [s.gloss for s in get_wiktionary_senses(dancing)] == ["To move rhythmically to music."]


def test_wiktionary_missing_file_returns_no_senses(tmp_path, monkeypatch, caplog):
    monkeypatch.setattr(senses, "_WIKTIONARY_DB_PATH", tmp_path / "missing.sqlite")
    monkeypatch.setattr(senses, "_wiktionary", None)
    rizz = CandidateWord(text="rizz", lemma="rizz", pos="NOUN", index=0)

    assert get_wiktionary_senses(rizz) == []
    assert "Wiktionary lookup failed" in caplog.text


def test_wiktionary_corrupt_file_returns_no_senses(tmp_path, monkeypatch, caplog):
    # e.g. a download that was never gunzipped: sqlite3 raises DatabaseError,
    # the parent of the OperationalError a missing file raises.
    db_path = tmp_path / "wiktionary.sqlite"
    db_path.write_bytes(b"this is not a sqlite database" * 100)
    monkeypatch.setattr(senses, "_WIKTIONARY_DB_PATH", db_path)
    monkeypatch.setattr(senses, "_wiktionary", None)
    rizz = CandidateWord(text="rizz", lemma="rizz", pos="NOUN", index=0)

    assert get_wiktionary_senses(rizz) == []
    assert "Wiktionary lookup failed" in caplog.text


@pytest.mark.parametrize("folder", ["a#b", "c%20d"])
def test_wiktionary_opens_paths_with_uri_special_characters(tmp_path, monkeypatch, folder):
    db_path = tmp_path / folder / "wiktionary.sqlite"
    build_db((json.dumps(entry) for entry in FAKE_KAIKKI), db_path)
    monkeypatch.setattr(senses, "_WIKTIONARY_DB_PATH", db_path)
    monkeypatch.setattr(senses, "_wiktionary", None)
    rizz = CandidateWord(text="rizz", lemma="rizz", pos="NOUN", index=0)

    assert len(get_wiktionary_senses(rizz)) == 1


def test_wiktionary_usable_from_another_thread_after_loading(wiktionary_db):
    rizz = CandidateWord(text="rizz", lemma="rizz", pos="NOUN", index=0)
    get_wiktionary_senses(rizz)

    with ThreadPoolExecutor(max_workers=1) as pool:
        senses_ = pool.submit(get_wiktionary_senses, rizz).result()

    assert len(senses_) == 1


def test_get_candidate_senses_falls_back_only_when_wordnet_coverage_is_thin(
    wiktionary_db, monkeypatch
):
    looked_up = []

    def spy(candidate):
        looked_up.append(candidate.lemma)
        return []

    monkeypatch.setattr(senses, "get_wiktionary_senses", spy)

    dough = CandidateWord(text="dough", lemma="dough", pos="NOUN", index=0)
    dough_senses = get_candidate_senses(dough)
    assert len(dough_senses) > 1
    assert all(s.source == "wordnet" for s in dough_senses)
    assert looked_up == []


def test_get_candidate_senses_merges_wiktionary_when_wordnet_has_one_sense(wiktionary_db):
    pun = CandidateWord(text="pun", lemma="pun", pos="NOUN", index=0)
    assert len(get_wordnet_senses(pun)) == 1

    senses_ = get_candidate_senses(pun)
    assert [s.source for s in senses_] == ["wordnet", "wiktionary"]


def _assert_consistent_under_concurrency(lookup, candidates):
    expected = [lookup(candidate) for candidate in candidates]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for _ in range(20):
            assert list(pool.map(lookup, candidates)) == expected


def test_wordnet_lookups_are_consistent_under_concurrency():
    # One shared connection: concurrent queries without the lock raise
    # InterfaceError/IndexError or return the wrong senses.
    candidates = [
        CandidateWord(text=word, lemma=word, pos=pos, index=0)
        for word, pos in [("dough", "NOUN"), ("run", "VERB"), ("light", "ADJ"), ("bank", "NOUN")]
    ] * 5
    _assert_consistent_under_concurrency(get_wordnet_senses, candidates)


def test_wiktionary_lookups_are_consistent_under_concurrency(wiktionary_db):
    candidates = [
        CandidateWord(text=word, lemma=word, pos=pos, index=0)
        for word, pos in [("rizz", "NOUN"), ("dance", "VERB"), ("pun", "NOUN")]
    ] * 5
    _assert_consistent_under_concurrency(get_wiktionary_senses, candidates)


DOUGH = CandidateWord(text="Dough", lemma="dough", pos="NOUN", index=0)


def _dough_sense(lexfile):
    return next(s for s in get_wordnet_senses(DOUGH) if s.lexfile == lexfile)


def test_alternative_lemmas_lists_the_senses_other_words_without_the_candidate():
    money = alternative_lemmas(DOUGH, _dough_sense("noun.possession"))

    assert {"bread", "loot", "moolah"} <= money
    assert "dough" not in money


def test_alternative_lemmas_is_empty_for_a_sense_with_no_other_words():
    assert alternative_lemmas(DOUGH, _dough_sense("noun.food")) == frozenset()


@pytest.mark.parametrize(
    "sense",
    [
        Sense("informal terms for money", (), None, "wiktionary"),
        Sense("not a gloss WordNet has", (), "noun.possession", "wordnet"),
    ],
    ids=["wiktionary sense", "no matching synset"],
)
def test_alternative_lemmas_is_none_when_it_cant_resolve_the_sense(sense):
    assert alternative_lemmas(DOUGH, sense) is None


def test_alternative_lemmas_are_consistent_under_concurrency():
    money = _dough_sense("noun.possession")
    _assert_consistent_under_concurrency(lambda _: alternative_lemmas(DOUGH, money), range(20))


def test_alternative_lemmas_compares_words_case_insensitively():
    turkey = CandidateWord(text="turkey", lemma="turkey", pos="NOUN", index=0)
    bird = next(s for s in get_wordnet_senses(turkey) if s.lexfile == "noun.animal")

    # WordNet lists "turkey" and "Meleagris gallopavo" for the bird.
    assert alternative_lemmas(turkey, bird) == {"meleagris gallopavo"}


def test_alternative_lemmas_is_none_when_two_synsets_match_the_sense(monkeypatch):
    class FakeSynset:
        def __init__(self, synset_id, lemmas):
            self.id, self._lemmas = synset_id, lemmas

        def definition(self):
            return "informal terms for money"

        def lexfile(self):
            return "noun.possession"

        def lemmas(self):
            return self._lemmas

    class FakeWordnet:
        def synsets(self, lemma, pos):
            return [FakeSynset("a", ["dough", "loot"]), FakeSynset("b", ["dough", "bread"])]

    monkeypatch.setattr(senses, "_get_wordnet", FakeWordnet)
    money = Sense("informal terms for money", (), "noun.possession", "wordnet")

    # Two synsets fit, so which other words apply is unknown, not either list.
    assert alternative_lemmas(DOUGH, money) is None


def test_alternative_lemmas_also_drops_the_candidates_surface_form():
    # A token whose lemma differs from its text (e.g. a lemmatizer slip):
    # neither form counts as "another word".
    moolah = CandidateWord(text="moolah", lemma="dough", pos="NOUN", index=0)

    money = alternative_lemmas(moolah, _dough_sense("noun.possession"))

    assert "moolah" not in money
    assert "loot" in money
