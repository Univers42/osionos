import { dataUrlToFile, inlineImagesIn } from "@/shared/lib/media/inlineImages";

/**
 * The picture a paste carries, as a file to upload: an image file on the clipboard, else a
 * base64 `<img>` in the pasted HTML. Null when the clipboard holds text — a spreadsheet or
 * document copy also carries a rendered image, and the text is what the person meant.
 *
 * Caveat: an `<img>` pointing at a remote URL is not fetched (cross-origin) and returns null;
 * the paste then goes on as a normal text paste.
 */
export function pastedImageFile(data: Pick<DataTransfer, "files" | "getData">): File | null {
  if (data.getData("text/plain") || data.getData("text/markdown")) return null;
  const file = Array.from(data.files).find((candidate) => candidate.type.startsWith("image/"));
  if (file) return file;
  const [inline] = inlineImagesIn(data.getData("text/html"));
  return inline ? dataUrlToFile(inline, "pasted-image") : null;
}
