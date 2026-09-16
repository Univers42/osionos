/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   importFolder.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Folders never worth importing as pages — the same intent as P4's
 *  `.osioignore`, kept minimal here for the browser-side folder import. */
export const IMPORT_IGNORE_SEGMENTS = new Set([
  "node_modules", ".git", "dist", "build", "target", "__pycache__",
  ".venv", "venv", ".cache", ".next", ".turbo", ".gradle", ".idea", ".vscode",
]);

const MAX_IMPORT_FILE_BYTES = 512 * 1024;
const MAX_IMPORT_FILES = 500;
/** Binary-ish extensions we never slurp into a text code block. */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|mp4|mov|mp3|wav|woff2?|ttf|eot|so|o|a|bin|exe|dll|class|jar|wasm)$/i;

export interface ImportedFile {
  relPath: string;
  content: string;
}

function isIgnored(relPath: string): boolean {
  if (BINARY_EXT.test(relPath)) return true;
  return relPath.split("/").some((segment) => IMPORT_IGNORE_SEGMENTS.has(segment));
}

/**
 * Read a picked folder's files (from an <input webkitdirectory> or a drop) into
 * `{ relPath, content }` text entries, skipping ignored dirs, binaries and
 * oversized files, capped in count. Async: each file's text is read in parallel.
 * The caller turns these into folder+code pages via `buildImportPlan`.
 */
export async function readImportFiles(files: File[]): Promise<ImportedFile[]> {
  const candidates = files
    .map((file) => ({ file, relPath: (file.webkitRelativePath || file.name).replace(/^\/+/, "") }))
    .filter(({ file, relPath }) => relPath && !isIgnored(relPath) && file.size <= MAX_IMPORT_FILE_BYTES)
    .slice(0, MAX_IMPORT_FILES);

  const read = await Promise.all(
    candidates.map(async ({ file, relPath }) => {
      try {
        return { relPath, content: await file.text() };
      } catch {
        return null;
      }
    }),
  );
  return read.filter((entry): entry is ImportedFile => entry !== null);
}
