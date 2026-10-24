/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graph-links.test.ts                                :+:      :+:    :+:   */
/*                                                    :::     :::         */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :::       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { EDGE_KINDS, filterEdges, toggleEdgeKind } from "@/features/graph-studio";
import { toIngestDoc } from "@/features/graph-studio/model/toIngestDoc";
import { pageMention, withPageMention } from "@/entities/page/ui/pageConnections.helpers";

/**
 * The graph's link edges: the inline [[page:]] mentions of the bridge become
 * the graph's note_link, and the user may hide the kinds they do not want.
 */

const NODES = [
  { id: "osionos:osionos_pages:a", mount: "osionos", resource: "osionos_pages", pk: "a", data: { id: "a", title: "A" } },
  { id: "osionos:osionos_pages:b", mount: "osionos", resource: "osionos_pages", pk: "b", data: { id: "b", title: "B" } },
];

const EDGES = [
  { id: "link:a:b", from: "osionos:osionos_pages:a", to: "osionos:osionos_pages:b", type: "link" },
  { id: "parent:a:b", from: "osionos:osionos_pages:a", to: "osionos:osionos_pages:b", type: "parent" },
];

test("the bridge's link edge is the graph's note_link", () => {
  const { doc } = toIngestDoc({ nodes: NODES, edges: EDGES });
  const link = doc.edges.find((edge) => edge.id === "link:a:b");
  assert.equal(link?.kind, "note_link");
  const parent = doc.edges.find((edge) => edge.id === "parent:a:b");
  assert.equal(parent?.kind, "hierarchy");
  assert.equal(parent?.child_first, true, "the tree is not drawn upside down");
});

test("the toggle keeps the kinds the user chose, and the nodes are never touched", () => {
  const { doc } = toIngestDoc({ nodes: NODES, edges: EDGES });
  const links = filterEdges(doc, ["note_link"]);
  assert.deepEqual(links.edges.map((edge) => edge.id), ["link:a:b"]);
  assert.equal(links.nodes.length, doc.nodes.length, "the nodes stay");
  const none = filterEdges(doc, []);
  assert.deepEqual(none.edges, []);
  assert.deepEqual([...EDGE_KINDS], ["note_link", "relation", "tag", "hierarchy"]);
});

test("a pick turns one kind on or off, and the last kind off turns them all back on", () => {
  assert.deepEqual(toggleEdgeKind(["note_link", "tag"], "tag"), ["note_link"]);
  assert.deepEqual(toggleEdgeKind(["note_link"], "tag"), ["note_link", "tag"]);
  assert.deepEqual(toggleEdgeKind(["note_link"], "note_link"), [...EDGE_KINDS], "a graph with no edge is not a choice");
});

test("the mention of a page is the shape the editor and the link store agree on", () => {
  assert.equal(pageMention("abc"), "[[page:abc]]");
  assert.equal(withPageMention("Some text", "abc"), "Some text [[page:abc]] ");
  assert.equal(withPageMention("", "abc"), "[[page:abc]] ");
  assert.equal(withPageMention("Some text   ", "abc"), "Some text [[page:abc]] ");
});
