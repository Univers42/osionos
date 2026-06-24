/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Card.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { cx } from "../shared/classNames";

/**
 * Card — docs-style nav card.
 * Props:
 *   icon?: React.ReactNode   leading icon (lucide 14/16/18, currentColor)
 *   title?: string           heading line
 *   description?: string      muted sub-line
 *   href?: string            renders an <a> when set
 *   onClick?                 renders/keeps interactivity (button when no href)
 *   children?: React.ReactNode  free-form body (overrides title/description block)
 *   className?: string
 * 1px border, rounded-lg, bg-surface; on hover the border turns accent and a
 * subtle shadow appears (~120ms). Interactive variants get the accent focus ring.
 */
export interface CardProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  children?: React.ReactNode;
  className?: string;
}

const BASE = "block rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-left transition-colors duration-[120ms]";
const INTERACTIVE = "hover:border-[var(--osio-accent)] hover:shadow-[var(--osio-shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)]";

function CardBody({ icon, title, description, children }: Pick<CardProps, "icon" | "title" | "description" | "children">) {
  if (children) return <>{children}</>;
  return (
    <div className="flex items-start gap-3">
      {icon ? <span className="shrink-0 text-[var(--osio-accent)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        {title ? <span className="block text-sm font-semibold text-[var(--osio-fg-strong)]">{title}</span> : null}
        {description ? <span className="mt-0.5 block text-sm text-[var(--osio-fg-muted)]">{description}</span> : null}
      </span>
    </div>
  );
}

export const Card: React.FC<CardProps> = ({ icon, title, description, href, onClick, children, className }) => {
  const body = <CardBody icon={icon} title={title} description={description}>{children}</CardBody>;
  if (href) {
    return (
      <a href={href} onClick={onClick} className={cx(BASE, INTERACTIVE, className)}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(BASE, INTERACTIVE, "w-full", className)}>
        {body}
      </button>
    );
  }
  return <div className={cx(BASE, className)}>{body}</div>;
};
