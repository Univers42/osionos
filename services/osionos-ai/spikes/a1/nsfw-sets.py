#!/usr/bin/env python3
"""The sets of the output check on the generated images (AI-A1, devil C73).

Three sets of images, all of them SAFE:

  gen    fifty pictures made by the engine of the product, from fifty
         captions of COCO val 2017 (the prompt itself never lands in the
         repository: only the id of the caption does)
  a1     the PNGs of the image spike of A1 (the two that were kept)
  coco   three hundred photos of COCO val 2017

The samples are drawn with `random.Random(7)`, so the same images come back
on every machine. The captions come from the file of the guard spike (the
annotations of COCO val 2017), the photos from images.cocodataset.org.

The script writes the manifest of the bench (the set, the id, the path) and
the list of the digests (the set, the id, the file, the bytes, the sha256):
the images stay in the volume, only their digests are committed.

usage: nsfw-sets.py --captions <json> --dest <dir> --images <url of the dir>
                    [--a1 <dir of the PNGs of the spike>] [--count 50]
                    [--photos 300]
"""

import argparse
import hashlib
import json
import os
import random
import shutil
import urllib.request

UA = {"User-Agent": "curl/8.5.0"}


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def the_ids(captions_path):
    """The ids of the images of COCO val 2017, and their first caption."""
    with open(captions_path, encoding="utf-8") as fh:
        captions = json.load(fh)
    first = {}
    for annotation in captions["annotations"]:
        first.setdefault(annotation["image_id"], annotation["caption"])
    return sorted(first), first


def sample(captions_path, dest, count, photos):
    ids, first = the_ids(captions_path)
    print(f"  the captions: {len(ids)} images of COCO val 2017")

    os.makedirs(os.path.join(dest, "sets"), exist_ok=True)

    # The fifty captions of the generated set.
    picked = random.Random(7).sample(ids, count)
    with open(os.path.join(dest, "sets", "gen.tsv"), "w", encoding="utf-8") as out:
        for image_id in picked:
            caption = " ".join(first[image_id].split())
            out.write(f"{image_id}\t{caption}\n")
    print(f"  gen.tsv: {len(picked)} captions")

    # The three hundred photos.
    picked = random.Random(7).sample(ids, photos)
    with open(os.path.join(dest, "sets", "photos.tsv"), "w", encoding="utf-8") as out:
        for image_id in picked:
            out.write(f"{image_id}\n")
    print(f"  photos.tsv: {len(picked)} ids")


def fetch_photos(dest, images_url, photos):
    """The photos of COCO, one by one."""
    out_dir = os.path.join(dest, "coco")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(dest, "sets", "photos.tsv"), encoding="utf-8") as fh:
        ids = [line.strip() for line in fh if line.strip()]
    missing = [i for i in ids if not os.path.exists(os.path.join(out_dir, f"{int(i):012d}.jpg"))]
    print(f"  the photos: {len(ids)} ids, {len(missing)} to fetch")
    for index, image_id in enumerate(missing, start=1):
        target = os.path.join(out_dir, f"{int(image_id):012d}.jpg")
        for attempt in range(3):
            try:
                request = urllib.request.Request(
                    f"{images_url}/{int(image_id):012d}.jpg", headers=UA
                )
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = response.read()
                with open(target, "wb") as out:
                    out.write(data)
                break
            except Exception as error:  # noqa: BLE001
                print(f"    {image_id}: {error}, retry", flush=True)
        if index % 25 == 0:
            print(f"    {index}/{len(missing)} photos", flush=True)


def copy_a1(dest, a1_dir):
    """The PNGs of the image spike of A1."""
    out_dir = os.path.join(dest, "a1")
    os.makedirs(out_dir, exist_ok=True)
    copied = 0
    for root, _dirs, files in os.walk(a1_dir):
        for name in sorted(files):
            if not name.endswith(".png"):
                continue
            source = os.path.join(root, name)
            shutil.copy2(source, os.path.join(out_dir, name))
            copied += 1
    print(f"  a1: {copied} PNGs")


def manifest(dest):
    """The manifest of the bench, and the list of the digests."""
    rows = []
    digests = []

    def add(set_name, image_id, path):
        rows.append(f"{set_name}\t{image_id}\t{path}")
        digests.append(
            f"{set_name}\t{image_id}\t{os.path.relpath(path, dest)}\t"
            f"{os.path.getsize(path)}\t{sha256_of(path)}"
        )

    # The generated pictures: the id of the caption, and the file of the image.
    gen_map = os.path.join(dest, "sets", "gen-files.tsv")
    if os.path.exists(gen_map):
        with open(gen_map, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                image_id, name = line.split("\t")
                path = os.path.join(dest, "gen", name)
                if os.path.exists(path):
                    add("gen", image_id, path)

    # The PNGs of the image spike of A1.
    a1_dir = os.path.join(dest, "a1")
    if os.path.isdir(a1_dir):
        for name in sorted(os.listdir(a1_dir)):
            if name.endswith(".png"):
                add("a1", name, os.path.join(a1_dir, name))

    # The photos of COCO.
    coco_dir = os.path.join(dest, "coco")
    if os.path.isdir(coco_dir):
        for name in sorted(os.listdir(coco_dir)):
            if name.endswith(".jpg"):
                add("coco", name.split(".")[0], os.path.join(coco_dir, name))

    with open(os.path.join(dest, "manifest.tsv"), "w", encoding="utf-8") as out:
        out.write("\n".join(rows) + "\n")
    with open(os.path.join(dest, "sets.tsv"), "w", encoding="utf-8") as out:
        out.write("set\tid\tfile\tbytes\tsha256\n")
        out.write("\n".join(digests) + "\n")
    print(f"  manifest.tsv: {len(rows)} images")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--captions", required=True)
    parser.add_argument("--dest", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--a1", default=None)
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--photos", type=int, default=300)
    args = parser.parse_args()

    os.makedirs(args.dest, exist_ok=True)
    sample(args.captions, args.dest, args.count, args.photos)
    fetch_photos(args.dest, args.images, args.photos)
    if args.a1:
        copy_a1(args.dest, args.a1)
    manifest(args.dest)


if __name__ == "__main__":
    main()
