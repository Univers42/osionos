/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeActivityBar.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertCircle, Files, GitBranch, LogOut, Play, Search } from "lucide-react";

import type { IdePanel } from "@/features/ide/model/ideModeStore";

interface Props {
  active: IdePanel;
  onSelect: (panel: IdePanel) => void;
  onExit: () => void;
}

const ITEMS: { panel: IdePanel; label: string; Icon: typeof Files }[] = [
  { panel: "explorer", label: "Explorer", Icon: Files },
  { panel: "search", label: "Search", Icon: Search },
  { panel: "scm", label: "Source Control", Icon: GitBranch },
  { panel: "run", label: "Run", Icon: Play },
  { panel: "problems", label: "Problems", Icon: AlertCircle },
];

/** The narrow icon rail on the far left of the IDE shell. Switches the side
 *  panel; the bottom control exits IDE mode back to the normal workspace. */
export const IdeActivityBar: React.FC<Props> = ({ active, onSelect, onExit }) => {
  return (
    <nav
      aria-label="IDE activity bar"
      className="flex w-11 shrink-0 flex-col items-center border-r border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] py-1.5"
    >
      {ITEMS.map(({ panel, label, Icon }) => {
        const isActive = active === panel;
        return (
          <button
            key={panel}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onSelect(panel)}
            className={
              "relative flex h-10 w-11 items-center justify-center " +
              (isActive
                ? "text-[var(--osio-code-fg)]"
                : "text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]")
            }
          >
            {isActive && <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-[var(--osio-accent)]" />}
            <Icon size={20} />
          </button>
        );
      })}
      <span className="flex-1" />
      <button
        type="button"
        title="Exit IDE mode"
        aria-label="Exit IDE mode"
        onClick={onExit}
        className="flex h-10 w-11 items-center justify-center text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]"
      >
        <LogOut size={19} />
      </button>
    </nav>
  );
};
