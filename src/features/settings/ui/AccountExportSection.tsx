/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccountExportSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings → Preferences → Privacy: ask for a copy of the account's data and download it
 * when the bridge has built it. The jobs are the SERVER's rows; Download exists only on a
 * `done` job, the expiry date is always shown, and a request that needs sudo opens the one
 * shared prompt (this component does not handle the 403).
 *
 * Caveat: the list refreshes every few seconds while a job is queued or running, so a job
 * that finishes shows up to one interval late; the bridge keeps only the ten newest jobs.
 */

import React, { useCallback, useEffect, useState } from 'react';

import {
  downloadExport,
  listExports,
  requestExport,
  type AccountSecurityOutcome,
  type ExportFormat,
  type ExportJob,
} from '@/shared/api/accountSecurityApi';
import { Button, Dropdown, useToastStore } from '@/shared/ui';
import { downloadBlob } from '../model/settingsFiles';
import { PanelStatus, SettingRow, type PanelStatusState } from './settingsKit';

const FORMAT_OPTIONS = [
  { value: 'zip', label: 'ZIP (JSON and CSV)' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
];
const STATUS_LABEL: Record<ExportJob['status'], string> = {
  queued: 'Waiting to start',
  running: 'Being prepared',
  done: 'Ready',
  failed: 'Could not be built',
  expired: 'Expired',
};
const NOT_AVAILABLE = "Data export isn't available on this server yet";
const POLL_MS = 5000;

function describeFailure(outcome: AccountSecurityOutcome<unknown>): string {
  if (outcome.ok) return '';
  if (outcome.reason === 'sudo_required') return "Confirm it's you, then press Request export again.";
  if (outcome.reason === 'unavailable') return NOT_AVAILABLE;
  if (outcome.reason === 'rate_limited') return 'You have asked for too many exports today. Try again later.';
  return 'message' in outcome ? outcome.message : 'The request failed.';
}

function plainDate(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { dateStyle: 'long' }) : 'a later date';
}

const JobRow: React.FC<{ job: ExportJob; onDownload: (job: ExportJob) => void }> = ({ job, onDownload }) => (
  <SettingRow
    title={`${job.format.toUpperCase()} export · ${STATUS_LABEL[job.status]}`}
    description={
      <>
        <span>Requested {plainDate(job.requestedAt)}.</span>
        {job.status === 'done' && <span> Link expires on {plainDate(job.expiresAt)}.</span>}
        {job.status === 'failed' && <span> Try requesting it again.</span>}
      </>
    }
    action={job.status === 'done' ? <Button onClick={() => onDownload(job)}>{`Download ${job.format.toUpperCase()} export`}</Button> : undefined}
  />
);

export const AccountExportSection: React.FC = () => {
  const toast = useToastStore((state) => state.push);
  const [format, setFormat] = useState<ExportFormat>('zip');
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [status, setStatus] = useState<PanelStatusState>('loading');
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Bumping `refresh` re-reads the list; state is set in the callback, never in the effect body.
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((count) => count + 1), []);

  useEffect(() => {
    let live = true;
    void listExports().then((outcome) => {
      if (!live) return;
      if (outcome.ok) {
        setJobs(outcome.data);
        setStatus('ready');
      } else {
        setProblem(describeFailure(outcome));
        setStatus('error');
      }
    });
    return () => { live = false; };
  }, [refresh]);

  const inFlight = jobs.some((job) => job.status === 'queued' || job.status === 'running');
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, reload]);

  async function handleRequest() {
    setBusy(true);
    setNote('');
    const outcome = await requestExport(format);
    setBusy(false);
    if (outcome.ok) {
      toast({ kind: 'success', title: 'Export requested. It will appear below when it is ready.' });
      reload();
      return;
    }
    setNote(describeFailure(outcome));
    if (outcome.ok === false && 'code' in outcome && outcome.code === 'export_in_progress') reload();
  }

  async function handleDownload(job: ExportJob) {
    const outcome = await downloadExport(job.id);
    if (outcome.ok) {
      downloadBlob(`osionos-export.${job.format}`, outcome.data);
      return;
    }
    toast({ kind: 'error', title: 'Could not download the export', description: describeFailure(outcome) });
    if (outcome.reason === 'refused' && outcome.code === 'export_expired') reload();
  }

  return (
    <div data-testid="account-export" className="mt-6 space-y-2">
      <SettingRow
        title="Export my data"
        description="Get a copy of the data osionos holds about your account. The file is prepared on the server, kept for seven days and only you can download it."
        action={
          <>
            <Dropdown label="Export format" value={format} options={FORMAT_OPTIONS} onChange={(value) => setFormat(value as ExportFormat)} align="end" width="auto" />
            <Button tone="primary" disabled={busy} onClick={() => { void handleRequest(); }}>Request export</Button>
          </>
        }
      />
      {note && <p role="alert" className="text-sm text-[var(--osio-danger)]">{note}</p>}
      <PanelStatus status={status} error={problem} onRetry={() => { setStatus('loading'); reload(); }}>
        {jobs.length === 0
          ? <p className="py-2 text-sm text-[var(--osio-fg-muted)]">No exports yet. Request one and it will show up here.</p>
          : jobs.map((job) => <JobRow key={job.id} job={job} onDownload={(chosen) => { void handleDownload(chosen); }} />)}
      </PanelStatus>
    </div>
  );
};
