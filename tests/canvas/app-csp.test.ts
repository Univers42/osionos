/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   app-csp.test.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #314: the app shell's Report-Only policy is one string in nginx.conf. These checks fail when a
// new nginx location forgets it (add_header in a location drops every inherited header, so that
// path would silently serve no policy) and when an inline <script> in index.html changes without
// the policy's hash list following (the app still boots, the theme just flashes).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  blocksWithAddHeader,
  inlineScriptSources,
  ownAddHeaders,
  previewHeaders,
  POLICY_VARIABLE,
  readPolicy,
} from "../../scripts/vite/appCsp.ts";

const NGINX = readFileSync(new URL("../../docker/services/node/nginx.conf", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const REPORT_ONLY = `add_header Content-Security-Policy-Report-Only $${POLICY_VARIABLE} always;`;

function directive(policy: string, name: string): string[] {
  const entry = policy.split(";").map((part) => part.trim().split(/\s+/)).find(([key]) => key === name);
  return entry ? entry.slice(1) : [];
}

test("the policy is defined once, in nginx.conf", () => {
  const policy = readPolicy(NGINX);
  assert.ok(policy, "nginx.conf has no `map $uri $app_csp_report_only { default \"...\"; }`");
  assert.equal(NGINX.split(`$${POLICY_VARIABLE} {`).length - 1, 1);
});

test("script-src carries no unsafe source and the policy sets no other fetch directive", () => {
  const policy = readPolicy(NGINX) ?? "";
  assert.ok(directive(policy, "script-src").length > 0);
  assert.doesNotMatch(directive(policy, "script-src").join(" "), /'unsafe-(inline|eval)'|\*|https?:/);
  for (const absent of ["default-src", "connect-src", "frame-src", "img-src", "media-src", "font-src", "style-src", "form-action"]) {
    assert.deepEqual(directive(policy, absent), [], `${absent} is phase 2 (D314-3)`);
  }
});

test("script-src hashes equal the inline scripts of index.html (D314-5)", () => {
  const hashed = directive(readPolicy(NGINX) ?? "", "script-src").filter((s) => s.startsWith("'sha256-"));
  const inline = inlineScriptSources(INDEX);
  assert.equal(inline.length, 2, "index.html is expected to hold 2 inline scripts today");
  assert.deepEqual([...hashed].sort(), [...inline].sort());
});

test("the inline script extractor sees a changed script (negative control)", () => {
  const before = inlineScriptSources(INDEX);
  const after = inlineScriptSources(INDEX.replace("document.fonts.load(f)", "document.fonts.load(f) "));
  assert.notDeepEqual(after, before);
  assert.deepEqual(inlineScriptSources('<script src="/a.js"></script><script type="module" src="/b"></script>'), []);
});

test("the server and every location that declares add_header carry the policy (D314-4)", () => {
  const blocks = blocksWithAddHeader(NGINX);
  assert.deepEqual(
    blocks.map((block) => block.header),
    ["server", "location = /index.html", "location = /sw.js", "location ^~ /assets/", "location @kept", "location ~* \\.(?:js|css|svg|png|jpg|jpeg|gif|ico|woff2?|wasm)$"],
  );
  for (const block of blocks) {
    const own = ownAddHeaders(block).map((line) => line.trim());
    assert.ok(own.includes(REPORT_ONLY), `${block.header}: no Report-Only reference`);
    assert.ok(own.includes(`add_header Content-Security-Policy "frame-ancestors 'none'" always;`), `${block.header}: enforced frame-ancestors changed`);
    assert.ok(own.includes(`add_header X-Frame-Options "DENY" always;`), `${block.header}: X-Frame-Options changed`);
  }
});

test("the block finder reports a location that forgot the policy (negative control)", () => {
  const conf = `server {\n  add_header A 1;\n  location /x {\n    add_header B 2;\n  }\n  location /y {\n    return 204;\n  }\n}`;
  assert.deepEqual(blocksWithAddHeader(conf).map((block) => block.header), ["server", "location /x"]);
  assert.deepEqual(ownAddHeaders(blocksWithAddHeader(conf)[0]).map((line) => line.trim()), ["add_header A 1;"]);
});

test("vite preview sends the nginx policy byte for byte, Report-Only by default (D314-8)", () => {
  const policy = readPolicy(NGINX);
  assert.deepEqual(previewHeaders(NGINX, false), { "Content-Security-Policy-Report-Only": policy });
  assert.deepEqual(previewHeaders(NGINX, true), { "Content-Security-Policy": policy });
  assert.throws(() => previewHeaders("server {}", false), /no app_csp_report_only map/);
});

test("vite.config.ts feeds preview.headers from previewHeaders, selected by PLAYWRIGHT_CSP=enforce", () => {
  const config = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /previewHeaders\([\s\S]*?nginx\.conf[\s\S]*?process\.env\.PLAYWRIGHT_CSP === ["']enforce["']/);
});
