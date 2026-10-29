// The patch of the converter of llama.cpp (AI-P0d, Part B).
//
// The converter of b11580 writes the scores of the Unigram vocabulary as
// they come from tokenizer.json: some of them are JSON integers, some are
// JSON floats. A GGUF array must hold one type only, and the writer refuses
// to write it ("All items in a GGUF array should be of the same type").
//
// This script copies the conversion code of the image into a directory and
// casts the scores to float. The copy is what the conversion runs with.
//
//   node patch-llama-converter.mjs <the directory of the tools>
//
// No dependencies. Node 22.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , tools] = process.argv;
if (!tools) {
	console.error('usage: patch-llama-converter.mjs <the directory of the tools>');
	process.exit(2);
}

const file = path.join(tools, 'conversion/bert.py');
const source = readFileSync(file, 'utf8');
const before = '                    tokens[token_id] = text\n                    scores[token_id] = score\n                    toktypes[token_id] = toktype';
const after = '                    tokens[token_id] = text\n                    scores[token_id] = float(score)\n                    toktypes[token_id] = toktype';
if (source.includes(after)) {
	console.log('the converter is already patched');
} else if (source.includes(before)) {
	writeFileSync(file, source.replace(before, after));
	console.log('the scores of the vocabulary are cast to float');
} else {
	console.error('the pattern of the scores is not in the converter');
	process.exit(1);
}
