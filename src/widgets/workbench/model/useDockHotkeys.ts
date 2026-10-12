/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDockHotkeys.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { useWorkbenchStore } from "./workbenchStore";

/** Ctrl+` and Ctrl+J toggle the dock (both VS Code chords), same guards as the legacy IdeShell. */
export function useDockHotkeys(): void {
  const toggleDock = useWorkbenchStore((s) => s.toggleDock);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "`" || e.key.toLowerCase() === "j")) {
        e.preventDefault();
        toggleDock();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [toggleDock]);
}
