#!/usr/bin/env python3
"""
Export and analyze discovery-chain PsyNet data.

Usage examples
--------------

1. Analyze an existing PsyNet export zip, such as the simulated export saved by
   this attempt:

   python scripts/export_and_analyze.py \
       --export-path ../../evidence/simulated_data.zip \
       --output-dir ../../evidence/derived_csv

2. Export the currently running local PsyNet experiment first, then analyze it:

   python scripts/export_and_analyze.py \
       --run-local-export \
       --local-export-dir data/manual_export \
       --output-dir ../../evidence/manual_derived_csv

The script writes four CSV files:

- subject_data.csv
- action_data.csv
- event_data.csv
- notebook_data.csv

It removes parser-hostile special characters from free-text fields while keeping
ordinary punctuation and substantive message content.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

TEXT_FIELDS = {"messageHow", "messageRules", "notes_composed", "messages_composed"}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"[\"'`\\@#$%^*]", "", text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_obj(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: clean_obj(val) for key, val in value.items()}
    if isinstance(value, list):
        return [clean_obj(val) for val in value]
    if isinstance(value, str):
        return clean_text(value)
    return value


def json_cell(value: Any) -> str:
    return json.dumps(clean_obj(value), ensure_ascii=False, sort_keys=True)


def maybe_json(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def run_local_export(local_export_dir: Path) -> Path:
    local_export_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "psynet",
            "export",
            "local",
            "--anonymize",
            "both",
            "--assets",
            "none",
            "--path",
            str(local_export_dir),
        ],
        check=True,
    )
    return local_export_dir


def extract_export(export_path: Path, work_dir: Path) -> Path:
    if export_path.is_dir():
        return export_path
    if not zipfile.is_zipfile(export_path):
        raise ValueError(f"Unsupported export path: {export_path}")
    with zipfile.ZipFile(export_path) as zf:
        zf.extractall(work_dir)
    return work_dir


def data_root(export_root: Path) -> Path:
    candidates = [
        export_root / "regular" / "data",
        export_root / "anonymous" / "data",
        export_root / "data",
    ]
    for candidate in candidates:
        if (candidate / "DiscoveryTrial.csv").exists():
            return candidate
    matches = list(export_root.rglob("DiscoveryTrial.csv"))
    if matches:
        return matches[0].parent
    raise FileNotFoundError(f"Could not find DiscoveryTrial.csv under {export_root}")


def read_trials(data_dir: Path) -> list[dict[str, str]]:
    with (data_dir / "DiscoveryTrial.csv").open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def trial_answer(row: dict[str, str]) -> dict[str, Any]:
    return maybe_json(row.get("answer"), {})


def build_children_by_source_trial(trial_answers: Iterable[dict[str, Any]]) -> dict[int, set[int]]:
    children: dict[int, set[int]] = defaultdict(set)
    for answer in trial_answers:
        participant_id = answer.get("participant_id_hint") or answer.get("participant_id")
        incoming_messages = {
            msg.get("sample_id"): msg
            for msg in (answer.get("incoming_message_set", {}) or {}).get("messages", [])
        }
        notebook_entries = (answer.get("messages", {}) or {}).get("notebook", [])
        for entry in notebook_entries:
            msg = incoming_messages.get(entry.get("sampleId"))
            if not msg:
                continue
            source_trial_id = msg.get("source_trial_id")
            if source_trial_id is not None and participant_id is not None:
                children[int(source_trial_id)].add(int(participant_id))
    return children


def subject_rows(trials: list[dict[str, str]], answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    children = build_children_by_source_trial(answers)
    rows = []
    for row, answer in zip(trials, answers):
        messages = answer.get("messages", {}) or {}
        outgoing = messages.get("outgoing", {}) or {}
        timing = answer.get("timing", {}) or {}
        rows.append({
            "id": row.get("participant_id") or answer.get("participant_id_hint") or row.get("id"),
            "trial_id": row.get("id"),
            "condition": answer.get("condition"),
            "chain_id": answer.get("chain_id"),
            "generation_id": answer.get("generation_index"),
            "total_score": (answer.get("game", {}) or {}).get("total_points"),
            "messages_composed": json_cell(outgoing),
            "message_how": clean_text(outgoing.get("messageHow")),
            "message_rules": clean_text(outgoing.get("messageRules")),
            "time_start": row.get("creation_time"),
            "time_complete": row.get("time_of_death") or row.get("creation_time"),
            "children_id": json_cell(sorted(children.get(int(row.get("id") or 0), []))),
            "layout_seed": ((answer.get("game_config", {}) or {}).get("layout_seed")),
        })
    return rows


def action_rows(answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for answer in answers:
        running_score = 0
        game = answer.get("game", {}) or {}
        for action in game.get("actions", []) or []:
            immediate = int(action.get("points") or 0)
            running_score += immediate
            rows.append({
                "id": answer.get("participant_id_hint"),
                "trial_index_within_generation": answer.get("trial_index_within_generation"),
                "action_id": action.get("action_id") or action.get("id"),
                "action_type": action.get("action"),
                "item_hold": clean_text(action.get("held")),
                "item_stand": clean_text(action.get("target")),
                "item_yield": clean_text(action.get("yield")),
                "immediate_score": immediate,
                "total_score": running_score,
                "condition": answer.get("condition"),
                "chain_id": answer.get("chain_id"),
                "generation_id": answer.get("generation_index"),
            })
    return rows


def event_rows(answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for answer in answers:
        for event in (answer.get("game", {}) or {}).get("events", []) or []:
            event_type = event.get("action") or event.get("event_type")
            rows.append({
                "id": answer.get("participant_id_hint"),
                "trial_index_within_generation": answer.get("trial_index_within_generation"),
                "event_id": event.get("event_id") or event.get("id"),
                "event_type": event_type,
                "event_content": json_cell(event),
                "condition": answer.get("condition"),
                "chain_id": answer.get("chain_id"),
                "generation_id": answer.get("generation_index"),
            })
    return rows


def notebook_rows(answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for answer in answers:
        messages = answer.get("messages", {}) or {}
        read_events = []
        for index, event in enumerate(messages.get("read_events", []) or [], start=1):
            read_events.append({
                "message_id": event.get("sampleId"),
                "sequence_id": index,
                "time_open": event.get("openedAt"),
                "time_close": event.get("closedAt"),
                "dwell_ms": event.get("dwellMs"),
            })
        rows.append({
            "id": answer.get("participant_id_hint"),
            "trial_index_within_generation": answer.get("trial_index_within_generation"),
            "condition": answer.get("condition"),
            "chain_id": answer.get("chain_id"),
            "generation_id": answer.get("generation_index"),
            "messages_read": json_cell(read_events),
            "messages_added": json_cell(messages.get("notebook", [])),
            "messages_deleted": json_cell(messages.get("notebook_deleted", [])),
            "notes_composed": clean_text(messages.get("strategy_summary")),
        })
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = sorted({key for row in rows for key in row.keys()})
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def analyze_export(export_path: Path, output_dir: Path) -> dict[str, Path]:
    with tempfile.TemporaryDirectory() as tmp:
        root = extract_export(export_path, Path(tmp))
        data_dir = data_root(root)
        trials = read_trials(data_dir)
        answers = [trial_answer(row) for row in trials]
        outputs = {
            "subject_data": output_dir / "subject_data.csv",
            "action_data": output_dir / "action_data.csv",
            "event_data": output_dir / "event_data.csv",
            "notebook_data": output_dir / "notebook_data.csv",
        }
        write_csv(outputs["subject_data"], subject_rows(trials, answers))
        write_csv(outputs["action_data"], action_rows(answers))
        write_csv(outputs["event_data"], event_rows(answers))
        write_csv(outputs["notebook_data"], notebook_rows(answers))
    return outputs


def latest_export_zip(export_dir: Path) -> Path:
    zip_path = export_dir / "simulated_data.zip"
    if zip_path.exists():
        return zip_path
    archive = export_dir.with_suffix(".zip")
    if archive.exists():
        return archive
    zipped = sorted(export_dir.rglob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if zipped:
        return zipped[0]
    temp_zip = export_dir.with_suffix(".zip")
    if temp_zip.exists():
        temp_zip.unlink()
    shutil.make_archive(str(temp_zip.with_suffix("")), "zip", export_dir)
    return temp_zip


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export-path", type=Path, help="Existing PsyNet export zip or directory to analyze.")
    parser.add_argument("--run-local-export", action="store_true", help="Run `psynet export local` before analysis.")
    parser.add_argument("--local-export-dir", type=Path, default=Path("data/manual_export"), help="Directory for `psynet export local` output.")
    parser.add_argument("--output-dir", type=Path, default=Path("analysis_output"), help="Directory where derived CSV files are written.")
    args = parser.parse_args()

    export_path = args.export_path
    if args.run_local_export:
        export_root = run_local_export(args.local_export_dir)
        export_path = latest_export_zip(export_root)
    if export_path is None:
        parser.error("Provide --export-path or --run-local-export.")

    outputs = analyze_export(export_path, args.output_dir)
    for name, path in outputs.items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    main()
