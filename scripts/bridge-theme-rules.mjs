/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-theme-rules.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The shape a theme document and a profile document must have, checked on both sides of the
 * trust boundary: the app imports this file (src/shared/config/themeDoc.ts) and the bridge
 * refuses a stored theme or profile with the same rules. It knows nothing of the token catalog
 * or of CSS grammar — that is the app's half — so it only guarantees what keeps a value inside
 * one CSS declaration and a row inside its size limit. Browser-safe: no imports, no Node API.
 */

export const THEME_LIMITS = Object.freeze({
	themes: 24,
	profiles: 12,
	nameMax: 48,
	slugMax: 24,
	keysPerGroup: 200,
	valueMax: 160,
	docBytes: 12288,
	preferenceKeys: 20,
	preferenceValueMax: 32,
});

export const THEME_GROUPS = Object.freeze(['colors', 'layout', 'fonts']);
export const THEME_BASES = Object.freeze(['light', 'dark']);
export const TOKEN_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const THEME_FIELDS = new Set(['name', 'base', 'palette', ...THEME_GROUPS]);
const PROFILE_FIELDS = new Set(['name', 'theme', 'preferences']);
const PALETTE_RE = /^[a-z-]{1,32}$/;
// What could end the declaration, open a rule, load a resource or reach another variable.
const FORBIDDEN_RE = /url\(|var\(|expression\(|[;{}<>\\!@]/i;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} name */
function isName(name) {
	return typeof name === 'string' && name.trim().length > 0 && name.length <= THEME_LIMITS.nameMax;
}

/** @param {unknown} value @returns {boolean} */
export function isSafeTokenValue(value) {
	return typeof value === 'string'
		&& value.length > 0
		&& value.length <= THEME_LIMITS.valueMax
		&& !FORBIDDEN_RE.test(value);
}

/** The storage key of a theme name; '' when the name holds no letter or digit. @param {string} name */
export function themeSlug(name) {
	return String(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, THEME_LIMITS.slugMax + 1)
		.replace(/^-+|-+$/g, '')
		.slice(0, THEME_LIMITS.slugMax)
		.replace(/-+$/, '');
}

/** @param {string} group @param {unknown} tokens @param {string[]} errors */
function checkGroup(group, tokens, errors) {
	if (!isPlainObject(tokens)) {
		errors.push(`${group}: must be an object of token names to values`);
		return;
	}
	const keys = Object.keys(tokens);
	if (keys.length > THEME_LIMITS.keysPerGroup) {
		errors.push(`${group}: at most ${THEME_LIMITS.keysPerGroup} tokens, found ${keys.length}`);
		return;
	}
	for (const key of keys) {
		if (!TOKEN_KEY_RE.test(key) || key.length > 48) {
			errors.push(`${group}.${key}: a token name is lowercase words joined by dashes`);
		} else if (!isSafeTokenValue(tokens[key])) {
			errors.push(`${group}.${key}: must be a string of 1–${THEME_LIMITS.valueMax} characters without ; { } < > \\ ! @, url(, var( or expression(`);
		}
	}
}

/**
 * Every structural problem of a theme document, each message starting with its path;
 * [] when the shape is sound.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function checkThemeShape(doc) {
	if (!isPlainObject(doc)) return ['theme: must be a JSON object'];
	const errors = [];
	for (const key of Object.keys(doc)) {
		if (!THEME_FIELDS.has(key)) errors.push(`${key}: unknown field; a theme has name, base, palette, colors, layout and fonts`);
	}
	if (!isName(doc.name)) errors.push(`name: 1–${THEME_LIMITS.nameMax} characters`);
	if (doc.base !== undefined && !THEME_BASES.includes(/** @type {string} */ (doc.base))) errors.push('base: "light" or "dark"');
	if (doc.palette !== undefined && (typeof doc.palette !== 'string' || !PALETTE_RE.test(doc.palette))) {
		errors.push('palette: a palette id, lowercase letters and dashes');
	}
	for (const group of THEME_GROUPS) {
		if (doc[group] !== undefined) checkGroup(group, doc[group], errors);
	}
	if (new TextEncoder().encode(JSON.stringify(doc)).length > THEME_LIMITS.docBytes) {
		errors.push('theme: larger than 12 KB of JSON');
	}
	return errors;
}

/** @param {unknown} preferences @param {string[]} errors */
function checkPreferences(preferences, errors) {
	if (!isPlainObject(preferences)) {
		errors.push('preferences: must be an object');
		return;
	}
	const keys = Object.keys(preferences);
	if (keys.length > THEME_LIMITS.preferenceKeys) {
		errors.push(`preferences: at most ${THEME_LIMITS.preferenceKeys} keys, found ${keys.length}`);
		return;
	}
	for (const key of keys) {
		const value = preferences[key];
		const ok = typeof value === 'boolean'
			|| (typeof value === 'number' && Number.isFinite(value))
			|| (isSafeTokenValue(value) && /** @type {string} */ (value).length <= THEME_LIMITS.preferenceValueMax);
		if (!TOKEN_KEY_RE.test(key.toLowerCase()) || !ok) errors.push(`preferences.${key}: a short string, a number or true/false`);
	}
}

/**
 * Every structural problem of a profile document; [] when the shape is sound. An inline theme
 * is checked as a theme, its messages prefixed with `theme.`.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function checkProfileShape(doc) {
	if (!isPlainObject(doc)) return ['profile: must be a JSON object'];
	const errors = [];
	for (const key of Object.keys(doc)) {
		if (!PROFILE_FIELDS.has(key)) errors.push(`${key}: unknown field; a profile has name, theme and preferences`);
	}
	if (!isName(doc.name)) errors.push(`name: 1–${THEME_LIMITS.nameMax} characters`);
	const theme = doc.theme;
	if (isPlainObject(theme)) errors.push(...checkThemeShape(theme).map((message) => `theme.${message}`));
	else if (theme !== null && theme !== undefined && !isName(theme)) errors.push('theme: a theme name, a theme object or null');
	checkPreferences(doc.preferences ?? {}, errors);
	return errors;
}
