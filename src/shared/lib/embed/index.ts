/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export { createEmbedResolver, clearEmbedCache, EmbedUrlError } from "./embedApi";
export type { EmbedTransport } from "./embedApi";
export { resolveEmbed } from "./embedBridge";
export { embedInfoFromProvider, parseEmbedInfo, parseEmbedSnapshot } from "./embedInfo";
export type { EmbedInfo, EmbedKind, EmbedSnapshot } from "./embedInfo";
export {
  DEFAULT_EMBED_ASPECT, DEFAULT_EMBED_HEIGHT, EMBED_REFERRER_POLICY, GENERIC_ALLOW,
  PROVIDER_ALLOW, RICH_ALLOW, THIRD_PARTY_SANDBOX, allowForPolicy, aspectBoxStyle, clampEmbedHeight, grantsFullscreen,
  safeAspect,
} from "./embedPolicy";
export type { FramePolicy } from "./embedPolicy";
export { playerSrcForHost, resolveProviderEmbed } from "./embedProviders";
export type { ProviderEmbed, ProviderEmbedKind } from "./embedProviders";
export { appForbiddenOrigins, displayHost, frameableEmbedUrl, safeHttpUrl } from "./embedUrlGuard";
