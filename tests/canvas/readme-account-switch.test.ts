// "Customize" started by account A must never link a README onto account B's profile. The
// account route signs with whichever session is active when the PATCH goes out, so a switch
// between the click and the save (or before the 412 retry) would write A's page id into B's
// row. These run the real deps the hook builds, the real account client, and a stubbed fetch.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/user-store-env.ts";

const { useUserStore } = await import("../../src/features/auth/index.ts");
const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { readmeDeps } = await import("../../src/widgets/profile-page/useReadmeCustomize.ts");
const { customizeReadme } = await import("../../src/widgets/profile-page/model/readmeCustomize.ts");

const A = "0a1b2c3d-0000-4000-8000-00000000000a";
const B = "0b1b2c3d-0000-4000-8000-00000000000b";
const PAGE_ID = "11111111-1111-4111-8111-111111111111";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Each PATCH is recorded with the bearer it carried: `jwt-<user>` is the session that signed it. */
function stubBridge(onPatch: (count: number) => Response) {
  const patches: string[] = [];
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const bearer = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    if ((init?.method ?? "GET") === "GET") return json(200, { userId: A, readmePageId: null, version: 3 });
    patches.push(bearer.replace("Bearer ", ""));
    return onPatch(patches.length);
  }) as typeof fetch;
  return { patches, restore: () => { globalThis.fetch = fetchBefore; } };
}

function signInAs(userId: string): void {
  useUserStore.setState({ activeUserId: userId, activePageJwt: () => `jwt-${useUserStore.getState().activeUserId}` } as never);
}

function createPageThen(after: () => void): void {
  usePageStore.setState({
    addPage: async (workspaceId: string) => {
      after();
      return { _id: PAGE_ID, workspaceId, title: "README" };
    },
  } as never);
}

test("an account switch between the click and the save links nothing to the second account", async () => {
  signInAs(A);
  createPageThen(() => signInAs(B));
  const bridge = stubBridge(() => json(200, { userId: A, readmePageId: PAGE_ID, version: 4 }));
  try {
    const result = await customizeReadme(readmeDeps("jwt-a"), "ws-a");
    assert.deepEqual(bridge.patches, [], "no PATCH at all once the account changed");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.message, /The account changed; nothing was linked\./);
  } finally {
    bridge.restore();
  }
});

test("an account switch before the 412 retry links nothing to the second account", async () => {
  signInAs(A);
  createPageThen(() => undefined);
  const bridge = stubBridge((count) => {
    if (count > 1) return json(200, { userId: B, readmePageId: PAGE_ID, version: 10 });
    signInAs(B);
    return json(412, { version: 9, profile: null });
  });
  try {
    const result = await customizeReadme(readmeDeps("jwt-a"), "ws-a");
    assert.deepEqual(bridge.patches, [`jwt-${A}`], "only the first PATCH, signed by the account that clicked");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.message, /The account changed; nothing was linked\./);
  } finally {
    bridge.restore();
  }
});

test("control: with no switch the page is linked through the same deps", async () => {
  signInAs(A);
  createPageThen(() => undefined);
  const bridge = stubBridge(() => json(200, { userId: A, readmePageId: PAGE_ID, version: 4 }));
  try {
    const result = await customizeReadme(readmeDeps("jwt-a"), "ws-a");
    assert.deepEqual(bridge.patches, [`jwt-${A}`]);
    assert.equal(result.ok, true);
  } finally {
    bridge.restore();
  }
});
