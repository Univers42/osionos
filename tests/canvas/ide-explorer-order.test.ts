/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-explorer-order.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The machine window's file tree lists a folder the way VS Code's explorer does: folders first,
// then files, each by name with numbers in order and case ignored.
import assert from "node:assert/strict";
import test from "node:test";

import { explorerOrder } from "../../src/features/ide/vscode/explorerOrder.ts";

const entry = (name: string, isDirectory = false) => ({ name, isDirectory });

test("folders come before files, each sorted by name", () => {
  const sorted = explorerOrder([entry("b.py"), entry("src", true), entry("A.md"), entry(".vscode", true), entry("a.py")]);
  assert.deepEqual(sorted.map((e) => e.name), [".vscode", "src", "A.md", "a.py", "b.py"]);
});

test("numbers sort as numbers, and the input is left untouched", () => {
  const input = [entry("file10.txt"), entry("file2.txt"), entry("file1.txt")];
  assert.deepEqual(explorerOrder(input).map((e) => e.name), ["file1.txt", "file2.txt", "file10.txt"]);
  assert.deepEqual(input.map((e) => e.name), ["file10.txt", "file2.txt", "file1.txt"]);
});

test("an empty folder lists nothing", () => {
  assert.deepEqual(explorerOrder([]), []);
});
