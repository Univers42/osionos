import { normalizeComboString } from "./combo";
import { whenPredicates } from "./whenPredicates";
import type { Automation, CommandContext } from "./types";

/**
 * The keyboard-automation "planner": the first enabled keyboard automation whose
 * combo matches and whose `when` predicate holds. Pure — no side effects — so it
 * is unit-testable across all default automations.
 */
export function matchAutomation(
  automations: readonly Automation[],
  combo: string,
  ctx: CommandContext,
): Automation | null {
  for (const automation of automations) {
    if (!automation.enabled || automation.trigger.type !== "keyboard") continue;
    if (normalizeComboString(automation.trigger.combo) !== combo) continue;
    if (!whenPredicates[automation.trigger.when](ctx)) continue;
    return automation;
  }
  return null;
}
