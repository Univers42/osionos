/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   move-breadcrumbs.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildMoveBreadcrumbs } from "../../src/features/page-management/model/moveBreadcrumbs.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const WORKSPACES = [{ _id: "ws", name: "Team" }];

function page(id: string, title: string, parentPageId: string | null): PageEntry {
  return { _id: id, workspaceId: "ws", title, parentPageId };
}

test("move breadcrumbs name the workspace, then every ancestor root first, then the page", () => {
  const pages = [page("root", "Root", null), page("mid", "", "root"), page("leaf", "Leaf", "mid")];
  assert.equal(buildMoveBreadcrumbs("leaf", "ws", pages, WORKSPACES), "Team / Root / Untitled / Leaf");
  assert.equal(buildMoveBreadcrumbs("leaf", "elsewhere", pages, WORKSPACES), "Root / Untitled / Leaf");
});

test("move breadcrumbs end on a parentPageId cycle and name each page once", () => {
  const pages = [page("x", "X", "y"), page("y", "Y", "x"), page("self", "Self", "self")];
  assert.equal(buildMoveBreadcrumbs("x", "ws", pages, WORKSPACES), "Team / Y / X");
  assert.equal(buildMoveBreadcrumbs("self", "ws", pages, WORKSPACES), "Team / Self");
});
