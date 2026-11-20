/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CatalogueTemplatePeek.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { TemplateSource } from "@/features/templates/model/templateSlice";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { RecordPeekFrame } from "./WorkspaceDatabaseBlock";

type LoadedSource = TemplateSource | null | undefined;

function previewBody(source: LoadedSource): React.ReactNode {
  if (source === undefined) {
    return <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">Loading template…</div>;
  }
  if (source === null) {
    return <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">Template unavailable</div>;
  }
  return (
    <div className="mx-auto max-w-3xl px-10 py-10">
      <h1 className="osio-h1 mb-6">{source.title || "Untitled"}</h1>
      <PageBlocksRenderer blocks={source.content ?? []} />
    </div>
  );
}

export const CatalogueTemplatePeek: React.FC<{
  templateId: string;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}> = ({ templateId, onClose, action }) => {
  const [source, setSource] = React.useState<LoadedSource>(undefined);
  React.useEffect(() => {
    let active = true;
    setSource(undefined);
    void import("@/data/templates/catalogue")
      .then((module) => module.loadTemplate(templateId))
      .then((loaded) => { if (active) setSource(loaded); })
      .catch(() => { if (active) setSource(null); });
    return () => { active = false; };
  }, [templateId]);
  return (
    <RecordPeekFrame label="Shipped template · read-only preview" onClose={onClose} action={action}>
      {previewBody(source)}
    </RecordPeekFrame>
  );
};
