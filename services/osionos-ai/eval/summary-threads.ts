/* ************************************************************************** */
/*                                                                            */
/*   summary-threads.ts                 the synthetic threads of context C392 */
/*                                                                            */
/*   Twenty conversations that state three facts in their first turn, then   */
/*   talk about other things long enough that the history window (24 000     */
/*   characters) drops that turn, then ask for the facts. Deterministic: the */
/*   same index gives the same thread, so a re-run measures the same thing.  */
/*                                                                            */
/*   The facts are invented and unguessable (a codename, a budget, a         */
/*   supplier's surname), and the filler never repeats them: a model can     */
/*   only answer from the summary of the dropped turns.                      */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

export interface ThreadMessage {
	id: string;
	role: 'user' | 'assistant';
	text: string;
}

export interface Fact {
	kind: 'codename' | 'budget' | 'contact';
	/** The value as stated in the thread. */
	stated: string;
	/** What an answer must contain, after {@link normalise}, to count as recalled. */
	key: string;
}

export interface Thread {
	index: number;
	messages: ThreadMessage[];
	facts: Fact[];
	question: string;
}

const ADJECTIVES = ['Velvet', 'Copper', 'Silent', 'Amber', 'Hollow', 'Brisk', 'Cobalt', 'Lunar', 'Gilded', 'Tidal'];
const ANIMALS = ['Heron', 'Marten', 'Ibex', 'Lynx', 'Osprey', 'Tapir', 'Wombat', 'Kestrel', 'Narwhal', 'Okapi'];
const FIRST_NAMES = ['Ilse', 'Tobiah', 'Mirela', 'Anouk', 'Casimir', 'Yusra', 'Leif', 'Odalys', 'Barnaby', 'Signe'];
const SURNAMES = [
	'Varhaug', 'Quennell', 'Okafor-Lind', 'Brezovec', 'Tamsalu', 'Iturbide', 'Vasquell', 'Harkavy', 'Dumitrescu', 'Pellerin',
	'Strömqvist', 'Abernathe', 'Kowalczuk', 'Ferriday', 'Nakashima', 'Oyelaran', 'Castellví', 'Ruhmann', 'Szabolcs', 'Thibodaux',
];

const TOPICS = [
	'a checklist for onboarding a new designer',
	'how to structure our weekly meeting notes',
	'a first draft of next quarter\'s objectives',
	'how to write a good bug report template',
	'ideas to make our retrospectives less boring',
	'a plan to migrate our wiki pages into one workspace',
	'how to keep a product changelog readable',
	'a template for interview feedback',
	'how to run a pre-mortem before a launch',
	'a reading list for new team leads',
	'how to tag tasks so the board stays useful',
	'a simple way to track decisions over time',
];

/** Sentences of the assistant's filler. They carry distractor numbers and names on purpose. */
const SENTENCES = [
	'Start with the outcome you want, then list the smallest steps that get you there.',
	'Team Falcon used a two-column layout last spring and cut review time by about 1,200 minutes a quarter.',
	'Keep each item short enough to read aloud in one breath; long items hide two decisions in one.',
	'A good default is to review the page every second Thursday and archive what nobody opened.',
	'Name an owner for every section, otherwise the page decays quietly within a few weeks.',
	'The pilot group of 14 people preferred checklists to free text by a wide margin.',
	'Write the why above the what, so a newcomer can disagree with the reasoning and not only the result.',
	'Link related pages instead of copying them; two copies always drift apart.',
	'Project Lantern kept its templates in one folder and saw fewer duplicates after 3 months.',
	'Use plain verbs in headings: "Plan the sprint", not "Sprint planning considerations".',
	'Add a short example under each rule; examples are read, rules are skimmed.',
	'A budget line of 2,500 euros for tooling was enough for the design guild last year.',
	'Mark open questions explicitly and give each one a date by which it must be answered.',
	'Prefer a table when people will compare rows, and a list when they will read top to bottom.',
	'Keep the template under one screen; anything longer turns into a form nobody completes.',
	'Ask Rosalind from the platform team if you need the archive permissions changed.',
	'Collect feedback in the same place every time so trends are visible without a spreadsheet.',
	'Close each meeting by reading the decisions back; it takes a minute and saves a week.',
	'Version the page title with the quarter, like "Q3 objectives", so old pages stay findable.',
	'Retire a rule as soon as nobody can explain why it exists.',
];

/** A small deterministic generator (mulberry32): the same seed, the same thread. */
function generator(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Lowercase letters and digits only: how an answer and a key are compared. */
export function normalise(text: string): string {
	return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The filler answer of a turn: about `chars` characters of the sentences, shuffled. */
function fillerAnswer(next: () => number, topic: string, chars: number): string {
	const paragraphs: string[] = [`Here is a way to approach ${topic}.`];
	let size = paragraphs[0].length;
	while (size < chars) {
		const sentences = Array.from({ length: 4 }, () => SENTENCES[Math.floor(next() * SENTENCES.length)]);
		const paragraph = sentences.join(' ');
		paragraphs.push(paragraph);
		size += paragraph.length + 2;
	}
	return paragraphs.join('\n\n');
}

/** How many filler turns follow the facts, and how long each answer is: enough to push the facts out of the window. */
export const FILLER_TURNS = 16;
export const FILLER_ANSWER_CHARS = 5_000;

export function thread(index: number): Thread {
	const next = generator(1_000 + index);
	const codename = `${ADJECTIVES[index % 10]}-${ANIMALS[(index * 3 + 1) % 10]}-${10 + Math.floor(next() * 89)}`.toUpperCase();
	const budget = 10_000 + Math.floor(next() * 89_000);
	const first = FIRST_NAMES[(index * 7) % 10];
	const surname = SURNAMES[index % SURNAMES.length];
	const facts: Fact[] = [
		{ kind: 'codename', stated: codename, key: normalise(codename) },
		{ kind: 'budget', stated: budget.toLocaleString('en-US'), key: String(budget) },
		{ kind: 'contact', stated: `${first} ${surname}`, key: normalise(surname) },
	];
	const messages: ThreadMessage[] = [
		{
			id: `t${index}-m0`,
			role: 'user',
			text: `Some context before we start. Our project codename is ${codename}, the approved budget is ${facts[1].stated} euros, and our supplier contact is ${first} ${surname}. Please keep that in mind for later.`,
		},
		{ id: `t${index}-m1`, role: 'assistant', text: 'Understood. I will keep the project codename, the approved budget and the supplier contact in mind.' },
	];
	for (let turn = 0; turn < FILLER_TURNS; turn += 1) {
		const topic = TOPICS[(index + turn * 5) % TOPICS.length];
		messages.push({ id: `t${index}-m${messages.length}`, role: 'user', text: `Can you help me with ${topic}? Keep it practical.` });
		messages.push({ id: `t${index}-m${messages.length}`, role: 'assistant', text: fillerAnswer(next, topic, FILLER_ANSWER_CHARS) });
	}
	return {
		index,
		messages,
		facts,
		question: 'Before I send the brief: what is our project codename, what is the approved budget, and what is the full name of our supplier contact? Answer in one line each.',
	};
}

/** Which facts an answer recalls: its normalised text contains the key. */
export function recalled(answer: string, facts: readonly Fact[]): boolean[] {
	const text = normalise(answer);
	return facts.map((fact) => text.includes(fact.key));
}
