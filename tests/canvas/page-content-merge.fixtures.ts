/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-content-merge.fixtures.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The rival trees the page merge is checked against: a seeded PRNG, a small tree generator
// (paragraphs, toggles with children, layout blocks with cells) and the edit scripts that turn
// one tree into two rivals (insert, delete, edit, edit a nested child, move).
// Ponytail: the trees are held flat (a parent, a cell and an order per block) because every
// edit script is then a few lines; the tree itself is rebuilt from the flat form at the end.

import type { Block, BlockType, LayoutCell } from "@/entities/block";

/** mulberry32 — a small seeded PRNG, so a failing round prints its seed and replays. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One block, held flat: where it sits and what it says. */
export interface FlatNode {
  id: string;
  type: BlockType;
  content: string;
  /** The block that owns this one's container (null = the page's list). */
  parent: string | null;
  /** The layout cell this one lives in (null = the parent's children). */
  cell: string | null;
  /** The place in its container. */
  order: number;
  /** The cells a layout block holds: they exist even when they hold no block. */
  cells: string[];
}

export interface FlatTree {
  nodes: Map<string, FlatNode>;
}

const containerKey = (parent: string | null, cell: string | null): string =>
  `${parent ?? ""}|${cell ?? ""}`;

/** The blocks of one container, in order. */
function containerOf(tree: FlatTree, parent: string | null, cell: string | null): FlatNode[] {
  return [...tree.nodes.values()]
    .filter((node) => node.parent === parent && node.cell === cell)
    .sort((a, b) => a.order - b.order);
}

/** Renumber every container so the orders are 0..n-1 again. */
function renumber(tree: FlatTree): void {
  const groups = new Map<string, FlatNode[]>();
  for (const node of tree.nodes.values()) {
    const key = containerKey(node.parent, node.cell);
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.order - b.order);
    list.forEach((node, index) => {
      node.order = index;
    });
  }
}

/** A copy of a tree, so two edit scripts can work on the same base without touching each other. */
export function cloneTree(tree: FlatTree): FlatTree {
  const nodes = new Map<string, FlatNode>();
  for (const [id, node] of tree.nodes) nodes.set(id, { ...node });
  return { nodes };
}

/** A random tree: a handful of blocks, some toggles with children, some layout cells. */
export function randomTree(random: () => number, nextId: () => string): FlatTree {
  const tree: FlatTree = { nodes: new Map() };
  const add = (parent: string | null, cell: string | null, type: BlockType): FlatNode => {
    const id = nextId();
    const node: FlatNode = { id, type, content: `p-${id}`, parent, cell, order: 0, cells: [] };
    tree.nodes.set(id, node);
    return node;
  };
  const grow = (parent: string | null, cell: string | null, depth: number, count: number): void => {
    for (let index = 0; index < count; index += 1) {
      const roll = random();
      if (depth > 0 && roll < 0.3) {
        const toggle = add(parent, cell, "toggle");
        grow(toggle.id, null, depth - 1, 1 + Math.floor(random() * 2));
      } else if (depth > 0 && roll < 0.5) {
        const layout = add(parent, cell, "layout");
        layout.cells = [`${layout.id}-cell`];
        grow(layout.id, layout.cells[0], depth - 1, 1 + Math.floor(random() * 2));
      } else {
        add(parent, cell, "paragraph");
      }
    }
    renumber(tree);
  };
  grow(null, null, 3, 2 + Math.floor(random() * 3));
  return tree;
}

/** The tree of a flat form: the page's blocks, their children and their layout cells. */
export function buildTree(tree: FlatTree): Block[] {
  const build = (node: FlatNode): Block => {
    const block: Block = { id: node.id, type: node.type, content: node.content };
    if (node.type === "toggle") {
      block.children = containerOf(tree, node.id, null).map(build);
    }
    if (node.type === "layout") {
      block.layoutCells = node.cells.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((cellId): LayoutCell => ({
        id: cellId,
        colStart: 0,
        colSpan: 1,
        rowStart: 0,
        rowSpan: 1,
        blocks: containerOf(tree, node.id, cellId).map(build),
      }));
    }
    return block;
  };
  return containerOf(tree, null, null).map(build);
}

/** Whether a node sits inside another one's subtree (the node itself counts). */
function inside(tree: FlatTree, id: string, ancestorId: string): boolean {
  let current = tree.nodes.get(id);
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent ? tree.nodes.get(current.parent) : undefined;
  }
  return false;
}

/** Delete a block and everything under it. */
function deleteSubtree(tree: FlatTree, id: string): void {
  for (const child of [...tree.nodes.values()].filter((node) => node.parent === id)) {
    deleteSubtree(tree, child.id);
  }
  tree.nodes.delete(id);
}

/** Move a block (with its subtree) into another container. */
function moveNode(tree: FlatTree, node: FlatNode, random: () => number): void {
  const targets: Array<{ parent: string | null; cell: string | null }> = [
    { parent: null, cell: null },
  ];
  for (const other of tree.nodes.values()) {
    if (other.id === node.id) continue;
    if (other.type === "toggle") targets.push({ parent: other.id, cell: null });
    if (other.type === "layout" && other.cells.length > 0) {
      targets.push({ parent: other.id, cell: other.cells[0] });
    }
  }
  const target = targets[Math.floor(random() * targets.length)];
  if (target.parent && inside(tree, target.parent, node.id)) return;
  const siblings = containerOf(tree, target.parent, target.cell).filter(
    (other) => other.id !== node.id,
  );
  node.parent = target.parent;
  node.cell = target.cell;
  node.order = Math.floor(random() * (siblings.length + 1));
  renumber(tree);
}

/** A round of random edits: insert, delete, edit, edit a nested child, move. */
export function applyEdits(tree: FlatTree, random: () => number, nextId: () => string): void {
  const steps = 1 + Math.floor(random() * 4);
  for (let step = 0; step < steps; step += 1) {
    const nodes = [...tree.nodes.values()];
    if (nodes.length === 0) break;
    const victim = nodes[Math.floor(random() * nodes.length)];
    const roll = random();
    if (roll < 0.25) {
      const id = nextId();
      const node: FlatNode = {
        id,
        type: "paragraph",
        content: `p-${id}`,
        parent: victim.parent,
        cell: victim.cell,
        order: victim.order,
        cells: [],
      };
      tree.nodes.set(id, node);
      renumber(tree);
    } else if (roll < 0.45) {
      deleteSubtree(tree, victim.id);
      renumber(tree);
    } else if (roll < 0.65) {
      victim.content = `p-${nextId()}`;
    } else if (roll < 0.85) {
      const child = [...tree.nodes.values()].find((node) => node.parent === victim.id);
      if (child) child.content = `p-${nextId()}`;
    } else {
      moveNode(tree, victim, random);
    }
  }
}

/** Every block id of a tree, nested content included. */
export function collectIds(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (list: Block[]): void => {
    for (const block of list) {
      out.push(block.id);
      if (block.children) walk(block.children);
      for (const cell of block.layoutCells ?? []) {
        if (cell.blocks) walk(cell.blocks);
      }
    }
  };
  walk(blocks);
  return out;
}

/** Every block of a tree, by id. */
export function indexBlocks(blocks: Block[]): Map<string, Block> {
  const out = new Map<string, Block>();
  for (const id of collectIds(blocks)) {
    const block = findBlock(blocks, id);
    if (block) out.set(id, block);
  }
  return out;
}

function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children ?? [], id);
    if (nested) return nested;
    for (const cell of block.layoutCells ?? []) {
      const inCell = findBlock(cell.blocks ?? [], id);
      if (inCell) return inCell;
    }
  }
  return undefined;
}
