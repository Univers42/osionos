/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   realtimeTransport.port.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ONLY cross-client I/O abstraction the Shared-collaboration domain may
 * depend on (AOC §1.2/§5). The domain + the zustand collab slice import this
 * port and nothing else; exactly one adapter binds it to the grobase
 * realtime-agnostic WebSocket gateway. This file imports NO transport.
 *
 * DELIBERATELY ABSENT: any 'mouse'/'pointer'/'cursorMove' variant — mouse
 * position is never sent or rendered (AOC R-A1). Only the keyboard caret,
 * selection, focus, decaying activity, navigation, and durable-announce events
 * travel here. Validate every inbound frame at the boundary (R-P1) via
 * `validateCollabEvent` before it reaches a reducer or the render path.
 */

export type Unsubscribe = () => void;

export interface CaretState { blockId: string; offset: number; }
export interface SelectionRange { anchor: CaretState; focus: CaretState; }
export interface Anchor { blockId: string; offset?: number; }

export interface PresenceState {
  memberId: string;
  displayName: string;
  color: string;                 // assigned, WCAG-safe (AOC R-A8)
  avatarRef?: string;
  route: string;
  caret?: CaretState | null;
  selection?: SelectionRange | null;
  focusedElementId?: string | null;
  lastSeen: number;
}

export type ActivityKind =
  | 'clicked' | 'created-block' | 'deleted-block'
  | 'opened-panel' | 'navigated' | 'seeded-file' | 'note';

export type NoteOp = 'created' | 'resolved' | 'deleted';
export type FileOp = 'seeded' | 'removed';

/** Every realtime message is exactly one of these (AOC §5 + R-P1). */
export type CollabEvent =
  | { t: 'caret';     actor: string; seq: number; caret: CaretState }
  | { t: 'selection'; actor: string; seq: number; range: SelectionRange | null }
  | { t: 'focus';     actor: string; seq: number; elementId: string | null }
  | { t: 'activity';  actor: string; seq: number; kind: ActivityKind; targetId: string }
  | { t: 'nav';       actor: string; seq: number; route: string }
  | { t: 'note';      actor: string; noteId: string; op: NoteOp; anchor: Anchor }
  | { t: 'file';      actor: string; fileId: string; op: FileOp; name: string };

export interface SummonReq { kind: 'summon'; route: string; anchor?: Anchor; message?: string; }
export interface SummonRes { accepted: boolean; }

export interface RealtimeChannel {
  broadcast(event: CollabEvent): void;                                   // ephemeral, fire-and-forget
  onEvent(handler: (e: CollabEvent) => void): Unsubscribe;

  setPresence(patch: Partial<PresenceState>): void;                      // native TRACK (gateway-backed)
  onPresence(handler: (members: PresenceState[]) => void): Unsubscribe;

  request(target: string, req: SummonReq): Promise<SummonRes>;           // directed, consent-gated (synthesized)
  onRequest(handler: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe;

  leave(): void;                                                          // tears down every subscription
}

export interface RealtimeTransport {
  // authToken proves Shared-space membership; join is authorized server-side (AOC §1.6/§Sec1).
  join(spaceId: string, authToken: string): Promise<RealtimeChannel>;
}
