/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Select.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Select — the one native `<select>` of the app-side kit, styled like Input so a form's
 * choices and text fields line up. Forwards every native select prop and the ref; a native
 * select keeps keyboard, typeahead and mobile pickers for free.
 */

import React from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={`h-[var(--osio-field-h)] w-full rounded-[var(--osio-field-radius)] border border-[var(--osio-field-border)] bg-[var(--osio-field-bg)] px-2.5 text-sm text-[var(--osio-fg-default)] focus-visible:border-[var(--osio-field-border-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    {...props}
  />
));

Select.displayName = "Select";
