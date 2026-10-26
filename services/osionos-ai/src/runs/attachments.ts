import { classifyAttachment } from '../files/classify.ts';
import { fetchAttachment } from '../vision/fetchAttachment.ts';
import { readImageHeader } from '../vision/imageHeader.ts';
import { stripMetadata } from '../vision/stripMetadata.ts';
import type { RunAttachment } from './runner.ts';

/**
 * The attachments of a run, fetched through the bridge with the caller's token
 * of THIS request, validated and stripped before any money moves.
 */

export type LoadedAttachments =
	| { kind: 'loaded'; images: { data: Uint8Array; mediaType: string }[]; texts: { name: string; text: string }[] }
	| { kind: 'refused'; status: number; code: string };

export async function loadAttachments(
	attachments: readonly RunAttachment[],
	sessionToken: string,
	modelSeesImages: boolean,
): Promise<LoadedAttachments> {
	const images: { data: Uint8Array; mediaType: string }[] = [];
	const texts: { name: string; text: string }[] = [];
	try {
		for (const attachment of attachments) {
			const bridgePath =
				attachment.kind === 'chat' ? `/api/chat/uploads/${attachment.id}` : attachment.path;
			const fetched = await fetchAttachment(bridgePath, sessionToken);
			// The type is the one the BYTES say, never the name or the stored type.
			const classified = classifyAttachment(fetched.bytes);
			if (classified.kind === 'unsupported') {
				throw Object.assign(new Error('unsupported_file'), { status: 415, code: 'unsupported_file' });
			}
			if (classified.kind === 'text') {
				texts.push({ name: attachment.kind === 'media' ? attachment.name ?? 'file' : 'file', text: classified.text });
				continue;
			}
			// Only an image needs a model that sees: a text file works on every model.
			if (!modelSeesImages) {
				throw Object.assign(new Error('model_no_vision'), { status: 400, code: 'model_no_vision' });
			}
			const header = readImageHeader(fetched.bytes);
			if (header.width * header.height > 16_700_000) {
				throw Object.assign(new Error('image_too_large'), { status: 422, code: 'image_too_large' });
			}
			const stripped = stripMetadata(fetched.bytes);
			// The type of the image is the one its BYTES say: the bridge
			// announces the type it stored, and a file that was stored with
			// the wrong type must not decide what the model sees.
			images.push({ data: stripped, mediaType: `image/${header.format}` });
		}
	} catch (error) {
		const candidate = error as { status?: unknown; code?: unknown };
		const status = typeof candidate?.status === 'number' ? candidate.status : 422;
		const code = typeof candidate?.code === 'string' ? candidate.code : 'invalid_image';
		// Bridge 403/404 already became attachment_not_found.
		const finalStatus = code === 'attachment_not_found' ? 404 : status >= 400 ? status : 422;
		return { kind: 'refused', status: finalStatus, code };
	}
	return { kind: 'loaded', images, texts };
}
