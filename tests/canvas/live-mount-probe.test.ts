/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-mount-probe.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 03:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 03:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { describeProbe } from "../../src/widgets/database-view/model/liveMountProbeLabels.ts";

test("an absent or unavailable probe has no labels", () => {
  assert.deepEqual(describeProbe(null), { version: null, tls: null, tone: "neutral" });
  assert.deepEqual(describeProbe({
    available: false,
    engine: "postgresql",
    server_version: "16.4",
    tls: "verified",
  }), { version: null, tls: null, tone: "neutral" });
});

test("numeric, platform, unknown, and missing server versions format distinctly", () => {
  assert.equal(describeProbe({ available: true, server_version: "16.4" }).version, "v16.4");
  assert.equal(describeProbe({ available: true, server_version: "platform" }).version, "Managed");
  assert.equal(describeProbe({ available: true, server_version: "unknown" }).version, null);
  assert.equal(describeProbe({ available: true }).version, null);
});

test("verified TLS is secure and shows the TLS 1.3 or 1.2 version", () => {
  assert.deepEqual(describeProbe({ available: true, tls: "verified", tls_version: "TLSv1.3" }), {
    version: null,
    tls: "Verified TLS 1.3",
    tone: "secure",
  });
  assert.deepEqual(describeProbe({ available: true, tls: "verified", tls_version: "TLSv1.2" }), {
    version: null,
    tls: "Verified TLS 1.2",
    tone: "secure",
  });
  assert.deepEqual(describeProbe({ available: true, tls: "verified" }), {
    version: null,
    tls: "Verified TLS",
    tone: "secure",
  });
});

test("encrypted-but-unverified and plaintext connections are warnings", () => {
  assert.deepEqual(describeProbe({ available: true, tls: "encrypted" }), {
    version: null,
    tls: "Encrypted, unverified",
    tone: "warning",
  });
  assert.deepEqual(describeProbe({ available: true, tls: "plaintext" }), {
    version: null,
    tls: "Not encrypted",
    tone: "warning",
  });
});

test("local files, unknown TLS, and missing TLS are neutral", () => {
  assert.deepEqual(describeProbe({ available: true, tls: "not_applicable" }), {
    version: null,
    tls: "Local file",
    tone: "neutral",
  });
  assert.deepEqual(describeProbe({ available: true, tls: "unknown" }), {
    version: null,
    tls: null,
    tone: "neutral",
  });
  assert.deepEqual(describeProbe({ available: true }), {
    version: null,
    tls: null,
    tone: "neutral",
  });
});
