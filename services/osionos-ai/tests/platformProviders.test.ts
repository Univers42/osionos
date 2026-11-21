import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePlatformModels } from '../src/platformModels.ts';
import { decodePlatformProviders } from '../src/platformProviders.ts';

const noDev = { devHosts: [] as string[] };
const model = (id: string, extra: object = {}) => ({
	id,
	label: id,
	inputMicroUsdPerMTok: 0,
	outputMicroUsdPerMTok: 0,
	upstreamId: `up/${id}`,
	...extra,
});
const provider = (id: string, extra: object = {}) => ({
	id,
	baseUrl: `https://${id}.example.com/v1`,
	wire: 'openai-compatible',
	models: [model(`${id}-m`)],
	...extra,
});
const decode = (value: unknown, opts: Parameters<typeof decodePlatformProviders>[1] = noDev) => decodePlatformProviders(JSON.stringify(value), opts);

test('unset, empty and blank decode to an empty pool', () => {
	for (const raw of [undefined, '', '  \n']) assert.deepEqual(decodePlatformProviders(raw, noDev), []);
});

test('broken JSON is null', () => {
	assert.equal(decodePlatformProviders('{nope', noDev), null);
});

test('a valid two-provider value round-trips with derived fields', () => {
	const out = decode([
		provider('alpha', { apiKeyEnv: 'OSIONOS_AI_KEY_ALPHA', wire: 'openrouter' }),
		provider('beta', { models: [model('b', { input: ['text', 'image'], rank: 2, dataUse: 'no-train', default: true })] }),
	]);
	assert.ok(out);
	assert.equal(out.length, 2);
	assert.equal(out[0].apiKeyEnv, 'OSIONOS_AI_KEY_ALPHA');
	assert.equal(out[0].wire, 'openrouter');
	assert.equal(out[0].models[0].default, false);
	assert.equal(out[0].models[0].vision, false);
	const b = out[1].models[0];
	assert.deepEqual([b.vision, b.default, b.rank, b.dataUse, b.upstreamId], [true, true, 2, 'no-train', 'up/b']);
});

test('an apiKeyEnv outside OSIONOS_AI_KEY_* is null (FA3)', () => {
	for (const env of ['OSIONOS_AI_KEK', 'OSIONOS_AI_DATABASE_URL']) {
		assert.equal(decode([provider('a', { apiKeyEnv: env })]), null);
	}
});

test('a plain-http baseUrl is null unless its host is a dev host (FA4)', () => {
	assert.equal(decode([provider('a', { baseUrl: 'http://example.com/v1' })]), null);
	const local = [provider('a', { baseUrl: 'http://osionos-ai-llm:8080/v1' })];
	assert.equal(decode(local), null);
	assert.ok(decode(local, { devHosts: ['osionos-ai-llm'] }));
	assert.equal(decode([provider('a', { baseUrl: 'ftp://x.example.com' })], { devHosts: ['x.example.com'] }), null);
	assert.equal(decode([provider('a', { baseUrl: 'not a url' })]), null);
});

test('dataUse is an enum and defaults to may-train (FA24)', () => {
	assert.equal(decode([provider('a', { models: [model('m', { dataUse: 'sometimes' })] })]), null);
	assert.equal(decode([provider('a')])?.[0].models[0].dataUse, 'may-train');
});

test('duplicate provider ids, bad ids and empty model lists are null', () => {
	assert.equal(decode([provider('a'), provider('a')]), null);
	assert.equal(decode([provider('Bad_Id')]), null);
	assert.equal(decode([provider('a', { models: [] })]), null);
});

test('unknown keys are stripped, never trusted', () => {
	const out = decode([provider('a', { apiKey: 'sk-x', models: [model('m', { secret: 1 })] })]);
	assert.ok(out);
	assert.ok(!('apiKey' in out[0]));
	assert.ok(!('secret' in out[0].models[0]));
});

test('legacy platform models decode unchanged, without a dataUse key', () => {
	const legacy = [
		{ id: 'a', label: 'A', inputMicroUsdPerMTok: 1, outputMicroUsdPerMTok: 2, default: true },
		{ id: 'b', label: 'B', inputMicroUsdPerMTok: 3, outputMicroUsdPerMTok: 4 },
	];
	const out = decodePlatformModels(JSON.stringify(legacy));
	assert.ok(out);
	assert.equal(out.length, 2);
	assert.ok(out.every((entry) => !('dataUse' in entry)));
});

test('legacy platform models keep an explicit dataUse', () => {
	const legacy = [{ id: 'a', label: 'A', inputMicroUsdPerMTok: 1, outputMicroUsdPerMTok: 2, default: true, dataUse: 'no-train' }];
	assert.equal(decodePlatformModels(JSON.stringify(legacy))?.[0].dataUse, 'no-train');
});

const dropped = (providers: unknown[], publicMode: boolean) => {
	const lines: string[] = [];
	const out = decode(providers, { devHosts: [], publicMode, log: (line: string) => lines.push(line) });
	return { ids: out?.map((entry) => entry.id), lines };
};

test('the reserved id legacy is dropped with an id-only log, the rest kept (S LOW 3)', () => {
	const { ids, lines } = dropped([provider('legacy', { apiKeyEnv: 'OSIONOS_AI_KEY_LEG' }), provider('kept')], false);
	assert.deepEqual(ids, ['kept']);
	assert.equal(lines.length, 1);
	assert.ok(lines[0].includes('legacy'));
	assert.ok(!lines[0].includes('OSIONOS_AI_KEY_LEG') && !lines[0].includes('example.com'));
});

const INTERNAL_HOSTS: Record<string, string[]> = {
	'single label': ['https://osionos-ai-llm/v1', 'https://osionos-ai-llm:8080/v1'],
	localhost: ['https://localhost/v1', 'https://LOCALHOST:8443/v1'],
	'loopback IP': ['https://127.0.0.1/v1', 'https://[::1]/v1'],
	'private IP': ['https://10.0.0.5/v1', 'https://192.168.1.2/v1', 'https://172.16.0.1/v1'],
	'link-local IP': ['https://169.254.169.254/v1', 'https://[fe80::1]/v1'],
	'unique-local IP': ['https://[fd00::1]/v1'],
	'trailing-dot': ['https://localhost./v1', 'https://127.0.0.1./v1', 'https://osionos-ai-llm./v1', 'https://ai.localhost./v1'],
};

for (const [label, urls] of Object.entries(INTERNAL_HOSTS)) {
	test(`public mode drops a provider on a ${label} host, id-only log (S LOW 2)`, () => {
		for (const baseUrl of urls) {
			const { ids, lines } = dropped([provider('inside', { baseUrl }), provider('kept')], true);
			assert.deepEqual(ids, ['kept'], baseUrl);
			assert.equal(lines.length, 1, baseUrl);
			assert.ok(lines[0].includes('inside') && !lines[0].includes(new URL(baseUrl).hostname), lines[0]);
		}
	});
}

test('off public mode an internal host stays; in it a public host stays', () => {
	assert.deepEqual(dropped([provider('inside', { baseUrl: 'https://osionos-ai-llm/v1' })], false).ids, ['inside']);
	assert.deepEqual(dropped([provider('pub', { baseUrl: 'https://8.8.8.8/v1' }), provider('named')], true).ids, ['pub', 'named']);
});
