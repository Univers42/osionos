import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultBillingState } from './defaults';
import { errorMessage, nowIso, pushSettingsError, scheduleSettingsWrite, trySettingsGet, trySettingsPatch } from './settingsStoreUtils';
import type { BillingInvoice, BillingState } from './types';

interface BillingStore {
  data: Record<string, BillingState>;
  invoices: Record<string, BillingInvoice[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  getData: (workspaceId: string) => BillingState;
  hydrate: (workspaceId: string) => Promise<void>;
  update: (workspaceId: string, patch: Partial<BillingState>) => void;
  addInvoice: (workspaceId: string, invoice?: Partial<BillingInvoice>) => BillingInvoice;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:billing';

export const useBillingStore = create<BillingStore>()(
  persist(
    (set, get) => ({
      data: {},
      invoices: {},
      loading: {},
      error: {},
      getData: (workspaceId) => get().data[workspaceId] ?? defaultBillingState(workspaceId || 'local-workspace'),
      hydrate: async (workspaceId) => {
        if (!workspaceId) return;
        set((state) => ({ loading: { ...state.loading, [workspaceId]: true }, error: { ...state.error, [workspaceId]: null } }));
        try {
          const [billing, invoices] = await Promise.all([
            trySettingsGet<BillingState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/billing`),
            trySettingsGet<BillingInvoice[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/billing/invoices`),
          ]);
          set((state) => ({
            data: { ...state.data, [workspaceId]: billing ?? state.data[workspaceId] ?? defaultBillingState(workspaceId) },
            invoices: { ...state.invoices, [workspaceId]: invoices ?? state.invoices[workspaceId] ?? [] },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: null },
          }));
        } catch (error) {
          set((state) => ({
            data: { ...state.data, [workspaceId]: state.data[workspaceId] ?? defaultBillingState(workspaceId) },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: errorMessage(error) },
          }));
          pushSettingsError('Billing unavailable', error);
        }
      },
      update: (workspaceId, patch) => {
        const previous = get().data[workspaceId] ?? defaultBillingState(workspaceId);
        const next = { ...previous, ...patch, updatedAt: nowIso() };
        set((state) => ({ data: { ...state.data, [workspaceId]: next }, error: { ...state.error, [workspaceId]: null } }));
        scheduleSettingsWrite(`${STORE_NAME}:${workspaceId}`, async () => {
          try {
            const remote = await trySettingsPatch<BillingState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/billing`, patch);
            if (remote) set((state) => ({ data: { ...state.data, [workspaceId]: remote }, error: { ...state.error, [workspaceId]: null } }));
          } catch (error) {
            set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
            pushSettingsError('Could not save billing settings', error);
          }
        });
      },
      addInvoice: (workspaceId, invoice = {}) => {
        const timestamp = nowIso();
        const nextInvoice: BillingInvoice = {
          _id: `invoice-${crypto.randomUUID()}`,
          workspaceId,
          number: `OS-${new Date().getFullYear()}-${String((get().invoices[workspaceId]?.length ?? 0) + 1).padStart(4, '0')}`,
          status: 'open',
          amount: 0,
          currency: 'EUR',
          periodStart: timestamp,
          periodEnd: timestamp,
          pdfUrl: null,
          createdAt: timestamp,
          removedAt: null,
          ...invoice,
        };
        set((state) => ({ invoices: { ...state.invoices, [workspaceId]: [nextInvoice, ...(state.invoices[workspaceId] ?? [])] } }));
        return nextInvoice;
      },
      reset: (workspaceId) => set((state) => ({ data: { ...state.data, [workspaceId]: defaultBillingState(workspaceId || 'local-workspace') }, invoices: { ...state.invoices, [workspaceId]: [] }, error: { ...state.error, [workspaceId]: null } })),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data, invoices: state.invoices }),
    },
  ),
);
