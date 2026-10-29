/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IssueReportHost.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";
import { useErrorRingForDeveloper } from "@/features/issues/model/errorRing";
import { ReportIssueDialog } from "./ReportIssueDialog";

export const IssueReportHost: React.FC = () => {
  const request = useIssueReportRequest((state) => state.request);
  const clear = useIssueReportRequest((state) => state.clear);
  useErrorRingForDeveloper();

  if (!request) return null;
  return (
    <ReportIssueDialog
      open={true}
      title={request.title}
      description={request.description}
      onClose={clear}
    />
  );
};
