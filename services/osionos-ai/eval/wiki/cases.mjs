/* ************************************************************************** */
/*                                                                            */
/*   cases.mjs                          the cases of the tests of the import   */
/*                                                                            */
/*   The articles the tests write, and the strings that break a SQL literal.  */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/* ************************************************************************** */

import { MIN_ARTICLE_CHARS, VISIBILITY, WORKSPACE_ID, WORKSPACE_NAME, WORKSPACE_SLUG } from "./pages.mjs";

/** The owner of the workspace of the tests. */
export const OWNER_ID = "11111111-1111-4111-8111-111111111111";

/** The options of a batch: the workspace, the owner, the lane. */
export const OPTIONS = {
	ownerId: OWNER_ID,
	workspaceId: WORKSPACE_ID,
	workspaceName: WORKSPACE_NAME,
	workspaceSlug: WORKSPACE_SLUG,
	visibility: VISIBILITY,
	bulkLane: 1,
	createdAt: "2026-01-05T09:00:00Z",
};

/**
 * The nasty strings of the quoting.
 *
 * A property test would be nicer, but fast-check is not installed: these are
 * hand-picked, and every one of them must survive a round trip in the
 * database. A NUL byte is NOT in the list: a Postgres text cannot hold one.
 */
export const NASTY = [
	"it's",
	"'",
	"''",
	"'''",
	'"double"',
	"$j$",
	"$j$ and $j$ again",
	"$BODY$",
	"$$",
	"$tag$ $other$",
	"back\\slash",
	"C:\\path\\to\\file",
	"trailing backslash\\",
	"line\nbreak",
	"carriage\r\nreturn",
	"tab\there",
	"semi;colon",
	"-- a comment",
	"/* a block */",
	"BEGIN; DROP TABLE public.osionos_pages; --",
	"100% of $money",
	"${template}",
	"back`tick`",
	"emoji 🌍 and accents éàü",
	"日本語のタイトル",
	"  padded  ",
	"a".repeat(300),
	"quote's inside a \"double\"",
];

/** An article: a title, a url and the sections it has. */
export function article(title, paragraphs = ["A paragraph of the article."], heading = "") {
	return {
		title,
		url: `https://simple.wikipedia.org/wiki/${encodeURIComponent(title)}`,
		revision: "b04c8d1ceb2f5cd4588862100d08de323dccfbaa",
		sections: [{ heading, level: 2, paragraphs }],
	};
}

/** An article that is long enough to be imported. */
export function longArticle(title) {
	return article(title, ["A".repeat(MIN_ARTICLE_CHARS + 10)], "History");
}
