/**
 * The bytes of the images the tests use: hand-built, tiny, and never a file.
 *
 * Every fixture is the smallest thing that carries what the test needs: a PNG
 * with a `tEXt` chunk, a JPEG with a GPS APP1, a WebP with an `EXIF` chunk.
 * There are no pixels — the service never decodes an image, it reads its
 * header and strips its metadata — but the headers are real, so the parsers
 * are exercised on the bytes they will really see.
 */

/** The bytes of a number, big-endian, on two bytes. */
function be16(value: number): number[] {
	return [(value >>> 8) & 0xff, value & 0xff];
}

/** The bytes of a number, big-endian, on four bytes. */
function be32(value: number): number[] {
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** The bytes of a number, little-endian, on two bytes. */
function le16(value: number): number[] {
	return [value & 0xff, (value >>> 8) & 0xff];
}

/** The bytes of a number, little-endian, on three bytes. */
function le24(value: number): number[] {
	return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

/** The bytes of a number, little-endian, on four bytes. */
function le32(value: number): number[] {
	return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** The bytes of a string. */
function ascii(text: string): number[] {
	return [...text].map((char) => char.charCodeAt(0) & 0xff);
}

/** One array of bytes after another. */
function join(...parts: (number[] | Uint8Array)[]): Uint8Array {
	const flat: number[] = [];
	for (const part of parts) {
		if (part instanceof Uint8Array) for (const byte of part) flat.push(byte);
		else flat.push(...part);
	}
	return new Uint8Array(flat);
}

/** The CRC of a PNG chunk: the type and the data, as the spec says. */
export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: its length, its type, its data, its CRC. */
function pngChunk(type: string, data: number[]): number[] {
	const body = join(ascii(type), data);
	return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/** The PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngOptions {
	width?: number;
	height?: number;
	/** The chunks between the IHDR and the IEND. */
	chunks?: { type: string; data: number[] }[];
	/** The file is an APNG: it carries an `acTL` chunk. */
	animated?: boolean;
}

/** A PNG: the signature, an IHDR, the chunks of the test, an IEND. */
export function pngBytes(options: PngOptions = {}): Uint8Array {
	const width = options.width ?? 2;
	const height = options.height ?? 2;
	const ihdr = pngChunk('IHDR', [
		...be32(width),
		...be32(height),
		8, // the depth of a bit
		6, // RGBA
		0, // the compression
		0, // the filter
		0, // the interlace
	]);
	const chunks = [...(options.chunks ?? [])];
	if (options.animated) chunks.unshift({ type: 'acTL', data: [...be32(2), ...be32(0)] });
	return join(
		PNG_SIGNATURE,
		ihdr,
		...chunks.map((chunk) => pngChunk(chunk.type, chunk.data)),
		pngChunk('IEND', []),
	);
}

/**
 * The payload of a GPS APP1: the TIFF block of the Exif segment.
 *
 * The `Exif\0\0` header is not here: the segment of the JPEG adds it.
 */
export function gpsApp1(): Uint8Array {
	return join(
		ascii('II*\0'), // the little-endian TIFF header
		be16(0x2a), // the magic of TIFF
		be32(8), // the offset of the first IFD
		be16(1), // one entry
		be16(0x8825), // the GPS IFD
		be32(26), // its offset
		be32(0), // the end of the IFD
		ascii('GPSLatitude'), // the tag of the GPS IFD
	);
}

export interface JpegOptions {
	width?: number;
	height?: number;
	/** The payload of an APP1 segment (Exif, XMP). */
	app1?: number[] | Uint8Array;
	/** The payload of an APP13 segment (IPTC). */
	app13?: number[] | Uint8Array;
	/** The file is broken: it carries no frame. */
	corrupt?: boolean;
}

/** A JPEG: an SOI, the segments of the test, a frame, a scan, an EOI. */
export function jpegBytes(options: JpegOptions = {}): Uint8Array {
	if (options.corrupt) return join([0xff, 0xd8], ascii('this file carries no frame'));
	const width = options.width ?? 2;
	const height = options.height ?? 2;
	const parts: (number[] | Uint8Array)[] = [[0xff, 0xd8]];
	if (options.app1) {
		parts.push([0xff, 0xe1], be16(2 + 6 + options.app1.length), ascii('Exif\0\0'), options.app1);
	}
	if (options.app13) {
		parts.push([0xff, 0xed], be16(2 + 13 + options.app13.length), ascii('Photoshop 3.0\0'), options.app13);
	}
	// SOF0: the frame, its size, its three components.
	parts.push(
		[0xff, 0xc0],
		be16(17),
		[8],
		be16(height),
		be16(width),
		[3],
		[1, 0x22, 0],
		[2, 0x11, 1],
		[3, 0x11, 1],
	);
	// SOS: the scan, then a few bytes of entropy.
	parts.push([0xff, 0xda], be16(12), [3], [1, 0], [2, 1], [3, 1], [0, 63, 0], [0x12, 0x34, 0x56]);
	parts.push([0xff, 0xd9]);
	return join(...parts);
}

/** One RIFF chunk: its fourcc, its size, its data, its padding. */
function riffChunk(fourcc: string, data: number[]): number[] {
	const padded = data.length % 2 === 1 ? [...data, 0] : data;
	return [...ascii(fourcc), ...le32(data.length), ...padded];
}

export interface WebpOptions {
	width?: number;
	height?: number;
	/** The file carries an `EXIF` chunk. */
	exif?: boolean;
	/** The file carries an `XMP ` chunk. */
	xmp?: boolean;
	/** The file is animated: the VP8X flag, or an `ANIM` chunk. */
	animated?: boolean;
}

/**
 * A WebP: a RIFF, a VP8X, the chunks of the test, a frame.
 *
 * The flags of the VP8X follow the spec: EXIF is 0x08, XMP is 0x04, and the
 * animation is 0x02.
 */
export function webpBytes(options: WebpOptions = {}): Uint8Array {
	const width = options.width ?? 2;
	const height = options.height ?? 2;
	let flags = 0;
	if (options.exif) flags |= 0x08;
	if (options.xmp) flags |= 0x04;
	if (options.animated) flags |= 0x02;
	const chunks: number[][] = [
		riffChunk('VP8X', [flags, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]),
	];
	if (options.exif) chunks.push(riffChunk('EXIF', ascii('the exif payload')));
	if (options.xmp) chunks.push(riffChunk('XMP ', ascii('<x:xmpmeta/>')));
	// The lossy frame: the tag, the start code, the size.
	chunks.push(riffChunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height), 0, 0]));
	if (options.animated) chunks.push(riffChunk('ANIM', [0, 0, 0, 0, 0, 0]));
	const body = join(ascii('WEBP'), ...chunks);
	return join(ascii('RIFF'), le32(body.length), body);
}

/** The bytes of a file that is not an image at all. */
export function svgBytes(): Uint8Array {
	return join(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
}

/** The name of every chunk of a PNG, in the order they are. */
export function pngChunkTypes(bytes: Uint8Array): string[] {
	const types: string[] = [];
	let pos = 8;
	while (pos + 8 <= bytes.length) {
		const length =
			((bytes[pos] << 24) >>> 0) + ((bytes[pos + 1] << 16) >>> 0) + ((bytes[pos + 2] << 8) >>> 0) + bytes[pos + 3];
		types.push(String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]));
		if (types[types.length - 1] === 'IEND') break;
		pos += 12 + length;
	}
	return types;
}

/** The name of every chunk of a WebP, in the order they are. */
export function webpChunkTypes(bytes: Uint8Array): string[] {
	const types: string[] = [];
	let pos = 12;
	while (pos + 8 <= bytes.length) {
		const size =
			(bytes[pos + 4] >>> 0) +
			(bytes[pos + 5] << 8) +
			(bytes[pos + 6] << 16) +
			(bytes[pos + 7] << 24);
		types.push(String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]));
		pos += 8 + size + (size & 1);
	}
	return types;
}

/** Whether the bytes carry the text, as the raw bytes of a file. */
export function hasBytes(bytes: Uint8Array, needle: string): boolean {
	const text = new TextDecoder('latin1').decode(bytes);
	return text.includes(needle);
}
