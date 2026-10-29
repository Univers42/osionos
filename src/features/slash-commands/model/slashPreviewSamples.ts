/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashPreviewSamples.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// What the slash menu's preview pane shows for a block: a few real blocks,
// drawn by the same read-only renderer a page uses, so the preview is the
// block as it will look, not a picture of it. Types missing here (media,
// databases, boards, layouts) need data or a network fetch to look like
// anything; the pane shows their description alone.

import type { Block, BlockType } from "@/entities/block";
import type { SlashCommand } from "./types";

// Block carries an index signature, so Omit<Block, "id"> would erase type and
// content; Pick keeps the two the sample must name.
type SampleFields = Pick<Block, "type" | "content"> & Partial<Block>;

const block = (id: string, fields: SampleFields): Block => ({ ...fields, id: `slash-preview-${id}` });

const heading = (type: BlockType, title: string, body: string): Block[] => [
  block(`${type}`, { type, content: title }),
  block(`${type}-body`, { type: "paragraph", content: body }),
];

const SAMPLES: Partial<Record<BlockType, readonly Block[]>> = {
  paragraph: [
    block("paragraph", { type: "paragraph", content: "Write with plain text. **Bold**, *italic* and `code` work inline." }),
  ],
  heading_1: heading("heading_1", "Project kickoff", "Goals, people and dates for the launch."),
  heading_2: heading("heading_2", "Next steps", "What we do this week."),
  heading_3: heading("heading_3", "Open questions", "Things to settle before Friday."),
  heading_4: heading("heading_4", "Budget", "Numbers for the first quarter."),
  heading_5: heading("heading_5", "Notes", "Short points under a section."),
  heading_6: heading("heading_6", "Footnote", "The smallest heading."),
  bulleted_list: [
    block("bullet-1", { type: "bulleted_list", content: "Design review" }),
    block("bullet-2", {
      type: "bulleted_list",
      content: "Build the first version",
      children: [block("bullet-2a", { type: "bulleted_list", content: "Editor and sidebar" })],
    }),
    block("bullet-3", { type: "bulleted_list", content: "Ship to beta" }),
  ],
  numbered_list: [
    block("number-1", { type: "numbered_list", content: "Open the page" }),
    block("number-2", { type: "numbered_list", content: "Type / to add a block" }),
    block("number-3", { type: "numbered_list", content: "Press Enter to insert it" }),
  ],
  to_do: [
    block("todo-1", { type: "to_do", content: "Draft the agenda", checked: true }),
    block("todo-2", { type: "to_do", content: "Book the room", checked: true }),
    block("todo-3", { type: "to_do", content: "Send the invites", checked: false }),
  ],
  toggle: [
    block("toggle", {
      type: "toggle",
      content: "How do I share a page?",
      collapsed: false,
      children: [block("toggle-body", { type: "paragraph", content: "Click Share at the top right and invite people by email." })],
    }),
  ],
  code: [
    block("code", {
      type: "code",
      language: "javascript",
      content: "function greet(name) {\n  return `Hello, ${name}!`;\n}",
    }),
  ],
  quote: [
    block("quote", { type: "quote", content: "Simplicity is prerequisite for reliability.\n— Edsger W. Dijkstra" }),
  ],
  callout: [
    block("callout", { type: "callout", content: "Press **/** on any line to add a block." }),
  ],
  divider: [
    block("divider-above", { type: "paragraph", content: "End of the first part." }),
    block("divider", { type: "divider", content: "" }),
    block("divider-below", { type: "paragraph", content: "The next part starts here." }),
  ],
  table_block: [
    block("table", {
      type: "table_block",
      content: "",
      tableData: [
        ["Task", "Owner", "Status"],
        ["Design", "Ana", "Done"],
        ["Build", "Lee", "Doing"],
      ],
    }),
  ],
  equation: [block("equation", { type: "equation", content: "e^{i\\pi} + 1 = 0" })],
  column_list: [
    block("columns", {
      type: "column_list",
      content: "",
      children: [
        block("column-a", {
          type: "column",
          content: "",
          children: [block("column-a-text", { type: "paragraph", content: "**Left** — the plan and its goals." })],
        }),
        block("column-b", {
          type: "column",
          content: "",
          children: [block("column-b-text", { type: "paragraph", content: "**Right** — notes beside it." })],
        }),
      ],
    }),
  ],
  button: [
    block("button-text", { type: "paragraph", content: "One click runs the steps you set." }),
    block("button", { type: "button", content: "Start the weekly review", buttonVariant: "primary" }),
  ],
};

/** The blocks the preview draws for a command, or null when it shows the description alone. */
export function slashPreviewSample(command: SlashCommand): readonly Block[] | null {
  if (command.kind !== "block" && command.kind !== "turn-into") return null;
  if (command.layoutMode) return null;
  return SAMPLES[command.blockType] ?? null;
}
