// What a node-served frame shows when the Connector is not running (devil verdict 2026-11-27, D5):
// "start it" comes first, as copyable lines, and downloading the Connector second.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MachineFramePanel } from "../../src/features/ide/ui/MachineFramePanel.tsx";
import { terminalFramePanel } from "../../src/features/machines/model/terminalFrame.ts";

test("D5: the not-running panel shows how to start the Connector before offering the download", () => {
  const panel = terminalFramePanel("no-node", "https://example.test/connector");
  assert.ok(panel);
  const html = renderToStaticMarkup(React.createElement(MachineFramePanel, { panel, waiting: false, pairing: false, onTryAgain: () => {} }));
  const start = html.indexOf("Already set up on this computer? Start it:");
  assert.ok(start >= 0, "the lead is shown");
  assert.ok(html.includes("systemctl --user start osionos-node"));
  assert.ok(html.includes("launchctl load ~/Library/LaunchAgents/com.osionos.node.plist"));
  assert.ok(start < html.indexOf("Download osionos Connector"), "starting comes before installing");
});

test("the pairing-code field leads the start lines, so a short dock panel still shows the one input", () => {
  // The pairing lines name the bridge, which falls back to the page's origin.
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: new URL("http://localhost/") });
  const panel = terminalFramePanel("no-node", "https://example.test/connector");
  assert.ok(panel);
  const html = renderToStaticMarkup(React.createElement(MachineFramePanel, { panel, waiting: false, pairing: true, onTryAgain: () => {} }));
  const field = html.indexOf('id="machine-pair-code"');
  assert.ok(field >= 0, "the code field is shown");
  assert.ok(field < html.indexOf("Already set up on this computer? Start it:"), "the input comes before the reference lines");
});
