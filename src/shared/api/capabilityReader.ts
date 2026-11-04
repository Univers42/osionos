/**
 * A service's `{ capabilities: { <name>: boolean } }` answer, read once per session token
 * (bridgeCapabilities.ts, aiCapabilities.ts). A value that is not a boolean is not reported.
 */

export type Capabilities<Name extends string> = Partial<Record<Name, boolean>>;

export function parseCapabilities<Name extends string>(names: readonly Name[], raw: unknown): Capabilities<Name> {
  const listed = (raw as { capabilities?: unknown } | null)?.capabilities;
  if (!listed || typeof listed !== "object") return {};
  const parsed: Capabilities<Name> = {};
  for (const name of names) {
    const value = (listed as Record<string, unknown>)[name];
    if (typeof value === "boolean") parsed[name] = value;
  }
  return parsed;
}

interface CapabilityReaderDeps {
  token: () => string | null | Promise<string | null>;
  load: (token: string) => Promise<unknown>;
}

export function createCapabilityReader<Name extends string>(names: readonly Name[], { token, load }: CapabilityReaderDeps) {
  let cached: { token: string; read: Promise<Capabilities<Name> | null> } | null = null;
  return {
    /** true or false as the service says; null when it cannot say (no token, or the read failed). */
    async serves(name: Name): Promise<boolean | null> {
      const bearer = await token();
      if (!bearer) return null;
      if (cached?.token !== bearer) {
        cached = { token: bearer, read: load(bearer).then((raw) => parseCapabilities(names, raw), () => null) };
      }
      return (await cached.read)?.[name] ?? null;
    },
  };
}
