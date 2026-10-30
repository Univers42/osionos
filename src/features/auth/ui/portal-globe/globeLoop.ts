// Runs the sign-in globe on a canvas: sizes it to the device, spins it slowly, lets a drag turn
// it (with inertia that eases back to the idle spin), sends a few pulses along the links, stops
// when it is off screen or the window is hidden, and re-reads the palette when the appearance
// attributes on <html> change. Reduced motion draws the settled globe once, without pulses; a
// drag still turns it, without inertia.

import { buildGlobe, meridianRings, type GlobeModel } from "./globeModel";
import { drawGlobe, easeOut, type GlobeColors, type Pulse } from "./globeRenderer";

const SEED = 20261030;
const NODE_COUNT = 210;
const DUST_COUNT = 420;
const PULSE_COUNT = 6;
const IDLE_SPIN = 0.07; // rad/s: one turn in ~90 s, slow enough to read as calm
const BASE_PITCH = 0.36;
const ENTRANCE_MS = 1900;
const ENTRANCE_SWIRL = 1.3; // extra yaw unwound while the cloud gathers
const MAX_FLING = 4; // rad/s
// Caveat: capped at 2 — a 3x display renders the globe at 2x (slightly soft) to keep the
// per-frame fill cost bounded on the first screen.
const MAX_DPR = 2;

interface Motion {
  yaw: number;
  pitch: number;
  spin: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
}

function readColors(host: HTMLElement): GlobeColors {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const colors = {
    ink: read("--osio-fg-strong"),
    accent: read("--osio-accent"),
    success: read("--osio-success"),
    line: read("--osio-border-strong"),
    muted: read("--osio-fg-muted"),
    paper: read("--osio-bg-canvas"),
    glow: read("--osio-accent-subtle"),
  };
  probe.remove();
  return colors;
}

function labelFont(canvas: HTMLCanvasElement): string {
  const family = getComputedStyle(canvas).getPropertyValue("--osio-font-heading").trim() || "serif";
  return `italic 400 14px ${family}`;
}

// Long links get the pulses more often: they are the ones that read as "far apart, connected".
function nextPulse(model: GlobeModel, t = 0): Pulse {
  for (;;) {
    const edge = Math.floor(Math.random() * model.paths.length);
    if (model.paths[edge].length > 2 || Math.random() < 0.15) return { edge, t };
  }
}

function advancePulses(model: GlobeModel, pulses: Pulse[], dt: number) {
  pulses.forEach((pulse, i) => {
    pulse.t += dt / (0.5 + model.paths[pulse.edge].length * 0.16);
    if (pulse.t >= 1) pulses[i] = nextPulse(model);
  });
}

export function startGlobe(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const model = buildGlobe(SEED, NODE_COUNT, DUST_COUNT);
  const rings = meridianRings(64);
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const motion: Motion = { yaw: -0.6, pitch: BASE_PITCH, spin: IDLE_SPIN, dragging: false, lastX: 0, lastY: 0, lastT: 0 };
  const pulses: Pulse[] = reduced ? [] : Array.from({ length: PULSE_COUNT }, (_, i) => nextPulse(model, i / PULSE_COUNT));
  const startedAt = performance.now();
  let colors = readColors(canvas.parentElement ?? canvas);
  let font = labelFont(canvas);
  let size = { width: 0, height: 0, dpr: 1 };
  let raf = 0;
  let visible = true;
  let previous = startedAt;

  const draw = (now: number) => {
    const entrance = reduced ? 1 : (now - startedAt) / ENTRANCE_MS;
    const yaw = motion.yaw - (1 - easeOut(entrance)) * ENTRANCE_SWIRL;
    drawGlobe(ctx, model, rings, colors, { ...size, yaw, pitch: motion.pitch, entrance, labelFont: font, pulses });
  };
  const tick = (now: number) => {
    // A rAF timestamp is the frame's start, so it can precede the performance.now() wake() took.
    const dt = Math.max(0, Math.min(0.05, (now - previous) / 1000));
    previous = now;
    if (!motion.dragging) {
      motion.spin += (IDLE_SPIN - motion.spin) * Math.min(1, dt * 1.2);
      motion.pitch += (BASE_PITCH - motion.pitch) * Math.min(1, dt * 0.8);
      motion.yaw += motion.spin * dt;
    }
    advancePulses(model, pulses, dt);
    draw(now);
    raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (reduced || raf || !visible || document.hidden) return;
    previous = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const resize = () => {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    size = { width: canvas.clientWidth, height: canvas.clientHeight, dpr };
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    draw(performance.now());
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const viewObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  viewObserver.observe(canvas);
  const themeObserver = new MutationObserver(() => {
    colors = readColors(canvas.parentElement ?? canvas);
    font = labelFont(canvas);
    draw(performance.now());
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "data-accent", "style", "class"] });

  const onDown = (e: PointerEvent) => {
    motion.dragging = true;
    motion.lastX = e.clientX;
    motion.lastY = e.clientY;
    motion.lastT = e.timeStamp;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!motion.dragging) return;
    const dx = e.clientX - motion.lastX;
    const dt = Math.max(1, e.timeStamp - motion.lastT) / 1000;
    motion.yaw += dx * 0.006;
    motion.pitch = Math.max(-0.9, Math.min(0.9, motion.pitch + (e.clientY - motion.lastY) * 0.004));
    motion.spin = reduced ? 0 : Math.max(-MAX_FLING, Math.min(MAX_FLING, (dx * 0.006) / dt));
    motion.lastX = e.clientX;
    motion.lastY = e.clientY;
    motion.lastT = e.timeStamp;
    if (reduced) draw(performance.now());
  };
  const onUp = (e: PointerEvent) => {
    motion.dragging = false;
    // Held still before letting go: no fling from a movement that already ended.
    if (e.timeStamp - motion.lastT > 90) motion.spin = 0;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  document.addEventListener("visibilitychange", wake);
  wake();

  return () => {
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    viewObserver.disconnect();
    themeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    document.removeEventListener("visibilitychange", wake);
  };
}
