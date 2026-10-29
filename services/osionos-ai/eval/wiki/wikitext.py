"""wikitext.py — the text of Wikipedia: the sections of an article.

Two shapes of source, one shape of output:

  - the parquet of the Hugging Face mirror holds PLAIN text: the paragraphs
    are separated by a blank line, and a heading is a short line of its own.
    The heading is found by its shape, and its level is guessed: the first
    heading of an article opens a section, and a heading that follows a
    heading without a paragraph between them opens a subsection;
  - the dump of dumps.wikimedia.org holds WIKITEXT: the levels of the headings
    are written down, and mwparserfromhell takes the markup away.

Both give the same list of sections: a heading, a level, and the paragraphs
under it. The lead of the article is the section with an empty heading.

Pure: no file, no clock, no network.
"""

import re

# A heading is a short line: the headings of Wikipedia are short, and a long
# line is prose.
HEADING_MAX_CHARS = 60
HEADING_MAX_WORDS = 12
# A sentence ends with one of these: a heading does not.
HEADING_END_PUNCTUATION = (".", "!", "?", ",", ";", ":")
# The footer of the articles of the mirror: "Basic English 850 words".
BASIC_ENGLISH_FOOTER = re.compile(r"^Basic English \d+ words$")
# The heading of a wikitext line: "== History ==" and its deeper levels.
HEADING_LINE = re.compile(r"^\s*(={2,6})\s*(.+?)\s*\1\s*$")
# A paragraph of the plain text: a blank line ends one.
PARAGRAPH_BREAK = re.compile(r"\n\s*\n")


def _is_heading(text):
    """Whether a line of the plain text is the heading of a section."""
    line = text.strip()
    if not line or len(line) > HEADING_MAX_CHARS:
        return False
    if len(line.split()) > HEADING_MAX_WORDS:
        return False
    if line.endswith(HEADING_END_PUNCTUATION):
        return False
    if line[0] in "-*#:":
        return False
    # A heading starts with a capital, or it is a single word ("iPhone").
    if not (line[0].isupper() or line[0].isdigit() or " " not in line):
        return False
    return True


def _paragraphs(text):
    """The paragraphs of a plain text."""
    return [block for block in PARAGRAPH_BREAK.split(text) if block.strip()]


def _one_paragraph(text):
    """The text of a paragraph: the lines of a wrapped paragraph joined."""
    return " ".join(line.strip() for line in text.split("\n") if line.strip())


def _open_section(sections, current, heading):
    """A new section: a subsection when the one before it is still empty."""
    level = 3 if len(sections) > 1 and not current["paragraphs"] else 2
    section = {"heading": heading, "level": level, "paragraphs": []}
    sections.append(section)
    return section


def plain_sections(text):
    """The sections of an article of the mirror: the plain text.

    Only the FIRST line of a paragraph can be a heading: the converter of the
    mirror puts a blank line before a heading and keeps the text of the
    section on the lines that follow. The other lines of a paragraph are the
    text of the section, even when they look like a heading: a list of links
    ("Art history", "Modern art") is a list, not a tree of sections.
    """
    sections = []
    current = {"heading": "", "level": 2, "paragraphs": []}
    sections.append(current)
    for paragraph in _paragraphs(text):
        lines = paragraph.split("\n")
        head = lines[0].strip()
        if not _is_heading(head):
            body = _one_paragraph(paragraph)
            if body:
                current["paragraphs"].append(body)
            continue
        current = _open_section(sections, current, head)
        body = _one_paragraph("\n".join(lines[1:]))
        if body:
            current["paragraphs"].append(body)
    return sections


def _strip_markup(text):
    """The text of a wikitext paragraph: no template, no markup, no ref."""
    import mwparserfromhell

    without_refs = re.sub(r"<ref[^>]*>.*?</ref>", " ", text, flags=re.DOTALL)
    without_refs = re.sub(r"<ref[^>]*/>", " ", without_refs)
    without_tables = re.sub(r"\{\|.*?\|\}", " ", without_refs, flags=re.DOTALL)
    code = mwparserfromhell.parse(without_tables)
    for template in code.filter_templates(recursive=False):
        template.remove()
    for comment in code.filter_comments():
        comment.remove()
    for link in code.filter_wikilinks():
        link.replace(link.text)
    for tag in code.filter_tags():
        tag.remove()
    plain = code.strip_code()
    plain = re.sub(r"'{2,5}", "", plain)
    return " ".join(plain.split())


def wikitext_sections(text):
    """The sections of an article of the dump: the wikitext."""
    sections = []
    current = {"heading": "", "level": 2, "paragraphs": []}
    sections.append(current)
    buffer = []
    for line in text.split("\n"):
        heading = HEADING_LINE.match(line)
        if heading:
            body = _strip_markup("\n".join(buffer))
            if body:
                current["paragraphs"].append(body)
            buffer = []
            # "==" is a section, "===" is a subsection: the deeper levels of
            # the wikitext are clamped to the two the indexer knows.
            level = min(3, len(heading.group(1)) - 1)
            current = {
                "heading": heading.group(2).strip(),
                "level": level,
                "paragraphs": [],
            }
            sections.append(current)
            continue
        buffer.append(line)
    body = _strip_markup("\n".join(buffer))
    if body:
        current["paragraphs"].append(body)
    return sections


def sections_of(text, wikitext=False):
    """The sections of an article: the wikitext of the dump, the plain text
    of the mirror."""
    if wikitext:
        return wikitext_sections(text)
    return plain_sections(text)
