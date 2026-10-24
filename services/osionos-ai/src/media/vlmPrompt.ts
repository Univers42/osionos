/**
 * The question and the shape of the answer of "Describe image".
 *
 * Copied from the spike that picked the model: PROMPT is
 * spikes/a1/vlm-prompt.txt and SCHEMA is spikes/a1/vlm-schema.json (osionos
 * repo, branch of AI-A1). llama-server turns SCHEMA into a grammar, so the
 * shape of the answer is the server's, not the model's wish. One change from
 * the spike: the items of `tags` and `objects` carry `maxLength: 40`, so the
 * grammar itself keeps them under the limit the service validates.
 */

export const PROMPT = `You are the image tagger of a photo platform. Look at the picture and answer with one JSON object, and with nothing else.

The object has exactly these five keys:
- "caption": one sentence, at most 200 characters, that says what the picture shows. It is the alt text of the picture.
- "tags": at most 10 lowercase nouns: the things that are visible in the picture. No adjectives, no sentences, no duplicates.
- "objects": at most 10 lowercase nouns: the objects you can see, without describing the scene.
- "ocr": the text that is written in the picture, as it is read, at most 300 characters. If the picture holds no text, write an empty string.
- "safety": one of "safe", "suggestive", "explicit", "violent", "unknown". It is a hint for a human reviewer, never a verdict: write "safe" for an ordinary picture, "suggestive" when the picture is sexually suggestive, "explicit" when it shows nudity or sex, "violent" when it shows blood, gore or an act of violence, and "unknown" when the picture is too dark or too unclear to tell.

Answer with the JSON object only. Do not write anything before it and nothing after it.`;

export const SCHEMA = {
	name: 'image-tags',
	strict: true,
	schema: {
		type: 'object',
		properties: {
			caption: { type: 'string', maxLength: 200 },
			tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 10 },
			objects: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 10 },
			ocr: { type: 'string', maxLength: 300 },
			safety: { type: 'string', enum: ['safe', 'suggestive', 'explicit', 'violent', 'unknown'] },
		},
		required: ['caption', 'tags', 'objects', 'ocr', 'safety'],
		additionalProperties: false,
	},
} as const;

/** The answer tokens of the spike: a longer answer was cut. */
export const MAX_TOKENS = 640;
