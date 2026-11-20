/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   template-apply-action.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page/model/types";
import { APP_ACTIONS } from "@/features/app-actions/model/actionRegistry";
import { createActionRunner } from "@/features/app-actions/model/runAppAction";

// TD14: template.apply only ever creates a new page; it never names a target.
const userBefore = useUserStore.getState();
const pagesBefore = usePageStore.getState();
afterEach(() => {
	useUserStore.setState(userBefore, true);
	usePageStore.setState(pagesBefore, true);
});

function stubCreate(result: PageEntry | null): unknown[][] {
	const calls: unknown[][] = [];
	useUserStore.setState({ activeWorkspace: () => ({ _id: "ws-1" }) as never, activePageJwt: () => "jwt-1" });
	usePageStore.setState({
		createPageFromTemplate: async (...args: unknown[]) => { calls.push(args); return result; },
	} as never);
	return calls;
}

const definition = () => {
	const def = APP_ACTIONS.get("template.apply");
	assert.ok(def, "template.apply is registered");
	return def;
};

test("template.apply takes only a templateId and creates, never replaces", () => {
	const def = definition();
	assert.deepEqual(Object.keys(def.params), ["templateId"]);
	assert.equal(def.params.templateId?.type, "string");
	assert.equal(def.params.templateId?.required, true);
	assert.equal(def.confirm, "simple");
	assert.equal(def.destructive, false);
	assert.equal(def.sudo, "none");
});

test("a pageId argument is refused before anything runs", async () => {
	const calls = stubCreate({ _id: "new-1", title: "Copy", workspaceId: "ws-1" } as PageEntry);
	const run = createActionRunner(APP_ACTIONS);
	const result = await run("template.apply", { templateId: "tpl-1", pageId: "victim" }, { mode: "live", trusted: true });
	assert.deepEqual(result, { status: "failed", message: 'Unknown argument "pageId"' });
	assert.equal(calls.length, 0);
});

test("run creates a page from the template in the active workspace", async () => {
	const calls = stubCreate({ _id: "new-1", title: "Copy", workspaceId: "ws-1" } as PageEntry);
	assert.deepEqual(await definition().run({ templateId: "tpl-1" }), { status: "ok" });
	assert.deepEqual(calls, [["tpl-1", "ws-1", "jwt-1"]]);
});

test("an id that is not a template fails without a page", async () => {
	stubCreate(null);
	const result = await definition().run({ templateId: "plain-page" });
	assert.equal(result.status, "failed");
});

test("no open workspace fails without calling the store", async () => {
	const calls = stubCreate(null);
	useUserStore.setState({ activeWorkspace: () => undefined as never });
	const result = await definition().run({ templateId: "tpl-1" });
	assert.equal(result.status, "failed");
	assert.equal(calls.length, 0);
});
