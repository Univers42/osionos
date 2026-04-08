/** @file inferSchema.ts — Derives field schemas from a sample of records. */

import type { DbFieldSchema, DbRecord } from './types.ts';

type FieldType = DbFieldSchema['type'];

/** Infer the field type from a JS value. */
function inferType(value: unknown): FieldType {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    return 'string';
  }
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/** Process a single record, updating the field map with type/nullable info. */
function processRecord(
  record: DbRecord,
  fieldMap: Map<string, { types: Set<FieldType>; hasNull: boolean }>,
): void {
  for (const [key, value] of Object.entries(record)) {
    let entry = fieldMap.get(key);
    if (!entry) {
      entry = { types: new Set(), hasNull: false };
      fieldMap.set(key, entry);
    }
    if (value === null || value === undefined) {
      entry.hasNull = true;
    } else {
      entry.types.add(inferType(value));
    }
  }
  for (const [key, entry] of fieldMap) {
    if (!(key in record)) entry.hasNull = true;
  }
}

/** Build a DbFieldSchema array by scanning all records. */
export function inferSchema(records: DbRecord[]): DbFieldSchema[] {
  if (records.length === 0) return [];

  const fieldMap = new Map<string, { types: Set<FieldType>; hasNull: boolean }>();

  for (const record of records) {
    processRecord(record, fieldMap);
  }

  const fields: DbFieldSchema[] = [];
  for (const [name, { types, hasNull }] of fieldMap) {
    const typeArr = [...types];
    const type: FieldType = typeArr.length === 1 ? typeArr[0] : 'unknown';
    fields.push({ name, type, nullable: hasNull });
  }
  return fields;
}
