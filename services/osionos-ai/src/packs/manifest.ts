import { isAbsolute, resolve, sep } from 'node:path';

/**
 * The manifest of a knowledge pack: `pack.json` of `packs/<slug>/`.
 *
 * The manifest points at documents of the repository and COPIES nothing: the
 * `docs` paths are relative to the osionos root, so the pack and the docs a
 * person reads are the same bytes (one source of truth).
 *
 * The checks here are the SQL checks of `ai_packs` and the rules the import
 * relies on: a slug the wire can carry, a title a citation can show, and at
 * least one document, all of them Markdown, inside the root and named once.
 */

/** The shape of a slug: the CHECK of `ai_packs.slug`, to the character. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** The most and the fewest documents of a pack. */
export const MIN_PACK_DOCS = 1;
export const MAX_PACK_DOCS = 200;

/** The bounds of the display text, in characters (not UTF-16 units). */
export const MAX_PACK_TITLE = 120;
export const MAX_PACK_DESCRIPTION = 500;

/** A parsed, valid pack manifest. */
export interface PackManifest {
	slug: string;
	title: string;
	description: string;
	/** The repo-relative paths of the documents, in manifest order. */
	docs: string[];
}

/** The characters of a string, as Postgres counts them. */
function chars(value: string): number {
	return Array.from(value).length;
}

/** The refusal of a manifest: the field is in the message, never the value. */
function invalid(field: string): Error {
	return new Error(`pack_manifest_invalid:${field}`);
}

/** Whether a document path is a plain repository-relative Markdown file. */
function docPathIsValid(path: string, repoRoot: string): boolean {
	if (path.length === 0 || path.startsWith('/') || isAbsolute(path)) return false;
	if (!path.endsWith('.md')) return false;
	const segments = path.split('/');
	if (segments.some((segment) => segment === '..' || segment.length === 0)) return false;
	const root = resolve(repoRoot);
	const target = resolve(root, path);
	return target.startsWith(`${root}${sep}`) && target !== root;
}

/**
 * The manifest, parsed and checked.
 *
 * A violation throws `Error('pack_manifest_invalid:<field>')`: the field names
 * what is wrong, and the message never carries the value (a manifest is text a
 * person wrote, and the error may be logged).
 */
export function parsePackManifest(json: unknown, repoRoot: string): PackManifest {
	if (!json || typeof json !== 'object' || Array.isArray(json)) throw invalid('manifest');
	const raw = json as Record<string, unknown>;

	if (typeof raw.slug !== 'string' || !SLUG.test(raw.slug)) throw invalid('slug');
	if (typeof raw.title !== 'string' || chars(raw.title) < 1 || chars(raw.title) > MAX_PACK_TITLE) {
		throw invalid('title');
	}
	const description = raw.description === undefined ? '' : raw.description;
	if (typeof description !== 'string' || chars(description) > MAX_PACK_DESCRIPTION) {
		throw invalid('description');
	}
	if (!Array.isArray(raw.docs) || raw.docs.length < MIN_PACK_DOCS || raw.docs.length > MAX_PACK_DOCS) {
		throw invalid('docs');
	}

	const seen = new Set<string>();
	const docs: string[] = [];
	for (const doc of raw.docs) {
		if (typeof doc !== 'string' || !docPathIsValid(doc, repoRoot)) throw invalid('docs');
		if (seen.has(doc)) throw invalid('docs');
		seen.add(doc);
		docs.push(doc);
	}

	return { slug: raw.slug, title: raw.title, description, docs };
}
