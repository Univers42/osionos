/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LiveSourceBadge.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 03:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 03:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Database, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

import { listLiveMounts, type LiveMountInfo } from "../model/liveMountCatalog";
import { getLiveMountProbe, type LiveMountProbe } from "../model/liveMountProbe";
import { describeProbe, type ProbeTone } from "../model/liveMountProbeLabels";

const TONE_COLOR: Record<ProbeTone, string> = {
  secure: "text-[var(--osio-success)]",
  warning: "text-[var(--osio-warning)]",
  neutral: "text-[var(--osio-fg-muted)]",
};

/** The live mount, table, and available connection metadata behind this view. */
export const LiveSourceBadge: React.FC<{ dbId: string; table: string }> = ({ dbId, table }) => {
  const [mounts, setMounts] = React.useState<LiveMountInfo[]>([]);
  const [probeResult, setProbeResult] = React.useState<{ dbId: string; value: LiveMountProbe } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void listLiveMounts().then((entries) => {
      if (!cancelled) setMounts(entries);
    }).catch(() => {
      /* Keep the mount metadata already shown when the registry is unavailable. */
    });
    void getLiveMountProbe(dbId).then((value) => {
      if (!cancelled) setProbeResult({ dbId, value });
    }).catch(() => {
      /* Probe metadata is optional; keep the last useful badge unchanged. */
    });
    return () => {
      cancelled = true;
    };
  }, [dbId]);

  const mount = mounts.find((entry) => entry.dbId === dbId);
  const probe = probeResult?.dbId === dbId ? probeResult.value : null;
  const name = mount?.name ?? dbId.slice(0, 8);
  const engine = mount?.engine ?? probe?.engine ?? "unknown";
  const { version, tls, tone } = describeProbe(probe);
  const ShieldIcon = tone === "secure" ? ShieldCheck : tone === "warning" ? ShieldAlert : Shield;

  return (
    <div
      role="note"
      aria-label={`Connected to ${name}, ${engine}, table ${table}${tls ? `, ${tls}` : ""}`}
      data-testid="live-source-badge"
      className="flex flex-wrap items-center gap-1.5 px-1 pb-1 text-xs text-[var(--osio-fg-muted)]"
    >
      <Database size={14} aria-hidden className="shrink-0" />
      <span className="shrink-0 rounded-xs bg-[var(--osio-bg-hover)] px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">
        {engine}
      </span>
      <span className="min-w-0 truncate font-medium text-[var(--osio-fg-default)]">{name}</span>
      <span aria-hidden>/</span>
      <span className="font-mono">{table}</span>
      {version && <span>{version}</span>}
      {tls && (
        <span className={`inline-flex items-center gap-1 rounded-xs bg-[var(--osio-bg-hover)] px-1.5 py-0.5 ${TONE_COLOR[tone]}`}>
          <ShieldIcon size={12} aria-hidden className="shrink-0" />
          <span>{tls}</span>
        </span>
      )}
    </div>
  );
};
