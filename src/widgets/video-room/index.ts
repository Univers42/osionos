/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * video-room widget — self-hosted LiveKit conferencing.
 *
 * Mount point for the chat workstream's "Join call" entry:
 *   <VideoRoomView channelId={channel.id} room={`channel-${channel.id}`}
 *                  workspaceId={workspaceId} onLeave={closePane} />
 *
 * Server side: POST /api/rtc/token (scripts/bridge-rtc.mjs) checks
 * osionos_workspace_members before minting the room token; the SFU is the
 * `livekit` compose service (ws://127.0.0.1:7880 — loopback ws is exempt
 * from mixed-content blocking on the https app origin).
 */

export { VideoRoomView, type VideoRoomViewProps } from "./VideoRoomView";
export { useRtcToken, type RtcGrant, type RtcTokenRequest, type RtcTokenState } from "./useRtcToken";
export { useRoomConnection, type RoomConnectionState } from "./useRoomConnection";
export { ParticipantTile } from "./ParticipantTile";
export { RoomControls } from "./RoomControls";
