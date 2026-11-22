import assert from "node:assert/strict";
import test from "node:test";

import { errorWords } from "@/widgets/chat-shell/ui/errorWords";
import { runError } from "@/features/chat/model/runErrors";

/**
 * A run that ends without an answer has a sentence (services/osionos-ai
 * src/runs/emptyAnswer.ts): before 2026-11-22 it ended in silence.
 */
const EMPTY_ANSWER_CODES: Array<[string, RegExp]> = [
  ["answer_cut_off", /thinking.*try again|try again.*another model/i],
  ["answer_filtered", /filter.*rephrase|rephrase.*another model/i],
  ["empty_answer", /without an answer.*try again/i],
];

test("every end without an answer has its own sentence and may be retried", () => {
  const seen = new Set<string>();
  for (const [code, words] of EMPTY_ANSWER_CODES) {
    const info = runError(code);
    assert.equal(info.known, true, code);
    assert.match(info.text, words, code);
    assert.equal(info.retry, true, code);
    assert.notEqual(errorWords(code), errorWords("upstream_error"), code);
    assert.ok(!errorWords(code).includes(code), `${code} is said in words, not as a code`);
    seen.add(info.text);
  }
  assert.equal(seen.size, EMPTY_ANSWER_CODES.length);
});
