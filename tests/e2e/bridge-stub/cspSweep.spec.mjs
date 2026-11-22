/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cspSweep.spec.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #314: the app shell's script policy, swept. Every surface that loads its own chunk, worker or
// WebAssembly runs on the production build served by `vite preview`, which sends the policy read
// from nginx.conf (Report-Only, or enforced with PLAYWRIGHT_CSP=enforce; CSP_MODE says which). Pass =
// 0 violation events and 0 CSP console lines. Run it per engine (--browser) with retries 0.
//
// A test that died before its surface was visible is a failure, never a pass. Both negative
// controls are counted first on each engine and viewport: the sweep of a surface that needs a
// worker is SKIP when the worker control was not counted. Runner: osionos#314.

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { readPolicy } from "../../../scripts/vite/appCsp.ts";
import { countControls, recordCsp } from "../support/cspSweep.mjs";
import { SURFACES } from "../support/cspSurfaces.mjs";

const ENFORCED = process.env.CSP_MODE === "enforce";
// CSP_MODE=none serves no policy: a surface that still dies reaches nothing on that engine, so its
// death under a policy is not the policy's doing. Only the reach is asserted then.
const BASELINE = process.env.CSP_MODE === "none";
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const POLICY = readPolicy(readFileSync(new URL("../../../docker/services/node/nginx.conf", import.meta.url), "utf8"));

/** Both sides of a violation: the document's event and the engine's console line. */
async function expectNoViolation(csp) {
  const { events, consoleHits } = await csp.report();
  expect({ events, consoleHits }, "CSP violations").toEqual({ events: [], consoleHits: [] });
}

for (const viewport of VIEWPORTS) {
  test.describe(`csp sweep ${ENFORCED ? "enforced" : "report-only"} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("controls: an injected inline script and a violation raised in a worker are both counted", async ({ browser, baseURL }) => {
      expect(await countControls(browser, baseURL, viewport)).toEqual({ inline: true, worker: true });
    });

    test("the document carries the policy the web image sends", async ({ page, baseURL }) => {
      test.skip(BASELINE, "baseline run: no policy is served");
      const response = await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      const headers = response.headers();
      const name = ENFORCED ? "content-security-policy" : "content-security-policy-report-only";
      expect(headers[name]).toBe(POLICY);
      expect(headers[ENFORCED ? "content-security-policy-report-only" : "content-security-policy"]).toBeUndefined();
    });

    for (const surface of SURFACES) {
      test(`surface: ${surface.name}`, async ({ page, browser, baseURL, browserName }) => {
        test.skip(Boolean(surface.engineSkip?.[browserName]), surface.engineSkip?.[browserName]);
        test.setTimeout(surface.timeout ?? 120_000);
        const counted = await countControls(browser, baseURL, viewport);
        test.skip(!BASELINE && !counted.inline, "the inline-script control was not counted");
        test.skip(!BASELINE && surface.worker && !counted.worker, "the worker control was not counted on this engine");
        const skipReason = surface.skip?.(viewport);
        test.skip(Boolean(skipReason), skipReason);
        const csp = await recordCsp(page);
        try {
          await surface.run({ page, baseURL, viewport });
        } catch (error) {
          // A surface that died before its end still says what the policy saw: told apart from a policy fault.
          console.log(`[csp] ${surface.name} died; policy saw ${JSON.stringify(await csp.report())}`);
          throw error;
        }
        if (!BASELINE) await expectNoViolation(csp);
      });
    }
  });
}
