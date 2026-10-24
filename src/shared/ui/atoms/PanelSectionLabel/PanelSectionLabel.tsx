/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PanelSectionLabel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

interface Props {
  as?: "p" | "h2";
  /** Spacing only: the type is fixed so every panel's section labels read alike. */
  className?: string;
  children: React.ReactNode;
}

// Inline because the global h1-h4 rule is unlayered, so it beats every Tailwind
// utility (all layered) and an h2 label would come out serif and tracked.
const UI_TYPE = { fontFamily: "var(--osio-font-ui)", letterSpacing: "normal" } as const;

/** A section label inside a sidebar panel: sentence case, medium weight, muted,
 *  the same as the kit's SidebarSection label. */
export const PanelSectionLabel: React.FC<Props> = ({ as: Tag = "p", className, children }) => (
  <Tag data-section-label style={UI_TYPE} className={`text-xs font-medium text-[var(--osio-fg-muted)] ${className ?? ""}`.trimEnd()}>
    {children}
  </Tag>
);
