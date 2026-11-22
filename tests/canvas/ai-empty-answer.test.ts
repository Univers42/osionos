import assert from "node:assert/strict";
import test from "node:test";

import { errorWords } from "@/widgets/chat-shell/ui/errorWords";
import { runError } from "@/features/chat/model/runErrors";

/**
 * A run that ends without an answer has a sentence (services/osionos-ai
 * src/runs/emptyAnswer.ts): before 2026-11-22 it ended in silence. A filtered
 * answer is not retried as is: the same message meets the same filter.
 */
const EMPTY_ANSWER_CODES: Array<[string, RegExp, boolean]> = [
  ["answer_cut_off", /thinking.*try again|try again.*another model/i, true],
  ["answer_filtered", /filter.*rephrase|rephrase.*another model/i, false],
  ["empty_answer", /without an answer.*try again/i, true],
];

test("every end without an answer has its own sentence, and a retry only where one can help", () => {
  const seen = new Set<string>();
  for (const [code, words, retry] of EMPTY_ANSWER_CODES) {
    const info = runError(code);
    assert.equal(info.known, true, code);
    assert.match(info.text, words, code);
    assert.equal(info.retry, retry, code);
    assert.notEqual(errorWords(code), errorWords("upstream_error"), code);
    assert.ok(!errorWords(code).includes(code), `${code} is said in words, not as a code`);
    seen.add(info.text);
  }
  assert.equal(seen.size, EMPTY_ANSWER_CODES.length);
});
