// The app's colour tokens are generated at build time from OKLCH seeds and
// written as hex, because Monaco and the graph engine only parse hex. This
// module is the colour maths that generator uses: hex <-> OKLCH conversion,
// an sRGB gamut check, gamut mapping, and WCAG contrast.

// Float noise puts a colour sitting exactly on the gamut edge (pure green
// comes back as 1.0000001) a hair out of range, so that hair counts as in.
// Ponytail: a colour really outside by less than this is clamped instead of
// losing chroma — at most one 8-bit step on one channel, near black.
const GAMUT_TOLERANCE = 0.0001;

// Below this chroma a colour is grey, and a grey has no meaningful hue.
const GREY_CHROMA = 0.0001;

const clamp = (value, max) => Math.min(max, Math.max(0, value));

function decodeChannel(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function encodeChannel(v) {
  const c = clamp(v, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklchToLinearRgb({ l: lightness, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const long = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const medium = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const short = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l3 = long ** 3;
  const m3 = medium ** 3;
  const s3 = short ** 3;
  return {
    r: 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  };
}

/** "#RGB" or "#RRGGBB" (any case) to 8-bit sRGB channels 0..255; throws TypeError on anything else. */
export function hexToRgb(hex) {
  if (typeof hex !== "string" || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new TypeError(`Not a #RGB or #RRGGBB hex colour: ${String(hex)}`);
  }
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB channels (rounded, clamped to 0..255) to an upper-case 6-digit "#RRGGBB". */
export function rgbToHex({ r, g, b }) {
  const byte = (v) => clamp(Math.round(v), 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** Hex colour to OKLCH (l 0..1, c >= 0, h degrees in [0, 360); greys report h = 0). */
export function hexToOklch(hex) {
  const { r, g, b: blue } = hexToRgb(hex);
  const R = decodeChannel(r / 255);
  const G = decodeChannel(g / 255);
  const B = decodeChannel(blue / 255);
  const long = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const medium = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const short = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  const c = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h: c < GREY_CHROMA ? 0 : h };
}

/** True when OKLCH (l 0..1, c >= 0, h degrees) lands inside the sRGB gamut (within a small tolerance). */
export function isInGamut({ l, c, h }) {
  const { r, g, b } = oklchToLinearRgb({ l, c, h });
  return [r, g, b].every((v) => v >= -GAMUT_TOLERANCE && v <= 1 + GAMUT_TOLERANCE);
}

/** OKLCH (l 0..1, c >= 0, h degrees) to "#RRGGBB"; out-of-gamut colours lose chroma only. */
export function oklchToHex({ l, c, h }) {
  if (l >= 1) return "#FFFFFF";
  if (l <= 0) return "#000000";
  let chroma = c;
  if (!isInGamut({ l, c: chroma, h })) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2;
      if (isInGamut({ l, c: mid, h })) low = mid;
      else high = mid;
    }
    chroma = low;
  }
  const { r, g, b } = oklchToLinearRgb({ l, c: chroma, h });
  return rgbToHex({ r: encodeChannel(r) * 255, g: encodeChannel(g) * 255, b: encodeChannel(b) * 255 });
}

/** WCAG 2 relative luminance (0..1) of a hex colour. */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * decodeChannel(r / 255) + 0.7152 * decodeChannel(g / 255) + 0.0722 * decodeChannel(b / 255);
}

/** WCAG 2 contrast ratio (1..21) between two hex colours; symmetric. */
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
