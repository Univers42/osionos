import type { HostedBoardApi } from "@hydrawn/board";

export interface NewBoardReadDeps {
  /** Whether the user already has a board under this slug. */
  hasBoard: (slug: string) => Promise<boolean>;
  /** The library's `BoardStoreError`: it opens an empty board on a 404. */
  refusal: (status: number, code: string, message: string) => Error;
}

/**
 * The board calls, with the read of a board that has no row yet answered here as the 404 the
 * library expects, without a request. A block opened and never drawn in then creates nothing:
 * the row appears with the first save, which the library creates on that 404 (#319).
 * A lookup that fails counts as "has a board", so the bridge's own answer decides.
 */
export function readNewBoardsLocally(api: HostedBoardApi, { hasBoard, refusal }: NewBoardReadDeps): HostedBoardApi {
  const known = new Map<string, Promise<boolean>>();
  const has = (slug: string): Promise<boolean> => {
    const cached = known.get(slug);
    if (cached) return cached;
    const asked = hasBoard(slug).catch(() => true);
    known.set(slug, asked);
    return asked;
  };
  return {
    ...api,
    async getBoard(slug, options) {
      if (!(await has(slug))) throw refusal(404, "not_found", "No such board.");
      return api.getBoard(slug, options);
    },
    async createBoard(title, slug) {
      const created = await api.createBoard(title, slug);
      known.set(created.slug, Promise.resolve(true));
      return created;
    },
  };
}
