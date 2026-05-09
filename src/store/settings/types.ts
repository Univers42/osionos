export interface AccountSettings {
  userId: string;
  profile: {
    preferredName?: string;
    avatar?: string;
    locale?: string;
  };
  security: {
    hasPassword?: boolean;
    twoStepEnabled?: boolean;
    passkeysEnabled?: boolean;
    passwordUpdatedAt?: string;
  };
  supportAccessGrantedUntil?: string | null;
  pendingDeletionAt?: string | null;
  removedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord {
  _id: string;
  userId: string;
  deviceFingerprint: string;
  userAgent?: string;
  ipHash?: string;
  location?: string;
  lastActiveAt: string;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasskeyRecord {
  _id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  nickname?: string;
  createdAt: string;
  updatedAt: string;
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
  updatedAt: string;
}

export type McpAllowedTool = 'status' | 'search' | 'read' | 'create' | 'update' | 'archive';

export interface McpSettings {
  workspaceId: string;
  connected: boolean;
  allowedTools: McpAllowedTool[];
  developerMode: boolean;
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
