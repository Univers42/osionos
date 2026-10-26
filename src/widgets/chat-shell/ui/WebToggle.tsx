/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WebToggle.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The "Web" toggle of the composer: this message may search the web and read
 * pages. The composer draws it only when the workspace switch is on; it starts
 * off and goes back to off after every send (useWebToggle.take).
 */

import React from "react";
import { Globe } from "lucide-react";

import { useWebToggle } from "@/features/ai/model/webToggle";
import { WEB_DISCLOSURE } from "@/features/ai/model/webSettings";

/** The pure view: the container feeds it the store, a test feeds it a state. */
export const WebToggleView: React.FC<{ pressed: boolean; onPress: (next: boolean) => void }> = ({ pressed, onPress }) => {
  return (
    <>
      <button
        type="button"
        aria-pressed={pressed}
        data-testid="ai-web-toggle"
        onClick={() => onPress(!pressed)}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${
          pressed ? "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent)]" : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
        }`}
      >
        <Globe size={16} aria-hidden="true" /> Web
      </button>
      {pressed ? (
        <p role="note" data-testid="ai-web-disclosure" className="basis-full px-1 text-2xs text-[var(--osio-fg-muted)]">
          {WEB_DISCLOSURE}
        </p>
      ) : null}
    </>
  );
};

export const WebToggle: React.FC = () => {
  const pressed = useWebToggle((state) => state.pressed);
  const set = useWebToggle((state) => state.set);
  return <WebToggleView pressed={pressed} onPress={set} />;
};
