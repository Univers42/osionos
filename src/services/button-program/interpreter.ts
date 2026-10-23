/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   interpreter.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pure interpreter of a button program. The formula engine, the actions
 * and the clock are injected, so it runs under plain node with no wasm.
 *
 * Caveat: the wall-clock budget is checked between steps and at every loop
 * iteration, never inside an awaited action, so one slow write overruns it;
 * the real bound on writes is maxSideEffects.
 * Caveat: the two sentinels below mirror FORMULA_ENGINE_UNAVAILABLE and
 * FORMULA_BUDGET_EXCEEDED in the engine bridge; if the bridge renames them
 * a sentinel would be read as an ordinary string.
 */

import type { ButtonProgram, ProgramStep, ProgramValue } from "@/entities/block/model/buttonProgram";

export type PropertyMap = Record<string, unknown>;

const ENGINE_UNAVAILABLE = "#ENGINE_UNAVAILABLE";
const BUDGET_EXCEEDED = "#BUDGET_EXCEEDED";
const LOG_CAP = 200;

export interface ProgramLimits {
	maxSteps: number;
	maxIterations: number;
	maxSideEffects: number;
	maxNotifies: number;
	maxWallMs: number;
}

export const DEFAULT_LIMITS: ProgramLimits = {
	maxSteps: 10_000,
	maxIterations: 1_000,
	maxSideEffects: 50,
	maxNotifies: 50,
	maxWallMs: 2_000,
};

/** An action whose values the interpreter has already resolved. */
export type ResolvedAction =
	| { type: "notify"; message: unknown }
	| { type: "set_property"; property: string; value: unknown }
	| { type: "page_action"; name: string };

/**
 * Wrap an action runner so a destructive page action asks `confirm` first;
 * a refusal returns `cancelled` and the runner is never called. Lives here,
 * pure, so the rule is testable without the app; the dialog and the table
 * (this file value-imports nothing) are the caller's.
 */
export function guardDestructive(
	runAction: ProgramRunContext["runAction"],
	confirm: (actionName: string) => Promise<boolean>,
	destructive: Readonly<Record<string, boolean>>,
): ProgramRunContext["runAction"] {
	return async (action, scope) => {
		if (action.type === "page_action" && destructive[action.name] === true) {
			if (!(await confirm(action.name))) return { status: "cancelled", detail: "not confirmed" };
		}
		return runAction(action, scope);
	};
}

export interface ActionOutcome {
	status: "ok" | "failed" | "blocked" | "cancelled";
	detail?: string;
}

export interface ProgramRunContext {
	props: PropertyMap;
	evaluateFormula(formula: string, props: PropertyMap): unknown;
	runAction(action: ResolvedAction, scope: PropertyMap): Promise<ActionOutcome>;
	now(): number;
	limits?: Partial<ProgramLimits>;
}

export type LogStatus = "ok" | "skipped" | "failed" | "blocked" | "cancelled";
export type BudgetLimit = "steps" | "iterations" | "side_effects" | "wall_time" | "notifies";

export interface LogEntry {
	index: number;
	op: string;
	label: string;
	status: LogStatus;
	detail?: string;
}

export type ProgramRunResult =
	| { ok: true; log: LogEntry[] }
	| { ok: false; stoppedBy: "budget"; limit: BudgetLimit; unvisited?: number; log: LogEntry[] }
	| { ok: false; stoppedBy: "blocked" | "cancelled"; log: LogEntry[] };

// Explicit fields, not constructor parameter properties: the canvas runner strips types only.
class RunStop {
	readonly stoppedBy: "budget" | "blocked" | "cancelled";
	readonly limit?: BudgetLimit;
	readonly unvisited?: number;
	constructor(stoppedBy: "budget" | "blocked" | "cancelled", limit?: BudgetLimit, unvisited?: number) {
		this.stoppedBy = stoppedBy;
		this.limit = limit;
		this.unvisited = unvisited;
	}
}

class Run {
	readonly limits: ProgramLimits;
	readonly log: LogEntry[] = [];
	private readonly vars = new Map<string, unknown>();
	private readonly loopCounts = new Map<ProgramStep, number>();
	private readonly startedAt: number;
	private readonly ctx: ProgramRunContext;
	private steps = 0;
	private sideEffects = 0;
	private notifies = 0;
	private logged = 0;

	constructor(ctx: ProgramRunContext) {
		this.ctx = ctx;
		this.limits = { ...DEFAULT_LIMITS, ...ctx.limits };
		this.startedAt = ctx.now();
	}

	private record(op: string, label: string, status: LogStatus, detail?: string): void {
		this.logged += 1;
		const entry: LogEntry = { index: this.logged, op, label, status, ...(detail ? { detail } : {}) };
		if (this.log.length < LOG_CAP) {
			this.log.push(entry);
			return;
		}
		this.log[LOG_CAP - 1] = { ...entry, op: "log", label: "Log truncated", status: "skipped", detail: "truncated" };
	}

	private checkWall(): void {
		if (this.ctx.now() - this.startedAt > this.limits.maxWallMs) this.stop("wall_time");
	}

	private stop(limit: BudgetLimit, unvisited?: number): never {
		this.record("budget", `Stopped: ${limit}`, "failed", limit);
		throw new RunStop("budget", limit, unvisited);
	}

	private scope(): PropertyMap {
		return { ...this.ctx.props, ...Object.fromEntries(this.vars) };
	}

	private evaluate(value: ProgramValue): { value: unknown } | { sentinel: string } {
		if (typeof value !== "object" || value === null) return { value };
		let result: unknown;
		try {
			result = this.ctx.evaluateFormula(value.formula, this.scope());
		} catch {
			result = ENGINE_UNAVAILABLE;
		}
		if (result === ENGINE_UNAVAILABLE) return { sentinel: "formula_unavailable" };
		if (result === BUDGET_EXCEEDED) return { sentinel: "formula_budget_exceeded" };
		return { value: result };
	}

	private isTrue(value: ProgramValue): { truthy: boolean; sentinel?: string } {
		const result = this.evaluate(value);
		if ("sentinel" in result) return { truthy: false, sentinel: result.sentinel };
		return { truthy: !(result.value === false || result.value === 0 || result.value === "" || result.value === null) };
	}

	private tickLoop(site: ProgramStep, remaining: number): void {
		this.checkWall();
		const count = (this.loopCounts.get(site) ?? 0) + 1;
		this.loopCounts.set(site, count);
		if (count > this.limits.maxIterations) this.stop("iterations", remaining);
	}

	async runSteps(steps: ProgramStep[]): Promise<void> {
		for (const step of steps) await this.runStep(step);
	}

	private async runStep(step: ProgramStep): Promise<void> {
		this.checkWall();
		this.steps += 1;
		if (this.steps > this.limits.maxSteps) this.stop("steps");
		switch (step.op) {
			case "set":
				return this.runSet(step);
			case "if":
				return this.runIf(step);
			case "repeat":
				return this.runRepeat(step);
			case "forEach":
				return this.runForEach(step);
			case "action":
				return this.runActionStep(step.action);
		}
	}

	private runSet(step: Extract<ProgramStep, { op: "set" }>): void {
		const label = `Set \`${step.name}\``;
		const result = this.evaluate(step.value);
		if ("sentinel" in result) return this.record("set", label, "failed", result.sentinel);
		this.vars.set(step.name, result.value);
		this.record("set", label, "ok");
	}

	private async runIf(step: Extract<ProgramStep, { op: "if" }>): Promise<void> {
		const { truthy, sentinel } = this.isTrue(step.condition);
		this.record("if", "If", sentinel ? "failed" : "ok", sentinel ?? (truthy ? "then" : "else"));
		await this.runSteps(truthy ? step.then : (step.else ?? []));
	}

	private async runRepeat(step: Extract<ProgramStep, { op: "repeat" }>): Promise<void> {
		const result = this.evaluate(step.count);
		if ("sentinel" in result) return this.record("repeat", "Repeat", "failed", result.sentinel);
		if (typeof result.value !== "number" || !(result.value >= 0)) {
			return this.record("repeat", "Repeat", "failed", "count is not a number");
		}
		const count = Math.floor(result.value);
		this.record("repeat", `Repeat ×${count}`, "ok");
		for (let i = 0; i < count; i += 1) {
			this.tickLoop(step, count - i);
			await this.runSteps(step.steps);
		}
	}

	private async runForEach(step: Extract<ProgramStep, { op: "forEach" }>): Promise<void> {
		const label = `For each \`${step.as}\``;
		const result = this.evaluate(step.items);
		if ("sentinel" in result) return this.record("forEach", label, "failed", result.sentinel);
		if (!Array.isArray(result.value)) return this.record("forEach", label, "skipped", "not a list");
		const items: unknown[] = result.value;
		this.record("forEach", label, "ok");
		const had = this.vars.has(step.as);
		const previous = this.vars.get(step.as);
		try {
			for (let i = 0; i < items.length; i += 1) {
				this.tickLoop(step, items.length - i);
				this.vars.set(step.as, items[i]);
				await this.runSteps(step.steps);
			}
		} finally {
			if (had) this.vars.set(step.as, previous);
			else this.vars.delete(step.as);
		}
	}

	private async runActionStep(action: Extract<ProgramStep, { op: "action" }>["action"]): Promise<void> {
		const isWrite = action.type !== "notify";
		const label = labelOf(action);
		const resolved = this.resolveAction(action);
		if ("sentinel" in resolved) return this.record("action", label, "failed", resolved.sentinel);
		if (isWrite) {
			if (this.sideEffects + 1 > this.limits.maxSideEffects) this.stop("side_effects");
			this.sideEffects += 1;
		} else {
			if (this.notifies + 1 > this.limits.maxNotifies) this.stop("notifies");
			this.notifies += 1;
		}
		const outcome = await this.ctx.runAction(resolved.action, this.scope());
		this.record("action", label, outcome.status, outcome.detail);
		if (outcome.status === "blocked" || outcome.status === "cancelled") throw new RunStop(outcome.status);
	}

	private resolveAction(action: Extract<ProgramStep, { op: "action" }>["action"]): { action: ResolvedAction } | { sentinel: string } {
		if (action.type === "page_action") return { action };
		const result = this.evaluate(action.type === "notify" ? action.message : action.value);
		if ("sentinel" in result) return result;
		return {
			action:
				action.type === "notify"
					? { type: "notify", message: result.value }
					: { type: "set_property", property: action.property, value: result.value },
		};
	}
}

function labelOf(action: Extract<ProgramStep, { op: "action" }>["action"]): string {
	if (action.type === "set_property") return `Set property \`${action.property}\``;
	return action.type === "page_action" ? `Page action \`${action.name}\`` : "Notify";
}

export async function runButtonProgram(program: ButtonProgram, ctx: ProgramRunContext): Promise<ProgramRunResult> {
	const run = new Run(ctx);
	try {
		await run.runSteps(program.steps);
		return { ok: true, log: run.log };
	} catch (error) {
		if (!(error instanceof RunStop)) throw error;
		if (error.stoppedBy === "budget") {
			const limit = error.limit as BudgetLimit;
			return { ok: false, stoppedBy: "budget", limit, ...(error.unvisited === undefined ? {} : { unvisited: error.unvisited }), log: run.log };
		}
		return { ok: false, stoppedBy: error.stoppedBy, log: run.log };
	}
}
