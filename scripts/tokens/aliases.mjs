// The names components read, each pointing at the token that holds its colour.
// These are the same in every palette and mode, so the stylesheet states them
// once; a palette only supplies the tokens they point at (ramps.mjs).
//
// An alias may point at another alias. That is deliberate where two names must
// never drift apart: the Update button and links are the accent.

export const ALIASES = {
  "--osio-bg-canvas": "--osio-n-0",
  "--osio-bg-surface": "--osio-n-1",
  "--osio-bg-panel": "--osio-bg-surface",
  "--osio-bg-page": "--osio-n-1",
  "--osio-bg-subtle": "--osio-n-3",
  "--osio-bg-muted": "--osio-n-4",
  "--osio-bg-hover": "--osio-n-5",
  "--osio-bg-elevated": "--osio-n-6",
  "--osio-border-default": "--osio-n-7",
  "--osio-border": "--osio-border-default",
  "--osio-border-strong": "--osio-n-8",
  "--osio-fg-subtle": "--osio-n-9",
  "--osio-fg-muted": "--osio-n-10",
  "--osio-fg-default": "--osio-n-11",
  "--osio-fg-strong": "--osio-n-12",
  "--osio-fg-inverse": "--osio-bg-surface",

  "--osio-accent": "--osio-a-solid",
  "--osio-accent-hover": "--osio-a-hover",
  "--osio-accent-fg": "--osio-a-fg",
  "--osio-accent-text": "--osio-a-text",
  "--osio-accent-subtle": "--osio-a-subtle",
  "--osio-update": "--osio-accent",
  "--osio-update-hover": "--osio-accent-hover",
  "--osio-update-fg": "--osio-accent-fg",
  "--osio-link": "--osio-accent-text",
  "--osio-link-hover": "--osio-accent-hover",

  "--osio-danger-fg": "--osio-fg-inverse",
  "--osio-success-fg": "--osio-fg-inverse",
  "--osio-warning-fg": "--osio-fg-inverse",

  "--osio-syntax-keyword": "--osio-block-tint-pink-fg",
  "--osio-syntax-string": "--osio-block-tint-green-fg",
  "--osio-syntax-number": "--osio-block-tint-blue-fg",
  "--osio-syntax-comment": "--osio-fg-subtle",
  "--osio-syntax-function": "--osio-block-tint-purple-fg",
  "--osio-syntax-type": "--osio-block-tint-orange-fg",
  "--osio-syntax-property": "--osio-block-tint-blue-fg",
  "--osio-syntax-tag": "--osio-block-tint-green-fg",
  "--osio-syntax-attr": "--osio-block-tint-purple-fg",
  "--osio-syntax-literal": "--osio-block-tint-brown-fg",

  "--osio-graph-bg-0": "--osio-bg-page",
  "--osio-graph-ink-muted": "--osio-fg-muted",
  "--osio-graph-card-bg": "--osio-bg-surface",
  "--osio-graph-card-border": "--osio-border-default",
  "--osio-graph-select": "--osio-accent",
  "--osio-graph-note": "--osio-warning",
};

/** `tokens` plus every alias, each resolved to the literal colour it ends at; throws on a dangling or circular alias. */
export function resolveTokens(tokens) {
  const shadowed = Object.keys(ALIASES).filter((name) => name in tokens);
  if (shadowed.length > 0) throw new Error(`defined both as a colour and as an alias: ${shadowed.join(", ")}`);
  const resolved = { ...tokens };
  const follow = (name, seen) => {
    if (name in resolved) return resolved[name];
    const target = ALIASES[name];
    if (target === undefined) throw new Error(`${seen[0]} points at ${name}, which nothing defines`);
    if (seen.includes(target)) throw new Error(`${seen[0]} is a circular alias`);
    return follow(target, [...seen, target]);
  };
  for (const name of Object.keys(ALIASES)) resolved[name] = follow(name, [name]);
  return resolved;
}
