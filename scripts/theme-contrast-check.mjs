/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-contrast-check.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 13:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 13:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Independent WCAG contrast gate for every osionos color palette (data-palette ×
 * light/dark). Parses the `[data-palette=...][data-theme=...]` blocks straight
 * out of global.css and asserts the critical foreground/background pairs meet
 * AA (>=4.5:1 text, >=3:1 large/UI) — AAA (>=7:1) for the High-Contrast theme.
 * Run: node scripts/theme-contrast-check.mjs   (from apps/osionos/app)
 */

import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../src/app/styles/global.css', import.meta.url), 'utf8');

function lum(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const c = [m[1], m[2], m[3]].map((h) => {
    const s = parseInt(h, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pull every --osio-*: <hex>; from a `[data-palette="id"][data-theme="mode"]{}` block. */
function parseBlock(id, mode) {
  const re = new RegExp(`\\[data-palette="${id}"\\]\\[data-theme="${mode}"\\]\\s*\\{([^}]*)\\}`);
  const m = re.exec(CSS);
  if (!m) return null;
  const tokens = {};
  for (const line of m[1].split('\n')) {
    const t = /--osio-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/.exec(line);
    if (t) tokens[t[1]] = t[2];
  }
  return tokens;
}

// The default Warm theme has no data-palette block (it IS the base); bake its
// values so the gate covers all 8 themes.
const WARM = {
  light: { 'bg-page': '#FAF9F5', 'bg-surface': '#FFFFFF', 'fg-default': '#1A1A18', 'fg-muted': '#6B6862', 'fg-subtle': '#6F6B63', 'fg-strong': '#0F0F0E', accent: '#CC785C', 'accent-fg': '#FFFFFF', 'accent-text': '#B5532E', update: '#2563EB', 'update-fg': '#FFFFFF', danger: '#B42318', 'danger-fg': '#FFFFFF', success: '#287D3C', 'success-fg': '#FFFFFF', warning: '#B45309', 'warning-fg': '#FFFFFF', 'syntax-keyword': '#B5532E', 'syntax-string': '#287D3C', 'syntax-number': '#1F6FB2', 'syntax-comment': '#8C877D', 'syntax-function': '#7156A5', 'syntax-type': '#9A5418', 'syntax-property': '#1F6FB2', 'syntax-tag': '#287D3C', 'syntax-attr': '#7156A5', 'syntax-literal': '#6B4A2E' },
  dark: { 'bg-page': '#1B1A17', 'bg-surface': '#242120', 'fg-default': '#EDEAE3', 'fg-muted': '#A8A399', 'fg-subtle': '#8C877D', 'fg-strong': '#FBF8F2', accent: '#E0937A', 'accent-fg': '#1B1A17', 'accent-text': '#E8A78F', update: '#3B82F6', 'update-fg': '#0B1220', danger: '#F2998C', 'danger-fg': '#1B1A17', success: '#6FC27F', 'success-fg': '#1B1A17', warning: '#E0A958', 'warning-fg': '#1B1A17', 'syntax-keyword': '#E8A78F', 'syntax-string': '#9BD9AE', 'syntax-number': '#8FC2DE', 'syntax-comment': '#8C877D', 'syntax-function': '#C3AEE6', 'syntax-type': '#E0A958', 'syntax-property': '#8FC2DE', 'syntax-tag': '#9BD9AE', 'syntax-attr': '#C3AEE6', 'syntax-literal': '#8FC2DE' },
};

const PALETTES = ['mono', 'contrast', 'maximal', 'nord', 'solarized', 'midnight', 'rose'];
const SYNTAX = ['keyword', 'string', 'number', 'comment', 'function', 'type', 'property', 'tag', 'attr', 'literal'];

let failures = 0;
let checks = 0;
let allowed = 0;

// Pre-existing, intentional tradeoffs in the default Warm theme (kept byte-
// identical by design). Each is a known sub-AA pair with a one-line reason; new
// palettes get NO exemptions. Reason: warm accent is a 3:1 *fill* color (button
// labels) — small accent text uses --osio-accent-text (#B5532E, passes); the
// syntax comment hue is muted by design.
const ALLOW = new Set([
  'warm/light accentFg/accent',     // white on terracotta button fill — 3:1 fill, not small text
  'warm/light syn:comment/bgSurface', // muted comment hue (editorial), ~3.6:1
  'warm/dark syn:comment/bgSurface',  // muted comment hue (editorial), ~4.5:1
]);

function check(theme, mode, label, fg, bg, min) {
  checks++;
  const r = ratio(fg, bg);
  if (r == null) { console.log(`  FAIL ${theme}/${mode} ${label}: missing token (${fg} on ${bg})`); failures++; return; }
  if (r < min) {
    const key = `${theme}/${mode} ${label}`;
    if (ALLOW.has(key)) { console.log(`  ALLOW ${key}: ${r.toFixed(2)} (pre-existing warm tradeoff)`); allowed++; return; }
    console.log(`  FAIL ${theme}/${mode} ${label}: ${r.toFixed(2)} < ${min} (${fg} on ${bg})`);
    failures++;
  }
}

function audit(theme, mode, t) {
  const aaa = theme === 'contrast';
  const body = aaa ? 7 : 4.5;
  check(theme, mode, 'fgDefault/bgPage', t['fg-default'], t['bg-page'], body);
  check(theme, mode, 'fgDefault/bgSurface', t['fg-default'], t['bg-surface'], 4.5);
  check(theme, mode, 'fgMuted/bgPage', t['fg-muted'], t['bg-page'], 4.5);
  check(theme, mode, 'fgSubtle/bgPage', t['fg-subtle'], t['bg-page'], 3);
  check(theme, mode, 'fgStrong/bgPage', t['fg-strong'], t['bg-page'], body);
  check(theme, mode, 'accentFg/accent', t['accent-fg'], t.accent, 4.5);
  check(theme, mode, 'accentText/bgSurface', t['accent-text'], t['bg-surface'], 4.5);
  for (const s of ['danger', 'success', 'warning', 'update']) {
    check(theme, mode, `${s}Fg/${s}`, t[`${s}-fg`], t[s], 4.5);
  }
  for (const s of SYNTAX) check(theme, mode, `syn:${s}/bgSurface`, t[`syntax-${s}`], t['bg-surface'], 4.5);
}

console.log('Warm (default — base tokens)');
audit('warm', 'light', WARM.light);
audit('warm', 'dark', WARM.dark);
for (const id of PALETTES) {
  console.log(id);
  for (const mode of ['light', 'dark']) {
    const t = parseBlock(id, mode);
    if (!t) { console.log(`  FAIL ${id}/${mode}: block not found in global.css`); failures++; continue; }
    audit(id, mode, t);
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}  (${checks} checks across 8 palettes × light+dark; ${allowed} pre-existing warm allowances)`);
process.exit(failures === 0 ? 0 : 1);
