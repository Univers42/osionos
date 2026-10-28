// No outer margin: the host owns the space around the block (the editor's block
// spacing, the read-only renderer's wrapper), so an inline database in a column
// starts level with its neighbours.
export function databaseShellClass(mode: "inline" | "full" | undefined): string {
  return mode === "full"
    ? "osionos-database-block w-full min-w-0 osionos-database-block--full h-full min-h-0 overflow-hidden"
    : "osionos-database-block w-full min-w-0 osionos-database-block--inline overflow-auto";
}
