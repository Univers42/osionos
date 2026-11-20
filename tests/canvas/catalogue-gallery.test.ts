/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogue-gallery.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import type { NotionState } from "@notion-db/object-database";
import { dbInline } from "@/data/templates/templateBlocks";
import type { TemplateSource } from "@/features/templates/model/templateSlice";
import type { CatalogueInstantiateDeps } from "@/features/templates/model/catalogueInstantiate";
import type { CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";
import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { database, record } from "../../src/data/templates/catalogue/builders/databases.ts";
import { view } from "../../src/data/templates/catalogue/builders/views.ts";
import "./support/user-store-env.ts";
import { templateKeys } from "../../scripts/check-catalogue-chunks.mjs";

type Commit = { state: NotionState; created: CreatedEntry[]; workspaceId: string };
const INDEX = "src/data/templates/catalogue/index.ts";
const ENTRY = "src/app/main.tsx";

function source(content: Block[] = [dbInline("slice-db", "view-board")]): TemplateSource {
  return {
    id: "tpl:fixture", title: "Fixture template", content,
    databases: database({
      id: "slice-db", name: "Slice database",
      properties: [{ id: "title", name: "Name", type: "title" }],
      views: [view("view-table", "slice-db", "Table", "table"), view("view-board", "slice-db", "Board", "board")],
      rows: [record("row-1", "slice-db", { title: "One" }), record("row-2", "slice-db", { title: "Two" })],
    }),
  };
}

function fakeDeps(template: TemplateSource | null, commits: Commit[], run: string): CatalogueInstantiateDeps {
  let next = 0;
  return {
    load: async () => template,
    icon: async () => "📦",
    whenReady: async () => {},
    live: () => ({ databases: {}, views: {}, pages: {} }),
    mintId: (prefix) => `${prefix}-${run}-${++next}`,
    commit: (state, created, workspaceId) => commits.push({ state, created, workspaceId }),
  };
}

function manifest(catalogue = true) {
  const entries: Record<string, unknown> = {
    [ENTRY]: { file: "assets/main.js", isEntry: true, imports: ["src/app/shared.ts"] },
    "src/app/shared.ts": { file: "assets/shared.js" },
  };
  if (catalogue) {
    entries[INDEX] = { file: "assets/catalogue.js", isDynamicEntry: true };
    for (const key of templateKeys()) entries[key] = { file: `assets/${key}.js`, isDynamicEntry: true };
  }
  return entries;
}

test("catalogue instantiate refuses a non-catalogue id without committing", async () => {
  const { prepareCatalogueTemplateWith } = await import("@/features/templates/model/catalogueInstantiate");
  const commits: Commit[] = [];
  const result = await prepareCatalogueTemplateWith(fakeDeps(source(), commits, "a"), "x", "ws");
  assert.equal(result, null);
  assert.equal(commits.length, 0);
});

test("catalogue instantiate returns null for an unknown id without committing", async () => {
  const { prepareCatalogueTemplateWith } = await import("@/features/templates/model/catalogueInstantiate");
  const commits: Commit[] = [];
  const result = await prepareCatalogueTemplateWith(fakeDeps(null, commits, "a"), "tpl:none", "ws");
  assert.equal(result, null);
  assert.equal(commits.length, 0);
});

test("catalogue instantiate commits independent clones and rewires each run", async () => {
  const { prepareCatalogueTemplateWith } = await import("@/features/templates/model/catalogueInstantiate");
  const commits: Commit[] = [];
  const first = await prepareCatalogueTemplateWith(fakeDeps(source(), commits, "one"), "tpl:fixture", "ws");
  const second = await prepareCatalogueTemplateWith(fakeDeps(source(), commits, "two"), "tpl:fixture", "ws");
  assert.ok(first && second);
  assert.equal(commits.length, 2);
  const firstId = commits[0]?.created[0]?.id;
  const secondId = commits[1]?.created[0]?.id;
  assert.ok(firstId && secondId);
  assert.notEqual(firstId, secondId);
  assert.notEqual(firstId, "slice-db");
  assert.notEqual(secondId, "slice-db");
  assert.equal(first.content[0]?.databaseId, firstId);
  assert.equal(second.content[0]?.databaseId, secondId);
  assert.equal(first.title, "Fixture template");
  assert.equal(first.icon, "📦");
});

test("catalogue instantiate rejects a dangling database before commit", async () => {
  const { prepareCatalogueTemplateWith } = await import("@/features/templates/model/catalogueInstantiate");
  const commits: Commit[] = [];
  const template = source([dbInline("db-nowhere", "view-board")]);
  const call = prepareCatalogueTemplateWith(fakeDeps(template, commits, "bad"), "tpl:fixture", "ws");
  await assert.rejects(call, /catalogue template has a dangling database/);
  assert.equal(commits.length, 0);
});

test("templatesState appends shipped records with source and category", async () => {
  const { templatesState } = await import("@/widgets/database-view/model/templatesDatabaseState");
  const { useUserStore } = await import("@/features/auth");
  const { usePageStore } = await import("@/store/usePageStore");
  useUserStore.setState({ activeWorkspace: () => ({ _id: "ws" }) as never });
  const user = { _id: "user-template", title: "Mine", workspaceId: "ws", isTemplate: true } as PageEntry;
  usePageStore.setState({ templatePages: () => [user] });
  const card: CatalogueCard = { id: "tpl:fixture", title: "Fixture", icon: "📦", description: "Demo", category: "work" };
  const state = templatesState([card]);
  assert.deepEqual(Object.keys(state.pages), ["user-template", "tpl:fixture"]);
  assert.equal(state.pages["tpl:fixture"]?.properties["home-template-source"], "shipped");
  assert.equal(state.pages["tpl:fixture"]?.properties["home-template-category"], "work");
  assert.equal("home-template-source" in (state.pages["user-template"]?.properties ?? {}), false);
  assert.ok(Object.values(state.views)[0]?.visibleProperties.includes("home-template-source"));
});

test("templatesState leaves page shells out so user templates stay on the first page", async () => {
  const { templatesState } = await import("@/widgets/database-view/model/templatesDatabaseState");
  const { listCatalogue } = await import("@/data/templates/catalogue");
  const { usePageStore } = await import("@/store/usePageStore");
  const user = { _id: "user-template", title: "Mine", workspaceId: "ws", isTemplate: true } as PageEntry;
  usePageStore.setState({ templatePages: () => [user] });
  const cards = await listCatalogue();
  assert.ok(cards.some((card) => card.category === "page"));
  const state = templatesState(cards);
  const categories = Object.values(state.pages).map((page) => page.properties["home-template-category"]);
  assert.equal(categories.includes("page"), false);
  assert.ok(Object.keys(state.pages).length <= 50);
});

test("catalogueLeaks accepts a separate dynamic catalogue entry", async () => {
  const { catalogueLeaks } = await import("../../scripts/check-catalogue-chunks.mjs");
  assert.deepEqual(catalogueLeaks(manifest()), []);
});

test("catalogueLeaks requires an own dynamic chunk for every template slug", async () => {
  const { catalogueLeaks } = await import("../../scripts/check-catalogue-chunks.mjs");
  const leaked = manifest();
  delete leaked["src/data/templates/catalogue/project-tracker.ts"];
  leaked["src/data/templates/catalogue/sprint-board.ts"] = { file: "assets/sprint-board.js", isDynamicEntry: false };
  const lines = catalogueLeaks(leaked);
  assert.ok(lines.some((line: string) => line.includes("LEAK src/data/templates/catalogue/project-tracker.ts has no chunk of its own")));
  assert.ok(lines.some((line: string) => line.includes("LEAK src/data/templates/catalogue/sprint-board.ts has no chunk of its own")));
});

test("catalogueLeaks reports a catalogue file in an entry's static closure", async () => {
  const { catalogueLeaks } = await import("../../scripts/check-catalogue-chunks.mjs");
  const leaked = manifest();
  (leaked["src/app/shared.ts"] as { imports: string[] }).imports = [INDEX];
  assert.ok(catalogueLeaks(leaked).some((line: string) => line.includes(`LEAK ${INDEX}`)));
});

test("catalogueLeaks rejects a manifest without catalogue keys", async () => {
  const { catalogueLeaks } = await import("../../scripts/check-catalogue-chunks.mjs");
  assert.ok(catalogueLeaks(manifest(false)).some((line: string) => /vacuous|no catalogue/i.test(line)));
});

test("CatalogueTemplatePeek statically renders the shipped read-only frame", async () => {
  Reflect.set(globalThis, "document", { body: { nodeType: 1 } });
  const loader = `export async function resolve(specifier, context, nextResolve) {
    if (specifier === "react-dom") {
      const code = "export const createPortal = (children) => children; export default { createPortal };";
      return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true };
    }
    if (specifier === "@notion-db/object-database") {
      return { url: "data:text/javascript,export const ObjectDatabase = () => null", shortCircuit: true };
    }
    if (specifier === "@/pages/notion-page/ui/NotionPage") {
      return { url: "data:text/javascript,export const OsionosPage = () => null", shortCircuit: true };
    }
    if (specifier === "@/widgets/page-renderer/ui/PageBlocksRenderer") {
      return { url: "data:text/javascript,export const PageBlocksRenderer = () => null", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }`;
  register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);
  const { CatalogueTemplatePeek } = await import("@/widgets/database-view/ui/CatalogueTemplatePeek");
  const html = renderToStaticMarkup(React.createElement(CatalogueTemplatePeek, { templateId: "tpl:fixture", onClose() {} }));
  assert.match(html, /Shipped template · read-only preview/);
  assert.match(html, /Loading template…/);
  assert.doesNotMatch(html, /Page unavailable/);
});
