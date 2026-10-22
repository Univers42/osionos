#!/usr/bin/env python3
"""The summary of the scores of the output check (AI-A1, devil C73).

Every image of the sets is SAFE, so every image the model calls `nsfw` is a
false positive. The summary reads the scores of the bench and prints:

  - the distribution of the score of the unsafe label, per set
  - the rate of the false positives at the thresholds 0.5, 0.7 and 0.9, with
    the interval of Wilson at 95 %
  - the five highest scores of every set, by id
  - the time of one image: p50, p95, max

usage: nsfw-summarize.py --scores <tsv> [--label <name>]
"""

import argparse
import math

THRESHOLDS = (0.5, 0.7, 0.9)
SETS = ("gen", "a1", "coco")


def percentile(values, quantile):
    """The percentile of a list, by linear interpolation (the way of numpy)."""
    if not values:
        return float("nan")
    ordered = sorted(values)
    at = (len(ordered) - 1) * quantile
    low = math.floor(at)
    high = math.ceil(at)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (at - low)


def wilson(flagged, total, z=1.96):
    """The interval of Wilson at 95 % of a rate."""
    if total == 0:
        return 0.0, 1.0
    rate = flagged / total
    denominator = 1 + z * z / total
    centre = (rate + z * z / (2 * total)) / denominator
    half = z * math.sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator
    return max(0.0, centre - half), min(1.0, centre + half)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores", required=True)
    parser.add_argument("--label", default="run")
    args = parser.parse_args()

    rows = []
    with open(args.scores, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("set\t"):
                continue
            set_name, image_id, score, ms = line.split("\t")
            rows.append((set_name, image_id, float(score), float(ms)))

    print(f"== the scores of the safe images, {args.label}")
    print(f"{'set':<6}{'images':>7}{'min':>10}{'p50':>10}{'p95':>10}{'max':>10}")
    for set_name in SETS:
        scores = [row[2] for row in rows if row[0] == set_name]
        if not scores:
            continue
        print(
            f"{set_name:<6}{len(scores):>7}{min(scores):>10.4f}{percentile(scores, 0.5):>10.4f}"
            f"{percentile(scores, 0.95):>10.4f}{max(scores):>10.4f}"
        )

    print()
    print(f"== the false positives, {args.label}")
    print(f"{'set':<6}{'threshold':>10}{'flagged':>9}{'images':>8}{'rate':>9}   wilson 95 %")
    for set_name in SETS:
        scores = [row[2] for row in rows if row[0] == set_name]
        if not scores:
            continue
        for threshold in THRESHOLDS:
            flagged = sum(1 for score in scores if score >= threshold)
            low, high = wilson(flagged, len(scores))
            print(
                f"{set_name:<6}{threshold:>10.2f}{flagged:>9}{len(scores):>8}"
                f"{flagged / len(scores):>8.2%}   [{low:.2%}, {high:.2%}]"
            )

    print()
    print(f"== the five highest of every set, {args.label}")
    for set_name in SETS:
        of_set = sorted(
            (row for row in rows if row[0] == set_name), key=lambda row: row[2], reverse=True
        )
        if not of_set:
            continue
        for rank, (name, image_id, score, _ms) in enumerate(of_set[:5], start=1):
            print(f"{name:<6}{rank:>3}  {image_id:<14}{score:>10.4f}")

    print()
    print(f"== the time of one image, {args.label}")
    times = [row[3] for row in rows]
    if times:
        print(
            f"{'images':>7}{'p50':>10}{'p95':>10}{'max':>10}"
            f"\n{len(times):>7}{percentile(times, 0.5):>10.1f}"
            f"{percentile(times, 0.95):>10.1f}{max(times):>10.1f}"
        )


if __name__ == "__main__":
    main()
