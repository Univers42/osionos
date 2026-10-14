/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   consolePrimitives.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared, dependency-light building blocks for the BaaS console. Coders 2/3
 * import these so every section looks consistent (same osio.* design tokens as
 * the rest of the app). React only — no extra deps.
 */

import React from "react";

interface SectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

interface RowProps {
  label?: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/** A titled console block with optional icon, sub-text, a header action, and body. */
export const ConsoleSection: React.FC<SectionProps> = ({ title, description, icon, action, children }) => (
  <section className="mb-8">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--osio-fg-default)]">
        {icon}
        {title}
      </h2>
      {action}
    </div>
    {description ? (
      <p className="mt-0.5 mb-3 text-xs text-[var(--osio-fg-muted)]">{description}</p>
    ) : (
      <div className="mb-3" />
    )}
    <div>{children}</div>
  </section>
);

/**
 * A settings-style row. With `children` it is a free-form row container (e.g. a
 * table row of cells); otherwise it renders the label / value / action triplet.
 */
export const ConsoleRow: React.FC<RowProps> = ({ label, value, action, children }) => {
  if (children != null) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-[var(--osio-db-line-soft)] last:border-b-0 text-sm text-[var(--osio-fg-default)]">
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--osio-db-line-soft)] last:border-b-0">
      <span className="text-sm text-[var(--osio-fg-muted)] shrink-0">{label}</span>
      <span className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)] min-w-0">
        {value != null && <span className="truncate">{value}</span>}
        {action}
      </span>
    </div>
  );
};

/** A muted, centered "nothing here" placeholder (pass `message` or children). */
export const ConsoleEmpty: React.FC<{ message?: string; children?: React.ReactNode }> = ({ message, children }) => (
  <div className="flex items-center justify-center py-12 px-6 text-center text-sm text-[var(--osio-fg-muted)]">
    {children ?? message}
  </div>
);
