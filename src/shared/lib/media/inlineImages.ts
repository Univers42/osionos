/**
 * Base64 pictures held inside a page (a pasted image, an offline cover) make the page body
 * large: the edge refuses a page write over 128 KB, and the page cache fills localStorage.
 * These pure helpers find such pictures in any JSON value and swap them for stored URLs;
 * the upload itself is the caller's (pageMediaUpload), so this module stays testable.
 *
 * Caveat: matches on the serialized JSON — a data URL split across two text runs, or one
 * percent-encoded / not base64, is not found and stays inline (under-reports; the page then
 * gets the "too large to save" notice instead of being shrunk).
 */

const INLINE_IMAGE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

/** Each distinct base64 image URL anywhere in `value`. O(size of the value). */
export function inlineImagesIn(value: unknown): string[] {
  const text = JSON.stringify(value);
  return text === undefined ? [] : [...new Set(text.match(INLINE_IMAGE) ?? [])];
}

/** `value` with every mapped image swapped for its URL; the same reference when none maps. */
export function replaceInlineImages<T>(value: T, urls: ReadonlyMap<string, string>): T {
  if (urls.size === 0) return value;
  const text = JSON.stringify(value);
  if (text === undefined) return value;
  // The URL goes in JSON-escaped: whatever it holds cannot break the document around it.
  const replaced = text.replace(INLINE_IMAGE, (match) => {
    const url = urls.get(match);
    return url === undefined ? match : JSON.stringify(url).slice(1, -1);
  });
  return replaced === text ? value : (JSON.parse(replaced) as T);
}

/** Decode a base64 image URL into a File named `<baseName>.<ext>`. Throws on a non-image URL. */
export function dataUrlToFile(dataUrl: string, baseName: string): File {
  const match = /^data:(image\/([a-z0-9.+-]+));base64,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error("Not a base64 image URL.");
  const [, type, subtype, payload] = match;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const ext = subtype.toLowerCase() === "jpeg" ? "jpg" : subtype.toLowerCase().split("+")[0];
  return new File([bytes], `${baseName}.${ext}`, { type: type.toLowerCase() });
}
