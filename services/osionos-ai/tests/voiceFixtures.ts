/**
 * The WAVs of the tests: the one the browser sends, and the ones it must never
 * send.
 *
 * `makeWav` builds a WAV with the fields a test wants to be wrong — the rate,
 * the channels, the depth, the format, the size the RIFF header claims — so
 * the table of the refusals is data, not a pile of byte arrays.
 */

export interface WavOptions {
	/** The rate of the header. */
	rate?: number;
	/** The channels of the header. */
	channels?: number;
	/** The bits of a sample. */
	bits?: number;
	/** The format of the `fmt ` chunk: 1 is PCM, 3 is float32. */
	format?: number;
	/** The bytes of the data chunk. */
	pcmBytes?: number;
	/** The samples of the data chunk: they win over `pcmBytes`. */
	pcm?: Buffer;
	/** The size the RIFF header claims — a lie when it differs from the file. */
	riffSize?: number;
	/** The byte rate of the header: the parser does not trust it, the server rewrites it. */
	byteRate?: number;
	/** The block align of the header. */
	blockAlign?: number;
}

/** A WAV with the fields the test asks for. */
export function makeWav(options: WavOptions = {}): Buffer {
	const rate = options.rate ?? 16_000;
	const channels = options.channels ?? 1;
	const bits = options.bits ?? 16;
	const format = options.format ?? 1;
	const pcm = options.pcm ?? Buffer.alloc(options.pcmBytes ?? 320, 7);
	const header = Buffer.alloc(44);
	header.write('RIFF', 0, 'ascii');
	header.writeUInt32LE(options.riffSize ?? 36 + pcm.length, 4);
	header.write('WAVE', 8, 'ascii');
	header.write('fmt ', 12, 'ascii');
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(format, 20);
	header.writeUInt16LE(channels, 22);
	header.writeUInt32LE(rate, 24);
	header.writeUInt32LE(options.byteRate ?? rate * channels * (bits / 8), 28);
	header.writeUInt16LE(options.blockAlign ?? channels * (bits / 8), 32);
	header.writeUInt16LE(bits, 34);
	header.write('data', 36, 'ascii');
	header.writeUInt32LE(pcm.length, 40);
	return Buffer.concat([header, pcm]);
}

/** The bytes of a PNG: the signature, and a body nobody can read as audio. */
export function pngBytes(): Buffer {
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		Buffer.from('not a wav at all, only bytes — and enough of them to be a file', 'utf8'),
	]);
}
