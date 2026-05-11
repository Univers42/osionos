export type FeatureFlagName = "osio.canvas.v2";

export function isFeatureFlagEnabled(name: FeatureFlagName, fallback = false): boolean {
  const urlValue = readUrlFlag(name);
  if (urlValue !== null) return flagValueToBoolean(urlValue, fallback);
  const storedValue = readStoredFlag(name);
  if (storedValue !== null) return flagValueToBoolean(storedValue, fallback);
  const envValue = import.meta.env[envKeyForFlag(name)];
  if (typeof envValue === "string") return flagValueToBoolean(envValue, fallback);
  return fallback;
}

export function isCanvasV2Enabled(): boolean {
  return isFeatureFlagEnabled("osio.canvas.v2", false);
}

function readUrlFlag(name: FeatureFlagName): string | null {
  if (globalThis.window === undefined) return null;
  const searchParams = new URLSearchParams(globalThis.window.location.search);
  const hashParams = new URLSearchParams(globalThis.window.location.hash.replace(/^#/, ""));
  return searchParams.get(name) ?? hashParams.get(name) ?? searchParams.get(envKeyForFlag(name)) ?? hashParams.get(envKeyForFlag(name));
}

function readStoredFlag(name: FeatureFlagName): string | null {
  if (globalThis.window === undefined) return null;
  try {
    return globalThis.window.localStorage.getItem(name) ?? globalThis.window.localStorage.getItem(envKeyForFlag(name));
  } catch {
    return null;
  }
}

function envKeyForFlag(name: FeatureFlagName): string {
  return `VITE_${name.toUpperCase().replaceAll(".", "_")}`;
}

function flagValueToBoolean(value: string, fallback: boolean): boolean {
  if (["1", "true", "on", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "off", "no"].includes(value.toLowerCase())) return false;
  return fallback;
}
