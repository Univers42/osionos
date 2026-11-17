/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadmePrompt.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The owner's "Write your README" row, shown in the main column while the README card has
 * nothing to draw. It opens the same README page as the Customize button.
 */

import React from "react";

import { useReadmeCustomize } from "./useReadmeCustomize";

export const ReadmePrompt: React.FC = () => {
  const { busy, message, gone, customize } = useReadmeCustomize();
  return (
    <div className="rounded-[var(--osio-radius-panel)] border border-dashed border-[var(--osio-border-default)] p-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => void customize(gone)}
        className="text-sm text-[var(--osio-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:opacity-60"
      >
        Write your README
      </button>
      {message && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{message}</p>}
    </div>
  );
};
