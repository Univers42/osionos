/**
 * "Open in graph" names a node before the graph that shows it exists. The id waits here
 * until a graph view has loaded, so it survives a view that unmounts mid-load.
 */
let pendingFocus: string | null = null;

export function requestGraphFocus(nodeId: string): void {
  pendingFocus = nodeId;
}

export function takeGraphFocus(): string | null {
  const id = pendingFocus;
  pendingFocus = null;
  return id;
}
