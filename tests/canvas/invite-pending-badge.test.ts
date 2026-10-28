/**
 * N26: the switcher shows a count, never a workspace name, and no badge at all when
 * there is nothing pending. The pure helper is what the trigger renders.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { inviteSentence, pendingInvitesBadge } from "../../src/features/settings/people/inviteInboxModel.ts";

test("no pending invites means no badge", () => {
  assert.equal(pendingInvitesBadge(0), null);
  assert.equal(pendingInvitesBadge(-1), null);
});

test("one invite reads as one, many as a count with an aria-label", () => {
  assert.deepEqual(pendingInvitesBadge(1), { count: 1, ariaLabel: "1 pending invite" });
  assert.deepEqual(pendingInvitesBadge(20), { count: 20, ariaLabel: "20 pending invites" });
});

test("the dialog sentence is built from the /mine row only", () => {
  assert.equal(
    inviteSentence({ inviterName: "Ada", workspaceName: "Studio", role: "member" }),
    "Ada invited you to Studio as member",
  );
});
