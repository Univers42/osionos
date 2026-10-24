/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationQueue.tsx                                 :+:      :+:    :+:   */
/*                                                    +#+#+#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The moderation console: what an admin reviews and decides.
 *
 * READING IS AUDITED: the server writes the 'view' row before it answers, so
 * the button says so. The content stays in the row that fetched it — nothing
 * keeps a copy of it.
 *
 * A DECISION IS ASKED FOR TWICE, IN THE ROW: the first click turns the button
 * into its confirmation, the second one acts. No window.confirm: the question
 * is asked where the answer is given, and the answer is announced.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";

import { decide, fetchItem, fetchQueue, type HeldComment, type ModerationQueue as Queue, type ModerationReport } from "../api/moderationClient";

const PLAIN = "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50";
const DANGER = "inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--osio-danger)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";
const CARD = "rounded-[var(--osio-radius-card)] border border-[var(--osio-border-soft)] bg-[var(--osio-bg-surface)] p-3";
const TITLE = "text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]";
const MUTED = "text-sm text-[var(--osio-fg-muted)]";
const ERROR = "mt-2 text-2xs text-[var(--osio-danger)]";

/** The message of a failed call: the server's, when it gave one. */
const failure = (error: unknown): string => (error instanceof Error ? error.message : "The request failed.");

/** The reason codes of an audit row: "links,pii" → ["links", "pii"]. */
const reasonCodes = (reason?: string | null): string[] => String(reason ?? "").split(",").map((code) => code.trim()).filter(Boolean);

/** The scores of an audit row, as numbers: a verdict is a word, not a score. */
const scoreList = (scores?: Record<string, unknown> | null): string[] =>
  (scores && typeof scores === "object" ? Object.entries(scores) : [])
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([name, value]) => `${name} ${value.toFixed(2)}`);

/** When it happened, or nothing at all when the row does not say. */
const stamp = (value?: string | null): string => (value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : "");

/** What each decision is announced as. */
const ANNOUNCED: Record<string, string> = {
  hide: "The comment is hidden.", restore: "The comment is restored.",
  dismiss: "The report is dismissed.", resolve: "The report is resolved.",
};

/** One row's action: the busy flag, the error, and the call itself. */
const useRow = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    await action().catch((thrown: unknown) => setError(failure(thrown)));
    setBusy(false);
  }, []);
  return { busy, error, run };
};

/** A button that asks once, in the row, before it acts. No window.confirm. */
const ConfirmButton: React.FC<{ label: string; onConfirm: () => void; disabled?: boolean; tone?: "plain" | "danger" }> = ({ label, onConfirm, disabled, tone = "plain" }) => {
  const [confirming, setConfirming] = useState(false);
  const skin = tone === "danger" ? DANGER : PLAIN;
  if (!confirming) {
    return <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={skin}>{label}</button>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => { setConfirming(false); onConfirm(); }} className={skin}>{`Confirm ${label.toLowerCase()}`}</button>
      <button type="button" onClick={() => setConfirming(false)} className={PLAIN}>Cancel</button>
    </span>
  );
};

/** One list of the console: its title, and its rows. */
const List: React.FC<{ title: string; empty: string; rows: React.ReactNode }> = ({ title, empty, rows }) => (
  <section>
    <h3 className={TITLE}>{title}</h3>
    <div className="mt-2 space-y-2">{rows === null ? <p className={MUTED}>{empty}</p> : rows}</div>
  </section>
);

/** One held comment: what it is, why it was held, and what to do with it. */
const HeldRow: React.FC<{ item: HeldComment; onDecided: (id: string) => void; announce: (message: string) => void }> = ({ item, onDecided, announce }) => {
  const { busy, error, run } = useRow();
  const [content, setContent] = useState<string | null>(null);
  const codes = reasonCodes(item.audit?.reason);
  const scores = scoreList(item.audit?.scores);

  const show = (): Promise<void> => run(async () => {
    setContent((await fetchItem(item.subjectKind, item.id)).content);
  });

  const apply = (decision: "hide" | "restore"): Promise<void> => run(async () => {
    await decide({ kind: item.subjectKind, id: item.id, decision });
    announce(ANNOUNCED[decision]);
    onDecided(item.id);
  });

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{item.subjectKind === "feed_comment" ? "Feed comment" : "Page comment"}</p>
          <p className="text-2xs text-[var(--osio-fg-subtle)]">{stamp(item.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void show()} className={PLAIN}><Eye size={12} /> Show content</button>
          <span className="text-2xs text-[var(--osio-fg-subtle)]">viewing is logged</span>
          <ConfirmButton label="Hide" tone="danger" disabled={busy} onConfirm={() => void apply("hide")} />
          <ConfirmButton label="Restore" disabled={busy} onConfirm={() => void apply("restore")} />
        </div>
      </div>
      {codes.length > 0 || scores.length > 0 ? <p className="mt-2 text-2xs text-[var(--osio-fg-muted)]">{[...codes, ...scores].join(" · ")}</p> : null}
      {content !== null ? <p className="mt-2 rounded-md border border-[var(--osio-border-soft)] bg-[var(--osio-bg-subtle)] p-2 text-sm">{content}</p> : null}
      {error ? <p className={ERROR}>{error}</p> : null}
    </div>
  );
};

/** One report: what a user said, and what to answer with. */
const ReportRow: React.FC<{ report: ModerationReport; onDecided: (id: string) => void; announce: (message: string) => void }> = ({ report, onDecided, announce }) => {
  const { busy, error, run } = useRow();

  const apply = (decision: "dismiss" | "resolve"): Promise<void> => run(async () => {
    await decide({ kind: "report", id: report.id, decision });
    announce(ANNOUNCED[decision]);
    onDecided(report.id);
  });

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{report.category ?? "other"}</p>
          <p className="text-2xs text-[var(--osio-fg-subtle)]">{report.subjectKind ?? "user"} · {stamp(report.createdAt)}</p>
          {report.details ? <p className={MUTED}>{report.details}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConfirmButton label="Resolve" disabled={busy} onConfirm={() => void apply("resolve")} />
          <ConfirmButton label="Dismiss" tone="danger" disabled={busy} onConfirm={() => void apply("dismiss")} />
        </div>
      </div>
      {error ? <p className={ERROR}>{error}</p> : null}
    </div>
  );
};

/** The console: the held comments, the open reports, and what was decided. */
export const ModerationQueue: React.FC = () => {
  const [queue, setQueue] = useState<Queue>({ reports: [], held: [] });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchQueue().then(setQueue).catch((thrown: unknown) => setError(failure(thrown)));
  }, []);

  const drop = useCallback((id: string): void => setQueue((current) => ({
    ...current,
    held: current.held.filter((item) => item.id !== id),
    reports: current.reports.filter((report) => report.id !== id),
  })), []);

  return (
    <section className="mt-8">
      <h2 className={`flex items-center gap-2 ${TITLE}`}><ShieldAlert size={12} /> Moderation</h2>
      <p className={`mt-1 ${MUTED}`}>The comments the filter held, and the reports users filed. Reading a comment is logged.</p>
      <p aria-live="polite" className="mt-2 text-xs text-[var(--osio-fg-muted)]">{notice}</p>
      {error ? <p className="mt-2 text-xs text-[var(--osio-danger)]">{error}</p> : null}
      <div className="mt-3 grid gap-6 md:grid-cols-2">
        <List
          title="Held comments"
          empty="Nothing is held."
          rows={queue.held.length === 0 ? null : queue.held.map((item) => (
            <HeldRow key={item.id} item={item} onDecided={drop} announce={setNotice} />
          ))}
        />
        <List
          title="Open reports"
          empty="No open report."
          rows={queue.reports.length === 0 ? null : queue.reports.map((report) => (
            <ReportRow key={report.id} report={report} onDecided={drop} announce={setNotice} />
          ))}
        />
      </div>
    </section>
  );
};
