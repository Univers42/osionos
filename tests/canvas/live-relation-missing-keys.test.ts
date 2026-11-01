import assert from "node:assert/strict";
import { test } from "node:test";
import { missingReferenceKeys, readRowsByKeys, rememberRead, scanRowsAfterFirstPage, settledWithin, shareInFlight } from "../../src/shared/notion-database-sys/src/store/live/liveReadPlanning.ts";
import { needsCrossMountCatalog } from "../../src/shared/notion-database-sys/src/store/live/liveReferenceInfer.ts";

// #260: a deals table showed `1650` instead of the customer, because only the first
// 500 of 6,000 customers were read. #264: six widgets sent 25 identical list calls.
const primary = {
  name: "deals", primary_key: ["id"],
  columns: [
    { name: "id", references: null },
    { name: "customer_id", references: { table: "customers", column: "id" } },
    { name: "partner_id", references: { table: "customers", column: "id" } },
    { name: "owner_id", references: { table: "employees", column: "id" } },
  ],
} as never;
const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: index + 1 }));

test("keys past the preloaded page are asked for once each", () => {
  const rows = [
    { customer_id: 7, partner_id: 1650, owner_id: 9999 },
    { customer_id: 1650, partner_id: 2000, owner_id: 1 },
    { customer_id: null, partner_id: undefined, owner_id: 2 },
  ];
  assert.deepEqual(missingReferenceKeys(primary, "customers", "id", firstPage, rows), [1650, 2000]);
});

test("nothing missing asks for nothing", () => {
  assert.deepEqual(missingReferenceKeys(primary, "customers", "id", firstPage, [{ customer_id: 7 }]), []);
});

test("a string key matches a numeric row id", () => {
  assert.deepEqual(missingReferenceKeys(primary, "customers", "id", firstPage, [{ customer_id: "7" }]), []);
});

test("identical reads in flight share one request; a later read goes out again", async () => {
  const reads = new Map<string, Promise<number>>();
  let started = 0;
  const start = async () => ++started;
  const [first, second] = await Promise.all([shareInFlight(reads, "k", start), shareInFlight(reads, "k", start)]);
  assert.equal(first, second);
  assert.equal(started, 1);
  await shareInFlight(reads, "k", start);
  assert.equal(started, 2, "nothing is served from memory afterwards");
  await shareInFlight(reads, "other", start);
  assert.equal(started, 3, "a different read stays different");
});

test("a failed read is not kept", async () => {
  const reads = new Map<string, Promise<number>>();
  await assert.rejects(shareInFlight(reads, "k", async () => { throw new Error("boom"); }));
  assert.equal(reads.size, 0);
});

// #260 again: a WAF refuses `$in`; per-key reads then cost 136 requests and 9.2 s on one
// page, and the catch around the chunk read had dropped the whole table.
test("a refused chunk read picks the keys out of one table scan", async () => {
  let scans = 0;
  const rows = await readRowsByKeys([1650, "2000"], "id", 500, async () => { throw new Error("403"); }, async () => {
    scans += 1;
    return [{ id: 1650 }, { id: 2000 }, { id: 3000 }];
  });
  assert.deepEqual(rows, [{ id: 1650 }, { id: 2000 }]);
  assert.equal(scans, 1);
});

test("a failed scan costs the labels, never the load", async () => {
  const rows = await readRowsByKeys([1], "id", 500, async () => { throw new Error("403"); }, async () => { throw new Error("down"); });
  assert.deepEqual(rows, []);
});

test("working chunks scan nothing; no keys read nothing", async () => {
  const scan = async () => { throw new Error("must not run"); };
  const rows = await readRowsByKeys([1, 2, 3], "id", 2, async (chunk) => chunk.map((id) => ({ id })), scan);
  assert.equal(rows.length, 3);
  assert.deepEqual(await readRowsByKeys([], "id", 2, scan, scan), []);
});

test("a scan stops at the short page, after the first page the caller already holds", async () => {
  const offsets: number[] = [];
  const rows = await scanRowsAfterFirstPage(500, async (offset) => {
    offsets.push(offset);
    return offset < 1000 ? Array.from({ length: 500 }, () => ({})) : [{}];
  });
  assert.equal(offsets[0], 500);
  assert.equal(Math.max(...offsets), 3000, "one batch of six pages");
  assert.ok(rows.length >= 501);
});

test("a scan is bounded", async () => {
  let reads = 0;
  await scanRowsAfterFirstPage(10, async () => { reads += 1; return Array.from({ length: 10 }, () => ({})); });
  assert.equal(reads, 19);
});

test("a remembered read is shared until it expires, and a failure is not kept", async () => {
  const reads = new Map();
  let started = 0;
  const start = async () => ++started;
  await rememberRead(reads, "k", 1000, start, 0);
  await rememberRead(reads, "k", 1000, start, 999);
  assert.equal(started, 1);
  await rememberRead(reads, "k", 1000, start, 1000);
  assert.equal(started, 2);
  await rememberRead(reads, "bad", 1000, async () => { throw new Error("x"); }, 0).catch(() => undefined);
  await Promise.resolve();
  assert.equal(reads.has("bad"), false);
});

// #264: every opened table asked all 19 mounts for their schema.
test("the other mounts are only needed for a key nothing here resolves", () => {
  const table = (columns: object[]) => ({ name: "deals", primary_key: ["id"], columns }) as never;
  const schema = (tables: unknown[]) => ({ tables }) as never;
  const reported = table([{ name: "customer_id", references: { table: "customers", column: "id" } }]);
  assert.equal(needsCrossMountCatalog(schema([reported]), reported), false, "the engine reported it");
  const sibling = table([{ name: "customer_id", references: null }]);
  assert.equal(needsCrossMountCatalog(schema([sibling, { name: "customers", columns: [] }]), sibling), false, "a sibling answers");
  assert.equal(needsCrossMountCatalog(schema([sibling]), sibling), true, "only another mount can");
  const stamp = table([{ name: "owner_id", references: null }, { name: "title", references: null }]);
  assert.equal(needsCrossMountCatalog(schema([stamp]), stamp), false, "a stamp is no relation");
});

// A cold scan took 9.2 s where the table alone took 1.8 s.
test("a scan answers inside the budget, or nothing yet, and a later load gets the same scan", async () => {
  const slow = new Promise<string>((resolve) => { setTimeout(() => resolve("rows"), 60); });
  assert.equal(await settledWithin(slow, 5), null);
  assert.equal(await settledWithin(slow, 200), "rows");
  assert.equal(await settledWithin(Promise.resolve("held"), 5), "held");
});
