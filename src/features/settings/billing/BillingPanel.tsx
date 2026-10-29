/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BillingPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useId, useMemo, useState } from 'react';

// jszip / i18next / pdf-lib / qrcode are click-path only (export, language
// change, invoice PDF, 2FA QR): they are imported dynamically at their call
// sites so the settings chunk stays lean (~280KB of deps off its parse path).
import { defaultBillingState } from '@/store/settings/defaults';
import { useBillingStore, type BillingInvoice, type BillingState } from '@/store/settings';
import { Button, Modal } from '@/shared/ui';
import { DataTable, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { downloadBlob, stringPayload } from '../model/settingsFiles';
import { runAsync } from '../model/settingsCalls';
import { useSettingsHydration } from '../model/settingsHydration';

const EMPTY_BILLING_INVOICES: BillingInvoice[] = [];

type SettingsModalName = 'billing-edit';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const BillingPanel: React.FC<{ workspaceId?: string }> = ({ workspaceId = 'local-workspace' }) => {
  const storedBilling = useBillingStore((state) => state.data[workspaceId]);
  const invoices = useBillingStore((state) => state.invoices[workspaceId] ?? EMPTY_BILLING_INVOICES);
  const hydrate = useBillingStore((state) => state.hydrate);
  const update = useBillingStore((state) => state.update);
  const reset = useBillingStore((state) => state.reset);
  const fallbackBilling = useMemo<BillingState>(() => defaultBillingState(workspaceId), [workspaceId]);
  const billing = storedBilling ?? fallbackBilling;
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  // The store keeps a failed read in `error` instead of rejecting, so it is turned back into a rejection here.
  const hydration = useSettingsHydration(async () => {
    await hydrate(workspaceId);
    const failure = useBillingStore.getState().error[workspaceId];
    if (failure) throw new Error(failure);
  }, [hydrate, workspaceId]);

  function saveBillingEdit(value: string) {
    const field = stringPayload(modal?.payload?.field, 'billingEmail');
    if (field === 'paymentMethod') {
      update(workspaceId, { paymentMethod: { label: value } });
    } else if (field === 'billedTo') {
      update(workspaceId, { billedTo: { label: value } });
    } else if (field === 'invoiceEmails') {
      update(workspaceId, { invoiceEmails: value.split(',').map((item) => item.trim()).filter(Boolean) });
    } else {
      update(workspaceId, { [field]: value });
    }
    setModal(null);
  }

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      {/* Removed, not disabled: the plan changes on the Explore plans page, and a control here that only edited a label looked like a purchase. */}
      <Section title="Plan"><SettingRow title={billing.plan} description="Plans can't be changed here yet." /></Section>
      <Section title="Payment details">
        <SettingRow title="Payment method" description={billing.paymentMethod ? 'Configured' : 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'paymentMethod', label: 'Payment method' } })}>Edit method</Button>} />
        <SettingRow title="Billed to" description={billing.billedTo ? 'Configured' : 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'billedTo', label: 'Billed to' } })}>Edit information</Button>} />
        <SettingRow title="Billing email" description={billing.billingEmail ?? 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'billingEmail', label: 'Billing email' } })}>Edit email</Button>} />
        <SettingRow title="Invoice emails" description="Receive a copy of your invoice via email each billing period" action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'invoiceEmails', label: 'Invoice emails' } })}>Edit</Button>} />
        <SettingRow title="VAT/GST number" description={billing.vatNumber ?? 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'vatNumber', label: 'VAT/GST number' } })}>Edit number</Button>} />
      </Section>
      <Section title="Invoices">
        <SettingRow title="Upcoming invoice" description={billing.upcomingInvoice ? 'Ready to review' : 'No upcoming invoice'} />
        {invoices.length === 0 && <SettingRow title="No invoices yet" description="Invoices appear here once this workspace has been billed." />}
        {invoices.length > 0 && <DataTable className="mt-4" headers={['Invoice', 'Amount', 'Status', '']} rows={invoices.map((invoice) => [invoice.number, `${invoice.amount} ${invoice.currency}`, invoice.status, <Button key={`${invoice._id}-view`} onClick={() => runAsync(downloadInvoicePdf(invoice))}>View invoice</Button>])} />}
        <Button className="mt-3" onClick={() => reset(workspaceId)}>Reset to defaults</Button>
      </Section>
      {modal?.name === 'billing-edit' && <BillingEditModal label={stringPayload(modal.payload?.label, 'Billing')} onSave={saveBillingEdit} onClose={() => setModal(null)} />}
    </PanelStatus>
  );
};

async function downloadInvoicePdf(invoice: BillingInvoice) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('osionos invoice', { x: 56, y: 780, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(invoice.number, { x: 56, y: 744, size: 14, font });
  page.drawText(`${invoice.amount} ${invoice.currency} · ${invoice.status}`, { x: 56, y: 720, size: 12, font });
  const bytes = await pdf.save();
  downloadBlob(`${invoice.number}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
}

const BillingEditModal: React.FC<{ label: string; onSave: (value: string) => void; onClose: () => void }> = ({ label, onSave, onClose }) => {
  const [value, setValue] = useState('');
  const inputId = useId();
  return (
    <Modal open onClose={onClose} title={label} size="sm">
      <div className="space-y-4 p-6">
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--osio-fg-default)]">{label}</label>
        <input id={inputId} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={value} onChange={(event) => setValue(event.target.value)} placeholder={label} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onSave(value)}>Save</Button></div>
      </div>
    </Modal>
  );
};
