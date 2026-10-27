/** Reactive form of canInviteMembers; loads the member roster once when it is missing. */

import { useEffect } from "react";
import { useWorkspaceMembersStore } from "@/store/settings";
import { canInviteMembers } from "./inviteAccess";

export function useCanInviteMembers(workspaceId: string | undefined, userId: string): boolean {
  const members = useWorkspaceMembersStore((state) => (workspaceId ? state.data[workspaceId] : undefined));
  const isLoaded = members !== undefined;
  useEffect(() => {
    if (workspaceId && userId && !isLoaded) void useWorkspaceMembersStore.getState().hydrate(workspaceId, userId);
  }, [workspaceId, userId, isLoaded]);
  return canInviteMembers(members, userId);
}
