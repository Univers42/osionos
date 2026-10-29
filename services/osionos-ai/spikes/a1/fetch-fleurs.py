#!/usr/bin/env python3
"""The fetcher of the speech clips of FLEURS (AI-A1).

The test split of a language of FLEURS is one tarball of about 300 MB, and
the spike needs twenty clips of it. The tarball is sorted, so the twenty
first members are the twenty first of the stream: the fetcher reads the
stream, keeps those twenty, and closes the connection as soon as it has
them. The ids and the transcripts go into a json file next to the clips.

With --total N the fetcher extends the set instead: the clips that are
already in the dest dir are kept (never deleted), and N minus those are drawn
from the rest of the test split with random.Random(--seed). That reads the
whole tarball, not its head.

usage: fetch-fleurs.py --lang en_us --tsv <file> --tar <url> --dest <dir>
       [--total 100 --seed 42]
"""

import argparse
import io
import json
import os
import random
import tarfile
import urllib.request

UA = {"User-Agent": "curl/8.5.0"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True)
    parser.add_argument("--tsv", required=True, help="the test.tsv of the language")
    parser.add_argument("--tar", required=True, help="the url of the test.tar.gz")
    parser.add_argument("--dest", required=True)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--total", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rows = []
    with open(args.tsv, encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            rows.append({"num_samples": parts[0], "file": parts[1],
                         "transcription": parts[2], "raw_transcription": parts[3]})
    by_file = {row["file"]: row for row in rows}

    out_dir = os.path.join(args.dest, args.lang)
    os.makedirs(out_dir, exist_ok=True)
    wanted = None
    have = set()
    if args.total:
        have = {n for n in os.listdir(out_dir) if n in by_file}
        rest = sorted(set(by_file) - have)
        picked = random.Random(args.seed).sample(rest, max(0, args.total - len(have)))
        wanted = set(picked)
    request = urllib.request.Request(args.tar, headers=UA)
    kept = []
    with urllib.request.urlopen(request, timeout=180) as response:
        with tarfile.open(fileobj=response, mode="r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                name = os.path.basename(member.name)
                row = by_file.get(name)
                if row is None or (wanted is not None and name not in wanted):
                    continue
                data = archive.extractfile(member).read()
                with open(os.path.join(out_dir, name), "wb") as out:
                    out.write(data)
                kept.append({**row, "id": name.split(".")[0], "bytes": len(data)})
                print(f"  {args.lang}: {name} ({len(data)} bytes)", flush=True)
                if wanted is None and len(kept) >= args.count:
                    break
                if wanted is not None and len(kept) >= len(wanted):
                    break
    for name in sorted(have):
        row = by_file[name]
        kept.append({**row, "id": name.split(".")[0],
                     "bytes": os.path.getsize(os.path.join(out_dir, name))})
    if not kept:
        raise SystemExit(f"no clip of {args.lang} was found")
    with open(os.path.join(out_dir, "clips.json"), "w", encoding="utf-8") as out:
        json.dump(
            {
                "lang": args.lang,
                "source": "google/fleurs (CC BY 4.0), test split",
                "tar": args.tar,
                "clips": kept,
            },
            out,
            ensure_ascii=False,
            indent=2,
        )
    print(f"  {args.lang}: {len(kept)} clips", flush=True)


if __name__ == "__main__":
    main()
