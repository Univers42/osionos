// "Open in terminal" reaches a shell as typed text: the pty's cwd is fixed by the node (pty-host),
// and a leading space keeps the line out of the history of a shell that honours it.

/** The line that moves a shell to `path`, or null when it holds a control character or is relative. */
export function cdCommand(path: string): string | null {
  // eslint-disable-next-line no-control-regex -- a control character typed into a shell is a command
  if (!path.startsWith("/") || /[\u0000-\u001f\u007f]/.test(path)) return null;
  return ` cd '${path.replaceAll("'", `'\\''`)}'\n`;
}
