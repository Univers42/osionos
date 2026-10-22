#!/usr/bin/env python3
"""The fetcher of the images of COCO val 2017 (AI-A1).

The annotations of COCO are one zip of 241 MB, and the spike needs the
labels of thirty images. The zip is read over HTTP with range requests, so
that only the entry of the annotations of the validation set is fetched, and
not the whole zip. The thirty images are then downloaded one by one.

The thirty images are the first thirty of the validation set, by id, so that
the choice is reproducible.

usage: fetch-coco.py --zip <url> --entry annotations/instances_val2017.json
                     --images <url of the directory> --dest <dir> --count 30
"""

import argparse
import io
import json
import os
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--images", required=True, help="the url of the directory")
    parser.add_argument("--dest", required=True)
    parser.add_argument("--count", type=int, default=30)
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
    images = sorted(parsed["images"], key=lambda row: row["id"])[: args.count]
    categories = {row["id"]: row["name"] for row in parsed["categories"]}
    chosen = []
    for row in images:
        name = f"{row['id']:012d}.jpg"
        target = os.path.join(args.dest, name)
        if not os.path.exists(target):
            request = urllib.request.Request(
                f"{args.images}/{name}", headers=UA
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                with open(target, "wb") as out:
                    out.write(response.read())
        labels = sorted(
            {
                categories[annotation["category_id"]]
                for annotation in parsed["annotations"]
                if annotation["image_id"] == row["id"]
            }
        )
        chosen.append(
            {
                "id": row["id"],
                "file": name,
                "width": row["width"],
                "height": row["height"],
                "coco_categories": labels,
            }
        )
    with open(os.path.join(args.dest, "coco30.json"), "w", encoding="utf-8") as out:
        json.dump(
            {
                "source": "COCO val 2017 (CC BY 4.0)",
                "annotations": args.zip,
                "selection": f"the first {args.count} images of the validation set, by id",
                "images": chosen,
            },
            out,
            ensure_ascii=False,
            indent=2,
        )
    print(f"  {len(chosen)} images and their labels")


if __name__ == "__main__":
    main()
