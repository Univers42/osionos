/**
 * Loads graph_render's `<graph-studio>` pack, which is not part of this bundle: groot's
 * osionos-app image serves it under `/graph-studio/<sha>/` and names that base in
 * `<meta name="graph-studio-base">`. An image without the pack has no meta, and the
 * graph says so instead of drawing nothing.
 */

export const GRAPH_STUDIO_TAG = "graph-studio";
/** The host API and wasm ABI this host was written against (graph_render @ groot's pin). */
export const HOST_API = 2;
export const ABI_VERSION = 2;

export class GraphStudioUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphStudioUnavailable";
  }
}

export interface StudioPack {
  /** Absolute URL of the pack directory, ending in `/`. */
  readonly base: string;
}

interface StudioModule {
  HOST_API?: unknown;
  defineGraphStudio?: () => void;
}

let pending: Promise<StudioPack> | null = null;

function packBase(): string {
  const content = document.querySelector<HTMLMetaElement>('meta[name="graph-studio-base"]')?.content ?? "";
  if (!content) throw new GraphStudioUnavailable("this build serves no graph engine (no graph-studio-base meta)");
  const base = new URL(content, globalThis.location.href).href;
  return base.endsWith("/") ? base : `${base}/`;
}

async function packAbi(base: string): Promise<unknown> {
  try {
    const response = await fetch(`${base}pack.json`);
    return response.ok ? ((await response.json()) as { abi_version?: unknown }).abi_version : undefined;
  } catch {
    return undefined;
  }
}

async function load(): Promise<StudioPack> {
  const base = packBase();
  const [mod, abi] = await Promise.all([
    import(/* @vite-ignore */ `${base}graph-studio.js`) as Promise<StudioModule>,
    packAbi(base),
  ]);
  if (mod.HOST_API !== HOST_API || typeof mod.defineGraphStudio !== "function") {
    throw new GraphStudioUnavailable(`the graph engine speaks host API ${String(mod.HOST_API)}, this app needs ${HOST_API}`);
  }
  if (abi !== ABI_VERSION) {
    throw new GraphStudioUnavailable(`the graph engine's pack has ABI ${String(abi)}, this app needs ${ABI_VERSION}`);
  }
  mod.defineGraphStudio();
  await customElements.whenDefined(GRAPH_STUDIO_TAG);
  return { base };
}

/** The pack, loaded once per page; a failed load is retried by the next caller. */
export function loadStudio(): Promise<StudioPack> {
  pending ??= load().catch((error: unknown) => {
    pending = null;
    throw error instanceof GraphStudioUnavailable
      ? error
      : new GraphStudioUnavailable(`the graph engine did not load: ${error instanceof Error ? error.message : String(error)}`);
  });
  return pending;
}
