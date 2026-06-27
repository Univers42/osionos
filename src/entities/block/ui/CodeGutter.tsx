/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeGutter.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { forwardRef } from "react";

/** A right-aligned column of line numbers, sized and spaced to line up with a
 *  `font-mono text-sm leading-6` code body (same py-4 top padding). The caller
 *  positions it; the inner ref is translated to follow vertical scroll. */
export const CodeGutter = forwardRef<
  HTMLDivElement,
  { lineCount: number; className?: string }
>(({ lineCount, className }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={`select-none py-4 pr-3 text-right font-mono text-sm leading-6 text-[var(--osio-code-fg-muted)] [font-variant-numeric:tabular-nums] ${className ?? ""}`}
  >
    {Array.from({ length: Math.max(1, lineCount) }, (_, index) => (
      <div key={index}>{index + 1}</div>
    ))}
  </div>
));

CodeGutter.displayName = "CodeGutter";
