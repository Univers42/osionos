/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-property-empty-values.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #162: a page you cannot edit printed "Empty" / "No relations" for every blank property and
// "true" for a ticked box; a value the table computes was drawn as a field whose edit was dropped.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PagePropertyEntry } from "../../src/entities/page/model/types.ts";

const { PagePropertyRow } = await import("../../src/entities/page/ui/PagePropertyRow.tsx");

function row(property: PagePropertyEntry, editable: boolean): string {
  return renderToStaticMarkup(React.createElement(PagePropertyRow, {
    property, workspaceId: "w1", pageId: "p1", editable, onChangeValue: () => undefined, onRemove: () => undefined,
  }));
}

const BLANK: PagePropertyEntry[] = [
  { key: "notes", label: "Notes", type: "text", value: null },
  { key: "stage", label: "Stage", type: "select", value: null, options: ["Lead", "Won"] },
  { key: "tags", label: "Tags", type: "multi_select", value: [], options: ["a"] },
  { key: "links", label: "Links", type: "relation", value: [], relationTarget: "page" },
];

test("a blank property on a page you cannot edit keeps its row and prints no placeholder", () => {
  for (const property of BLANK) {
    const html = row(property, false);
    assert.match(html, new RegExp(`>${property.label}<`), property.key);
    assert.doesNotMatch(html, /Empty|No relations/, `${property.key}: ${html}`);
  }
});

test("a ticked box on a page you cannot edit is a disabled box, not the word true", () => {
  const html = row({ key: "done", label: "Done", type: "checkbox", value: true }, false);
  assert.doesNotMatch(html, />true</);
  assert.match(html, /type="checkbox"[^>]*disabled/);
});

test("a value the table owns is shown as text, never as a field that drops the edit", () => {
  const html = row({ key: "weighted", label: "Weighted", type: "text", value: "42", readOnly: true }, true);
  assert.match(html, />42</);
  assert.doesNotMatch(html, /<textarea|<input/);
});

test("a record's relation lists the related rows by title", () => {
  const html = row({ key: "contacts", label: "Contacts", type: "relation", value: ["Ada Lovelace"], relationTarget: "database", readOnly: true }, true);
  assert.match(html, /Ada Lovelace/);
  assert.doesNotMatch(html, /Untitled|Relate/);
});
