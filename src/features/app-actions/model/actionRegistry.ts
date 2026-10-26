/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   actionRegistry.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useAccountDevicesStore } from "@/store/settings/useAccountDevicesStore";
import { useUserPreferencesStore } from "@/store/settings/useUserPreferencesStore";
import { useUserStore } from "@/features/auth";
import type { ActionDefinition } from "@/entities/block/model/appActions";

function revokeConfirmText(args: Record<string, unknown>): { title: string; message: string; actionLabel: string } {
	const id = String(args.id ?? "");
	const row = useAccountDevicesStore.getState().data.find((r) => r.id === id);
	const label = row ? (row as { label?: string; userAgent?: string }).label ?? (row as { userAgent?: string }).userAgent ?? "this session" : "this session";
	return { title: "Revoke session", message: `Revoke ${label}?`, actionLabel: "Revoke" };
}

export const APP_ACTIONS: Map<string, ActionDefinition> = new Map<string, ActionDefinition>([
	[
		"session.revoke",
		{
			name: "session.revoke",
			label: "Revoke session",
			params: { id: { type: "string", required: true } },
			confirm: "simple",
			confirmText: revokeConfirmText,
			sudo: "none",
			destructive: true,
			run: async (args) => {
				await useAccountDevicesStore.getState().revoke(String(args.id));
				return { status: "ok" };
			},
		},
	],
	[
		"preferences.reset",
		{
			name: "preferences.reset",
			label: "Reset preferences",
			params: {},
			confirm: "simple",
			confirmText: () => ({ title: "Reset preferences", message: "Reset preferences to their defaults?", actionLabel: "Reset" }),
			sudo: "none",
			destructive: true,
			run: async () => {
				const userId = useUserStore.getState().activeUserId;
				if (!userId) return { status: "failed", message: "Sign in to reset preferences" };
				await useUserPreferencesStore.getState().reset(userId);
				return { status: "ok" };
			},
		},
	],
]);