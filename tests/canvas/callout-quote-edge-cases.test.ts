/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   callout-quote-edge-cases.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  CALLOUT_TYPES,
  calloutDisplayIcon,
  resolveCalloutType,
} from "../../src/entities/block/model/calloutTypes.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../src/shared/lib/markengine/markdown/shortcuts.ts";
import { detectBlockType } from "../../src/shared/lib/markengine/shortcutsDetect.ts";

let seq = 0;
const make = (block: Partial<Block> & { type: Block["type"] }): Block => ({
  id: `b${seq++}`,
  content: "",
  ...block,
});
function roundTrip(block: Block): Block {
  const parsed = parseMarkdownToBlocks(serializeBlocksToMarkdown([block]));
  assert.equal(parsed.length, 1, `expected one block from:\n${serializeBlocksToMarkdown([block])}`);
  return parsed[0];
}

/* ── A. resolver: emoji / word-kind / unknown → a single semantic type ───────── */
test("resolver: each preset id resolves to itself", () => {
  for (const t of CALLOUT_TYPES) assert.equal(resolveCalloutType(t.id).id, t.id);
});
test("resolver: each preset emoji resolves to its type", () => {
  for (const t of CALLOUT_TYPES) assert.equal(resolveCalloutType(t.icon).id, t.id);
});
test("resolver: ⚠️ and 'warning' resolve to the same type", () => {
  assert.equal(resolveCalloutType("⚠️").id, "warning");
  assert.equal(resolveCalloutType("warning").id, "warning");
});
test("resolver: word-kinds are case-insensitive", () => {
  assert.equal(resolveCalloutType("WARNING").id, "warning");
  assert.equal(resolveCalloutType("Danger").id, "danger");
});
test("resolver: aliases map to a type (warn/error/idea/check)", () => {
  assert.equal(resolveCalloutType("warn").id, "warning");
  assert.equal(resolveCalloutType("error").id, "danger");
  assert.equal(resolveCalloutType("idea").id, "tip");
  assert.equal(resolveCalloutType("check").id, "success");
});
test("resolver: legacy emojis map sensibly (💡✅❗📌❌🔥ℹ️)", () => {
  assert.equal(resolveCalloutType("💡").id, "tip");
  assert.equal(resolveCalloutType("✅").id, "success");
  assert.equal(resolveCalloutType("❗").id, "important");
  assert.equal(resolveCalloutType("📌").id, "info");
  assert.equal(resolveCalloutType("❌").id, "danger");
  assert.equal(resolveCalloutType("🔥").id, "warning");
  assert.equal(resolveCalloutType("ℹ️").id, "info");
});
test("resolver: unknown emoji → note (neutral)", () => {
  assert.equal(resolveCalloutType("🦄").id, "note");
  assert.equal(resolveCalloutType("zzz").id, "note");
});
test("resolver: undefined / empty → note", () => {
  assert.equal(resolveCalloutType(undefined).id, "note");
  assert.equal(resolveCalloutType("").id, "note");
  assert.equal(resolveCalloutType("   ").id, "note");
});
test("resolver: leading/trailing space is tolerated", () => {
  assert.equal(resolveCalloutType("  warning  ").id, "warning");
});

/* ── B. display icon: word → preset icon, emoji → itself ─────────────────────── */
test("displayIcon: word-kind shows its preset emoji", () => {
  assert.equal(calloutDisplayIcon("warning"), "⚠️");
  assert.equal(calloutDisplayIcon("success"), "✅");
});
test("displayIcon: a known emoji shows as-is", () => {
  assert.equal(calloutDisplayIcon("⚠️"), "⚠️");
});
test("displayIcon: a custom/unknown emoji shows as-is", () => {
  assert.equal(calloutDisplayIcon("🦄"), "🦄");
});
test("displayIcon: empty/undefined falls back to the Note icon", () => {
  assert.equal(calloutDisplayIcon(undefined), "📝");
  assert.equal(calloutDisplayIcon(""), "📝");
});

/* ── C. callout round-trip basics + colour/kind fidelity ─────────────────────── */
test("callout: bare content survives", () => {
  const out = roundTrip(make({ type: "callout", content: "Heads up", color: "⚠️" }));
  assert.equal(out.type, "callout");
  assert.equal(out.content, "Heads up");
});
test("callout: emoji colour round-trips and resolves", () => {
  const out = roundTrip(make({ type: "callout", content: "x", color: "⚠️" }));
  assert.equal(out.color, "⚠️");
  assert.equal(resolveCalloutType(out.color).id, "warning");
});
test("callout: word-kind colour round-trips and resolves", () => {
  const out = roundTrip(make({ type: "callout", content: "x", color: "warning" }));
  assert.equal(resolveCalloutType(out.color).id, "warning");
});
test("callout: missing colour defaults (still resolves to a type)", () => {
  const out = roundTrip(make({ type: "callout", content: "x" }));
  assert.equal(out.type, "callout");
  assert.ok(resolveCalloutType(out.color).id.length > 0);
});

/* ── D. callout children preserved structurally, per child type ──────────────── */
function calloutWith(child: Block): Block {
  return make({ type: "callout", content: "Title", color: "ℹ️", children: [child] });
}
for (const child of [
  make({ type: "paragraph", content: "a para" }),
  make({ type: "heading_2", content: "a heading" }),
  make({ type: "bulleted_list", content: "an item" }),
  make({ type: "numbered_list", content: "first" }),
  make({ type: "to_do", content: "task", checked: true } as Partial<Block> & { type: Block["type"] }),
  make({ type: "code", content: "x=1", language: "python" } as Partial<Block> & { type: Block["type"] }),
  make({ type: "divider", content: "" }),
  make({ type: "quote", content: "nested quote" }),
]) {
  test(`callout keeps a ${child.type} child through round-trip`, () => {
    const out = roundTrip(calloutWith(child));
    assert.equal(out.type, "callout");
    assert.ok(out.children && out.children.length >= 1, "callout child should survive");
    assert.equal(out.children?.[0].type, child.type);
  });
}
test("callout keeps multiple distinct children", () => {
  // NOTE: two ADJACENT paragraphs intentionally merge into one on parse (markdown soft-break);
  // distinct block types stay separate, which is what we assert here.
  const out = roundTrip(make({
    type: "callout", content: "T", color: "💡",
    children: [make({ type: "paragraph", content: "intro" }), make({ type: "bulleted_list", content: "item" })],
  }));
  assert.equal(out.children?.length, 2);
  assert.equal(out.children?.[1].type, "bulleted_list");
});

/* ── E. arbitrary / deep nesting (the "tagged div holds anything") ───────────── */
test("callout-in-callout survives (1 level)", () => {
  const out = roundTrip(make({
    type: "callout", content: "outer", color: "⚠️",
    children: [make({ type: "callout", content: "inner", color: "✅" })],
  }));
  assert.equal(out.children?.[0].type, "callout");
  assert.equal(resolveCalloutType(out.children?.[0].color).id, "success");
});
test("callout > callout > callout survives (2 levels deep)", () => {
  const deep = make({
    type: "callout", content: "L0", color: "ℹ️",
    children: [make({
      type: "callout", content: "L1", color: "💡",
      children: [make({ type: "callout", content: "L2", color: "❗" })],
    })],
  });
  const out = roundTrip(deep);
  assert.equal(out.children?.[0].children?.[0].type, "callout");
  assert.equal(out.children?.[0].children?.[0].content, "L2");
});
test("callout containing a list that has its own items", () => {
  const out = roundTrip(make({
    type: "callout", content: "T", color: "📝",
    children: [make({ type: "bulleted_list", content: "top", children: [make({ type: "bulleted_list", content: "sub" })] })],
  }));
  assert.equal(out.children?.[0].type, "bulleted_list");
});

/* ── F. quote round-trip (children flatten into content — documented) ────────── */
test("quote: bare content survives", () => {
  const out = roundTrip(make({ type: "quote", content: "To be" }));
  assert.equal(out.type, "quote");
  assert.equal(out.content, "To be");
});
test("quote: child text is preserved (flattened into content)", () => {
  const out = roundTrip(make({ type: "quote", content: "line one", children: [make({ type: "paragraph", content: "line two" })] }));
  assert.equal(out.type, "quote");
  assert.ok(out.content.includes("line one"));
  assert.ok(out.content.includes("line two"));
});
test("quote: an attribution line is preserved verbatim", () => {
  const out = roundTrip(make({ type: "quote", content: "Stay hungry.\n— Steve Jobs" }));
  assert.equal(out.type, "quote");
  assert.ok(out.content.includes("— Steve Jobs"));
});

/* ── G. view-state fidelity: collapsed + headingLevel are NOT serialized ─────── */
test("collapsed is dropped (no markdown form) for callout & quote", () => {
  assert.equal(roundTrip(make({ type: "callout", content: "x", color: "💡", collapsed: true })).collapsed, undefined);
  assert.equal(roundTrip(make({ type: "quote", content: "x", collapsed: true })).collapsed, undefined);
});
test("headingLevel is dropped for callout & quote", () => {
  assert.equal(roundTrip(make({ type: "callout", content: "x", color: "💡", headingLevel: 2 })).headingLevel, undefined);
  assert.equal(roundTrip(make({ type: "quote", content: "x", headingLevel: 3 })).headingLevel, undefined);
});

/* ── H. live shortcut detection + precedence ─────────────────────────────────── */
test("detect: '>![warning]' is a callout (compact form)", () => {
  const d = detectBlockType(">![warning] heads up");
  assert.equal(d?.type, "callout");
  assert.equal(d?.kind, "warning");
});
test("detect: '> [!warning]' is a callout (canonical/GitHub form)", () => {
  const d = detectBlockType("> [!warning] heads up");
  assert.equal(d?.type, "callout");
  assert.equal(d?.kind, "warning");
  assert.equal(d?.content, "heads up");
});
test("detect: malformed '> [!]' callout defaults kind to note", () => {
  const d = detectBlockType("> [!] hi");
  assert.equal(d?.type, "callout");
  assert.equal(d?.kind, "note");
});
test("detect: '> [!info]' resolves to a known type", () => {
  const d = detectBlockType("> [!info] x");
  assert.equal(resolveCalloutType(d?.kind).id, "info");
});
test("detect: '> [>]' is a toggle, not a callout", () => {
  assert.equal(detectBlockType("> [>] thing")?.type, "toggle");
});
test("detect: '\"' and '|' start a quote", () => {
  assert.equal(detectBlockType('" quoted')?.type, "quote");
  assert.equal(detectBlockType("| quoted")?.type, "quote");
});
test("detect: a plain '> ' is NOT mistaken for a callout", () => {
  assert.notEqual(detectBlockType("> plain text")?.type, "callout");
});

/* ── I. inline formatting inside titles survives ─────────────────────────────── */
for (const [name, content] of [
  ["bold", "a **bold** word"],
  ["italic", "an *italic* word"],
  ["inline code", "some `code` here"],
  ["link", "a [link](https://x.dev)"],
] as const) {
  test(`callout title keeps ${name}`, () => {
    assert.equal(roundTrip(make({ type: "callout", content, color: "💡" })).content, content);
  });
  test(`quote keeps ${name}`, () => {
    assert.equal(roundTrip(make({ type: "quote", content })).content, content);
  });
}
