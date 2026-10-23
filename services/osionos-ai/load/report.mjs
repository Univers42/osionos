import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function mulberry32(seed) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let x = t;
		x = Math.imul(x ^ (x >>> 15), x | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

export function percentile(values, p) {
	const a = [...values].sort((x, y) => x - y);
	if (a.length === 0) return Number.NaN;
	const idx = Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1);
	return a[idx];
}

export function bootstrapCI(values, p, seed = 42, resamples = 1000) {
	const rng = mulberry32(seed);
	const stats = [];
	const n = values.length;
	if (n === 0) return { low: Number.NaN, high: Number.NaN };
	for (let r = 0; r < resamples; r += 1) {
		const sample = new Array(n);
		for (let i = 0; i < n; i += 1) sample[i] = values[Math.floor(rng() * n)];
		stats.push(percentile(sample, p));
	}
	stats.sort((a, b) => a - b);
	return { low: percentile(stats, 2.5), high: percentile(stats, 97.5) };
}

export function summarize(records) {
	const groups = new Map();
	for (const r of records) {
		const key = `${r.phase}|${r.step}`;
		if (!groups.has(key)) groups.set(key, { phase: r.phase, step: r.step, records: [] });
		groups.get(key).records.push(r);
	}
	return [...groups.values()].map((g) => {
		const rs = g.records;
		const errors = {};
		let errCount = 0;
		for (const r of rs) {
			if (r.errorCode) {
				errors[r.errorCode] = (errors[r.errorCode] ?? 0) + 1;
				errCount += 1;
			}
		}
		const overheads = rs.filter((r) => r.overheadMs !== null).map((r) => r.overheadMs);
		const durations = rs.map((r) => r.durationMs);
		return {
			phase: g.phase,
			step: g.step,
			n: rs.length,
			errorRate: errCount / rs.length,
			errors,
			overhead: {
				p50: percentile(overheads, 50),
				p95: percentile(overheads, 95),
				p99: percentile(overheads, 99),
			},
			overheadCI: bootstrapCI(overheads, 95),
			duration: {
				p50: percentile(durations, 50),
				p95: percentile(durations, 95),
			},
		};
	});
}

export function parseStats(path) {
	if (!path || !fs.existsSync(path)) return null;
	const lines = fs.readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
	let cpuPeak = 0;
	let rssPeakMiB = 0;
	for (const line of lines) {
		let o;
		try {
			o = JSON.parse(line);
		} catch {
			continue;
		}
		if (!o || !String(o.name ?? '').includes('service')) continue;
		const cpu = Number.parseFloat(String(o.cpu ?? '').replace('%', ''));
		if (!Number.isNaN(cpu) && cpu > cpuPeak) cpuPeak = cpu;
		const m = String(o.mem ?? '').match(/^([\d.]+)\s*([A-Za-z]+)\s*\//);
		if (m) {
			const val = Number.parseFloat(m[1]);
			const unit = m[2];
			let mib = val;
			if (unit === 'B') mib = val / 1024 / 1024;
			else if (unit === 'KiB') mib = val / 1024;
			else if (unit === 'MiB') mib = val;
			else if (unit === 'GiB') mib = val * 1024;
			else if (unit === 'TiB') mib = val * 1024 * 1024;
			else if (unit === 'kB' || unit === 'KB') mib = val / 1000 / 1000 * 1024; // approx
			else if (unit === 'MB') mib = val * 1024 / 1000;
			else if (unit === 'GB') mib = val * 1024 * 1024 / 1000;
			if (mib > rssPeakMiB) rssPeakMiB = mib;
		}
	}
	return { cpuPeak, rssPeakMiB };
}

function fmt(n) {
	if (Number.isNaN(n)) return 'n/a';
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// The paths come from the command line, so the report reads only inside the run's shared directory.
const SHARED_DIR = path.resolve(process.env.LOAD_SHARED_DIR ?? '/home/dlesieur/wt-ai-night/tmp');
function sharedFile(arg) {
	if (!arg) return undefined;
	const file = path.resolve(SHARED_DIR, arg);
	if (!file.startsWith(SHARED_DIR + path.sep)) {
		console.error(`report.mjs reads only under ${SHARED_DIR} (LOAD_SHARED_DIR): ${arg}`);
		process.exit(2);
	}
	return file;
}

function main() {
	const runsPath = sharedFile(process.argv[2]);
	const statsPath = sharedFile(process.argv[3]);
	const loadavgPath = sharedFile(process.argv[4]);
	if (!runsPath) {
		console.error('usage: node report.mjs <runs.jsonl> [stats.jsonl] [loadavg.json]');
		process.exit(2);
	}
	const records = fs
		.readFileSync(runsPath, 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const summary = summarize(records);
	const peaks = parseStats(statsPath);
	const la = loadavgPath && fs.existsSync(loadavgPath) ? JSON.parse(fs.readFileSync(loadavgPath, 'utf8')) : null;

	console.log('# Load report');
	console.log('');
	if (peaks) {
		console.log(`Service CPU peak: ${fmt(peaks.cpuPeak)}% ; RSS peak: ${fmt(peaks.rssPeakMiB)} MiB`);
	}
	if (la) {
		console.log(`Host loadavg start: ${la.start.map((x) => x.toFixed(2)).join(', ')} ; end: ${la.end.map((x) => x.toFixed(2)).join(', ')}`);
	}
	console.log('');
	for (const s of summary) {
		console.log(`## ${s.phase} / ${s.step}`);
		console.log(`n=${s.n} errorRate=${(s.errorRate * 100).toFixed(2)}%`);
		console.log(`errors: ${JSON.stringify(s.errors)}`);
		console.log(`overhead p50=${fmt(s.overhead.p50)} p95=${fmt(s.overhead.p95)} p99=${fmt(s.overhead.p99)} ms ; p95 CI 95% = [${fmt(s.overheadCI.low)}, ${fmt(s.overheadCI.high)}] ms`);
		console.log(`duration p50=${fmt(s.duration.p50)} p95=${fmt(s.duration.p95)} ms`);
		console.log('');
	}

	// Knee: first steps entry (in order 35,70,140,280) with overhead p95 > 150 or error rate > 1%.
	const steps = summary.filter((s) => s.phase === 'steps').sort((a, b) => Number(a.step) - Number(b.step));
	let knee = null;
	for (const s of steps) {
		if (s.overhead.p95 > 150 || s.errorRate > 0.01) {
			knee = s;
			break;
		}
	}
	console.log(`Knee: ${knee ? `${knee.step} concurrent (overhead p95 ${fmt(knee.overhead.p95)} ms, error rate ${(knee.errorRate * 100).toFixed(2)}%)` : 'none (all steps within budget)'}`);
	const s70 = steps.find((s) => s.step === '70');
	if (s70) {
		console.log(`Verdict input: overhead p95 at 70 concurrent = ${fmt(s70.overhead.p95)} ms [${fmt(s70.overheadCI.low)}, ${fmt(s70.overheadCI.high)}], budget 150 ms: ${s70.overhead.p95 <= 150 && s70.errorRate <= 0.01 ? 'holds' : 'does not hold'}`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
