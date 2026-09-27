"""Build the pruned Wiktionary SQLite file used by sense selection's Tier 2 fallback."""

import argparse
import json
import sqlite3
import sys
from collections.abc import Iterable
from pathlib import Path

KEEP_POS = {"noun", "verb", "adj"}
SKIP_SENSE_TAGS = {"form-of", "alt-of"}


def keep_entry(entry: dict) -> bool:
    """True if a kaikki entry is a single-word English noun/verb/adj."""
    return (
        entry.get("lang_code") == "en"
        and entry.get("pos") in KEEP_POS
        and " " not in entry.get("word", "")
    )


def entry_glosses(entry: dict) -> list[str]:
    """One gloss per sense of an entry, skipping form-of/alt-of senses."""
    glosses = []
    for sense in entry.get("senses", []):
        if any(tag in SKIP_SENSE_TAGS for tag in sense.get("tags", [])):
            continue
        if not sense.get("glosses"):
            continue
        # Sub-senses list [parent gloss, own gloss]; the last is the sense's own meaning.
        glosses.append(sense["glosses"][-1])
    return glosses


def build_db(lines: Iterable[str], out_path: Path) -> int:
    """Write the senses table from kaikki JSONL lines; return the number of rows."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.unlink(missing_ok=True)
    conn = sqlite3.connect(out_path)
    conn.execute("CREATE TABLE senses (word TEXT, pos TEXT, gloss TEXT)")

    rows = 0
    for line in lines:
        if not line.strip():
            continue
        entry = json.loads(line)
        if not keep_entry(entry):
            continue
        glosses = entry_glosses(entry)
        conn.executemany(
            "INSERT INTO senses VALUES (?, ?, ?)",
            [(entry["word"], entry["pos"], gloss) for gloss in glosses],
        )
        rows += len(glosses)

    # Built once after loading -- far faster than maintaining it on every insert.
    conn.execute("CREATE INDEX idx_senses_word_pos ON senses (word, pos)")
    conn.commit()
    conn.close()
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="kaikki English JSONL file, or - for stdin")
    parser.add_argument("output", type=Path, help="SQLite file to write")
    args = parser.parse_args()

    if args.input == "-":
        rows = build_db(sys.stdin, args.output)
    else:
        with open(args.input, encoding="utf-8") as f:
            rows = build_db(f, args.output)
    print(f"wrote {rows} senses to {args.output}")


if __name__ == "__main__":
    main()
