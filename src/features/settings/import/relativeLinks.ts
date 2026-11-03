/**
 * Relative Markdown links between the files of one imported archive, turned into page links
 * (#239). The Markdown parser keeps a link's text and drops its target, so the rewrite runs on
 * the source before parsing: `[Setup](../guide/setup.md#run)` becomes `[[page:<id>]]` when
 * `guide/setup.md` was imported as a page.
 *
 * Caveat: inline links only. A reference-style link (`[x][ref]` with `[ref]: a.md` below) and
 * a link inside a code span or fence are not rewritten and keep today's behaviour (the text
 * stays, the target is lost). The link text is replaced by the page mention, which shows the
 * target page's title.
 */

const INLINE_LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** `href` resolved against the folder `fromDir`, as a `/`-joined archive path; null for a link that leaves the archive. */
export function archivePathOf(fromDir: readonly string[], href: string): string | null {
  const target = href.split(/[?#]/)[0];
  if (target === '' || SCHEME.test(target) || target.startsWith('/') || target.startsWith('//')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  const parts = [...fromDir];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join('/');
}

/** `markdown` with each inline link to an imported page replaced by its page mention. */
export function linkImportedPages(markdown: string, fromDir: readonly string[], pageIdByPath: ReadonlyMap<string, string>): string {
  return markdown.replace(INLINE_LINK, (whole, bang: string, _text: string, href: string) => {
    if (bang) return whole;
    const path = archivePathOf(fromDir, href);
    const pageId = path === null ? undefined : pageIdByPath.get(path);
    return pageId ? `[[page:${pageId}]]` : whole;
  });
}
