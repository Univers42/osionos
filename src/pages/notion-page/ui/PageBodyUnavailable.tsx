/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBodyUnavailable.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

interface Props {
  /** Signed out: there is nothing to retry until a session exists. */
  signedIn: boolean;
  onRetry: () => void;
}

/** Shown in place of the editor when a saved page's body is not on this device: an empty
 *  editor there would let the next keystroke overwrite the server's copy. */
export const PageBodyUnavailable: React.FC<Props> = ({ signedIn, onRetry }) => (
  <div role="status" className="flex justify-center px-6 py-16">
    <div className="max-w-sm text-center">
      <p className="text-sm font-semibold text-[var(--osio-fg-default)]">
        {signedIn ? "This page couldn't be loaded" : "Sign in to load this page"}
      </p>
      <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">
        {signedIn
          ? "Its content is on the server and isn't saved on this device. Check your connection, then retry."
          : "Its content is on the server and isn't saved on this device."}
      </p>
      {signedIn && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-[var(--osio-border-default)] px-3 py-1 text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]"
        >
          Retry
        </button>
      )}
    </div>
  </div>
);
