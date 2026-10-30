/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PagePropertyRow.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { X } from "lucide-react";

import { PropIcon } from "@/shared/notion-database-sys/src/constants/propertyIcons";
import type { PagePropertyEntry } from "../model/types";
import { asStringArray, notionIconType } from "./pageProperties.helpers";
import { PagePropertyValueField } from "./PagePropertyValueField";
import { PageRelationField } from "./PageRelationField";

interface Props {
  property: PagePropertyEntry;
  workspaceId: string;
  pageId: string;
  editable: boolean;
  onChangeValue: (key: string, value: PagePropertyEntry["value"]) => void;
  onRemove: (key: string) => void;
}

/** One row of the Notion-style page-properties table: [type icon · name] [value] [remove]. */
export const PagePropertyRow: React.FC<Props> = ({ property, workspaceId, pageId, editable, onChangeValue, onRemove }) => {
  const canEditValue = editable && !property.readOnly;
  return (
  <div data-property-key={property.key} className="group flex items-start gap-1 min-w-0 max-w-full">
    <div className="flex h-8 w-32 sm:w-40 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
      <PropIcon type={notionIconType(property.type)} className="h-4 w-4 shrink-0" />
      <span className="truncate">{property.label}</span>
    </div>
    <div className="min-h-8 min-w-0 flex-1 py-1">
      {property.type === "relation" && property.relationTarget === "database" ? (
        // Database targets store names (a database, a view, a record's related rows), not
        // page ids: looked up as pages, every chip read "Untitled" (live Home, 2026-10-26; #162).
        <div className="flex flex-wrap items-center gap-1">
          {asStringArray(property.value).map((name, index) => <span key={`${index}:${name}`} className="osio-chip">{name}</span>)}
        </div>
      ) : property.type === "relation" ? (
        <PageRelationField
          workspaceId={workspaceId}
          excludePageId={pageId}
          value={property.value}
          editable={canEditValue}
          onChange={(ids) => onChangeValue(property.key, ids)}
        />
      ) : (
        <PagePropertyValueField
          property={property}
          editable={canEditValue}
          onChange={(value) => onChangeValue(property.key, value)}
        />
      )}
    </div>
    {editable ? (
      // Shown on hover AND whenever focus is in the row: a keyboard user could tab onto
      // an invisible button before (#162).
      <button type="button" onClick={() => onRemove(property.key)} title="Remove property"
        className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-[var(--osio-fg-muted)] opacity-0 hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100">
        <X size={14} />
      </button>
    ) : null}
  </div>
  );
};
