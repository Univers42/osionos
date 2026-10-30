/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-mount-descriptor.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 21:50:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 05:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMountDescriptor,
  fetchMountProbe,
  formatMountLocation,
  formatMountProbe,
  type MountDescriptor,
} from "../../src/shared/notion-database-sys/src/store/live/liveMountDescriptor.ts";

const base: MountDescriptor = { id: "m", engine: "postgresql", location: "network", tls: "verify" };

test("a network mount reads as engine · host:port/db with its requested TLS", () => {
  assert.deepEqual(formatMountLocation({ ...base, host: "db.acme.io", port: 6543, database: "shop" }), {
    engine: "PostgreSQL",
    where: "db.acme.io:6543/shop",
    tls: { label: "TLS, certificate verified", tone: "secure" },
  });
  const insecure = formatMountLocation({ ...base, engine: "mongodb", host: "m1", tls: "insecure" });
  assert.equal(insecure.where, "m1", "no port, no database: no dangling separators");
  assert.equal(insecure.tls?.tone, "warning");
  assert.equal(formatMountLocation({ ...base, tls: "off" }).tls?.label, "No TLS");
});

test("platform, file and memory mounts never show a host", () => {
  assert.equal(formatMountLocation({ ...base, location: "platform", database: "tenant_a" }).where, "platform/tenant_a");
  assert.equal(formatMountLocation({ ...base, location: "platform", host: "postgres" }).where, "platform-hosted");
  const file = formatMountLocation({ ...base, engine: "sqlite", location: "file", file: "abc.db", tls: "n/a" });
  assert.deepEqual([file.engine, file.where, file.tls], ["SQLite", "abc.db", null]);
  assert.equal(formatMountLocation({ ...base, location: "memory" }).where, "in memory");
});

test("an unknown location says how it is reached, or that it is not shown", () => {
  assert.equal(formatMountLocation({ ...base, location: "unknown", credential_mode: "vault" }).where, "via vault");
  assert.equal(formatMountLocation({ ...base, location: "unknown", credential_mode: "inline" }).where, "location not shown");
  const odd = formatMountLocation({ ...base, engine: "neo4j", location: "unknown", tls: "unknown" });
  assert.deepEqual([odd.engine, odd.tls], ["neo4j", null], "unmapped values pass through or drop, never guess");
});

// The ten engines grobase accepts for a mount (isAllowedEngine in adapterregistry/models.go).
const GROBASE_ENGINES = [
  "postgresql", "cockroachdb", "mysql", "mariadb", "mongodb", "redis", "sqlite", "mssql", "http", "dynamodb",
];

test("every grobase engine gets a display name, never its raw id", () => {
  const names = GROBASE_ENGINES.map((engine) => formatMountLocation({ ...base, engine }).engine);
  assert.deepEqual(names, [
    "PostgreSQL", "CockroachDB", "MySQL", "MariaDB", "MongoDB", "Redis", "SQLite", "SQL Server", "HTTP API", "DynamoDB",
  ]);
});

test("a failed descriptor fetch is not cached, so the next open retries", async () => {
  const first = fetchMountDescriptor("m-fail");
  await assert.rejects(first);
  const second = fetchMountDescriptor("m-fail");
  assert.notEqual(second, first);
  await assert.rejects(second);
});

test("a disabled or missing probe stays silent", () => {
  const silent = { server: null, connection: null };
  assert.deepEqual(formatMountProbe(null), silent);
  assert.deepEqual(formatMountProbe({ available: false }), silent);
  assert.deepEqual(formatMountProbe({ available: true, server_version: "unknown", tls: "unknown" }), silent);
});

test("the probe names the server version, and hides a platform mount's", () => {
  assert.equal(formatMountProbe({ available: true, server_version: "16.4" }).server, "16.4");
  assert.equal(formatMountProbe({ available: true, server_version: "platform" }).server, "Managed (version hidden)");
  assert.equal(formatMountProbe({ available: true, server_version: "16.4 <b>" }).server, null, "only digits and dots");
});

test("the pool's connection posture maps onto the badge's TLS tones", () => {
  const conn = (tls: string, tls_version?: string) => formatMountProbe({ available: true, tls, tls_version }).connection;
  assert.deepEqual(conn("verified", "TLSv1.3"), { label: "TLS 1.3, certificate verified", tone: "secure" });
  assert.deepEqual(conn("verified"), { label: "TLS, certificate verified", tone: "secure" });
  assert.deepEqual(conn("encrypted", "TLSv1.2"), { label: "TLS 1.2, certificate not verified", tone: "warning" });
  assert.deepEqual(conn("encrypted", "SSLv3"), { label: "TLS, certificate not verified", tone: "warning" });
  assert.deepEqual(conn("plaintext"), { label: "No TLS", tone: "plain" });
  assert.deepEqual(conn("not_applicable"), { label: "Not applicable (local file)", tone: "neutral" });
});

test("a failed probe fetch is not cached either", async () => {
  const first = fetchMountProbe("m-probe-fail");
  await assert.rejects(first);
  const second = fetchMountProbe("m-probe-fail");
  assert.notEqual(second, first);
  await assert.rejects(second);
});
