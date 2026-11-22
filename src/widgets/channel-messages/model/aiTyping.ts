/**
 * Who a channel `typing` frame names, and how the line above the composer
 * reads it (osio-bot OB12). The bridge sends an auto-post run's signal as
 * `{channelId, ai: true}` with no userId and no text, so readers say "osio is
 * answering" and no partial answer reaches the channel.
 */

/** The typer key of osio's signal. A user id is a UUID, so it never has a colon. */
export const AI_TYPER = "ai:osio";

export function typerOf(payload: { readonly ai?: unknown; readonly userId?: unknown }, selfUserId: string): string | null {
  if (payload.ai === true) return AI_TYPER;
  const who = payload.userId;
  return typeof who === "string" && who && who !== selfUserId ? who : null;
}

function peoplePhrase(people: string[], names: Record<string, string>): string {
  const labels = people.map((id) => names[id] ?? "Someone");
  if (labels.length === 1) return `${labels[0]} is typing…`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} are typing…`;
  return "Several people are typing…";
}

export function typingPhrase(typers: string[], names: Record<string, string>): string {
  const people = typers.filter((id) => id !== AI_TYPER);
  const parts = people.length > 0 ? [peoplePhrase(people, names)] : [];
  if (people.length < typers.length) parts.push("osio is answering…");
  return parts.join(" ");
}
