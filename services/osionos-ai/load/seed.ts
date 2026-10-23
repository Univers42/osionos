import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

const N = Number(process.env.LOAD_USERS ?? 500);
const CONVS_PER_USER = Number(process.env.LOAD_CONVS_PER_USER ?? 8);
const TOKENS_PATH = process.env.TOKENS_PATH ?? '/home/dlesieur/wt-ai-night/tmp/load-tokens.json';

const pool = new Pool({ connectionString: process.env.OSIONOS_AI_DATABASE_URL });
const secret = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const ttl = Number(process.env.OSIONOS_APP_SESSION_TTL_SECONDS ?? 3600);

interface SeedRow {
	userId: string;
	workspaceId: string;
	token: string;
	conversations: string[];
}

const rows: SeedRow[] = [];

for (let i = 0; i < N; i += 1) {
	const userId = randomUUID();
	const workspaceId = randomUUID();
	await pool.query(
		'insert into public.osionos_workspaces (id, owner_id, name) values ($1, $2, $3)',
		[workspaceId, userId, `load-ws-${i}`],
	);
	await pool.query(
		`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
		 values ($1, $2, 'owner', $3)`,
		[workspaceId, userId, ['read', 'create', 'update', 'delete', 'admin']],
	);
	const token = signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: secret, sessionTtlSeconds: ttl },
	}).token;
	const conversations: string[] = [];
	for (let c = 0; c < CONVS_PER_USER; c += 1) {
		const result = await pool.query<{ id: string }>(
			'insert into public.ai_conversations (owner_id, workspace_id, title) values ($1, $2, $3) returning id',
			[userId, workspaceId, 'load'],
		);
		conversations.push(result.rows[0].id);
	}
	rows.push({ userId, workspaceId, token, conversations });
}

writeFileSync(TOKENS_PATH, JSON.stringify(rows));
chmodSync(TOKENS_PATH, 0o600);
await pool.end();
console.log(JSON.stringify({ event: 'seeded', users: N, conversations: N * CONVS_PER_USER }));