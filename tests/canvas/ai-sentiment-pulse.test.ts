/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-sentiment-pulse.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sentiment model of the app (M6): the answers are checked, a week the
 * service left out is a gap and never a zero (C140), and the words are the ones
 * the interface shows.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMood,
  parsePulse,
  parseSettings,
  parseThreadMood,
  pulseRows,
  threadMoodLine,
} from "../../src/features/ai/model/sentimentPulse";

const week = (weekStart: string, negative = 1, neutral = 2, positive = 3) => ({ weekStart, negative, neutral, positive });

test("C138 the settings answer must be a boolean", () => {
  assert.deepEqual(parseSettings({ enabled: true }), { enabled: true });
  assert.equal(parseSettings({ enabled: "yes" }), null);
  assert.equal(parseSettings(null), null);
});

test("C140 a disabled pulse has no weeks, an enabled one keeps its weeks and its k", () => {
  assert.deepEqual(parsePulse({ enabled: false, weeks: [] }), { enabled: false, minAuthors: 0, weeks: [] });
  assert.deepEqual(parsePulse({ enabled: true, minAuthors: 5, weeks: [week("2026-10-12")] }), {
    enabled: true,
    minAuthors: 5,
    weeks: [week("2026-10-12")],
  });
});

test("C140 a malformed pulse is refused whole", () => {
  assert.equal(parsePulse({ enabled: true, minAuthors: 5, weeks: [{ weekStart: "soon", negative: 0, neutral: 0, positive: 0 }] }), null);
  assert.equal(parsePulse({ enabled: true, minAuthors: 5, weeks: [week("2026-10-12", -1)] }), null);
  assert.equal(parsePulse({ enabled: true, minAuthors: 5, weeks: [{ weekStart: "2026-10-12", negative: 1 }] }), null);
  assert.equal(parsePulse({ enabled: true, minAuthors: 5 }), null);
  assert.equal(parsePulse("nope"), null);
});

test("C140 a week the service left out is a gap row with no values, never zeros", () => {
  const rows = pulseRows([week("2026-10-12"), week("2026-09-21")]);
  assert.deepEqual(rows.map((row) => row.weekStart), ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
  for (const gap of [rows[1], rows[2]]) {
    assert.deepEqual([gap.negative, gap.neutral, gap.positive], [null, null, null]);
  }
  assert.equal(rows[0].positive, 3);
  assert.deepEqual(pulseRows([]), []);
});

test("C140 the thread mood needs a label and a share between 0 and 1; null otherwise", () => {
  assert.deepEqual(parseThreadMood({ mood: "positive", share: 0.72 }), { mood: "positive", share: 0.72 });
  assert.equal(parseThreadMood({ mood: null }), null);
  assert.equal(parseThreadMood({ mood: "angry", share: 0.5 }), null);
  assert.equal(parseThreadMood({ mood: "neutral", share: 1.5 }), null);
  assert.equal(parseThreadMood({ mood: "neutral" }), null);
});

test("the words of the mood", () => {
  assert.equal(formatMood({ mood: "positive", share: 0.72 }), "Mostly positive · 72 %");
  assert.equal(threadMoodLine({ mood: "negative", share: 0.6 }), "Thread mood: Mostly negative (60 %)");
});
