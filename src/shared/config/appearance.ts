import { FIXED_ACCENT_PALETTES, GENERATED_ACCENTS } from "./accents.generated";

/* ── Appearance — accent, density, corners, text size, accessibility, caret, surface ──
 * <html> attributes and one number, all stored together under one key.
 * Each sits at its default when absent, so a person who never opens the
 * panel carries no attribute and no stored value. Accent colours are in
 * accents.generated.css, density/corners/text size in appearance.css, surface/depth/borders in surface.css. index.html
 * mirrors applyAppearance() before first paint.
 *
 * The five accessibility axes (link underline, motion, animated images,
 * hovercards, URL paste) live here too: they are the same kind of choice —
 * one <html> attribute, one stored value, applied before first paint — so one
 * panel reads one object instead of five. */

export interface AccentMeta {
  /** matches `[data-accent="<id>"]` in accents.generated.css; "cobalt" is the default and has no block. */
  id: string;
  label: string;
  /** the preset's solid accent in light mode, for the picker swatch. */
  swatch: string;
  /** the same in dark mode: the accent a person gets there is lighter than the light one. */
  swatchDark: string;
}

/** Every accent preset, default first, generated with its CSS by scripts/build-tokens.mjs. */
export const ACCENT_PRESETS: readonly AccentMeta[] = GENERATED_ACCENTS;

/** Palettes whose own accent no preset or custom hue replaces (the AAA palette). */
export { FIXED_ACCENT_PALETTES };

export const CUSTOM_ACCENT = "custom";

export type Density = "comfortable" | "compact";
export type Roundness = "sharp" | "default" | "round";
export type UiScale = "small" | "default" | "large";
/** "always" underlines every link at rest; "default" keeps today's rules. */
export type LinkUnderline = "default" | "always";
/** "system" follows the OS; "reduce"/"full" override it in either direction. */
export type MotionPreference = "system" | "reduce" | "full";
/** "play" always animates; "still" never does; "system" follows the motion choice. */
export type AnimatedImages = "play" | "system" | "still";
/** "on" opens a card on hover; "off" opens it on click or keyboard instead. */
export type Hovercards = "on" | "off";
/** "link" turns a pasted bare URL into a link; "plain" keeps the text. */
export type UrlPaste = "link" | "plain";
/** The caret's ink: the accent, the text colour, or one of the block tint inks. */
export const CARET_COLORS = ["accent", "text", "blue", "green", "purple", "red", "orange", "pink"] as const;
export type CaretColor = (typeof CARET_COLORS)[number];
/** "bar" blinking is the native caret; any other choice is drawn by the app (features/theme/model/drawnCaret.ts). */
export type CaretShape = "bar" | "thick" | "block" | "underscore";
export type CaretBlink = "on" | "off";

/** How floating surfaces are drawn: opaque, translucent over a blur (frosted), or frosted plus a coloured canvas and a see-through sidebar (glass). */
export const SURFACES = ["solid", "frosted", "glass"] as const;
export type Surface = (typeof SURFACES)[number];
/** How far panes and menus lift off the canvas, along the e0..e5 ladder. */
export const ELEVATIONS = ["default", "flat", "deep"] as const;
export type Elevation = (typeof ELEVATIONS)[number];
/** The hairline round panes and menus: the palette's, none, or its stronger one. */
export const BORDERS = ["default", "none", "strong"] as const;
export type Borders = (typeof BORDERS)[number];

export interface Appearance {
  /** a preset id, or "custom" to use `hue`. */
  accent: string;
  /** the custom accent's hue in whole degrees, 0..359. */
  hue: number;
  density: Density;
  radius: Roundness;
  uiScale: UiScale;
  linkUnderline: LinkUnderline;
  motion: MotionPreference;
  animatedImages: AnimatedImages;
  hovercards: Hovercards;
  urlPaste: UrlPaste;
  caretColor: CaretColor;
  caretShape: CaretShape;
  caretBlink: CaretBlink;
  surface: Surface;
  elevation: Elevation;
  borders: Borders;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: ACCENT_PRESETS[0].id,
  hue: 260,
  density: "comfortable",
  radius: "default",
  uiScale: "default",
  linkUnderline: "default",
  motion: "system",
  animatedImages: "play",
  hovercards: "on",
  urlPaste: "link",
  caretColor: "accent",
  caretShape: "bar",
  caretBlink: "on",
  surface: "solid",
  elevation: "default",
  borders: "default",
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function parseHue(value: unknown): number {
  const hue = typeof value === "number" ? Math.round(value) + 0 : Number.NaN;
  return hue >= 0 && hue <= 359 ? hue : DEFAULT_APPEARANCE.hue;
}

/** A stored appearance, each field checked on its own: whatever is unknown, out of range or
 *  malformed falls back to that field's default, so a corrupt value never reaches the DOM. */
export function parseAppearance(raw: string | null): Appearance {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    // Unparseable storage is the same as none: the defaults below.
  }
  const accents = [...ACCENT_PRESETS.map((preset) => preset.id), CUSTOM_ACCENT];
  return {
    accent: oneOf(stored.accent, accents, DEFAULT_APPEARANCE.accent),
    hue: parseHue(stored.hue),
    density: oneOf(stored.density, ["comfortable", "compact"], DEFAULT_APPEARANCE.density),
    radius: oneOf(stored.radius, ["sharp", "default", "round"], DEFAULT_APPEARANCE.radius),
    uiScale: oneOf(stored.uiScale, ["small", "default", "large"], DEFAULT_APPEARANCE.uiScale),
    linkUnderline: oneOf(stored.linkUnderline, ["default", "always"], DEFAULT_APPEARANCE.linkUnderline),
    motion: oneOf(stored.motion, ["system", "reduce", "full"], DEFAULT_APPEARANCE.motion),
    animatedImages: oneOf(stored.animatedImages, ["play", "system", "still"], DEFAULT_APPEARANCE.animatedImages),
    hovercards: oneOf(stored.hovercards, ["on", "off"], DEFAULT_APPEARANCE.hovercards),
    urlPaste: oneOf(stored.urlPaste, ["link", "plain"], DEFAULT_APPEARANCE.urlPaste),
    caretColor: oneOf(stored.caretColor, CARET_COLORS, DEFAULT_APPEARANCE.caretColor),
    caretShape: oneOf(stored.caretShape, ["bar", "thick", "block", "underscore"], DEFAULT_APPEARANCE.caretShape),
    caretBlink: oneOf(stored.caretBlink, ["on", "off"], DEFAULT_APPEARANCE.caretBlink),
    surface: oneOf(stored.surface, SURFACES, DEFAULT_APPEARANCE.surface),
    elevation: oneOf(stored.elevation, ELEVATIONS, DEFAULT_APPEARANCE.elevation),
    borders: oneOf(stored.borders, BORDERS, DEFAULT_APPEARANCE.borders),
  };
}
