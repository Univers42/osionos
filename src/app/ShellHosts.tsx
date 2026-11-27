/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShellHosts.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ToastViewport } from "@osionos/ui/primitives";
import { WorkspaceThemePanel } from "@/features/theme/WorkspaceThemePanel";
import { ThemeSafeModeBanner } from "@/features/theme/ui/ThemeSafeModeBanner";
import { ShareHost } from "@/features/share/ShareHost";
import { IssueReportHost } from "@/features/issues/ui/IssueReportHost";
import { ExportHost } from "@/features/page-export/ui/ExportHost";
import { ActionGuardHost } from "@/features/app-actions/ui/ActionGuardHost";
import { AiInlinePanel } from "@/features/ai/ui/AiInlinePanel";
import { ContactDock } from "@/widgets/contact-dock/ui/ContactDock";
import { QuickCaptureModal } from "@/features/quick-capture/ui/QuickCaptureModal";
import { WorkspaceIntentModal } from "@/features/workspace-onboarding/ui/WorkspaceIntentModal";
import { ProfessionPickerModal } from "@/features/professions/ui/ProfessionPickerModal";

/** Every overlay the shell hosts beside the workbench: toasts, share/export/report hosts, guards, AI panel, modals. */
export function ShellHosts() {
  return (
    <>
      <ThemeSafeModeBanner />
      <WorkspaceThemePanel />
      <ToastViewport />
      <ShareHost />
      <IssueReportHost />
      <ExportHost />
      <ActionGuardHost />
      <AiInlinePanel />
      <ContactDock />
      <QuickCaptureModal />
      <WorkspaceIntentModal />
      <ProfessionPickerModal />
    </>
  );
}
