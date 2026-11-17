/**
 * The backtick fence that safely wraps a source: one longer than the longest
 * backtick run inside it (minimum 3), so a source carrying its own fence
 * cannot close the wrapper early. Exact: any run, at any position, counts.
 */
export function fenceFor(source: string): string {
  const runs = source.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}
