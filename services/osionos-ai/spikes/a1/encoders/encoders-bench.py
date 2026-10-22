#!/usr/bin/env python3
"""The bench of the encoders of the spike A1: the classifiers of toxicity, the
classifiers of sentiment and the reranker, served by TEI on the CPU.

Four jobs, one per family of models of the slice:

  tox       the classifiers of toxicity: the score of every case of HateCheck
            (en, fr, es) and of the textdetox set (en, es, fr), and the sweep
            of the threshold that the module M4 needs (the best F1, and the
            lowest threshold whose precision is at least 0.95, with the Wilson
            bound of that precision and the cases of the four functionalities
            that C83 does not want flagged).
  sent      the classifiers of sentiment: the confusion matrix and the macro-F1
            of every language, next to the baseline of TF-IDF and logistic
            regression that the slice M6 has to beat.
  latency   the time of a call of a classifier: one short text, then a batch
            of 32.
  rerank    the time of a call of the reranker: the 20 passages of the top 20
            in one call, then four such calls at once.

The text of the datasets never leaves the volume: what is written is the id of
the row, its label and its score.

usage: encoders-bench.py <job> --model <slug> --model-dir <dir> --data <dir>
                          --out <tsv> [--base <url>] [--batch 32]
"""

import argparse
import concurrent.futures
import csv
import json
import math
import os
import random
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request

Z = 1.959964

# The three classes of the sentiment, in the order of the tables. The label of
# the dataset is 0 = positive, 1 = neutral, 2 = negative, so the gold of a row
# is the class 2 - label.
CLASSES = ("negative", "neutral", "positive")

# The functionalities of HateCheck that C83 does not want flagged: the names
# are the ones of the column `functionality` of the dataset.
KEPT_FUNCTIONALITIES = (
    "counter_quote_nh",
    "counter_ref_nh",
    "ident_neutral_nh",
    "ident_pos_nh",
)


# --- the helpers ------------------------------------------------------------


def wilson_lower(flagged, total):
    """The lower bound of the Wilson interval of 95 % of a rate."""
    if total == 0:
        return 0.0
    p = flagged / total
    denominator = 1 + Z * Z / total
    center = (p + Z * Z / (2 * total)) / denominator
    half = Z * math.sqrt(p * (1 - p) / total + Z * Z / (4 * total * total)) / denominator
    return max(0.0, center - half)


def percentile(values, share):
    """The percentile of a list of numbers, the nearest rank."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(share * len(ordered)) - 1))
    return ordered[index]


def macro_f1(matrix):
    """The macro-F1 of a confusion matrix: the rows are the truth, the columns
    the prediction, both in the order of CLASSES."""
    scores = []
    for index in range(len(CLASSES)):
        tp = matrix[index][index]
        fp = sum(matrix[row][index] for row in range(len(CLASSES))) - tp
        fn = sum(matrix[index]) - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        scores.append(f1)
    return sum(scores) / len(scores)


# --- the datasets -----------------------------------------------------------


def read_hatecheck(path):
    """The rows of a HateCheck file: the id, the text, the gold label and the
    functionality of the case."""
    rows = []
    with open(path, newline="", encoding="utf-8") as handle:
        for index, row in enumerate(csv.DictReader(handle)):
            gold = 1 if row["label_gold"].strip() == "hateful" else 0
            rows.append((str(index), row["test_case"], gold, row["functionality"]))
    return rows


def read_parquet(path):
    """The rows of a parquet file: the id, the text and the gold label."""
    import pyarrow.parquet as parquet

    table = parquet.read_table(path).to_pydict()
    rows = []
    for index, text in enumerate(table["text"]):
        if "toxic" in table:
            gold = int(table["toxic"][index])
        else:
            gold = int(table["label"][index])
        rows.append((str(index), text, gold, ""))
    return rows


# --- the model --------------------------------------------------------------


def model_labels(model_dir):
    """The labels of the model, from its config.json: the id of the class and
    its name."""
    with open(os.path.join(model_dir, "config.json"), encoding="utf-8") as handle:
        config = json.load(handle)
    id2label = config.get("id2label") or {}
    labels = {}
    for key, value in id2label.items():
        labels[int(key)] = str(value)
    return labels, config


def toxic_label(labels):
    """The label of the model that means "toxic"."""
    for index, name in sorted(labels.items()):
        low = name.lower()
        if "non-toxic" in low or "non toxic" in low or low == "not toxic":
            continue
        if "toxic" in low:
            return index, name
    if len(labels) == 2:
        return 1, labels.get(1, "LABEL_1")
    return 1, labels.get(1, "LABEL_1")


def sentiment_map(labels):
    """The map of the labels of the model to the three classes of the slice."""
    mapping = {}
    for index, name in sorted(labels.items()):
        low = name.lower().strip()
        if "star" in low:
            stars = low.split("star")[0].strip()
            try:
                number = int(stars)
            except ValueError:
                number = 0
            if number <= 2:
                mapping[index] = "negative"
            elif number == 3:
                mapping[index] = "neutral"
            else:
                mapping[index] = "positive"
            continue
        if "neg" in low:
            mapping[index] = "negative"
        elif "neu" in low:
            mapping[index] = "neutral"
        elif "pos" in low:
            mapping[index] = "positive"
        else:
            mapping[index] = CLASSES[index % 3]
    return mapping


def gold_class(label):
    """The class of the slice of a gold label of the dataset."""
    return 2 - int(label)


# --- the calls --------------------------------------------------------------


def post(base, path, payload, timeout):
    """One call to TEI: the answer and the wall time in milliseconds."""
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        answer = json.loads(response.read())
    return answer, (time.perf_counter() - started) * 1000


def predict(base, texts, timeout, single=False):
    """The scores of one text: the label of the model and the score of every
    class, as the probabilities."""
    payload = {"inputs": texts[0] if single else [[text] for text in texts]}
    answer, elapsed = post(base, "/predict", payload, timeout)
    return answer, elapsed


def predict_batch(base, texts, timeout):
    """The scores of the texts, in one call: a list of (label, score) per text,
    the classes in the order of their score. The input of TEI is a list of
    lists: a list of strings would be read as a pair of texts."""
    answer, elapsed = post(base, "/predict", {"inputs": [[text] for text in texts]}, timeout)
    out = []
    for item in answer:
        if isinstance(item, dict):
            out.append([(item["label"], float(item["score"]))])
        else:
            out.append([(part["label"], float(part["score"])) for part in item])
    return out, elapsed


def rerank(base, query, texts, timeout):
    """The ranking of the texts against the query: the index and the score."""
    answer, elapsed = post(base, "/rerank", {"query": query, "texts": list(texts)}, timeout)
    return answer, elapsed


def check_batch(base, texts, timeout):
    """The check of the batch: the same texts in one call and one by one.

    The input of TEI is a list of pairs and not a list of strings: the check
    says whether the score of a text of the batch is the score of that text
    alone, so that the numbers of the bulk are the numbers of the model.
    """
    batch, _ = predict_batch(base, texts, timeout)
    alone = []
    for text in texts:
        answer, _ = predict(base, [text], timeout, single=True)
        alone.append({part["label"]: float(part["score"]) for part in answer})
    worst = 0.0
    for index in range(len(texts)):
        for name, score in batch[index]:
            worst = max(worst, abs(score - alone[index].get(name, score)))
    print(
        f"check batch: {len(texts)} texts in one call, the scores differ from"
        f" the single calls by at most {worst:.6f}"
    )
    return worst


# --- the tokenizers ---------------------------------------------------------


class Counter:
    """The number of tokens of a text, with the tokenizer of the model."""

    def __init__(self, model_dir):
        self.tokenizer = None
        path = os.path.join(model_dir, "tokenizer.json")
        if os.path.exists(path):
            try:
                from tokenizers import Tokenizer

                self.tokenizer = Tokenizer.from_file(path)
                # The tokenizer of a model comes with the truncation and the
                # padding of the model: without this, every text is as long as
                # the longest one the model takes.
                self.tokenizer.no_truncation()
                self.tokenizer.no_padding()
            except Exception:  # noqa: BLE001
                self.tokenizer = None

    def count(self, text):
        if self.tokenizer is None:
            return len(text.split())
        return len(self.tokenizer.encode(text).ids)

    def cut(self, text, tokens):
        """The first `tokens` tokens of a text, as a string, and the number of
        tokens the cut really has.

        The cut is made on the characters, with the offsets of the encoding: a
        text that is decoded and encoded again is not the same text (the
        sentencepiece of a model cuts it in pieces of its own), and a passage
        of three hundred tokens has to be three hundred tokens of the model.
        """
        if self.tokenizer is None:
            words = text.split()
            return " ".join(words[:tokens]), min(len(words), tokens)
        encoding = self.tokenizer.encode(text)
        if len(encoding.ids) <= tokens:
            return text, len(encoding.ids)
        end = encoding.offsets[tokens - 1][1]
        cut = text[:end]
        return cut, self.count(cut)


# --- the jobs ---------------------------------------------------------------


def done_rows(path):
    """The rows that a previous run already scored: the set, the language, the
    id, the gold label, the functionality and the score."""
    done = {}
    if not os.path.exists(path):
        return done
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 8:
                done[(parts[1], parts[2], parts[3])] = (
                    int(parts[4]),
                    parts[5],
                    float(parts[7]),
                )
    return done


def job_tox(args, labels):
    """The sweep of the threshold of the toxicity classifiers."""
    toxic_index, toxic_name = toxic_label(labels)
    print(f"labels {labels}")
    print(f"the toxic class is {toxic_index} ({toxic_name})")
    done = done_rows(args.out)
    checked = False
    out = open(args.out, "a", encoding="utf-8")
    out.write(
        f"# model\tset\tlang\tid\tgold\tfunctionality\tlabel\tscore"
        f"  (the score is the probability of the toxic class)\n"
    )
    sets = []
    for lang in ("en", "fr", "es"):
        sets.append(
            (
                "hatecheck",
                lang,
                os.path.join(args.data, f"hatecheck-{lang}", "test.csv"),
                read_hatecheck,
            )
        )
    for lang in ("en", "es", "fr"):
        sets.append(
            (
                "textdetox",
                lang,
                os.path.join(args.data, f"textdetox-{lang}", "data", f"{lang}-00000-of-00001.parquet"),
                read_parquet,
            )
        )
    for name, lang, path, reader in sets:
        if not os.path.exists(path):
            print(f"missing {path}")
            continue
        rows = reader(path)
        scores = []
        missing = []
        for row in rows:
            key = (name, lang, row[0])
            if key in done:
                gold, functionality, score = done[key]
                scores.append((row[0], gold, functionality, score))
            else:
                missing.append(row)
        if done:
            print(f"{name} {lang}: {len(rows) - len(missing)} rows are already scored")
        if not checked:
            # The check of the batch, on the first rows of the first set.
            check_batch(args.base, [row[1] for row in missing[:4]], args.timeout)
            checked = True
        # The calls of the bulk go four at a time: the server of TEI has four
        # slots and one client at a time leaves three of them empty.
        chunks = [
            missing[start : start + args.batch]
            for start in range(0, len(missing), args.batch)
        ]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [
                pool.submit(
                    predict_batch, args.base, [row[1] for row in chunk], args.timeout
                )
                for chunk in chunks
            ]
            for index, future in enumerate(futures):
                answer, _ = future.result()
                for row, classes in zip(chunks[index], answer):
                    top = max(classes, key=lambda part: part[1])
                    score = 0.0
                    for name_of_class, value in classes:
                        if name_of_class == toxic_name:
                            score = value
                    label = "toxic" if top[0] == toxic_name else "non-toxic"
                    scores.append((row[0], row[2], row[3], score))
                    out.write(
                        f"{args.model}\t{name}\t{lang}\t{row[0]}\t{row[2]}\t{row[3]}"
                        f"\t{label}\t{score:.6f}\n"
                    )
                if index % 20 == 0:
                    out.flush()
                    print(
                        f"{name} {lang} {min((index + 1) * args.batch, len(missing))}"
                        f"/{len(missing)}",
                        flush=True,
                    )
        out.flush()
        scores.sort(key=lambda row: int(row[0]))
        sweep(args, name, lang, scores)
    out.close()


def sweep(args, name, lang, scores):
    """The sweep of the threshold: precision, recall and F1 at every step, the
    best F1, the lowest threshold whose precision is at least 0.95 and the
    cases of the functionalities that C83 keeps."""
    total = len(scores)
    positives = sum(1 for _id, gold, _f, _s in scores if gold == 1)
    print(f"== toxicity: {name} {lang} rows {total} toxic {positives}")
    best = None
    floor = None
    strong = None
    for step in range(50, 100):
        threshold = step / 100
        flagged = [row for row in scores if row[3] >= threshold]
        true_positive = sum(1 for row in flagged if row[1] == 1)
        false_positive = len(flagged) - true_positive
        false_negative = positives - true_positive
        precision = true_positive / len(flagged) if flagged else 0.0
        recall = true_positive / positives if positives else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        bound = wilson_lower(true_positive, len(flagged))
        print(
            f"  sweep t={threshold:.2f} flagged={len(flagged)} tp={true_positive}"
            f" fp={false_positive} fn={false_negative}"
            f" p={precision:.4f} wilson={bound:.4f} r={recall:.4f} f1={f1:.4f}"
        )
        if best is None or f1 > best[3]:
            best = (threshold, precision, recall, f1)
        if floor is None and flagged and precision >= 0.95:
            floor = (threshold, precision, recall, f1, len(flagged), true_positive)
        if strong is None and flagged and bound >= 0.95:
            strong = (threshold, precision, recall, f1, len(flagged), true_positive)
    if best is None:
        print("  no threshold")
        return
    print(
        f"tox {name} {lang} rows {total} toxic {positives}"
        f" best_f1_t {best[0]:.2f} p {best[1]:.4f} r {best[2]:.4f} f1 {best[3]:.4f}"
    )
    if floor is None:
        print(f"tox {name} {lang} no threshold reaches a precision of 0.95")
        return
    threshold, precision, recall, f1, flagged, true_positive = floor
    bound = wilson_lower(true_positive, flagged)
    kept = {key: 0 for key in KEPT_FUNCTIONALITIES}
    for _id, gold, functionality, score in scores:
        if score >= threshold and functionality in kept:
            kept[functionality] += 1
    print(
        f"tox {name} {lang} prec95_t {threshold:.2f} flagged {flagged}"
        f" p {precision:.4f} wilson_low {bound:.4f} r {recall:.4f} f1 {f1:.4f}"
        f" | " + " ".join(f"{key}={kept[key]}" for key in KEPT_FUNCTIONALITIES)
    )
    if strong is None:
        print(f"tox {name} {lang} no threshold reaches a Wilson lower bound of 0.95")
        return
    threshold, precision, recall, f1, flagged, true_positive = strong
    bound = wilson_lower(true_positive, flagged)
    kept = {key: 0 for key in KEPT_FUNCTIONALITIES}
    for _id, gold, functionality, score in scores:
        if score >= threshold and functionality in kept:
            kept[functionality] += 1
    print(
        f"tox {name} {lang} wilson95_t {threshold:.2f} flagged {flagged}"
        f" p {precision:.4f} wilson_low {bound:.4f} r {recall:.4f} f1 {f1:.4f}"
        f" | " + " ".join(f"{key}={kept[key]}" for key in KEPT_FUNCTIONALITIES)
    )


def job_sent(args, labels):
    """The confusion matrix and the macro-F1 of the classifiers of sentiment,
    and the baseline of TF-IDF and logistic regression."""
    mapping = sentiment_map(labels)
    by_name = {name: mapping[index] for index, name in labels.items()}
    print(f"labels {labels}")
    print(f"the map to the three classes {by_name}")
    out = open(args.out, "a", encoding="utf-8")
    out.write(
        f"# model\tset\tlang\tid\tgold\tlabel\tscore\tms"
        f"  (the label is the class of the slice, the score the one of the model)\n"
    )
    for lang in ("english", "french", "spanish"):
        path = os.path.join(args.data, f"sent-{lang}", lang, "test", "0000.parquet")
        train = os.path.join(args.data, f"sent-{lang}", lang, "train", "0000.parquet")
        if not os.path.exists(path):
            print(f"missing {path}")
            continue
        rows = read_parquet(path)
        if len(rows) > args.cap:
            rows = random.Random(args.seed).sample(rows, args.cap)
        rows.sort(key=lambda row: int(row[0]))
        matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        chunks = [
            rows[start : start + args.batch]
            for start in range(0, len(rows), args.batch)
        ]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [
                pool.submit(
                    predict_batch, args.base, [row[1] for row in chunk], args.timeout
                )
                for chunk in chunks
            ]
            for index, future in enumerate(futures):
                answer, _ = future.result()
                for row, classes in zip(chunks[index], answer):
                    best = max(classes, key=lambda part: part[1])
                    name = by_name.get(best[0])
                    if name is None:
                        position = int(best[0]) if best[0].isdigit() else 0
                        name = CLASSES[position]
                    matrix[gold_class(row[2])][CLASSES.index(name)] += 1
                    out.write(
                        f"{args.model}\tsentiments\t{lang[:2]}\t{row[0]}\t{row[2]}"
                        f"\t{name}\t{best[1]:.6f}\n"
                    )
        out.flush()
        print(f"== sentiment: {lang} rows {len(rows)}")
        print(f"sent {args.model} {lang} rows {len(rows)} macro_f1 {macro_f1(matrix):.4f}")
        print("  the confusion matrix (the rows are the truth, the columns the prediction)")
        for index, name in enumerate(CLASSES):
            print(f"    {name:9s} {matrix[index][0]:5d} {matrix[index][1]:5d} {matrix[index][2]:5d}")
        base_matrix, base_f1 = baseline(train, path, args)
        print(f"sent {args.model} {lang} baseline macro_f1 {base_f1:.4f}")
        print("  the confusion matrix of the baseline")
        for index, name in enumerate(CLASSES):
            print(f"    {name:9s} {base_matrix[index][0]:5d} {base_matrix[index][1]:5d} {base_matrix[index][2]:5d}")
    out.close()


def baseline(train_path, test_path, args):
    """The baseline of the slice: TF-IDF and logistic regression, trained on the
    train split of the language."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    table = read_parquet(train_path)
    texts = [row[1] for row in table]
    labels = [gold_class(row[2]) for row in table]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)
    features = vectorizer.fit_transform(texts)
    model = LogisticRegression(max_iter=2000, C=4)
    model.fit(features, labels)
    test = read_parquet(test_path)
    if len(test) > args.cap:
        test = random.Random(args.seed).sample(test, args.cap)
    test.sort(key=lambda row: int(row[0]))
    predictions = model.predict(vectorizer.transform([row[1] for row in test]))
    matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for row, prediction in zip(test, predictions):
        matrix[gold_class(row[2])][int(prediction)] += 1
    return matrix, macro_f1(matrix)


def job_latency(args, labels):
    """The time of a call of a classifier: one short text, then a batch of 32."""
    counter = Counter(args.model_dir)
    texts = read_parquet(
        os.path.join(args.data, "sent-english", "english", "test", "0000.parquet")
    )
    # The texts of the set, cut to thirty tokens, the longest first: the single
    # call and the batch of thirty-two are texts of the same length.
    cut_texts = []
    for _id, text, _gold, _f in texts:
        cut, tokens = counter.cut(text, args.short_tokens)
        cut_texts.append((tokens, cut))
    cut_texts.sort(key=lambda item: -item[0])
    short = cut_texts[0][1] if cut_texts else ""
    batch = [text for _tokens, text in cut_texts[: args.batch]]
    while len(batch) < args.batch:
        batch.append(batch[0] if batch else short)
    lengths = [counter.count(text) for text in batch]
    print(f"the short text has {counter.count(short)} tokens")
    print(
        f"the batch has {len(batch)} texts of {min(lengths)}-{max(lengths)} tokens"
        f" (p50 {percentile(lengths, 0.5)})"
    )
    # The check of the batch, before the times: the batch of thirty-two is
    # one call, and its scores are the scores of the texts.
    check_batch(args.base, batch[:4], args.timeout)

    singles = []
    for index in range(args.warmups + args.calls):
        answer, elapsed = predict(args.base, [short], args.timeout, single=True)
        if index >= args.warmups:
            singles.append(elapsed)
    batches = []
    for index in range(args.warmups + args.calls):
        answer, elapsed = predict(args.base, batch, args.timeout)
        if index >= args.warmups:
            batches.append(elapsed)
    print(
        f"latency {args.model} single n {len(singles)}"
        f" p50 {percentile(singles, 0.5):.1f} p95 {percentile(singles, 0.95):.1f}"
        f" max {max(singles):.1f} mean {statistics.fmean(singles):.1f}"
    )
    print(
        f"latency {args.model} batch{len(batch)} n {len(batches)}"
        f" p50 {percentile(batches, 0.5):.1f} p95 {percentile(batches, 0.95):.1f}"
        f" max {max(batches):.1f} mean {statistics.fmean(batches):.1f}"
        f" per_text {statistics.fmean(batches) / len(batch):.1f}"
    )
    with open(args.out, "a", encoding="utf-8") as out:
        out.write("# the calls of the latency: the kind, the number, the wall time in ms\n")
        for kind, values in (("single", singles), (f"batch{len(batch)}", batches)):
            for value in values:
                out.write(f"{args.model}\t{kind}\t{len(values)}\t{value:.1f}\n")


def job_rerank(args, labels):
    """The time of a call of the reranker: the 20 passages of the top 20 in one
    call, then four such calls at once, then one passage at a time."""
    counter = Counter(args.model_dir)
    texts = read_parquet(
        os.path.join(args.data, "sent-english", "english", "test", "0000.parquet")
    )
    joined = " ".join(row[1] for row in texts)
    rng = random.Random(args.seed)
    start = rng.randrange(0, max(1, len(joined) // 2))
    passages = []
    queries = []
    cursor = start
    for _ in range(20):
        piece, _tokens = counter.cut(joined[cursor:], args.passage_tokens)
        passages.append(piece)
        # The cursor moves by the length of the passage: the twenty passages
        # are twenty passages, not the same one twenty times.
        cursor += len(piece)
        query, _tokens = counter.cut(texts[len(passages) - 1][1], args.short_tokens)
        queries.append(query)
    lengths = [counter.count(passage) for passage in passages]
    print(f"the passages have {min(lengths)}-{max(lengths)} tokens (p50 {percentile(lengths, 0.5)})")
    print(f"the queries have {counter.count(queries[0])} tokens")
    query = queries[0]

    calls = []
    for index in range(args.warmups + args.calls):
        answer, elapsed = rerank(args.base, query, passages, args.timeout)
        if index >= args.warmups:
            calls.append(elapsed)
    print(
        f"rerank {args.model} pairs20 n {len(calls)}"
        f" p50 {percentile(calls, 0.5):.1f} p95 {percentile(calls, 0.95):.1f}"
        f" max {max(calls):.1f} mean {statistics.fmean(calls):.1f}"
    )
    # Four calls at once: the wall time of every call, and the wall time of the
    # four together.
    parallel = []
    lock = threading.Lock()

    def one_call():
        answer, elapsed = rerank(args.base, query, passages, args.timeout)
        with lock:
            parallel.append(elapsed)

    before = time.perf_counter()
    threads = [threading.Thread(target=one_call) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    group = (time.perf_counter() - before) * 1000
    print(
        f"rerank {args.model} four_at_once wall {group:.1f}"
        f" calls p50 {percentile(parallel, 0.5):.1f} p95 {percentile(parallel, 0.95):.1f}"
        f" max {max(parallel):.1f}"
    )
    # One pair at a time: the twenty calls of the twenty pairs.
    alone = []
    for index in range(args.warmups + args.calls):
        answer, elapsed = rerank(args.base, queries[index % 20], [passages[index % 20]], args.timeout)
        if index >= args.warmups:
            alone.append(elapsed)
    print(
        f"rerank {args.model} one_pair n {len(alone)}"
        f" p50 {percentile(alone, 0.5):.1f} p95 {percentile(alone, 0.95):.1f}"
        f" max {max(alone):.1f} mean {statistics.fmean(alone):.1f}"
    )
    answer, _ = rerank(args.base, query, passages, args.timeout)
    with open(args.out, "a", encoding="utf-8") as out:
        out.write("# the ranking of the 20 passages of the last call, and the times of the calls\n")
        for item in answer:
            out.write(f"{args.model}\trank\t{item['index']}\t{item['score']:.6f}\n")
        for kind, values in (
            ("pairs20", calls),
            ("four_at_once", parallel),
            ("one_pair", alone),
        ):
            for value in values:
                out.write(f"{args.model}\t{kind}\t{len(values)}\t{value:.1f}\n")


JOBS = {
    "tox": job_tox,
    "sent": job_sent,
    "latency": job_latency,
    "rerank": job_rerank,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job", choices=sorted(JOBS))
    parser.add_argument("--model", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data", default="/mnt/storage")
    parser.add_argument("--out", required=True)
    parser.add_argument("--base", default="http://127.0.0.1:8080")
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--cap", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--calls", type=int, default=30)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--short-tokens", type=int, default=30)
    parser.add_argument("--passage-tokens", type=int, default=300)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    labels, config = model_labels(args.model_dir)
    print(f"the model {args.model} has the labels {labels}")
    print(f"the architectures {config.get('architectures')}")
    JOBS[args.job](args, labels)
    return 0


if __name__ == "__main__":
    sys.exit(main())
