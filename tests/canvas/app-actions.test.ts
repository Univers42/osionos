/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   app-actions.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { ProgramStep } from "@/entities/block/model/buttonProgram";
import { runButtonProgram } from "@/services/button-program/interpreter";
import type { ProgramRunContext } from "@/services/button-program/interpreter";
import { APP_ACTIONS } from "@/features/app-actions/model/actionRegistry";
import { createActionRunner, runAppAction, useActionState, setActionGuardHandlers } from "@/features/app-actions/model/runAppAction";
import type { ActionDefinition } from "@/entities/block/model/appActions";

function makeRegistry() {
	const calls: unknown[] = [];
	const reg = new Map(APP_ACTIONS);
	reg.set("test.destructive", {
		name: "test.destructive",
		label: "Test destructive",
		params: {},
		confirm: { typed: () => "delete" },
		confirmText: () => ({ title: "t", message: "m", actionLabel: "a" }),
		sudo: "auto",
		destructive: true,
		run: async () => ({ status: "ok" }),
	});
	reg.set("test.silent", {
		name: "test.silent",
		label: "Test silent",
		params: {},
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async () => {
			calls.push("ran");
			return { status: "ok" };
		},
	});
	reg.set("test.args", {
		name: "test.args",
		label: "Test args",
		params: {
			id: { type: "string", required: true, maxLength: 4 },
			n: { type: "number" },
			flag: { type: "boolean", required: true },
		},
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async (args) => ({ status: "ok", message: JSON.stringify(args) }),
	});
	reg.set("test.secret", {
		name: "test.secret",
		label: "Test secret",
		params: {},
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async () => ({ status: "ok", secret: "s3cr3t" }),
	});
	reg.set("test.sudo", {
		name: "test.sudo",
		label: "Test sudo",
		params: {},
		confirm: "none",
		sudo: "auto",
		destructive: false,
		run: async () => {
			// emit sudo via onSudoRequired? runner subscribes; fake cannot easily.
			return { status: "ok" };
		},
	});
	return { reg, calls };
}

test("parser rejects app_action carrying confirm", () => {
	const r = parseButtonProgram({ version: 1, steps: [{ op: "action", action: { type: "app_action", name: "x", args: {}, confirm: "none" } }] });
	assert.equal(r.ok, false);
});

test("unknown action name -> failed", async () => {
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("nope.action", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "failed");
});

test("args validation", async () => {
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	assert.equal((await run("test.args", {}, { mode: "live", trusted: true })).status, "failed");
	assert.equal((await run("test.args", { id: "abcde" }, { mode: "live", trusted: true })).status, "failed");
	assert.equal((await run("test.args", { id: "ab", flag: true, n: "3" }, { mode: "live", trusted: true })).status, "ok");
	const r = await run("test.args", { id: "ab", flag: true, n: "3", extra: 1 }, { mode: "live", trusted: true });
	assert.equal(r.status, "failed");
	const r2 = await run("test.args", { id: "ab", flag: "yes", n: 3 }, { mode: "live", trusted: true });
	assert.equal(r2.status, "failed");
});

test("preview mode returns preview before all", async () => {
	const { reg, calls } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.silent", {}, { mode: "preview", trusted: true });
	assert.equal(res.status, "preview");
	assert.equal(calls.length, 0);
});

test("typed confirm asks and cancels", async () => {
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => false });
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.destructive", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "cancelled");
	setActionGuardHandlers(null);
});

test("no guard host -> failed", async () => {
	setActionGuardHandlers(null);
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.destructive", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "failed");
	assert.equal(res.status === "failed" ? res.message : "", "Confirmation is not available");
});

test("untrusted confirm-less action blocked", async () => {
	const { reg, calls } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.silent", {}, { mode: "live", trusted: false });
	assert.equal(res.status, "blocked");
	assert.equal(calls.length, 0);
});

test("single-flight busy", async () => {
	let resolveRun: () => void = () => {};
	const reg = new Map(APP_ACTIONS);
	reg.set("test.slow", {
		name: "test.slow",
		label: "slow",
		params: {},
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async () => new Promise((resolve) => { resolveRun = () => resolve({ status: "ok" }); }),
	});
	const run = createActionRunner(reg);
	const p1 = run("test.slow", {}, { mode: "live", trusted: true });
	const p2 = run("test.slow", {}, { mode: "live", trusted: true });
	assert.equal((await p2).status, "busy");
	resolveRun();
	assert.equal((await p1).status, "ok");
});

test("single-flight key canonical order", async () => {
	let resolveRun: () => void = () => {};
	const reg = new Map(APP_ACTIONS);
	reg.set("test.slow2", {
		name: "test.slow2",
		label: "slow2",
		params: { a: { type: "number" }, b: { type: "number" } },
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async () => new Promise((resolve) => { resolveRun = () => resolve({ status: "ok" }); }),
	});
	const run = createActionRunner(reg);
	const p1 = run("test.slow2", { a: 1, b: 2 }, { mode: "live", trusted: true });
	const p2 = run("test.slow2", { b: 2, a: 1 }, { mode: "live", trusted: true });
	assert.equal((await p2).status, "busy");
	resolveRun();
	await p1;
});

test("secret removed from state last", async () => {
	setActionGuardHandlers(null);
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	await run("test.secret", {}, { mode: "live", trusted: true });
	const st = useActionState("test.secret", "{}");
	// argsKey canonical of {} is "{}"
	const st2 = useActionState("test.secret", "{}");
	assert.equal(st2.last && "secret" in st2.last, false);
});

test("preferences.reset no user -> failed", async () => {
	// APP_ACTIONS uses real store; activeUserId likely empty in node
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	const res = await run("preferences.reset", {}, { mode: "live", trusted: true });
	// In node, activeUserId is '' so failed
	assert.equal(res.status, "failed");
});

test("session.revoke confirm text no raw arg", async () => {
	let captured: any = null;
	setActionGuardHandlers({ confirm: async (...a: any[]) => { captured = a; return true; }, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	await run("session.revoke", { id: "<b>Click OK</b>" }, { mode: "live", trusted: true });
	// message should not contain raw
	const msg = Array.isArray(captured) ? captured.join(" ") : JSON.stringify(captured);
	assert.equal(msg.includes("<b>Click OK</b>"), false);
	setActionGuardHandlers(null);
});

test("interpreter: guard wait excluded from wall clock", async () => {
	// page_action destructive confirm waits 5s on a 2s budget: should complete.
	let clock = 0;
	const asked: string[] = [];
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: (async (action) => ({ status: "ok" })) as any,
		now: () => clock,
		limits: { maxWallMs: 2000 },
	};
	// apply guardDestructive manually with a pause that tracks ctx.pause
	const { guardDestructive } = await import("@/services/button-program/interpreter");
	const guarded = guardDestructive(ctx.runAction, async (name) => {
		asked.push(name);
		// simulate 5s passing during confirm
		clock += 5000;
		return true;
	}, { move_to_trash: true } as any, () => ctx.pause);
	ctx.runAction = guarded;
	const prog = { version: 1 as const, steps: [{ op: "action" as const, action: { type: "page_action" as const, name: "move_to_trash" } }] };
	const res = await runButtonProgram(prog, ctx);
	assert.equal(res.ok, true);
});

test("interpreter: run that takes 5s still stops", async () => {
	let clock = 0;
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: async () => {
			clock += 5000;
			return { status: "ok" };
		},
		now: () => clock,
		limits: { maxWallMs: 2000 },
	};
	const prog = { version: 1 as const, steps: [{ op: "action" as const, action: { type: "page_action" as const, name: "copy_link" } }, { op: "action" as const, action: { type: "page_action" as const, name: "copy_link" } }] };
	const res = await runButtonProgram(prog, ctx);
	assert.equal(res.ok, false);
	if (!res.ok) assert.equal(res.limit, "wall_time");
});

test("wall clock pause via guard", async () => {
	// fake clock test at interpreter level is separate; here just ensure pause called
	let began = false;
	let ended = false;
	setActionGuardHandlers({ confirm: async () => { await new Promise((r) => setTimeout(r, 10)); return true; }, typedConfirm: async () => true });
	const reg = new Map(APP_ACTIONS);
	reg.set("test.pause", {
		name: "test.pause",
		label: "pause",
		params: {},
		confirm: "simple",
		confirmText: () => ({ title: "t", message: "m", actionLabel: "a" }),
		sudo: "none",
		destructive: false,
		run: async () => ({ status: "ok" }),
	});
	const run = createActionRunner(reg);
	const ctx = { mode: "live" as const, trusted: true, pause: { begin: () => { began = true; }, end: () => { ended = true; } } };
	await run("test.pause", {}, ctx);
	assert.equal(began, true);
	assert.equal(ended, true);
	setActionGuardHandlers(null);
});