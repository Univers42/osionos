#!/usr/bin/env python3
"""The fetcher of the images of COCO val 2017 (AI-A1).

The annotations of COCO are one zip of 241 MB, and the spike needs the
pictures and the labels of a sample of the validation set. The zip is read
over HTTP with range requests, so that only the entry of the annotations of
the validation set is fetched, and not the whole zip. The pictures are then
downloaded one by one.

Two ways of choosing the sample:

  - without `--seed`, the first thirty images of the validation set, by id,
    so that the choice is reproducible (the set of the old spike);
  - with `--seed N`, a random sample of `N` images, drawn with
    `random.Random(N)`, so that the same rows come back on every machine.
    With `--with-categories`, only the images that carry at least one
    annotated category are kept: the ground truth of a picture with no
    annotation is the empty set, and a metric over an empty set says nothing.

usage: fetch-coco.py --zip <url> --entry annotations/instances_val2017.json
                     --images <url of the directory> --dest <dir> --count 30
                     [--seed 42] [--with-categories] [--out <file>] [--no-images]
"""

import argparse
import io
import json
import os
import random
import urllib.request
import zipfile

UA = {"User-Agent": "curl/8.5.0"}


class RemoteFile(io.RawIOBase):
    """A file that lives on a server, read with range requests."""

    def __init__(self, url):
        self.url = url
        self.position = 0
        self.length = self._size()
        self.buffer = b""
        self.buffer_start = 0

    def _request(self, start, end):
        request = urllib.request.Request(
            self.url, headers={**UA, "Range": f"bytes={start}-{end}"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()

    def _size(self):
        request = urllib.request.Request(self.url, headers=UA, method="HEAD")
        with urllib.request.urlopen(request, timeout=60) as response:
            return int(response.headers.get("content-length", 0))

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=os.SEEK_SET):
        if whence == os.SEEK_SET:
            self.position = offset
        elif whence == os.SEEK_CUR:
            self.position += offset
        else:
            self.position = self.length + offset
        return self.position

    def read(self, size=-1):
        if size is None or size < 0:
            size = self.length - self.position
        if size == 0 or self.position >= self.length:
            return b""
        end = min(self.position + size, self.length) - 1
        if not (
            self.buffer_start <= self.position
            and self.position + len(self.buffer) > end
        ):
            chunk = self._request(self.position, end)
            self.buffer = chunk
            self.buffer_start = self.position
        offset = self.position - self.buffer_start
        out = self.buffer[offset : offset + size]
        self.position += len(out)
        return out


def labels_of(parsed):
    """The categories of every image of the set, in one pass."""
    categories = {row["id"]: row["name"] for row in parsed["categories"]}
    labels = {}
    for annotation in parsed["annotations"]:
        name = categories.get(annotation["category_id"])
        if name is None:
            continue
        labels.setdefault(annotation["image_id"], set()).add(name)
    return labels


def pick(parsed, count, seed, with_categories):
    """The sample of the validation set, and the labels of every row."""
    labels = labels_of(parsed)
    rows = sorted(parsed["images"], key=lambda row: row["id"])
    if with_categories:
        rows = [row for row in rows if labels.get(row["id"])]
    if seed is None:
        rows = rows[:count]
        how = f"the first {count} images of the validation set, by id"
    else:
        rows = random.Random(seed).sample(rows, count)
        how = (
            f"a random sample of {count} images, random.Random({seed})"
            + (" , with at least one annotated category" if with_categories else "")
        )
    return rows, labels, how


def fetch_images(rows, dest, images_url):
    """The pictures of the sample, one by one."""
    for index, row in enumerate(rows, start=1):
        name = f"{row['id']:012d}.jpg"
        target = os.path.join(dest, name)
        if os.path.exists(target):
            continue
        request = urllib.request.Request(f"{images_url}/{name}", headers=UA)
        with urllib.request.urlopen(request, timeout=120) as response:
            with open(target, "wb") as out:
                out.write(response.read())
        if index % 25 == 0:
            print(f"    {index}/{len(rows)} pictures", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--images", required=True, help="the url of the directory")
    parser.add_argument("--dest", required=True)
    parser.add_argument("--count", type=int, default=30)
    parser.add_argument("--seed", type=int, default=None, help="draw a random sample")
    parser.add_argument(
        "--with-categories",
        action="store_true",
        help="keep only the images with at least one annotated category",
    )
    parser.add_argument("--out", default=None, help="the name of the manifest")
    parser.add_argument("--no-images", action="store_true", help="no picture")
    args = parser.parse_args()

    os.makedirs(args.dest, exist_ok=True)
    remote = RemoteFile(args.zip)
    with zipfile.ZipFile(remote) as archive:
        with archive.open(args.entry) as source:
            data = source.read()
    with open(os.path.join(args.dest, "instances_val2017.json"), "wb") as out:
        out.write(data)
    print(f"  the annotations: {len(data)} bytes")

    parsed = json.loads(data)
    rows, labels, how = pick(parsed, args.count, args.seed, args.with_categories)
    chosen = []
    for row in rows:
        chosen.append(
            {
                "id": row["id"],
                "file": f"{row['id']:012d}.jpg",
                "width": row["width"],
                "height": row["height"],
                "coco_categories": sorted(labels.get(row["id"], set())),
            }
        )
    if not args.no_images:
        fetch_images(rows, args.dest, args.images)

    name = args.out or f"coco{args.count}.json"
    with open(os.path.join(args.dest, name), "w", encoding="utf-8") as out:
        json.dump(
            {
                "source": "COCO val 2017 (CC BY 4.0)",
                "annotations": args.zip,
                "selection": how,
                "images": chosen,
            },
            out,
            ensure_ascii=False,
            indent=2,
        )
    print(f"  {len(chosen)} images and their labels -> {name}")
    print(f"  the selection: {how}")


if __name__ == "__main__":
    main()
