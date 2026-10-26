/**
 * Keyboard-combo normalization. Both a live KeyboardEvent and a stored combo
 * string collapse to the SAME canonical form ("mod+shift+z"), so matching is a
 * plain string compare. `mod` abstracts Ctrl (non-mac) / Cmd (mac).
 */

const MODIFIER_ORDER = ["mod", "alt", "shift"] as const;

const NAMED_KEYS: Record<string, string> = {
  Escape: "escape",
  Delete: "delete",
  Backspace: "backspace",
  Tab: "tab",
  Enter: "enter",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  PageUp: "pageup",
  PageDown: "pagedown",
  Home: "home",
  End: "end",
  " ": "space",
  // "+" is also the separator in a combo string, so the key needs a name.
  "+": "plus",
};

/** ARIA names the two keys whose KeyboardEvent.key is punctuation. */
const ARIA_KEY_NAMES: Record<string, string> = { " ": "space", "+": "plus" };

function ariaCanonical(shortcut: string): string {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  return [...parts.sort(), key].join("+");
}

/**
 * True when an `aria-keyshortcuts` list names the pressed combination: the
 * widget that declares a key handles it, so a global binding must not take it.
 * Caveat: compares KeyboardEvent.key, so a layout where Shift changes the key
 * (Shift+1 → "!") matches only when the list names the shifted key.
 */
export function ariaShortcutsInclude(list: string, event: KeyboardEvent): boolean {
  const mods = [event.altKey && "alt", event.ctrlKey && "control", event.metaKey && "meta", event.shiftKey && "shift"];
  const pressed = [...mods.filter(Boolean), ARIA_KEY_NAMES[event.key] ?? event.key.toLowerCase()].join("+");
  return list.split(/\s+/).some((shortcut) => shortcut !== "" && ariaCanonical(shortcut) === pressed);
}

/** True for the bare modifier keys (a combo is never just "Shift"). */
export function isModifierKey(key: string): boolean {
  return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
}

function normalizeKey(key: string): string {
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

export function normalizeComboFromEvent(event: KeyboardEvent): string {
  const mods: string[] = [];
  if (event.metaKey || event.ctrlKey) mods.push("mod");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  return [...MODIFIER_ORDER.filter((mod) => mods.includes(mod)), normalizeKey(event.key)].join("+");
}

export function normalizeComboString(combo: string): string {
  const mods = new Set<string>();
  let key = "";
  for (const raw of combo.toLowerCase().split("+")) {
    const part = raw.trim();
    if (!part) continue;
    if (["mod", "ctrl", "control", "cmd", "meta", "command"].includes(part)) mods.add("mod");
    else if (part === "alt" || part === "option") mods.add("alt");
    else if (part === "shift") mods.add("shift");
    else key = part;
  }
  return [...MODIFIER_ORDER.filter((mod) => mods.has(mod)), key].filter(Boolean).join("+");
}

/** Steps of a (possibly chorded) binding — VSCode style, space-separated:
 *  "mod+k mod+z" → ["mod+k", "mod+z"]. A single combo yields one step. */
export function comboSteps(combo: string): string[] {
  return combo.trim().split(/\s+/).filter(Boolean).map(normalizeComboString);
}

/** Human label, e.g. "mod+shift+z" → "Ctrl + Shift + Z";
 *  a chord "mod+k mod+z" → "Ctrl + K, then Ctrl + Z". */
export function formatCombo(combo: string): string {
  return comboSteps(combo)
    .map((step) =>
      step
        .split("+")
        .map((part) => (part === "mod" ? "Ctrl" : part.charAt(0).toUpperCase() + part.slice(1)))
        .join(" + "),
    )
    .join(", then ");
}
