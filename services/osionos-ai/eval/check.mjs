/* ************************************************************************** */
/*                                                                            */
/*   check.mjs                                          the self-consistency   */
/*                                                                            */
/*   The gate of the golden set. It proves the corpus and the questions      */
/*   agree with each other before a retrieval runner ever sees them:         */
/*                                                                            */
/*     - 40 pages, 68 questions, the kind and language counts of the brief;  */
/*     - every expected slug exists and is not archived;                     */
/*     - every rare term of a question lives in its expected page only;      */
/*     - every paraphrase question shares no content word with its answer;    */
/*     - every multi question is answered by two pages;                       */
/*     - every cross-lingual question is answered by a page in the other    */
/*       language, and the lexical half has no way into it;                   */
/*     - every negative question names something the corpus never mentions;   */
/*     - every acl question agrees with the bridge's read rule, including    */
/*       the rule that an archived page is out of the index.                 */
/*                                                                            */
/*   The corpus half is check-corpus.mjs, the questions half is              */
/*   check-questions.mjs, and the shared ground is check-lib.mjs.            */
/*                                                                            */
/*   No dependencies. Node 22.                                               */
/* ************************************************************************** */

import console from "node:console";
import process from "node:process";
import { failures, pages, questions } from "./check-lib.mjs";
import { archived, checkCorpus, mix, withTable } from "./check-corpus.mjs";
import { acl, checkQuestions, crossLingual, kindCounts, langCounts, xlCounts } from "./check-questions.mjs";

checkCorpus();
checkQuestions();

console.log("golden set check — services/osionos-ai/eval");
console.log(`corpus: ${pages.length} pages, ${withTable.length} with a table, ${archived.length} archived`);
console.log(`mix: sales ${mix.sales}, meetings ${mix.meetings}, hr ${mix.hr}, specs ${mix.specs}, runbooks ${mix.runbooks}, french ${mix.french}`);
console.log(`questions: ${questions.length}`);
console.log("kind table:");
for (const kind of ["lexical", "paraphrase", "multi", "fr", "xl", "negative", "acl"]) {
	const count = kindCounts[kind] ?? 0;
	console.log(`  ${kind.padEnd(11)} ${String(count).padStart(2)}`);
}
console.log(`lang: en ${langCounts.en ?? 0}, fr ${langCounts.fr ?? 0}`);
console.log(
	`xl: ${xlCounts.fr ?? 0} asked in french (the answer is english), ${xlCounts.en ?? 0} asked in english (the answer is french)`,
);
console.log(`fr: ${crossLingual} of them ask about an english page`);
console.log(`acl: ${acl.cannot} refused (${acl.blocked} by the bridge rule, ${acl.archived} archived), ${acl.answered} answered`);

if (failures.length) {
	console.log("");
	console.log(`FAIL — ${failures.length} problem(s):`);
	for (const message of failures) console.log(`  - ${message}`);
	process.exitCode = 1;
} else {
	console.log("");
	console.log("PASS — the corpus and the questions agree");
}
