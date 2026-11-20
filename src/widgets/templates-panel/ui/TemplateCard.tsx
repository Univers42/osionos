/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplateCard.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";

import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { runAppAction } from "@/features/app-actions/model/runAppAction";
import { TemplatePreview } from "./TemplatePreview";

type Navigate = (event: React.KeyboardEvent<HTMLDivElement>) => void;
interface CardProps {
  card: CatalogueCard;
  focused: boolean;
  onFocus: () => void;
  onNavigate: Navigate;
}
interface OptionProps extends Omit<CardProps, "onFocus"> {
  expanded: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

function applyTemplate(templateId: string): void {
  void runAppAction("template.apply", { templateId }, { mode: "live", trusted: true });
}

function cardKeyDown(event: React.KeyboardEvent<HTMLDivElement>, id: string, toggle: () => void, navigate: Navigate): void {
  if (event.key === "Enter") { event.preventDefault(); toggle(); return; }
  if (event.key.toLowerCase() === "a" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    applyTemplate(id);
    return;
  }
  navigate(event);
}

function NewPageButton({ templateId }: { templateId: string }): React.ReactElement {
  return (
    <span role="button" className="inline-flex shrink-0 cursor-pointer items-center rounded-[var(--osio-control-radius)] px-2 py-1 text-xs font-medium text-[var(--osio-accent-text)] hover:bg-[var(--osio-bg-hover)]"
      onClick={(event) => { event.stopPropagation(); applyTemplate(templateId); }}>
      New page
    </span>
  );
}

function CardOption({ card, focused, expanded, onToggle, onFocus, onBlur, onNavigate }: OptionProps): React.ReactElement {
  return (
    <div
      role="option"
      aria-selected={focused || expanded}
      aria-keyshortcuts="Enter A"
      data-template-id={card.id}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onToggle}
      onKeyDown={(event) => cardKeyDown(event, card.id, onToggle, onNavigate)}
      className="flex cursor-pointer items-start gap-2 rounded-md px-2 pt-2 text-left outline-none hover:bg-[var(--osio-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0"><IconValueView value={card.icon} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">{card.title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--osio-fg-muted)]">{card.description}</span>
      </span>
      <NewPageButton templateId={card.id} />
    </div>
  );
}

export function TemplateCard({ card, focused, onFocus, onNavigate }: CardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const toggle = () => setExpanded((value) => !value);
  const focus = () => { setActive(true); onFocus(); };
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="mb-1">
      <CardOption card={card} focused={focused} expanded={expanded} onToggle={toggle} onFocus={focus} onBlur={() => setActive(false)} onNavigate={onNavigate} />
      {hovered || active || expanded ? <TemplatePreview card={card} /> : null}
    </div>
  );
}
