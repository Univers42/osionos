import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

/**
 * The knowledge packs: the manifest, the Markdown sections, the import CLI,
 * the retrieval of a pack next to the workspace, and the run that quotes one.
 *
 * The system workspace is process configuration, so it is set BEFORE the
 * service (and its config) is imported: the imports below are dynamic on
 * purpose, the way the harness reads the environment once.
 */

/** The dedicated system workspace of this file. */
const SYSTEM_WORKSPACE = '55555555-5555-4555-8555-555555555555';

process.env.OSIONOS_AI_SYSTEM_WORKSPACE_ID = SYSTEM_WORKSPACE;
delete process.env.OSIONOS_AI_RERANK_URL;
delete process.env.OSIONOS_AI_ABSTAIN_THRESHOLD;

const { startMockEmbedder } = await import('./mockEmbed.ts');
const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const { startHarness } = await import('./harness.ts');
const harness = await startHarness();
const db = harness.app.db;

const { retrieve } = await import('../src/retrieval/search.ts');
const { parsePackManifest } = await import('../src/packs/manifest.ts');
const { markdownSections } = await import('../src/packs/markdown.ts');
const { findBuiltinAgent } = await import('../src/agents/builtins.ts');
const { startRun } = await import('../src/runs/runner.ts');
const { resolveTarget } = await import('../src/gateway/resolve.ts');
const { Seeds, USER_A, WORKSPACE_A, vectorOf } = await import('./retrievalSeed.ts');
import type { AuthUser } from '../src/auth.ts';
import type { BuiltinAgent } from '../src/agents/builtins.ts';

const execFileAsync = promisify(execFile);

/** The service, and the repository root the manifests resolve against. */
const SERVICE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PACKS = join(SERVICE_DIR, 'tests/fixtures/packs');

/** The callers of the tests. */
const userA: AuthUser = {
	userId: USER_A,
	workspaceId: WORKSPACE_A,
	memberWorkspaces: [],
	isAdmin: false,
	issuedAtMs: Date.now(),
};
const stranger: AuthUser = {
	userId: '99999999-9999-4999-8999-999999999999',
	workspaceId: '99999999-9999-4999-8999-999999999998',
	memberWorkspaces: [],
	isAdmin: false,
	issuedAtMs: Date.now(),
};

const seeds = new Seeds(db);
const tempRoots: string[] = [];

/** The output of one import. */
interface ImportRun {
	status: number | null;
	stdout: string;
	stderr: string;
	packs: { slug: string; docs: number; embedded: number; unchanged: number; removed: number }[];
}

/** The JSON lines the CLI prints, one per pack. */
function jsonLines(stdout: string): ImportRun['packs'] {
	return stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as ImportRun['packs'][number]);
}

/**
 * The import CLI, as an operator runs it.
 *
 * The child is ASYNC: the mock embedder is a server in THIS process, and a
 * blocking spawn would deadlock on its own mock.
 */
async function runImport(packsDir: string, repoRoot: string, env: Record<string, string> = {}): Promise<ImportRun> {
	const options = {
		cwd: SERVICE_DIR,
		env: { ...process.env, ...env },
		timeout: 120_000,
		maxBuffer: 8 * 1024 * 1024,
	};
	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			['--experimental-strip-types', 'src/packs/import.ts', packsDir, repoRoot],
			options,
		);
		return { status: 0, stdout, stderr: '', packs: jsonLines(stdout) };
	} catch (error) {
		const failed = error as { code?: number | string; stdout?: string; stderr?: string };
		return {
			status: typeof failed.code === 'number' ? failed.code : null,
			stdout: failed.stdout ?? '',
			stderr: failed.stderr ?? '',
			packs: jsonLines(failed.stdout ?? ''),
		};
	}
}

/** A temporary packs directory: the fixtures, copyable and editable. */
async function importFixtures(): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), 'osionos-packs-'));
	cpSync(FIXTURE_PACKS, root, { recursive: true });
	tempRoots.push(root);
	const result = await runImport(root, root);
	assert.equal(result.status, 0, result.stderr);
	return root;
}

/** The chunks of one document, by id, in order. */
async function chunkIds(slug: string, path: string): Promise<string[]> {
	const result = await db.query<{ id: string }>(
		`select c.id::text as id
		   from public.ai_chunks c
		   join public.ai_pack_docs d on d.id = c.source_id
		   join public.ai_packs p on p.id = d.pack_id
		  where c.source_kind = 'pack' and p.slug = $1 and d.path = $2
		  order by c.ord, c.id`,
		[slug, path],
	);
	return result.rows.map((row) => String(row.id));
}

/** The packs and the system workspace, gone: the next test starts clean. */
async function clearPacks(): Promise<void> {
	await db.query(`delete from public.ai_packs where slug = any($1::text[])`, [['alpha', 'beta']]);
	await db.query(`delete from public.ai_chunks where source_kind = 'pack' and workspace_id = $1`, [SYSTEM_WORKSPACE]);
	await db.query(`delete from public.osionos_pages where workspace_id = $1`, [SYSTEM_WORKSPACE]);
}

/** The system prompt of a request. */
function systemOf(body: unknown): string {
	const messages = (body as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
	const system = messages.find((message) => message.role === 'system');
	return typeof system?.content === 'string' ? system.content : '';
}

/** The text of the user turn of a request. */
function userTurnOf(body: unknown): string {
	const messages = (body as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== 'user') continue;
		if (typeof message.content === 'string') return message.content;
		if (!Array.isArray(message.content)) return '';
		return message.content
			.map((part) => {
				const candidate = part as { text?: unknown } | null;
				return typeof candidate?.text === 'string' ? candidate.text : '';
			})
			.join(' ');
	}
	return '';
}

/** A run started directly, with the agent of the test. */
async function runWith(
	text: string,
	agent: BuiltinAgent | null,
	searchWorkspace: boolean,
): Promise<{ events: { type: string; data: unknown }[] }> {
	const resolved = await resolveTarget(db, harness.app.redis, userA, undefined, undefined);
	assert.equal(resolved.kind, 'resolved');
	if (resolved.kind !== 'resolved') return { events: [] };
	const conversationId = await harness.createConversation();
	const events: { type: string; data: unknown }[] = [];
	const outcome = await startRun({
		db,
		redis: harness.app.redis,
		runId: randomUUID(),
		conversationId,
		ownerId: USER_A,
		text,
		target: resolved.target,
		user: userA,
		searchWorkspace,
		agent,
		emit: (event) => events.push({ type: event.type, data: event.data }),
	});
	assert.equal(outcome.kind, 'started');
	if (outcome.kind !== 'started') return { events };
	await outcome.execute();
	return { events };
}

before(async () => {
	await seeds.clear();
	await clearPacks();
});

beforeEach(async () => {
	await seeds.clear();
	await clearPacks();
	await db.query('delete from public.ai_conversations');
	await db.query('delete from public.ai_usage_daily');
});

afterEach(() => {
	while (tempRoots.length > 0) {
		const root = tempRoots.pop();
		if (root) rmSync(root, { recursive: true, force: true });
	}
});

after(async () => {
	// The close of the harness and of the embedder must happen whatever the
	// cleanup does: a throw before it keeps the servers open, and the test
	// process hangs on them forever.
	try {
		await clearPacks();
		await seeds.clear();
	} finally {
		await embedder.close();
		await harness.app.close();
		await harness.mock.close();
	}
});

describe('the pack manifest', () => {
	const base = { slug: 'alpha', title: 'Alpha pack', description: '', docs: ['alpha/one.md'] };

	function refused(patch: Record<string, unknown>, field: string): void {
		assert.throws(
			() => parsePackManifest({ ...base, ...patch }, FIXTURE_PACKS),
			new RegExp(`pack_manifest_invalid:${field}`),
			`${JSON.stringify(patch)} is refused on ${field}`,
		);
	}

	it('refuses a document that leaves the root, is not Markdown, or is named twice', () => {
		refused({ docs: ['../x.md'] }, 'docs');
		refused({ docs: ['/etc/x.md'] }, 'docs');
		refused({ docs: ['a.txt'] }, 'docs');
		refused({ docs: ['alpha/one.md', 'alpha/one.md'] }, 'docs');
	});

	it('refuses a slug the SQL rejects and an empty title', () => {
		refused({ slug: 'Bad_Slug' }, 'slug');
		refused({ title: '' }, 'title');
	});

	it('accepts the fixture manifests', () => {
		for (const pack of ['alpha', 'beta']) {
			const json = JSON.parse(readFileSync(join(FIXTURE_PACKS, pack, 'pack.json'), 'utf8')) as unknown;
			const manifest = parsePackManifest(json, FIXTURE_PACKS);
			assert.equal(manifest.slug, pack);
			assert.equal(manifest.docs.length, 2);
		}
	});
});

describe('the Markdown sections', () => {
	it('the headings give the paths, and a fence is not a heading', () => {
		const text = [
			'# Doc Title',
			'',
			'the intro',
			'',
			'## First',
			'',
			'first body',
			'',
			'### Deep',
			'',
			'deep body',
			'',
			'```',
			'# not a heading',
			'```',
			'',
			'## Second',
			'',
			'second body',
		].join('\n');
		const chunks = markdownSections('docs/doc.md', text);
		assert.deepEqual(
			chunks.map((chunk) => chunk.headingPath),
			['Doc Title', 'Doc Title › First', 'Doc Title › First › Deep', 'Doc Title › Second'],
		);
		assert.ok(chunks.some((chunk) => chunk.content.includes('# not a heading')), 'the fence is text');
		assert.ok(!chunks.some((chunk) => chunk.headingPath.includes('not a heading')), 'the fence is not a heading');
	});

	it('a long section splits, and the hashes are stable', () => {
		const paragraph = 'A sentence about the pipeline. '.repeat(160);
		const text = `# Long\n\n## One\n\n${paragraph}\n`;
		const first = markdownSections('docs/long.md', text);
		const second = markdownSections('docs/long.md', text);
		assert.ok(first.length > 1, 'the long section is cut');
		assert.deepEqual(
			first.map((chunk) => chunk.contentHash),
			second.map((chunk) => chunk.contentHash),
		);
		assert.ok(first.every((chunk) => chunk.headingPath === 'Long › One'));
	});
});

describe('the pack import', () => {
	it('the chunks land as packs in the system workspace', async () => {
		await importFixtures();
		const result = await db.query<{ workspace_id: string; source_kind: string; count: number }>(
			`select workspace_id::text as workspace_id, source_kind, count(*)::int as count
			   from public.ai_chunks where source_kind = 'pack'
			  group by 1, 2`,
		);
		assert.ok(result.rows.length > 0, 'the import wrote chunks');
		for (const row of result.rows) {
			assert.equal(row.workspace_id, SYSTEM_WORKSPACE);
			assert.equal(row.source_kind, 'pack');
		}
	});

	it('a re-import with no change calls no embedder', async () => {
		const root = await importFixtures();
		const calls = embedder.calls;
		const again = await runImport(root, root);
		assert.equal(again.status, 0, again.stderr);
		assert.equal(embedder.calls, calls, 'no embed call');
		assert.ok(again.packs.every((pack) => pack.embedded === 0));
		assert.ok(again.packs.every((pack) => pack.unchanged === pack.docs));
	});

	it('editing one document re-embeds only that document', async () => {
		const root = await importFixtures();
		const oneBefore = await chunkIds('alpha', 'alpha/one.md');
		const twoBefore = await chunkIds('alpha', 'alpha/two.md');
		const file = join(root, 'alpha/one.md');
		writeFileSync(file, `${readFileSync(file, 'utf8')}\nA new sentence about alphachanged.\n`, 'utf8');

		const calls = embedder.calls;
		const changed = await runImport(root, root);
		assert.equal(changed.status, 0, changed.stderr);
		assert.ok(embedder.calls > calls, 'the changed document is embedded');
		assert.ok((changed.packs.find((pack) => pack.slug === 'alpha')?.embedded ?? 0) > 0);
		assert.equal(changed.packs.find((pack) => pack.slug === 'beta')?.embedded, 0);

		const oneAfter = await chunkIds('alpha', 'alpha/one.md');
		assert.notDeepEqual(oneAfter, oneBefore, 'the changed document has new chunks');
		assert.deepEqual(await chunkIds('alpha', 'alpha/two.md'), twoBefore, 'the other document is untouched');
	});

	it('a document removed from the manifest takes its chunks with it', async () => {
		const root = await importFixtures();
		const manifestFile = join(root, 'alpha/pack.json');
		const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { docs: string[] };
		manifest.docs = ['alpha/one.md'];
		writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');

		const removed = await runImport(root, root);
		assert.equal(removed.status, 0, removed.stderr);
		assert.equal(removed.packs.find((pack) => pack.slug === 'alpha')?.removed, 1);
		assert.deepEqual(await chunkIds('alpha', 'alpha/two.md'), [], 'the chunks are gone');
		const row = await db.query(
			`select 1 from public.ai_pack_docs d join public.ai_packs p on p.id = d.pack_id
			  where p.slug = 'alpha' and d.path = 'alpha/two.md'`,
		);
		assert.equal(row.rowCount, 0, 'the document row is gone');
	});

	it('exits 2, in one line, when the system workspace is unset', async () => {
		const root = await importFixtures();
		const result = await runImport(root, root, { OSIONOS_AI_SYSTEM_WORKSPACE_ID: '' });
		assert.equal(result.status, 2);
		assert.equal(result.stderr.trim().split('\n').length, 1, 'one line');
	});

	it('exits 2 when the system workspace holds a page (C45)', async () => {
		const root = await importFixtures();
		await seeds.page({
			workspaceId: SYSTEM_WORKSPACE,
			ownerId: USER_A,
			title: 'Not knowledge',
			visibility: 'private',
			content: 'a page in the system workspace',
			embedding: vectorOf('a page in the system workspace'),
		});
		const result = await runImport(root, root);
		assert.equal(result.status, 2);
		assert.equal(result.stderr.trim().split('\n').length, 1, 'one line');
	});
});

describe('the pack retrieval', () => {
	it('returns the packs the agent carries, and never another one', async () => {
		await importFixtures();
		const found = await retrieve(db, userA, { query: 'alphazorblax', packs: ['alpha'] });
		assert.ok(found.length > 0, 'alpha answers');
		for (const chunk of found) {
			assert.equal(chunk.collection, 'pack');
			assert.equal(chunk.pageId, '');
			assert.equal(chunk.packSlug, 'alpha');
			assert.ok(!String(chunk.docPath).startsWith('beta/'), 'never a beta chunk');
		}
	});

	it('a caller with no workspace membership still gets its packs', async () => {
		await importFixtures();
		const found = await retrieve(db, stranger, { query: 'alphazorblax', packs: ['alpha'] });
		assert.ok(found.length > 0, 'a pack needs no membership');
		assert.ok(found.every((chunk) => chunk.collection === 'pack' && chunk.packSlug === 'alpha'));
	});

	it('a retired pack answers nothing', async () => {
		await importFixtures();
		await db.query(`update public.ai_packs set status = 'retired' where slug = 'alpha'`);
		const found = await retrieve(db, userA, { query: 'alphazorblax', packs: ['alpha'] });
		assert.deepEqual(found, []);
	});

	it('packs are off when the system workspace is unset', async () => {
		await importFixtures();
		const dbUrl = pathToFileURL(join(SERVICE_DIR, 'src/db.ts')).href;
		const searchUrl = pathToFileURL(join(SERVICE_DIR, 'src/retrieval/search.ts')).href;
		const script = [
			`import { createPool } from ${JSON.stringify(dbUrl)};`,
			`import { retrieve } from ${JSON.stringify(searchUrl)};`,
			'const pool = createPool(process.env.OSIONOS_AI_DATABASE_URL);',
			`const user = { userId: '99999999-9999-4999-8999-999999999999', workspaceId: '99999999-9999-4999-8999-999999999998', memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() };`,
			`const chunks = await retrieve(pool, user, { query: 'alphazorblax', packs: ['alpha'] });`,
			'console.log(JSON.stringify({ count: chunks.length }));',
			'await pool.end();',
		].join('\n');
		const { stdout } = await execFileAsync(
			process.execPath,
			['--experimental-strip-types', '--input-type=module', '-e', script],
			{
				cwd: SERVICE_DIR,
				env: { ...process.env, OSIONOS_AI_SYSTEM_WORKSPACE_ID: '' },
				timeout: 120_000,
			},
		);
		const last = stdout.trim().split('\n').at(-1) ?? '{}';
		assert.equal((JSON.parse(last) as { count: number }).count, 0);
	});

	it('a page chunk in the system workspace never comes back as a pack', async () => {
		await importFixtures();
		await seeds.page({
			workspaceId: SYSTEM_WORKSPACE,
			ownerId: USER_A,
			title: 'System page',
			visibility: 'private',
			content: 'the systempagezorblax page is not a pack',
			embedding: vectorOf('query: systempagezorblax'),
		});
		const found = await retrieve(db, userA, { query: 'systempagezorblax', packs: ['alpha'] });
		assert.ok(found.every((chunk) => chunk.collection === 'pack'));
		assert.ok(!found.some((chunk) => chunk.snippet.includes('systempagezorblax')));
	});

	it('no packs is exactly today\'s page-only answer', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Void pack page',
			visibility: 'shared',
			content: 'the voidpackzorblax answer lives here',
			embedding: vectorOf('query: voidpackzorblax'),
		});
		const today = await retrieve(db, userA, { query: 'voidpackzorblax' });
		const withEmpty = await retrieve(db, userA, { query: 'voidpackzorblax', packs: [] });
		assert.ok(today.length > 0, 'the page answers');
		assert.deepEqual(withEmpty, today);
	});
});

describe('the pack run', () => {
	it('quotes a pack in the user turn and cites it as a pack', async () => {
		await importFixtures();
		const guide = findBuiltinAgent('guide');
		assert.ok(guide);
		if (!guide) return;
		const agent: BuiltinAgent = { ...guide, knowledge: Object.freeze(['alpha']) };

		const { events } = await runWith('alphazorblax', agent, false);
		const body = harness.mock.lastBody();
		const userTurn = userTurnOf(body);
		assert.ok(userTurn.includes('<source n="1" collection="pack" pack="alpha"'), 'the pack is quoted as data');
		assert.ok(!systemOf(body).includes('<source n='), 'the system prompt does not hold a source');
		assert.ok(!systemOf(body).includes('Alpha pack'), 'the pack title is not in the prompt (C47)');

		const citations = events.filter((event) => event.type === 'citation');
		assert.ok(citations.length > 0, 'the run cites what it quoted');
		const first = citations[0]?.data as { collection?: string; pageId?: string; pack?: string };
		assert.equal(first.collection, 'pack');
		assert.equal(first.pack, 'alpha');
		assert.equal('pageId' in first, false, 'a pack citation has no pageId');
	});

	it('a run with no agent cites its pages as pages', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Page citation',
			visibility: 'shared',
			content: 'the packpagezorblax answer lives here',
			embedding: vectorOf('query: packpagezorblax'),
		});
		const { events } = await runWith('packpagezorblax', null, true);
		const citations = events.filter((event) => event.type === 'citation');
		assert.ok(citations.length > 0, 'the run cites its page');
		const first = citations[0]?.data as { collection?: string; pageId?: string };
		assert.equal(first.collection, 'page');
		assert.equal(typeof first.pageId, 'string');
		assert.ok((first.pageId ?? '').length > 0, 'a page citation keeps its pageId');
	});
});

describe('the pack grants', () => {
	it('authenticated cannot read ai_packs or ai_pack_docs', async () => {
		const client = await db.connect();
		try {
			await client.query('begin');
			await client.query('set local role authenticated');
			for (const table of ['ai_packs', 'ai_pack_docs']) {
				// A statement that fails aborts the transaction: each probe gets
				// its own savepoint, so the next one still runs.
				await client.query(`savepoint ${table}`);
				await assert.rejects(
					() => client.query(`select 1 from public.${table} limit 1`),
					(error: { code?: string }) => error.code === '42501',
				);
				await client.query(`rollback to savepoint ${table}`);
			}
			await client.query('rollback');
		} finally {
			// A failed probe leaves the transaction aborted: take it back, so a
			// client released into the pool is never dirty (a dirty client
			// inherits its abort into every later query of the pool).
			await client.query('rollback').catch(() => {});
			client.release();
		}
	});
});
