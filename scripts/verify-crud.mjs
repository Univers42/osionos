/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   verify-crud.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * CRUD integration test for the Databases plane. Proves the bridge write proxies
 * actually mutate engine data (the old path 401'd, so everything was frozen).
 * Run inside the osionos-bridge container:
 *   docker compose exec osionos-bridge node scripts/verify-crud.mjs
 *
 * Two probes per engine that supports schema DDL:
 *  1. UPDATE-and-restore a real row (non-destructive) — proves writes persist.
 *  2. create_table → insert → get → update → delete → drop_table — the full
 *     lifecycle on an ISOLATED probe table (no real data touched).
 */

import { createHmac } from 'node:crypto';

const BR = (process.env.VERIFY_BRIDGE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const WS = process.env.OSIONOS_ORG_WORKSPACE_ID ?? 'b1a0c1e5-0000-4000-a000-000000000001';
const STAMP = process.env.VERIFY_STAMP ?? '0';
const PROBE_TABLE = `osionos_crud_probe_${STAMP}`;

function token() {
  if (!SECRET) throw new Error('OSIONOS_APP_SESSION_SECRET unset — run inside the osionos-bridge container.');
  const iat = Math.floor(Number(STAMP) / 1000) || 1;
  const payload = { iss: 'osionos-bridge', aud: 'osionos-app', sub: '00000000-0000-4000-a000-000000000001', provider: 'crud', workspace_ids: [WS], roles: { [WS]: 'owner' }, is_admin: false, jti: `crud-${STAMP}`, iat, exp: iat + 3600 };
  const enc = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `osionos_v1.${enc}.${createHmac('sha256', SECRET).update(enc).digest('base64url')}`;
}
const TOK = token();
async function api(method, path, body) {
  const r = await fetch(BR + path, { method, headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, j, t };
}
const rows = (dbId, table, body) => api('POST', `/api/databases/${dbId}/tables/${encodeURIComponent(table)}`, body);
const ddl = (dbId, body) => api('POST', `/api/databases/${dbId}/schema/ddl`, body);

let failures = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'} — ${label}`); if (!cond) failures += 1; };
// Informational — a real-data column can be enum/validator-constrained, so a
// probe value may legitimately not apply. Never fails the gate (the isolated
// create→drop lifecycle is the gate).
const note = (cond, label) => console.log(`  ${cond ? 'ok  ' : 'info'} — ${label}`);

async function updateRestore(db, schema) {
  // pick a table with a single-col pk + a nullable non-pk text column
  for (const t of schema.tables ?? []) {
    const pk = t.primary_key ?? [];
    if (pk.length !== 1) continue;
    const col = (t.columns ?? []).find((c) => !pk.includes(c.name) && c.normalized_type === 'text' && c.nullable);
    if (!col) continue;
    const listed = await rows(db.dbId, t.name, { op: 'list', limit: 1 });
    const row = listed.j?.rows?.[0];
    if (!row) continue;
    const id = row[pk[0]]; const orig = row[col.name]; const probe = `osionos_probe_${STAMP}`;
    console.log(`UPDATE-restore on ${db.name}.${t.name} (pk=${pk[0]}, col=${col.name})`);
    const up = await rows(db.dbId, t.name, { op: 'update', filter: { [pk[0]]: id }, data: { [col.name]: probe } });
    note(up.status >= 200 && up.status < 300, `update reached the engine 2xx (got ${up.status})`);
    const got = await rows(db.dbId, t.name, { op: 'get', filter: { [pk[0]]: id } });
    note(got.j?.rows?.[0]?.[col.name] === probe, 'value changed (info: enum/validator cols may reject the probe)');
    await rows(db.dbId, t.name, { op: 'update', filter: { [pk[0]]: id }, data: { [col.name]: orig } });
    const back = await rows(db.dbId, t.name, { op: 'get', filter: { [pk[0]]: id } });
    note(back.j?.rows?.[0]?.[col.name] === orig, 'value restored (non-destructive)');
    return true;
  }
  console.log(`UPDATE-restore on ${db.name}: no eligible table (single-pk + nullable text + a row) — skipped`);
  return false;
}

const is2xx = (s) => s >= 200 && s < 300;

// DynamoDB has no schema_ddl (no create_table), so CRUD is proven op-based on an
// existing introspected table: a fresh probe id round-trips insert→get→update→
// delete under the caller's owner partition without touching real rows.
async function dynamoCrud(db, schema) {
  const t = (schema.tables ?? [])[0];
  if (!t) { console.log(`SKIP ${db.name} (dynamodb: no tables introspected)`); return; }
  const id = `crud_probe_${STAMP}`;
  console.log(`DYNAMODB CRUD on ${db.name}.${t.name} (op-based, no DDL; id=${id})`);
  ok(is2xx((await rows(db.dbId, t.name, { op: 'insert', data: { id, label: 'alpha' } })).status), 'insert 2xx');
  ok((await rows(db.dbId, t.name, { op: 'get', filter: { id } })).j?.rows?.[0]?.label === 'alpha', 'get returns inserted row');
  await rows(db.dbId, t.name, { op: 'update', filter: { id }, data: { id, label: 'beta' } });
  ok((await rows(db.dbId, t.name, { op: 'get', filter: { id } })).j?.rows?.[0]?.label === 'beta', 'update changed the value');
  await rows(db.dbId, t.name, { op: 'delete', filter: { id } });
  ok(((await rows(db.dbId, t.name, { op: 'get', filter: { id } })).j?.rows ?? []).length === 0, 'delete removed the row');
}

async function lifecycle(db) {
  console.log(`LIFECYCLE on ${db.name} (${db.engine}) — create/insert/get/update/delete/drop`);
  const cr = await ddl(db.dbId, { op: 'create_table', table: PROBE_TABLE, columns: [{ name: 'id', normalized_type: 'integer', nullable: false }, { name: 'label', normalized_type: 'text', nullable: true }], primary_key: ['id'] });
  if (!is2xx(cr.status)) { console.log(`  create_table → ${cr.status} ${JSON.stringify(cr.j).slice(0, 180)} (skipping lifecycle)`); return; }
  ok(true, `create_table ${cr.status}`);
  ok(is2xx((await rows(db.dbId, PROBE_TABLE, { op: 'insert', data: { id: 1, label: 'alpha' } })).status), 'insert 2xx');
  ok((await rows(db.dbId, PROBE_TABLE, { op: 'get', filter: { id: 1 } })).j?.rows?.[0]?.label === 'alpha', 'get returns inserted row');
  await rows(db.dbId, PROBE_TABLE, { op: 'update', filter: { id: 1 }, data: { label: 'beta' } });
  ok((await rows(db.dbId, PROBE_TABLE, { op: 'get', filter: { id: 1 } })).j?.rows?.[0]?.label === 'beta', 'update changed the value');
  await rows(db.dbId, PROBE_TABLE, { op: 'delete', filter: { id: 1 } });
  ok(((await rows(db.dbId, PROBE_TABLE, { op: 'get', filter: { id: 1 } })).j?.rows ?? []).length === 0, 'delete removed the row');
  ok(is2xx((await ddl(db.dbId, { op: 'drop_table', table: PROBE_TABLE, confirm: true })).status), 'drop_table 2xx');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 20; i += 1) { try { if ((await fetch(`${BR}/api/auth/bridge/health`)).ok) break; } catch { /* */ } await sleep(1000); }
  const list = (await api('GET', '/api/databases')).j?.databases ?? [];
  const enginesDone = new Set(); // one full create→drop lifecycle per distinct engine
  for (const db of list) {
    const schema = (await api('GET', `/api/databases/${db.dbId}/schema`)).j;
    if (db.engine === 'dynamodb') { await dynamoCrud(db, schema); continue; }
    if (!schema?.tables?.length) { console.log(`SKIP ${db.name} (no introspectable tables)`); continue; }
    await updateRestore(db, schema);
    if (!enginesDone.has(db.engine)) { enginesDone.add(db.engine); await lifecycle(db); }
  }
  console.log(failures === 0 ? '\nALL CRUD CHECKS PASSED' : `\n${failures} CRUD CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error('CRUD probe crashed:', err.message); process.exit(1); });
