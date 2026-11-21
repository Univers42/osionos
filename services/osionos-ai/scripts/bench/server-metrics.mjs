// The llama.cpp /metrics of the server, as a flat object of numbers.
// Caveat: only llamacpp:* lines are read; any other server answers {}.

export async function readMetrics(root) {
	try {
		const res = await fetch(`${root}/metrics`);
		if (!res.ok) return {};
		const out = {};
		for (const line of (await res.text()).split('\n')) {
			if (!line.startsWith('llamacpp:')) continue;
			const space = line.indexOf(' ');
			if (space === -1) continue;
			const value = Number(line.slice(space + 1));
			if (Number.isFinite(value)) out[line.slice(0, space)] = value;
		}
		return out;
	} catch {
		return {};
	}
}
