/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embedBridge.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Binds the embed resolver to the real bridge client. Kept apart from
 * `embedApi.ts` so that module (and its tests) never loads the api client,
 * which reads `import.meta.env` at import time.
 */

import { API_BASE, api, getActivePageJwt } from "@/shared/api/client";

import { createEmbedResolver, type EmbedTransport } from "./embedApi";

const bridgeTransport: EmbedTransport = {
  isAvailable: () => API_BASE !== "",
  resolve: (url) => api.post<unknown>("/api/embed/resolve", { url }, getActivePageJwt() ?? undefined),
};

/** Resolve a link into an EmbedInfo. Call only on an explicit user action. */
export const resolveEmbed = createEmbedResolver(bridgeTransport);
