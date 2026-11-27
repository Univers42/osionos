/**
 * The pure half of "Your appearance": which axes differ from the default, and the JSON a
 * person copies out of one device and applies on another. Import is the trust boundary: the
 * text is parsed, size-capped and checked field by field before any of it reaches the store.
 */

import { DEFAULT_APPEARANCE, PALETTES, parseAppearance, type Appearance, type ThemeMode } from '../../../shared/config/theme';
import { parseThemeDoc, type ThemeDoc } from '../../../shared/config/themeDoc';
import { isShippedThemeName } from '../../../shared/config/themes';

export const APPEARANCE_KIND = 'osionos-appearance';
export const APPEARANCE_VERSION = 1;
export const MAX_IMPORT_CHARS = 150_000;

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export type ImportResult =
  | { ok: true; appearance: Appearance; palette?: string; mode?: ThemeMode; theme?: ThemeDoc; themeName?: string; warnings: string[]; count: number }
  | { ok: false; error: string };

const axisNames = (): (keyof Appearance)[] => Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[];

/** Only the keys of `appearance` whose value is not the default. */
export function diffFromDefault(appearance: Appearance): Partial<Appearance> {
  const changed: Record<string, unknown> = {};
  for (const key of axisNames()) {
    if (appearance[key] !== DEFAULT_APPEARANCE[key]) changed[key] = appearance[key];
  }
  return changed as Partial<Appearance>;
}

/** Whether any of the given axes is off its default. */
export function isChanged(appearance: Appearance, keys: readonly (keyof Appearance)[]): boolean {
  return keys.some((key) => appearance[key] !== DEFAULT_APPEARANCE[key]);
}

/** The patch that puts the given axes back to their defaults. */
export function defaultsFor(keys: readonly (keyof Appearance)[]): Partial<Appearance> {
  const patch: Record<string, unknown> = {};
  for (const key of keys) patch[key] = DEFAULT_APPEARANCE[key];
  return patch as Partial<Appearance>;
}

/** The appearance, the colour theme and the mode as pretty JSON; defaults are left out of `appearance`. An own `theme` travels whole, a shipped one by `themeName`. */
export function exportAppearance(input: { appearance: Appearance; palette: string; mode: ThemeMode; theme?: ThemeDoc | null }): string {
  const theme = input.theme ?? null;
  const themeKeys = theme ? (isShippedThemeName(theme.name) ? { themeName: theme.name } : { theme }) : {};
  return JSON.stringify(
    { kind: APPEARANCE_KIND, version: APPEARANCE_VERSION, appearance: diffFromDefault(input.appearance), palette: input.palette, mode: input.mode, ...themeKeys },
    null,
    2,
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type ThemePart = { theme?: ThemeDoc; themeName?: string; warnings: string[] };

/** The theme an export carries: a valid own doc, or a shipped name; anything else is dropped, with a warning when a doc was present but invalid. */
function readTheme(doc: Record<string, unknown>): ThemePart {
  const warnings: string[] = [];
  let theme: ThemeDoc | undefined;
  if (doc.theme !== undefined) {
    const parsed = parseThemeDoc(doc.theme);
    const error = parsed.issues.find((issue) => issue.severity === 'error');
    if (parsed.doc && !error) theme = parsed.doc;
    else warnings.push(`The theme in this file was skipped: ${error ? `${error.path.join('.') || 'theme'}: ${error.message}` : 'not a theme'}`);
  }
  const themeName = typeof doc.themeName === 'string' && isShippedThemeName(doc.themeName) ? doc.themeName : undefined;
  return { theme, themeName: theme ? undefined : themeName, warnings };
}

/** Validates exported text. Unknown palette ids and modes are dropped, junk axis values fall back to their default; `count` is the number of axes that end up off default. */
export function importAppearance(text: string): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: `That is too long: the limit is ${MAX_IMPORT_CHARS} characters.` };
  const doc = parseJson(text);
  if (doc === undefined) return { ok: false, error: 'That is not valid JSON.' };
  if (!isRecord(doc) || doc.kind !== APPEARANCE_KIND) return { ok: false, error: `This is not an osionos appearance: "kind" must be "${APPEARANCE_KIND}".` };
  if (doc.version !== APPEARANCE_VERSION) return { ok: false, error: `Unsupported version: expected ${APPEARANCE_VERSION}.` };
  const axes = isRecord(doc.appearance) ? doc.appearance : {};
  const appearance = parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, ...axes }));
  const palette = PALETTES.find((candidate) => candidate.id === doc.palette)?.id;
  const mode = MODES.find((candidate) => candidate === doc.mode);
  return { ok: true, appearance, palette, mode, ...readTheme(doc), count: Object.keys(diffFromDefault(appearance)).length };
}
