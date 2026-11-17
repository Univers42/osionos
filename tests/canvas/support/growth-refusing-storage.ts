// A localStorage on a full origin as the three engines behave (ADR 0054, C7): a write that would
// grow the origin throws QuotaExceededError, a write that shrinks or keeps its size is stored.
// Caveat: size counts the UTF-16 code units of key + value, not each engine's own accounting, and
// it never refuses a shrinking write, so it does not model an engine that refuses every write
// (R-C7a, tested with fullOrigin in known-database-legacy-retirement.test.ts) nor two tabs
// writing between each other's reads.

type Legacy = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export type StorageOp = ["set" | "remove", string, string | null];

export interface GrowthRefusingStorage extends Legacy {
  values: Map<string, string>;
  refusesGrowth: boolean;
  /** Every stored set and remove of a key in `logged`, in order. */
  log: StorageOp[];
}

export function growthRefusingStorage(initial: Map<string, string>, logged: ReadonlySet<string>): GrowthRefusingStorage {
  const values = initial;
  const storage: GrowthRefusingStorage = {
    values,
    refusesGrowth: true,
    log: [],
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      const old = values.get(key);
      const growth = value.length - (old === undefined ? -key.length : old.length);
      if (growth > 0 && storage.refusesGrowth) throw new DOMException("full", "QuotaExceededError");
      values.set(key, value);
      if (logged.has(key)) storage.log.push(["set", key, value]);
    },
    removeItem: (key) => {
      if (values.has(key) && logged.has(key)) storage.log.push(["remove", key, null]);
      values.delete(key);
    },
  };
  return storage;
}
