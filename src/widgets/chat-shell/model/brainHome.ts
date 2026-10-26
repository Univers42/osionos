import type { Conversation } from "@/features/chat/model/chatTypes";

/** One run of the history rail: the conversations last touched in the same span of days. */
export interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

const DAY_MS = 86_400_000;

// Calendar days, in local time: "Yesterday" is the date before today, not 24 hours ago.
function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnight(now) - midnight(then)) / DAY_MS);
}

const SPANS: ReadonlyArray<{ label: string; upTo: number }> = [
  { label: "Today", upTo: 0 },
  { label: "Yesterday", upTo: 1 },
  { label: "Previous 7 days", upTo: 7 },
  { label: "Previous 30 days", upTo: 30 },
  { label: "Older", upTo: Number.POSITIVE_INFINITY },
];

/** The history, newest first, cut into Today, Yesterday, Previous 7 days… Empty spans are left out. */
export function groupConversations(conversations: readonly Conversation[], now: Date): ConversationGroup[] {
  const newestFirst = [...conversations].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  const groups = SPANS.map((span) => ({ label: span.label, conversations: [] as Conversation[] }));
  for (const conversation of newestFirst) {
    const age = daysAgo(conversation.updatedAt, now);
    const index = SPANS.findIndex((span) => age <= span.upTo);
    groups[index].conversations.push(conversation);
  }
  return groups.filter((group) => group.conversations.length > 0);
}

/** A starter fills the composer: the reader finishes the sentence, then sends it. */
export interface Starter {
  icon: "file-text" | "history" | "search" | "pen-line" | "list-checks" | "layout-template" | "network" | "table";
  title: string;
  prompt: string;
}

export interface StarterGroup {
  label: string;
  starters: readonly Starter[];
}

// Each starter leans on a tool the assistant has today: the open page, the recent pages,
// workspace search, page writes behind approval, the builders and the diagram renderer.
export const STARTER_GROUPS: readonly StarterGroup[] = [
  {
    label: "Find and understand",
    starters: [
      { icon: "file-text", title: "Summarize the open page", prompt: "Summarize the page I have open in five bullet points." },
      { icon: "history", title: "Catch up on this week", prompt: "What changed in my workspace this week? Group it by page." },
      { icon: "search", title: "Find what I wrote", prompt: "Find everything I wrote about " },
    ],
  },
  {
    label: "Create",
    starters: [
      { icon: "pen-line", title: "Draft a page", prompt: "Draft a page from my notes on " },
      { icon: "list-checks", title: "Make a task list", prompt: "Turn this into a task list with owners and due dates: " },
      { icon: "layout-template", title: "Plan a workspace", prompt: "Plan a workspace for " },
    ],
  },
  {
    label: "See the structure",
    starters: [
      { icon: "network", title: "Diagram my databases", prompt: "Draw a diagram of how my databases relate to each other." },
      { icon: "table", title: "Compare in a table", prompt: "Compare these pages in a table: " },
    ],
  },
];

const TINTS = ["blue", "purple", "green", "orange", "pink", "yellow", "red", "brown"] as const;

/** The two tokens an agent is drawn with: the same agent, the same colour, on every device. */
export function agentTint(id: string): { background: string; color: string } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const tint = TINTS[hash % TINTS.length];
  return { background: `var(--osio-block-tint-${tint}-bg)`, color: `var(--osio-block-tint-${tint}-fg)` };
}

/** Up to two letters for an avatar: "Doc writer" gives "DW", "Analyst" gives "A". */
export function agentInitials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]);
  return letters.join("").toUpperCase() || "?";
}
