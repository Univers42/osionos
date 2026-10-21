/* ************************************************************************** */
/*                                                                            */
/*   text.mjs                                  the helpers of the questions   */
/*                                                                            */
/*   The text helpers the question rules are written against: the content    */
/*   words of a text, the sentences of a paragraph, the rare exact terms of  */
/*   a question (a SKU, a codename), the invented proper nouns of a negative */
/*   question, and the detector that tells a French page from an English     */
/*   one.                                                                     */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

// ---------------------------------------------------------------------------
// Text helpers the question rules are written against.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	// english
	"a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are",
	"as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
	"can", "cannot", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for",
	"from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how",
	"i", "if", "in", "into", "is", "it", "its", "itself", "just", "let", "may", "me", "might", "more",
	"most", "must", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "one", "only",
	"or", "other", "our", "ours", "out", "over", "own", "per", "same", "shall", "she", "should", "so",
	"some", "such", "than", "that", "the", "their", "theirs", "them", "then", "there", "these", "they",
	"this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
	"when", "where", "which", "while", "who", "whom", "whose", "why", "will", "with", "would", "you",
	"your", "yours",
	// french
	"afin", "ainsi", "alors", "après", "au", "aucun", "aussi", "autre", "aux", "avant", "avec",
	"avoir", "bien", "car", "ce", "ceci", "cela", "ces", "cet", "cette", "ceux", "chaque", "chez",
	"comme", "comment", "dans", "de", "dedans", "dehors", "depuis", "des", "deux", "doit", "donc",
	"dos", "du", "elle", "elles", "en", "encore", "entre", "et", "être", "eux", "fait", "faire",
	"fois", "font", "hors", "ici", "il", "ils", "juste", "la", "le", "les", "leur", "leurs", "lors",
	"lorsque", "ma", "mais", "me", "même", "mes", "moi", "mon", "ne", "nos", "notre", "nous", "on",
	"ou", "où", "par", "parce", "pas", "peu", "plus", "pour", "pourquoi", "près", "quand", "que",
	"quel", "quelle", "quelles", "quels", "qui", "quoi", "sa", "sans", "selon", "ses", "si", "soit",
	"son", "sont", "sous", "sur", "ta", "te", "tes", "toi", "ton", "tous", "tout", "toute", "toutes",
	"très", "tu", "un", "une", "vos", "votre", "vous", "y",
]);

/** The content words of a text: lower case, stop words and numbers removed. */
export function contentWords(text) {
	return text
		.toLowerCase()
		.replace(/[^a-zà-öø-ÿ0-9\s'-]/g, " ")
		.split(/\s+/)
		.map((token) => token.replace(/^['-]+|['-]+$/g, ""))
		.filter((token) => token.length >= 3 && /[a-zà-öø-ÿ]/.test(token) && !STOPWORDS.has(token));
}

/** The shared content words of two texts. */
export function sharedContentWords(left, right) {
	const rightWords = new Set(contentWords(right));
	return [...new Set(contentWords(left))].filter((word) => rightWords.has(word));
}

/** The sentences of a text, in order. */
export function sentences(text) {
	return text
		.split(/(?<=[.!?…])\s+/u)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

/** The sentence a marker points at: the last one of the marked paragraph. */
export function answerSentence(marker) {
	const list = sentences(marker.text);
	return list.length ? list[list.length - 1] : "";
}

/** Rare exact terms: a code, a SKU, a codename. Upper case, hyphenated. */
export function rareTerms(text) {
	return [...new Set(text.match(/\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g) ?? [])];
}

/** Invented proper nouns: capitalised words that are not the first word. */
export function properNouns(text) {
	const found = [];
	text.split(/\s+/).forEach((word, index) => {
		const clean = word.replace(/[^\p{L}'-]/gu, "");
		if (!/^\p{Lu}\p{Ll}{2,}$/u.test(clean)) return;
		if (index === 0) return;
		if (STOPWORDS.has(clean.toLowerCase())) return;
		found.push(clean);
	});
	return found;
}

const FRENCH_MARKERS = ["les", "des", "pour", "avec", "dans", "est", "une", "du", "qui", "sur", "que", "aux", "par", "nous", "cette"];
const ENGLISH_MARKERS = ["the", "and", "of", "to", "in", "is", "that", "with", "for", "we", "are", "on"];

/** A page is French when it uses more French function words than English ones. */
export function isFrench(text) {
	const words = text.toLowerCase().split(/[^a-zà-öø-ÿ]+/).filter(Boolean);
	const count = (list) => list.filter((word) => words.includes(word)).length;
	return count(FRENCH_MARKERS) > count(ENGLISH_MARKERS);
}
