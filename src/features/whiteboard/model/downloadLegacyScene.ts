/** `drawing-<first 8 id chars>.osidraw`: stable per block, so a second download overwrites
 *  rather than piling up copies. */
export function legacyDrawFileName(blockId: string): string {
  return `drawing-${blockId.slice(0, 8)}.osidraw`;
}

/** Save the stored scene byte-for-byte. Nothing is parsed or re-serialised, so a scene
 *  the importer cannot read is still recoverable. */
export function downloadLegacyScene(blockId: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = legacyDrawFileName(blockId);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked late: some browsers start the save after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
