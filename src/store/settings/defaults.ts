/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   defaults.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type {
  AccountSettings,
  BillingState,
  ConnectionRecord,
  DeviceRecord,
  EmailRecord,
  NotificationSettings,
  UserPreferences,
  VoiceSettings,
  WorkspaceMember,
  WorkspaceSettings,
} from './types';
import { nowIso } from './settingsStoreUtils';

export function defaultAccountSettings(userId: string): AccountSettings {
  const timestamp = nowIso();
  return {
    userId,
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

/** The voice settings, as they are before the user touches them. */
export function defaultVoiceSettings(): VoiceSettings {
  return {
    dictationLanguage: 'auto',
    readAloudVoiceURI: '',
    readAloudRate: 1,
    // The online voices are OFF: the text read aloud stays on the device.
    allowOnlineVoices: false,
    updatedAt: nowIso(),
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

export function defaultConnections(_userId: string, _email?: string): ConnectionRecord[] {
  // User with no bridge sees nothing connected.
  return [];
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
    plan: 'Free',
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
