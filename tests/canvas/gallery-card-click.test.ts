/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gallery-card-click.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { cardClickUsesTemplate } from "../../src/shared/notion-database-sys/src/components/views/gallery/cardClick.ts";

const cases: [Parameters<typeof cardClickUsesTemplate>, boolean][] = [
  [[undefined, true], false],
  [["open", true], false],
  [["use_template", false], false],
  [["use_template", true], true],
];

test("a gallery card uses a template only when asked and hosted", () => {
  for (const [args, expected] of cases) {
    assert.equal(cardClickUsesTemplate(...args), expected, JSON.stringify(args));
  }
});
