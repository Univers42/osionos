// The shape check behind `build-tokens --check`. The graph engine and Monaco
// parse only "#RRGGBB" and comma-separated rgba(), and a mistyped pin is the
// likeliest way for something else to reach them.
//
// Ponytail: this checks the written form, not the gamut. Seeds are gamut-mapped
// by oklch.mjs (a tone outside sRGB loses chroma), so only a pin can be out of
// range, and a pin outside "#RRGGBB" is caught here. A pin that is a valid but
// unintended colour is not.

const HEX = /^#[0-9A-F]{6}$/;
const RGBA = /^rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), (0|1|0?\.\d+)\)$/;
const CHANNELS = /^\d{1,3} \d{1,3} \d{1,3}$/;

const inByteRange = (values) => values.every((value) => Number(value) <= 255);

function isUsable(name, value) {
  if (name === "--osio-shadow-rgb") return CHANNELS.test(value) && inByteRange(value.split(" "));
  if (HEX.test(value)) return true;
  const rgba = RGBA.exec(value);
  return rgba !== null && inByteRange(rgba.slice(1, 4));
}

/** The [name, value] entries of resolved `tokens` (aliases included) that are not a usable literal colour. */
export function malformedTokens(tokens) {
  return Object.entries(tokens).filter(([name, value]) => !isUsable(name, value));
}
