/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appearance-accessibility.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The five accessibility axes of the personal appearance: they round-trip,
// each falls back on its own, an old stored object keeps the axes it had,
// and applyAppearance writes exactly the attributes the table names — the
// attribute is absent at the default, so nobody carries one by accident.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  parseAppearance,
  updateAppearance,
} from "../../src/shared/config/theme.ts";

const stored = (value: unknown) => parseAppearance(JSON.stringify(value));

interface FakeRoot {
  dataset: Record<string, string | undefined>;
  style: { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
}

/** applyAppearance writes to <html>; the canvas tests run without a DOM. */
function withRoot(run: (root: FakeRoot) => void): void {
  const root: FakeRoot = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  const globals = globalThis as unknown as { document?: unknown };
  const previous = globals.document;
  globals.document = { documentElement: root };
  try {
    run(root);
  } finally {
    globals.document = previous;
  }
}

test("the five accessibility choices round-trip", () => {
  const value = {
    linkUnderline: "always",
    motion: "reduce",
    animatedImages: "still",
    hovercards: "off",
    urlPaste: "plain",
  };
  assert.deepEqual(stored(value), { ...DEFAULT_APPEARANCE, ...value });
});

test("a bad accessibility value falls back on its own field", () => {
  const value = stored({
    linkUnderline: "sometimes",
    motion: "reduce",
    animatedImages: "play",
    hovercards: "maybe",
    urlPaste: "smart",
  });
  assert.equal(value.linkUnderline, DEFAULT_APPEARANCE.linkUnderline);
  assert.equal(value.motion, "reduce");
  assert.equal(value.animatedImages, "play");
  assert.equal(value.hovercards, DEFAULT_APPEARANCE.hovercards);
  assert.equal(value.urlPaste, DEFAULT_APPEARANCE.urlPaste);
});

test("an old stored object keeps its axes and takes the new ones at their default", () => {
  const value = stored({ accent: "ember", density: "compact", radius: "sharp", uiScale: "large" });
  assert.equal(value.accent, "ember");
  assert.equal(value.density, "compact");
  assert.equal(value.radius, "sharp");
  assert.equal(value.uiScale, "large");
  assert.equal(value.linkUnderline, "default");
  assert.equal(value.motion, "system");
  assert.equal(value.animatedImages, "play");
  assert.equal(value.hovercards, "on");
  assert.equal(value.urlPaste, "link");
});

test("applyAppearance sets or removes exactly the attributes in the table", () => {
  withRoot((root) => {
    applyAppearance({
      ...DEFAULT_APPEARANCE,
      linkUnderline: "always",
      motion: "reduce",
      animatedImages: "still",
      hovercards: "off",
    });
    assert.equal(root.dataset.linkUnderline, "always");
    assert.equal(root.dataset.motion, "reduce");
    assert.equal(root.dataset.animatedImages, "still");
    assert.equal(root.dataset.hovercards, "off");
    // urlPaste changes what a paste does, not what the document looks like.
    assert.equal(root.dataset.urlPaste, undefined);
    // The other axes are untouched by an accessibility change.
    assert.equal(root.dataset.accent, undefined);
    assert.equal(root.dataset.density, undefined);
    assert.equal(root.dataset.radius, undefined);
    assert.equal(root.dataset.uiScale, undefined);

    applyAppearance(DEFAULT_APPEARANCE);
    assert.equal(root.dataset.linkUnderline, undefined);
    assert.equal(root.dataset.motion, undefined);
    assert.equal(root.dataset.animatedImages, undefined);
    assert.equal(root.dataset.hovercards, undefined);
  });
});

test("the visual axes still ride the same attributes", () => {
  withRoot((root) => {
    applyAppearance({
      ...DEFAULT_APPEARANCE,
      accent: "ember",
      density: "compact",
      radius: "sharp",
      uiScale: "large",
    });
    assert.equal(root.dataset.accent, "ember");
    assert.equal(root.dataset.density, "compact");
    assert.equal(root.dataset.radius, "sharp");
    assert.equal(root.dataset.uiScale, "large");
  });
});

test("updateAppearance merges with the live appearance instead of a caller's copy", () => {
  withRoot(() => {
    applyAppearance({ ...DEFAULT_APPEARANCE, motion: "reduce", accent: "ember" });
    const next = updateAppearance({ urlPaste: "plain" });
    assert.equal(next.motion, "reduce");
    assert.equal(next.accent, "ember");
    assert.equal(next.urlPaste, "plain");
  });
});
