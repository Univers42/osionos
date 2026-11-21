import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalog, type CatalogEnv } from '../src/gateway/catalog.ts';
import { decodePlatformModels, type PlatformModelEntry } from '../src/platformModels.ts';
import type { PlatformProvider } from '../src/platformProviders.ts';

const legacyEntry = (id: string, extra: object = {}): PlatformModelEntry => ({
	id,
	label: id,
	inputMicroUsdPerMTok: 0,
	outputMicroUsdPerMTok: 0,
	default: false,
	dataUse: 'no-train',
	...extra,
});
const LEGACY = [legacyEntry('base', { default: true })];
const poolModel = (id: string, extra: object = {}) => ({ ...legacyEntry(id), upstreamId: `up/${id}`, dataUse: 'no-train' as const, ...extra });
const provider = (id: string, models = [poolModel(`${id}-m`)], extra: object = {}): PlatformProvider => ({
	id,
	baseUrl: `https://${id}.example.com/v1`,
	wire: 'openai-compatible',
	models,
	...extra,
});
const baseEnv = (extra: Partial<CatalogEnv> = {}, lines: string[] = []): CatalogEnv => ({
	publicMode: false,
	keyOf: () => undefined,
	log: (line) => lines.push(line),
	...extra,
});
const OR = 'https://openrouter.ai/api/v1';
const built = (legacy: PlatformModelEntry[], providers: PlatformProvider[], env = baseEnv()) => {
	const out = buildCatalog(legacy, providers, env, OR);
	assert.ok(!('refused' in out), JSON.stringify(out));
	return out;
};

test('legacy only config decodes byte-identical', () => {
	const legacy = decodePlatformModels(JSON.stringify([{ id: 'a', label: 'A', inputMicroUsdPerMTok: 1, outputMicroUsdPerMTok: 2, default: true, dataUse: 'no-train' }, { id: 'b', label: 'B', input: ['text', 'image'], inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0 }]));
	assert.ok(legacy);
	const out = built(legacy, []);
	assert.deepEqual(out.entries.map((entry) => entry.pricing), legacy);
	assert.deepEqual(out.entries.map((entry) => [entry.menuId, entry.upstreamId, entry.providerId, entry.wire]), [['a', 'a', 'legacy', 'openrouter'], ['b', 'b', 'legacy', 'openrouter']]);
	assert.equal(out.defaultId, 'a');
	assert.deepEqual(out.providers, []);
});

test('legacy wire is openai-compatible off the openrouter host', () => {
	const out = buildCatalog(LEGACY, [], baseEnv(), 'https://llm.example.com/v1');
	assert.ok(!('refused' in out));
	assert.equal(out.entries[0].wire, 'openai-compatible');
});

test('menu ids unique across the union (FA1)', () => {
	const within = provider('alpha', [poolModel('x'), poolModel('x')]);
	assert.deepEqual(buildCatalog(LEGACY, [within], baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_PROVIDERS' });
	const across = [provider('alpha', [poolModel('x')]), provider('beta', [poolModel('x')])];
	assert.deepEqual(buildCatalog(LEGACY, across, baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_PROVIDERS' });
	assert.deepEqual(buildCatalog(LEGACY, [provider('alpha', [poolModel('base')])], baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_PROVIDERS' });
});

test('exactly one default across the union', () => {
	assert.ok('refused' in buildCatalog(LEGACY, [provider('alpha', [poolModel('p', { default: true })])], baseEnv(), OR));
	assert.ok('refused' in buildCatalog([legacyEntry('base')], [provider('alpha')], baseEnv(), OR));
	assert.equal(built(LEGACY, [provider('alpha')]).defaultId, 'base');
});

test('same upstreamId on two providers gives two menu ids (FA2)', () => {
	const out = built(LEGACY, [provider('alpha', [poolModel('a-x', { upstreamId: 'shared/m' })]), provider('beta', [poolModel('b-x', { upstreamId: 'shared/m' })])]);
	const shared = out.entries.filter((entry) => entry.upstreamId === 'shared/m');
	assert.deepEqual(shared.map((entry) => entry.menuId), ['a-x', 'b-x']);
	assert.deepEqual(shared.map((entry) => entry.providerId), ['alpha', 'beta']);
});

test('provider with unset or empty key dropped, log names id only (FA6)', () => {
	const secret = 'sk-live-do-not-leak';
	const lines: string[] = [];
	const keys: Record<string, string> = { OSIONOS_AI_KEY_SET: secret, OSIONOS_AI_KEY_EMPTY: '' };
	const providers = [
		provider('kept', [poolModel('kept-m')], { apiKeyEnv: 'OSIONOS_AI_KEY_SET' }),
		provider('unset', [poolModel('unset-m')], { apiKeyEnv: 'OSIONOS_AI_KEY_MISSING' }),
		provider('empty', [poolModel('empty-m')], { apiKeyEnv: 'OSIONOS_AI_KEY_EMPTY' }),
	];
	const out = built(LEGACY, providers, baseEnv({ keyOf: (name) => keys[name] }, lines));
	assert.deepEqual(out.providers.map((p) => p.id), ['kept']);
	assert.deepEqual(out.entries.map((entry) => entry.menuId).sort(), ['base', 'kept-m']);
	assert.equal(lines.length, 2);
	assert.ok(lines[0].includes('unset') && lines[1].includes('empty'));
	assert.ok(!lines.join('\n').includes(secret));
});

test('public mode: a non-zero price refuses, off it builds (FA8)', () => {
	const priced = [provider('alpha', [poolModel('p', { inputMicroUsdPerMTok: 5 })])];
	assert.deepEqual(buildCatalog(LEGACY, priced, baseEnv({ publicMode: true }), OR), { refused: 'OSIONOS_AI_PLATFORM_PROVIDERS' });
	assert.deepEqual(buildCatalog([legacyEntry('base', { default: true, outputMicroUsdPerMTok: 1 })], [], baseEnv({ publicMode: true }), OR), { refused: 'OSIONOS_AI_PLATFORM_MODELS' });
	assert.ok(!('refused' in buildCatalog(LEGACY, priced, baseEnv(), OR)));
});

test('may-train default refuses (FA23)', () => {
	assert.deepEqual(buildCatalog([legacyEntry('base', { default: true, dataUse: 'may-train' })], [], baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_MODELS' });
	const pool = provider('alpha', [poolModel('p', { default: true, dataUse: 'may-train' })]);
	assert.deepEqual(buildCatalog([legacyEntry('base')], [pool], baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_PROVIDERS' });
});

test('unknown or missing dataUse on a legacy entry counts as may-train (FA24)', () => {
	for (const dataUse of ['bogus', undefined]) {
		const entry = legacyEntry('base', { default: true, dataUse });
		assert.deepEqual(buildCatalog([entry], [], baseEnv(), OR), { refused: 'OSIONOS_AI_PLATFORM_MODELS' });
		const out = built([legacyEntry('base', { default: true }), entry.id === 'base' ? legacyEntry('side', { dataUse }) : entry], []);
		assert.equal(out.entries.find((e) => e.menuId === 'side')?.dataUse, 'may-train');
	}
});

test('rank sorts ascending, unranked last in list order', () => {
	const out = built(LEGACY, [provider('alpha', [poolModel('u1'), poolModel('r2', { rank: 2 }), poolModel('r1', { rank: 1 }), poolModel('u2')])]);
	assert.deepEqual(out.entries.map((entry) => entry.menuId), ['r1', 'r2', 'base', 'u1', 'u2']);
});
