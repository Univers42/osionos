/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-tasks.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { parseTasksJson, findTask, TASKS_TEMPLATE } from "../../src/features/ide/model/ideTasks.ts";

test("parseTasksJson: valid tasks kept, malformed shapes and JSON dropped", () => {
  const tasks = parseTasksJson(JSON.stringify({
    version: 1,
    tasks: [
      { label: "build", command: "gcc *.c -o app", group: "build", default: true },
      { label: "broken" },                     // no command → dropped
      "not-an-object",                          // → dropped
      { label: "test", command: "./app --test", group: "test" },
    ],
  }));
  assert.deepEqual(tasks.map((t) => t.label), ["build", "test"]);
  assert.deepEqual(parseTasksJson("{ mid-edit garbage"), []);
  assert.deepEqual(parseTasksJson(JSON.stringify({ tasks: "nope" })), []);
});

test("findTask: group default wins, then group first, then overall default/first", () => {
  const tasks = parseTasksJson(JSON.stringify({
    tasks: [
      { label: "lint", command: "eslint ." },
      { label: "build-a", command: "make a", group: "build" },
      { label: "build-b", command: "make b", group: "build", default: true },
      { label: "unit", command: "make check", group: "test" },
    ],
  }));
  assert.equal(findTask(tasks, "build")?.label, "build-b"); // group default
  assert.equal(findTask(tasks, "test")?.label, "unit");     // group first
  assert.equal(findTask(tasks)?.label, "build-b");          // overall default
  assert.equal(findTask([], "build"), null);
});

test("the shipped template parses and carries a default build task", () => {
  const tasks = parseTasksJson(TASKS_TEMPLATE);
  assert.ok(tasks.length >= 2);
  assert.equal(findTask(tasks, "build")?.default, true);
  assert.equal(findTask(tasks, "test")?.group, "test");
});
