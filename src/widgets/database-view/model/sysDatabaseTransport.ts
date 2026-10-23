/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysDatabaseTransport.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";

/**
 * The seam between the `sys:` adapter and the network. The adapter takes it as an
 * argument and imports this file for the TYPE only, so the canvas runner never loads
 * `@/shared/api/client` (it reads `import.meta.env` at import time).
 */
export interface SysTransport {
  get<T>(path: string): Promise<T>;
}

/** The app-session token, not the gotrue one: the wrong token makes the bridge skip the read. */
export const sysTransport: SysTransport = {
  get: <T,>(path: string) => api.get<T>(path, getActivePageJwt() ?? undefined),
};
