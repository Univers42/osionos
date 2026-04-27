/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readOnlyHarness.jsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/27 10:00:44 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/27 10:00:45 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { createRoot } from "react-dom/client";

import "@/app/styles/global.css";
import { PageBlocksRenderer } from "@/widgets/page-renderer";

const sampleBlocks = [
  { id: "heading", type: "heading_1", content: "Read-only heading" },
  { id: "paragraph", type: "paragraph", content: "Read-only paragraph" },
  { id: "bullet", type: "bulleted_list", content: "Bullet item" },
  { id: "todo", type: "to_do", content: "Checked todo", checked: true },
  { id: "numbered-1", type: "numbered_list", content: "First numbered item" },
  { id: "numbered-2", type: "numbered_list", content: "Second numbered item" },
  { id: "reset", type: "paragraph", content: "Break numbered sequence" },
  { id: "numbered-3", type: "numbered_list", content: "Restarted numbered item" },
  {
    id: "callout",
    type: "callout",
    content: "Read-only callout",
    color: "💡",
    children: [
      { id: "callout-child", type: "paragraph", content: "Callout child" },
    ],
  },
  {
    id: "quote",
    type: "quote",
    content: "Read-only quote",
    children: [
      { id: "quote-child", type: "paragraph", content: "Quote child" },
    ],
  },
  {
    id: "toggle",
    type: "toggle",
    content: "Read-only toggle",
    collapsed: true,
    children: [
      { id: "toggle-child", type: "paragraph", content: "Toggle child" },
    ],
  },
  { id: "code", type: "code", language: "typescript", content: "const value = 1;" },
  {
    id: "table",
    type: "table_block",
    content: "",
    tableData: [
      ["Head A", "Head B"],
      ["Cell A1", "Cell B1"],
    ],
  },
  { id: "divider", type: "divider", content: "" },
];

function App() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-primary)] p-8">
      <div className="mx-auto max-w-3xl" data-testid="readonly-root">
        <PageBlocksRenderer blocks={sampleBlocks} />
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
