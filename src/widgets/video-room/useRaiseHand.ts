/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useRaiseHand.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Raise-hand over the LiveKit data channel (needs the canPublishData grant).
 * Each participant broadcasts {type:'raise-hand', raised} reliably; we track the
 * set of raised identities and clear them on disconnect.
 */

import { useEffect, useState } from 'react';
import { RoomEvent, type Participant, type RemoteParticipant, type Room } from 'livekit-client';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export function useRaiseHand(room: Room | null) {
  const [raised, setRaised] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!room) return undefined;
    const onData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      if (!participant) return;
      try {
        const message = JSON.parse(DECODER.decode(payload)) as { type?: string; raised?: boolean };
        if (message.type !== 'raise-hand') return;
        setRaised((prev) => {
          const next = new Set(prev);
          if (message.raised) next.add(participant.identity); else next.delete(participant.identity);
          return next;
        });
      } catch { /* non-JSON / unrelated data message */ }
    };
    const onLeft = (participant: Participant) => setRaised((prev) => {
      const next = new Set(prev); next.delete(participant.identity); return next;
    });
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => { room.off(RoomEvent.DataReceived, onData); room.off(RoomEvent.ParticipantDisconnected, onLeft); };
  }, [room]);

  const myId = room?.localParticipant.identity;
  const myRaised = myId ? raised.has(myId) : false;
  const toggle = () => {
    if (!room || !myId) return;
    const next = !myRaised;
    void room.localParticipant.publishData(ENCODER.encode(JSON.stringify({ type: 'raise-hand', raised: next })), { reliable: true });
    setRaised((prev) => { const updated = new Set(prev); if (next) updated.add(myId); else updated.delete(myId); return updated; });
  };

  return { raised, myRaised, toggle };
}
