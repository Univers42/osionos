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

type Tone = "default" | "primary" | "danger" | "ghost";

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

interface ButtonProps {
  onClick?: () => void;
  tone?: Tone;
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
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
      <div className="flex items-center gap-3 py-2 border-b border-[var(--osio-border-default)] last:border-b-0 text-sm text-[var(--osio-fg-default)]">
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--osio-border-default)] last:border-b-0">
      <span className="text-sm text-[var(--osio-fg-muted)] shrink-0">{label}</span>
      <span className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)] min-w-0">
        {value != null && <span className="truncate">{value}</span>}
        {action}
      </span>
    </div>
  );
};

const TONE_CLASS: Record<Tone, string> = {
  default: "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)] hover:opacity-90",
  primary: "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90",
  danger: "bg-[var(--osio-danger)] text-white hover:opacity-90",
  ghost: "bg-transparent text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]",
};

/** A console action button with a small set of semantic tones. */
export const ConsoleButton: React.FC<ButtonProps> = ({ onClick, tone = "default", type = "button", disabled, children }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${TONE_CLASS[tone]}`}
  >
    {children}
  </button>
);

/** A muted, centered "nothing here" placeholder (pass `message` or children). */
export const ConsoleEmpty: React.FC<{ message?: string; children?: React.ReactNode }> = ({ message, children }) => (
  <div className="flex items-center justify-center py-12 px-6 text-center text-sm text-[var(--osio-fg-muted)]">
    {children ?? message}
  </div>
);
