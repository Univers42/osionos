/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shareRules.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-6-d: the client mirrors the share-rule grant. A page owned by someone else, in a
// workspace where the caller is a read-only member, becomes editable exactly while a
// can_edit rule for the caller is cached, and never under no_access. Caveat: this drives
// the real predicate in the real bundle, not the fetch that fills the cache (the bridge's
// answer is covered by tests/bridge); the owner is exempt, hence the foreign page.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test("a stored can_edit rule makes a foreign page editable, removing it takes the edit away", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);

  const result = await page.evaluate(async () => {
    const access = await import("/src/shared/lib/auth/pageAccess.ts");
    const base = access.getCurrentPageAccessContext();
    if (!base) throw new Error("no access context");
    const workspaceId = base.workspaceIds[0];
    const context = {
      ...base,
      memberAccess: { [workspaceId.toLowerCase()]: { role: "viewer", permissions: ["read"] } },
      refusedPageIds: new Set(),
      shareRulesByPage: new Map(),
    };
    const foreign = {
      _id: "e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1", workspaceId, ownerId: "a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1",
      visibility: "shared", collaborators: [],
    };
    const rule = (permission) => ({
      workspaceId, resourceId: foreign._id, resourceType: "page", explicit: true, permission,
      target: { type: "user", userId: context.userId },
    });
    const answers = { without: access.canEditPage(foreign, context) };
    access.setPageShareRules(context, foreign._id, [rule("can_view")]);
    answers.canView = access.canEditPage(foreign, context);
    access.setPageShareRules(context, foreign._id, [rule("can_edit")]);
    answers.canEdit = access.canEditPage(foreign, context);
    access.setPageShareRules(context, foreign._id, [rule("can_edit"), rule("no_access")]);
    answers.denied = access.canEditPage(foreign, context);
    access.setPageShareRules(context, foreign._id, []);
    answers.removed = access.canEditPage(foreign, context);
    return answers;
  });

  expect(result).toEqual({ without: false, canView: false, canEdit: true, denied: false, removed: false });
});
