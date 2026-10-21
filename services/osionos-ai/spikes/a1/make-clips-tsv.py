#!/usr/bin/env python3
"""The table of the clips of the speech-to-text measurement (AI-A1).

It reads the json that fetch-fleurs.py wrote and the wav files themselves,
and writes one row per clip: the id of the clip, the language, the length
that the header of the wav says and the two transcripts of FLEURS (the one
with the punctuation and capitals, and the raw one).

The raw transcript is the reference of the WER: it is already in lower case
and without punctuation, so it is what the rule of the normalisation expects
on the reference side. The transcription is kept next to it, so that the
punctuation that an engine adds can be looked at.

usage: make-clips-tsv.py --clips <dir> --out <file>
"""

import argparse
import json
import os
import struct


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def length_of(path):
    """The length of a wav file, in seconds.

    The wav files of FLEURS are in the format 3 (IEEE float), which the
    module wave of python does not read, so the header is read here.
    """
    with open(path, "rb") as fh:
        riff = fh.read(12)
        if riff[:4] != b"RIFF" or riff[8:12] != b"WAVE":
            raise SystemExit(f"{path} is not a wav file")
        rate = channels = bits = None
        frames = 0
        while True:
            head = fh.read(8)
            if len(head) < 8:
                break
            name, size = struct.unpack("<4sI", head)
            if name == b"fmt ":
                fmt = struct.unpack("<HHIIHH", fh.read(16))
                channels, rate = fmt[1], fmt[2]
                bits = fmt[5]
                # the fmt chunk of a wav of FLEURS is longer than the
                # sixteen bytes that are read here (the extensible format),
                # so the rest of it is skipped.
                fh.seek(size - 16, os.SEEK_CUR)
            elif name == b"data":
                frames = size
                fh.seek(size + (size & 1), os.SEEK_CUR)
            else:
                fh.seek(size + (size & 1), os.SEEK_CUR)
    if not rate or not bits:
        raise SystemExit(f"{path} has no fmt chunk")
    return rate, frames / (rate * channels * (bits // 8))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clips", required=True, help="the dir of the clips")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    languages = sorted(
        name for name in os.listdir(args.clips)
        if os.path.isdir(os.path.join(args.clips, name))
    )
    rows = []
    for language in languages:
        folder = os.path.join(args.clips, language)
        meta = read_json(os.path.join(folder, "clips.json"))
        for clip in meta["clips"]:
            path = os.path.join(folder, clip["file"])
            rate, seconds = length_of(path)
            rows.append(
                {
                    "lang": language,
                    "id": clip["id"],
                    "file": clip["file"],
                    "num_samples": clip["num_samples"],
                    "sample_rate": rate,
                    "duration_s": round(seconds, 3),
                    "transcription": clip["transcription"],
                    "raw_transcription": clip["raw_transcription"],
                }
            )

    columns = [
        "lang", "id", "file", "num_samples", "sample_rate", "duration_s",
        "transcription", "raw_transcription",
    ]
    with open(args.out, "w", encoding="utf-8") as out:
        out.write("\t".join(columns) + "\n")
        for row in rows:
            out.write("\t".join(str(row[column]) for column in columns) + "\n")

    print(f"{len(rows)} clips of {len(languages)} languages -> {args.out}")
    for language in languages:
        seconds = [row["duration_s"] for row in rows if row["lang"] == language]
        print(
            f"  {language}: {len(seconds)} clips, "
            f"{min(seconds):.2f} s to {max(seconds):.2f} s, "
            f"mean {sum(seconds) / len(seconds):.2f} s"
        )


if __name__ == "__main__":
    main()
