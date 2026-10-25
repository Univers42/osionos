/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   built-with-blocks-check.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const GUARD = join(import.meta.dirname, "../../scripts/check-built-with-blocks.sh");

test("equal counts pass", () => {
	const dir = mkdtempSync(join(tmpdir(), "bb-"));
	const ratchet = join(dir, "ratchet.json");
	try {
		writeFileSync(join(dir, "a.tsx"), '<button>x</button>\n<div className="bg-[var(--osio-bg-page)]" />\n');
		writeFileSync(ratchet, JSON.stringify({ rawButton: 1, rawInput: 0, rawSelect: 0, rawTextarea: 0, rawTable: 0, tokenClass: 1 }));
		const run = spawnSync("bash", [GUARD, dir, ratchet], { encoding: "utf8" });
		assert.equal(run.status, 0, run.stderr + run.stdout);
		assert.match(run.stdout, /✓ built-with-blocks/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("one extra raw button fails", () => {
	const dir = mkdtempSync(join(tmpdir(), "bb-"));
	const ratchet = join(dir, "ratchet.json");
	try {
		writeFileSync(join(dir, "a.tsx"), '<button>x</button>\n<button>y</button>\n<div className="bg-[var(--osio-bg-page)]" />\n');
		writeFileSync(ratchet, JSON.stringify({ rawButton: 1, rawInput: 0, rawSelect: 0, rawTextarea: 0, rawTable: 0, tokenClass: 1 }));
		const run = spawnSync("bash", [GUARD, dir, ratchet], { encoding: "utf8" });
		assert.equal(run.status, 1);
		assert.match(run.stdout, /rawButton: 2 > 1/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("one fewer token class asks to lower the ratchet", () => {
	const dir = mkdtempSync(join(tmpdir(), "bb-"));
	const ratchet = join(dir, "ratchet.json");
	try {
		writeFileSync(join(dir, "a.tsx"), "// nothing raw here\n");
		writeFileSync(ratchet, JSON.stringify({ rawButton: 0, rawInput: 0, rawSelect: 0, rawTextarea: 0, rawTable: 0, tokenClass: 1 }));
		const run = spawnSync("bash", [GUARD, dir, ratchet], { encoding: "utf8" });
		assert.equal(run.status, 1);
		assert.match(run.stdout, /tokenClass: 0 < 1 — lower the ratchet/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
test("a missing directory names itself and exits 1", () => {
	const dir = join(tmpdir(), "bb-missing-" + String(Date.now()));
	const ratchet = join(tmpdir(), "bb-ratchet-" + String(Date.now()) + ".json");
	writeFileSync(ratchet, JSON.stringify({ rawButton: 0, rawInput: 0, rawSelect: 0, rawTextarea: 0, rawTable: 0, tokenClass: 0 }));
	try {
		const run = spawnSync("bash", [GUARD, dir, ratchet], { encoding: "utf8" });
		assert.equal(run.status, 1);
		assert.match(run.stderr, /no such directory/);
	} finally {
		rmSync(ratchet, { force: true });
	}
});
