// Monaco's defineTheme() and the editor palette parse only hex and rgb(), while
// the custom accent is oklch(L C var(--osio-accent-hue)). A value neither form
// covers is painted onto a 1x1 canvas and read back, which lets the browser's
// own colour parser do the conversion.
//
// Ponytail: the result is opaque #RRGGBB or null. A translucent colour is null,
// not flattened, so the caller keeps its own alpha default instead of getting a
// solid where it wanted a tint. The cache is keyed by the input string and never
// evicted: it grows with the number of distinct colours read in a session, which
// a hue slider bounds at a few per degree dragged. The canvas rounds to 8 bits,
// so the hex can differ by one step from what the page paints at wide gamut.

interface ProbeContext {
  fillStyle: unknown;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: ArrayLike<number> };
}

const byte = (value: number) => value.toString(16).padStart(2, "0").toUpperCase();

function probe(context: ProbeContext, css: string): string | null {
  // An invalid colour leaves fillStyle unchanged, so a valid one reads back the
  // same after either sentinel and an invalid one reads back as the sentinel.
  context.fillStyle = "#000000";
  context.fillStyle = css;
  const afterBlack = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = css;
  if (context.fillStyle !== afterBlack) return null;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] === 255 ? `#${byte(pixel[0])}${byte(pixel[1])}${byte(pixel[2])}` : null;
}

/** A resolver over `getContext`'s canvas, with its own cache; null when no canvas exists. */
export function createCssColorResolver(getContext: () => ProbeContext | null): (css: string) => string | null {
  const cache = new Map<string, string | null>();
  return (css) => {
    if (cache.has(css)) return cache.get(css) ?? null;
    const context = getContext();
    if (!context) return null;
    const resolved = probe(context, css);
    cache.set(css, resolved);
    return resolved;
  };
}

let shared: ProbeContext | null = null;

function documentContext(): ProbeContext | null {
  if (typeof document === "undefined") return null;
  if (!shared) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    shared = canvas.getContext("2d", { willReadFrequently: true });
  }
  return shared;
}

/** Any CSS colour the browser parses to opaque "#RRGGBB"; null for invalid, unresolved or translucent values. */
export const resolveCssColor = createCssColorResolver(documentContext);
