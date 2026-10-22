/**
 * "Describe with AI" for an image block: the pure rules, with no DOM and no
 * network. The route answers `{caption, tags[], objects[], ocr}`; this module
 * decides what lands in the block and what the reader is told on a refusal.
 *
 * Caveat: tags are cut at the limits (10 tags, 40 characters) and the text at
 * 300 characters, so a very long OCR text is truncated, never summarised.
 */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;
export const MAX_TEXT_LENGTH = 300;
const MAX_ALT_LENGTH = 300;

export interface ImageDescriptionAnswer {
  caption?: unknown;
  tags?: unknown;
  ocr?: unknown;
}

export interface ImageDescription {
  alt: string;
  tags: string[];
  text: string;
}

/** One tag as stored: trimmed, lowercase, cut to the limit. Empty = nothing. */
export function normaliseTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
}

/** A list of tags: normalised, deduplicated (first wins), capped. */
export function normaliseTags(raw: unknown, max = MAX_TAGS): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const tag = normaliseTag(item);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

function clean(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max).trim() : "";
}

/** The single entry point for what the service says about an image. */
export function normaliseImageDescription(answer: ImageDescriptionAnswer | null | undefined): ImageDescription {
  return {
    alt: clean(answer?.caption, MAX_ALT_LENGTH),
    tags: normaliseTags(answer?.tags),
    text: clean(answer?.ocr, MAX_TEXT_LENGTH),
  };
}

export interface DescribeBlockState {
  mediaAlt?: string;
  mediaTags?: string[];
}

export interface DescribeMerge {
  /** Fields to write now, in ONE update. */
  updates: { mediaAlt?: string; mediaTags?: string[]; mediaText?: string };
  /** The caption offered to the user when they already have alt text. */
  altSuggestion: string | null;
}

/**
 * What to write. Alt text the user has is never overwritten: it becomes a
 * suggestion. User tags stay first; new ones are appended up to the cap.
 */
export function mergeDescription(block: DescribeBlockState, description: ImageDescription): DescribeMerge {
  const updates: DescribeMerge["updates"] = {};
  let altSuggestion: string | null = null;
  const currentAlt = (block.mediaAlt ?? "").trim();
  if (description.alt) {
    if (currentAlt) {
      if (currentAlt !== description.alt) altSuggestion = description.alt;
    } else {
      updates.mediaAlt = description.alt;
    }
  }
  const tags = normaliseTags([...(block.mediaTags ?? []), ...description.tags]);
  if (tags.length > 0) updates.mediaTags = tags;
  if (description.text) updates.mediaText = description.text;
  return { updates, altSuggestion };
}

/** A tag added by hand: same normalisation, same cap, no duplicate. */
export function addTag(tags: readonly string[] | undefined, raw: string): string[] {
  return normaliseTags([...(tags ?? []), raw]);
}

export function removeTag(tags: readonly string[] | undefined, tag: string): string[] {
  return (tags ?? []).filter((t) => t !== tag);
}

/** Seconds of a `Retry-After` header (delta-seconds form only), or null. */
export function retryAfterSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null;
}

export interface DescribeFailure {
  status: number;
  code: string;
  retryAfter?: string | null;
}

/** The user-facing sentence for a refusal of the route. */
export function describeErrorMessage(failure: DescribeFailure): string {
  const { status, code } = failure;
  if (status === 422 || code === "invalid_image") return "This image type can't be described";
  if (status === 429 || status === 503) {
    const s = retryAfterSeconds(failure.retryAfter);
    return s === null ? "The describer is busy — try again in a moment" : `The describer is busy — try again in ${s} s`;
  }
  if (status === 502) return "The model gave an unusable answer — try again";
  if (status === 404 && code === "attachment_not_found") return "This image isn't available to describe";
  return "Couldn't describe this image";
}

/** True when the feature is off on the service: 404 `not_found`, not a missing attachment. */
export function isFeatureOff(failure: { status: number; code: string }): boolean {
  return failure.status === 404 && failure.code === "not_found";
}

/** Session memory of "the service has the feature off". */
let featureOff = false;
export function markDescribeOff(): void {
  featureOff = true;
}
export function isDescribeOff(): boolean {
  return featureOff;
}
export function resetDescribeOff(): void {
  featureOff = false;
}

/** The action shows for uploaded media only, and never once the feature is known off. */
export function canShowDescribe(mediaPath: string | null, off: boolean = featureOff): boolean {
  return mediaPath !== null && !off;
}
