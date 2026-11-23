/**
 * The size an add_blocks call is measured by: the UTF-8 bytes of its blocks as
 * JSON. One copy, shared by the tool's own limit and the auto coalescer's
 * batch limit, so the two cannot drift apart.
 */
export function blocksBytes(blocks: unknown[]): number {
	return Buffer.byteLength(JSON.stringify(blocks), 'utf8');
}
