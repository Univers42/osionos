/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables.bench.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "../../src/entities/page/index.ts";
import { isEnvPage } from "../../src/features/variables/model/envFile.ts";
import { rankSuggestions, variableSuggestions } from "../../src/features/variables/model/variableCatalog.ts";
import { parseVariableDefinitions } from "../../src/features/variables/model/variableDefinitions.ts";
import { resolveVariable, type VariableScope } from "../../src/features/variables/model/variableResolver.ts";
import { defineBench } from "./harness.ts";

// What `{{NAME}}` variables add to a keystroke. A focused block re-renders its chips
// on every normalising input, and every page edit re-scans its workspace for env.json.
//
// Measured 2026-10-28 (Docker, median / p95): {{NOW}} 1.25 / 1.31 µs, a date-fns
// pattern 2.13 / 2.30 µs, two nested variables 6.75 / 7.16 µs, a 50-chip block
// 73.3 / 82.9 µs, the env.json scan 2.79 / 4.54 µs, parsing 200 definitions
// 47.4 / 52.7 µs. Building an Intl.DateTimeFormat costs 44.8 µs against 0.77 µs to
// format with a cached one, which is why variableFormat.ts caches them.
//
// Caveat: no React and no DOM here; the chip's share of a real keystroke is in
// tests/e2e/perf/typing.spec.mjs, which these numbers only explain.

const ENV = Object.fromEntries([
  ["CLIENT", "Acme"],
  ["GREETING", "Hello {{CLIENT}} on {{TODAY | date:\"dd/MM\"}}"],
  ["DUE", { type: "date", value: "2026-11-04", format: "relative" }],
  ["PRICE", { type: "number", value: 1234.5, format: "currency:EUR" }],
  ...Array.from({ length: 196 }, (_, i) => [`VAR_${i}`, `value ${i}`]),
]);
const ENV_SOURCE = JSON.stringify(ENV, null, 2);

// Worst realistic placement: two page-level env.json files over the workspace one, and
// the property two pages up, so every lookup walks the layers and the page chain.
function scope(): VariableScope {
  const pageLayer = parseVariableDefinitions(JSON.stringify({ PROJECT: "x", CLIENT: "{{CLIENT}} (EU)" })).definitions;
  return {
    layers: [pageLayer, pageLayer, parseVariableDefinitions(ENV_SOURCE).definitions],
    pages: [
      { title: "Q4 plan" },
      { title: "Sprint", properties: [{ key: "owner", label: "Owner", type: "person", value: "dl" }] },
      { title: "Project", properties: [{ key: "status", label: "Status", type: "select", value: "In review" }] },
    ],
    context: { locale: "en-US", numberLocale: "en-US", timeZone: "Europe/Paris", now: new Date("2026-10-28T14:05:09Z") },
    dateFormat: "relative",
  };
}

// A large workspace with env.json last; sync scans every page of it per keystroke.
const PAGES = [
  ...Array.from({ length: 2_000 }, (_, i) => ({ _id: `p${i}`, title: `Page ${i}`, parentPageId: i % 3 ? `p${i - 1}` : null })),
  { _id: "env", title: "env.json", surface: "code" },
] as unknown as PageEntry[];

const BLOCK_EXPRESSIONS = Array.from({ length: 50 }, (_, i) => ["NOW", "CLIENT", "DUE", "PRICE", "page.Status"][i % 5]);

export const bench = defineBench("variables", [
  {
    name: "resolve {{NOW}} (built-in, cached formatter)",
    budgetNs: 4_000,
    setup: () => {
      const s = scope();
      return () => resolveVariable("NOW", s);
    },
  },
  {
    name: "resolve {{DUE | date:\"EEE d MMM\"}} (date-fns pattern)",
    budgetNs: 7_000,
    setup: () => {
      const s = scope();
      return () => resolveVariable("DUE | date:\"EEE d MMM\"", s);
    },
  },
  {
    name: "resolve {{GREETING}} (two nested variables)",
    budgetNs: 22_000,
    setup: () => {
      const s = scope();
      return () => resolveVariable("GREETING", s);
    },
  },
  {
    name: "resolve 50 chips (one dense block)",
    budgetNs: 250_000,
    setup: () => {
      const s = scope();
      return () => BLOCK_EXPRESSIONS.map((expr) => resolveVariable(expr, s));
    },
  },
  {
    name: "scan a 2,001-page workspace for env.json files",
    budgetNs: 15_000,
    setup: () => () => PAGES.filter(isEnvPage),
  },
  {
    name: "{{ menu: catalog + rank + 50 previews",
    budgetNs: 60_000,
    setup: () => {
      const s = scope();
      const placement = { ...s, owners: s.layers.map(() => ({ title: "Project" }) as PageEntry) };
      return () => rankSuggestions(variableSuggestions(placement), "a", 50).map((item) => resolveVariable(item.insert, s));
    },
  },
  {
    name: "parse env.json with 200 variables",
    budgetNs: 160_000,
    setup: () => () => parseVariableDefinitions(ENV_SOURCE),
  },
  {
    name: "Intl.DateTimeFormat: construct + format",
    reference: true,
    setup: () => {
      const date = new Date();
      return () => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
    },
  },
  {
    name: "Intl.DateTimeFormat: format with a cached one",
    reference: true,
    setup: () => {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
      return () => formatter.format(date);
    },
  },
]);
