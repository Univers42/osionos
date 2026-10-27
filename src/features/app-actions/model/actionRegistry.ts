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
import { usePageStore } from "@/store/usePageStore";
import { openSettings } from "@/features/settings/model/settingsNav";
import { findSection } from "@/features/settings/model/sections";
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
				const store = useAccountDevicesStore.getState();
				await store.revoke(String(args.id));
				const error = useAccountDevicesStore.getState().error;
				if (error) return { status: "failed", message: error };
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
				const error = useUserPreferencesStore.getState().error;
				if (error) return { status: "failed", message: error };
				return { status: "ok" };
			},
		},
	],
	[
		"page.create",
		{
			name: "page.create",
			label: "Create page",
			params: { title: { type: "string", maxLength: 200 } },
			confirm: "none",
			sudo: "none",
			destructive: false,
			run: async (args) => {
				const user = useUserStore.getState();
				const workspace = user.activeWorkspace();
				const jwt = user.activePageJwt() ?? "";
				if (!workspace) return { status: "failed", message: "Open a workspace first" };
				const title = typeof args.title === "string" ? args.title : "Untitled";
				const page = await usePageStore.getState().addPage(workspace._id, title, jwt, undefined, undefined);
				if (!page) return { status: "failed", message: "Could not create the page" };
				usePageStore.getState().openPage({ id: page._id, workspaceId: workspace._id, kind: "page", title: page.title });
				return { status: "ok" };
			},
		},
	],
	[
		"settings.open",
		{
			name: "settings.open",
			label: "Open settings",
			params: { section: { type: "string", required: true, maxLength: 64 } },
			confirm: "none",
			sudo: "none",
			destructive: false,
			run: async (args) => {
				const section = String(args.section ?? "");
				if (!findSection(section)) return { status: "failed", message: `Unknown settings section: ${section}` };
				openSettings(section as never);
				return { status: "ok" };
			},
		},
	],
]);