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
import { notionIconType } from "./pageProperties.helpers";
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
export const PagePropertyRow: React.FC<Props> = ({ property, workspaceId, pageId, editable, onChangeValue, onRemove }) => (
  <div role="row" className="group flex items-start gap-1">
    <div className="flex h-8 w-40 shrink-0 items-center gap-1.5 rounded px-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
      <PropIcon type={notionIconType(property.type)} className="h-4 w-4 shrink-0" />
      <span className="truncate">{property.label}</span>
    </div>
    <div className="min-h-8 min-w-0 flex-1 py-1">
      {property.type === "relation" ? (
        <PageRelationField
          workspaceId={workspaceId}
          excludePageId={pageId}
          value={property.value}
          editable={editable}
          onChange={(ids) => onChangeValue(property.key, ids)}
        />
      ) : (
        <PagePropertyValueField
          property={property}
          editable={editable}
          onChange={(value) => onChangeValue(property.key, value)}
        />
      )}
    </div>
    {editable ? (
      <button type="button" onClick={() => onRemove(property.key)} title="Remove property"
        className="mt-1 rounded p-1 text-[var(--osio-fg-subtle)] opacity-0 hover:bg-[var(--osio-bg-subtle)] group-hover:opacity-100">
        <X size={13} />
      </button>
    ) : null}
  </div>
);
