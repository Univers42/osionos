#!/usr/bin/env python3
"""The fetcher of the models of the speech-to-text (AI-A1).

The lock names every file of a model apart, and two models of the lock have
files of the same name (the config.json of the small model and the one of
the turbo model). So the files of a model go in a directory of their own,
named after the repository of the lock, and the directory is what the server
of the measurement is given: faster-whisper reads a model from a directory
that holds model.bin, tokenizer.json and preprocessor_config.json, and never
goes to the network.

The pieces of a file are fetched by fetch.py, so the network of the host
(the Tor one) is survived, and every file is checked against the sha256 of
the lock.

usage: fetch-stt-models.py --lock models.lock --dest <dir> [--jobs N]
"""

import argparse
import concurrent.futures
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import fetch_piece, read_lock, sha256_of  # noqa: E402


def url_for(row):
    group, kind, name, source, revision, path = row[:6]
    if source == "url":
        return f"{revision}/{path}"
    if source.startswith("github:"):
        org_repo = source[len("github:") :]
        return f"https://github.com/{org_repo}/releases/download/{revision}/{path}"
    return f"https://huggingface.co/{source}/resolve/{revision}/{path}"


def fetch_file(row, dest, jobs):
    group, kind, name, source, revision, path, size, sha, blob = row
    url = url_for(row)
    out = os.path.join(dest, source.replace("/", "--"), path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    expected = int(size)

    if os.path.exists(out) and os.path.getsize(out) == expected:
        got = sha256_of(out)
        if sha == "-" or got == sha:
            print(f"  {name}: already there, sha256 {got}", flush=True)
            return out
        print(f"  {name}: the sha256 is {got}, the lock says {sha}", flush=True)
        os.remove(out)

    pieces = min(jobs, max(1, expected // (4 << 20)))
    step = expected // pieces
    progress = [0] * pieces
    bounds = []
    for index in range(pieces):
        start = index * step
        end = expected - 1 if index == pieces - 1 else (index + 1) * step - 1
        bounds.append((start, end))

    part_dir = out + ".parts"
    os.makedirs(part_dir, exist_ok=True)
    started = time.time()
    print(f"  {name}: {expected} bytes in {pieces} pieces", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=pieces) as pool:
        futures = [
            pool.submit(
                fetch_piece,
                url,
                start,
                end,
                os.path.join(part_dir, f"{index:04d}"),
                index,
                progress,
                end - start + 1,
            )
            for index, (start, end) in enumerate(bounds)
        ]
        while not all(future.done() for future in futures):
            time.sleep(30)
            done = sum(progress)
            print(
                f"    {name}: {done}/{expected} bytes "
                f"({done / max(1, time.time() - started):.0f} B/s)",
                flush=True,
            )
        for future in futures:
            future.result()

    with open(out, "wb") as target:
        for index in range(pieces):
            with open(os.path.join(part_dir, f"{index:04d}"), "rb") as part:
                while True:
                    block = part.read(1 << 20)
                    if not block:
                        break
                    target.write(block)
    for index in range(pieces):
        os.remove(os.path.join(part_dir, f"{index:04d}"))
    os.rmdir(part_dir)

    got_size = os.path.getsize(out)
    if got_size != expected:
        raise SystemExit(f"  {name}: the file is {got_size} bytes, the lock says {expected}")
    got = sha256_of(out)
    print(
        f"  {name}: {got_size} bytes in {time.time() - started:.0f} s, sha256 {got}",
        flush=True,
    )
    if sha != "-" and sha != got:
        raise SystemExit(f"  {name}: the digest is {got}, the lock says {sha}")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", required=True)
    parser.add_argument("--dest", required=True)
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args()

    rows = [
        row for row in read_lock(args.lock)
        if row[0] == "stt" and row[1] == "model"
    ]
    if not rows:
        raise SystemExit("no model of the speech-to-text in the lock")
    os.makedirs(args.dest, exist_ok=True)
    for row in rows:
        fetch_file(row, args.dest, args.jobs)
    print("every file of the speech-to-text matches the lock")


if __name__ == "__main__":
    main()
