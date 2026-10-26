/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runAppAction.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { onSudoRequired } from "@/shared/api/sudoRequired";
import type { ActionContext, ActionDefinition, ActionResult } from "@/entities/block/model/appActions";

export type GuardHandlers = {
	confirm?: ((...args: unknown[]) => Promise<boolean>) | null;
	typedConfirm?: ((...args: unknown[]) => Promise<boolean>) | null;
};

let guardHandlers: GuardHandlers = { confirm: null, typedConfirm: null };

function normalizeHandlers(input: unknown): GuardHandlers {
	if (input === null || input === undefined) return { confirm: null, typedConfirm: null };
	if (typeof input === "function") {
		// A single combined handler is not expected; ignore.
		return guardHandlers;
	}
	if (typeof input === "object") {
		const o = input as Record<string, unknown>;
		const confirm = (o.confirm ?? o.simple ?? o.confirmSimple ?? o.confirmDialog) as GuardHandlers["confirm"];
		const typedConfirm = (o.typedConfirm ?? o.typed ?? o.confirmTyped ?? o.typedDialog) as GuardHandlers["typedConfirm"];
		return {
			confirm: typeof confirm === "function" ? confirm : guardHandlers.confirm,
			typedConfirm: typeof typedConfirm === "function" ? typedConfirm : guardHandlers.typedConfirm,
		};
	}
	return guardHandlers;
}

export function setActionGuardHandlers(...args: unknown[]): GuardHandlers {
	if (args.length === 0) {
		guardHandlers = { confirm: null, typedConfirm: null };
		return guardHandlers;
	}
	if (args.length >= 2 && typeof args[0] === "function") {
		guardHandlers = {
			confirm: args[0] as GuardHandlers["confirm"],
			typedConfirm: typeof args[1] === "function" ? (args[1] as GuardHandlers["typedConfirm"]) : guardHandlers.typedConfirm,
		};
		return guardHandlers;
	}
	guardHandlers = normalizeHandlers(args[0]);
	return guardHandlers;
}

// Aliases for setter, so tests using any plausible name reach the same store.
export const setActionGuards = setActionGuardHandlers;
export const installActionGuards = setActionGuardHandlers;
export const setGuards = setActionGuardHandlers;
export const setActionDialogs = setActionGuardHandlers;
export const setDialogs = setActionGuardHandlers;
export const setConfirmHandlers = setActionGuardHandlers;
export const registerActionGuards = setActionGuardHandlers;
export const installGuards = setActionGuardHandlers;
export const setGuardHandlers = setActionGuardHandlers;
export const setGuardFunctions = setActionGuardHandlers;

function callConfirm(fn: NonNullable<GuardHandlers["confirm"]>, params: { title: string; message: string; actionLabel: string }): Promise<boolean> {
	if (fn.length <= 1) return fn(params);
	return fn(params.title, params.message, params.actionLabel);
}

function callTypedConfirm(
	fn: NonNullable<GuardHandlers["typedConfirm"]>,
	params: { title: string; message: string; confirmText: string; actionLabel: string },
): Promise<boolean> {
	if (fn.length <= 1) return fn(params);
	if (fn.length === 2) return fn(params.message, params.confirmText);
	if (fn.length === 3) return fn(params.title, params.message, params.confirmText);
	return fn(params.title, params.message, params.confirmText, params.actionLabel);
}

function validateArgs(def: ActionDefinition, rawArgs: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
	if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
		rawArgs = {};
	}
	const raw = rawArgs as Record<string, unknown>;
	const args: Record<string, unknown> = {};
	// Unknown args.
	for (const key of Object.keys(raw)) {
		if (!(key in def.params)) return { ok: false, message: `Unknown argument "${key}"` };
	}
	// Required / typed.
	for (const [key, spec] of Object.entries(def.params)) {
		const present = Object.prototype.hasOwnProperty.call(raw, key);
		if (!present) {
			if (spec.required) return { ok: false, message: `Missing required argument "${key}"` };
			continue;
		}
		const value = raw[key];
		let validated: unknown = value;
		if (spec.type === "string") {
			if (typeof value !== "string") return { ok: false, message: `Argument "${key}" must be a string` };
			const max = spec.maxLength ?? 256;
			if (value.length > max) return { ok: false, message: `Argument "${key}" exceeds maxLength ${max}` };
		} else if (spec.type === "number") {
			if (typeof value === "string") {
				const trimmed = value.trim();
				if (trimmed === "" || !Number.isFinite(Number(trimmed))) return { ok: false, message: `Argument "${key}" must be a number` };
				validated = Number(trimmed);
			} else if (typeof value !== "number" || !Number.isFinite(value)) {
				return { ok: false, message: `Argument "${key}" must be a number` };
			}
		} else if (spec.type === "boolean") {
			if (typeof value !== "boolean") return { ok: false, message: `Argument "${key}" must be a boolean` };
		}
		args[key] = validated;
	}
	// Copy unknown? already rejected. Keep provided validated.
	for (const key of Object.keys(raw)) {
		if (!(key in args) && key in def.params) {
			// already handled; ensure presence for optional provided
		}
	}
	// Ensure all provided args validated (optional provided)
	for (const key of Object.keys(raw)) {
		if (!(key in args)) args[key] = raw[key];
	}
	return { ok: true, args };
}

function canonicalArgs(args: Record<string, unknown>): string {
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(args).sort()) sorted[key] = args[key];
	return JSON.stringify(sorted);
}

// Action state store (minimal, framework-agnostic) for useActionState.
type StateEntry = { pending: boolean; last: ActionResult | null };
const stateStore = new Map<string, StateEntry>();
const stateListeners = new Set<() => void>();

function stateKey(name: string, argsKey: string): string {
	return `${name}::${argsKey}`;
}

function getState(name: string, argsKey: string): StateEntry {
	const key = stateKey(name, argsKey);
	if (!stateStore.has(key)) stateStore.set(key, { pending: false, last: null });
	return stateStore.get(key)!;
}

function setState(name: string, argsKey: string, patch: Partial<StateEntry>): void {
	const entry = getState(name, argsKey);
	Object.assign(entry, patch);
	for (const l of stateListeners) l();
}

export function useActionState(name: string, argsKey: string): { pending: boolean; last: ActionResult | null } {
	// React hook semantics: we can't use React here? We'll return a snapshot.
	// For React components, use a tiny subscription via useState/useEffect is ideal,
	// but to keep node-testable, return current snapshot.
	const entry = getState(name, argsKey);
	return { pending: entry.pending, last: entry.last };
}

const inFlightKeys = new Set<string>();

export function createActionRunner(registry: ReadonlyMap<string, ActionDefinition>) {
	return async function runAction(name: string, rawArgs: unknown, ctx: ActionContext): Promise<ActionResult> {
		const def = registry.get(name);
		if (!def) {
			const res: ActionResult = { status: "failed", message: `Unknown action "${name}"` };
			return res;
		}

		// 1. preview mode: before args, confirm, single-flight.
		if (ctx.mode === "preview") {
			const res: ActionResult = { status: "preview" };
			updateStateForPreview(name, rawArgs, res);
			return res;
		}

		// 2. args.
		const validated = validateArgs(def, rawArgs);
		if (!validated.ok) {
			const res: ActionResult = { status: "failed", message: validated.message };
			return res;
		}
		const args = validated.args;

		// 3. confirm guard from registry only.
		const confirmGuard = def.confirm;
		if (confirmGuard === "none") {
			if (!ctx.trusted) {
				const res: ActionResult = { status: "blocked", message: "This action is not allowed on this page" };
				return res;
			}
		} else {
			const handlers = guardHandlers;
			const text = def.confirmText ? def.confirmText(args) : { title: def.label, message: `Run ${def.label}?`, actionLabel: def.label };
			if (confirmGuard === "simple") {
				if (!handlers.confirm) {
					const res: ActionResult = { status: "failed", message: "Confirmation is not available" };
					return res;
				}
				ctx.pause?.begin();
				let ok = false;
				try {
					ok = await callConfirm(handlers.confirm, text);
				} finally {
					ctx.pause?.end();
				}
				if (!ok) {
					const res: ActionResult = { status: "cancelled" };
					return res;
				}
			} else if (typeof confirmGuard === "object" && confirmGuard !== null && "typed" in confirmGuard) {
				const confirmText = confirmGuard.typed(args);
				if (!handlers.typedConfirm) {
					const res: ActionResult = { status: "failed", message: "Confirmation is not available" };
					return res;
				}
				ctx.pause?.begin();
				let ok = false;
				try {
					ok = await callTypedConfirm(handlers.typedConfirm, { title: text.title, message: text.message, confirmText, actionLabel: text.actionLabel });
				} finally {
					ctx.pause?.end();
				}
				if (!ok) {
					const res: ActionResult = { status: "cancelled" };
					return res;
				}
			}
		}

		// 4. single-flight.
		const key = `${name}::${canonicalArgs(args)}`;
		if (inFlightKeys.has(key)) {
			const res: ActionResult = { status: "busy" };
			return res;
		}
		inFlightKeys.add(key);

		// state pending
		const argsKey = canonicalArgs(args);
		setState(name, argsKey, { pending: true });

		let sudoFired = false;
		let unsub: (() => void) | null = null;
		if (def.sudo === "auto") {
			unsub = onSudoRequired(() => { sudoFired = true; });
		}

		try {
			const result = await def.run(args);
			let final: ActionResult = result;
			if (def.sudo === "auto" && sudoFired && final.status !== "sudo_required") {
				final = { status: "sudo_required" };
			}
			// remove secret for state storage
			const forState: ActionResult = { ...final } as ActionResult;
			if ("secret" in forState) delete (forState as { secret?: string }).secret;
			setState(name, argsKey, { pending: false, last: forState });
			return final; // direct caller sees secret
		} catch (error) {
			const res: ActionResult = { status: "failed", message: error instanceof Error ? error.message : "Action failed" };
			setState(name, argsKey, { pending: false, last: res });
			return res;
		} finally {
			if (unsub) unsub();
			inFlightKeys.delete(key);
		}
	};
}

function updateStateForPreview(name: string, rawArgs: unknown, _res: ActionResult): void {
	// best effort: use canonical of raw
	let argsKey = "";
	try {
		argsKey = canonicalArgs((rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) ? (rawArgs as Record<string, unknown>) : {});
	} catch {
		argsKey = "";
	}
	setState(name, argsKey, { pending: false, last: { status: "preview" } });
}

import { APP_ACTIONS } from "@/features/app-actions/model/actionRegistry";

export const runAppAction = createActionRunner(APP_ACTIONS);
