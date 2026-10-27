/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThemeJsonView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isThemesEnabled } from "@/shared/config/featureFlags";
import { parseThemeJsonPageId } from "@/widgets/workspace-grid/model/layoutPersist";

const LazyEditor = React.lazy(() =>
  import("./ThemeJsonEditor").then((module) => ({ default: module.ThemeJsonEditor })),
);

function Notice({ children }: { children: string }) {
  return (
    <div role="status" className="flex h-full items-center justify-center p-6 text-sm text-[var(--osio-fg-muted)]">
      {children}
    </div>
  );
}

export function ThemeJsonView({ pageId }: { pageId: string }) {
  if (!isThemesEnabled()) return <Notice>Custom themes are turned off.</Notice>;
  const target = parseThemeJsonPageId(pageId);
  if (!target) return <Notice>This tab does not name a theme.</Notice>;
  return (
    <React.Suspense fallback={<Notice>Loading editor…</Notice>}>
      <LazyEditor pageId={pageId} />
    </React.Suspense>
  );
}
