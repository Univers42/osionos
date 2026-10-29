/**
 * A panel of agents: one question, then each next agent is asked what it
 * would add or challenge, one after the other.
 *
 * Pure logic, no React: the turns are data, and the runner takes the `send`
 * it is given, so the sequence is tested without a service.
 *
 * Caveat: a turn is "done" when the send says so; a run the service ended
 * without a terminal frame counts as done, like any answer. The panel never
 * retries: the first failed or cancelled turn ends it.
 */

import type { AgentSummary } from "@/features/ai/model/aiAgents";

/** The fewest and the most agents of a panel. */
export const PANEL_MIN = 2;
export const PANEL_MAX = 3;

export interface PanelTurn {
  text: string;
  agentId: string;
}

/** The sentence that asks a next agent to join in. */
export function challengeText(agentName: string): string {
  return `${agentName}, what would you add or challenge?`;
}

/**
 * The turns of a panel, in order: the first agent answers the user's text, each
 * next one is asked the sentence above. Agents past the maximum are dropped.
 */
export function panelTurns(agents: readonly AgentSummary[], firstText: string): PanelTurn[] {
  return agents.slice(0, PANEL_MAX).map((agent, index) => ({
    text: index === 0 ? firstText : challengeText(agent.name),
    agentId: agent.id,
  }));
}

/** Adds or removes an agent of the picked ids; a fourth pick is refused. */
export function togglePanelMember(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((one) => one !== id);
  return ids.length >= PANEL_MAX ? [...ids] : [...ids, id];
}

/**
 * Sends the turns in order. `send` resolves true when the run finished well;
 * a false, a throw, or `isCancelled` ends the panel. Returns how many turns ran.
 */
export async function runPanel(
  turns: readonly PanelTurn[],
  send: (turn: PanelTurn, index: number) => Promise<boolean>,
  isCancelled: () => boolean = () => false,
): Promise<number> {
  let ran = 0;
  for (const [index, turn] of turns.entries()) {
    if (isCancelled()) break;
    let ok = false;
    try {
      ok = await send(turn, index);
    } catch {
      ok = false;
    }
    ran += 1;
    if (!ok) break;
  }
  return ran;
}
