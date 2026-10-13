/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vendor-chunks.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { vendorChunkOf } from "../../scripts/vite/vendorChunks.ts";

// Real resolved ids from the pnpm layout the prod build sees.
const pnpm = (store: string, pkg: string, file: string) => `/app/node_modules/.pnpm/${store}/node_modules/${pkg}/${file}`;
const REACT_DOM = (file: string) => pnpm("react-dom@19.2.5_react@19.2.5", "react-dom", file);
const UI_COLLECTION = (file: string) => pnpm("@univers42+ui-collection@1.0.0", "@univers42/ui-collection", file);

test("the React runtime is one vendor chunk", () => {
  assert.equal(vendorChunkOf(REACT_DOM("cjs/react-dom-client.production.js")), "vendor-react");
  assert.equal(vendorChunkOf(pnpm("react@19.2.5", "react", "jsx-runtime.js")), "vendor-react");
  assert.equal(vendorChunkOf(pnpm("scheduler@0.26.0", "scheduler", "index.js")), "vendor-react");
});

test("react-dom/server follows the import graph (it is dynamic-imported)", () => {
  assert.equal(vendorChunkOf(REACT_DOM("server.browser.js")), undefined);
  assert.equal(vendorChunkOf(REACT_DOM("cjs/react-dom-server.browser.production.js")), undefined);
  assert.equal(vendorChunkOf(REACT_DOM("cjs/react-dom-server-legacy.browser.production.js")), undefined);
});

test("a library's own react/ folder is not the React runtime", () => {
  const emojiData = UI_COLLECTION("dist/library/components/react/emoji-picker/emojiPickerData.js");
  assert.equal(vendorChunkOf(emojiData), "vendor-ui-collection");
  assert.equal(vendorChunkOf(pnpm("zustand@5.0.12", "zustand", "react/shallow.js")), undefined);
  assert.equal(vendorChunkOf(pnpm("@reduxjs+toolkit@2.11.2", "@reduxjs/toolkit", "dist/react/index.js")), undefined);
});

test("app sources and unlisted packages follow the import graph", () => {
  assert.equal(vendorChunkOf("/app/src/features/motion/react/x.ts"), undefined);
  assert.equal(vendorChunkOf(pnpm("lodash@4.17.21", "lodash", "index.js")), undefined);
  assert.equal(vendorChunkOf(pnpm("date-fns@4.1.0", "date-fns", "format.js")), "vendor-date-fns");
  assert.equal(vendorChunkOf(pnpm("@tanstack+react-virtual@3.13.0", "@tanstack/react-virtual", "dist/index.js")), "vendor-tanstack");
  assert.equal(vendorChunkOf(pnpm("motion-dom@12.0.0", "motion-dom", "dist/index.mjs")), "vendor-motion");
});
