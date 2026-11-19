/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-stamp-cover-fixtures.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A synthetic corpus spanning every field pageStamp folds, none of them carrying a cover
// height or width: the stamps it yields were recorded before those fields existed (F7).

import type { PageEntry } from "../../src/entities/page/model/types.ts";

const ID = "fcf48b5b-2fed-41d6-9c5d-0075988728d1";
const BASE: PageEntry = { _id: ID, title: "Page", workspaceId: "ws-1" };

export const STAMP_CORPUS: PageEntry[] = [
  BASE,
  { ...BASE, title: "", updatedAt: "2026-10-01T10:00:00.000Z", content: [] },
  { ...BASE, icon: "📄", cover: "linear-gradient(red, blue)", coverPosition: 30 },
  { ...BASE, cover: "https://example.test/c.png", coverPosition: 0, visibility: "public" },
  { ...BASE, parentPageId: "507f1f77bcf86cd799439011", databaseId: "db-1", sortOrder: 4 },
  { ...BASE, properties: [{ key: "k", label: "K", type: "text", value: "v" }] },
  { ...BASE, isTemplate: true, isDefaultTemplate: true, recurrence: { every: "week" } },
  {
    ...BASE,
    surface: "code",
    content: [{ id: "b1", type: "code", content: "```\nx\n```", language: "markdown" }],
  },
  { ...BASE, content: [{ id: "b2", type: "paragraph", content: "ünïcødé ✓", children: [] }] },
];
