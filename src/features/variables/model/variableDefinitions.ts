/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableDefinitions.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The workspace `env.json`: a flat object of NAME → value. A bare string, number or
 * boolean is shorthand; an object carries a type and how to show it:
 *
 *   { "CLIENT": "Acme", "VAT": { "type": "number", "value": 0.2, "format": "percent" },
 *     "LAUNCH": { "type": "date", "value": "2026-12-01", "format": "dd MMM yyyy" } }
 *
 * Values are data, never code: nothing here is evaluated, and the renderer escapes
 * every resolved string. This is not a secrets store — the file is a normal page.
 */
export type VariableType = "text" | "number" | "date" | "boolean";

export interface VariableDefinition {
  type: VariableType;
  value: string | number | boolean;
  format?: string;
  locale?: string;
  timeZone?: string;
}

export interface ParsedDefinitions {
  definitions: Map<string, VariableDefinition>;
  errors: string[];
}

export const VARIABLE_LIMITS = { sourceChars: 64_000, count: 500, valueChars: 2_000 } as const;
export const VARIABLE_NAME_RE = /^[A-Za-z_][\w-]*$/;
const TYPES = new Set<VariableType>(["text", "number", "date", "boolean"]);
const OPTIONAL_STRINGS = ["format", "locale", "timeZone"] as const;

function shorthand(raw: unknown): VariableDefinition | null {
  if (typeof raw === "string") return { type: "text", value: raw };
  if (typeof raw === "number" && Number.isFinite(raw)) return { type: "number", value: raw };
  if (typeof raw === "boolean") return { type: "boolean", value: raw };
  return null;
}

function valueMatchesType(type: VariableType, value: unknown): boolean {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "date") return typeof value === "string" && !Number.isNaN(Date.parse(value));
  return typeof value === "string";
}

function readDefinition(name: string, raw: unknown): VariableDefinition | string {
  const short = shorthand(raw);
  if (short) return short;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `${name}: expected a string, number, boolean or object`;
  const entry = raw as Record<string, unknown>;
  const type = (entry.type ?? "text") as VariableType;
  if (!TYPES.has(type)) return `${name}: unknown type "${String(entry.type)}"`;
  if (!valueMatchesType(type, entry.value)) return `${name}: "value" is not a valid ${type}`;
  const definition: VariableDefinition = { type, value: entry.value as VariableDefinition["value"] };
  for (const key of OPTIONAL_STRINGS) {
    if (entry[key] === undefined) continue;
    if (typeof entry[key] !== "string") return `${name}: "${key}" must be a string`;
    definition[key] = entry[key];
  }
  return zoneOrLocaleProblem(name, definition) ?? definition;
}

/** Checked here, once, so a typo in env.json is one error line, not a broken chip per use. */
function zoneOrLocaleProblem(name: string, definition: VariableDefinition): string | null {
  try {
    if (definition.locale) Intl.getCanonicalLocales(definition.locale);
  } catch {
    return `${name}: unknown locale "${definition.locale}"`;
  }
  try {
    if (definition.timeZone) new Intl.DateTimeFormat("en-US", { timeZone: definition.timeZone });
  } catch {
    return `${name}: unknown time zone "${definition.timeZone}"`;
  }
  return null;
}

function tooLong(definition: VariableDefinition): boolean {
  return typeof definition.value === "string" && definition.value.length > VARIABLE_LIMITS.valueChars;
}

/** Bad entries are skipped and reported; the good ones still load. */
export function parseVariableDefinitions(source: string): ParsedDefinitions {
  const definitions = new Map<string, VariableDefinition>();
  const errors: string[] = [];
  if (!source.trim()) return { definitions, errors };
  if (source.length > VARIABLE_LIMITS.sourceChars) return { definitions, errors: [`env.json is over ${VARIABLE_LIMITS.sourceChars} characters`] };
  let root: unknown;
  try {
    root = JSON.parse(source);
  } catch (error) {
    return { definitions, errors: [`env.json is not valid JSON: ${(error as Error).message}`] };
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return { definitions, errors: ["env.json must be an object of NAME: value"] };
  for (const [name, raw] of Object.entries(root)) {
    if (definitions.size >= VARIABLE_LIMITS.count) {
      errors.push(`only the first ${VARIABLE_LIMITS.count} variables are loaded`);
      break;
    }
    if (!VARIABLE_NAME_RE.test(name)) {
      errors.push(`"${name}": names start with a letter or _ and use letters, digits, _ or -`);
      continue;
    }
    const definition = readDefinition(name, raw);
    if (typeof definition === "string") errors.push(definition);
    else if (tooLong(definition)) errors.push(`${name}: value is over ${VARIABLE_LIMITS.valueChars} characters`);
    else definitions.set(name, definition);
  }
  return { definitions, errors };
}
