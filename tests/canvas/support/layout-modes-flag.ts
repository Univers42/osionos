// A MODE-locked flag (osio.layout.modes, osio.profile.page) in a node test, set the two ways a browser gets it: the build env
// `vite build` bakes (MODE, VITE_OSIO_*) and a tester's URL + localStorage
// override. A production build reads only the env (groot ADR 0067 RD5).
import { registerHooks } from "node:module";

const FLAGS = new URL("../../../src/shared/config/featureFlags.ts", import.meta.url).href;

/** featureFlags.ts loaded after this call sees `env` as its import.meta.env, as a build of
 *  that mode would. A `?env=<json>` query on the specifier wins, so one file can load
 *  several builds side by side. Call it before the first import that reaches the flag. */
export function bakeBuildEnv(env: Record<string, string>): void {
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (url.split("?")[0] !== FLAGS) return result;
      const baked = new URL(url).searchParams.get("env") ?? JSON.stringify(env);
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= ${baked};\n${source}` };
    },
  });
}

const ignoreListener = (): void => undefined;

/** A tester's override of `flag`, `?<flag>=<value>` plus the localStorage key; null clears both.
 *  Modules loaded after this see a window and register page listeners on globalThis (pagehide
 *  in pageStore.helpers.ts), so globalThis gets inert listener methods too. */
export function setFlagOverride(flag: string, value: string | null): void {
  const stored = new Map<string, string>(value === null ? [] : [[flag, value]]);
  Reflect.set(globalThis, "window", {
    location: { search: value === null ? "" : `?${flag}=${value}`, hash: "" },
    localStorage: { getItem: (key: string) => stored.get(key) ?? null },
    addEventListener: ignoreListener,
    removeEventListener: ignoreListener,
  });
  if (typeof Reflect.get(globalThis, "addEventListener") !== "function") Reflect.set(globalThis, "addEventListener", ignoreListener);
  if (typeof Reflect.get(globalThis, "removeEventListener") !== "function") Reflect.set(globalThis, "removeEventListener", ignoreListener);
}

export function setLayoutModesOverride(value: string | null): void {
  setFlagOverride("osio.layout.modes", value);
}
