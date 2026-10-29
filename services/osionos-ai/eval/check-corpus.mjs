/* ************************************************************************** */
/*                                                                            */
/*   check-corpus.mjs                        the corpus half of the gate      */
/*                                                                            */
/*   The corpus of the golden set: forty pages, the mix of the brief, the    */
/*   front matter of every page, and the shape of its blocks.                 */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { isFrench } from "./text.mjs";
import { fail, pages } from "./check-lib.mjs";

const EXPECTED_PAGES = 40;
const EXPECTED_ARCHIVED = 2;
const EXPECTED_MIX = { sales: 12, meetings: 8, hr: 6, specs: 6, runbooks: 4, french: 4 };
const FRONT_MATTER_KEYS = ["title", "visibility", "owner", "collaborators", "archived"];
const VISIBILITIES = new Set(["private", "shared", "public"]);
const LIST_TYPES = new Set(["bulleted_list", "numbered_list", "to_do"]);
const MIN_WORDS = 300;
const MAX_WORDS = 1200;

/** The mix of the corpus: the pages of each family, and the French ones. */
export const mix = { sales: 0, meetings: 0, hr: 0, specs: 0, runbooks: 0, french: 0 };

/** The pages that carry a table. */
export const withTable = pages.filter((page) => page.blocks.some((block) => block.type === "table_block"));

/** The archived pages. */
export const archived = pages.filter((page) => page.archived);

/** The rules of the corpus. */
export function checkCorpus() {
	if (pages.length !== EXPECTED_PAGES) {
		fail(`corpus: ${pages.length} pages, expected ${EXPECTED_PAGES}`);
	}
	if (archived.length !== EXPECTED_ARCHIVED) {
		fail(`corpus: ${archived.length} archived pages, expected ${EXPECTED_ARCHIVED}`);
	}
	if (withTable.length < 8) {
		fail(`corpus: only ${withTable.length} pages carry a table, expected at least 8`);
	}

	for (const page of pages) {
		if (page.slug.startsWith("deal-") || page.slug.startsWith("sales-")) mix.sales += 1;
		else if (page.slug.startsWith("meeting-")) mix.meetings += 1;
		else if (page.slug.startsWith("hr-")) mix.hr += 1;
		else if (page.slug.startsWith("spec-")) mix.specs += 1;
		else if (page.slug.startsWith("runbook-")) mix.runbooks += 1;
		if (isFrench(page.text)) mix.french += 1;
	}
	for (const [key, expected] of Object.entries(EXPECTED_MIX)) {
		if (mix[key] !== expected) fail(`corpus mix: ${key} is ${mix[key]}, expected ${expected}`);
	}

	for (const page of pages) {
		const keys = Object.keys(page.meta);
		for (const key of FRONT_MATTER_KEYS) {
			if (!keys.includes(key)) fail(`${page.slug}: front matter is missing ${key}`);
		}
		for (const key of keys) {
			if (!FRONT_MATTER_KEYS.includes(key)) fail(`${page.slug}: front matter has an extra key ${key}`);
		}
		if (!VISIBILITIES.has(page.meta.visibility)) {
			fail(`${page.slug}: visibility ${page.meta.visibility} is not private, shared or public`);
		}
		if (!["u_ana", "u_ben", "u_chloe"].includes(page.meta.owner)) {
			fail(`${page.slug}: owner ${page.meta.owner} is not one of the three users`);
		}
		for (const entry of page.meta.collaborators ?? []) {
			if (!["u_ana", "u_ben", "u_chloe"].includes(entry.user)) {
				fail(`${page.slug}: collaborator ${entry.user} is not one of the three users`);
			}
			if (!entry.role) fail(`${page.slug}: collaborator ${entry.user} has no role`);
		}
		if (page.meta.archived !== true && page.meta.archived !== false) {
			fail(`${page.slug}: archived is not true or false`);
		}

		const words = page.text.split(/\s+/).filter(Boolean).length;
		if (words < MIN_WORDS || words > MAX_WORDS) {
			fail(`${page.slug}: ${words} words, expected ${MIN_WORDS}-${MAX_WORDS}`);
		}
		const types = page.blocks.map((block) => block.type);
		if (!types.includes("heading_2")) fail(`${page.slug}: no H2 heading`);
		if (!types.includes("heading_3")) fail(`${page.slug}: no H3 heading`);
		if (!types.some((type) => LIST_TYPES.has(type))) fail(`${page.slug}: no list`);
	}
}
