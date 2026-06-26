/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VideoRoomView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Video call room: fetches an ABAC-checked LiveKit grant from the bridge,
 * connects on mount, renders the participant grid and the control bar.
 * Mountable from anywhere (the chat workstream owns the "Join call" entry
 * point in channel headers): `<VideoRoomView channelId={id} room={name} />`.
 */

import React, { useState } from "react";
import { ConnectionState } from "livekit-client";

import { useUserStore } from "@/features/auth";
import { useRtcToken } from "./useRtcToken";
import { useRoomConnection } from "./useRoomConnection";
import { ParticipantTile } from "./ParticipantTile";
import { RoomControls } from "./RoomControls";
import { useRaiseHand } from "./useRaiseHand";

export interface VideoRoomViewProps {
  channelId: string;
  room: string;
  workspaceId?: string;
  /** Called after the local participant disconnects (close the pane/tab). */
  onLeave?: () => void;
}

function gridColumns(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-2";
  return "grid-cols-3";
}

export const VideoRoomView: React.FC<VideoRoomViewProps> = ({
  channelId,
  room,
  workspaceId,
  onLeave,
}) => {
  const persona = useUserStore((s) => s.activePersona());
  const [left, setLeft] = useState(false);
  const { grant, loading, error: tokenError, refresh } = useRtcToken({
    channelId,
    room,
    workspaceId,
    displayName: persona?.name,
  });
  const connection = useRoomConnection(left ? null : grant);
  const live = connection.room;
  const local = live?.localParticipant;
  const hands = useRaiseHand(live);
  const error = tokenError ?? connection.error;
  const connecting = loading
    || (!error && connection.connectionState !== ConnectionState.Connected);

  const leave = () => {
    setLeft(true);
    onLeave?.();
  };

  if (left) {
    return (
      <section className="flex h-full items-center justify-center bg-[var(--osio-bg-page)] text-sm text-[var(--osio-fg-muted)]">
        You left the call.
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <header className="flex min-h-12 items-center justify-between border-b border-[var(--osio-border-default)] px-4">
        <h1 className="truncate text-sm font-semibold">{grant?.room ?? room}</h1>
        <span className="text-xs text-[var(--osio-fg-muted)]">
          {connection.participants.length > 0
            ? `${connection.participants.length} in call`
            : connecting ? "connecting…" : ""}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="mx-auto max-w-md rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4 text-center text-sm">
            <p className="text-[var(--osio-fg-default)]">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : connecting ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-muted)]">
            Joining the call…
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColumns(connection.participants.length)}`}>
            {connection.participants.map((participant) => (
              <ParticipantTile
                key={participant.identity}
                participant={participant}
                isLocal={participant.identity === grant?.identity}
                tracksVersion={connection.tracksVersion}
                raised={hands.raised.has(participant.identity)}
              />
            ))}
          </div>
        )}
      </div>

      <RoomControls
        micEnabled={local?.isMicrophoneEnabled ?? false}
        camEnabled={local?.isCameraEnabled ?? false}
        screenEnabled={local?.isScreenShareEnabled ?? false}
        onToggleMic={() => void local?.setMicrophoneEnabled(!local.isMicrophoneEnabled)}
        onToggleCam={() => void local?.setCameraEnabled(!local.isCameraEnabled)}
        onToggleScreen={() => void local?.setScreenShareEnabled(!local.isScreenShareEnabled)}
        handRaised={hands.myRaised}
        onToggleHand={hands.toggle}
        room={live}
        onLeave={leave}
      />
    </section>
  );
};
