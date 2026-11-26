/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   top-bar-menu-keys.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The menubar keyboard truth table: one key in, one action out, no DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveMenuKey, type MenuKeyState } from "../../src/widgets/top-bar/model/menuKeys.ts";

const trigger = (index: number, open = false): MenuKeyState => ({ focus: "trigger", index, count: 7, open });
const row = (index: number, extra: Partial<Extract<MenuKeyState, { focus: "row" }>> = {}): MenuKeyState => ({
  focus: "row", level: 0, index, labels: ["New page", "New folder", "Preferences", "Close tab"], submenu: false, trigger: 2, count: 7, ...extra,
});

test("a focused trigger: arrows move between triggers and wrap, without opening a closed menu", () => {
  assert.deepEqual(resolveMenuKey("ArrowRight", trigger(0)), { type: "focusTrigger", index: 1 });
  assert.deepEqual(resolveMenuKey("ArrowRight", trigger(6)), { type: "focusTrigger", index: 0 });
  assert.deepEqual(resolveMenuKey("ArrowLeft", trigger(0)), { type: "focusTrigger", index: 6 });
});

test("a focused trigger with its menu open: arrows open the neighbour", () => {
  assert.deepEqual(resolveMenuKey("ArrowRight", trigger(0, true)), { type: "openMenu", index: 1, row: "none" });
  assert.deepEqual(resolveMenuKey("ArrowLeft", trigger(0, true)), { type: "openMenu", index: 6, row: "none" });
});

test("a focused trigger: Enter, Space and ArrowDown open on the first row, ArrowUp on the last", () => {
  for (const key of ["Enter", " ", "ArrowDown"]) assert.deepEqual(resolveMenuKey(key, trigger(3)), { type: "openMenu", index: 3, row: "first" });
  assert.deepEqual(resolveMenuKey("ArrowUp", trigger(3)), { type: "openMenu", index: 3, row: "last" });
});

test("a focused trigger: Escape closes an open menu and does nothing on a closed one", () => {
  assert.deepEqual(resolveMenuKey("Escape", trigger(1, true)), { type: "close", focus: "trigger" });
  assert.deepEqual(resolveMenuKey("Escape", trigger(1)), { type: "none" });
});

test("a focused row: ArrowDown and ArrowUp wrap, landing on disabled rows too", () => {
  assert.deepEqual(resolveMenuKey("ArrowDown", row(1)), { type: "focusRow", index: 2 });
  assert.deepEqual(resolveMenuKey("ArrowDown", row(3)), { type: "focusRow", index: 0 });
  assert.deepEqual(resolveMenuKey("ArrowUp", row(0)), { type: "focusRow", index: 3 });
});

test("a focused row: Home and End jump to the ends", () => {
  assert.deepEqual(resolveMenuKey("Home", row(2)), { type: "focusRow", index: 0 });
  assert.deepEqual(resolveMenuKey("End", row(1)), { type: "focusRow", index: 3 });
});

test("a focused row: a printable key goes to the next label that starts with it, case-insensitively, wrapping", () => {
  assert.deepEqual(resolveMenuKey("c", row(0)), { type: "focusRow", index: 3 });
  assert.deepEqual(resolveMenuKey("N", row(0)), { type: "focusRow", index: 1 });
  assert.deepEqual(resolveMenuKey("n", row(1)), { type: "focusRow", index: 0 });
  assert.deepEqual(resolveMenuKey("z", row(0)), { type: "none" });
});

test("a focused row: Enter and Space activate", () => {
  assert.deepEqual(resolveMenuKey("Enter", row(0)), { type: "activate" });
  assert.deepEqual(resolveMenuKey(" ", row(0)), { type: "activate" });
});

test("ArrowRight opens a submenu row, and otherwise opens the next top menu on its first row", () => {
  assert.deepEqual(resolveMenuKey("ArrowRight", row(2, { submenu: true })), { type: "openSub" });
  assert.deepEqual(resolveMenuKey("ArrowRight", row(0)), { type: "openMenu", index: 3, row: "first" });
  assert.deepEqual(resolveMenuKey("ArrowRight", row(0, { trigger: 6 })), { type: "openMenu", index: 0, row: "first" });
});

test("ArrowLeft closes a submenu, and at the top level opens the previous menu", () => {
  assert.deepEqual(resolveMenuKey("ArrowLeft", row(0, { level: 1 })), { type: "closeSub" });
  assert.deepEqual(resolveMenuKey("ArrowLeft", row(0)), { type: "openMenu", index: 1, row: "first" });
  assert.deepEqual(resolveMenuKey("ArrowLeft", row(0, { trigger: 0 })), { type: "openMenu", index: 6, row: "first" });
});

test("a submenu row: ArrowRight moves to the next top menu, since a child has no submenu of its own", () => {
  assert.deepEqual(resolveMenuKey("ArrowRight", row(0, { level: 1 })), { type: "openMenu", index: 3, row: "first" });
});

test("Escape closes one level: the submenu first, then the menu onto its trigger", () => {
  assert.deepEqual(resolveMenuKey("Escape", row(0, { level: 1 })), { type: "closeSub" });
  assert.deepEqual(resolveMenuKey("Escape", row(0)), { type: "close", focus: "trigger" });
});

test("Tab closes everything and lets focus move on", () => {
  assert.deepEqual(resolveMenuKey("Tab", row(0)), { type: "close", focus: "none" });
  assert.deepEqual(resolveMenuKey("Tab", trigger(0, true)), { type: "close", focus: "none" });
  assert.deepEqual(resolveMenuKey("Tab", trigger(0)), { type: "none" });
});

test("an empty menu never throws and never moves", () => {
  assert.deepEqual(resolveMenuKey("ArrowDown", row(0, { labels: [] })), { type: "none" });
  assert.deepEqual(resolveMenuKey("a", row(0, { labels: [] })), { type: "none" });
});
