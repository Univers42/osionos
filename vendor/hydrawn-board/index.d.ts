/**
 * osionos' declaration of the vendored `@hydrawn/board` (hydrawn packages/board/index.d.ts).
 * Self-contained: hydrawn's own re-exports its contract's TypeScript source, which osionos does
 * not carry. Caveat: hand-kept and narrowed to what osionos calls — a board is `HydrawnBoard`,
 * the contract's fields this side reads, plus whatever else the bridge sent; check it against
 * hydrawn's when VERSION moves.
 */

export interface HydrawnScene {
  type: "osidraw";
  version: number;
  elements: unknown[];
}

export interface HydrawnBoard {
  slug: string;
  title: string;
  rev: number;
  scene: HydrawnScene;
  [field: string]: unknown;
}

export interface HydrawnBoardSummary {
  slug: string;
  title: string;
  rev: number;
  [field: string]: unknown;
}

/** The routes `createHostedStore` saves through; each failure is a `BoardStoreError`. */
export interface HostedBoardApi {
  getBoard(slug: string, options?: { tombstones?: boolean }): Promise<HydrawnBoard>;
  replaceBoard(slug: string, scene: HydrawnScene, rev: number): Promise<HydrawnBoard>;
  createBoard(title: string, slug?: string): Promise<HydrawnBoardSummary>;
  putThumbnail(slug: string, blob: Blob): Promise<void>;
}

/** Opaque here: osionos only hands it from `createHostedStore` to `mountBoard`. */
export interface BoardStore {
  readonly __hydrawnBoardStore?: never;
}

export type BoardTheme = "light" | "dark";

export interface MountBoardOptions {
  store: BoardStore;
  slug: string;
  title?: string;
  theme?: BoardTheme;
  readOnly?: boolean;
  engineUrl?: string | URL;
}

export interface BoardHandle {
  setTheme(theme: BoardTheme): void;
  destroy(): Promise<void>;
}

export declare const BOARD_ROOT_CLASS: "hydrawn-board";
export declare function mountBoard(target: HTMLElement | ShadowRoot, options: MountBoardOptions): BoardHandle;
export declare function createHostedStore(client: HostedBoardApi, newTitle: () => string): BoardStore;
export declare const boardCss: string;
export declare class BoardStoreError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string);
}
