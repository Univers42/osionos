/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   check-catalogue-chunks.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Caveat: the manifest lists chunks, not modules: a catalogue module merged INTO a shared
// static chunk has no key of its own and is caught only as a missing key (index.ts) — a merged
// <slug> module is invisible to this check until Task 9 asserts every slug has a key.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PREFIX = "src/data/templates/catalogue/";
const INDEX = `${PREFIX}index.ts`;
const TPL_ID = `${PREFIX}tplId.ts`;

function catalogueKeys(manifest) {
  return Object.keys(manifest).filter((key) => key.startsWith(PREFIX) && key !== TPL_ID);
}

function addStaticClosure(manifest, key, files, visited) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) return;
  if (typeof chunk.file === "string") files.add(chunk.file);
  for (const imported of chunk.imports ?? []) addStaticClosure(manifest, imported, files, visited);
}

function staticEntryFiles(manifest) {
  const files = new Set();
  const visited = new Set();
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk?.isEntry) addStaticClosure(manifest, key, files, visited);
  }
  return files;
}

export function catalogueLeaks(manifest) {
  const keys = catalogueKeys(manifest);
  if (keys.length === 0) return ["LEAK no catalogue chunks (vacuous check)"];
  const leaks = [];
  if (manifest[INDEX]?.isDynamicEntry !== true) leaks.push(`LEAK ${INDEX} is not a dynamic entry`);
  const files = staticEntryFiles(manifest);
  for (const key of keys) {
    const file = manifest[key]?.file;
    if (typeof file === "string" && files.has(file)) leaks.push(`LEAK ${key} -> ${file}`);
  }
  return leaks;
}

function report(manifest, leaks) {
  const keys = catalogueKeys(manifest);
  for (const key of keys) {
    const own = leaks.filter((line) => line.startsWith(`LEAK ${key}`));
    if (own.length === 0) console.log(`ok ${key} -> ${manifest[key].file}`);
    else for (const line of own) console.log(line);
  }
  for (const line of leaks) {
    if (!keys.some((key) => line.startsWith(`LEAK ${key}`))) console.log(line);
  }
}

function runCli(path) {
  let manifest;
  try {
    if (!path) throw new Error("missing path");
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error("no readable manifest");
    return 2;
  }
  const leaks = catalogueLeaks(manifest);
  report(manifest, leaks);
  return leaks.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv[2]);
}
