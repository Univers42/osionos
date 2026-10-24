/**
 * The bounds of the tool loop.
 *
 * They live alone, in a module with no import: the prompt reads them to
 * reserve the money of a run, the pump reads them to stop the loop, and the
 * tools read them to number the sources. A module with no import cannot be
 * part of a cycle.
 */

/**
 * The steps a run may take.
 *
 * A step is one call of the model. The model may call a tool, and the answer
 * comes after the tool: that is two steps, and the tools may be called again.
 * Five is the ceiling of the loop.
 */
export const MAX_STEPS = 5;

/**
 * The characters one step of tools may add to the context of a run.
 *
 * The reservation of a run is the cost of the whole loop, so it needs the
 * ceiling of what the tools put in the prompt of a step.
 */
export const TOOL_OUTPUT_CHARS = 20_000;

/**
 * The characters the tools of a run may put in its context, all together.
 *
 * The outputs of the tools accumulate: the prompt of the last step holds
 * every one of them, and a step may call several tools at once. The pool is
 * the ceiling of what they may hold, and it is what the reservation counts:
 * every step of the loop holds the prompt, the pool and the definitions of
 * the tools, and nothing more.
 *
 * The pool holds the outputs of the steps before the last one: the output of
 * the last step is the answer, and the answer never enters a prompt.
 */
export const TOOL_POOL_CHARS = (MAX_STEPS - 1) * TOOL_OUTPUT_CHARS;
