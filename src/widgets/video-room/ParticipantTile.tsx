/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ParticipantTile.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One participant in the call grid: camera video (or an initial avatar when
 * the camera is off), remote audio playback, name label and mic-mute badge.
 */

import React, { useEffect, useRef } from "react";
import { MicOff } from "lucide-react";
import { type Participant, Track } from "livekit-client";

interface ParticipantTileProps {
  participant: Participant;
  isLocal: boolean;
  /** Bumped by useRoomConnection whenever tracks change → re-attach media. */
  tracksVersion: number;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isLocal,
  tracksVersion,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera)?.track;
  const screenTrack = participant.getTrackPublication(Track.Source.ScreenShare)?.track;
  const audioTrack = participant.getTrackPublication(Track.Source.Microphone)?.track;
  const videoTrack = screenTrack ?? cameraTrack;
  const micEnabled = participant.isMicrophoneEnabled;
  const label = participant.name || participant.identity;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !videoTrack) return;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack, tracksVersion]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element || !audioTrack || isLocal) return;
    audioTrack.attach(element);
    return () => {
      audioTrack.detach(element);
    };
  }, [audioTrack, isLocal, tracksVersion]);

  return (
    <figure className="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)]">
      {videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--osio-accent)] text-xl font-semibold text-[var(--osio-accent-fg)]">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay />}
      <figcaption className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
        <span className="truncate">
          {label}
          {isLocal ? " (you)" : ""}
        </span>
        {!micEnabled && <MicOff size={12} className="shrink-0 text-red-400" aria-label="Muted" />}
      </figcaption>
    </figure>
  );
};
