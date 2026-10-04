from types import SimpleNamespace

import pytest

from scripts import calibrate_margin as calibration


def test_observe_excludes_selectional_preference_and_omits_ranking(monkeypatch):
    calls = []
    monkeypatch.setattr(calibration, "get_model", lambda: lambda text: "parsed")
    monkeypatch.setattr(calibration, "get_candidate_senses", lambda candidate: [1, 2])

    def readings(doc, embed, *, threshold):
        calls.append((doc, threshold))
        for method in ("selectional_preference", "embedding_lesk"):
            yield SimpleNamespace(
                candidate=SimpleNamespace(lemma="word"),
                signal=SimpleNamespace(method=method, margin=0.0),
            )

    monkeypatch.setattr(calibration, "pun_readings", readings)
    results = calibration.observe("row", True, "homographic", "text")
    assert calls == [("parsed", float("inf"))]
    assert len(results) == 1
    assert results[0].sense_count == 2


def test_main_selects_on_dev_and_reports_test_only_at_chosen_threshold(monkeypatch):
    dev = calibration.SplitData([[observation("n", 0.8)]], [[observation("p", 0.03)]])
    test = calibration.SplitData([[observation("n", 0)]], [[observation("p", 0)]])
    splits = {"dev": ["dev-row"], "test": ["test-row"], "train": ["train-row"]}
    calls = []
    monkeypatch.setattr(calibration.json, "loads", lambda text: splits)

    def collect(rows, ids):
        calls.append(ids)
        return dev if ids == {"dev-row"} else test

    monkeypatch.setattr(calibration, "collect", collect)
    swept = []
    reported = []
    monkeypatch.setattr(calibration, "report_sweep", swept.append)
    monkeypatch.setattr(
        calibration,
        "report_at_threshold",
        lambda data, threshold: reported.append((data, threshold)),
    )
    calibration.main()
    assert calls == [{"dev-row"}, {"test-row"}]
    assert swept == [dev]
    assert reported == [(dev, 0.03), (test, 0.03)]


def observation(row_id, margin, sense_count=2):
    return calibration.Observation(row_id, False, None, "word", margin, sense_count)


def test_false_positives_count_sentences_not_candidates():
    data = calibration.SplitData(
        [
            [observation("n1", 0.01), observation("n1", 0.8), observation("n1", 0.9)],
            [observation("n2", 0.8)],
        ],
        [[observation("p1", 0.01), observation("p1", 0.9)]],
    )
    assert calibration._flat_scores(data, 0.02) == (0.5, 1.0)
    data.negative_observations[0].append(observation("n1", 0.7))
    assert calibration._flat_scores(data, 0.02) == (0.5, 1.0)


def test_collect_retains_coverage_and_split_identity(monkeypatch):
    rows = [
        {"id": "n1", "is_pun": "false", "pun_type": "", "text": "eligible"},
        {"id": "n2", "is_pun": "false", "pun_type": "", "text": "uncovered"},
        {"id": "p1", "is_pun": "true", "pun_type": "homographic", "text": "eligible"},
        {"id": "p2", "is_pun": "true", "pun_type": "homographic", "text": "uncovered"},
        {"id": "h1", "is_pun": "true", "pun_type": "homophonic", "text": "eligible"},
        {"id": "train", "is_pun": "false", "pun_type": "", "text": "eligible"},
    ]
    visited = []

    def observe(row_id, is_pun, pun_type, text):
        visited.append(row_id)
        return [observation(row_id, 0.02)] if text == "eligible" else []

    monkeypatch.setattr(calibration, "observe", observe)
    data = calibration.collect(rows, {"n1", "n2", "p1", "p2", "h1"})
    assert visited == ["n1", "n2", "p1", "p2", "h1"]
    assert data.negative_total == data.positive_total == 2
    assert len(data.negative_observations) == len(data.positive_observations) == 1


def test_choose_threshold_enforces_cap_and_breaks_recall_ties():
    data = calibration.SplitData(
        [[observation(f"n{index}", 0.04 if index < 4 else 0.8)] for index in range(10)],
        [[observation("p1", 0.02)], [observation("p2", 0.04)]],
    )
    assert calibration.choose_threshold(data) == 0.02
    data.positive_observations[0][0] = observation("p1", 0.03)
    assert calibration.choose_threshold(data) == 0.03


def test_choose_threshold_rejects_no_feasible_point_or_missing_class():
    with pytest.raises(ValueError, match="No dev grid point"):
        calibration.choose_threshold(
            calibration.SplitData([[observation("n", 0)]], [[observation("p", 0)]])
        )
    with pytest.raises(ValueError, match="Both classes"):
        calibration.choose_threshold(calibration.SplitData([], [[observation("p", 0)]]))


def test_report_discloses_conditional_and_all_sentence_rates(capsys):
    data = calibration.SplitData([[observation("n", 0.03)]], [[observation("p", 0.03)]], 2, 4)
    calibration.report_at_threshold(data, 0.03)
    output = capsys.readouterr().out
    assert "embedding-Lesk only" in output
    assert "non-pun eligible sentences: 1/2" in output
    assert "homographic-pun eligible sentences: 1/4" in output
    assert "fp_rate=1.000  recall=1.000" in output
    assert "all-gold-sentence rates: fp_rate=0.500  recall=0.250" in output


def test_normalized_sweep_minimizes_each_sentence_independently(capsys):
    data = calibration.SplitData(
        [[observation("n1", 0.02, 50), observation("n1", 0.08, 2)], [observation("n2", 0.8)]],
        [[observation("p", 0.02, 50), observation("p", 0.08, 2)]],
    )
    calibration.report_sweep(data)
    normalized = capsys.readouterr().out.split("-- sense-count-normalized threshold")[1]
    assert "threshold=0.20  fp_rate=0.500  recall=1.000" in normalized
