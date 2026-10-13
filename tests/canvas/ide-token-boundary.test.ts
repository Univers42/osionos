/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token-boundary.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const IDE_ROOT = new URL("../../src/features/ide/", import.meta.url).pathname;

// Ponytail: a text search. An app token handed in through another module's helper
// (a re-export, an aliased import, a value passed as a parameter) is invisible here;
// this only catches the literal name, so review any new import from the api client.
const ALLOWED: Readonly<Record<string, string>> = {
  "api/ideToken.ts": "mints the IDE token, so it must present the app token to the main bridge",
  "model/useCodeRunner.ts": "POST /api/ide/run on API_BASE, which stays on the app token",
  "model/formatCode.ts": "POST /api/ide/format on API_BASE, which stays on the app token",
  "model/pageStoreFacade.ts": "page store fetchPageContent(id, jwt): bridge page API, not an IDE route",
  "model/inboundLive.ts": "pageStore restorePage(pageId, workspaceId, jwt): bridge page API, not an IDE route",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("only the allowlisted files under features/ide reference getActivePageJwt", () => {
  const offenders = sourceFiles(IDE_ROOT)
    .map((file) => relative(IDE_ROOT, file))
    .filter((rel) => !(rel in ALLOWED))
    .filter((rel) => readFileSync(join(IDE_ROOT, rel), "utf8").includes("getActivePageJwt"));
  assert.deepEqual(offenders, []);
});

test("every allowlist entry still exists and still uses the app token", () => {
  for (const rel of Object.keys(ALLOWED)) {
    assert.ok(readFileSync(join(IDE_ROOT, rel), "utf8").includes("getActivePageJwt"), `${rel} no longer needs its entry`);
  }
});
