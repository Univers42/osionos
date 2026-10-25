/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   issueReportRequest.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

export interface IssueReportRequest {
  title: string;
  description: string;
}

interface IssueReportRequestStore {
  request: IssueReportRequest | null;
  open: (req: IssueReportRequest) => void;
  clear: () => void;
}

export const useIssueReportRequest = create<IssueReportRequestStore>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  clear: () => set({ request: null }),
}));