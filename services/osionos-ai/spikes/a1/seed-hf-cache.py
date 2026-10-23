#!/usr/bin/env python3
"""The seeder of the cache of Hugging Face (AI-A1).

The speech-to-text server (speaches) downloads its model with
huggingface_hub. The spike pins the model, so the files are fetched by
fetch.py, checked against the lock, and put in the cache of Hugging Face in
the layout that huggingface_hub expects:

    models--<org>--<name>/blobs/<etag>
    models--<org>--<name>/refs/<revision>
    models--<org>--<name>/snapshots/<commit>/<file> -> ../../blobs/<etag>

The server then finds the model in the cache and never goes to the network.

usage: seed-hf-cache.py --lock models.lock --src <dir> --cache <dir>
"""

import argparse
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import read_lock  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", required=True)
    parser.add_argument("--src", required=True, help="where fetch.py wrote the files")
    parser.add_argument("--cache", required=True, help="the cache of Hugging Face")
    parser.add_argument("--group", default="stt")
    args = parser.parse_args()

    repos = {}
    for row in read_lock(args.lock):
        group, kind, name, source, revision, path, size, sha, blob = row
        if group != args.group or kind != "model":
            continue
        repos.setdefault((source, revision), []).append((path, blob, sha))

    for (source, revision), files in sorted(repos.items()):
        folder = os.path.join(
            args.cache, "models--" + source.replace("/", "--")
        )
        blobs = os.path.join(folder, "blobs")
        snapshots = os.path.join(folder, "snapshots", revision)
        refs = os.path.join(folder, "refs")
        for path in (blobs, snapshots, refs):
            os.makedirs(path, exist_ok=True)
        for name, blob, sha in files:
            origin = os.path.join(args.src, group, name)
            if not os.path.exists(origin):
                print(f"  {source}: {name} is missing", file=sys.stderr)
                raise SystemExit(1)
            target = os.path.join(blobs, blob)
            if not os.path.exists(target):
                shutil.copyfile(origin, target)
            link = os.path.join(snapshots, name)
            if os.path.islink(link) or os.path.exists(link):
                os.remove(link)
            os.symlink(os.path.relpath(target, os.path.dirname(link)), link)
        with open(os.path.join(refs, "main"), "w", encoding="utf-8") as out:
            out.write(revision + "\n")
        print(f"  {source} @ {revision}: {len(files)} files in the cache")
    print(json.dumps({"cache": args.cache, "repos": len(repos)}))


if __name__ == "__main__":
    main()
