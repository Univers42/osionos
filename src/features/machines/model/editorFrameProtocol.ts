// What the app and the node's editor page may say to each other (devil verdict 2026-11-01 editor on
// disk, F1): the app's half of the rule that no app code holds a path, a listing or file content.
// Past the terminal's credential messages, the app may ask to show a file by an opaque key, ask for
// the picker, and send its theme. The page may name a file's base name and whether it has unsaved
// changes. Each reader takes unknown input and answers null for anything else, so a new message
// type is a change here, not a stray handler somewhere.

export const EDITOR_OPEN = "osionos-editor/open";
export const EDITOR_PICK = "osionos-editor/pick";
export const EDITOR_THEME = "osionos-editor/theme";
export const EDITOR_OPEN_TAB = "osionos-editor/open-tab";
export const EDITOR_TITLE = "osionos-editor/title";
/** The node-origin pages' own channel: secrets, folder lists, "Open in terminal". */
export const EDITOR_CHANNEL = "osionos-editor";
export const EDITOR_SHOW_TERMINAL = "osionos-editor/show-terminal";

const KEY = /^[a-z0-9]{16,32}$/;
const MAX_TITLE = 255;
const THEME_ATTRIBUTES = ["theme", "palette", "accent", "density", "radius", "uiScale"] as const;
const THEME_VALUE = /^[a-z0-9-]{1,32}$/;
const ACCENT_HUE = /^\d{1,3}(\.\d+)?$/;

export type EditorTheme = Partial<Record<(typeof THEME_ATTRIBUTES)[number], string>> & {
  accentHue?: string;
  /** A theme's own `--osio-*` values, which the page's stylesheet cannot know. */
  tokens?: Record<string, string>;
};

export type AppToEditor =
  | { type: typeof EDITOR_OPEN; key: string }
  | { type: typeof EDITOR_PICK }
  | { type: typeof EDITOR_THEME; theme: EditorTheme };

export type EditorToApp =
  | { type: typeof EDITOR_OPEN_TAB; key: string; title: string }
  | { type: typeof EDITOR_TITLE; key: string; title: string; dirty: boolean }
  | { type: typeof EDITOR_SHOW_TERMINAL };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isKey = (value: unknown): value is string => typeof value === "string" && KEY.test(value);
// A base name, nothing that could carry a path: the page may only ever name the file's own name.
const isTitle = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_TITLE && !value.includes("/") && !value.includes("\\");

const MAX_THEME_TOKENS = 512;
const TOKEN_NAME = /^--osio-[a-z0-9-]{1,64}$/;
// What a token's value may hold: no semicolon, brace or backslash, and url() is refused below, so
// the app can repaint this page and never make it load anything.
const TOKEN_VALUE = /^[\w\s#%.,()"'/+*-]{1,240}$/;

function readTokens(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_THEME_TOKENS) return null;
  const tokens: Record<string, string> = {};
  for (const [name, token] of entries) {
    if (!TOKEN_NAME.test(name) || typeof token !== "string" || !TOKEN_VALUE.test(token) || /url\s*\(/i.test(token)) return null;
    tokens[name] = token;
  }
  return tokens;
}

function readTheme(value: unknown): EditorTheme | null {
  if (!isRecord(value)) return null;
  const theme: EditorTheme = {};
  for (const name of THEME_ATTRIBUTES) {
    const attribute = value[name];
    if (attribute === undefined) continue;
    if (typeof attribute !== "string" || !THEME_VALUE.test(attribute)) return null;
    theme[name] = attribute;
  }
  if (value.accentHue !== undefined) {
    if (typeof value.accentHue !== "string" || !ACCENT_HUE.test(value.accentHue)) return null;
    theme.accentHue = value.accentHue;
  }
  if (value.tokens !== undefined) {
    const tokens = readTokens(value.tokens);
    if (!tokens) return null;
    theme.tokens = tokens;
  }
  return theme;
}

export function readAppToEditor(data: unknown): AppToEditor | null {
  if (!isRecord(data)) return null;
  if (data.type === EDITOR_PICK) return { type: EDITOR_PICK };
  if (data.type === EDITOR_OPEN) return isKey(data.key) ? { type: EDITOR_OPEN, key: data.key } : null;
  if (data.type === EDITOR_THEME) {
    const theme = readTheme(data.theme);
    return theme ? { type: EDITOR_THEME, theme } : null;
  }
  return null;
}

export function readEditorToApp(data: unknown): EditorToApp | null {
  if (!isRecord(data)) return null;
  if (data.type === EDITOR_SHOW_TERMINAL) return { type: EDITOR_SHOW_TERMINAL };
  if (data.type === EDITOR_OPEN_TAB) {
    return isKey(data.key) && isTitle(data.title) ? { type: EDITOR_OPEN_TAB, key: data.key, title: data.title } : null;
  }
  if (data.type === EDITOR_TITLE) {
    return isKey(data.key) && isTitle(data.title) && typeof data.dirty === "boolean"
      ? { type: EDITOR_TITLE, key: data.key, title: data.title, dirty: data.dirty }
      : null;
  }
  return null;
}
