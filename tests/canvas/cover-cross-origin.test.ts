/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cover-cross-origin.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { coverCrossOrigin } from "../../src/shared/lib/media/coverCrossOrigin.ts";

test("a Pixabay cover loads without credentials, so its CDN sets no cookie", () => {
  assert.equal(coverCrossOrigin("https://cdn.pixabay.com/video/2018/05/11/16160-269534741_medium.mp4"), "anonymous");
  assert.equal(coverCrossOrigin("https://cdn.pixabay.com/video/2018/05/11/16160-269534741_tiny.jpg"), "anonymous");
});

test("any other source keeps a plain fetch: CORS there could block the media", () => {
  assert.equal(coverCrossOrigin("https://images.unsplash.com/photo-1"), undefined);
  assert.equal(coverCrossOrigin("https://cdn.pixabay.com.evil.example/x.mp4"), undefined);
  assert.equal(coverCrossOrigin("/covers/a.jpg"), undefined);
  assert.equal(coverCrossOrigin("linear-gradient(red, blue)"), undefined);
});
