/**
 * The reader of an event stream, for the tests.
 *
 * It reads the frames one at a time, so a test can look at the first events
 * before the stream ends.
 */

/** One event of a stream: the id of the frame, its type, its data. */
export interface SseEvent {
	id: string;
	event: string;
	data: unknown;
}

/** One frame of a stream: the id, the type, the data. A ping has no data. */
function parseFrame(frame: string): SseEvent | null {
	let id = '';
	let event = 'message';
	const data: string[] = [];
	for (const line of frame.split('\n')) {
		if (line.startsWith('id: ')) id = line.slice(4);
		else if (line.startsWith('event: ')) event = line.slice(7);
		else if (line.startsWith('data: ')) data.push(line.slice(6));
	}
	if (data.length === 0) return null;
	return { id, event, data: JSON.parse(data.join('\n')) as unknown };
}

/** The events of a stream, read one at a time. */
export class SseStream {
	private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly decoder = new TextDecoder();
	private buffer = '';

	constructor(response: Response) {
		this.reader = response.body!.getReader();
	}

	async next(): Promise<SseEvent | null> {
		while (true) {
			const cut = this.buffer.indexOf('\n\n');
			if (cut >= 0) {
				const frame = this.buffer.slice(0, cut);
				this.buffer = this.buffer.slice(cut + 2);
				const parsed = parseFrame(frame);
				if (parsed) return parsed;
				continue;
			}
			const { value, done } = await this.reader.read();
			if (done) return null;
			this.buffer += this.decoder.decode(value, { stream: true });
		}
	}

	/** The connection goes away: on a run the run keeps going on the server. */
	async drop(): Promise<void> {
		await this.reader.cancel();
	}
}

/** Every event of a stream, until it ends. */
export async function collect(stream: SseStream): Promise<SseEvent[]> {
	const events: SseEvent[] = [];
	while (true) {
		const event = await stream.next();
		if (!event) return events;
		events.push(event);
	}
}
