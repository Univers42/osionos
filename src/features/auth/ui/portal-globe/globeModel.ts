// The sign-in globe as data: a seeded cloud of workspace nodes on a unit sphere, grouped into
// neighbourhoods around labelled hubs and linked the way the graph view links pages, plus the
// meridian rings that make the sphere read as 3D. Pure (no DOM), so tests/canvas drives it.

export type NodeKind = "page" | "database" | "conversation";
export type Vec3 = [number, number, number];

export interface GlobeNode {
  x: number;
  y: number;
  z: number;
  /** Where the entrance starts this node: outside the globe, so the cloud condenses inward. */
  from: Vec3;
  kind: NodeKind;
  hub: boolean;
  cluster: number;
  label?: string;
}

export interface GlobeModel {
  nodes: GlobeNode[];
  edges: Array<[number, number]>;
  /** Each edge as the points of its path along the sphere (same order as `edges`). */
  paths: Vec3[][];
  /** Unlinked specks over the whole surface: they give the sphere a skin between clusters. */
  dust: Vec3[];
}

export interface Projected {
  sx: number;
  sy: number;
  /** 0 at the back of the sphere, 1 at the front. */
  depth: number;
  scale: number;
}

const HUBS: ReadonlyArray<{ label: string; kind: NodeKind }> = [
  { label: "Roadmap", kind: "page" },
  { label: "Customers", kind: "database" },
  { label: "#design", kind: "conversation" },
  { label: "Meeting notes", kind: "page" },
  { label: "Reading list", kind: "database" },
  { label: "Onboarding", kind: "page" },
  { label: "#releases", kind: "conversation" },
];

// Perspective distance in radii: far enough that the sphere stays round, near enough that
// the front visibly swells as it turns toward the viewer.
const FOCAL = 3.2;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fibonacciPoint(i: number, n: number): Vec3 {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const phi = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(phi) * r, y, Math.sin(phi) * r];
}

function normalize([x, y, z]: Vec3): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function kindFor(roll: number): NodeKind {
  if (roll < 0.6) return "page";
  return roll < 0.85 ? "database" : "conversation";
}

function satellite(rand: () => number, center: Vec3, cluster: number): GlobeNode {
  const jitter = () => (rand() - 0.5) * 0.62;
  const dir = normalize([center[0] + jitter(), center[1] + jitter(), center[2] + jitter()]);
  const radius = 0.86 + rand() * 0.14;
  // Close enough that the perspective never flings a starting node off the canvas.
  const away = 1.25 + rand() * 0.35;
  const [x, y, z] = dir.map((d) => d * radius);
  const from = dir.map((d) => d * away) as Vec3;
  return { x, y, z, from, kind: kindFor(rand()), hub: false, cluster };
}

function distance(a: GlobeNode, b: GlobeNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Each satellite joins the nearest node already placed in its neighbourhood (a tree per
// cluster, so nothing floats unlinked), a fifth of them a second one, and the hubs form a ring.
function linkNodes(nodes: GlobeNode[], rand: () => number, hubCount: number): Array<[number, number]> {
  const edges = new Map<string, [number, number]>();
  const add = (a: number, b: number) => {
    if (a !== b) edges.set(a < b ? `${a}-${b}` : `${b}-${a}`, [a, b]);
  };
  for (let i = hubCount; i < nodes.length; i++) {
    const ranked = nodes
      .slice(0, i)
      .map((n, j) => ({ j, d: n.cluster === nodes[i].cluster ? distance(n, nodes[i]) : Infinity }))
      .filter((r) => r.d < Infinity)
      .sort((p, q) => p.d - q.d);
    add(i, ranked[0].j);
    if (ranked.length > 1 && rand() < 0.2) add(i, ranked[1].j);
  }
  for (let h = 0; h < hubCount; h++) add(h, (h + 1) % hubCount);
  add(0, Math.floor(hubCount / 2));
  return [...edges.values()];
}

/**
 * The path from `a` to `b` along the sphere: direction by slerp, radius linearly between the
 * two ends, one point per ~0.12 rad. A short hop stays a straight segment (two points).
 */
export function arcBetween(a: Vec3, b: Vec3): Vec3[] {
  const ra = Math.hypot(...a);
  const rb = Math.hypot(...b);
  const ua = normalize(a);
  const ub = normalize(b);
  const angle = Math.acos(Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2])));
  if (angle < 0.3) return [a, b];
  const steps = Math.ceil(angle / 0.12);
  const sinA = Math.sin(angle);
  return Array.from({ length: steps + 1 }, (_, i) => {
    if (i === 0 || i === steps) return i === 0 ? a : b; // exact ends: slerp rounds them off
    const t = i / steps;
    const wa = Math.sin((1 - t) * angle) / sinA;
    const wb = Math.sin(t * angle) / sinA;
    const r = ra + (rb - ra) * t;
    return [(ua[0] * wa + ub[0] * wb) * r, (ua[1] * wa + ub[1] * wb) * r, (ua[2] * wa + ub[2] * wb) * r] as Vec3;
  });
}

function surfaceDust(rand: () => number, count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const [x, y, z] = fibonacciPoint(i, count);
    return normalize([x + (rand() - 0.5) * 0.08, y + (rand() - 0.5) * 0.08, z + (rand() - 0.5) * 0.08]);
  });
}

export function buildGlobe(seed: number, count: number, dustCount = 0): GlobeModel {
  const rand = mulberry32(seed);
  const nodes: GlobeNode[] = HUBS.map((hub, i) => {
    const [x, y, z] = fibonacciPoint(i, HUBS.length);
    const from: Vec3 = [x * 1.5, y * 1.5, z * 1.5];
    return { x, y, z, from, kind: hub.kind, hub: true, cluster: i, label: hub.label };
  });
  for (let i = nodes.length; i < count; i++) {
    const cluster = i % HUBS.length;
    nodes.push(satellite(rand, [nodes[cluster].x, nodes[cluster].y, nodes[cluster].z], cluster));
  }
  const edges = linkNodes(nodes, rand, HUBS.length);
  const at = (n: GlobeNode): Vec3 => [n.x, n.y, n.z];
  const paths = edges.map(([a, b]) => arcBetween(at(nodes[a]), at(nodes[b])));
  return { nodes, edges, paths, dust: surfaceDust(rand, dustCount) };
}

/** Rotate a unit-sphere point by yaw (around y) then pitch (around x), and project it. */
export function projectPoint(p: Vec3, yaw: number, pitch: number, radius: number, cx: number, cy: number): Projected {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = p[0] * cosY + p[2] * sinY;
  const z1 = -p[0] * sinY + p[2] * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = p[1] * cosP - z1 * sinP;
  const z2 = p[1] * sinP + z1 * cosP;
  const scale = FOCAL / (FOCAL - z2);
  return { sx: cx + x1 * radius * scale, sy: cy - y2 * radius * scale, depth: (z2 + 1) / 2, scale };
}

/** Screen radius of the sphere's outline under the perspective: the tangent cone, not `radius`. */
export function silhouetteRadius(radius: number): number {
  return (radius * FOCAL) / Math.sqrt(FOCAL * FOCAL - 1);
}

/** Six meridians, the equator and two parallels, each a closed ring of `segments` + 1 points. */
export function meridianRings(segments: number): Vec3[][] {
  const ring = (point: (t: number) => Vec3) =>
    Array.from({ length: segments + 1 }, (_, i) => point(((i % segments) / segments) * Math.PI * 2));
  const rings: Vec3[][] = [];
  for (let m = 0; m < 6; m++) {
    const lon = (m / 6) * Math.PI;
    rings.push(ring((t) => [Math.cos(t) * Math.cos(lon), Math.sin(t), Math.cos(t) * Math.sin(lon)]));
  }
  for (const lat of [0, 0.62, -0.62]) {
    const r = Math.cos(lat);
    rings.push(ring((t) => [Math.cos(t) * r, Math.sin(lat), Math.sin(t) * r]));
  }
  return rings;
}
