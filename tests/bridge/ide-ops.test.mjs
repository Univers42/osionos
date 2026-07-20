// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-ops.test.mjs                                   :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import { createIdeOpsHandler, parseRipgrepJson } from "../../scripts/bridge-ide-ops.mjs";

test("parseRipgrepJson keeps match events, drops begin/end/summary", () => {
  const output = [
    '{"type":"begin","data":{"path":{"text":"src/main.py"}}}',
    '{"type":"match","data":{"path":{"text":"src/main.py"},"lines":{"text":"def greet():\\n"},"line_number":1}}',
    '{"type":"match","data":{"path":{"text":"src/main.py"},"lines":{"text":"    greet()\\n"},"line_number":9}}',
    '{"type":"end","data":{"path":{"text":"src/main.py"}}}',
    '{"type":"summary","data":{}}',
    "not json",
  ].join("\n");
  const results = parseRipgrepJson(output);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { path: "src/main.py", lineNumber: 1, line: "def greet():" });
  assert.equal(results[1].lineNumber, 9);
});

const CONFIG = { allowedOrigin: "https://localhost:3001" };
function fakeRes() {
  return { statusCode: 0,
    writeHead(s) { this.statusCode = s; },
    end() {} };
}

test("ops double-gate: env unset → 404 (route hidden)", async () => {
  const handler = createIdeOpsHandler({ config: CONFIG, verifySession: () => { throw new Error("nope"); }, env: {} });
  const res = fakeRes();
  const req = { method: "POST", headers: {} };
  assert.equal(await handler(new URL("http://x/api/ide/git"), req, res, CONFIG), true);
  assert.equal(res.statusCode, 404);
});

test("ops rejects non-POST + disowns foreign paths", async () => {
  const handler = createIdeOpsHandler({ config: CONFIG, verifySession: () => ({ userId: "u", workspaceIds: [] }), env: { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "p:2375" } });
  const res = fakeRes();
  await handler(new URL("http://x/api/ide/git"), { method: "GET", headers: {} }, res, CONFIG);
  assert.equal(res.statusCode, 405);
  assert.equal(await handler(new URL("http://x/api/other"), { method: "POST", headers: {} }, fakeRes(), CONFIG), false);
});
