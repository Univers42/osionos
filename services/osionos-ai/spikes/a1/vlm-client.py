#!/usr/bin/env python3
"""The client of the vision spike (AI-A1).

The model is asked about every picture of the set, one after the other, and the
answer of every picture is written as one line of JSON: the id of the picture,
what the model said (caption, tags, objects, ocr, safety), whether the answer
is a valid JSON of the expected shape, the wall time of the call and the
timings of the server.

No picture leaves the volume as bytes: the request carries the picture as a
base64 data URL, and the file of the answer holds nothing but the ids and the
words of the model.

The mode of the shape of the answer is `--mode json_schema` (the server turns
the schema into a grammar) or `--mode grammar` (the GBNF grammar is sent as it
is). The mode that the server really honoured is written in every line.

usage: vlm-client.py --base <url> --model <name> --set <manifest.json> --out <file>
                     [--prompt <file>] [--schema <file>] [--grammar <file>]
                     [--mode json_schema|grammar] [--limit N] [--warmup 1]
                     [--max-tokens 320] [--timeout 600] [--probe]
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

SAFETY = ("safe", "suggestive", "explicit", "violent", "unknown")


def read_prompt(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read().strip()


def data_url(path):
    with open(path, "rb") as fh:
        payload = base64.b64encode(fh.read()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def the_shape(parsed):
    """The five keys of the answer, and True when the answer has the shape."""
    if not isinstance(parsed, dict):
        return None, False
    caption = parsed.get("caption")
    tags = parsed.get("tags")
    objects = parsed.get("objects")
    ocr = parsed.get("ocr")
    safety = parsed.get("safety")
    good = (
        isinstance(caption, str)
        and isinstance(tags, list)
        and isinstance(objects, list)
        and isinstance(ocr, str)
        and isinstance(safety, str)
        and safety in SAFETY
        and all(isinstance(tag, str) for tag in tags)
        and all(isinstance(item, str) for item in objects)
    )
    return {
        "caption": caption,
        "tags": tags,
        "objects": objects,
        "ocr": ocr,
        "safety": safety,
    }, good


def ask(base, model, prompt, image_url, max_tokens, timeout, schema, grammar, mode):
    """One call to the server. Returns the answer, the usage and the time."""
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if mode == "grammar":
        body["grammar"] = grammar
    else:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": schema,
        }
    request = urllib.request.Request(
        f"{base}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())
    elapsed = (time.perf_counter() - started) * 1000
    reply = payload["choices"][0]["message"].get("content") or ""
    return reply, payload.get("usage") or {}, payload.get("timings") or {}, elapsed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8080")
    parser.add_argument("--model", required=True)
    parser.add_argument("--set", required=True, help="the manifest of the set")
    parser.add_argument("--images", default=None, help="the directory of the pictures")
    parser.add_argument("--out", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--schema", default=None)
    parser.add_argument("--grammar", default=None)
    parser.add_argument("--mode", default="json_schema", choices=["json_schema", "grammar"])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--max-tokens", type=int, default=320)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--attempts", type=int, default=30)
    parser.add_argument("--pause", type=int, default=10)
    parser.add_argument("--probe", action="store_true", help="one call, and print it")
    args = parser.parse_args()

    prompt = read_prompt(args.prompt)
    schema = None
    grammar = None
    if args.mode == "grammar":
        with open(args.grammar, encoding="utf-8") as fh:
            grammar = fh.read()
    else:
        with open(args.schema, encoding="utf-8") as fh:
            schema = json.load(fh)

    with open(args.set, encoding="utf-8") as fh:
        manifest = json.load(fh)
    images = manifest["images"]
    if args.limit:
        images = images[: args.limit]
    directory = args.images or os.path.dirname(os.path.abspath(args.set))

    if args.probe:
        image = images[0]
        reply, usage, timings, elapsed = ask(
            args.base,
            args.model,
            prompt,
            data_url(os.path.join(directory, image["file"])),
            args.max_tokens,
            args.timeout,
            schema,
            grammar,
            args.mode,
        )
        print(f"probe_ms {elapsed:.0f}")
        print(f"probe_usage {json.dumps(usage)}")
        print(f"probe_timings {json.dumps(timings)}")
        print(f"probe_reply {reply}")
        return 0

    # A run that was cut keeps its answers: the pictures that are already there
    # are not asked again, so that the numbers of a resumed run are the numbers
    # of one run. A picture whose call failed is asked again.
    done = set()
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as fh:
            for line in fh:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("ok"):
                    done.add(str(row.get("id")))
        if done:
            images = [image for image in images if str(image["id"]) not in done]
            print(f"{args.model}: {len(done)} answers are already there")

    if args.out and os.path.dirname(args.out):
        os.makedirs(os.path.dirname(args.out), exist_ok=True)

    warmup = args.warmup
    total = len(images)
    errors = 0
    invalid = 0
    with open(args.out, "a", encoding="utf-8") as out:
        for index, image in enumerate(images, start=1):
            path = os.path.join(directory, image["file"])
            reply, usage, timings, elapsed = "", {}, {}, 0.0
            ok = False
            for attempt in range(args.attempts):
                try:
                    reply, usage, timings, elapsed = ask(
                        args.base,
                        args.model,
                        prompt,
                        data_url(path),
                        args.max_tokens,
                        args.timeout,
                        schema,
                        grammar,
                        args.mode,
                    )
                    ok = True
                    break
                except Exception as error:  # noqa: BLE001
                    if attempt + 1 == args.attempts:
                        reply = f"error {type(error).__name__}: {error}"
                    else:
                        time.sleep(3)
            parsed, good = (None, False)
            if ok:
                try:
                    parsed, good = the_shape(json.loads(reply))
                except json.JSONDecodeError:
                    parsed, good = (None, False)
            if not ok:
                errors += 1
            elif not good:
                invalid += 1
            row = {
                "id": image["id"],
                "file": image["file"],
                "model": args.model,
                "mode": args.mode,
                "warmup": warmup > 0,
                "ok": ok,
                "valid": good,
                "ms": round(elapsed, 1),
                "usage": usage,
                "timings": timings,
                "answer": parsed,
                "raw": reply if not good else None,
            }
            if warmup > 0:
                # The first picture is the warm-up: it is measured, but it does
                # not count in the numbers.
                row["warmup"] = True
                warmup -= 1
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
            if index % 10 == 0:
                print(
                    f"{args.model} {index}/{total} invalid={invalid} errors={errors} "
                    f"last={elapsed / 1000:.1f}s",
                    flush=True,
                )

    print(f"{args.model}: {total} pictures, invalid={invalid}, errors={errors}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
