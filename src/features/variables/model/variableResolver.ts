/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableResolver.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ResolvedVariable } from "@osionos/markdown-engine";

import type { PagePropertyEntry } from "@/entities/page";

import { VARIABLE_LIMITS, type VariableDefinition } from "./variableDefinitions";
import { parseVariableExpression, type VariableFilter } from "./variableExpression";
import { dateValue, formatVariableValue, wallClock, type FormatContext, type VariableValue } from "./variableFormat";

export interface VariableScope {
  definitions: ReadonlyMap<string, VariableDefinition>;
  page?: { title: string; properties?: PagePropertyEntry[] };
  context: FormatContext;
  /** The user's date preference (`relative` | `short` | `iso`): the fallback date format. */
  dateFormat: string;
}

/** A value plus how it would print; filters may still change either. */
interface Pending {
  value: VariableValue;
  format?: string;
  context: FormatContext;
}

const MAX_DEPTH = 8;
const NESTED_RE = /\{\{([^{}\n]{1,256})\}\}/g;
const DURATION_RE = /^([+-]?\d+)\s*(mo|y|w|d|h|m)$/;

class VariableError extends Error {}

function builtIn(name: string, scope: VariableScope): Pending | null {
  const { context } = scope;
  const preferred = scope.dateFormat === "iso" ? "iso" : "short";
  if (name === "NOW") return { value: { kind: "date", date: context.now, dateOnly: false }, format: preferred === "iso" ? "iso" : "datetime", context };
  if (name === "TIME") return { value: { kind: "date", date: context.now, dateOnly: false }, format: "time", context };
  if (name === "TODAY") {
    const clock = wallClock(context.now, context.timeZone);
    const date = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
    return { value: { kind: "date", date, dateOnly: true }, format: preferred, context };
  }
  if (name === "PAGE" && scope.page) return { value: { kind: "text", text: scope.page.title }, context };
  return null;
}

const propertyKey = (text: string) => text.trim().toLowerCase().replace(/[\s-]+/g, "_");

function propertyValue(entry: PagePropertyEntry): VariableValue {
  const { value } = entry;
  if (value === null || value === undefined) return { kind: "text", text: "" };
  if (Array.isArray(value)) return { kind: "text", text: value.join(", ") };
  if (entry.type === "checkbox") return { kind: "boolean", flag: value === true || value === "true" };
  if (entry.type === "number" && Number.isFinite(Number(value))) return { kind: "number", number: Number(value) };
  if (entry.type === "date" && typeof value === "string") return dateValue(value) ?? { kind: "text", text: value };
  return { kind: "text", text: String(value) };
}

function pageProperty(name: string, scope: VariableScope): Pending | null {
  const wanted = propertyKey(name.slice("page.".length));
  const entry = scope.page?.properties?.find((p) => propertyKey(p.key) === wanted || propertyKey(p.label) === wanted);
  return entry ? { value: propertyValue(entry), context: scope.context } : null;
}

function fromDefinition(definition: VariableDefinition, scope: VariableScope, stack: string[]): Pending {
  const context = {
    ...scope.context,
    locale: definition.locale ?? scope.context.locale,
    numberLocale: definition.locale ?? scope.context.numberLocale,
    timeZone: definition.timeZone ?? scope.context.timeZone,
  };
  const { value } = definition;
  if (definition.type === "number") return { value: { kind: "number", number: value as number }, format: definition.format, context };
  if (definition.type === "boolean") return { value: { kind: "boolean", flag: value as boolean }, format: definition.format, context };
  if (definition.type === "date") return { value: dateValue(value as string) as VariableValue, format: definition.format ?? scope.dateFormat, context };
  return { value: { kind: "text", text: expandNested(value as string, scope, stack) }, context };
}

function lookup(name: string, scope: VariableScope, stack: string[]): Pending | null {
  if (stack.includes(name)) throw new VariableError(`cycle: ${[...stack, name].join(" → ")}`);
  if (stack.length >= MAX_DEPTH) throw new VariableError(`nested more than ${MAX_DEPTH} deep`);
  if (name.startsWith("page.")) return pageProperty(name, scope);
  const definition = scope.definitions.get(name);
  if (definition) return fromDefinition(definition, scope, [...stack, name]);
  return builtIn(name, scope);
}

/** `{{OTHER}}` inside a text value; an unknown name stays literal, as it does in a block. */
function expandNested(text: string, scope: VariableScope, stack: string[]): string {
  if (!text.includes("{{")) return text;
  return text.replace(NESTED_RE, (match, expr: string) => resolveText(expr, scope, stack) ?? match);
}

function addDuration(pending: Pending, arg: string): VariableValue {
  const { value } = pending;
  if (value.kind === "number" && Number.isFinite(Number(arg))) return { kind: "number", number: value.number + Number(arg) };
  const match = DURATION_RE.exec(arg.trim());
  if (value.kind !== "date" || !match) throw new VariableError(`add:"${arg}" needs a date and a duration like 3d, -2w, 1mo, 4h`);
  const amount = Number(match[1]);
  const date = new Date(value.date);
  const unit = match[2];
  if (unit === "y") date.setFullYear(date.getFullYear() + amount);
  else if (unit === "mo") date.setMonth(date.getMonth() + amount);
  else if (unit === "w" || unit === "d") date.setDate(date.getDate() + amount * (unit === "w" ? 7 : 1));
  else date.setTime(date.getTime() + amount * (unit === "h" ? 36e5 : 6e4));
  return { ...value, date };
}

function asDate(pending: Pending, filter: string): VariableValue {
  const { value } = pending;
  if (value.kind === "date") return value;
  const parsed = value.kind === "text" ? dateValue(value.text) : null;
  if (!parsed) throw new VariableError(`${filter} needs a date value`);
  return parsed;
}

const text = (pending: Pending) => formatVariableValue(pending.value, pending.format, pending.context);

function applyFilter(pending: Pending, filter: VariableFilter): Pending {
  const { name, arg } = filter;
  if (name === "upper" || name === "lower") {
    const printed = text(pending);
    return { ...pending, value: { kind: "text", text: name === "upper" ? printed.toUpperCase() : printed.toLowerCase() }, format: undefined };
  }
  if (name === "default") return text(pending) === "" ? { ...pending, value: { kind: "text", text: arg ?? "" }, format: undefined } : pending;
  if (name === "relative") return { ...pending, value: asDate(pending, name), format: "relative" };
  if (name === "date") {
    if (!arg) throw new VariableError(`date needs a format, e.g. date:"dd MMM yyyy"`);
    return { ...pending, value: asDate(pending, name), format: arg };
  }
  if (name === "number") {
    const number = pending.value.kind === "number" ? pending.value.number : Number(text(pending));
    if (!Number.isFinite(number)) throw new VariableError("number needs a numeric value");
    return { ...pending, value: { kind: "number", number }, format: arg };
  }
  if (name === "add" && arg) return { ...pending, value: addDuration(pending, arg) };
  throw new VariableError(`unknown filter "${name}" (date, relative, number, add, upper, lower, default)`);
}

function resolveText(expr: string, scope: VariableScope, stack: string[]): string | null {
  const parsed = parseVariableExpression(expr);
  if (!parsed) throw new VariableError("a filter is malformed — write | name or | name:\"arg\"");
  let pending = lookup(parsed.name, scope, stack);
  const fallback = parsed.filters.find((f) => f.name === "default");
  if (!pending) {
    if (!fallback) return null;
    pending = { value: { kind: "text", text: "" }, context: scope.context };
  }
  for (const filter of parsed.filters) pending = applyFilter(pending, filter);
  const printed = text(pending);
  return printed.length > VARIABLE_LIMITS.valueChars ? `${printed.slice(0, VARIABLE_LIMITS.valueChars)}…` : printed;
}

/**
 * `null` keeps `{{expr}}` as literal text (an unknown name — a typo stays visible and
 * editable); a bad filter, format, zone or cycle is an error chip naming the problem.
 */
export function resolveVariable(expr: string, scope: VariableScope): ResolvedVariable | null {
  try {
    const resolved = resolveText(expr, scope, []);
    return resolved === null ? null : { text: resolved };
  } catch (error) {
    const reason = error instanceof VariableError || error instanceof RangeError ? error.message : String(error);
    return { text: `{{${expr.trim()}}}`, error: reason };
  }
}
