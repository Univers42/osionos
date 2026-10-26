/**
 * A research run on a message: its progress card, and the page it can become.
 *
 * The service streams `research.plan {queries}` once and `research.progress
 * {step, maxSteps, searches, fetches, phase}` once per step (C412). The client
 * keeps ONE research part on the message and folds each frame into it, so the
 * card shows where the run stands, not a log of every step: the Activity tab
 * keeps the per-tool rows.
 *
 * "Save as page" (C409–C411) turns a finished report into blocks: the report
 * through the same markdown-to-blocks path as a paste, then a Sources list of
 * the run's own citations. Images are cut before parsing — a report never
 * embeds a remote image (C361, C410) — and a `[n]` with no source stays the
 * plain text it was.
 *
 * Pure logic, no React and no store: the card is ui/ResearchCard.tsx, the save
 * is saveResearchPage.ts.
 */

import type { ChatMessagePart } from "./chatTypes";
import type { Citation } from "./citations";

export type ResearchPhase = "plan" | "search" | "read" | "write";

export interface ResearchPart {
  type: "research";
  step: number;
  maxSteps: number;
  searches: number;
  fetches: number;
  phase: ResearchPhase;
  /** The searches the first step planned: at most eight, plain text. */
  queries: string[];
}

/** What one frame changes on the part. */
export type ResearchFrame = Partial<Omit<ResearchPart, "type">>;

const PHASES: readonly ResearchPhase[] = ["plan", "search", "read", "write"];
const PLAN_QUERIES = 8;

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

/** A `research.progress` frame, or null when it is not one the card can show. */
export function researchProgressFromEvent(data: Record<string, unknown>): ResearchFrame | null {
  const step = count(data.step);
  const maxSteps = count(data.maxSteps);
  const phase = PHASES.find((known) => known === data.phase);
  if (step === undefined || maxSteps === undefined || maxSteps === 0 || !phase) return null;
  return { step: Math.min(step, maxSteps), maxSteps, searches: count(data.searches) ?? 0, fetches: count(data.fetches) ?? 0, phase };
}

/** A `research.plan` frame: its queries, as plain strings. */
export function researchPlanFromEvent(data: Record<string, unknown>): ResearchFrame | null {
  if (!Array.isArray(data.queries)) return null;
  const queries = data.queries.filter((query): query is string => typeof query === "string" && query.trim() !== "");
  return queries.length > 0 ? { queries: queries.slice(0, PLAN_QUERIES) } : null;
}

const EMPTY: ResearchPart = { type: "research", step: 0, maxSteps: 0, searches: 0, fetches: 0, phase: "plan", queries: [] };

/** The parts with the frame folded into their one research part. */
export function withResearch(parts: ChatMessagePart[], frame: ResearchFrame): ChatMessagePart[] {
  const index = parts.findIndex((part) => part.type === "research");
  if (index === -1) return [...parts, { ...EMPTY, ...frame }];
  const next = [...parts];
  next[index] = { ...(parts[index] as ResearchPart), ...frame };
  return next;
}

export function researchFromParts(parts: ChatMessagePart[] | undefined): ResearchPart | null {
  return (parts?.find((part) => part.type === "research") as ResearchPart | undefined) ?? null;
}

const PHASE_WORDS: Record<ResearchPhase, string> = {
  plan: "Planning the searches",
  search: "Searching the web",
  read: "Reading pages",
  write: "Writing the report",
};

/** The card's line: the phase, then what was done, in counts only. */
export function researchLine(part: ResearchPart, finished: boolean): string {
  const done = `${part.searches} ${part.searches === 1 ? "search" : "searches"}, ${part.fetches} ${part.fetches === 1 ? "page" : "pages"} read`;
  if (finished) return `Research done · ${done}`;
  const step = part.maxSteps > 0 ? ` · step ${part.step} of ${part.maxSteps}` : "";
  return `${PHASE_WORDS[part.phase]}${step} · ${done}`;
}

/**
 * The report without any image: `![alt](url)` and `![alt][ref]` become their
 * alt text, an `<img>` tag goes.
 *
 * Caveat: an image URL holding `)` is cut at the first one, so its tail stays
 * as text — the image itself never survives, which is the direction that
 * matters. An image the parser learns in a new syntax would pass; the canvas
 * test pins the two syntaxes the engine has today.
 */
export function withoutImages(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<img\b[^>]*>/gi, "");
}

const label = (text: string): string => text.replace(/[[\]]/g, "").trim() || "Untitled";
const URL_ESCAPES: Record<string, string> = { "(": "%28", ")": "%29", " ": "%20" };
/** A URL that cannot end a markdown link early: `(`, `)` and blanks are escaped. */
const href = (url: string): string => url.replace(/[()\s]/g, (char) => URL_ESCAPES[char] ?? encodeURIComponent(char));

/** One line of the Sources list: a web source links out, the others are named. */
function sourceLine(citation: Citation): string {
  if (citation.collection === "web" && /^https?:\/\//i.test(citation.url)) {
    return `- (${citation.n}) [${label(citation.title)}](${href(citation.url)}) — ${citation.domain}`;
  }
  return `- (${citation.n}) ${label(citation.title)}`;
}

/** The page's markdown: the report, then the run's sources, each once. */
export function researchPageMarkdown(report: string, citations: Citation[]): string {
  const seen = new Set<number>();
  const sources = citations.filter((citation) => !seen.has(citation.n) && seen.add(citation.n));
  const body = withoutImages(report).trim();
  if (sources.length === 0) return body;
  return `${body}\n\n## Sources\n\n${sources.map(sourceLine).join("\n")}`;
}

const TITLE_CHARS = 80;

/**
 * The page a report becomes: its title is the report's own leading `# heading`
 * (cut from the body, so it is not said twice), else the question, else a
 * plain name; the body is the report and its sources.
 */
export function researchPage(
  report: string,
  question: string | null,
  citations: Citation[],
): { title: string; markdown: string } {
  const [first = "", ...rest] = report.trimStart().split("\n");
  const heading = /^#\s+(.+)$/.exec(first)?.[1]?.trim();
  if (heading) return { title: heading.slice(0, TITLE_CHARS), markdown: researchPageMarkdown(rest.join("\n"), citations) };
  const asked = question?.replace(/\s+/g, " ").trim();
  const title = asked ? `Research: ${asked}`.slice(0, TITLE_CHARS) : "Research report";
  return { title, markdown: researchPageMarkdown(report, citations) };
}

/**
 * After a resume that missed frames (`resume.gap`, C402), the answer's text is
 * the transcript's: the text of the assistant message of the same run.
 */
export function textAfterGap(
  runId: string,
  transcript: ReadonlyArray<{ runId: string; role: string; text: string }>,
): string | null {
  const row = transcript.find((message) => message.runId === runId && message.role === "assistant");
  return row ? row.text : null;
}
