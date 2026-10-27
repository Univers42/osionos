/** After an invite is accepted: reload the account's workspace list so the joined one exists,
 *  then make it the active one. Switching first would point at an id the list does not hold yet.
 *
 *  Caveat: a bridge session's list is not reloaded by refreshWorkspaces, so there the switch
 *  lands on an id the list may not hold until the next sign-in. */

export interface JoinedWorkspaceActions {
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
}

export async function enterJoinedWorkspace(workspaceId: string, actions: JoinedWorkspaceActions): Promise<void> {
  await actions.refreshWorkspaces().catch(() => undefined);
  actions.switchWorkspace(workspaceId);
}
