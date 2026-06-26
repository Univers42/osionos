/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useReportsStore.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { listReports, submitReport } from '@/shared/social/reportApi';
import { errorMessage, pushSettingsError } from '@/store/settings/settingsStoreUtils';
import type { Report, ReportPayload } from '@/store/social/types';

interface ReportsStore {
  data: Report[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  submit: (payload: ReportPayload) => Promise<void>;
}

const STORE_NAME = 'osionos:social:reports';

export const useReportsStore = create<ReportsStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async () => {
        set({ loading: true, error: null });
        try {
          const reports = await listReports();
          set({ data: reports, loading: false, error: null });
        } catch (error) {
          set({ loading: false, error: errorMessage(error) });
          pushSettingsError('Reports unavailable', error);
        }
      },
      submit: async (payload) => {
        try {
          const report = await submitReport(payload);
          if (report) set({ data: [report, ...get().data] });
        } catch (error) {
          set({ error: errorMessage(error) });
          pushSettingsError('Could not submit report', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
