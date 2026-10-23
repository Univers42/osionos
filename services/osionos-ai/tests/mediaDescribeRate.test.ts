import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { startMockVlm } from './mockVlm.ts';
import { pngBytes } from './visionFixtures.ts';

/** The window of the describes: the third one in a minute is a 429, and the bridge is not asked. */
const vlm = await startMockVlm();
process.env.OSIONOS_AI_VLM_URL = vlm.baseUrl;
process.env.OSIONOS_AI_DESCRIBE_PER_MINUTE = '2';

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor } = await startHarness();
const OWNER = '00000000-0000-4000-8000-0000000000aa';

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await vlm.close();
});

describe('media describe: rate limit', () => {
	it('refuses past the window with Retry-After, before fetching the bytes', async () => {
		const statuses: number[] = [];
		let last: Response | null = null;
		for (let index = 0; index < 3; index += 1) {
			const path = `/api/media/uploads/${OWNER}/${String(index).repeat(64)}.png`;
			bridge.serve(path, { bytes: pngBytes({ width: 30 + index, height: 30 }), contentType: 'image/png' });
			last = await fetch(`${base}/api/ai/media/describe`, {
				method: 'POST',
				headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ path }),
			});
			statuses.push(last.status);
		}
		assert.deepEqual(statuses, [200, 200, 429]);
		assert.ok(Number(last?.headers.get('retry-after')) > 0);
		assert.equal(bridge.count, 2);
	});
});
