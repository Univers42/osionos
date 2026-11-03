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

test("returns available true with secure tone for verified TLS", () => {
	const result = diagnoseMountProbe({
		available: true,
		tls: "verified",
		tls_version: "1.3",
		engine: "postgres",
	});
	assert.strictEqual(result.available, true);
	assert.strictEqual(result.reason, "Live connection telemetry active");
	assert.strictEqual(result.engine, "postgres");
	assert.strictEqual(result.serverVersion, null);
	assert.strictEqual(result.tlsTone, "secure");
	assert.strictEqual(result.tlsDescription, "TLS 1.3, certificate verified");
});

test("returns warning tone for encrypted TLS", () => {
	const result = diagnoseMountProbe({
		available: true,
		tls: "encrypted",
		tls_version: "1.2",
		engine: "mysql",
	});
	assert.strictEqual(result.available, true);
	assert.strictEqual(result.reason, "Live connection telemetry active");
	assert.strictEqual(result.engine, "mysql");
	assert.strictEqual(result.serverVersion, null);
	assert.strictEqual(result.tlsTone, "warning");
	assert.strictEqual(result.tlsDescription, "TLS 1.2, certificate not verified");
});

test("returns plain tone for plaintext TLS", () => {
	const result = diagnoseMountProbe({
		available: true,
		tls: "plaintext",
		engine: "sqlite",
	});
	assert.strictEqual(result.available, true);
	assert.strictEqual(result.reason, "Live connection telemetry active");
	assert.strictEqual(result.engine, "sqlite");
	assert.strictEqual(result.serverVersion, null);
	assert.strictEqual(result.tlsTone, "plain");
	assert.strictEqual(result.tlsDescription, "No TLS");
});

test("returns neutral tone for not_applicable TLS", () => {
	const result = diagnoseMountProbe({
		available: true,
		tls: "not_applicable",
	});
	assert.strictEqual(result.available, true);
	assert.strictEqual(result.reason, "Live connection telemetry active");
	assert.strictEqual(result.tlsTone, "neutral");
	assert.strictEqual(result.tlsDescription, "Not applicable (local file)");
});

test("sanitizes server_version: platform returns hidden", () => {
	const result = diagnoseMountProbe({
		available: true,
		server_version: "platform",
	});
	assert.strictEqual(result.serverVersion, "Managed (version hidden)");
});

test("sanitizes server_version: regex match returns version", () => {
	const result = diagnoseMountProbe({
		available: true,
		server_version: "16.4",
	});
	assert.strictEqual(result.serverVersion, "16.4");
});

test("sanitizes server_version: non-matching returns null", () => {
	const result = diagnoseMountProbe({
		available: true,
		server_version: "bad<script>",
	});
	assert.strictEqual(result.serverVersion, null);
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
