/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   database-mount-probe-diagnostics.test.ts           :+:      :+:    :+:   */
/*                                                    +:+前回の                        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+ ierz             +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
	diagnoseMountProbe,
	type MountProbePayload,
} from "../../src/shared/lib/database/databaseProbeDiagnostics.ts";

const TLS_CASES = [
	{
		name: "verified",
		probe: { available: true, tls: "verified", tls_version: "1.3", engine: "postgres" },
		expected: {
			available: true,
			reason: "Live connection telemetry active",
			engine: "postgres",
			serverVersion: null,
			tlsTone: "secure",
			tlsDescription: "TLS 1.3, certificate verified",
		},
	},
	{
		name: "encrypted",
		probe: { available: true, tls: "encrypted", tls_version: "1.2", engine: "mysql" },
		expected: {
			available: true,
			reason: "Live connection telemetry active",
			engine: "mysql",
			serverVersion: null,
			tlsTone: "warning",
			tlsDescription: "TLS 1.2, certificate not verified",
		},
	},
	{
		name: "plaintext",
		probe: { available: true, tls: "plaintext", engine: "sqlite" },
		expected: {
			available: true,
			reason: "Live connection telemetry active",
			engine: "sqlite",
			serverVersion: null,
			tlsTone: "plain",
			tlsDescription: "No TLS",
		},
	},
	{
		name: "not_applicable",
		probe: { available: true, tls: "not_applicable" },
		expected: {
			available: true,
			reason: "Live connection telemetry active",
			tlsTone: "neutral",
			tlsDescription: "Not applicable (local file)",
		},
	},
];

const VERSION_CASES = [
	{
		name: "platform",
		probe: { available: true, server_version: "platform" },
		expected: { serverVersion: "Managed (version hidden)" },
	},
	{
		name: "16.4",
		probe: { available: true, server_version: "16.4" },
		expected: { serverVersion: "16.4" },
	},
	{
		name: "bad<script>",
		probe: { available: true, server_version: "bad<script>" },
		expected: { serverVersion: null },
	},
];

for (const tc of TLS_CASES) {
	test(`returns available true with secure tone for ${tc.name} TLS`, () => {
		const result = diagnoseMountProbe(tc.probe);
		assert.strictEqual(result.available, tc.expected.available);
		assert.strictEqual(result.reason, tc.expected.reason);
		assert.strictEqual(result.tlsTone, tc.expected.tlsTone);
		assert.strictEqual(result.tlsDescription, tc.expected.tlsDescription);
	});
}

for (const vc of VERSION_CASES) {
	test(`sanitizes server_version: ${vc.name}`, () => {
		const result = diagnoseMountProbe(vc.probe);
		assert.strictEqual(result.serverVersion, vc.expected.serverVersion);
	});
}

test("returns disabled when probe is null", () => {
	const result = diagnoseMountProbe(null);
	assert.strictEqual(result.available, false);
	assert.strictEqual(result.reason, "Probe not yet received or disabled");
});

test("returns false available when probe.available is false", () => {
	const result = diagnoseMountProbe({ available: false });
	assert.strictEqual(result.available, false);
	assert.strictEqual(
		result.reason,
		"Telemetry endpoint returned 404/429; rows continue loading over data plane",
	);
});

test("returns available true with all fields when probe has engine and version", () => {
	const result = diagnoseMountProbe({
		available: true,
		engine: "postgresql",
		server_version: "16.4",
		tls: "verified",
		tls_version: "TLSv1.3",
	} as MountProbePayload);
	assert.strictEqual(result.available, true);
	assert.strictEqual(result.engine, "postgresql");
	assert.strictEqual(result.serverVersion, "16.4");
	assert.strictEqual(result.tlsTone, "secure");
	assert.strictEqual(result.tlsDescription, "TLS TLSv1.3, certificate verified");
});
