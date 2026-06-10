/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RoomControls.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Call control bar: mic / camera / screen-share toggles driven by the
 * livekit-client local participant, plus a leave button. Presentation only —
 * state and actions are injected by VideoRoomView.
 */

import React from "react";
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";

interface RoomControlsProps {
  micEnabled: boolean;
  camEnabled: boolean;
  screenEnabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onLeave: () => void;
}

function controlClass(active: boolean): string {
  const base = "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors";
  return active
    ? `${base} bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]`
    : `${base} bg-red-500/15 text-red-400 hover:bg-red-500/25`;
}

export const RoomControls: React.FC<RoomControlsProps> = ({
  micEnabled,
  camEnabled,
  screenEnabled,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onLeave,
}) => (
  <div className="flex items-center justify-center gap-3 border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-4 py-3">
    <button
      type="button"
      onClick={onToggleMic}
      className={controlClass(micEnabled)}
      aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
      aria-pressed={micEnabled}
    >
      {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
    </button>
    <button
      type="button"
      onClick={onToggleCam}
      className={controlClass(camEnabled)}
      aria-label={camEnabled ? "Turn camera off" : "Turn camera on"}
      aria-pressed={camEnabled}
    >
      {camEnabled ? <Video size={18} /> : <VideoOff size={18} />}
    </button>
    <button
      type="button"
      onClick={onToggleScreen}
      className={controlClass(true) + (screenEnabled ? " ring-2 ring-[var(--osio-accent)]" : "")}
      aria-label={screenEnabled ? "Stop sharing screen" : "Share screen"}
      aria-pressed={screenEnabled}
    >
      <MonitorUp size={18} />
    </button>
    <button
      type="button"
      onClick={onLeave}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
      aria-label="Leave call"
    >
      <PhoneOff size={18} />
      Leave
    </button>
  </div>
);
