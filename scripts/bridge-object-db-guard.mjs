// A tab that never heard of a database invents a blank one with the same key and pushes it, and the
// upsert is whole-row, so a real database became one empty row (2026-11-02: three databases, 80 rows
// in one, wiped at 13:24:02 UTC by a tab hydrated before they existed, realtime being down on beta).
// The bridge refuses that write, so a browser still running an old bundle cannot do it either.
// Caveat: "pristine" is the exact shape of the client's starter: one empty row called <key>-row-1 and
// one title column. A person who reduces a database to exactly that gets a refusal instead of a save;
// a tab that typed into the blank row is no longer pristine and is not caught.

const blank = (value) => value === '' || value === null || value === undefined;

function isPristinePlaceholder(dbKey, state) {
	const pages = Object.entries(state?.pages ?? {});
	if (pages.length > 1) return false;
	const [entry] = pages;
	if (entry) {
		const [id, page] = entry;
		if (id !== `${dbKey}-row-1` || (page.content?.length ?? 0) > 0) return false;
		if (!Object.values(page.properties ?? {}).every(blank)) return false;
	}
	return Object.keys(state?.databases?.[dbKey]?.properties ?? {}).length <= 1;
}

/** True when writing `incoming` would replace a database that holds real content with a blank one. */
export function wouldBlankDatabase(dbKey, incoming, stored) {
	return Boolean(stored) && isPristinePlaceholder(dbKey, incoming) && !isPristinePlaceholder(dbKey, stored);
}
