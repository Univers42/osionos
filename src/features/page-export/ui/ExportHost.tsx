/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExportHost.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Mounted once in App: renders the ExportDialog for whatever page the global
 * useExportTarget store points at, so non-React callers (the page context
 * menu's "Export") can open it. Lazy so the export feature stays out of the
 * warm chunk until an export is requested.
 */

import React, { Suspense, lazy } from "react";
import { useExportTarget } from "../model/useExportTarget";

const LazyExportDialog = lazy(() =>
  import("./ExportDialog").then((m) => ({ default: m.ExportDialog })),
);

export const ExportHost: React.FC = () => {
  const target = useExportTarget((s) => s.target);
  const close = useExportTarget((s) => s.close);
  if (!target) return null;
  return (
    <Suspense fallback={null}>
      <LazyExportDialog
        open
        pageId={target.pageId}
        workspaceId={target.workspaceId}
        onClose={close}
      />
    </Suspense>
  );
};
