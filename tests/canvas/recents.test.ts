/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recents.test.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { addRecent } from "@/store/pageStore.helpers";
import type { ActivePage } from "@/entities/page";

const mk = (id: string, workspaceId: string): ActivePage => ({ id, workspaceId, kind: "page", title: id });

test("addRecent caps per workspace and never evicts another workspace", () => {
  let recents: ActivePage[] = [];
  for (let i = 0; i < 12; i += 1) recents = addRecent(recents, mk(`a${i}`, "wsA"));
  assert.equal(recents.filter((r) => r.workspaceId === "wsA").length, 10); // capped at 10

  recents = addRecent(recents, mk("b0", "wsB"));
  recents = addRecent(recents, mk("b1", "wsB"));

  // Adding to wsB must NOT evict wsA's 10 entries — recents never cross workspaces.
  assert.equal(recents.filter((r) => r.workspaceId === "wsA").length, 10);
  assert.equal(recents.filter((r) => r.workspaceId === "wsB").length, 2);
});

test("addRecent dedups within a workspace and moves the re-opened page to the front", () => {
  let recents: ActivePage[] = [];
  recents = addRecent(recents, mk("x", "ws"));
  recents = addRecent(recents, mk("y", "ws"));
  recents = addRecent(recents, mk("x", "ws"));
  const ws = recents.filter((r) => r.workspaceId === "ws");
  assert.equal(ws.length, 2); // no duplicate of x
  assert.equal(ws[0].id, "x"); // most-recent first
});
