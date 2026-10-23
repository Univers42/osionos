/**
 * The plan as a tree the card can show: pages and databases, in walk order.
 */

export interface PlanNode {
  key: string;
  kind: "page" | "database";
  title: string;
  depth: number;
  parentKey: string | null;
}

const MAX_NODES = 200;

export function planTree(args: unknown): PlanNode[] | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const items = (args as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: PlanNode[] = [];
  if (!walk(items, 1, null, out)) return null;
  if (out.length === 0) return null;
  return out;
}

function walk(
  items: unknown[],
  depth: number,
  parentKey: string | null,
  out: PlanNode[],
): boolean {
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as { key?: unknown; kind?: unknown; title?: unknown; children?: unknown };
    const key = record.key;
    const kind = record.kind;
    const title = record.title;
    if (typeof key !== "string" || key.length === 0) return false;
    if (kind !== "page" && kind !== "database") return false;
    if (typeof title !== "string" || title.length === 0) return false;
    if (out.length >= MAX_NODES) return false;
    out.push({ key, kind, title, depth, parentKey });
    if (kind === "page") {
      const children = record.children;
      if (children !== undefined) {
        if (!Array.isArray(children)) return false;
        if (!walk(children, depth + 1, key, out)) return false;
      }
    }
  }
  return true;
}

export function keptKeys(nodes: readonly PlanNode[], off: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (isDropped(node, nodes, off)) continue;
    result.push(node.key);
  }
  return result;
}

function isDropped(node: PlanNode, nodes: readonly PlanNode[], off: ReadonlySet<string>): boolean {
  let current: PlanNode | undefined = node;
  const seen = new Set<string>();
  while (current) {
    if (off.has(current.key)) return true;
    const parentKey: string | null = current.parentKey;
    if (parentKey === null) return false;
    if (seen.has(parentKey)) return false;
    seen.add(current.key);
    current = nodes.find((candidate) => candidate.key === parentKey);
  }
  return false;
}

export function decisionItems(
  nodes: readonly PlanNode[],
  off: ReadonlySet<string>,
): string[] | undefined {
  if (off.size === 0) return undefined;
  return keptKeys(nodes, off);
}
