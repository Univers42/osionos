/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReportsPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Settings panel: history of abuse reports the user has submitted. */

import React, { useEffect } from 'react';

import { Badge, Card, SectionHeader } from '@/shared/ui';
import { useReportsStore } from '@/store/social/useReportsStore';

export const ReportsPanel: React.FC = () => {
  const { data, loading, hydrate } = useReportsStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SectionHeader title={`Reports (${data.length})`} />
        {loading && data.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">You haven&apos;t filed any reports.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((report) => (
              <li key={report.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                  <span className="font-medium">{report.category}</span>
                  <span className="text-[var(--osio-fg-muted)]"> · {report.subjectKind}</span>
                  {report.details ? <span className="text-[var(--osio-fg-muted)]"> — {report.details}</span> : null}
                </span>
                {report.status ? <Badge tone="accent">{report.status}</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};
