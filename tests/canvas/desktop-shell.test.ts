/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   desktop-shell.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Only the Electron shell hands its title bar to the app: Tauri keeps its own injected chrome,
// and the web has none, so the app's drag handle and window strip appear under Electron alone.

import assert from "node:assert/strict";
import test from "node:test";

const { isDesktop, isElectronShell, windowControls } = await import("../../src/widgets/top-bar/model/desktop.ts");

const globals = globalThis as unknown as Record<string, unknown>;

function withGlobal(key: string, value: unknown, run: () => void) {
  const had = key in globals;
  const previous = globals[key];
  globals[key] = value;
  try { run(); } finally { if (had) globals[key] = previous; else delete globals[key]; }
}

test("the Electron preload bridge makes the app the window's chrome", () => {
  withGlobal("osionosDesktop", { minimize() {}, toggleMaximize() {}, close() {} }, () => {
    assert.equal(isElectronShell(), true);
    assert.equal(isDesktop(), true);
  });
});

test("Tauri is a desktop shell but keeps its own chrome", () => {
  withGlobal("__TAURI__", { window: { getCurrentWindow: () => ({}) } }, () => {
    assert.equal(isDesktop(), true);
    assert.equal(isElectronShell(), false);
  });
});

// Electron's contextBridge clones call arguments; a React click event holds DOM nodes and makes the
// call throw before the IPC send, so a button wired straight to the bridge never moves the window.
test("window controls reach the Electron bridge with no arguments", () => {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => { calls.push(args); };
  withGlobal("osionosDesktop", { minimize: record, toggleMaximize: record, close: record }, () => {
    const controls = windowControls()!;
    const clickEvent = { target: {}, nativeEvent: {} };
    (controls.minimize as (event: unknown) => void)(clickEvent);
    (controls.toggleMaximize as (event: unknown) => void)(clickEvent);
    (controls.close as (event: unknown) => void)(clickEvent);
  });
  assert.deepEqual(calls, [[], [], []]);
});

test("the web is neither", () => {
  assert.equal(isDesktop(), false);
  assert.equal(isElectronShell(), false);
});
