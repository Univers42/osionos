/**
 * A semaphore of one seat, with a bounded wait.
 *
 * The CPU llama-server has one slot (`-np 1`): a second call would queue
 * inside the server with no deadline we control. The wait is here instead.
 *
 * Caveat: per process. Two replicas of the service hold two seats and put two
 * calls on the one slot; the server then queues them, still within the
 * VLM timeout of each.
 */
export class Seat {
	private held = false;
	private readonly waiting: (() => void)[] = [];

	/** The release function once the seat is ours, or null if `waitMs` ran out first. */
	async take(waitMs: number): Promise<(() => void) | null> {
		if (!this.held) {
			this.held = true;
			return this.release;
		}
		const turn = await new Promise<boolean>((resolve) => {
			const wake = (): void => {
				clearTimeout(timer);
				resolve(true);
			};
			const timer = setTimeout(() => {
				const index = this.waiting.indexOf(wake);
				if (index >= 0) this.waiting.splice(index, 1);
				resolve(false);
			}, waitMs);
			this.waiting.push(wake);
		});
		return turn ? this.release : null;
	}

	/** Hands the seat to the next in line, or frees it. */
	private readonly release = (): void => {
		const next = this.waiting.shift();
		if (next) next();
		else this.held = false;
	};
}
