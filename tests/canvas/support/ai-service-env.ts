// Lets a canvas test switch the AI service on and off. aiClient reads VITE_AI_URL from
// import.meta.env on every isAiConfigured() call, and node leaves import.meta.env
// undefined; this hands aiClient one shared object the test fills. Import it before
// anything that loads aiClient, then reach the app through `await import(...)`: a
// static import is loaded before this hook is registered.

import { register } from "node:module";

const LOADER = `
export async function load(url, context, nextLoad) {
	const loaded = await nextLoad(url, context);
	if (loaded.source == null || !url.includes("features/ai/api/aiClient.ts")) return loaded;
	const source = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
	return { ...loaded, source: "import.meta.env ??= (globalThis.__osionosAiEnv ??= {});\\n" + source };
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const env = ((globalThis as Record<string, unknown>).__osionosAiEnv ??= {}) as Record<string, string>;

/** An empty url is "not configured on this build". */
export function setAiServiceUrl(url: string): void {
  env.VITE_AI_URL = url;
}
