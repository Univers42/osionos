/** One of the assistant's neighbours of a page. */
interface RelatedLike {
  linked?: boolean;
}

/**
 * Splits a page's neighbours into the ones it already links and the ones it could.
 * Each page lands in one row: the two header rows used to repeat the same list (#261).
 */
export function splitRelatedPages<T extends RelatedLike>(pages: readonly T[]): { related: T[]; suggestions: T[] } {
  return {
    related: pages.filter((page) => page.linked),
    suggestions: pages.filter((page) => !page.linked),
  };
}
