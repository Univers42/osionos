import type { Page, PageQuery } from "@notion-db/object-database";

export function mergeChangedRecords<TRecord>(
  currentRecords: Record<string, TRecord>,
  nextRecords: Record<string, TRecord>,
  previousRecords: Record<string, TRecord>,
): Record<string, TRecord> {
  const merged = { ...currentRecords };
  for (const [recordId, nextRecord] of Object.entries(nextRecords)) {
    if (previousRecords[recordId] !== nextRecord) merged[recordId] = nextRecord;
  }
  for (const recordId of Object.keys(previousRecords)) {
    if (!(recordId in nextRecords)) delete merged[recordId];
  }
  return merged;
}

export function normalizeQueryLimit(limit: PageQuery["limit"]): number | undefined {
  if (limit === undefined) return undefined;
  const numericLimit = Math.floor(Number(limit));
  return Number.isFinite(numericLimit) && numericLimit >= 0 ? numericLimit : undefined;
}

export function matchesPageQuery(page: Page, query: PageQuery): boolean {
  if (query.databaseId && page.databaseId !== query.databaseId) return false;
  return query.filter ? matchesDocFilter(page, query.filter) : true;
}

function matchesDocFilter(page: Page, filter: NonNullable<PageQuery["filter"]>): boolean {
  return Object.entries(filter).every(([propertyId, condition]) => matchesCondition(page.properties[propertyId], condition));
}

function matchesCondition(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return matchesExistence(value, condition.exists)
    && matchesEquality(value, condition)
    && matchesInclusion(value, condition)
    && matchesContainment(value, condition.contains)
    && matchesRange(value, condition);
}

function matchesExistence(value: unknown, exists: boolean | undefined): boolean {
  return exists === undefined || (value !== undefined && value !== null && value !== "") === exists;
}

function matchesEquality(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.eq === undefined || value === condition.eq) && (condition.neq === undefined || value !== condition.neq);
}

function matchesInclusion(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.in?.includes(value) ?? true) && !(condition.nin?.includes(value) ?? false);
}

function matchesContainment(value: unknown, contains: unknown): boolean {
  return contains === undefined || valueContains(value, contains);
}

function matchesRange(value: unknown, condition: NonNullable<PageQuery["filter"]>[string]): boolean {
  return (condition.gt === undefined || compareValues(value, condition.gt) > 0)
    && (condition.gte === undefined || compareValues(value, condition.gte) >= 0)
    && (condition.lt === undefined || compareValues(value, condition.lt) < 0)
    && (condition.lte === undefined || compareValues(value, condition.lte) <= 0);
}

export function sortPages(pages: Page[], sort: NonNullable<PageQuery["sort"]>): Page[] {
  return [...pages].sort((left, right) => {
    for (const rule of sort) {
      const result = compareValues(left.properties[rule.propertyId], right.properties[rule.propertyId]);
      if (result !== 0) return rule.direction === "asc" ? result : -result;
    }
    return 0;
  });
}

function compareValues(left: unknown, right: unknown): number {
  const leftValue = comparableValue(left);
  const rightValue = comparableValue(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function comparableValue(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && value.trim() !== "" ? asNumber : value.toLocaleLowerCase();
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) return value.join(", ").toLocaleLowerCase();
  return stringifyUnknown(value).toLocaleLowerCase();
}

function valueContains(value: unknown, needle: unknown): boolean {
  const needleText = stringifyUnknown(needle).toLocaleLowerCase();
  if (Array.isArray(value)) return value.includes(needle) || value.some((item) => stringifyUnknown(item).toLocaleLowerCase().includes(needleText));
  return stringifyUnknown(value).toLocaleLowerCase().includes(needleText);
}

function stringifyUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyUnknown).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
