/**
 * osionos#233 D233-9: what an export does with uploads. An upload link may stop opening outside
 * osionos (once the bridge enforces signed links), so an export that holds one says so in one line
 * (N2: worded to stay true while enforce is off), and no export
 * ever carries a signature (it dies within 2 h, and while it lives it opens the file for anyone).
 *
 * Caveat: an upload is found by its path's text shape. One that is percent-encoded or split across
 * two text runs is not seen, so that export lacks the note.
 */

import { stripMediaSignature } from "@/shared/lib/media/mediaSignature";

export const PRIVATE_MEDIA_NOTE =
  "Uploaded images and files in this export are osionos links: they may stop opening outside osionos.";

const UPLOAD_IN_TEXT = /\/api\/media\/uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}\.[a-z0-9]{1,8}/i;

export interface ExportedMedia {
  text: string;
  holdsUpload: boolean;
}

/** `text` with every signature removed, and whether it links an upload. */
export function exportedMedia(text: string): ExportedMedia {
  const stripped = stripMediaSignature(text);
  return { text: stripped, holdsUpload: UPLOAD_IN_TEXT.test(stripped) };
}

/** A markdown export: unsigned, closed by the note as a quote when it links an upload. */
export function markdownWithMediaNote(markdown: string): string {
  const { text, holdsUpload } = exportedMedia(markdown);
  if (!holdsUpload) return text;
  return `${text.trimEnd()}\n\n> ${PRIVATE_MEDIA_NOTE}${text.endsWith("\n") ? "\n" : ""}`;
}

/** Markdown pasted back into osionos: the note line markdownWithMediaNote added, removed. */
export function withoutMediaNote(markdown: string): string {
  return markdown.split(`\n\n> ${PRIVATE_MEDIA_NOTE}`).join("");
}
