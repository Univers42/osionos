// osionos#233 D233-1 and D233-6: a signed media link must never be stored (it dies within
// 2 h), and only the bridge's own uploads are ever rewritten. Every other string comes back
// byte-identical, which is what keeps rendering unchanged while signing is off.
import assert from "node:assert/strict";
import test from "node:test";

import {
  signableMedia,
  stripMediaSignature,
  stripMediaSignaturesDeep,
} from "../../src/shared/lib/media/mediaSignature.ts";

const OWNER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PATH = `/api/media/uploads/${OWNER}/${"ab".repeat(32)}.png`;
const QUERY = `exp=1763830800&kid=0a1b2c3d&sig=${"9f".repeat(32)}`;
const SIGNED = `${PATH}?${QUERY}`;
const BRIDGE = "https://bridge.example:4000";
const BETA = "https://beta-bridge.example";

test("strips the signature from a bare uploads path", () => {
  assert.equal(stripMediaSignature(SIGNED), PATH);
});

test("strips the signature from an absolute bridge URL", () => {
  assert.equal(stripMediaSignature(`${BRIDGE}${SIGNED}`), `${BRIDGE}${PATH}`);
});

test("strips inside markdown, HTML attributes and JSON text", () => {
  assert.equal(stripMediaSignature(`![a](${SIGNED})`), `![a](${PATH})`);
  assert.equal(stripMediaSignature(`<img src="${SIGNED}">`), `<img src="${PATH}">`);
  assert.equal(stripMediaSignature(`<img src="${PATH}?${QUERY.replaceAll("&", "&amp;")}">`), `<img src="${PATH}">`);
  assert.equal(stripMediaSignature(JSON.stringify({ url: SIGNED })), JSON.stringify({ url: PATH }));
});

test("keeps query parameters that are not part of the signature", () => {
  assert.equal(stripMediaSignature(`${PATH}?v=2&${QUERY}`), `${PATH}?v=2`);
  assert.equal(stripMediaSignature(`${PATH}?${QUERY}&v=2`), `${PATH}?v=2`);
});

test("every other string is returned byte-identical", () => {
  const untouched = [
    "",
    "https://cdn.example/a.png?sig=abc&exp=1",
    "data:image/png;base64,AAAA",
    `/api/media/avatars/${OWNER}/a.png?exp=1&kid=0a1b2c3d&sig=00`,
    "/api/media/unsplash/photo-1?sig=1",
    `${PATH}?v=2`,
    PATH,
    "plain text mentioning sig=1 and exp=2",
  ];
  for (const value of untouched) assert.equal(stripMediaSignature(value), value, value);
});

test("the deep strip returns the same reference when nothing is signed", () => {
  const blocks = [{ id: "b1", type: "image", content: PATH, children: [{ id: "b2", content: "hi" }] }];
  assert.equal(stripMediaSignaturesDeep(blocks), blocks);
  assert.equal(stripMediaSignaturesDeep(null), null);
  assert.equal(stripMediaSignaturesDeep("x"), "x");
});

// A seeded Lehmer LCG stands in for fast-check, which is not a dependency of this repo:
// the same 500 block trees on every run, so a failure is reproducible from its seed.
const MODULUS = 2147483647;
const MULTIPLIER = 48271;
const HOSTS = ["", BRIDGE, BETA, "https://cdn.example"];
const KEYS = ["content", "url", "asset", "cover", "caption", "src"];

function nextRandom(state: { seed: number }, bound: number): number {
  state.seed = (state.seed * MULTIPLIER) % MODULUS;
  return state.seed % bound;
}

function mediaText(state: { seed: number }, signed: boolean): string {
  const host = HOSTS[nextRandom(state, HOSTS.length)];
  const extra = nextRandom(state, 3) === 0 ? "v=1&" : "";
  const url = `${host}${PATH}${signed ? `?${extra}${QUERY}` : extra ? "?v=1" : ""}`;
  const wrap = nextRandom(state, 3);
  if (wrap === 0) return url;
  return wrap === 1 ? `see ![x](${url}) here` : `<img src="${url}">`;
}

function blockTree(state: { seed: number }, depth: number, signed: boolean): Record<string, unknown> {
  const block: Record<string, unknown> = { id: `b${state.seed}`, type: "image" };
  block[KEYS[nextRandom(state, KEYS.length)]] = mediaText(state, signed);
  const childCount = depth < 3 ? nextRandom(state, 3) : 0;
  block.children = Array.from({ length: childCount }, () => blockTree(state, depth + 1, signed));
  return block;
}

test("property: for any block tree, the stored result equals the bare form", () => {
  for (let run = 0; run < 500; run += 1) {
    const seed = 20261122 + run;
    const signed = stripMediaSignaturesDeep(blockTree({ seed }, 0, true));
    const bare = blockTree({ seed }, 0, false);
    assert.deepEqual(signed, bare, `seed ${seed}`);
    assert.ok(!JSON.stringify(signed).includes("sig="), `seed ${seed}`);
  }
});

test("matcher: a bare uploads path signs against the bridge base", () => {
  assert.deepEqual(signableMedia(PATH, BRIDGE), { origin: BRIDGE, path: PATH, owner: OWNER });
});

test("matcher: an absolute URL on the bridge or a known bridge is signable", () => {
  assert.deepEqual(signableMedia(`${BRIDGE}${PATH}`, BRIDGE), { origin: BRIDGE, path: PATH, owner: OWNER });
  assert.deepEqual(signableMedia(`${BETA}${PATH}`, BRIDGE, [BETA]), { origin: BETA, path: PATH, owner: OWNER });
});

test("matcher: a signed link is matched by its bare path", () => {
  assert.deepEqual(signableMedia(`${BRIDGE}${SIGNED}`, BRIDGE)?.path, PATH);
});

test("matcher: everything that is not a bridge upload is left alone", () => {
  const refused = [
    "https://cdn.example/a.png",
    "data:image/png;base64,AAAA",
    `/api/media/avatars/${OWNER}/a.png`,
    "/api/media/unsplash/photo-1",
    `https://evil.example${PATH}`,
    `${BRIDGE}${PATH}?v=2`,
    `https://u:p@bridge.example:4000${PATH}`,
    `/api/media/uploads/${OWNER}/../x/${"ab".repeat(32)}.png`,
    `//bridge.example:4000${PATH}`,
    "",
  ];
  for (const value of refused) assert.equal(signableMedia(value, BRIDGE, [BETA]), null, value);
});

test("matcher: with no bridge configured, only the same-origin bare path is signable", () => {
  assert.deepEqual(signableMedia(PATH, ""), { origin: "", path: PATH, owner: OWNER });
  assert.equal(signableMedia(`${BRIDGE}${PATH}`, ""), null);
});
