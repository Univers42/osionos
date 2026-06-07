/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PagePropertiesPanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Plus } from "lucide-react";

import { PropIcon } from "@/shared/notion-database-sys/src/constants/propertyIcons";
import type { PagePropertyEntry, PagePropertyType } from "../model/types";
import { ADD_PROPERTY_CHOICES, makeProperty, notionIconType } from "./pageProperties.helpers";
import { PagePropertyRow } from "./PagePropertyRow";

interface Props {
  pageId: string;
  workspaceId: string;
  properties: PagePropertyEntry[];
  editable: boolean;
  onChangeValue: (key: string, value: PagePropertyEntry["value"]) => void;
  onAddProperty: (property: PagePropertyEntry) => void;
  onRemoveProperty: (key: string) => void;
}

/**
 * Notion-style "Page properties" table (role="table"): a typed row per property with an icon,
 * a name, and an editable value, plus an "Add a property" menu of notion-database-sys types.
 */
export const PagePropertiesPanel: React.FC<Props> = ({
  pageId,
  workspaceId,
  properties,
  editable,
  onChangeValue,
  onAddProperty,
  onRemoveProperty,
}) => {
  const [adding, setAdding] = useState(false);

  function addOfType(type: PagePropertyType, label: string) {
    onAddProperty(makeProperty(type, label, properties));
    setAdding(false);
  }

  if (properties.length === 0 && !editable) return null;

  return (
    <div role="table" aria-label="Page properties" className="osionos-page-properties mt-1 flex flex-col gap-0.5">
      {properties.map((property) => (
        <PagePropertyRow
          key={property.key}
          property={property}
          workspaceId={workspaceId}
          pageId={pageId}
          editable={editable}
          onChangeValue={onChangeValue}
          onRemove={onRemoveProperty}
        />
      ))}
      {editable ? (
        <div className="relative mt-0.5">
          <button type="button" onClick={() => setAdding((open) => !open)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-sm text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)]">
            <Plus size={14} /> Add a property
          </button>
          {adding ? (
            <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-lg">
              {ADD_PROPERTY_CHOICES.map((choice) => (
                <button key={`${choice.type}:${choice.label}`} type="button" onClick={() => addOfType(choice.type, choice.label)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)]">
                  <PropIcon type={notionIconType(choice.type)} className="h-4 w-4 shrink-0 text-[var(--osio-fg-muted)]" />
                  {choice.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
