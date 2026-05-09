import type {
  AccountSettings,
  BillingState,
  ConnectionRecord,
  DeviceRecord,
  EmailRecord,
  NotificationSettings,
  UserPreferences,
  WorkspaceMember,
  WorkspaceSettings,
} from './types';
import { nowIso } from './settingsStoreUtils';

export function defaultAccountSettings(userId: string, name?: string): AccountSettings {
  const timestamp = nowIso();
  return {
    userId,
    profile: { preferredName: name },
    security: { hasPassword: true, twoStepEnabled: false, passkeysEnabled: false },
    supportAccessGrantedUntil: null,
    pendingDeletionAt: null,
    removedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function defaultDevice(userId: string): DeviceRecord {
  const timestamp = nowIso();
  return {
    _id: 'current-device',
    userId,
    deviceFingerprint: 'current-device',
    userAgent: typeof navigator === 'undefined' ? 'This device' : navigator.userAgent,
    location: 'This device',
    lastActiveAt: timestamp,
    revokedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function defaultEmail(userId: string, email: string): EmailRecord {
  const timestamp = nowIso();
  return {
    _id: `primary-${userId}`,
    userId,
    email,
    isPrimary: true,
    verifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export function defaultPreferences(userId: string): UserPreferences {
  const timestamp = nowIso();
  return {
    userId,
    theme: 'system',
    language: 'en-US',
    weekStart: 'monday',
    dateFormat: 'relative',
    timezone: 'Europe/Madrid',
    autoTimezone: false,
    numberFormat: 'default',
    enterAddsNewline: false,
    cookies: { mode: 'customize' },
    privacy: { viewHistory: true, profileDiscoverability: true },
    desktop: { openOnStart: 'last-visited-page' },
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export function defaultNotifications(userId: string): NotificationSettings {
  const timestamp = nowIso();
  return {
    userId,
    slack: { mode: 'off' },
    discord: { mode: 'off' },
    email: { workspaceActivity: true, alwaysSend: false, pageUpdates: true, workspaceDigest: true, announcements: true },
    inApp: { liveMeetingActivity: true },
    perPageOverrides: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export function defaultConnections(userId: string, email?: string): ConnectionRecord[] {
  const timestamp = nowIso();
  const address = email ?? 'account@example.com';
  return [
    { _id: `conn-mail-${userId}`, userId, provider: 'mail', label: `osionos Mail · ${address}`, scopes: ['mail.read'], status: 'connected', connectedAt: timestamp, lastSyncAt: null, error: null, createdAt: timestamp, updatedAt: timestamp, removedAt: null },
    { _id: `conn-calendar-${userId}`, userId, provider: 'calendar', label: `osionos Calendar · ${address}`, scopes: ['calendar.read'], status: 'connected', connectedAt: timestamp, lastSyncAt: null, error: null, createdAt: timestamp, updatedAt: timestamp, removedAt: null },
  ];
}

export function defaultWorkspaceSettings(workspaceId: string, name?: string): WorkspaceSettings {
  const timestamp = nowIso();
  return {
    workspaceId,
    name: name ?? 'Workspace',
    icon: '🌏',
    landingPageId: null,
    sidebar: { newSidebar: true, showApps: true },
    analytics: { pageViews: true },
    publicDomains: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export function defaultWorkspaceMember(workspaceId: string, userId: string): WorkspaceMember {
  const timestamp = nowIso();
  return {
    _id: `wm-${workspaceId}-${userId}`,
    workspaceId,
    userId,
    role: 'owner',
    joinedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export function defaultBillingState(workspaceId: string): BillingState {
  const timestamp = nowIso();
  return {
    workspaceId,
    plan: 'Education Plus',
    paymentMethod: null,
    billedTo: null,
    billingEmail: null,
    vatNumber: null,
    upcomingInvoice: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}
