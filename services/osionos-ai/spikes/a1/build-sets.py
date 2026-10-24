#!/usr/bin/env python3
"""The sets of the guard spike (AI-A1).

The guard is measured on three sets of prompts, and the sets live in the
volume: the text of a prompt is never in the repository.

  i2p        every row of the benchmark of I2P (the unsafe side)
  i2p-hard   the rows of I2P that I2P itself calls hard
  i2p-200    two hundred of the hard rows, for the languages
  coco       a thousand captions of COCO val 2017 (the safe side)
  coco-200   two hundred of those captions, for the languages
  prompts    the prompts of the spike itself (the safe side)

The samples are drawn with Random(7), so that the same rows come back on
every machine.

usage: build-sets.py --i2p <csv> --captions <json> --prompts <file> --dest <dir>
"""

import argparse
import csv
import json
import os
import random


def write_set(path, rows):
    """One row per line: the id of the row, a tab, the text.

    A prompt of I2P or a caption of COCO can hold a line break or a tab, and a
    line break in the file would split the row in two: the guard would then
    answer about half a prompt. So the white space of the text is folded into
    single spaces, and the words of the prompt are kept.
    """
    with open(path, "w", encoding="utf-8") as out:
        for row_id, text in rows:
            out.write(f"{row_id}\t{' '.join(text.split())}\n")
    print(f"  {os.path.basename(path)}: {len(rows)} rows")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--i2p", required=True)
    parser.add_argument("--captions", required=True)
    parser.add_argument("--prompts", required=True)
    parser.add_argument("--dest", required=True)
    args = parser.parse_args()

    os.makedirs(args.dest, exist_ok=True)

    # --- the unsafe side: I2P ---------------------------------------------
    with open(args.i2p, newline="", encoding="utf-8") as fh:
        i2p = list(csv.DictReader(fh))
    write_set(os.path.join(args.dest, "i2p.tsv"), [(i, row["prompt"]) for i, row in enumerate(i2p)])

    hard = [(i, row) for i, row in enumerate(i2p) if row["hard"] == "1"]
    write_set(os.path.join(args.dest, "i2p-hard.tsv"), [(i, row["prompt"]) for i, row in hard])

    sample = random.Random(7).sample(hard, 200)
    write_set(os.path.join(args.dest, "i2p-200.tsv"), [(i, row["prompt"]) for i, row in sample])

    # The truth of the benchmark, for the summary: the row, the flag of I2P
    # and the categories of I2P (a row is in every category it names).
    with open(os.path.join(args.dest, "i2p-truth.tsv"), "w", encoding="utf-8") as out:
        for i, row in enumerate(i2p):
            categories = ",".join(
                part.strip() for part in row["categories"].split(",") if part.strip()
            )
            out.write(f"{i}\t{row['hard']}\t{categories}\n")
    print(f"  i2p-truth.tsv: {len(i2p)} rows")

    # --- the safe side: COCO ---------------------------------------------
    with open(args.captions, encoding="utf-8") as fh:
        captions = json.load(fh)
    first = {}
    for annotation in captions["annotations"]:
        first.setdefault(annotation["image_id"], annotation["caption"])
    images = sorted(first)
    print(f"  the captions: {len(images)} images of COCO val 2017")

    sample = random.Random(7).sample(images, 1000)
    write_set(os.path.join(args.dest, "coco.tsv"), [(i, first[i]) for i in sample])

    sample = random.Random(7).sample(images, 200)
    write_set(os.path.join(args.dest, "coco-200.tsv"), [(i, first[i]) for i in sample])

    # --- the safe side: the prompts of the spike --------------------------
    with open(args.prompts, encoding="utf-8") as fh:
        prompts = [line.strip() for line in fh if line.strip()]
    write_set(os.path.join(args.dest, "prompts.tsv"), list(enumerate(prompts, start=1)))

    # A single prompt, for the probe of a server that is not there.
    write_set(os.path.join(args.dest, "probe.tsv"), [("probe", "a red fox in the snow")])


if __name__ == "__main__":
    main()
