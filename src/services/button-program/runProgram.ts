/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runProgram.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The app wiring of a button program: the Rust formula engine for formulas,
 * toasts for notify, and the house page write path (publishPage, with the
 * clicker's own page JWT) for set_property. The pure interpreter decides what
 * to attempt; the bridge decides what is allowed.
 *
 * Caveat: the formula context is the host page's properties as they were when
 * the click started, so a formula does not see a property an earlier step of
 * the same run wrote; use a `set` variable to carry a value between steps.
 */

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { ConfirmDialog } from "@osionos/ui/molecules/ConfirmDialog";

import { findBlockInTree, type Block } from "@/entities/block";
import { DESTRUCTIVE_PAGE_ACTIONS, parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";
import { runProgramPageAction } from "@/entities/page/model/usePageActions";
import { useUserStore } from "@/features/auth";
import { usePageConfigStore } from "@/shared/config/pageConfigStore";
import { useToastStore } from "@/shared/ui";
import { publishPage } from "@/store/sync/pageOutbox";
import { usePageStore } from "@/store/usePageStore";

import {
	guardDestructive,
	runButtonProgram,
	type ActionOutcome,
	type PropertyMap,
	type ProgramRunResult,
	type ResolvedAction,
} from "./interpreter";

export interface LastRun {
	blockId: string;
	pageId: string;
	result: ProgramRunResult;
}

type PropertyValue = PagePropertyEntry["value"];

let inFlight = false;
let engineReady: Promise<typeof import("@/shared/notion-database-sys/src/lib/engine/bridge")> | null = null;
let lastRun: LastRun | null = null;
const listeners = new Set<() => void>();

/** The last-run holder a later popover reads; in memory only, a reload loses it. */
export const getLastRun = (): LastRun | null => lastRun;
export function subscribeLastRun(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

const toast = (kind: "info" | "error", title: string): void => {
	useToastStore.getState().push({ kind, title });
};

function loadEngine() {
	engineReady ??= import("@/shared/notion-database-sys/src/lib/engine/bridge").then(async (bridge) => {
		await bridge.initFormulaEngine();
		return bridge;
	});
	return engineReady;
}

function findHostPageId(blockId: string): string | null {
	for (const pages of Object.values(usePageStore.getState().pages)) {
		for (const page of pages) {
			if (page.content && findBlockInTree(page.content, blockId)) return page._id;
		}
	}
	return null;
}

function propsOf(page: PageEntry): PropertyMap {
	return Object.fromEntries((page.properties ?? []).map((entry) => [entry.key, entry.value]));
}

function toPropertyValue(value: unknown): PropertyValue | undefined {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
	return undefined;
}

function inferType(value: PropertyValue): PagePropertyEntry["type"] {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "checkbox";
	return Array.isArray(value) ? "multi_select" : "text";
}

/** Replace one key, or create it; every other entry is carried over untouched. */
function mergeProperty(entries: readonly PagePropertyEntry[], key: string, value: PropertyValue): PagePropertyEntry[] {
	if (!entries.some((entry) => entry.key === key)) {
		return [...entries, { key, label: key, type: inferType(value), value }];
	}
	return entries.map((entry) => (entry.key === key ? { ...entry, value } : entry));
}

async function writeProperty(pageId: string, property: string, raw: unknown): Promise<ActionOutcome> {
	const value = toPropertyValue(raw);
	if (value === undefined) return { status: "failed", detail: "value cannot be stored in a property" };
	const page = usePageStore.getState().pageById(pageId);
	if (!page) return { status: "failed", detail: "page not found" };
	const properties = mergeProperty(page.properties ?? [], property, value);
	const userId = useUserStore.getState().activeUserId || "anonymous";
	await usePageConfigStore.getState().addVersion(userId, pageId, {
		title: page.title || "Untitled",
		content: page.content ?? [],
		label: "Before button program",
	});
	const outcome = await publishPage({ ...page, properties });
	if (outcome.result === "refused") return { status: "blocked", detail: "you may not edit this page" };
	if (outcome.result !== "ok") return { status: "failed", detail: outcome.result };
	usePageStore.getState().patchPage(pageId, { properties });
	return { status: "ok" };
}

/**
 * An in-app confirmation (the viewer has no window.confirm). Closing the dialog
 * by any route other than the confirm button counts as a refusal.
 */
function confirmDestructive(actionName: string): Promise<boolean> {
	return new Promise((resolve) => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		const settle = (answer: boolean) => {
			root.unmount();
			host.remove();
			resolve(answer);
		};
		root.render(
			createElement(
				ConfirmDialog,
				{
					title: "Run this action?",
					confirmLabel: "Run",
					tone: "danger",
					actionTone: "danger",
					onCancel: () => settle(false),
					onConfirm: () => settle(true),
				},
				createElement("p", { className: "text-sm text-[var(--osio-fg-muted)]" }, "This button wants to run ", createElement("strong", null, actionName), ". It changes this page."),
			),
		);
	});
}

function performAction(pageId: string, action: ResolvedAction): Promise<ActionOutcome> {
	if (action.type === "notify") {
		toast("info", String(action.message ?? ""));
		return Promise.resolve({ status: "ok" });
	}
	if (action.type === "page_action") return runProgramPageAction(pageId, action.name);
	return writeProperty(pageId, action.property, action.value);
}

/**
 * Run a button block's program. A second click while a run is in flight is
 * ignored: two runs would double every budget and interleave their logs.
 */
export async function runButtonBlock(block: Block, hostPageId?: string): Promise<void> {
	if (inFlight) return;
	const parsed = parseButtonProgram(block.buttonProgram);
	if (!parsed.ok) {
		toast("error", "This button's program is invalid");
		return;
	}
	const pageId = hostPageId ?? findHostPageId(block.id);
	const page = pageId ? usePageStore.getState().pageById(pageId) : undefined;
	if (!pageId || !page) {
		toast("error", "This button's page could not be found");
		return;
	}
	inFlight = true;
	try {
		const engine = await loadEngine();
		const result = await runButtonProgram(parsed.program, {
			props: propsOf(page),
			evaluateFormula: engine.evalFormula,
			runAction: guardDestructive((action) => performAction(pageId, action), confirmDestructive, DESTRUCTIVE_PAGE_ACTIONS),
			now: () => Date.now(),
		});
		lastRun = { blockId: block.id, pageId, result };
		listeners.forEach((listener) => listener());
	} finally {
		inFlight = false;
	}
}
