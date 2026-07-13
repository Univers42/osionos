/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PushToggleRow.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Bell, BellOff } from "lucide-react";
import { usePushSubscription } from "../model/usePushSubscription";

/** Enable/disable browser push for this device (hidden unless the push flag is on
 *  and the browser supports it). */
export const PushToggleRow: React.FC = () => {
  const { state, subscribe, unsubscribe, supported } = usePushSubscription();
  if (!supported) return null;
  const on = state === "on";
  const label = state === "denied"
    ? "Notifications blocked in your browser"
    : on ? "Push notifications on" : "Enable push notifications";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--osio-border-default)] px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
        {on ? <Bell size={15} className="text-[var(--osio-accent)]" /> : <BellOff size={15} className="text-[var(--osio-fg-subtle)]" />}
        {label}
      </span>
      <button
        type="button"
        disabled={state === "busy" || state === "denied"}
        onClick={() => (on ? void unsubscribe() : void subscribe())}
        className="rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50"
      >
        {state === "busy" ? "…" : on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
};
