/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   virtual-scroll-offset.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 23:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 23:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A virtualizer attaching to the page scroller must adopt where the reader
// already is; otherwise it scrolls the page back to the top.

import assert from "node:assert/strict";
import test from "node:test";

import { observeCurrentElementOffset } from "../../src/shared/notion-database-sys/src/lib/virtualScroll.ts";

test("attaching reports the scroller's current offset first", () => {
  const seen: [number, boolean][] = [];
  const instance = { scrollElement: { scrollTop: 640, scrollLeft: 0 }, targetWindow: null, options: {} };
  observeCurrentElementOffset(instance as never, (offset, isScrolling) => seen.push([offset, isScrolling]));
  assert.deepEqual(seen, [[640, false]]);
});

test("no scroller yet: nothing is reported", () => {
  const seen: number[] = [];
  observeCurrentElementOffset({ scrollElement: null, options: {} } as never, offset => seen.push(offset));
  assert.deepEqual(seen, []);
});
