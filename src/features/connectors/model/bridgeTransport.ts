/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridgeTransport.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";
import type { ConnectorTransport, ValidateResult } from "./connectorPort";

/**
 * Real transport: the connector credential probe is BROKERED by the bridge
 * (`/api/connector/:providerKey/validate`). The provider key/secret never leaves
 * the bridge; the client only learns `{ ok, code, message }`.
 */
export function createBridgeTransport(): ConnectorTransport {
  return {
    async validate(providerKey: string): Promise<ValidateResult> {
      try {
        const r = await api.post<ValidateResult>(
          `/api/connector/${encodeURIComponent(providerKey)}/validate`,
          {},
          getActivePageJwt() ?? undefined,
        );
        return { ok: r?.ok === true, code: r?.code, message: r?.message };
      } catch {
        return { ok: false, code: "unreachable", message: "Connector bridge unreachable" };
      }
    },
  };
}
