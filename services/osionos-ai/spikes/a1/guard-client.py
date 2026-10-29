#!/usr/bin/env python3
"""The client of the guard spike (AI-A1).

The guard of the image prompt (devil C72) is a model that answers a question
about a prompt: is it safe, and in which category. The client asks the
question for every prompt of a set and writes the verdicts, one row per
prompt: the set, the id of the row, the language, the verdict, the categories
of the model and the wall time of the call.

The prompt text never leaves the volume: only the verdicts do.

usage: guard-client.py --base <url> --model <name> --set <name> --lang <lang>
                       --in <file> --out <file> [--usage-out <file>]
                       [--raw-out <file>] [--limit N] [--shard I --shards N]
                       [--max-tokens 32] [--one-error]
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

# The verdict of the model, in the two modes of the guard.
VERDICTS = ("Safe", "Unsafe", "Controversial")

# The categories of the safety policy of the model, in codes: the committed
# verdicts hold the codes, so that the words of the policy are not in the
# repository. The order of the table is the order of the policy.
CATEGORIES = {
    "V": ("violent", "violence"),
    "N": ("non-violent illegal", "illegal act"),
    "A": ("sexual content", "sexual act", "sexually", "sexual", "adult content"),
    "P": ("pii", "personally identifiable"),
    "S": ("suicide", "self-harm", "self harm"),
    "U": ("unethical", "unethical act"),
    "T": ("politically sensitive", "political"),
    "C": ("copyright",),
    "J": ("jailbreak",),
}

SAFETY = re.compile(r"safety\s*:\s*\**\s*(safe|unsafe|controversial)", re.IGNORECASE)
CATEGORIES_LINE = re.compile(r"categories\s*:\s*\**\s*(.*)", re.IGNORECASE)


def codes_of(text):
    """The codes of the categories the model names, in the order it names them."""
    codes = []
    low = text.lower()
    for part in re.split(r"[,;]| and ", low):
        part = part.strip(" .*")
        if not part or part == "none":
            continue
        for code, words in CATEGORIES.items():
            if any(word in part for word in words):
                if code not in codes:
                    codes.append(code)
                break
        else:
            if "?" not in codes:
                codes.append("?")
    return ",".join(codes)


def parse(reply):
    """The verdict and the categories of a reply, or `unparsed`."""
    found = SAFETY.search(reply)
    if not found:
        return "unparsed", ""
    verdict = found.group(1).capitalize()
    line = CATEGORIES_LINE.search(reply)
    categories = codes_of(line.group(1)) if line else ""
    return verdict, categories


def ask(base, model, prompt, max_tokens, timeout):
    """One call to the guard. Returns the answer, the usage and the time."""
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": max_tokens,
            "stream": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())
    elapsed = (time.perf_counter() - started) * 1000
    reply = payload["choices"][0]["message"]["content"]
    usage = payload.get("usage") or {}
    return reply, usage, elapsed


def read_set(path):
    """The rows of a set: the id of the row and its prompt."""
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            row_id, _, prompt = line.partition("\t")
            rows.append((row_id, prompt))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8080")
    parser.add_argument("--model", required=True)
    parser.add_argument("--set", required=True)
    parser.add_argument("--lang", default="en")
    parser.add_argument("--in", dest="source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--usage-out", default=None)
    parser.add_argument("--raw-out", default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--shard", type=int, default=0)
    parser.add_argument("--shards", type=int, default=1)
    parser.add_argument("--max-tokens", type=int, default=32)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--pause", type=int, default=3,
                        help="the seconds between two tries of the same call")
    parser.add_argument("--one-error", action="store_true",
                        help="one call to a server that is not there: the time to the refusal")
    args = parser.parse_args()

    if args.one_error:
        started = time.perf_counter()
        try:
            ask(args.base, args.model, "a red fox", args.max_tokens, args.timeout)
        except urllib.error.URLError as error:
            elapsed = (time.perf_counter() - started) * 1000
            reason = getattr(error, "reason", error)
            print(f"refused_ms {elapsed:.1f}")
            print(f"refused_error {type(error).__name__}: {reason}")
            return 0
        except Exception as error:  # noqa: BLE001
            elapsed = (time.perf_counter() - started) * 1000
            print(f"refused_ms {elapsed:.1f}")
            print(f"refused_error {type(error).__name__}: {error}")
            return 0
        print("refused_ms 0")
        print("refused_error none: the server answered")
        return 1

    rows = read_set(args.source)
    if args.shards > 1:
        rows = [row for index, row in enumerate(rows) if index % args.shards == args.shard]
    if args.limit:
        rows = rows[: args.limit]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    raw = open(args.raw_out, "a", encoding="utf-8") if args.raw_out else None
    usage_file = open(args.usage_out, "a", encoding="utf-8") if args.usage_out else None

    # A run that was cut keeps its verdicts: the rows that are already there
    # are not asked again, so that the numbers of a resumed run are the numbers
    # of one run. A row whose call failed is asked again: it has no verdict.
    done = set()
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 4 and parts[3] != "error":
                    done.add(parts[1])
        if done:
            rows = [row for row in rows if row[0] not in done]
            print(f"{args.set}: {len(done)} verdicts are already there")

    unparsed = 0
    errors = 0
    with open(args.out, "a", encoding="utf-8") as out:
        for index, (row_id, prompt) in enumerate(rows):
            reply, usage, elapsed = "", {}, 0.0
            for attempt in range(args.attempts):
                try:
                    reply, usage, elapsed = ask(
                        args.base, args.model, prompt, args.max_tokens, args.timeout
                    )
                    break
                except Exception as error:  # noqa: BLE001
                    if attempt + 1 == args.attempts:
                        errors += 1
                        reply = f"error {type(error).__name__}: {error}"
                    else:
                        # The server may be restarting: the call is asked again.
                        time.sleep(args.pause)
            verdict, categories = parse(reply)
            if verdict == "unparsed":
                unparsed += 1
            out.write(
                f"{args.set}\t{row_id}\t{args.lang}\t{verdict}\t{categories}\t{elapsed:.0f}\n"
            )
            out.flush()
            if usage_file:
                usage_file.write(
                    f"{args.set}\t{row_id}\t{args.lang}\t"
                    f"{usage.get('prompt_tokens', 0)}\t{usage.get('completion_tokens', 0)}\t"
                    f"{elapsed:.0f}\n"
                )
                usage_file.flush()
            if raw:
                raw.write(json.dumps({"set": args.set, "row_id": row_id, "reply": reply}) + "\n")
                raw.flush()
            if (index + 1) % 50 == 0:
                print(f"{args.set} {index + 1}/{len(rows)} unparsed={unparsed} errors={errors}", flush=True)

    if raw:
        raw.close()
    if usage_file:
        usage_file.close()
    print(f"{args.set} lang={args.lang} rows={len(rows)} unparsed={unparsed} errors={errors}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
