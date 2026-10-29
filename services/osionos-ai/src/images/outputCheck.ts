import { resolve } from 'node:path';
import { env, pipeline, RawImage } from '@huggingface/transformers';
import type { DataType } from '@huggingface/transformers';

/**
 * The output check on the generated images (devil C73).
 *
 * The bytes the engine answered are untrusted until two classifiers have seen
 * them: the image is stored only when NEITHER of them fires. The check runs in
 * the service, in-process, on the CPU, with the model on the disk of the
 * volume — no network at all (`allowRemoteModels` is false, so a model that
 * is not on the disk is an error, never a download).
 *
 * A1 measured the candidates in exactly this shape
 * (`spikes/a1/results/safety/RESULTS.md`, "C73 — the output check"): Falconsai
 * q8 47 ms p50, AdamCodd q8 143 ms, and 0 false positives on the 352 safe
 * images of the spike at 0.5 and 0.9 respectively. The gate refuses an image
 * when EITHER model fires: the union catches what either catches and costs no
 * measured false positive.
 *
 * Caveat: the RECALL of this check is UNMEASURED. No unsafe image was ever
 * downloaded, generated or stored, so every number of A1 is a rate of false
 * positives: the thresholds below were chosen on the false positives of the
 * 352 safe images and on nothing else. To change one, measure the recall of
 * the two models on a licensed, labelled set of unsafe images first, and keep
 * the thresholds that hold the false positives and catch what must be caught.
 */

/** One classifier of the check: its pin, and the score that refuses an image. */
export interface OutputCheckModel {
	/** The name the scores carry: the key of the log line and of the tests. */
	id: string;
	/** The repository of the model: the directory of the model on the disk. */
	repo: string;
	/** The commit of the repository: the pin the fetch script checks. */
	revision: string;
	/** The label that carries the score of an unsafe image. */
	unsafeLabel: string;
	/** The score at which the image is refused. */
	threshold: number;
	/** The precision of the weights: q8, the one A1 measured. */
	dtype: DataType;
}

/** The two classifiers of the check, and the thresholds they refuse at. */
export const OUTPUT_CHECK_MODELS: readonly OutputCheckModel[] = Object.freeze([
	{
		id: 'falconsai',
		repo: 'onnx-community/nsfw_image_detection-ONNX',
		revision: '1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5',
		unsafeLabel: 'nsfw',
		threshold: 0.5,
		dtype: 'q8',
	},
	{
		id: 'adamcodd',
		repo: 'AdamCodd/vit-base-nsfw-detector',
		revision: '8587de998f441aac03fdd57a85d2e4cb808c7d64',
		unsafeLabel: 'nsfw',
		threshold: 0.9,
		dtype: 'q8',
	},
]);

/** The answer of the check: the verdict, and the score of every model. */
export interface OutputCheckVerdict {
	/** Whether the image must not be stored. */
	refused: boolean;
	/** The score of the unsafe label of every model, by the id of the model. */
	scores: Record<string, number>;
}

/** The check itself: the bytes in, the verdict out. */
export interface OutputCheck {
	check(bytes: Uint8Array): Promise<OutputCheckVerdict>;
}

/**
 * The union rule: an image is refused when ANY model reaches its threshold.
 *
 * A score that is missing is not a pass: the check fails closed, so a model
 * that did not answer refuses the image rather than waving it through.
 */
export function refusedBy(scores: Record<string, number>): boolean {
	return OUTPUT_CHECK_MODELS.some((model) => {
		const score = scores[model.id];
		return score === undefined || score >= model.threshold;
	});
}

/**
 * The two classifiers, loaded once, on the disk of the volume.
 *
 * A load that fails throws: the caller holds the check as UNAVAILABLE and
 * refuses every image (the fail-closed shape A1 measured: the pipeline
 * refuses in 9.6 ms when the model file is missing).
 */
export async function loadOutputCheck(modelDir: string): Promise<OutputCheck> {
	if (!modelDir) throw new Error('the directory of the models of the check is not set');
	env.allowRemoteModels = false;
	env.allowLocalModels = true;
	env.localModelPath = resolve(modelDir);
	const loaded: { model: OutputCheckModel; classify: (image: RawImage) => Promise<{ label: string; score: number }[]> }[] =
		[];
	for (const model of OUTPUT_CHECK_MODELS) {
		const pipeline_ = await pipeline('image-classification', model.repo, { dtype: model.dtype, device: 'cpu' });
		loaded.push({ model, classify: (image) => pipeline_(image) });
	}
	return {
		async check(bytes: Uint8Array): Promise<OutputCheckVerdict> {
			const scores: Record<string, number> = {};
			let image: RawImage;
			try {
				image = await RawImage.read(new Blob([bytes]));
			} catch {
				// The bytes are not an image the check can read: refuse them.
				return { refused: true, scores };
			}
			for (const { model, classify } of loaded) {
				try {
					const answer = await classify(image);
					const unsafe = answer.find((entry) => entry.label === model.unsafeLabel);
					if (!unsafe) throw new Error('no unsafe label');
					scores[model.id] = unsafe.score;
				} catch {
					// A classifier that fails refuses the image: fail closed.
					return { refused: true, scores };
				}
			}
			return { refused: refusedBy(scores), scores };
		},
	};
}
