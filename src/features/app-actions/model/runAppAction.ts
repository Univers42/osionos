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

import React from "react";
import { useSyncExternalStore } from "react";

import { onSudoRequired } from "@/shared/api/sudoRequired";
import type { ActionContext, ActionDefinition, ActionResult } from "@/entities/block/model/appActions";

export interface ConfirmRequest {
	title: string;
	message: string;
	actionLabel: string;
}

export interface TypedConfirmRequest extends ConfirmRequest {
	confirmText: string;
}

export type GuardHandlers = {
	confirm: ((req: ConfirmRequest) => Promise<boolean>) | null;
	typedConfirm: ((req: TypedConfirmRequest) => Promise<boolean>) | null;
};

let guardHandlers: GuardHandlers = { confirm: null, typedConfirm: null };

export function setActionGuardHandlers(
	handlers: { confirm: (req: ConfirmRequest) => Promise<boolean>; typedConfirm: (req: TypedConfirmRequest) => Promise<boolean> } | null,
): GuardHandlers {
	guardHandlers = handlers ? { confirm: handlers.confirm, typedConfirm: handlers.typedConfirm } : { confirm: null, typedConfirm: null };
	return guardHandlers;
}

function callConfirm(fn: NonNullable<GuardHandlers["confirm"]>, req: ConfirmRequest): Promise<boolean> {
	return fn(req);
}

function callTypedConfirm(fn: NonNullable<GuardHandlers["typedConfirm"]>, req: TypedConfirmRequest): Promise<boolean> {
	return fn(req);
}

function validateArgs(def: ActionDefinition, rawArgs: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
	if (rawArgs === undefined) rawArgs = {};
	if (rawArgs === null) {
		const hasRequired = Object.values(def.params).some((spec) => spec.required);
		if (hasRequired) return { ok: false, message: "Arguments must be an object" };
		rawArgs = {};
	}
	if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) return { ok: false, message: "Arguments must be an object" };
	const raw = rawArgs as Record<string, unknown>;
	const args: Record<string, unknown> = {};
	for (const key of Object.keys(raw)) {
		if (!(key in def.params)) return { ok: false, message: `Unknown argument "${key}"` };
	}
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

type StateEntry = { pending: boolean; last: ActionResult | null };

const stateStore = new Map<string, StateEntry>();
const defaultSnapshots = new Map<string, StateEntry>();
const stateListeners = new Set<() => void>();
const keySubscribers = new Map<string, Set<() => void>>();

function stateKey(name: string, argsKey: string): string {
	return `${name}::${argsKey}`;
}

function defaultSnapshot(key: string): StateEntry {
	if (!defaultSnapshots.has(key)) defaultSnapshots.set(key, { pending: false, last: null });
	return defaultSnapshots.get(key)!;
}

export function getActionStateSnapshot(name: string, argsKey: string): StateEntry {
	const key = stateKey(name, argsKey);
	return stateStore.get(key) ?? defaultSnapshot(key);
}

export function subscribeActionState(listener: () => void, key?: string): () => void {
	stateListeners.add(listener);
	if (key) {
		if (!keySubscribers.has(key)) keySubscribers.set(key, new Set());
		keySubscribers.get(key)!.add(listener);
	}
	return () => {
		stateListeners.delete(listener);
		if (key) {
			keySubscribers.get(key)?.delete(listener);
			const entry = stateStore.get(key);
			if (entry && !entry.pending && (keySubscribers.get(key)?.size ?? 0) === 0) {
				stateStore.delete(key);
				defaultSnapshots.delete(key);
			}
		}
	};
}

function notifyStateListeners(): void {
	for (const listener of [...stateListeners]) listener();
}

function trimStateStore(): void {
	// Caveat: a burst of distinct actions evicts older settled state, so useActionState
	// may report its initial value for an action that ran earlier but has no subscriber.
	if (stateStore.size <= 200) return;
	for (const [key, entry] of stateStore) {
		if (!entry.pending && (keySubscribers.get(key)?.size ?? 0) === 0) {
			stateStore.delete(key);
			defaultSnapshots.delete(key);
			if (stateStore.size <= 200) return;
		}
	}
	for (const [key, entry] of stateStore) {
		if (!entry.pending) {
			stateStore.delete(key);
			defaultSnapshots.delete(key);
			if (stateStore.size <= 200) return;
		}
	}
}

function setState(name: string, argsKey: string, patch: Partial<StateEntry>): void {
	const key = stateKey(name, argsKey);
	const previous = stateStore.get(key) ?? defaultSnapshot(key);
	const next: StateEntry = { ...previous, ...patch };
	stateStore.set(key, next);
	defaultSnapshots.set(key, next);
	trimStateStore();
	notifyStateListeners();
}

export function useActionState(name: string, argsKey: string): { pending: boolean; last: ActionResult | null } {
	const key = stateKey(name, argsKey);
	const subscribe = React.useCallback((listener: () => void) => subscribeActionState(listener, key), [key]);
	const getSnapshot = React.useCallback(() => getActionStateSnapshot(name, argsKey), [name, argsKey]);
	try {
		return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	} catch {
		return getSnapshot();
	}
}

const inFlightKeys = new Set<string>();

export function createActionRunner(
	registry: ReadonlyMap<string, ActionDefinition>,
	deps?: { onSudoRequired?: typeof onSudoRequired },
) {
	const sudoSubscribe = deps?.onSudoRequired ?? onSudoRequired;
	return async function runAction(name: string, rawArgs: unknown, ctx: ActionContext): Promise<ActionResult> {
		const def = registry.get(name);
		if (!def) {
			return { status: "failed", message: `Unknown action "${name}"` };
		}

		if (ctx.mode === "preview") {
			return { status: "preview" };
		}

		const validated = validateArgs(def, rawArgs);
		if (!validated.ok) {
			return { status: "failed", message: validated.message };
		}
		const args = validated.args;

		const confirmGuard = def.confirm;
		if (confirmGuard === "none") {
			if (!ctx.trusted) {
				return { status: "blocked", message: "This action is not allowed on this page" };
			}
		} else {
			const handlers = guardHandlers;
			const text = def.confirmText ? def.confirmText(args) : { title: def.label, message: `Run ${def.label}?`, actionLabel: def.label };
			if (confirmGuard === "simple") {
				if (!handlers.confirm) {
					return { status: "failed", message: "Confirmation is not available" };
				}
				ctx.pause?.begin();
				let ok = false;
				try {
					ok = await callConfirm(handlers.confirm, text);
				} finally {
					ctx.pause?.end();
				}
				if (!ok) {
					return { status: "cancelled" };
				}
			} else if (typeof confirmGuard === "object" && confirmGuard !== null && "typed" in confirmGuard) {
				const confirmText = confirmGuard.typed(args);
				if (!handlers.typedConfirm) {
					return { status: "failed", message: "Confirmation is not available" };
				}
				ctx.pause?.begin();
				let ok = false;
				try {
					ok = await callTypedConfirm(handlers.typedConfirm, { title: text.title, message: text.message, confirmText, actionLabel: text.actionLabel });
				} finally {
					ctx.pause?.end();
				}
				if (!ok) {
					return { status: "cancelled" };
				}
			}
		}

		const key = `${name}::${canonicalArgs(args)}`;
		if (inFlightKeys.has(key)) {
			return { status: "busy" };
		}
		inFlightKeys.add(key);

		const argsKey = canonicalArgs(args);
		setState(name, argsKey, { pending: true });

		let sudoFired = false;
		let unsub: (() => void) | null = null;
		if (def.sudo === "auto") {
			// Caveat: a sudo refusal from an unrelated request that lands while run is pending
			// is attributed to this action.
			unsub = sudoSubscribe(() => { sudoFired = true; });
		}

		try {
			const result = await def.run(args);
			let final: ActionResult = result;
			if (def.sudo === "auto" && sudoFired && final.status !== "sudo_required") {
				final = { status: "sudo_required" };
			}
			const forState: ActionResult = { ...final };
			if ("secret" in forState) delete (forState as { secret?: string }).secret;
			setState(name, argsKey, { pending: false, last: forState });
			return final;
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

import { APP_ACTIONS } from "@/features/app-actions/model/actionRegistry";

export const runAppAction = createActionRunner(APP_ACTIONS);
