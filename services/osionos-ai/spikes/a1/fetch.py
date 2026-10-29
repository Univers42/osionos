#!/usr/bin/env python3
"""The fetcher of the spike AI-A1: it downloads the pinned artifacts of
models.lock into a directory, in parallel pieces, and checks their sha256.

The network of the host goes through Tor, so one connection is slow. The
fetcher splits a file into pieces and asks for them at the same time, then
joins them and checks the digest of the lock.

usage: fetch.py --lock models.lock --dest <dir> [--only <group>] [--jobs N]
"""

import argparse
import concurrent.futures
import hashlib
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "curl/8.5.0"}


def url_for(row):
    group, kind, name, source, revision, path = row[:6]
    if source == "url":
        return f"{revision}/{path}"
    if source.startswith("github:"):
        org_repo = source[len("github:") :]
        return f"https://github.com/{org_repo}/releases/download/{revision}/{path}"
    if kind == "dataset":
        return f"https://huggingface.co/datasets/{source}/resolve/{revision}/{path}"
    return f"https://huggingface.co/{source}/resolve/{revision}/{path}"


def read_lock(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) == 8:
                parts.append("-")
            if len(parts) != 9:
                raise SystemExit(f"bad lock line: {line}")
            rows.append(parts)
    return rows


def head_size(url):
    request = urllib.request.Request(url, headers=UA, method="HEAD")
    with urllib.request.urlopen(request, timeout=60) as response:
        return int(response.headers.get("content-length", 0))


def fetch_piece(url, start, end, out_path, index, progress, expected):
    """One piece of a file.

    The connection of the host goes through Tor and it is cut without warning,
    so a piece is resumed where it stopped: the file on the disk keeps the
    bytes that arrived, and the next request asks for what is missing. The
    piece is only accepted when it is whole.
    """
    deadline = time.time() + 3600
    while True:
        have = os.path.getsize(out_path) if os.path.exists(out_path) else 0
        if have >= expected:
            progress[index] = have
            return
        if time.time() > deadline:
            raise SystemExit(f"    piece {index} never completed ({have}/{expected})")
        try:
            request = urllib.request.Request(
                url, headers={**UA, "Range": f"bytes={start + have}-{end}"}
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                code = getattr(response, "status", 206)
                if code == 200:
                    # The server ignored the range: start the piece over.
                    have = 0
                    mode = "wb"
                else:
                    mode = "ab"
                with open(out_path, mode) as out:
                    while True:
                        chunk = response.read(1 << 18)
                        if not chunk:
                            break
                        out.write(chunk)
                        have += len(chunk)
                        progress[index] = have
        except Exception as error:  # noqa: BLE001
            print(f"    piece {index} failed ({error}), resume", flush=True)
            time.sleep(3)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(row, dest, jobs, verbose=True):
    group, kind, name, source, revision, path, size, sha, blob = row
    url = url_for(row)
    out = os.path.join(dest, group, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and os.path.getsize(out) == int(size):
        if sha == "-" or sha256_of(out) == sha:
            print(f"  {group}/{name}: already there", flush=True)
            return out, sha
    expected = int(size)
    actual = head_size(url)
    if actual and expected and actual != expected:
        print(f"  {group}/{name}: the size moved ({expected} -> {actual})", flush=True)
        expected = actual
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
    print(f"  {group}/{name}: {expected} bytes in {pieces} pieces", flush=True)
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
                f"    {group}/{name}: {done}/{expected} bytes "
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
    got_size = os.path.getsize(out)
    if got_size != expected:
        raise SystemExit(
            f"  {group}/{name}: the file is {got_size} bytes, the lock says {expected}"
        )
    got = sha256_of(out)
    elapsed = time.time() - started
    print(
        f"  {group}/{name}: {got_size} bytes in {elapsed:.0f} s, sha256 {got}",
        flush=True,
    )
    if sha != "-" and sha != got:
        # The bytes are not the bytes of the lock: the parts are dropped, so
        # that the next run starts the file again.
        os.remove(out)
        for index in range(pieces):
            os.remove(os.path.join(part_dir, f"{index:04d}"))
        os.rmdir(part_dir)
        raise SystemExit(f"  {group}/{name}: the digest is {got}, the lock says {sha}")
    for index in range(pieces):
        os.remove(os.path.join(part_dir, f"{index:04d}"))
    os.rmdir(part_dir)
    return out, got


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", required=True)
    parser.add_argument("--dest", required=True)
    parser.add_argument("--only", default=None, help="a group, or a comma of groups")
    parser.add_argument("--files", default=None, help="a comma of names of the lock")
    parser.add_argument("--jobs", type=int, default=6)
    args = parser.parse_args()
    groups = set(args.only.split(",")) if args.only else None
    names = set(args.files.split(",")) if args.files else None
    rows = [
        row
        for row in read_lock(args.lock)
        if (groups is None or row[0] in groups)
        and (names is None or row[2] in names)
    ]
    if not rows:
        raise SystemExit("nothing to fetch")
    os.makedirs(args.dest, exist_ok=True)
    for row in rows:
        download(row, args.dest, args.jobs)


if __name__ == "__main__":
    sys.exit(main())
