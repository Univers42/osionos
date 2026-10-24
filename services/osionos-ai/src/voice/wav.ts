/**
 * The audio of a dictation: 16 kHz, mono, PCM16 — and nothing else.
 *
 * The browser decodes and resamples (the platform does it, in `OfflineAudioContext`),
 * so the server receives a WAV it can verify byte by byte. This module is the
 * verification: it refuses everything that is not exactly that WAV, and it
 * writes the canonical header of what the STT server is given.
 *
 * The bytes of the client NEVER reach the STT server: only `canonicalWav` of the
 * parsed PCM does. A header that lies about its own size, a PNG wearing the
 * label `audio/wav`, a stereo file — all of them are a typed refusal.
 */

/** The bytes of the header of a canonical WAV. */
export const WAV_HEADER_BYTES = 44;

/** The rate of a dictation: the rate the STT server wants. */
export const DICTATION_SAMPLE_RATE = 16_000;

/** The bits of one sample: PCM16. */
export const DICTATION_BITS_PER_SAMPLE = 16;

/** The cap of one dictation: 30 s at 16 kHz, 16 bits, mono, plus the header. */
export const MAX_DICTATION_BYTES = 960_044;

/** The cap of one dictation, in seconds. */
export const MAX_DICTATION_SECONDS = 30;

/**
 * A refusal: the code says why, and the audio never reaches a log.
 *
 * The codes are stable: the client maps them to a sentence, and the tests
 * assert on them.
 */
export class WavRefusal extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = 'WavRefusal';
		this.code = code;
	}
}

/** A dictation the server accepted: the samples, and how long they last. */
export interface DictationWav {
	/** The samples: 16-bit little-endian, one channel. */
	pcm: Buffer;
	/** The duration of the audio, in seconds. */
	durationSeconds: number;
}

/** The identifier of a chunk of a RIFF file. */
function chunkId(bytes: Buffer, offset: number): string {
	return bytes.toString('ascii', offset, offset + 4);
}

/**
 * The WAV of a dictation, or a refusal.
 *
 * Only a RIFF/WAVE file with exactly one `fmt ` chunk (PCM, 1 channel, 16 kHz,
 * 16 bits) and exactly one `data` chunk is accepted. The RIFF size must be the
 * size of the file, and the data must hold a whole number of samples.
 */
export function parseDictationWav(bytes: Buffer): DictationWav {
	if (bytes.length < WAV_HEADER_BYTES) throw new WavRefusal('too_short');
	if (bytes.length > MAX_DICTATION_BYTES) throw new WavRefusal('too_long');
	if (chunkId(bytes, 0) !== 'RIFF') throw new WavRefusal('not_riff');
	if (chunkId(bytes, 8) !== 'WAVE') throw new WavRefusal('not_wave');
	// The RIFF size counts the bytes after the field itself: a file that lies
	// about it is a file that was cut, padded or built by something else.
	if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new WavRefusal('riff_size_mismatch');

	let fmt: Buffer | null = null;
	let data: Buffer | null = null;
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const id = chunkId(bytes, offset);
		const size = bytes.readUInt32LE(offset + 4);
		const body = offset + 8;
		if (body + size > bytes.length) throw new WavRefusal('chunk_truncated');
		if (id === 'fmt ') {
			if (fmt) throw new WavRefusal('duplicate_fmt');
			fmt = bytes.subarray(body, body + size);
		} else if (id === 'data') {
			if (data) throw new WavRefusal('duplicate_data');
			data = bytes.subarray(body, body + size);
		} else {
			throw new WavRefusal('unsupported_chunk');
		}
		// The chunks are word-aligned: an odd size carries one pad byte.
		offset = body + size + (size % 2);
	}
	if (offset !== bytes.length) throw new WavRefusal('trailing_bytes');
	if (!fmt) throw new WavRefusal('no_fmt');
	if (!data) throw new WavRefusal('no_data');
	if (fmt.length !== 16) throw new WavRefusal('fmt_size');
	if (fmt.readUInt16LE(0) !== 1) throw new WavRefusal('not_pcm');
	if (fmt.readUInt16LE(2) !== 1) throw new WavRefusal('not_mono');
	if (fmt.readUInt32LE(4) !== DICTATION_SAMPLE_RATE) throw new WavRefusal('wrong_rate');
	if (fmt.readUInt16LE(14) !== DICTATION_BITS_PER_SAMPLE) throw new WavRefusal('wrong_depth');
	if (data.length % 2 !== 0) throw new WavRefusal('odd_data');

	return {
		pcm: Buffer.from(data),
		durationSeconds: data.length / 2 / DICTATION_SAMPLE_RATE,
	};
}

/**
 * The canonical WAV of a dictation: a fresh 44-byte header and the samples.
 *
 * This — and never the bytes of the client — is what the STT server receives.
 */
export function canonicalWav(pcm: Buffer): Buffer {
	const header = Buffer.alloc(WAV_HEADER_BYTES);
	header.write('RIFF', 0, 'ascii');
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write('WAVE', 8, 'ascii');
	header.write('fmt ', 12, 'ascii');
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20); // PCM
	header.writeUInt16LE(1, 22); // one channel
	header.writeUInt32LE(DICTATION_SAMPLE_RATE, 24);
	header.writeUInt32LE(DICTATION_SAMPLE_RATE * 2, 28); // the byte rate
	header.writeUInt16LE(2, 32); // the block align
	header.writeUInt16LE(DICTATION_BITS_PER_SAMPLE, 34);
	header.write('data', 36, 'ascii');
	header.writeUInt32LE(pcm.length, 40);
	return Buffer.concat([header, pcm]);
}
