import threading

import candidates as candidates_module
from candidates import CandidateWord, extract_candidates, get_model


def test_extracts_open_class_candidates():
    candidates = extract_candidates(get_model()("The baker needed more dough."))

    assert candidates == [
        CandidateWord(text="baker", lemma="baker", pos="NOUN", index=1),
        CandidateWord(text="needed", lemma="need", pos="VERB", index=2),
        CandidateWord(text="more", lemma="more", pos="ADJ", index=3),
        CandidateWord(text="dough", lemma="dough", pos="NOUN", index=4),
    ]


def test_excludes_closed_class_tokens():
    candidates = extract_candidates(get_model()("The baker needed dough for her shop."))

    assert candidates == [
        CandidateWord(text="baker", lemma="baker", pos="NOUN", index=1),
        CandidateWord(text="needed", lemma="need", pos="VERB", index=2),
        CandidateWord(text="dough", lemma="dough", pos="NOUN", index=3),
        CandidateWord(text="shop", lemma="shop", pos="NOUN", index=6),
    ]


def test_get_model_is_thread_safe_against_concurrent_cold_start(monkeypatch):
    # Simulate a cold start: no model cached yet.
    monkeypatch.setattr(candidates_module, "_model", None)

    call_count = 0
    original_load = candidates_module.spacy.load

    def counting_load(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return original_load(*args, **kwargs)

    monkeypatch.setattr(candidates_module.spacy, "load", counting_load)

    threads = [threading.Thread(target=candidates_module.get_model) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert call_count == 1
