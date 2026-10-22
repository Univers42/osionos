#!/usr/bin/env python3
"""The set of the vision spike (AI-A1): three hundred pictures of COCO.

The set is written by fetch-coco.py (the sample, the labels of COCO) and this
script shrinks the pictures: the long side goes to 768 px, which is the stand-in
of the pixel cap of C81. The model never sees the big picture.

The script writes the manifest of the set (the id of the picture, the file, the
size, the sha256 and the categories of COCO) and the list of the twenty
pictures that hold text: they are picked by the keywords of their caption
("sign", "text", "words", "menu", "license"), and the OCR of the spike is read
by a human next to the caption of the picture.

usage: vlm-sets.py --manifest <coco300.json> --captions <captions_val2017.json>
                   --in <dir of the pictures> --out <dir of the shrunk ones>
                   --limit 300
"""

import argparse
import hashlib
import json
import os
import re

from PIL import Image

TEXT_KEYWORDS = ("sign", "text", "words", "menu", "license")
LONG_SIDE = 768


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def captions_of(path):
    """The captions of every picture of COCO val 2017, all of them."""
    with open(path, encoding="utf-8") as fh:
        parsed = json.load(fh)
    captions = {}
    for annotation in parsed["annotations"]:
        captions.setdefault(annotation["image_id"], []).append(annotation["caption"])
    return captions


def holds_text(captions):
    """True when one of the captions of the picture names text."""
    return any(
        any(word in caption.lower() for word in TEXT_KEYWORDS) for caption in captions
    )


def shrink(source, target, long_side):
    """The picture with its long side at most `long_side` pixels."""
    with Image.open(source) as image:
        image = image.convert("RGB")
        width, height = image.size
        if max(width, height) > long_side:
            scale = long_side / max(width, height)
            size = (max(1, round(width * scale)), max(1, round(height * scale)))
            image = image.resize(size, Image.LANCZOS)
        image.save(target, format="JPEG", quality=90)
        return image.size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--captions", required=True)
    parser.add_argument("--in", dest="source", required=True)
    parser.add_argument("--out", dest="target", required=True)
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--text-count", type=int, default=20)
    args = parser.parse_args()

    with open(args.manifest, encoding="utf-8") as fh:
        parsed = json.load(fh)
    images = parsed["images"][: args.limit]
    captions = captions_of(args.captions)
    os.makedirs(args.target, exist_ok=True)

    rows = []
    text_rows = []
    for index, image in enumerate(images, start=1):
        name = image["file"]
        source = os.path.join(args.source, name)
        target = os.path.join(args.target, name)
        width, height = shrink(source, target, LONG_SIDE)
        mine = [" ".join(caption.split()) for caption in captions.get(image["id"], [])]
        text = holds_text(mine)
        row = {
            "id": image["id"],
            "file": name,
            "width": width,
            "height": height,
            "bytes": os.path.getsize(target),
            "sha256": sha256_of(target),
            "coco_categories": image["coco_categories"],
            "caption": mine[0] if mine else "",
            "captions": mine,
            "text": text,
        }
        rows.append(row)
        if text:
            text_rows.append(row)
        if index % 50 == 0:
            print(f"    {index}/{len(images)} pictures shrunk", flush=True)

    # The twenty pictures that hold text: the ones whose caption says so.
    picked = text_rows[: args.text_count]
    with open(os.path.join(args.target, "text.tsv"), "w", encoding="utf-8") as out:
        for row in picked:
            out.write(f"{row['id']}\t{row['caption']}\n")
    with open(os.path.join(args.target, "manifest.json"), "w", encoding="utf-8") as out:
        json.dump(
            {
                "source": parsed["source"],
                "selection": parsed["selection"],
                "long_side": LONG_SIDE,
                "images": rows,
            },
            out,
            ensure_ascii=False,
            indent=2,
        )
    print(f"  {len(rows)} pictures shrunk to {LONG_SIDE} px")
    print(f"  {len(text_rows)} pictures hold text, {len(picked)} kept for the OCR")
    categories = sorted({c for row in rows for c in row["coco_categories"]})
    print(f"  {len(categories)} categories of COCO in the set")


if __name__ == "__main__":
    main()
