// Shared probes for the surface specs: set <html> data attributes, read the computed facts of one
// surface, and parse and composite the colours Chromium reports.
//
// Ponytail: parseColor reads only rgb()/rgba()/color(srgb ...) strings, which is what
// getComputedStyle returns for the colours these specs use; an oklch() or lab() string would read
// as garbage, and a contrast figure built on it would be wrong in either direction.

export const html = (page) => page.locator("html");
export const setAttrs = (page, attrs) => page.evaluate((a) => Object.assign(document.documentElement.dataset, a), attrs);
export const clearAttrs = (page, names) => page.evaluate((n) => n.forEach((k) => delete document.documentElement.dataset[k]), names);

/** "rgb(1, 2, 3)", "rgba(1, 2, 3, .5)" or "color(srgb .1 .2 .3 / .5)" as {rgb: [0..255 x3], a}. */
export function parseColor(text) {
  const nums = (text.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
  const rgb = text.startsWith("color(") ? nums.slice(0, 3).map((v) => v * 255) : nums.slice(0, 3);
  return { rgb, a: nums[3] ?? 1 };
}

/** Computed facts of one surface: blur, background alpha, shadow, border and box. */
export const probe = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const alpha = (cs.backgroundColor.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? (cs.backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? "1";
    const r = el.getBoundingClientRect();
    return { blur: cs.backdropFilter, alpha: Number(alpha), shadow: cs.boxShadow, border: cs.borderTopColor, box: [r.x, r.y, r.width, r.height].map(Math.round) };
  });

const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** The colour `top` (with alpha) makes over an opaque `under`. */
export const composite = (top, under) => top.rgb.map((c, i) => c * top.a + under[i] * (1 - top.a));

/** WCAG contrast ratio of two opaque rgb triples. */
export function contrastRatio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
