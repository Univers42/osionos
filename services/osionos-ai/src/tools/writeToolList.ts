import { config } from '../config.ts';
import { buildPlan } from './builderTools.ts';
import { WRITE_TOOLS } from './writeTools.ts';
import type { AnyWriteTool } from './types.ts';

/**
 * The write tools of THIS deployment: the three page tools, plus `build_plan`
 * only when OSIONOS_AI_BUILDERS is on (devil C163). Every consumer reads the
 * list here; `buildersOn` is a parameter so a test can read both lists.
 */
export function writeTools(buildersOn: boolean = config.buildersEnabled): readonly AnyWriteTool[] {
	return buildersOn ? [...WRITE_TOOLS, buildPlan as AnyWriteTool] : WRITE_TOOLS;
}
