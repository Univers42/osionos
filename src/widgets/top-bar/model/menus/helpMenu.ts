/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   helpMenu.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";
import { LEGAL_LINKS } from "@/features/legal/model/siteLegalLinks";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import type { MenuAction, MenuContext, MenuGroup } from "../menuTypes";
import { palette } from "./menuActions";

const DOCS_URL = "https://github.com/Univers42/osionos";

/** Open a URL in a new tab with no opener. */
function openExternal(href: string): void {
  globalThis.open(href, "_blank", "noopener");
}

/** The legal links, the last one closing its group. */
function legalRows(): MenuAction[] {
  return LEGAL_LINKS.map((link, index) => ({
    id: `help.${link.id}`,
    label: link.label,
    run: () => openExternal(link.href),
    separatorAfter: index === LEGAL_LINKS.length - 1,
  }));
}

/** Help: the command list, the docs and shortcuts, the issue report, the legal links, About. */
export function helpMenu(ctx: MenuContext): MenuGroup {
  return {
    id: "help", label: "Help", items: [
      { id: "help.commands", label: "Show all commands", accelerator: "⌘⇧P", run: () => palette().openCommand() },
      { id: "help.docs", label: "Documentation", run: () => openExternal(DOCS_URL) },
      { id: "help.shortcuts", label: "Keyboard shortcuts", run: () => ctx.openSettings("shortcuts") },
      { id: "help.report", label: "Report an issue…", run: () => useIssueReportRequest.getState().open({ title: "", description: "" }), separatorAfter: true },
      ...legalRows(),
      { id: "help.about", label: "About osionos", run: () => useToastStore.getState().push({ kind: "info", title: "osionos", description: "Notion-style collaborative workspace" }) },
    ],
  };
}
