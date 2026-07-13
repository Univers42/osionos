/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sqlRoClient.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";

export interface SqlRoResult {
  rows: Record<string, unknown>[];
  truncated: boolean;
}

/** Run a read-only SQL query against a mount via the bridge (double flag-gated). */
export async function runSqlRo(dbId: string, sql: string): Promise<SqlRoResult> {
  const res = await api.post<{ rows?: Record<string, unknown>[]; truncated?: boolean }>(
    `/api/databases/${dbId}/sql-ro`,
    { sql },
    getActivePageJwt() ?? undefined,
  );
  return { rows: Array.isArray(res.rows) ? res.rows : [], truncated: Boolean(res.truncated) };
}
