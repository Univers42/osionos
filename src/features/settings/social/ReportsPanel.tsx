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

import React from 'react';
import { Flag } from 'lucide-react';

import { Badge } from '@/shared/ui';
import { useReportsStore } from '@/store/social/useReportsStore';
import { EmptyState, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { useSettingsHydration } from '../model/settingsHydration';

export const ReportsPanel: React.FC = () => {
  const data = useReportsStore((state) => state.data);
  const hydrate = useReportsStore((state) => state.hydrate);

  const hydration = useSettingsHydration(async () => {
    await hydrate();
    const failure = useReportsStore.getState().error;
    if (failure) throw new Error(failure);
  }, [hydrate]);

  return (
    <Section title="Reports you filed" anchor="reports">
      <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
        {data.length === 0 ? (
          <EmptyState icon={<Flag size={16} />} title="No reports filed" hint="Reports you send about people or content show up here." />
        ) : data.map((report) => (
          <SettingRow
            key={report.id}
            title={`${report.category} · ${report.subjectKind}`}
            description={report.details || undefined}
            action={report.status ? <Badge tone="accent">{report.status}</Badge> : undefined}
          />
        ))}
      </PanelStatus>
    </Section>
  );
};
