/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pasteImage.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 20:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A pasted screenshot left to the browser lands in the block as base64: a page of
// megabytes that the outbox writes to localStorage before the upload replaces it,
// so the origin fills and "Browser storage is full" shows although the picture
// saves. Uploading first keeps the page a URL; base64 is the offline fallback.

type ClipboardSource = Pick<DataTransfer, "getData" | "files">;

/** The picture a paste carries when it carries nothing else (a screenshot, a copied file).
 *  A picture copied from a page also carries html with its own URL, which the browser keeps. */
export function pastedImageFile(data: ClipboardSource): File | null {
  if (data.getData("text/plain") || data.getData("text/html")) return null;
  return Array.from(data.files).find((file) => file.type.startsWith("image/")) ?? null;
}

/** `content` with an inline `![](src)` replacing the selection `start..end`. */
export function insertPastedImage(content: string, src: string, offsets: { start: number; end: number }): string {
  const lo = Math.max(0, Math.min(offsets.start, offsets.end, content.length));
  const hi = Math.max(lo, Math.min(Math.max(offsets.start, offsets.end), content.length));
  return `${content.slice(0, lo)}![](${src})${content.slice(hi)}`;
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return `data:${file.type};base64,${btoa(binary)}`;
}

/** The uploaded URL; inline base64 when the upload fails (offline, no session), which the
 *  outbox retries to upload on its next flush. */
export async function pastedImageSource(file: File, upload: (file: File) => Promise<string>): Promise<string> {
  try {
    return await upload(file);
  } catch {
    return toDataUrl(file);
  }
}
