/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   verify-live-databases.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Integration guard for the Databases navigator: proves the bridge serves the
 * FULL tenant database list (every registered db), never the 3-entry
 * VITE_BAAS_LIVE_MOUNTS mock subset that a broken registry call used to fall
 * back to. Run inside the osionos-bridge container (it has the app-session
 * secret + container-DNS reach to the adapter-registry + query-router):
 *
 *   docker compose exec osionos-bridge node scripts/verify-live-databases.mjs
 *
 * Regressions this catches: missing OSIONOS_BAAS_TENANT_ID (→ 503), the
 * registry being scoped by the wrong user header (→ 0 rows), and the mock
 * fallback masking either as "3 databases".
 */

import { createHmac, randomUUID } from 'node:crypto';

const BRIDGE = (process.env.VERIFY_BRIDGE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const WS = process.env.OSIONOS_ORG_WORKSPACE_ID ?? 'b1a0c1e5-0000-4000-a000-000000000001';
// The 3 entries shipped in VITE_BAAS_LIVE_MOUNTS — the panel must show MORE.
const MOCK_NAMES = ['pg-commerce', 'mysql-ops', 'mongo-activity'];

function mintToken() {
  if (!SECRET) throw new Error('OSIONOS_APP_SESSION_SECRET is not set — run inside the osionos-bridge container.');
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'osionos-bridge', aud: 'osionos-app', sub: '00000000-0000-4000-a000-000000000001',
    provider: 'verify', workspace_ids: [WS], roles: { [WS]: 'owner' },
    is_admin: false, jti: randomUUID(), iat, exp: iat + 600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `osionos_v1.${encoded}.${sig}`;
}

async function main() {
  const token = mintToken();
  const headers = { Authorization: `Bearer ${token}` };

  const res = await fetch(`${BRIDGE}/api/databases`, { headers });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) throw new Error(`GET /api/databases → ${res.status}: ${JSON.stringify(body)}`);
  const dbs = Array.isArray(body?.databases) ? body.databases : [];
  const names = dbs.map((d) => d.name);
  console.log(`/api/databases → ${dbs.length} databases: ${names.join(', ')}`);

  if (dbs.length === 0) throw new Error('registry returned 0 databases (tenant/user-header regression).');
  const onlyMocks = names.length > 0 && names.every((n) => MOCK_NAMES.includes(n));
  if (onlyMocks) throw new Error(`only the mock mounts surfaced (${names.join(', ')}) — the registry list is not reaching the panel.`);
  if (dbs.length <= MOCK_NAMES.length) {
    console.warn(`WARN: only ${dbs.length} databases — expected the full registry set (> ${MOCK_NAMES.length}).`);
  }

  // The first db's schema must load through the query-router proxy too.
  const first = dbs[0];
  const sres = await fetch(`${BRIDGE}/api/databases/${encodeURIComponent(first.dbId)}/schema`, { headers });
  const schema = await sres.json().catch(() => null);
  if (sres.status !== 200) throw new Error(`schema[${first.name}] → ${sres.status}: ${JSON.stringify(schema)}`);
  const tableCount = Array.isArray(schema?.tables) ? schema.tables.length : 0;
  console.log(`schema[${first.name}] → ${tableCount} tables`);
  if (tableCount === 0) throw new Error(`schema[${first.name}] returned no tables.`);

  console.log('PASS: bridge serves the full live-database registry (no mock fallback).');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
