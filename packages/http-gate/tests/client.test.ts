import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpClient, type FetchLike } from '../src/client.ts';
import { ApiError } from '../src/errors.ts';

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Record every call and answer with a caller-supplied response. */
function stubFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl: FetchLike = async (url, init) => {
    const call: Call = {
      url,
      method: init?.method,
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body as string | undefined,
    };
    calls.push(call);
    return respond(call);
  };
  return { impl, calls };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('throws the configured message when the base URL is empty', async () => {
  const client = createHttpClient({ baseUrl: '', missingBaseUrlMessage: 'VITE_API_URL is not configured.' });
  await assert.rejects(client.get('/x'), /VITE_API_URL is not configured\./);
});

test('joins base URL and path, and parses the JSON body', async () => {
  const { impl, calls } = stubFetch(() => json({ ok: true }));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  assert.deepEqual(await client.get<{ ok: boolean }>('/v1/pages'), { ok: true });
  assert.equal(calls[0].url, 'https://api.test/v1/pages');
  assert.equal(calls[0].method, 'GET');
});

test('sends a Bearer header only when a token is supplied', async () => {
  const { impl, calls } = stubFetch(() => json({}));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  await client.get('/a');
  await client.get('/b', 'tok');

  assert.equal(calls[0].headers?.['Authorization'], undefined);
  assert.equal(calls[1].headers?.['Authorization'], 'Bearer tok');
  assert.equal(calls[0].headers?.['Content-Type'], 'application/json');
});

test('serializes a body for writes and omits it for null/undefined', async () => {
  const { impl, calls } = stubFetch(() => json({}));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  await client.post('/a', { name: 'x' });
  await client.put('/b', null);

  assert.equal(calls[0].body, '{"name":"x"}');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].body, undefined, 'a null body must not serialize to the string "null"');
});

test('every verb maps to its HTTP method', async () => {
  const { impl, calls } = stubFetch(() => json({}));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  await client.get('/a');
  await client.post('/a', {});
  await client.put('/a', {});
  await client.patch('/a', {});
  await client.delete('/a');

  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  );
});

test('returns undefined for 204 rather than parsing an empty body', async () => {
  const { impl } = stubFetch(() => new Response(null, { status: 204 }));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });
  assert.equal(await client.delete('/a'), undefined);
});

test('raises ApiError carrying the server envelope', async () => {
  const { impl } = stubFetch(() =>
    json({ error: 'Forbidden', code: 'NO_ACCESS', details: { pageId: 'p1' } }, 403),
  );
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  const error = await client.get('/a').then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 403);
  assert.equal(error.code, 'NO_ACCESS');
  assert.equal(error.message, 'Forbidden');
  assert.deepEqual(error.details, { pageId: 'p1' });
});

test('falls back to method/path/status when the error body is not JSON', async () => {
  const { impl } = stubFetch(() => new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  const error = await client.get('/a').then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.code, 'API_ERROR');
  assert.match(error.message, /GET \/a → 502 Bad Gateway/);
});

test('prefers `error` over `message` in the envelope', async () => {
  const { impl } = stubFetch(() => json({ error: 'primary', message: 'secondary' }, 400));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });
  await assert.rejects(client.get('/a'), /primary/);
});

test('concurrent identical GETs share one network call', async () => {
  let resolveBody!: () => void;
  const gateOpen = new Promise<void>((resolve) => {
    resolveBody = resolve;
  });
  const { impl, calls } = stubFetch(async () => {
    await gateOpen;
    return json({ hit: true });
  });
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  const both = Promise.all([client.get('/same'), client.get('/same')]);
  await Promise.resolve();
  resolveBody();

  const [a, b] = await both;
  assert.equal(calls.length, 1, 'the duplicate GET must reuse the in-flight call');
  assert.deepEqual(a, { hit: true });
  assert.deepEqual(b, { hit: true });
});

test('a settled GET is refetched rather than served from a cache', async () => {
  const { impl, calls } = stubFetch(() => json({}));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  await client.get('/same');
  await client.get('/same');
  assert.equal(calls.length, 2, 'dedupe covers in-flight calls only — it is not a response cache');
});

test('writes are never deduped', async () => {
  const { impl, calls } = stubFetch(() => json({}));
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl });

  await Promise.all([client.post('/same', { n: 1 }), client.post('/same', { n: 2 })]);
  assert.equal(calls.length, 2, 'collapsing two POSTs would drop a mutation');
});

test('concurrency never exceeds the configured limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const impl: FetchLike = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    return json({});
  };
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl, maxConcurrent: 3 });

  // Distinct paths, so dedupe cannot mask the concurrency behaviour.
  await Promise.all(Array.from({ length: 12 }, (_, i) => client.get(`/p/${i}`)));
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded the limit of 3`);
  assert.equal(peak, 3, 'the gate should saturate its limit, not under-use it');
});

test('a failing request frees its slot for the queue', async () => {
  let calls = 0;
  const impl: FetchLike = async () => {
    calls += 1;
    if (calls <= 2) throw new Error('network down');
    return json({ ok: true });
  };
  const client = createHttpClient({ baseUrl: 'https://api.test', fetchImpl: impl, maxConcurrent: 1 });

  await assert.rejects(client.get('/a'), /network down/);
  await assert.rejects(client.get('/b'), /network down/);
  assert.deepEqual(await client.get('/c'), { ok: true });
});
