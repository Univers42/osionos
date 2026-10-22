#!/usr/bin/env python3
"""The template check of the guard spike (AI-A1).

The guard of the image prompt (devil C72) asks a question with a chat
template: the safety policy, the categories, and the last user query. A GGUF
of a third party carries its own copy of that template, and a copy that
differs from the original asks the model another question than the one the
model card documents. So the template of the GGUF is read from its header and
compared with the one of the original model.

Prints `template: identical` when the two are the same, or the first line
that differs, and writes the original template when it is asked for: the
server then runs with `--chat-template-file`.

usage: template-check.py --gguf <file> --original <tokenizer_config.json>
                         [--write-original <file>]
"""

import argparse
import json
import struct
import sys

# The types of the values of the metadata of a GGUF.
UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT32, BOOL, STRING, ARRAY, UINT64, INT64, FLOAT64 = range(13)

SCALARS = {
    UINT8: ("<B", 1),
    INT8: ("<b", 1),
    UINT16: ("<H", 2),
    INT16: ("<h", 2),
    UINT32: ("<I", 4),
    INT32: ("<i", 4),
    FLOAT32: ("<f", 4),
    BOOL: ("<?", 1),
    UINT64: ("<Q", 8),
    INT64: ("<q", 8),
    FLOAT64: ("<d", 8),
}


class Gguf:
    """The reader of the header of a GGUF."""

    def __init__(self, path):
        self.fh = open(path, "rb")
        magic = self.fh.read(4)
        if magic != b"GGUF":
            raise SystemExit(f"{path} is not a GGUF")
        self.version, = struct.unpack("<I", self.fh.read(4))
        self.tensors, self.kv = struct.unpack("<QQ", self.fh.read(16))

    def _string(self):
        length, = struct.unpack("<Q", self.fh.read(8))
        return self.fh.read(length).decode("utf-8", "replace")

    def _value(self, kind):
        if kind == STRING:
            return self._string()
        if kind == ARRAY:
            item, count = struct.unpack("<IQ", self.fh.read(12))
            return [self._value(item) for _ in range(count)]
        if kind in SCALARS:
            fmt, size = SCALARS[kind]
            return struct.unpack(fmt, self.fh.read(size))[0]
        raise SystemExit(f"unknown type {kind}")

    def metadata(self, wanted):
        """The keys of the wanted list, with their value."""
        out = {}
        for _ in range(self.kv):
            key = self._string()
            kind, = struct.unpack("<I", self.fh.read(4))
            value = self._value(kind)
            if key in wanted:
                out[key] = value
        return out

    def close(self):
        self.fh.close()


def first_difference(left, right):
    """The first line that differs, or None."""
    left_lines = left.splitlines()
    right_lines = right.splitlines()
    for index in range(max(len(left_lines), len(right_lines))):
        a = left_lines[index] if index < len(left_lines) else "<end of file>"
        b = right_lines[index] if index < len(right_lines) else "<end of file>"
        if a != b:
            return index + 1, a, b
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gguf", required=True)
    parser.add_argument("--original", required=True)
    parser.add_argument("--write-original", default=None)
    args = parser.parse_args()

    gguf = Gguf(args.gguf)
    meta = gguf.metadata({"tokenizer.chat_template"})
    gguf.close()
    template = meta.get("tokenizer.chat_template")
    if template is None:
        raise SystemExit("the GGUF carries no chat template")

    with open(args.original, encoding="utf-8") as fh:
        original = json.load(fh).get("chat_template")
    if original is None:
        raise SystemExit(f"{args.original} carries no chat_template")

    if args.write_original:
        with open(args.write_original, "w", encoding="utf-8") as fh:
            fh.write(original)

    difference = first_difference(template, original)
    if difference is None:
        print("template: identical")
        return 0
    line, theirs, ours = difference
    print(f"template: differs at line {line}")
    print(f"  gguf:     {theirs}")
    print(f"  original: {ours}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
