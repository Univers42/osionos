#!/usr/bin/env python3
"""The summary of the vision spike (AI-A1).

The answer of every picture is read, the tags and the objects are mapped to the
categories of COCO with the table of the synonyms, and the numbers of the
spike are written: the precision at five, the recall, the rate of the valid
JSON, the latency, the distribution of the safety hint and the OCR of the
twenty pictures that hold text.

The precision at five of a picture is the number of its first five tags (and
objects) that are a category of COCO of that picture, over five: a tag that the
table of the synonyms does not know is a miss, and a picture that answers fewer
than five tags is punished for the missing ones.

The intervals are the ones of a bootstrap: the pictures are drawn again, with
replacement, a thousand times, and the two and a half and the ninety-seven and
a half percentiles of the mean are the bounds.

usage: vlm-summarize.py --run <run.jsonl> --set <manifest.json>
                        [--synonyms <tag-synonyms.json>] [--out <file>]
                        [--label <name>] [--boot 1000] [--seed 42]
"""

import argparse
import json
import os
import random
import sys


def percentile(values, fraction):
    """The percentile of a list, by linear interpolation (the way of numpy)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = fraction * (len(ordered) - 1)
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def bootstrap(values, rounds, seed):
    """The 95 % interval of the mean of a list, by a bootstrap."""
    if not values:
        return (0.0, 0.0)
    rng = random.Random(seed)
    size = len(values)
    means = []
    for _ in range(rounds):
        total = 0.0
        for _ in range(size):
            total += values[rng.randrange(size)]
        means.append(total / size)
    return (percentile(means, 0.025), percentile(means, 0.975))


def load_synonyms(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["toCOCO"]


def clean(tag):
    return " ".join(str(tag).lower().replace("_", " ").replace("-", " ").split())


def mapped_categories(tag, table):
    """The categories of COCO of a tag, or None when the table does not know it."""
    key = clean(tag)
    if key in table:
        return list(table[key])
    # A tag that the table knows in another spelling (a plural, a space).
    for name, categories in table.items():
        if name == key or name.rstrip("s") == key.rstrip("s"):
            return list(categories)
    return None


def read_run(path):
    """The rows of a run, one per picture: the last answer of a picture wins.

    A run that was cut and asked again leaves two rows for a picture: the
    answer of the first try (an error) and the answer of the second. The last
    one is the answer of the run.
    """
    rows = []
    index = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = str(row.get("id"))
            if key in index:
                rows[index[key]] = row
            else:
                index[key] = len(rows)
                rows.append(row)
    return rows


def the_truth(manifest):
    truth = {}
    captions = {}
    texts = set()
    with open(manifest, encoding="utf-8") as fh:
        parsed = json.load(fh)
    for image in parsed["images"]:
        truth[image["id"]] = set(image["coco_categories"])
        captions[image["id"]] = image.get("caption", "")
        if image.get("text"):
            texts.add(image["id"])
    return truth, captions, texts


def score_row(row, truth, table):
    """The numbers of one picture."""
    answer = row.get("answer") or {}
    tags = answer.get("tags") or []
    objects = answer.get("objects") or []
    gt = truth.get(row["id"], set())

    predictions = []
    seen = set()
    for tag in list(tags) + list(objects):
        key = clean(tag)
        if not key or key in seen:
            continue
        seen.add(key)
        predictions.append((key, mapped_categories(key, table)))

    # The precision at five: the first five predictions, five as the divisor.
    hits = 0
    for _tag, categories in predictions[:5]:
        if categories and set(categories) & gt:
            hits += 1
    precision = hits / 5.0

    found = set()
    for _tag, categories in predictions:
        if categories:
            found.update(categories)
    recall = len(found & gt) / len(gt) if gt else 0.0

    # The same two numbers, with the tags alone (without the objects).
    only_tags = []
    seen = set()
    for tag in tags:
        key = clean(tag)
        if not key or key in seen:
            continue
        seen.add(key)
        only_tags.append((key, mapped_categories(key, table)))
    hits = 0
    for _tag, categories in only_tags[:5]:
        if categories and set(categories) & gt:
            hits += 1
    precision_tags = hits / 5.0
    found = set()
    for _tag, categories in only_tags:
        if categories:
            found.update(categories)
    recall_tags = len(found & gt) / len(gt) if gt else 0.0

    unmapped = sum(1 for _tag, categories in predictions if not categories)
    return {
        "id": row["id"],
        "precision": precision,
        "recall": recall,
        "precision_tags": precision_tags,
        "recall_tags": recall_tags,
        "gt": sorted(gt),
        "predictions": [tag for tag, _ in predictions],
        "mapped": [categories for _, categories in predictions],
        "unmapped": unmapped,
        "safety": answer.get("safety"),
        "valid": bool(row.get("valid")),
        "ok": bool(row.get("ok")),
        "ms": row.get("ms", 0.0),
        "warmup": bool(row.get("warmup")),
        "usage": row.get("usage") or {},
        "timings": row.get("timings") or {},
        "answer": answer,
    }


def summarise(rows, truth, table, rounds, seed):
    scored = [score_row(row, truth, table) for row in rows if row.get("ok")]
    warm = [row for row in scored if not row["warmup"]]
    if not warm:
        warm = scored

    precisions = [row["precision"] for row in warm]
    recalls = [row["recall"] for row in warm]
    latencies = [row["ms"] / 1000.0 for row in warm]
    valid = [row for row in scored if row["valid"]]
    safety = {}
    for row in warm:
        key = row["safety"] or "missing"
        safety[key] = safety.get(key, 0) + 1
    flagged = [row for row in warm if row["safety"] not in (None, "safe")]
    texts = [row for row in warm if (row["answer"].get("ocr") or "").strip()]

    prompt_tokens = []
    completion_tokens = []
    for row in warm:
        usage = row["usage"]
        if usage.get("prompt_tokens"):
            prompt_tokens.append(usage["prompt_tokens"])
        if usage.get("completion_tokens"):
            completion_tokens.append(usage["completion_tokens"])

    return {
        "images": len(warm),
        "warmup_answers": len(scored) - len(warm),
        "valid_json": {
            "rate": len(valid) / len(scored) if scored else 0.0,
            "count": len(valid),
            "total": len(scored),
        },
        "precision_at_5": {
            "macro": sum(precisions) / len(precisions) if precisions else 0.0,
            "ci": bootstrap(precisions, rounds, seed),
        },
        "recall": {
            "macro": sum(recalls) / len(recalls) if recalls else 0.0,
            "ci": bootstrap(recalls, rounds, seed),
        },
        "precision_at_5_tags_only": {
            "macro": sum(row["precision_tags"] for row in warm) / len(warm) if warm else 0.0,
        },
        "recall_tags_only": {
            "macro": sum(row["recall_tags"] for row in warm) / len(warm) if warm else 0.0,
        },
        "latency_s": {
            "p50": percentile(latencies, 0.50),
            "p95": percentile(latencies, 0.95),
            "min": min(latencies) if latencies else 0.0,
            "max": max(latencies) if latencies else 0.0,
            "mean": sum(latencies) / len(latencies) if latencies else 0.0,
        },
        "tokens": {
            "prompt_p50": percentile(prompt_tokens, 0.50) if prompt_tokens else 0.0,
            "prompt_max": max(prompt_tokens) if prompt_tokens else 0.0,
            "completion_p50": percentile(completion_tokens, 0.50) if completion_tokens else 0.0,
            "completion_max": max(completion_tokens) if completion_tokens else 0.0,
        },
        "safety": {
            "distribution": safety,
            "flagged": len(flagged),
            "false_flag_rate": len(flagged) / len(warm) if warm else 0.0,
        },
        "ocr_answered": len(texts),
        "unmapped_tags": sum(row["unmapped"] for row in warm),
        "predicted_tags": sum(len(row["predictions"]) for row in warm),
    }


def peak_memory(path):
    """The peak of the memory of the container, from the samples of the run."""
    if not path or not os.path.exists(path):
        return None
    peak = 0.0
    samples = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.split()
            if not parts:
                continue
            value = parts[0]
            try:
                number = float(value[:-2])
            except ValueError:
                continue
            unit = value[-2:]
            mib = number * 1024 if unit == "Gi" else number
            if mib > peak:
                peak = mib
            samples += 1
    if not samples:
        return None
    return {"peak_rss_mib": round(peak, 1), "samples": samples}


def peak_vram(path):
    """The peak of the VRAM of the card, from the samples of the run."""
    if not path or not os.path.exists(path):
        return None
    peak = 0
    samples = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.split()
            if len(parts) < 2:
                continue
            try:
                value = int(parts[1])
            except ValueError:
                continue
            peak = max(peak, value)
            samples += 1
    if not samples:
        return None
    return {"peak_vram_mib": round(peak / (1 << 20), 1), "samples": samples}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--set", required=True)
    parser.add_argument("--synonyms", default=None)
    parser.add_argument("--out", default=None)
    parser.add_argument("--label", default="run")
    parser.add_argument("--stats", default=None, help="the samples of the memory")
    parser.add_argument("--vram", default=None, help="the samples of the VRAM")
    parser.add_argument("--boot", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    synonyms = args.synonyms or os.path.join(here, "tag-synonyms.json")
    table = load_synonyms(synonyms)
    truth, captions, texts = the_truth(args.set)
    rows = read_run(args.run)
    summary = summarise(rows, truth, table, args.boot, args.seed)

    # The twenty pictures that hold text: the hypothesis of the model next to
    # the caption of COCO. A human reads them; no number is computed here.
    text_rows = []
    for row in rows:
        answer = row.get("answer") or {}
        if row["id"] not in texts:
            continue
        text_rows.append(
            {
                "id": row["id"],
                "caption": captions.get(row["id"], ""),
                "ocr": answer.get("ocr", ""),
            }
        )
    summary["ocr_sample"] = text_rows[:20]

    memory = peak_memory(args.stats)
    if memory:
        summary["memory"] = memory
    vram = peak_vram(args.vram)
    if vram:
        summary["vram"] = vram

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(summary, fh, ensure_ascii=False, indent=2)
        print(f"the summary is in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
