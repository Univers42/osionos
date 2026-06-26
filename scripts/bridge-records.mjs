/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-records.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Record→note unification (workstream D). Pure, dep-free helpers that turn one
 * multi-engine record (a row in a PG/MySQL/Mongo mount the viewer's workspaces
 * are linked to) into a deterministic osionos_pages "note", mirroring how the
 * marketplace turns a record into a page. The network + access resolution live
 * in bridge-api.mjs (handleRecordRead / handleRecordOpen); this module is
 * side-effect-free, mirroring bridge-graph-data.mjs.
 */

import { createHash } from 'node:crypto';

/** Fixed namespace UUID for osionos record→note ids (random v4, frozen forever). */
const RECORD_NOTE_NAMESPACE = '6f9619ff-8b86-d011-b42d-00c04fc964ff';

/** Mongo's primary key is `_id`; SQL engines use `id`. Detect by engine string. */
export function pkColumnForEngine(engine) {
	return String(engine ?? '').toLowerCase().includes('mongo') ? '_id' : 'id';
}

/**
 * RFC 4122 v5 (SHA-1) UUID. Dep-free: the bridge has no uuid package, so we hash
 * the namespace bytes ⊕ name with node:crypto and stamp the version/variant bits.
 */
export function uuidv5(name, namespace = RECORD_NOTE_NAMESPACE) {
	const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
	const hash = createHash('sha1').update(nsBytes).update(Buffer.from(String(name), 'utf8')).digest();
	const bytes = hash.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Deterministic osionos_pages id for a record — re-open is idempotent. */
export function recordNoteId(dbId, table, pk) {
	return uuidv5(`record:${dbId}:${table}:${pk}`);
}

/** Human label for the note title: prefer a name-ish column, else `<table> <pk>`. */
export function recordTitle(row, table, pk) {
	const r = row && typeof row === 'object' ? row : {};
	for (const key of ['name', 'title', 'subject', 'label', 'full_name', 'email']) {
		const value = r[key];
		if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
		if (typeof value === 'number') return String(value);
	}
	return `${table} ${pk}`.slice(0, 200);
}

/** Guess a property `type` from a column value (mirrors the marketplace property shape). */
function propertyType(value) {
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'checkbox';
	if (Array.isArray(value)) return 'multi_select';
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value)) return 'date';
	if (typeof value === 'string' && /^https?:\/\//i.test(value)) return 'url';
	return 'text';
}

/** Turn a snake/camel column key into a human label ("placed_at" → "Placed at"). */
function columnLabel(key) {
	const spaced = String(key).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
	return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
}

/**
 * Project a record's columns into osionos page `properties` (the same
 * `{key,label,type,value}` shape the marketplace/recordTemplate uses). The pk
 * column is dropped (it is the note id's source, not a displayed field). Object
 * values are JSON-stringified so the property stays a flat scalar.
 */
export function recordProperties(row, pkColumn) {
	if (!row || typeof row !== 'object') return [];
	const props = [];
	for (const [key, value] of Object.entries(row)) {
		if (key === pkColumn || value === undefined) continue;
		const type = propertyType(value);
		const flat = value !== null && typeof value === 'object' && type === 'text' ? JSON.stringify(value) : value;
		props.push({ key, label: columnLabel(key), type, value: flat });
	}
	return props;
}

/**
 * Build the osionos_pages upsert body for a record note. `databaseId` is
 * `baas:<dbId>:<table>` so the client template registry can key a RecordTemplate
 * off it. Owner-stamped + workspace-scoped by the caller (handleRecordOpen).
 */
export function recordNotePageBody({ dbId, table, pk, row, engine, workspaceId, userId, now }) {
	const pkColumn = pkColumnForEngine(engine);
	return {
		id: recordNoteId(dbId, table, pk),
		workspace_id: workspaceId,
		owner_id: userId,
		parent_page_id: null,
		database_id: `baas:${dbId}:${table}`,
		title: recordTitle(row, table, pk),
		icon: 'icon:database',
		surface: 'page',
		visibility: 'private',
		collaborators: [],
		properties: recordProperties(row, pkColumn),
		content: [],
		updated_at: now,
	};
}

/**
 * Build the osionos_pages insert body for a hand-created sub-item note nested
 * under a parent (a record-note or another note) via `parent_page_id`. The id is
 * caller-supplied (a fresh uuid); title/icon/properties/content are the
 * sub-item's OWN metadata. Schema-non-invasive — the source DB is never touched,
 * so this works identically on every engine. Inputs are pre-validated by the
 * handler; this stays pure (defaulting only).
 */
export function recordSubitemNoteBody({ id, parentNoteId, workspaceId, userId, title, icon, properties, content, now }) {
	const safeTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : 'Sub-item';
	return {
		id,
		workspace_id: workspaceId,
		owner_id: userId,
		parent_page_id: parentNoteId,
		database_id: null,
		title: safeTitle,
		icon: typeof icon === 'string' && icon ? icon : 'icon:file-text',
		surface: 'page',
		visibility: 'private',
		collaborators: [],
		properties: Array.isArray(properties) ? properties : [],
		content: Array.isArray(content) ? content : [],
		updated_at: now,
	};
}
