#!/usr/bin/env python3
"""Speech-to-text bench of the dictation server (AI-A1, M5).

Two modes, stdlib only:

  run        stt-bench.py run --model <id> --base http://ai-stt-srv:8000 \
                 --clips /clips --tsv <clips.tsv> --out <raw-dir>
             One warm-up call (not counted), then every clip of every
             language: wall latency of POST /v1/audio/transcriptions, audio
             duration, RTF, the hypothesis. Writes <raw-dir>/<slug>.json.

  summarize  stt-bench.py summarize --raw <raw-dir> --out <summary-stt.json>
             Corpus WER with a 95% bootstrap CI (1000 resamples, seed 42),
             the paired bootstrap CI of WER(turbo) - WER(small), p50/p95 of
             latency and RTF.

Caveat: the wer() normaliser below is NOT Whisper's own normaliser, so the
numbers are not comparable with published ones. Latency is client-side wall
time on a host shared with other jobs.
"""

import argparse
import json
import os
import random
import re
import struct
import sys
import time
import unicodedata
import urllib.request
import uuid

LANGS = {"en_us": "en", "fr_fr": "fr", "es_419": "es"}
SMALL = "Systran/faster-whisper-small"
TURBO = "deepdml/faster-whisper-large-v3-turbo-ct2"


def normalise(text):
    """NFKC, lower case, drop Unicode punctuation (P*), collapse spaces.

    Caveat: this is not Whisper's own normaliser. It does not spell out
    numbers ("25" vs "twenty five" counts as an error), keeps hyphen-joined
    words glued ("one-hundred" -> "onehundred") and treats accents as
    significant. WER is not comparable with papers.
    """
    text = unicodedata.normalize("NFKC", text).lower()
    text = "".join(c for c in text if not unicodedata.category(c).startswith("P"))
    return " ".join(text.split())


def edits(ref, hyp):
    """Word-level Levenshtein distance between two word lists."""
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1]


def _self_check():
    assert edits("a b c".split(), "a b c".split()) == 0
    assert edits("a b c".split(), "a x c d".split()) == 2  # 1 sub + 1 ins
    assert edits("a b c".split(), []) == 3
    assert normalise("Hello,  «World»! Don't") == "hello world dont"


def percentile(values, q):
    """Linear-interpolated percentile, q in [0, 100]."""
    s = sorted(values)
    k = (len(s) - 1) * q / 100
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def wav_seconds(path):
    """Duration from the wav header.

    The stdlib `wave` module rejects format 3 (IEEE float), which is what
    FLEURS ships, so it is tried first and the RIFF chunks are walked on failure.
    """
    import wave
    try:
        with wave.open(path) as w:
            return w.getnframes() / w.getframerate()
    except wave.Error:
        pass
    with open(path, "rb") as fh:
        fh.read(12)
        rate = channels = bits = None
        while True:
            head = fh.read(8)
            if len(head) < 8:
                raise SystemExit(f"{path}: no data chunk")
            name, size = struct.unpack("<4sI", head)
            if name == b"fmt ":
                fmt = fh.read(size)
                channels, rate = struct.unpack("<HI", fmt[2:8])
                bits = struct.unpack("<H", fmt[14:16])[0]
            elif name == b"data":
                return size / (rate * channels * (bits // 8))
            else:
                fh.seek(size + (size & 1), os.SEEK_CUR)


def transcribe(base, model, lang, path):
    boundary = uuid.uuid4().hex
    parts = []
    for key, val in (("model", model), ("language", lang)):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{val}\r\n'.encode())
    with open(path, "rb") as fh:
        data = fh.read()
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(path)}"\r\n'
        f"Content-Type: audio/wav\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        base + "/v1/audio/transcriptions", data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = resp.read()
    return time.perf_counter() - t0, json.loads(body)["text"]


def read_tsv(path):
    with open(path, encoding="utf-8") as fh:
        head = fh.readline().rstrip("\n").split("\t")
        return [dict(zip(head, line.rstrip("\n").split("\t"))) for line in fh]


def cmd_run(args):
    rows = read_tsv(args.tsv)
    warm = next(r for r in rows if r["lang"] == "en_us")
    transcribe(args.base, args.model, "en", os.path.join(args.clips, "en_us", warm["file"]))
    out = []
    for n, row in enumerate(rows, 1):
        path = os.path.join(args.clips, row["lang"], row["file"])
        latency, hyp = transcribe(args.base, args.model, LANGS[row["lang"]], path)
        dur = wav_seconds(path)
        out.append({"lang": row["lang"], "id": row["id"], "duration_s": dur,
                    "latency_s": latency, "rtf": latency / dur,
                    "ref": row["raw_transcription"], "hyp": hyp})
        print(f"{n}/{len(rows)} {row['lang']} {latency:.2f}s rtf {latency / dur:.3f}", flush=True)
    os.makedirs(args.out, exist_ok=True)
    slug = args.model.replace("/", "--")
    with open(os.path.join(args.out, slug + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"model": args.model, "clips": out}, fh, ensure_ascii=False, indent=1)


def corpus_wer(items, idx):
    e = sum(items[i][0] for i in idx)
    w = sum(items[i][1] for i in idx)
    return e / w


def ci(samples):
    return percentile(samples, 2.5), percentile(samples, 97.5)


def cmd_summarize(args):
    _self_check()
    raw = {}
    for name in os.listdir(args.raw):
        if name.endswith(".json"):
            d = json.load(open(os.path.join(args.raw, name), encoding="utf-8"))
            raw[d["model"]] = d["clips"]
    summary = {"seed": 42, "resamples": 1000, "models": {}, "paired": {}}
    per = {}
    for model, clips in raw.items():
        summary["models"][model] = {}
        for lang in LANGS:
            sel = [c for c in clips if c["lang"] == lang]
            items = []
            for c in sel:
                ref, hyp = normalise(c["ref"]).split(), normalise(c["hyp"]).split()
                items.append((edits(ref, hyp), len(ref)))
            per[(model, lang)] = (sel, items)
            rng = random.Random(42)
            boots = [corpus_wer(items, [rng.randrange(len(items)) for _ in items]) for _ in range(1000)]
            lat = [c["latency_s"] for c in sel]
            rtf = [c["rtf"] for c in sel]
            lo, hi = ci(boots)
            summary["models"][model][lang] = {
                "clips": len(sel), "ref_words": sum(i[1] for i in items),
                "wer": corpus_wer(items, range(len(items))), "wer_ci95": [lo, hi],
                "latency_p50": percentile(lat, 50), "latency_p95": percentile(lat, 95),
                "rtf_p50": percentile(rtf, 50), "rtf_p95": percentile(rtf, 95)}
    if SMALL in raw and TURBO in raw:
        for lang in LANGS:
            a, b = per[(SMALL, lang)][1], per[(TURBO, lang)][1]
            ids_a = [c["id"] for c in per[(SMALL, lang)][0]]
            ids_b = [c["id"] for c in per[(TURBO, lang)][0]]
            assert ids_a == ids_b, "models ran on different clips"
            rng = random.Random(42)
            diffs = []
            for _ in range(1000):
                idx = [rng.randrange(len(a)) for _ in a]
                diffs.append(corpus_wer(b, idx) - corpus_wer(a, idx))
            lo, hi = ci(diffs)
            summary["paired"][lang] = {
                "delta_wer_turbo_minus_small": corpus_wer(b, range(len(b))) - corpus_wer(a, range(len(a))),
                "ci95": [lo, hi], "excludes_zero": lo > 0 or hi < 0}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=1)
    print(json.dumps(summary, indent=1))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--model", required=True)
    r.add_argument("--base", required=True)
    r.add_argument("--clips", required=True)
    r.add_argument("--tsv", required=True)
    r.add_argument("--out", required=True)
    s = sub.add_parser("summarize")
    s.add_argument("--raw", required=True)
    s.add_argument("--out", required=True)
    args = p.parse_args()
    _self_check()
    {"run": cmd_run, "summarize": cmd_summarize}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
