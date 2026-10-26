import { z } from 'zod';
import { checkEndpointUrl } from '../connections/endpointGuard.ts';
import { httpError } from '../http.ts';

/**
 * What a user may send when they register or change a server (C268, C269).
 *
 * Every body is strict: a key the schema does not name is a 400, which is how
 * a `read_only` flag stays unbuildable — there is no field to put it in
 * (C269). The URL and the header are checked again here, in the clear, before
 * anything is sealed or stored.
 */

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const LABEL = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.refine((value) => !CONTROL_OR_FORMAT.test(value));

export const createBodySchema = z
	.object({
		label: LABEL,
		url: z.string().min(1).max(2048),
		headerName: z.string().max(64).optional(),
		headerValue: z.string().max(512).optional(),
	})
	.strict();

export const patchBodySchema = z
	.object({
		label: LABEL.optional(),
		url: z.string().min(1).max(2048).optional(),
		headerName: z.string().max(64).optional(),
		headerValue: z.string().max(512).optional(),
	})
	.strict();

export const toolBodySchema = z.object({ enabled: z.boolean() }).strict();

/** `Authorization`, or `x-` and a short token: no `Host`, no `Cookie`, no `Content-Length`. */
const HEADER_NAME = /^(authorization|x-[a-z0-9-]{1,40})$/i;
/** Printable ASCII only: a CR, an LF or any control character is a header-splitting bug. */
const HEADER_VALUE = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/;
/** A shorter value would be shown whole by its last four characters. */
const MIN_HEADER_VALUE = 8;

export interface Header {
	name: string;
	value: string;
}

/**
 * The URL of a server: https, no credentials, no fragment, no query.
 *
 * The query is refused because it is where a token ends up when a user pastes
 * a link, and the list would then show it (C268, C271).
 */
export function checkServerUrl(raw: string): string {
	if (raw.includes('?')) throw httpError(400, 'endpoint_not_allowed');
	return checkEndpointUrl(raw).toString();
}

/** The header of a body, or null when it carries none; 400 invalid_header otherwise. */
export function parseHeader(name: string | undefined, value: string | undefined, fallbackName = 'Authorization'): Header | null {
	if (name === undefined && value === undefined) return null;
	if (value === undefined) throw httpError(400, 'invalid_header');
	const chosen = name ?? fallbackName;
	if (!HEADER_NAME.test(chosen)) throw httpError(400, 'invalid_header');
	if (value.length < MIN_HEADER_VALUE || !HEADER_VALUE.test(value)) throw httpError(400, 'invalid_header');
	return { name: chosen, value };
}
