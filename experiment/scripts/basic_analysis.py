"""Basic analysis of the discovery-chain data (draft, T4).

Reads the CSVs written by export_and_analyze.py and writes summary tables
(and figures, if matplotlib is installed) by condition x generation.
Follows Bonan's R/analysis.R where it can:

1. Total points per participant (log), by condition x generation.
2. Cumulative log points after each action (her "Points per action" plot).
3. Highest item level reached after each action (her "Highest levels" plot).
4. Message length (words in message_how + message_rules).
5. Messages read and saved per participant (generations 1+).

Usage:
    python scripts/basic_analysis.py --csv-dir <derived_csv folder> --output-dir <folder>
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

CONDITIONS = ["easy", "medium", "hard"]
MAX_ACTIONS = 40


def mean_se(series: pd.Series) -> pd.Series:
    n = series.count()
    se = series.std() / np.sqrt(n) if n > 1 else np.nan
    return pd.Series({"n": n, "mean": series.mean(), "se": se})


def load(csv_dir: Path) -> dict[str, pd.DataFrame]:
    data = {
        "subject": pd.read_csv(csv_dir / "subject_data.csv"),
        "action": pd.read_csv(csv_dir / "action_data.csv"),
    }
    read_path = csv_dir / "message_read_data.csv"
    data["read"] = pd.read_csv(read_path) if read_path.exists() else pd.DataFrame()

    subject = data["subject"]
    if "failed" in subject:
        # Keep only completed, non-failed trials.
        subject = subject[subject["failed"].astype(str).str.lower() != "true"]
    subject["condition"] = pd.Categorical(subject["condition"], CONDITIONS, ordered=True)
    data["subject"] = subject
    data["action"]["condition"] = pd.Categorical(data["action"]["condition"], CONDITIONS, ordered=True)
    return data


def points_table(subject: pd.DataFrame) -> pd.DataFrame:
    # Bonan uses log(total_points); +1 so that a score of 0 stays finite.
    subject = subject.assign(total_points_log=np.log(subject["total_score"].astype(float) + 1))
    return (
        subject.groupby(["condition", "generation_id"], observed=True)["total_points_log"]
        .apply(mean_se).unstack().reset_index()
    )


def per_step(action: pd.DataFrame) -> pd.DataFrame:
    """One row per participant x step (1..40): cumulative log points and highest level."""
    action = action.copy()
    action["step"] = action.groupby("id").cumcount() + 1
    action["level"] = (
        action["item_yield"].fillna("").astype(str)
        .map(lambda y: int(m.group(1)) if (m := re.search(r"_(\d+)$", y)) else 0)
    )
    action["highest_level"] = action.groupby("id")["level"].cummax()
    action["total_points_log"] = np.log(action["total_score"].astype(float) + 1)

    keys = action.groupby("id")[["condition", "generation_id"]].first()
    grid = pd.MultiIndex.from_product([keys.index, range(1, MAX_ACTIONS + 1)], names=["id", "step"])
    full = (
        action.set_index(["id", "step"])[["total_points_log", "highest_level"]]
        .reindex(grid)
        .groupby(level="id").ffill()   # Bonan's complete() + fill(down)
        .fillna(0)
        .reset_index()
        .join(keys, on="id")
    )
    return full


def step_table(full: pd.DataFrame, column: str) -> pd.DataFrame:
    return (
        full.groupby(["condition", "generation_id", "step"], observed=True)[column]
        .apply(mean_se).unstack().reset_index()
    )


def message_table(subject: pd.DataFrame) -> pd.DataFrame:
    words = lambda s: s.fillna("").astype(str).str.split().str.len()
    subject = subject.assign(message_words=words(subject["message_how"]) + words(subject["message_rules"]))
    return (
        subject.groupby(["condition", "generation_id"], observed=True)["message_words"]
        .apply(mean_se).unstack().reset_index()
    )


def reading_table(read: pd.DataFrame) -> pd.DataFrame:
    if read.empty:
        return pd.DataFrame()
    per_person = read.groupby(["id", "condition", "generation_id"]).agg(
        times_read=("message_id", "size"),
        distinct_read=("message_id", "nunique"),
        saved=("saved_to_notebook", "sum"),
        total_dwell_ms=("dwell_ms", "sum"),
    ).reset_index()
    return per_person.groupby(["condition", "generation_id"]).mean(numeric_only=True).drop(columns="id").reset_index()


def plot(full: pd.DataFrame, output_dir: Path) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed: tables only.")
        return
    for column, label in [("total_points_log", "Mean log total points"), ("highest_level", "Mean highest level")]:
        table = step_table(full, column)
        gens = sorted(table["generation_id"].unique())
        fig, axes = plt.subplots(1, len(gens), figsize=(4 * len(gens), 3.5), sharey=True, squeeze=False)
        for ax, gen in zip(axes[0], gens):
            for cond in CONDITIONS:
                t = table[(table["generation_id"] == gen) & (table["condition"] == cond)]
                if t.empty:
                    continue
                ax.plot(t["step"], t["mean"], label=cond)
                ax.fill_between(t["step"], t["mean"] - t["se"], t["mean"] + t["se"], alpha=0.2)
            ax.set_title(f"generation {gen}")
            ax.set_xlabel("action")
        axes[0][0].set_ylabel(label)
        axes[0][-1].legend()
        fig.tight_layout()
        fig.savefig(output_dir / f"{column}_by_step.png", dpi=150)
        plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    data = load(args.csv_dir)
    full = per_step(data["action"])
    tables = {
        "points_by_condition_generation": points_table(data["subject"]),
        "log_points_by_step": step_table(full, "total_points_log"),
        "highest_level_by_step": step_table(full, "highest_level"),
        "message_words_by_condition_generation": message_table(data["subject"]),
        "reading_by_condition_generation": reading_table(data["read"]),
    }
    for name, table in tables.items():
        table.to_csv(args.output_dir / f"{name}.csv", index=False)
    plot(full, args.output_dir)

    pd.set_option("display.width", 120)
    print("Log total points:\n", tables["points_by_condition_generation"].round(2), "\n")
    print("Message length (words):\n", tables["message_words_by_condition_generation"].round(1), "\n")
    print("Reading:\n", tables["reading_by_condition_generation"].round(1))


if __name__ == "__main__":
    main()
