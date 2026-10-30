/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   portal-globe.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sign-in globe is seeded, so the same chart draws on every launch; its nodes sit on the
// sphere's shell, every edge joins two real nodes, and the projection keeps the front in front.
// The connection line names the server the form will talk to, and never claims a secure link
// it does not have.

import assert from "node:assert/strict";
import test from "node:test";

const { arcBetween, buildGlobe, projectPoint, meridianRings, silhouetteRadius } = await import("../../src/features/auth/ui/portal-globe/globeModel.ts");
const { describeConnection } = await import("../../src/features/auth/model/portalConnection.ts");

test("the globe is deterministic for a seed and different for another", () => {
  const a = buildGlobe(42, 120);
  const b = buildGlobe(42, 120);
  const c = buildGlobe(7, 120);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.nodes.map((n) => n.x), c.nodes.map((n) => n.x));
});

test("every node lies on the shell between 0.86 and 1 of the radius, with a start point outside it", () => {
  const { nodes } = buildGlobe(42, 140);
  assert.equal(nodes.length, 140);
  for (const n of nodes) {
    const r = Math.hypot(n.x, n.y, n.z);
    assert.ok(r >= 0.859 && r <= 1.0001, `radius ${r}`);
    assert.ok(Math.hypot(...n.from) > 1.2, "the entrance starts outside the globe");
  }
});

test("hubs carry the labels and the three kinds all appear", () => {
  const { nodes } = buildGlobe(42, 140);
  const hubs = nodes.filter((n) => n.hub);
  assert.ok(hubs.length >= 5);
  assert.ok(hubs.every((h) => typeof h.label === "string" && h.label.length > 0));
  assert.ok(nodes.filter((n) => !n.hub).every((n) => n.label === undefined));
  for (const kind of ["page", "database", "conversation"]) {
    assert.ok(nodes.some((n) => n.kind === kind), `kind ${kind} missing`);
  }
});

test("edges join two distinct existing nodes, no duplicates, and every node is linked", () => {
  const { nodes, edges } = buildGlobe(42, 140);
  const seen = new Set<string>();
  const degree = new Array<number>(nodes.length).fill(0);
  for (const [a, b] of edges) {
    assert.ok(a !== b && a >= 0 && b >= 0 && a < nodes.length && b < nodes.length);
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    assert.ok(!seen.has(key), `duplicate edge ${key}`);
    seen.add(key);
    degree[a] += 1;
    degree[b] += 1;
  }
  assert.ok(degree.every((d) => d > 0), "an unlinked node");
});

test("each edge path runs along the sphere from one end node to the other", () => {
  const { nodes, edges, paths } = buildGlobe(42, 140);
  assert.equal(paths.length, edges.length);
  edges.forEach(([a, b], i) => {
    const path = paths[i];
    assert.deepEqual(path[0], [nodes[a].x, nodes[a].y, nodes[a].z]);
    assert.deepEqual(path.at(-1), [nodes[b].x, nodes[b].y, nodes[b].z]);
    for (const p of path) assert.ok(Math.hypot(...p) >= 0.85 && Math.hypot(...p) <= 1.0001, "a chord cut through the globe");
  });
});

test("an arc is straight for a short hop and bends for a long one", () => {
  assert.equal(arcBetween([1, 0, 0], [0.99, 0.141, 0]).length, 2);
  const long = arcBetween([1, 0, 0], [0, 0, 1]);
  assert.ok(long.length > 10);
  const mid = long[Math.floor(long.length / 2)];
  assert.ok(Math.abs(Math.hypot(...mid) - 1) < 1e-9, "the midpoint of a unit arc stays on the unit sphere");
});

test("dust covers the surface and is opt-in", () => {
  assert.equal(buildGlobe(42, 140).dust.length, 0);
  const { dust } = buildGlobe(42, 140, 300);
  assert.equal(dust.length, 300);
  for (const p of dust) assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-9);
  assert.ok(dust.some((p) => p[1] > 0.9) && dust.some((p) => p[1] < -0.9), "both poles are dusted");
});

test("projection: no rotation puts a front point lower-depth-first, centred, and larger than a back one", () => {
  const front = projectPoint([0, 0, 1], 0, 0, 100, 200, 150);
  const back = projectPoint([0, 0, -1], 0, 0, 100, 200, 150);
  assert.equal(front.sx, 200);
  assert.equal(front.sy, 150);
  assert.ok(front.depth > back.depth);
  assert.ok(front.scale > back.scale);
  const up = projectPoint([0, 1, 0], 0, 0, 100, 200, 150);
  assert.ok(up.sy < 150, "screen y grows downward");
});

test("a quarter turn of yaw brings the right-hand point to the front", () => {
  const p = projectPoint([1, 0, 0], -Math.PI / 2, 0, 100, 0, 0);
  assert.ok(p.depth > 0.99, `depth ${p.depth}`);
});

test("the silhouette radius is where the widest projected point of the sphere lands", () => {
  let widest = 0;
  for (let i = 0; i <= 2000; i++) {
    const a = (i / 2000) * Math.PI;
    widest = Math.max(widest, projectPoint([Math.cos(a), 0, Math.sin(a)], 0, 0, 100, 0, 0).sx);
  }
  assert.ok(Math.abs(silhouetteRadius(100) - widest) < 0.01, `${silhouetteRadius(100)} vs ${widest}`);
});

test("meridian rings are closed unit circles", () => {
  const rings = meridianRings(48);
  assert.ok(rings.length >= 8);
  for (const ring of rings) {
    assert.equal(ring.length, 49);
    assert.deepEqual(ring[0], ring[48]);
    for (const p of ring) assert.ok(Math.hypot(...p) <= 1.0001);
  }
});

test("the connection line names the host and only calls https secure", () => {
  assert.deepEqual(describeConnection("https://baas.example.ts.net:10000"), { kind: "secure", host: "baas.example.ts.net" });
  assert.deepEqual(describeConnection("http://10.0.0.2:4000"), { kind: "plain", host: "10.0.0.2" });
  assert.deepEqual(describeConnection(""), { kind: "offline", host: "" });
  assert.deepEqual(describeConnection("not a url"), { kind: "plain", host: "not a url" });
});
