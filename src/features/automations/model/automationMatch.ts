import { comboSteps } from "./combo";
import { whenPredicates } from "./whenPredicates";
import type { Automation, CommandContext } from "./types";

/**
 * The keyboard-automation "planner": the first enabled keyboard automation whose
 * combo matches and whose `when` predicate holds. Pure — no side effects — so it
 * is unit-testable across all default automations.
 *
 * Chords (VSCode style) are space-separated steps: "mod+k mod+z". Pass the
 * already-pressed first step as `pending` to resolve step 2; omit it to match a
 * plain single-step binding. A single-step binding never matches a chord and
 * vice-versa, so the two coexist.
 */
export function matchAutomation(
  automations: readonly Automation[],
  combo: string,
  ctx: CommandContext,
  pending: string | null = null,
): Automation | null {
  const want = pending ? [pending, combo] : [combo];
  for (const automation of automations) {
    if (!automation.enabled || automation.trigger.type !== "keyboard") continue;
    const steps = comboSteps(automation.trigger.combo);
    if (steps.length !== want.length) continue;
    if (!steps.every((step, index) => step === want[index])) continue;
    if (!whenPredicates[automation.trigger.when](ctx)) continue;
    return automation;
  }
  return null;
}

/** True when `combo` is the FIRST step of some enabled multi-step (chord) binding
 *  — i.e. arm the chord and wait for the next key. */
export function isChordPrefix(
  automations: readonly Automation[],
  combo: string,
  ctx: CommandContext,
): boolean {
  return automations.some((automation) => {
    if (!automation.enabled || automation.trigger.type !== "keyboard") return false;
    const steps = comboSteps(automation.trigger.combo);
    return steps.length > 1 && steps[0] === combo && whenPredicates[automation.trigger.when](ctx);
  });
}
