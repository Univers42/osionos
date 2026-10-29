/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables-generative.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Laws of the variables system over generated input. Every generator is seeded
// (mulberry32), so a run checks the same cases every time and a failure message names
// the seed that replays it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInline, serializeInlineNodes } from "@osionos/markdown-engine";

import { FILTER_SUGGESTIONS, rankSuggestions } from "@/features/variables/model/variableCatalog";
import { VARIABLE_NAME_RE, parseVariableDefinitions } from "@/features/variables/model/variableDefinitions";
import { resolveVariable, type VariableScope } from "@/features/variables/model/variableResolver";
import { applyVariableInsert, matchVariableTrigger } from "@/features/variables/model/variableTrigger";

import { mulberry32 } from "./markdown-fidelity-fixtures.ts";

const SEEDS = 300;
const NAMES = ["A", "B", "C", "D", "E", "F"];
const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)];
const layer = (env: object) => parseVariableDefinitions(JSON.stringify(env)).definitions;
const scopeOf = (layers: object[]): VariableScope => ({
  layers: layers.map(layer),
  pages: [{ title: "Page" }],
  context: { locale: "en-US", numberLocale: "en-US", timeZone: "Europe/Paris", now: new Date("2026-10-28T14:05:09Z") },
  dateFormat: "relative",
});

function randomValue(random: () => number): string {
  const parts = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
    pick(random, ["x", "lit ", `{{${pick(random, NAMES)}}}`, `{{${pick(random, NAMES)} | upper}}`, `{{${pick(random, NAMES)} | default:"d"}}`, '{{NOW | date:"yyyy"}}']),
  );
  return parts.join("");
}

test("resolution always terminates, never throws, and is deterministic", () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed);
    const layers = Array.from({ length: 1 + Math.floor(random() * 4) }, () =>
      Object.fromEntries(NAMES.filter(() => random() < 0.6).map((name) => [name, randomValue(random)])),
    );
    const scope = scopeOf(layers);
    for (const name of NAMES) {
      const first = resolveVariable(name, scope);
      assert.deepEqual(resolveVariable(name, scope), first, `seed ${seed} ${name}: same input, same output`);
      if (first?.error) assert.match(first.error, /^(cycle: |nested more than 8 deep)/, `seed ${seed} ${name}`);
      if (first && !first.error) assert.doesNotMatch(first.text, /undefined|\[object/, `seed ${seed} ${name}`);
    }
  }
});

test("literal-only env files never error and the innermost value wins", () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed + 10_000);
    const layers = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => (random() < 0.7 ? { A: `v${i}` } : {}));
    const winner = layers.findIndex((l) => "A" in l);
    assert.deepEqual(resolveVariable("A", scopeOf(layers)), winner < 0 ? null : { text: `v${winner}` }, `seed ${seed}`);
  }
});

test("self-reference reads one file further out per layer, up to the nesting cap", () => {
  for (let depth = 1; depth <= 9; depth += 1) {
    const layers = Array.from({ length: depth }, (_, i) => ({ X: i === depth - 1 ? "base" : `{{X}}/${i}` }));
    const resolved = resolveVariable("X", scopeOf(layers));
    if (depth <= 8) {
      const expected = ["base", ...Array.from({ length: depth - 1 }, (_, i) => String(depth - 2 - i))].join("/");
      assert.deepEqual(resolved, { text: expected }, `depth ${depth}`);
    } else {
      assert.match(resolved?.error ?? "", /nested more than 8 deep/, `depth ${depth}`);
    }
  }
});

const PROSE = ["Hi", "due", "at", "1.5", "-", "ok:", "x", "Q4", "à", "?"];
const NAME_CHARS = "abcXYZ_09-";

function randomName(random: () => number): string {
  if (random() < 0.2) return `page.${pick(random, ["Status", "Due_date", "k1"])}`;
  let name = pick(random, [..."abcXYZ_"]);
  for (let i = Math.floor(random() * 10); i > 0; i -= 1) name += pick(random, [...NAME_CHARS]);
  return name;
}

test("a name pick: trigger → insert → closed chip that the engine parses back byte-identical", () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed + 20_000);
    const prose = Array.from({ length: Math.floor(random() * 5) }, () => pick(random, PROSE)).join(" ");
    const name = randomName(random);
    const typed = name.slice(0, Math.floor(random() * (name.length + 1)));
    const text = `${prose}${prose ? " " : ""}{{${typed}`;
    assert.deepEqual(matchVariableTrigger(text), { start: text.length - typed.length - 2, mode: "name", name: typed, query: typed }, `seed ${seed}`);
    const written = applyVariableInsert(text, name);
    assert.equal(written, `${text.slice(0, -typed.length - 2)}{{${name}}}`, `seed ${seed}`);
    assert.equal(matchVariableTrigger(written!), null, `seed ${seed}: closed`);
    const nodes = parseInline(written!);
    assert.deepEqual({ ...nodes.at(-1) }, { type: "variable", expr: name }, `seed ${seed}: ${written}`);
    assert.equal(serializeInlineNodes(nodes), written, `seed ${seed}`);
  }
});

test("a filter pick appended to any valid chain resolves without error", () => {
  const chains = ["", ' | add:"1d"', " | upper", ' | default:"x"'];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed + 30_000);
    const { insert } = pick(random, FILTER_SUGGESTIONS);
    const subject = insert.startsWith("number") ? "N" : "TODAY";
    const chain = subject === "N" ? "" : pick(random, chains.slice(0, 2));
    const typedFilter = insert.slice(0, Math.floor(random() * 3)).replace(/[^a-z]/gi, "");
    const written = applyVariableInsert(`{{${subject}${chain} | ${typedFilter}`, insert)!;
    const node = parseInline(written).at(-1) as { type: string; expr: string };
    assert.equal(node.type, "variable", `seed ${seed}: ${written}`);
    const resolved = resolveVariable(node.expr, scopeOf([{ N: 4 }]));
    assert.ok(resolved && !resolved.error, `seed ${seed}: ${written} → ${resolved?.error}`);
  }
});

function randomJson(random: () => number, depth = 0): unknown {
  const roll = random();
  if (depth > 2 || roll < 0.25) return pick(random, ["s", "{{A}}", "", "2026-12-01", "x".repeat(2_100)]);
  if (roll < 0.4) return pick(random, [0, -1.5, 1e21, Number.MAX_SAFE_INTEGER]);
  if (roll < 0.5) return pick(random, [true, false, null]);
  if (roll < 0.6) return [randomJson(random, depth + 1)];
  return {
    type: pick(random, ["text", "number", "date", "boolean", "bogus", 7]),
    value: randomJson(random, depth + 1),
    ...(random() < 0.5 ? { format: pick(random, ["percent", "yyyy", "Yes/No", "currency:EUR", 3]) } : {}),
    ...(random() < 0.3 ? { locale: pick(random, ["fr-FR", "zz-!!", ""]) } : {}),
  };
}

test("env.json parsing never throws and only ever loads valid names", () => {
  const KEYS = ["A", "_b", "c-1", "1bad", "has space", "é", "", "page.x", "OK_2"];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed + 40_000);
    const env = Object.fromEntries(KEYS.filter(() => random() < 0.7).map((key) => [key, randomJson(random)]));
    const raw = random() < 0.1 ? JSON.stringify(env).slice(0, -1) : JSON.stringify(env);
    const parsed = parseVariableDefinitions(raw);
    for (const name of parsed.definitions.keys()) assert.match(name, VARIABLE_NAME_RE, `seed ${seed}`);
    assert.ok(parsed.definitions.size + parsed.errors.length >= (raw === JSON.stringify(env) ? Object.keys(env).length : 1), `seed ${seed}: every key loads or is reported`);
    for (const name of parsed.definitions.keys()) assert.doesNotThrow(() => resolveVariable(name, { ...scopeOf([]), layers: [parsed.definitions] }), `seed ${seed} ${name}`);
  }
});

test("ranking keeps only matches, prefixes first, each group in catalog order, capped", () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const random = mulberry32(seed + 50_000);
    const items = Array.from({ length: Math.floor(random() * 40) }, () => ({ insert: randomName(random), source: "" }));
    const query = randomName(random).slice(0, Math.floor(random() * 3));
    const limit = 1 + Math.floor(random() * 50);
    const ranked = rankSuggestions(items, query, limit).map((i) => i.insert);
    const q = query.toLowerCase();
    const prefix = items.map((i) => i.insert).filter((n) => n.toLowerCase().startsWith(q));
    const inner = items.map((i) => i.insert).filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    assert.deepEqual(ranked, [...prefix, ...inner].slice(0, limit), `seed ${seed} query "${query}"`);
  }
});
