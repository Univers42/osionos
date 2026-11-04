/**
 * Which optional features the bridge serves, read once per session from GET /api/capabilities
 * (scripts/bridge-capabilities.mjs).
 *
 * A feature's own route answers 404 while the feature is off, and Chrome logs every 404 as a
 * console error (#293), so a caller asks here first and skips a route the bridge does not serve.
 *
 * Caveat: `null` means "cannot say" (signed out, a bridge older than the route, no network); the
 * caller then asks its route as it did before, so an older bridge still logs that 404, and its
 * own GET /api/capabilities 404 once per session.
 */

export type BridgeCapability = "recs" | "publish";
export type BridgeCapabilities = Partial<Record<BridgeCapability, boolean>>;

const NAMES: readonly BridgeCapability[] = ["recs", "publish"];

export function parseCapabilities(raw: unknown): BridgeCapabilities {
  const listed = (raw as { capabilities?: unknown } | null)?.capabilities;
  if (!listed || typeof listed !== "object") return {};
  const parsed: BridgeCapabilities = {};
  for (const name of NAMES) {
    const value = (listed as Record<string, unknown>)[name];
    if (typeof value === "boolean") parsed[name] = value;
  }
  return parsed;
}

interface CapabilityReaderDeps {
  token: () => string | null | Promise<string | null>;
  load: (token: string) => Promise<unknown>;
}

export function createCapabilityReader({ token, load }: CapabilityReaderDeps) {
  let cached: { token: string; read: Promise<BridgeCapabilities | null> } | null = null;
  return {
    async serves(name: BridgeCapability): Promise<boolean | null> {
      const bearer = await token();
      if (!bearer) return null;
      if (cached?.token !== bearer) {
        cached = { token: bearer, read: load(bearer).then(parseCapabilities, () => null) };
      }
      return (await cached.read)?.[name] ?? null;
    },
  };
}

const reader = createCapabilityReader({
  // No bridge configured (an offline build): nothing to ask, and a relative URL would 404 on the app.
  token: async () => {
    const client = await import("./client");
    return client.API_BASE ? client.getActivePageJwt() : null;
  },
  load: async (bearer) => (await import("./client")).api.get<unknown>("/api/capabilities", bearer),
});

/** Whether the bridge serves `name`: true, false, or null when it cannot say. */
export const bridgeServes = (name: BridgeCapability): Promise<boolean | null> => reader.serves(name);
