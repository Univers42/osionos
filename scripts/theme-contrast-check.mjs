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
 * WCAG contrast check for the seven palettes that are still hand-written in
 * global.css (data-palette × light/dark). Parses their
 * `[data-palette=...][data-theme=...]` blocks and asserts the critical
 * foreground/background pairs meet AA (>=4.5:1 text, >=3:1 large/UI) — AAA
 * (>=7:1) for the High-Contrast theme. The default palette is generated, and
 * scripts/build-tokens.mjs checks it; this script goes when the other seven
 * are generated too.
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

const PALETTES = ['mono', 'contrast', 'maximal', 'nord', 'solarized', 'midnight', 'rose'];
const SYNTAX = ['keyword', 'string', 'number', 'comment', 'function', 'type', 'property', 'tag', 'attr', 'literal'];

let failures = 0;
let checks = 0;

function check(theme, mode, label, fg, bg, min) {
  checks++;
  const r = ratio(fg, bg);
  if (r == null) { console.log(`  FAIL ${theme}/${mode} ${label}: missing token (${fg} on ${bg})`); failures++; return; }
  if (r < min) {
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

for (const id of PALETTES) {
  console.log(id);
  for (const mode of ['light', 'dark']) {
    const t = parseBlock(id, mode);
    if (!t) { console.log(`  FAIL ${id}/${mode}: block not found in global.css`); failures++; continue; }
    audit(id, mode, t);
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}  (${checks} checks across ${PALETTES.length} palettes × light+dark)`);
process.exit(failures === 0 ? 0 : 1);
