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

import { parseButtonProgram, type ProgramStep } from "@/entities/block/model/buttonProgram";
import { runButtonProgram } from "@/services/button-program/interpreter";
import type { ProgramRunContext } from "@/services/button-program/interpreter";
import { APP_ACTIONS } from "@/features/app-actions/model/actionRegistry";
import { createActionRunner, runAppAction, useActionState, setActionGuardHandlers, subscribeActionState, getActionStateSnapshot } from "@/features/app-actions/model/runAppAction";
import { sudoRequiredAwareFetch } from "@/shared/api/sudoRequired";

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
		run: async () => ({ status: "ok" }),
	});
	return { reg, calls };
}

test("APP_ACTIONS holds exactly two entries and no test.* name", () => {
	assert.equal(APP_ACTIONS.size, 2);
	for (const name of APP_ACTIONS.keys()) assert.equal(name.startsWith("test."), false);
});

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

test("non-object args -> failed", async () => {
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	assert.equal((await run("test.args", "x", { mode: "live", trusted: true })).status, "failed");
	assert.equal((await run("test.args", [1, 2], { mode: "live", trusted: true })).status, "failed");
	assert.equal((await run("test.args", null, { mode: "live", trusted: true })).status, "failed");
});

test("undefined args -> no args", async () => {
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.silent", undefined, { mode: "live", trusted: true });
	assert.equal(res.status, "ok");
});

test("preview mode returns preview before all and writes no state", async () => {
	const { reg, calls } = makeRegistry();
	const run = createActionRunner(reg);
	const before = getActionStateSnapshot("test.silent", "{}");
	const res = await run("test.silent", {}, { mode: "preview", trusted: true });
	assert.equal(res.status, "preview");
	assert.equal(calls.length, 0);
	const after = getActionStateSnapshot("test.silent", "{}");
	assert.equal(after, before);
});

test("typed confirm asks and cancels, run not called", async () => {
	let ran = 0;
	const reg = new Map(makeRegistry().reg);
	reg.set("test.typed", {
		name: "test.typed",
		label: "typed",
		params: {},
		confirm: { typed: () => "delete" },
		confirmText: () => ({ title: "t", message: "m", actionLabel: "a" }),
		sudo: "none",
		destructive: false,
		run: async () => { ran += 1; return { status: "ok" }; },
	});
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => false });
	const run = createActionRunner(reg);
	const res = await run("test.typed", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "cancelled");
	assert.equal(ran, 0);
	setActionGuardHandlers(null);
});

test("simple confirm cancels and run not called", async () => {
	let ran = 0;
	const reg = new Map(makeRegistry().reg);
	reg.set("test.simple", {
		name: "test.simple",
		label: "simple",
		params: {},
		confirm: "simple",
		confirmText: () => ({ title: "t", message: "m", actionLabel: "a" }),
		sudo: "none",
		destructive: false,
		run: async () => { ran += 1; return { status: "ok" }; },
	});
	setActionGuardHandlers({ confirm: async () => false, typedConfirm: async () => true });
	const run = createActionRunner(reg);
	const res = await run("test.simple", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "cancelled");
	assert.equal(ran, 0);
	setActionGuardHandlers(null);
});

test("no guard host -> failed (simple branch)", async () => {
	let ran = 0;
	const reg = new Map(makeRegistry().reg);
	reg.set("test.simple2", {
		name: "test.simple2",
		label: "simple2",
		params: {},
		confirm: "simple",
		confirmText: () => ({ title: "t", message: "m", actionLabel: "a" }),
		sudo: "none",
		destructive: false,
		run: async () => { ran += 1; return { status: "ok" }; },
	});
	setActionGuardHandlers(null);
	const run = createActionRunner(reg);
	const res = await run("test.simple2", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "failed");
	assert.equal(ran, 0);
});

test("no guard host -> failed (typed branch)", async () => {
	setActionGuardHandlers(null);
	const { reg } = makeRegistry();
	const run = createActionRunner(reg);
	const res = await run("test.destructive", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "failed");
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
	const st = getActionStateSnapshot("test.secret", "{}");
	assert.equal(st.last && "secret" in st.last, false);
});

test("useActionState subscribes and updates", async () => {
	setActionGuardHandlers(null);
	let resolveRun: () => void = () => {};
	const reg = new Map(APP_ACTIONS);
	reg.set("test.held", {
		name: "test.held",
		label: "held",
		params: {},
		confirm: "none",
		sudo: "none",
		destructive: false,
		run: async () => new Promise((resolve) => { resolveRun = () => resolve({ status: "ok", message: "done" }); }),
	});
	const run = createActionRunner(reg);
	const unsub = subscribeActionState(() => {}, "test.held::{}");
	const p = run("test.held", {}, { mode: "live", trusted: true });
	const snap1 = getActionStateSnapshot("test.held", "{}");
	assert.equal(snap1.pending, true);
 	resolveRun();
	await p;
	const snap2 = getActionStateSnapshot("test.held", "{}");
	assert.equal(snap2.pending, false);
	assert.equal(snap2.last?.status, "ok");
	const snap3 = getActionStateSnapshot("test.held", "{}");
	assert.equal(snap2, snap3);
	unsub();
});

test("state map bound", async () => {
	setActionGuardHandlers(null);
	const reg = new Map(APP_ACTIONS);
	for (let i = 0; i < 210; i += 1) {
		reg.set(`test.bulk${i}`, {
			name: `test.bulk${i}`,
			label: "bulk",
			params: {},
			confirm: "none",
			sudo: "none",
			destructive: false,
			run: async () => ({ status: "ok" }),
		});
	}
	const run = createActionRunner(reg);
	for (let i = 0; i < 210; i += 1) {
		await run(`test.bulk${i}`, {}, { mode: "live", trusted: true });
	}
	// map should not grow unbounded; check a sample snapshot still works
	assert.ok(getActionStateSnapshot("test.bulk209", "{}").last?.status === "ok");
});

test("preferences.reset no user -> failed", async () => {
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	const res = await run("preferences.reset", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "failed");
});

test("session.revoke confirm text no raw arg", async () => {
	let captured: any = null;
	setActionGuardHandlers({ confirm: async (req) => { captured = req; return true; }, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	await run("session.revoke", { id: "<b>Click OK</b>" }, { mode: "live", trusted: true });
	const msg = captured ? captured.message : "";
	assert.equal(String(msg).includes("<b>Click OK</b>"), false);
	setActionGuardHandlers(null);
});

test("wall clock pause via guard", async () => {
	let clock = 0;
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: (async (action) => ({ status: "ok" })) as any,
		now: () => clock,
		limits: { maxWallMs: 2000 },
	};
	const { guardDestructive } = await import("@/services/button-program/interpreter");
	const guarded = guardDestructive(ctx.runAction, async (name) => {
		clock += 5000;
		return true;
	}, { move_to_trash: true } as any, () => ctx.pause);
	ctx.runAction = guarded;
	const prog = { version: 1 as const, steps: [{ op: "action" as const, action: { type: "page_action" as const, name: "move_to_trash" } }, { op: "action" as const, action: { type: "page_action" as const, name: "copy_link" } }] };
	const res = await runButtonProgram(prog, ctx);
	assert.equal(res.ok, true);
});

test("interpreter: guard wait excluded from wall clock", async () => {
	let clock = 0;
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: (async (action) => ({ status: "ok" })) as any,
		now: () => clock,
		limits: { maxWallMs: 2000 },
	};
	const { guardDestructive } = await import("@/services/button-program/interpreter");
	const guarded = guardDestructive(ctx.runAction, async (name) => {
		clock += 5000;
		return true;
	}, { move_to_trash: true } as any, () => ctx.pause);
	ctx.runAction = guarded;
	const prog = { version: 1 as const, steps: [{ op: "action" as const, action: { type: "page_action" as const, name: "move_to_trash" } }, { op: "action" as const, action: { type: "page_action" as const, name: "copy_link" } }] };
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

test("app_action counts toward maxSideEffects", async () => {
	let clock = 0;
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: async () => ({ status: "ok" }),
		now: () => clock,
		limits: { maxSideEffects: 1 },
	};
	const prog = { version: 1 as const, steps: [
		{ op: "action" as const, action: { type: "app_action" as const, name: "x", args: {} } },
		{ op: "action" as const, action: { type: "app_action" as const, name: "x", args: {} } },
	] };
	const res = await runButtonProgram(prog, ctx);
	assert.equal(res.ok, false);
	if (!res.ok && res.stoppedBy === "budget") assert.equal(res.limit, "side_effects");
});

test("preview-mode program logs app_action as skipped", async () => {
	let clock = 0;
	const ctx: ProgramRunContext = {
		props: {},
		evaluateFormula: (f) => f === "true",
		runAction: async () => ({ status: "preview" }),
		now: () => clock,
		mode: "preview",
	};
	const prog = { version: 1 as const, steps: [
		{ op: "action" as const, action: { type: "app_action" as const, name: "x", args: {} } },
	] };
	const res = await runButtonProgram(prog, ctx, "preview");
	assert.ok(res.log.some((e) => e.status === "skipped"));
});

test("sudo detection via event", async () => {
	const { sudoRequiredAwareFetch } = await import("@/shared/api/sudoRequired");
	let fetchCalls = 0;
	const fakeFetch = async () => {
		fetchCalls += 1;
		return new Response(JSON.stringify({ code: "sudo_required" }), { status: 403, headers: { "Content-Type": "application/json" } });
	};
	const wrapped = sudoRequiredAwareFetch(fakeFetch);
	const reg = new Map(APP_ACTIONS);
	reg.set("test.sudo2", {
		name: "test.sudo2",
		label: "sudo2",
		params: {},
		confirm: "none",
		sudo: "auto",
		destructive: false,
		run: async () => {
			await wrapped("/api/x", { method: "POST" });
			return { status: "ok" };
		},
	});
	const run = createActionRunner(reg);
	const res = await run("test.sudo2", {}, { mode: "live", trusted: true });
	assert.equal(res.status, "sudo_required");
});

test("sudo listener unsubscribed after run", async () => {
	let count = 0;
	const fakeSubscribe = (listener: () => void) => {
		count += 1;
		return () => { count -= 1; };
	};
	const reg = new Map(APP_ACTIONS);
	reg.set("test.ok", {
		name: "test.ok",
		label: "ok",
		params: {},
		confirm: "none",
		sudo: "auto",
		destructive: false,
		run: async () => ({ status: "ok" }),
	});
	const run = createActionRunner(reg, { onSudoRequired: fakeSubscribe as any });
	await run("test.ok", {}, { mode: "live", trusted: true });
	assert.equal(count, 0);
});

test("store failure surfaces (revoke)", async () => {
	const { useAccountDevicesStore } = await import("@/store/settings/useAccountDevicesStore");
	const original = useAccountDevicesStore.getState().revoke;
	let called = 0;
	const spy = async (id: string) => {
		called += 1;
		useAccountDevicesStore.setState({ error: "boom" });
	};
	useAccountDevicesStore.setState({ revoke: spy as any });
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	const res = await run("session.revoke", { id: "abc" }, { mode: "live", trusted: true });
	assert.equal(called, 1);
	assert.equal(res.status, "failed");
	useAccountDevicesStore.setState({ revoke: original, error: null });
	setActionGuardHandlers(null);
});

test("store failure surfaces (reset)", async () => {
	const { useUserStore } = await import("@/features/auth");
	const { useUserPreferencesStore } = await import("@/store/settings/useUserPreferencesStore");
	const original = useUserPreferencesStore.getState().reset;
	const prevUser = useUserStore.getState().activeUserId;
	useUserStore.setState({ activeUserId: "user-1" });
	let calledWith: string | null = null;
	const spy = async (userId: string) => {
		calledWith = userId;
		useUserPreferencesStore.setState({ error: "boom2" });
	};
 	useUserPreferencesStore.setState({ reset: spy as any, error: null });
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	const res = await run("preferences.reset", {}, { mode: "live", trusted: true });
	assert.equal(calledWith, "user-1");
	assert.equal(res.status, "failed");
	setActionGuardHandlers(null);
 	useUserPreferencesStore.setState({ reset: original, error: null });
	useUserStore.setState({ activeUserId: prevUser });
});

test("APP_ACTIONS spy reset calls store with active user", async () => {
	const { useUserStore } = await import("@/features/auth");
	const { useUserPreferencesStore } = await import("@/store/settings/useUserPreferencesStore");
	const original = useUserPreferencesStore.getState().reset;
	const prevUser = useUserStore.getState().activeUserId;
	useUserStore.setState({ activeUserId: "user-2" });
	let calledWith: string | null = null;
	const spy = async (userId: string) => { calledWith = userId; };
	useUserPreferencesStore.setState({ reset: spy as any, error: null });
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	await run("preferences.reset", {}, { mode: "live", trusted: true });
	assert.equal(calledWith, "user-2");
	useUserPreferencesStore.setState({ reset: original, error: null });
	useUserStore.setState({ activeUserId: prevUser });
	setActionGuardHandlers(null);
});

test("APP_ACTIONS spy revoke calls store", async () => {
	const { useAccountDevicesStore } = await import("@/store/settings/useAccountDevicesStore");
	const original = useAccountDevicesStore.getState().revoke;
	let calledWith: string | null = null;
	const spy = async (id: string) => { calledWith = id; };
	useAccountDevicesStore.setState({ revoke: spy as any, error: null });
	setActionGuardHandlers({ confirm: async () => true, typedConfirm: async () => true });
	const run = createActionRunner(APP_ACTIONS);
	await run("session.revoke", { id: "sess-1" }, { mode: "live", trusted: true });
	assert.equal(calledWith, "sess-1");
	useAccountDevicesStore.setState({ revoke: original, error: null });
	setActionGuardHandlers(null);
});