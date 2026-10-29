"""extract.py — the pinned Wikipedia source -> articles.jsonl.

The source is the one of wiki.lock: the parquet of the Hugging Face mirror,
or the dump of dumps.wikimedia.org when the mirror is not there. The reader
writes one JSON object per line, in the order of the source:

    {"title": ..., "url": ..., "revision": ..., "sections": [
        {"heading": ..., "level": 2, "paragraphs": [...]}]}

The file lands in the volume of the lock, never in the repository. The
importer (import.mjs) reads it and decides what is imported: the redirects,
the disambiguation pages and the stubs are skipped there.

usage: python extract.py [--lock wiki.lock] [--source-dir /data/wikipedia]
                          [--out /data/articles.jsonl] [--limit N]
"""

import argparse
import json
import os
import sys

from wikitext import BASIC_ENGLISH_FOOTER, plain_sections, wikitext_sections


def lock_values(path):
    """The KEY=value lines of the lock: the pins of the import."""
    values = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def read_parquet(path, revision):
    """The articles of the parquet: the title, the url, the text."""
    import pyarrow.parquet as pq

    handle = pq.ParquetFile(path)
    for index in range(handle.metadata.num_row_groups):
        rows = handle.read_row_group(index).to_pylist()
        for row in rows:
            yield row["title"], row["url"], revision, row["text"]


def _local(tag):
    """The name of an XML tag, without the namespace of the dump."""
    return tag.rsplit("}", 1)[-1]


def read_dump(path):
    """The articles of the dump: the title, the url, the revision, the text."""
    import bz2
    import xml.etree.ElementTree as ET

    with bz2.open(path, "rb") as handle:
        for _event, element in ET.iterparse(handle, events=("end",)):
            if _local(element.tag) != "page":
                continue
            title = ""
            url = ""
            revision = ""
            text = ""
            namespace = "0"
            for child in element:
                name = _local(child.tag)
                if name == "title":
                    title = child.text or ""
                elif name == "ns":
                    namespace = (child.text or "0").strip()
                elif name == "redirect":
                    title = ""
                elif name == "revision":
                    for grandchild in child:
                        if _local(grandchild.tag) == "id":
                            revision = grandchild.text or ""
                elif name == "text":
                    text = child.text or ""
            element.clear()
            if namespace != "0" or not title:
                continue
            url = "https://simple.wikipedia.org/wiki/" + title.replace(" ", "_")
            yield title, url, revision, text


def _drop_footer(sections):
    """The footer of the mirror ("Basic English 850 words") is not a text."""
    for section in sections:
        while section["paragraphs"] and BASIC_ENGLISH_FOOTER.match(
            section["paragraphs"][-1].strip()
        ):
            section["paragraphs"].pop()
    while len(sections) > 1 and BASIC_ENGLISH_FOOTER.match(
        sections[-1]["heading"].strip()
    ):
        sections.pop()
    return sections


def build_record(title, url, revision, text, wikitext=False):
    """The record of an article: its sections, and nothing else."""
    if wikitext:
        sections = wikitext_sections(text)
    else:
        sections = _drop_footer(plain_sections(text))
    return {"title": title, "url": url, "revision": revision, "sections": sections}


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="the pinned Wikipedia source -> articles.jsonl"
    )
    parser.add_argument(
        "--lock", default=os.path.join(os.path.dirname(__file__), "wiki.lock")
    )
    parser.add_argument("--source-dir", default="/data/wikipedia")
    parser.add_argument("--out", default="/data/articles.jsonl")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args(argv)

    values = lock_values(args.lock)
    parquet = os.path.join(args.source_dir, os.path.basename(values["HF_FILE"]))
    dump = os.path.join(args.source_dir, os.path.basename(values["DUMP_FILE"]))

    if os.path.exists(parquet):
        source, wikitext, reader = (
            "parquet",
            False,
            read_parquet(parquet, values["HF_REVISION"]),
        )
    elif os.path.exists(dump):
        source, wikitext, reader = "dump", True, read_dump(dump)
    else:
        print(
            f"extract.py: neither {parquet} nor {dump} is there: run fetch.sh first",
            file=sys.stderr,
        )
        return 1

    articles = 0
    sections = 0
    characters = 0
    with open(args.out, "w", encoding="utf-8") as out:
        for title, url, revision, text in reader:
            record = build_record(title, url, revision, text, wikitext)
            out.write(json.dumps(record, ensure_ascii=False))
            out.write("\n")
            articles += 1
            sections += len(record["sections"])
            characters += sum(
                len(paragraph)
                for section in record["sections"]
                for paragraph in section["paragraphs"]
            )
            if args.limit and articles >= args.limit:
                break
    print(
        f"[extract] {source}: {articles} articles, {sections} sections, "
        f"{characters} characters -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
