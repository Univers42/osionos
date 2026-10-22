import { findBuiltinSkill } from '../skills/builtins.ts';
import { READ_TOOLS } from '../tools/readTools.ts';
import { WRITE_TOOLS } from '../tools/writeTools.ts';

/**
 * The built-in agents: three shapes of the one assistant.
 *
 * An agent is CONFIGURATION over the one runtime, not a service: `{ id,
 * version, name, description, instructions, tools[] }`. The runtime is the same
 * for all of them — one loop, one budget, one permission model — and the agent
 * only says what the model is told and which tools it may call.
 *
 * The list is frozen and lives in the code: there is no table behind it in
 * P5a. The user-authored agents are P5a-2, and they are the owner's alone.
 *
 * `general` is NOT an agent: no agent means the general assistant, and its
 * prompt is the one of today, byte for byte.
 */

/** An agent, as the configuration of a run. */
export interface BuiltinAgent {
	/** The id of the agent: the shape the column of the run accepts. */
	id: string;
	/** The version of the instructions — pinned on the run (devil C40). */
	version: number;
	/** The name the reader sees, and the name the prompt carries. */
	name: string;
	/** One line: what the agent is for. */
	description: string;
	/** What the model is told, under the name of the agent. */
	instructions: string;
	/** The tools the agent may call: a subset of what the runtime offers. */
	tools: readonly string[];
	/** The ids of the built-in skills the agent may load with `load_skill`. */
	skills: readonly string[];
}

/**
 * The most characters the instructions of an agent may take.
 *
 * The prefix of the prompt is what every call of a run pays for: the agent's
 * text is in the cached prefix, and a long one is a long prefill on every
 * step (devil C47). A thousand five hundred characters is a page, and a page
 * of instructions is a skill, not an agent (P5b).
 */
export const AGENT_INSTRUCTIONS_MAX = 1500;

/**
 * The names of the read tools of the runtime, and of the write tools.
 *
 * They are read from the registry, never retyped: an agent that names a tool
 * that does not exist is a run that fails at the first call, and a name that
 * drifts from the registry is a tool the agent believes it has and does not.
 */
export const READ_TOOL_NAMES: readonly string[] = Object.freeze(READ_TOOLS.map((tool) => tool.name));
export const WRITE_TOOL_NAMES: readonly string[] = Object.freeze(WRITE_TOOLS.map((tool) => tool.name));

/** The ids of the built-ins: the wire contract of `agentId`. */
export const BUILTIN_AGENT_IDS = ['db-architect', 'doc-writer', 'analyst'] as const;

/** The id of a built-in agent. */
export type BuiltinAgentId = (typeof BUILTIN_AGENT_IDS)[number];

/** The instructions of the Database architect. */
const DB_ARCHITECT = `You are the Database architect.

How you work:
- Start from the access pattern: the queries the app runs, how often, and what they filter. When the question does not say, ask for the access pattern before you propose a schema.
- Design for the normal forms: atomic columns (1NF), no partial dependency on a composite key (2NF), no transitive dependency (3NF). Say which form a table breaks, and what the trade buys.
- Choose the keys: a surrogate key for the row, a UNIQUE constraint for the business identity, a foreign key for every reference, and the index that backs each foreign key.
- Name the constraints: NOT NULL, UNIQUE, CHECK, and the DEFAULT that belongs to the domain.
- Say what the transaction must guarantee: atomicity, consistency, isolation, durability — and the isolation level the workload needs (read committed, repeatable read, serializable) with the trade it costs: blocked writers, retries, anomalies.
- Index for the stated queries, and only for those: the columns of the WHERE, the join key, the ORDER BY. Say which query each index serves.
- Write the DDL: CREATE TABLE with its constraints, its foreign keys, and its indexes. Postgres syntax.

How you answer:
- The tables first: the columns, their types, their nullability, their keys. Then the DDL. Then the indexes, each with the query it serves. Then the isolation level and its trade-off.
- Short sentences, no preamble, no sign-off. Ask one question when the access pattern is missing.`;

/** The instructions of the Doc writer. */
const DOC_WRITER = `You are the Doc writer.

You write documentation for a human who is trying to do one thing.

How you write:
- A heading names the task, not the topic: "Connect your calendar", not "Connections". The reader scans the headings before reading a word.
- One idea per paragraph, one sentence per idea when the sentence can be short. The short sentence wins.
- Say what the reader does, then what happens, then what to do when it fails.
- Show the example: the command, the request, the code. An example beats a description of an example.
- Cut the filler: "simply", "just", "in order to", "it is important to note that", "please note". Say the thing once.
- Second person ("you connect the calendar"), present tense, active voice.
- Keep the names of the product exact: the button, the field, the setting, as the interface writes them.
- Never invent a fact. When the source does not say, say what is missing instead of guessing.

The page you write goes through the write tools: you propose the edit, and the user approves it. Never say the page is changed before the approval.`;

/** The instructions of the Analyst. */
const ANALYST = `You are the Analyst.

You answer with what the workspace holds: its pages, and the databases it carries.

How you answer:
- Look first: search the workspace, then read the pages that answer the question, before you write a word.
- Every number carries its source: the page, the table, the column, and the date it was taken. "412 pages, as of 2026-10-21", not "about 400".
- The number comes before the story: the figure, then what it means, then what it does not mean.
- Say what the data cannot tell: the missing pages, the sample that is not representative, the period it does not cover, the definition that is ambiguous. A number without its limit is a claim, not a measurement.
- Compare only what is comparable: the same period, the same definition, the same population.
- Never invent a number, a row or a trend. When the workspace does not hold the data, say so and say what would be needed.`;

/**
 * The built-in agents, in the order the client lists them.
 *
 * The read agents carry the read tools only: an agent never gains a tool the
 * runtime does not offer, and the write tools stay behind the approval of the
 * user. The Doc writer may propose a page edit, so it carries them — and the
 * approval is the one of every other write.
 */
export const BUILTIN_AGENTS: readonly BuiltinAgent[] = Object.freeze([
	Object.freeze({
		id: 'db-architect',
		version: 1,
		name: 'Database architect',
		description: 'Schema design, keys, isolation and indexes — answers with tables and DDL.',
		instructions: DB_ARCHITECT,
		tools: READ_TOOL_NAMES,
		skills: Object.freeze(['schema-design', 'acid-review']),
	}),
	Object.freeze({
		id: 'doc-writer',
		version: 1,
		name: 'Doc writer',
		description: 'Concise documentation for humans: task-first headings, short sentences, examples.',
		instructions: DOC_WRITER,
		tools: Object.freeze([...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]),
		skills: Object.freeze(['concise-docs']),
	}),
	Object.freeze({
		id: 'analyst',
		version: 1,
		name: 'Analyst',
		description: 'Answers from the pages and the databases of the workspace, with the numbers and their source.',
		instructions: ANALYST,
		tools: READ_TOOL_NAMES,
		skills: Object.freeze(['data-summary']),
	}),
]);

// An agent that names a skill the code does not have would index a skill
// `load_skill` cannot load: fail at import, not in a run.
for (const agent of BUILTIN_AGENTS) {
	for (const id of agent.skills) {
		if (!findBuiltinSkill(id)) throw new Error(`agent ${agent.id} names an unknown skill: ${id}`);
	}
}

/** The agent of that id, or null when there is none. */
export function findBuiltinAgent(id: string): BuiltinAgent | null {
	return BUILTIN_AGENTS.find((agent) => agent.id === id) ?? null;
}

/**
 * The agent of the list, as the client sees it: the id, the version, the name
 * and the description.
 *
 * The instructions are NOT here: they are the text of the server's prompt,
 * and the client has no business holding them.
 */
export interface ListedAgent {
	id: string;
	version: number;
	name: string;
	description: string;
}

/** The built-ins, without their instructions. */
export function listedAgents(): ListedAgent[] {
	return BUILTIN_AGENTS.map((agent) => ({
		id: agent.id,
		version: agent.version,
		name: agent.name,
		description: agent.description,
	}));
}
