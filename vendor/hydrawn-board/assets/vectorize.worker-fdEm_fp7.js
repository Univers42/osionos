class p {
  static __wrap(e) {
    const n = Object.create(p.prototype);
    return n.__wbg_ptr = e, T.register(n, n.__wbg_ptr, n), n;
  }
  __destroy_into_raw() {
    const e = this.__wbg_ptr;
    return this.__wbg_ptr = 0, T.unregister(this), e;
  }
  free() {
    const e = this.__destroy_into_raw();
    s.__wbg_tracerings_free(e, 0);
  }
  /**
   * Per ring, its colour as `0xRRGGBB`.
   * @returns {Uint32Array}
   */
  get colours() {
    const e = s.__wbg_get_tracerings_colours(this.__wbg_ptr);
    var n = R(e[0], e[1]).slice();
    return s.__wbindgen_free(e[0], e[1] * 4, 4), n;
  }
  /**
   * Every ring's points in turn, `x, y`, as fractions of the picture.
   * @returns {Float64Array}
   */
  get coords() {
    const e = s.__wbg_get_tracerings_coords(this.__wbg_ptr);
    var n = z(e[0], e[1]).slice();
    return s.__wbindgen_free(e[0], e[1] * 8, 8), n;
  }
  /**
   * Per ring, how many points it has.
   * @returns {Uint32Array}
   */
  get lengths() {
    const e = s.__wbg_get_tracerings_lengths(this.__wbg_ptr);
    var n = R(e[0], e[1]).slice();
    return s.__wbindgen_free(e[0], e[1] * 4, 4), n;
  }
  /**
   * Per ring, its colour as `0xRRGGBB`.
   * @param {Uint32Array} arg0
   */
  set colours(e) {
    const n = E(e, s.__wbindgen_malloc), r = _;
    s.__wbg_set_tracerings_colours(this.__wbg_ptr, n, r);
  }
  /**
   * Every ring's points in turn, `x, y`, as fractions of the picture.
   * @param {Float64Array} arg0
   */
  set coords(e) {
    const n = C(e, s.__wbindgen_malloc), r = _;
    s.__wbg_set_tracerings_coords(this.__wbg_ptr, n, r);
  }
  /**
   * Per ring, how many points it has.
   * @param {Uint32Array} arg0
   */
  set lengths(e) {
    const n = E(e, s.__wbindgen_malloc), r = _;
    s.__wbg_set_tracerings_lengths(this.__wbg_ptr, n, r);
  }
}
Symbol.dispose && (p.prototype[Symbol.dispose] = p.prototype.free);
class v {
  __destroy_into_raw() {
    const e = this.__wbg_ptr;
    return this.__wbg_ptr = 0, F.unregister(this), e;
  }
  free() {
    const e = this.__destroy_into_raw();
    s.__wbg_tracesession_free(e, 0);
  }
  /**
   * A session over an RGBA image — `ImageData.data`, row by row.
   * @param {Uint8Array} rgba
   * @param {number} width
   * @param {number} height
   */
  constructor(e, n, r) {
    const i = j(e, s.__wbindgen_malloc), c = _, o = s.tracesession_new(i, c, n, r);
    if (o[2])
      throw S(o[1]);
    return this.__wbg_ptr = o[0], F.register(this, this.__wbg_ptr, this), this;
  }
  /**
   * Traces with `config` (a [`TraceConfig`] as JSON) and returns the stats as JSON.
   *
   * `on_progress(phase, fraction)` is called as clustering and compositing advance —
   * `phase` is `"segment"`, `"compose"` or `"optimize"`, `fraction` within it.
   * @param {string} config
   * @param {Function} on_progress
   * @returns {string}
   */
  render(e, n) {
    let r, i;
    try {
      const a = k(e, s.__wbindgen_malloc, s.__wbindgen_realloc), f = _, h = s.tracesession_render(this.__wbg_ptr, a, f, n);
      var c = h[0], o = h[1];
      if (h[3])
        throw c = 0, o = 0, S(h[2]);
      return r = c, i = o, b(c, o);
    } finally {
      s.__wbindgen_free(r, i, 1);
    }
  }
  /**
   * The last trace's editable rings, flat — what `DrawEngine.vectorizeImage` takes —
   * or `undefined` before the first.
   * @returns {TraceRings | undefined}
   */
  rings() {
    const e = s.tracesession_rings(this.__wbg_ptr);
    return e === 0 ? void 0 : p.__wrap(e);
  }
  /**
   * The last trace as an SVG document, or `undefined` before the first.
   * @returns {string | undefined}
   */
  svg() {
    const e = s.tracesession_svg(this.__wbg_ptr);
    let n;
    return e[0] !== 0 && (n = b(e[0], e[1]), s.__wbindgen_free(e[0], e[1] * 1, 1)), n;
  }
}
Symbol.dispose && (v.prototype[Symbol.dispose] = v.prototype.free);
function D() {
  return {
    __proto__: null,
    "./draw_trace_bg.js": {
      __proto__: null,
      __wbg_Error_67e7344beaa85059: function(e, n) {
        return Error(b(e, n));
      },
      __wbg___wbindgen_throw_5d9e815e6fdf150f: function(e, n) {
        throw new Error(b(e, n));
      },
      __wbg_call_7bbd9cceba9949ad: function() {
        return I(function(e, n, r, i) {
          return e.call(n, r, i);
        }, arguments);
      },
      __wbindgen_generic_0000000000000001: function(e) {
        return e;
      },
      __wbindgen_generic_0000000000000002: function(e, n) {
        return b(e, n);
      },
      __wbindgen_init_externref_table: function() {
        const e = s.__wbindgen_externrefs, n = e.grow(4);
        e.set(0, void 0), e.set(n + 0, void 0), e.set(n + 1, null), e.set(n + 2, !0), e.set(n + 3, !1);
      }
    }
  };
}
const T = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((t) => s.__wbg_tracerings_free(t, 1)), F = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((t) => s.__wbg_tracesession_free(t, 1));
function L(t) {
  const e = s.__externref_table_alloc();
  return s.__wbindgen_externrefs.set(e, t), e;
}
function z(t, e) {
  return t = t >>> 0, O().subarray(t / 8, t / 8 + e);
}
function R(t, e) {
  return t = t >>> 0, U().subarray(t / 4, t / 4 + e);
}
let l = null;
function O() {
  return (l === null || l.byteLength === 0) && (l = new Float64Array(s.memory.buffer)), l;
}
function b(t, e) {
  return N(t >>> 0, e);
}
let u = null;
function U() {
  return (u === null || u.byteLength === 0) && (u = new Uint32Array(s.memory.buffer)), u;
}
let w = null;
function d() {
  return (w === null || w.byteLength === 0) && (w = new Uint8Array(s.memory.buffer)), w;
}
function I(t, e) {
  try {
    return t.apply(this, e);
  } catch (n) {
    const r = L(n);
    s.__wbindgen_exn_store(r);
  }
}
function E(t, e) {
  const n = e(t.length * 4, 4) >>> 0;
  return U().set(t, n / 4), _ = t.length, n;
}
function j(t, e) {
  const n = e(t.length * 1, 1) >>> 0;
  return d().set(t, n / 1), _ = t.length, n;
}
function C(t, e) {
  const n = e(t.length * 8, 8) >>> 0;
  return O().set(t, n / 8), _ = t.length, n;
}
function k(t, e, n) {
  if (n === void 0) {
    const a = y.encode(t), f = e(a.length, 1) >>> 0;
    return d().subarray(f, f + a.length).set(a), _ = a.length, f;
  }
  let r = t.length, i = e(r, 1) >>> 0;
  const c = d();
  let o = 0;
  for (; o < r; o++) {
    const a = t.charCodeAt(o);
    if (a > 127) break;
    c[i + o] = a;
  }
  if (o !== r) {
    o !== 0 && (t = t.slice(o)), i = n(i, r, r = o + t.length * 3, 1) >>> 0;
    const a = d().subarray(i + o, i + r), f = y.encodeInto(t, a);
    o += f.written, i = n(i, r, o, 1) >>> 0;
  }
  return _ = o, i;
}
function S(t) {
  const e = s.__wbindgen_externrefs.get(t);
  return s.__externref_table_dealloc(t), e;
}
let m = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 });
m.decode();
const B = 2146435072;
let x = 0;
function N(t, e) {
  return x += e, x >= B && (m = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 }), m.decode(), x = e), m.decode(d().subarray(t, t + e));
}
const y = new TextEncoder();
"encodeInto" in y || (y.encodeInto = function(t, e) {
  const n = y.encode(t);
  return e.set(n), {
    read: t.length,
    written: n.length
  };
});
let _ = 0, s;
function $(t, e) {
  return s = t.exports, l = null, u = null, w = null, s.__wbindgen_start(), s;
}
async function J(t, e) {
  if (typeof Response == "function" && t instanceof Response) {
    if (!t.ok)
      throw new Error(`failed to fetch Wasm: ${t.status} ${t.statusText} fetching '${t.url}'`);
    if (typeof WebAssembly.instantiateStreaming == "function")
      try {
        return await WebAssembly.instantiateStreaming(t, e);
      } catch (i) {
        if (n(t.type) && t.headers.get("Content-Type") !== "application/wasm")
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", i);
        else
          throw i;
      }
    const r = await t.arrayBuffer();
    return await WebAssembly.instantiate(r, e);
  } else {
    const r = await WebAssembly.instantiate(t, e);
    return r instanceof WebAssembly.Instance ? { instance: r, module: t } : r;
  }
  function n(r) {
    switch (r) {
      case "basic":
      case "cors":
      case "default":
        return !0;
    }
    return !1;
  }
}
async function P(t) {
  if (s !== void 0) return s;
  t !== void 0 && (Object.getPrototypeOf(t) === Object.prototype ? { module_or_path: t } = t : console.warn("using deprecated parameters for the initialization function; pass a single object instead")), t === void 0 && (t = new URL("" + new URL("draw_trace_bg-Dj51gomY.wasm", import.meta.url).href, import.meta.url));
  const e = D();
  (typeof t == "string" || typeof Request == "function" && t instanceof Request || typeof URL == "function" && t instanceof URL) && (t = fetch(t));
  const { instance: n, module: r } = await J(await t, e);
  return $(n);
}
const A = self;
let W = null, g = null, M = Promise.resolve();
function Y(t) {
  const e = new OffscreenCanvas(t.width, t.height), n = e.getContext("2d", { willReadFrequently: !0 });
  if (!n) throw new Error("no 2D context in this worker");
  n.drawImage(t, 0, 0), t.close();
  const r = n.getImageData(0, 0, e.width, e.height).data;
  return new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
}
function V(t) {
  let e = null;
  return (n, r) => {
    e && e.phase === n && r - e.fraction < 0.02 && r < 1 || (e = { phase: n, fraction: r }, A.postMessage({ id: t, type: "progress", progress: { phase: n, fraction: r } }));
  };
}
function X(t) {
  if (t.type === "open") {
    const { width: r, height: i } = t.bitmap, c = Y(t.bitmap);
    return g?.free(), g = new v(c, r, i), [{ width: r, height: i }, []];
  }
  if (!g) throw new Error("no picture to trace");
  if (t.type === "render") {
    const r = JSON.stringify(t.config);
    return [{ stats: JSON.parse(g.render(r, V(t.id))), svg: g.svg() }, []];
  }
  const e = g.rings();
  if (!e) return [null, []];
  const n = { colours: e.colours, lengths: e.lengths, coords: e.coords };
  return e.free(), [n, [n.colours.buffer, n.lengths.buffer, n.coords.buffer]];
}
async function G(t) {
  try {
    W ??= P(), await W;
    const [e, n] = X(t);
    A.postMessage({ id: t.id, type: "done", value: e }, n);
  } catch (e) {
    A.postMessage({
      id: t.id,
      type: "error",
      message: e instanceof Error ? e.message : String(e)
    });
  }
}
A.onmessage = (t) => {
  M = M.then(() => G(t.data));
};
