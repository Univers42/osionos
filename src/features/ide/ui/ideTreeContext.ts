/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideTreeContext.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext, useContext } from "react";

import type { IdeCreateRequest, IdeFileOps } from "../model/useIdeFileOps";
import type { IdeTreeNode } from "../model/ideFileTree";

/** Everything a tree row needs, provided once so recursive rows stay prop-light. */
export interface IdeTreeContextValue {
  ops: IdeFileOps;
  activeId: string | null;
  expanded: Set<string>;
  toggle: (id: string) => void;
  openFile: (node: IdeTreeNode) => void;
  renamingId: string | null;
  startRename: (id: string) => void;
  submitRename: (id: string, name: string) => void;
  cancelRename: () => void;
  create: IdeCreateRequest | null;
  startCreate: (parentId: string | null, kind: "code" | "folder") => void;
  submitCreate: (name: string) => void;
  cancelCreate: () => void;
}

export const IdeTreeContext = createContext<IdeTreeContextValue | null>(null);

export function useIdeTree(): IdeTreeContextValue {
  const value = useContext(IdeTreeContext);
  if (!value) throw new Error("useIdeTree must be used within the IDE explorer tree");
  return value;
}
