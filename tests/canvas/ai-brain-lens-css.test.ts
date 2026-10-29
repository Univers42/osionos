/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-brain-lens-css.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

// The composer's lit perimeter must read without any motion: the user's desktop
// asks for reduced motion, so the static glow is what they see until they pick
// "Full" motion in Settings › Accessibility — then the light turns.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/widgets/chat-shell/ui/BrainLens.module.css", "utf8");

/** The text of the `{ … }` block that follows `opener`, or null. */
function blockAfter(source: string, opener: string): string | null {
  const start = source.indexOf(opener);
  if (start < 0) return null;
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(source.indexOf("{", start) + 1, index);
  }
  return null;
}

test("at rest the lens has a visible gradient ring and a blurred halo, both outside any media query", () => {
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, "");
  assert.match(blockAfter(outside, ".lens {") ?? "", /conic-gradient/);
  assert.match(blockAfter(outside, ".lens {") ?? "", /box-shadow/);
  const halo = blockAfter(outside, ".lens::before") ?? "";
  assert.match(halo, /filter:\s*blur\(/);
  assert.match(halo, /opacity:\s*0?\.[3-9]/);
});

test("the ring turns at rest, focus brightens the halo, an answer in flight speeds it up", () => {
  assert.match(blockAfter(css, ".lens {") ?? "", /animation:\s*lens-turn/);
  assert.match(blockAfter(css, ".lens:focus-within::before") ?? "", /opacity/);
  assert.match(blockAfter(css, '.lens[data-working="true"] {') ?? "", /animation-duration/);
  assert.match(blockAfter(css, '.lens[data-working="true"]::before') ?? "", /animation:\s*lens-breathe/);
});

test("reduced motion stops the turning and leaves the glow alone, unless the reader chose full motion", () => {
  const reduced = blockAfter(css, "@media (prefers-reduced-motion: reduce)") ?? "";
  assert.match(reduced, /animation:\s*none/);
  assert.doesNotMatch(reduced, /box-shadow|filter|opacity|background/);
  // The OS is overridden by the reader's own choice, like global.css's reset.
  assert.match(reduced, /:root:not\(\[data-motion="full"\]\) \.lens/);
  assert.match(blockAfter(css, ':root[data-motion="reduce"] .lens,') ?? "", /animation:\s*none/);
});

test("the ring carries four lights, not one tint", () => {
  const ring = blockAfter(css, ".lens {") ?? "";
  for (const light of ["--lens-blue", "--lens-violet", "--lens-pink", "--lens-amber"]) {
    assert.match(ring, new RegExp(`var\\(${light}\\)`), `${light} is a stop of the ring`);
  }
});

test("the apps tray hangs under the ring: no top border, rounded only at the bottom", () => {
  const tray = blockAfter(css, ".tray {") ?? "";
  assert.match(tray, /border-top:\s*0/);
  assert.match(tray, /border-radius:\s*0 0 /);
});
