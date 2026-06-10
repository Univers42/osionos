/**
 * Resolve a node's IconValue string into a canvas-paintable glyph. The grammar
 * mirrors the host app's iconValue model (emoji / "emoji:X;bg=…" / "icon:name"
 * / "img:url") WITHOUT importing app code: emoji paint directly, image URLs
 * rasterize asynchronously, and everything else (lucide refs, missing icons)
 * falls back to a monogram — the label's first grapheme — which keeps every
 * node identifiable even before any asset loads.
 */

import { hashString } from "../math";

export type GlyphKind = "emoji" | "image" | "monogram";

export interface Glyph {
  kind: GlyphKind;
  /** Emoji character, image URL, or monogram letter. */
  ref: string;
}

/** Strip `;key=value` suffix params (e.g. "emoji:🚀;bg=#fff" → "🚀"). */
function bareRef(value: string): string {
  const semi = value.indexOf(";");
  return (semi >= 0 ? value.slice(0, semi) : value).trim();
}

// One shared segmenter — constructing Intl.Segmenter per call costs ~1ms,
// which at 10k nodes turned the recolor pass into a multi-second hang.
const SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

/** First grapheme of the label, uppercased (Intl.Segmenter when available). */
function monogramOf(label: string): string {
  const text = label.trim();
  if (!text) return "•";
  if (SEGMENTER) {
    for (const part of SEGMENTER.segment(text)) return part.segment.toUpperCase();
  }
  return String.fromCodePoint(text.codePointAt(0) ?? 0x2022).toUpperCase();
}

export function iconGlyph(icon: string | null, label: string): Glyph {
  const raw = (icon ?? "").trim();
  if (raw.startsWith("img:") || raw.startsWith("url:")) {
    const url = bareRef(raw.slice(4));
    if (url) return { kind: "image", ref: url };
  }
  if (raw.startsWith("emoji:")) {
    const emoji = bareRef(raw.slice(6));
    if (emoji) return { kind: "emoji", ref: emoji };
  }
  // Bare emoji (anything that is not a known scheme and not ASCII-wordish).
  if (raw && !raw.startsWith("icon:") && !/^[\w-]+$/.test(raw)) {
    return { kind: "emoji", ref: bareRef(raw) };
  }
  return { kind: "monogram", ref: monogramOf(label) };
}

/** Image URLs are hashed in cache keys; this registry maps key → URL back. */
const URL_CAP = 256;
const urlByKey = new Map<string, string>();

/** Bounded cache-key segment for a glyph ("" never collides with real keys). */
export function glyphKey(glyph: Glyph): string {
  if (glyph.kind === "emoji") return `e:${glyph.ref}`;
  if (glyph.kind === "monogram") return `m:${glyph.ref}`;
  const key = `i:${hashString(glyph.ref).toString(36)}`;
  if (!urlByKey.has(key) && urlByKey.size >= URL_CAP) {
    const oldest = urlByKey.keys().next().value;
    if (oldest !== undefined) urlByKey.delete(oldest);
  }
  urlByKey.set(key, glyph.ref);
  return key;
}

/** Resolve a key segment back to its glyph (null for empty/unknown segments). */
export function glyphFromKey(segment: string): Glyph | null {
  if (segment.startsWith("e:")) return { kind: "emoji", ref: segment.slice(2) };
  if (segment.startsWith("m:")) return { kind: "monogram", ref: segment.slice(2) };
  if (segment.startsWith("i:")) {
    const url = urlByKey.get(segment);
    return url ? { kind: "image", ref: url } : { kind: "monogram", ref: "•" };
  }
  return null;
}
