/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useRoomConnection.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * livekit-client Room lifecycle: connect with the bridge-issued grant on
 * mount, disconnect on unmount, and mirror participant/track changes into
 * React state via a version counter (the Room object stays the source of
 * truth; `tracksVersion` tells tiles when to re-attach).
 */

import { useEffect, useState } from "react";
import { ConnectionState, type Participant, Room, RoomEvent } from "livekit-client";
import type { RtcGrant } from "./useRtcToken";

const TRACKED_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
] as const;

export interface RoomConnectionState {
  room: Room | null;
  connectionState: ConnectionState;
  participants: Participant[];
  tracksVersion: number;
  error: string | null;
}

export function useRoomConnection(grant: RtcGrant | null): RoomConnectionState {
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [tracksVersion, setTracksVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!grant) return;
    let active = true;
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
    const bumpTracks = () => setTracksVersion((version) => version + 1);
    for (const event of TRACKED_EVENTS) nextRoom.on(event, bumpTracks);
    nextRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (active) setConnectionState(state);
    });
    nextRoom
      .connect(grant.url, grant.token)
      .then(() => {
        if (!active) return;
        setRoom(nextRoom);
        setError(null);
        bumpTracks();
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not connect to the call.");
      });
    return () => {
      active = false;
      setRoom(null);
      void nextRoom.disconnect();
    };
  }, [grant]);

  // Recomputed on every render: tracksVersion bumps trigger the re-render,
  // and the Room object itself stays the source of truth for membership.
  const participants: Participant[] = room && connectionState === ConnectionState.Connected
    ? [room.localParticipant, ...room.remoteParticipants.values()]
    : [];

  return { room, connectionState, participants, tracksVersion, error };
}
