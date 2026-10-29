/** Who may invite: the bridge refuses POST /api/workspaces/:id/invites unless the caller is the
 *  workspace owner or an admin, so every invite entry point hides for everyone else.
 *
 *  Caveat: the role comes from the client's member roster. While that roster is not loaded
 *  nobody can invite (the safe side, a hidden button); a roster that is stale can show the
 *  button to a demoted admin, whom the bridge still refuses with 403. */

import type { WorkspaceMember } from "@/store/settings";

const INVITER_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

export function canInviteMembers(members: readonly Pick<WorkspaceMember, "userId" | "role">[] | undefined, userId: string): boolean {
  const mine = members?.find((member) => member.userId === userId);
  return mine !== undefined && INVITER_ROLES.has(mine.role);
}
