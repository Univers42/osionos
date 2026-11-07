/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-preview-flavor.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/06 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/06 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
import assert from "node:assert/strict";
import test from "node:test";

import { previewFlavorOf } from "../../src/features/ide/model/markdownPreview.ts";

test("only markdown files get a preview, with page files using the omd codec", () => {
  assert.equal(previewFlavorOf("notes.md", "markdown"), "markdown");
  assert.equal(previewFlavorOf("Page.omd", "markdown"), "omd");
  assert.equal(previewFlavorOf("PAGE.OMD", "markdown"), "omd");
  assert.equal(previewFlavorOf("x.mdx", "markdown"), "markdown");
  assert.equal(previewFlavorOf("main.c", "c"), null);
  assert.equal(previewFlavorOf("readme.txt", "plaintext"), null);
  assert.equal(previewFlavorOf("_folder.omd", "plaintext"), "omd");
});
