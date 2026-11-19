// Block trees for the layout-modes DOM tests (ADR 0064 PS4, PS7, PS8, PS10). PLAIN holds no
// `style` anywhere: tints, colours, a button, plain columns and the old drag-bug shape (a column
// wrapping a sole column_list). STYLED holds the same kinds with layout keys. The markup both
// rendered to on the parent commit (f5eb51ca0) is in blockLayoutDom.snapshot.json.

import type { Block } from "../../../src/entities/block/model/types.ts";

const text = (id: string, content: string, extra: Partial<Block> = {}): Block => ({ id, type: "paragraph", content, ...extra });
const column = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column", content: "", children, ...extra });
const columns = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column_list", content: "", children, ...extra });

export const PLAIN: Block[] = [
  text("p-red", "Tinted text", { textColor: "var(--osio-block-tint-red-fg)" }),
  text("p-blue-bg", "Tinted surface", { backgroundColor: "var(--osio-block-tint-blue-bg)" }),
  text("p-hex", "Raw colour", { textColor: "#c2410c", backgroundColor: "#fef3c7" }),
  { id: "h-tint", type: "heading_2", content: "Tinted heading", textColor: "var(--osio-block-tint-green-fg)", backgroundColor: "var(--osio-block-tint-gray-bg)" },
  { id: "btn", type: "button", content: "", buttonLabel: "Go", buttonVariant: "primary" },
  { id: "btn-2", type: "button", content: "", buttonLabel: "Back", buttonVariant: "secondary" },
  columns("cl", [
    column("c1", [text("c1-p", "Left")], { widthRatio: 0.3 }),
    column("c2", [text("c2-p", "Right")], { widthRatio: 0.7, backgroundColor: "var(--osio-block-tint-yellow-bg)" }),
  ]),
  columns("cl-bug", [
    column("b1", [text("b1-p", "Outer")]),
    column("b2", [columns("b2-inner", [column("b3", [text("b3-p", "Hoisted A")]), column("b4", [text("b4-p", "Hoisted B")])])]),
  ]),
];

export const GRID_ID = "grid";

export const STYLED: Block[] = [
  text("s-pad", "Padded", { style: { padding: 3, surface: "muted" } }),
  text("s-junk", "Junk style only", { style: { bogus: 1 } as never }),
  columns("section", [
    column("sec-1", [columns(GRID_ID, [
      column("g1", [text("g1-p", "Card one")], { style: { span: 2 } }),
      column("g2", [text("g2-p", "Card two")]),
      column("g3", [text("g3-p", "Card three")]),
    ], { style: { layout: "grid", cols: 3, minCol: 16, gap: 4 } as never })]),
    column("sec-2", [text("sec-2-p", "Aside")]),
  ], { style: { surface: "muted", padding: 4 } }),
  columns("stack", [column("st1", [text("st1-p", "Top")]), column("st2", [text("st2-p", "Bottom")])], { style: { layout: "stack", stackAt: "never" } as never }),
  columns("gap-only", [column("go1", [text("go1-p", "A")]), column("go2", [text("go2-p", "B")])], { style: { gap: 2 } }),
];
