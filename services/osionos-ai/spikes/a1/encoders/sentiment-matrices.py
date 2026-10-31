#!/usr/bin/env python3
"""The confusion matrices of the M6 sentiment sheet (#74), model and baseline.

The run of 2026-10-22 printed them to a run.log that was never committed. This
rebuilds the model's from the committed scores.tsv (gold and label per row) and
re-trains the TF-IDF + LR baseline with the bench's own baseline(), then checks
that both macro-F1 equal the ones RESULTS.md recorded, so the matrices are the
ones of that run and not a new measurement.

    docker run --rm -v osionos_ai_a1_data:/mnt/storage:ro -v "$PWD":/spike:ro \
        -e PYTHONPATH=/mnt/storage/pyenv python:3.12-slim \
        python3 /spike/encoders/sentiment-matrices.py \
        --scores /spike/results/encoders/sent-xlmr-cardiff/scores.tsv --data /mnt/storage
"""

import argparse
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bench", os.path.join(HERE, "encoders-bench.py"))
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)

LANGS = {"english": "en", "french": "fr", "spanish": "sp"}
# Macro-F1 (model, baseline) as results/encoders/RESULTS.md recorded them, 3 decimals.
RECORDED = {"english": (0.712, 0.503), "french": (0.723, 0.542), "spanish": (0.697, 0.502)}


def model_matrix(scores_path, lang):
    matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    with open(scores_path, encoding="utf-8") as fh:
        for line in fh:
            part = line.rstrip("\n").split("\t")
            if part[0].startswith("#") or len(part) < 6 or part[1] != "sentiments" or part[2] != lang:
                continue
            matrix[bench.gold_class(part[4])][bench.CLASSES.index(part[5])] += 1
    return matrix


def show(title, matrix):
    print(f"  {title}: macro-F1 {bench.macro_f1(matrix):.3f}, accuracy {bench.accuracy(matrix):.3f}")
    print("    truth \\ predicted  " + " ".join(f"{name:>9s}" for name in bench.CLASSES))
    for index, name in enumerate(bench.CLASSES):
        print(f"    {name:18s} " + " ".join(f"{count:9d}" for count in matrix[index]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--cap", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    for lang, short in LANGS.items():
        test = os.path.join(args.data, f"sent-{lang}", lang, "test", "0000.parquet")
        train = os.path.join(args.data, f"sent-{lang}", lang, "train", "0000.parquet")
        model = model_matrix(args.scores, short)
        base, base_f1, _ = bench.baseline(train, test, args)
        print(f"== {lang}")
        show("sent-xlmr-cardiff", model)
        show("TF-IDF + LR baseline", base)
        recorded = (round(bench.macro_f1(model), 3), round(base_f1, 3))
        assert recorded == RECORDED[lang], f"{lang}: {recorded} is not the recorded {RECORDED[lang]}"
    print("both macro-F1 match RESULTS.md in every language")


if __name__ == "__main__":
    main()
