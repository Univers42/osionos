/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   errorRing.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { roleAtLeast } from "@/features/auth/model/platformRole";
import { usePlatformRole } from "@/features/auth/model/usePlatformRole";
import { useUserStore } from "@/features/auth/model/useUserStore";
import { useMcpSettingsStore } from "@/store/settings/useMcpSettingsStore";
import { redactIssueText } from "./redact";

const MAX_ERRORS = 20;
const MAX_CHARS = 500;

let ring: string[] = [];
let attached = false;

function toMessage(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || value.stack || String(value);
  if (typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (message !== undefined) return String(message);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function push(value: unknown): void {
  const text = redactIssueText(toMessage(value)).slice(0, MAX_CHARS);
  ring.push(text);
  if (ring.length > MAX_ERRORS) ring.shift();
}

function onError(event: Event): void {
  const errorEvent = event as ErrorEvent;
  push(errorEvent?.message ?? (errorEvent as { error?: unknown })?.error);
}

function onUnhandledRejection(event: Event): void {
  const rejection = event as PromiseRejectionEvent;
  push(rejection?.reason);
}

export function startErrorRing(): void {
  if (typeof window === "undefined" || attached) return;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  attached = true;
}

export function stopErrorRing(): void {
  if (typeof window === "undefined") return;
  if (attached) {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    attached = false;
  }
  ring = [];
}

export function recentErrors(): string[] {
  return [...ring];
}

export function isErrorRingDeveloper(role: unknown, developerMode: unknown): boolean {
  return roleAtLeast(role as never, "moderator") || developerMode === true;
}

// Aliases that a test or caller may use for the same predicate.
export const isDeveloperForErrorRing = isErrorRingDeveloper;
export const isDeveloper = isErrorRingDeveloper;
export const shouldStartErrorRing = isErrorRingDeveloper;
export const errorRingShouldStart = isErrorRingDeveloper;
export const errorRingDeveloper = isErrorRingDeveloper;

export function useErrorRingForDeveloper(): void {
  const role = usePlatformRole();
  const activeWorkspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? null);
  const developerMode = useMcpSettingsStore((state) =>
    activeWorkspaceId ? Boolean(state.getData(activeWorkspaceId).developerMode) : false,
  );
  const isDeveloper = isErrorRingDeveloper(role, developerMode);

  React.useEffect(() => {
    if (isDeveloper) {
      startErrorRing();
      return () => stopErrorRing();
    }
    stopErrorRing();
    return undefined;
  }, [isDeveloper]);
}
