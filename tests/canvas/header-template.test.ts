/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   header-template.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { classicHeaderTemplate, type HeaderTemplate } from "../../src/entities/page/model/headerTemplate.ts";
import {
  headerScopeKeys,
  registerHeaderTemplate,
  resolveHeaderTemplateScoped,
} from "../../src/entities/page/model/templateRegistry.ts";

const tpl = (id: string): HeaderTemplate => ({ id, version: 1, layout: "stacked", regions: [] });

test("headerScopeKeys orders page → database → global, skipping absent scopes", () => {
  assert.deepEqual(headerScopeKeys("p1", "db1"), ["page:p1", "db1", "global"]);
  assert.deepEqual(headerScopeKeys(null, "db1"), ["db1", "global"]);
  assert.deepEqual(headerScopeKeys("p1", null), ["page:p1", "global"]);
  assert.deepEqual(headerScopeKeys(), ["global"]);
});

test("scoped resolution: page override beats database override beats global", () => {
  const overrides = { "page:p1": tpl("page"), db1: tpl("db"), global: tpl("glob") };
  assert.equal(resolveHeaderTemplateScoped(overrides, "p1", "db1")?.id, "page");
  // Bare database key — pre-scope saved templates keep resolving unchanged.
  assert.equal(resolveHeaderTemplateScoped(overrides, "p2", "db1")?.id, "db");
  assert.equal(resolveHeaderTemplateScoped(overrides, "p2", "db-other")?.id, "glob");
  assert.equal(resolveHeaderTemplateScoped({}, "p2", null), null);
});

test("built-in database preset outranks the global override, never page/db ones", () => {
  registerHeaderTemplate("db-preset", tpl("preset"));
  assert.equal(resolveHeaderTemplateScoped({}, "p1", "db-preset")?.id, "preset");
  assert.equal(
    resolveHeaderTemplateScoped({ global: tpl("glob") }, "p1", "db-preset")?.id,
    "preset",
    "workspace-wide header must not flatten purpose-built record headers",
  );
  assert.equal(resolveHeaderTemplateScoped({ "db-preset": tpl("db") }, "p1", "db-preset")?.id, "db");
  assert.equal(resolveHeaderTemplateScoped({ "page:p1": tpl("page") }, "p1", "db-preset")?.id, "page");
});

test("classicHeaderTemplate mirrors the classic header (icon beside title)", () => {
  const template = classicHeaderTemplate();
  assert.equal(template.layout, "media_aside");
  const byKind = Object.fromEntries(
    template.regions.map((region) => [region.kind, region.slots.map((slot) => `${slot.kind}:${slot.bind ?? ""}`)]),
  );
  assert.deepEqual(byKind.aside, ["media:icon"]);
  assert.deepEqual(byKind.main, ["title:title"]);
  assert.deepEqual(byKind.meta, []);
  assert.deepEqual(byKind.actions, []);
});
