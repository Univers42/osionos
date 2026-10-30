/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-machine-session.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One page, one machine, one folder: what the IDE page reads from its own URL and hands the
// VS Code client. The client never gets a connection token (A8), its base path is the proxy's
// node prefix, and the worker extension host stays off (C13).

import assert from "node:assert/strict";
import test from "node:test";

import { boundedCommand, machineOptions, readMachineTarget } from "../../src/features/ide/vscode/machineSession.ts";

const COMMIT = "59c988c744a240b05b039f57b856a5312f19d5b1";

test("the page URL names one node and one absolute folder", () => {
  assert.deepEqual(readMachineTarget("?node=laptop&folder=%2Fhome%2Fme%2Fproj"), { node: "laptop", folder: "/home/me/proj" });
  for (const search of ["?node=Laptop&folder=/x", "?node=laptop", "?node=laptop&folder=relative", "?node=laptop&folder=/a/../b", "?node=laptop&folder=/a%00b", "?node=a&node=b&folder=/x", "?folder=/x"]) {
    assert.equal(readMachineTarget(search), null, search);
  }
  assert.deepEqual(readMachineTarget("?node=vm&folder=/"), { node: "vm", folder: "/" });
});

test("the client connects through the node prefix with no connection token", () => {
  const options = machineOptions({ host: "ide.example:4100", node: "laptop", folder: "/home/me/proj", commit: COMMIT });
  assert.equal(options.remoteAuthority, "ide.example:4100");
  assert.equal(options.serverBasePath, "/api/node/laptop");
  assert.equal("connectionToken" in options, false);
  assert.equal(options.productConfiguration.commit, COMMIT);
  assert.equal(options.workspaceProvider.workspace.folderUri, "vscode-remote://ide.example:4100/home/me/proj");
  assert.equal(options.workspaceProvider.trusted, undefined, "trust is asked, never assumed (C11)");
  assert.equal(options.enableWorkspaceTrust, true, "the browser build disables trust unless enabled (C11)");
  assert.equal(options.productConfiguration.extensionsGallery.serviceUrl, "https://open-vsx.org/vscode/gallery");
});

test("a command that never settles fails with its name after the bound (C13)", async () => {
  const never = new Promise<never>(() => {});
  await assert.rejects(boundedCommand(() => never, "git.checkout", 30), /git\.checkout did not finish within 30 ms/);
  assert.equal(await boundedCommand(async () => 7, "x", 30), 7);
});
