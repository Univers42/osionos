/* ************************************************************************** */
/*                                                                            */
/*   check-lib.mjs                             the shared ground of the gate  */
/*                                                                            */
/*   The corpus, the questions, and the three helpers both halves of the     */
/*   gate need: the row shape the bridge reads, the read rule of a member,   */
/*   and the pages a term appears in.                                         */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { canReadPageRowAsMember } from "../../../scripts/bridge-page-read.mjs";
import { USER_IDS, WORKSPACE_ID, pageId, readCorpus, readGolden } from "./lib.mjs";

/** The problems the gate found. */
export const failures = [];

/** A problem of the gate. */
export const fail = (message) => failures.push(message);

/** The corpus of the golden set. */
export const pages = readCorpus();

/** The questions of the golden set. */
export const questions = readGolden();

/** The corpus, by slug. */
export const bySlug = new Map(pages.map((page) => [page.slug, page]));

/**
 * The marker of a question id: which page answers it, and with which
 * sentence. A question id may be marked in several pages (a question with
 * two answers), and a marker may carry several ids.
 */
export const markersById = new Map();
for (const page of pages) {
	for (const marker of page.markers) {
		for (const id of marker.ids) {
			if (!markersById.has(id)) markersById.set(id, []);
			markersById.get(id).push({ page, marker });
		}
	}
}

/** The row shape the bridge reads: owner, visibility, collaborators. */
export function pageRow(page) {
	return {
		id: pageId(page.slug),
		workspace_id: WORKSPACE_ID,
		owner_id: USER_IDS[page.meta.owner],
		visibility: page.meta.visibility,
		collaborators: (page.meta.collaborators ?? []).map((entry) => ({
			userId: USER_IDS[entry.user],
			role: entry.role,
		})),
		archived_at: page.archived ? "2026-01-05T09:00:00Z" : null,
	};
}

/**
 * Can this member read the page? The bridge's rule for a workspace member,
 * plus the retrieval rule: an archived page has no chunks in the index, so it
 * answers nothing to anybody.
 */
export function canRead(page, asker) {
	if (page.archived) return false;
	return canReadPageRowAsMember(pageRow(page), USER_IDS[asker], [WORKSPACE_ID]);
}

/** The pages a term appears in, case insensitively. */
export function pagesWithTerm(term) {
	const needle = term.toLowerCase();
	return pages.filter((page) => page.text.toLowerCase().includes(needle)).map((page) => page.slug);
}

/**
 * The words of a text that the 'simple' dictionary of the index would keep:
 * the tokens of three letters and more. The lexical half of the search is a
 * tsquery over those tokens, so a word of the question that is one of them
 * gives the lexical half a way into the page.
 */
export function tokens(text) {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-zà-öø-ÿ0-9]+/)
			.filter((token) => token.length >= 3),
	);
}
