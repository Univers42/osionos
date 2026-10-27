import { it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const event = (pageId, actor = `${IDS.userB}:tab-one`) => ({ event: 'collab', payload: { t: 'blocks', actor, seq: 1, pageId, ops: [{ k: 'del', id: 'block', v: 1 }] } });

async function attempt({ role = 'viewer', pageId = IDS.sharedA, mutate = () => {}, actor } = {}) {
  const world = teamWorld({ memberRole: role });
  mutate(world);
  const mock = createPostgrestMock(world);
  const publishes = [];
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/v1/publish')) {
      publishes.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    return mock.fetchImpl(url, init);
  };
  return withBridge(config, fetchImpl, async (base) => {
    const result = await send(base, `/api/collaboration/${IDS.team}/events`, sessionHeaders(config, IDS.userB, IDS.homeB), post(event(pageId, actor)));
    return { result, publishes };
  });
}

it('refuses blocks from a space member who can only view the page', async () => {
  const { result, publishes } = await attempt();
  assert.equal(result.status, 403, result.text);
  assert.equal(publishes.length, 0);
});
it('forwards blocks from a page editor in the target workspace', async () => {
  const { result, publishes } = await attempt({ role: 'editor' });
  assert.equal(result.status, 200, result.text);
  assert.equal(publishes.length, 1);
  assert.equal(publishes[0].topic, `collab:${IDS.team}`);
  assert.deepEqual(publishes[0].payload, event(IDS.sharedA));
});
it('preserves the durable write gate for a viewer with a legacy collaborator grant', async () => {
  const { result } = await attempt({ mutate(world) {
    world.osionos_pages.find((p) => p.id === IDS.sharedA).collaborators = [{ userId: IDS.userB, role: 'editor' }];
  } });
  assert.equal(result.status, 403, result.text);
});
it('never forwards an unreadable page or another workspace page', async () => {
  for (const pageId of [IDS.privateA, IDS.missing]) {
    const { result, publishes } = await attempt({ role: 'editor', pageId });
    assert.equal(result.status, 404, result.text);
    assert.equal(publishes.length, 0);
  }
});
it('rejects a forged persona in the content actor', async () => {
  const { result, publishes } = await attempt({ role: 'editor', actor: `${IDS.userA}:tab-forged` });
  assert.equal(result.status, 403, result.text);
  assert.equal(publishes.length, 0);
});
it('issues a subscribe-only collab token so direct socket publishes cannot bypass the bridge', async () => {
  const mock = createPostgrestMock(teamWorld());
  await withBridge(config, mock.fetchImpl, async (base) => {
    const token = await send(base, `/api/collaboration/${IDS.team}/realtime-token`, sessionHeaders(config, IDS.userB, IDS.homeB), post({}));
    assert.equal(token.status, 200, token.text);
    const claims = JSON.parse(Buffer.from(token.body.token.split('.')[1], 'base64url'));
    assert.equal(claims.can_publish, false);
    assert.equal(claims.can_subscribe, true);
    // Presence only: the gateway lets this token TRACK on its own topic, never publish.
    assert.deepEqual(claims.metadata, { can_track: true });
  }, { env: { JWT_SECRET: 'synthetic-collab-secret' } });
});

it('rejects blocks for an owned page in a different workspace', async () => {
  const { result, publishes } = await attempt({ mutate(world) {
    world.osionos_pages.find((p) => p.id === IDS.pageB).workspace_id = IDS.homeB;
  }, pageId: IDS.pageB });
  assert.equal(result.status, 404, result.text);
  assert.equal(publishes.length, 0);
});
