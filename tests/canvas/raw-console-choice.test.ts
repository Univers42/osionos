/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-console-choice.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console choice survives a reload in localStorage `osio.raw.advanced`, and a
// storage that is missing or throws (privacy modes, a full quota) leaves the console off
// instead of breaking raw mode.

import assert from "node:assert/strict";
import test from "node:test";

import { readAdvancedConsole, writeAdvancedConsole } from "../../src/features/raw-mode/model/advancedConsole.ts";

function withStorage(storage: unknown, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });
  try {
    run();
  } finally {
    if (descriptor === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else Object.defineProperty(globalThis, "localStorage", descriptor);
  }
}

test("the choice round-trips through osio.raw.advanced", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  withStorage(storage, () => {
    assert.equal(readAdvancedConsole(), false);
    writeAdvancedConsole(true);
    assert.equal(values.get("osio.raw.advanced"), "1");
    assert.equal(readAdvancedConsole(), true);
    writeAdvancedConsole(false);
    assert.equal(readAdvancedConsole(), false);
  });
});

test("a missing or throwing storage reads off and writes nothing", () => {
  const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
  withStorage(throwing, () => {
    assert.equal(readAdvancedConsole(), false);
    assert.doesNotThrow(() => writeAdvancedConsole(true));
  });
  withStorage(undefined, () => {
    assert.equal(readAdvancedConsole(), false);
    assert.doesNotThrow(() => writeAdvancedConsole(true));
  });
});
