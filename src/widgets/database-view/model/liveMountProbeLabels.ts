/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountProbeLabels.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 03:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 03:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface LiveMountProbe {
  available: boolean;
  engine?: string;
  server_version?: string;
  tls?: string;
  tls_version?: string;
}

export type ProbeTone = "secure" | "warning" | "neutral";
export interface ProbeLabels {
  version: string | null;
  tls: string | null;
  tone: ProbeTone;
}

/** Display labels for a probe; unavailable metadata stays completely silent. */
export function describeProbe(probe: LiveMountProbe | null): ProbeLabels {
  if (!probe?.available) return { version: null, tls: null, tone: "neutral" };
  const version = probe.server_version === "platform"
    ? "Managed"
    : probe.server_version && /^\d+(?:\.\d+)*$/.test(probe.server_version)
      ? `v${probe.server_version}`
      : null;
  if (probe.tls === "verified") {
    const suffix = probe.tls_version === "TLSv1.3" || probe.tls_version === "TLSv1.2"
      ? ` ${probe.tls_version.slice(4)}`
      : "";
    return { version, tls: `Verified TLS${suffix}`, tone: "secure" };
  }
  if (probe.tls === "encrypted") return { version, tls: "Encrypted, unverified", tone: "warning" };
  if (probe.tls === "plaintext") return { version, tls: "Not encrypted", tone: "warning" };
  if (probe.tls === "not_applicable") return { version, tls: "Local file", tone: "neutral" };
  return { version, tls: null, tone: "neutral" };
}
