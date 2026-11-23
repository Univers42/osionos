/**
 * Whether a page cover may be drawn for someone other than its owner (groot ADR 0064 PS35):
 * an image goes through the caller's image-source rule (the app passes isSafeImageSource, the
 * bridge would pass isProfileImageSource from scripts/bridge-image-source.mjs), a gradient through the strict grammar
 * below, which has no url(), var(), quote, comment, escape or declaration break, and allows
 * one level of rgb/rgba/hsl/hsla with numeric arguments. Browser-safe: no imports, no Node API.
 *
 * Caveat: the grammar refuses valid CSS outside it (named colours but `transparent`,
 * `hsl(0 0% 0% / 50%)` slash syntax, repeating/conic gradients, calc()) and an image URL that
 * contains "gradient(". The app unwraps a stored `url:<src>` cover first; a `data:` or `blob:`
 * upload, a ui-collection media ref and anything else refused is not drawn and the profile
 * falls back to the banner (src/shared/lib/media/sharedCover.ts), never repaired.
 */

const COVER_MAX = 2048;
const GRADIENT_MAX = 400;
const GRADIENT = /^(?:linear|radial)-gradient\(([^()]*(?:\([^()]*\)[^()]*)*)\)$/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?)\(([^()]*)\)/g;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUMBER = /^-?(?:\d+|\d*\.\d+)(?:%|deg|grad|rad|turn|px|em|rem)?$/;
const KEYWORDS = new Set([
	'to', 'at', 'top', 'bottom', 'left', 'right', 'center', 'circle', 'ellipse', 'transparent',
	'closest-side', 'closest-corner', 'farthest-side', 'farthest-corner',
]);

/** @param {string} token */
function isGradientToken(token) {
	return HEX.test(token) || NUMBER.test(token) || KEYWORDS.has(token.toLowerCase());
}

/** The gradient's arguments with each numeric colour function replaced by a hex token; null
 *  when one has a non-numeric argument. @param {string} args @returns {string | null} */
function flattenColours(args) {
	let numeric = true;
	const flat = args.replace(COLOUR_FUNCTION, (_, inner) => {
		if (!inner.split(',').every((arg) => NUMBER.test(arg.trim()))) numeric = false;
		return ' #000 ';
	});
	return numeric ? flat : null;
}

/** @param {unknown} value @returns {boolean} */
export function isSafeGradientCover(value) {
	if (typeof value !== 'string' || value.length > GRADIENT_MAX) return false;
	const match = GRADIENT.exec(value);
	const flat = match ? flattenColours(match[1]) : null;
	if (flat === null || /[()]/.test(flat)) return false;
	return flat.split(/[\s,]+/).filter(Boolean).every(isGradientToken);
}

/** @param {unknown} value @param {(image: string) => boolean} isSafeImage @returns {boolean} */
export function isSafeSharedCover(value, isSafeImage) {
	if (typeof value !== 'string' || value.trim() === '' || value.length > COVER_MAX) return false;
	return value.includes('gradient(') ? isSafeGradientCover(value) : isSafeImage(value);
}
