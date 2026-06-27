/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-isolation-suite.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Cross-user database-isolation gate. Asserts the /api/databases/* plane is
 * scoped to workspace membership: a user who owns a database mount can read its
 * schema/rows, while a DIFFERENT user (who is NOT a member of the linking
 * workspace) gets 403 on schema, row-read AND row-write, and an empty list.
 *
 * Run INSIDE the bridge container (it holds the app-session secret + DB access):
 *   docker exec -i track-binocle-osionos-bridge-1 \
 *     node --input-type=module < scripts/db-isolation-suite.mjs
 *
 * Fixtures are the live dev DB (dev.pro.photo owns mounts; a fresh signup owns
 * none). Override via OWNER_SUB/OWNER_WS/OTHER_SUB/OTHER_WS/DB_ID/DB_TABLE env.
 */

import { configFromEnv, signAppSessionToken } from '/app/scripts/bridge-api.mjs';

const config = configFromEnv();
const BASE = `http://127.0.0.1:${config.port}`;

const OWNER_SUB = process.env.OWNER_SUB ?? '5cc30a3f-87e4-471d-b795-c936723081ee'; // dev.pro.photo
const OWNER_WS = process.env.OWNER_WS ?? '0ea96910-277a-49d6-901c-524b147cc009';
const OTHER_SUB = process.env.OTHER_SUB ?? '72efaac6-2959-464e-a9e5-7e0d6482cd9a'; // higueraslp (new)
const OTHER_WS = process.env.OTHER_WS ?? '75819e75-b86b-426d-b679-f4be9755dd21';
const DB_ID = process.env.DB_ID ?? '42c85133-c805-40c5-a260-04251834a337';
const DB_TABLE = process.env.DB_TABLE ?? 'events';

function mint(subject, workspaceId) {
	return signAppSessionToken({
		payload: { subject, provider: 'bridge' },
		workspace: { _id: workspaceId },
		config,
	}).token;
}

async function call(token, method, path, body) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	let payload = null;
	try { payload = await res.json(); } catch { /* no body */ }
	return { status: res.status, payload };
}

const owner = mint(OWNER_SUB, OWNER_WS);
const other = mint(OTHER_SUB, OTHER_WS);

const results = [];
function check(name, ok, detail) {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// 1) Owner can reach their own mount.
const ownerSchema = await call(owner, 'GET', `/api/databases/${DB_ID}/schema`);
check('owner reads own schema (200)', ownerSchema.status === 200, `status=${ownerSchema.status}`);

const ownerRows = await call(owner, 'POST', `/api/databases/${DB_ID}/tables/${DB_TABLE}`, { op: 'list', limit: 1 });
check('owner reads own rows (2xx)', ownerRows.status >= 200 && ownerRows.status < 300, `status=${ownerRows.status}`);

const ownerList = await call(owner, 'GET', '/api/databases');
const ownerSeesDb = Array.isArray(ownerList.payload?.databases) && ownerList.payload.databases.some((d) => d.dbId === DB_ID);
check('owner list includes own dbId', ownerSeesDb, `count=${ownerList.payload?.databases?.length ?? 0}`);

// 2) A different user (no membership) is denied on every database verb.
const otherSchema = await call(other, 'GET', `/api/databases/${DB_ID}/schema`);
check('other DENIED schema (403)', otherSchema.status === 403, `status=${otherSchema.status}`);

const otherRead = await call(other, 'POST', `/api/databases/${DB_ID}/tables/${DB_TABLE}`, { op: 'list', limit: 1 });
check('other DENIED row-read (403)', otherRead.status === 403, `status=${otherRead.status}`);

const otherWrite = await call(other, 'POST', `/api/databases/${DB_ID}/tables/${DB_TABLE}`, { op: 'insert', values: { leak: 'x' } });
check('other DENIED row-write (403)', otherWrite.status === 403, `status=${otherWrite.status}`);

const otherDdl = await call(other, 'POST', `/api/databases/${DB_ID}/schema/ddl`, { op: 'add_column', column: 'leak', type: 'text' });
check('other DENIED ddl (403)', otherDdl.status === 403, `status=${otherDdl.status}`);

const otherTxn = await call(other, 'POST', '/api/databases/txn', { mount: DB_ID, operations: [] });
check('other DENIED txn (403)', otherTxn.status === 403, `status=${otherTxn.status}`);

const otherList = await call(other, 'GET', '/api/databases');
const otherSeesNothing = Array.isArray(otherList.payload?.databases) && !otherList.payload.databases.some((d) => d.dbId === DB_ID);
check('other list excludes owner dbId', otherSeesNothing, `count=${otherList.payload?.databases?.length ?? 0}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`}  (${results.length} checks)`);
process.exit(failed.length === 0 ? 0 : 1);
