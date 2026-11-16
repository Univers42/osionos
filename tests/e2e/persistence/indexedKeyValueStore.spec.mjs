import { expect, test } from "@playwright/test";

test("indexed key-value store persists a large Unicode string with strict durability", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const name = "osionos-kv-large-unicode";
    const unit = "données-数据-🙂-";
    const value = unit.repeat(Math.ceil(4_700_000 / unit.length)).slice(0, 4_700_000);
    const store = await openIndexedKeyValueStore(name);
    await store.update([], () => ({ payload: value }), { durability: "strict" });
    store.close();

    const reopened = await openIndexedKeyValueStore(name);
    const current = await reopened.update(["payload"], () => null);
    const restored = current.get("payload");
    reopened.close();
    return {
      length: typeof restored === "string" ? restored.length : 0,
      same: restored === value,
    };
  });

  expect(result).toEqual({ length: 4_700_000, same: true });
});

test("indexed key-value store write-if-absent keeps the first value", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const store = await openIndexedKeyValueStore("osionos-kv-write-if-absent");
    for (const value of ["first", "second"]) {
      await store.update(["key"], current => current.has("key") ? null : { key: value });
    }
    const current = await store.update(["key"], () => null);
    store.close();
    return current.get("key");
  });

  expect(result).toBe("first");
});

test("indexed key-value store aborts when change throws", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const store = await openIndexedKeyValueStore("osionos-kv-change-throws");
    let message = "";
    try {
      await store.update([], () => { throw new Error("change stopped the update"); });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const current = await store.update(["key"], () => null);
    store.close();
    return { message, hasKey: current.has("key") };
  });

  expect(result).toEqual({ message: "change stopped the update", hasKey: false });
});

test("indexed key-value store orders overlapping readwrite transactions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const store = await openIndexedKeyValueStore("osionos-kv-transaction-order");
    const first = store.update([], () => ({ first: "written" }));
    const second = store.update(["first"], current => ({ seen: current.get("first") }));
    await Promise.all([first, second]);
    const current = await store.update(["seen"], () => null);
    store.close();
    return current.get("seen");
  });

  expect(result).toBe("written");
});

test("indexed key-value store closes on version change and rejects later updates", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const name = "osionos-kv-version-change";
    const store = await openIndexedKeyValueStore(name);
    let blocked = false;
    const version = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onblocked = () => { blocked = true; };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        resolve(version);
      };
    });
    let closed = false;
    try {
      await store.update([], () => null);
    } catch (error) {
      closed = error instanceof Error && /closed/.test(error.message);
    }
    return { blocked, version, closed };
  });

  expect(result).toEqual({ blocked: false, version: 2, closed: true });
});

test("indexed key-value store times out an open request that never fires", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { openIndexedKeyValueStore } = await import("/src/shared/lib/key-value-store/indexedKeyValueStore.ts");
    const factory = { open: () => ({}) };
    try {
      await openIndexedKeyValueStore("osionos-kv-open-timeout", { factory, openTimeoutMs: 50 });
      return { rejected: false, message: "" };
    } catch (error) {
      return {
        rejected: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  expect(result.rejected).toBe(true);
  expect(result.message).toMatch(/timed out/);
});
