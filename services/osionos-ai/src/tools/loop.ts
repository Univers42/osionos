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
