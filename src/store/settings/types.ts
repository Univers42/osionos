/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type PreferredMfaMethod = 'totp' | 'recovery';

export interface AccountSettings {
  userId: string;
  security: {
    hasPassword?: boolean;
    passkeysEnabled?: boolean;
    /** Only orders the options the two-step modal offers; the server never trusts it. */
    preferredMfaMethod?: PreferredMfaMethod;
    passwordUpdatedAt?: string;
  };
  supportAccessGrantedUntil?: string | null;
  removedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PasskeyRecord {
  _id: string;
  userId: string;
  transports: string[];
  nickname?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  removedAt?: string | null;
}

export interface EmailRecord {
  _id: string;
  userId: string;
  email: string;
  isPrimary: boolean;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  weekStart: 'sunday' | 'monday';
  dateFormat: string;
  timezone: string;
  autoTimezone: boolean;
  numberFormat: string;
  enterAddsNewline: boolean;
  cookies: Record<string, unknown>;
  privacy: Record<string, unknown>;
  desktop: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export type PageNotificationOverride = { pageId: string } & Record<string, unknown>;

export interface NotificationSettings {
  userId: string;
  slack: Record<string, unknown>;
  discord: Record<string, unknown>;
  email: Record<string, unknown>;
  inApp: Record<string, unknown>;
  perPageOverrides: PageNotificationOverride[];
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export type ConnectionStatus = 'connected' | 'disabled' | 'error' | 'revoked';

export interface ConnectionRecord {
  _id: string;
  userId: string;
  provider: string;
  label: string;
  scopes: string[];
  status: ConnectionStatus;
  connectedAt: string;
  lastSyncAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member' | 'guest';

export interface WorkspaceSettings {
  workspaceId: string;
  name: string;
  icon?: string;
  landingPageId?: string | null;
  sidebar: Record<string, unknown>;
  analytics: Record<string, unknown>;
  publicDomains?: PublicDomain[];
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export interface WorkspaceMember {
  _id: string;
  workspaceId: string;
  userId: string;
  /** The bridge's display name; absent on local and legacy rows. */
  name?: string;
  role: WorkspaceMemberRole;
  invitedBy?: string;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export interface WorkspaceInvite {
  _id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  token?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportHistoryEntry {
  _id: string;
  userId: string;
  workspaceId: string;
  source: string;
  fileName?: string;
  byteSize?: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  pageIds: string[];
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export interface BillingState {
  workspaceId: string;
  plan: string;
  paymentMethod?: Record<string, unknown> | null;
  billedTo?: Record<string, unknown> | null;
  billingEmail?: string | null;
  invoiceEmails?: string[] | null;
  vatNumber?: string | null;
  upcomingInvoice?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  removedAt?: string | null;
}

export interface BillingInvoice {
  _id: string;
  workspaceId: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  pdfUrl?: string | null;
  createdAt: string;
  removedAt?: string | null;
}

export interface SettingsActionLogEntry {
  _id: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AiSettings {
  workspaceId: string;
  connectors: boolean;
  meetingNotesAutoRecord: boolean;
  agentsEnabled: boolean;
  customAgentsAllowed: boolean;
  searchEverywhereIndexing: boolean;
  summaries: boolean;
  accountContext?: boolean;
  updatedAt: string;
}

/**
 * The voice settings of a user: the dictation and the read-aloud.
 *
 * `allowOnlineVoices` is OFF by default: a voice that is not local sends the
 * text that is read aloud to the browser's vendor.
 */
export interface VoiceSettings {
  /** The language of the dictation: `auto` or a language code. */
  dictationLanguage: string;
  /** The voice of the read-aloud: the URI of a voice of the browser. */
  readAloudVoiceURI: string;
  /** The rate of the read-aloud. */
  readAloudRate: number;
  /** The voices that are not local: OFF until the user says otherwise. */
  allowOnlineVoices: boolean;
  updatedAt: string;
}

export type McpAllowedTool = 'status' | 'search' | 'read' | 'create' | 'update' | 'archive';

// How members are allowed to connect external AI apps through osionos MCP.
export type McpRestrictPolicy = 'all' | 'approved' | 'none';

// One member ↔ external-app link. A member can connect many apps; an app can be
// connected by many members. This is the persisted state that stands in for the
// real per-provider OAuth handshake we don't have locally.
export interface McpConnection {
  appId: string;
  memberId: string;
  memberName: string;
  connectedAt: string;
}

export interface McpSettings {
  workspaceId: string;
  connected: boolean;
  allowedTools: McpAllowedTool[];
  developerMode: boolean;
  restrictPolicy: McpRestrictPolicy;
  approvedApps: string[];
  connections: McpConnection[];
  updatedAt: string;
}

export interface PublicDomain {
  _id: string;
  domain: string;
  homepage: string;
  status: 'draft' | 'live' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface TeamspaceRecord {
  _id: string;
  workspaceId: string;
  name: string;
  owners: string[];
  access: 'default' | 'open' | 'closed' | 'private';
  pageId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export type WorkspaceTeamRole = 'member' | 'lead';

/** A named group of workspace members, as `GET /api/workspaces/:id/teams` answers it. */
export interface WorkspaceTeam {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  memberCount: number;
  /** The caller's own role in the team, `null` when they are not in it. */
  myRole: WorkspaceTeamRole | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkspaceTeamMember {
  userId: string;
  name: string;
  role: WorkspaceTeamRole;
  addedAt: string | null;
}

/** One signed-in device as `GET /api/account/sessions` answers it: one row per sign-in family. */
export interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  authMethod: string;
  ipPrefix: string | null;
  userAgent: string | null;
  current: boolean;
}
