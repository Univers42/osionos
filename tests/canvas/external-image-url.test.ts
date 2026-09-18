/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   external-image-url.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeExternalUrl } from "../../src/shared/lib/media/externalImageUrl";

// The exact in-the-wild shape users paste from Google Images: an
// /imgres viewer page whose real image hides in the imgurl param.
const IMGRES =
  "https://www.google.com/imgres?q=images&imgurl=https%3A%2F%2Fimg.magnific.com%2Fphotos-gratuite%2Fgros-plan-beau-papillon-textures-interessantes-fleur-petale-orange_181624-7640.jpg%3Fsemt%3Dais_hybrid%26w%3D740%26q%3D80&imgrefurl=https%3A%2F%2Fwww.magnific.com%2Ffr%2Fphotos-vecteurs-libre%2Fimg&docid=j6gd_miBlrBtZM&tbnid=SeMV_qAWkGBtaM&w=740&h=491";

test("google /imgres viewer unwraps to the real image", () => {
  assert.equal(
    normalizeExternalUrl(IMGRES),
    "https://img.magnific.com/photos-gratuite/gros-plan-beau-papillon-textures-interessantes-fleur-petale-orange_181624-7640.jpg?semt=ais_hybrid&w=740&q=80",
  );
});

test("google /url redirect unwraps to its target", () => {
  assert.equal(
    normalizeExternalUrl("https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fa.png&sa=t"),
    "https://example.com/a.png",
  );
});

test("google country TLDs unwrap too", () => {
  assert.equal(
    normalizeExternalUrl("https://www.google.fr/imgres?imgurl=https%3A%2F%2Fexample.com%2Fb.jpg"),
    "https://example.com/b.jpg",
  );
  assert.equal(
    normalizeExternalUrl("https://www.google.co.uk/imgres?imgurl=https%3A%2F%2Fexample.com%2Fc.jpg"),
    "https://example.com/c.jpg",
  );
});

test("bing images viewer unwraps mediaurl", () => {
  assert.equal(
    normalizeExternalUrl("https://www.bing.com/images/search?view=detailV2&mediaurl=https%3A%2F%2Fexample.com%2Fd.gif"),
    "https://example.com/d.gif",
  );
});

test("direct urls pass through untouched", () => {
  assert.equal(normalizeExternalUrl("https://example.com/photo.jpg?w=740"), "https://example.com/photo.jpg?w=740");
  assert.equal(normalizeExternalUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(normalizeExternalUrl("blob:https://localhost/x"), "blob:https://localhost/x");
});

test("bare domains upgrade to https; a google page that is NOT a viewer stays", () => {
  assert.equal(normalizeExternalUrl("example.com/pic.png"), "https://example.com/pic.png");
  assert.equal(normalizeExternalUrl("https://www.google.com/search?q=x"), "https://www.google.com/search?q=x");
});

test("garbage and empties are rejected", () => {
  assert.equal(normalizeExternalUrl(""), null);
  assert.equal(normalizeExternalUrl("   "), null);
  assert.equal(normalizeExternalUrl("not a url"), null);
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), null);
});

test("nested wrappers unwrap within the hop bound", () => {
  const inner = encodeURIComponent("https://example.com/deep.png");
  const middle = encodeURIComponent(`https://www.google.com/imgres?imgurl=${inner}`);
  assert.equal(
    normalizeExternalUrl(`https://www.google.com/url?url=${middle}`),
    "https://example.com/deep.png",
  );
});
