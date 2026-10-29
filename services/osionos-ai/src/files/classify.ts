/**
 * What an attached file is, decided by its BYTES.
 *
 * The name and the content type the bridge stored are display data: a file
 * stored as `image/png` may be a PDF, and a `.txt` may be a ZIP.
 *
 * Caveat: UTF-8 is the only text encoding read. A UTF-16 or Latin-1 text file
 * is `unsupported`, never guessed; a text file with a NUL byte (some UTF-16,
 * some logs with binary noise) is `unsupported` too.
 */

export type AttachmentClass =
	| { kind: 'image' }
	| { kind: 'text'; text: string }
	| { kind: 'unsupported' };

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
	return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Image magic only: a corrupt or oversized image is still an image, and the
 * image path (vision/imageHeader.ts) refuses it with its own code.
 */
function isImage(bytes: Uint8Array): boolean {
	const ascii = (from: number, text: string): boolean =>
		[...text].every((char, index) => bytes[from + index] === char.charCodeAt(0));
	return (
		startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
		startsWith(bytes, [0xff, 0xd8]) ||
		(ascii(0, 'RIFF') && ascii(8, 'WEBP')) ||
		ascii(0, 'GIF8')
	);
}

export function classifyAttachment(bytes: Uint8Array): AttachmentClass {
	if (isImage(bytes)) return { kind: 'image' };
	// %PDF-, an OLE container (old Office) and a ZIP (docx, xlsx, pptx, zip).
	if (
		startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) ||
		startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]) ||
		startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
	) {
		return { kind: 'unsupported' };
	}
	if (bytes.includes(0)) return { kind: 'unsupported' };
	try {
		// ignoreBOM false: the decoder itself drops a leading BOM.
		return { kind: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
	} catch {
		return { kind: 'unsupported' };
	}
}
