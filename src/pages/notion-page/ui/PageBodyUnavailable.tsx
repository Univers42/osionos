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
import { CloudOff, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui";

interface Props {
  /** Signed out: there is nothing to retry until a session exists. */
  signedIn: boolean;
  onRetry: () => void;
}

/** Shown in place of the editor when a saved page's body is not on this device: an empty
 *  editor there would let the next keystroke overwrite the server's copy. */
export const PageBodyUnavailable: React.FC<Props> = ({ signedIn, onRetry }) => (
  <div role="status" className="osionos-page-notice flex flex-col items-center py-16 text-center">
    <CloudOff size={20} aria-hidden className="mb-3 text-[var(--osio-fg-subtle)]" />
    <p className="text-sm font-medium text-[var(--osio-fg-default)]">
      {signedIn ? "This page couldn't be loaded" : "Sign in to load this page"}
    </p>
    <p className="mt-1 max-w-sm text-sm text-[var(--osio-fg-muted)]">
      {signedIn
        ? "Its content is on the server and isn't saved on this device. Check your connection, then retry."
        : "Its content is on the server and isn't saved on this device."}
    </p>
    {signedIn && (
      <Button size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw size={12} aria-hidden /> Retry
      </Button>
    )}
  </div>
);
