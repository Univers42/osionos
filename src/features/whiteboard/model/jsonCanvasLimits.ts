/**
 * The ceilings of a JSON Canvas document.
 */
/** A `.canvas` file over this is refused before it is read. */
export const MAX_CANVAS_FILE_BYTES = 5 * 1024 * 1024;

/** How far a node may sit from the origin, and how large it may be. A canvas that
 *  reaches further is refused rather than drawn: the numbers below are the board's
 *  own drawing range, and a node outside it would land nowhere the reader can see. */
export const MAX_CANVAS_COORDINATE = 1_000_000;
export const MAX_CANVAS_SIZE = 100_000;

/** The longest id a canvas node may carry. Longer than the board's own limit, so a
 *  canvas written by another tool still reads — the id is derived when it does not
 *  fit the contract. */
export const MAX_CANVAS_ID_LENGTH = 1_024;

/** The longest path or address a canvas node may carry. */
export const MAX_CANVAS_PATH_LENGTH = 2_048;

/** The longest `type` or `backgroundStyle` word a node may carry: the format defines
 *  a handful of short words, so anything longer is not one. */
export const MAX_CANVAS_KEYWORD_LENGTH = 64;
