// The patches of the model files, for the conversion (AI-P0d, Part B).
//
// The e5 model is a BERT model whose tokenizer is XLM-Roberta. llama.cpp's
// converter has a class for that (XLMRobertaModel) and it writes the Unigram
// vocabulary of tokenizer.json, the one TEI uses. Two things stand in the way:
//
//   1. the config of the model says "model_type": "bert", so the converter
//      picks the plain BertModel class, which cannot write a Unigram
//      vocabulary ("BPE pre-tokenizer was not recognized");
//   2. the normalizer of tokenizer.json is a Sequence of two normalizers,
//      while the converter wants the Precompiled one directly.
//
// This script writes a directory the converter accepts, and prints what it
// changed. Nothing of the model is changed in place: the files are copied
// first, and the copy is what is converted.
//
//   node patch-e5-model.mjs <source directory> <target directory>
//
// No dependencies. Node 22.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [, , source, target] = process.argv;
if (!source || !target) {
	console.error('usage: patch-e5-model.mjs <source directory> <target directory>');
	process.exit(2);
}

const FILES = [
	'model.safetensors',
	'tokenizer.json',
	'tokenizer_config.json',
	'special_tokens_map.json',
	'sentence_bert_config.json',
];
for (const file of FILES) {
	const from = path.join(source, file);
	if (!existsSync(from)) {
		console.error(`missing ${from}`);
		process.exit(1);
	}
	copyFileSync(from, path.join(target, file));
}

// 1. the config: the XLM-Roberta class of the converter.
const config = JSON.parse(readFileSync(path.join(source, 'config.json'), 'utf8'));
console.log(`config: model_type ${config.model_type} -> xlm-roberta, architectures ${JSON.stringify(config.architectures)} -> ["XLMRobertaModel"]`);
config.model_type = 'xlm-roberta';
config.architectures = ['XLMRobertaModel'];
writeFileSync(path.join(target, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);

// 2. the normalizer: the Precompiled one, alone.
const tokenizer = JSON.parse(readFileSync(path.join(target, 'tokenizer.json'), 'utf8'));
if (tokenizer.normalizer?.type === 'Sequence') {
	const precompiled = tokenizer.normalizer.normalizers.find((normalizer) => normalizer.type === 'Precompiled');
	if (!precompiled) {
		console.error('the normalizer of tokenizer.json has no Precompiled normalizer');
		process.exit(1);
	}
	console.log('tokenizer.json: the normalizer is a Sequence, the Precompiled one is kept alone');
	tokenizer.normalizer = { type: 'Precompiled', precompiled_charsmap: precompiled.precompiled_charsmap };
	writeFileSync(path.join(target, 'tokenizer.json'), JSON.stringify(tokenizer));
} else {
	console.log('tokenizer.json: the normalizer is already the Precompiled one');
}
console.log('the directory of the conversion is ready');
