/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-paste-sample.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseMarkdownToBlocks } from "../../src/shared/lib/markengine/markdown/shortcuts.ts";

// Vendored copy of wiki/cybersecurity/auth-environment.md (the doc moved out
// of the old monorepo docs/ path, which the test container never mounts).
const AUTH_ENVIRONMENT_MARKDOWN = readFileSync(
  new URL("./fixtures/auth-environment.md", import.meta.url),
  "utf8",
);

const AUTH_ENVIRONMENT_OPENING_MARKDOWN = [
  "# Authentication environment and production transition",
  "",
  "Last updated: 2026-05-10",
  "",
  "`opposite-osiris` is currently an Astro/Vite frontend. The auth client is implemented in a React-compatible hook-style module at `opposite-osiris/src/hooks/useAuth.ts`, but it has no React runtime dependency so the existing Astro build stays lightweight.",
  "",
  "## Development variables",
  "",
  "The Docker bootstrap writes these local development values to `apps/opposite-osiris/.env.local`:",
  "",
  "```dotenv",
  "PUBLIC_AUTH_GATEWAY_URL=/api/auth",
  "PUBLIC_PORTAL_URL=http://localhost:3001",
  "PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA",
  "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
  "TURNSTILE_BYPASS_LOCAL=true",
  "PUBLIC_SITE_URL=http://localhost:4322",
  "```",
  "",
  "The public site key is safe for browser code. The Turnstile secret must only be read by the auth gateway or production backend. Generate the ignored file with Dockerized Node from the repository root:",
  "",
  "```sh",
  "docker run --rm -v \"$PWD\":/workspace -w /workspace node:22-alpine node apps/baas/scripts/bootstrap-env.mjs",
  "```",
  "",
  "## Local runtime",
].join("\n");

test("parseMarkdownToBlocks preserves the auth environment opening block order", () => {
  const blocks = parseMarkdownToBlocks(AUTH_ENVIRONMENT_OPENING_MARKDOWN);

  assert.deepEqual(
    blocks.map((block) => block.type),
    [
      "heading_1",
      "paragraph",
      "paragraph",
      "heading_2",
      "paragraph",
      "code",
      "paragraph",
      "code",
      "heading_2",
    ],
  );
  assert.equal(blocks[0].content, "Authentication environment and production transition");
  assert.equal(blocks[5].language, "dotenv");
  assert.match(blocks[5].content, /PUBLIC_AUTH_GATEWAY_URL=\/api\/auth/);
  assert.equal(blocks[7].language, "sh");
  assert.match(blocks[7].content, /docker run --rm/);
});

test("parseMarkdownToBlocks handles the full auth-environment.md sample", () => {
  const blocks = parseMarkdownToBlocks(AUTH_ENVIRONMENT_MARKDOWN);

  assert.equal(blocks.length, 51);
  assert.deepEqual(
    blocks.map((block) => block.type).slice(13, 22),
    [
      "heading_2",
      "paragraph",
      "numbered_list",
      "numbered_list",
      "numbered_list",
      "numbered_list",
      "numbered_list",
      "numbered_list",
      "numbered_list",
    ],
  );

  const codeBlocks = blocks.filter((block) => block.type === "code");
  assert.deepEqual(
    codeBlocks.map((block) => [block.language, block.content.split("\n").length]),
    [
      ["dotenv", 6],
      ["sh", 1],
      ["dotenv", 3],
      ["sh", 1],
      ["sh", 1],
    ],
  );
  assert.equal(
    codeBlocks[2].content,
    [
      "PUBLIC_SITE_URL=http://localhost:4322",
      "ASTRO_DEV_PORT=4322",
      "PUBLIC_AUTH_GATEWAY_URL=/api/auth",
    ].join("\n"),
  );
  assert.ok(!codeBlocks.some((block) => block.content.includes("## Local runtime")));

  const numberedItems = blocks.filter((block) => block.type === "numbered_list");
  assert.deepEqual(numberedItems.map((block) => block.content), [
    "Create a Cloudflare Turnstile widget for the production hostname.",
    "Replace `PUBLIC_TURNSTILE_SITE_KEY` with the live site key.",
    "Store `TURNSTILE_SECRET_KEY` in the production secret manager, not in source control.",
    "Set `TURNSTILE_BYPASS_LOCAL=false`.",
    "Set `PUBLIC_AUTH_GATEWAY_URL` to the HTTPS auth gateway origin or a same-origin reverse proxy path.",
    "Set `PUBLIC_PORTAL_URL` to the HTTPS portal sign-in URL.",
    "Ensure the gateway can reach Kong/GoTrue through `PUBLIC_BAAS_URL` and has a service role key for audit logging.",
  ]);
});