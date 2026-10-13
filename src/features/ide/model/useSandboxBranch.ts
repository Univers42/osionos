/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSandboxBranch                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";

import { parseGitBranch, type GitBranchInfo } from "./gitBranch";
import { runSandboxGit } from "./useIdeGit";

const BRANCH_ARGV = ["git", "status", "--porcelain", "-b"] as const;

/**
 * The sandbox's git branch while it is online for `workspaceId`, else null. Fetched when the
 * sandbox comes online and on every window focus; a reply for another workspace, or one landing
 * after unmount, is dropped. Ponytail: a branch switched in the dock terminal shows on the next
 * focus, not instantly; a failed fetch keeps the last answer until then.
 */
export function useSandboxBranch(workspaceId: string, online: boolean): GitBranchInfo | null {
  const key = online ? workspaceId : "";
  const [answer, setAnswer] = useState<{ key: string; info: GitBranchInfo } | null>(null);
  useEffect(() => {
    if (key === "") return;
    let live = true;
    const load = (): void => {
      void runSandboxGit(key, BRANCH_ARGV).then(
        (reply) => { if (live && reply.kind === "ok") setAnswer({ key, info: parseGitBranch(reply.output) }); },
        () => undefined,
      );
    };
    load();
    window.addEventListener("focus", load);
    return () => { live = false; window.removeEventListener("focus", load); };
  }, [key]);
  return key !== "" && answer?.key === key ? answer.info : null;
}
