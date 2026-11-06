/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseProbeDiagnostics.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface MountProbePayload {
	dbId?: string;
	available: boolean;
	engine?: string;
	server_version?: string;
	tls?: 'verified' | 'encrypted' | 'plaintext' | 'not_applicable' | string;
	tls_version?: string;
	retryAfter?: number;
}

export type TlsTone = 'secure' | 'warning' | 'plain' | 'neutral';

export interface DatabaseProbeDiagnostic {
	available: boolean;
	reason: string;
	engine?: string;
	serverVersion?: string | null;
	tlsTone?: TlsTone | null;
	tlsDescription?: string | null;
}

export function diagnoseMountProbe(probe: MountProbePayload | null): DatabaseProbeDiagnostic {
	if (probe === null) {
		return {
			available: false,
			reason: 'Probe not yet received or disabled',
		};
	}

	if (probe.available === false) {
		return {
			available: false,
			reason:
				'Telemetry endpoint returned 404/429; rows continue loading over data plane',
		};
	}

	const { server_version, tls, engine } = probe;

	let serverVersion: string | null = null;
	if (server_version) {
		if (server_version === 'platform') {
			serverVersion = 'Managed (version hidden)';
		} else if (/^\d+(\.\d+){0,3}$/.test(server_version)) {
			serverVersion = server_version;
		}
	}

	let tlsTone: TlsTone | null = null;
	let tlsDescription: string | null = null;

	if (tls) {
		switch (tls) {
			case 'verified': {
				tlsTone = 'secure';
				tlsDescription = `TLS ${probe.tls_version || ''}, certificate verified`;
				break;
			}
			case 'encrypted': {
				tlsTone = 'warning';
				tlsDescription = `TLS ${probe.tls_version || ''}, certificate not verified`;
				break;
			}
			case 'plaintext': {
				tlsTone = 'plain';
				tlsDescription = 'No TLS';
				break;
			}
			case 'not_applicable': {
				tlsTone = 'neutral';
				tlsDescription = 'Not applicable (local file)';
				break;
			}
			default: {
				tlsTone = 'neutral';
				tlsDescription = null;
				break;
			}
		}
	}

	return {
		available: true,
		reason: 'Live connection telemetry active',
		engine,
		serverVersion,
		tlsTone,
		tlsDescription,
	};
}
