/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables-resolver.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `{{NAME | filter}}` resolution: scope order, formats, filters, nesting guards, and the
// env.json parser's caps. The clock and zone are pinned, so the strings are exact.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseVariableDefinitions, VARIABLE_LIMITS } from "@/features/variables/model/variableDefinitions";
import { resolveVariable, type VariableScope } from "@/features/variables/model/variableResolver";

const NOW = new Date("2026-10-28T14:05:09Z");

function scope(env: object = {}, overrides: Partial<VariableScope> = {}): VariableScope {
  return {
    definitions: parseVariableDefinitions(JSON.stringify(env)).definitions,
    page: { title: "Q4 plan", properties: [
      { key: "status", label: "Status", type: "select", value: "In review" },
      { key: "due", label: "Due date", type: "date", value: "2026-11-04" },
      { key: "done", label: "Done", type: "checkbox", value: true },
      { key: "tags", label: "Tags", type: "multi_select", value: ["a", "b"] },
      { key: "empty", label: "Empty", type: "text", value: null },
    ] },
    context: { locale: "en-US", numberLocale: "en-US", timeZone: "Europe/Paris", now: NOW },
    dateFormat: "relative",
    ...overrides,
  };
}
const text = (expr: string, s = scope()) => resolveVariable(expr, s)?.text;
const error = (expr: string, s = scope()) => resolveVariable(expr, s)?.error;

test("built-ins read the pinned clock in the user's zone; `relative` pref shows short", () => {
  assert.equal(text("NOW"), "Oct 28, 2026, 3:05 PM");
  assert.equal(text("TIME"), "3:05 PM");
  assert.equal(text("TODAY"), "10/28/26");
  assert.equal(text("TODAY", scope({}, { dateFormat: "iso" })), "2026-10-28");
  assert.equal(text("NOW", scope({}, { dateFormat: "iso" })), "2026-10-28T15:05");
  assert.equal(text("PAGE"), "Q4 plan");
});

test("TODAY is the calendar day in the user's zone, not UTC's", () => {
  const lateUtc = scope({}, { context: { locale: "en-US", numberLocale: "en-US", timeZone: "Asia/Tokyo", now: new Date("2026-10-28T20:00:00Z") } });
  assert.equal(text('TODAY | date:"yyyy-MM-dd"', lateUtc), "2026-10-29");
});

test("env.json shorthand and typed entries, each with its own format", () => {
  const env = {
    CLIENT: "Acme",
    VAT: { type: "number", value: 0.2, format: "percent" },
    PRICE: { type: "number", value: 1234.5, format: "currency:EUR", locale: "fr-FR" },
    LAUNCH: { type: "date", value: "2026-12-01", format: "dd MMM yyyy" },
    LIVE: { type: "boolean", value: false, format: "Yes/No" },
    COUNT: 3,
  };
  assert.equal(text("CLIENT", scope(env)), "Acme");
  assert.equal(text("VAT", scope(env)), "20%");
  assert.equal(text("PRICE", scope(env))?.replace(/\s/g, " "), "1 234,50 €", "fr-FR uses narrow no-break spaces");
  assert.equal(text("LAUNCH", scope(env)), "01 Dec 2026");
  assert.equal(text("LIVE", scope(env)), "No");
  assert.equal(text("COUNT", scope(env)), "3");
});

test("an inline filter beats the variable's format, which beats the preference", () => {
  const env = { LAUNCH: { type: "date", value: "2026-12-01", format: "dd MMM yyyy" }, PLAIN: { type: "date", value: "2026-10-30" } };
  assert.equal(text('LAUNCH | date:"yyyy"', scope(env)), "2026");
  assert.equal(text("PLAIN", scope(env)), "in 2 days", "no own format → the relative preference");
  assert.equal(text("PLAIN", scope(env, { dateFormat: "iso" })), "2026-10-30");
});

test("filters: add, relative, upper/lower, number, default", () => {
  const env = { CLIENT: "Acme", N: 41 };
  assert.equal(text('TODAY | add:"7d" | date:"dd/MM"'), "04/11");
  assert.equal(text('TODAY | add:"1mo" | relative'), "next month");
  assert.equal(text("TODAY | relative"), "today");
  assert.equal(text("CLIENT | upper", scope(env)), "ACME");
  assert.equal(text('N | add:"1"', scope(env)), "42");
  assert.equal(text('N | number:"fixed:2"', scope(env)), "41.00");
  assert.equal(text('MISSING | default:"n/a"'), "n/a");
  assert.equal(text('page.empty | default:"—"'), "—");
});

test("page properties match key or label, case- and space-insensitively", () => {
  assert.equal(text("page.Status"), "In review");
  assert.equal(text("page.due_date | relative"), "next week");
  assert.equal(text('page.DUE | date:"d MMM"'), "4 Nov");
  assert.equal(text("page.done"), "true");
  assert.equal(text("page.tags"), "a, b");
});

test("an unknown name stays literal (null); a page property beats nothing else", () => {
  assert.equal(resolveVariable("NOPE", scope()), null);
  assert.equal(resolveVariable("page.nope", scope()), null);
  assert.equal(text("NOW", scope({ NOW: "overridden" })), "overridden", "a workspace definition may shadow a built-in");
});

test("nested values expand; cycles and depth are error chips, not hangs", () => {
  const env = { CLIENT: "Acme", GREETING: "Hello {{CLIENT}} on {{TODAY | date:\"dd/MM\"}} {{NOPE}}", A: "{{B}}", B: "{{A}}" };
  assert.equal(text("GREETING", scope(env)), "Hello Acme on 28/10 {{NOPE}}");
  assert.equal(error("A", scope(env)), "cycle: A → B → A");
  assert.equal(text("A", scope(env)), "{{A}}");
  const chain = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`V${i}`, i === 11 ? "end" : `{{V${i + 1}}}`]));
  assert.match(error("V0", scope(chain)) ?? "", /nested more than 8 deep/);
});

test("bad filters and formats are error chips naming the problem", () => {
  const env = { CLIENT: "Acme", N: 1 };
  assert.match(error("CLIENT | shout", scope(env)) ?? "", /unknown filter "shout"/);
  assert.match(error('N | number:"weird"', scope(env)) ?? "", /unknown number format/);
  assert.match(error('TODAY | date:"Invoice yyyy"') ?? "", /.+/);
  assert.match(error('CLIENT | add:"3d"', scope(env)) ?? "", /needs a date/);
  assert.match(error("CLIENT | date", scope(env)) ?? "", /date needs a format/);
});

test("env.json: bad entries are reported and skipped, the rest load", () => {
  const { definitions, errors } = parseVariableDefinitions(JSON.stringify({
    OK: "x", "bad name": 1, NUM: { type: "number", value: "1" }, KIND: { type: "color", value: "red" }, LIST: [1], FMT: { value: "a", format: 3 },
    ZONE: { type: "date", value: "2026-10-28", timeZone: "Mars/Olympus" }, LOC: { value: "a", locale: "not a locale!" },
  }));
  assert.deepEqual([...definitions.keys()], ["OK"]);
  assert.equal(errors.length, 7);
  assert.ok(errors.includes('ZONE: unknown time zone "Mars/Olympus"'));
  assert.match(parseVariableDefinitions("{").errors[0], /not valid JSON/);
  assert.match(parseVariableDefinitions("[]").errors[0], /must be an object/);
  assert.equal(parseVariableDefinitions("   ").errors.length, 0, "an empty file is no variables, not an error");
});

test("env.json caps: size, count, value length", () => {
  assert.match(parseVariableDefinitions(" ".repeat(VARIABLE_LIMITS.sourceChars + 1) + "{}").errors[0], /over/);
  const many = Object.fromEntries(Array.from({ length: VARIABLE_LIMITS.count + 5 }, (_, i) => [`V${i}`, i]));
  const parsed = parseVariableDefinitions(JSON.stringify(many));
  assert.equal(parsed.definitions.size, VARIABLE_LIMITS.count);
  assert.match(parseVariableDefinitions(JSON.stringify({ L: "x".repeat(VARIABLE_LIMITS.valueChars + 1) })).errors[0], /over 2000/);
});
