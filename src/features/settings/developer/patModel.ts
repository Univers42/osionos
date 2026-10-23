/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   patModel.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pure half of the Developer panel: labels, the expiry rules and the create
// body. The vocabulary (resources, attributes, permissions) is NOT written here:
// GET /api/account/tokens serves it as `catalog` and the picker renders that.
//
// Caveat: the expiry rules mirror the bridge's (future, within 365 days) against
// the browser's clock; a skewed clock can accept a date the bridge then refuses,
// and the bridge's answer is shown as is.

export type PatKind = "classic" | "fine_grained";

export interface PatGrant {
  resource: string;
  attributes: string[];
  permissions: string[];
}

export interface PatToken {
  id: string;
  name: string;
  kind: PatKind;
  scopes: string[];
  grants: PatGrant[];
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface PatCatalog {
  resources: Record<string, { attributes: string[] }>;
  permissions: string[];
}

export interface TokenForm {
  name: string;
  kind: PatKind;
  expiry: string;
  scopes: string[];
  resource: string;
  attributes: string[];
  permissions: string[];
}

export type CreateTokenBody =
  | { name: string; kind: "classic"; expiresAt: string; scopes: string[] }
  | { name: string; kind: "fine_grained"; expiresAt: string; grants: PatGrant[] };

export const MAX_EXPIRY_DAYS = 365;
export const EXPIRY_PRESET_DAYS = [7, 30, 90] as const;
const MAX_NAME_LENGTH = 64;
const DAY_MS = 86_400_000;

const KIND_LABELS: Record<PatKind, string> = { classic: "Classic", fine_grained: "Fine-grained" };

const ERROR_COPY: Record<string, string> = {
  pat_expiry_required: "Pick an expiry date that is in the future and within a year.",
  pat_invalid_body: "Check the name, the expiry and the permissions, then try again.",
  pat_unknown_scope: "One of the permissions is not available any more. Reload the page and pick again.",
  pat_unknown_resource: "That resource is not available any more. Reload the page and pick again.",
  pat_unknown_attribute: "One of the fields is not available any more. Reload the page and pick again.",
  pat_unknown_permission: "That access level is not available any more. Reload the page and pick again.",
  pat_limit_reached: "You have reached the limit of active tokens. Revoke one you no longer use, then try again.",
  pat_not_found: "That token is already gone. Reload the list.",
  pat_invalid_token_id: "That token could not be found. Reload the list.",
  sudo_required: "Confirm it is you first, then try again.",
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  account_plane_unavailable: "Tokens are unavailable right now. Try again in a moment.",
};

/** The friendly copy for a bridge error code; an unknown code keeps the bridge's own message. */
export function patErrorMessage(code: string | undefined, fallback: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return fallback.trim() || "That did not go through. Try again.";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "pages:read" becomes "Pages: read". */
export function scopeLabel(scope: string): string {
  const [resource, permission] = scope.split(":");
  return permission ? `${capitalize(resource)}: ${permission}` : capitalize(resource);
}

export function kindLabel(kind: PatKind): string {
  return KIND_LABELS[kind];
}

/** What the Permissions column says: the scopes, or each grant's resource, fields and access. */
export function permissionSummary(token: PatToken): string {
  if (token.kind === "classic") return token.scopes.map(scopeLabel).join(", ") || "None";
  return token.grants
    .map((grant) => `${capitalize(grant.resource)} (${grant.attributes.join(", ")}): ${grant.permissions.join(", ")}`)
    .join("; ") || "None";
}

/** "Expired", "In 7 days", or the date when it is further away than a quarter. */
export function expiryLabel(expiresAt: string | null, now: number = Date.now()): string {
  const at = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(at)) return "No expiry";
  if (at <= now) return "Expired";
  const days = Math.ceil((at - now) / DAY_MS);
  if (days === 1) return "In 1 day";
  return days <= 90 ? `In ${days} days` : new Date(at).toISOString().slice(0, 10);
}

function dayOf(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** The date (YYYY-MM-DD, UTC) `days` from now: what the 7 / 30 / 90 presets fill in. */
export function expiryFromDays(days: number, now: number = Date.now()): string {
  return dayOf(now + days * DAY_MS);
}

/** The latest date the bridge accepts. */
export function maxExpiryDate(now: number = Date.now()): string {
  return dayOf(now + MAX_EXPIRY_DAYS * DAY_MS);
}

function startOfDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const at = Date.parse(`${value}T00:00:00.000Z`);
  // A date that rolled over (02-31) is not the date that was typed.
  return Number.isFinite(at) && dayOf(at) === value ? at : Number.NaN;
}

/** An expiry is required: empty, malformed, past or over the cap never reaches the bridge. */
export function isExpiryValid(value: string, now: number = Date.now()): boolean {
  const at = startOfDay(value.trim());
  return Number.isFinite(at) && at > now && at <= now + MAX_EXPIRY_DAYS * DAY_MS;
}

/** Every `resource:permission` pair the served catalog offers. */
export function classicScopes(catalog: PatCatalog): string[] {
  return Object.keys(catalog.resources).flatMap((resource) => catalog.permissions.map((permission) => `${resource}:${permission}`));
}

export function attributesOf(catalog: PatCatalog, resource: string): string[] {
  return Object.hasOwn(catalog.resources, resource) ? [...catalog.resources[resource].attributes] : [];
}

/** The body to POST, or null while the form is not ready: the panel never sends a body the bridge refuses. */
export function createTokenBody(form: TokenForm, now: number = Date.now()): CreateTokenBody | null {
  const name = form.name.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) return null;
  const expiry = form.expiry.trim();
  if (!isExpiryValid(expiry, now)) return null;
  const expiresAt = new Date(startOfDay(expiry)).toISOString();
  if (form.kind === "classic") {
    return form.scopes.length > 0 ? { name, kind: "classic", expiresAt, scopes: [...form.scopes] } : null;
  }
  if (form.kind !== "fine_grained") return null;
  if (!form.resource || form.attributes.length === 0 || form.permissions.length === 0) return null;
  return {
    name, kind: "fine_grained", expiresAt,
    grants: [{ resource: form.resource, attributes: [...form.attributes], permissions: [...form.permissions] }],
  };
}

/** The calendar day (YYYY-MM-DD, UTC) of a timestamp the bridge sent, or a dash. */
export function dateLabel(iso: string | null): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? dayOf(at) : "—";
}

const HOUR_MS = 3_600_000;

/**
 * Worded by the hour, never as a time: the bridge stamps the FIRST use of each hour, so the
 * real last use lies up to an hour after the stamp.
 * Caveat: a token used once an hour ago and again just now reads "Within the hour" only after
 * the next stamp; until then it can read one step older than the truth. It never reads newer.
 */
export function lastUsedLabel(lastUsedAt: string | null, now: number = Date.now()): string {
  const at = lastUsedAt ? Date.parse(lastUsedAt) : Number.NaN;
  if (!Number.isFinite(at)) return "Never used";
  const hours = Math.ceil((now - at) / HOUR_MS);
  if (hours <= 1) return "Within the hour";
  if (hours < 24) return `Last used within ${hours} hours`;
  const days = Math.ceil(hours / 24);
  return `Last used within ${days} ${days === 1 ? "day" : "days"}`;
}

export interface TokenPreset {
  name: string;
  kind: "classic";
  scopes: string[];
  expiryDays: number;
}

/** What osionos's MCP server needs: read pages, create them, archive them. */
export const MCP_PRESET: TokenPreset = { name: "Claude Code (MCP)", kind: "classic", scopes: ["pages:read", "pages:write"], expiryDays: 30 };

/** The fields a preset's write scopes let the app change, from the served catalog: what the dialog shows before Create. */
export function presetWriteAttributes(preset: TokenPreset, catalog: PatCatalog): string[] {
  return preset.scopes.flatMap((scope) => {
    const [resource, permission] = scope.split(":");
    return permission === "write" ? attributesOf(catalog, resource) : [];
  });
}
