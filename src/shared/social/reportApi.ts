/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reportApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge abuse-report endpoints (/api/social/reports). */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { Report, ReportPayload } from '@/store/social/types';

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function listReports(): Promise<Report[]> {
  const reply = await api.get<{ reports: Report[] }>('/api/social/reports', jwt());
  return Array.isArray(reply.reports) ? reply.reports : [];
}

export async function submitReport(payload: ReportPayload): Promise<Report | null> {
  const reply = await api.post<{ report?: Report }>('/api/social/reports', payload, jwt());
  return reply.report ?? null;
}
