function Rl(t) {
  const e = Object.values(t).filter((r) => typeof r == "number");
  return Object.entries(t).filter(([r, o]) => e.indexOf(+r) === -1).map(([r, o]) => o);
}
function Ld(t, e = "|") {
  return t.map((n) => ug(n)).join(e);
}
function Ll(t, e) {
  return typeof e == "bigint" ? e.toString() : e;
}
class _1 {
  constructor(e) {
    this._getter = e, this._value = void 0;
  }
  get value() {
    const e = this._getter;
    return e !== void 0 && (this._value = e(), this._getter = void 0), this._value;
  }
}
function zc(t) {
  return new _1(t);
}
function y1(t) {
  return t == null;
}
function Mc(t) {
  const e = t.startsWith("^") ? 1 : 0, n = t.endsWith("$") ? t.length - 1 : t.length;
  return t.slice(e, n);
}
function b1(t, e) {
  const n = t / e, r = Math.round(n), o = 4 * Number.EPSILON * Math.max(Math.abs(n), 1);
  return Math.abs(n - r) < o ? 0 : n - r;
}
function uo(t, e, n) {
  Object.defineProperty(t, e, {
    value: n,
    writable: !0,
    enumerable: !0,
    configurable: !0
  });
}
function ig(t) {
  const e = Object.getOwnPropertyDescriptor(t, "shape");
  return e?.get ? e.get.raw : e?.value;
}
function dr(t) {
  return ig(t._zod.def) ?? t._zod.def.shape;
}
function sg(t, e, n) {
  Object.defineProperty(t, e, {
    get() {
      const r = n();
      return uo(this, e, r), r;
    },
    enumerable: !0,
    configurable: !0
  });
}
function ag(t, e, n) {
  e in t ? uo(t, e, n) : t[e] = n;
}
function io(t, e, n, r) {
  const o = dr(e);
  for (const i of n) {
    const a = Object.getOwnPropertyDescriptor(o, i);
    a.enumerable && (a.get ? sg(t, i, () => {
      const l = e._zod.def.shape[i];
      return r ? r(l, i) : l;
    }) : ag(t, i, r ? r(a.value, i) : a.value));
  }
}
function w1(t, e) {
  for (const n of Reflect.ownKeys(e)) {
    const r = Object.getOwnPropertyDescriptor(e, n);
    r.enumerable && (r.get ? sg(t, n, () => e[n]) : ag(t, n, r.value));
  }
}
function vn(...t) {
  const e = {};
  for (const n of t) {
    const r = Object.getOwnPropertyDescriptors(n);
    Object.assign(e, r);
  }
  return Object.defineProperties({}, e);
}
function k1(t) {
  return JSON.stringify(t);
}
function S1(t) {
  return t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
const lg = "captureStackTrace" in Error ? Error.captureStackTrace : (...t) => {
};
function zs(t) {
  return typeof t == "object" && t !== null && !Array.isArray(t);
}
const x1 = /* @__PURE__ */ zc(() => {
  if (Hn.jitless || typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare"))
    return !1;
  try {
    const t = Function;
    return new t(""), !0;
  } catch {
    return !1;
  }
});
function Ii(t) {
  if (zs(t) === !1)
    return !1;
  const e = t.constructor;
  if (e === void 0 || typeof e != "function")
    return !0;
  const n = e.prototype;
  return !(zs(n) === !1 || Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") === !1);
}
function cg(t) {
  return Ii(t) ? { ...t } : Array.isArray(t) ? [...t] : t instanceof Map ? new Map(t) : t instanceof Set ? new Set(t) : t;
}
const E1 = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function zo(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function Hr(t, e, n) {
  const r = new t._zod.constr(e ?? t._zod.def);
  return (!e || n?.parent) && (r._zod.parent = t), r;
}
function Ae(t) {
  const e = t;
  if (!e)
    return {};
  if (typeof e == "string")
    return { error: () => e };
  if (e?.message !== void 0) {
    if (e?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    e.error = e.message;
  }
  return delete e.message, typeof e.error == "string" ? { ...e, error: () => e.error } : e;
}
function ug(t) {
  return typeof t == "bigint" ? t.toString() + "n" : typeof t == "string" ? `"${t}"` : `${t}`;
}
function T1(t) {
  return Object.keys(t).filter((e) => t[e]._zod.optin !== void 0 && t[e]._zod.optout === "optional");
}
const dg = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}, C1 = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function A1(t, e) {
  const n = t._zod.def, r = n.checks;
  if (r && r.length > 0)
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  const i = {};
  return io(i, t, oa(t, e)), Hr(t, vn(n, { shape: i, checks: [] }));
}
function oa(t, e) {
  const n = dr(t), r = [];
  for (const o of Reflect.ownKeys(e)) {
    if (!Object.getOwnPropertyDescriptor(n, o)?.enumerable)
      throw new Error(`Unrecognized key: "${String(o)}"`);
    e[o] && r.push(o);
  }
  return r;
}
function P1(t, e) {
  const n = t._zod.def, r = n.checks;
  if (r && r.length > 0)
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  const i = new Set(oa(t, e)), a = {};
  return io(a, t, Reflect.ownKeys(dr(t)).filter((l) => !i.has(l))), Hr(t, vn(n, { shape: a, checks: [] }));
}
function I1(t, e) {
  if (!Ii(e))
    throw new Error("Invalid input to extend: expected a plain object");
  const n = t._zod.def.checks;
  if (n && n.length > 0) {
    const o = dr(t);
    for (const i of Reflect.ownKeys(e))
      if (Object.getOwnPropertyDescriptor(o, i) !== void 0)
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
  }
  return Hr(t, vn(t._zod.def, { shape: fg(t, e) }));
}
function fg(t, e) {
  const n = {};
  return io(n, t, Reflect.ownKeys(dr(t))), w1(n, e), n;
}
function z1(t, e) {
  if (!Ii(e))
    throw new Error("Invalid input to safeExtend: expected a plain object");
  return Hr(t, vn(t._zod.def, { shape: fg(t, e) }));
}
function M1(t, e) {
  if (!e?._zod?.def)
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  if (t._zod.def.checks?.length)
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  const n = {};
  io(n, t, Reflect.ownKeys(dr(t))), io(n, e, Reflect.ownKeys(dr(e)));
  const r = vn(t._zod.def, {
    shape: n,
    get catchall() {
      return e._zod.def.catchall;
    },
    checks: e._zod.def.checks ?? []
  });
  return Hr(t, r);
}
function Dd(t, e, n, r = "partial") {
  const i = e._zod.def.checks;
  if (i && i.length > 0)
    throw new Error(`.${r}() cannot be used on object schemas containing refinements`);
  const l = n ? new Set(oa(e, n)) : void 0, c = {};
  return io(c, e, Reflect.ownKeys(dr(e)), t && ((d, u) => l && !l.has(u) ? d : new t({ type: "optional", innerType: d }))), Hr(e, vn(e._zod.def, { shape: c, checks: [] }));
}
function O1(t, e, n) {
  const r = n ? new Set(oa(e, n)) : void 0, o = {};
  return io(o, e, Reflect.ownKeys(dr(e)), (i, a) => (
    // overwrite with non-optional
    r && !r.has(a) ? i : new t({ type: "nonoptional", innerType: i })
  )), Hr(e, vn(e._zod.def, { shape: o }));
}
function Ln(t, e = 0) {
  if (t.aborted === !0)
    return !0;
  for (let n = e; n < t.issues.length; n++)
    if (t.issues[n]?.continue !== !0)
      return !0;
  return !1;
}
function F1(t, e = 0) {
  if (t.aborted === !0)
    return !0;
  for (let n = e; n < t.issues.length; n++)
    if (t.issues[n]?.continue === !1)
      return !0;
  return !1;
}
function ia(t, e) {
  return e.map((n) => {
    var r;
    return (r = n).path ?? (r.path = []), n.path.unshift(t), n;
  });
}
function ni(t) {
  return typeof t == "string" ? t : t?.message;
}
function Nd(t, e, n) {
  var r;
  for (let o = e; o < t.length; o++)
    (r = t[o]).schema ?? (r.schema = n);
}
function Ko(t, e, n) {
  var r;
  const o = t.inst?._zod?.traits;
  o?.has("$ZodType") && (o.has("$ZodCheck") ? (r = t).schema ?? (r.schema = t.inst) : t.schema = t.inst);
  const i = t.schema !== t.inst ? t.schema?._zod.def?.error : void 0, a = t.message ? t.message : ni(t.inst?._zod.def?.error?.(t)) ?? ni(i?.(t)) ?? ni(e?.error?.(t)) ?? ni(n.customError?.(t)) ?? ni(n.localeError?.(t)) ?? "Invalid input", l = {};
  for (const c of Object.keys(t))
    c === "inst" || c === "schema" || c === "continue" || c === "input" || c === "__proto__" || (l[c] = t[c]);
  return l.path ?? (l.path = []), l.message = a, e?.reportInput && (l.input = t.input), l;
}
const R1 = /[\uD800-\uDBFF]/;
function Oc(t) {
  const e = t.length;
  if (!R1.test(t))
    return e;
  let n = e;
  for (let r = 0; r < e - 1; r++)
    (t.charCodeAt(r) & 64512) === 55296 && (t.charCodeAt(r + 1) & 64512) === 56320 && (n--, r++);
  return n;
}
function Fc(t) {
  return Array.isArray(t) ? "array" : typeof t == "string" ? "string" : "unknown";
}
function L1(t) {
  const e = typeof t;
  switch (e) {
    case "number":
      return Number.isNaN(t) ? "nan" : "number";
    case "object": {
      if (t === null)
        return "null";
      if (Array.isArray(t))
        return "array";
      const n = t;
      if (n && Object.getPrototypeOf(n) !== Object.prototype && "constructor" in n && n.constructor)
        return n.constructor.name;
    }
  }
  return e;
}
function zi(...t) {
  const [e, n, r] = t;
  return typeof e == "string" ? {
    message: e,
    code: "custom",
    input: n,
    inst: r
  } : { ...e };
}
function D1(t, e) {
  for (const n in e) {
    const r = Object.getOwnPropertyDescriptor(e, n);
    r.get ? Object.defineProperty(t, n, { ...r, enumerable: !1 }) : N1(t, n, r.value);
  }
}
function Lr(t, e, n, r = !0) {
  return Object.defineProperty(t, e, { configurable: !0, writable: !0, enumerable: r, value: n }), n;
}
function hg(t, e, n) {
  return Lr(t, e, n, !1);
}
function gg(t, e) {
  for (const n in t) {
    const r = t[n];
    Object.defineProperty(e, n, {
      configurable: !0,
      enumerable: !0,
      get() {
        return Lr(this, n, r(this));
      },
      set(o) {
        Lr(this, n, o);
      }
    });
  }
  return e;
}
function N1(t, e, n) {
  Object.defineProperty(t, e, {
    configurable: !0,
    get() {
      return this == null ? n : Lr(this, e, n.bind(this));
    },
    set(r) {
      Lr(this, e, r);
    }
  });
}
function B1(t, e) {
  const n = Object.getPrototypeOf(t);
  return e in n ? void 0 : n;
}
let Ga, Cr = !1;
const U1 = {
  configurable: !0,
  get() {
    Cr = !0;
  }
};
function gt(t, e, n) {
  const r = Object.getPrototypeOf(t._zod);
  if (e in r && Ga !== t._zod) {
    Ga = void 0;
    return;
  }
  Ga = t._zod, Object.defineProperty(r, e, {
    configurable: !0,
    get() {
      Object.defineProperty(this, e, U1);
      const o = Cr;
      Cr = !1;
      try {
        const i = n(this);
        return Cr ? delete this[e] : Object.defineProperty(this, e, { configurable: !0, writable: !0, value: i }), Cr = Cr || o, i;
      } catch (i) {
        throw delete this[e], Cr = Cr || o, i;
      }
    },
    set(o) {
      Object.defineProperty(this, e, { configurable: !0, writable: !0, value: o });
    }
  });
}
function j1(t, e, n, r) {
  const o = B1(t, e);
  o && Object.defineProperty(o, e, {
    configurable: !0,
    get() {
      const i = { configurable: !0, writable: !0, enumerable: r, value: void 0 };
      return Object.defineProperty(this, e, i), i.value = n(this), Object.defineProperty(this, e, i), i.value;
    },
    set(i) {
      Object.defineProperty(this, e, { configurable: !0, writable: !0, enumerable: r, value: i });
    }
  });
}
const H1 = "~constantCatch";
function W1(t) {
  const e = () => t;
  return e[H1] = !0, e;
}
var Bd;
const qa = { value: void 0, enumerable: !1 };
let Ud = "captureStackTrace" in Error ? Error : null;
function Z1(t) {
  const e = Ud;
  if (e) {
    const n = e.stackTraceLimit;
    if (typeof n == "number") {
      try {
        e.stackTraceLimit = 0;
      } catch {
        return Ud = null, new t();
      }
      try {
        return new t();
      } finally {
        e.stackTraceLimit = n;
      }
    }
  }
  return new t();
}
function te(t, e, n, r) {
  const o = {};
  function i(h) {
    this.def = h, this.constr = f, this.traits = /* @__PURE__ */ new Set();
  }
  i.prototype = o;
  const a = n, l = a && /* @__PURE__ */ new WeakSet();
  function c(h, p) {
    if (h._zod) {
      if (h._zod.traits.has(t))
        return;
    } else {
      qa.value = new i(p);
      try {
        Object.defineProperty(h, "_zod", qa);
      } finally {
        qa.value = void 0;
      }
    }
    if (h._zod.traits.add(t), e(h, p), l) {
      const w = Object.getPrototypeOf(h), y = h._zod.constr.prototype;
      let k = w;
      for (; k && k !== y; )
        k = Object.getPrototypeOf(k);
      const O = k ?? w;
      l.has(O) || (l.add(O), D1(O, a));
    }
    const m = f.prototype;
    for (const w in m)
      Object.prototype.hasOwnProperty.call(m, w) && (w in h || (h[w] = m[w].bind(h)));
  }
  const d = r?.Parent ?? Object;
  class u extends d {
  }
  Object.defineProperty(u, "name", { value: t });
  function f(h) {
    const p = r?.Parent ? Z1(u) : this;
    c(p, h);
    const m = p._zod.deferred;
    if (m) {
      for (const y of m)
        y();
      p._zod.deferred = void 0;
    }
    const w = globalThis.__zod_globalConfig?.postProcessor;
    return w && w(p), p;
  }
  return Object.defineProperty(f, "init", { value: c }), Object.defineProperty(f, Symbol.hasInstance, {
    value: (h) => r?.Parent && h instanceof r.Parent ? !0 : h?._zod?.traits?.has(t)
  }), Object.defineProperty(f, "name", { value: t }), f;
}
class $r extends Error {
  constructor() {
    super("Encountered Promise during synchronous parse. Use .parseAsync() instead.");
  }
}
class pg extends Error {
  constructor(e) {
    super(`Encountered unidirectional transform during encode: ${e}`), this.name = "ZodEncodeError";
  }
}
(Bd = globalThis).__zod_globalConfig ?? (Bd.__zod_globalConfig = {});
const Hn = globalThis.__zod_globalConfig;
function gr(t) {
  return t && Object.assign(Hn, t), Hn;
}
function K1() {
  const t = this._zod;
  return t.message ?? (t.message = JSON.stringify(t.def, Ll, 2)), t.message;
}
function V1(t) {
  this._zod.message = t;
}
const J1 = {
  get: K1,
  set: V1,
  enumerable: !0,
  configurable: !0
}, Ya = { value: void 0, enumerable: !1 }, jd = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]), G1 = (t, e) => {
  t.name = "$ZodError", Ya.value = e, Object.defineProperty(t, "issues", Ya), Ya.value = void 0, Object.defineProperty(t, "message", J1);
  const n = Object.getPrototypeOf(t);
  jd.has(n) || (jd.add(n), Object.defineProperty(n, "toString", {
    configurable: !0,
    enumerable: !1,
    get() {
      const r = () => this.message;
      return Object.defineProperty(this, "toString", { value: r, configurable: !0, writable: !0 }), r;
    },
    set(r) {
      Object.defineProperty(this, "toString", { value: r, configurable: !0, writable: !0 });
    }
  }));
}, q1 = te("$ZodError", G1);
function Y1(t, e, n) {
  return Object.prototype.hasOwnProperty.call(t, e) || (e === "__proto__" ? Object.defineProperty(t, e, { value: n(), writable: !0, enumerable: !0, configurable: !0 }) : t[e] = n()), t[e];
}
function X1(t, e = (n) => n.message) {
  const n = {}, r = [];
  for (const o of t.issues)
    o.path.length > 0 ? Y1(n, o.path[0], () => []).push(e(o)) : r.push(e(o));
  return { formErrors: r, fieldErrors: n };
}
function Q1(t, e = (n) => n.message) {
  const n = { _errors: [] }, r = (o, i = []) => {
    for (const a of o.issues)
      if (a.code === "invalid_union" && a.errors.length)
        a.errors.map((l) => r({ issues: l }, [...i, ...a.path]));
      else if (a.code === "invalid_key")
        r({ issues: a.issues }, [...i, ...a.path]);
      else if (a.code === "invalid_element")
        r({ issues: a.issues }, [...i, ...a.path]);
      else {
        const l = [...i, ...a.path];
        if (l.length === 0)
          n._errors.push(e(a));
        else {
          let c = n, d = 0;
          for (; d < l.length; ) {
            const u = l[d], f = d === l.length - 1;
            if (u === "_errors") {
              f && c._errors.push(e(a)), d++;
              continue;
            }
            Object.prototype.hasOwnProperty.call(c, u) || Object.defineProperty(c, u, {
              value: { _errors: [] },
              enumerable: !0,
              writable: !0,
              configurable: !0
            });
            const h = c[u];
            f && h._errors.push(e(a)), c = h, d++;
          }
        }
      }
  };
  return r(t), n;
}
function sa(t, e) {
  return { callee: e?.callee ?? t, Err: e?.Err };
}
const Rc = (t) => {
  const e = (n, r, o, i) => {
    const a = o ? { ...o, async: !1 } : { async: !1 }, l = n._zod.run({ value: r, issues: [] }, a);
    if (l instanceof Promise)
      throw new $r();
    if (l.issues.length) {
      const c = new (i?.Err ?? t)(l.issues.map((d) => Ko(d, a, gr())));
      throw lg(c, i?.callee ?? e), c;
    }
    return l.value;
  };
  return e;
}, Lc = (t) => {
  const e = async (n, r, o, i) => {
    const a = o ? { ...o, async: !0 } : { async: !0 };
    let l = n._zod.run({ value: r, issues: [] }, a);
    if (l instanceof Promise && (l = await l), l.issues.length) {
      const c = new (i?.Err ?? t)(l.issues.map((d) => Ko(d, a, gr())));
      throw lg(c, i?.callee ?? e), c;
    }
    return l.value;
  };
  return e;
}, Dc = (t) => (e, n, r) => {
  const o = r ? { ...r, async: !1 } : { async: !1 }, i = e._zod.run({ value: n, issues: [] }, o);
  if (i instanceof Promise)
    throw new $r();
  return i.issues.length ? mg(t, i.issues, o) : { success: !0, data: i.value };
};
function mg(t, e, n) {
  let r;
  return {
    success: !1,
    get error() {
      return r || (r = new t(e.map((o) => Ko(o, n, gr()))), e = void 0, n = void 0), r;
    },
    set error(o) {
      r = o, e = void 0, n = void 0;
    }
  };
}
const Nc = (t) => async (e, n, r) => {
  const o = r ? { ...r, async: !0 } : { async: !0 };
  let i = e._zod.run({ value: n, issues: [] }, o);
  return i instanceof Promise && (i = await i), i.issues.length ? mg(t, i.issues, o) : { success: !0, data: i.value };
}, $1 = /* @__PURE__ */ Symbol.for("zod.compile.invalid"), e_ = /* @__PURE__ */ Symbol.for("zod.compile.fallback"), t_ = ((t, e, n) => {
  const r = t._zod.bag.validator;
  if (r !== void 0) {
    if (r(e) !== $1)
      return !0;
    if (r.definite === !0 && n === void 0)
      return !1;
  }
  return n_(t, e, n);
});
function n_(t, e, n) {
  const r = n ? { ...n, async: !1, abortEarly: !0 } : { async: !1, abortEarly: !0 }, o = t._zod.bag.fallbackRun;
  let i;
  if (o ? (r[e_] = !0, i = o({ value: e, issues: [] }, r)) : i = t._zod.run({ value: e, issues: [] }, r), i instanceof Promise)
    throw new $r();
  return i.issues.length === 0;
}
const r_ = async (t, e, n) => {
  const r = n ? { ...n, async: !0, abortEarly: !0 } : { async: !0, abortEarly: !0 };
  let o = t._zod.run({ value: e, issues: [] }, r);
  return o instanceof Promise && (o = await o), o.issues.length === 0;
}, o_ = (t) => {
  const e = Rc(t), n = (r, o, i, a) => {
    const l = i ? { ...i, direction: "backward" } : { direction: "backward" };
    return e(r, o, l, sa(n, a));
  };
  return n;
}, i_ = (t) => {
  const e = Rc(t), n = (r, o, i, a) => e(r, o, i, sa(n, a));
  return n;
}, s_ = (t) => {
  const e = Lc(t), n = async (r, o, i, a) => {
    const l = i ? { ...i, direction: "backward" } : { direction: "backward" };
    return await e(r, o, l, sa(n, a));
  };
  return n;
}, a_ = (t) => {
  const e = Lc(t), n = async (r, o, i, a) => await e(r, o, i, sa(n, a));
  return n;
}, l_ = (t) => (e, n, r) => {
  const o = r ? { ...r, direction: "backward" } : { direction: "backward" };
  return Dc(t)(e, n, o);
}, c_ = (t) => (e, n, r) => Dc(t)(e, n, r), u_ = (t) => async (e, n, r) => {
  const o = r ? { ...r, direction: "backward" } : { direction: "backward" };
  return Nc(t)(e, n, o);
}, d_ = (t) => async (e, n, r) => Nc(t)(e, n, r), f_ = /^[cC][0-9a-z]{6,}$/, h_ = /^[0-9a-z]+$/, g_ = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/, p_ = /^[0-9a-vA-V]{20}$/, m_ = /^[A-Za-z0-9]{27}$/, v_ = /^[a-zA-Z0-9_-]{21}$/;
function __(t) {
  return new RegExp(`^[a-zA-Z0-9_-]{${t}}$`);
}
const y_ = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, b_ = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, Hd = (t) => t ? new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${t}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, w_ = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, k_ = "^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$";
function S_() {
  return new RegExp(k_, "u");
}
const x_ = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, E_ = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, T_ = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, C_ = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, A_ = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, P_ = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/, I_ = /^https?$/, z_ = /^\+[1-9]\d{6,14}$/, vg = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
function M_(t) {
  return new RegExp(`^${t}$`);
}
const O_ = /* @__PURE__ */ M_(vg);
function Dl(t) {
  const e = "(?:[01]\\d|2[0-3]):[0-5]\\d";
  return typeof t.precision == "number" ? t.precision === -1 ? `${e}` : t.precision === 0 ? `${e}:[0-5]\\d` : `${e}:[0-5]\\d\\.\\d{${t.precision}}` : t.seconds ? `${e}:[0-5]\\d(?:\\.\\d+)?` : `${e}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function F_(t) {
  return new RegExp(`^${Dl(t)}$`);
}
function R_(t) {
  const e = ["Z"];
  t.offset && e.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
  const n = `${Dl({ precision: t.precision, seconds: !0 })}(?:${e.join("|")})`, r = t.local ? `${n}|${Dl({ precision: t.precision })}` : n;
  return new RegExp(`^${vg}T(?:${r})$`);
}
const L_ = /^[\s\S]{0,}$/, D_ = /^-?\d+(?:\.\d+)?$/, N_ = /^(?:true|false)$/i, B_ = /^[^A-Z]*$/, U_ = /^[^a-z]*$/, fn = /* @__PURE__ */ te("$ZodCheck", (t, e) => {
  var n;
  t._zod ?? (t._zod = {}), t._zod.def = e, (n = t._zod).onattach ?? (n.onattach = []);
}), Bc = (t) => {
  const e = t.value;
  return !y1(e) && e.length !== void 0;
}, Ms = {
  number: "number",
  bigint: "bigint",
  object: "date"
}, _g = /* @__PURE__ */ te("$ZodCheckLessThan", (t, e) => {
  fn.init(t, e);
  const n = Ms[typeof e.value];
  t._zod.check = (r) => {
    (e.inclusive ? r.value <= e.value : r.value < e.value) || r.issues.push({
      origin: Ms[typeof r.value] ?? n,
      code: "too_big",
      maximum: typeof e.value == "object" ? e.value.getTime() : e.value,
      input: r.value,
      inclusive: e.inclusive,
      inst: t,
      continue: !e.abort
    });
  };
}), yg = /* @__PURE__ */ te("$ZodCheckGreaterThan", (t, e) => {
  fn.init(t, e);
  const n = Ms[typeof e.value];
  t._zod.check = (r) => {
    (e.inclusive ? r.value >= e.value : r.value > e.value) || r.issues.push({
      origin: Ms[typeof r.value] ?? n,
      code: "too_small",
      minimum: typeof e.value == "object" ? e.value.getTime() : e.value,
      input: r.value,
      inclusive: e.inclusive,
      inst: t,
      continue: !e.abort
    });
  };
}), j_ = /* @__PURE__ */ te("$ZodCheckMultipleOf", (t, e) => {
  fn.init(t, e), t._zod.check = (n) => {
    if (typeof n.value != typeof e.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    (typeof n.value == "bigint" ? (
      // `value % 0n` throws, and nothing is a multiple of zero — the number branch already fails this way via NaN
      e.value !== BigInt(0) && n.value % e.value === BigInt(0)
    ) : b1(n.value, e.value) === 0) || n.issues.push({
      origin: typeof n.value,
      code: "not_multiple_of",
      divisor: e.value,
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
}), H_ = /* @__PURE__ */ te("$ZodCheckNumberFormat", (t, e) => {
  fn.init(t, e), e.format = e.format || "float64";
  const n = e.format?.includes("int"), r = n ? "int" : "number", [o, i] = dg[e.format];
  t._zod.check = (a) => {
    const l = a.value;
    if (n) {
      if (!Number.isInteger(l)) {
        a.issues.push({
          expected: r,
          format: e.format,
          code: "invalid_type",
          continue: !1,
          input: l,
          inst: t
        });
        return;
      }
      if (!Number.isSafeInteger(l)) {
        l > 0 ? a.issues.push({
          input: l,
          code: "too_big",
          maximum: Number.MAX_SAFE_INTEGER,
          note: "Integers must be within the safe integer range.",
          inst: t,
          origin: r,
          inclusive: !0,
          continue: !e.abort
        }) : a.issues.push({
          input: l,
          code: "too_small",
          minimum: Number.MIN_SAFE_INTEGER,
          note: "Integers must be within the safe integer range.",
          inst: t,
          origin: r,
          inclusive: !0,
          continue: !e.abort
        });
        return;
      }
    }
    l < o && a.issues.push({
      origin: "number",
      input: l,
      code: "too_small",
      minimum: o,
      inclusive: !0,
      inst: t,
      continue: !e.abort
    }), l > i && a.issues.push({
      origin: "number",
      input: l,
      code: "too_big",
      maximum: i,
      inclusive: !0,
      inst: t,
      continue: !e.abort
    });
  };
}), W_ = /* @__PURE__ */ te("$ZodCheckMaxLength", (t, e) => {
  var n;
  fn.init(t, e), (n = t._zod.def).when ?? (n.when = Bc), t._zod.check = (r) => {
    const o = r.value, i = o.length;
    if ((typeof o == "string" && i > e.maximum ? Oc(o) : i) <= e.maximum)
      return;
    const l = Fc(o);
    r.issues.push({
      origin: l,
      code: "too_big",
      maximum: e.maximum,
      inclusive: !0,
      input: o,
      inst: t,
      continue: !e.abort
    });
  };
}), Z_ = /* @__PURE__ */ te("$ZodCheckMinLength", (t, e) => {
  var n;
  fn.init(t, e), (n = t._zod.def).when ?? (n.when = Bc), t._zod.check = (r) => {
    const o = r.value, i = o.length;
    if ((typeof o == "string" && i >= e.minimum && i < e.minimum * 2 ? Oc(o) : i) >= e.minimum)
      return;
    const l = Fc(o);
    r.issues.push({
      origin: l,
      code: "too_small",
      minimum: e.minimum,
      inclusive: !0,
      input: o,
      inst: t,
      continue: !e.abort
    });
  };
}), K_ = /* @__PURE__ */ te("$ZodCheckLengthEquals", (t, e) => {
  var n;
  fn.init(t, e), (n = t._zod.def).when ?? (n.when = Bc), t._zod.check = (r) => {
    const o = r.value, i = o.length, a = typeof o == "string" && i >= e.length && i <= e.length * 2 ? Oc(o) : i;
    if (a === e.length)
      return;
    const l = Fc(o), c = a > e.length;
    r.issues.push({
      origin: l,
      ...c ? { code: "too_big", maximum: e.length } : { code: "too_small", minimum: e.length },
      inclusive: !0,
      exact: !0,
      input: r.value,
      inst: t,
      continue: !e.abort
    });
  };
}), aa = /* @__PURE__ */ te("$ZodCheckStringFormat", (t, e) => {
  var n, r;
  fn.init(t, e), e.pattern ? (n = t._zod).check ?? (n.check = (o) => {
    e.pattern.lastIndex = 0, !e.pattern.test(o.value) && o.issues.push({
      origin: "string",
      code: "invalid_format",
      format: e.format,
      input: o.value,
      ...e.pattern ? { pattern: e.pattern.toString() } : {},
      inst: t,
      continue: !e.abort
    });
  }) : (r = t._zod).check ?? (r.check = () => {
  });
}), V_ = /* @__PURE__ */ te("$ZodCheckRegex", (t, e) => {
  aa.init(t, e), t._zod.check = (n) => {
    e.pattern.lastIndex = 0, !e.pattern.test(n.value) && n.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: n.value,
      pattern: e.pattern.toString(),
      inst: t,
      continue: !e.abort
    });
  };
}), J_ = /* @__PURE__ */ te("$ZodCheckLowerCase", (t, e) => {
  e.pattern ?? (e.pattern = B_), aa.init(t, e);
}), G_ = /* @__PURE__ */ te("$ZodCheckUpperCase", (t, e) => {
  e.pattern ?? (e.pattern = U_), aa.init(t, e);
}), q_ = /* @__PURE__ */ te("$ZodCheckIncludes", (t, e) => {
  fn.init(t, e);
  const n = zo(e.includes), r = new RegExp(typeof e.position == "number" ? `^.{${e.position},}${n}` : n);
  e.pattern = r, t._zod.check = (o) => {
    o.value.includes(e.includes, e.position) || o.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: e.includes,
      input: o.value,
      inst: t,
      continue: !e.abort
    });
  };
}), Y_ = /* @__PURE__ */ te("$ZodCheckStartsWith", (t, e) => {
  fn.init(t, e);
  const n = new RegExp(`^${zo(e.prefix)}.*`);
  e.pattern ?? (e.pattern = n), t._zod.check = (r) => {
    r.value.startsWith(e.prefix) || r.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: e.prefix,
      input: r.value,
      inst: t,
      continue: !e.abort
    });
  };
}), X_ = /* @__PURE__ */ te("$ZodCheckEndsWith", (t, e) => {
  fn.init(t, e);
  const n = new RegExp(`.*${zo(e.suffix)}$`);
  e.pattern ?? (e.pattern = n), t._zod.check = (r) => {
    r.value.endsWith(e.suffix) || r.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: e.suffix,
      input: r.value,
      inst: t,
      continue: !e.abort
    });
  };
}), Q_ = /* @__PURE__ */ te("$ZodCheckOverwrite", (t, e) => {
  fn.init(t, e), t._zod.check = (n) => {
    n.value = e.tx(n.value);
  };
});
class $_ {
  constructor(e = [], n = {}) {
    this.content = [], this.indent = 0, this.args = e, this.closed = n;
  }
  // the compiler catches a child's throw and keeps writing into this doc, so the indent has to unwind with it
  indented(e) {
    this.indent += 1;
    try {
      e(this);
    } finally {
      this.indent -= 1;
    }
  }
  write(e) {
    if (typeof e == "function") {
      e(this, { execution: "sync" }), e(this, { execution: "async" });
      return;
    }
    const r = e.split(`
`).filter((a) => a), o = Math.min(...r.map((a) => a.length - a.trimStart().length)), i = r.map((a) => a.slice(o)).map((a) => " ".repeat(this.indent * 2) + a);
    for (const a of i)
      this.content.push(a);
  }
  compile() {
    const e = Function, n = this?.content ?? [""];
    return new e(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${n.join(`
`)}
};`)(...Object.values(this.closed));
  }
}
const ey = {
  major: 4,
  minor: 6,
  patch: 4
}, kt = /* @__PURE__ */ te("$ZodType", (t, e) => {
  var n;
  t ?? (t = {}), t._zod.def = e, t._zod.bag = t._zod.bag || {}, t._zod.version = ey;
  const r = t._zod.def.checks, o = t._zod.traits.has("$ZodCheck") ? [t, ...r ?? []] : r?.length ? [...r] : [];
  for (const i of o)
    for (const a of i._zod.onattach)
      a(t);
  if (o.length === 0)
    (n = t._zod).deferred ?? (n.deferred = []), t._zod.deferred?.push(() => {
      t._zod.run = t._zod.parse;
    });
  else {
    const i = (l, c, d) => {
      if (l.memo)
        return l;
      let u = Ln(l), f;
      for (const h of c) {
        if (h._zod.def.when) {
          if (F1(l) || !h._zod.def.when(l))
            continue;
        } else if (u)
          continue;
        const p = l.issues.length, m = h._zod.check(l);
        if (m instanceof Promise && d?.async === !1)
          throw new $r();
        if (f || m instanceof Promise)
          f = (f ?? Promise.resolve()).then(async () => {
            await m, l.issues.length !== p && (Nd(l.issues, p, t), u || (u = Ln(l, p)));
          });
        else {
          if (l.issues.length === p)
            continue;
          Nd(l.issues, p, t), u || (u = Ln(l, p));
        }
      }
      return f ? f.then(() => l) : l;
    }, a = (l, c, d) => {
      if (Ln(l))
        return l.aborted = !0, l;
      const u = i(c, o, d);
      if (u instanceof Promise) {
        if (d.async === !1)
          throw new $r();
        return u.then((f) => t._zod.parse(f, d));
      }
      return t._zod.parse(u, d);
    };
    t._zod.run = (l, c) => {
      if (c.skipChecks)
        return t._zod.parse(l, c);
      if (c.direction === "backward") {
        const u = t._zod.parse({ value: l.value, issues: [] }, { ...c, skipChecks: !0 });
        return u instanceof Promise ? u.then((f) => a(f, l, c)) : a(u, l, c);
      }
      const d = t._zod.parse(l, c);
      if (d instanceof Promise) {
        if (c.async === !1)
          throw new $r();
        return d.then((u) => i(u, o, c));
      }
      return i(d, o, c);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hg(this, "~standard", wg(this));
  },
  set "~standard"(t) {
    Lr(this, "~standard", t);
  }
}), bg = (t, e) => t.issues.length ? { issues: t.issues.map((n) => Ko(n, e, gr())) } : { value: t.value };
async function ty(t, e) {
  const n = { async: !0 };
  return bg(await t._zod.run({ value: e, issues: [] }, n), n);
}
function wg(t) {
  return {
    validate: (e) => {
      const n = { async: !1 };
      try {
        const r = t._zod.run({ value: e, issues: [] }, n);
        if (!(r instanceof Promise))
          return bg(r, n);
      } catch {
      }
      return ty(t, e);
    },
    vendor: "zod",
    version: 1
  };
}
const Uc = /* @__PURE__ */ te("$ZodString", (t, e) => {
  kt.init(t, e), t._zod.pattern = e.pattern ?? L_, t._zod.parse = (n, r) => {
    if (e.coerce)
      try {
        n.value = String(n.value);
      } catch {
      }
    return typeof n.value == "string" || n.issues.push({
      expected: "string",
      code: "invalid_type",
      input: n.value,
      inst: t
    }), n;
  };
}), St = /* @__PURE__ */ te("$ZodStringFormat", (t, e) => {
  aa.init(t, e), Uc.init(t, e);
}), ny = /* @__PURE__ */ te("$ZodGUID", (t, e) => {
  e.pattern ?? (e.pattern = b_), St.init(t, e);
}), ry = /* @__PURE__ */ te("$ZodUUID", (t, e) => {
  if (e.version) {
    const r = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    }[e.version];
    if (r === void 0)
      throw new Error(`Invalid UUID version: "${e.version}"`);
    e.pattern ?? (e.pattern = Hd(r));
  } else
    e.pattern ?? (e.pattern = Hd());
  St.init(t, e);
}), oy = /* @__PURE__ */ te("$ZodEmail", (t, e) => {
  e.pattern ?? (e.pattern = w_), St.init(t, e);
}), kg = 1, Os = 2;
function Sg(t) {
  try {
    return typeof URL < "u" && typeof URL.canParse == "function" ? URL.canParse(t) : (new URL(t), !0);
  } catch {
    return !1;
  }
}
function iy(t, e) {
  return !("normalize" in e) && !("hostname" in e) && !("protocol" in e) ? Sg(t) || Os : sy(t, e);
}
function sy(t, e) {
  if (!e.normalize && e.protocol?.source === I_.source && !/^https?:\/\//i.test(t))
    return kg;
  try {
    if (typeof URL < "u") {
      const n = URL;
      if (typeof n.parse == "function")
        return n.parse(t) ?? Os;
    }
    return new URL(t);
  } catch {
    return Os;
  }
}
const ay = /[\t\n\r]/g;
function Wd(t) {
  return t.replace(ay, "");
}
function ly(t, e) {
  return e.lastIndex = 0, e.test(t.hostname);
}
function cy(t, e) {
  return e.lastIndex = 0, e.test(t.protocol.endsWith(":") ? t.protocol.slice(0, -1) : t.protocol);
}
const uy = /* @__PURE__ */ te("$ZodURL", (t, e) => {
  St.init(t, e), t._zod.check = (n) => {
    try {
      const r = n.value.trim(), o = iy(r, e);
      if (o === kg) {
        n.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid URL format",
          input: n.value,
          inst: t,
          continue: !e.abort
        });
        return;
      }
      if (o === Os) {
        n.issues.push({
          code: "invalid_format",
          format: "url",
          input: n.value,
          inst: t,
          continue: !e.abort
        });
        return;
      }
      if (o === !0) {
        n.value = Wd(r);
        return;
      }
      e.hostname && !ly(o, e.hostname) && n.issues.push({
        code: "invalid_format",
        format: "url",
        note: "Invalid hostname",
        pattern: e.hostname.source,
        input: n.value,
        inst: t,
        continue: !e.abort
      }), e.protocol && !cy(o, e.protocol) && n.issues.push({
        code: "invalid_format",
        format: "url",
        note: "Invalid protocol",
        pattern: e.protocol.source,
        input: n.value,
        inst: t,
        continue: !e.abort
      }), n.value = e.normalize ? o.href : Wd(r);
      return;
    } catch {
      n.issues.push({
        code: "invalid_format",
        format: "url",
        input: n.value,
        inst: t,
        continue: !e.abort
      });
    }
  };
}), dy = /* @__PURE__ */ te("$ZodEmoji", (t, e) => {
  e.pattern ?? (e.pattern = S_()), St.init(t, e);
}), fy = /* @__PURE__ */ te("$ZodNanoID", (t, e) => {
  if (e.length !== void 0 && (!Number.isInteger(e.length) || e.length < 1))
    throw new Error(`Invalid nanoid length: ${e.length}`);
  e.pattern ?? (e.pattern = e.length === void 0 ? v_ : __(e.length)), St.init(t, e);
}), hy = /* @__PURE__ */ te("$ZodCUID", (t, e) => {
  e.pattern ?? (e.pattern = f_), St.init(t, e);
}), gy = /* @__PURE__ */ te("$ZodCUID2", (t, e) => {
  e.pattern ?? (e.pattern = h_), St.init(t, e);
}), py = /* @__PURE__ */ te("$ZodULID", (t, e) => {
  e.pattern ?? (e.pattern = g_), St.init(t, e);
}), my = /* @__PURE__ */ te("$ZodXID", (t, e) => {
  e.pattern ?? (e.pattern = p_), St.init(t, e);
}), vy = /* @__PURE__ */ te("$ZodKSUID", (t, e) => {
  e.pattern ?? (e.pattern = m_), St.init(t, e);
}), _y = /* @__PURE__ */ te("$ZodISODateTime", (t, e) => {
  e.pattern ?? (e.pattern = R_(e)), St.init(t, e);
}), yy = /* @__PURE__ */ te("$ZodISODate", (t, e) => {
  e.pattern ?? (e.pattern = O_), St.init(t, e);
}), by = /* @__PURE__ */ te("$ZodISOTime", (t, e) => {
  e.pattern ?? (e.pattern = F_(e)), St.init(t, e);
}), wy = /* @__PURE__ */ te("$ZodISODuration", (t, e) => {
  e.pattern ?? (e.pattern = y_), St.init(t, e);
}), ky = /* @__PURE__ */ te("$ZodIPv4", (t, e) => {
  e.pattern ?? (e.pattern = x_), St.init(t, e);
}), Sy = /^[0-9a-fA-F:.]+$/;
function xg(t) {
  return Sy.test(t) ? Sg(`http://[${t}]`) : !1;
}
const xy = /* @__PURE__ */ te("$ZodIPv6", (t, e) => {
  e.pattern ?? (e.pattern = E_), St.init(t, e), t._zod.check = (n) => {
    xg(n.value) || n.issues.push({
      code: "invalid_format",
      format: "ipv6",
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
}), Ey = /* @__PURE__ */ te("$ZodCIDRv4", (t, e) => {
  e.pattern ?? (e.pattern = T_), St.init(t, e);
});
function Ty(t) {
  const e = t.split("/");
  if (e.length !== 2)
    return !1;
  const [n, r] = e;
  if (!r)
    return !1;
  const o = Number(r);
  return `${o}` !== r || o < 0 || o > 128 ? !1 : xg(n);
}
const Cy = /* @__PURE__ */ te("$ZodCIDRv6", (t, e) => {
  e.pattern ?? (e.pattern = C_), St.init(t, e), t._zod.check = (n) => {
    Ty(n.value) || n.issues.push({
      code: "invalid_format",
      format: "cidrv6",
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
});
function Eg(t) {
  if (t === "")
    return !0;
  if (/\s/.test(t) || t.length % 4 !== 0)
    return !1;
  try {
    return atob(t), !0;
  } catch {
    return !1;
  }
}
const Tg = /^[0-9a-zA-Z+/]*={0,2}$/, Ay = /* @__PURE__ */ te("$ZodBase64", (t, e) => {
  e.pattern ?? (e.pattern = Tg), St.init(t, e), t._zod.check = (n) => {
    Eg(n.value) || n.issues.push({
      code: "invalid_format",
      format: "base64",
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
}), jc = /^[A-Za-z0-9_-]*$/;
function Py(t) {
  if (!jc.test(t))
    return !1;
  const e = t.replace(/[-_]/g, (r) => r === "-" ? "+" : "/"), n = e.padEnd(Math.ceil(e.length / 4) * 4, "=");
  return Eg(n);
}
const Iy = /* @__PURE__ */ te("$ZodBase64URL", (t, e) => {
  e.pattern ?? (e.pattern = jc), St.init(t, e), t._zod.check = (n) => {
    Py(n.value) || n.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
}), zy = /* @__PURE__ */ te("$ZodE164", (t, e) => {
  e.pattern ?? (e.pattern = z_), St.init(t, e);
});
function My(t, e = null) {
  try {
    const n = t.split(".");
    if (n.length !== 3)
      return !1;
    const [r] = n;
    if (!r)
      return !1;
    const o = JSON.parse(atob(r));
    return !("typ" in o && o?.typ !== "JWT" || !o.alg || e && (!("alg" in o) || o.alg !== e));
  } catch {
    return !1;
  }
}
const Oy = /* @__PURE__ */ te("$ZodJWT", (t, e) => {
  St.init(t, e), t._zod.check = (n) => {
    My(n.value, e.alg) || n.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: n.value,
      inst: t,
      continue: !e.abort
    });
  };
}), Cg = /* @__PURE__ */ te("$ZodNumber", (t, e) => {
  kt.init(t, e), t._zod.pattern = D_, t._zod.parse = (n, r) => {
    if (e.coerce)
      try {
        n.value = Number(n.value);
      } catch {
      }
    const o = n.value;
    if (typeof o == "number" && !Number.isNaN(o) && Number.isFinite(o))
      return n;
    const i = typeof o == "number" ? Number.isNaN(o) ? "NaN" : Number.isFinite(o) ? void 0 : String(o) : void 0;
    return n.issues.push({
      expected: "number",
      code: "invalid_type",
      input: o,
      inst: t,
      ...i ? { received: i } : {}
    }), n;
  };
}), Fy = /* @__PURE__ */ te("$ZodNumberFormat", (t, e) => {
  H_.init(t, e), Cg.init(t, e);
}), Ry = /* @__PURE__ */ te("$ZodBoolean", (t, e) => {
  kt.init(t, e), t._zod.pattern = N_, t._zod.parse = (n, r) => {
    if (e.coerce)
      try {
        n.value = !!n.value;
      } catch {
      }
    const o = n.value;
    return typeof o == "boolean" || n.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input: o,
      inst: t
    }), n;
  };
}), Ly = /* @__PURE__ */ te("$ZodUnknown", (t, e) => {
  kt.init(t, e), t._zod.parse = (n) => n;
}), Dy = /* @__PURE__ */ te("$ZodNever", (t, e) => {
  kt.init(t, e), t._zod.parse = (n, r) => (n.issues.push({
    expected: "never",
    code: "invalid_type",
    input: n.value,
    inst: t
  }), n);
});
function Zd(t, e, n) {
  t.issues.length && e.issues.push(...ia(n, t.issues)), e.value[n] = t.value;
}
const Ny = /* @__PURE__ */ te("$ZodArray", (t, e) => {
  kt.init(t, e);
  const n = Hn.memoizer;
  n?.attach(t), t._zod.parse = (r, o) => {
    const i = r.value;
    if (!Array.isArray(i))
      return r.issues.push({
        expected: "array",
        code: "invalid_type",
        input: i,
        inst: t
      }), r;
    r.value = n ? n.alloc(t, r, Array(i.length), o) : Array(i.length);
    const a = [], l = o?.abortEarly;
    for (let c = 0; c < i.length; c++) {
      const d = i[c], u = e.element._zod.run({
        value: d,
        issues: []
      }, o);
      if (u instanceof Promise)
        a.push(u.then((f) => Zd(f, r, c)));
      else if (Zd(u, r, c), l && u.issues.length !== 0 && Ln(u))
        break;
    }
    return a.length ? Promise.all(a).then(() => r) : r;
  };
});
function Fs(t, e, n, r, o, i) {
  const a = n in r, l = i === "optional";
  if (!(!a && l && o === "optional")) {
    if (t.issues.length) {
      if (o !== void 0 && l && !a)
        return;
      e.issues.push(...ia(n, t.issues));
    }
    if (!a && o === void 0) {
      t.issues.length || e.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [n]
      });
      return;
    }
    t.value === void 0 ? (a || o === "defaulted" && !l) && (e.value[n] = void 0) : e.value[n] = t.value;
  }
}
const By = [];
function Ag(t) {
  const e = Object.keys(t.shape), n = Object.getOwnPropertySymbols(t.shape), r = n.length ? n : By, o = r.length ? [...e, ...r] : e;
  for (const a of o)
    if (!t.shape?.[a]?._zod?.traits?.has("$ZodType"))
      throw new Error(`Invalid element at key "${String(a)}": expected a Zod schema`);
  const i = T1(t.shape);
  return {
    ...t,
    allKeys: o,
    symbolKeys: r,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(e),
    numKeys: e.length,
    optionalKeys: new Set(i)
  };
}
function Pg(t, e, n, r, o, i, a) {
  const l = [], c = o.keySet, d = o.catchall._zod, u = d.def.type, f = d.optin, h = d.optout;
  let p = 0;
  for (const m in e) {
    if (a && n.issues.length !== p) {
      if (Ln(n, p))
        break;
      p = n.issues.length;
    }
    if (c.has(m))
      continue;
    if (m === "__proto__") {
      u === "never" && l.push(m);
      continue;
    }
    if (u === "never") {
      l.push(m);
      continue;
    }
    const w = d.run({ value: e[m], issues: [] }, r);
    w instanceof Promise ? t.push(w.then((y) => Fs(y, n, m, e, f, h))) : Fs(w, n, m, e, f, h);
  }
  return l.length && n.issues.push({
    code: "unrecognized_keys",
    keys: l,
    input: e,
    inst: i,
    // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
    continue: !0
  }), t.length ? Promise.all(t).then(() => n) : n;
}
const Uy = /* @__PURE__ */ te("$ZodObject", (t, e) => {
  kt.init(t, e);
  const n = Object.getOwnPropertyDescriptor(e, "shape"), r = n?.get ? n.get.raw : e.shape ?? {};
  if (r) {
    const d = () => {
      const u = { ...r };
      return Object.defineProperty(e, "shape", { value: u }), d.raw = u, u;
    };
    d.raw = r, Object.defineProperty(e, "shape", { get: d });
  }
  const o = zc(() => Ag(e));
  gt(t, "propValues", (d) => {
    const u = d.def.shape, f = {};
    for (const h in u) {
      const p = u[h]._zod;
      if (p.values) {
        Object.prototype.hasOwnProperty.call(f, h) || uo(f, h, /* @__PURE__ */ new Set());
        for (const m of p.values)
          f[h].add(m);
        p.optin !== void 0 && f[h].add(void 0);
      }
    }
    return f;
  });
  const i = zs, a = e.catchall;
  let l;
  const c = Hn.memoizer;
  c?.attach(t), t._zod.parse = (d, u) => {
    l ?? (l = o.value);
    const f = d.value;
    if (!i(f))
      return d.issues.push({
        expected: "object",
        code: "invalid_type",
        input: f,
        inst: t
      }), d;
    d.value = c ? c.alloc(t, d, {}, u) : {};
    const h = [], p = l.shape, m = u?.abortEarly;
    let w = d.issues.length;
    for (const y of l.allKeys) {
      if (m && d.issues.length !== w) {
        if (Ln(d, w))
          break;
        w = d.issues.length;
      }
      if (y === "__proto__")
        continue;
      const k = p[y], O = k._zod.optin, C = k._zod.optout, P = k._zod.run({ value: f[y], issues: [] }, u);
      P instanceof Promise ? h.push(P.then((S) => Fs(S, d, y, f, O, C))) : Fs(P, d, y, f, O, C);
    }
    return a ? Pg(h, f, d, u, o.value, t, m === !0) : h.length ? Promise.all(h).then(() => d) : d;
  };
}), jy = /* @__PURE__ */ te("$ZodObjectJIT", (t, e) => {
  Uy.init(t, e);
  const n = t._zod.parse, r = zc(() => Ag(e)), o = Hn.memoizer, i = (p) => {
    const m = r.value, w = m.symbolKeys, y = new $_(["payload", "ctx"], { shape: p, inst: t, memo: o, syms: w }), k = (S) => `shape[${S}]._zod.run({ value: input[${S}], issues: [] }, ctx)`, O = (S, T) => `
          let ${S}_ab = false;
          for (let i = 0; i < ${S}.issues.length; i++) {
            const iss = ${S}.issues[i];
            iss.path = iss.path ? [${T}, ...iss.path] : [${T}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${S}_ab = true;
          }
          if (${S}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
    y.write("const input = payload.value;");
    const C = /* @__PURE__ */ Object.create(null);
    let P = 0;
    for (const S of m.allKeys)
      C[S] = `key_${P++}`;
    y.write(o ? "const newResult = memo.alloc(inst, payload, {}, ctx);" : "const newResult = {};");
    for (const S of m.allKeys) {
      if (S === "__proto__")
        continue;
      const T = C[S], M = typeof S == "symbol" ? `syms[${w.indexOf(S)}]` : k1(S), H = `${M} in input`, q = p[S], R = q?._zod?.optin, K = R !== void 0, ie = q?._zod?.optout === "optional";
      if (y.write(`const ${T} = ${k(M)};`), K && ie) {
        const ne = R === "optional" ? `${T}_present` : `${T}.value !== undefined || ${T}_present`;
        y.write(`
        const ${T}_present = ${H};
        if (!${T}.issues.length || ${T}_present) {
          if (${T}.issues.length) {${O(T, M)}
          }

          if (${ne}) {
            newResult[${M}] = ${T}.value;
          }
        }

      `);
      } else K ? (y.write(`
        if (${T}.issues.length) {${O(T, M)}
        }
      `), R === "defaulted" ? y.write(`newResult[${M}] = ${T}.value;`) : y.write(`
        if (${T}.value !== undefined || ${H}) {
          newResult[${M}] = ${T}.value;
        }
      `)) : y.write(`
        const ${T}_present = ${H};
        if (${T}.issues.length) {${O(T, M)}
        }
        if (!${T}_present && !${T}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${M}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${T}_present) {
          newResult[${M}] = ${T}.value;
        }

      `);
    }
    return y.write("payload.value = newResult;"), y.write("return payload;"), y.compile();
  };
  let a;
  const l = zs, c = !Hn.jitless, u = c && x1.value, f = e.catchall;
  let h;
  t._zod.parse = (p, m) => {
    h ?? (h = r.value);
    const w = p.value;
    return l(w) ? c && u && m?.async === !1 && m.jitless !== !0 ? (a || (a = i(e.shape)), p = a(p, m), f ? Pg([], w, p, m, h, t, m?.abortEarly === !0) : p) : n(p, m) : (p.issues.push({
      expected: "object",
      code: "invalid_type",
      input: w,
      inst: t
    }), p);
  };
});
function Kd(t, e, n, r) {
  for (const i of t)
    if (i.issues.length === 0)
      return e.value = i.value, e;
  const o = t.filter((i) => !Ln(i));
  return o.length === 1 ? (e.value = o[0].value, o[0]) : (e.issues.push({
    code: "invalid_union",
    input: e.value,
    inst: n,
    errors: t.map((i) => i.issues.map((a) => Ko(a, r, gr())))
  }), e);
}
const Hy = /* @__PURE__ */ te("$ZodUnion", (t, e) => {
  kt.init(t, e), gt(t, "optin", (r) => r.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : r.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0), gt(t, "optout", (r) => r.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0), gt(t, "values", (r) => {
    if (r.def.options.every((o) => o._zod.values))
      return new Set(r.def.options.flatMap((o) => Array.from(o._zod.values)));
  }), gt(t, "pattern", (r) => {
    if (r.def.options.every((o) => o._zod.pattern)) {
      const o = r.def.options.map((i) => i._zod.pattern);
      return new RegExp(`^(${o.map((i) => Mc(i.source)).join("|")})$`);
    }
  });
  const n = e.options.length === 1 ? e.options[0]._zod.run : null;
  t._zod.parse = (r, o) => {
    if (n)
      return n(r, o);
    let i = !1;
    const a = [];
    for (const l of e.options) {
      const c = l._zod.run({
        value: r.value,
        issues: []
      }, o);
      if (c instanceof Promise)
        a.push(c), i = !0;
      else {
        if (c.issues.length === 0)
          return c;
        a.push(c);
      }
    }
    return i ? Promise.all(a).then((l) => Kd(l, r, t, o)) : Kd(a, r, t, o);
  };
}), Wy = /* @__PURE__ */ te("$ZodIntersection", (t, e) => {
  kt.init(t, e), t._zod.parse = (n, r) => {
    const o = n.value, i = e.left._zod.run({ value: o, issues: [] }, r), a = e.right._zod.run({ value: o, issues: [] }, r);
    return i instanceof Promise || a instanceof Promise ? Promise.all([i, a]).then(([c, d]) => Vd(n, c, d)) : Vd(n, i, a);
  };
});
function Nl(t, e) {
  if (t === e)
    return { valid: !0, data: t };
  if (t instanceof Date && e instanceof Date && +t == +e)
    return { valid: !0, data: t };
  if (Ii(t) && Ii(e)) {
    const n = Object.keys(e), r = Object.keys(t).filter((i) => n.indexOf(i) !== -1), o = { ...t, ...e };
    Object.prototype.hasOwnProperty.call(o, "__proto__") && delete o.__proto__;
    for (const i of r) {
      if (i === "__proto__")
        continue;
      const a = Nl(t[i], e[i]);
      if (!a.valid)
        return {
          valid: !1,
          mergeErrorPath: [i, ...a.mergeErrorPath]
        };
      o[i] = a.data;
    }
    return { valid: !0, data: o };
  }
  if (Array.isArray(t) && Array.isArray(e)) {
    if (t.length !== e.length)
      return { valid: !1, mergeErrorPath: [] };
    const n = [];
    for (let r = 0; r < t.length; r++) {
      const o = t[r], i = e[r], a = Nl(o, i);
      if (!a.valid)
        return {
          valid: !1,
          mergeErrorPath: [r, ...a.mergeErrorPath]
        };
      n.push(a.data);
    }
    return { valid: !0, data: n };
  }
  return { valid: !1, mergeErrorPath: [] };
}
function Vd(t, e, n) {
  const r = /* @__PURE__ */ new Map();
  let o;
  const i = /* @__PURE__ */ new Map(), a = (d, u) => {
    let f;
    if (d.code === "unrecognized_keys" && !d.path?.length)
      o ?? (o = d), f = d.keys;
    else if (d.code === "invalid_key" && d.origin === "record" && d.path?.length === 1) {
      const h = String(d.path[0]);
      i.has(h) || i.set(h, d), f = [h];
    } else
      return !1;
    for (const h of f)
      r.has(h) || r.set(h, {}), r.get(h)[u] = !0;
    return !0;
  };
  for (const d of e.issues)
    a(d, "l") || t.issues.push(d);
  for (const d of n.issues)
    a(d, "r") || t.issues.push(d);
  const l = [...r].filter(([, d]) => d.l && d.r).map(([d]) => d);
  if (l.length) {
    const d = o ? l.filter((u) => o.keys.includes(u)) : [];
    d.length && t.issues.push({ ...o, keys: d });
    for (const u of l)
      !d.includes(u) && i.has(u) && t.issues.push(i.get(u));
  }
  const c = Nl(e.value, n.value);
  if (!c.valid) {
    if (Ln(t))
      return t;
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(c.mergeErrorPath)}`);
  }
  return t.value = c.data, t;
}
const Zy = /* @__PURE__ */ te("$ZodTuple", (t, e) => {
  kt.init(t, e);
  const n = e.items, r = Hn.memoizer;
  r?.attach(t), t._zod.parse = (o, i) => {
    const a = o.value;
    if (!Array.isArray(a))
      return o.issues.push({
        input: a,
        inst: t,
        expected: "tuple",
        code: "invalid_type"
      }), o;
    o.value = r ? r.alloc(t, o, [], i) : [];
    const l = [], c = Jd(n, "optin"), d = Jd(n, "optout");
    if (!e.rest) {
      if (a.length < c)
        return o.issues.push({
          code: "too_small",
          minimum: c,
          inclusive: !0,
          input: a,
          inst: t,
          origin: "array"
        }), o;
      a.length > n.length && o.issues.push({
        code: "too_big",
        maximum: n.length,
        inclusive: !0,
        input: a,
        inst: t,
        origin: "array"
      });
    }
    const u = new Array(n.length), f = e.rest ? i?.abortEarly : void 0;
    let h = !1;
    for (let p = 0; p < n.length; p++) {
      const m = n[p]._zod.run({ value: a[p], issues: [] }, i);
      m instanceof Promise ? l.push(m.then((w) => {
        u[p] = w;
      })) : (u[p] = m, f && !h && m.issues.length && (h = Ln(m)));
    }
    if (e.rest && !h) {
      let p = n.length - 1;
      const m = a.slice(n.length);
      let w = o.issues.length;
      for (const y of m) {
        if (f && o.issues.length !== w) {
          if (Ln(o, w))
            break;
          w = o.issues.length;
        }
        p++;
        const k = e.rest._zod.run({ value: y, issues: [] }, i);
        k instanceof Promise ? l.push(k.then((O) => Gd(O, o, p))) : Gd(k, o, p);
      }
    }
    return l.length ? Promise.all(l).then(() => qd(u, o, n, a, d)) : qd(u, o, n, a, d);
  };
});
function Jd(t, e) {
  for (let n = t.length - 1; n >= 0; n--)
    if (!(e === "optin" ? t[n]._zod.optin !== void 0 : t[n]._zod.optout === "optional"))
      return n + 1;
  return 0;
}
function Gd(t, e, n) {
  t.issues.length && e.issues.push(...ia(n, t.issues)), e.value[n] = t.value;
}
function qd(t, e, n, r, o) {
  for (let i = 0; i < n.length; i++) {
    const a = t[i], l = i < r.length;
    if (!l && i >= o && n[i]._zod.optin === "optional") {
      e.value.length = i;
      break;
    }
    if (a.issues.length) {
      if (!l && i >= o) {
        e.value.length = i;
        break;
      }
      e.issues.push(...ia(i, a.issues));
    }
    e.value[i] = a.value;
  }
  for (let i = e.value.length - 1; i >= r.length && (n[i]._zod.optout === "optional" && e.value[i] === void 0); i--)
    e.value.length = i;
  return e;
}
const Ky = /* @__PURE__ */ te("$ZodEnum", (t, e) => {
  kt.init(t, e);
  const n = Rl(e.entries), r = new Set(n);
  t._zod.values = r, gt(t, "pattern", (o) => {
    const i = Rl(o.def.entries).filter((a) => E1.has(typeof a));
    return new RegExp(i.length ? `^(${i.map((a) => zo(a.toString())).join("|")})$` : "^[^\\s\\S]$");
  }), t._zod.parse = (o, i) => {
    const a = o.value;
    return r.has(a) || o.issues.push({
      code: "invalid_value",
      values: n,
      input: a,
      inst: t
    }), o;
  };
}), Vy = /* @__PURE__ */ te("$ZodLiteral", (t, e) => {
  kt.init(t, e);
  const n = new Set(e.values);
  t._zod.values = n, gt(t, "pattern", (r) => {
    const o = r.def.values;
    return new RegExp(o.length ? `^(${o.map((i) => typeof i == "string" ? zo(i) : i ? zo(i.toString()) : String(i)).join("|")})$` : "^[^\\s\\S]$");
  }), t._zod.parse = (r, o) => {
    const i = r.value;
    return n.has(i) || r.issues.push({
      code: "invalid_value",
      values: e.values,
      input: i,
      inst: t
    }), r;
  };
}), Jy = /* @__PURE__ */ te("$ZodTransform", (t, e) => {
  kt.init(t, e), t._zod.optin = "optional", Hn.memoizer?.guard(t), t._zod.parse = (n, r) => {
    if (r.direction === "backward")
      throw new pg(t.constructor.name);
    const o = e.transform(n.value, n);
    if (r.async)
      return (o instanceof Promise ? o : Promise.resolve(o)).then((a) => (n.value = a, n));
    if (o instanceof Promise)
      throw new $r();
    return n.value = o, n;
  };
});
function Yd(t, e) {
  return t.value = e.issues.length ? void 0 : e.value, t;
}
const Ig = /* @__PURE__ */ te("$ZodOptional", (t, e) => {
  kt.init(t, e), gt(t, "optin", (n) => n.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional"), t._zod.optout = "optional", gt(t, "values", (n) => {
    const r = n.def.innerType._zod.values;
    return r ? /* @__PURE__ */ new Set([...r, void 0]) : void 0;
  }), gt(t, "pattern", (n) => {
    const r = n.def.innerType._zod.pattern;
    return r ? new RegExp(`^(${Mc(r.source)})?$`) : void 0;
  }), t._zod.parse = (n, r) => {
    if (n.value === void 0) {
      if (e.innerType._zod.optin !== "defaulted")
        return n;
      const o = e.innerType._zod.run({ value: n.value, issues: [] }, r);
      return o instanceof Promise ? o.then((i) => Yd(n, i)) : Yd(n, o);
    }
    return e.innerType._zod.run(n, r);
  };
}), Gy = /* @__PURE__ */ te("$ZodExactOptional", (t, e) => {
  Ig.init(t, e), gt(t, "values", (n) => n.def.innerType._zod.values), gt(t, "pattern", (n) => n.def.innerType._zod.pattern), t._zod.parse = (n, r) => e.innerType._zod.run(n, r);
}), qy = /* @__PURE__ */ te("$ZodNullable", (t, e) => {
  kt.init(t, e), gt(t, "optin", (n) => n.def.innerType._zod.optin), gt(t, "optout", (n) => n.def.innerType._zod.optout), gt(t, "pattern", (n) => {
    const r = n.def.innerType._zod.pattern;
    return r ? new RegExp(`^(${Mc(r.source)}|null)$`) : void 0;
  }), gt(t, "values", (n) => n.def.innerType._zod.values ? /* @__PURE__ */ new Set([...n.def.innerType._zod.values, null]) : void 0), t._zod.parse = (n, r) => n.value === null ? n : e.innerType._zod.run(n, r);
}), Yy = /* @__PURE__ */ te("$ZodDefault", (t, e) => {
  kt.init(t, e), t._zod.optin = "defaulted", gt(t, "values", (n) => n.def.innerType._zod.values), t._zod.parse = (n, r) => {
    if (r.direction === "backward")
      return e.innerType._zod.run(n, r);
    if (n.value === void 0)
      return n.value = e.defaultValue, n;
    const o = e.innerType._zod.run(n, r);
    return o instanceof Promise ? o.then((i) => Xd(i, e)) : Xd(o, e);
  };
});
function Xd(t, e) {
  return t.value === void 0 && (t.value = e.defaultValue), t;
}
const Xy = /* @__PURE__ */ te("$ZodPrefault", (t, e) => {
  kt.init(t, e), t._zod.optin = "defaulted", gt(t, "values", (n) => n.def.innerType._zod.values), t._zod.parse = (n, r) => (r.direction === "backward" || n.value === void 0 && (n.value = e.defaultValue), e.innerType._zod.run(n, r));
}), Qy = /* @__PURE__ */ te("$ZodNonOptional", (t, e) => {
  kt.init(t, e), gt(t, "values", (n) => {
    const r = n.def.innerType._zod.values;
    return r ? new Set([...r].filter((o) => o !== void 0)) : void 0;
  }), t._zod.parse = (n, r) => {
    const o = e.innerType._zod.run(n, r);
    return o instanceof Promise ? o.then((i) => Qd(i, t)) : Qd(o, t);
  };
});
function Qd(t, e) {
  return !t.issues.length && t.value === void 0 && t.issues.push({
    code: "invalid_type",
    expected: "nonoptional",
    input: t.value,
    inst: e
  }), t;
}
function $d(t, e, n, r) {
  return e.issues.length ? (t.value = n.catchValue({
    ...e,
    value: t.value,
    error: {
      issues: e.issues.map((o) => Ko(o, r, gr()))
    },
    input: t.value
  }), t) : (t.value = e.value, e.memo && (t.memo = !0), t);
}
const $y = /* @__PURE__ */ te("$ZodCatch", (t, e) => {
  kt.init(t, e), gt(t, "optin", (n) => n.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional"), gt(t, "optout", (n) => n.def.innerType._zod.optout), gt(t, "values", (n) => n.def.innerType._zod.values), t._zod.parse = (n, r) => {
    if (r.direction === "backward")
      return e.innerType._zod.run(n, r);
    const o = e.innerType._zod.run({ value: n.value, issues: [] }, r);
    return o instanceof Promise ? o.then((i) => $d(n, i, e, r)) : $d(n, o, e, r);
  };
}), eb = /* @__PURE__ */ te("$ZodPipe", (t, e) => {
  kt.init(t, e), gt(t, "values", (n) => n.def.in._zod.values), gt(t, "optin", (n) => n.def.in._zod.optin), gt(t, "optout", (n) => n.def.out._zod.optout), gt(t, "propValues", (n) => n.def.in._zod.propValues), t._zod.parse = (n, r) => {
    if (r.direction === "backward") {
      const i = e.out._zod.run(n, r);
      return i instanceof Promise ? i.then((a) => is(a, e.in, r)) : is(i, e.in, r);
    }
    const o = e.in._zod.run(n, r);
    return o instanceof Promise ? o.then((i) => is(i, e.out, r)) : is(o, e.out, r);
  };
});
function is(t, e, n) {
  return t.issues.some((r) => r.code !== "unrecognized_keys") ? (t.aborted = !0, t) : e._zod.run({ value: t.value, issues: t.issues }, n);
}
const tb = /* @__PURE__ */ te("$ZodReadonly", (t, e) => {
  kt.init(t, e), gt(t, "propValues", (n) => n.def.innerType._zod.propValues), gt(t, "values", (n) => n.def.innerType._zod.values), gt(t, "optin", (n) => n.def.innerType?._zod?.optin), gt(t, "optout", (n) => n.def.innerType?._zod?.optout), t._zod.parse = (n, r) => {
    if (r.direction === "backward")
      return e.innerType._zod.run(n, r);
    const o = e.innerType._zod.run(n, r);
    return o instanceof Promise ? o.then(ef) : ef(o);
  };
});
function ef(t) {
  return t.memo || (t.value = Object.freeze(t.value)), t;
}
const nb = /* @__PURE__ */ te("$ZodCustom", (t, e) => {
  fn.init(t, e), kt.init(t, e), t._zod.parse = (n, r) => n, t._zod.check = (n) => {
    const r = n.value, o = e.fn(r);
    if (o instanceof Promise)
      return o.then((i) => tf(i, n, r, t));
    tf(o, n, r, t);
  };
});
function tf(t, e, n, r) {
  if (!t) {
    const o = {
      code: "custom",
      input: n,
      inst: r,
      // incorporates params.error into issue reporting
      path: [...r._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !r._zod.def.abort
      // params: inst._zod.def.params,
    };
    r._zod.def.params && (o.params = r._zod.def.params), e.issues.push(zi(o));
  }
}
class rb extends Error {
  constructor() {
    super("Cannot parse a reference cycle that closes through a transform"), this.name = "ZodCyclicError";
  }
}
const Bl = "~memo", nf = [];
function zg(t) {
  return t !== null && typeof t == "object";
}
function Xa(t) {
  return t.map((e) => e.path ? { ...e, path: e.path.slice() } : { ...e });
}
const Mg = /* @__PURE__ */ new WeakMap(), ai = 0, ks = 1, wi = 2;
function Ss(t, e, n) {
  const r = Mg.get(t);
  if (r !== void 0)
    return r ? wi : ai;
  if (e.has(t))
    return wi;
  e.add(t);
  let o = ai;
  const i = (u) => {
    if (o !== wi && u?._zod) {
      const f = Ss(u, e);
      f > o && (o = f);
    }
  }, a = (u, f) => {
    let h = ai;
    for (const p of Reflect.ownKeys(u)) {
      const m = Object.getOwnPropertyDescriptor(u, p);
      if (!m.enumerable)
        continue;
      const w = m.get ? ks : m.value?._zod ? Ss(m.value, e) : ai;
      w > h && (h = w);
    }
    return h;
  }, l = (u) => {
    u > o && (o = u);
  }, c = t._zod.def;
  switch (c.type) {
    case "object": {
      const u = ig(c);
      l(u ? a(u) : ks), i(c.catchall);
      break;
    }
    case "array":
      i(c.element);
      break;
    case "tuple":
      for (const u of c.items)
        i(u);
      i(c.rest);
      break;
    case "record":
    case "map":
      i(c.keyType), i(c.valueType);
      break;
    case "set":
      i(c.valueType);
      break;
    case "union":
      for (const u of c.options)
        i(u);
      break;
    case "intersection":
      i(c.left), i(c.right);
      break;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
    case "success":
      i(c.innerType);
      break;
    case "pipe":
      i(c.in), i(c.out);
      break;
    case "function":
      i(c.input), i(c.output);
      break;
    // `$ZodLazy` caches its inner on the def, so a resolved edge is followed exactly
    case "lazy": {
      const u = c._cachedInner ?? void 0;
      l(u ? Ss(u, e) : ks);
      break;
    }
    // a leaf by choice: `parts` are regex fragments, not data positions
    case "template_literal":
    // leaves
    case "string":
    case "number":
    case "int":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "never":
    case "any":
    case "unknown":
    case "date":
    case "nan":
    case "enum":
    case "literal":
    case "file":
    case "transform":
    case "custom":
      break;
    default:
      for (const u in c) {
        const f = Object.getOwnPropertyDescriptor(c, u);
        if (!f || f.get)
          continue;
        const h = f.value;
        if (!(!h || typeof h != "object")) {
          if (h._zod)
            i(h);
          else if (Array.isArray(h))
            for (const p of h)
              i(p);
        }
      }
  }
  return e.delete(t), ob(t, o);
}
function ob(t, e) {
  return e !== ks && Mg.set(t, e === wi), e;
}
function ib(t, e) {
  let n = t.buckets.get(e);
  return n || (n = /* @__PURE__ */ new WeakMap(), t.buckets.set(e, n)), n;
}
let ss;
const as = [], sb = {
  alloc(t, e, n) {
    const r = ss;
    if (!r)
      return n;
    ss = void 0;
    const o = { value: n, issues: null };
    return r.set(e.value, o), as.push(o), n;
  },
  guard(t) {
    var e;
    (e = t._zod).deferred ?? (e.deferred = []), t._zod.deferred.push(() => {
      const n = t._zod.parse, r = (o, i) => {
        if (i.direction !== "backward" && lb(i, o.value))
          throw new rb();
        return n(o, i);
      };
      t._zod.parse = r, t._zod.run === n && (t._zod.run = r);
    });
  },
  attach(t) {
    var e;
    let n, r = !1, o, i;
    (e = t._zod).deferred ?? (e.deferred = []), t._zod.deferred.push(() => {
      const a = t._zod.parse, l = (c, d) => {
        if (n === void 0) {
          const k = Ss(t, /* @__PURE__ */ new Set());
          if (k === ai)
            return t._zod.parse = a, t._zod.run === l && (t._zod.run = a), a(c, d);
          k === wi || r ? n = !0 : r = !0;
        }
        const u = c.value;
        if (!zg(u))
          return a(c, d);
        let f = d[Bl];
        f || (f = { buckets: /* @__PURE__ */ new WeakMap(), backEdges: void 0 }, d[Bl] = f);
        let h;
        o === d ? h = i : (h = ib(f, t), o = d, i = h);
        const p = h.get(u);
        if (p)
          return c.value = p.value, p.issues ? p.issues.length && c.issues.push(...Xa(p.issues)) : (c.memo = !0, f.backEdges ?? (f.backEdges = /* @__PURE__ */ new WeakSet()), f.backEdges.add(p.value)), c;
        ss = h;
        const m = as.length, w = a(c, d);
        ss = void 0;
        const y = as.length > m ? as.pop() : void 0;
        return w instanceof Promise ? w.then((k) => (y && (y.issues = k.issues.length ? Xa(k.issues) : nf), k)) : (y && (y.issues = w.issues.length ? Xa(w.issues) : nf), w);
      };
      t._zod.parse = l, t._zod.run === a && (t._zod.run = l);
    });
  }
};
function ab() {
  return sb;
}
function lb(t, e) {
  const n = t[Bl]?.backEdges;
  return n !== void 0 && zg(e) && n.has(e);
}
const cb = () => {
  const t = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function e(i) {
    return t[i] ?? null;
  }
  const n = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    currency_code: "currency code",
    credit_card: "credit card number",
    iban: "IBAN",
    jwt: "JWT",
    template_literal: "input"
  }, r = {
    // Compatibility: "nan" -> "NaN" for display
    nan: "NaN"
    // All other type names omitted - they fall back to raw values via ?? operator
  };
  function o(i, a) {
    return i === "number" && typeof a == "number" && !Number.isFinite(a) ? String(a) : r[i] ?? i;
  }
  return (i) => {
    switch (i.code) {
      case "invalid_type": {
        const a = o(i.expected), l = L1(i.input), c = o(l, i.input);
        return `Invalid input: expected ${a}, received ${c}`;
      }
      case "invalid_value":
        return i.values.length === 1 ? `Invalid input: expected ${ug(i.values[0])}` : `Invalid option: expected one of ${Ld(i.values, "|")}`;
      case "too_big": {
        const a = i.exact ? "exactly " : i.inclusive ? "<=" : "<", l = e(i.origin);
        return l ? `Too big: expected ${i.origin ?? "value"} to have ${a}${i.maximum.toString()} ${l.unit ?? "elements"}` : `Too big: expected ${i.origin ?? "value"} to be ${a}${i.maximum.toString()}`;
      }
      case "too_small": {
        const a = i.exact ? "exactly " : i.inclusive ? ">=" : ">", l = e(i.origin);
        return l ? `Too small: expected ${i.origin} to have ${a}${i.minimum.toString()} ${l.unit}` : `Too small: expected ${i.origin} to be ${a}${i.minimum.toString()}`;
      }
      case "invalid_format": {
        const a = i;
        return a.format === "starts_with" ? `Invalid string: must start with "${a.prefix}"` : a.format === "ends_with" ? `Invalid string: must end with "${a.suffix}"` : a.format === "includes" ? `Invalid string: must include "${a.includes}"` : a.format === "regex" ? `Invalid string: must match pattern ${a.pattern}` : `Invalid ${n[a.format] ?? i.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${i.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${i.keys.length > 1 ? "s" : ""}: ${Ld(i.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${i.origin}`;
      case "invalid_union":
        return i.options && Array.isArray(i.options) && i.options.length > 0 ? `Invalid discriminator value. Expected ${i.options.map((l) => `'${l}'`).join(" | ")}` : i.inclusive === !1 ? "Invalid input: more than one option matched" : "Invalid input";
      case "invalid_element":
        return `Invalid value in ${i.origin}`;
      default:
        return "Invalid input";
    }
  };
};
function ub() {
  return {
    localeError: cb()
  };
}
var rf;
class db {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map();
  }
  add(e, ...n) {
    const r = n[0];
    return this._map.set(e, r), r && typeof r == "object" && "id" in r && this._idmap.set(r.id, e), this;
  }
  clear() {
    return this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map(), this;
  }
  remove(e) {
    const n = this._map.get(e);
    return n && typeof n == "object" && "id" in n && this._idmap.delete(n.id), this._map.delete(e), this;
  }
  get(e) {
    const n = e._zod.parent;
    if (n) {
      const r = { ...this.get(n) ?? {} };
      delete r.id;
      const o = { ...r, ...this._map.get(e) };
      return Object.keys(o).length ? o : void 0;
    }
    return this._map.get(e);
  }
  has(e) {
    return this._map.has(e);
  }
}
function fb() {
  return new db();
}
(rf = globalThis).__zod_globalRegistry ?? (rf.__zod_globalRegistry = fb());
const li = globalThis.__zod_globalRegistry;
function Hc(t) {
  return t.checks && (t.checks = [...t.checks]), t;
}
// @__NO_SIDE_EFFECTS__
function hb(t, e) {
  return new t(Hc({ type: "string", ...Ae(e) }));
}
// @__NO_SIDE_EFFECTS__
function gb(t, e) {
  return new t({
    type: "string",
    format: "email",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function pb(t, e) {
  return new t({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function mb(t, e) {
  return new t({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function vb(t, e) {
  return new t({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v4",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function _b(t, e) {
  return new t({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v6",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function yb(t, e) {
  return new t({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v7",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function bb(t, e) {
  return new t({
    type: "string",
    format: "url",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function wb(t, e) {
  return new t({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function kb(t, e) {
  return new t({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Sb(t, e) {
  return new t({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function xb(t, e) {
  return new t({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Eb(t, e) {
  return new t({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Tb(t, e) {
  return new t({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Cb(t, e) {
  return new t({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Ab(t, e) {
  return new t({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Pb(t, e) {
  return new t({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Ib(t, e) {
  return new t({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function zb(t, e) {
  return new t({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Mb(t, e) {
  return new t({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Ob(t, e) {
  return new t({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Fb(t, e) {
  return new t({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Rb(t, e) {
  return new t({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: !1,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Lb(t, e) {
  return new t({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: !1,
    local: !1,
    precision: null,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Db(t, e) {
  return new t({
    type: "string",
    format: "date",
    check: "string_format",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Nb(t, e) {
  return new t({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Bb(t, e) {
  return new t({
    type: "string",
    format: "duration",
    check: "string_format",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Ub(t, e) {
  return new t(Hc({ type: "number", checks: [], ...Ae(e) }));
}
// @__NO_SIDE_EFFECTS__
function jb(t, e) {
  return new t(Hc({ type: "number", coerce: !0, checks: [], ...Ae(e) }));
}
// @__NO_SIDE_EFFECTS__
function Hb(t, e) {
  return new t({
    type: "number",
    check: "number_format",
    abort: !1,
    format: "safeint",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Wb(t, e) {
  return new t({
    type: "boolean",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function Zb(t) {
  return new t({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function Kb(t, e) {
  return new t({
    type: "never",
    ...Ae(e)
  });
}
// @__NO_SIDE_EFFECTS__
function of(t, e) {
  return new _g({
    check: "less_than",
    ...Ae(e),
    value: t,
    inclusive: !1
  });
}
// @__NO_SIDE_EFFECTS__
function Qa(t, e) {
  return new _g({
    check: "less_than",
    ...Ae(e),
    value: t,
    inclusive: !0
  });
}
// @__NO_SIDE_EFFECTS__
function sf(t, e) {
  return new yg({
    check: "greater_than",
    ...Ae(e),
    value: t,
    inclusive: !1
  });
}
// @__NO_SIDE_EFFECTS__
function $a(t, e) {
  return new yg({
    check: "greater_than",
    ...Ae(e),
    value: t,
    inclusive: !0
  });
}
// @__NO_SIDE_EFFECTS__
function af(t, e) {
  return new j_({
    check: "multiple_of",
    ...Ae(e),
    value: t
  });
}
// @__NO_SIDE_EFFECTS__
function Og(t, e) {
  return new W_({
    check: "max_length",
    ...Ae(e),
    maximum: t
  });
}
// @__NO_SIDE_EFFECTS__
function Rs(t, e) {
  return new Z_({
    check: "min_length",
    ...Ae(e),
    minimum: t
  });
}
// @__NO_SIDE_EFFECTS__
function Fg(t, e) {
  return new K_({
    check: "length_equals",
    ...Ae(e),
    length: t
  });
}
// @__NO_SIDE_EFFECTS__
function Vb(t, e) {
  return new V_({
    check: "string_format",
    format: "regex",
    ...Ae(e),
    pattern: t
  });
}
// @__NO_SIDE_EFFECTS__
function Jb(t) {
  return new J_({
    check: "string_format",
    format: "lowercase",
    ...Ae(t)
  });
}
// @__NO_SIDE_EFFECTS__
function Gb(t) {
  return new G_({
    check: "string_format",
    format: "uppercase",
    ...Ae(t)
  });
}
// @__NO_SIDE_EFFECTS__
function qb(t, e) {
  return new q_({
    check: "string_format",
    format: "includes",
    ...Ae(e),
    includes: t
  });
}
// @__NO_SIDE_EFFECTS__
function Yb(t, e) {
  return new Y_({
    check: "string_format",
    format: "starts_with",
    ...Ae(e),
    prefix: t
  });
}
// @__NO_SIDE_EFFECTS__
function Xb(t, e) {
  return new X_({
    check: "string_format",
    format: "ends_with",
    ...Ae(e),
    suffix: t
  });
}
// @__NO_SIDE_EFFECTS__
function Vo(t) {
  return new Q_({
    check: "overwrite",
    tx: t
  });
}
// @__NO_SIDE_EFFECTS__
function Qb(t) {
  return /* @__PURE__ */ Vo((e) => e.normalize(t));
}
// @__NO_SIDE_EFFECTS__
function $b() {
  return /* @__PURE__ */ Vo((t) => t.trim());
}
// @__NO_SIDE_EFFECTS__
function ew() {
  return /* @__PURE__ */ Vo((t) => t.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function tw() {
  return /* @__PURE__ */ Vo((t) => t.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function nw() {
  return /* @__PURE__ */ Vo((t) => S1(t));
}
// @__NO_SIDE_EFFECTS__
function rw(t, e, n) {
  return new t({
    type: "array",
    element: e,
    // get element() {
    //   return element;
    // },
    ...Ae(n)
  });
}
// @__NO_SIDE_EFFECTS__
function ow(t, e, n) {
  return new t({
    type: "custom",
    check: "custom",
    fn: e,
    ...Ae(n)
  });
}
// @__NO_SIDE_EFFECTS__
function iw(t, e) {
  const n = /* @__PURE__ */ sw((r) => (r.addIssue = (o) => {
    if (typeof o == "string")
      r.issues.push(zi(o, r.value, n._zod.def));
    else {
      const i = o;
      i.fatal && (i.continue = !1), i.code ?? (i.code = "custom"), "input" in i || (i.input = r.value), i.inst ?? (i.inst = n), i.continue ?? (i.continue = !n._zod.def.abort), r.issues.push(zi(i));
    }
  }, t(r.value, r)), e);
  return n;
}
// @__NO_SIDE_EFFECTS__
function sw(t, e) {
  const n = new fn({
    check: "custom",
    ...Ae(e)
  });
  return n._zod.check = t, n;
}
function ki(t, ...e) {
  for (const n of e)
    for (const r of Reflect.ownKeys(n))
      Object.prototype.propertyIsEnumerable.call(n, r) && uo(t, r, n[r]);
  return t;
}
function Rg(t) {
  let e = t?.target ?? "draft-2020-12";
  return e === "draft-4" && (e = "draft-04"), e === "draft-7" && (e = "draft-07"), {
    processors: t.processors ?? {},
    metadataRegistry: t?.metadata ?? li,
    target: e,
    unrepresentable: t?.unrepresentable ?? "throw",
    override: t?.override ?? (() => {
    }),
    io: t?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    sharedDefsExtractedFor: void 0,
    sharedEmitDoneFor: void 0,
    cycles: t?.cycles ?? "ref",
    reused: t?.reused ?? "inline",
    intersections: [],
    deferred: [],
    external: t?.external ?? void 0
  };
}
function Dr(t, e, n, r, o) {
  const i = typeof e.unrepresentable == "function" ? e.unrepresentable({ zodSchema: t, path: r.path, message: o }) : e.unrepresentable;
  if (i === "any")
    return !1;
  if (i === void 0 || i === "throw")
    throw new Error(o);
  return Object.assign(n, i), !0;
}
function Kt(t, e, n = { path: [], schemaPath: [] }) {
  var r;
  const o = t._zod.def, i = e.seen.get(t);
  if (i)
    return i.count++, n.schemaPath.includes(t) && (i.cycle = n.path), i.schema;
  const a = { schema: {}, count: 1, cycle: void 0, path: n.path };
  e.seen.set(t, a), e.sharedDefsExtractedFor = void 0, e.sharedEmitDoneFor = void 0;
  const l = t._zod.toJSONSchema?.();
  if (l)
    a.schema = l;
  else {
    const u = {
      ...n,
      schemaPath: [...n.schemaPath, t],
      path: n.path
    };
    if (t._zod.processJSONSchema)
      t._zod.processJSONSchema(e, a.schema, u);
    else {
      const h = a.schema, p = e.processors[o.type];
      if (!p)
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${o.type}`);
      p(t, e, h, u);
    }
    const f = t._zod.parent;
    f && (a.ref || (a.ref = f), Kt(f, e, u), e.seen.get(f).isParent = !0);
  }
  const c = e.metadataRegistry.get(t);
  return c && ki(a.schema, c), e.io === "input" && tn(t) && (delete a.schema.examples, delete a.schema.default), e.io === "input" && "_prefault" in a.schema && ((r = a.schema).default ?? (r.default = a.schema._prefault)), delete a.schema._prefault, e.seen.get(t).schema;
}
function lf(t) {
  return t.replace(/~/g, "~0").replace(/\//g, "~1");
}
function Lg(t, e) {
  const n = t.seen.get(e);
  if (!n)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  if (t.external && t.sharedDefsExtractedFor === t.external)
    return;
  const r = /* @__PURE__ */ new Map();
  for (const a of t.seen.entries()) {
    const l = t.metadataRegistry.get(a[0])?.id;
    if (l) {
      const c = r.get(l);
      if (c && c !== a[0])
        throw new Error(`Duplicate schema id "${l}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      r.set(l, a[0]);
    }
  }
  const o = (a) => {
    const l = t.target === "draft-2020-12" ? "$defs" : "definitions";
    if (t.external) {
      const f = t.external.registry.get(a[0])?.id, h = t.external.uri ?? ((m) => m);
      if (f)
        return { ref: h(f) };
      const p = a[1].defId ?? a[1].schema.id ?? `schema${t.counter++}`;
      return a[1].defId = p, { defId: p, ref: `${h("__shared")}#/${l}/${lf(p)}` };
    }
    const c = "#", d = `${c}/${l}/`;
    if (a[1] === n && !a[1].schema.id)
      return { ref: c };
    const u = a[1].schema.id ?? `__schema${t.counter++}`;
    return { defId: u, ref: d + lf(u) };
  }, i = (a) => {
    if (a[1].schema.$ref)
      return;
    const l = a[1], { ref: c, defId: d } = o(a);
    l.def = { ...l.schema }, d && (l.defId = d);
    const u = l.schema;
    for (const f in u)
      delete u[f];
    u.$ref = c;
  };
  if (t.cycles === "throw")
    for (const a of t.seen.entries()) {
      const l = a[1];
      if (l.cycle)
        throw new Error(`Cycle detected: #/${l.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
    }
  for (const a of t.seen.entries()) {
    const l = a[1];
    if (e === a[0]) {
      i(a);
      continue;
    }
    if (t.external) {
      const d = t.external.registry.get(a[0])?.id;
      if (e !== a[0] && d) {
        i(a);
        continue;
      }
    }
    if (t.metadataRegistry.get(a[0])?.id) {
      i(a);
      continue;
    }
    if (l.cycle) {
      i(a);
      continue;
    }
    l.count > 1 && t.reused === "ref" && i(a);
  }
  t.external && (t.sharedDefsExtractedFor = t.external);
}
function Dg(t) {
  const e = t.anyOf;
  if (!Array.isArray(e) || e.length === 0 || t.type !== void 0)
    return;
  const n = [];
  for (const r of e) {
    if (!r || typeof r != "object")
      return;
    Dg(r);
    const o = Object.keys(r);
    if (o.length !== 1 || o[0] !== "type")
      return;
    const i = r.type;
    for (const a of Array.isArray(i) ? i : [i]) {
      if (typeof a != "string")
        return;
      n.includes(a) || n.push(a);
    }
  }
  delete t.anyOf, t.type = n.length === 1 ? n[0] : n;
}
const Ng = /* @__PURE__ */ new Set(["type", "properties", "required", "additionalProperties"]), cf = ["oneOf", "anyOf"];
function uf(t) {
  const e = t.additionalProperties;
  return e === void 0 || e === !1 || typeof e != "object" || e === null ? null : Object.keys(e).length ? e : null;
}
function Ul(t) {
  const e = [];
  for (const i of t) {
    if (typeof i != "object" || i.type !== "object")
      return null;
    for (const a in i)
      if (!Ng.has(a))
        return null;
    e.push(i);
  }
  const n = {}, r = /* @__PURE__ */ new Set();
  for (const i of e) {
    for (const a in i.properties) {
      if (Object.prototype.hasOwnProperty.call(n, a))
        continue;
      const l = [];
      for (const d of e) {
        const u = d.properties?.[a] ?? uf(d);
        u != null && (l.some((f) => JSON.stringify(f) === JSON.stringify(u)) || l.push(u));
      }
      const c = l.length === 1 ? l[0] : Ul(l) ?? { allOf: l };
      uo(n, a, c);
    }
    for (const a of i.required ?? [])
      r.add(a);
  }
  const o = { type: "object", properties: n };
  if (r.size && (o.required = [...r]), e.every((i) => i.additionalProperties === !1))
    o.additionalProperties = !1;
  else {
    const i = [];
    for (const a of e) {
      const l = uf(a);
      l && !i.some((c) => JSON.stringify(c) === JSON.stringify(l)) && i.push(l);
    }
    i.length === 1 ? o.additionalProperties = i[0] : i.length > 1 && (o.additionalProperties = { allOf: i });
  }
  return o;
}
function aw(t) {
  const e = t.allOf;
  if (!Array.isArray(e) || e.length < 2)
    return;
  for (const o of Ng)
    if (o in t)
      return;
  const n = e.filter((o) => cf.some((i) => Array.isArray(o[i])));
  let r = null;
  if (!n.length)
    r = Ul(e);
  else {
    const o = n[0], i = cf.find((c) => Array.isArray(o[c]));
    if (Object.keys(o).length !== 1)
      return;
    const a = e.filter((c) => c !== o), l = o[i].map((c) => Ul([...a, c]));
    if (l.some((c) => !c))
      return;
    r = { [i]: l };
  }
  r && (delete t.allOf, ki(t, r));
}
function Bg(t, e) {
  const n = t.seen.get(e);
  if (!n)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const r = (l) => {
    const c = t.seen.get(l);
    if (c.ref === null)
      return;
    const d = c.def ?? c.schema, u = { ...d }, f = c.ref;
    if (c.ref = null, f) {
      r(f);
      const p = t.seen.get(f), m = p.schema;
      if (m.$ref && (t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0") ? (d.allOf = d.allOf ?? [], d.allOf.push(m)) : ki(d, m), ki(d, u), l._zod.parent === f)
        for (const y in d)
          y === "$ref" || y === "allOf" || y in u || delete d[y];
      if (m.$ref && p.def)
        for (const y in d)
          y === "$ref" || y === "allOf" || y in p.def && JSON.stringify(d[y]) === JSON.stringify(p.def[y]) && delete d[y];
    }
    const h = l._zod.parent;
    if (h && h !== f) {
      r(h);
      const p = t.seen.get(h);
      if (p?.schema.$ref && (d.$ref = p.schema.$ref, p.def))
        for (const m in d)
          m === "$ref" || m === "allOf" || m in p.def && JSON.stringify(d[m]) === JSON.stringify(p.def[m]) && delete d[m];
    }
    t.override({
      zodSchema: l,
      jsonSchema: d,
      path: c.path ?? []
    });
  };
  if (!t.external || t.sharedEmitDoneFor !== t.external) {
    for (const l of [...t.seen.entries()].reverse())
      r(l[0]);
    if (t.target !== "openapi-3.0")
      for (const l of t.seen.entries())
        Dg(l[1].def ?? l[1].schema);
    for (const l of t.deferred)
      l();
    if (t.intersections.length) {
      const l = /* @__PURE__ */ new Map();
      for (const c of t.seen.values())
        for (const d of [c.schema, c.def]) {
          const u = d?.allOf;
          if (!Array.isArray(u))
            continue;
          const f = l.get(u);
          f ? f.push(d) : l.set(u, [d]);
        }
      for (const c of t.intersections)
        for (const d of l.get(c) ?? [])
          aw(d);
    }
  }
  const o = {};
  if (t.target === "draft-2020-12" ? o.$schema = "https://json-schema.org/draft/2020-12/schema" : t.target === "draft-07" ? o.$schema = "http://json-schema.org/draft-07/schema#" : t.target === "draft-04" ? o.$schema = "http://json-schema.org/draft-04/schema#" : t.target, t.external?.uri) {
    const l = t.external.registry.get(e)?.id;
    if (!l)
      throw new Error("Schema is missing an `id` property");
    o.$id = t.external.uri(l);
  }
  ki(o, n.defId ? n.schema : n.def ?? n.schema);
  const i = t.metadataRegistry.get(e)?.id;
  i !== void 0 && o.id === i && delete o.id;
  const a = t.external?.defs ?? {};
  if (!t.external || t.sharedEmitDoneFor !== t.external)
    for (const l of t.seen.entries()) {
      const c = l[1];
      c.def && c.defId && (c.def.id === c.defId && delete c.def.id, uo(a, c.defId, c.def));
    }
  t.external && (t.sharedEmitDoneFor = t.external), t.external || Object.keys(a).length > 0 && (t.target === "draft-2020-12" ? o.$defs = a : o.definitions = a);
  try {
    const l = JSON.parse(JSON.stringify(o));
    return Object.defineProperty(l, "~standard", {
      value: {
        ...e["~standard"],
        jsonSchema: {
          input: Ls(e, "input", t.processors),
          output: Ls(e, "output", t.processors)
        }
      },
      enumerable: !1,
      writable: !1
    }), l;
  } catch {
    throw new Error("Error converting schema to JSON.");
  }
}
function tn(t, e) {
  const n = e ?? { seen: /* @__PURE__ */ new Set() };
  if (n.seen.has(t))
    return !1;
  n.seen.add(t);
  const r = t._zod.def;
  if (r.type === "transform")
    return !0;
  if (r.type === "array")
    return tn(r.element, n);
  if (r.type === "set")
    return tn(r.valueType, n);
  if (r.type === "lazy")
    return tn(r.getter(), n);
  if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault" || r.type === "catch")
    return tn(r.innerType, n);
  if (r.type === "intersection")
    return tn(r.left, n) || tn(r.right, n);
  if (r.type === "record" || r.type === "map")
    return tn(r.keyType, n) || tn(r.valueType, n);
  if (r.type === "pipe")
    return t._zod.traits.has("$ZodCodec") ? !0 : tn(r.in, n) || tn(r.out, n);
  if (r.type === "object") {
    for (const o in r.shape)
      if (tn(r.shape[o], n))
        return !0;
    return !1;
  }
  if (r.type === "union") {
    for (const o of r.options)
      if (tn(o, n))
        return !0;
    return !1;
  }
  if (r.type === "tuple") {
    for (const o of r.items)
      if (tn(o, n))
        return !0;
    return !!(r.rest && tn(r.rest, n));
  }
  return !1;
}
const lw = (t, e = {}) => (n) => {
  const r = Rg({ ...n, processors: e });
  return Kt(t, r), Lg(r, t), Bg(r, t);
}, Ls = (t, e, n = {}) => (r) => {
  const { libraryOptions: o, target: i } = r ?? {}, a = Rg({ ...o ?? {}, target: i, io: e, processors: n });
  return Kt(t, a), Lg(a, t), Bg(a, t);
}, Mo = (t, e, n) => {
  (t[e] === void 0 || n > t[e]) && (t[e] = n);
}, Oo = (t, e, n) => {
  (t[e] === void 0 || n < t[e]) && (t[e] = n);
}, df = (t, e) => {
  Mo(t, "minimum", e), Oo(t, "maximum", e);
}, Ug = (t, e) => {
  t.multipleOf ?? (t.multipleOf = []), t.multipleOf.includes(e) || t.multipleOf.push(e);
}, jg = (t, e) => {
  t.patterns ?? (t.patterns = /* @__PURE__ */ new Set()), t.patterns.add(e);
}, Hg = (t, e) => {
  t.mime = t.mime ? t.mime.filter((n) => e.includes(n)) : [...e];
}, Wg = (t, e) => {
  t.format = e, e.includes("int") && (t.isInt = !0);
}, ff = (t, e) => Mo(t, "minimum", e.minimum), hf = (t, e) => Oo(t, "maximum", e.maximum), gf = (t) => (e, n) => {
  Wg(e, n.format);
  const [r, o] = t[n.format];
  Mo(e, "minimum", r), Oo(e, "maximum", o);
}, cw = {
  greater_than: (t, e) => Mo(t, e.inclusive ? "minimum" : "exclusiveMinimum", e.value),
  less_than: (t, e) => Oo(t, e.inclusive ? "maximum" : "exclusiveMaximum", e.value),
  multiple_of: (t, e) => Ug(t, e.value),
  number_format: gf(dg),
  bigint_format: gf(C1),
  min_length: ff,
  max_length: hf,
  length_equals: (t, e) => df(t, e.length),
  min_size: ff,
  max_size: hf,
  size_equals: (t, e) => df(t, e.size),
  string_format: (t, e) => {
    Wg(t, e.format), e.pattern && jg(t, e.pattern), (e.format === "base64" || e.format === "base64url") && (t.contentEncoding = e.format), (e.local || e.precision === -1) && (t.laxFormat = !0);
  },
  mime_type: (t, e) => Hg(t, e.mime)
};
function Dn(t) {
  const e = {}, n = t._zod.def, r = t._zod.traits.has("$ZodCheck") ? [t, ...n.checks ?? []] : n.checks ?? [];
  for (const i of r)
    cw[i._zod.def.check]?.(e, i._zod.def);
  const o = t._zod.bag;
  o.minimum !== void 0 && Mo(e, "minimum", o.minimum), o.exclusiveMinimum !== void 0 && Mo(e, "exclusiveMinimum", o.exclusiveMinimum), o.maximum !== void 0 && Oo(e, "maximum", o.maximum), o.exclusiveMaximum !== void 0 && Oo(e, "exclusiveMaximum", o.exclusiveMaximum), o.multipleOf !== void 0 && Ug(e, o.multipleOf), o.format !== void 0 && (e.format ?? (e.format = o.format), o.format.includes("int") && (e.isInt = !0)), o.mime && Hg(e, o.mime);
  for (const i of o.patterns ?? [])
    jg(e, i);
  return e;
}
const uw = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
  // do not set
}, dw = /* @__PURE__ */ new Map([
  [Tg, A_],
  [jc, P_]
]), fw = (t) => dw.get(t) ?? t, hw = (t, e, n, r) => {
  const o = n;
  o.type = "string";
  const { minimum: i, maximum: a, format: l, patterns: c, contentEncoding: d, laxFormat: u } = Dn(t);
  if (typeof i == "number" && (o.minLength = i), typeof a == "number" && (o.maxLength = a), l && (o.format = uw[l] ?? l, o.format === "" && delete o.format, (l === "time" || u) && delete o.format), d && (o.contentEncoding = d), c && c.size > 0) {
    const f = [...c].map(fw);
    f.length === 1 ? o.pattern = f[0].source : f.length > 1 && (o.allOf = [
      ...f.map((h) => ({
        ...e.target === "draft-07" || e.target === "draft-04" || e.target === "openapi-3.0" ? { type: "string" } : {},
        pattern: h.source
      }))
    ]);
  }
}, gw = (t, e, n, r) => {
  const o = n, { minimum: i, maximum: a, multipleOf: l, exclusiveMaximum: c, exclusiveMinimum: d, isInt: u } = Dn(t);
  o.type = u ? "integer" : "number";
  const f = typeof d == "number" && d >= (i ?? Number.NEGATIVE_INFINITY), h = typeof c == "number" && c <= (a ?? Number.POSITIVE_INFINITY), p = e.target === "draft-04" || e.target === "openapi-3.0";
  if (f ? p ? (o.minimum = d, o.exclusiveMinimum = !0) : o.exclusiveMinimum = d : typeof i == "number" && (o.minimum = i), h ? p ? (o.maximum = c, o.exclusiveMaximum = !0) : o.exclusiveMaximum = c : typeof a == "number" && (o.maximum = a), l) {
    const m = /* @__PURE__ */ new Set();
    for (const k of l)
      Number.isFinite(k) && k !== 0 ? m.add(Math.abs(k)) : Dr(t, e, o, r, `A multipleOf divisor of ${k} cannot be represented in JSON Schema`);
    const [w, ...y] = m;
    w !== void 0 && (o.multipleOf = w), y.length && (o.allOf = [...o.allOf ?? [], ...y.map((k) => ({ multipleOf: k }))]);
  }
}, pw = (t, e, n, r) => {
  n.type = "boolean";
}, mw = (t, e, n, r) => {
  n.not = {};
}, vw = (t, e, n, r) => {
}, _w = (t, e, n, r) => {
  const o = t._zod.def, i = Rl(o.entries);
  if (i.length === 0) {
    n.not = {};
    return;
  }
  i.every((a) => typeof a == "number") && (n.type = "number"), i.every((a) => typeof a == "string") && (n.type = "string"), n.enum = i;
}, yw = (t, e, n, r) => {
  const o = t._zod.def;
  if (o.values.length === 0) {
    n.not = {};
    return;
  }
  const i = [];
  for (const a of o.values)
    if (a === void 0) {
      if (Dr(t, e, n, r, "Literal `undefined` cannot be represented in JSON Schema"))
        return;
    } else if (typeof a == "bigint") {
      if (Dr(t, e, n, r, "BigInt literals cannot be represented in JSON Schema"))
        return;
      i.push(Number(a));
    } else
      i.push(a);
  if (i.length !== 0) if (i.length === 1) {
    const a = i[0];
    n.type = a === null ? "null" : typeof a, e.target === "draft-04" || e.target === "openapi-3.0" ? n.enum = [a] : n.const = a;
  } else
    i.every((a) => typeof a == "number") && (n.type = "number"), i.every((a) => typeof a == "string") && (n.type = "string"), i.every((a) => typeof a == "boolean") && (n.type = "boolean"), i.every((a) => a === null) && (n.type = "null"), n.enum = i;
}, bw = (t, e, n, r) => {
  Dr(t, e, n, r, "Custom types cannot be represented in JSON Schema");
}, ww = (t, e, n, r) => {
  Dr(t, e, n, r, "Transforms cannot be represented in JSON Schema");
}, kw = (t, e, n, r) => {
  const o = n, i = t._zod.def, { minimum: a, maximum: l } = Dn(t);
  typeof a == "number" && (o.minItems = a), typeof l == "number" && (o.maxItems = l), o.type = "array", o.items = Kt(i.element, e, {
    ...r,
    path: [...r.path, "items"]
  });
};
function Ds(t) {
  const e = t._zod.def;
  return e.type === "pipe" && e.in._zod.traits.has("$ZodTransform") ? Ds(e.out) : e.type === "catch" ? Ds(e.innerType) : t._zod.optin;
}
const Sw = (t, e, n, r) => {
  const o = n, i = t._zod.def, a = i.shape;
  if (Object.getOwnPropertySymbols(a).length && Dr(t, e, o, r, "Symbol keys cannot be represented in JSON Schema"))
    return;
  o.type = "object", o.properties = {};
  for (const d in a)
    uo(o.properties, d, Kt(a[d], e, {
      ...r,
      path: [...r.path, "properties", d]
    }));
  const c = [];
  for (const d of Object.keys(a)) {
    const u = i.shape[d];
    (e.io === "input" ? Ds(u) === void 0 : u._zod.optout === void 0) && c.push(d);
  }
  c.length > 0 && (o.required = c), i.catchall?._zod.def.type === "never" ? o.additionalProperties = !1 : i.catchall ? i.catchall && (o.additionalProperties = Kt(i.catchall, e, {
    ...r,
    path: [...r.path, "additionalProperties"]
  })) : e.io === "output" && (o.additionalProperties = !1);
}, xw = (t, e, n, r) => {
  const o = t._zod.def, i = o.inclusive === !1, a = o.options.map((l, c) => Kt(l, e, {
    ...r,
    path: [...r.path, i ? "oneOf" : "anyOf", c]
  }));
  i ? n.oneOf = a : n.anyOf = a;
}, Ew = (t, e, n, r) => {
  const o = t._zod.def, i = Kt(o.left, e, {
    ...r,
    path: [...r.path, "allOf", 0]
  }), a = Kt(o.right, e, {
    ...r,
    path: [...r.path, "allOf", 1]
  }), l = (d) => "allOf" in d && Object.keys(d).length === 1, c = [
    ...l(i) ? i.allOf : [i],
    ...l(a) ? a.allOf : [a]
  ];
  n.allOf = c, e.intersections.push(c);
}, Tw = (t, e, n, r) => {
  const o = n, i = t._zod.def;
  o.type = "array";
  const a = e.target === "draft-2020-12" ? "prefixItems" : "items", l = e.target === "draft-2020-12" || e.target === "openapi-3.0" ? "items" : "additionalItems", c = i.items.map((w, y) => Kt(w, e, {
    ...r,
    path: [...r.path, a, y]
  })), d = i.rest ? Kt(i.rest, e, {
    ...r,
    path: [...r.path, l, ...e.target === "openapi-3.0" ? [i.items.length] : []]
  }) : null;
  let u = i.items.length;
  for (; u > 0; ) {
    const w = i.items[u - 1];
    if (!(e.io === "input" ? Ds(w) !== void 0 : w._zod.optout === "optional"))
      break;
    u--;
  }
  const f = i.items.length, h = !i.rest;
  e.target === "draft-2020-12" ? (o.prefixItems = c, h ? o.items = !1 : d && (o.items = d), u > 0 && (o.minItems = u), h && (o.maxItems = f)) : e.target === "openapi-3.0" ? (o.items = {
    anyOf: c
  }, d && o.items.anyOf.push(d), u > 0 && (o.minItems = u), h && (o.maxItems = f)) : (o.items = c, h ? o.additionalItems = !1 : d && (o.additionalItems = d), u > 0 && (o.minItems = u), h && (o.maxItems = f));
  const { minimum: p, maximum: m } = Dn(t);
  typeof p == "number" && (o.minItems = p), typeof m == "number" && (o.maxItems = m);
}, Cw = (t, e, n, r) => {
  const o = t._zod.def, i = Kt(o.innerType, e, r), a = e.seen.get(t);
  e.target === "openapi-3.0" ? (a.ref = o.innerType, n.nullable = !0) : n.anyOf = [i, { type: "null" }];
}, Aw = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  i.ref = o.innerType;
}, Wc = /* @__PURE__ */ Symbol();
function Zg(t, e, n, r, o) {
  let i = !1;
  const a = JSON.stringify(t, (l, c) => typeof c != "bigint" ? c : (i = !0, null));
  return i ? (Dr(e, n, r, o, "BigInt defaults cannot be represented in JSON Schema"), Wc) : JSON.parse(a);
}
const Pw = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  i.ref = o.innerType;
  const a = Zg(o.defaultValue, t, e, n, r);
  a !== Wc && (n.default = a);
}, Iw = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  if (i.ref = o.innerType, e.io !== "input")
    return;
  const a = Zg(o.defaultValue, t, e, n, r);
  a !== Wc && (n._prefault = a);
}, zw = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  i.ref = o.innerType;
  let a;
  try {
    a = o.catchValue(void 0);
  } catch {
    Dr(t, e, n, r, "Dynamic catch values are not supported in JSON Schema");
    return;
  }
  n.default = a;
}, Mw = (t, e, n, r) => {
  const o = t._zod.def, i = o.in._zod.traits.has("$ZodTransform"), a = e.io === "input" ? i ? o.out : o.in : o.out;
  Kt(a, e, r);
  const l = e.seen.get(t);
  l.ref = a;
}, Ow = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  i.ref = o.innerType, n.readOnly = !0;
}, Kg = (t, e, n, r) => {
  const o = t._zod.def;
  Kt(o.innerType, e, r);
  const i = e.seen.get(t);
  i.ref = o.innerType;
}, pf = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function ls(t, e, n) {
  Object.defineProperty(t, e, {
    configurable: !0,
    enumerable: !1,
    get() {
      const r = n(this);
      return Object.defineProperty(this, e, { value: r, configurable: !0, writable: !0 }), r;
    },
    set(r) {
      Object.defineProperty(this, e, { value: r, configurable: !0, writable: !0 });
    }
  });
}
const Fw = (t, e) => {
  q1.init(t, e), t.name = "ZodError";
  const n = Object.getPrototypeOf(t);
  pf.has(n) || (pf.add(n), ls(n, "format", (r) => (o) => Q1(r, o)), ls(n, "flatten", (r) => (o) => X1(r, o)), ls(n, "addIssue", (r) => (o) => {
    r.issues.push(o), r.message = JSON.stringify(r.issues, Ll, 2);
  }), ls(n, "addIssues", (r) => (o) => {
    r.issues.push(...o), r.message = JSON.stringify(r.issues, Ll, 2);
  }), Object.defineProperty(n, "isEmpty", {
    configurable: !0,
    enumerable: !1,
    get() {
      return this.issues.length === 0;
    }
  }));
}, Fn = /* @__PURE__ */ te("ZodError", Fw, void 0, {
  Parent: Error
}), Rw = /* @__PURE__ */ Rc(Fn), Lw = /* @__PURE__ */ Lc(Fn), Dw = /* @__PURE__ */ Dc(Fn), Nw = /* @__PURE__ */ Nc(Fn), Bw = /* @__PURE__ */ o_(Fn), Uw = /* @__PURE__ */ i_(Fn), jw = /* @__PURE__ */ s_(Fn), Hw = /* @__PURE__ */ a_(Fn), Ww = /* @__PURE__ */ l_(Fn), Zw = /* @__PURE__ */ c_(Fn), Kw = /* @__PURE__ */ u_(Fn), Vw = /* @__PURE__ */ d_(Fn);
function Jw() {
  Hn.localeError || gr(ub());
}
function la() {
  Hn.memoizer || gr({ memoizer: ab() });
}
const Tt = /* @__PURE__ */ te("ZodType", (t, e) => (Jw(), kt.init(t, e), t.def = e, t.type = e.type, t), {
  check(...t) {
    const e = this.def;
    return this.clone(vn(e, {
      checks: [
        ...e.checks ?? [],
        ...t.map((n) => typeof n == "function" ? { _zod: { check: n, def: { check: "custom" }, onattach: [] } } : n)
      ]
    }), { parent: !0 });
  },
  with(...t) {
    return this.check(...t);
  },
  clone(t, e) {
    return Hr(this, t, e);
  },
  brand() {
    return this;
  },
  register(t, e) {
    return t.add(this, e), this;
  },
  refine(t, e) {
    return this.check(K2(t, e));
  },
  superRefine(t, e) {
    return this.check(V2(t, e));
  },
  overwrite(t) {
    return this.check(/* @__PURE__ */ Vo(t));
  },
  optional() {
    return _f(this);
  },
  exactOptional() {
    return M2(this);
  },
  nullable() {
    return yf(this);
  },
  nullish() {
    return _f(yf(this));
  },
  nonoptional(t) {
    return N2(this, t);
  },
  array() {
    return cr(this);
  },
  or(t) {
    return E2([this, t]);
  },
  and(t) {
    return C2(this, t);
  },
  transform(t) {
    return bf(this, z2(t));
  },
  default(t) {
    return R2(this, t);
  },
  prefault(t) {
    return D2(this, t);
  },
  catch(t) {
    return U2(this, t);
  },
  pipe(t) {
    return bf(this, t);
  },
  readonly() {
    return W2(this);
  },
  describe(t) {
    const e = this.clone();
    return li.add(e, { description: t }), e;
  },
  meta(...t) {
    if (t.length === 0)
      return li.get(this);
    const e = this.clone();
    return li.add(e, t[0]), e;
  },
  isOptional() {
    return this.safeParse(void 0).success;
  },
  isNullable() {
    return this.safeParse(null).success;
  },
  apply(t, ...e) {
    return e.length === 0 ? t(this) : t(this, ...e);
  },
  // Overrides core's `~standard` to add `jsonSchema`. Must stay a prototype entry: redefining it per instance demotes instances to dictionary mode.
  get "~standard"() {
    return hg(this, "~standard", {
      ...wg(this),
      jsonSchema: {
        input: Ls(this, "input"),
        output: Ls(this, "output")
      }
    });
  },
  set "~standard"(t) {
    Lr(this, "~standard", t);
  },
  parse: function t(e, n) {
    return Rw(this, e, n, { callee: t });
  },
  parseAsync: async function t(e, n) {
    return await Lw(this, e, n, { callee: t });
  },
  safeParse(t, e) {
    return Dw(this, t, e);
  },
  async safeParseAsync(t, e) {
    return Nw(this, t, e);
  },
  // `spa` is an alias: same function object as `safeParseAsync`, as before.
  get spa() {
    return this?.safeParseAsync;
  },
  set spa(t) {
    Lr(this, "spa", t);
  },
  validate(t, e) {
    return t_(this, t, e);
  },
  validateAsync(t, e) {
    return r_(this, t, e);
  },
  encode: function t(e, n) {
    return Bw(this, e, n, { callee: t });
  },
  decode: function t(e, n) {
    return Uw(this, e, n, { callee: t });
  },
  encodeAsync: async function t(e, n) {
    return await jw(this, e, n, { callee: t });
  },
  decodeAsync: async function t(e, n) {
    return await Hw(this, e, n, { callee: t });
  },
  safeEncode(t, e) {
    return Ww(this, t, e);
  },
  safeDecode(t, e) {
    return Zw(this, t, e);
  },
  async safeEncodeAsync(t, e) {
    return Kw(this, t, e);
  },
  async safeDecodeAsync(t, e) {
    return Vw(this, t, e);
  },
  toJSONSchema(t) {
    return lw(this, {})(t);
  },
  // Reads through to the registry on every access, so it must not cache.
  get description() {
    return li.get(this)?.description;
  },
  // No setter: `schema._def = x` throws, as it did when `_def` was a non-writable own property.
  get _def() {
    return this._zod.def;
  }
}), Vg = /* @__PURE__ */ te(
  "_ZodString",
  (t, e) => {
    Uc.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => hw(t, n, r);
  },
  /* @__PURE__ */ gg({
    format: (t) => Dn(t).format ?? null,
    minLength: (t) => Dn(t).minimum ?? null,
    maxLength: (t) => Dn(t).maximum ?? null
  }, {
    regex(...t) {
      return this.check(/* @__PURE__ */ Vb(...t));
    },
    includes(...t) {
      return this.check(/* @__PURE__ */ qb(...t));
    },
    startsWith(...t) {
      return this.check(/* @__PURE__ */ Yb(...t));
    },
    endsWith(...t) {
      return this.check(/* @__PURE__ */ Xb(...t));
    },
    min(...t) {
      return this.check(/* @__PURE__ */ Rs(...t));
    },
    max(...t) {
      return this.check(/* @__PURE__ */ Og(...t));
    },
    length(...t) {
      return this.check(/* @__PURE__ */ Fg(...t));
    },
    nonempty(...t) {
      return this.check(/* @__PURE__ */ Rs(1, ...t));
    },
    lowercase(t) {
      return this.check(/* @__PURE__ */ Jb(t));
    },
    uppercase(t) {
      return this.check(/* @__PURE__ */ Gb(t));
    },
    trim() {
      return this.check(/* @__PURE__ */ $b());
    },
    normalize(...t) {
      return this.check(/* @__PURE__ */ Qb(...t));
    },
    toLowerCase() {
      return this.check(/* @__PURE__ */ ew());
    },
    toUpperCase() {
      return this.check(/* @__PURE__ */ tw());
    },
    slugify() {
      return this.check(/* @__PURE__ */ nw());
    }
  })
), Gw = /* @__PURE__ */ te("ZodString", (t, e) => {
  Uc.init(t, e), Vg.init(t, e);
}, {
  email(t) {
    return this.check(/* @__PURE__ */ gb($w, t));
  },
  url(t) {
    return this.check(/* @__PURE__ */ bb(t2, t));
  },
  jwt(t) {
    return this.check(/* @__PURE__ */ Rb(m2, t));
  },
  emoji(t) {
    return this.check(/* @__PURE__ */ wb(n2, t));
  },
  guid(t) {
    return this.check(/* @__PURE__ */ pb(e2, t));
  },
  uuid(t) {
    return this.check(/* @__PURE__ */ mb(cs, t));
  },
  uuidv4(t) {
    return this.check(/* @__PURE__ */ vb(cs, t));
  },
  uuidv6(t) {
    return this.check(/* @__PURE__ */ _b(cs, t));
  },
  uuidv7(t) {
    return this.check(/* @__PURE__ */ yb(cs, t));
  },
  nanoid(t) {
    return this.check(/* @__PURE__ */ kb(r2, t));
  },
  cuid(t) {
    return this.check(/* @__PURE__ */ Sb(o2, t));
  },
  cuid2(t) {
    return this.check(/* @__PURE__ */ xb(i2, t));
  },
  ulid(t) {
    return this.check(/* @__PURE__ */ Eb(s2, t));
  },
  base64(t) {
    return this.check(/* @__PURE__ */ Mb(h2, t));
  },
  base64url(t) {
    return this.check(/* @__PURE__ */ Ob(g2, t));
  },
  xid(t) {
    return this.check(/* @__PURE__ */ Tb(a2, t));
  },
  ksuid(t) {
    return this.check(/* @__PURE__ */ Cb(l2, t));
  },
  ipv4(t) {
    return this.check(/* @__PURE__ */ Ab(c2, t));
  },
  ipv6(t) {
    return this.check(/* @__PURE__ */ Pb(u2, t));
  },
  cidrv4(t) {
    return this.check(/* @__PURE__ */ Ib(d2, t));
  },
  cidrv6(t) {
    return this.check(/* @__PURE__ */ zb(f2, t));
  },
  e164(t) {
    return this.check(/* @__PURE__ */ Fb(p2, t));
  },
  datetime(t) {
    return this.check(/* @__PURE__ */ Lb(qw, t));
  },
  date(t) {
    return this.check(/* @__PURE__ */ Db(Yw, t));
  },
  time(t) {
    return this.check(/* @__PURE__ */ Nb(Xw, t));
  },
  duration(t) {
    return this.check(/* @__PURE__ */ Bb(Qw, t));
  }
});
function pt(t) {
  return /* @__PURE__ */ hb(Gw, t);
}
const Ct = /* @__PURE__ */ te("ZodStringFormat", (t, e) => {
  St.init(t, e), Vg.init(t, e);
}), qw = /* @__PURE__ */ te("ZodISODateTime", (t, e) => {
  _y.init(t, e), Ct.init(t, e);
}), Yw = /* @__PURE__ */ te("ZodISODate", (t, e) => {
  yy.init(t, e), Ct.init(t, e);
}), Xw = /* @__PURE__ */ te("ZodISOTime", (t, e) => {
  by.init(t, e), Ct.init(t, e);
}), Qw = /* @__PURE__ */ te("ZodISODuration", (t, e) => {
  wy.init(t, e), Ct.init(t, e);
}), $w = /* @__PURE__ */ te("ZodEmail", (t, e) => {
  oy.init(t, e), Ct.init(t, e);
}), e2 = /* @__PURE__ */ te("ZodGUID", (t, e) => {
  ny.init(t, e), Ct.init(t, e);
}), cs = /* @__PURE__ */ te("ZodUUID", (t, e) => {
  ry.init(t, e), Ct.init(t, e);
}), t2 = /* @__PURE__ */ te("ZodURL", (t, e) => {
  uy.init(t, e), Ct.init(t, e);
}), n2 = /* @__PURE__ */ te("ZodEmoji", (t, e) => {
  dy.init(t, e), Ct.init(t, e);
}), r2 = /* @__PURE__ */ te("ZodNanoID", (t, e) => {
  fy.init(t, e), Ct.init(t, e);
}), o2 = /* @__PURE__ */ te("ZodCUID", (t, e) => {
  hy.init(t, e), Ct.init(t, e);
}), i2 = /* @__PURE__ */ te("ZodCUID2", (t, e) => {
  gy.init(t, e), Ct.init(t, e);
}), s2 = /* @__PURE__ */ te("ZodULID", (t, e) => {
  py.init(t, e), Ct.init(t, e);
}), a2 = /* @__PURE__ */ te("ZodXID", (t, e) => {
  my.init(t, e), Ct.init(t, e);
}), l2 = /* @__PURE__ */ te("ZodKSUID", (t, e) => {
  vy.init(t, e), Ct.init(t, e);
}), c2 = /* @__PURE__ */ te("ZodIPv4", (t, e) => {
  ky.init(t, e), Ct.init(t, e);
}), u2 = /* @__PURE__ */ te("ZodIPv6", (t, e) => {
  xy.init(t, e), Ct.init(t, e);
}), d2 = /* @__PURE__ */ te("ZodCIDRv4", (t, e) => {
  Ey.init(t, e), Ct.init(t, e);
}), f2 = /* @__PURE__ */ te("ZodCIDRv6", (t, e) => {
  Cy.init(t, e), Ct.init(t, e);
}), h2 = /* @__PURE__ */ te("ZodBase64", (t, e) => {
  Ay.init(t, e), Ct.init(t, e);
}), g2 = /* @__PURE__ */ te("ZodBase64URL", (t, e) => {
  Iy.init(t, e), Ct.init(t, e);
}), p2 = /* @__PURE__ */ te("ZodE164", (t, e) => {
  zy.init(t, e), Ct.init(t, e);
}), m2 = /* @__PURE__ */ te("ZodJWT", (t, e) => {
  Oy.init(t, e), Ct.init(t, e);
}), Zc = /* @__PURE__ */ te(
  "ZodNumber",
  (t, e) => {
    Cg.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => gw(t, n, r, o), t.isFinite = !0;
  },
  /* @__PURE__ */ gg({
    minValue: (t) => {
      const { minimum: e, exclusiveMinimum: n } = Dn(t);
      return Math.max(e ?? Number.NEGATIVE_INFINITY, n ?? Number.NEGATIVE_INFINITY);
    },
    maxValue: (t) => {
      const { maximum: e, exclusiveMaximum: n } = Dn(t);
      return Math.min(e ?? Number.POSITIVE_INFINITY, n ?? Number.POSITIVE_INFINITY);
    },
    isInt: (t) => {
      const { isInt: e, multipleOf: n } = Dn(t);
      return !!e || !!n?.some(Number.isSafeInteger);
    },
    format: (t) => Dn(t).format ?? null
  }, {
    gt(t, e) {
      return this.check(/* @__PURE__ */ sf(t, e));
    },
    gte(t, e) {
      return this.check(/* @__PURE__ */ $a(t, e));
    },
    min(t, e) {
      return this.check(/* @__PURE__ */ $a(t, e));
    },
    lt(t, e) {
      return this.check(/* @__PURE__ */ of(t, e));
    },
    lte(t, e) {
      return this.check(/* @__PURE__ */ Qa(t, e));
    },
    max(t, e) {
      return this.check(/* @__PURE__ */ Qa(t, e));
    },
    int(t) {
      return this.check(mf(t));
    },
    safe(t) {
      return this.check(mf(t));
    },
    positive(t) {
      return this.check(/* @__PURE__ */ sf(0, t));
    },
    nonnegative(t) {
      return this.check(/* @__PURE__ */ $a(0, t));
    },
    negative(t) {
      return this.check(/* @__PURE__ */ of(0, t));
    },
    nonpositive(t) {
      return this.check(/* @__PURE__ */ Qa(0, t));
    },
    multipleOf(t, e) {
      return this.check(/* @__PURE__ */ af(t, e));
    },
    step(t, e) {
      return this.check(/* @__PURE__ */ af(t, e));
    },
    finite() {
      return this;
    }
  })
);
function Ir(t) {
  return /* @__PURE__ */ Ub(Zc, t);
}
const v2 = /* @__PURE__ */ te("ZodNumberFormat", (t, e) => {
  Fy.init(t, e), Zc.init(t, e);
});
function mf(t) {
  return /* @__PURE__ */ Hb(v2, t);
}
const _2 = /* @__PURE__ */ te("ZodBoolean", (t, e) => {
  Ry.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => pw(t, n, r);
});
function or(t) {
  return /* @__PURE__ */ Wb(_2, t);
}
const y2 = /* @__PURE__ */ te("ZodUnknown", (t, e) => {
  Ly.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => vw();
});
function vf() {
  return /* @__PURE__ */ Zb(y2);
}
const b2 = /* @__PURE__ */ te("ZodNever", (t, e) => {
  Dy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => mw(t, n, r);
});
function w2(t) {
  return /* @__PURE__ */ Kb(b2, t);
}
const k2 = /* @__PURE__ */ te("ZodArray", (t, e) => {
  la(), Ny.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => kw(t, n, r, o), t.element = e.element;
}, {
  min(t, e) {
    return this.check(/* @__PURE__ */ Rs(t, e));
  },
  nonempty(t) {
    return this.check(/* @__PURE__ */ Rs(1, t));
  },
  max(t, e) {
    return this.check(/* @__PURE__ */ Og(t, e));
  },
  length(t, e) {
    return this.check(/* @__PURE__ */ Fg(t, e));
  },
  unwrap() {
    return this.element;
  }
});
function cr(t, e) {
  return /* @__PURE__ */ rw(k2, t, e);
}
const S2 = /* @__PURE__ */ te("ZodObject", (t, e) => {
  la(), jy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Sw(t, n, r, o), j1(t, "shape", (n) => n._zod.def.shape, !1);
}, {
  keyof() {
    return an(Object.keys(this._zod.def.shape));
  },
  catchall(t) {
    return this.clone(vn(this._zod.def, { catchall: t }));
  },
  passthrough() {
    return this.clone(vn(this._zod.def, { catchall: vf() }));
  },
  loose() {
    return this.clone(vn(this._zod.def, { catchall: vf() }));
  },
  strict() {
    return this.clone(vn(this._zod.def, { catchall: w2() }));
  },
  strip() {
    return this.clone(vn(this._zod.def, { catchall: void 0 }));
  },
  extend(t) {
    return I1(this, t);
  },
  safeExtend(t) {
    return z1(this, t);
  },
  merge(t) {
    return M1(this, t);
  },
  pick(t) {
    return A1(this, t);
  },
  omit(t) {
    return P1(this, t);
  },
  partial(...t) {
    return Dd(Kc, this, t[0]);
  },
  exactPartial(...t) {
    return Dd(qg, this, t[0], "exactPartial");
  },
  required(...t) {
    return O1(Yg, this, t[0]);
  }
});
function Qt(t, e) {
  const n = {
    type: "object",
    shape: t ?? {},
    ...Ae(e)
  };
  return new S2(n);
}
const x2 = /* @__PURE__ */ te("ZodUnion", (t, e) => {
  Hy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => xw(t, n, r, o), t.options = e.options;
});
function E2(t, e) {
  return new x2({
    type: "union",
    options: t,
    ...Ae(e)
  });
}
const T2 = /* @__PURE__ */ te("ZodIntersection", (t, e) => {
  Wy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Ew(t, n, r, o);
});
function C2(t, e) {
  return new T2({
    type: "intersection",
    left: t,
    right: e
  });
}
const A2 = /* @__PURE__ */ te("ZodTuple", (t, e) => {
  la(), Zy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Tw(t, n, r, o);
}, {
  rest(t) {
    return this.clone({
      ...this._zod.def,
      rest: t
    });
  },
  partial() {
    const t = this._zod.def;
    if (t.checks?.length)
      throw new Error(".partial() cannot be used on tuple schemas containing refinements");
    return this.clone({
      ...t,
      items: t.items.map((e) => new Kc({ type: "optional", innerType: e }))
    });
  }
});
function Jg(t, e, n) {
  const r = e instanceof kt, o = r ? n : e, i = r ? e : null;
  return new A2({
    type: "tuple",
    items: t,
    rest: i,
    ...Ae(o)
  });
}
const jl = /* @__PURE__ */ te("ZodEnum", (t, e) => {
  Ky.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (r, o, i) => _w(t, r, o), t.enum = e.entries, t.options = [...t._zod.values];
  const n = new Set(Object.keys(e.entries));
  t.extract = (r, o) => {
    const i = {};
    for (const a of r)
      if (n.has(a))
        i[a] = e.entries[a];
      else
        throw new Error(`Key ${a} not found in enum`);
    return new jl({
      ...e,
      checks: [],
      ...Ae(o),
      entries: i
    });
  }, t.exclude = (r, o) => {
    const i = { ...e.entries };
    for (const a of r)
      if (n.has(a))
        delete i[a];
      else
        throw new Error(`Key ${a} not found in enum`);
    return new jl({
      ...e,
      checks: [],
      ...Ae(o),
      entries: i
    });
  };
});
function an(t, e) {
  const n = Array.isArray(t) ? Object.fromEntries(t.map((r) => [r, r])) : t;
  return new jl({
    type: "enum",
    entries: n,
    ...Ae(e)
  });
}
const P2 = /* @__PURE__ */ te("ZodLiteral", (t, e) => {
  Vy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => yw(t, n, r, o), t.values = new Set(e.values), Object.defineProperty(t, "value", {
    get() {
      if (e.values.length > 1)
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      return e.values[0];
    }
  });
});
function Gg(t, e) {
  return new P2({
    type: "literal",
    values: Array.isArray(t) ? t : [t],
    ...Ae(e)
  });
}
const I2 = /* @__PURE__ */ te("ZodTransform", (t, e) => {
  la(), Jy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => ww(t, n, r, o), t._zod.parse = (n, r) => {
    if (r.direction === "backward")
      throw new pg(t.constructor.name);
    n.addIssue = (i) => {
      if (typeof i == "string")
        n.issues.push(zi(i, n.value, e));
      else {
        const a = i;
        a.fatal && (a.continue = !1), a.code ?? (a.code = "custom"), "input" in a || (a.input = n.value), a.inst ?? (a.inst = t), n.issues.push(zi(a));
      }
    };
    const o = e.transform(n.value, n);
    return o instanceof Promise ? o.then((i) => (n.value = i, n)) : (n.value = o, n);
  };
});
function z2(t) {
  return new I2({
    type: "transform",
    transform: t
  });
}
const Kc = /* @__PURE__ */ te("ZodOptional", (t, e) => {
  Ig.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Kg(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function _f(t) {
  return new Kc({
    type: "optional",
    innerType: t
  });
}
const qg = /* @__PURE__ */ te("ZodExactOptional", (t, e) => {
  Gy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Kg(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function M2(t) {
  return new qg({
    type: "optional",
    innerType: t
  });
}
const O2 = /* @__PURE__ */ te("ZodNullable", (t, e) => {
  qy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Cw(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function yf(t) {
  return new O2({
    type: "nullable",
    innerType: t
  });
}
const F2 = /* @__PURE__ */ te("ZodDefault", (t, e) => {
  Yy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Pw(t, n, r, o), t.unwrap = () => t._zod.def.innerType, t.removeDefault = t.unwrap;
});
function R2(t, e) {
  return new F2({
    type: "default",
    innerType: t,
    get defaultValue() {
      return typeof e == "function" ? e() : cg(e);
    }
  });
}
const L2 = /* @__PURE__ */ te("ZodPrefault", (t, e) => {
  Xy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Iw(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function D2(t, e) {
  return new L2({
    type: "prefault",
    innerType: t,
    get defaultValue() {
      return typeof e == "function" ? e() : cg(e);
    }
  });
}
const Yg = /* @__PURE__ */ te("ZodNonOptional", (t, e) => {
  Qy.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Aw(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function N2(t, e) {
  return new Yg({
    type: "nonoptional",
    innerType: t,
    ...Ae(e)
  });
}
const B2 = /* @__PURE__ */ te("ZodCatch", (t, e) => {
  $y.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => zw(t, n, r, o), t.unwrap = () => t._zod.def.innerType, t.removeCatch = t.unwrap;
});
function U2(t, e) {
  return new B2({
    type: "catch",
    innerType: t,
    catchValue: typeof e == "function" ? e : W1(e)
  });
}
const j2 = /* @__PURE__ */ te("ZodPipe", (t, e) => {
  eb.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Mw(t, n, r, o), t.in = e.in, t.out = e.out;
});
function bf(t, e) {
  return new j2({
    type: "pipe",
    in: t,
    out: e
    // ...util.normalizeParams(params),
  });
}
const H2 = /* @__PURE__ */ te("ZodReadonly", (t, e) => {
  tb.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => Ow(t, n, r, o), t.unwrap = () => t._zod.def.innerType;
});
function W2(t) {
  return new H2({
    type: "readonly",
    innerType: t
  });
}
const Z2 = /* @__PURE__ */ te("ZodCustom", (t, e) => {
  nb.init(t, e), Tt.init(t, e), t._zod.processJSONSchema = (n, r, o) => bw(t, n, r, o);
});
function K2(t, e = {}) {
  return /* @__PURE__ */ ow(Z2, t, e);
}
function V2(t, e) {
  return /* @__PURE__ */ iw(t, e);
}
function J2(t) {
  return /* @__PURE__ */ jb(Zc, t);
}
function G2() {
  gr({ jitless: !0 });
}
G2();
let Vc = {};
const q2 = () => (Vc.PUBLIC_API_URL ?? "").replace(/\/$/, ""), Y2 = () => null, X2 = () => Vc.PUBLIC_REALTIME_WS_URL ?? "", Q2 = () => Vc.PUBLIC_REALTIME_TOKEN ?? "", Xg = q2;
class Ft extends Error {
  status;
  code;
  constructor(e, n, r) {
    super(r), this.name = "ApiClientError", this.status = e, this.code = n;
  }
}
const $2 = (t) => t instanceof Ft && t.status === 409;
async function Jc(t, e) {
  const n = Y2(), r = async () => {
    let i = {};
    if (n)
      try {
        i = { authorization: `Bearer ${await n.current()}` };
      } catch (a) {
        throw new Ft(401, "unauthorized", a.message);
      }
    return fetch(`${Xg()}${t}`, {
      ...e,
      headers: { ...e.headers, ...i }
    });
  }, o = await r();
  return o.status !== 401 || !n ? o : (n.drop(), r());
}
async function pr(t, e = {}) {
  const n = await Jc(t, {
    ...e,
    headers: {
      ...e.body === void 0 ? {} : { "content-type": "application/json" },
      ...e.headers
    }
  });
  if (n.status === 204) return;
  const r = await n.text(), o = r === "" ? null : JSON.parse(r);
  if (!n.ok) {
    const i = o;
    throw new Ft(
      n.status,
      i?.error?.code ?? "http_error",
      i?.error?.message ?? `request failed with ${n.status}`
    );
  }
  return o;
}
const ek = (t, e) => {
  const n = new URLSearchParams();
  t !== void 0 && n.set("limit", String(t)), e !== void 0 && n.set("cursor", e);
  const r = n.size === 0 ? "" : `?${n.toString()}`;
  return pr(`/v1/boards${r}`);
};
async function tk(t, e) {
  const n = await Jc(`/v1/boards/${t}/thumbnail`, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: e
  });
  if (!n.ok)
    throw new Ft(
      n.status,
      "thumbnail_failed",
      `thumbnail upload failed with ${n.status}`
    );
}
const nk = (t, e) => `${Xg()}/v1/boards/${t}/thumbnail?v=${encodeURIComponent(e)}`;
async function rk(t, e) {
  const n = await Jc(`/v1/boards/${t}/thumbnail?v=${encodeURIComponent(e)}`, {});
  return n.ok ? n.blob() : null;
}
const Qg = () => pr("/v1/share"), $g = () => pr("/v1/share/tunnel", { method: "POST" }), ep = () => pr("/v1/share/tunnel", { method: "DELETE" }), ok = (t, e) => pr("/v1/boards", { method: "POST", body: JSON.stringify({ title: t, slug: e }) }), ik = (t, e = {}) => pr(`/v1/boards/${t}${e.tombstones ? "?include=tombstones" : ""}`), sk = (t) => pr(`/v1/boards/${t}`, { method: "DELETE" }), ak = (t, e) => pr(`/v1/boards/${t}/elements`, {
  method: "PATCH",
  body: JSON.stringify(e)
}), lk = (t, e, n) => pr(`/v1/boards/${t}`, {
  method: "PUT",
  headers: { "if-match": `"${n}"` },
  body: JSON.stringify(e)
}), ck = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ApiClientError: Ft,
  createBoard: ok,
  deleteBoard: sk,
  getBoard: ik,
  getShareInfo: Qg,
  isConflict: $2,
  listBoards: ek,
  patchElements: ak,
  putThumbnail: tk,
  replaceBoard: lk,
  startTunnel: $g,
  stopTunnel: ep,
  thumbnailBlob: rk,
  thumbnailUrl: nk
}, Symbol.toStringTag, { value: "Module" })), uk = 1, Fo = 2e4, Ns = 1e4, ir = 128, el = 1e4, dk = 64, fk = 0.5, hk = 4, tp = 64, Gc = 200, gk = 4096, pk = 100, mk = 24, vk = 32, Ro = 6 * 1024 * 1024, _k = 512 * 1024, yk = [
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
  "frame",
  "embed",
  "stickynote",
  "figure"
], bk = ["hachure", "cross-hatch", "solid", "zigzag"], wk = ["solid", "dashed", "dotted"], kk = [
  "none",
  "arrow",
  "triangle",
  "triangle_outline",
  "circle",
  "circle_outline",
  "diamond",
  "diamond_outline",
  "bar",
  "cardinality_one",
  "cardinality_many",
  "cardinality_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many"
], Sk = [
  "dot",
  "crowfoot_one",
  "crowfoot_many",
  "crowfoot_one_or_many"
], Hl = [...kk, ...Sk], xk = ["left", "center", "right"], Ek = ["top", "middle", "bottom"], wf = ["inside", "orbit"], Tk = [
  "polygon",
  "star",
  "parallelogram",
  "trapezoid",
  "cylinder",
  "document"
], wt = Ir().refine((t) => Number.isFinite(t), {
  message: "must be a finite number"
}), wo = wt.refine((t) => Number.isInteger(t), {
  message: "must be an integer"
}), kf = pt().min(1).max(tp), Wl = Jg([wt, wt]), Sf = wt.min(-10).max(10), xf = Jg([Sf, Sf]), Ck = Qt({
  index: wo.min(1).max(Ns),
  start: Wl,
  end: Wl
}), Ak = pt().max(Ro).regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/, {
  message: "must be a base64 data:image URL"
}), Pk = Qt({
  kind: an(Tk),
  sides: wo.min(3).max(12).optional(),
  ratio: wt.min(0.05).max(0.95).optional()
}), np = Qt({
  id: pt().min(1).max(ir),
  type: an(yk),
  x: wt,
  y: wt,
  width: wt,
  height: wt,
  angle: wt,
  strokeColor: kf,
  backgroundColor: kf,
  fillStyle: an(bk),
  strokeWidth: wt.min(0).max(100),
  strokeStyle: an(wk),
  roughness: wt.min(0).max(10),
  opacity: wt.min(0).max(100),
  roundness: wt.nullable(),
  // An explicit corner radius from the in-place handle. Optional and undefaulted for the
  // same reason as the text fields below: every rounded shape saved before this existed
  // uses the adaptive corner, and stamping a value onto them on the way through the server
  // would change how every one of them looks.
  cornerRadius: wt.min(0).max(1e5).optional(),
  seed: wt,
  points: cr(Wl).max(Ns).optional(),
  // A line closed on its first point, filled like a shape (Excalidraw's `polygon`,
  // `packages/element/src/types.ts@1118751f:382`). Optional and undefaulted: a line
  // saved before this existed carries none, and absent must read as `false` — the open
  // polyline it always was.
  polygon: or().optional(),
  startBinding: pt().max(ir).nullable().optional(),
  endBinding: pt().max(ir).nullable().optional(),
  // Where each bound end sits on its shape, and how. Optional and undefaulted: an arrow
  // saved before anchors existed carries neither, which the engine reads as the centre in
  // orbit — exactly how every such arrow was always drawn.
  startFixedPoint: xf.optional(),
  endFixedPoint: xf.optional(),
  startBindMode: an(wf).optional(),
  endBindMode: an(wf).optional(),
  startArrowhead: an(Hl).optional(),
  endArrowhead: an(Hl).optional(),
  // An elbow arrow, routed round its shapes in horizontal and vertical runs (Excalidraw's
  // `elbowed`, `packages/element/src/types.ts@1118751f:394-408`). Optional and
  // undefaulted: an arrow saved before these existed is a sharp or curved one, and stays
  // one. `fixedSegments` are the segments its route keeps, `null` the oracle's none;
  // `startIsSpecial`/`endIsSpecial` mark the extra corner a kept route puts beside an end.
  elbowed: or().optional(),
  fixedSegments: cr(Ck).max(Ns).nullable().optional(),
  startIsSpecial: or().nullable().optional(),
  endIsSpecial: or().nullable().optional(),
  text: pt().max(el).optional(),
  // The text model, all optional and undefaulted like the alignments below: a text saved
  // before them carries none, and the engine reads absent as what it always drew — `text`
  // is the source, the system font, a line height of 1.25, a label wrapped in its shape.
  // `originalText` is the source before wrapping (`text` stays what is drawn); `fontFamily`
  // is Excalidraw's numeric id; `lineHeight` a multiple of the font size; `wrap: false`
  // keeps a label's hard lines and widens its shape instead.
  originalText: pt().max(el).optional(),
  fontFamily: wo.min(1).max(dk).optional(),
  lineHeight: wt.min(fk).max(hk).optional(),
  wrap: or().optional(),
  fontSize: wt.min(1).max(1e3).optional(),
  // Optional rather than defaulted, and the distinction is load-bearing: absent means
  // nobody chose, which the engine resolves through the element's role — free text reads
  // from the left, a label centres in its shape. Giving either a `.default()` here would
  // stamp a value onto every element that passes through the server and silently
  // re-align every label saved before these fields existed.
  textAlign: an(xk).optional(),
  verticalAlign: an(Ek).optional(),
  // `false` for a column dragged out with the text tool, which keeps its width and wraps
  // inside it. Optional and undefaulted for the same reason as the alignments: every text
  // saved before this field existed sized itself to its glyphs, and stamping `true` onto
  // them on the way through the server would write a choice nobody made.
  autoResize: or().optional(),
  // Only a label's: how far along its arrow's drawn path it sits, as a **fraction of that
  // path's length** (Excalidraw's `labelPosition`,
  // `packages/element/src/types.ts@1118751f:290`). A fraction and not a world-unit offset,
  // so a label stays where it was put when the arrow is lengthened.
  //
  // Any finite number, **not** bounded to [0, 1], because the engine reads it clamped
  // (`isFiniteNumber(x) ? clamp(x, 0, 1) : null`, `restore.ts@1118751f:573-575`) and so
  // should the boundary. Refusing one here would throw a whole board away over a float
  // overshoot — and a drag genuinely produces `0.2500000018`, so an overshoot is a value
  // this schema has to carry, not a value to reject. `finite` still turns away the NaN and
  // the infinities, which are the ones that cannot be read as a position at all. Absent —
  // every label saved before this existed — is the middle, where it was always drawn.
  labelPosition: wt.optional(),
  containerId: pt().max(ir).nullable().optional(),
  boundTextId: pt().max(ir).nullable().optional(),
  // The groups this element is in, **innermost first**. The array *is* the nesting:
  // there is no group entity and no parent pointer, just ids that several elements
  // share. Mirrors the engine's `group_ids`; see `docs/reference/groups.md`.
  groupIds: cr(pt().max(ir)).max(vk).optional(),
  // The pre-array spelling, still accepted so boards saved before groups could nest keep
  // loading. The engine folds it into `groupIds` on the way in and writes only the array
  // back, so a document is in the old shape at most once.
  groupId: pt().max(ir).nullable().optional(),
  locked: or().optional(),
  // The frame an element belongs to, and a frame's label. Missing here, both were
  // stripped on the way in: after a reload nothing was inside any frame, so moving a
  // frame left its contents behind, and every frame had lost its name.
  frameId: pt().max(ir).nullable().optional(),
  name: pt().max(el).nullable().optional(),
  // A frame's place on the presentation path (`docs/reference/presentation.md`). Optional
  // and undefaulted: a frame nobody placed carries none, and is presented after the placed
  // ones in the order it was made — how every frame was presented before the path existed.
  pathStep: wo.min(0).max(Fo).optional(),
  // The picture an image element shows. Without it here zod stripped it on the way in,
  // so every image saved as an empty frame and came back after a reload as the grey
  // placeholder.
  dataUrl: Ak.optional(),
  // The page an embed shows — a video, a document. The same story as `dataUrl`: absent
  // from this schema, it was stripped, and every embed came back from the server as an
  // empty box, for whoever opened the board next. Bounded and nothing more: the engine
  // re-checks it against its list of providers before anything is framed
  // (`scene/embed.rs`), so this is not where a page is let in.
  embedUrl: pt().max(gk).nullable().optional(),
  // The sticky note's model, all optional and undefaulted like the text fields above: every
  // element saved before the note was native carries none, and must come back byte for byte.
  // `baseHeight` is the height the user set, which a note grows above to fit its label and
  // never shrinks below; `created` is when a note was drawn (its footer's date), `null` when
  // unknown as the oracle writes it; `baseFontSize` is the size a note's label was given, the
  // ceiling the auto-fit shrinks below.
  baseHeight: wt.min(0).max(1e6).optional(),
  created: wt.nullable().optional(),
  baseFontSize: wt.min(1).max(1e3).nullable().optional(),
  // A figure's parameters — its kind, and the sides/ratio that shape it. Optional and
  // undefaulted like the type-specific models above: absent on every element that is not
  // a figure, and the engine's own resolved_sides/resolved_ratio give a kind-specific
  // default to a figure whose sides/ratio is absent too.
  figure: Pk.optional(),
  // Dynamic size (`docs/reference/dynamic-size.md`): 1/zoom for an element drawn zoomed
  // out. The engine clamps it to [0.1, 10], which keeps a key's width and font size inside
  // the limits above. Declared, or the schema would strip it and a saved drawing would
  // come back drawn at the wrong scale.
  sizeScale: wt.min(0.1).max(10).optional(),
  // The reconciliation stamp. `version` counts edits, `versionNonce` is random
  // per edit and breaks ties between concurrent writers.
  version: wo.min(1),
  versionNonce: wo,
  updated: wt,
  isDeleted: or()
}), Ik = Qt({
  minX: Ir(),
  minY: Ir(),
  maxX: Ir(),
  maxY: Ir()
});
function qc(t) {
  const e = t.width < 0 ? t.x + t.width : t.x, n = t.height < 0 ? t.y + t.height : t.y;
  return {
    minX: e,
    minY: n,
    maxX: e + Math.abs(t.width),
    maxY: n + Math.abs(t.height)
  };
}
function zk(t) {
  let e = null;
  for (const n of t) {
    if (n.isDeleted) continue;
    const r = qc(n);
    e = e === null ? r : {
      minX: Math.min(e.minX, r.minX),
      minY: Math.min(e.minY, r.minY),
      maxX: Math.max(e.maxX, r.maxX),
      maxY: Math.max(e.maxY, r.maxY)
    };
  }
  return e;
}
const Mk = pt().regex(/^[a-z0-9]{6,32}$/, "must be 6-32 lowercase alphanumeric characters"), rp = Qt({
  type: Gg("osidraw"),
  version: Ir().int().min(1).max(uk),
  elements: cr(np).max(Fo)
});
Qt({
  title: pt().trim().min(1).max(Gc)
});
rp.extend({
  title: pt().trim().min(1).max(Gc).optional()
});
Qt({
  elements: cr(np).max(Fo),
  order: cr(pt().max(ir)).max(Fo).optional()
});
Qt({
  limit: J2().int().min(1).max(pk).default(mk),
  cursor: pt().max(256).optional()
});
Qt({
  include: Gg("tombstones").optional()
});
const op = Qt({
  slug: Mk,
  title: pt(),
  elementCount: Ir().int().min(0),
  bounds: Ik.nullable(),
  rev: Ir().int().min(0),
  createdAt: pt(),
  updatedAt: pt(),
  /**
   * When the board's picture was last stored; null until one is. Optional on the read
   * side because an API older than the thumbnail routes does not send it.
   */
  thumbnailAt: pt().nullable().optional()
});
Qt({
  boards: cr(op),
  /** Absent when there is no further page. */
  nextCursor: pt().nullable()
});
op.extend({
  scene: rp
});
Qt({
  error: Qt({
    code: pt(),
    message: pt()
  })
});
function Ok(t, e) {
  return t.version !== e.version ? t.version - e.version : t.versionNonce !== e.versionNonce ? t.versionNonce - e.versionNonce : t.updated - e.updated;
}
function Fk(t, e) {
  return Ok(t, e) > 0;
}
function ip(t, e) {
  const n = /* @__PURE__ */ new Map();
  for (const i of t) n.set(i.id, i);
  let r = 0, o = 0;
  for (const i of e) {
    const a = n.get(i.id);
    a === void 0 || Fk(i, a) ? (n.set(i.id, i), r += 1) : o += 1;
  }
  return { elements: [...n.values()], applied: r, rejected: o };
}
function sp(t, e) {
  const n = /* @__PURE__ */ new Map();
  e.forEach((i, a) => {
    n.has(i) || n.set(i, a);
  });
  const r = [], o = [];
  for (const i of t)
    n.has(i.id) ? r.push(i) : o.push(i);
  return r.sort((i, a) => (n.get(i.id) ?? 0) - (n.get(a.id) ?? 0)), [...r, ...o];
}
an(["host", "guest", "internet"]);
const Rk = an(["off", "starting", "on", "failed", "unavailable"]), Lk = an(["wired", "wifi", "unknown"]), Dk = Qt({
  origin: pt().url(),
  over: Lk
});
Qt({
  /**
   * Origins on the local network, best first: the computer's DNS name when the network
   * has one — `http://c2r19s1.42madrid.com:5273` — then its addresses, each with the
   * network it goes over.
   */
  lan: cr(Dk),
  /** The public origin through the tunnel, while it is on, or null. */
  public: pt().url().nullable(),
  /** The internet link: off, starting, on, failed (with why), or not offered here. */
  tunnel: Qt({ state: Rk, message: pt().optional() }),
  /** Whether the asker may open and close the internet link: this computer only. */
  canManage: or()
});
function ap(t) {
  const e = t.trim().toLowerCase();
  if (e.startsWith("[")) return e.slice(1, e.indexOf("]"));
  const n = e.lastIndexOf(":");
  return n > 0 && e.indexOf(":") === n ? e.slice(0, n) : e;
}
function Nk(t) {
  const e = ap(t);
  return e === "localhost" || e.endsWith(".localhost") || e === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(e);
}
function Bk(t) {
  const e = ap(t);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(e) || e.includes(":");
}
const Si = (t) => t;
class Yc {
  held = /* @__PURE__ */ new Map();
  /** Starts over, from what the other side is known to have. */
  reset(e) {
    this.held.clear(), this.note(e);
  }
  /**
   * The other side now has these, as they are. A copy without its picture changes
   * nothing: the other side keeps the one it had. A tombstone keeps none.
   */
  note(e) {
    for (const n of e.map(Si))
      n.isDeleted ? this.held.delete(n.id) : n.dataUrl !== void 0 && this.held.set(n.id, n.dataUrl);
  }
  /** `elements`, each without a picture the other side already has. */
  strip(e) {
    return e.map((n) => {
      const { id: r, isDeleted: o, dataUrl: i } = Si(n);
      if (o || i === void 0 || this.held.get(r) !== i) return n;
      const a = { ...n };
      return delete a.dataUrl, a;
    });
  }
}
function lp(t, e) {
  return t.map((n) => {
    const { id: r, type: o, isDeleted: i, dataUrl: a } = Si(n);
    if (o !== "image" || i || a !== void 0) return n;
    const l = e(r), c = l && !Si(l).isDeleted ? Si(l).dataUrl : void 0;
    return c === void 0 ? n : { ...n, dataUrl: c };
  });
}
const Uk = "Untitled";
function jk(t) {
  return (t.get("title") ?? "").replaceAll(/\s+/g, " ").trim().slice(0, Gc).trim() || Uk;
}
const Hk = 3;
async function Wk(t, e, n) {
  try {
    return await t.getBoard(e, { tombstones: !0 });
  } catch (o) {
    if (!(o instanceof Ft && o.status === 404)) throw o;
  }
  if ((await t.createBoard(n(), e)).slug !== e)
    throw new Ft(
      502,
      "slug_ignored",
      "The whiteboard service could not create this board."
    );
  return t.getBoard(e, { tombstones: !0 });
}
async function Zk(t, e, n, r) {
  const o = n.elements;
  for (let i = 1; ; i += 1) {
    const a = await Wk(t, e, r), l = new Map(a.scene.elements.map((f) => [f.id, f])), c = ip(a.scene.elements, o), d = lp(c.elements, (f) => l.get(f)), u = n.order === void 0 ? d : sp(d, n.order);
    try {
      const f = await t.replaceBoard(e, { ...a.scene, elements: u }, a.rev), { scene: h, ...p } = f;
      return { ...p, applied: c.applied, rejected: c.rejected };
    } catch (f) {
      if (!(f instanceof Ft && f.status === 409) || i >= Hk) throw f;
    }
  }
}
const tl = async () => {
  throw new Ft(501, "not_hosted", "A hosted board has no gallery.");
};
function cp(t, e) {
  return {
    list: tl,
    create: (n) => t.createBoard(n),
    get: (n, r) => t.getBoard(n, r),
    patchElements: (n, r) => Zk(t, n, r, e),
    replace: (n, r, o) => t.replaceBoard(n, r, o),
    remove: tl,
    putThumbnail: (n, r) => t.putThumbnail(n, r),
    thumbnail: tl
  };
}
({
  ...cp(ck, () => jk(new URLSearchParams(location.search)))
});
const Kk = ":root,.hydrawn-board{--ink: #1e1e1e;--muted: #6b7280;--line: #e5e7eb;--accent: #6965db;--accent-subtle: #eef0ff;--surface: #ffffff;--canvas: #f8f9fb;--fg-strong: #111827;--bg: #f3f4f6;--bg-hover: #edeef0;--danger: #e03131;--shadow-sm: 0 1px 4px rgba(0, 0, 0, .06);--shadow-md: 0 4px 16px rgba(0, 0, 0, .1);--shadow-lg: 0 8px 30px rgba(0, 0, 0, .14);--radius: 10px;--transition: .15s ease;color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}:root.dark,.hydrawn-board.dark{--ink: #e8eaed;--muted: #9ca3af;--line: #3a3a3a;--accent: #848ce9;--accent-subtle: rgba(132, 140, 233, .14);--surface: #232329;--canvas: #191919;--fg-strong: #f0f0f0;--bg: #2a2a30;--bg-hover: #33333a;--danger: #ff6b6b;--shadow-sm: 0 1px 4px rgba(0, 0, 0, .25);--shadow-md: 0 4px 16px rgba(0, 0, 0, .35);--shadow-lg: 0 8px 30px rgba(0, 0, 0, .45);color-scheme:dark}*{box-sizing:border-box}.hydrawn-board{height:100%;color:var(--ink)}a{color:inherit;text-decoration:none}button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);padding:.45rem .8rem;transition:background var(--transition),border-color var(--transition),color var(--transition),box-shadow var(--transition)}button:hover:not(:disabled){border-color:var(--accent)}button:disabled{cursor:not-allowed;opacity:.55}input{font:inherit;padding:.45rem .65rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink);transition:background var(--transition),border-color var(--transition),color var(--transition)}input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}::selection{background:var(--accent-subtle);color:var(--fg-strong)}.present-bar.svelte-r5ymwh{position:absolute;bottom:20px;left:50%;transform:translate(-50%);display:flex;align-items:center;gap:6px;padding:6px 10px;z-index:90;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);border-radius:var(--radius);backdrop-filter:blur(12px);transition:opacity .25s ease}.present-bar.faded.svelte-r5ymwh{opacity:0;pointer-events:none}.present-bar.svelte-r5ymwh button:where(.svelte-r5ymwh){height:30px;min-width:30px;padding:0 10px;border-radius:6px;font-size:14px;font-weight:600;color:var(--ink)}.present-bar.svelte-r5ymwh button:where(.svelte-r5ymwh):hover{background:var(--bg-hover)}.counter.svelte-r5ymwh{min-width:52px;text-align:center;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;color:var(--fg-strong)}.rule.svelte-r5ymwh{width:1px;height:18px;background:var(--line)}.exit.svelte-r5ymwh{color:var(--danger, #e03131)}.path-panel.svelte-1lhbz8k{position:absolute;top:64px;right:12px;z-index:60;width:248px;max-height:calc(100% - 140px);display:flex;flex-direction:column;gap:8px;padding:10px;overflow:auto;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);border-radius:var(--radius);color:var(--ink)}header.svelte-1lhbz8k{display:flex;align-items:center;justify-content:space-between}h2.svelte-1lhbz8k{margin:0;font-size:13px;font-weight:600}.hint.svelte-1lhbz8k,.empty.svelte-1lhbz8k{margin:0;font-size:12px;color:var(--fg-muted, #868e96)}ol.svelte-1lhbz8k{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}li.svelte-1lhbz8k{display:flex;align-items:center;gap:2px;border-radius:6px;border-top:2px solid transparent}li.dragging.svelte-1lhbz8k{opacity:.4}li.over.svelte-1lhbz8k{border-top-color:var(--accent, #6965db)}button.svelte-1lhbz8k{height:28px;border-radius:6px;color:var(--ink)}button.svelte-1lhbz8k:hover:not(:disabled){background:var(--bg-hover)}button.svelte-1lhbz8k:disabled{opacity:.35}.stop.svelte-1lhbz8k{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:0 6px;text-align:left;cursor:grab}.step.svelte-1lhbz8k{flex:none;width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:var(--accent, #6965db);color:#fff;font-size:11px;font-weight:700}.name.svelte-1lhbz8k{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.nudge.svelte-1lhbz8k,.close.svelte-1lhbz8k{width:24px;flex:none;font-size:14px}.present.svelte-1lhbz8k{font-weight:600;background:var(--accent, #6965db);color:#fff}.present.svelte-1lhbz8k:hover{background:var(--accent-strong, #5b57d1)}.follow-notice.svelte-12fid70{position:absolute;top:64px;left:50%;transform:translate(-50%);display:flex;align-items:center;gap:10px;padding:8px 14px;z-index:95;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);border-radius:var(--radius);backdrop-filter:blur(12px);font-size:13px;color:var(--ink)}.follow-notice.svelte-12fid70 button:where(.svelte-12fid70){padding:4px 10px;border-radius:6px;background:var(--accent);color:#fff;font-size:12px;font-weight:600}.follow-notice.svelte-12fid70 button:where(.svelte-12fid70):hover{filter:brightness(1.08)}.strip.svelte-1p0b7fa{position:absolute;display:flex;gap:3px;padding:4px;border-radius:10px;z-index:25;transform:translate(-50%,calc(-100% - 8px));pointer-events:auto}.strip.below.svelte-1p0b7fa{transform:none}button.svelte-1p0b7fa{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;color:var(--ink);transition:background var(--transition),color var(--transition)}button.svelte-1p0b7fa:hover{background:var(--bg-hover)}button[aria-pressed=true].svelte-1p0b7fa{background:var(--accent-subtle);color:var(--accent)}button.svelte-1p0b7fa:active{transform:scale(.92)}.modal-backdrop.svelte-p974y3{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(3px)}.modal-card.svelte-p974y3{background:var(--surface);border:1px solid var(--line);border-radius:.75rem;padding:1.25rem;width:min(34rem,calc(100vw - 2rem));box-shadow:0 16px 48px #0000003d}.modal-header.svelte-p974y3{display:flex;align-items:center;justify-content:space-between;margin-bottom:.875rem}h3.svelte-p974y3{margin:0;font-size:1rem}.close-btn.svelte-p974y3{border:none;background:none;cursor:pointer;font-size:.875rem;color:var(--muted)}input.svelte-p974y3{width:100%;box-sizing:border-box;padding:.5rem .625rem;border:1px solid var(--line);border-radius:.5rem;background:var(--surface);color:var(--text);font-size:.875rem}input[aria-invalid=true].svelte-p974y3{border-color:#e03131}.hint.svelte-p974y3,.resolved.svelte-p974y3,.error-msg.svelte-p974y3{margin:.625rem 0 0;font-size:.75rem;line-height:1.5;color:var(--muted)}.error-msg.svelte-p974y3{color:#e03131}.resolved.svelte-p974y3 code:where(.svelte-p974y3){overflow-wrap:anywhere}.actions.svelte-p974y3{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}.actions.svelte-p974y3 button:where(.svelte-p974y3){padding:.4375rem .875rem;border-radius:.5rem;border:1px solid var(--line);background:var(--surface);color:var(--text);font-size:.8125rem;cursor:pointer}.btn-primary.svelte-p974y3{background:var(--accent);border-color:var(--accent);color:#fff}.btn-primary.svelte-p974y3:disabled{opacity:.5;cursor:not-allowed}.draw-header.svelte-ysb7vk{position:absolute;top:12px;left:14px;right:14px;height:44px;display:flex;justify-content:space-between;align-items:center;pointer-events:none;z-index:30}.menu-anchor.svelte-ysb7vk{position:relative;display:flex;align-items:center;flex:0 0 auto}.left-group.svelte-ysb7vk,.right-group.svelte-ysb7vk{display:flex;align-items:center;gap:8px;pointer-events:auto}.left-group.svelte-ysb7vk{min-width:0}.menu-btn.svelte-ysb7vk,.help-btn.svelte-ysb7vk{height:38px;min-width:38px;padding:0 10px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);color:var(--ink);display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow-sm);backdrop-filter:blur(8px);transition:all var(--transition)}.menu-btn.svelte-ysb7vk:hover,.help-btn.svelte-ysb7vk:hover{background:var(--bg-hover);border-color:var(--accent)}.board-title-btn.svelte-ysb7vk{background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 6px;cursor:pointer;display:flex;align-items:center;min-width:0;transition:border-color var(--transition),background var(--transition)}.board-title-btn.svelte-ysb7vk:hover{background:var(--bg);border-color:var(--line)}.board-title.svelte-ysb7vk{font-size:13px;font-weight:600;color:var(--ink);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title-input.svelte-ysb7vk{font-size:13px;font-weight:600;max-width:180px;padding:3px 6px;height:28px}.chips.svelte-ysb7vk{display:flex;align-items:center;gap:8px;flex:0 0 auto}.chips.folded.svelte-ysb7vk{position:absolute;visibility:hidden;pointer-events:none}.save-status.svelte-ysb7vk{font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--line);padding:3px 8px;border-radius:6px;box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:6px;backdrop-filter:blur(8px);white-space:nowrap}.save-status.trouble.svelte-ysb7vk{color:var(--danger)}.folded-status.svelte-ysb7vk{padding:3px 8px}.folded-words.svelte-ysb7vk{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.dot-offline.svelte-ysb7vk{width:6px;height:6px;border-radius:50%;background:var(--danger)}.dot-quiet.svelte-ysb7vk{width:6px;height:6px;border-radius:50%;background:var(--muted)}.dot-pulse.svelte-ysb7vk{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:svelte-ysb7vk-pulse 1s infinite alternate}@keyframes svelte-ysb7vk-pulse{0%{opacity:.3;transform:scale(.8)}to{opacity:1;transform:scale(1.2)}}.share-btn.svelte-ysb7vk{height:38px;display:flex;align-items:center;gap:6px;padding:0 14px;border-radius:var(--radius);border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:var(--shadow-sm);transition:all var(--transition)}.share-btn.svelte-ysb7vk:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:var(--shadow-md)}.share-btn.svelte-ysb7vk:active{transform:translateY(0)}.help-btn.svelte-ysb7vk{font-size:14px;font-weight:700;width:38px}svg.svelte-1k0zi6s{width:1rem;height:1rem;display:block;flex:0 0 auto}.dropdown-menu.svelte-uens9z{position:absolute;top:100%;left:0;margin-top:6px;min-width:232px;max-width:20rem;z-index:110}.dropdown-menu-container.svelte-uens9z{display:flex;flex-direction:column;gap:1px;padding:2px;box-sizing:border-box;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow-md);overflow-y:auto;max-height:calc(100dvh - 6rem)}.dropdown-menu-item.svelte-uens9z,.dropdown-menu-item-bare.svelte-uens9z{display:flex;align-items:center;column-gap:.625rem;padding:0 .5rem;height:2rem;font-size:.875rem;font-weight:400;font-family:inherit;color:var(--fg-strong);width:100%;box-sizing:border-box}.dropdown-menu-item.svelte-uens9z{background:transparent;border:none;border-radius:6px;cursor:pointer;text-align:left;text-decoration:none;flex:1 0 auto}.dropdown-menu-item.svelte-uens9z:hover,.dropdown-menu-item.svelte-uens9z:focus-visible{background:var(--bg);outline:none}.dropdown-menu-item.svelte-uens9z:active{box-shadow:0 0 0 1px var(--accent)}.dropdown-menu-item__text.svelte-uens9z{flex:1 1 auto;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.dropdown-menu-item__shortcut.svelte-uens9z{margin-inline-start:auto;opacity:.5;font-size:.75rem;white-space:nowrap}.dropdown-menu-item-bare.svelte-uens9z{justify-content:space-between}.dropdown-menu-separator.svelte-uens9z{height:1px;background:var(--line);margin:6px 0;flex:0 0 auto}.RadioGroup.svelte-uens9z{display:flex;flex-direction:row;align-items:center;gap:2px;padding:3px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}.RadioGroup__choice.svelte-uens9z{display:flex;align-items:center;justify-content:center;min-width:20px;height:24px;padding:0 .375rem;border:none;border-radius:8px;background:transparent;color:var(--accent);cursor:pointer}.RadioGroup__choice.active.svelte-uens9z{background:var(--accent);color:#fff}.RadioGroup__choice.svelte-uens9z:not(.active):hover{background:var(--bg)}.dropdown-menu-item-custom.svelte-uens9z{margin-top:.5rem;padding:0 .5rem .25rem}.build-stamp.svelte-uens9z{padding:4px 12px 6px;font-size:11px;font-family:ui-monospace,monospace;color:var(--muted);user-select:text}.menu-section-label.svelte-uens9z{font-size:.75rem;font-weight:600;color:var(--muted);margin-bottom:.375rem}.swatches.svelte-uens9z{display:flex;gap:6px}.swatch.svelte-uens9z{width:1.35rem;height:1.35rem;padding:0;border-radius:5px;border:1px solid var(--line);background:var(--swatch-color);cursor:pointer}.swatch.active.svelte-uens9z{box-shadow:0 0 0 2px var(--accent)}.switch.svelte-uens9z{position:relative;width:32px;height:18px;padding:0;border:1px solid var(--line);border-radius:999px;background:var(--bg);cursor:pointer;flex:0 0 auto;transition:background var(--transition, .12s)}.switch.on.svelte-uens9z{background:var(--accent);border-color:var(--accent)}.knob.svelte-uens9z{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--surface);transition:transform var(--transition, .12s)}.switch.on.svelte-uens9z .knob:where(.svelte-uens9z){transform:translate(14px)}.RadioGroup__choice.text.svelte-uens9z{font-size:.75rem;font-weight:600;font-family:inherit}.bar.svelte-1tnl5mk{position:absolute;top:var(--chrome-toolbar-top, 14px);left:50%;transform:translate(-50%);display:flex;align-items:center;gap:3px;padding:5px;border-radius:12px;z-index:20;box-shadow:var(--shadow-md);transition:box-shadow var(--transition)}button.svelte-1tnl5mk{position:relative;width:36px;height:36px;display:grid;place-items:center;border-radius:8px;color:var(--ink);transition:background var(--transition),color var(--transition),transform .1s ease}button.svelte-1tnl5mk:active{transform:scale(.92)}button.svelte-1tnl5mk:hover:not(.active){background:var(--bg-hover)}button.active.svelte-1tnl5mk{color:var(--accent);background:var(--accent-subtle);font-weight:600}.hotkey-badge.svelte-1tnl5mk{position:absolute;right:3px;bottom:2px;font-size:9px;font-weight:700;opacity:.55;pointer-events:none;line-height:1;font-family:ui-monospace,SFMono-Regular,monospace}button.active.svelte-1tnl5mk .hotkey-badge:where(.svelte-1tnl5mk){opacity:.9;color:var(--accent)}.rule.svelte-1tnl5mk{width:1px;height:22px;margin:0 3px;background:var(--line)}.more.svelte-1tnl5mk{position:relative;display:flex}.caret.svelte-1tnl5mk{position:absolute;right:3px;bottom:3px;width:0;height:0;border-left:4px solid transparent;border-top:4px solid currentColor;opacity:.5}.trigger.active.svelte-1tnl5mk .caret:where(.svelte-1tnl5mk){opacity:.9}.menu.svelte-1tnl5mk{position:absolute;top:calc(100% + 8px);right:0;min-width:232px;padding:4px;border-radius:10px;box-shadow:var(--shadow-md);display:flex;flex-direction:column;gap:1px;z-index:30}.menu-item.svelte-1tnl5mk{width:100%;height:2rem;display:flex;align-items:center;gap:.625rem;padding:0 .5rem;border-radius:6px;font-size:.875rem;color:var(--ink);text-align:left}.menu-item.svelte-1tnl5mk:hover,.menu-item.svelte-1tnl5mk:focus-visible{background:var(--bg-hover)}.menu-item.on.svelte-1tnl5mk{color:var(--accent);background:var(--accent-subtle)}.name.svelte-1tnl5mk{flex:1 1 auto}kbd.svelte-1tnl5mk{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.6875rem;opacity:.55;pointer-events:none}.mobile-bar-row.svelte-1mv3ffm{display:flex;align-items:center;justify-content:center;gap:4px;max-width:100%;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.tool.svelte-1mv3ffm{width:36px;height:36px;display:grid;place-items:center;border-radius:8px;color:var(--ink);flex:0 0 auto}.tool.active.svelte-1mv3ffm{color:var(--accent);background:var(--accent-subtle)}.pop.svelte-1mv3ffm{position:relative;display:flex}.menu.svelte-1mv3ffm{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translate(-50%);min-width:9.5rem;max-width:min(15rem,calc(100vw - 1.5rem));max-height:min(60vh,22rem);overflow-y:auto;padding:4px;border-radius:10px;z-index:40;display:flex;flex-direction:column;gap:1px}.pop.svelte-1mv3ffm:last-child .menu:where(.svelte-1mv3ffm){left:auto;right:0;transform:none}.menu-item.svelte-1mv3ffm{width:100%;min-height:2rem;display:flex;align-items:center;gap:.625rem;padding:0 .5rem;border-radius:6px;font-size:.875rem;color:var(--ink);text-align:left}.menu-item.on.svelte-1mv3ffm{color:var(--accent);background:var(--accent-subtle)}.name.svelte-1mv3ffm{flex:1 1 auto}.row.svelte-1kk3jp4{display:grid;gap:6px;margin-bottom:12px}span.svelte-1kk3jp4{font-size:11px;font-weight:600;color:var(--muted)}.swatches.svelte-1nf1l6d{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}.swatches.compact.svelte-1nf1l6d{gap:0}.picks.svelte-1nf1l6d{display:flex;align-items:center;justify-content:space-between;flex:1 1 auto;gap:4px}.dot.svelte-1nf1l6d{width:1.375rem;height:1.375rem;flex:0 0 auto;padding:0;border-radius:4px;border:1px solid var(--line);cursor:pointer}.dot.on.svelte-1nf1l6d{box-shadow:0 0 0 1px var(--surface),0 0 0 3px var(--accent)}.transparent.svelte-1nf1l6d{background:repeating-conic-gradient(silver 0% 25%,#fff 0% 50%) 50% / 8px 8px}.mixed.svelte-1nf1l6d{background:linear-gradient(to top right,var(--surface) calc(50% - 1px),var(--muted) calc(50% - 1px),var(--muted) calc(50% + 1px),var(--surface) calc(50% + 1px))}.divider.svelte-1nf1l6d{width:1px;height:1rem;flex:0 0 auto;background:var(--line)}.picker.svelte-1nf1l6d{position:fixed;inset:auto;margin:0;color:inherit;overflow:visible;width:13.5rem;padding:12px;border-radius:10px;box-shadow:var(--shadow-md);outline:none}.heading.svelte-1nf1l6d{margin:10px 0 6px;font-size:11px;font-weight:600;color:var(--muted)}.heading.svelte-1nf1l6d:first-child{margin-top:0}.grid.svelte-1nf1l6d{display:grid;grid-template-columns:repeat(5,1.875rem);justify-content:space-between;row-gap:6px}.cell.svelte-1nf1l6d{position:relative;width:1.875rem;height:1.875rem;padding:0;border-radius:6px;border:1px solid var(--line);cursor:pointer}.cell.active.svelte-1nf1l6d{box-shadow:0 0 0 1px var(--surface),0 0 0 3px var(--accent)}.hotkey.svelte-1nf1l6d{position:absolute;right:2px;bottom:1px;font-size:9px;line-height:1;color:#1e1e1e;opacity:.6}.none.svelte-1nf1l6d{font-size:11px;color:var(--muted)}.hex.svelte-1nf1l6d{display:flex;align-items:center;gap:6px;height:30px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}.hex.error.svelte-1nf1l6d{border-color:#e03131}.hex.svelte-1nf1l6d span:where(.svelte-1nf1l6d){color:var(--muted)}.hex.svelte-1nf1l6d input:where(.svelte-1nf1l6d){flex:1;min-width:0;border:0;padding:0;background:transparent;color:var(--fg-strong);font:inherit;outline:none}.dropper.svelte-1nf1l6d{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--fg-strong);cursor:pointer}.dropper.svelte-1nf1l6d:hover{background:var(--bg)}.message.svelte-1nf1l6d{margin-top:4px;font-size:11px;color:#e03131}.fonts.svelte-1tkogeh{display:flex;align-items:center;gap:8px}.picks.svelte-1tkogeh{display:flex;flex:1 1 auto;gap:4px}.picks.svelte-1tkogeh button:where(.svelte-1tkogeh),.trigger.svelte-1tkogeh{flex:1;height:30px;display:grid;place-items:center;padding:0;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}.trigger.svelte-1tkogeh{flex:0 0 30px}.fonts.compact.svelte-1tkogeh .trigger:where(.svelte-1tkogeh){flex:0 0 32px;width:32px;height:32px}.picks.svelte-1tkogeh button.on:where(.svelte-1tkogeh),.trigger.on.svelte-1tkogeh{color:var(--accent);background:var(--accent-subtle)}.divider.svelte-1tkogeh{width:1px;height:1rem;flex:0 0 auto;background:var(--line)}.picker.svelte-1tkogeh{position:fixed;inset:auto;margin:0;color:inherit;overflow:visible;width:15rem;padding:8px;border-radius:10px;box-shadow:var(--shadow-md);outline:none}.search.svelte-1tkogeh{width:100%;box-sizing:border-box;height:30px;padding:0 8px;margin-bottom:6px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg-strong);font:inherit;outline:none}.list.svelte-1tkogeh{max-height:16rem;overflow-y:auto}.heading.svelte-1tkogeh{margin:6px 4px 4px;font-size:11px;font-weight:600;color:var(--muted)}.item.svelte-1tkogeh{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--fg-strong);text-align:left;cursor:pointer}.item[data-hovered=true].svelte-1tkogeh{background:var(--bg)}.item.chosen.svelte-1tkogeh{color:var(--accent);background:var(--accent-subtle)}.name.svelte-1tkogeh{flex:1;font-size:14px}.badge.svelte-1tkogeh{padding:1px 6px;border-radius:8px;font-size:10px;color:var(--muted);background:var(--bg)}.none.svelte-1tkogeh{padding:8px;font-size:12px;color:var(--muted)}.seg.svelte-g5xv8s{display:flex;gap:4px}button.svelte-g5xv8s{flex:1;height:30px;border-radius:6px;font-size:12px;border:1px solid var(--line);background:var(--surface)}button.on.svelte-g5xv8s{color:var(--accent);background:var(--accent-subtle)}.choice.svelte-11pzfdq{display:flex;gap:4px}button.svelte-11pzfdq{flex:1;height:30px;display:grid;place-items:center;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}button.on.svelte-11pzfdq{color:var(--accent);background:var(--accent-subtle)}.icons.svelte-1v9fr7j{display:flex;gap:4px}button.svelte-1v9fr7j{flex:1;height:30px;display:grid;place-items:center;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}.arrowheads.svelte-6qktot{display:grid;gap:4px}.heads.svelte-6qktot{display:flex;gap:2px;padding:2px;background:var(--bg);border-radius:8px}.heads.svelte-6qktot button:where(.svelte-6qktot){flex:1 1 22px;min-width:22px;height:26px;border-radius:6px;background:transparent;color:var(--fg-strong);font-size:13px;line-height:1}.heads.svelte-6qktot button.on:where(.svelte-6qktot){background:var(--accent);color:#fff}.flip.svelte-6qktot{display:inline-block;transform:scaleX(-1)}.font-size.svelte-6qktot{display:grid;gap:4px}.font-size.svelte-6qktot input:where(.svelte-6qktot){height:28px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg-strong);font:inherit;font-size:12px}input[type=range].svelte-6qktot{width:100%;accent-color:var(--accent)}.mobile-strip-row.svelte-ig664m{display:flex;align-items:center;justify-content:safe center;gap:6px;max-width:100%;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow-x:auto;scrollbar-width:none}.slot.svelte-ig664m{display:flex;flex:0 0 auto}.tool.svelte-ig664m{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:var(--ink)}.tool.on.svelte-ig664m{color:var(--accent);background:var(--accent-subtle)}.gap.svelte-ig664m{width:1px;height:20px;background:var(--line);flex:0 0 auto}.sheet.svelte-ig664m{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translate(-50%);width:min(20rem,calc(100vw - 1.5rem));max-height:min(55vh,24rem);overflow-y:auto;padding:12px;border-radius:12px;z-index:40}.sheet.svelte-ig664m .row:last-child{margin-bottom:0}.sheet-action.svelte-ig664m{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font-size:12px}.panel.svelte-12qp9hc{position:absolute;top:var(--chrome-panel-top, 66px);left:14px;width:fit-content;padding:8px;border-radius:12px;max-height:calc(100% - 120px);overflow-y:auto;z-index:15;box-shadow:var(--shadow-md)}.column.svelte-12qp9hc{display:flex;flex-direction:column;align-items:center;gap:8px}.item.svelte-12qp9hc{display:flex;justify-content:center;align-items:center;min-height:32px}.tool.svelte-12qp9hc{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:var(--ink)}.tool.svelte-12qp9hc:hover{background:var(--bg-hover)}.tool.on.svelte-12qp9hc{color:var(--accent);background:var(--accent-subtle)}.popover.svelte-12qp9hc{position:fixed;inset:auto;margin:0;color:inherit;overflow:visible;width:13rem;max-width:calc(100vw - 90px);max-height:calc(100dvh - 120px);overflow-y:auto;padding:12px;border-radius:10px;box-shadow:var(--shadow-md);outline:none;z-index:40}.panel.svelte-ooemhm{position:absolute;top:var(--chrome-panel-top, 66px);left:14px;width:216px;padding:14px;border-radius:12px;max-height:calc(100% - 120px);overflow-y:auto;z-index:15;box-shadow:var(--shadow-md);transition:opacity .15s ease}.title.svelte-ooemhm{font-size:12px;font-weight:700;margin-bottom:14px;color:var(--fg-strong)}input[type=range].svelte-ooemhm{width:100%;accent-color:var(--accent)}.arrowheads.svelte-ooemhm,.font-size.svelte-ooemhm{display:grid;gap:4px}.font-size.svelte-ooemhm input:where(.svelte-ooemhm){height:28px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg-strong);font:inherit;font-size:12px}.heads.svelte-ooemhm{display:flex;flex-wrap:wrap;gap:2px;padding:2px;background:var(--bg);border-radius:8px}.heads.svelte-ooemhm button:where(.svelte-ooemhm){flex:1 1 22px;min-width:22px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--fg-strong);font-size:13px;line-height:1;cursor:pointer}.heads.svelte-ooemhm button:where(.svelte-ooemhm):hover{background:var(--surface)}.heads.svelte-ooemhm button.on:where(.svelte-ooemhm){background:var(--accent);color:#fff}.polygon-toggle.svelte-ooemhm{width:30px;height:30px;display:grid;place-items:center;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}.polygon-toggle.on.svelte-ooemhm{color:var(--accent);background:var(--accent-subtle)}.flip.svelte-ooemhm{display:inline-block;transform:scaleX(-1)}.preset-row.svelte-ooemhm{display:flex;flex-wrap:wrap;gap:4px}.preset-chip.svelte-ooemhm{display:flex;align-items:center;height:26px;padding:0 8px;border-radius:13px;border:1px solid var(--line);background:var(--surface);color:var(--fg-strong);font-size:11px;font-family:inherit;cursor:pointer;max-width:120px}.preset-chip.svelte-ooemhm:hover{background:var(--bg)}.preset-chip.svelte-ooemhm>button:where(.svelte-ooemhm){background:none;border:none;color:inherit;font:inherit;padding:0;cursor:pointer;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;max-width:70px}.preset-chip--user.svelte-ooemhm{padding-inline-end:2px;gap:2px}.preset-chip__action.svelte-ooemhm{color:var(--muted);font-size:10px;line-height:1;padding:2px 3px;border-radius:8px}.preset-chip__action.svelte-ooemhm:hover{background:var(--bg);color:var(--fg-strong)}.preset-chip--add.svelte-ooemhm{font-weight:700;color:var(--accent);justify-content:center;width:26px;padding:0}.preset-rename.svelte-ooemhm{height:26px;width:90px;padding:0 6px;border-radius:13px;border:1px solid var(--accent);font-size:11px;font-family:inherit;color:var(--ink);background:var(--surface)}.bar.svelte-1bq2jl{position:absolute;bottom:14px;left:14px;display:flex;align-items:center;gap:3px;padding:4px 6px;border-radius:var(--radius);z-index:20;box-shadow:var(--shadow-sm);backdrop-filter:blur(8px)}.zoom-actions.svelte-1bq2jl{display:contents}button.svelte-1bq2jl{height:30px;min-width:30px;display:grid;place-items:center;padding:0 4px;border-radius:6px;font-size:12px;font-weight:600;color:var(--ink);transition:background var(--transition),transform .1s ease}button.svelte-1bq2jl:hover{background:var(--bg-hover)}button.svelte-1bq2jl:active{transform:scale(.94)}.pct.svelte-1bq2jl{min-width:44px;color:var(--fg-strong);font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px}.rule.svelte-1bq2jl{width:1px;height:18px;margin:0 3px;background:var(--line)}.back.svelte-1bq2jl{display:flex;gap:4px;padding:0 8px;color:var(--accent);font-weight:700}textarea.svelte-fots5z{position:absolute;display:inline-block;min-height:1em;backface-visibility:hidden;margin:0;padding:0;border:0;outline:0;resize:none;background:transparent;overflow:hidden;z-index:12;word-break:normal;white-space:pre;overflow-wrap:break-word;box-sizing:content-box}textarea.wrap.svelte-fots5z{white-space:pre-wrap;word-break:break-word}textarea.boxed.svelte-fots5z{outline-style:dashed;outline-color:color-mix(in srgb,var(--accent) 50%,transparent)}input.svelte-vnuno9{position:absolute;margin:0;padding:0 2px;border:0;outline:2px solid var(--accent);background:var(--surface);border-radius:2px;font-family:inherit;line-height:1;z-index:12}@font-face{font-family:Virgil;src:url(/fonts/Virgil/Virgil-Regular.woff2) format(\"woff2\");font-display:swap}@font-face{font-family:Excalifont;src:url(/fonts/Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2) format(\"woff2\");font-display:swap;unicode-range:U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113}@font-face{font-family:Excalifont;src:url(/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2) format(\"woff2\");font-display:swap;unicode-range:U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212}@font-face{font-family:Cascadia;src:url(/fonts/Cascadia/CascadiaCode-Regular.woff2) format(\"woff2\");font-display:swap}@font-face{font-family:Nunito;src:url(/fonts/Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2) format(\"woff2\");font-weight:500;font-display:swap;unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:Nunito;src:url(/fonts/Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2) format(\"woff2\");font-weight:500;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:Lilita One;src:url(/fonts/Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYE98RXi4EwSsbg.woff2) format(\"woff2\");font-display:swap;unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:Lilita One;src:url(/fonts/Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYEF8RXi4EwQ.woff2) format(\"woff2\");font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:Comic Shanns;src:url(/fonts/ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2) format(\"woff2\");font-display:swap;unicode-range:U+20-7e,U+a1-a6,U+a8,U+ab-ac,U+af-b1,U+b4,U+b8,U+bb-bc,U+bf-cf,U+d1-d7,U+d9-de,U+e0-ef,U+f1-f7,U+f9-ff,U+131,U+152-153,U+2c6,U+2da,U+2dc,U+2013-2014,U+2018-201a,U+201c-201d,U+2020-2022,U+2026,U+2039-203a,U+2044,U+20ac,U+2191,U+2193,U+2212}@font-face{font-family:Comic Shanns;src:url(/fonts/ComicShanns/ComicShanns-Regular-fcb0fc02dcbee4c9846b3e2508668039.woff2) format(\"woff2\");font-display:swap;unicode-range:U+100-10f,U+112-125,U+128-130,U+134-137,U+139-13c,U+141-148,U+14c-151,U+154-161,U+164-165,U+168-17f,U+1bf,U+1f7,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+a75b}.modal-backdrop.svelte-gyoty4{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(4px)}.modal-card.svelte-gyoty4{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:24px;width:480px;max-width:92vw;box-shadow:var(--shadow-lg)}.modal-card.svelte-gyoty4:focus{outline:none}.modal-header.svelte-gyoty4{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.modal-header.svelte-gyoty4 h3:where(.svelte-gyoty4){margin:0;font-size:18px;font-weight:700;color:var(--fg-strong)}.close-btn.svelte-gyoty4{border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--muted);padding:6px 10px;border-radius:6px;transition:background var(--transition)}.close-btn.svelte-gyoty4:hover{background:var(--bg-hover)}.options-section.svelte-gyoty4{background:var(--bg);border-radius:10px;padding:14px;margin-bottom:20px;display:flex;flex-direction:column;gap:12px}.option-row.svelte-gyoty4{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:500}.scale-chips.svelte-gyoty4{display:flex;gap:6px}.scale-chip.svelte-gyoty4{padding:4px 12px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;transition:all var(--transition)}.scale-chip.active.svelte-gyoty4{background:var(--accent);color:#fff;border-color:var(--accent)}.actions-grid.svelte-gyoty4{display:grid;grid-template-columns:1fr;gap:10px}.action-card.svelte-gyoty4{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--surface);cursor:pointer;text-align:left;transition:all var(--transition)}.action-card.svelte-gyoty4:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow-sm);background:var(--bg)}.card-icon.svelte-gyoty4{width:44px;height:44px;border-radius:10px;background:var(--accent-subtle);color:var(--accent);display:grid;place-items:center;font-size:12px;font-weight:800;flex-shrink:0}.card-icon.svg-badge.svelte-gyoty4{background:#2f9e4424;color:#2f9e44}.card-icon.json-badge.svelte-gyoty4{background:#f08c0024;color:#f08c00}.card-text.svelte-gyoty4{display:flex;flex-direction:column}.card-text.svelte-gyoty4 strong:where(.svelte-gyoty4){font-size:14px;color:var(--fg-strong)}.card-text.svelte-gyoty4 span:where(.svelte-gyoty4){font-size:12px;color:var(--muted);margin-top:2px}.action-card.primary.svelte-gyoty4{border-color:var(--accent)}.modal-backdrop.svelte-1fz0pjh{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(3px)}.modal-card.svelte-1fz0pjh{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:24px;width:960px;max-width:94vw;box-shadow:var(--shadow-lg)}.modal-header.svelte-1fz0pjh{display:flex;justify-content:space-between;align-items:center}.modal-header.svelte-1fz0pjh h3:where(.svelte-1fz0pjh){margin:0;font-size:18px;font-weight:700}.close-btn.svelte-1fz0pjh{border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:6px}.description.svelte-1fz0pjh{margin:8px 0 16px;font-size:13px;color:var(--muted)}.panels.svelte-1fz0pjh{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.panel.svelte-1fz0pjh{display:flex;flex-direction:column;gap:6px;min-width:0}.panel-title.svelte-1fz0pjh{font-size:12px;font-weight:600;color:var(--muted)}textarea.svelte-1fz0pjh,.preview.svelte-1fz0pjh{height:360px;box-sizing:border-box;border-radius:8px;border:1px solid var(--line);background:var(--bg)}textarea.svelte-1fz0pjh{width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;padding:10px 12px;color:var(--ink);resize:none}.preview.svelte-1fz0pjh{position:relative;overflow:hidden}.preview.svelte-1fz0pjh canvas{pointer-events:none}.preview.failed.svelte-1fz0pjh canvas{opacity:.25}.error.svelte-1fz0pjh{position:absolute;inset:auto 0 0;margin:0;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;color:var(--danger);background:var(--surface);border-top:1px solid var(--line);max-height:50%;overflow:auto}.actions.svelte-1fz0pjh{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:16px}.hint.svelte-1fz0pjh{font-size:12px;color:var(--muted)}.btn-primary.svelte-1fz0pjh{padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}.btn-primary.svelte-1fz0pjh:disabled{opacity:.5;cursor:default}.modal-backdrop.svelte-7r1god{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(3px)}.modal-card.svelte-7r1god{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:24px;width:480px;max-width:92vw;box-shadow:var(--shadow-lg)}.modal-card.svelte-7r1god:focus{outline:none}.modal-header.svelte-7r1god{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.modal-header.svelte-7r1god h3:where(.svelte-7r1god){margin:0;font-size:18px;font-weight:700}.close-btn.svelte-7r1god{border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:6px}.hint.svelte-7r1god{margin:0 0 14px;font-size:12px;color:var(--muted)}.template-list.svelte-7r1god{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;max-height:60vh;overflow-y:auto}.template-row.svelte-7r1god{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);text-align:left;cursor:pointer}.template-row.svelte-7r1god:hover:not(:disabled),.template-row.svelte-7r1god:focus-visible{border-color:var(--accent);outline:none}.template-row.svelte-7r1god:disabled{cursor:default;opacity:.6}.template-preview.svelte-7r1god{flex:0 0 auto;display:block;width:96px;aspect-ratio:8 / 5;border-radius:8px;background:#fff;border:1px solid var(--line);overflow:hidden}.template-preview.svelte-7r1god img:where(.svelte-7r1god){width:100%;height:100%;object-fit:cover;display:block}.template-text.svelte-7r1god{flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0}.template-name.svelte-7r1god{font-size:13px;font-weight:600}.template-description.svelte-7r1god{font-size:12px;color:var(--muted);text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.template-status.svelte-7r1god{flex:0 0 auto;font-size:12px;color:var(--muted)}.error-msg.svelte-7r1god{color:var(--danger);font-size:12px;margin:10px 0 0}.actions.svelte-7r1god{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.btn-cancel.svelte-7r1god{padding:8px 16px;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;font-size:13px;cursor:pointer}.modal-backdrop.svelte-slw6up{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(4px)}.modal-card.svelte-slw6up{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;padding:24px;width:460px;max-width:90vw;box-shadow:var(--shadow-lg)}.modal-card.svelte-slw6up:focus{outline:none}.modal-header.svelte-slw6up{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.title-with-status.svelte-slw6up{display:flex;align-items:center;gap:10px}.modal-header.svelte-slw6up h3:where(.svelte-slw6up){margin:0;font-size:18px;font-weight:700;color:var(--fg-strong)}.live-pill.svelte-slw6up{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#2f9e44;background:#2f9e441f;padding:2px 8px;border-radius:999px}.live-pill--connecting.svelte-slw6up{color:#f08c00;background:#f08c001f}.live-pill--connecting.svelte-slw6up .pulse-dot:where(.svelte-slw6up){background:#f08c00}.live-pill--offline.svelte-slw6up{color:var(--muted);background:#8080801f}.live-pill--offline.svelte-slw6up .pulse-dot:where(.svelte-slw6up){background:var(--muted);animation:none}.pulse-dot.svelte-slw6up{width:6px;height:6px;border-radius:50%;background:#2f9e44;animation:svelte-slw6up-pulse 1.2s infinite alternate}@keyframes svelte-slw6up-pulse{0%{opacity:.4}to{opacity:1}}.close-btn.svelte-slw6up{border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--muted);padding:6px 10px;border-radius:6px;transition:background var(--transition)}.close-btn.svelte-slw6up:hover{background:var(--bg-hover)}.link-row.svelte-slw6up{margin-bottom:14px}.link-label.svelte-slw6up{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}.link-title.svelte-slw6up{font-size:13px;font-weight:600;color:var(--fg-strong)}.link-hint.svelte-slw6up{font-size:12px;color:var(--muted)}.copy-failed.svelte-slw6up{margin:6px 0 0;font-size:12px;color:#e03131}.link-box.svelte-slw6up{display:flex;gap:8px}.link-box.svelte-slw6up input:where(.svelte-slw6up){flex:1;padding:8px 12px;border-radius:var(--radius);border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:13px}.copy-btn.svelte-slw6up{padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap;transition:all var(--transition)}.copy-btn.svelte-slw6up:hover{filter:brightness(1.08)}.peers-header.svelte-slw6up{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.peers-section.svelte-slw6up h4:where(.svelte-slw6up){margin:0;font-size:13px;font-weight:600;color:var(--muted)}.count-badge.svelte-slw6up{font-size:11px;color:var(--muted)}.peers-list.svelte-slw6up{display:flex;flex-direction:column;gap:8px;max-height:150px;overflow-y:auto;padding:2px}.peer-item.svelte-slw6up{display:flex;align-items:center;gap:10px;font-size:13px;padding:4px 6px;border-radius:8px}.avatar.svelte-slw6up{width:26px;height:26px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;flex-shrink:0}.name.svelte-slw6up{color:var(--ink);font-weight:500}.lead.svelte-slw6up{font-size:13px;color:var(--ink);margin:0 0 14px;line-height:1.45}.link-row--primary.svelte-slw6up .link-box:where(.svelte-slw6up) input:where(.svelte-slw6up){font-size:14px;font-weight:600}.qr-btn.svelte-slw6up{padding:8px 10px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);font-weight:600;font-size:12px;cursor:pointer}.qr-btn[aria-pressed=true].svelte-slw6up{border-color:var(--accent);color:var(--accent)}.qr.svelte-slw6up{margin-top:10px;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted)}.qr.svelte-slw6up img:where(.svelte-slw6up){width:148px;height:148px;background:#fff;border-radius:8px;padding:6px;image-rendering:pixelated}details.more.svelte-slw6up,details.help.svelte-slw6up{margin:0 0 14px;font-size:13px}details.svelte-slw6up summary:where(.svelte-slw6up){cursor:pointer;color:var(--muted);font-weight:600;margin-bottom:8px}details.help.svelte-slw6up ol:where(.svelte-slw6up){margin:0 0 8px;padding-left:18px;color:var(--ink);line-height:1.5}details.help.svelte-slw6up p:where(.svelte-slw6up){margin:0;color:var(--muted);line-height:1.45}.internet.svelte-slw6up{border-top:1px solid var(--line);padding-top:12px;margin:4px 0 14px;font-size:13px;color:var(--ink)}.internet.svelte-slw6up p:where(.svelte-slw6up){margin:0 0 8px;line-height:1.45}.internet-btn.svelte-slw6up{padding:8px 14px;background:var(--bg);color:var(--accent);border:1px solid var(--accent);border-radius:var(--radius);font-weight:600;font-size:13px;cursor:pointer}.internet-btn.svelte-slw6up:disabled{opacity:.6;cursor:progress}.text-btn.svelte-slw6up{border:none;background:none;padding:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline}.tunnel-error.svelte-slw6up{color:#e03131}.modal-backdrop.svelte-ol660w{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(3px)}.modal-card.svelte-ol660w{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:24px;width:620px;max-width:92vw;box-shadow:var(--shadow-lg);max-height:calc(100dvh - 2rem);display:flex;flex-direction:column}.modal-card.svelte-ol660w:focus{outline:none}.modal-header.svelte-ol660w{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.modal-header.svelte-ol660w h3:where(.svelte-ol660w){margin:0;font-size:18px;font-weight:700}.close-btn.svelte-ol660w{border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:6px}.shortcuts-grid.svelte-ol660w{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;overflow-y:auto;min-height:0}.shortcut-section.svelte-ol660w h4:where(.svelte-ol660w){margin:0 0 8px;font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px}ul.svelte-ol660w{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}li.svelte-ol660w{display:flex;justify-content:space-between;align-items:center;font-size:12px}.desc.svelte-ol660w{color:var(--ink)}kbd.svelte-ol660w{padding:2px 6px;border-radius:4px;background:var(--bg);border:1px solid var(--line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--fg-strong);box-shadow:0 1px 2px #0000000d}.modal-backdrop.svelte-39sje9{position:fixed;inset:0;background:#00000073;display:grid;place-items:start center;padding-top:12vh;z-index:100;backdrop-filter:blur(3px)}.palette-card.svelte-39sje9{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;width:560px;max-width:92vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden}.palette-input.svelte-39sje9{border:none;border-bottom:1px solid var(--line);padding:.875rem 1rem;font-size:.9375rem;font-family:inherit;color:var(--ink);background:transparent;outline:none}.palette-list.svelte-39sje9{overflow-y:auto;padding:.375rem}.palette-group-label.svelte-39sje9{padding:.5rem .625rem .25rem;font-size:.6875rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px}.palette-item.svelte-39sje9{display:flex;align-items:center;column-gap:.625rem;width:100%;box-sizing:border-box;padding:0 .625rem;height:2rem;font-size:.875rem;font-family:inherit;color:var(--fg-strong);background:transparent;border:none;border-radius:6px;cursor:pointer;text-align:left}.palette-item.active.svelte-39sje9{background:var(--bg)}.palette-item__label.svelte-39sje9{flex:1 1 auto;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.palette-item__shortcut.svelte-39sje9{margin-inline-start:auto;opacity:.5;font-size:.75rem;white-space:nowrap;font-family:inherit}.palette-empty.svelte-39sje9{padding:.75rem;font-size:.8125rem;color:var(--muted);text-align:center}.extremity.svelte-aybbfz{padding:6px 8px}.cap.svelte-aybbfz{padding:0 4px 4px;font-size:11px;font-weight:600;color:var(--muted)}.kinds.svelte-aybbfz{display:flex;flex-wrap:wrap;gap:4px}.kinds.svelte-aybbfz button:where(.svelte-aybbfz){width:32px;height:32px;border:1px solid var(--line);border-radius:6px;font-size:14px}.kinds.svelte-aybbfz button.on:where(.svelte-aybbfz){border-color:var(--accent);color:var(--accent);background:var(--accent-subtle)}.away.svelte-nl0nhh{position:absolute;inset:0;z-index:4;cursor:default;background:transparent;border-radius:0}.menu.svelte-nl0nhh{position:absolute;z-index:5;width:14rem;border-radius:8px;padding:4px 0}.menu.svelte-nl0nhh>button:where(.svelte-nl0nhh){display:flex;height:32px;width:100%;align-items:center;justify-content:space-between;gap:1.5rem;padding:0 12px;font-size:13px;text-align:left;border-radius:0}.menu.svelte-nl0nhh>button:where(.svelte-nl0nhh):hover{background:var(--bg-hover)}.danger.svelte-nl0nhh{color:var(--danger)}.hint.svelte-nl0nhh{font-size:11px;color:var(--muted)}.rule.svelte-nl0nhh{height:1px;margin:4px 0;background:var(--line)}.modal-backdrop.svelte-1hklhmy{position:fixed;inset:0;background:#00000073;display:grid;place-items:center;z-index:100;backdrop-filter:blur(3px)}.modal-card.svelte-1hklhmy{background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:.75rem;padding:1.25rem;width:min(30rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);overflow:auto;box-sizing:border-box;box-shadow:0 16px 48px #0000003d}.modal-card.svelte-1hklhmy:focus{outline:none}.modal-header.svelte-1hklhmy{display:flex;align-items:center;justify-content:space-between;margin-bottom:.875rem}h3.svelte-1hklhmy{margin:0;font-size:1rem}.close-btn.svelte-1hklhmy{border:none;background:none;cursor:pointer;font-size:.875rem;color:var(--muted)}.preview.svelte-1hklhmy{position:relative;display:grid;place-items:center;height:13rem;border:1px solid var(--line);border-radius:.5rem;background:var(--bg);overflow:hidden}.preview.svelte-1hklhmy img:where(.svelte-1hklhmy){max-width:100%;max-height:100%;object-fit:contain}.working.svelte-1hklhmy{position:absolute;inset:auto .75rem .75rem;display:flex;align-items:center;gap:.5rem}progress.svelte-1hklhmy{flex:1;accent-color:var(--accent)}.stats.svelte-1hklhmy,.warning.svelte-1hklhmy,.error.svelte-1hklhmy{margin:.5rem 0 0;font-size:.75rem;line-height:1.5}.stats.svelte-1hklhmy{color:var(--muted);font-variant-numeric:tabular-nums}.warning.svelte-1hklhmy{color:var(--text)}.error.svelte-1hklhmy{color:var(--danger, #e03131)}.controls.svelte-1hklhmy{display:flex;flex-direction:column;gap:.625rem;margin-top:.875rem;font-size:.8125rem}.slider.svelte-1hklhmy{display:grid;grid-template-columns:5.5rem auto 1fr auto;align-items:center;gap:.5rem}.slider.off.svelte-1hklhmy{opacity:.5}.slider.svelte-1hklhmy input:where(.svelte-1hklhmy){width:100%;accent-color:var(--accent)}.end.svelte-1hklhmy{font-size:.6875rem;color:var(--muted)}fieldset.svelte-1hklhmy{display:flex;gap:1rem;margin:0;padding:0;border:none}legend.svelte-1hklhmy{float:left;width:5.5rem;padding:0}fieldset.svelte-1hklhmy label:where(.svelte-1hklhmy),.check.svelte-1hklhmy{display:flex;align-items:center;gap:.375rem}.actions.svelte-1hklhmy{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}.actions.svelte-1hklhmy button:where(.svelte-1hklhmy),.small.svelte-1hklhmy{padding:.4375rem .875rem;border-radius:.5rem;border:1px solid var(--line);background:var(--surface);color:var(--text);font-size:.8125rem;cursor:pointer}.small.svelte-1hklhmy{padding:.25rem .625rem;font-size:.75rem}.btn-primary.svelte-1hklhmy{background:var(--accent);border-color:var(--accent);color:#fff}.btn-primary.svelte-1hklhmy:disabled,.small.svelte-1hklhmy:disabled{opacity:.5;cursor:not-allowed}.peer-cursors-layer.svelte-5ka6m{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10}.cursor-wrapper.svelte-5ka6m{position:absolute;top:0;left:0;display:flex;align-items:flex-start;transition:transform .08s ease-out;will-change:transform}.cursor-icon.svelte-5ka6m{filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))}.cursor-tag.svelte-5ka6m{margin-left:6px;margin-top:10px;padding:2px 8px;border-radius:6px;color:#fff;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 4px #0003}.draw-chrome{position:relative;width:100%;height:100%;overflow:hidden;user-select:none}.draw-chrome button{font:inherit;cursor:pointer;border:none;background:transparent;padding:0;border-radius:var(--radius);color:inherit;transition:background var(--transition),transform var(--transition),color var(--transition)}.draw-chrome button:hover:not(:disabled){border-color:transparent}.draw-chrome button:disabled{opacity:.45;cursor:not-allowed}.draw-panel{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);border-radius:var(--radius);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:background var(--transition),border-color var(--transition),box-shadow var(--transition)}:root.dark .draw-panel,.hydrawn-board.dark .draw-panel{background:#232329e0;border-color:#ffffff14;box-shadow:0 8px 32px #00000073}:root:not(.dark) .draw-panel,.hydrawn-board:not(.dark) .draw-panel{background:#ffffffeb;border-color:#00000014;box-shadow:0 4px 20px #00000014}.draw-chrome button.exit-zen-mode{position:absolute;bottom:14px;right:14px;z-index:20;padding:6px 10px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:11px;font-weight:600;box-shadow:var(--shadow-sm);backdrop-filter:blur(8px);transition:background var(--transition),color var(--transition)}.draw-chrome button.exit-zen-mode:hover{background:var(--bg-hover);color:var(--ink);border-color:var(--line)}.draw-chrome.toolbar-row{--chrome-toolbar-top: 66px;--chrome-panel-top: 122px}.draw-chrome.phone .mobile-dock{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:6px;padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right));padding-bottom:calc(6px + env(safe-area-inset-bottom));z-index:20;pointer-events:none}.draw-chrome.phone .mobile-dock>*{pointer-events:auto}.draw-chrome.phone .draw-header{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));height:40px;gap:8px}.draw-chrome.phone .draw-header .board-title,.draw-chrome.phone .draw-header .title-input{max-width:26vw}.draw-chrome.phone .draw-header .save-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.draw-chrome.phone .draw-header .share-btn{padding:0 10px}.draw-chrome.phone .draw-header .share-btn span{display:none}.draw-chrome.phone .exit-zen-mode{bottom:calc(7.5rem + env(safe-area-inset-bottom));right:max(8px,env(safe-area-inset-right))}.draw-chrome.phone .image-notice{bottom:calc(9rem + env(safe-area-inset-bottom))}.draw-chrome.phone .modal-card{max-height:calc(100dvh - 2rem);overflow-y:auto}.draw-chrome.phone .palette-card{max-height:calc(88dvh - 2rem);overflow-y:auto}.draw-backdrop{position:fixed;inset:0;background:#0006;display:grid;place-items:center;z-index:100;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}@keyframes fadeIn{0%{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@keyframes popIn{0%{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.fade-in{animation:fadeIn .18s cubic-bezier(.16,1,.3,1) forwards}.pop-in{animation:popIn .18s cubic-bezier(.16,1,.3,1) forwards}.canvas-host{position:absolute;inset:0}.eraser-trail-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:visible}.present-dim{position:absolute;background:#0009;pointer-events:none;z-index:5}.path-badge{position:absolute;z-index:6;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;display:grid;place-items:center;transform:translate(6px,6px);border-radius:11px;background:var(--accent, #6965db);color:#fff;font:700 12px/1 system-ui,sans-serif;pointer-events:none}.present-blank{position:absolute;inset:0;z-index:95;background:#000}.present-blank.white{background:#fff}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.image-notice{position:absolute;left:50%;bottom:5rem;transform:translate(-50%);margin:0;padding:.5rem .875rem;max-width:min(32rem,calc(100% - 2rem));border-radius:.5rem;background:var(--surface);border:1px solid var(--line);box-shadow:0 4px 16px #0000001f;font-size:.8125rem;color:var(--text);pointer-events:none}.embed-frame{position:absolute;z-index:1;overflow:hidden;border-radius:.25rem;background:var(--surface);pointer-events:none}.embed-frame iframe{display:block;border:0;pointer-events:none}.embed-frame.active iframe{pointer-events:auto}.embed-frame.active{outline:calc(2px / var(--embed-scale, 1)) solid var(--accent)}.embed-hint{position:absolute;z-index:2;transform:translate(-50%,-50%);padding:.375rem .75rem;border-radius:999px;background:var(--surface);color:var(--text);font-size:.8125rem;box-shadow:0 1px 4px #0003;pointer-events:none;white-space:nowrap}.board.svelte-1dwk0uq{display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;background:var(--bg)}.surface.svelte-1dwk0uq{flex:1 1 auto;height:100%;width:100%;position:relative}.loading-state.svelte-1dwk0uq{display:grid;place-items:center;height:100%;color:var(--muted);font-size:14px}.loading-state.engine-failed.svelte-1dwk0uq{gap:.75rem;color:var(--ink)}\n", Vk = 1, Jk = 2, up = 4, Gk = 8, qk = 16, Yk = 1, Xk = 4, Qk = 8, $k = 16, eS = 1, tS = 2, Nt = /* @__PURE__ */ Symbol("uninitialized"), nS = "http://www.w3.org/1999/xhtml", rS = "@attach", dp = !1;
var ca = Array.isArray, oS = Array.prototype.indexOf, Bs = Array.prototype.includes, ua = Array.from, fp = Object.defineProperty, To = Object.getOwnPropertyDescriptor, hp = Object.getOwnPropertyDescriptors, iS = Object.prototype, sS = Array.prototype, Xc = Object.getPrototypeOf, Ef = Object.isExtensible;
const Mi = () => {
};
function aS(t) {
  for (var e = 0; e < t.length; e++)
    t[e]();
}
function gp() {
  var t, e, n = new Promise((r, o) => {
    t = r, e = o;
  });
  return { promise: n, resolve: t, reject: e };
}
function lS(t, e) {
  if (Array.isArray(t))
    return t;
  if (!(Symbol.iterator in t))
    return Array.from(t);
  const n = [];
  for (const r of t)
    if (n.push(r), n.length === e) break;
  return n;
}
const Jt = 2, Lo = 4, da = 8, Qc = 1 << 24, Nn = 16, Mn = 32, fr = 64, Zl = 128, $c = 256, zn = 512, Zt = 1024, Ut = 2048, jn = 4096, sn = 8192, un = 16384, Jo = 32768, Us = 1 << 25, so = 65536, js = 1 << 17, cS = 1 << 18, Go = 1 << 19, uS = 1 << 20, qn = 1 << 25, ao = 65536, Hs = 1 << 21, Co = 1 << 22, Mr = 1 << 23, ur = /* @__PURE__ */ Symbol("$state"), pp = /* @__PURE__ */ Symbol("component"), dS = /* @__PURE__ */ Symbol("legacy props"), fS = /* @__PURE__ */ Symbol(""), mp = /* @__PURE__ */ Symbol("attributes"), Kl = /* @__PURE__ */ Symbol("class"), Vl = /* @__PURE__ */ Symbol("style"), Jl = /* @__PURE__ */ Symbol("text"), xs = /* @__PURE__ */ Symbol("form reset"), Bi = new class extends Error {
  name = "StaleReactionError";
  message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), fa = (
  // We gotta write it like this because after downleveling the pure comment may end up in the wrong location
  !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml")
);
function hS() {
  console.warn("https://svelte.dev/e/derived_inert");
}
function gS() {
  console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function pS() {
  console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
function vp(t) {
  return t === this.v;
}
function _p(t, e) {
  return t != t ? e == e : t !== e || t !== null && typeof t == "object" || typeof t == "function";
}
function yp(t) {
  return !_p(t, this.v);
}
function eu(t) {
  throw new Error("https://svelte.dev/e/lifecycle_outside_component");
}
function mS() {
  throw new Error("https://svelte.dev/e/missing_context");
}
function vS() {
  throw new Error("https://svelte.dev/e/async_derived_orphan");
}
function _S(t, e, n) {
  throw new Error("https://svelte.dev/e/each_key_duplicate");
}
function yS(t) {
  throw new Error("https://svelte.dev/e/effect_in_teardown");
}
function bS() {
  throw new Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function wS(t) {
  throw new Error("https://svelte.dev/e/effect_orphan");
}
function kS() {
  throw new Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function SS(t) {
  throw new Error("https://svelte.dev/e/props_invalid_value");
}
function xS() {
  throw new Error("https://svelte.dev/e/state_descriptors_fixed");
}
function ES() {
  throw new Error("https://svelte.dev/e/state_prototype_fixed");
}
function TS() {
  throw new Error("https://svelte.dev/e/state_unsafe_mutation");
}
function CS() {
  throw new Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
let AS = !1;
function PS(t, e, n) {
  const r = {};
  return [
    () => (n(r) || mS(), t(r)),
    (o) => e(r, o),
    () => n(r)
  ];
}
function IS(t) {
  let e = t.p;
  for (; e !== null && e.c === null; )
    e = e.p;
  return e?.c ?? null;
}
function tu(t, e) {
  return t === null && eu(), t.c ??= new Map(IS(t) || void 0);
}
let jt = null;
function Do(t) {
  jt = t;
}
function zS() {
  return (
    /** @type {[() => T, (context: T) => T, () => boolean]} */
    PS(MS, OS, FS)
  );
}
function MS(t) {
  return (
    /** @type {T} */
    tu(jt).get(t)
  );
}
function OS(t, e) {
  return tu(jt).set(t, e), e;
}
function FS(t) {
  return tu(jt).has(t);
}
function ot(t, e = !1, n) {
  jt = {
    p: jt,
    i: !1,
    c: null,
    e: null,
    s: t,
    x: null,
    r: (
      /** @type {Effect} */
      rt
    ),
    l: null
  };
}
function it(t) {
  var e = (
    /** @type {ComponentContext} */
    jt
  ), n = e.e;
  if (n !== null) {
    e.e = null;
    for (var r of n)
      Bp(r);
  }
  return t !== void 0 && (e.x = t), e.i = !0, jt = e.p, nu(t);
}
function nu(t = {}) {
  return fp(t, pp, { value: !0 }), t;
}
function bp() {
  return !0;
}
let Yr = [];
function wp() {
  var t = Yr;
  Yr = [], aS(t);
}
function Pn(t) {
  if (Yr.length === 0 && !xi) {
    var e = Yr;
    queueMicrotask(() => {
      e === Yr && wp();
    });
  }
  Yr.push(t);
}
function RS() {
  for (; Yr.length > 0; )
    wp();
}
const LS = -7169;
function Mt(t, e) {
  t.f = t.f & LS | e;
}
function ru(t) {
  (t.f & zn) !== 0 || t.deps === null ? Mt(t, Zt) : Mt(t, jn);
}
function kp(t) {
  if (t !== null)
    for (const e of t)
      (e.f & Jt) === 0 || (e.f & ao) === 0 || (e.f ^= ao, kp(
        /** @type {Derived} */
        e.deps
      ));
}
function Sp(t, e, n) {
  (t.f & Ut) !== 0 ? e.add(t) : (t.f & jn) !== 0 && n.add(t), kp(t.deps), Mt(t, Zt);
}
let us = !1;
function DS(t) {
  var e = us;
  try {
    return us = !1, [t(), us];
  } finally {
    us = e;
  }
}
function ou(t, e) {
  if (e) {
    const n = document.body;
    t.autofocus = !0, Pn(() => {
      document.activeElement === n && t.focus();
    });
  }
}
let Tf = !1;
function NS() {
  Tf || (Tf = !0, document.addEventListener(
    "reset",
    (t) => {
      Promise.resolve().then(() => {
        if (!t.defaultPrevented)
          for (
            const e of
            /**@type {HTMLFormElement} */
            t.target.elements
          )
            e[xs]?.();
      });
    },
    // In the capture phase to guarantee we get noticed of it (no possibility of stopPropagation)
    { capture: !0 }
  ));
}
function qo(t) {
  var e = at, n = rt;
  On(null), Qn(null);
  try {
    return t();
  } finally {
    On(e), Qn(n);
  }
}
function iu(t, e, n, r = n) {
  t.addEventListener(e, () => qo(n));
  const o = (
    /** @type {any} */
    t[xs]
  );
  o ? t[xs] = () => {
    o(), r(!0);
  } : t[xs] = () => r(!0), NS();
}
function xp(t, e, n, r) {
  const o = Oi;
  var i = t.filter((p) => !p.settled), a = e.map(o);
  if (n.length === 0 && i.length === 0) {
    r(a);
    return;
  }
  var l = (
    /** @type {Effect} */
    rt
  ), c = BS(), d = i.length === 1 ? i[0].promise : i.length > 1 ? Promise.all(i.map((p) => p.promise)) : null;
  function u(p) {
    if ((l.f & un) === 0) {
      c();
      try {
        r([...a, ...p]);
      } catch (m) {
        Vn(m, l);
      }
      Ws();
    }
  }
  var f = Ep();
  if (n.length === 0) {
    d.then(() => u([])).finally(f);
    return;
  }
  function h() {
    Promise.all(n.map((p) => /* @__PURE__ */ US(p))).then(u).catch((p) => Vn(p, l)).finally(f);
  }
  d ? d.then(() => {
    c(), h(), Ws();
  }) : h();
}
function BS() {
  var t = (
    /** @type {Effect} */
    rt
  ), e = at, n = jt, r = (
    /** @type {Batch} */
    Xe
  );
  return function(i = !0) {
    Qn(t), On(e), Do(n), i && (t.f & un) === 0 && (r?.activate(), r?.apply());
  };
}
function Ws(t = !0) {
  Qn(null), On(null), Do(null), t && Xe?.deactivate();
}
function Ep() {
  var t = (
    /** @type {Effect} */
    rt
  ), e = t.b, n = (
    /** @type {Batch} */
    Xe
  ), r = !!e?.is_rendered();
  return e?.update_pending_count(1, n), n.increment(r, t), () => {
    e?.update_pending_count(-1, n), n.decrement(r, t);
  };
}
// @__NO_SIDE_EFFECTS__
function Oi(t) {
  var e = Jt | Ut;
  return rt !== null && (rt.f |= Go), {
    ctx: jt,
    deps: null,
    effects: null,
    equals: vp,
    f: e,
    fn: t,
    reactions: null,
    rv: 0,
    v: (
      /** @type {V} */
      Nt
    ),
    wv: 0,
    parent: rt,
    ac: null
  };
}
const ci = /* @__PURE__ */ Symbol("obsolete");
// @__NO_SIDE_EFFECTS__
function US(t, e, n) {
  let r = (
    /** @type {Effect | null} */
    rt
  );
  r === null && vS();
  var o = (
    /** @type {Promise<V>} */
    /** @type {unknown} */
    void 0
  ), i = lo(
    /** @type {V} */
    Nt
  ), a = !at, l = /* @__PURE__ */ new Set();
  return t3(() => {
    var c = (
      /** @type {Effect} */
      rt
    ), d = gp();
    o = d.promise;
    try {
      Promise.resolve(t()).then(d.resolve, (p) => {
        p !== Bi && d.reject(p);
      }).finally(Ws);
    } catch (p) {
      d.reject(p), Ws();
    }
    var u = (
      /** @type {Batch} */
      Xe
    );
    if (a) {
      if ((c.f & Jo) !== 0)
        var f = Ep();
      if (
        // boundary can be null if the async derived is inside an $effect.root not connected to the component render tree
        r.b?.is_rendered()
      )
        u.async_deriveds.get(c)?.reject(ci);
      else
        for (const p of l.values())
          p.reject(ci);
      l.add(d), u.async_deriveds.set(c, d);
    }
    const h = (p, m = void 0) => {
      f?.(), l.delete(d), m !== ci && (u.activate(), m ? (i.f |= Mr, No(i, m)) : ((i.f & Mr) !== 0 && (i.f ^= Mr), No(i, p)), u.deactivate());
    };
    d.promise.then(h, (p) => h(null, p || "unknown"));
  }), ha(() => {
    for (const c of l)
      c.reject(ci);
  }), new Promise((c) => {
    function d(u) {
      function f() {
        u === o ? c(i) : d(o);
      }
      u.then(f, f);
    }
    d(o);
  });
}
// @__NO_SIDE_EFFECTS__
function X(t) {
  const e = /* @__PURE__ */ Oi(t);
  return Kp(e), e;
}
// @__NO_SIDE_EFFECTS__
function Tp(t) {
  const e = /* @__PURE__ */ Oi(t);
  return e.equals = yp, e;
}
function jS(t) {
  var e = t.effects;
  if (e !== null) {
    t.effects = null;
    for (var n = 0; n < e.length; n += 1)
      qt(
        /** @type {Effect} */
        e[n]
      );
  }
}
function su(t) {
  var e, n = rt, r = t.parent;
  if (!hr && r !== null && t.v !== Nt && // if it was never evaluated before, it's guaranteed to fail downstream, so we try to execute instead
  (r.f & (un | sn)) !== 0)
    return hS(), t.v;
  Qn(r);
  try {
    t.f &= ~ao, jS(t), e = qp(t);
  } finally {
    Qn(n);
  }
  return e;
}
function Cp(t) {
  var e = su(t);
  if (!t.equals(e) && (t.wv = Jp(), (!Xe?.is_fork || t.deps === null) && (Xe !== null ? (Xe.capture(t, e, !0), Gl?.capture(t, e, !0)) : t.v = e, t.deps === null))) {
    Mt(t, Zt);
    return;
  }
  hr || (Bn !== null ? (uu() || Xe?.is_fork) && Bn.set(t, e) : ru(t));
}
function HS(t) {
  if (t.effects !== null)
    for (const e of t.effects)
      (e.teardown || e.ac) && (e.teardown?.(), e.ac !== null && qo(() => {
        e.ac.abort(Bi), e.ac = null;
      }), e.fn !== null && (e.teardown = Mi), Fi(e, 0), du(e));
}
function Ap(t) {
  if (t.effects !== null)
    for (const e of t.effects)
      e.teardown && e.fn !== null && Bo(e);
}
let nl = null, mo = null, Xe = null, Gl = null, Bn = null, ql = null, xi = !1, rl = !1, ko = null, Es = null;
var Cf = 0;
let WS = 1;
class Nr {
  id = WS++;
  /** True as soon as `#process` was called */
  #t = !1;
  linked = !0;
  /** @type {Batch | null} */
  #s = null;
  /** @type {Batch | null} */
  #e = null;
  /** @type {Map<Effect, ReturnType<typeof deferred<any>>>} */
  async_deriveds = /* @__PURE__ */ new Map();
  /**
   * The current values of any signals that are updated in this batch.
   * Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
   * They keys of this map are identical to `this.#previous`
   * @type {Map<Value, [any, boolean]>}
   */
  current = /* @__PURE__ */ new Map();
  /**
   * The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
   * They keys of this map are identical to `this.#current`
   * @type {Map<Value, any>}
   */
  previous = /* @__PURE__ */ new Map();
  /**
   * When the batch is committed (and the DOM is updated), we need to remove old branches
   * and append new ones by calling the functions added inside (if/each/key/etc) blocks
   * @type {Set<(batch: Batch) => void>}
   */
  #l = /* @__PURE__ */ new Set();
  /**
   * If a fork is discarded, we need to destroy any effects that are no longer needed
   * @type {Set<(batch: Batch) => void>}
   */
  #r = /* @__PURE__ */ new Set();
  /**
   * The number of async effects that are currently in flight
   */
  #i = 0;
  /**
   * Async effects that are currently in flight, _not_ inside a pending boundary
   * @type {Map<Effect, number>}
   */
  #n = /* @__PURE__ */ new Map();
  /**
   * A deferred that resolves when the batch is committed, used with `settled()`
   * TODO replace with Promise.withResolvers once supported widely enough
   * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
   */
  #a = null;
  /**
   * The root effects that need to be flushed
   * @type {Effect[]}
   */
  #o = [];
  /**
   * Effects created while this batch was active.
   * @type {Effect[]}
   */
  #p = [];
  /**
   * Deferred effects (which run after async work has completed) that are DIRTY
   * @type {Set<Effect>}
   */
  #c = /* @__PURE__ */ new Set();
  /**
   * Deferred effects that are MAYBE_DIRTY
   * @type {Set<Effect>}
   */
  #u = /* @__PURE__ */ new Set();
  /**
   * A map of branches that still exist, but will be destroyed when this batch
   * is committed — we skip over these during `process`.
   * The value contains child effects that were dirty/maybe_dirty before being reset,
   * so they can be rescheduled if the branch survives.
   * @type {Map<Effect, { d: Effect[], m: Effect[] }>}
   */
  #f = /* @__PURE__ */ new Map();
  /**
   * Inverse of #skipped_branches which we need to tell prior batches to unskip them when committing
   * @type {Set<Effect>}
   */
  #m = /* @__PURE__ */ new Set();
  is_fork = !1;
  #d = !1;
  constructor() {
    mo === null ? nl = mo = this : (mo.#e = this, this.#s = mo), mo = this;
  }
  #y() {
    if (this.is_fork) return !0;
    for (const r of this.#n.keys()) {
      for (var e = r, n = !1; e.parent !== null; ) {
        if (this.#f.has(e)) {
          n = !0;
          break;
        }
        e = e.parent;
      }
      if (!n)
        return !0;
    }
    return !1;
  }
  /**
   * Add an effect to the #skipped_branches map and reset its children
   * @param {Effect} effect
   */
  skip_effect(e) {
    this.#f.has(e) || this.#f.set(e, { d: [], m: [] }), this.#m.delete(e);
  }
  /**
   * Remove an effect from the #skipped_branches map and reschedule
   * any tracked dirty/maybe_dirty child effects
   * @param {Effect} effect
   * @param {(e: Effect) => void} callback
   */
  unskip_effect(e, n = (r) => this.schedule(r)) {
    var r = this.#f.get(e);
    if (r) {
      this.#f.delete(e);
      for (var o of r.d)
        Mt(o, Ut), n(o);
      for (o of r.m)
        Mt(o, jn), n(o);
    }
    this.#m.add(e);
  }
  #v() {
    this.#t = !0, Cf++ > 1e3 && (this.#g(), KS());
    for (const c of this.#c)
      this.#u.delete(c), Mt(c, Ut), this.schedule(c);
    for (const c of this.#u)
      Mt(c, jn), this.schedule(c);
    const e = this.#o;
    this.#o = [], this.apply();
    var n = ko = [], r = [], o = Es = [];
    for (const c of e)
      try {
        this.#w(c, n, r);
      } catch (d) {
        throw zp(c), this.#y() || this.discard(), d;
      }
    if (Xe = null, o.length > 0) {
      var i = Nr.ensure();
      for (const c of o)
        i.schedule(c);
    }
    if (ko = null, Es = null, this.#y()) {
      this.#h(r), this.#h(n);
      for (const [c, d] of this.#f)
        Ip(c, d);
      o.length > 0 && /** @type {unknown} */
      Xe.#v();
      return;
    }
    const a = this.#b();
    if (a) {
      this.#h(r), this.#h(n), a.#k(this);
      return;
    }
    this.#c.clear(), this.#u.clear();
    for (const c of this.#l) c(this);
    this.#l.clear(), Gl = this, Af(r), Af(n), Gl = null, this.#a?.resolve();
    var l = (
      /** @type {Batch | null} */
      /** @type {unknown} */
      Xe
    );
    if (this.#i === 0 && (this.#o.length === 0 || l !== null) && this.#g(), this.#o.length > 0)
      if (l !== null) {
        const c = l;
        c.#o.push(...this.#o.filter((d) => !c.#o.includes(d)));
      } else
        l = this;
    l !== null && (Yn.clear(), l.#v());
  }
  /**
   * Traverse the effect tree, executing effects or stashing
   * them for later execution as appropriate
   * @param {Effect} root
   * @param {Effect[]} effects
   * @param {Effect[]} render_effects
   */
  #w(e, n, r) {
    e.f ^= Zt;
    for (var o = e.first; o !== null; ) {
      var i = o.f, a = (i & (Mn | fr)) !== 0, l = a && (i & Zt) !== 0, c = l || (i & sn) !== 0 || this.#f.has(o);
      if (!c && o.fn !== null) {
        a ? o.f ^= Zt : (i & Lo) !== 0 ? n.push(o) : Hi(o) && ((i & Nn) !== 0 && this.#u.add(o), Bo(o));
        var d = o.first;
        if (d !== null) {
          o = d;
          continue;
        }
      }
      for (; o !== null; ) {
        var u = o.next;
        if (u !== null) {
          o = u;
          break;
        }
        o = o.parent;
      }
    }
  }
  #b() {
    for (var e = this.#s; e !== null; ) {
      if (!e.is_fork) {
        for (const [n, [, r]] of this.current)
          if (e.current.has(n) && !r)
            return e;
      }
      e = e.#s;
    }
    return null;
  }
  /**
   * @param {Batch} batch
   */
  #k(e) {
    for (const [r, o] of e.current)
      !this.previous.has(r) && e.previous.has(r) && this.previous.set(r, e.previous.get(r)), this.current.set(r, o);
    for (const [r, o] of e.async_deriveds) {
      const i = this.async_deriveds.get(r);
      i && o.promise.then(i.resolve).catch(i.reject);
    }
    e.async_deriveds.clear(), this.transfer_effects(e.#c, e.#u);
    const n = (r) => {
      var o = r.reactions;
      if (o !== null && !((r.f & Jt) !== 0 && (r.f & (Ut | jn)) === 0))
        for (const l of o) {
          var i = l.f;
          if ((i & Jt) !== 0)
            n(
              /** @type {Derived} */
              l
            );
          else {
            var a = (
              /** @type {Effect} */
              l
            );
            i & (Co | Nn) && !this.async_deriveds.has(a) && (this.#u.delete(a), Mt(a, Ut), this.schedule(a));
          }
        }
    };
    for (const r of this.current.keys())
      n(r);
    this.oncommit(() => e.discard()), e.#g(), Xe = this, this.#v();
  }
  /**
   * @param {Effect[]} effects
   */
  #h(e) {
    for (var n = 0; n < e.length; n += 1)
      Sp(e[n], this.#c, this.#u);
  }
  /**
   * Associate a change to a given source with the current
   * batch, noting its previous and current values
   * @param {Value} source
   * @param {any} value
   * @param {boolean} [is_derived]
   */
  capture(e, n, r = !1) {
    e.v !== Nt && !this.previous.has(e) && this.previous.set(e, e.v), (e.f & Mr) === 0 && (this.current.set(e, [n, r]), Bn?.set(e, n)), this.is_fork || (e.v = n);
  }
  activate() {
    Xe = this;
  }
  deactivate() {
    Xe = null, Bn = null;
  }
  flush() {
    try {
      rl = !0, Xe = this, this.#v();
    } finally {
      Cf = 0, ql = null, ko = null, Es = null, rl = !1, Xe = null, Bn = null, Yn.clear();
    }
  }
  discard() {
    for (const e of this.#r) e(this);
    this.#r.clear();
    for (const e of this.async_deriveds.values())
      e.reject(ci);
    this.#g(), this.#a?.resolve();
  }
  /**
   * @param {Effect} effect
   */
  register_created_effect(e) {
    this.#p.push(e);
  }
  #_() {
    for (let f = nl; f !== null; f = f.#e) {
      var e = f.id < this.id, n = [];
      for (const [h, [p, m]] of this.current) {
        if (f.current.has(h)) {
          var r = (
            /** @type {[any, boolean]} */
            f.current.get(h)[0]
          );
          if (e && p !== r)
            f.current.set(h, [p, m]);
          else
            continue;
        }
        n.push(h);
      }
      if (e)
        for (const [h, p] of this.async_deriveds) {
          const m = f.async_deriveds.get(h);
          m && p.promise.then(m.resolve).catch(m.reject);
        }
      var o = [...f.current.keys()].filter(
        (h) => !/** @type {[any, boolean]} */
        f.current.get(h)[1]
      );
      if (!(!f.#t || o.length === 0)) {
        var i = o.filter((h) => !this.current.has(h));
        if (i.length === 0)
          e && f.discard();
        else if (n.length > 0) {
          if (e)
            for (const h of this.#m)
              f.unskip_effect(h, (p) => {
                (p.f & (Nn | Co)) !== 0 ? f.schedule(p) : f.#h([p]);
              });
          f.activate();
          var a = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Map();
          for (var c of n)
            Pp(c, i, a, l);
          l = /* @__PURE__ */ new Map();
          var d = [...f.current].filter(([h, p]) => {
            const m = this.current.get(h);
            return m ? m[0] !== p[0] || m[1] !== p[1] : !0;
          }).map(([h]) => h);
          if (d.length > 0)
            for (const h of this.#p)
              (h.f & (un | sn | js)) === 0 && au(h, d, l) && ((h.f & (Co | Nn)) !== 0 ? (Mt(h, Ut), f.schedule(h)) : f.#c.add(h));
          if (f.#o.length > 0 && !f.#d) {
            f.apply();
            for (var u of f.#o)
              f.#w(u, [], []);
            f.#o = [];
          }
          f.deactivate();
        }
      }
    }
  }
  /**
   * @param {boolean} blocking
   * @param {Effect} effect
   */
  increment(e, n) {
    if (this.#i += 1, e) {
      let r = this.#n.get(n) ?? 0;
      this.#n.set(n, r + 1);
    }
  }
  /**
   * @param {boolean} blocking
   * @param {Effect} effect
   */
  decrement(e, n) {
    if (this.#i -= 1, e) {
      let r = this.#n.get(n) ?? 0;
      r === 1 ? this.#n.delete(n) : this.#n.set(n, r - 1);
    }
    this.#d || (this.#d = !0, Pn(() => {
      this.#d = !1, this.linked && this.flush();
    }));
  }
  /**
   * @param {Set<Effect>} dirty_effects
   * @param {Set<Effect>} maybe_dirty_effects
   */
  transfer_effects(e, n) {
    for (const r of e)
      this.#c.add(r);
    for (const r of n)
      this.#u.add(r);
    e.clear(), n.clear();
  }
  /** @param {(batch: Batch) => void} fn */
  oncommit(e) {
    this.#l.add(e);
  }
  /** @param {(batch: Batch) => void} fn */
  ondiscard(e) {
    this.#r.add(e);
  }
  settled() {
    return (this.#a ??= gp()).promise;
  }
  static ensure() {
    if (Xe === null) {
      const e = Xe = new Nr();
      !rl && !xi && Pn(() => {
        e.#t || e.flush();
      });
    }
    return Xe;
  }
  apply() {
    {
      Bn = null;
      return;
    }
  }
  /**
   *
   * @param {Effect} effect
   */
  schedule(e) {
    if (ql = e, e.b?.is_pending && (e.f & (Lo | da | Qc)) !== 0 && (e.f & Jo) === 0) {
      e.b.defer_effect(e);
      return;
    }
    for (var n = e; n.parent !== null; ) {
      n = n.parent;
      var r = n.f;
      if (ko !== null && n === rt && (at === null || (at.f & Jt) === 0))
        return;
      if ((r & (fr | Mn)) !== 0) {
        if ((r & Zt) === 0)
          return;
        n.f ^= Zt;
      }
    }
    this.#o.push(n);
  }
  #g() {
    if (this.linked) {
      var e = this.#s, n = this.#e;
      e === null ? nl = n : e.#e = n, n === null ? mo = e : n.#s = e, this.linked = !1;
    }
  }
}
function ZS(t) {
  var e = xi;
  xi = !0;
  try {
    for (var n; ; ) {
      if (RS(), Xe === null)
        return (
          /** @type {T} */
          n
        );
      Xe.flush();
    }
  } finally {
    xi = e;
  }
}
function KS() {
  try {
    kS();
  } catch (t) {
    Vn(t, ql);
  }
}
let ar = null;
function Af(t) {
  var e = t.length;
  if (e !== 0) {
    for (var n = 0; n < e; ) {
      var r = t[n++];
      if ((r.f & (un | sn)) === 0 && Hi(r) && (ar = /* @__PURE__ */ new Set(), Bo(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && Hp(r), ar?.size > 0)) {
        Yn.clear();
        for (const o of ar) {
          if ((o.f & (un | sn)) !== 0) continue;
          const i = [o];
          let a = o.parent;
          for (; a !== null; )
            ar.has(a) && (ar.delete(a), i.push(a)), a = a.parent;
          for (let l = i.length - 1; l >= 0; l--) {
            const c = i[l];
            (c.f & (un | sn)) === 0 && Bo(c);
          }
        }
        ar.clear();
      }
    }
    ar = null;
  }
}
function Pp(t, e, n, r) {
  if (!n.has(t) && (n.add(t), t.reactions !== null))
    for (const o of t.reactions) {
      const i = o.f;
      (i & Jt) !== 0 ? Pp(
        /** @type {Derived} */
        o,
        e,
        n,
        r
      ) : (i & (Co | Nn)) !== 0 && (i & Ut) === 0 && au(o, e, r) && (Mt(o, Ut), lu(
        /** @type {Effect} */
        o
      ));
    }
}
function au(t, e, n) {
  const r = n.get(t);
  if (r !== void 0) return r;
  if (t.deps !== null)
    for (const o of t.deps) {
      if (Bs.call(e, o))
        return !0;
      if ((o.f & Jt) !== 0 && au(
        /** @type {Derived} */
        o,
        e,
        n
      ))
        return n.set(
          /** @type {Derived} */
          o,
          !0
        ), !0;
    }
  return n.set(t, !1), !1;
}
function lu(t) {
  Xe.schedule(t);
}
function Ip(t, e) {
  if (!((t.f & Mn) !== 0 && (t.f & Zt) !== 0)) {
    (t.f & Ut) !== 0 ? e.d.push(t) : (t.f & jn) !== 0 && e.m.push(t), Mt(t, Zt);
    for (var n = t.first; n !== null; )
      Ip(n, e), n = n.next;
  }
}
function zp(t) {
  Mt(t, Zt);
  for (var e = t.first; e !== null; )
    zp(e), e = e.next;
}
let Zs = /* @__PURE__ */ new Set();
const Yn = /* @__PURE__ */ new Map();
let Mp = !1;
function lo(t, e) {
  var n = {
    f: 0,
    // TODO ideally we could skip this altogether, but it causes type errors
    v: t,
    reactions: null,
    equals: vp,
    rv: 0,
    wv: 0
  };
  return n;
}
// @__NO_SIDE_EFFECTS__
function B(t, e) {
  const n = lo(t);
  return Kp(n), n;
}
// @__NO_SIDE_EFFECTS__
function VS(t, e = !1, n = !0) {
  const r = lo(t);
  return e || (r.equals = yp), r;
}
function _(t, e, n = !1) {
  at !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
  // to ensure we error if state is set inside an inspect effect
  (!Un || (at.f & js) !== 0) && bp() && (at.f & (Jt | Nn | Co | js)) !== 0 && (Xn === null || !Xn.has(t)) && TS();
  let r = n ? ft(e) : e;
  return No(t, r, Es);
}
function No(t, e, n = null) {
  if (!t.equals(e)) {
    hr ? Yn.set(t, e) : Yn.has(t) || Yn.set(t, t.v);
    var r = Nr.ensure();
    if (r.capture(t, e), (t.f & Jt) !== 0) {
      const o = (
        /** @type {Derived} */
        t
      );
      (t.f & Ut) !== 0 && su(o), Bn === null && ru(o);
    }
    t.wv = Jp(), Op(t, Ut, n), rt !== null && (rt.f & Zt) !== 0 && (rt.f & (Mn | fr)) === 0 && (Tn === null ? o3([t]) : Tn.push(t)), !r.is_fork && Zs.size > 0 && !Mp && JS();
  }
  return e;
}
function JS() {
  Mp = !1;
  for (const t of Zs) {
    (t.f & Zt) !== 0 && Mt(t, jn);
    let e;
    try {
      e = Hi(t);
    } catch {
      e = !0;
    }
    e && Bo(t);
  }
  Zs.clear();
}
function Ei(t) {
  _(t, t.v + 1);
}
function Op(t, e, n) {
  var r = t.reactions;
  if (r !== null)
    for (var o = r.length, i = 0; i < o; i++) {
      var a = r[i], l = a.f, c = (l & Ut) === 0;
      if (c && Mt(a, e), (l & js) !== 0)
        Zs.add(
          /** @type {Effect} */
          a
        );
      else if ((l & Jt) !== 0) {
        var d = (
          /** @type {Derived} */
          a
        );
        Bn?.delete(d), (l & ao) === 0 && (l & zn && (rt === null || (rt.f & Hs) === 0) && (a.f |= ao), Op(d, jn, n));
      } else if (c) {
        var u = (
          /** @type {Effect} */
          a
        );
        (l & Nn) !== 0 && ar !== null && ar.add(u), n !== null ? n.push(u) : lu(u);
      }
    }
}
function ft(t) {
  if (typeof t != "object" || t === null || ur in t || pp in t)
    return t;
  const e = Xc(t);
  if (e !== iS && e !== sS)
    return t;
  var n = /* @__PURE__ */ new Map(), r = ca(t), o = /* @__PURE__ */ B(0), i = to, a = (l) => {
    if (to === i)
      return l();
    var c = at, d = to;
    On(null), zf(i);
    var u = l();
    return On(c), zf(d), u;
  };
  return r && n.set("length", /* @__PURE__ */ B(
    /** @type {any[]} */
    t.length
  )), new Proxy(
    /** @type {any} */
    t,
    {
      defineProperty(l, c, d) {
        (!("value" in d) || d.configurable === !1 || d.enumerable === !1 || d.writable === !1) && xS();
        var u = n.get(c);
        return u === void 0 ? a(() => {
          var f = /* @__PURE__ */ B(d.value);
          return n.set(c, f), f;
        }) : _(u, d.value, !0), !0;
      },
      deleteProperty(l, c) {
        var d = n.get(c);
        if (d === void 0) {
          if (c in l) {
            const u = a(() => /* @__PURE__ */ B(Nt));
            n.set(c, u), Ei(o);
          }
        } else
          _(d, Nt), Ei(o);
        return !0;
      },
      get(l, c, d) {
        if (c === ur)
          return t;
        var u = n.get(c), f = c in l;
        if (u === void 0 && (!f || To(l, c)?.writable) && (u = a(() => {
          var p = ft(f ? l[c] : Nt), m = /* @__PURE__ */ B(p);
          return m;
        }), n.set(c, u)), u !== void 0) {
          var h = s(u);
          return h === Nt ? void 0 : h;
        }
        return Reflect.get(l, c, d);
      },
      getOwnPropertyDescriptor(l, c) {
        var d = Reflect.getOwnPropertyDescriptor(l, c);
        if (d && "value" in d) {
          var u = n.get(c);
          u && (d.value = s(u));
        } else if (d === void 0) {
          var f = n.get(c), h = f?.v;
          if (f !== void 0 && h !== Nt)
            return {
              enumerable: !0,
              configurable: !0,
              value: h,
              writable: !0
            };
        }
        return d;
      },
      has(l, c) {
        if (c === ur)
          return !0;
        var d = n.get(c), u = d !== void 0 && d.v !== Nt || Reflect.has(l, c);
        if (d !== void 0 || rt !== null && (!u || To(l, c)?.writable)) {
          d === void 0 && (d = a(() => {
            var h = u ? ft(l[c]) : Nt, p = /* @__PURE__ */ B(h);
            return p;
          }), n.set(c, d));
          var f = s(d);
          if (f === Nt)
            return !1;
        }
        return u;
      },
      set(l, c, d, u) {
        var f = n.get(c), h = c in l;
        if (r && c === "length")
          for (var p = d; p < /** @type {Source<number>} */
          f.v; p += 1) {
            var m = n.get(p + "");
            m !== void 0 ? _(m, Nt) : p in l && (m = a(() => /* @__PURE__ */ B(Nt)), n.set(p + "", m));
          }
        if (f === void 0)
          (!h || To(l, c)?.writable) && (f = a(() => /* @__PURE__ */ B(void 0)), _(f, ft(d)), n.set(c, f));
        else {
          h = f.v !== Nt;
          var w = a(() => ft(d));
          _(f, w);
        }
        var y = Reflect.getOwnPropertyDescriptor(l, c);
        if (y?.set && y.set.call(u, d), !h) {
          if (r && typeof c == "string") {
            var k = (
              /** @type {Source<number>} */
              n.get("length")
            ), O = Number(c);
            Number.isInteger(O) && O >= k.v && _(k, O + 1);
          }
          Ei(o);
        }
        return !0;
      },
      ownKeys(l) {
        s(o);
        var c = Reflect.ownKeys(l).filter((f) => {
          var h = n.get(f);
          return h === void 0 || h.v !== Nt;
        });
        for (var [d, u] of n)
          u.v !== Nt && !(d in l) && c.push(d);
        return c;
      },
      setPrototypeOf() {
        ES();
      }
    }
  );
}
function Pf(t) {
  try {
    if (t !== null && typeof t == "object" && ur in t)
      return t[ur];
  } catch {
  }
  return t;
}
function cu(t, e) {
  return Object.is(Pf(t), Pf(e));
}
var $t, Fp, Rp, Lp, Dp;
function GS() {
  if ($t === void 0) {
    $t = window, Fp = document, Rp = /Firefox/.test(navigator.userAgent);
    var t = Element.prototype, e = Node.prototype, n = Text.prototype;
    Lp = To(e, "firstChild").get, Dp = To(e, "nextSibling").get, Ef(t) && (t[Kl] = void 0, t[mp] = null, t[Vl] = void 0, t.__e = void 0), Ef(n) && (n[Jl] = void 0);
  }
}
function Or(t = "") {
  return document.createTextNode(t);
}
// @__NO_SIDE_EFFECTS__
function co(t) {
  return (
    /** @type {TemplateNode | null} */
    Lp.call(t)
  );
}
// @__NO_SIDE_EFFECTS__
function Ui(t) {
  return (
    /** @type {TemplateNode | null} */
    Dp.call(t)
  );
}
function z(t, e) {
  return /* @__PURE__ */ co(t);
}
function Ue(t, e = !1) {
  {
    var n = /* @__PURE__ */ co(t);
    return n instanceof Comment && n.data === "" ? /* @__PURE__ */ Ui(n) : n;
  }
}
function ae(t, e = !1) {
  return /* @__PURE__ */ co(t);
}
function b(t, e = 1, n = !1) {
  let r = t;
  for (; e--; )
    r = /** @type {TemplateNode} */
    /* @__PURE__ */ Ui(r);
  return r;
}
function qS(t) {
  t.textContent = "";
}
function Np() {
  return !1;
}
function YS(t, e, n) {
  return (
    /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */
    n ? document.createElement(t, { is: n }) : document.createElement(t)
  );
}
function XS(t) {
  var e = rt;
  if (e === null)
    return at.f |= Mr, t;
  if ((e.f & Jo) === 0 && (e.f & Lo) === 0)
    throw t;
  Vn(t, e);
}
function Vn(t, e) {
  if (!(e !== null && (e.f & un) !== 0)) {
    for (; e !== null; ) {
      if ((e.f & Zl) !== 0 && (e.f & (un | Us)) === 0) {
        if ((e.f & Jo) === 0)
          throw t;
        try {
          e.b.error(t);
          return;
        } catch (n) {
          t = n;
        }
      }
      e = e.parent;
    }
    throw t;
  }
}
function QS(t) {
  rt === null && (at === null && wS(), bS()), hr && yS();
}
function $S(t, e) {
  var n = e.last;
  n === null ? e.last = e.first = t : (n.next = t, t.prev = n, e.last = t);
}
function $n(t, e) {
  var n = rt;
  n !== null && (n.f & sn) !== 0 && (t |= sn);
  var r = {
    ctx: jt,
    deps: null,
    nodes: null,
    f: t | Ut | zn,
    first: null,
    fn: e,
    last: null,
    next: null,
    parent: n,
    b: n && n.b,
    prev: null,
    teardown: null,
    wv: 0,
    ac: null
  };
  Xe?.register_created_effect(r);
  var o = r;
  if ((t & Lo) !== 0)
    ko !== null ? ko.push(r) : Nr.ensure().schedule(r);
  else if (e !== null) {
    try {
      Bo(r);
    } catch (a) {
      throw qt(r), a;
    }
    o.deps === null && o.teardown === null && o.nodes === null && o.first === o.last && // either `null`, or a singular child
    (o.f & Go) === 0 && (o = o.first, (t & Nn) !== 0 && (t & so) !== 0 && o !== null && (o.f |= so));
  }
  if (o !== null && (o.parent = n, n !== null && $S(o, n), at !== null && (at.f & Jt) !== 0 && (t & fr) === 0)) {
    var i = (
      /** @type {Derived} */
      at
    );
    (i.effects ??= []).push(o);
  }
  return r;
}
function uu() {
  return at !== null && !Un;
}
function ha(t) {
  const e = $n(da, null);
  return Mt(e, Zt), e.teardown = t, e;
}
function bt(t) {
  QS();
  var e = (
    /** @type {Effect} */
    rt.f
  ), n = !at && (e & Mn) !== 0 && jt !== null && !jt.i;
  if (n) {
    var r = (
      /** @type {ComponentContext} */
      jt
    );
    (r.e ??= []).push(t);
  } else
    return Bp(t);
}
function Bp(t) {
  return $n(Lo | uS, t);
}
function e3(t) {
  Nr.ensure();
  const e = $n(fr | Go, t);
  return (n = {}) => new Promise((r) => {
    n.outro ? eo(e, () => {
      qt(e), r(void 0);
    }) : (qt(e), r(void 0));
  });
}
function ga(t) {
  return $n(Lo, t);
}
function t3(t) {
  return $n(Co | Go, t);
}
function Yo(t, e = 0) {
  return $n(da | e, t);
}
function Y(t, e = [], n = [], r = []) {
  xp(r, e, n, (o) => {
    $n(da, () => {
      t(...o.map(s));
    });
  });
}
function ji(t, e = 0) {
  var n = $n(Nn | e, t);
  return n;
}
function Up(t, e = 0) {
  var n = $n(Qc | e, t);
  return n;
}
function ln(t) {
  return $n(Mn | Go, t);
}
function jp(t) {
  var e = t.teardown;
  if (e !== null) {
    const n = hr, r = at;
    If(!0), On(null);
    try {
      e.call(null);
    } catch (o) {
      Vn(o, t.parent);
    } finally {
      If(n), On(r);
    }
  }
}
function du(t, e = !1) {
  var n = t.first;
  for (t.first = t.last = null; n !== null; ) {
    const o = n.ac;
    o !== null && qo(() => {
      o.abort(Bi);
    });
    var r = n.next;
    (n.f & fr) !== 0 ? n.parent = null : qt(n, e), n = r;
  }
}
function n3(t) {
  for (var e = t.first; e !== null; ) {
    var n = e.next;
    (e.f & Mn) === 0 && qt(e), e = n;
  }
}
function qt(t, e = !0) {
  var n = !1;
  (e || (t.f & cS) !== 0) && t.nodes !== null && t.nodes.end !== null && (r3(
    t.nodes.start,
    /** @type {TemplateNode} */
    t.nodes.end
  ), n = !0), t.f |= Us, du(t, e && !n), Fi(t, 0);
  var r = t.nodes && t.nodes.t;
  if (r !== null)
    for (const i of r)
      i.stop();
  jp(t), t.f ^= Us, t.f |= un;
  var o = t.parent;
  o !== null && o.first !== null && Hp(t), t.next = t.prev = t.teardown = t.ctx = t.deps = t.fn = t.nodes = t.ac = t.b = null;
}
function r3(t, e) {
  for (; t !== null; ) {
    var n = t === e ? null : /* @__PURE__ */ Ui(t);
    t.remove(), t = n;
  }
}
function Hp(t) {
  var e = t.parent, n = t.prev, r = t.next;
  n !== null && (n.next = r), r !== null && (r.prev = n), e !== null && (e.first === t && (e.first = r), e.last === t && (e.last = n));
}
function eo(t, e, n = !0) {
  var r = [];
  t.f |= $c, Wp(t, r, !0);
  var o = () => {
    n && qt(t), e && e();
  }, i = r.length;
  if (i > 0) {
    var a = () => --i || o();
    for (var l of r)
      l.out(a);
  } else
    o();
}
function Wp(t, e, n) {
  if ((t.f & sn) === 0) {
    t.f ^= sn;
    var r = t.nodes && t.nodes.t;
    if (r !== null)
      for (const l of r)
        (l.is_global || n) && e.push(l);
    for (var o = t.first; o !== null; ) {
      var i = o.next;
      if ((o.f & fr) === 0) {
        var a = (o.f & so) !== 0 || // If this is a branch effect without a block effect parent,
        // it means the parent block effect was pruned. In that case,
        // transparency information was transferred to the branch effect.
        (o.f & Mn) !== 0 && (t.f & Nn) !== 0;
        Wp(o, e, a ? n : !1);
      }
      o = i;
    }
  }
}
function Ks(t) {
  t.f &= ~$c, Zp(t, !0);
}
function Zp(t, e) {
  if ((t.f & $c) === 0 && (t.f & sn) !== 0) {
    t.f ^= sn, (t.f & Zt) === 0 && (Mt(t, Ut), Nr.ensure().schedule(t));
    for (var n = t.first; n !== null; ) {
      var r = n.next, o = (n.f & so) !== 0 || (n.f & Mn) !== 0;
      Zp(n, o ? e : !1), n = r;
    }
    var i = t.nodes && t.nodes.t;
    if (i !== null)
      for (const a of i)
        (a.is_global || e) && a.in();
  }
}
function fu(t, e) {
  if (t.nodes)
    for (var n = t.nodes.start, r = t.nodes.end; n !== null; ) {
      var o = n === r ? null : /* @__PURE__ */ Ui(n);
      e.append(n), n = o;
    }
}
let Ts = !1, hr = !1;
function If(t) {
  hr = t;
}
let at = null, Un = !1;
function On(t) {
  at = t;
}
let rt = null;
function Qn(t) {
  rt = t;
}
let Xn = null;
function Kp(t) {
  at !== null && (Xn ??= /* @__PURE__ */ new Set()).add(t);
}
let cn = null, mn = 0, Tn = null;
function o3(t) {
  Tn = t;
}
let Vp = 1, Xr = 0, to = Xr;
function zf(t) {
  to = t;
}
function Jp() {
  return ++Vp;
}
function Hi(t) {
  var e = t.f;
  if ((e & Ut) !== 0)
    return !0;
  if (e & Jt && (t.f &= ~ao), (e & jn) !== 0) {
    for (var n = (
      /** @type {Value[]} */
      t.deps
    ), r = n.length, o = 0; o < r; o++) {
      var i = n[o];
      if (Hi(
        /** @type {Derived} */
        i
      ) && Cp(
        /** @type {Derived} */
        i
      ), i.wv > t.wv)
        return !0;
    }
    (e & zn) !== 0 && // During time traveling we don't want to reset the status so that
    // traversal of the graph in the other batches still happens
    Bn === null && Mt(t, Zt);
  }
  return !1;
}
function Gp(t, e, n = !0) {
  var r = t.reactions;
  if (r !== null && !(Xn !== null && Xn.has(t)))
    for (var o = 0; o < r.length; o++) {
      var i = r[o];
      (i.f & Jt) !== 0 ? Gp(
        /** @type {Derived} */
        i,
        e,
        !1
      ) : e === i && (n ? Mt(i, Ut) : (i.f & Zt) !== 0 && Mt(i, jn), lu(
        /** @type {Effect} */
        i
      ));
    }
}
function qp(t) {
  var e = cn, n = mn, r = Tn, o = at, i = Xn, a = jt, l = Un, c = to, d = t.f;
  cn = /** @type {null | Value[]} */
  null, mn = 0, Tn = null, at = (d & (Mn | fr)) === 0 ? t : null, Xn = null, Do(t.ctx), Un = !1, to = ++Xr, t.ac !== null && (qo(() => {
    t.ac.abort(Bi);
  }), t.ac = null);
  try {
    t.f |= Hs;
    var u = (
      /** @type {Function} */
      t.fn
    ), f = u();
    t.f |= Jo;
    var h = Mf(t);
    if (bp() && Tn !== null && !Un && h !== null && (t.f & (Jt | jn | Ut)) === 0)
      for (var p = 0; p < /** @type {Source[]} */
      Tn.length; p++)
        Gp(
          Tn[p],
          /** @type {Effect} */
          t
        );
    if (o !== null && o !== t) {
      if (Xr++, o.deps !== null)
        for (let m = 0; m < n; m += 1)
          o.deps[m].rv = Xr;
      if (e !== null)
        for (const m of e)
          m.rv = Xr;
      Tn !== null && (r === null ? r = Tn : r.push(.../** @type {Source[]} */
      Tn));
    }
    return (t.f & Mr) !== 0 && (t.f ^= Mr), f;
  } catch (m) {
    return Mf(t), XS(m);
  } finally {
    t.f ^= Hs, cn = e, mn = n, Tn = r, at = o, Xn = i, Do(a), Un = l, to = c;
  }
}
function Mf(t) {
  var e = t.deps, n = Xe?.is_fork;
  if (cn !== null) {
    var r;
    if (n || Fi(t, mn), e !== null && mn > 0)
      for (e.length = mn + cn.length, r = 0; r < cn.length; r++)
        e[mn + r] = cn[r];
    else
      t.deps = e = cn;
    if (uu() && (t.f & zn) !== 0)
      for (r = mn; r < e.length; r++)
        (e[r].reactions ??= []).push(t);
  } else !n && e !== null && mn < e.length && (Fi(t, mn), e.length = mn);
  return e;
}
function i3(t, e) {
  let n = e.reactions;
  if (n !== null) {
    var r = oS.call(n, t);
    if (r !== -1) {
      var o = n.length - 1;
      o === 0 ? n = e.reactions = null : (n[r] = n[o], n.pop());
    }
  }
  if (n === null && (e.f & Jt) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
  // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
  // allows us to skip the expensive work of disconnecting and immediately reconnecting it
  (cn === null || !Bs.call(cn, e))) {
    var i = (
      /** @type {Derived} */
      e
    );
    (i.f & zn) !== 0 && (i.f ^= zn, i.f &= ~ao), i.v !== Nt && ru(i), i.ac !== null && qo(() => {
      i.ac.abort(Bi), i.ac = null, Mt(i, Ut);
    }), HS(i), Fi(i, 0);
  }
}
function Fi(t, e) {
  var n = t.deps;
  if (n !== null)
    for (var r = e; r < n.length; r++)
      i3(t, n[r]);
}
function Bo(t) {
  var e = t.f;
  if ((e & un) === 0) {
    Mt(t, Zt);
    var n = rt, r = Ts;
    rt = t, Ts = (e & (Mn | fr)) === 0;
    try {
      (e & (Nn | Qc)) !== 0 ? n3(t) : du(t), jp(t);
      var o = qp(t);
      t.teardown = typeof o == "function" ? o : null, t.wv = Vp;
      var i;
      dp && AS && (t.f & Ut) !== 0 && t.deps;
    } finally {
      Ts = r, rt = n;
    }
  }
}
async function Br() {
  await Promise.resolve(), ZS();
}
function s(t) {
  var e = t.f, n = (e & Jt) !== 0;
  if (at !== null && !Un) {
    var r = rt !== null && (rt.f & un) !== 0;
    if (!r && (Xn === null || !Xn.has(t))) {
      var o = at.deps;
      if ((at.f & Hs) !== 0)
        t.rv < Xr && (t.rv = Xr, cn === null && o !== null && o[mn] === t ? mn++ : cn === null ? cn = [t] : cn.push(t));
      else {
        at.deps ??= [], Bs.call(at.deps, t) || at.deps.push(t);
        var i = t.reactions;
        i === null ? t.reactions = [at] : Bs.call(i, at) || i.push(at);
      }
    }
  }
  if (hr && Yn.has(t))
    return Yn.get(t);
  if (n) {
    var a = (
      /** @type {Derived} */
      t
    );
    if (hr) {
      var l = a.v;
      return ((a.f & Zt) === 0 && a.reactions !== null || Xp(a)) && (l = su(a)), Yn.set(a, l), l;
    }
    var c = (a.f & zn) === 0 && !Un && at !== null && (Ts || (at.f & zn) !== 0), d = (a.f & Jo) === 0;
    Hi(a) && (c && (a.f |= zn), Cp(a)), c && !d && (Ap(a), Yp(a));
  }
  if (Bn?.has(t))
    return Bn.get(t);
  if ((t.f & Mr) !== 0)
    throw t.v;
  return t.v;
}
function Yp(t) {
  if (t.f |= zn, t.deps !== null)
    for (const e of t.deps)
      (e.reactions ??= []).push(t), (e.f & Jt) !== 0 && (e.f & zn) === 0 && (Ap(
        /** @type {Derived} */
        e
      ), Yp(
        /** @type {Derived} */
        e
      ));
}
function Xp(t) {
  if (t.v === Nt) return !0;
  if (t.deps === null) return !1;
  for (const e of t.deps)
    if (Yn.has(e) || (e.f & Jt) !== 0 && Xp(
      /** @type {Derived} */
      e
    ))
      return !0;
  return !1;
}
function dn(t) {
  var e = Un;
  try {
    return Un = !0, t();
  } finally {
    Un = e;
  }
}
function s3(t) {
  if (!(typeof t != "object" || !t || t instanceof EventTarget)) {
    if (ur in t)
      Yl(t);
    else if (!Array.isArray(t))
      for (let e in t) {
        const n = t[e];
        typeof n == "object" && n && ur in n && Yl(n);
      }
  }
}
function Yl(t, e = /* @__PURE__ */ new Set()) {
  if (typeof t == "object" && t !== null && // We don't want to traverse DOM elements
  !(t instanceof EventTarget) && !e.has(t)) {
    e.add(t), t instanceof Date && t.getTime();
    for (let r in t)
      try {
        Yl(t[r], e);
      } catch {
      }
    const n = Xc(t);
    if (n !== Object.prototype && n !== Array.prototype && n !== Map.prototype && n !== Set.prototype && n !== Date.prototype) {
      const r = hp(n);
      for (let o in r) {
        const i = r[o].get;
        if (i)
          try {
            i.call(t);
          } catch {
          }
      }
    }
  }
}
const ui = /* @__PURE__ */ Symbol("events"), Qp = /* @__PURE__ */ new Set(), Xl = /* @__PURE__ */ new Set();
function $p(t, e, n, r = {}) {
  function o(i) {
    if (r.capture || Ql.call(e, i), !i.cancelBubble)
      return qo(() => n?.call(this, i));
  }
  return t.startsWith("pointer") || t.startsWith("touch") || t === "wheel" ? Pn(() => {
    e.addEventListener(t, o, r);
  }) : e.addEventListener(t, o, r), o;
}
function Qe(t, e, n, r, o) {
  var i = { capture: r, passive: o }, a = $p(t, e, n, i);
  (e === document.body || // @ts-ignore
  e === window || // @ts-ignore
  e === document || // Firefox has quirky behavior, it can happen that we still get "canplay" events when the element is already removed
  e instanceof HTMLMediaElement) && ha(() => {
    e.removeEventListener(t, a, i);
  });
}
function I(t, e, n) {
  (e[ui] ??= {})[t] = n;
}
function ct(t) {
  for (var e = 0; e < t.length; e++)
    Qp.add(t[e]);
  for (var n of Xl)
    n(t);
}
let ol = null, il = !1;
function Ql(t) {
  var e = this, n = (
    /** @type {Node} */
    e.ownerDocument
  ), r = t.type, o = t.composedPath?.() || [], i = (
    /** @type {null | Element} */
    o[0] || t.target
  );
  ol = t, il || (il = !0, setTimeout(() => {
    il = !1, ol = null;
  }));
  var a = 0, l = ol === t && t[ui];
  if (l) {
    var c = o.indexOf(l);
    if (c !== -1 && (e === document || e === /** @type {any} */
    window)) {
      t[ui] = e;
      return;
    }
    var d = o.indexOf(e);
    if (d === -1)
      return;
    c <= d && (a = c);
  }
  if (i = /** @type {Element} */
  o[a] || t.target, i !== e) {
    fp(t, "currentTarget", {
      configurable: !0,
      get() {
        return i || n;
      }
    });
    var u = at, f = rt;
    On(null), Qn(null);
    try {
      for (var h, p = []; i !== null && i !== e; ) {
        try {
          var m = i[ui]?.[r];
          m != null && (!/** @type {any} */
          i.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
          // -> the target could not have been disabled because it emits the event in the first place
          t.target === i) && m.call(i, t);
        } catch (w) {
          h ? p.push(w) : h = w;
        }
        if (t.cancelBubble) break;
        a++, i = a < o.length ? (
          /** @type {Element} */
          o[a]
        ) : null;
      }
      if (h) {
        for (let w of p)
          queueMicrotask(() => {
            throw w;
          });
        throw h;
      }
    } finally {
      t[ui] = e, delete t.currentTarget, On(u), Qn(f);
    }
  }
}
const a3 = (
  // We gotta write it like this because after downleveling the pure comment may end up in the wrong location
  globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", {
    /** @param {string} html */
    createHTML: (t) => t
  })
);
function l3(t) {
  return (
    /** @type {string} */
    a3?.createHTML(t) ?? t
  );
}
function em(t) {
  var e = YS("template");
  return e.innerHTML = l3(t.replaceAll("<!>", "<!---->")), e.content;
}
function Vs(t, e) {
  var n = (
    /** @type {Effect} */
    rt
  );
  n.nodes === null && (n.nodes = { start: t, end: e, a: null, t: null });
}
// @__NO_SIDE_EFFECTS__
function F(t, e) {
  var n = (e & eS) !== 0, r = (e & tS) !== 0, o, i = !t.startsWith("<!>");
  return () => {
    o === void 0 && (o = em(i ? t : "<!>" + t), n || (o = /** @type {TemplateNode} */
    /* @__PURE__ */ co(o)));
    var a = (
      /** @type {TemplateNode} */
      r || Rp ? document.importNode(o, !0) : o.cloneNode(!0)
    );
    if (n) {
      var l = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ co(a)
      ), c = (
        /** @type {TemplateNode} */
        a.lastChild
      );
      Vs(l, c);
    } else
      Vs(a, a);
    return a;
  };
}
// @__NO_SIDE_EFFECTS__
function c3(t, e, n = "svg") {
  var r = !t.startsWith("<!>"), o = `<${n}>${r ? t : "<!>" + t}</${n}>`, i;
  return () => {
    if (!i) {
      var a = (
        /** @type {DocumentFragment} */
        em(o)
      ), l = (
        /** @type {Element} */
        /* @__PURE__ */ co(a)
      );
      i = /** @type {Element} */
      /* @__PURE__ */ co(l);
    }
    var c = (
      /** @type {TemplateNode} */
      i.cloneNode(!0)
    );
    return Vs(c, c), c;
  };
}
// @__NO_SIDE_EFFECTS__
function mr(t, e) {
  return /* @__PURE__ */ c3(t, e, "svg");
}
function on() {
  var t = document.createDocumentFragment(), e = document.createComment(""), n = Or();
  return t.append(e, n), Vs(e, n), t;
}
function A(t, e) {
  t !== null && t.before(
    /** @type {Node} */
    e
  );
}
function u3(t) {
  return t.endsWith("capture") && t !== "gotpointercapture" && t !== "lostpointercapture";
}
const d3 = [
  "beforeinput",
  "click",
  "change",
  "dblclick",
  "contextmenu",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart"
];
function f3(t) {
  return d3.includes(t);
}
const h3 = {
  // no `class: 'className'` because we handle that separately
  formnovalidate: "formNoValidate",
  ismap: "isMap",
  nomodule: "noModule",
  playsinline: "playsInline",
  readonly: "readOnly",
  defaultvalue: "defaultValue",
  defaultchecked: "defaultChecked",
  srcobject: "srcObject",
  novalidate: "noValidate",
  allowfullscreen: "allowFullscreen",
  disablepictureinpicture: "disablePictureInPicture",
  disableremoteplayback: "disableRemotePlayback"
};
function g3(t) {
  return t = t.toLowerCase(), h3[t] ?? t;
}
const p3 = ["touchstart", "touchmove"];
function m3(t) {
  return p3.includes(t);
}
function v3(t) {
  let e = 0, n = lo(0), r;
  return () => {
    uu() && (s(n), Yo(() => (e === 0 && (r = dn(() => t(() => Ei(n)))), e += 1, () => {
      Pn(() => {
        e -= 1, e === 0 && (r?.(), r = void 0, Ei(n));
      });
    })));
  };
}
var _3 = so | Go;
function y3(t, e, n, r) {
  new b3(t, e, n, r);
}
class b3 {
  /** @type {Boundary | null} */
  parent;
  is_pending = !1;
  /**
   * API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
   * Inherited from parent boundary, or defaults to identity.
   * @type {(error: unknown) => unknown}
   */
  transform_error;
  /** @type {TemplateNode} */
  #t;
  /** @type {TemplateNode | null} */
  #s = null;
  /** @type {BoundaryProps} */
  #e;
  /** @type {((anchor: Node) => void)} */
  #l;
  /** @type {Effect} */
  #r;
  /** @type {Effect | null} */
  #i = null;
  /** @type {Effect | null} */
  #n = null;
  /** @type {Effect | null} */
  #a = null;
  /** @type {DocumentFragment | null} */
  #o = null;
  #p = 0;
  #c = 0;
  #u = !1;
  /** @type {Set<Effect>} */
  #f = /* @__PURE__ */ new Set();
  /** @type {Set<Effect>} */
  #m = /* @__PURE__ */ new Set();
  /**
   * A source containing the number of pending async deriveds/expressions.
   * Only created if `$effect.pending()` is used inside the boundary,
   * otherwise updating the source results in needless `Batch.ensure()`
   * calls followed by no-op flushes
   * @type {Source<number> | null}
   */
  #d = null;
  #y = v3(() => (this.#d = lo(this.#p), () => {
    this.#d = null;
  }));
  /**
   * @param {TemplateNode} node
   * @param {BoundaryProps} props
   * @param {((anchor: Node) => void)} children
   * @param {((error: unknown) => unknown) | undefined} [transform_error]
   */
  constructor(e, n, r, o) {
    this.#t = e, this.#e = n, this.#l = (i) => {
      var a = (
        /** @type {Effect} */
        rt
      );
      a.b = this, a.f |= Zl, r(i);
    }, this.parent = /** @type {Effect} */
    rt.b, this.transform_error = o ?? this.parent?.transform_error ?? ((i) => i), this.#r = ji(() => {
      this.#h();
    }, _3);
  }
  #v() {
    try {
      this.#i = ln(() => this.#l(this.#t));
    } catch (e) {
      this.error(e);
    }
  }
  /**
   * @param {unknown} error The deserialized error from the server's hydration comment
   */
  #w(e) {
    const n = this.#e.failed, { reset: r, invoke_onerror: o } = this.#b(e);
    Pn(o), n && (this.#a = ln(() => {
      n(
        this.#t,
        () => e,
        () => r
      );
    }));
  }
  /**
   * Creates the `reset` function for a failed boundary, along with a function
   * that invokes `onerror` with it (if provided)
   * @param {unknown} error
   * @returns {{ reset: () => void, invoke_onerror: () => void }}
   */
  #b(e) {
    var n = !1, r = !1;
    const o = () => {
      if (n) {
        pS();
        return;
      }
      n = !0, r && CS(), this.#a !== null && eo(this.#a, () => {
        this.#a = null;
      }), this.#g(() => {
        this.#h();
      });
    };
    return { reset: o, invoke_onerror: () => {
      try {
        r = !0, this.#e.onerror?.(e, o), r = !1;
      } catch (a) {
        Vn(a, this.#r && this.#r.parent);
      }
    } };
  }
  #k() {
    const e = this.#e.pending;
    e && (this.is_pending = !0, this.#n = ln(() => e(this.#t)), Pn(() => {
      var n = this.#o = document.createDocumentFragment(), r = Or(), o = !1;
      if (n.append(r), this.#i = this.#g(() => {
        try {
          return ln(() => this.#l(r));
        } catch (i) {
          try {
            this.error(i), o = !0;
          } catch (a) {
            Vn(a, this.#r.parent);
          }
          return null;
        }
      }), this.#i === null) {
        this.#o = null, o && this.#_(
          /** @type {Batch} */
          Xe
        );
        return;
      }
      this.#c === 0 && (this.#t.before(n), this.#o = null, eo(
        /** @type {Effect} */
        this.#n,
        () => {
          this.#n = null;
        }
      ), this.#_(
        /** @type {Batch} */
        Xe
      ));
    }));
  }
  #h() {
    try {
      if (this.is_pending = this.has_pending_snippet(), this.#c = 0, this.#p = 0, this.#i = ln(() => {
        this.#l(this.#t);
      }), this.#c > 0) {
        var e = this.#o = document.createDocumentFragment();
        fu(this.#i, e);
        const n = (
          /** @type {(anchor: Node) => void} */
          this.#e.pending
        );
        this.#n = ln(() => n(this.#t));
      } else
        this.#_(
          /** @type {Batch} */
          Xe
        );
    } catch (n) {
      this.error(n);
    }
  }
  /**
   * @param {Batch} batch
   */
  #_(e) {
    this.is_pending = !1, e.transfer_effects(this.#f, this.#m);
  }
  /**
   * Defer an effect inside a pending boundary until the boundary resolves
   * @param {Effect} effect
   */
  defer_effect(e) {
    Sp(e, this.#f, this.#m);
  }
  /**
   * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
   * @returns {boolean}
   */
  is_rendered() {
    return !this.is_pending && (!this.parent || this.parent.is_rendered());
  }
  has_pending_snippet() {
    return !!this.#e.pending;
  }
  /**
   * @template T
   * @param {() => T} fn
   */
  #g(e) {
    var n = rt, r = at, o = jt;
    Qn(this.#r), On(this.#r), Do(this.#r.ctx);
    try {
      return Nr.ensure(), e();
    } finally {
      Qn(n), On(r), Do(o);
    }
  }
  /**
   * Updates the pending count associated with the currently visible pending snippet,
   * if any, such that we can replace the snippet with content once work is done
   * @param {1 | -1} d
   * @param {Batch} batch
   */
  #S(e, n) {
    if (!this.has_pending_snippet()) {
      this.parent && this.parent.#S(e, n);
      return;
    }
    this.#c += e, this.#c === 0 && (this.#_(n), this.#n && eo(this.#n, () => {
      this.#n = null;
    }), this.#o && (this.#t.before(this.#o), this.#o = null));
  }
  /**
   * Update the source that powers `$effect.pending()` inside this boundary,
   * and controls when the current `pending` snippet (if any) is removed.
   * Do not call from inside the class
   * @param {1 | -1} d
   * @param {Batch} batch
   */
  update_pending_count(e, n) {
    this.#S(e, n), this.#p += e, !(!this.#d || this.#u) && (this.#u = !0, Pn(() => {
      this.#u = !1, this.#d && No(this.#d, this.#p);
    }));
  }
  get_effect_pending() {
    return this.#y(), s(
      /** @type {Source<number>} */
      this.#d
    );
  }
  /** @param {unknown} error */
  error(e) {
    if (!this.#e.onerror && !this.#e.failed)
      throw e;
    Xe?.is_fork ? (this.#i && Xe.skip_effect(this.#i), this.#n && Xe.skip_effect(this.#n), this.#a && Xe.skip_effect(this.#a), Xe.oncommit(() => {
      this.#x(e);
    })) : this.#x(e);
  }
  /**
   * @param {unknown} error
   */
  #x(e) {
    this.#i && (qt(this.#i), this.#i = null), this.#n && (qt(this.#n), this.#n = null), this.#a && (qt(this.#a), this.#a = null);
    let n = this.#e.failed;
    const r = (o) => {
      const { reset: i, invoke_onerror: a } = this.#b(o);
      a(), n && (this.#a = this.#g(() => {
        try {
          return ln(() => {
            var l = (
              /** @type {Effect} */
              rt
            );
            l.b = this, l.f |= Zl, n(
              this.#t,
              () => o,
              () => i
            );
          });
        } catch (l) {
          return Vn(
            l,
            /** @type {Effect} */
            this.#r.parent
          ), null;
        }
      }));
    };
    Pn(() => {
      var o;
      try {
        o = this.transform_error(e);
      } catch (i) {
        Vn(i, this.#r && this.#r.parent);
        return;
      }
      o !== null && typeof o == "object" && typeof /** @type {any} */
      o.then == "function" ? o.then(
        r,
        /** @param {unknown} e */
        (i) => Vn(i, this.#r && this.#r.parent)
      ) : r(o);
    });
  }
}
function le(t, e) {
  var n = e == null ? "" : typeof e == "object" ? `${e}` : e;
  n !== /** @type {any} */
  (t[Jl] ??= t.nodeValue) && (t[Jl] = n, t.nodeValue = `${n}`);
}
function w3(t, e) {
  return k3(t, e);
}
const ds = /* @__PURE__ */ new Map();
function k3(t, { target: e, anchor: n, props: r = {}, events: o, context: i, intro: a = !0, transformError: l }) {
  GS();
  var c = void 0, d = e3(() => {
    var u = n ?? e.appendChild(Or());
    y3(
      /** @type {TemplateNode} */
      u,
      {
        pending: () => {
        }
      },
      (p) => {
        ot({});
        var m = (
          /** @type {ComponentContext} */
          jt
        );
        i && (m.c = i), o && (r.$$events = o), c = t(p, r) || nu(), it();
      },
      l
    );
    var f = /* @__PURE__ */ new Set(), h = (p) => {
      for (var m = 0; m < p.length; m++) {
        var w = p[m];
        if (!f.has(w)) {
          f.add(w);
          var y = m3(w);
          for (const C of [e, document]) {
            var k = ds.get(C);
            k === void 0 && (k = /* @__PURE__ */ new Map(), ds.set(C, k));
            var O = k.get(w);
            O === void 0 ? (C.addEventListener(w, Ql, { passive: y }), k.set(w, 1)) : k.set(w, O + 1);
          }
        }
      }
    };
    return h(ua(Qp)), Xl.add(h), () => {
      for (var p of f)
        for (const y of [e, document]) {
          var m = (
            /** @type {Map<string, number>} */
            ds.get(y)
          ), w = (
            /** @type {number} */
            m.get(p)
          );
          --w == 0 ? (y.removeEventListener(p, Ql), m.delete(p), m.size === 0 && ds.delete(y)) : m.set(p, w);
        }
      Xl.delete(h), u !== n && u.parentNode?.removeChild(u);
    };
  });
  return $l.set(c, d), c;
}
let $l = /* @__PURE__ */ new WeakMap();
function S3(t, e) {
  const n = $l.get(t);
  return n ? ($l.delete(t), n(e)) : Promise.resolve();
}
class hu {
  /** @type {TemplateNode} */
  anchor;
  /** @type {Map<Batch, Key>} */
  #t = /* @__PURE__ */ new Map();
  /**
   * Map of keys to effects that are currently rendered in the DOM.
   * These effects are visible and actively part of the document tree.
   * Example:
   * ```
   * {#if condition}
   * 	foo
   * {:else}
   * 	bar
   * {/if}
   * ```
   * Can result in the entries `true->Effect` and `false->Effect`
   * @type {Map<Key, Effect>}
   */
  #s = /* @__PURE__ */ new Map();
  /**
   * Similar to #onscreen with respect to the keys, but contains branches that are not yet
   * in the DOM, because their insertion is deferred.
   * @type {Map<Key, Branch>}
   */
  #e = /* @__PURE__ */ new Map();
  /**
   * Keys of effects that are currently outroing
   * @type {Set<Key>}
   */
  #l = /* @__PURE__ */ new Set();
  /**
   * Whether to pause (i.e. outro) on change, or destroy immediately.
   * This is necessary for `<svelte:element>`
   */
  #r = !0;
  /**
   * @param {TemplateNode} anchor
   * @param {boolean} transition
   */
  constructor(e, n = !0) {
    this.anchor = e, this.#r = n;
  }
  /**
   * @param {Batch} batch
   */
  #i = (e) => {
    if (this.#t.has(e)) {
      var n = (
        /** @type {Key} */
        this.#t.get(e)
      ), r = this.#s.get(n);
      if (r)
        Ks(r), this.#l.delete(n);
      else {
        var o = this.#e.get(n);
        o && (Ks(o.effect), this.#s.set(n, o.effect), this.#e.delete(n), o.fragment.lastChild.remove(), this.anchor.before(o.fragment), r = o.effect);
      }
      for (const [i, a] of this.#t) {
        if (this.#t.delete(i), i === e)
          break;
        const l = this.#e.get(a);
        l && (qt(l.effect), this.#e.delete(a));
      }
      for (const [i, a] of this.#s) {
        if (i === n || this.#l.has(i)) continue;
        const l = () => {
          if (Array.from(this.#t.values()).includes(i)) {
            var d = document.createDocumentFragment();
            fu(a, d), d.append(Or()), this.#e.set(i, { effect: a, fragment: d });
          } else
            qt(a);
          this.#l.delete(i), this.#s.delete(i);
        };
        this.#r || !r ? (this.#l.add(i), eo(a, l, !1)) : l();
      }
    }
  };
  /**
   * @param {Batch} batch
   */
  #n = (e) => {
    this.#t.delete(e);
    const n = Array.from(this.#t.values());
    for (const [r, o] of this.#e)
      n.includes(r) || (qt(o.effect), this.#e.delete(r));
  };
  /**
   *
   * @param {any} key
   * @param {null | ((target: TemplateNode) => void)} fn
   */
  ensure(e, n) {
    var r = (
      /** @type {Batch} */
      Xe
    ), o = Np();
    if (n && !this.#s.has(e) && !this.#e.has(e))
      if (o) {
        var i = document.createDocumentFragment(), a = Or();
        i.append(a), this.#e.set(e, {
          effect: ln(() => n(a)),
          fragment: i
        });
      } else
        this.#s.set(
          e,
          ln(() => n(this.anchor))
        );
    if (this.#t.set(r, e), o) {
      for (const [l, c] of this.#s)
        l === e ? r.unskip_effect(c) : r.skip_effect(c);
      for (const [l, c] of this.#e)
        l === e ? r.unskip_effect(c.effect) : r.skip_effect(c.effect);
      r.oncommit(this.#i), r.ondiscard(this.#n);
    } else
      this.#i(r);
  }
}
function tm(t, e, ...n) {
  var r = new hu(t);
  ji(() => {
    const o = e() ?? null;
    r.ensure(o, o && ((i) => o(i, ...n)));
  }, so);
}
function Gt(t) {
  jt === null && eu(), bt(() => {
    const e = dn(t);
    if (typeof e == "function") return (
      /** @type {() => void} */
      e
    );
  });
}
function Wi(t) {
  jt === null && eu(), Gt(() => () => dn(t));
}
function j(t, e, n = !1) {
  var r = new hu(t), o = n ? so : 0;
  function i(a, l) {
    r.ensure(a, l);
  }
  ji(() => {
    var a = !1;
    e((l, c = 0) => {
      a = !0, i(c, l);
    }), a || i(-1, null);
  }, o);
}
const x3 = /* @__PURE__ */ Symbol("NaN");
function Of(t, e, n) {
  var r = new hu(t);
  ji(() => {
    var o = e();
    o !== o && (o = /** @type {any} */
    x3), r.ensure(o, n);
  });
}
function E3(t, e) {
  return e;
}
function T3(t, e, n) {
  for (var r = [], o = e.length, i, a = e.length, l = 0; l < o; l++) {
    let f = e[l];
    eo(
      f,
      () => {
        if (i) {
          if (i.pending.delete(f), i.done.add(f), i.pending.size === 0) {
            var h = (
              /** @type {Set<EachOutroGroup>} */
              t.outrogroups
            );
            ec(t, ua(i.done)), h.delete(i), h.size === 0 && (t.outrogroups = null);
          }
        } else
          a -= 1;
      },
      !1
    );
  }
  if (a === 0) {
    var c = r.length === 0 && n !== null && t.pending.size === 0;
    if (c) {
      var d = (
        /** @type {Element} */
        n
      ), u = (
        /** @type {Element} */
        d.parentNode
      );
      qS(u), u.append(d), t.items.clear();
    }
    ec(t, e, !c);
  } else
    i = {
      pending: new Set(e),
      done: /* @__PURE__ */ new Set()
    }, (t.outrogroups ??= /* @__PURE__ */ new Set()).add(i);
}
function ec(t, e, n = !0) {
  var r;
  if (t.pending.size > 0) {
    r = /* @__PURE__ */ new Set();
    for (const a of t.pending.values())
      for (const l of a)
        r.add(
          /** @type {EachItem} */
          t.items.get(l).e
        );
  }
  for (var o = 0; o < e.length; o++) {
    var i = e[o];
    if (r?.has(i)) {
      i.f |= qn;
      const a = document.createDocumentFragment();
      fu(i, a);
    } else
      qt(e[o], n);
  }
}
var Ff;
function Ze(t, e, n, r, o, i = null) {
  var a = t, l = /* @__PURE__ */ new Map(), c = (e & up) !== 0;
  if (c) {
    var d = (
      /** @type {Element} */
      t
    );
    a = d.appendChild(Or());
  }
  var u = null, f = /* @__PURE__ */ Tp(() => {
    var C = n();
    return (
      /** @type {V[]} */
      ca(C) ? C : C == null ? [] : ua(C)
    );
  }), h, p = /* @__PURE__ */ new Map(), m = !0;
  function w(C) {
    (O.effect.f & un) === 0 && (O.pending.delete(C), O.fallback = u, C3(O, h, a, e, r), u !== null && (h.length === 0 ? (u.f & qn) === 0 ? Ks(u) : (u.f ^= qn, di(u, null, a)) : eo(u, () => {
      u = null;
    })));
  }
  function y(C) {
    O.pending.delete(C);
  }
  var k = ji(() => {
    h = /** @type {V[]} */
    s(f);
    for (var C = h.length, P = /* @__PURE__ */ new Set(), S = (
      /** @type {Batch} */
      Xe
    ), T = Np(), M = 0; M < C; M += 1) {
      var H = h[M], q = r(H, M), R = m ? null : l.get(q);
      R ? (R.v && No(R.v, H), R.i && No(R.i, M), T && S.unskip_effect(R.e)) : (R = A3(
        l,
        m ? a : Ff ??= Or(),
        H,
        q,
        M,
        o,
        e,
        n
      ), m || (R.e.f |= qn), l.set(q, R)), P.add(q);
    }
    if (C === 0 && i && !u && (m ? u = ln(() => i(a)) : (u = ln(() => i(Ff ??= Or())), u.f |= qn)), C > P.size && _S(), !m)
      if (p.set(S, P), T) {
        for (const [K, ie] of l)
          P.has(K) || S.skip_effect(ie.e);
        S.oncommit(w), S.ondiscard(y);
      } else
        w(S);
    s(f);
  }), O = { effect: k, items: l, pending: p, outrogroups: null, fallback: u };
  m = !1;
}
function ri(t) {
  for (; t !== null && (t.f & Mn) === 0; )
    t = t.next;
  return t;
}
function C3(t, e, n, r, o) {
  var i = (r & Gk) !== 0, a = e.length, l = t.items, c = ri(t.effect.first), d, u = null, f, h = [], p = [], m, w, y, k;
  if (i)
    for (k = 0; k < a; k += 1)
      m = e[k], w = o(m, k), y = /** @type {EachItem} */
      l.get(w).e, (y.f & qn) === 0 && (y.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(y));
  for (k = 0; k < a; k += 1) {
    if (m = e[k], w = o(m, k), y = /** @type {EachItem} */
    l.get(w).e, t.outrogroups !== null)
      for (const R of t.outrogroups)
        R.pending.delete(y), R.done.delete(y);
    if ((y.f & sn) !== 0 && (Ks(y), i && (y.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(y))), (y.f & qn) !== 0)
      if (y.f ^= qn, y === c)
        di(y, null, n);
      else {
        var O = u ? u.next : c;
        y === t.effect.last && (t.effect.last = y.prev), y.prev && (y.prev.next = y.next), y.next && (y.next.prev = y.prev), Er(t, u, y), Er(t, y, O), di(y, O, n), u = y, h = [], p = [], c = ri(u.next);
        continue;
      }
    if (y !== c) {
      if (d !== void 0 && d.has(y)) {
        if (h.length < p.length) {
          var C = p[0], P;
          u = C.prev;
          var S = h[0], T = h[h.length - 1];
          for (P = 0; P < h.length; P += 1)
            di(h[P], C, n);
          for (P = 0; P < p.length; P += 1)
            d.delete(p[P]);
          Er(t, S.prev, T.next), Er(t, u, S), Er(t, T, C), c = C, u = T, k -= 1, h = [], p = [];
        } else
          d.delete(y), di(y, c, n), Er(t, y.prev, y.next), Er(t, y, u === null ? t.effect.first : u.next), Er(t, u, y), u = y;
        continue;
      }
      for (h = [], p = []; c !== null && c !== y; )
        (d ??= /* @__PURE__ */ new Set()).add(c), p.push(c), c = ri(c.next);
      if (c === null)
        continue;
    }
    (y.f & qn) === 0 && h.push(y), u = y, c = ri(y.next);
  }
  if (t.outrogroups !== null) {
    for (const R of t.outrogroups)
      R.pending.size === 0 && (ec(t, ua(R.done)), t.outrogroups?.delete(R));
    t.outrogroups.size === 0 && (t.outrogroups = null);
  }
  if (c !== null || d !== void 0) {
    var M = [];
    if (d !== void 0)
      for (y of d)
        (y.f & sn) === 0 && M.push(y);
    for (; c !== null; )
      (c.f & sn) === 0 && c !== t.fallback && M.push(c), c = ri(c.next);
    var H = M.length;
    if (H > 0) {
      var q = (r & up) !== 0 && a === 0 ? n : null;
      if (i) {
        for (k = 0; k < H; k += 1)
          M[k].nodes?.a?.measure();
        for (k = 0; k < H; k += 1)
          M[k].nodes?.a?.fix();
      }
      T3(t, M, q);
    }
  }
  i && Pn(() => {
    if (f !== void 0)
      for (y of f)
        y.nodes?.a?.apply();
  });
}
function A3(t, e, n, r, o, i, a, l) {
  var c = (a & Vk) !== 0 ? (a & qk) === 0 ? /* @__PURE__ */ VS(n, !1, !1) : lo(n) : null, d = (a & Jk) !== 0 ? lo(o) : null;
  return {
    v: c,
    i: d,
    e: ln(() => (i(e, c ?? n, d ?? o, l), () => {
      t.delete(r);
    }))
  };
}
function di(t, e, n) {
  if (t.nodes)
    for (var r = t.nodes.start, o = t.nodes.end, i = e && (e.f & qn) === 0 ? (
      /** @type {EffectNodes} */
      e.nodes.start
    ) : n; r !== null; ) {
      var a = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ Ui(r)
      );
      if (i.before(r), r === o)
        return;
      r = a;
    }
}
function Er(t, e, n) {
  e === null ? t.effect.first = n : e.next = n, n === null ? t.effect.last = e : n.prev = e;
}
function P3(t, e, n) {
  ga(() => {
    var r = dn(() => e(t, n?.()) || {});
    if (n && r?.update) {
      var o = !1, i = (
        /** @type {any} */
        {}
      );
      Yo(() => {
        var a = n();
        s3(a), o && _p(i, a) && (i = a, r.update(a));
      }), o = !0;
    }
    if (r?.destroy)
      return () => (
        /** @type {Function} */
        r.destroy()
      );
  });
}
function I3(t, e) {
  var n = void 0, r;
  Up(() => {
    n !== (n = e()) && (r && (qt(r), r = null), n && (r = ln(() => {
      ga(() => (
        /** @type {(node: Element) => void} */
        n(t)
      ));
    })));
  });
}
function nm(t) {
  var e, n, r = "";
  if (typeof t == "string" || typeof t == "number") r += t;
  else if (typeof t == "object") if (Array.isArray(t)) {
    var o = t.length;
    for (e = 0; e < o; e++) t[e] && (n = nm(t[e])) && (r && (r += " "), r += n);
  } else for (n in t) t[n] && (r && (r += " "), r += n);
  return r;
}
function z3() {
  for (var t, e, n = 0, r = "", o = arguments.length; n < o; n++) (t = arguments[n]) && (e = nm(t)) && (r && (r += " "), r += e);
  return r;
}
function rm(t) {
  return typeof t == "object" ? z3(t) : t ?? "";
}
const Rf = [...` 	
\r\f \v\uFEFF`];
function M3(t, e, n) {
  var r = t == null ? "" : "" + t;
  if (e && (r = r ? r + " " + e : e), n) {
    for (var o of Object.keys(n))
      if (n[o])
        r = r ? r + " " + o : o;
      else if (r.length)
        for (var i = o.length, a = 0; (a = r.indexOf(o, a)) >= 0; ) {
          var l = a + i;
          (a === 0 || Rf.includes(r[a - 1])) && (l === r.length || Rf.includes(r[l])) ? r = (a === 0 ? "" : r.substring(0, a)) + r.substring(l + 1) : a = l;
        }
  }
  return r === "" ? null : r;
}
function Lf(t, e = !1) {
  var n = e ? " !important;" : ";", r = "";
  for (var o of Object.keys(t)) {
    var i = t[o];
    i != null && i !== "" && (r += " " + o + ": " + i + n);
  }
  return r;
}
function sl(t) {
  return t[0] !== "-" || t[1] !== "-" ? t.toLowerCase() : t;
}
function O3(t, e) {
  if (e) {
    var n = "", r, o;
    if (Array.isArray(e) ? (r = e[0], o = e[1]) : r = e, t) {
      t = String(t).replaceAll(/\/\*.*?\*\//g, "").trim();
      var i = !1, a = 0, l = !1, c = [];
      r && c.push(...Object.keys(r).map(sl)), o && c.push(...Object.keys(o).map(sl));
      var d = 0, u = -1;
      const w = t.length;
      for (var f = 0; f < w; f++) {
        var h = t[f];
        if (l ? h === "/" && t[f - 1] === "*" && (l = !1) : i ? i === h && (i = !1) : h === "/" && t[f + 1] === "*" ? l = !0 : h === '"' || h === "'" ? i = h : h === "(" ? a++ : h === ")" && a--, !l && i === !1 && a === 0) {
          if (h === ":" && u === -1)
            u = f;
          else if (h === ";" || f === w - 1) {
            if (u !== -1) {
              var p = sl(t.substring(d, u).trim());
              if (!c.includes(p)) {
                h !== ";" && f++;
                var m = t.substring(d, f).trim();
                n += " " + m + ";";
              }
            }
            d = f + 1, u = -1;
          }
        }
      }
    }
    return r && (n += Lf(r)), o && (n += Lf(o, !0)), n = n.trim(), n === "" ? null : n;
  }
  return t == null ? null : String(t);
}
function Ce(t, e, n, r, o, i) {
  var a = (
    /** @type {any} */
    t[Kl]
  );
  if (a !== n || a === void 0) {
    var l = M3(n, r, i);
    l == null ? t.removeAttribute("class") : e ? t.className = l : t.setAttribute("class", l), t[Kl] = n;
  } else if (i && o !== i)
    for (var c in i) {
      var d = !!i[c];
      (o == null || d !== !!o[c]) && t.classList.toggle(c, d);
    }
  return i;
}
function al(t, e = {}, n, r) {
  for (var o in n) {
    var i = n[o];
    e[o] !== i && (n[o] == null ? t.style.removeProperty(o) : t.style.setProperty(o, i, r));
  }
}
function ht(t, e, n, r) {
  var o = (
    /** @type {any} */
    t[Vl]
  );
  if (o !== e) {
    var i = O3(e, r);
    i == null ? t.removeAttribute("style") : t.style.cssText = i, t[Vl] = e;
  } else r && (Array.isArray(r) ? (al(t, n?.[0], r[0]), al(t, n?.[1], r[1], "important")) : al(t, n, r));
  return r;
}
function om(t, e) {
  e ? t.hasAttribute("selected") || t.setAttribute("selected", "") : t.removeAttribute("selected");
}
function Df(t, e) {
  var n = !("__defaultValue" in t);
  !n && t.__defaultValue === e || (t.__defaultValue = e, im(t, !n || "__value" in t));
}
function im(t, e) {
  var n = t.__defaultValue, r = t.multiple, o = r ? n ?? [] : null;
  if (!(r && !ca(o))) {
    var i = t.selectedIndex, a = e && r ? new Set(t.selectedOptions) : null;
    for (var l of t.options) {
      var c = nc(l);
      om(
        l,
        r ? (
          /** @type {any[]} */
          o.includes(c)
        ) : cu(c, n)
      );
    }
    if (e)
      if (a !== null)
        for (l of t.options) {
          var d = a.has(l);
          l.selected !== d && (l.selected = d);
        }
      else t.selectedIndex !== i && (t.selectedIndex = i);
  }
}
function tc(t, e, n = !1) {
  if (t.multiple) {
    if (e == null)
      return;
    if (!ca(e))
      return gS();
    for (var r of t.options)
      r.selected = e.includes(nc(r));
    return;
  }
  for (r of t.options) {
    var o = nc(r);
    if (cu(o, e)) {
      r.selected = !0;
      return;
    }
  }
  (!n || e !== void 0) && (t.selectedIndex = -1);
}
function F3(t) {
  var e = new MutationObserver((n) => {
    n.every(R3) || ("__defaultValue" in t && im(t, !1), "__value" in t && tc(t, t.__value));
  });
  e.observe(t, {
    // Listen to option element changes
    childList: !0,
    subtree: !0,
    // because of <optgroup>
    // Listen to option element value attribute changes
    // (doesn't get notified of select value changes,
    // because that property is not reflected as an attribute)
    attributes: !0,
    attributeFilter: ["value"]
  }), ha(() => {
    e.disconnect();
  });
}
function nc(t) {
  return "__value" in t ? t.__value : t.value;
}
function R3(t) {
  if (
    /** @type {Element} */
    t.target.closest("selectedcontent") !== null
  )
    return !0;
  if (t.type === "childList") {
    var e = [...t.addedNodes, ...t.removedNodes];
    return e.length > 0 && e.every((n) => n.nodeName === "SELECTEDCONTENT");
  }
  return !1;
}
const fs = /* @__PURE__ */ Symbol("class"), oi = /* @__PURE__ */ Symbol("style"), sm = /* @__PURE__ */ Symbol("is custom element"), am = /* @__PURE__ */ Symbol("is html"), L3 = fa ? "input" : "INPUT", D3 = fa ? "option" : "OPTION", lm = fa ? "select" : "SELECT", N3 = fa ? "progress" : "PROGRESS";
function _n(t, e) {
  var n = gu(t);
  n.value === (n.value = // treat null and undefined the same for the initial value
  e ?? void 0) || // @ts-expect-error
  // `progress` elements always need their value set when it's `0`
  t.value === e && (e !== 0 || t.nodeName !== N3) || (t.value = e ?? "");
}
function N(t, e, n, r) {
  var o = gu(t);
  o[e] !== (o[e] = n) && (e === "loading" && (t[fS] = n), n == null ? t.removeAttribute(e) : typeof n != "string" && cm(t).has(e) ? t[e] = n : t.setAttribute(e, n));
}
function B3(t, e, n, r, o = !1, i = !1) {
  var a = gu(t), l = a[sm], c = !a[am], d = e || {}, u = t.nodeName === D3, f = t.nodeName === lm;
  for (var h in e)
    !(h in n) && h[0] + h[1] !== "$$" && (n[h] = null);
  n.class ? n.class = rm(n.class) : n.class = null, n[oi] && (n.style ??= null);
  var p = cm(t);
  if (t.nodeName === L3 && "type" in n && ("value" in n || "__value" in n)) {
    var m = n.type;
    (m !== d.type || m === void 0 && t.hasAttribute("type")) && (d.type = m, N(t, "type", m));
  }
  for (const S in n) {
    let T = n[S];
    if (u && S === "value" && T == null) {
      t.value = t.__value = "", d[S] = T;
      continue;
    }
    if (S === "class") {
      var w = t.namespaceURI === "http://www.w3.org/1999/xhtml";
      Ce(t, w, T, r, e?.[fs], n[fs]), d[S] = T, d[fs] = n[fs];
      continue;
    }
    if (S === "style") {
      ht(t, T, e?.[oi], n[oi]), d[S] = T, d[oi] = n[oi];
      continue;
    }
    var y = d[S];
    if (!(T === y && !(T === void 0 && t.hasAttribute(S)))) {
      d[S] = T;
      var k = S[0] + S[1];
      if (k !== "$$")
        if (k === "on") {
          const M = {}, H = "$$" + S;
          let q = S.slice(2);
          var O = f3(q);
          if (u3(q) && (q = q.slice(0, -7), M.capture = !0), !O && y) {
            if (T != null) continue;
            t.removeEventListener(q, d[H], M), d[H] = null;
          }
          if (O)
            I(q, t, T), ct([q]);
          else if (T != null) {
            let R = function(K) {
              d[S].call(this, K);
            };
            d[H] = $p(q, t, R, M);
          }
        } else if (S === "style")
          N(t, S, T);
        else if (S === "autofocus")
          ou(
            /** @type {HTMLElement} */
            t,
            !!T
          );
        else if (!l && (S === "__value" || S === "value" && T != null))
          t.value = t.__value = T;
        else if (S === "selected" && u)
          om(
            /** @type {HTMLOptionElement} */
            t,
            T
          );
        else {
          var C = S;
          c || (C = g3(C));
          var P = C === "defaultValue" || C === "defaultChecked";
          if (f && C === "defaultValue") continue;
          if (T == null && !l && !P)
            if (a[S] = null, C === "value" || C === "checked") {
              let M = (
                /** @type {HTMLInputElement} */
                t
              );
              const H = e === void 0;
              if (C === "value") {
                let q = M.defaultValue;
                M.removeAttribute(C), M.defaultValue = q, M.value = M.__value = H ? q : null;
              } else {
                let q = M.defaultChecked;
                M.removeAttribute(C), M.defaultChecked = q, M.checked = H ? q : !1;
              }
            } else
              t.removeAttribute(S);
          else P || (l || typeof T != "string") && p.has(C) ? (t[C] = T, C in a && (a[C] = Nt)) : typeof T != "function" && N(t, C, T);
        }
    }
  }
  return d;
}
function U3(t, e, n = [], r = [], o = [], i, a = !1, l = !1) {
  xp(o, n, r, (c) => {
    var d = void 0, u = {}, f = t.nodeName === lm, h = !1;
    if (Up(() => {
      var m = e(...c.map(s)), w = B3(
        t,
        d,
        m,
        i,
        a,
        l
      );
      if (h && f) {
        var y = (
          /** @type {HTMLSelectElement} */
          t
        );
        "defaultValue" in m && Df(y, m.defaultValue), "value" in m && tc(y, m.value);
      }
      for (let O of Object.getOwnPropertySymbols(u))
        m[O] || qt(u[O]);
      for (let O of Object.getOwnPropertySymbols(m)) {
        var k = m[O];
        O.description === rS && (!d || k !== d[O]) && (u[O] && qt(u[O]), u[O] = ln(() => I3(t, () => k))), w[O] = k;
      }
      d = w;
    }), f) {
      var p = (
        /** @type {HTMLSelectElement} */
        t
      );
      ga(() => {
        var m = (
          /** @type {Record<string | symbol, any>} */
          d
        );
        "defaultValue" in m && Df(p, m.defaultValue), tc(p, m.value, !0), F3(p);
      });
    }
    h = !0;
  });
}
function gu(t) {
  return (
    /** @type {Record<string | symbol, unknown>} **/
    /** @type {any} */
    t[mp] ??= {
      [sm]: t.nodeName.includes("-"),
      [am]: t.namespaceURI === nS
    }
  );
}
var Nf = /* @__PURE__ */ new Map();
function cm(t) {
  var e = t.getAttribute("is") || t.nodeName, n = Nf.get(e);
  if (n) return n;
  Nf.set(e, n = /* @__PURE__ */ new Set());
  for (var r, o = t, i = Element.prototype; i !== o; ) {
    r = hp(o);
    for (var a in r)
      r[a].set && // better safe than sorry, we don't want spread attributes to mess with HTML content
      a !== "innerHTML" && a !== "textContent" && a !== "innerText" && n.add(a);
    o = Xc(o);
  }
  return n;
}
function Zi(t, e, n = e) {
  var r = /* @__PURE__ */ new WeakSet();
  iu(t, "input", async (o) => {
    var i = o ? t.defaultValue : t.value;
    if (i = cl(t) ? ul(i) : i, n(i), Xe !== null && r.add(Xe), await Br(), i !== (i = e())) {
      var a = t.selectionStart, l = t.selectionEnd, c = t.value.length;
      if (t.value = i ?? "", l !== null) {
        var d = t.value.length;
        a === l && l === c && d > c ? (t.selectionStart = d, t.selectionEnd = d) : (t.selectionStart = a, t.selectionEnd = Math.min(l, d));
      }
    }
  }), // If we are hydrating and the value has since changed,
  // then use the updated value from the input instead.
  // If defaultValue is set, then value == defaultValue
  // TODO Svelte 6: remove input.value check and set to empty string?
  dn(e) == null && t.value && (n(cl(t) ? ul(t.value) : t.value), Xe !== null && r.add(Xe)), Yo(() => {
    var o = e();
    if (t === document.activeElement) {
      var i = (
        /** @type {Batch} */
        Xe
      );
      if (r.has(i))
        return;
    }
    cl(t) && o === ul(t.value) || t.type === "date" && !o && !t.value || o !== t.value && (t.value = o ?? "");
  });
}
const ll = /* @__PURE__ */ new Set();
function Bf(t, e, n, r, o = r) {
  var i = n.getAttribute("type") === "checkbox", a = t;
  if (e !== null)
    for (var l of e)
      a = a[l] ??= [];
  a.push(n), iu(
    n,
    "change",
    () => {
      var c = n.__value;
      i && (c = j3(a, c, n.checked)), o(c);
    },
    // TODO better default value handling
    () => o(i ? [] : null)
  ), Yo(() => {
    var c = r();
    i ? (c = c || [], n.checked = c.includes(n.__value)) : n.checked = cu(n.__value, c);
  }), ha(() => {
    var c = a.indexOf(n);
    c !== -1 && a.splice(c, 1);
  }), ll.has(a) || (ll.add(a), Pn(() => {
    a.sort((c, d) => c.compareDocumentPosition(d) === 4 ? -1 : 1), ll.delete(a);
  })), Pn(() => {
  });
}
function Cs(t, e, n = e) {
  iu(t, "change", (r) => {
    var o = r ? t.defaultChecked : t.checked;
    n(o);
  }), // If we are hydrating and the value has since changed,
  // then use the update value from the input instead.
  // If defaultChecked is set, then checked == defaultChecked
  dn(e) == null && n(t.checked), Yo(() => {
    var r = e();
    t.checked = !!r;
  });
}
function j3(t, e, n) {
  for (var r = /* @__PURE__ */ new Set(), o = 0; o < t.length; o += 1)
    t[o].checked && r.add(t[o].__value);
  return n || r.delete(e), Array.from(r);
}
function cl(t) {
  var e = t.type;
  return e === "number" || e === "range";
}
function ul(t) {
  return t === "" ? null : +t;
}
function dl(t, e) {
  return t === e || t?.[ur] === e;
}
function Je(t = nu(), e, n, r) {
  var o = (
    /** @type {ComponentContext} */
    jt.r
  ), i = (
    /** @type {Effect} */
    rt
  );
  return ga(() => {
    var a, l;
    return Yo(() => {
      a = l, l = [], dn(() => {
        dl(n(...l), t) || (e(t, ...l), a && dl(n(...a), t) && e(null, ...a));
      });
    }), () => {
      let c = i;
      for (; c !== o && c.parent !== null && c.parent.f & Us; )
        c = c.parent;
      const d = () => {
        l && dl(n(...l), t) && e(null, ...l);
      }, u = c.teardown;
      c.teardown = () => {
        d(), u?.();
      };
    };
  }), t;
}
function ke(t, e, n, r) {
  var o = !0, i = (n & Qk) !== 0, a = (n & $k) !== 0, l = (
    /** @type {V} */
    r
  ), c = !0, d = (
    /** @type {Derived<V> | undefined} */
    void 0
  ), u = () => a && o ? (d ??= /* @__PURE__ */ Oi(
    /** @type {() => V} */
    r
  ), s(d)) : (c && (c = !1, l = a ? dn(
    /** @type {() => V} */
    r
  ) : (
    /** @type {V} */
    r
  )), l);
  let f;
  if (i) {
    var h = ur in t || dS in t;
    f = To(t, e)?.set ?? (h && e in t ? (P) => t[e] = P : void 0);
  }
  var p, m = !1;
  i ? [p, m] = DS(() => (
    /** @type {V} */
    t[e]
  )) : p = /** @type {V} */
  t[e], p === void 0 && r !== void 0 && (p = u(), f && (SS(), f(p)));
  var w;
  if (w = () => {
    var P = (
      /** @type {V} */
      t[e]
    );
    return P === void 0 ? u() : (c = !0, P);
  }, (n & Xk) === 0)
    return w;
  if (f) {
    var y = t.$$legacy;
    return (
      /** @type {() => V} */
      (function(P, S) {
        return arguments.length > 0 ? ((!S || y || m) && f(S ? w() : P), P) : w();
      })
    );
  }
  var k = !1, O = ((n & Yk) !== 0 ? Oi : Tp)(() => (k = !1, w()));
  i && s(O);
  var C = (
    /** @type {Effect} */
    rt
  );
  return (
    /** @type {() => V} */
    (function(P, S) {
      if (arguments.length > 0) {
        const T = S ? s(O) : i ? ft(P) : P;
        return _(O, T), k = !0, l !== void 0 && (l = T), P;
      }
      return hr && k || (C.f & un) !== 0 ? O.v : s(O);
    })
  );
}
let rc = class {
  __destroy_into_raw() {
    const e = this.__wbg_ptr;
    return this.__wbg_ptr = 0, Uf.unregister(this), e;
  }
  free() {
    const e = this.__destroy_into_raw();
    v.__wbg_drawengine_free(e, 0);
  }
  /**
   * Choose a tool the way a keyboard shortcut does, with the toggle tools' return trip.
   *
   * Separate from `setTool` because a toolbar button must not toggle: it shows the
   * tool as active, so switching away on a second click would contradict the screen.
   * @param {string} tool
   */
  activateTool(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_activateTool(this.__wbg_ptr, n, r);
  }
  /**
   * @param {string} mode
   */
  alignSelection(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_alignSelection(this.__wbg_ptr, n, r);
  }
  /**
   * Merges a peer's elements into the scene by id, last-writer-wins.
   *
   * Use this for anything arriving over the wire. `pasteJson` mints new ids, which
   * is right for a paste and catastrophic for a merge. Optional `order` (live ids)
   * rewrites z-order after the element merge.
   * @param {string} json
   * @returns {boolean}
   */
  applyRemotePatch(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    return v.drawengine_applyRemotePatch(this.__wbg_ptr, n, r) !== 0;
  }
  /**
   * @param {string} json
   */
  applyStyleJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_applyStyleJson(this.__wbg_ptr, n, r);
  }
  beginConversion() {
    v.drawengine_beginConversion(this.__wbg_ptr);
  }
  /**
   * @param {number} sx
   * @param {number} sy
   */
  beginPan(e, n) {
    v.drawengine_beginPan(this.__wbg_ptr, e, n);
  }
  /**
   * @param {number} sx
   * @param {number} sy
   * @param {boolean} additive
   * @param {boolean} duplicate
   */
  beginPointer(e, n, r, o) {
    v.drawengine_beginPointer(this.__wbg_ptr, e, n, r, o);
  }
  /**
   * Starts a right-button pan session, or declines it. See
   * [`DrawEngine::begin_secondary_pan`]; `pointers_down` is the host's count of
   * pointers on the canvas, the one thing the engine cannot know for itself.
   *
   * The answer is the discriminant of `SecondaryPanStart`, which also carries the
   * `preventDefault` decision: the host is not to have that rule of its own.
   * @param {number} sx
   * @param {number} sy
   * @param {number} pointers_down
   * @returns {number}
   */
  beginSecondaryPan(e, n, r) {
    return v.drawengine_beginSecondaryPan(this.__wbg_ptr, e, n, r);
  }
  /**
   * "Bind text to the container": a free text and one empty shape selected.
   */
  bindText() {
    v.drawengine_bindText(this.__wbg_ptr);
  }
  /**
   * @returns {string}
   */
  cameraJson() {
    let e, n;
    try {
      const r = v.drawengine_cameraJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * Where the camera is headed: an eased move's end while one runs, else the camera.
   * @returns {string}
   */
  cameraTargetJson() {
    let e, n;
    try {
      const r = v.drawengine_cameraTargetJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * Whether align would move anything: two units, and no frame selected.
   * @returns {boolean}
   */
  canAlign() {
    return v.drawengine_canAlign(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {boolean}
   */
  canConvertSelection() {
    return v.drawengine_canConvertSelection(this.__wbg_ptr) !== 0;
  }
  /**
   * Whether distribute would move anything: three units, and no frame selected.
   * @returns {boolean}
   */
  canDistribute() {
    return v.drawengine_canDistribute(this.__wbg_ptr) !== 0;
  }
  /**
   * Whether "Unlock all" is on offer: nothing selected, something locked.
   * @returns {boolean}
   */
  canUnlockAll() {
    return v.drawengine_canUnlockAll(this.__wbg_ptr) !== 0;
  }
  cancelPointer() {
    v.drawengine_cancelPointer(this.__wbg_ptr);
  }
  clearSelection() {
    v.drawengine_clearSelection(this.__wbg_ptr);
  }
  clear() {
    v.drawengine_clear(this.__wbg_ptr);
  }
  /**
   * One clipboard copy: whether the host may make it, what to write it as, of what, and
   * the vector payload.
   *
   * The host's two booleans are the only thing it contributes, and they are facts about
   * the browser rather than decisions: `probablySupportsClipboardWriteText` is
   * `"clipboard" in navigator && "writeText" in navigator.clipboard` and
   * `probablySupportsClipboardBlob` adds `"write" in navigator.clipboard &&
   * "ClipboardItem" in window && "toBlob" in HTMLCanvasElement.prototype`
   * (`clipboard.ts@1118751f:65-72`). The oracle reads the same two at its own
   * `predicate` (`actionClipboard.tsx@1118751f:186-188, 247-249`) — except that it
   * reads them off `navigator` itself, which the engine cannot see.
   *
   * There is deliberately **no `selectionOnly`**, and the oracle has none either: both
   * actions pass the literal `true` to `prepareElementsForExport`
   * (`actionClipboard.tsx@1118751f:139, 212`). The scope is the engine's alone
   * (`data/index.ts@1118751f:48-96`), and the payload is the same string a file export
   * of that scope produces, so a host cannot ask for a narrower or a different one.
   *
   * **One call, one scope, one format.** Not both payloads at once: a copy is one
   * format, and a call that built each from a scope of its own would be two element-list
   * decisions where the oracle has one (`prepareElementsForExport` is called once per
   * action, `actionClipboard.tsx@1118751f:136-140` and `:209-213`).
   *
   * `blob` is the raster payload and `text` the vector one; whichever this format is not
   * stays `undefined`. `scope` is `"selection"` or `"scene"` — the oracle's toast word
   * (`actionClipboard.tsx@1118751f:165-167, 225-227`), taken from the scope rather than
   * from the front's own selection count, which is not the same number: a selection of
   * ids that are not on the board is not a selection
   * (`packages/element/src/selection.ts@1118751f:141-143`).
   *
   * `null` for a format this build does not have, which is the boundary's answer rather
   * than a default: an unknown name is a caller's mistake and is worth seeing.
   * @param {string} format
   * @param {boolean} can_write_blob
   * @param {boolean} can_write_text
   * @returns {any}
   */
  clipboardCopy(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we;
    return v.drawengine_clipboardCopy(this.__wbg_ptr, o, i, n, r);
  }
  /**
   * `[[colour, count], …]` over the live board, for the picker's most-used colours.
   * @param {boolean} background
   * @returns {string}
   */
  colorCountsJson(e) {
    let n, r;
    try {
      const o = v.drawengine_colorCountsJson(this.__wbg_ptr, e);
      return n = o[0], r = o[1], Fe(o[0], o[1]);
    } finally {
      v.__wbindgen_free(n, r, 1);
    }
  }
  /**
   * Ends the edit with `text`, as one step. `viaKeyboard` (Escape, Ctrl/Cmd+Enter)
   * leaves the text — or a label's shape — selected.
   * @param {string} text
   * @param {boolean} via_keyboard
   */
  commitTextEdit(e, n) {
    const r = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we;
    v.drawengine_commitTextEdit(this.__wbg_ptr, r, o, n);
  }
  /**
   * Whether a `contextmenu` belongs to a right-button session and must not open the
   * menu. See [`DrawEngine::consumes_context_menu`].
   * @returns {boolean}
   */
  consumesContextMenu() {
    return v.drawengine_consumesContextMenu(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {boolean}
   */
  contentInView() {
    return v.drawengine_contentInView(this.__wbg_ptr) !== 0;
  }
  /**
   * Switches the selection to `to` when it names a type, else a step round:
   * forward for Tab, back for Shift+Tab. Whether anything changed.
   * @param {string | null | undefined} to
   * @param {boolean} forward
   * @returns {boolean}
   */
  convertSelection(e, n) {
    var r = He(e) ? 0 : ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we;
    return v.drawengine_convertSelection(this.__wbg_ptr, r, o, n) !== 0;
  }
  /**
   * @returns {string | undefined}
   */
  copySelection() {
    const e = v.drawengine_copySelection(this.__wbg_ptr);
    let n;
    return e[0] !== 0 && (n = Fe(e[0], e[1]), v.__wbindgen_free(e[0], e[1] * 1, 1)), n;
  }
  /**
   * @returns {boolean}
   */
  copyStyles() {
    return v.drawengine_copyStyles(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {string | undefined}
   */
  cutSelection() {
    const e = v.drawengine_cutSelection(this.__wbg_ptr);
    let n;
    return e[0] !== 0 && (n = Fe(e[0], e[1]), v.__wbindgen_free(e[0], e[1] * 1, 1)), n;
  }
  /**
   * Everything the engine knows about itself, in one call.
   *
   * The scene, geometry, hit testing and selection all live in WASM and none of it is
   * reachable from the DOM, so without this anyone debugging from outside is reduced
   * to inferring state from pixels. This is what `tools/editor-inspector` reads.
   *
   * Merges two sources that cannot be merged anywhere else: the engine's own state,
   * which is runtime-agnostic and knows nothing about clocks, and the render timings,
   * which only exist here because a frame is only visible from the frame loop.
   *
   * `try_borrow` like the rest of the re-entrant surface — a snapshot taken while a
   * frame is in flight returns nothing rather than panicking, and a panic in WASM
   * aborts the instance for the rest of the session.
   * @returns {string}
   */
  debugSnapshotJson() {
    let e, n;
    try {
      const r = v.drawengine_debugSnapshotJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  deleteSelection() {
    v.drawengine_deleteSelection(this.__wbg_ptr);
  }
  destroy() {
    v.drawengine_destroy(this.__wbg_ptr);
  }
  /**
   * @param {string} axis
   */
  distributeSelection(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_distributeSelection(this.__wbg_ptr, n, r);
  }
  /**
   * Ctrl+D: a copy ten units down and right, Excalidraw's `DEFAULT_GRID_SIZE / 2`
   * (`packages/excalidraw/actions/actionDuplicateSelection.tsx@1118751f:78-79`).
   */
  duplicateSelection() {
    v.drawengine_duplicateSelection(this.__wbg_ptr);
  }
  /**
   * Returns whether dynamic size is currently enabled.
   * @returns {boolean}
   */
  dynamicSize() {
    return v.drawengine_dynamicSize(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {boolean}
   */
  editSelectedText() {
    return v.drawengine_editSelectedText(this.__wbg_ptr) !== 0;
  }
  /**
   * The group that has been stepped into, if any.
   * @returns {string | undefined}
   */
  editingGroupId() {
    const e = v.drawengine_editingGroupId(this.__wbg_ptr);
    let n;
    return e[0] !== 0 && (n = Fe(e[0], e[1]), v.__wbindgen_free(e[0], e[1] * 1, 1)), n;
  }
  /**
   * The embeds on screen and where their frames go, as JSON.
   *
   * Screen pixels, because the host positions real `<iframe>` elements over the
   * canvas and the camera is the engine's. A host doing this conversion itself would
   * drift away from the rectangle drawn under it as soon as anyone panned.
   * @returns {string}
   */
  embedFrames() {
    let e, n;
    try {
      const r = v.drawengine_embedFrames(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  endConversion() {
    v.drawengine_endConversion(this.__wbg_ptr);
  }
  /**
   * The pointer left the canvas. See `DrawEngine::end_hover`.
   */
  endHover() {
    v.drawengine_endHover(this.__wbg_ptr);
  }
  endPointer() {
    v.drawengine_endPointer(this.__wbg_ptr);
  }
  /**
   * Ends a right-button pan session and answers what the host owes the menu — the
   * discriminant of `SecondaryPanEnd`. See [`DrawEngine::end_secondary_pan`].
   * @returns {number}
   */
  endSecondaryPan() {
    return v.drawengine_endSecondaryPan(this.__wbg_ptr);
  }
  /**
   * @returns {string}
   */
  exportJson() {
    let e, n;
    try {
      const r = v.drawengine_exportJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * The scene as a PNG, at `scale`, with or without the background, of the selection
   * when `selection_only` says so.
   *
   * A promise, because the canvas is encoded by the browser and `toBlob` is
   * asynchronous — `export.ts@1118751f:198-203` hands back a canvas and the app
   * converts it itself. A `None` scale is 1, and the padding is the oracle's default
   * rather than the SVG path's own.
   *
   * The two are folded into one [`crate::export::ExportOptions`] here rather than passed
   * on separately, so the same struct is what a second format will be asked. `frame_labels`
   * is not a parameter yet: its one consumer is the painter, which reads it off the
   * frame, and the format that would let a person choose it is 4.5's.
   *
   * `selection_only` is the host's whole contribution, and it is the oracle's
   * `exportSelectionOnly` — the dialog's checkbox. It does not say *what* to export: an
   * empty selection with it set is still the scene, and one selected frame is a frame
   * export, because [`crate::export::export_scope`] decides both
   * (`data/index.ts@1118751f:48-96`).
   *
   * `dark_mode` is the dialog's "Dark mode" switch, the oracle's `exportWithDarkMode`
   * (`ImageExportDialog.tsx@1118751f:249-262`), and it puts every colour this picture is
   * painted with through one filter — the canvas path's own
   * `applyDarkModeFilter(element.strokeColor, renderConfig.theme === THEME.DARK)`
   * (`renderElement.ts@1118751f:447-450`) and its `bootstrapCanvas` background
   * (`renderer/helpers.ts@1118751f:115-119`). False by default
   * (`appState.ts@1118751f:72`), which is what makes an export the drawing as shown.
   * @param {number | null} [scale]
   * @param {boolean | null} [transparent]
   * @param {boolean | null} [selection_only]
   * @param {boolean | null} [dark_mode]
   * @returns {Promise<any> | undefined}
   */
  exportPng(e, n, r, o) {
    return v.drawengine_exportPng(this.__wbg_ptr, !He(e), He(e) ? 0 : e, He(n) ? 16777215 : n ? 1 : 0, He(r) ? 16777215 : r ? 1 : 0, He(o) ? 16777215 : o ? 1 : 0);
  }
  /**
   * The scene as an SVG, of the selection when `selection_only` says so.
   *
   * The padding is no longer a parameter and that is the whole change: it was a bare
   * `f64` the host chose, disagreeing with the PNG path's oracle 10 by 6px per side
   * (§2 does not allow the front to pick a margin). It now comes from
   * [`crate::export::ExportOptions`], and a host that wants the old 16 has to say so in
   * engine terms — there is nowhere in this signature left to pass it by accident.
   *
   * `transparent` and `dark_mode` are the same two booleans the PNG binding takes, and
   * the same dialog's two switches (`ImageExportDialog.tsx@1118751f:232-262`). **The SVG
   * had neither before this**: it always wrote its paper `<rect>`, whatever the person
   * had unticked, which is half of what `shortkey.md:450` asks for. The colour of that
   * paper is not a parameter at all — it is the engine's own theme, which is the oracle's
   * arrangement too (`viewBackgroundColor` is app state, read by the export).
   *
   * `transparent` is the switch, not the state, so it is inverted on the way in exactly
   * as the PNG binding inverts it: what the host means is "no background", and
   * `ExportOptions::background` is `exportBackground` (`appState.ts@1118751f:69`).
   * @param {boolean | null} [selection_only]
   * @param {boolean | null} [transparent]
   * @param {boolean | null} [dark_mode]
   * @returns {string | undefined}
   */
  exportSvg(e, n, r) {
    const o = v.drawengine_exportSvg(this.__wbg_ptr, He(e) ? 16777215 : e ? 1 : 0, He(n) ? 16777215 : n ? 1 : 0, He(r) ? 16777215 : r ? 1 : 0);
    let i;
    return o[0] !== 0 && (i = Fe(o[0], o[1]), v.__wbindgen_free(o[0], o[1] * 1, 1)), i;
  }
  /**
   * The whole scene as a thumbnail PNG: longest side at most 480 px, no scene embedded.
   *
   * The scale is [`crate::export::fit_thumbnail`]'s, so the host passes only the dark
   * switch and does no size arithmetic. Same return as `exportPng`: `undefined` where
   * no canvas could be made, a promise of a `Blob` or `null` otherwise.
   * @param {boolean | null} [dark_mode]
   * @returns {Promise<any> | undefined}
   */
  exportThumbnail(e) {
    return v.drawengine_exportThumbnail(this.__wbg_ptr, He(e) ? 16777215 : e ? 1 : 0);
  }
  /**
   * Ends a path being placed, keeping what has been placed so far.
   *
   * Enter's binding and Escape's. Not a discard — see [`DrawEngine::finish_linear`].
   */
  finishLinear() {
    v.drawengine_finishLinear(this.__wbg_ptr);
  }
  /**
   * @param {number | null} [padding]
   */
  fit(e) {
    v.drawengine_fit(this.__wbg_ptr, !He(e), He(e) ? 0 : e);
  }
  /**
   * @param {string} axis
   */
  flipSelection(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_flipSelection(this.__wbg_ptr, n, r);
  }
  /**
   * Escape while creating.
   */
  flowchartCancel() {
    v.drawengine_flowchartCancel(this.__wbg_ptr);
  }
  /**
   * Releasing Ctrl/Cmd: commits the pending cluster as one step of history.
   */
  flowchartCommit() {
    v.drawengine_flowchartCommit(this.__wbg_ptr);
  }
  /**
   * Ctrl/Cmd+Arrow: preview a cluster of new nodes off the selected flowchart node.
   * @param {string} direction
   */
  flowchartCreate(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_flowchartCreate(this.__wbg_ptr, n, r);
  }
  /**
   * Alt+Arrow: selects the connected node in that direction. Returns its id, or `null`.
   * @param {string} direction
   * @returns {string | undefined}
   */
  flowchartNavigate(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we, o = v.drawengine_flowchartNavigate(this.__wbg_ptr, n, r);
    let i;
    return o[0] !== 0 && (i = Fe(o[0], o[1]), v.__wbindgen_free(o[0], o[1] * 1, 1)), i;
  }
  /**
   * Alt released: ends the exploration.
   */
  flowchartNavigationEnd() {
    v.drawengine_flowchartNavigationEnd(this.__wbg_ptr);
  }
  /**
   * While Ctrl/Cmd is held, 1/2/3 as `"rectangle"` / `"diamond"` / `"ellipse"`.
   * @param {string} shape
   */
  flowchartSetShape(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_flowchartSetShape(this.__wbg_ptr, n, r);
  }
  /**
   * The CSS font family a text is drawn with: the family `id`'s stack, or — absent,
   * or an id the engine does not draw with — the system stack of a text with none.
   *
   * The host needs it so its editing overlay renders in the same face; a textarea in
   * a different font shifts the text visibly the moment an edit is committed.
   * @param {number | null} [id]
   * @returns {string}
   */
  fontFamily(e) {
    let n, r;
    try {
      const o = v.drawengine_fontFamily(this.__wbg_ptr, He(e) ? 16777215 : e);
      return n = o[0], r = o[1], Fe(o[0], o[1]);
    } finally {
      v.__wbindgen_free(n, r, 1);
    }
  }
  /**
   * Tells the engine a font face has finished loading: texts in a family are
   * measured again and laid out anew, without an edit — nothing is stamped, saved or
   * undoable (`DrawEngine::fonts_loaded`).
   */
  fontsLoaded() {
    v.drawengine_fontsLoaded(this.__wbg_ptr);
  }
  /**
   * The elements this engine's gesture in progress is changing, as they are right now,
   * as a JSON array — `[]` between gestures. What the host streams to peers while a
   * shape is being drawn, moved or resized.
   * @returns {string}
   */
  gestureElementsJson() {
    let e, n;
    try {
      const r = v.drawengine_gestureElementsJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * The selected text's family id — `0` for the system stack — or the next text's.
   * @returns {number}
   */
  getFontFamily() {
    return v.drawengine_getFontFamily(this.__wbg_ptr);
  }
  /**
   * @returns {number}
   */
  getFontSize() {
    return v.drawengine_getFontSize(this.__wbg_ptr);
  }
  /**
   * @returns {string}
   */
  getGridJson() {
    let e, n;
    try {
      const r = v.drawengine_getGridJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {string}
   */
  getNextFigureJson() {
    let e, n;
    try {
      const r = v.drawengine_getNextFigureJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {string}
   */
  getNextStyleJson() {
    let e, n;
    try {
      const r = v.drawengine_getNextStyleJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {boolean}
   */
  getObjectsSnap() {
    return v.drawengine_getObjectsSnap(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {string}
   */
  getSelectedElementsJson() {
    let e, n;
    try {
      const r = v.drawengine_getSelectedElementsJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {string}
   */
  getSelectionJson() {
    let e, n;
    try {
      const r = v.drawengine_getSelectionJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {string}
   */
  getTextAlign() {
    let e, n;
    try {
      const r = v.drawengine_getTextAlign(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {boolean}
   */
  getToolLocked() {
    return v.drawengine_getToolLocked(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {string}
   */
  getTool() {
    let e, n;
    try {
      const r = v.drawengine_getTool(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @returns {string}
   */
  getVerticalAlign() {
    let e, n;
    try {
      const r = v.drawengine_getVerticalAlign(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  groupSelection() {
    v.drawengine_groupSelection(this.__wbg_ptr);
  }
  /**
   * @param {number} sx
   * @param {number} sy
   */
  handleDoubleClick(e, n) {
    v.drawengine_handleDoubleClick(this.__wbg_ptr, e, n);
  }
  /**
   * @param {number} sx
   * @param {number} sy
   * @param {number} tolerance
   * @returns {string | undefined}
   */
  hitTest(e, n, r) {
    const o = v.drawengine_hitTest(this.__wbg_ptr, e, n, r);
    let i;
    return o[0] !== 0 && (i = Fe(o[0], o[1]), v.__wbindgen_free(o[0], o[1] * 1, 1)), i;
  }
  /**
   * Whether `(sx, sy)` lands inside the padded common bounding box of the current
   * selection, with nothing itself under it — a right-click there opens the element
   * menu on the existing selection instead of the board's
   * ([`DrawEngine::hits_selection_box`]).
   * @param {number} sx
   * @param {number} sy
   * @returns {boolean}
   */
  hitsSelectionBox(e, n) {
    return v.drawengine_hitsSelectionBox(this.__wbg_ptr, e, n) !== 0;
  }
  /**
   * The cursor to show for the pointer at `(sx, sy)`, as a [`crate::HoverCursor`] code.
   *
   * A `u8` rather than a string: this is called on every pointer move, and returning
   * a `String` would allocate in Rust and again in JS, hundreds of times a second,
   * almost always to say the same thing as last time.
   *
   * `try_borrow` rather than `borrow`, like the rest of the re-entrant surface — a
   * pointer event that arrives while the engine is mid-frame must not panic, because a
   * panic aborts the WASM instance and the canvas never recovers. A missed cursor
   * update is invisible; the next mouse move fixes it.
   * @param {number} sx
   * @param {number} sy
   * @returns {number}
   */
  hoverCursor(e, n) {
    return v.drawengine_hoverCursor(this.__wbg_ptr, e, n);
  }
  /**
   * A pointer move with no button held. See `DrawEngine::hover_pointer`.
   * @param {number} sx
   * @param {number} sy
   */
  hoverPointer(e, n) {
    v.drawengine_hoverPointer(this.__wbg_ptr, e, n);
  }
  /**
   * Track B: the command palette's "Add rectangle / diamond / ellipse" — a default-sized
   * shape centred at the **screen** point `(sx, sy)`, selected, one step of history
   * (`DrawEngine::insert_default_shape`). `undefined` for any kind the palette does not
   * offer.
   * @param {string} kind
   * @param {number} sx
   * @param {number} sy
   * @returns {string | undefined}
   */
  insertDefaultShape(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we, a = v.drawengine_insertDefaultShape(this.__wbg_ptr, o, i, n, r);
    let l;
    return a[0] !== 0 && (l = Fe(a[0], a[1]), v.__wbindgen_free(a[0], a[1] * 1, 1)), l;
  }
  /**
   * Put an embed on the board. `raw_url` is whatever the person pasted.
   *
   * Whether the host may be framed at all, and what the pasted page rewrites to, are
   * the engine's to decide — a host that resolved links itself could frame something
   * the rules would have refused. Returns the new element's id, or `undefined`.
   * @param {string} raw_url
   * @param {number} sx
   * @param {number} sy
   * @returns {string | undefined}
   */
  insertEmbed(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we, a = v.drawengine_insertEmbed(this.__wbg_ptr, o, i, n, r);
    let l;
    return a[0] !== 0 && (l = Fe(a[0], a[1]), v.__wbindgen_free(a[0], a[1] * 1, 1)), l;
  }
  /**
   * Put a decoded image on the board.
   *
   * The host decodes the file — only a browser can — and having done so already knows
   * the natural size. Everything after that is arithmetic and happens in the engine,
   * so two frontends dropping the same file in the same place produce the same
   * element. Returns the new element's id, or `undefined` if the image could not be
   * measured.
   * @param {string} data_url
   * @param {number} natural_width
   * @param {number} natural_height
   * @param {number} sx
   * @param {number} sy
   * @returns {string | undefined}
   */
  insertImage(e, n, r, o, i) {
    const a = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), l = we, c = v.drawengine_insertImage(this.__wbg_ptr, a, l, n, r, o, i);
    let d;
    return c[0] !== 0 && (d = Fe(c[0], c[1]), v.__wbindgen_free(c[0], c[1] * 1, 1)), d;
  }
  /**
   * [`DrawEngine::insert_json`]: a scene made elsewhere, placed with its labels laid out.
   * @param {string} json
   * @param {number | null} [x]
   * @param {number | null} [y]
   * @returns {boolean}
   */
  insertJson(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we;
    return v.drawengine_insertJson(this.__wbg_ptr, o, i, !He(n), He(n) ? 0 : n, !He(r), He(r) ? 0 : r) !== 0;
  }
  /**
   * @returns {boolean}
   */
  isCreatingFlowchart() {
    return v.drawengine_isCreatingFlowchart(this.__wbg_ptr) !== 0;
  }
  /**
   * Whether a line or arrow is being placed point by point right now.
   *
   * The host needs this every pointer move, because a path is the one thing in the
   * engine that follows the cursor with **no button held** — so while it is true the
   * canvas has to keep forwarding moves it would otherwise drop.
   *
   * `try_borrow` for the same reason [`Self::hover_cursor`] uses it: this is on the
   * pointer-move path, and a panic there aborts the WASM instance for good.
   * @returns {boolean}
   */
  linearInProgress() {
    return v.drawengine_linearInProgress(this.__wbg_ptr) !== 0;
  }
  /**
   * @param {string} json
   * @returns {boolean}
   */
  loadScene(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    return v.drawengine_loadScene(this.__wbg_ptr, n, r) !== 0;
  }
  /**
   * The size of a run of text, in world units, using the font the canvas draws with.
   *
   * Exposed so the host's editing overlay can size itself from the same measurement
   * the element gets, instead of estimating. It had its own guess —
   * `maxLineLength * fontSize * 0.65` — so the textarea, the painted glyphs and the
   * element's own box were three different widths.
   *
   * `family` is an Excalidraw family id; absent, or one the engine does not draw
   * with, measures in the system stack a text with no family is drawn in.
   *
   * Returns `[width, height]`.
   * @param {string} text
   * @param {number} font_size
   * @param {number | null} [family]
   * @returns {Float64Array}
   */
  measureText(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we, a = v.drawengine_measureText(this.__wbg_ptr, o, i, n, He(r) ? 16777215 : r);
    var l = pu(a[0], a[1]).slice();
    return v.__wbindgen_free(a[0], a[1] * 8, 8), l;
  }
  /**
   * @param {number} sx
   * @param {number} sy
   * @param {boolean} square
   * @param {boolean} invert_snap
   */
  movePointer(e, n, r, o) {
    v.drawengine_movePointer(this.__wbg_ptr, e, n, r, o);
  }
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(e) {
    const n = v.drawengine_new(e);
    if (n[2])
      throw e9(n[1]);
    return this.__wbg_ptr = n[0], Uf.register(this, this.__wbg_ptr, this), this;
  }
  /**
   * @param {number} dx
   * @param {number} dy
   */
  nudgeSelection(e, n) {
    v.drawengine_nudgeSelection(this.__wbg_ptr, e, n);
  }
  /**
   * How far one arrow key moves the selection — see `engine/arrange.rs`.
   * @param {boolean} shift
   * @returns {number}
   */
  nudgeStep(e) {
    return v.drawengine_nudgeStep(this.__wbg_ptr, e);
  }
  /**
   * Move by a screenful. `pages_x`/`pages_y` are counts, so -1 is one page back.
   * @param {number} pages_x
   * @param {number} pages_y
   */
  pageBy(e, n) {
    v.drawengine_pageBy(this.__wbg_ptr, e, n);
  }
  /**
   * How the last frames were served: `{redraws, scrolls, reuses}`, then reset.
   *
   * A diagnostic, not an API. The static layer is either being reused or it is not,
   * and from outside the engine those two look identical until something is measured
   * against the wrong assumption.
   * @returns {string}
   */
  paintStatsJson() {
    let e, n;
    try {
      const r = v.drawengine_paintStatsJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * Timings for the most recent frame, as JSON.
   *
   * Exists because a frame measured from outside is just the rAF interval — the
   * display cadence plus everything else on the page — which cannot tell our paint
   * apart from the browser's own work. Three separate guesses at a slow frame were
   * wrong before this existed.
   * @returns {string}
   */
  paintStats() {
    let e, n;
    try {
      const r = v.drawengine_paintStats(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * @param {number} dx
   * @param {number} dy
   */
  panBy(e, n) {
    v.drawengine_panBy(this.__wbg_ptr, e, n);
  }
  /**
   * @param {string | null} [json]
   * @param {number | null} [x]
   * @param {number | null} [y]
   * @returns {boolean}
   */
  pasteJson(e, n, r) {
    var o = He(e) ? 0 : ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we;
    return v.drawengine_pasteJson(this.__wbg_ptr, o, i, !He(n), He(n) ? 0 : n, !He(r), He(r) ? 0 : r) !== 0;
  }
  pasteStyles() {
    v.drawengine_pasteStyles(this.__wbg_ptr);
  }
  /**
   * [`DrawEngine::paste_text`]: plain text as text elements, one per line, centred on
   * the **world** point `(x, y)` — what the host hands `pasteJson` too. The other branch
   * of a paste: a clipboard that is not this app's own element JSON is text.
   * @param {string} text
   * @param {number | null} [x]
   * @param {number | null} [y]
   * @returns {boolean}
   */
  pasteText(e, n, r) {
    const o = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), i = we;
    return v.drawengine_pasteText(this.__wbg_ptr, o, i, !He(n), He(n) ? 0 : n, !He(r), He(r) ? 0 : r) !== 0;
  }
  /**
   * The id of the peer holding what is under `(sx, sy)`, if someone does — so a click
   * on something in use can say who is using it.
   * @param {number} sx
   * @param {number} sy
   * @returns {string | undefined}
   */
  peerAt(e, n) {
    const r = v.drawengine_peerAt(this.__wbg_ptr, e, n);
    let o;
    return r[0] !== 0 && (o = Fe(r[0], r[1]), v.__wbindgen_free(r[0], r[1] * 1, 1)), o;
  }
  /**
   * Where a peer's laser pointer is, in world units, and whether they are pressing it:
   * their trail is drawn here in their colour, as it is on their screen.
   *
   * On the clock read now, not the last frame's: an idle board paints no frames, and a
   * point stamped with a stale time would be old enough to have faded on arrival.
   * @param {string} id
   * @param {string} color
   * @param {number} x
   * @param {number} y
   * @param {boolean} down
   */
  peerLaser(e, n, r, o, i) {
    const a = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), l = we, c = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), d = we;
    v.drawengine_peerLaser(this.__wbg_ptr, a, l, c, d, r, o, i);
  }
  /**
   * The pending cluster, for a host that wants to show it outside the canvas painter
   * (the shape-chooser strip's position, an inspector, a test).
   * @returns {string}
   */
  pendingFlowchartElementsJson() {
    let e, n;
    try {
      const r = v.drawengine_pendingFlowchartElementsJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * The font picker's hover: a family shown on the selected texts uncommitted, or —
   * with none — what the last hover changed given back. `setFontFamily` commits.
   * @param {number | null} [family]
   */
  previewFontFamily(e) {
    v.drawengine_previewFontFamily(this.__wbg_ptr, He(e) ? 16777215 : e);
  }
  /**
   * Shows a style without committing it — a slider in motion. `applyStyleJson` commits.
   * @param {string} json
   */
  previewStyleJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_previewStyleJson(this.__wbg_ptr, n, r);
  }
  redo() {
    v.drawengine_redo(this.__wbg_ptr);
  }
  /**
   * Commits a frame's name, trimmed, as one step — the host's input over the name
   * label calls this on Enter, blur or Escape alike. Emptied, the name falls back to
   * the generic default. See `FrameRenameRequest`.
   * @param {string} id
   * @param {string} name
   */
  renameFrame(e, n) {
    const r = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we, i = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), a = we;
    v.drawengine_renameFrame(this.__wbg_ptr, r, o, i, a);
  }
  /**
   * @param {string} mode
   */
  reorderSelection(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_reorderSelection(this.__wbg_ptr, n, r);
  }
  /**
   * Whether a pasted link can be embedded, and what it resolves to, as JSON.
   *
   * Lets a host tell someone their link will not work *before* it puts an empty box
   * on the board for them.
   * @param {string} raw_url
   * @returns {string | undefined}
   */
  resolveEmbed(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we, o = v.drawengine_resolveEmbed(this.__wbg_ptr, n, r);
    let i;
    return o[0] !== 0 && (i = Fe(o[0], o[1]), v.__wbindgen_free(o[0], o[1] * 1, 1)), i;
  }
  /**
   * The scene in a saved file, loaded — or why it could not be.
   *
   * The other door beside `loadScene`, and the one the oracle's `decodePngMetadata`
   * (`data/image.ts@1118751f:49-71`) and `decodeSvgBase64Payload`
   * (`export.ts@1118751f:531-563`) are. What the bytes *are* is the engine's question
   * and is answered in Rust: this takes a `File`'s bytes and nothing else, so a host
   * cannot pick a container, a key, or a reading of a bad chunk.
   *
   * **The scene is loaded here rather than handed back.** Two answers were available: a
   * result object the host then feeds to `loadScene`, or this. The first puts the whole
   * thing at risk in one line of the front — a host that forgot the second call would
   * open a file and see the board it already had, which is the same silence as a blank
   * board. Here a refusal cannot touch the scene at all, because the scene is replaced
   * on the one path that succeeded and on no other.
   *
   * `{ restored: true }`, or `{ refused: "malformed" | "not-ours" | "unreadable" }` —
   * the engine's three answers, and the host's whole job is to say one to a person.
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  restoreFromImage(e) {
    const n = Q3(e, v.__wbindgen_malloc), r = we;
    return v.drawengine_restoreFromImage(this.__wbg_ptr, n, r);
  }
  /**
   * The families the board's texts use, each once: the picker's "In this scene".
   * @returns {Uint8Array}
   */
  sceneFontFamilies() {
    const e = v.drawengine_sceneFontFamilies(this.__wbg_ptr);
    var n = oc(e[0], e[1]).slice();
    return v.__wbindgen_free(e[0], e[1] * 1, 1), n;
  }
  selectAll() {
    v.drawengine_selectAll(this.__wbg_ptr);
  }
  /**
   * What a right-click selects: `id` with its group (`DrawEngine::select_element`).
   * @param {string} id
   */
  selectElement(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_selectElement(this.__wbg_ptr, n, r);
  }
  /**
   * @param {string} json
   */
  selectJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_selectJson(this.__wbg_ptr, n, r);
  }
  /**
   * @returns {boolean}
   */
  selectionIsGroup() {
    return v.drawengine_selectionIsGroup(this.__wbg_ptr) !== 0;
  }
  /**
   * @returns {boolean}
   */
  selectionLocked() {
    return v.drawengine_selectionLocked(this.__wbg_ptr) !== 0;
  }
  /**
   * Everything the properties panel shows, in one call. Ask once per `styleRevision`.
   * @returns {string}
   */
  selectionStyleJson() {
    let e, n;
    try {
      const r = v.drawengine_selectionStyleJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * Snapping to other elements while moving. Off by default; see
   * `DrawEngine::set_objects_snap`.
   * Alt, as held during the pointer move about to be reported. The eraser reads it
   * to un-mark; see `DrawEngine::set_alt_held`.
   * @param {boolean} held
   */
  setAltHeld(e) {
    v.drawengine_setAltHeld(this.__wbg_ptr, e);
  }
  /**
   * `"sharp"`, `"round"` or `"elbow"` for the selected arrows and the next one. Anything
   * else is ignored.
   * @param {string} arrow_type
   */
  setArrowType(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setArrowType(this.__wbg_ptr, n, r);
  }
  /**
   * @param {string} json
   */
  setArrowheadsJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setArrowheadsJson(this.__wbg_ptr, n, r);
  }
  /**
   * Ctrl/Cmd, as held for the pointer event about to be reported: an arrow binds to
   * nothing while it is down. See `DrawEngine::set_ctrl_held`.
   * @param {boolean} held
   */
  setCtrlHeld(e) {
    v.drawengine_setCtrlHeld(this.__wbg_ptr, e);
  }
  /**
   * Turns dynamic size on or off. When on, elements created while zoomed out get a
   * sizeScale so they look the same on screen as at 100% zoom.
   * @param {boolean} on
   */
  setDynamicSize(e) {
    v.drawengine_setDynamicSize(this.__wbg_ptr, e);
  }
  /**
   * @param {string} id
   * @param {string} text
   */
  setElementText(e, n) {
    const r = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we, i = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), a = we;
    v.drawengine_setElementText(this.__wbg_ptr, r, o, i, a);
  }
  /**
   * Point embed `id` at another link, resolved by the same rules as `insertEmbed`.
   * Returns whether it changed.
   * @param {string} id
   * @param {string} raw_url
   * @returns {boolean}
   */
  setEmbedUrl(e, n) {
    const r = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we, i = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), a = we;
    return v.drawengine_setEmbedUrl(this.__wbg_ptr, r, o, i, a) !== 0;
  }
  /**
   * An Excalidraw family id for the selected text, or for the next text when nothing
   * is selected. An id the engine does not draw with is ignored.
   * @param {number} family
   */
  setFontFamily(e) {
    v.drawengine_setFontFamily(this.__wbg_ptr, e);
  }
  /**
   * @param {number} size
   */
  setFontSize(e) {
    v.drawengine_setFontSize(this.__wbg_ptr, e);
  }
  /**
   * Replaces the grid settings.
   *
   * Takes JSON so the shape can gain fields without breaking the binding — the grid
   * gained `snap` separately from `enabled` for exactly that reason.
   * @param {string} json
   */
  setGridJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setGridJson(this.__wbg_ptr, n, r);
  }
  /**
   * Selected labels wrap inside their shape (`true`) or keep their lines and widen it.
   * @param {boolean} wrap
   */
  setLabelWrap(e) {
    v.drawengine_setLabelWrap(this.__wbg_ptr, e);
  }
  /**
   * The Shapes picker: which figure — kind, sides, ratio — the tool draws next.
   * @param {string} json
   */
  setNextFigureJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setNextFigureJson(this.__wbg_ptr, n, r);
  }
  /**
   * @param {string} json
   */
  setNextStyleJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setNextStyleJson(this.__wbg_ptr, n, r);
  }
  /**
   * @param {boolean} on
   */
  setObjectsSnap(e) {
    v.drawengine_setObjectsSnap(this.__wbg_ptr, e);
  }
  /**
   * @param {Function | null} [cb]
   */
  setOnCameraChange(e) {
    v.drawengine_setOnCameraChange(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * Something the person should be told, as a stable code.
   *
   * A code and not a sentence: the wording, the language and the room it has to fit in
   * are the host's to decide, and a headless host is free to ignore it entirely.
   * @param {Function | null} [cb]
   */
  setOnNotice(e) {
    v.drawengine_setOnNotice(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * A double click opened the input over a frame's name label — see
   * `FrameRenameRequest`. The host commits with `renameFrame`.
   * @param {Function | null} [cb]
   */
  setOnRequestFrameRename(e) {
    v.drawengine_setOnRequestFrameRename(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * @param {Function | null} [cb]
   */
  setOnRequestTextEdit(e) {
    v.drawengine_setOnRequestTextEdit(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * @param {Function | null} [cb]
   */
  setOnSceneChange(e) {
    v.drawengine_setOnSceneChange(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * @param {Function | null} [cb]
   */
  setOnSelectionChange(e) {
    v.drawengine_setOnSelectionChange(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * @param {Function | null} [cb]
   */
  setOnToolChange(e) {
    v.drawengine_setOnToolChange(this.__wbg_ptr, He(e) ? 0 : Yt(e));
  }
  /**
   * Tells the engine who else is in the room, what they hold and what their gesture in
   * progress looks like: a JSON array of [`crate::engine::Peer`]. See `engine/peers.rs`.
   * Anything unreadable is ignored rather than clearing the peers — a malformed frame
   * from one peer must not release everyone's holds.
   * @param {string} json
   */
  setPeers(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setPeers(this.__wbg_ptr, n, r);
  }
  /**
   * Numbers the frames `json` lists (a JSON array of ids) 0, 1, 2… on the presentation
   * path, as one step. See `DrawEngine::set_presentation_path`.
   * @param {string} json
   */
  setPresentationPath(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setPresentationPath(this.__wbg_ptr, n, r);
  }
  /**
   * `prefers-reduced-motion`: the host reads `matchMedia` (WASM cannot) and keeps this
   * current. An eased camera move — Shift+1/2, zoom in/out/reset, fit — lands at once
   * rather than animating while it is set.
   * @param {boolean} on
   */
  setReducedMotion(e) {
    v.drawengine_setReducedMotion(this.__wbg_ptr, e);
  }
  /**
   * @param {string} json
   */
  setSceneJson(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setSceneJson(this.__wbg_ptr, n, r);
  }
  /**
   * `"left"`, `"center"` or `"right"`. Anything else is ignored rather than coerced,
   * so a typo in the host is a control that does nothing instead of a scene holding a
   * value the engine will not read back.
   * @param {string} align
   */
  setTextAlign(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setTextAlign(this.__wbg_ptr, n, r);
  }
  /**
   * Selected free texts size to their text (`true`) or keep a fixed width (`false`).
   * @param {boolean} auto_resize
   */
  setTextAutoResize(e) {
    v.drawengine_setTextAutoResize(this.__wbg_ptr, e);
  }
  /**
   * Re-widths a dragged-out text column and re-wraps it. Ignored for auto-sizing
   * text, which has no width of its own to impose.
   * @param {string} id
   * @param {number} width
   */
  setTextBoxWidth(e, n) {
    const r = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), o = we;
    v.drawengine_setTextBoxWidth(this.__wbg_ptr, r, o, n);
  }
  /**
   * [`setTextAutoResize`](Self::set_text_auto_resize) and
   * [`setLabelWrap`](Self::set_label_wrap) together, as one step of undo: the wrap
   * row's own sense, `true` for "Wrap", `false` for "Grow".
   * @param {boolean} wrap
   */
  setTextWrap(e) {
    v.drawengine_setTextWrap(this.__wbg_ptr, e);
  }
  /**
   * @param {string} json
   */
  setTheme(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setTheme(this.__wbg_ptr, n, r);
  }
  /**
   * @param {boolean} locked
   */
  setToolLocked(e) {
    v.drawengine_setToolLocked(this.__wbg_ptr, e);
  }
  /**
   * @param {string} tool
   */
  setTool(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setTool(this.__wbg_ptr, n, r);
  }
  /**
   * `"top"`, `"middle"` or `"bottom"`.
   * @param {string} align
   */
  setVerticalAlign(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    v.drawengine_setVerticalAlign(this.__wbg_ptr, n, r);
  }
  /**
   * How far the host's own UI reaches over each side of the canvas, in CSS pixels —
   * measured by the host, which has the layout. A flowchart reveal keeps clear of it.
   * @param {number} top
   * @param {number} right
   * @param {number} bottom
   * @param {number} left
   */
  setViewportOffsets(e, n, r, o) {
    v.drawengine_setViewportOffsets(this.__wbg_ptr, e, n, r, o);
  }
  /**
   * @param {number} width
   * @param {number} height
   * @param {number} dpr
   */
  setViewport(e, n, r) {
    v.drawengine_setViewport(this.__wbg_ptr, e, n, r);
  }
  /**
   * The type the panel shows pressed: `"rectangle"`, `"line"`, `"sharpArrow"`,
   * `"curvedArrow"`, `"elbowArrow"`, and nothing when the selection disagrees on it or
   * holds nothing to switch.
   * @returns {string | undefined}
   */
  sharedConversionType() {
    const e = v.drawengine_sharedConversionType(this.__wbg_ptr);
    let n;
    return e[0] !== 0 && (n = Fe(e[0], e[1]), v.__wbindgen_free(e[0], e[1] * 1, 1)), n;
  }
  /**
   * Ctrl/Cmd+Shift+> (`true`) and < (`false`): the selected texts a tenth bigger or
   * smaller, each from its own size.
   * @param {boolean} increase
   */
  stepFontSize(e) {
    v.drawengine_stepFontSize(this.__wbg_ptr, e);
  }
  /**
   * Moves whenever `selectionStyleJson` may have.
   * @returns {number}
   */
  styleRevision() {
    return v.drawengine_styleRevision(this.__wbg_ptr) >>> 0;
  }
  /**
   * Where the open text is and how it looks (`TextEditLayout`), as JSON — empty when
   * none is open.
   * @returns {string}
   */
  textEditLayoutJson() {
    let e, n;
    try {
      const r = v.drawengine_textEditLayoutJson(this.__wbg_ptr);
      return e = r[0], n = r[1], Fe(r[0], r[1]);
    } finally {
      v.__wbindgen_free(e, n, 1);
    }
  }
  /**
   * The text element `id` as it would be with `text` in it, uncommitted, as JSON —
   * empty when `id` is not a text. What a host on the one-shot `setElementText` shows
   * peers while typing; on the session, `gestureElementsJson` carries it.
   * @param {string} id
   * @param {string} text
   * @returns {string}
   */
  textPreviewJson(e, n) {
    let r, o;
    try {
      const i = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), a = we, l = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), c = we, d = v.drawengine_textPreviewJson(this.__wbg_ptr, i, a, l, c);
      return r = d[0], o = d[1], Fe(d[0], d[1]);
    } finally {
      v.__wbindgen_free(r, o, 1);
    }
  }
  /**
   * Ctrl+G: group what is loose, ungroup what is already exactly one group.
   *
   * A deliberate divergence — the oracle's Ctrl+G is a no-op on a grouped selection,
   * which leaves the key with no inverse. See `docs/reference/groups.md`.
   */
  toggleGroupSelection() {
    v.drawengine_toggleGroupSelection(this.__wbg_ptr);
  }
  toggleLockSelection() {
    v.drawengine_toggleLockSelection(this.__wbg_ptr);
  }
  /**
   * Closes the selected line(s) into filled polygons, or opens them back up. Whether
   * this would do anything (`canTogglePolygon`) and whether the toggle should show
   * pressed (`isPolygon`) are both read off `selectionStyle()`, in one pass with the
   * rest of the panel — not asked for here.
   */
  togglePolygon() {
    v.drawengine_togglePolygon(this.__wbg_ptr);
  }
  /**
   * "Unbind text": each selected shape's label becomes free text.
   */
  unbindText() {
    v.drawengine_unbindText(this.__wbg_ptr);
  }
  undo() {
    v.drawengine_undo(this.__wbg_ptr);
  }
  ungroupSelection() {
    v.drawengine_ungroupSelection(this.__wbg_ptr);
  }
  /**
   * The board menu's "Unlock all" (`DrawEngine::unlock_all`).
   */
  unlockAll() {
    v.drawengine_unlockAll(this.__wbg_ptr);
  }
  /**
   * The open text with `text` typed into it, laid out and its shape grown, without a
   * step or a stamp. `false` when no text is open: the editor has nothing to type into.
   * @param {string} text
   * @returns {boolean}
   */
  updateTextEdit(e) {
    const n = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), r = we;
    return v.drawengine_updateTextEdit(this.__wbg_ptr, n, r) !== 0;
  }
  /**
   * Replaces the image `image_id` with one picture, the SVG `data:` URL `data_url`, in
   * the same box. Returns `{"id":"…"}` or `{"refused":"…"}`.
   * @param {string} image_id
   * @param {string} data_url
   * @param {string} options_json
   * @returns {string}
   */
  vectorizeToPicture(e, n, r) {
    let o, i;
    try {
      const a = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), l = we, c = ze(n, v.__wbindgen_malloc, v.__wbindgen_realloc), d = we, u = ze(r, v.__wbindgen_malloc, v.__wbindgen_realloc), f = we, h = v.drawengine_vectorizeToPicture(this.__wbg_ptr, a, l, c, d, u, f);
      return o = h[0], i = h[1], Fe(h[0], h[1]);
    } finally {
      v.__wbindgen_free(o, i, 1);
    }
  }
  /**
   * Replaces the image `image_id` with its traced rings — draw-trace's
   * `TraceSession.rings()`, as three typed arrays — as a group of filled lines.
   * `options_json` is a `VectorizeOptions`. Returns `{"ids":[…]}` or `{"refused":"…"}`.
   * @param {string} image_id
   * @param {Uint32Array} colours
   * @param {Uint32Array} lengths
   * @param {Float64Array} coords
   * @param {string} options_json
   * @returns {string}
   */
  vectorizeToShapes(e, n, r, o, i) {
    let a, l;
    try {
      const c = ze(e, v.__wbindgen_malloc, v.__wbindgen_realloc), d = we, u = Wf(n, v.__wbindgen_malloc), f = we, h = Wf(r, v.__wbindgen_malloc), p = we, m = $3(o, v.__wbindgen_malloc), w = we, y = ze(i, v.__wbindgen_malloc, v.__wbindgen_realloc), k = we, O = v.drawengine_vectorizeToShapes(this.__wbg_ptr, c, d, u, f, h, p, m, w, y, k);
      return a = O[0], l = O[1], Fe(O[0], O[1]);
    } finally {
      v.__wbindgen_free(a, l, 1);
    }
  }
  /**
   * Whether pointer moves arriving with no button of the host's own down are wanted.
   * See [`DrawEngine::wants_pointer_moves`].
   * @returns {boolean}
   */
  wantsPointerMoves() {
    return v.drawengine_wantsPointerMoves(this.__wbg_ptr) !== 0;
  }
  /**
   * One wheel event's worth of zoom, anchored at the cursor.
   *
   * Takes the raw `WheelEvent.deltaY` rather than a factor the host worked out: what a
   * wheel delta is worth differs per browser and per device, and it is arithmetic, so
   * it belongs here where every host shares one answer.
   * @param {number} sx
   * @param {number} sy
   * @param {number} delta_y
   */
  wheelZoom(e, n, r) {
    v.drawengine_wheelZoom(this.__wbg_ptr, e, n, r);
  }
  /**
   * "Wrap text in a container": a rectangle around each selected free text.
   */
  wrapTextInContainer() {
    v.drawengine_wrapTextInContainer(this.__wbg_ptr);
  }
  /**
   * @param {number} sx
   * @param {number} sy
   * @param {number} factor
   */
  zoomAt(e, n, r) {
    v.drawengine_zoomAt(this.__wbg_ptr, e, n, r);
  }
  zoomIn() {
    v.drawengine_zoomIn(this.__wbg_ptr);
  }
  zoomOut() {
    v.drawengine_zoomOut(this.__wbg_ptr);
  }
  zoomReset() {
    v.drawengine_zoomReset(this.__wbg_ptr);
  }
  zoomToFitSelectionInViewport() {
    v.drawengine_zoomToFitSelectionInViewport(this.__wbg_ptr);
  }
  zoomToFitSelection() {
    v.drawengine_zoomToFitSelection(this.__wbg_ptr);
  }
  zoomToFit() {
    v.drawengine_zoomToFit(this.__wbg_ptr);
  }
  /**
   * @param {number | null} [padding]
   */
  zoomToSelection(e) {
    v.drawengine_zoomToSelection(this.__wbg_ptr, !He(e), He(e) ? 0 : e);
  }
};
Symbol.dispose && (rc.prototype[Symbol.dispose] = rc.prototype.free);
function H3() {
  return v.maxZoom();
}
function W3() {
  return v.minZoom();
}
function Z3(t, e, n, r, o) {
  const i = v.screenToWorld(t, e, n, r, o);
  var a = pu(i[0], i[1]).slice();
  return v.__wbindgen_free(i[0], i[1] * 8, 8), a;
}
function K3(t, e, n, r, o) {
  const i = v.worldToScreen(t, e, n, r, o);
  var a = pu(i[0], i[1]).slice();
  return v.__wbindgen_free(i[0], i[1] * 8, 8), a;
}
function V3() {
  return {
    __proto__: null,
    "./draw_engine_bg.js": {
      __proto__: null,
      __wbg___wbindgen_is_undefined_8c687d0b90d5b524: function(e) {
        return e === void 0;
      },
      __wbg___wbindgen_string_get_92ab86bb19cbc12f: function(e, n) {
        const r = n, o = typeof r == "string" ? r : void 0;
        var i = He(o) ? 0 : ze(o, v.__wbindgen_malloc, v.__wbindgen_realloc), a = we;
        Hf().setInt32(e + 4, a, !0), Hf().setInt32(e + 0, i, !0);
      },
      __wbg___wbindgen_throw_5d9e815e6fdf150f: function(e, n) {
        throw new Error(Fe(e, n));
      },
      __wbg__wbg_cb_unref_997e73d32238e655: function(e) {
        e._wbg_cb_unref();
      },
      __wbg_apply_3886db735292d1f0: function() {
        return It(function(e, n, r) {
          return Reflect.apply(e, n, r);
        }, arguments);
      },
      __wbg_arc_e3bb5e0478f5d999: function() {
        return It(function(e, n, r, o, i, a) {
          e.arc(n, r, o, i, a);
        }, arguments);
      },
      __wbg_arrayBuffer_432de2b072afe7fb: function(e) {
        return e.arrayBuffer();
      },
      __wbg_beginPath_ccad41b15817641f: function(e) {
        e.beginPath();
      },
      __wbg_bezierCurveTo_97c5663e02b1b33b: function(e, n, r, o, i, a, l) {
        e.bezierCurveTo(n, r, o, i, a, l);
      },
      __wbg_bezierCurveTo_e87c7fa3b38dd27b: function(e, n, r, o, i, a, l) {
        e.bezierCurveTo(n, r, o, i, a, l);
      },
      __wbg_call_6bcf8d3e20937e46: function() {
        return It(function(e, n, r) {
          return e.call(n, r);
        }, arguments);
      },
      __wbg_cancelAnimationFrame_4fc0f227c45abccf: function() {
        return It(function(e, n) {
          e.cancelAnimationFrame(n);
        }, arguments);
      },
      __wbg_clearRect_60e914c5e35403c7: function(e, n, r, o, i) {
        e.clearRect(n, r, o, i);
      },
      __wbg_clip_4966d52d0c94b5c3: function(e, n) {
        e.clip(n);
      },
      __wbg_clip_b4135b1f98d3018c: function(e) {
        e.clip();
      },
      __wbg_closePath_b220de6b77a28ce4: function(e) {
        e.closePath();
      },
      __wbg_closePath_f1cbbee0f99bf1e4: function(e) {
        e.closePath();
      },
      __wbg_complete_58758fdaef405c9a: function(e) {
        return e.complete;
      },
      __wbg_createElement_b9024dc5ba95ac27: function() {
        return It(function(e, n, r) {
          return e.createElement(Fe(n, r));
        }, arguments);
      },
      __wbg_document_c7f486c52d63d24e: function(e) {
        const n = e.document;
        return He(n) ? 0 : Yt(n);
      },
      __wbg_drawImage_528b1fef60ca83d0: function() {
        return It(function(e, n, r, o, i, a) {
          e.drawImage(n, r, o, i, a);
        }, arguments);
      },
      __wbg_drawImage_a058067efeef931f: function() {
        return It(function(e, n, r, o) {
          e.drawImage(n, r, o);
        }, arguments);
      },
      __wbg_ellipse_6bf2ec2f8845cba9: function() {
        return It(function(e, n, r, o, i, a, l, c) {
          e.ellipse(n, r, o, i, a, l, c);
        }, arguments);
      },
      __wbg_fillRect_ff9957352a08db2c: function(e, n, r, o, i) {
        e.fillRect(n, r, o, i);
      },
      __wbg_fillText_9b463cd65b9c1016: function() {
        return It(function(e, n, r, o, i) {
          e.fillText(Fe(n, r), o, i);
        }, arguments);
      },
      __wbg_fill_61b0872bf5d91622: function(e) {
        e.fill();
      },
      __wbg_fill_69a1a2c7866d9d49: function(e, n) {
        e.fill(n);
      },
      __wbg_getContext_e0c05ffee530bdcf: function() {
        return It(function(e, n, r) {
          const o = e.getContext(Fe(n, r));
          return He(o) ? 0 : Yt(o);
        }, arguments);
      },
      __wbg_getDate_8e7807f062ade36a: function(e) {
        return e.getDate();
      },
      __wbg_getFullYear_0cfd5a75cf3d5856: function(e) {
        return e.getFullYear();
      },
      __wbg_getMonth_01ce17d889ed7e5e: function(e) {
        return e.getMonth();
      },
      __wbg_get_989d0a1309644f2b: function() {
        return It(function(e, n) {
          return Reflect.get(e, n);
        }, arguments);
      },
      __wbg_height_c15ee46a1345e9af: function(e) {
        return e.height;
      },
      __wbg_instanceof_CanvasRenderingContext2d_bde5245b14027f3f: function(e) {
        let n;
        try {
          n = e instanceof CanvasRenderingContext2D;
        } catch {
          n = !1;
        }
        return n;
      },
      __wbg_instanceof_HtmlCanvasElement_4d7e131643d814c1: function(e) {
        let n;
        try {
          n = e instanceof HTMLCanvasElement;
        } catch {
          n = !1;
        }
        return n;
      },
      __wbg_instanceof_Window_a3b8566f0a9c5d1a: function(e) {
        let n;
        try {
          n = e instanceof Window;
        } catch {
          n = !1;
        }
        return n;
      },
      __wbg_length_31bdaf014f5fbde2: function(e) {
        return e.length;
      },
      __wbg_lineTo_3256517fc9554e23: function(e, n, r) {
        e.lineTo(n, r);
      },
      __wbg_lineTo_58ce7f44fe9cb0ef: function(e, n, r) {
        e.lineTo(n, r);
      },
      __wbg_measureText_1733ac2408cd5f5e: function() {
        return It(function(e, n, r) {
          return e.measureText(Fe(n, r));
        }, arguments);
      },
      __wbg_moveTo_0942f3918a21430a: function(e, n, r) {
        e.moveTo(n, r);
      },
      __wbg_moveTo_2e2b57a16e7eda7b: function(e, n, r) {
        e.moveTo(n, r);
      },
      __wbg_new_180f1022bb6ee517: function(e) {
        return new Date(e);
      },
      __wbg_new_1da3429bc3c4541c: function(e) {
        return new Uint8Array(e);
      },
      __wbg_new_271ea6bf8dae55cf: function() {
        return It(function() {
          return new Path2D();
        }, arguments);
      },
      __wbg_new_766fc336a755bf11: function() {
        return It(function() {
          return new Image();
        }, arguments);
      },
      __wbg_new_8f72ed7c652bf5a2: function(e, n) {
        try {
          var r = { a: e, b: n }, o = (a, l) => {
            const c = r.a;
            r.a = 0;
            try {
              return q3(c, r.b, a, l);
            } finally {
              r.a = c;
            }
          };
          return new Promise(o);
        } finally {
          r.a = 0;
        }
      },
      __wbg_new_bebc3f4757acf305: function() {
        return new Object();
      },
      __wbg_new_ffa92086ea89f79c: function() {
        return new Array();
      },
      __wbg_new_from_slice_4ee02165f9de919e: function(e, n) {
        return new Uint8Array(oc(e, n));
      },
      __wbg_new_with_path_string_a6c70c301cea56a3: function() {
        return It(function(e, n) {
          return new Path2D(Fe(e, n));
        }, arguments);
      },
      __wbg_new_with_u8_array_sequence_and_options_19dab14721682b5e: function() {
        return It(function(e, n) {
          return new Blob(e, n);
        }, arguments);
      },
      __wbg_normalize_508c6a234fd446b2: function(e, n, r) {
        return e.normalize(Fe(n, r));
      },
      __wbg_now_0b7736bc17fd7719: function(e) {
        return e.now();
      },
      __wbg_now_d1fb6650485d7f3e: function() {
        return Date.now();
      },
      __wbg_performance_d96ad0b441f4510a: function(e) {
        const n = e.performance;
        return He(n) ? 0 : Yt(n);
      },
      __wbg_prototypesetcall_ae9f5e7459250748: function(e, n, r) {
        Uint8Array.prototype.set.call(oc(e, n), r);
      },
      __wbg_push_bfdf956ba476f65b: function(e, n) {
        return e.push(n);
      },
      __wbg_quadraticCurveTo_06773b6ac58ded9b: function(e, n, r, o, i) {
        e.quadraticCurveTo(n, r, o, i);
      },
      __wbg_random_7bce4e9e78e2e0d0: function() {
        return Math.random();
      },
      __wbg_rect_72ec16500f72e6f3: function(e, n, r, o, i) {
        e.rect(n, r, o, i);
      },
      __wbg_requestAnimationFrame_4988887658fcee2e: function() {
        return It(function(e, n) {
          return e.requestAnimationFrame(n);
        }, arguments);
      },
      __wbg_restore_eecc6aaa55774880: function(e) {
        e.restore();
      },
      __wbg_roundRect_6350b7b8c0e3129c: function() {
        return It(function(e, n, r, o, i, a) {
          e.roundRect(n, r, o, i, a);
        }, arguments);
      },
      __wbg_save_c33ea55c57a4e522: function(e) {
        e.save();
      },
      __wbg_setLineDash_533fe9be7e5b7502: function() {
        return It(function(e, n) {
          e.setLineDash(n);
        }, arguments);
      },
      __wbg_setTransform_a79839e493a9863e: function() {
        return It(function(e, n, r, o, i, a, l) {
          e.setTransform(n, r, o, i, a, l);
        }, arguments);
      },
      __wbg_set_a377297433dfea63: function() {
        return It(function(e, n, r) {
          return Reflect.set(e, n, r);
        }, arguments);
      },
      __wbg_set_font_50854c5bdd1ca607: function(e, n, r) {
        e.font = Fe(n, r);
      },
      __wbg_set_globalAlpha_fead6b3865673822: function(e, n) {
        e.globalAlpha = n;
      },
      __wbg_set_height_698fb3b255bc1348: function(e, n) {
        e.height = n >>> 0;
      },
      __wbg_set_lineCap_83ca7eaf0e7f233d: function(e, n, r) {
        e.lineCap = Fe(n, r);
      },
      __wbg_set_lineJoin_4183d91ee3d5aeea: function(e, n, r) {
        e.lineJoin = Fe(n, r);
      },
      __wbg_set_lineWidth_0b0f32c89c240172: function(e, n) {
        e.lineWidth = n;
      },
      __wbg_set_onload_5befaef425953637: function(e, n) {
        e.onload = n;
      },
      __wbg_set_src_daa50ad46d26c9bb: function(e, n, r) {
        e.src = Fe(n, r);
      },
      __wbg_set_textAlign_b3d2e546635621d4: function(e, n, r) {
        e.textAlign = Fe(n, r);
      },
      __wbg_set_textBaseline_41538118f83d0399: function(e, n, r) {
        e.textBaseline = Fe(n, r);
      },
      __wbg_set_type_69954a3c7c11a724: function(e, n, r) {
        e.type = Fe(n, r);
      },
      __wbg_set_width_4c3a2252e0dea033: function(e, n) {
        e.width = n >>> 0;
      },
      __wbg_static_accessor_GLOBAL_8eb4cd83130a11a0: function() {
        const e = typeof global > "u" ? null : global;
        return He(e) ? 0 : Yt(e);
      },
      __wbg_static_accessor_GLOBAL_THIS_1e7044f654e934db: function() {
        const e = typeof globalThis > "u" ? null : globalThis;
        return He(e) ? 0 : Yt(e);
      },
      __wbg_static_accessor_SELF_d8b50611246a6d92: function() {
        const e = typeof self > "u" ? null : self;
        return He(e) ? 0 : Yt(e);
      },
      __wbg_static_accessor_WINDOW_fd0bc376bf0f8b42: function() {
        const e = typeof window > "u" ? null : window;
        return He(e) ? 0 : Yt(e);
      },
      __wbg_strokeRect_a5ecc238952f1eb8: function(e, n, r, o, i) {
        e.strokeRect(n, r, o, i);
      },
      __wbg_stroke_8a243e7601bb8549: function(e) {
        e.stroke();
      },
      __wbg_stroke_f885538d88984637: function(e, n) {
        e.stroke(n);
      },
      __wbg_toBlob_781834792cb24a84: function() {
        return It(function(e, n) {
          e.toBlob(n);
        }, arguments);
      },
      __wbg_width_b0c7f2ae9ce3ffb0: function(e) {
        return e.width;
      },
      __wbg_width_b5e609025d3f7451: function(e) {
        return e.width;
      },
      __wbindgen_generic_0000000000000001: function(e, n) {
        return fl(e, n, G3);
      },
      __wbindgen_generic_0000000000000002: function(e, n) {
        return fl(e, n, Y3);
      },
      __wbindgen_generic_0000000000000003: function(e, n) {
        return fl(e, n, J3);
      },
      __wbindgen_generic_0000000000000004: function(e) {
        return e;
      },
      __wbindgen_generic_0000000000000005: function(e, n) {
        return Fe(e, n);
      },
      __wbindgen_init_externref_table: function() {
        const e = v.__wbindgen_externrefs, n = e.grow(4);
        e.set(0, void 0), e.set(n + 0, void 0), e.set(n + 1, null), e.set(n + 2, !0), e.set(n + 3, !1);
      }
    }
  };
}
function J3(t, e) {
  v.wasm_bindgen_76f503109ad66438___convert__closures_____invoke_______true_(t, e);
}
function G3(t, e, n) {
  v.wasm_bindgen_76f503109ad66438___convert__closures_____invoke___wasm_bindgen_76f503109ad66438___JsValue______true_(t, e, n);
}
function q3(t, e, n, r) {
  v.wasm_bindgen_76f503109ad66438___convert__closures_____invoke___js_sys_eb32e3d0ed3f1f5___Function_fn_wasm_bindgen_76f503109ad66438___JsValue_____wasm_bindgen_76f503109ad66438___sys__Undefined___js_sys_eb32e3d0ed3f1f5___Function_fn_wasm_bindgen_76f503109ad66438___JsValue_____wasm_bindgen_76f503109ad66438___sys__Undefined_______true_(t, e, n, r);
}
function Y3(t, e, n) {
  v.wasm_bindgen_76f503109ad66438___convert__closures_____invoke___core_37ee0ce0c4cd57d5___option__Option_web_sys_c7d29553ed6c8044___features__gen_Blob__Blob_______true_(t, e, He(n) ? 0 : Yt(n));
}
const Uf = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((t) => v.__wbg_drawengine_free(t, 1));
function Yt(t) {
  const e = v.__externref_table_alloc();
  return v.__wbindgen_externrefs.set(e, t), e;
}
const jf = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((t) => v.__wbindgen_destroy_closure(t.a, t.b));
function pu(t, e) {
  return t = t >>> 0, um().subarray(t / 8, t / 8 + e);
}
function oc(t, e) {
  return t = t >>> 0, Ao().subarray(t / 1, t / 1 + e);
}
let Gr = null;
function Hf() {
  return (Gr === null || Gr.buffer.detached === !0 || Gr.buffer.detached === void 0 && Gr.buffer !== v.memory.buffer) && (Gr = new DataView(v.memory.buffer)), Gr;
}
let fi = null;
function um() {
  return (fi === null || fi.byteLength === 0) && (fi = new Float64Array(v.memory.buffer)), fi;
}
function Fe(t, e) {
  return n9(t >>> 0, e);
}
let hi = null;
function X3() {
  return (hi === null || hi.byteLength === 0) && (hi = new Uint32Array(v.memory.buffer)), hi;
}
let gi = null;
function Ao() {
  return (gi === null || gi.byteLength === 0) && (gi = new Uint8Array(v.memory.buffer)), gi;
}
function It(t, e) {
  try {
    return t.apply(this, e);
  } catch (n) {
    const r = Yt(n);
    v.__wbindgen_exn_store(r);
  }
}
function He(t) {
  return t == null;
}
function fl(t, e, n) {
  const r = { a: t, b: e, cnt: 1 }, o = (...i) => {
    r.cnt++;
    const a = r.a;
    r.a = 0;
    try {
      return n(a, r.b, ...i);
    } finally {
      r.a = a, o._wbg_cb_unref();
    }
  };
  return o._wbg_cb_unref = () => {
    --r.cnt === 0 && (v.__wbindgen_destroy_closure(r.a, r.b), r.a = 0, jf.unregister(r));
  }, jf.register(o, r, r), o;
}
function Wf(t, e) {
  const n = e(t.length * 4, 4) >>> 0;
  return X3().set(t, n / 4), we = t.length, n;
}
function Q3(t, e) {
  const n = e(t.length * 1, 1) >>> 0;
  return Ao().set(t, n / 1), we = t.length, n;
}
function $3(t, e) {
  const n = e(t.length * 8, 8) >>> 0;
  return um().set(t, n / 8), we = t.length, n;
}
function ze(t, e, n) {
  if (n === void 0) {
    const l = Ti.encode(t), c = e(l.length, 1) >>> 0;
    return Ao().subarray(c, c + l.length).set(l), we = l.length, c;
  }
  let r = t.length, o = e(r, 1) >>> 0;
  const i = Ao();
  let a = 0;
  for (; a < r; a++) {
    const l = t.charCodeAt(a);
    if (l > 127) break;
    i[o + a] = l;
  }
  if (a !== r) {
    a !== 0 && (t = t.slice(a)), o = n(o, r, r = a + t.length * 3, 1) >>> 0;
    const l = Ao().subarray(o + a, o + r), c = Ti.encodeInto(t, l);
    a += c.written, o = n(o, r, a, 1) >>> 0;
  }
  return we = a, o;
}
function e9(t) {
  const e = v.__wbindgen_externrefs.get(t);
  return v.__externref_table_dealloc(t), e;
}
let As = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 });
As.decode();
const t9 = 2146435072;
let hl = 0;
function n9(t, e) {
  return hl += e, hl >= t9 && (As = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 }), As.decode(), hl = e), As.decode(Ao().subarray(t, t + e));
}
const Ti = new TextEncoder();
"encodeInto" in Ti || (Ti.encodeInto = function(t, e) {
  const n = Ti.encode(t);
  return e.set(n), {
    read: t.length,
    written: n.length
  };
});
let we = 0, v;
function r9(t, e) {
  return v = t.exports, Gr = null, fi = null, hi = null, gi = null, v.__wbindgen_start(), v;
}
async function o9(t, e) {
  if (typeof Response == "function" && t instanceof Response) {
    if (!t.ok)
      throw new Error(`failed to fetch Wasm: ${t.status} ${t.statusText} fetching '${t.url}'`);
    if (typeof WebAssembly.instantiateStreaming == "function")
      try {
        return await WebAssembly.instantiateStreaming(t, e);
      } catch (o) {
        if (n(t.type) && t.headers.get("Content-Type") !== "application/wasm")
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", o);
        else
          throw o;
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
async function dm(t) {
  if (v !== void 0) return v;
  t !== void 0 && (Object.getPrototypeOf(t) === Object.prototype ? { module_or_path: t } = t : console.warn("using deprecated parameters for the initialization function; pass a single object instead")), t === void 0 && (t = new URL("" + new URL("draw_engine_bg.wasm", import.meta.url).href, import.meta.url));
  const e = V3();
  (typeof t == "string" || typeof Request == "function" && t instanceof Request || typeof URL == "function" && t instanceof URL) && (t = fetch(t));
  const { instance: n, module: r } = await o9(await t, e);
  return r9(n);
}
const i9 = "5";
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add(i9);
const sr = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  // The engine's own `DrawElementStyle::default()`, kept in step with it: the placeholder
  // a panel shows before an engine exists, and the fallback `parseJson` reaches for. The
  // oracle's `DEFAULT_ELEMENT_PROPS.fillStyle` is `"solid"`
  // (packages/common/src/constants.ts@1118751f:522).
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  roundness: 8
}, s9 = { kind: "polygon", sides: 6 }, fm = {
  enabled: !1,
  size: 20,
  step: 5,
  snap: !0
}, Js = {
  background: "#ffffff",
  grid: "rgba(17, 17, 17, 0.06)",
  accent: "#6965db",
  bindingHighlight: "rgb(106, 189, 252)",
  bindingMidpoint: "rgba(65, 65, 65, 0.5)"
}, a9 = {
  background: "#191919",
  grid: "rgba(255, 255, 255, 0.06)",
  accent: "#a8a5ff",
  bindingHighlight: "rgb(104, 182, 240)",
  bindingMidpoint: "rgba(237, 237, 237, 0.8)"
};
class hm {
  constructor(e = []) {
    this.elements = e;
  }
  ordered() {
    return this.elements.filter((e) => !e.isDeleted);
  }
  toArray() {
    return this.elements;
  }
}
const gm = {
  count: 0,
  kinds: [],
  filledKinds: [],
  textAlignable: !1,
  verticalAlignable: !1,
  canAlign: !1,
  canDistribute: !1,
  canTogglePolygon: !1,
  isGroup: !1,
  strokeColor: sr.strokeColor,
  backgroundColor: sr.backgroundColor,
  fillStyle: sr.fillStyle,
  strokeWidth: sr.strokeWidth,
  strokeStyle: sr.strokeStyle,
  roughness: sr.roughness,
  opacity: sr.opacity,
  edges: sr.roundness == null ? "sharp" : "round",
  startArrowhead: "none",
  endArrowhead: "arrow",
  arrowType: "round",
  isPolygon: null,
  fontSize: 20,
  fontFamily: 5,
  textAlign: "left",
  verticalAlign: "middle",
  hasFreeText: !1,
  autoResize: null,
  hasLabel: !1,
  labelWrap: null,
  canBindText: !1,
  canUnbindText: !1,
  figureKind: null,
  figureSides: null,
  figureRatio: null,
  figureHasSides: !1,
  figureHasRatio: !1,
  strokeDomain: "regular",
  backgroundDomain: "regular"
};
function l9(t) {
  return t.type === "line" || t.type === "arrow";
}
function Gs(t) {
  try {
    const e = JSON.parse(t);
    if (e?.type === "osidraw" && Array.isArray(e.elements)) return e.elements;
  } catch {
  }
  return null;
}
function So(t, e, n) {
  const r = K3(t.x, t.y, t.scale, e, n);
  return { x: r[0] ?? Number.NaN, y: r[1] ?? Number.NaN };
}
function ic(t, e, n) {
  const r = Z3(t.x, t.y, t.scale, e, n);
  return { x: r[0] ?? Number.NaN, y: r[1] ?? Number.NaN };
}
function c9() {
  return W3();
}
function u9() {
  return H3();
}
const Cn = {
  pointerEvents: 0,
  engineSteps: 0,
  hitTests: 0,
  hitTestMs: 0,
  maxHitTestMs: 0
};
function d9() {
  Cn.pointerEvents += 1;
}
function f9() {
  Cn.engineSteps += 1;
}
function h9(t) {
  const e = performance.now();
  try {
    return t();
  } finally {
    const n = performance.now() - e;
    Cn.hitTests += 1, Cn.hitTestMs += n, n > Cn.maxHitTestMs && (Cn.maxHitTestMs = n);
  }
}
function g9() {
  return { ...Cn };
}
function p9() {
  Cn.pointerEvents = 0, Cn.engineSteps = 0, Cn.hitTests = 0, Cn.hitTestMs = 0, Cn.maxHitTestMs = 0;
}
let gl = null;
function pm() {
  return gl === null && (gl = dm().then(() => {
  })), gl;
}
function zt(t, e) {
  try {
    return JSON.parse(t);
  } catch {
    return e;
  }
}
function m9(t, e) {
  if (e.onCameraChange) {
    const n = e.onCameraChange;
    t.setOnCameraChange((r) => n(zt(r, { x: 0, y: 0, scale: 1 })));
  }
  if (e.onToolChange) {
    const n = e.onToolChange;
    t.setOnToolChange((r) => n(r));
  }
  if (e.onSelectionChange) {
    const n = e.onSelectionChange;
    t.setOnSelectionChange((r) => n(zt(r, [])));
  }
  if (e.onRequestTextEdit) {
    const n = e.onRequestTextEdit;
    t.setOnRequestTextEdit((r) => {
      const o = zt(r, null);
      o && n(o);
    });
  }
  if (e.onRequestFrameRename) {
    const n = e.onRequestFrameRename;
    t.setOnRequestFrameRename((r) => {
      const o = zt(r, null);
      o && n(o);
    });
  }
  if (e.onSceneChange) {
    const n = e.onSceneChange;
    t.setOnSceneChange((r) => n(r));
  }
  if (e.onNotice) {
    const n = e.onNotice;
    t.setOnNotice((r) => n(r));
  }
}
const v9 = [
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "sharpArrow",
  "curvedArrow",
  "elbowArrow"
], _9 = (t) => v9.includes(t), y9 = [
  "default",
  // Default
  "move",
  // Move
  "ns-resize",
  // ResizeNs
  "ew-resize",
  // ResizeEw
  "nesw-resize",
  // ResizeNesw
  "nwse-resize",
  // ResizeNwse
  "grab",
  // Grab
  "grabbing",
  // Grabbing
  "pointer",
  // PointHandle
  "crosshair",
  // Crosshair
  "text"
  // Text
], b9 = ["declined", "started", "editing-text"], w9 = ["none", "drag", "menu"];
function sc(t) {
  return t instanceof Blob ? t : null;
}
function k9(t, e) {
  const n = { supported: !1, mime: "", scope: "scene" };
  if (typeof t != "object" || t === null) return n;
  const r = t;
  if (r.supported !== !0) {
    const c = r.refusal;
    return (c === "browser-cannot-take" || c === "nothing-to-copy") && (n.refusal = c), n;
  }
  const o = r.mime, i = r.scope;
  if (typeof o != "string" || o === "" || i !== "selection" && i !== "scene") return n;
  const a = e === "png" ? r.blob : r.text;
  if (a == null) return n;
  const l = { supported: !0, mime: o, scope: i };
  if (e === "png")
    l.blob = Promise.resolve(a).then(sc);
  else if (typeof a == "string")
    l.text = a;
  else
    return n;
  return l;
}
function S9(t) {
  if (typeof t != "object" || t === null) return { refused: "unreadable" };
  const e = t;
  if (e.restored === !0) return { restored: !0 };
  const n = e.refused;
  return n === "malformed" || n === "not-ours" || n === "unreadable" ? { refused: n } : { refused: "unreadable" };
}
class x9 {
  constructor(e) {
    this.inner = new rc(e.canvas), m9(this.inner, e);
  }
  get camera() {
    return zt(this.inner.cameraJson(), { x: 0, y: 0, scale: 1 });
  }
  /** Where the camera is headed: an eased move's end (a fit, a reveal) while one runs, else `camera`. */
  get cameraTarget() {
    return zt(this.inner.cameraTargetJson(), this.camera);
  }
  setScene(e) {
    this.inner.setSceneJson(JSON.stringify({ type: "osidraw", version: 1, elements: e.toArray() }));
  }
  getScene() {
    const e = zt(this.inner.exportJson(), {}).elements ?? [];
    return new hm(e);
  }
  setTheme(e) {
    this.inner.setTheme(JSON.stringify(e));
  }
  setViewport(e, n, r) {
    this.inner.setViewport(e, n, r);
  }
  /**
   * How far the host's own UI reaches over each side of the canvas, in CSS pixels —
   * Excalidraw's measured `[data-viewport-ui]` offsets. A reveal (Ctrl/Cmd+Arrow,
   * Alt+Arrow) brings what it shows into the room they leave.
   */
  setViewportOffsets(e) {
    this.inner.setViewportOffsets(e.top, e.right, e.bottom, e.left);
  }
  zoomAt(e, n, r) {
    this.inner.zoomAt(e, n, r);
  }
  /**
   * One wheel event's worth of zoom, anchored at `(sx, sy)`.
   *
   * Pass `WheelEvent.deltaY` straight through. The engine owns the step — how much a
   * wheel delta is worth is arithmetic, and it is the part that has to be bounded or the
   * zoom teleports instead of moving.
   */
  wheelZoom(e, n, r) {
    this.inner.wheelZoom(e, n, r);
  }
  panBy(e, n) {
    this.inner.panBy(e, n);
  }
  fit(e) {
    this.inner.fit(e);
  }
  /** Frame the selection. Does nothing when nothing is selected. */
  zoomToSelection(e) {
    this.inner.zoomToSelection(e);
  }
  /**
   * Shift+1: everything, zoomed out to hold it or in, up to 100%, clear of the chrome
   * given to {@link setViewportOffsets}. Excalidraw's `zoomToFit`.
   */
  zoomToFit() {
    this.inner.zoomToFit();
  }
  /** Shift+2: the selection — everything when nothing is — no closer than 100%. */
  zoomToFitSelectionInViewport() {
    this.inner.zoomToFitSelectionInViewport();
  }
  /** Shift+3: the selection — everything when nothing is — filling the view. */
  zoomToFitSelection() {
    this.inner.zoomToFitSelection();
  }
  /**
   * How the last frames were served: redraws, scrolls and reuses of the static layer,
   * then reset. A diagnostic — the layer is either being reused or it is not, and from
   * outside those look identical until something is measured against the wrong guess.
   */
  paintStats() {
    return zt(this.inner.paintStatsJson(), { redraws: 0, scrolls: 0, reuses: 0 });
  }
  /** Move by a screenful, in page counts: `pageBy(0, -1)` is one page up. */
  pageBy(e, n) {
    this.inner.pageBy(e, n);
  }
  /**
   * Where a screen point is in the world, from the engine's `screen_to_world`.
   *
   * The expression used to be written out here — the same one `engine/src/camera.ts`
   * mirrored and the same one the front called — so this was the third copy. It is now
   * the engine's own, reached through the wrapper beside it.
   *
   * The method and the free function differ only in where the camera comes from: this
   * one reads it through the `camera` getter, which is a `cameraJson` call and a
   * `JSON.parse`. A caller that already holds the camera should call the free
   * `screenToWorld` from `./cameraMath` instead.
   */
  screenToWorld(e, n) {
    return ic(this.camera, e, n);
  }
  hitTest(e, n, r = 0) {
    const o = h9(() => this.inner.hitTest(e, n, r));
    return o ? zt(o, null) : null;
  }
  /**
   * Whether `(sx, sy)` lands inside the padded common bounding box of the current
   * multi-selection, with no element itself under it — a right-click there is still a
   * right-click on the selection, not on the board (`hits_selection_box`).
   */
  hitsSelectionBox(e, n) {
    return this.inner.hitsSelectionBox(e, n);
  }
  /**
   * Who else is in the room, what they hold and what they are doing right now. Replaces
   * what the engine knew; `[]` when everyone has left. What this engine had selected and
   * a peer now holds is let go — see `engine/peers.rs`.
   */
  setPeers(e) {
    this.inner.setPeers(JSON.stringify(e));
  }
  /**
   * Where a peer's laser pointer is, in world units, and whether they are pressing it —
   * their trail is drawn in their colour and fades as it does on their screen. See
   * `engine/peers.rs`.
   */
  peerLaser(e, n, r, o, i) {
    this.inner.peerLaser(e, n, r, o, i);
  }
  /** The id of the peer holding what is under the pointer, if someone does. */
  peerAt(e, n) {
    return this.inner.peerAt(e, n) ?? null;
  }
  /**
   * The elements the gesture in progress is changing, as they are this instant — empty
   * between gestures. What a host streams to peers while something is being drawn,
   * moved or resized, so it moves on their screens too.
   */
  gestureElements() {
    return zt(this.inner.gestureElementsJson(), []);
  }
  /**
   * Everything the engine and the host know about the current state, in one object.
   *
   * `scene` / `viewport` / `interaction` come from the engine; `rendering` from the WASM
   * frame loop, which is the only place a frame is visible; `host` from the browser
   * side, which is the only place a raw pointer event or a clock is.
   *
   * Read by `tools/editor-inspector`. Safe to poll — nothing here is computed for the
   * call, it is all state that already exists.
   */
  debugSnapshot() {
    return { ...zt(
      this.inner.debugSnapshotJson(),
      {}
    ), host: g9() };
  }
  /** Zeroes the host counters, so one gesture can be measured rather than a session. */
  resetDebugCounters() {
    p9();
  }
  /**
   * The CSS cursor for the pointer at this position.
   *
   * The engine decides, not the host: what the pointer is over — a resize handle, a
   * rotation handle, a movable element — is the engine's own hit-test state, and a host
   * that guessed at it from the tool alone is how a shape ends up silently resizing when
   * you meant to move it.
   *
   * Crosses the boundary as a small integer and is mapped here, so a hover costs no
   * allocation on either side.
   */
  hoverCursor(e, n) {
    return y9[this.inner.hoverCursor(e, n)] ?? "default";
  }
  /**
   * The size a run of text will occupy, in world units.
   *
   * Measured against the font the canvas actually draws with, so anything sizing itself
   * to text — the editing overlay, a label's box — agrees with what appears on screen.
   */
  measureText(e, n, r) {
    const o = this.inner.measureText(e, n, r);
    return { width: o[0] ?? 4, height: o[1] ?? n };
  }
  /**
   * The CSS font stack the canvas draws text with — for Excalidraw family `id`
   * (`TextEditRequest.fontFamily`), or the system stack legacy text uses when omitted or 0.
   */
  fontFamily(e) {
    return this.inner.fontFamily(e);
  }
  /**
   * Tell the engine web fonts finished loading: it re-measures and re-lays every text in a
   * named family without stamping it, so a late font never reads as an edit.
   */
  fontsLoaded() {
    this.inner.fontsLoaded();
  }
  /**
   * Show, size and snap to the canvas grid.
   *
   * `enabled` and `snap` are separate: a grid can be a visual reference you draw freely
   * over, which is a different request from being held to it.
   */
  setGrid(e) {
    this.inner.setGridJson(JSON.stringify({ ...this.getGrid(), ...e }));
  }
  getGrid() {
    return zt(this.inner.getGridJson(), fm);
  }
  /** Snapping to other elements while moving. Off by default, as in Excalidraw. */
  setObjectsSnap(e) {
    this.inner.setObjectsSnap(e);
  }
  getObjectsSnap() {
    return this.inner.getObjectsSnap();
  }
  /** Dynamic size: an element made while zoomed out gets `sizeScale = 1/zoom` and looks
   *  on screen as it would at 100%. Off until the host turns it on, so an engine nobody
   *  configures draws Excalidraw's elements, field for field. */
  setDynamicSize(e) {
    this.inner.setDynamicSize(e);
  }
  /** Whether dynamic size is on. */
  dynamicSize() {
    return this.inner.dynamicSize();
  }
  /** `prefers-reduced-motion`: an eased camera move (fit, zoom to selection, zoom
   *  in/out/reset) lands at once rather than animating while this is set. Kept current by
   *  `bindCanvas` — WASM has no `matchMedia` of its own. */
  setReducedMotion(e) {
    this.inner.setReducedMotion(e);
  }
  setTool(e) {
    this.inner.setTool(e);
  }
  /**
   * Choose a tool the way a keyboard shortcut does.
   *
   * The difference from `setTool` is the return trip: pressing the hand or eraser key
   * while that tool is already active goes back to the tool it interrupted. Toolbar
   * buttons stay on `setTool`, because a button that shows a tool as active must not
   * switch away when clicked again.
   */
  activateTool(e) {
    this.inner.activateTool(e);
  }
  getTool() {
    return this.inner.getTool();
  }
  /**
   * Place a decoded image, centred on a screen point.
   *
   * The caller decodes the file, because only a browser can, and having done so already
   * knows the natural size. Everything after that — how large the image should appear,
   * where it lands, which frame it joins — is the engine's, so every frontend produces
   * the same element. Returns the new element's id, or `null` if the image could not be
   * measured.
   */
  /**
   * Place an embed, resolving the pasted link first.
   *
   * Whether the host may be framed at all, and what the page rewrites to, are the
   * engine's: a caller that resolved links itself could frame something the rules would
   * have refused. Returns the new element's id, or `null` if the link is not embeddable.
   */
  insertEmbed(e, n, r) {
    return this.inner.insertEmbed(e, n, r) ?? null;
  }
  /**
   * Point embed `id` at another link, resolved by the same rules as `insertEmbed`.
   * Returns whether it changed: `false` for a refused link, or a locked or held embed.
   */
  setEmbedUrl(e, n) {
    return this.inner.setEmbedUrl(e, n);
  }
  /**
   * What a pasted link resolves to, or `null` if it cannot be embedded.
   *
   * Lets a caller say so *before* putting an empty box on the board.
   */
  resolveEmbed(e) {
    const n = this.inner.resolveEmbed(e);
    return n ? JSON.parse(n) : null;
  }
  /** Every live embed, where its frame goes in screen pixels, and whether it is on screen. */
  embedFramesJson() {
    return this.inner.embedFrames();
  }
  insertImage(e, n, r, o, i) {
    return this.inner.insertImage(e, n, r, o, i) ?? null;
  }
  setNextStyle(e) {
    this.inner.setNextStyleJson(JSON.stringify(e));
  }
  getNextStyle() {
    return zt(this.inner.getNextStyleJson(), sr);
  }
  /** What the Shapes picker sets: which figure the tool draws next. Never restyles a
   *  selected figure — the inspector's own sides stepper and ratio slider do that. */
  setNextFigure(e) {
    this.inner.setNextFigureJson(JSON.stringify(e));
  }
  getNextFigure() {
    return zt(this.inner.getNextFigureJson(), s9);
  }
  getSelection() {
    return zt(this.inner.getSelectionJson(), []);
  }
  getSelectedElements() {
    return zt(this.inner.getSelectedElementsJson(), []);
  }
  applyStyle(e) {
    this.inner.applyStyleJson(JSON.stringify(e));
  }
  clearSelection() {
    this.inner.clearSelection();
  }
  select(e) {
    this.inner.selectJson(JSON.stringify(e));
  }
  /** Selects `id` as a press on it does — with its group — locked or not: a right-click. */
  selectElement(e) {
    this.inner.selectElement(e);
  }
  selectAll() {
    this.inner.selectAll();
  }
  deleteSelection() {
    this.inner.deleteSelection();
  }
  copySelection() {
    return this.inner.copySelection() ?? null;
  }
  cutSelection() {
    return this.inner.cutSelection() ?? null;
  }
  /**
   * Merges a peer's elements into the scene by id, last-writer-wins.
   *
   * Use this for anything arriving over the wire. `pasteJson` mints a new id for every
   * element — correct for a paste, catastrophic for a merge: it turns each incoming
   * edit into a duplicate, and the resulting change is broadcast back, so two clients
   * grow the board without bound.
   *
   * Optional `order` (array of live ids) in the JSON rewrites z-order after the merge.
   *
   * Returns whether anything actually changed, so an echo costs nothing.
   */
  applyRemotePatch(e) {
    return this.inner.applyRemotePatch(e);
  }
  pasteJson(e, n) {
    return this.inner.pasteJson(e ?? void 0, n?.x, n?.y);
  }
  /**
   * Plain text pasted as text elements — one per line, each wrapped to half the visible
   * width and centred on `at`, the **world** point the pointer is at (the same convention
   * `pasteJson` takes). One step of undo, the new texts selected; the clipboard is
   * untouched, nothing was copied.
   *
   * This is the other branch of a paste: `pasteJson` for this app's own element JSON, this
   * for everything else. `false` for text that would make no element at all, so a caller
   * can fall through to whatever it had.
   */
  pasteText(e, n) {
    return this.inner.pasteText(e, n?.x, n?.y);
  }
  /**
   * A scene made elsewhere — the Mermaid import — placed as `pasteJson` places it, centred
   * on the **world** point `at`, but with every text laid out in this engine's fonts and
   * every shape grown to hold its label. One step of undo; the clipboard is untouched.
   */
  insertJson(e, n) {
    return this.inner.insertJson(e, n?.x, n?.y);
  }
  /**
   * The command palette's "Add rectangle / diamond / ellipse / figure": a default-sized
   * shape centred on the **screen** point `(screenX, screenY)`, selected, as one step of
   * undo — `insertImage`/`insertEmbed`'s own convention. `"figure"` takes whatever
   * `setNextFigure` last set (`nextFigure` if nothing was). `null` for any other kind.
   */
  insertDefaultShape(e, n, r) {
    return this.inner.insertDefaultShape(e, n, r) ?? null;
  }
  duplicateSelection() {
    this.inner.duplicateSelection();
  }
  nudgeSelection(e, n) {
    this.inner.nudgeSelection(e, n);
  }
  /** How far one arrow key moves the selection: 1, or 5 with Shift; by the grid when held to it. */
  nudgeStep(e) {
    return this.inner.nudgeStep(e);
  }
  reorderSelection(e) {
    this.inner.reorderSelection(e);
  }
  alignSelection(e) {
    this.inner.alignSelection(e);
  }
  distributeSelection(e) {
    this.inner.distributeSelection(e);
  }
  /**
   * Whether align would move anything: at least two units — a group counts as one, a
   * lone group as what it holds — and no frame in the selection. Offer the control on
   * this rather than on the element count.
   */
  canAlign() {
    return this.inner.canAlign();
  }
  /** Whether distribute would move anything: at least three units, and no frame. */
  canDistribute() {
    return this.inner.canDistribute();
  }
  flipSelection(e) {
    this.inner.flipSelection(e);
  }
  groupSelection() {
    this.inner.groupSelection();
  }
  /**
   * Ctrl+G: groups what is loose, ungroups what is already exactly one group.
   *
   * Deliberately not the oracle's behaviour — theirs is a no-op on a grouped selection,
   * which leaves no way out of a group with the key you reached for. On a nested
   * selection this peels one level, never all of them.
   */
  toggleGroupSelection() {
    this.inner.toggleGroupSelection();
  }
  /** The group that has been stepped into, if any. */
  editingGroupId() {
    return this.inner.editingGroupId() ?? null;
  }
  ungroupSelection() {
    this.inner.ungroupSelection();
  }
  selectionIsGroup() {
    return this.inner.selectionIsGroup();
  }
  toggleLockSelection() {
    this.inner.toggleLockSelection();
  }
  /** Whether the lock toggle would unlock: something it acts on is locked. */
  selectionLocked() {
    return this.inner.selectionLocked();
  }
  /** The board menu's "Unlock all": every locked element unlocked and selected. */
  unlockAll() {
    this.inner.unlockAll();
  }
  /** Whether "Unlock all" is on offer: nothing selected, and something locked. */
  canUnlockAll() {
    return this.inner.canUnlockAll();
  }
  /**
   * Closes the selected line(s) into filled polygons, or opens them back up
   * (`actionTogglePolygon`). Whether this would do anything, and whether the panel's
   * toggle should show pressed, are read off `selectionStyle()` — `canTogglePolygon` and
   * `isPolygon` — not asked for here.
   */
  togglePolygon() {
    this.inner.togglePolygon();
  }
  setFontSize(e) {
    this.inner.setFontSize(e);
  }
  getFontSize() {
    return this.inner.getFontSize();
  }
  /**
   * Set the Excalidraw font family (1 Virgil, 2 Helvetica, 3 Cascadia, 5 Excalifont,
   * 6 Nunito, 7 Lilita One, 8 Comic Shanns, 9 Liberation Sans) of the selected texts and
   * labels, and of the next text drawn. Unknown ids are ignored.
   *
   * The text is laid out, and its shape grown, at once and in whatever face the browser
   * has: load the face first (`document.fonts.load` with the stack `fontFamily(id)` gives),
   * as Excalidraw's `changeFontFamily` waits for it (`actionProperties.tsx@1118751f:1302-1356`).
   * Laid out in a fallback wider than the face, a shape grows and keeps the growth.
   */
  setFontFamily(e) {
    this.inner.setFontFamily(e);
  }
  /** The family of the first selected text, else the one the next text is drawn in. */
  getFontFamily() {
    return this.inner.getFontFamily();
  }
  /** Switch the selected free texts between growing with their text and a fixed width. */
  setTextAutoResize(e) {
    this.inner.setTextAutoResize(e);
  }
  /** Whether the selected containers' labels wrap (the container grows taller) or not (wider). */
  setLabelWrap(e) {
    this.inner.setLabelWrap(e);
  }
  /**
   * `setTextAutoResize` and `setLabelWrap` together, as one step of undo — the wrap
   * row's own sense: `true` keeps a free text at its width and wraps a label in its
   * shape, `false` the reverse.
   */
  setTextWrap(e) {
    this.inner.setTextWrap(e);
  }
  /** Re-widths a dragged-out text column and re-wraps it. Auto-sizing text is ignored. */
  setTextBoxWidth(e, n) {
    this.inner.setTextBoxWidth(e, n);
  }
  setTextAlign(e) {
    this.inner.setTextAlign(e);
  }
  getTextAlign() {
    return this.inner.getTextAlign();
  }
  setVerticalAlign(e) {
    this.inner.setVerticalAlign(e);
  }
  getVerticalAlign() {
    return this.inner.getVerticalAlign();
  }
  zoomIn() {
    this.inner.zoomIn();
  }
  zoomOut() {
    this.inner.zoomOut();
  }
  zoomReset() {
    this.inner.zoomReset();
  }
  contentInView() {
    return this.inner.contentInView();
  }
  setToolLocked(e) {
    this.inner.setToolLocked(e);
  }
  getToolLocked() {
    return this.inner.getToolLocked();
  }
  editSelectedText() {
    return this.inner.editSelectedText();
  }
  beginPointer(e, n, r = !1, o = !1) {
    this.inner.beginPointer(e, n, r, o);
  }
  beginPan(e, n) {
    this.inner.beginPan(e, n);
  }
  /**
   * Starts a right-button pan session, or declines it: `"declined"` when more than one
   * pointer is down, and otherwise a session that is a pan only once the pointer has
   * travelled past the threshold — see `pan.rs` and `App.pan.ts@1118751f:88-125`.
   *
   * `"started"` also answers whether the press may prevent its own default: it may not
   * while a text is open (`App.pan.ts:1118751f:118-125`, issue #4489), which is the
   * `"editing-text"` case. That rule is here rather than in the host so two hosts cannot
   * answer it differently.
   *
   * `pointersDown` is the host's count of pointers on the canvas — the platform's count,
   * which the engine cannot read for itself.
   */
  beginSecondaryPan(e, n, r) {
    return b9[this.inner.beginSecondaryPan(e, n, r)] ?? "declined";
  }
  /** Ends a right-button session. See `beginSecondaryPan`. */
  endSecondaryPan() {
    return w9[this.inner.endSecondaryPan()] ?? "none";
  }
  /**
   * Whether a `contextmenu` event belongs to a right-button session and must not open the
   * menu: it came with the press, or it follows a release that turned out to be a drag.
   *
   * Platforms disagree about which of those it is — macOS and Linux fire it on mousedown,
   * Windows on mouseup — and swallowing the wrong one is how a right-drag to pan ends up
   * with a menu open over it (`App.pan.ts@1118751f:74-84`, and the doc comment at `:12-25`
   * that is the design).
   */
  consumesContextMenu() {
    return this.inner.consumesContextMenu();
  }
  /**
   * Whether pointer moves arriving with no button of the host's own down are wanted: a path
   * placed point by point, or a right-button session deciding whether it is a click or a pan.
   */
  wantsPointerMoves() {
    return this.inner.wantsPointerMoves();
  }
  /** Alt, as held for the move about to be reported. The eraser un-marks with it. */
  setAltHeld(e) {
    this.inner.setAltHeld(e);
  }
  /** Ctrl/Cmd, as held for the pointer event about to be reported: an arrow binds to nothing while it is down. */
  setCtrlHeld(e) {
    this.inner.setCtrlHeld(e);
  }
  /** A move with no button held: the arrow tool lights the shape it would attach to. */
  hoverPointer(e, n) {
    this.inner.hoverPointer(e, n);
  }
  /** The pointer left the canvas; whatever a hover lit goes out. */
  endHover() {
    this.inner.endHover();
  }
  /** `invertSnap` flips object snapping for this move — the host's Ctrl/Cmd. */
  movePointer(e, n, r = !1, o = !1) {
    this.inner.movePointer(e, n, r, o);
  }
  endPointer() {
    this.inner.endPointer();
  }
  cancelPointer() {
    this.inner.cancelPointer();
  }
  handleDoubleClick(e, n) {
    this.inner.handleDoubleClick(e, n);
  }
  /**
   * Whether a line or arrow is being placed point by point.
   *
   * The canvas asks on every pointer move, because a path is the one thing that tracks
   * the cursor with no button held.
   */
  linearInProgress() {
    return this.inner.linearInProgress();
  }
  /** Ends a path being placed, keeping the points already put down. */
  finishLinear() {
    this.inner.finishLinear();
  }
  /**
   * Writes `text` into the text `id` and commits it, in one call, ending a session open
   * on it; emptied, the text goes as `commitTextEdit` removes it. See `updateTextEdit`.
   */
  setElementText(e, n) {
    this.inner.setElementText(e, n);
  }
  /**
   * Commits a frame's name, trimmed, as one step — the host's input over the name label
   * (opened by `onRequestFrameRename`) calls this once, on Enter, blur or Escape alike.
   * Emptied, the name falls back to the generic default.
   */
  renameFrame(e, n) {
    this.inner.renameFrame(e, n);
  }
  /**
   * Numbers the frames `ids` lists 0, 1, 2… on the presentation path, in that order, as
   * one step. Ids that are not live frames are skipped; frames not listed keep their step.
   */
  setPresentationPath(e) {
    this.inner.setPresentationPath(JSON.stringify(e));
  }
  /**
   * The open text with `text` typed into it — laid out, its shape grown or shrunk —
   * with no step and no stamp: peers see it through `gestureElements`. `false` when no
   * text is open any more, and the editor should close.
   */
  updateTextEdit(e) {
    return this.inner.updateTextEdit(e);
  }
  /**
   * Ends the edit with `text`, as one step; emptied, the text goes. `viaKeyboard`
   * (Escape, Ctrl/Cmd+Enter) leaves it — or a label's shape — selected.
   */
  commitTextEdit(e, n) {
    this.inner.commitTextEdit(e, n);
  }
  /** Where the open text is and how it looks; null when none is open. */
  textEditLayout() {
    return zt(this.inner.textEditLayoutJson(), null);
  }
  /**
   * The text element `id` as it would be with `text` in it, without committing it —
   * for a host writing text whole (`setElementText`) to show peers while someone types.
   * A host on the typing session streams `gestureElements()`, which carries the shape the
   * text grows too. Null when `id` is not a text.
   */
  textPreview(e, n) {
    return zt(this.inner.textPreviewJson(e, n), null);
  }
  /** The heads of the selected lines and arrows, and always of the next arrow drawn. */
  setArrowheads(e) {
    this.inner.setArrowheadsJson(JSON.stringify(e));
  }
  /** Sharp, curved or elbow, for the selected arrows and the next one. */
  setArrowType(e) {
    this.inner.setArrowType(e);
  }
  /** Ctrl/Cmd+Shift+> and <: the selected texts a tenth bigger or smaller, each from its own size. */
  stepFontSize(e) {
    this.inner.stepFontSize(e);
  }
  /**
   * The font picker's hover: `id` shown on the selected texts uncommitted, or — with none —
   * what the last hover changed given back. `setFontFamily` commits; load the face first,
   * as for it.
   */
  previewFontFamily(e) {
    this.inner.previewFontFamily(e);
  }
  /** The families the board's texts use, each once: the font picker's "In this scene". */
  sceneFontFamilies() {
    return Array.from(this.inner.sceneFontFamilies());
  }
  /** "Bind text to the container": a free text and one empty shape selected (`selectionStyle().canBindText`). */
  bindText() {
    this.inner.bindText();
  }
  /** "Unbind text": each selected shape's label becomes free text (`selectionStyle().canUnbindText`). */
  unbindText() {
    this.inner.unbindText();
  }
  /** "Wrap text in a container": a rectangle around each selected free text (`selectionStyle().hasFreeText`). */
  wrapTextInContainer() {
    this.inner.wrapTextInContainer();
  }
  /** Whether Tab has a closed shape, or a line or an unbound arrow, selected to switch. */
  canConvertSelection() {
    return this.inner.canConvertSelection();
  }
  /**
   * The type the panel shows pressed, or `null` when the selection disagrees on it or
   * holds nothing to switch.
   *
   * The engine's to answer, not the host's: for a line or an arrow it is a reading of
   * `roundness` and `elbowed` (`LinearType::of`, `engine/convert.rs`), and a host that
   * worked it out from the scene JSON would be running an engine formula in TypeScript.
   */
  sharedConversionType() {
    const e = this.inner.sharedConversionType();
    return e !== void 0 && _9(e) ? e : null;
  }
  /** The shape switch opened: until `endConversion`, a label shrunk by a switch grows back. */
  beginConversion() {
    this.inner.beginConversion();
  }
  /** The shape switch closed. */
  endConversion() {
    this.inner.endConversion();
  }
  /**
   * Switches the selection to `to`, or a step round from the type it is at — forward for
   * Tab, back for Shift+Tab. One step of undo. Whether anything changed.
   *
   * A closed shape, a line or an unbound arrow, whichever the selection holds first: the
   * generic branch has preference (`ConvertElementTypePopup.tsx@1118751f:648-653`). Asking
   * for a type from the other family changes nothing (`isValidConversion`, `:929-950`).
   */
  convertSelection(e, n = !0) {
    return this.inner.convertSelection(e ?? void 0, n);
  }
  requestDraw() {
  }
  exportJson() {
    return this.inner.exportJson();
  }
  /**
   * The drawing as an SVG, of the selection when `selectionOnly` says so.
   *
   * The margin is the engine's own now — `ExportOptions`'s 10, the same one the PNG uses —
   * and it used to be a `16` this signature took. §2 does not allow the front to pick a
   * margin: it made the two formats disagree by 6px per side, and there was no way to tell
   * from here which of the two was meant. `selectionOnly` is the whole of the front's
   * contribution; whether that means the scene, a selection or one frame is decided in Rust,
   * because an empty selection is the scene (`data/index.ts@1118751f:48-96`).
   *
   * `transparent` and `darkMode` are the dialog's other two switches, forwarded whole. The
   * SVG used to ignore both — it always wrote its paper `<rect>` in the theme's colour —
   * which is what `shortkey.md:450` was half-open about. The **colour** of that paper is
   * not a parameter and never was a front's to pass: it is the engine's theme, which is the
   * oracle's arrangement too (`viewBackgroundColor` is app state the export reads,
   * `export.ts@1118751f:466`).
   */
  exportSvg(e = {}) {
    return this.inner.exportSvg(e.selectionOnly, e.transparent, e.darkMode) ?? null;
  }
  /**
   * The drawing as a PNG, of the selection when `selectionOnly` says so.
   *
   * The framing, the size and the background are the engine's — `ExportFrame` in
   * `crates/draw-engine/src/export/png.rs`, ported from the oracle's `exportToCanvas`
   * (`packages/excalidraw/scene/export.ts@1118751f:180-284`). Nothing is computed here and
   * the defaults are the binding's, so this is a forward and nothing else.
   *
   * The on-screen canvas is not what gets encoded. It never was meant to be: an export is
   * the scene, not wherever the camera happens to be, and a scene scrolled half off screen
   * used to export half a picture.
   *
   * `selectionOnly` is the dialog's checkbox and the whole of what the front chooses. It
   * does not say *which* thing to export: an empty selection is still the scene, and
   * selecting exactly one frame is a frame export, both decided in Rust.
   */
  exportPng(e = {}) {
    const n = this.inner.exportPng(
      e.scale,
      e.transparent,
      e.selectionOnly,
      e.darkMode
    );
    return n === void 0 ? Promise.resolve(null) : n.then(sc);
  }
  /**
   * The whole scene as a small PNG, no scene embedded. The engine caps the longest side
   * at 480 px; the host passes nothing but the dark switch.
   */
  exportThumbnail(e = {}) {
    const n = this.inner.exportThumbnail(e.darkMode);
    return n === void 0 ? Promise.resolve(null) : n.then(sc);
  }
  /**
   * One clipboard copy: whether to write it, under what type, of what, and the payload.
   *
   * The engine decides all four (BUNNY.md §2) — the MIME type is `image/png` or
   * `text/plain` and never the host's to pick, and the scope is the export scope, so an
   * empty selection is still the whole scene and a lone selected frame is still a frame
   * export. The two booleans are the only thing the host contributes, and they are facts
   * about the browser rather than decisions: `supportsClipboardBlob` and
   * `supportsClipboardWriteText` in the oracle's own spelling (`clipboard.ts@1118751f:65-72`).
   *
   * `blob` is a promise for the raster and `text` a string for the vector; the format's
   * other payload is absent. The promise is passed through rather than awaited here, so
   * this stays a forward — and a host that writes it and finds the promise resolved to
   * `null` has the oracle's `CANVAS_POSSIBLY_TOO_BIG` (`data/blob.ts@1118751f:245-252`),
   * a canvas too large to encode, which is a browser's answer and not one to retry.
   */
  clipboardCopy(e, n = {}) {
    const r = this.inner.clipboardCopy(
      e,
      n.canWriteBlob ?? !0,
      n.canWriteText ?? !0
    );
    return k9(r, e);
  }
  /**
   * The scene inside a saved picture or drawing, loaded — or why there is none.
   *
   * The other door beside [`loadScene`](./engine.ts), and the one the oracle's
   * `decodePngMetadata` (`data/image.ts@1118751f:49-71`) and `decodeSvgBase64Payload`
   * (`export.ts@1118751f:531-563`) are. What the bytes *are* is the engine's question and
   * is answered in Rust: this takes a `File`'s bytes and nothing else, so a host cannot
   * pick a container, a key, or a reading of a bad chunk (BUNNY.md §2).
   *
   * **The scene is loaded here rather than handed back**, which is why this returns an
   * outcome and not a string. The alternative was a result object the host then fed to
   * `loadScene`, and it puts the whole thing at risk in one line of the front — a host
   * that forgot the second call would open a file and see the board it already had, which is
   * the same silence as a blank board. A refusal cannot touch the scene at all, because the
   * scene is replaced on the one path that succeeded and on no other.
   *
   * `Uint8Array` rather than a `Blob` or an `ArrayBuffer`: a `Blob` has to be read before
   * anything can look at it, and `File.arrayBuffer()` gives bytes directly. The engine
   * sniffs the PNG signature and treats everything else as the vector container, so this
   * one call opens a `.png`, an `.svg` and nothing it should not.
   */
  restoreFromImage(e) {
    const n = this.inner.restoreFromImage(e);
    return S9(n);
  }
  loadScene(e) {
    return this.inner.loadScene(e);
  }
  clear() {
    this.inner.clear();
  }
  undo() {
    this.inner.undo();
  }
  redo() {
    this.inner.redo();
  }
  destroy() {
    this.inner.destroy();
  }
  /**
   * Replaces the image `imageId` with its trace, in one undoable step: the traced regions
   * as a group of editable shapes, or one SVG picture in the image's box. Tracing itself
   * happens off the main thread — see `TraceWorker` in `./vectorize`.
   */
  vectorizeImage(e, n, r) {
    const o = JSON.stringify(r), i = n.as === "shapes" ? this.inner.vectorizeToShapes(
      e,
      n.rings.colours,
      n.rings.lengths,
      n.rings.coords,
      o
    ) : this.inner.vectorizeToPicture(e, n.dataUrl, o), a = zt(
      i,
      { refused: "malformed" }
    );
    return a.refused ? { refused: a.refused } : { ids: a.ids ?? (a.id ? [a.id] : []) };
  }
  /** Everything the properties panel shows. Ask again when `styleRevision()` moves. */
  selectionStyle() {
    return zt(this.inner.selectionStyleJson(), gm);
  }
  /** Moves whenever `selectionStyle()` may have: selection, style, undo, a peer's edit. */
  styleRevision() {
    return this.inner.styleRevision();
  }
  /** Shows a style on the canvas without committing it; `applyStyle` commits. */
  previewStyle(e) {
    this.inner.previewStyleJson(JSON.stringify(e));
  }
  /** Remembers the first selected element's style. False when nothing is selected. */
  copyStyles() {
    return this.inner.copyStyles();
  }
  pasteStyles() {
    this.inner.pasteStyles();
  }
  /** How many live elements use each stroke or background colour. */
  colorCounts(e) {
    return zt(
      this.inner.colorCountsJson(e === "backgroundColor"),
      []
    );
  }
  /** Ctrl/Cmd+Arrow: preview a cluster of new nodes off the selected flowchart node. */
  flowchartCreate(e) {
    this.inner.flowchartCreate(e);
  }
  /** While Ctrl/Cmd is held, 1/2/3 picks the pending nodes' shape. */
  flowchartSetShape(e) {
    this.inner.flowchartSetShape(e);
  }
  /** Releasing Ctrl/Cmd: commits the pending cluster as one step of history. */
  flowchartCommit() {
    this.inner.flowchartCommit();
  }
  /** Escape while creating: drops the pending cluster without a trace. */
  flowchartCancel() {
    this.inner.flowchartCancel();
  }
  isCreatingFlowchart() {
    return this.inner.isCreatingFlowchart();
  }
  /** The pending cluster, for host UI that needs it outside the canvas painter. */
  pendingFlowchartElements() {
    return zt(this.inner.pendingFlowchartElementsJson(), []);
  }
  /** Alt+Arrow: selects the connected node in that direction. Returns its id, if any. */
  flowchartNavigate(e) {
    return this.inner.flowchartNavigate(e) ?? null;
  }
  /** Alt released: ends the exploration. */
  flowchartNavigationEnd() {
    this.inner.flowchartNavigationEnd();
  }
}
const E9 = "drawnosaurus:lastDrawing";
function T9(t, e) {
  try {
    t?.setItem(E9, e);
  } catch {
  }
}
const C9 = ["embedUrl", "frameId", "name", "dataUrl"], Zf = (t) => t == null;
function A9(t, e, n, r) {
  if (!e || e.length === 0) return { elements: [...t], repaired: [] };
  const o = new Map(e.map((l) => [l.id, l])), i = [];
  return { elements: t.map((l) => {
    const c = o.get(l.id);
    if (!c || l.isDeleted || c.version !== l.version || c.versionNonce !== l.versionNonce)
      return l;
    const d = l, u = C9.filter((p) => Zf(d[p]) && !Zf(c[p]));
    if (u.length === 0) return l;
    const f = { ...d };
    for (const p of u) f[p] = c[p];
    const h = {
      ...f,
      version: l.version + 1,
      versionNonce: r(),
      updated: n
    };
    return i.push(h), h;
  }), repaired: i };
}
const pl = (t) => t, P9 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], mm = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: (\d{4}))?$/, I9 = "#1e1e1e", z9 = 20;
function M9(t, e) {
  const n = typeof t == "string" ? mm.exec(t) : null;
  if (!n) return null;
  const r = Number(n[1]), o = P9.indexOf(n[2] ?? ""), i = (c) => new Date(c, o, r).getDate() === r, a = (c) => new Date(c, o, r, 12).getTime();
  if (n[3] !== void 0) {
    const c = Number(n[3]);
    return i(c) ? a(c) : null;
  }
  const l = new Date(e).getFullYear();
  for (let c = l; c > l - 8; c -= 1)
    if (i(c) && new Date(c, o, r).getTime() <= e) return a(c);
  return null;
}
function Kf(t) {
  const { groupIds: e, groupId: n } = t;
  return Array.isArray(e) ? typeof e[0] == "string" ? e[0] : void 0 : typeof n == "string" && n !== "" ? n : void 0;
}
function Vf(t) {
  const e = { ...t };
  if (Array.isArray(t.groupIds)) {
    const n = t.groupIds.slice(1);
    n.length > 0 ? e.groupIds = n : delete e.groupIds;
  } else
    delete e.groupId;
  return e;
}
const O9 = (t) => t.type === "rectangle" && typeof t.backgroundColor == "string" && t.backgroundColor.toLowerCase() === "#000000" && t.strokeColor === "transparent" && typeof t.opacity == "number" && t.opacity < 100 && !t.boundTextId, F9 = (t) => (typeof t.text == "string" ? t.text : "").trim() === "" && (typeof t.originalText == "string" ? t.originalText : "").trim() === "";
function R9(t, e) {
  if (t.length < 3 || t.length > 4) return null;
  const n = t.filter((f) => f.type === "rectangle"), r = t.filter((f) => f.type === "text");
  if (n.length !== 2 || n.length + r.length !== t.length) return null;
  const o = n.filter(O9), i = o[0], a = n.find((f) => f !== i);
  if (o.length !== 1 || !i || !a || a.backgroundColor === "transparent")
    return null;
  const l = r.filter((f) => !f.containerId), c = l[0], d = c ? M9(c.text, e) : null, u = r.filter((f) => f.containerId === a.id);
  return l.length !== 1 || !c || d === null || u.length + l.length !== r.length ? null : { shadow: i, note: a, date: c, created: d, label: u[0] };
}
function vm(t, e, n) {
  const r = /* @__PURE__ */ new Set();
  for (const p of t) {
    const m = pl(p);
    if (m.isDeleted || m.type !== "text" || m.containerId) continue;
    const w = Kf(m);
    w !== void 0 && typeof m.text == "string" && mm.test(m.text) && r.add(w);
  }
  if (r.size === 0) return { elements: [...t], changed: [], removed: [] };
  const o = /* @__PURE__ */ new Map();
  for (const p of t) {
    const m = pl(p), w = m.isDeleted ? void 0 : Kf(m);
    if (w === void 0 || !r.has(w)) continue;
    const y = o.get(w);
    y ? y.push(m) : o.set(w, [m]);
  }
  const i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), l = (p) => ({ ...p, version: p.version + 1, versionNonce: n(), updated: e }), c = (p) => {
    i.set(p.id, null), a.set(p.id, l({ ...p, isDeleted: !0 }));
  }, d = /* @__PURE__ */ new Map();
  for (const p of o.values()) {
    const m = R9(p, e);
    if (!m) continue;
    const { shadow: w, note: y, date: k, created: O, label: C } = m;
    d.set(w.id, y.id);
    const P = C && !F9(C) ? C : void 0, S = typeof C?.strokeColor == "string" && C.strokeColor !== "transparent" ? C.strokeColor : I9, T = Vf(y);
    if (P ? T.boundTextId = P.id : delete T.boundTextId, i.set(
      y.id,
      l({
        ...T,
        type: "stickynote",
        fillStyle: "solid",
        // The legacy border was the pad's own colour; a native note's stroke is its ink —
        // the label's and the footer's.
        strokeColor: S,
        baseHeight: y.height,
        created: O
      })
    ), P) {
      const M = typeof P.fontSize == "number" ? P.fontSize : z9;
      i.set(P.id, l({ ...Vf(P), baseFontSize: M }));
    } else C && c(C);
    c(w), c(k);
  }
  if (i.size === 0) return { elements: [...t], changed: [], removed: [] };
  for (const p of t) {
    const m = pl(p);
    if (m.isDeleted || i.has(m.id)) continue;
    const w = typeof m.startBinding == "string" ? d.get(m.startBinding) : void 0, y = typeof m.endBinding == "string" ? d.get(m.endBinding) : void 0;
    w === void 0 && y === void 0 || i.set(
      m.id,
      l({
        ...m,
        ...w === void 0 ? {} : { startBinding: w },
        ...y === void 0 ? {} : { endBinding: y }
      })
    );
  }
  const u = [], f = [], h = [];
  for (const p of t) {
    const m = i.get(p.id);
    if (m === void 0)
      u.push(p);
    else if (m === null) {
      const w = a.get(p.id);
      w && h.push(w);
    } else
      u.push(m), f.push(m);
  }
  return { elements: u, changed: f, removed: h };
}
function _m(t, e, n) {
  let r;
  try {
    r = JSON.parse(t);
  } catch {
    return null;
  }
  if (typeof r != "object" || r === null) return null;
  const { type: o, elements: i } = r;
  if (o !== "osidraw" || !Array.isArray(i) || !i.every((l) => typeof l == "object" && l !== null)) return null;
  const a = vm(i, e, n);
  return a.changed.length === 0 ? null : JSON.stringify({ ...r, elements: a.elements });
}
const pi = "elements", mi = "boards", L9 = "drawings", D9 = "drawnosaurus-drafts", N9 = 2;
function B9(t) {
  return new Promise((e, n) => {
    const r = t.open(D9, N9);
    r.onupgradeneeded = (o) => {
      const i = r.result;
      o.oldVersion < 1 && (i.createObjectStore(pi, { keyPath: ["slug", "id"] }).createIndex("slug", "slug"), i.createObjectStore(mi, { keyPath: "slug" })), o.oldVersion < 2 && i.createObjectStore(L9, { keyPath: "slug" }).createIndex("updatedAt", "updatedAt");
    }, r.onsuccess = () => {
      const o = r.result;
      o.onversionchange = () => o.close(), e(o);
    }, r.onerror = () => n(r.error);
  });
}
const U9 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], Jf = (t) => `Drawing — ${t.getDate()} ${U9[t.getMonth()]}`, j9 = 1e3, Gf = "drawnosaurus:draft:";
function H9(t, e, n) {
  let r;
  const o = new Promise((i) => {
    r = setTimeout(() => i(n), e);
  });
  return Promise.race([t, o]).finally(() => clearTimeout(r));
}
function ym(t) {
  const e = Gs(JSON.stringify(t.scene)) ?? [];
  return {
    title: t.title,
    loaded: e,
    // Something on it and no picture stored: the gallery's card would stay blank.
    needsThumbnailBackfill: e.some((n) => !n.isDeleted) && !t.thumbnailAt
  };
}
async function W9(t) {
  const { slug: e, now: n, nonce: r } = t, o = t.browser ? await K9(t) : await Z9(t);
  let { elements: i } = o;
  const a = [...o.resave], l = vm(i, n(), r);
  if (l.changed.length > 0) {
    i = l.elements;
    const c = l.removed.map((d) => d.id);
    a.push(...l.changed.map((d) => d.id), ...c), t.browser || t.drafts?.record(e, l.changed, c, {
      order: i.map((d) => d.id)
    });
  }
  return { ...o, elements: i, resave: a, tombstones: l.removed };
}
async function Z9({
  slug: t,
  store: e,
  drafts: n,
  storage: r,
  now: o,
  nonce: i,
  newTitle: a
}) {
  const l = n?.load(t) ?? Promise.resolve(null);
  try {
    const { title: c, loaded: d, needsThumbnailBackfill: u } = ym(await e.get(t));
    r?.removeItem(`${Gf}${t}`);
    const f = await H9(l, j9, null), h = A9(d, f, o(), i);
    return {
      title: c,
      loaded: d,
      elements: h.elements,
      resave: h.repaired.map((p) => p.id),
      needsThumbnailBackfill: u,
      failure: null,
      copied: null
    };
  } catch {
    const c = await l, d = r?.getItem(`${Gf}${t}`), u = c ?? (d ? Gs(d) ?? [] : []);
    return {
      title: a ?? (t ? `Board ${t}` : "Untitled"),
      loaded: u,
      elements: u,
      resave: [],
      needsThumbnailBackfill: !1,
      failure: null,
      copied: null
    };
  }
}
const ml = { loaded: [], elements: [], resave: [], needsThumbnailBackfill: !1, copied: null };
async function K9({ slug: t, store: e, now: n, stored: r }) {
  let o = null;
  try {
    o = ym(await e.get(t));
  } catch (i) {
    if (i instanceof Ft && i.status === 404)
      o = null;
    else
      return {
        ...ml,
        title: "Untitled",
        failure: i instanceof Error ? i : new Error(String(i))
      };
  }
  if (o && o.loaded.length > 0)
    return { ...o, elements: o.loaded, resave: [], failure: null, copied: null };
  if (r)
    try {
      const i = await r.read();
      if (i)
        return {
          title: o?.title ?? Jf(new Date(n())),
          // This browser holds nothing of it yet: the saver writes the copy here, so the
          // next visit finds the whole drawing and not only what changed since.
          loaded: [],
          elements: i.elements,
          resave: [],
          needsThumbnailBackfill: i.elements.some((a) => !a.isDeleted),
          failure: null,
          copied: i.elements
        };
    } catch (i) {
      return {
        ...ml,
        title: o?.title ?? "Untitled",
        failure: i instanceof Error ? i : new Error(String(i))
      };
    }
  return {
    ...ml,
    title: o?.title ?? Jf(new Date(n())),
    needsThumbnailBackfill: !1,
    failure: null
  };
}
const [bm, V9] = zS(), J9 = (t, e) => t.length === e.length && t.every((n, r) => n === e[r]);
function qf(t, e) {
  const n = new Set(e.filter((a) => a.isDeleted).map((a) => a.id)), r = n.size > 0 ? t.filter((a) => !n.has(a)) : [...t], o = new Set(t), i = e.filter((a) => !a.isDeleted && !o.has(a.id)).map((a) => a.id);
  return [...r, ...i];
}
function Yf(t, e, n) {
  const r = {
    ...t,
    isDeleted: !0,
    version: t.version + 1,
    versionNonce: n(),
    updated: e
  };
  return delete r.dataUrl, r;
}
class wm {
  /** Last acknowledged element per id, tombstones included. */
  known = /* @__PURE__ */ new Map();
  /** Last acknowledged LIVE id sequence — the server's z-order as we understand it. */
  order = [];
  /**
   * The ids changed since the last acknowledged diff, each with the note it came in, or
   * `null` when something happened that only comparing everything can see.
   *
   * The engine says what changed; the tracker used to ignore that and compare every
   * element on the board against what the server has, on every save and every live
   * send. On 9,000 shapes that was a millisecond and a half per Ctrl+D, twice. With the
   * ids it looks at those and nothing else. A whole scene arriving — an undo, a reorder,
   * a file opened — can change anything, and puts it back to comparing everything.
   */
  touched = /* @__PURE__ */ new Map();
  /** Counts notes, so an acknowledgement can tell which ones its diff covered. */
  notes = 0;
  /** The patch last returned by `diff`, and the note it was built at. */
  lastDiff = null;
  /** Adopt the server's truth: initial load, or a reload after a conflict. */
  reset(e) {
    this.known = new Map(e.map((n) => [n.id, n])), this.order = e.filter((n) => !n.isDeleted).map((n) => n.id), this.touched = /* @__PURE__ */ new Map(), this.lastDiff = null;
  }
  /**
   * These ids changed — in place, or new on top, or deleted. Only what a delta from the
   * engine can say: nothing moved in the stack.
   */
  noteChanged(e) {
    if (this.notes += 1, this.touched !== null)
      for (const n of e) this.touched.set(n, this.notes);
  }
  /** Something changed that only a full comparison can find. */
  noteEverything() {
    this.notes += 1, this.touched = null;
  }
  /**
   * The patch that brings the server to `current`, or null when already in sync.
   *
   * `now` and `nonce` are injected rather than read from the ambient clock so a
   * synthesised stamp is reproducible in a test.
   */
  diff(e, n, r, o) {
    const i = this.touched !== null && o ? this.diffTouched(this.touched, o, n, r) : this.diffAll(e, n, r);
    return this.lastDiff = i ? { patch: i, at: this.notes, full: this.touched === null } : null, i || this.settle(this.notes, this.touched === null), i;
  }
  /** What `diff` does when told which ids changed: those, and nothing else. */
  diffTouched(e, n, r, o) {
    const i = [];
    for (const a of e.keys()) {
      const l = n(a);
      if (l && !l.isDeleted) {
        const d = this.changeOf(l, r, o);
        d && i.push(d);
        continue;
      }
      const c = this.known.get(a);
      c && !c.isDeleted && i.push(Yf(c, r, o));
    }
    return i.length === 0 ? null : { elements: i };
  }
  /** How `element` differs from what the server has, as the element to send — or null. */
  changeOf(e, n, r) {
    const o = this.known.get(e.id);
    return o === void 0 ? e : o.isDeleted && e.version <= o.version ? {
      ...e,
      version: Math.max(e.version, o.version) + 1,
      versionNonce: r(),
      updated: n
    } : o.version !== e.version || o.versionNonce !== e.versionNonce ? e : null;
  }
  /** Comparing everything: the scene as it is against everything the server has. */
  diffAll(e, n, r) {
    const o = e.filter((u) => !u.isDeleted), i = [];
    for (const u of o) {
      const f = this.changeOf(u, n, r);
      f && i.push(f);
    }
    const a = new Set(o.map((u) => u.id));
    for (const [u, f] of this.known)
      a.has(u) || f.isDeleted || i.push(Yf(f, n, r));
    const l = qf(this.order, i), c = o.map((u) => u.id), d = !J9(l, c);
    return i.length === 0 && !d ? null : d ? { elements: i, order: c } : { elements: i };
  }
  /**
   * Record a patch the server accepted. Only what was actually sent becomes known,
   * so an element that missed the request stays dirty and goes out next time.
   */
  acknowledge(e) {
    const n = e.order ?? qf(this.order, e.elements);
    for (const r of e.elements) this.known.set(r.id, r);
    this.order = n, this.lastDiff?.patch === e && (this.settle(this.lastDiff.at, this.lastDiff.full), this.lastDiff = null);
  }
  /** Forgets the notes up to `at`, which a diff covered and the server now has. */
  settle(e, n) {
    if (this.touched === null) {
      n && e === this.notes && (this.touched = /* @__PURE__ */ new Map());
      return;
    }
    for (const [r, o] of this.touched) o <= e && this.touched.delete(r);
  }
  /** Visible for diagnostics: the z-order we believe the server holds. */
  get serverOrder() {
    return this.order;
  }
  /** Visible for diagnostics: how many ids we believe the server holds. */
  get knownCount() {
    return this.known.size;
  }
  /** Every element the other side is known to have, tombstones included. */
  knownElements() {
    return this.known.values();
  }
}
const G9 = 800, vl = 1e3, q9 = 3e4, Y9 = () => Math.floor(Math.random() * 2147483647);
class km {
  tracker = new wm();
  timer = null;
  inFlight = !1;
  /** Settles when the request in flight has landed and its follow-up has been decided. */
  landed = null;
  /** A change arrived while a request was in flight — run again when it lands. */
  dirty = !1;
  retryMs = vl;
  disposed = !1;
  options;
  constructor(e) {
    this.options = e;
  }
  /** The scene changed. Cheap to call on every engine event. */
  notify() {
    if (this.disposed) return;
    if (this.inFlight) {
      this.dirty = !0;
      return;
    }
    this.setStatus("pending");
    const { throttleMs: e } = this.options;
    e === void 0 ? this.arm(this.options.debounceMs ?? G9) : this.timer === null && this.arm(e);
  }
  /**
   * Send immediately — for page-hide, navigation, or an explicit save.
   *
   * Everything noted before the call goes out, even with a request already in flight: it
   * waits for that one to land, then sends what remains. And it survives a `dispose()`
   * made right after, which is what a page does when it leaves — the follow-up that
   * `notify()` would have armed is a no-op by then.
   */
  async flush() {
    if (!this.disposed) {
      for (this.clearTimer(); this.landed !== null; ) await this.landed;
      this.clearTimer(), this.dirty = !1, await this.run(!0);
    }
  }
  /**
   * Stops the debounce and the retries; nothing noted from here on is sent. A `flush()`
   * already under way still finishes, and if its send fails it is not retried — the
   * draft store keeps those edits locally.
   */
  dispose() {
    this.disposed = !0, this.clearTimer();
  }
  arm(e) {
    this.clearTimer(), this.timer = setTimeout(() => {
      this.timer = null, this.run();
    }, e);
  }
  clearTimer() {
    this.timer !== null && (clearTimeout(this.timer), this.timer = null);
  }
  /** `flushing` is a flush that began before `dispose()`, which may still send. */
  async run(e = !1) {
    if (this.disposed && !e || this.inFlight) return;
    const n = this.options.now ?? Date.now, r = this.options.nonce ?? Y9, o = this.tracker.diff(this.options.readScene(), n(), r, this.options.lookup);
    if (o === null) {
      this.setStatus("idle");
      return;
    }
    this.inFlight = !0;
    let i;
    this.landed = new Promise((a) => {
      i = a;
    }), this.setStatus("saving");
    try {
      await this.options.send(o), this.tracker.acknowledge(o), this.retryMs = vl, this.inFlight = !1, this.dirty ? (this.dirty = !1, this.notify()) : this.setStatus("idle");
    } catch (a) {
      this.inFlight = !1;
      const l = this.options.classify?.(a) ?? "retry";
      if (l !== "retry") {
        this.retryMs = vl, this.setStatus(l), this.dirty && (this.dirty = !1, this.notify());
        return;
      }
      if (this.setStatus("error"), this.disposed) return;
      this.arm(this.retryMs), this.retryMs = Math.min(this.retryMs * 2, q9);
    } finally {
      this.landed = null, i();
    }
  }
  setStatus(e) {
    this.options.onStatus?.(e);
  }
}
const X9 = (t) => {
  const e = globalThis.requestIdleCallback;
  e ? e(t, { timeout: 1e3 }) : setTimeout(t, 200);
};
class Q9 {
  constructor(e, n = X9) {
    this.backend = e, this.schedule = n;
  }
  backend;
  schedule;
  puts = /* @__PURE__ */ new Map();
  deletes = /* @__PURE__ */ new Set();
  /** A new order for the whole stack, pending. */
  order = null;
  /** Ids put on top since the order last written, pending, in the order they went. */
  appended = [];
  slug = "";
  scheduled = !1;
  writing = Promise.resolve();
  /**
   * Notes what one scene change did, and how it moved the stack: `{ order }` for a
   * change that rearranged it — an undo, a reorder — and `{ appended }` for everything
   * else, where the only movement is new elements going on top.
   *
   * The whole order used to come with every change, and comparing it with the last one
   * stored was a pass over the board per keystroke.
   */
  record(e, n, r, o) {
    if (e) {
      e !== this.slug && (this.puts.clear(), this.deletes.clear(), this.order = null, this.appended = [], this.slug = e);
      for (const i of n)
        this.puts.set(i.id, i), this.deletes.delete(i.id);
      for (const i of r)
        this.puts.delete(i), this.deletes.add(i);
      "order" in o ? (this.order = o.order, this.appended = []) : o.appended.length > 0 && (this.order ? this.order = [...this.order, ...o.appended] : this.appended.push(...o.appended)), this.arm();
    }
  }
  /** Writes whatever is pending now — for page hide. */
  async flush() {
    const e = this.puts.size === 0 && this.deletes.size === 0 && !this.order && this.appended.length === 0;
    if (!this.slug || e) {
      await this.writing;
      return;
    }
    const n = this.slug, r = [...this.puts.values()], o = [...this.deletes], i = this.order ? { order: this.order } : this.appended.length > 0 ? { appended: this.appended } : null;
    this.puts.clear(), this.deletes.clear(), this.order = null, this.appended = [], this.writing = this.writing.then(() => this.backend.write(n, r, o, i)).catch(() => {
    }), await this.writing;
  }
  /** The stored board in z-order, or null when there is none. */
  async load(e) {
    try {
      const n = await this.backend.read(e);
      if (!n) return null;
      const r = new Map(n.elements.map((i) => [i.id, i])), o = [];
      for (const i of n.order) {
        const a = r.get(i);
        a && (o.push(a), r.delete(i));
      }
      return o.push(...r.values()), o.length > 0 ? o : null;
    } catch {
      return null;
    }
  }
  arm() {
    this.scheduled || (this.scheduled = !0, this.schedule(() => {
      this.scheduled = !1, this.flush();
    }));
  }
}
function $9(t, e) {
  if ("order" in e) return [...e.order];
  const n = new Set(t);
  return [...t, ...e.appended.filter((r) => !n.has(r))];
}
function e4() {
  const t = globalThis.indexedDB;
  if (!t)
    return { write: async () => {
    }, read: async () => null };
  let e = null;
  const n = () => e ??= B9(t), r = (o) => new Promise((i, a) => {
    o.oncomplete = () => i(), o.onerror = () => a(o.error), o.onabort = () => a(o.error);
  });
  return {
    async write(o, i, a, l) {
      const d = (await n()).transaction([pi, mi], "readwrite"), u = d.objectStore(pi);
      for (const f of i) u.put({ slug: o, id: f.id, element: f });
      for (const f of a) u.delete([o, f]);
      if (l) {
        const f = d.objectStore(mi), h = f.get(o);
        h.onsuccess = () => {
          const p = h.result?.order ?? [];
          f.put({ slug: o, order: $9(p, l) });
        };
      }
      await r(d);
    },
    async read(o) {
      const a = (await n()).transaction([pi, mi], "readonly"), l = a.objectStore(mi).get(o), c = a.objectStore(pi).index("slug").getAll(o);
      await r(a);
      const d = c.result ?? [];
      if (d.length === 0) return null;
      const u = l.result;
      return { elements: d.map((f) => f.element), order: u?.order ?? [] };
    }
  };
}
class Sm {
  list = [];
  index = /* @__PURE__ */ new Map();
  /** Every live element, bottom of the stack first. Changed in place: do not keep it. */
  get elements() {
    return this.list;
  }
  /** One element by id, or undefined when there is none. */
  lookup = (e) => {
    const n = this.index.get(e);
    return n === void 0 ? void 0 : this.list[n];
  };
  /**
   * Takes a whole scene — a load, an undo, a reorder — and returns what it changed: the
   * elements that are new or differ by `same`, and the ids that are gone. `same` is
   * identity by default; a scene parsed afresh needs it to compare stamps instead.
   */
  replace(e, n = (r, o) => r === o) {
    const r = this.index, o = this.list;
    this.list = e.filter((l) => !l.isDeleted), this.reindex();
    const i = this.list.filter((l) => {
      const c = r.get(l.id), d = c === void 0 ? void 0 : o[c];
      return d === void 0 || !n(d, l);
    }), a = o.map((l) => l.id).filter((l) => !this.index.has(l));
    return { changed: i, removed: a };
  }
  /**
   * Applies a delta, and returns the ids it put on top, in order.
   *
   * An element it names is either where it was or new on top — then, when the delta
   * carries an order, the stack is put in it. The engine used to send the whole scene
   * for that, which on 20,000 shapes was 10.7MB for one shape drawn into a frame.
   */
  apply(e) {
    const n = this.applyElements(e);
    return e.order && this.arrange(e.order), n;
  }
  applyElements(e) {
    const n = [];
    if (!(e.removed.length > 0 || e.updated.some((l) => l.isDeleted))) {
      for (const l of e.updated) {
        const c = this.index.get(l.id);
        c === void 0 ? (this.index.set(l.id, this.list.length), this.list.push(l), n.push(l.id)) : this.list[c] = l;
      }
      return n;
    }
    const o = new Set(e.removed), i = /* @__PURE__ */ new Map();
    for (const l of e.updated)
      l.isDeleted ? o.add(l.id) : i.set(l.id, l);
    const a = [];
    for (const l of this.list) {
      if (o.has(l.id)) continue;
      const c = i.get(l.id);
      c ? (a.push(c), i.delete(l.id)) : a.push(l);
    }
    for (const l of i.values())
      a.push(l), n.push(l.id);
    return this.list = a, this.reindex(), n;
  }
  /** Puts the stack in `order`. What it leaves out stays, on top, as it was. */
  arrange(e) {
    const n = new Set(e), r = [];
    for (const o of e) {
      const i = this.lookup(o);
      i && r.push(i);
    }
    for (const o of this.list) n.has(o.id) || r.push(o);
    this.list = r, this.reindex();
  }
  reindex() {
    this.index = new Map(this.list.map((e, n) => [e.id, n]));
  }
}
const t4 = 7 * 1024 * 1024, n4 = (t) => typeof t.dataUrl == "string";
function r4(t, e = t4) {
  const n = (l) => t.order === void 0 ? { elements: l } : { elements: l, order: t.order }, r = [], o = [];
  let i = [], a = 0;
  for (const l of t.elements) {
    if (n4(l)) {
      r.push(l);
      continue;
    }
    const c = JSON.stringify(l).length;
    i.length > 0 && a + c > e && (o.push(i), i = [], a = 0), i.push(l), a += c;
  }
  return (i.length > 0 || r.length === 0 && o.length === 0) && o.push(i), [...o.map(n), ...r.map((l) => n([l]))];
}
const Xf = {
  1: "select",
  v: "select",
  // Excalidraw exposes the lasso as a *mode* of the selection tool, sharing its
  // shortcut, with Alt+Ctrl toggling it mid-drag. Ours is its own toolbar entry, so it
  // needs a key of its own; "l" is already the line.
  s: "lasso",
  2: "rectangle",
  r: "rectangle",
  3: "diamond",
  d: "diamond",
  4: "ellipse",
  o: "ellipse",
  5: "arrow",
  a: "arrow",
  6: "line",
  l: "line",
  7: "freedraw",
  p: "freedraw",
  // Freedraw is the only tool with two letters, and X is the one people arriving from
  // other editors reach for.
  x: "freedraw",
  8: "text",
  t: "text",
  // Excalidraw binds the eraser to both E and 0; the toolbar badge has always shown 0,
  // so without the digit the badge promised a key that did nothing.
  0: "eraser",
  e: "eraser",
  // Excalidraw's laser key, and the same reasoning as the lasso: "l" is the line.
  k: "laser",
  f: "frame",
  9: "image",
  w: "embed",
  // The one chord in the table: the shifted freedraw key.
  "shift+x": "autoshape",
  // Excalidraw's own key for the bucket.
  b: "bucketfill",
  // A letter and no digit, as the oracle has it.
  n: "stickynote",
  h: "hand",
  // No oracle key to take: the Shapes picker's own.
  u: "figure"
};
function o4(t, e) {
  const n = t.toLowerCase();
  if (e) {
    const r = Xf[`shift+${n}`];
    if (r) return r;
  }
  return Xf[n] ?? null;
}
const i4 = { BracketRight: "]", BracketLeft: "[" }, s4 = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right"
}, a4 = {
  1: "rectangle",
  2: "diamond",
  3: "ellipse"
}, l4 = {
  ArrowUp: "top",
  ArrowDown: "bottom",
  ArrowLeft: "left",
  ArrowRight: "right"
};
function c4(t, e, n) {
  const { engine: r } = t, o = e.shiftKey ? l4[e.key] : void 0;
  if (o && r.canAlign())
    return r.alignSelection(o), !0;
  if (n === "z")
    return e.shiftKey ? r.redo() : r.undo(), !0;
  if (n === "y")
    return r.redo(), !0;
  if (n === "a")
    return r.selectAll(), !0;
  if (n === "d")
    return r.duplicateSelection(), !0;
  if (n === "g")
    return e.shiftKey ? r.ungroupSelection() : r.toggleGroupSelection(), !0;
  if (n === "l" && e.shiftKey && r.getSelection().length > 0)
    return r.toggleLockSelection(), !0;
  if (e.key === "=" || e.key === "+")
    return r.zoomIn(), !0;
  if (e.key === "-" || e.key === "_")
    return r.zoomOut(), !0;
  if (e.key === "0")
    return r.zoomReset(), !0;
  const i = e.key === "]" || e.key === "[" ? e.key : e.shiftKey || e.altKey ? i4[e.code] : void 0;
  if (i) {
    const a = e.shiftKey || e.altKey;
    return r.reorderSelection(i === "]" ? a ? "front" : "forward" : a ? "back" : "backward"), !0;
  }
  if (n === "c") {
    const a = r.copySelection();
    return a && navigator.clipboard?.writeText(a).catch(() => {
    }), !0;
  }
  if (n === "x") {
    const a = r.cutSelection();
    return a && navigator.clipboard?.writeText(a).catch(() => {
    }), !0;
  }
  return !1;
}
function Qf(t, e) {
  const { engine: n } = t;
  if (e.key === "Delete" || e.key === "Backspace")
    return n.deleteSelection(), !0;
  if (e.key.startsWith("Arrow") && !(e.metaKey || e.ctrlKey)) {
    if (n.getSelection().length === 0) return !1;
    const a = n.nudgeStep(e.shiftKey), l = e.key === "ArrowLeft" ? -a : e.key === "ArrowRight" ? a : 0, c = e.key === "ArrowUp" ? -a : e.key === "ArrowDown" ? a : 0;
    return n.nudgeSelection(l, c), !0;
  }
  if (e.key === " " && !(e.metaKey || e.ctrlKey))
    return e.repeat || (t.spaceHeld = !0), !0;
  const r = e.shiftKey && !e.altKey && !(e.metaKey || e.ctrlKey);
  if (r && e.code === "Digit1")
    return n.zoomToFit(), !0;
  if (r && e.code === "Digit2")
    return n.zoomToFitSelectionInViewport(), !0;
  if (r && e.code === "Digit3")
    return n.zoomToFitSelection(), !0;
  if (e.key === "PageUp" || e.key === "PageDown") {
    const a = e.key === "PageDown" ? 1 : -1;
    return e.shiftKey ? n.pageBy(a, 0) : n.pageBy(0, a), !0;
  }
  if (e.key === "Enter")
    return n.editSelectedText();
  const o = e.code === "KeyH" ? "horizontal" : e.code === "KeyV" ? "vertical" : null;
  if (o && e.shiftKey && n.getSelection().length > 0)
    return n.flipSelection(o), !0;
  if (e.key.toLowerCase() === "q")
    return n.setToolLocked(!n.getToolLocked()), t.callbacks.onToolLockChange?.(n.getToolLocked()), !0;
  const i = o4(e.key, e.shiftKey);
  return i ? (n.activateTool(i), !0) : !1;
}
function u4(t, e) {
  const { engine: n } = t, r = e.metaKey || e.ctrlKey;
  if (e.key === "Escape")
    return n.isCreatingFlowchart() ? (n.flowchartCancel(), t.callbacks.onFlowchartCreatingChange?.(!1), "prevent") : (n.cancelPointer(), "pass");
  if (e.key === "Enter" && t.engine.linearInProgress())
    return t.engine.finishLinear(), "prevent";
  const o = s4[e.key];
  if (o) {
    if (r && !e.shiftKey)
      return n.flowchartCreate(o), t.callbacks.onFlowchartCreatingChange?.(n.isCreatingFlowchart()), "prevent";
    if (e.altKey && n.getSelection().length === 1)
      return n.flowchartNavigate(o), "prevent";
    if (e.altKey && !r) return Qf(t, e) ? "prevent" : "pass";
  }
  const i = a4[e.key];
  return r && i && n.isCreatingFlowchart() ? (n.flowchartSetShape(i), "prevent") : r && c4(t, e, e.key.toLowerCase()) ? "prevent" : r || e.altKey ? "pass" : Qf(t, e) ? "prevent" : "pass";
}
function d4(t, e) {
  const { engine: n } = t;
  e.altKey || n.flowchartNavigationEnd(), e.metaKey || e.ctrlKey || (n.flowchartCommit(), t.callbacks.onFlowchartCreatingChange?.(!1));
}
function f4(t) {
  const { engine: e, container: n } = t, r = (a) => {
    u4(t, a) === "prevent" && a.preventDefault();
  }, o = (a) => {
    a.key === " " && (t.spaceHeld = !1), d4(t, a);
  }, i = (a) => {
    const l = a.clipboardData?.getData("text/plain") ?? "", { lastPointer: c } = t, d = c ? e.screenToWorld(c.x, c.y) : void 0;
    e.pasteJson(l || null, d) || l && e.pasteText(l, d) || (e.pasteJson(null, d), a.preventDefault());
  };
  return n.addEventListener("keydown", r), n.addEventListener("keyup", o), n.addEventListener("paste", i), () => {
    n.removeEventListener("keydown", r), n.removeEventListener("keyup", o), n.removeEventListener("paste", i);
  };
}
function Zn(t, e) {
  const n = t.getBoundingClientRect();
  return { x: e.clientX - n.left, y: e.clientY - n.top };
}
const h4 = 1, g4 = 2, p4 = 40, m4 = 800;
function $f(t, e) {
  return e === h4 ? t * p4 : e === g4 ? t * m4 : t;
}
function hs(t) {
  return t ? -t : 0;
}
function v4(t) {
  const e = $f(t.deltaX, t.deltaMode), n = $f(t.deltaY, t.deltaMode);
  if (!e && !n) return { kind: "none" };
  const r = t.ctrlKey || t.metaKey;
  if (t.shiftKey) {
    const o = n || e;
    return r ? { kind: "pan", dx: 0, dy: hs(o) } : { kind: "pan", dx: hs(o), dy: 0 };
  }
  return r && n !== 0 ? { kind: "zoom", deltaY: n } : { kind: "pan", dx: hs(e), dy: hs(n) };
}
const _4 = 5, y4 = 100;
function xm(t, e) {
  const { x: n, y: r } = Zn(t.canvas, e);
  f9(), t.engine.setAltHeld(e.altKey), t.engine.setCtrlHeld(e.ctrlKey || e.metaKey), t.engine.movePointer(n, r, e.shiftKey, e.ctrlKey || e.metaKey);
}
function _l(t) {
  t.hoverRaf && cancelAnimationFrame(t.hoverRaf), t.hoverRaf = 0, t.pendingHover = null;
}
function b4(t, e) {
  t.pendingHover = e, !t.hoverRaf && (t.hoverRaf = requestAnimationFrame(() => {
    const n = t.pendingHover;
    if (t.hoverRaf = 0, t.pendingHover = null, !n || t.down) return;
    const { x: r, y: o } = Zn(t.canvas, n);
    t.engine.setAltHeld(n.altKey), t.engine.setCtrlHeld(n.ctrlKey || n.metaKey), t.engine.hoverPointer(r, o);
  }));
}
function ac(t) {
  t.moveRaf && cancelAnimationFrame(t.moveRaf), t.moveRaf = 0, t.pendingMove = null;
}
function eh(t) {
  const e = t.pendingMove;
  ac(t), e && xm(t, e);
}
function w4(t) {
  const { canvas: e, engine: n, callbacks: r } = t;
  let o = !1;
  const i = /* @__PURE__ */ new Set(), a = e.ownerDocument.defaultView ?? window;
  let l = null, c = 0;
  const d = () => {
    a.clearTimeout(c), a.removeEventListener("paste", u, !0);
  }, u = (S) => {
    S.stopImmediatePropagation(), S.preventDefault(), d();
  }, f = (S) => {
    S.preventDefault();
    const T = v4(S);
    if (T.kind === "none") return;
    if (T.kind === "pan") {
      n.panBy(T.dx, T.dy);
      return;
    }
    const { x: M, y: H } = Zn(e, S);
    n.wheelZoom(M, H, T.deltaY);
  }, h = (S) => {
    if (i.add(S.pointerId), ac(t), _l(t), S.button === 2) {
      const { x: H, y: q } = Zn(e, S), R = n.beginSecondaryPan(H, q, i.size);
      if (R === "declined") return;
      R === "started" && S.preventDefault(), e.setPointerCapture(S.pointerId);
      return;
    }
    t.down = !0, t.container.focus();
    const { x: T, y: M } = Zn(e, S);
    if (e.setPointerCapture(S.pointerId), S.button === _4 && n.getTool() !== "eraser" && (t.toolBeforePenEraser = n.getTool(), n.setTool("eraser")), S.button === 1 || t.spaceHeld) {
      S.button === 1 && (l = { x: S.clientX, y: S.clientY }), o = !1, S.preventDefault(), n.beginPan(T, M);
      return;
    }
    if (r.onPointerDown?.({ x: T, y: M }, S)) {
      o = !0;
      return;
    }
    o = !1, n.setCtrlHeld(S.ctrlKey || S.metaKey), n.beginPointer(T, M, S.shiftKey, S.altKey);
  }, p = () => t.down || n.wantsPointerMoves(), m = (S) => {
    if (d9(), t.lastPointer = Zn(e, S), l && (Math.abs(S.clientX - l.x) > 1 || Math.abs(S.clientY - l.y) > 1) && (l = null, d(), a.addEventListener("paste", u, !0)), !p()) {
      b4(t, S);
      return;
    }
    const { x: T, y: M } = Zn(e, S);
    t.down && r.onPointerMove?.({ x: T, y: M }, S), !o && (t.pendingMove = S, !t.moveRaf && (t.moveRaf = requestAnimationFrame(() => {
      t.moveRaf = 0;
      const H = t.pendingMove;
      t.pendingMove = null, H && p() && xm(t, H);
    })));
  }, w = (S) => {
    if (i.delete(S.pointerId), S.button === 2) {
      e.hasPointerCapture(S.pointerId) && e.releasePointerCapture(S.pointerId), eh(t), n.endSecondaryPan() === "menu" && C(S);
      return;
    }
    S.button === 1 && (l = null, c = a.setTimeout(d, y4));
    const { x: T, y: M } = Zn(e, S);
    if (r.onPointerUp?.({ x: T, y: M }, S), o) {
      o = !1, t.down = !1, e.hasPointerCapture(S.pointerId) && e.releasePointerCapture(S.pointerId);
      return;
    }
    eh(t), t.down = !1, n.endPointer(), e.hasPointerCapture(S.pointerId) && e.releasePointerCapture(S.pointerId), t.toolBeforePenEraser !== null && (n.setTool(t.toolBeforePenEraser), t.toolBeforePenEraser = null);
  }, y = () => {
    _l(t), t.down || n.endHover();
  }, k = (S) => {
    i.delete(S.pointerId);
  }, O = (S) => {
    const { x: T, y: M } = Zn(e, S);
    n.handleDoubleClick(T, M), S.preventDefault();
  }, C = (S) => {
    const { x: T, y: M } = Zn(e, S), H = n.hitTest(T, M, 4), q = n.hitsSelectionBox(T, M);
    H && !n.getSelection().includes(H.id) && n.selectElement(H.id), r.onContextMenu?.({ x: T, y: M }, H || q ? "element" : "canvas");
  }, P = (S) => {
    S.preventDefault(), S.stopPropagation(), !n.consumesContextMenu() && C(S);
  };
  return e.addEventListener("wheel", f, { passive: !1 }), e.addEventListener("pointerdown", h), e.addEventListener("pointermove", m), e.addEventListener("pointerup", w), e.addEventListener("pointerleave", y), e.addEventListener("pointercancel", k), e.addEventListener("dblclick", O), e.addEventListener("contextmenu", P), () => {
    ac(t), _l(t), d(), i.clear(), e.removeEventListener("wheel", f), e.removeEventListener("pointerdown", h), e.removeEventListener("pointermove", m), e.removeEventListener("pointerup", w), e.removeEventListener("pointerleave", y), e.removeEventListener("pointercancel", k), e.removeEventListener("dblclick", O), e.removeEventListener("contextmenu", P);
  };
}
function k4(t) {
  const { canvas: e, container: n, callbacks: r } = t, o = new x9({
    canvas: e,
    onCameraChange: (h) => r.onCameraChange?.(h),
    onToolChange: (h) => r.onToolChange?.(h),
    onSelectionChange: (h) => r.onSelectionChange?.(h),
    onRequestTextEdit: (h) => r.onRequestTextEdit?.(h),
    onRequestFrameRename: (h) => r.onRequestFrameRename?.(h),
    onSceneChange: (h) => r.onSceneChange?.(h),
    onNotice: (h) => r.onNotice?.(h)
  }), i = {
    engine: o,
    canvas: e,
    container: n,
    callbacks: r,
    down: !1,
    spaceHeld: !1,
    moveRaf: 0,
    pendingMove: null,
    hoverRaf: 0,
    pendingHover: null,
    toolBeforePenEraser: null,
    lastPointer: null
  }, a = () => {
    const h = n.getBoundingClientRect();
    o.setViewport(h.width, h.height, window.devicePixelRatio || 1);
  };
  a();
  const l = new ResizeObserver(a);
  l.observe(n);
  const c = w4(i), d = f4(i), u = typeof window < "u" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null, f = () => o.setReducedMotion(u?.matches ?? !1);
  return f(), u?.addEventListener("change", f), t.scene && o.setScene(t.scene), t.theme && o.setTheme(t.theme), t.defaultStroke && o.setNextStyle({ strokeColor: t.defaultStroke }), globalThis.__osioDrawEngine = o, t.onReady?.(o), {
    engine: o,
    destroy: () => {
      c(), d(), u?.removeEventListener("change", f), l.disconnect(), o.destroy();
      const h = globalThis;
      h.__osioDrawEngine === o && delete h.__osioDrawEngine;
    }
  };
}
async function S4(t) {
  return await pm(), k4(t);
}
var x4 = /* @__PURE__ */ F('<div role="application" style="position: relative; width: 100%; height: 100%; touch-action: none; outline: none;"><canvas aria-hidden="true" style="display: block; width: 100%; height: 100%;"></canvas></div>');
function Em(t, e) {
  ot(e, !0);
  let n = ke(e, "theme", 3, Js), r = ke(e, "className", 3, ""), o = ke(e, "ariaLabel", 3, "Drawing canvas"), i, a, l = null, c = /* @__PURE__ */ B(!1);
  const d = {};
  bt(() => {
    d.onCameraChange = e.onCameraChange, d.onToolChange = e.onToolChange, d.onSelectionChange = e.onSelectionChange, d.onRequestTextEdit = e.onRequestTextEdit, d.onRequestFrameRename = e.onRequestFrameRename, d.onSceneChange = e.onSceneChange, d.onNotice = e.onNotice, d.onContextMenu = e.onContextMenu, d.onToolLockChange = e.onToolLockChange, d.onFlowchartCreatingChange = e.onFlowchartCreatingChange, d.onPointerDown = e.onPointerDown, d.onPointerMove = e.onPointerMove, d.onPointerUp = e.onPointerUp;
  }), Gt(() => {
    if (!a || !i) return;
    let h, p = !1;
    return S4({
      canvas: a,
      container: i,
      callbacks: d,
      onReady: e.onReady
    }).then((m) => {
      if (p) {
        m.destroy();
        return;
      }
      l = m.engine, h = m.destroy, _(c, !0);
    }), () => {
      p = !0, _(c, !1), l = null, h?.();
    };
  }), bt(() => {
    s(c) && e.scene && l?.setScene(e.scene);
  }), bt(() => {
    s(c) && l?.setTheme(n());
  }), bt(() => {
    s(c) && e.defaultStroke && l?.setNextStyle({ strokeColor: e.defaultStroke });
  });
  var u = x4();
  N(u, "tabindex", 0);
  var f = z(u);
  Je(f, (h) => a = h, () => a), Je(u, (h) => i = h, () => i), Y(() => {
    Ce(u, 1, rm(r())), N(u, "aria-label", o());
  }), A(t, u), it();
}
const E4 = /* @__PURE__ */ new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "eraser",
  "lasso",
  "laser",
  "frame",
  "autoshape",
  "bucketfill",
  "stickynote"
]);
function T4(t) {
  return t === "text" ? "text" : E4.has(t) ? "crosshair" : "default";
}
function C4(t, e) {
  const n = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const { dock: r, rect: o } of e) {
    const i = o.top - t.top, a = o.right - t.left, l = o.bottom - t.top, c = o.left - t.left;
    r === "top" ? n.top = Math.max(n.top, l) : r === "bottom" ? n.bottom = Math.max(n.bottom, t.height - i) : r === "side" && (c + o.width / 2 < t.width / 2 ? n.left = Math.max(n.left, a) : n.right = Math.max(n.right, t.width - c));
  }
  return n;
}
function A4(t, e) {
  const n = Array.from(t.querySelectorAll("[data-viewport-ui]"), (r) => ({
    dock: r.dataset.viewportUi,
    rect: r.getBoundingClientRect()
  }));
  return C4(e.getBoundingClientRect(), n);
}
function th(t) {
  return Math.round(t * 100);
}
function yl(t) {
  if (t.length === 0) return null;
  let e = 1 / 0, n = 1 / 0, r = -1 / 0, o = -1 / 0;
  for (const i of t) {
    const a = qc(i);
    e = Math.min(e, a.minX), n = Math.min(n, a.minY), r = Math.max(r, a.maxX), o = Math.max(o, a.maxY);
  }
  return { x: e, y: n, width: r - e, height: o - n };
}
function pa(t, e, n) {
  return Math.min(n, Math.max(e, t));
}
function bl(t, e, n = 0) {
  const r = Math.max(t.maxX - t.minX, 1), o = Math.max(t.maxY - t.minY, 1), i = pa(
    Math.min((e.width - n * 2) / r, (e.height - n * 2) / o),
    c9(),
    u9()
  ), a = (t.minX + t.maxX) / 2, l = (t.minY + t.maxY) / 2;
  return {
    scale: i,
    x: e.width / 2 - a * i,
    y: e.height / 2 - l * i
  };
}
function P4(t) {
  const e = pa(t, 0, 1);
  return e < 0.5 ? 4 * e * e * e : 1 - (-2 * e + 2) ** 3 / 2;
}
function wl(t, e, n) {
  return t + (e - t) * n;
}
function I4(t, e, n) {
  return {
    x: wl(t.x, e.x, n),
    y: wl(t.y, e.y, n),
    scale: wl(t.scale, e.scale, n)
  };
}
function gs(t, e) {
  const n = t.camera;
  (e.x !== n.x || e.y !== n.y) && t.panBy(e.x - n.x, e.y - n.y);
  const r = t.camera;
  e.scale !== r.scale && t.zoomAt(r.x, r.y, e.scale / r.scale);
}
function nh(t, e) {
  return t.x === e.x && t.y === e.y && t.scale === e.scale;
}
function kl(t, e, n, r = {}) {
  const o = r.durationMs ?? 400, i = r.now ?? (() => Date.now());
  if (r.reducedMotion || o <= 0)
    return n(e), r.onDone?.(), { cancel() {
    } };
  const a = r.raf ?? ((m) => requestAnimationFrame(m)), l = r.caf ?? ((m) => cancelAnimationFrame(m)), c = i(), d = r.source, u = r.path ?? ((m) => I4(t, e, m));
  let f = 0, h = null;
  const p = () => {
    if (d && h) {
      const w = d.camera;
      if (!nh(w, h) || !nh(d.cameraTarget, w)) {
        r.onDone?.();
        return;
      }
    }
    const m = pa((i() - c) / o, 0, 1);
    n(u(P4(m))), h = d?.camera ?? null, m < 1 ? f = a(p) : r.onDone?.();
  };
  return p(), { cancel: () => l(f) };
}
const vo = Math.SQRT2, z4 = 700, M4 = 400, O4 = 1800;
function F4(t, e, n) {
  const r = Math.max(n.width, n.height, 1), o = (p) => ({
    x: (n.width / 2 - p.x) / p.scale,
    y: (n.height / 2 - p.y) / p.scale,
    w: r / p.scale
  }), i = (p, m, w) => {
    const y = r / w;
    return { scale: y, x: n.width / 2 - p * y, y: n.height / 2 - m * y };
  }, a = o(t), l = o(e), c = l.x - a.x, d = l.y - a.y, u = Math.hypot(c, d);
  let f, h;
  if (u < 1e-9 * Math.min(a.w, l.w)) {
    const p = Math.log(l.w / a.w);
    f = Math.abs(p) / vo, h = (m) => i(a.x + m * c, a.y + m * d, a.w * Math.exp(p * m));
  } else {
    const p = vo * vo, m = (l.w * l.w - a.w * a.w + p * p * u * u) / (2 * a.w * p * u), w = (l.w * l.w - a.w * a.w - p * p * u * u) / (2 * l.w * p * u), y = -Math.asinh(m);
    f = (-Math.asinh(w) - y) / vo, h = (O) => {
      const C = O * f, P = a.w / (p * u) * (Math.cosh(y) * Math.tanh(vo * C + y) - Math.sinh(y));
      return i(a.x + P * c, a.y + P * d, a.w * Math.cosh(y) / Math.cosh(vo * C + y));
    };
  }
  return {
    at: (p) => p <= 0 ? t : p >= 1 ? e : h(p),
    durationMs: pa(f * z4, M4, O4)
  };
}
function R4(t, e, n, r = {}) {
  const o = r.marginRatio ?? 0.8, i = r.maxScale ?? 2, a = e.width * o / Math.max(t.width, 1), l = Math.max(n.scale, Math.min(a, i)), c = t.x + t.width / 2, d = t.y + t.height / 2;
  return {
    scale: l,
    x: e.width / 2 - c * l,
    y: e.height / 2 - d * l
  };
}
const Tm = "drawnosaurus:focus-mode";
function L4(t) {
  try {
    return t?.getItem(Tm) !== "false";
  } catch {
    return !0;
  }
}
function D4(t, e) {
  try {
    t?.setItem(Tm, String(e));
  } catch {
  }
}
const Sl = 24;
function xl(t) {
  const e = t.filter((n) => n.type === "frame" && !n.isDeleted).sort((n, r) => (n.pathStep ?? 1 / 0) - (r.pathStep ?? 1 / 0));
  return e.length > 0 ? e.map((n) => ({
    frameId: n.id,
    name: n.name?.trim() || "Frame",
    bounds: qc(n)
  })) : [{ frameId: null, name: "Board", bounds: zk(t) }];
}
function N4(t, e, n) {
  const r = [...t];
  if (e < 0 || e >= r.length) return r;
  const [o] = r.splice(e, 1);
  return r.splice(Math.min(Math.max(n, 0), r.length), 0, o), r;
}
function B4(t, e, n) {
  if (n <= 0) return 0;
  const r = Math.min(Math.max(e, 0), n - 1);
  switch (t) {
    case "next":
      return Math.min(r + 1, n - 1);
    case "prev":
      return Math.max(r - 1, 0);
    case "home":
      return 0;
    case "end":
      return n - 1;
  }
}
const U4 = /* @__PURE__ */ new Set([
  "ArrowRight",
  "ArrowDown",
  " ",
  "PageDown",
  "Enter"
]), j4 = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);
function H4(t) {
  return t === "Escape" ? "exit" : t === "Home" ? "home" : t === "End" ? "end" : t === "b" || t === "B" || t === "." ? "black" : t === "w" || t === "W" || t === "," ? "white" : U4.has(t) ? "next" : j4.has(t) ? "prev" : null;
}
function W4(t, e) {
  return /^[0-9]$/.test(t) ? { action: null, typed: (e + t).slice(-4) } : t === "Enter" && e !== "" ? { action: { goto: Number(e) - 1 }, typed: "" } : { action: H4(t), typed: "" };
}
function Z4(t, e) {
  return `${t + 1} / ${e}`;
}
function K4(t) {
  return `${t?.trim() || "Someone"} is presenting — Follow`;
}
var V4 = /* @__PURE__ */ F('<div role="group" aria-label="Presentation controls" tabindex="-1"><button type="button" aria-label="Previous slide" title="Previous — ←" class="svelte-r5ymwh">‹</button> <span class="counter svelte-r5ymwh" aria-live="polite"> </span> <button type="button" aria-label="Next slide" title="Next — →" class="svelte-r5ymwh">›</button> <span class="rule svelte-r5ymwh" aria-hidden="true"></span> <button type="button" class="exit svelte-r5ymwh" aria-label="Exit presentation" title="Exit — Esc">Exit</button></div>');
function J4(t, e) {
  ot(e, !0);
  const n = 2e3;
  let r, o = /* @__PURE__ */ B(!0), i = !1, a;
  function l() {
    clearTimeout(a), a = setTimeout(
      () => {
        i || _(o, !1);
      },
      n
    );
  }
  function c() {
    _(o, !0), l();
  }
  Gt(() => {
    r?.focus(), l();
  }), Wi(() => clearTimeout(a));
  var d = V4();
  Qe("pointermove", $t, c);
  let u;
  var f = z(d), h = b(f, 2), p = ae(h, !0), m = b(h, 2), w = b(m, 4);
  Je(d, (y) => r = y, () => r), Y(
    (y) => {
      u = Ce(d, 1, "present-bar svelte-r5ymwh", null, u, { faded: !s(o) }), le(p, y);
    },
    [() => Z4(e.index, e.count)]
  ), I("focusin", d, () => {
    i = !0, _(o, !0);
  }), I("focusout", d, () => {
    i = !1, l();
  }), I("click", f, function(...y) {
    e.onPrev?.apply(this, y);
  }), I("click", m, function(...y) {
    e.onNext?.apply(this, y);
  }), I("click", w, function(...y) {
    e.onExit?.apply(this, y);
  }), A(t, d), it();
}
ct(["focusin", "focusout", "click"]);
function Ur(t, e = document) {
  const n = t?.getRootNode();
  return n?.nodeType === 11 && n.host !== void 0 ? n : e;
}
function vr(t) {
  return t.composedPath()[0] ?? t.target;
}
function G4(t, e) {
  const { zoom: n } = t, r = t.containerId ? t.width + 0.5 : Math.min(t.width, (e.width - 8 - t.x) / n), o = t.height * 1.05, i = (e.height - t.y) / n, a = r * (n - 1) / 2, l = Math.min(o, i) * (n - 1) / 2, c = 180 * t.angle / Math.PI;
  return {
    left: t.x,
    top: t.y,
    width: r,
    height: o,
    maxHeight: i,
    transform: `translate(${a}px, ${l}px) scale(${n}) rotate(${c}deg)`
  };
}
function q4(t) {
  const e = t.ctrlKey || t.metaKey;
  if (e && !t.shiftKey) {
    if (t.key === "=" || t.key === "+") return "zoomIn";
    if (t.key === "-") return "zoomOut";
    if (t.key === "0") return "zoomReset";
    if (t.key.toLowerCase() === "s")
      return t.isComposing || t.keyCode === 229 ? "hold" : "save";
  }
  if (t.key === "Escape" || t.key === "Enter" && e)
    return t.isComposing || t.keyCode === 229 ? "hold" : "submit";
  const n = e && (t.code === "BracketLeft" || t.code === "BracketRight");
  return t.key === "Tab" || n ? t.isComposing ? "hold" : t.shiftKey || t.code === "BracketLeft" ? "outdent" : "indent" : null;
}
const no = 4, Y4 = " ".repeat(no), X4 = new RegExp(`^ {1,${no}}`);
function Cm({ value: t, selectionStart: e, selectionEnd: n }) {
  const r = t.slice(0, e).match(/[^\n]*$/)?.[0].length ?? 0;
  let o = e - r;
  const i = [o];
  for (const a of t.slice(o, n).split(`
`).slice(0, -1))
    o += a.length + 1, i.push(o);
  return i.reverse();
}
function Q4(t) {
  const e = Cm(t);
  let n = t.value;
  for (const r of e) n = `${n.slice(0, r)}${Y4}${n.slice(r)}`;
  return {
    value: n,
    selectionStart: t.selectionStart + no,
    selectionEnd: t.selectionEnd + no * e.length
  };
}
function $4(t) {
  const e = [];
  let n = t.value;
  for (const i of Cm(t)) {
    const a = n.slice(i, i + no).match(X4);
    a && (n = `${n.slice(0, i)}${n.slice(i + a[0].length)}`, e.push(i));
  }
  const r = e.at(-1);
  if (r === void 0) return { ...t, value: n };
  const o = t.selectionStart > r ? Math.max(t.selectionStart - no, r) : t.selectionStart;
  return {
    value: n,
    selectionStart: o,
    selectionEnd: Math.max(o, t.selectionEnd - no * e.length)
  };
}
function ex(t) {
  return t.replace(/\r?\n|\r/g, `
`).replace(/\t/g, "        ");
}
function tx(t) {
  let e;
  try {
    e = JSON.parse(t);
  } catch {
    return null;
  }
  if (typeof e != "object" || e === null) return null;
  const { type: n, elements: r } = e;
  return n !== "osidraw" || !Array.isArray(r) ? null : r.filter(
    (o) => typeof o == "object" && o !== null && o.type === "text" && typeof o.text == "string"
  ).map((o) => o.text).join(`

`);
}
const nx = /* @__PURE__ */ new Set(["text", "number", "password", "search"]);
function Am(t) {
  const e = t;
  return e ? e.isContentEditable === !0 || e.tagName === "TEXTAREA" ? !0 : e.tagName === "INPUT" && nx.has(e.type ?? "text") : !1;
}
const rx = '[aria-label="Style inspector"], .zoom-actions', ox = '[aria-label="Style inspector"] [role="dialog"]';
function ix(t, e) {
  return e === 1 ? !0 : t?.closest ? t.closest(ox) ? !0 : !!t.closest(rx) && !Am(t) : !1;
}
const sx = '.draw-chrome textarea[aria-label="Text editor"]', ax = '.draw-chrome [role="application"]';
function lx(t) {
  (t.querySelector(sx) ?? t.querySelector(ax))?.focus();
}
function yn(t) {
  const e = Ur(t), n = e.activeElement;
  return t?.focus(), () => {
    n && n !== document.body && n.isConnected ? n.focus() : lx(e);
  };
}
var cx = /* @__PURE__ */ F('<p class="empty svelte-1lhbz8k">No frames yet. Each frame you draw (F) becomes a stop on the path.</p>'), ux = /* @__PURE__ */ F('<li draggable="true"><button type="button" class="stop svelte-1lhbz8k"><span class="step svelte-1lhbz8k" aria-hidden="true"> </span> <span class="name svelte-1lhbz8k"> </span></button> <button type="button" class="nudge svelte-1lhbz8k">↑</button> <button type="button" class="nudge svelte-1lhbz8k">↓</button></li>'), dx = /* @__PURE__ */ F('<p class="hint svelte-1lhbz8k">Drag a stop, or Alt+↑/↓, to change the order.</p> <ol class="svelte-1lhbz8k"></ol> <button type="button" class="present svelte-1lhbz8k">Present</button>', 1), fx = /* @__PURE__ */ F('<div class="path-panel svelte-1lhbz8k" role="dialog" aria-modal="false" aria-label="Presentation path" tabindex="-1"><header class="svelte-1lhbz8k"><h2 class="svelte-1lhbz8k">Presentation path</h2> <button type="button" class="close svelte-1lhbz8k" aria-label="Close presentation path">×</button></header> <!></div>');
function hx(t, e) {
  ot(e, !0);
  let n = /* @__PURE__ */ B(void 0), r, o = /* @__PURE__ */ B(null), i = /* @__PURE__ */ B(null);
  const a = /* @__PURE__ */ X(() => e.stops.flatMap((k) => k.frameId ? [k.frameId] : []));
  Gt(() => yn(s(n)?.querySelector(".stop") ?? r));
  async function l(k, O) {
    const C = N4(s(a), k, O);
    if (C.every((S, T) => S === s(a)[T])) return;
    const P = s(a)[k];
    e.onReorder(C), await Br(), s(n)?.querySelectorAll(".stop")[C.indexOf(P)]?.focus();
  }
  function c(k, O) {
    !k.altKey || k.key !== "ArrowUp" && k.key !== "ArrowDown" || (k.preventDefault(), k.stopPropagation(), l(O, k.key === "ArrowUp" ? O - 1 : O + 1));
  }
  function d(k) {
    k.key === "Escape" && (k.stopPropagation(), e.onClose());
  }
  function u(k) {
    s(o) !== null && l(s(o), k), _(o, null), _(i, null);
  }
  var f = fx(), h = z(f), p = b(z(h), 2), m = b(h, 2);
  {
    var w = (k) => {
      var O = cx();
      A(k, O);
    }, y = (k) => {
      var O = dx(), C = b(Ue(O), 2);
      Ze(C, 23, () => e.stops, (S) => S.frameId, (S, T, M) => {
        var H = ux();
        let q;
        var R = z(H), K = z(R), ie = ae(K, !0), ne = b(K, 2), $ = ae(ne, !0), G = b(R, 2), W = b(G, 2);
        Y(() => {
          q = Ce(H, 1, "svelte-1lhbz8k", null, q, {
            dragging: s(o) === s(M),
            over: s(i) === s(M) && s(o) !== s(M)
          }), N(R, "aria-label", `Stop ${s(M) + 1}: ${s(T).name}`), le(ie, s(M) + 1), le($, s(T).name), N(G, "aria-label", `Move ${s(T).name} earlier`), G.disabled = s(M) === 0, N(W, "aria-label", `Move ${s(T).name} later`), W.disabled = s(M) === s(a).length - 1;
        }), Qe("dragstart", H, (J) => {
          _(o, s(M), !0), J.dataTransfer?.setData("text/plain", s(T).frameId ?? "");
        }), Qe("dragover", H, (J) => {
          J.preventDefault(), _(i, s(M), !0);
        }), Qe("dragleave", H, () => {
          s(i) === s(M) && _(i, null);
        }), Qe("drop", H, (J) => {
          J.preventDefault(), u(s(M));
        }), Qe("dragend", H, () => {
          _(o, null), _(i, null);
        }), I("click", R, () => s(T).frameId && e.onVisit(s(T).frameId)), I("keydown", R, (J) => c(J, s(M))), I("click", G, () => l(s(M), s(M) - 1)), I("click", W, () => l(s(M), s(M) + 1)), A(S, H);
      }), Je(C, (S) => _(n, S), () => s(n));
      var P = b(C, 2);
      I("click", P, function(...S) {
        e.onPresent?.apply(this, S);
      }), A(k, O);
    };
    j(m, (k) => {
      s(a).length === 0 ? k(w) : k(y, -1);
    });
  }
  Je(f, (k) => r = k, () => r), I("keydown", f, d), I("click", p, function(...k) {
    e.onClose?.apply(this, k);
  }), A(t, f), it();
}
ct(["keydown", "click"]);
var gx = /* @__PURE__ */ F('<button type="button" class="svelte-12fid70">Follow</button>'), px = /* @__PURE__ */ F('<div class="follow-notice svelte-12fid70" role="status"><span> </span> <!></div>');
function mx(t, e) {
  ot(e, !0);
  var n = px(), r = z(n), o = ae(r, !0), i = b(r, 2);
  {
    var a = (l) => {
      var c = gx();
      I("click", c, function(...d) {
        e.onToggle?.apply(this, d);
      }), A(l, c);
    };
    j(i, (l) => {
      e.following || l(a);
    });
  }
  Y((l) => le(o, l), [
    () => e.following ? "Following — press Esc to stop" : K4(e.name)
  ]), A(t, n), it();
}
ct(["click"]);
const vx = {
  lock: [
    { tag: "rect", x: "3", y: "11", width: "18", height: "11", rx: "2" },
    { tag: "path", d: "M7 11V7a5 5 0 0 1 10 0v4" }
  ],
  lockOpen: [
    { tag: "rect", x: "3", y: "11", width: "18", height: "11", rx: "2" },
    { tag: "path", d: "M7 11V7a5 5 0 0 1 9.9-1" }
  ],
  select: [{ tag: "path", d: "m4 4 7.07 17 2.51-7.39L21 11.07z" }],
  // Excalidraw's lasso: a dashed loop with a cursor at its tail.
  lasso: [
    {
      tag: "path",
      d: "M4.028 13.252c-.475-.65-.744-1.36-.744-2.11C3.284 7.75 7.19 5 12.009 5s8.725 2.75 8.725 6.143c0 3.392-3.906 6.142-8.725 6.142-.696 0-1.373-.057-2.022-.165"
    },
    { tag: "path", d: "M5.5 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" },
    { tag: "path", d: "M6.5 17c.5 1 1 2 1 3.5" }
  ],
  hand: [
    { tag: "path", d: "M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" },
    { tag: "path", d: "M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" },
    { tag: "path", d: "M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" },
    {
      tag: "path",
      d: "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
    }
  ],
  rectangle: [{ tag: "rect", x: "3", y: "3", width: "18", height: "18", rx: "2" }],
  diamond: [
    {
      tag: "path",
      d: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z"
    }
  ],
  ellipse: [{ tag: "circle", cx: "12", cy: "12", r: "10" }],
  arrow: [
    { tag: "path", d: "M5 12h14" },
    { tag: "path", d: "m12 5 7 7-7 7" }
  ],
  line: [{ tag: "path", d: "M5 12h14" }],
  freedraw: [
    {
      tag: "path",
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    },
    { tag: "path", d: "m15 5 4 4" }
  ],
  text: [
    { tag: "path", d: "M4 7V4h16v3" },
    { tag: "path", d: "M9 20h6" },
    { tag: "path", d: "M12 4v16" }
  ],
  sticky: [
    { tag: "path", d: "M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" },
    { tag: "path", d: "M15 3v6h6" }
  ],
  eraser: [
    {
      tag: "path",
      d: "m7 21-4.3-4.3c-1-1-1-2.5 0-3.5l9.6-9.6c1-1 2.5-1 3.5 0l5.6 5.6c1 1 1 2.5 0 3.5L13 21"
    },
    { tag: "path", d: "M22 21H7" },
    { tag: "path", d: "m5 11 9 9" }
  ],
  // Excalidraw's `laserPointerToolIcon`, scaled from their 20-unit grid to our 24 (x1.2)
  // and left unrotated — theirs carries a `rotate(90)` on a wrapping <g>, which our icon
  // nodes have no way to express. A pointer body with the beam breaking up at its tip.
  laser: [
    {
      tag: "path",
      d: "m11.57 16.43 9.33-9.33a2.83 2.83 0 0 0-4-4l-9.33 9.33L9.6 14.4l1.97 2.03Z"
    },
    { tag: "path", d: "m15.9 4.1 4 4" },
    { tag: "path", d: "M12 12l2.4-2.4" },
    { tag: "path", d: "M6 18l3.6-3.6" },
    { tag: "path", d: "M2.59 21.47l1.2-1.2" },
    { tag: "path", d: "M6.54 22.84l-.17-1.69" },
    { tag: "path", d: "M2.85 14.26l1.04 1.34" },
    { tag: "path", d: "M10.03 20.73l-1.44-.91" },
    { tag: "path", d: "M1.14 17.58l1.69.16" }
  ],
  // Excalidraw's `frameToolIcon`: two horizontal rules crossing two vertical ones, the
  // crop marks a frame is. Deliberately not a plain rectangle — that is the shape tool.
  frame: [
    { tag: "path", d: "M4 7h16" },
    { tag: "path", d: "M4 17h16" },
    { tag: "path", d: "M7 4v16" },
    { tag: "path", d: "M17 4v16" }
  ],
  // A framed picture: a mountain and a sun inside a box, which is the near-universal
  // shape for "an image goes here".
  image: [
    { tag: "rect", x: "3", y: "3", width: "18", height: "18", rx: "2" },
    { tag: "circle", cx: "8.5", cy: "8.5", r: "1.5" },
    { tag: "path", d: "m21 15-4.5-4.5L9 18" }
  ],
  // A globe: a circle with a meridian and two parallels, which reads as "the web"
  // rather than as any particular site.
  embed: [
    { tag: "circle", cx: "12", cy: "12", r: "9" },
    { tag: "path", d: "M3 12h18" },
    { tag: "path", d: "M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" }
  ],
  // A wobbly stroke becoming a clean square: the tool's whole promise in one picture.
  autoshape: [
    { tag: "path", d: "M3 17c2-3 1-6 3-7s3 2 5 1 2-4 4-4" },
    { tag: "rect", x: "13", y: "13", width: "8", height: "8", rx: "1" }
  ],
  // A tipped bucket with a drop coming off it: the tool pours paint into a region.
  bucketfill: [
    { tag: "path", d: "M6 3l10 10-7 7a2 2 0 0 1-3 0l-4-4a2 2 0 0 1 0-3z" },
    { tag: "path", d: "M20 15s2 2.5 2 4a2 2 0 1 1-4 0c0-1.5 2-4 2-4z" }
  ],
  // Three dots: the standard "there is more behind this".
  more: [
    { tag: "circle", cx: "5", cy: "12", r: "1.5" },
    { tag: "circle", cx: "12", cy: "12", r: "1.5" },
    { tag: "circle", cx: "19", cy: "12", r: "1.5" }
  ],
  undo: [
    { tag: "path", d: "M3 7v6h6" },
    { tag: "path", d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" }
  ],
  redo: [
    { tag: "path", d: "M21 7v6h-6" },
    { tag: "path", d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" }
  ],
  // Two sheets, one behind the other: the phone strip's duplicate.
  copy: [
    { tag: "rect", x: "9", y: "9", width: "12", height: "12", rx: "2" },
    { tag: "path", d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }
  ],
  // A bin with its lid: the phone strip's delete.
  trash: [
    { tag: "path", d: "M3 6h18" },
    { tag: "path", d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
    { tag: "path", d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" },
    { tag: "path", d: "M10 11v6M14 11v6" }
  ],
  // A half-filled circle: the phone strip's opacity.
  opacity: [
    { tag: "circle", cx: "12", cy: "12", r: "9" },
    { tag: "path", d: "M12 3a9 9 0 0 1 0 18z" }
  ],
  sendToBack: [
    { tag: "rect", x: "8", y: "8", width: "12", height: "12", rx: "2" },
    { tag: "path", d: "M4 16V6a2 2 0 0 1 2-2h10" }
  ],
  backward: [
    { tag: "path", d: "m7 13-5 5 5 5" },
    { tag: "path", d: "M22 18H2" },
    { tag: "path", d: "m7 3-5 5 5 5" },
    { tag: "path", d: "M22 8H2" }
  ],
  forward: [
    { tag: "path", d: "m17 11 5-5-5-5" },
    { tag: "path", d: "M2 6h20" },
    { tag: "path", d: "m17 21 5-5-5-5" },
    { tag: "path", d: "M2 16h20" }
  ],
  bringToFront: [
    { tag: "rect", x: "4", y: "4", width: "12", height: "12", rx: "2" },
    { tag: "path", d: "M16 8h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2" }
  ],
  // Two overlapping rectangles inside a dashed boundary: the selection becomes one
  // thing.
  group: [
    { tag: "rect", x: "3", y: "3", width: "7", height: "7", rx: "1" },
    { tag: "rect", x: "11", y: "11", width: "10", height: "10", rx: "1" },
    { tag: "path", d: "M3 13v6a2 2 0 0 0 2 2h4" }
  ],
  // The same pair with the boundary broken: they go back to being separate.
  ungroup: [
    { tag: "rect", x: "3", y: "3", width: "7", height: "7", rx: "1" },
    { tag: "rect", x: "14", y: "14", width: "7", height: "7", rx: "1" },
    { tag: "path", d: "M12 3h2M12 21h-2M3 12v2M21 12v-2" }
  ],
  // An axis with a shape mirrored across it.
  flipHorizontal: [
    { tag: "line", x1: "12", y1: "3", x2: "12", y2: "21" },
    { tag: "path", d: "M8 7 3 12l5 5z" },
    { tag: "path", d: "M16 7l5 5-5 5z" }
  ],
  flipVertical: [
    { tag: "line", x1: "3", y1: "12", x2: "21", y2: "12" },
    { tag: "path", d: "M7 8 12 3l5 5z" },
    { tag: "path", d: "M7 16l5 5 5-5z" }
  ],
  alignLeft: [
    { tag: "line", x1: "4", y1: "4", x2: "4", y2: "20" },
    { tag: "rect", x: "8", y: "6", width: "12", height: "4", rx: "1" },
    { tag: "rect", x: "8", y: "14", width: "8", height: "4", rx: "1" }
  ],
  alignCenterX: [
    { tag: "line", x1: "12", y1: "4", x2: "12", y2: "20" },
    { tag: "rect", x: "4", y: "6", width: "16", height: "4", rx: "1" },
    { tag: "rect", x: "6", y: "14", width: "12", height: "4", rx: "1" }
  ],
  alignRight: [
    { tag: "line", x1: "20", y1: "4", x2: "20", y2: "20" },
    { tag: "rect", x: "4", y: "6", width: "12", height: "4", rx: "1" },
    { tag: "rect", x: "8", y: "14", width: "8", height: "4", rx: "1" }
  ],
  alignTop: [
    { tag: "line", x1: "4", y1: "4", x2: "20", y2: "4" },
    { tag: "rect", x: "6", y: "8", width: "4", height: "12", rx: "1" },
    { tag: "rect", x: "14", y: "8", width: "4", height: "8", rx: "1" }
  ],
  alignCenterY: [
    { tag: "line", x1: "4", y1: "12", x2: "20", y2: "12" },
    { tag: "rect", x: "6", y: "4", width: "4", height: "16", rx: "1" },
    { tag: "rect", x: "14", y: "6", width: "4", height: "12", rx: "1" }
  ],
  alignBottom: [
    { tag: "line", x1: "4", y1: "20", x2: "20", y2: "20" },
    { tag: "rect", x: "6", y: "4", width: "4", height: "12", rx: "1" },
    { tag: "rect", x: "14", y: "8", width: "4", height: "8", rx: "1" }
  ],
  // Four ragged lines, the way every word processor draws these. The short lines are the
  // ones that carry the meaning, so they sit on the edge the alignment names.
  textAlignLeft: [
    { tag: "line", x1: "4", y1: "6", x2: "20", y2: "6" },
    { tag: "line", x1: "4", y1: "11", x2: "13", y2: "11" },
    { tag: "line", x1: "4", y1: "16", x2: "20", y2: "16" },
    { tag: "line", x1: "4", y1: "21", x2: "13", y2: "21" }
  ],
  textAlignCenter: [
    { tag: "line", x1: "4", y1: "6", x2: "20", y2: "6" },
    { tag: "line", x1: "8", y1: "11", x2: "16", y2: "11" },
    { tag: "line", x1: "4", y1: "16", x2: "20", y2: "16" },
    { tag: "line", x1: "8", y1: "21", x2: "16", y2: "21" }
  ],
  textAlignRight: [
    { tag: "line", x1: "4", y1: "6", x2: "20", y2: "6" },
    { tag: "line", x1: "11", y1: "11", x2: "20", y2: "11" },
    { tag: "line", x1: "4", y1: "16", x2: "20", y2: "16" },
    { tag: "line", x1: "11", y1: "21", x2: "20", y2: "21" }
  ],
  // A box with the lines gathered against one edge of it: the box is the shape holding
  // the label, which is what vertical alignment is about.
  textAlignTop: [
    { tag: "rect", x: "3", y: "3", width: "18", height: "18", rx: "2" },
    { tag: "line", x1: "7", y1: "7", x2: "17", y2: "7" },
    { tag: "line", x1: "7", y1: "11", x2: "13", y2: "11" }
  ],
  textAlignMiddle: [
    { tag: "rect", x: "3", y: "3", width: "18", height: "18", rx: "2" },
    { tag: "line", x1: "7", y1: "10", x2: "17", y2: "10" },
    { tag: "line", x1: "7", y1: "14", x2: "13", y2: "14" }
  ],
  textAlignBottom: [
    { tag: "rect", x: "3", y: "3", width: "18", height: "18", rx: "2" },
    { tag: "line", x1: "7", y1: "13", x2: "17", y2: "13" },
    { tag: "line", x1: "7", y1: "17", x2: "13", y2: "17" }
  ],
  distributeX: [
    { tag: "rect", x: "3", y: "8", width: "4", height: "8", rx: "1" },
    { tag: "rect", x: "10", y: "6", width: "4", height: "12", rx: "1" },
    { tag: "rect", x: "17", y: "8", width: "4", height: "8", rx: "1" }
  ],
  distributeY: [
    { tag: "rect", x: "8", y: "3", width: "8", height: "4", rx: "1" },
    { tag: "rect", x: "6", y: "10", width: "12", height: "4", rx: "1" },
    { tag: "rect", x: "8", y: "17", width: "8", height: "4", rx: "1" }
  ],
  zoomIn: [
    { tag: "circle", cx: "11", cy: "11", r: "8" },
    { tag: "line", x1: "21", y1: "21", x2: "16.65", y2: "16.65" },
    { tag: "line", x1: "11", y1: "8", x2: "11", y2: "14" },
    { tag: "line", x1: "8", y1: "11", x2: "14", y2: "11" }
  ],
  zoomOut: [
    { tag: "circle", cx: "11", cy: "11", r: "8" },
    { tag: "line", x1: "21", y1: "21", x2: "16.65", y2: "16.65" },
    { tag: "line", x1: "8", y1: "11", x2: "14", y2: "11" }
  ],
  fit: [
    {
      tag: "path",
      d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
    }
  ],
  focus: [
    { tag: "circle", cx: "12", cy: "12", r: "3" },
    { tag: "path", d: "M3 7V5a2 2 0 0 1 2-2h2" },
    { tag: "path", d: "M17 3h2a2 2 0 0 1 2 2v2" },
    { tag: "path", d: "M21 17v2a2 2 0 0 1-2 2h-2" },
    { tag: "path", d: "M7 21H5a2 2 0 0 1-2-2v-2" }
  ],
  // A pipette, for picking a colour off the screen.
  eyeDropper: [
    { tag: "path", d: "m2 22 1-1h3l9-9" },
    { tag: "path", d: "M3 21v-3l9-9" },
    {
      tag: "path",
      d: "m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"
    }
  ],
  // The font picker's family icons and the arrow-type row's, the oracle's own paths
  // (`packages/excalidraw/components/icons.tsx@1118751f`): FontFamilyNormalIcon,
  // FontFamilyHeadingIcon, FontFamilyCodeIcon, sharpArrowIcon, roundArrowIcon — the
  // normal one scaled from its 20-unit box to this 24.
  fontNormal: [
    { tag: "path", d: "M7 20V8a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v12" },
    { tag: "path", d: "M7 13h10" }
  ],
  fontHeading: [
    { tag: "path", d: "M7 12h10" },
    { tag: "path", d: "M7 5v14" },
    { tag: "path", d: "M17 5v14" },
    { tag: "path", d: "M15 19h4" },
    { tag: "path", d: "M15 5h4" },
    { tag: "path", d: "M5 19h4" },
    { tag: "path", d: "M5 5h4" }
  ],
  fontCode: [
    { tag: "path", d: "M7 8l-4 4l4 4" },
    { tag: "path", d: "M17 8l4 4l-4 4" },
    { tag: "path", d: "M14 4l-4 16" }
  ],
  arrowSharp: [
    { tag: "path", d: "M6 18l12 -12" },
    { tag: "path", d: "M18 10v-4h-4" }
  ],
  arrowRound: [
    { tag: "path", d: "M16,12L20,9L16,6" },
    { tag: "path", d: "M6 20c0 -6.075 4.925 -11 11 -11h3" }
  ],
  // `elbowArrowIcon` (`icons.tsx@1118751f:2411-2418`).
  arrowElbow: [
    { tag: "path", d: "M4,19L10,19C11.097,19 12,18.097 12,17L12,9C12,7.903 12.903,7 14,7L21,7" },
    { tag: "path", d: "M18 4l3 3l-3 3" }
  ],
  // A closed line, filled: the shape the polygon toggle turns a selected line into.
  polygonClosed: [{ tag: "path", d: "M12 2 2 9.5 5.5 21h13L22 9.5Z" }],
  // Three sliders, the way every settings panel says "the properties": the oracle's
  // `adjustmentsIcon`, which its compact panel hangs the shape properties off
  // (`Actions.tsx@1118751f:280`).
  adjustments: [
    { tag: "line", x1: "4", y1: "7", x2: "20", y2: "7" },
    { tag: "circle", cx: "9", cy: "7", r: "2.5" },
    { tag: "line", x1: "4", y1: "12", x2: "20", y2: "12" },
    { tag: "circle", cx: "15", cy: "12", r: "2.5" },
    { tag: "line", x1: "4", y1: "17", x2: "20", y2: "17" },
    { tag: "circle", cx: "11", cy: "17", r: "2.5" }
  ],
  // A big letter and a small one: the oracle's `TextSizeIcon`, which its compact panel
  // hangs the text properties off (`Actions.tsx@1118751f:467`).
  textSize: [
    { tag: "path", d: "M4 18 9 6l5 12" },
    { tag: "line", x1: "5.8", y1: "14", x2: "12.2", y2: "14" },
    { tag: "path", d: "M15 18 17.5 11l2.5 7" },
    { tag: "line", x1: "16", y1: "15.5", x2: "19", y2: "15.5" }
  ],
  // The Shapes tool's own badge: a hexagon, the figure default (`FigureParams::default`).
  figure: [{ tag: "path", d: "M12 2 20 7 20 17 12 22 4 17 4 7Z" }],
  figurePolygon: [{ tag: "path", d: "M12 2 20 7 20 17 12 22 4 17 4 7Z" }],
  figureStar: [
    {
      tag: "path",
      d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
    }
  ],
  figureParallelogram: [{ tag: "path", d: "M7 4H21L17 20H3Z" }],
  figureTrapezoid: [{ tag: "path", d: "M8 4H16L22 20H2Z" }],
  // The oracle's own "database" glyph: a body with a rim, so a cylinder reads as one
  // even at toolbar size.
  figureCylinder: [
    { tag: "path", d: "M3 6c0 1.66 4.03 3 9 3s9-1.34 9-3-4.03-3-9-3-9 1.34-9 3Z" },
    { tag: "path", d: "M3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6" }
  ],
  // A rectangle with a wavy foot, echoing the kind's own wavy-bottom silhouette.
  figureDocument: [{ tag: "path", d: "M4 3H20V16L18 18L16 16L14 18L12 16L10 18L8 16L6 18L4 16Z" }]
};
var _x = /* @__PURE__ */ mr("<path></path>"), yx = /* @__PURE__ */ mr("<rect></rect>"), bx = /* @__PURE__ */ mr("<circle></circle>"), wx = /* @__PURE__ */ mr("<line></line>"), kx = /* @__PURE__ */ mr('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>');
function lt(t, e) {
  ot(e, !0);
  let n = ke(e, "size", 3, 18);
  const r = /* @__PURE__ */ X(() => vx[e.name]);
  var o = kx();
  Ze(o, 21, () => s(r), E3, (i, a) => {
    var l = on(), c = Ue(l);
    {
      var d = (p) => {
        var m = _x();
        Y(() => N(m, "d", s(a).d)), A(p, m);
      }, u = (p) => {
        var m = yx();
        Y(() => {
          N(m, "x", s(a).x), N(m, "y", s(a).y), N(m, "width", s(a).width), N(m, "height", s(a).height), N(m, "rx", s(a).rx);
        }), A(p, m);
      }, f = (p) => {
        var m = bx();
        Y(() => {
          N(m, "cx", s(a).cx), N(m, "cy", s(a).cy), N(m, "r", s(a).r);
        }), A(p, m);
      }, h = (p) => {
        var m = wx();
        Y(() => {
          N(m, "x1", s(a).x1), N(m, "y1", s(a).y1), N(m, "x2", s(a).x2), N(m, "y2", s(a).y2);
        }), A(p, m);
      };
      j(c, (p) => {
        s(a).tag === "path" ? p(d) : s(a).tag === "rect" ? p(u, 1) : s(a).tag === "circle" ? p(f, 2) : p(h, -1);
      });
    }
    A(i, l);
  }), Y(() => {
    N(o, "width", n()), N(o, "height", n());
  }), A(t, o), it();
}
function Sx(t, e) {
  return t.key === "Escape" ? e.open ? "close" : null : t.key !== "Tab" || t.ctrlKey || t.metaKey || t.altKey || !e.onBoard || !e.switchable ? null : e.open ? t.shiftKey ? "back" : "forward" : "open";
}
const xx = ["rectangle", "diamond", "ellipse"], lc = [
  "line",
  "sharpArrow",
  "curvedArrow",
  "elbowArrow"
];
function Ex(t) {
  return t ? t === "line" || lc.includes(t) ? lc : xx : [];
}
const Tx = {
  line: "Line",
  sharpArrow: "Sharp arrow",
  curvedArrow: "Curved arrow",
  elbowArrow: "Elbow arrow"
}, Cx = {
  line: "line",
  sharpArrow: "arrowSharp",
  curvedArrow: "arrowRound",
  elbowArrow: "arrowElbow"
};
function Ax(t) {
  return Im(t) ? Tx[t] : Ix(t);
}
function Px(t) {
  return Im(t) ? Cx[t] : t;
}
function Pm(t) {
  return lc.includes(t);
}
const Im = (t) => Pm(t), Ix = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function zx(t, e) {
  const { x: n, y: r } = So(e, t.x, t.y + t.height);
  return { x: n - 8, y: r + 18 * e.scale };
}
var Mx = /* @__PURE__ */ F('<button type="button" class="svelte-1p0b7fa"><!></button>'), Ox = /* @__PURE__ */ F('<div role="toolbar"></div>');
function rh(t, e) {
  ot(e, !0);
  let n = ke(e, "below", 3, !1), r = ke(e, "keyHints", 3, !1);
  const o = ["1", "2", "3", "4"], i = /* @__PURE__ */ X(() => (e.types ?? ["rectangle", "diamond", "ellipse"]).map((d, u) => ({
    shape: d,
    name: Ax(d),
    icon: Px(d),
    key: o[u]
  })));
  var a = Ox();
  let l, c;
  Ze(a, 21, () => s(i), ({ shape: d, name: u, icon: f, key: h }) => d, (d, u) => {
    let f = () => s(u).shape, h = () => s(u).name, p = () => s(u).icon, m = () => s(u).key;
    var w = Mx(), y = z(w);
    lt(y, {
      get name() {
        return p();
      },
      size: 16
    }), Y(() => {
      N(w, "aria-label", r() ? `${h()} (${m()})` : h()), N(w, "aria-pressed", e.current === void 0 ? void 0 : e.current === f());
    }), I("mousedown", w, (k) => k.preventDefault()), I("click", w, () => e.onChoose(f())), A(d, w);
  }), Y(() => {
    l = Ce(a, 1, "draw-panel strip svelte-1p0b7fa", null, l, { below: n() }), N(a, "aria-label", e.label), c = ht(a, "", c, { left: `${e.x ?? ""}px`, top: `${e.y ?? ""}px` });
  }), A(t, a), it();
}
ct(["mousedown", "click"]);
const zm = "drawnosaurus:theme", cc = "drawnosaurus:canvasBackground";
function Fx(t) {
  try {
    const e = t?.getItem(zm);
    return e === "dark" || e === "system" ? e : "light";
  } catch {
    return "light";
  }
}
function Rx(t, e) {
  try {
    t?.setItem(zm, e);
  } catch {
  }
}
function oh(t, e) {
  return t === "system" ? e ? "dark" : "light" : t;
}
function Lx(t) {
  try {
    return t?.getItem(cc) ?? null;
  } catch {
    return null;
  }
}
function Dx(t, e) {
  try {
    e === null ? t?.removeItem(cc) : t?.setItem(cc, e);
  } catch {
  }
}
const Mm = "drawnosaurus:grid", yo = { ...fm };
function Nx(t) {
  try {
    const e = t?.getItem(Mm);
    if (!e) return yo;
    const n = JSON.parse(e);
    if (typeof n != "object" || n === null) return yo;
    const r = n;
    return {
      enabled: r.enabled === !0,
      size: typeof r.size == "number" && r.size >= 1 ? r.size : yo.size,
      step: typeof r.step == "number" && r.step >= 1 ? Math.round(r.step) : yo.step,
      snap: r.snap !== !1
    };
  } catch {
    return yo;
  }
}
function Bx(t, e) {
  try {
    t?.setItem(Mm, JSON.stringify(e));
  } catch {
  }
}
const Om = "drawnosaurus:objects-snap";
function Ux(t) {
  try {
    return t?.getItem(Om) === "true";
  } catch {
    return !1;
  }
}
function jx(t, e) {
  try {
    t?.setItem(Om, String(e));
  } catch {
  }
}
function Hx(t) {
  const e = !t.objectsSnap;
  return { objectsSnap: e, grid: e ? { ...t.grid, enabled: !1 } : t.grid };
}
function Wx(t, e) {
  const n = { ...t.grid, ...e };
  return { objectsSnap: n.enabled && !t.grid.enabled ? !1 : t.objectsSnap, grid: n };
}
const Fm = "drawnosaurus:dynamic-size";
function Zx(t) {
  try {
    return t?.getItem(Fm) !== "false";
  } catch {
    return !0;
  }
}
function Kx(t, e) {
  try {
    t?.setItem(Fm, String(e));
  } catch {
  }
}
function Vx(t, e = Js, n = null) {
  const r = (o, i) => t.getPropertyValue(o).trim() || i;
  return {
    theme: {
      background: n ?? r("--surface", e.background),
      grid: r("--line", e.grid),
      accent: r("--accent", e.accent),
      // Not host tokens: the binding highlight and its midpoint dot are Excalidraw's own
      // constants, and matching them is the point. They come from the fallback theme
      // rather than from the page's palette.
      bindingHighlight: e.bindingHighlight,
      bindingMidpoint: e.bindingMidpoint
    },
    ink: r("--ink", "#1e1e1e")
  };
}
const Jx = { autoResize: !1, unbind: !1, bind: !1, wrap: !1 };
function Gx(t) {
  return {
    // One element and a free text among it: that text is the element.
    autoResize: t.count === 1 && t.hasFreeText && t.autoResize === !1,
    unbind: t.canUnbindText,
    bind: t.canBindText,
    wrap: t.hasFreeText
  };
}
const mu = [
  "none",
  "arrow",
  "triangle",
  "triangle_outline",
  "circle",
  "circle_outline",
  "diamond",
  "diamond_outline",
  "bar",
  "cardinality_one",
  "cardinality_many",
  "cardinality_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many"
], vu = {
  none: "—",
  arrow: "▸",
  triangle: "▶",
  triangle_outline: "▷",
  circle: "●",
  circle_outline: "○",
  diamond: "◆",
  diamond_outline: "◇",
  bar: "|",
  // Crow's-foot notation: a single tick for "one", a fork for "many", combined or doubled
  // for the compound markers.
  cardinality_one: "⊣",
  cardinality_many: "⋔",
  cardinality_one_or_many: "⊣⋔",
  cardinality_exactly_one: "‖",
  cardinality_zero_or_one: "○⊣",
  cardinality_zero_or_many: "○⋔"
}, Uo = {
  none: "None",
  arrow: "Arrow",
  triangle: "Triangle",
  triangle_outline: "Triangle (outline)",
  circle: "Circle",
  circle_outline: "Circle (outline)",
  diamond: "Diamond",
  diamond_outline: "Diamond (outline)",
  bar: "Bar",
  cardinality_one: "Cardinality (one)",
  cardinality_many: "Cardinality (many)",
  cardinality_one_or_many: "Cardinality (one or many)",
  cardinality_exactly_one: "Cardinality (exactly one)",
  cardinality_zero_or_one: "Cardinality (zero or one)",
  cardinality_zero_or_many: "Cardinality (zero or many)"
};
function qx(t, e, n, r, o = 4) {
  return {
    left: Math.max(o, Math.min(t, r.width - n.width - o)),
    top: Math.max(o, Math.min(e, r.height - n.height - o))
  };
}
const Yx = "Vectorize image…";
function Rm(t) {
  return t?.vectorizeId ? { label: Yx, elementId: t.vectorizeId } : null;
}
function ih(t, e, n, r) {
  if (t.length === 0) return null;
  const o = t.find((a) => l9(a) && !a.locked), i = t.length === 1 && !e ? t[0] : void 0;
  return {
    linear: o ? {
      start: o.startArrowhead ?? "none",
      end: o.endArrowhead ?? (o.type === "arrow" ? "arrow" : "none")
    } : null,
    locked: e,
    multi: t.length > 1,
    grouped: n,
    embedId: i?.type === "embed" ? i.id : null,
    vectorizeId: i?.type === "image" ? i.id : null,
    text: r ? Gx(r) : Jx
  };
}
function vi(t) {
  return t.shift ? `⇧${t.hotkey}` : t.hotkey;
}
const Lm = [
  { tool: "select", label: "Select", hotkey: "1", icon: "select" },
  { tool: "hand", label: "Pan", hotkey: "H", icon: "hand" },
  { tool: "rectangle", label: "Rectangle", hotkey: "2", icon: "rectangle" },
  { tool: "diamond", label: "Diamond", hotkey: "3", icon: "diamond" },
  { tool: "ellipse", label: "Ellipse", hotkey: "4", icon: "ellipse" },
  { tool: "arrow", label: "Arrow", hotkey: "5", icon: "arrow" },
  { tool: "line", label: "Line", hotkey: "6", icon: "line" },
  { tool: "freedraw", label: "Draw", hotkey: "7", icon: "freedraw" },
  { tool: "text", label: "Text", hotkey: "8", icon: "text" },
  { tool: "eraser", label: "Eraser", hotkey: "0", icon: "eraser" }
], ma = [
  { tool: "image", label: "Insert image", hotkey: "9", icon: "image" },
  { tool: "frame", label: "Frame", hotkey: "F", icon: "frame" },
  { tool: "embed", label: "Embed web page", hotkey: "W", icon: "embed" },
  // Shift+X, Excalidraw's own: autoshape is the shifted freedraw key. It used to print
  // `G`, an invention from when the engine's keymap could not express a modifier.
  { tool: "autoshape", label: "Draw to shape", hotkey: "X", shift: !0, icon: "autoshape" },
  { tool: "bucketfill", label: "Bucket fill", hotkey: "B", icon: "bucketfill" },
  { tool: "laser", label: "Laser pointer", hotkey: "K", icon: "laser" },
  { tool: "lasso", label: "Lasso", hotkey: "S", icon: "lasso" },
  // A letter and no digit, as Excalidraw has it (`Tools.tsx@1118751f:121-124`).
  { tool: "stickynote", label: "Sticky note", hotkey: "N", icon: "sticky" },
  // Not the oracle's: a polygon/star/parallelogram/trapezoid/cylinder/document, picked
  // in the inspector's "Figure kind" row (`inspector.ts`'s `FIGURE_KIND_OPTIONS`).
  { tool: "figure", label: "Shapes", hotkey: "U", icon: "figure" }
], qs = [...Lm, ...ma];
function Xx(t) {
  return ma.some((e) => e.tool === t);
}
function Ar(t) {
  return qs.find((e) => e.tool === t);
}
const _u = typeof navigator < "u" && /Mac|iPod|iPhone|iPad/.test(navigator.platform), Qx = { CtrlOrCmd: "⌘", Alt: "⌥", Shift: "⇧" };
function nn(t, e = _u) {
  const n = t.split("+");
  return e ? n.map((r) => Qx[r] ?? r).join("") : n.map((r) => r === "CtrlOrCmd" ? "Ctrl" : r).join("+");
}
function In(t, e = _u) {
  const n = t === "front" || t === "forward" ? "]" : "[";
  return nn(t === "forward" || t === "backward" ? `CtrlOrCmd+${n}` : `CtrlOrCmd+${e ? "Alt" : "Shift"}+${n}`, e);
}
function sh(t) {
  const e = t;
  return !!e && (e.isContentEditable === !0 || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName ?? ""));
}
const Dm = '[role="dialog"]', $x = `${Dm}, [role="menu"]`;
function Nm(t, e) {
  return t?.closest?.(e) != null;
}
function e6(t) {
  return Nm(t, $x);
}
function t6(t) {
  return Nm(t, Dm);
}
function n6(t) {
  return !(t.ctrlKey || t.metaKey) || !t.shiftKey ? null : t.key === ">" || t.key === "." ? "fontSizeUp" : t.key === "<" || t.key === "," ? "fontSizeDown" : null;
}
function r6(t, e) {
  const n = e.target ?? "board";
  if (n === "field" || n === "overlay") return null;
  const r = n6(t);
  if (n === "textEditor" || r) return r;
  const o = t.ctrlKey || t.metaKey;
  return o && t.altKey && t.code === "KeyC" ? "copyStyles" : o && t.altKey && t.code === "KeyV" ? "pasteStyles" : o || t.altKey || e.tool === "select" && e.selected === 0 ? null : t.shiftKey ? t.key.toLowerCase() === "f" && e.fontRow ? "fontPicker" : null : t.key === "s" && e.selected > 0 && e.strokeRow ? "strokePicker" : t.key === "g" && e.backgroundRow ? "backgroundPicker" : null;
}
function o6(t, e, n = "board") {
  if (n === "field" || n === "textEditor") return null;
  const r = t.ctrlKey || t.metaKey;
  return !r && t.altKey && t.code === "KeyZ" && !e ? "zen" : !r && t.altKey && t.code === "KeyS" ? "snap" : !r && t.altKey && t.shiftKey && t.code === "KeyC" ? "copyAsPng" : r && t.code === "Quote" ? "grid" : r && t.altKey && t.code === "KeyP" && !e ? "present" : r && (t.key === "/" || t.shiftKey && t.key.toLowerCase() === "p") ? "palette" : null;
}
function ah(t) {
  const e = Ar(t);
  if (!e) throw new Error(`shortcutRegistry: no ToolDef for "${t}"`);
  return e.shift ? `Shift+${e.hotkey}` : e.hotkey;
}
const i6 = [
  { tool: "select", label: "Selection", letter: "V" },
  { tool: "hand", label: "Hand (panning tool)" },
  { tool: "rectangle", label: "Rectangle", letter: "R" },
  { tool: "diamond", label: "Diamond", letter: "D" },
  { tool: "ellipse", label: "Ellipse", letter: "O" },
  { tool: "arrow", label: "Arrow", letter: "A" },
  { tool: "line", label: "Line", letter: "L" },
  { tool: "freedraw", label: "Draw", letter: "P" },
  { tool: "text", label: "Text", letter: "T" },
  // The oracle grew a sticky note tool of its own (`toolBar.stickynote`, also N) — no
  // longer ours alone, so it sits here rather than in an "ours" section.
  { tool: "stickynote", label: "Sticky note" },
  { tool: "eraser", label: "Eraser", letter: "E" },
  { tool: "image", label: "Insert image" },
  { tool: "frame", label: "Frame tool" },
  { tool: "bucketfill", label: "Bucket fill" },
  { tool: "laser", label: "Laser pointer" }
], yu = [
  // --- Tools (HelpDialog.tsx's "Tools" island) ---------------------------------------
  ...i6.map(({ tool: t, label: e, letter: n }) => ({
    id: `tool.${t}`,
    section: "Tools",
    label: e,
    chords: n ? [ah(t), n] : [ah(t)]
  })),
  {
    id: "tool.lockActive",
    section: "Tools",
    label: "Keep selected tool active after drawing",
    chords: ["Q"]
  },
  { id: "tool.editText", section: "Tools", label: "Edit text / add label", chords: ["Enter"] },
  // `toolBar.convertElementType` (`HelpDialog.tsx@1118751f`), the oracle's own label for
  // Tab's shape switch (`shapeSwitch.ts`) — owned by `switchKey`, not the engine.
  {
    id: "tool.shapeSwitch",
    section: "Tools",
    label: "Toggle shape type",
    chords: ["Tab", "Shift+Tab"]
  },
  // --- View (HelpDialog.tsx's "View" island) ------------------------------------------
  { id: "view.zoomIn", section: "View", label: "Zoom in", chords: ["CtrlOrCmd+="] },
  { id: "view.zoomOut", section: "View", label: "Zoom out", chords: ["CtrlOrCmd+-"] },
  { id: "view.zoomReset", section: "View", label: "Reset zoom", chords: ["CtrlOrCmd+0"] },
  // The oracle's three fits (`actionCanvas.tsx@1118751f:290-410`), each its own action
  // with its own label — not "ours": `zoomToFitSelectionInViewport` (Shift+2) and
  // `zoomToFitSelection` (Shift+3, `Contain`, can zoom past 100%) are both the oracle's.
  {
    id: "view.zoomToFit",
    section: "View",
    label: "Zoom to fit all elements",
    chords: ["Shift+1"]
  },
  {
    id: "view.zoomToFitSelectionInViewport",
    section: "View",
    label: "Zoom to fit in viewport",
    chords: ["Shift+2"]
  },
  {
    id: "view.zoomToFitSelection",
    section: "View",
    label: "Zoom to selection",
    chords: ["Shift+3"]
  },
  {
    id: "view.movePageUpDown",
    section: "View",
    label: "Move page up/down",
    chords: ["PageUp", "PageDown"]
  },
  {
    id: "view.movePageLeftRight",
    section: "View",
    label: "Move page left/right",
    chords: ["Shift+PageUp", "Shift+PageDown"]
  },
  { id: "view.snap", section: "View", label: "Snap to objects", chords: ["Alt+S"] },
  { id: "view.grid", section: "View", label: "Toggle grid", chords: ["CtrlOrCmd+'"] },
  {
    id: "view.commandPalette",
    section: "View",
    label: "Command palette",
    chords: ["CtrlOrCmd+/", "CtrlOrCmd+Shift+P"]
  },
  // Zen mode, the oracle's own `keyTest` — `!CTRL_OR_CMD && altKey && code === Z`
  // (`actionToggleZenMode.tsx@1118751f:34-35`), and only that: Shift with Alt still
  // toggles, because the oracle never asks about it. Host-only, as `shortkey.md:384`
  // describes it — the flag hides chrome and leaves the canvas alone, so it needs nothing
  // from the engine, and `zen.ts` holds the inventory of what it hides.
  { id: "view.zenMode", section: "View", label: "Toggle zen mode", chords: ["Alt+Z"] },
  // --- Editor (HelpDialog.tsx's "Editor" island) --------------------------------------
  { id: "editor.delete", section: "Editor", label: "Delete", chords: ["Delete", "Backspace"] },
  { id: "editor.cut", section: "Editor", label: "Cut", chords: ["CtrlOrCmd+X"] },
  { id: "editor.copy", section: "Editor", label: "Copy", chords: ["CtrlOrCmd+C"] },
  { id: "editor.selectAll", section: "Editor", label: "Select all", chords: ["CtrlOrCmd+A"] },
  {
    id: "editor.copyStyles",
    section: "Editor",
    label: "Copy styles",
    chords: ["CtrlOrCmd+Alt+C"]
  },
  // "Copy to clipboard as PNG" (`locales/en.json@1118751f:17`) — the oracle's own chord,
  // `code === C && altKey && shiftKey` (`actionClipboard.tsx@1118751f:250`). **The raster
  // alone**: `actionCopyAsSvg` declares no `keyTest` at all (`:124-190` ends at
  // `keywords`), so copy-as-SVG is a context-menu entry and not a chord, and listing both
  // here would advertise a key the oracle does not have.
  {
    id: "editor.copyAsPng",
    section: "Editor",
    label: "Copy to clipboard as PNG",
    chords: ["Alt+Shift+C"]
  },
  {
    id: "editor.pasteStyles",
    section: "Editor",
    label: "Paste styles",
    chords: ["CtrlOrCmd+Alt+V"]
  },
  {
    id: "editor.sendToBack",
    section: "Editor",
    label: "Send to back",
    chords: ["CtrlOrCmd+Alt+[", "CtrlOrCmd+Shift+["]
  },
  {
    id: "editor.bringToFront",
    section: "Editor",
    label: "Bring to front",
    chords: ["CtrlOrCmd+Alt+]", "CtrlOrCmd+Shift+]"]
  },
  {
    id: "editor.sendBackward",
    section: "Editor",
    label: "Send backward",
    chords: ["CtrlOrCmd+["]
  },
  {
    id: "editor.bringForward",
    section: "Editor",
    label: "Bring forward",
    chords: ["CtrlOrCmd+]"]
  },
  // The oracle's four (`labels.alignTop/Bottom/Left/Right`, `actionAlign.tsx@1118751f`),
  // each its own action — `engine/src/host/keys.ts`'s `ALIGN_ARROWS` routes all four.
  {
    id: "editor.alignTop",
    section: "Editor",
    label: "Align top",
    chords: ["CtrlOrCmd+Shift+ArrowUp"]
  },
  {
    id: "editor.alignBottom",
    section: "Editor",
    label: "Align bottom",
    chords: ["CtrlOrCmd+Shift+ArrowDown"]
  },
  {
    id: "editor.alignLeft",
    section: "Editor",
    label: "Align left",
    chords: ["CtrlOrCmd+Shift+ArrowLeft"]
  },
  {
    id: "editor.alignRight",
    section: "Editor",
    label: "Align right",
    chords: ["CtrlOrCmd+Shift+ArrowRight"]
  },
  { id: "editor.duplicate", section: "Editor", label: "Duplicate", chords: ["CtrlOrCmd+D"] },
  {
    id: "editor.toggleLock",
    section: "Editor",
    label: "Lock/unlock selection",
    chords: ["CtrlOrCmd+Shift+L"]
  },
  { id: "editor.undo", section: "Editor", label: "Undo", chords: ["CtrlOrCmd+Z"] },
  {
    id: "editor.redo",
    section: "Editor",
    label: "Redo",
    chords: ["CtrlOrCmd+Shift+Z", "CtrlOrCmd+Y"]
  },
  { id: "editor.group", section: "Editor", label: "Group selection", chords: ["CtrlOrCmd+G"] },
  {
    id: "editor.ungroup",
    section: "Editor",
    label: "Ungroup selection",
    chords: ["CtrlOrCmd+Shift+G"]
  },
  // The oracle has no help-dialog entry for the arrow keys (`App.tsx@1118751f:5801-5810`),
  // so this label is ours — `nudge_step` (`engine/crates/draw-engine/src/engine/arrange.rs`)
  // moves the selection 1px, 5px with Shift, matching the oracle's own step exactly.
  {
    id: "editor.moveSelection",
    section: "Editor",
    label: "Move selection 1px, 5px with Shift",
    chords: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
  },
  { id: "editor.flipHorizontal", section: "Editor", label: "Flip horizontal", chords: ["Shift+H"] },
  { id: "editor.flipVertical", section: "Editor", label: "Flip vertical", chords: ["Shift+V"] },
  {
    id: "editor.showStroke",
    section: "Editor",
    label: "Show stroke color picker",
    chords: ["S"]
  },
  {
    id: "editor.showBackground",
    section: "Editor",
    label: "Show background color picker",
    chords: ["G"]
  },
  { id: "editor.showFonts", section: "Editor", label: "Show font picker", chords: ["Shift+F"] },
  {
    id: "editor.decreaseFontSize",
    section: "Editor",
    label: "Decrease font size",
    chords: ["CtrlOrCmd+Shift+<"]
  },
  {
    id: "editor.increaseFontSize",
    section: "Editor",
    label: "Increase font size",
    chords: ["CtrlOrCmd+Shift+>"]
  },
  // --- Presentation (ours: the oracle has no presentation mode) ----------------------
  {
    id: "presentation.enter",
    section: "Presentation",
    label: "Present — the board's frames as slides",
    chords: ["CtrlOrCmd+Alt+P"]
  },
  {
    id: "presentation.next",
    section: "Presentation",
    label: "Next slide",
    chords: ["ArrowRight", "ArrowDown", "Space", "PageDown", "Enter"]
  },
  {
    id: "presentation.prev",
    section: "Presentation",
    label: "Previous slide",
    chords: ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]
  },
  {
    id: "presentation.firstLast",
    section: "Presentation",
    label: "First / last slide",
    chords: ["Home", "End"]
  },
  {
    id: "presentation.black",
    section: "Presentation",
    label: "Blank the screen black, and back",
    chords: ["B", "."]
  },
  {
    id: "presentation.white",
    section: "Presentation",
    label: "Blank the screen white, and back",
    chords: ["W", ","]
  },
  {
    id: "presentation.exit",
    section: "Presentation",
    label: "Exit presentation",
    chords: ["Escape"]
  },
  // --- Flowchart (create/navigate follow the oracle; the shape picker is ours) -------
  {
    id: "flowchart.create",
    section: "Flowchart",
    label: "Create a flowchart from a generic element",
    chords: [
      "CtrlOrCmd+ArrowUp",
      "CtrlOrCmd+ArrowDown",
      "CtrlOrCmd+ArrowLeft",
      "CtrlOrCmd+ArrowRight"
    ]
  },
  {
    id: "flowchart.navigate",
    section: "Flowchart",
    label: "Navigate a flowchart",
    chords: ["Alt+ArrowUp", "Alt+ArrowDown", "Alt+ArrowLeft", "Alt+ArrowRight"]
  },
  {
    id: "flowchart.shape",
    section: "Flowchart",
    label: "Rectangle / diamond / ellipse, while creating a flowchart node",
    chords: ["CtrlOrCmd+1", "CtrlOrCmd+2", "CtrlOrCmd+3"]
  }
];
function s6(t = yu) {
  const e = [], n = /* @__PURE__ */ new Map();
  for (const r of t)
    n.has(r.section) || (n.set(r.section, []), e.push(r.section)), n.get(r.section).push(r);
  return e.map((r) => ({ section: r, entries: n.get(r) }));
}
function ut(t, e = _u) {
  const n = yu.find((r) => r.id === t);
  if (!n) throw new Error(`shortcutRegistry: no entry "${t}"`);
  return n.chords.map((r) => nn(r, e)).join(" or ");
}
const Dt = {
  transparent: "transparent",
  black: "#1e1e1e",
  white: "#ffffff",
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
  violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
  bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"]
}, Pr = [
  ["transparent", Dt.transparent],
  ["white", Dt.white],
  ["gray", Dt.gray],
  ["black", Dt.black],
  ["bronze", Dt.bronze],
  ["cyan", Dt.cyan],
  ["blue", Dt.blue],
  ["violet", Dt.violet],
  ["grape", Dt.grape],
  ["pink", Dt.pink],
  ["green", Dt.green],
  ["teal", Dt.teal],
  ["yellow", Dt.yellow],
  ["orange", Dt.orange],
  ["red", Dt.red]
], lh = {
  transparent: "Transparent",
  black: "Black",
  white: "White",
  red: "Red",
  pink: "Pink",
  grape: "Grape",
  violet: "Violet",
  gray: "Gray",
  blue: "Blue",
  cyan: "Cyan",
  teal: "Teal",
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  bronze: "Bronze"
}, bo = 5, a6 = 5, l6 = 4, c6 = 1, Ps = [
  "q",
  "w",
  "e",
  "r",
  "t",
  "a",
  "s",
  "d",
  "f",
  "g",
  "z",
  "x",
  "c",
  "v",
  "b"
];
function u6(t) {
  return t === "background" ? c6 : l6;
}
function _i(t, e) {
  return typeof t == "string" ? t : t[e] ?? t[0] ?? "transparent";
}
const Kn = (t) => {
  const e = t.trim().toLowerCase();
  return e === "transparent" || e === "" ? !0 : e.length === 9 && e.startsWith("#") ? e.slice(7) === "00" : e.length === 5 && e.startsWith("#") ? e.slice(4) === "0" : !1;
};
function va(t) {
  if (!t) return null;
  for (const [e, [n, r]] of Pr.entries())
    if (typeof r == "string") {
      if (r === t) return { name: n, index: e, shade: null };
    } else {
      const o = r.indexOf(t);
      if (o > -1) return { name: n, index: e, shade: o };
    }
  return null;
}
function Bm(t) {
  return va(t) === null;
}
function bu(t) {
  return t.filter(([e]) => !Kn(e) && Bm(e)).sort((e, n) => n[1] - e[1]).slice(0, a6).map(([e]) => e);
}
const d6 = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function f6(t, e = h6) {
  const n = t.trim();
  return n === "" ? null : Kn(n) ? n : d6.test(n) ? n.startsWith("#") ? n : `#${n}` : e(n) ? n : null;
}
function h6(t) {
  return typeof CSS < "u" && CSS.supports("color", t);
}
const g6 = "Hex code must be 3, 4, 6, or 8 characters", p6 = "Not a valid color";
function m6(t, e) {
  const n = t.toLowerCase().trim(), r = f6(n, e);
  return r ? { color: r, error: null } : n.length === 0 ? { color: null, error: null } : { color: null, error: /^#?[0-9a-f]+$/.test(n) ? g6 : p6 };
}
function El(t, e, n) {
  const r = Math.ceil(n / bo), o = e ?? -1;
  switch (t) {
    case "ArrowLeft":
      return o - 1 < 0 ? n - 1 : o - 1;
    case "ArrowRight":
      return (o + 1) % n;
    case "ArrowDown": {
      const i = o + bo;
      return i >= n ? o % bo : i;
    }
    case "ArrowUp": {
      const i = o - bo, a = i < 0 ? bo * r + i : i;
      return a >= n ? void 0 : a;
    }
    default:
      return;
  }
}
function v6(t, e) {
  if (t.ctrlKey || t.metaKey) return null;
  if (t.key === "Escape") return { kind: "close" };
  if (t.key === "i") return { kind: "eyedropper" };
  const n = va(e.color);
  if (t.key === "Tab") {
    const o = [];
    e.customColors.length && o.push("custom"), o.push("baseColors"), n?.shade != null && o.push("shades"), o.push("hex");
    const i = e.section ? o.indexOf(e.section) : -1, a = t.shiftKey ? -1 : 1, l = i + a > o.length - 1 ? 0 : i + a < 0 ? o.length - 1 : i + a, c = o[l] ?? "baseColors";
    return c === "custom" ? { kind: "section", section: c, color: e.customColors[0] ?? null } : c === "baseColors" && !n ? { kind: "section", section: c, color: Dt.black } : { kind: "section", section: c, color: null };
  }
  if (n?.shade != null && t.shiftKey && /^Digit[1-5]$/.test(t.code)) {
    const o = Pr[n.index]?.[1];
    if (o)
      return {
        kind: "pick",
        color: _i(o, Number(t.code.slice(-1)) - 1),
        section: "shades"
      };
  }
  if (/^[1-5]$/.test(t.key)) {
    const o = e.customColors[Number(t.key) - 1];
    if (o) return { kind: "pick", color: o, section: "custom" };
  }
  const r = Ps.indexOf(t.key);
  if (r > -1) {
    const o = Pr[r]?.[1];
    return o ? { kind: "pick", color: _i(o, e.activeShade), section: "baseColors" } : { kind: "inert" };
  }
  if (e.section === "shades" && n?.shade != null) {
    const o = El(t.key, n.shade, bo), i = Pr[n.index]?.[1];
    if (o !== void 0 && i)
      return { kind: "pick", color: _i(i, o), section: "shades" };
  }
  if (e.section === "baseColors" && n) {
    const o = El(t.key, n.index, Pr.length), i = o === void 0 ? void 0 : Pr[o]?.[1];
    if (i)
      return { kind: "pick", color: _i(i, e.activeShade), section: "baseColors" };
  }
  if (e.section === "custom") {
    const o = e.color != null ? e.customColors.indexOf(e.color) : 0, i = El(t.key, o, e.customColors.length), a = i === void 0 ? void 0 : e.customColors[i];
    if (a) return { kind: "pick", color: a, section: "custom" };
  }
  return null;
}
function _6(t, e) {
  return t && Bm(t) ? e.includes(t) ? "custom" : null : va(t)?.shade != null ? "shades" : "baseColors";
}
const y6 = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"], b6 = ["#f8f9fa", "#ff8787", "#69db7c", "#74c0fc", "#ffd43b"], w6 = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"], k6 = ["transparent", "#5c2b29", "#1b4729", "#183b5e", "#5e4514"];
function S6(t = "light") {
  return t === "dark" ? b6 : y6;
}
function x6(t = "light") {
  return t === "dark" ? k6 : w6;
}
const E6 = [
  "#ffdf6b",
  Dt.pink[1],
  Dt.green[1],
  Dt.blue[1],
  Dt.orange[1]
];
function jo(t, e, n) {
  const r = e === "sticky";
  return t === "stroke" ? {
    label: r ? "Text color" : "Stroke",
    picks: S6(n),
    hideTransparent: r
  } : {
    label: "Background",
    picks: r ? E6 : x6(n),
    hideTransparent: r
  };
}
const Um = [
  { label: "S", value: 1 },
  { label: "M", value: 2 },
  { label: "L", value: 4 }
], jm = [
  { label: "──", value: "solid" },
  { label: "– –", value: "dashed" },
  { label: "···", value: "dotted" }
], T6 = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6"], Hm = [
  { label: "Fine", value: 0 },
  { label: "Rough", value: 1 },
  { label: "Extra", value: 2 }
], Wm = [
  { label: "Sharp", value: "sharp" },
  { label: "Round", value: "round" }
];
function Ys(t) {
  return t === "round" ? 8 : null;
}
const C6 = [
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "40", value: 40 },
  { label: "80", value: 80 }
], Zm = [
  { label: "Hachure", value: "hachure" },
  { label: "Cross", value: "cross-hatch" },
  { label: "Solid", value: "solid" }
], Km = [
  { label: "S", value: 16 },
  { label: "M", value: 20 },
  { label: "L", value: 28 },
  { label: "XL", value: 36 }
], wu = [
  { label: "Align text left", icon: "textAlignLeft", value: "left" },
  { label: "Align text centre", icon: "textAlignCenter", value: "center" },
  { label: "Align text right", icon: "textAlignRight", value: "right" }
], ku = [
  { label: "Align text top", icon: "textAlignTop", value: "top" },
  { label: "Align text middle", icon: "textAlignMiddle", value: "middle" },
  { label: "Align text bottom", icon: "textAlignBottom", value: "bottom" }
], Su = [
  { label: "Sharp arrow", icon: "arrowSharp", value: "sharp" },
  { label: "Curved arrow", icon: "arrowRound", value: "round" },
  { label: "Elbow arrow", icon: "arrowElbow", value: "elbow" }
], xu = [
  { label: "Polygon", icon: "figurePolygon", value: "polygon" },
  { label: "Star", icon: "figureStar", value: "star" },
  { label: "Parallelogram", icon: "figureParallelogram", value: "parallelogram" },
  { label: "Trapezoid", icon: "figureTrapezoid", value: "trapezoid" },
  { label: "Cylinder", icon: "figureCylinder", value: "cylinder" },
  { label: "Document", icon: "figureDocument", value: "document" }
], Xs = { min: 3, max: 12 }, Jn = { min: 0.05, max: 0.95, step: 0.01 }, Vm = [
  { label: "Wrap", value: "wrap" },
  { label: "Grow", value: "grow" }
];
function Jm(t) {
  const e = [];
  t.hasFreeText && e.push(t.autoResize === null ? null : !t.autoResize), t.hasLabel && e.push(t.labelWrap);
  const [n] = e;
  return n == null || e.some((r) => r !== n) ? null : n ? "wrap" : "grow";
}
const A6 = /* @__PURE__ */ new Set([
  "Virgil",
  "Excalifont",
  "Cascadia",
  "Nunito",
  "Lilita One",
  "Comic Shanns"
]);
function P6(t, e) {
  const n = /* @__PURE__ */ new Set(), r = (o) => {
    let i = !1;
    for (const a of o.fontfaces) {
      const l = a.family.replace(/^["']|["']$/g, ""), c = `${l}-${a.style}-${a.weight}-${a.unicodeRange}`;
      A6.has(l) && !n.has(c) && (n.add(c), i = !0);
    }
    i && e();
  };
  return t.addEventListener("loadingdone", r), () => t.removeEventListener("loadingdone", r);
}
const Eu = [
  { id: 3, label: "Cascadia", icon: "fontCode", deprecated: !0 },
  { id: 8, label: "Comic Shanns", icon: "fontCode", deprecated: !1 },
  { id: 5, label: "Excalifont", icon: "freedraw", deprecated: !1 },
  { id: 2, label: "Helvetica", icon: "fontNormal", deprecated: !0 },
  { id: 7, label: "Lilita One", icon: "fontHeading", deprecated: !1 },
  { id: 6, label: "Nunito", icon: "fontNormal", deprecated: !1 },
  { id: 1, label: "Virgil", icon: "freedraw", deprecated: !0 }
], I6 = [
  { id: 5, label: "Hand-drawn", icon: "freedraw" },
  { id: 6, label: "Normal", icon: "fontNormal" },
  { id: 8, label: "Code", icon: "fontCode" }
];
function z6(t) {
  return t === null ? "mixed" : t === 0 ? "System" : Eu.find((e) => e.id === t)?.label ?? "Unknown";
}
function M6(t, e) {
  const n = e.trim().toLowerCase(), r = Eu.filter((o) => o.label.toLowerCase().includes(n));
  return {
    inScene: r.filter((o) => t.includes(o.id)),
    available: r.filter((o) => !t.includes(o.id) && !o.deprecated)
  };
}
function O6(t, e, n) {
  if (!t.ctrlKey && !t.metaKey && t.shiftKey && t.key.toLowerCase() === "f")
    return { kind: "focusSearch" };
  if (t.key === "Escape") return { kind: "close" };
  if (t.key === "Enter")
    return e === null ? { kind: "none" } : { kind: "select", id: e };
  if (t.key !== "ArrowDown" && t.key !== "ArrowUp") return null;
  if (n.length === 0) return { kind: "none" };
  const r = e === null ? -1 : n.indexOf(e), o = t.key === "ArrowDown" ? 1 : -1, i = r < 0 ? o > 0 ? 0 : n.length - 1 : (r + o + n.length) % n.length, a = n[i];
  return a === void 0 ? { kind: "none" } : { kind: "hover", id: a };
}
async function Ho(t, e) {
  try {
    await t.load(`10px ${e}`);
  } catch {
  }
}
function Gm(t) {
  const e = t.trim() === "" ? Number.NaN : Number(t);
  return Number.isFinite(e) ? e : null;
}
function F6(t, e) {
  const n = t.trim().toLowerCase();
  if (n === "") return 0;
  const r = e.toLowerCase(), o = r.indexOf(n);
  if (o !== -1) return 1e4 - o;
  let i = 0, a = 0, l = 0;
  for (const c of n) {
    const d = r.indexOf(c, i);
    if (d === -1) return null;
    l = d === i ? l + 1 : 0, a += 1 + l, i = d + 1;
  }
  return a;
}
function R6(t, e) {
  const n = [t.label, t.category, ...t.keywords ?? []];
  let r = null;
  for (const o of n) {
    const i = F6(e, o);
    i !== null && (r === null || i > r) && (r = i);
  }
  return r;
}
function L6(t, e) {
  return e.trim() === "" ? [...t] : t.map((n) => ({ command: n, score: R6(n, e) })).filter((n) => n.score !== null).sort((n, r) => r.score - n.score).map((n) => n.command);
}
function ch(t) {
  const e = [], n = /* @__PURE__ */ new Map();
  for (const r of t)
    n.has(r.category) || (n.set(r.category, []), e.push(r.category)), n.get(r.category).push(r);
  return e.map((r) => ({ category: r, commands: n.get(r) }));
}
const D6 = "Recents";
function N6(t, e, n) {
  if (e.trim() !== "") {
    const r = L6(t, e);
    return r.length === 0 ? [] : [{ category: "Results", commands: r }];
  }
  return n === null || !t.some((r) => r.id === n) ? ch(t) : [
    {
      category: D6,
      commands: t.filter((r) => r.id === n)
    },
    ...ch(t.filter((r) => r.id !== n))
  ];
}
function Wt(t, e) {
  return () => t.run(e);
}
function Po(t, e) {
  return e.filter((n) => n.when !== !1).map(({ when: n, ...r }) => ({ ...r, category: t }));
}
function B6(t, { can: e, element: n, switchable: r }) {
  const o = Rm(n);
  return Po("Elements", [
    {
      id: "element:group",
      label: "Group selection",
      shortcut: ut("editor.group"),
      when: n.multi && !n.grouped,
      run: Wt(t, (i) => i.groupSelection())
    },
    {
      id: "element:ungroup",
      label: "Ungroup selection",
      shortcut: ut("editor.ungroup"),
      when: n.grouped,
      run: Wt(t, (i) => i.ungroupSelection())
    },
    {
      id: "element:cut",
      label: "Cut",
      shortcut: ut("editor.cut"),
      run: Wt(t, (i) => i.cutSelection())
    },
    {
      id: "element:copy",
      label: "Copy",
      shortcut: ut("editor.copy"),
      run: Wt(t, (i) => i.copySelection())
    },
    {
      id: "element:delete",
      label: "Delete",
      shortcut: ut("editor.delete"),
      run: Wt(t, (i) => i.deleteSelection())
    },
    {
      id: "element:copyStyles",
      label: "Copy styles",
      shortcut: ut("editor.copyStyles"),
      run: t.copyStyles
    },
    {
      id: "element:pasteStyles",
      label: "Paste styles",
      shortcut: ut("editor.pasteStyles"),
      run: Wt(t, (i) => i.pasteStyles())
    },
    ...[
      ["bringToFront", "Bring to front", "front"],
      ["bringForward", "Bring forward", "forward"],
      ["sendBackward", "Send backward", "backward"],
      ["sendToBack", "Send to back", "back"]
    ].map(([i, a, l]) => ({
      id: `element:${i}`,
      label: a,
      shortcut: ut(`editor.${i}`),
      when: e.layers,
      run: Wt(t, (c) => c.reorderSelection(l))
    })),
    ...[
      ["alignTop", "Align top", "top"],
      ["alignBottom", "Align bottom", "bottom"],
      ["alignLeft", "Align left", "left"],
      ["alignRight", "Align right", "right"],
      ["centerVertically", "Center vertically", "centerY"],
      ["centerHorizontally", "Center horizontally", "centerX"]
    ].map(([i, a, l]) => ({
      id: `element:${i}`,
      label: a,
      shortcut: qm.has(`editor.${i}`) ? ut(`editor.${i}`) : void 0,
      when: e.align,
      run: Wt(t, (c) => c.alignSelection(l))
    })),
    {
      id: "element:duplicate",
      label: "Duplicate",
      shortcut: ut("editor.duplicate"),
      run: Wt(t, (i) => i.duplicateSelection())
    },
    {
      id: "element:flipHorizontal",
      label: "Flip horizontal",
      shortcut: ut("editor.flipHorizontal"),
      when: e.mirror,
      run: Wt(t, (i) => i.flipSelection("horizontal"))
    },
    {
      id: "element:flipVertical",
      label: "Flip vertical",
      shortcut: ut("editor.flipVertical"),
      when: e.mirror,
      run: Wt(t, (i) => i.flipSelection("vertical"))
    },
    {
      id: "element:increaseFontSize",
      label: "Increase font size",
      shortcut: ut("editor.increaseFontSize"),
      when: e.text,
      run: () => t.stepFontSize(!0)
    },
    {
      id: "element:decreaseFontSize",
      label: "Decrease font size",
      shortcut: ut("editor.decreaseFontSize"),
      when: e.text,
      run: () => t.stepFontSize(!1)
    },
    {
      id: "element:shapeSwitch",
      label: "Switch shape",
      shortcut: ut("tool.shapeSwitch"),
      when: r,
      run: t.openShapeSwitch
    },
    {
      id: "element:changeStroke",
      label: "Change stroke color",
      shortcut: ut("editor.showStroke"),
      keywords: ["color", "outline"],
      when: e.strokeColor,
      run: () => t.openPicker("stroke")
    },
    {
      id: "element:changeBackground",
      label: "Change background color",
      shortcut: ut("editor.showBackground"),
      keywords: ["color", "fill"],
      when: e.backgroundColor,
      run: () => t.openPicker("background")
    },
    {
      id: "element:lock",
      label: n.locked ? "Unlock" : "Lock",
      shortcut: ut("editor.toggleLock"),
      run: Wt(t, (i) => i.toggleLockSelection())
    },
    ...o ? [
      {
        id: "element:vectorize",
        label: o.label,
        keywords: ["image", "bitmap", "trace", "convert", "png", "jpg"],
        run: () => t.vectorize(o.elementId)
      }
    ] : []
  ]);
}
function U6(t, { can: e }) {
  return [
    ...[
      {
        row: "fill",
        name: "Fill",
        picks: [
          ["Hachure", { fillStyle: "hachure" }],
          ["Cross-hatch", { fillStyle: "cross-hatch" }],
          ["Solid", { fillStyle: "solid" }]
        ]
      },
      {
        row: "strokeWidth",
        name: "Stroke width",
        picks: [
          ["Thin", { strokeWidth: 1 }],
          ["Bold", { strokeWidth: 2 }],
          ["Extra bold", { strokeWidth: 4 }]
        ]
      },
      {
        row: "strokeStyle",
        name: "Stroke style",
        picks: [
          ["Solid", { strokeStyle: "solid" }],
          ["Dashed", { strokeStyle: "dashed" }],
          ["Dotted", { strokeStyle: "dotted" }]
        ]
      },
      {
        row: "sloppiness",
        name: "Sloppiness",
        picks: [
          ["Architect", { roughness: 0 }],
          ["Artist", { roughness: 1 }],
          ["Cartoonist", { roughness: 2 }]
        ]
      },
      {
        row: "roundness",
        name: "Edges",
        picks: [
          ["Sharp", { roundness: Ys("sharp") }],
          ["Round", { roundness: Ys("round") }]
        ]
      },
      {
        row: "text",
        name: "Font size",
        picks: [
          ["Small", { fontSize: 16 }],
          ["Medium", { fontSize: 20 }],
          ["Large", { fontSize: 28 }],
          ["Very large", { fontSize: 36 }]
        ]
      }
    ].filter(({ row: o }) => e[o]).flatMap(
      ({ name: o, picks: i }) => i.map(([a, l]) => ({
        id: `style:${o}:${a}`,
        label: `${o}: ${a}`,
        category: "Style",
        run: () => t.applyStyle(l)
      }))
    ),
    ...j6(e.text, t),
    ...Po(
      "Style",
      wu.map(({ label: o, value: i }) => ({
        id: `style:textAlign:${i}`,
        label: o,
        when: e.textAlign,
        run: Wt(t, (a) => a.setTextAlign(i))
      }))
    ),
    ...Po(
      "Style",
      ku.map(({ label: o, value: i }) => ({
        id: `style:verticalAlign:${i}`,
        label: o,
        when: e.verticalAlign,
        run: Wt(t, (a) => a.setVerticalAlign(i))
      }))
    ),
    ...Po(
      "Style",
      Su.map(({ label: o, value: i }) => ({
        id: `style:arrowType:${i}`,
        label: o,
        when: e.arrowType,
        run: Wt(t, (a) => a.setArrowType(i))
      }))
    )
  ];
}
function j6(t, e) {
  return Po(
    "Style",
    Eu.map((n) => ({
      id: `style:fontFamily:${n.id}`,
      label: `Font: ${n.label}`,
      when: t,
      run: () => e.applyStyle({ fontFamily: n.id })
    }))
  );
}
const qm = new Set(yu.map((t) => t.id));
function H6(t, e) {
  return qm.has(t) ? ut(t) : e;
}
function W6(t) {
  const e = [];
  t.selection && e.push(...B6(t, t.selection), ...U6(t, t.selection)), e.push(
    ...Po("Editor", [
      {
        id: "editor:undo",
        label: "Undo",
        shortcut: ut("editor.undo"),
        run: Wt(t, (n) => n.undo())
      },
      {
        id: "editor:redo",
        label: "Redo",
        shortcut: ut("editor.redo"),
        run: Wt(t, (n) => n.redo())
      },
      {
        id: "editor:selectAll",
        label: "Select all",
        shortcut: ut("editor.selectAll"),
        run: Wt(t, (n) => n.selectAll())
      },
      { id: "editor:unlockAll", label: "Unlock all", run: Wt(t, (n) => n.unlockAll()) }
    ])
  ), e.push(
    ...qs.map((n) => ({
      id: `tool:${n.tool}`,
      label: n.label,
      category: "Tools",
      shortcut: H6(`tool.${n.tool}`, vi(n)),
      keywords: [n.tool],
      run: () => t.setTool(n.tool)
    })),
    // The oracle files its dialog with the tools (`CommandPalette.tsx@1118751f:577-590`).
    {
      id: "tool:mermaid",
      label: "Mermaid to diagram…",
      category: "Tools",
      keywords: ["mermaid", "flowchart", "sequence", "import"],
      run: t.openMermaid
    }
  ), e.push(
    {
      id: "insert:rectangle",
      label: "Add rectangle",
      category: "Insert",
      run: () => t.insertShape("rectangle")
    },
    {
      id: "insert:diamond",
      label: "Add diamond",
      category: "Insert",
      run: () => t.insertShape("diamond")
    },
    {
      id: "insert:ellipse",
      label: "Add ellipse",
      category: "Insert",
      run: () => t.insertShape("ellipse")
    }
  );
  for (const n of xu)
    e.push({
      id: `insert:figure:${n.value}`,
      label: `Add ${n.label.toLowerCase()}`,
      category: "Insert",
      run: () => t.insertFigure({ kind: n.value })
    });
  e.push(
    {
      id: "view:zoomIn",
      label: "Zoom in",
      category: "View",
      shortcut: ut("view.zoomIn"),
      run: t.zoomIn
    },
    {
      id: "view:zoomOut",
      label: "Zoom out",
      category: "View",
      shortcut: ut("view.zoomOut"),
      run: t.zoomOut
    },
    {
      id: "view:zoomReset",
      label: "Reset zoom",
      category: "View",
      shortcut: ut("view.zoomReset"),
      run: t.zoomReset
    },
    {
      id: "view:fit",
      label: "Zoom to fit all elements",
      category: "View",
      shortcut: ut("view.zoomToFit"),
      run: t.zoomToFit
    },
    {
      id: "view:zoomToFitViewport",
      label: "Zoom to fit in viewport",
      category: "View",
      shortcut: ut("view.zoomToFitSelectionInViewport"),
      run: t.zoomToFitSelectionInViewport
    },
    {
      id: "view:zoomToSelection",
      label: "Zoom to selection",
      category: "View",
      shortcut: ut("view.zoomToFitSelection"),
      run: t.zoomToFitSelection
    },
    {
      id: "view:grid",
      label: "Toggle grid",
      category: "View",
      shortcut: ut("view.grid"),
      run: t.toggleGrid
    },
    {
      id: "view:snap",
      label: "Toggle snap to objects",
      category: "View",
      shortcut: ut("view.snap"),
      run: t.toggleObjectsSnap
    },
    {
      id: "view:focusMode",
      label: "Toggle focus while typing",
      category: "View",
      run: t.toggleFocusMode
    },
    {
      id: "view:zenMode",
      label: "Toggle zen mode",
      category: "View",
      shortcut: ut("view.zenMode"),
      run: t.toggleZenMode
    },
    {
      id: "view:present",
      label: "Present",
      category: "View",
      shortcut: ut("presentation.enter"),
      run: t.enterPresent
    },
    {
      id: "view:path",
      label: "Presentation path…",
      category: "View",
      keywords: ["path", "order", "slides", "frames", "prezi", "stops"],
      run: t.openPath
    }
  ), e.push(
    {
      id: "theme:light",
      label: "Theme: Light",
      category: "Theme",
      run: () => t.pickTheme("light")
    },
    {
      id: "theme:dark",
      label: "Theme: Dark",
      category: "Theme",
      run: () => t.pickTheme("dark")
    },
    {
      id: "theme:system",
      label: "Theme: Match system",
      category: "Theme",
      run: () => t.pickTheme("system")
    }
  ), e.push(
    {
      id: "file:export",
      label: "Export…",
      category: "File",
      shortcut: nn("CtrlOrCmd+Shift+E"),
      run: t.openExport
    },
    {
      id: "file:templates",
      label: "Templates…",
      category: "File",
      run: t.openTemplates
    }
  );
  for (const n of t.presets)
    e.push({
      id: `preset:${n.id}`,
      label: `Style: ${n.name}`,
      category: "Style presets",
      run: () => t.applyStylePreset(n.id)
    });
  return e;
}
const Z6 = "Mermaid diagram · image, not editable", ps = 10, K6 = 14, V6 = 8, J6 = 8, Ym = "#1e1e1e", G6 = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
class Ci extends Error {
}
function An(t, e) {
  if (typeof t != "number" || !Number.isFinite(t))
    throw new Ci(`${e} is not a finite number: ${String(t)}`);
  return t;
}
function uc(t, e) {
  return typeof t == "string" && t.length > 0 && t.length <= tp ? t : e;
}
const q6 = new Set(Hl);
function uh(t, e) {
  return t === void 0 ? e : t === null ? "none" : q6.has(t) ? t : "arrow";
}
function Qs(t, e, n) {
  return e.includes(t) ? t : n;
}
let Y6 = 0;
const Xm = () => `mermaid-${Date.now().toString(36)}-${(Y6++).toString(36)}`, dh = () => Math.floor(Math.random() * 2147483647);
function Ai(t, e) {
  return {
    id: Xm(),
    type: t,
    x: An(e.x ?? 0, `${e.type}.x`),
    y: An(e.y ?? 0, `${e.type}.y`),
    width: An(e.width ?? 0, `${e.type}.width`),
    height: An(e.height ?? 0, `${e.type}.height`),
    angle: 0,
    strokeColor: uc(e.strokeColor, Ym),
    backgroundColor: uc(e.backgroundColor, "transparent"),
    fillStyle: Qs(e.fillStyle, ["hachure", "cross-hatch", "solid", "zigzag"], "solid"),
    strokeWidth: An(e.strokeWidth ?? 2, `${e.type}.strokeWidth`),
    strokeStyle: Qs(e.strokeStyle, ["solid", "dashed", "dotted"], "solid"),
    roughness: 1,
    opacity: 100,
    roundness: e.roundness ? J6 : null,
    seed: dh(),
    groupIds: e.groupIds?.length ? [...e.groupIds] : void 0,
    version: 1,
    versionNonce: dh(),
    updated: Date.now(),
    isDeleted: !1
  };
}
function dc(t, e, n, r) {
  return {
    ...Ai("text", { type: "text", x: e.x, y: e.y, groupIds: n.groupIds }),
    strokeColor: uc(n.strokeColor, Ym),
    text: t,
    originalText: t,
    fontSize: An(n.fontSize ?? 20, "text.fontSize"),
    textAlign: Qs(n.textAlign, ["left", "center", "right"], r.textAlign),
    verticalAlign: Qs(
      n.verticalAlign,
      ["top", "middle", "bottom"],
      r.verticalAlign
    )
  };
}
function X6(t) {
  const e = t.points;
  return e && e.length >= 2 ? e.map(([n, r], o) => [
    An(n, `${t.type}.points[${o}].x`),
    An(r, `${t.type}.points[${o}].y`)
  ]) : [
    [0, 0],
    [An(t.width ?? 0, "width"), An(t.height ?? 0, "height")]
  ];
}
function Q6(t) {
  const e = t.map(([r]) => r), n = t.map(([, r]) => r);
  return {
    width: Math.max(...e) - Math.min(...e),
    height: Math.max(...n) - Math.min(...n)
  };
}
function $6(t, e) {
  if (e.length > Ro)
    throw new Ci("the diagram's picture is too large to put on the board");
  const n = Xm(), r = {
    ...Ai("image", t),
    strokeColor: "transparent",
    dataUrl: e,
    groupIds: [n]
  }, o = dc(
    Z6,
    { x: r.x, y: r.y + r.height + V6 },
    { fontSize: K6, strokeColor: "#868e96", groupIds: [n] },
    { textAlign: "left", verticalAlign: "top" }
  );
  return [r, o];
}
function fh(t) {
  return t.replace(/ﬂ°°(\d+)¶ß/g, (e, n) => String.fromCodePoint(Number(n))).replace(/ﬂ°(\w+)¶ß/g, (e, n) => e5[n] ?? `#${n};`);
}
const e5 = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  infin: "∞",
  larr: "←",
  rarr: "→",
  harr: "↔",
  check: "✓",
  times: "×",
  deg: "°",
  copy: "©"
};
function t5(t, e = {}) {
  const n = [], r = /* @__PURE__ */ new Map(), o = (d) => {
    const u = d === void 0 ? void 0 : r.get(d);
    return u && G6.has(u.type) ? u : void 0;
  }, i = (d, u) => {
    const f = u.label?.text;
    if (!f) return [d];
    const h = dc(
      fh(f),
      { x: d.x, y: d.y },
      { ...u.label, groupIds: d.groupIds },
      { textAlign: "center", verticalAlign: "middle" }
    );
    return h.containerId = d.id, d.boundTextId = h.id, [d, h];
  }, a = (d) => {
    switch (d.type) {
      case "rectangle":
      case "diamond":
      case "ellipse":
        return i(Ai(d.type, d), d);
      case "text": {
        const u = { x: An(d.x ?? 0, "text.x"), y: An(d.y ?? 0, "text.y") }, f = fh(d.text ?? "");
        return [dc(f, u, d, { textAlign: "left", verticalAlign: "top" })];
      }
      case "arrow":
      case "line": {
        const u = X6(d), f = {
          ...Ai(d.type, d),
          ...Q6(u),
          points: u,
          startArrowhead: uh(d.startArrowhead, "none"),
          endArrowhead: uh(
            d.endArrowhead,
            d.type === "arrow" ? "arrow" : "none"
          )
        };
        if (d.type === "line") return [f];
        if (!e.lifelines) {
          const h = o(d.start?.id), p = o(d.end?.id);
          h && (f.startBinding = h.id), p && (f.endBinding = p.id);
        }
        return i(f, d);
      }
      case "image": {
        const u = d.fileId ? t.files?.[d.fileId]?.dataURL : void 0;
        if (!u) throw new Ci("an image skeleton with no picture");
        return $6(d, u);
      }
      default:
        throw new Ci(`unknown skeleton type "${d.type}"`);
    }
  }, l = [];
  let c = null;
  for (const d of t.elements) {
    if (d.type === "frame") {
      l.push(d);
      continue;
    }
    let u;
    try {
      u = a(d);
    } catch (f) {
      if (!(f instanceof Ci)) throw f;
      c ??= f;
      continue;
    }
    d.id && !r.has(d.id) && r.set(d.id, u[0]), n.push(...u);
  }
  if (n.length === 0 && c) throw c;
  for (const d of l) {
    const u = (d.children ?? []).map((k) => r.get(k)).filter((k) => k !== void 0);
    if (u.length === 0) continue;
    const f = Math.min(...u.map((k) => k.x)) - ps, h = Math.min(...u.map((k) => k.y)) - ps, p = Math.max(...u.map((k) => k.x + k.width)) + ps, m = Math.max(...u.map((k) => k.y + k.height)) + ps, w = {
      ...Ai("frame", {
        type: "frame",
        x: f,
        y: h,
        width: p - f,
        height: m - h
      }),
      name: d.name ?? null
    }, y = new Set(u.map((k) => k.id));
    for (const k of n)
      (y.has(k.id) || k.containerId && y.has(k.containerId)) && (k.frameId = w.id);
    n.unshift(w);
  }
  return n;
}
let hh = null;
function n5() {
  return hh ??= import("./index-Bx7N355m.js").then((t) => t.bB).then(
    (t) => t.parseMermaidToExcalidraw
  ), hh;
}
async function Qm(t) {
  const e = await n5();
  let n;
  try {
    n = await e(t);
  } catch (r) {
    if (!t.includes('"')) throw r;
    try {
      n = await e(t.replace(/"/g, "'"));
    } catch {
      throw r;
    }
  }
  return t5(n, { lifelines: r5(t) === "sequenceDiagram" });
}
function r5(t) {
  return t.replace(/^\s*---\r?\n[\s\S]*?\r?\n---[^\n]*/, "").replace(/%%\{[\s\S]*?\}%%/g, "").split(/\r?\n/).find((r) => r.trim() !== "" && !r.trim().startsWith("%%"))?.trim().split(/[\s;:]/)[0] ?? "";
}
function fc(t) {
  return JSON.stringify({ type: "osidraw", version: 1, elements: t });
}
const o5 = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "C4Context",
  "mindmap",
  "timeline",
  "zenuml",
  "sankey",
  "xychart",
  "block"
], i5 = new RegExp(
  `^(?:%%{.*?}%%[\\s\\n]*)?\\b(?:${o5.map((t) => `\\s*${t}(-beta)?`).join("|")})\\b`
);
function s5(t) {
  return i5.test(t.trim());
}
const a5 = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "roundness",
  "fontFamily",
  "fontSize",
  "textAlign"
];
function l5(t) {
  const e = {};
  for (const n of a5)
    t[n] !== void 0 && (e[n] = t[n]);
  return e;
}
const $m = [
  {
    id: "sketch",
    name: "Sketch",
    style: {
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffec99",
      fillStyle: "hachure",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1.5,
      opacity: 100,
      roundness: 8,
      fontFamily: 1
      // Virgil — the hand-drawn face
    }
  },
  {
    id: "clean",
    name: "Clean",
    style: {
      strokeColor: "#1e1e1e",
      backgroundColor: "#e7f5ff",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: 8,
      fontFamily: 2
      // Helvetica
    }
  },
  {
    id: "blueprint",
    name: "Blueprint",
    style: {
      strokeColor: "#1971c2",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: 0,
      fontFamily: 3
      // Cascadia — monospace, technical
    }
  },
  {
    id: "highlight",
    name: "Highlight",
    style: {
      strokeColor: "#e8590c",
      backgroundColor: "#ffd8a8",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      roundness: 8,
      fontFamily: 7
      // Lilita One — bold display face
    }
  },
  {
    id: "muted-note",
    name: "Muted note",
    style: {
      strokeColor: "#495057",
      backgroundColor: "#f1f3f5",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "dashed",
      roughness: 0.5,
      opacity: 80,
      roundness: 8,
      fontFamily: 6
      // Nunito — soft, quiet
    }
  }
];
function gh(t) {
  return [...$m, ...t];
}
function c5() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function u5(t, e, n) {
  return [...t, { id: c5(), name: e, style: n }];
}
function d5(t, e, n) {
  return t.map((r) => r.id === e ? { ...r, name: n } : r);
}
function f5(t, e) {
  return t.filter((n) => n.id !== e);
}
const ev = "drawnosaurus:style-presets";
function h5(t) {
  if (typeof t != "object" || t === null) return !1;
  const e = t;
  return typeof e.id == "string" && typeof e.name == "string" && typeof e.style == "object" && e.style !== null;
}
function g5(t) {
  try {
    const e = t?.getItem(ev);
    if (!e) return [];
    const n = JSON.parse(e);
    return Array.isArray(n) ? n.filter(h5) : [];
  } catch {
    return [];
  }
}
function Tl(t, e) {
  try {
    t.setItem(ev, JSON.stringify(e));
  } catch {
  }
}
class p5 {
  points = [];
  decayTime;
  size;
  streamline;
  onUpdate;
  rafId = 0;
  isDrawing = !1;
  constructor(e = {}) {
    this.decayTime = e.decayTime ?? 220, this.size = e.size ?? 16, this.streamline = Math.min(Math.max(e.streamline ?? 0.25, 0), 0.9), this.onUpdate = e.onUpdate;
  }
  /** Start a new stroke at (x, y). */
  start(e, n) {
    this.points = [], this.isDrawing = !0, this.addPoint(e, n);
  }
  /**
   * Add a point along the stroke — only while one is being drawn.
   *
   * Moves keep arriving after Escape has ended the sweep and while a space-drag pans
   * with the eraser chosen; drawing them left a live-looking trail over a gesture that
   * was erasing nothing.
   */
  addPoint(e, n) {
    if (!this.isDrawing) return;
    const r = performance.now(), o = this.points[this.points.length - 1];
    if (o) {
      const i = e - o.x, a = n - o.y;
      if (i * i + a * a < 1)
        return;
      this.streamline > 0 && (e = o.x + (e - o.x) * (1 - this.streamline), n = o.y + (n - o.y) * (1 - this.streamline));
    }
    this.points.push({ x: e, y: n, time: r }), this.ensureLoop();
  }
  /** Release pointer: stop drawing new points and allow the trail to decay out. */
  stop() {
    this.isDrawing = !1, this.ensureLoop();
  }
  /** Cancel and immediately clear all trail points. */
  clear() {
    this.points = [], this.isDrawing = !1, this.rafId && (typeof cancelAnimationFrame < "u" && cancelAnimationFrame(this.rafId), this.rafId = 0), this.onUpdate?.("");
  }
  get active() {
    return this.points.length > 0;
  }
  ensureLoop() {
    this.rafId || typeof requestAnimationFrame > "u" || (this.rafId = requestAnimationFrame(this.tick));
  }
  tick = () => {
    this.rafId = 0;
    const e = performance.now(), n = e - this.decayTime;
    let r = 0;
    for (; r < this.points.length; ) {
      const i = this.points[r];
      if (i && i.time < n)
        r++;
      else
        break;
    }
    if (r > 0 && this.points.splice(0, r), this.points.length === 0) {
      this.onUpdate?.("");
      return;
    }
    const o = this.computePath(e);
    this.onUpdate?.(o), (this.points.length > 0 || this.isDrawing) && (this.rafId = requestAnimationFrame(this.tick));
  };
  /**
   * Generates the SVG path polygon for the trail outline.
   */
  computePath(e = performance.now()) {
    const n = this.points.length;
    if (n === 0) return "";
    if (n === 1) {
      const u = this.points[0];
      if (!u) return "";
      const f = e - u.time, h = Math.max(0, 1 - f / this.decayTime), p = this.size / 2 * Math.sin(h * Math.PI / 2);
      return p < 0.5 ? "" : `M ${u.x - p},${u.y} a ${p},${p} 0 1,0 ${p * 2},0 a ${p},${p} 0 1,0 -${p * 2},0`;
    }
    const r = [], o = [];
    for (let u = 0; u < n; u++) {
      const f = this.points[u];
      if (!f) continue;
      const h = e - f.time, p = Math.max(0, 1 - h / this.decayTime), m = Math.min((u + 1) / Math.min(n, 8), 1), w = Math.sin(p * Math.PI / 2), y = this.size / 2 * w * m;
      if (y < 0.2) continue;
      let k = 0, O = 0;
      if (u === 0) {
        const T = this.points[1];
        T && (k = T.x - f.x, O = T.y - f.y);
      } else if (u === n - 1) {
        const T = this.points[n - 2];
        T && (k = f.x - T.x, O = f.y - T.y);
      } else {
        const T = this.points[u - 1], M = this.points[u + 1];
        T && M && (k = M.x - T.x, O = M.y - T.y);
      }
      const C = Math.hypot(k, O) || 1, P = -O / C, S = k / C;
      r.push({ x: f.x + P * y, y: f.y + S * y }), o.push({ x: f.x - P * y, y: f.y - S * y });
    }
    if (r.length === 0) return "";
    const i = this.points[n - 1];
    if (!i) return "";
    const a = e - i.time, l = Math.max(0, 1 - a / this.decayTime), c = this.size / 2 * Math.sin(l * Math.PI / 2), d = [...r];
    if (c >= 0.5 && i) {
      const u = r[r.length - 1], f = o[o.length - 1];
      if (u && f) {
        const h = Math.atan2(u.y - i.y, u.x - i.x);
        let p = Math.atan2(f.y - i.y, f.x - i.x);
        for (; p < h; ) p += Math.PI * 2;
        const m = 6;
        for (let w = 1; w < m; w++) {
          const y = h + (p - h) * w / m;
          d.push({
            x: i.x + Math.cos(y) * c,
            y: i.y + Math.sin(y) * c
          });
        }
      }
    }
    for (let u = o.length - 1; u >= 0; u--) {
      const f = o[u];
      f && d.push(f);
    }
    return m5(d);
  }
}
function m5(t) {
  const e = t.length;
  if (e < 3) return "";
  const n = t[0];
  if (!n) return "";
  let r = `M ${n.x.toFixed(1)},${n.y.toFixed(1)}`;
  for (let o = 0; o < e; o++) {
    const i = t[o], a = t[(o + 1) % e];
    if (!i || !a) continue;
    const l = (i.x + a.x) / 2, c = (i.y + a.y) / 2;
    r += ` Q ${i.x.toFixed(1)},${i.y.toFixed(1)} ${l.toFixed(1)},${c.toFixed(1)}`;
  }
  return r += " Z", r;
}
const v5 = [
  "youtube.com",
  "vimeo.com",
  "loom.com",
  "dailymotion.com",
  "twitch.tv",
  "tiktok.com",
  "streamable.com",
  "ted.com",
  "bilibili.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "giphy.com",
  "open.spotify.com",
  "soundcloud.com",
  "mixcloud.com",
  "podcasts.apple.com",
  "music.apple.com",
  "drive.google.com",
  "docs.google.com",
  "calendar.google.com",
  "google.com (maps)",
  "openstreetmap.org",
  "figma.com",
  "miro.com",
  "excalidraw.com",
  "gist.github.com",
  "codepen.io",
  "codesandbox.io",
  "jsfiddle.net",
  "stackblitz.com",
  "val.town",
  "desmos.com",
  "simplepdf.eu",
  "forms.office.com"
];
function _5(t) {
  const e = ["allow-scripts", "allow-presentation", "allow-forms"];
  return t.kind !== "video" && e.push("allow-popups", "allow-popups-to-escape-sandbox"), t.allowSameOrigin && e.push("allow-same-origin"), e.join(" ");
}
const y5 = "strict-origin-when-cross-origin", b5 = "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
function w5(t, e) {
  try {
    const n = new URL(t.url);
    if (/(^|\.)twitch\.tv$/.test(n.hostname) && e)
      return n.searchParams.set("parent", e), n.toString();
  } catch {
  }
  return t.url;
}
const k5 = 0.75, S5 = 4;
function x5(t) {
  return t.kind !== "video" ? 1 : Math.min(S5, Math.max(k5, t.scale));
}
function tv(t) {
  const e = t.scale > 0 ? t.scale : 1;
  return { width: t.width / e, height: t.height / e };
}
function E5(t) {
  const { width: e, height: n } = tv(t), r = t.scale > 0 ? t.scale : 1, o = t.angle ? ` translate(${e / 2}px, ${n / 2}px) rotate(${t.angle}rad) translate(${-e / 2}px, ${-n / 2}px)` : "";
  return [
    `left:${t.x}px`,
    `top:${t.y}px`,
    `width:${e}px`,
    `height:${n}px`,
    "transform-origin:0 0",
    `transform:scale(${r})${o}`
  ].join(";");
}
function T5(t) {
  const e = x5(t), { width: n, height: r } = tv(t);
  return [
    `width:${n * e}px`,
    `height:${r * e}px`,
    "transform-origin:0 0",
    `transform:scale(${1 / e})`
  ].join(";");
}
function C5(t, e, n) {
  const r = t.x + t.width / 2, o = t.y + t.height / 2, i = Math.cos(-t.angle), a = Math.sin(-t.angle), l = (e - r) * i - (n - o) * a, c = (e - r) * a + (n - o) * i;
  return Math.abs(l) <= t.width / 6 && Math.abs(c) <= t.height / 6;
}
function A5(t, e) {
  return Math.hypot(e.x - t.x, e.y - t.y) <= 4 && e.at - t.at <= 300;
}
function P5(t) {
  return /^https:\/\/www\.youtube\.com\/embed\//.test(t) ? JSON.stringify({ event: "command", func: "playVideo", args: "" }) : /^https:\/\/player\.vimeo\.com\/video\//.test(t) ? JSON.stringify({ method: "play" }) : null;
}
function I5(t, e) {
  const n = new Set(t.map((r) => r.id));
  for (const r of e) n.has(r) || e.delete(r);
  for (const r of t) r.visible !== !1 && e.add(r.id);
  return t.filter((r) => e.has(r.id));
}
function z5(t) {
  try {
    const e = JSON.parse(t);
    return Array.isArray(e) ? e.filter(
      (n) => typeof n == "object" && n !== null && typeof n.id == "string" && typeof n.url == "string" && n.url.length > 0
    ) : [];
  } catch {
    return [];
  }
}
var M5 = /* @__PURE__ */ F('<p class="error-msg svelte-p974y3" role="alert"> </p>'), O5 = /* @__PURE__ */ F('<p class="resolved svelte-p974y3" role="status"> <code class="svelte-p974y3"> </code></p>'), F5 = /* @__PURE__ */ F(`<p class="hint svelte-p974y3">Paste a link — a video, a post, a song, a map, a document or a sandbox — or the embed code a
        site gives you. It is framed on the board and stays live; click its middle to use it.</p>`), R5 = /* @__PURE__ */ F('<div class="modal-backdrop svelte-p974y3" role="dialog" aria-modal="true" aria-labelledby="embed-title"><div class="modal-card svelte-p974y3"><div class="modal-header svelte-p974y3"><h3 id="embed-title" class="svelte-p974y3"> </h3> <button type="button" class="close-btn svelte-p974y3" aria-label="Close dialog">✕</button></div> <input type="url" placeholder="https://www.youtube.com/watch?v=…" aria-label="Link to embed" class="svelte-p974y3"/> <!> <div class="actions svelte-p974y3"><button type="button" class="btn-cancel svelte-p974y3">Cancel</button> <button type="button" class="btn-primary svelte-p974y3"> </button></div></div></div>');
function ph(t, e) {
  ot(e, !0);
  let n = ke(e, "initial", 3, ""), r = /* @__PURE__ */ B(ft(n()));
  const o = /* @__PURE__ */ X(() => n() !== ""), i = /* @__PURE__ */ X(() => s(r).trim() ? e.engine?.resolveEmbed(s(r).trim()) ?? null : null), a = /* @__PURE__ */ X(() => s(r).trim().length > 0 && s(i) === null);
  function l() {
    const R = s(r).trim();
    !R || s(a) || (e.onInsert(R), e.onClose());
  }
  function c(R) {
    R.key === "Enter" && !R.shiftKey && (R.preventDefault(), l());
  }
  function d(R) {
    R.key === "Escape" && (R.preventDefault(), e.onClose());
  }
  let u = /* @__PURE__ */ B(void 0);
  Gt(() => s(u)?.focus());
  var f = R5();
  Qe("keydown", $t, d);
  var h = z(f), p = z(h), m = z(p), w = ae(m, !0), y = b(m, 2), k = b(p, 2);
  Je(k, (R) => _(u, R), () => s(u));
  var O = b(k, 2);
  {
    var C = (R) => {
      var K = M5(), ie = ae(K);
      Y(
        (ne) => le(ie, `That link cannot be embedded. Only these sites are allowed:
        ${ne ?? ""}.`),
        [() => v5.join(", ")]
      ), A(R, K);
    }, P = (R) => {
      var K = O5(), ie = z(K), ne = b(ie), $ = ae(ne, !0);
      Y(() => {
        le(ie, `${s(i).kind === "video" ? "Video" : "Page"} · embeds as `), le($, s(i).url);
      }), A(R, K);
    }, S = (R) => {
      var K = F5();
      A(R, K);
    };
    j(O, (R) => {
      s(a) ? R(C) : s(i) ? R(P, 1) : R(S, -1);
    });
  }
  var T = b(O, 2), M = z(T), H = b(M, 2), q = ae(H, !0);
  Y(() => {
    le(w, s(o) ? "Change the embedded link" : "Embed a web page"), N(k, "aria-invalid", s(a)), H.disabled = !s(i), le(q, s(o) ? "Save" : "Embed");
  }), I("click", y, function(...R) {
    e.onClose?.apply(this, R);
  }), I("keydown", k, c), Zi(k, () => s(r), (R) => _(r, R)), I("click", M, function(...R) {
    e.onClose?.apply(this, R);
  }), I("click", H, l), A(t, f), it();
}
ct(["click", "keydown"]);
const nv = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-icon",
  "image/avif",
  "image/jfif"
], L5 = nv.join(","), rv = 4 * 1024 * 1024;
function Tu(t) {
  return nv.includes(t.toLowerCase());
}
function D5(t) {
  return Number.isFinite(t) && t >= 0 && t <= rv;
}
function N5(t) {
  return Tu(t.type) ? D5(t.size) ? null : "size" : "type";
}
function Cl(t) {
  switch (t) {
    case "type":
      return "That file is not an image Hydrawn can read.";
    case "size":
      return `Images must be under ${Math.round(rv / (1024 * 1024))} MB.`;
    case "decode":
      return "That image could not be read.";
  }
}
const ov = 1440;
function iv(t, e, n = ov) {
  const r = Math.max(t, e);
  if (!(r > n) || !Number.isFinite(r)) return { width: t, height: e };
  const o = n / r;
  return {
    width: Math.max(1, Math.round(t * o)),
    height: Math.max(1, Math.round(e * o))
  };
}
function mh(t, e, n) {
  const r = t.toLowerCase();
  return r !== "image/svg+xml" && r !== "image/gif" && Math.max(e, n) > ov;
}
function B5(t, e) {
  return t.size < e.size ? t : e;
}
async function U5(t, e) {
  if (!Tu(t.type)) return { rejection: "type" };
  const n = await e(t), r = N5(n);
  return r ? { rejection: r } : { file: n };
}
async function j5(t) {
  if (!mh(t.type, 1 / 0, 1 / 0) || typeof createImageBitmap != "function" || typeof document > "u") return t;
  try {
    const e = await createImageBitmap(t), { width: n, height: r } = e;
    if (!mh(t.type, n, r))
      return e.close(), t;
    const o = iv(n, r), i = document.createElement("canvas");
    i.width = o.width, i.height = o.height;
    const a = i.getContext("2d");
    if (!a)
      return e.close(), t;
    a.imageSmoothingQuality = "high", a.drawImage(e, 0, 0, o.width, o.height), e.close();
    const l = (u) => new Promise((f) => i.toBlob(f, u, 0.9));
    let c = await l(t.type);
    if (c && c.type !== t.type) {
      const u = await l("image/webp");
      u && u.type === "image/webp" && u.size < c.size && (c = u);
    }
    if (!c) return t;
    const d = new File([c], t.name, { type: c.type || t.type });
    return B5(d, t);
  } catch {
    return t;
  }
}
function vh(t) {
  return t.filter((e) => Tu(e.type));
}
async function H5(t) {
  const e = await new Promise((n) => {
    const r = new FileReader();
    r.onload = () => n(typeof r.result == "string" ? r.result : null), r.onerror = () => n(null), r.readAsDataURL(t);
  });
  return e ? await new Promise((n) => {
    const r = new Image();
    r.onload = () => n({
      dataUrl: e,
      // An SVG with no intrinsic size reports 0. Falling back to its box keeps it
      // placeable instead of silently refused, which is what a 0 would cause.
      naturalWidth: r.naturalWidth || r.width,
      naturalHeight: r.naturalHeight || r.height
    }), r.onerror = () => n(null), r.src = e;
  }) : null;
}
const sv = "live";
function W5(t) {
  return `boards/${t}/live`;
}
function Z5(t) {
  return `boards/${t}/*`;
}
function K5(t, e) {
  const n = new URL(t || "/ws", e);
  return n.protocol === "http:" ? n.protocol = "ws:" : n.protocol === "https:" ? n.protocol = "wss:" : n.protocol !== "ws:" && n.protocol !== "wss:" && (n.protocol = e.startsWith("https") ? "wss:" : "ws:"), n.hash = "", n.search = "", (!n.pathname || n.pathname === "/") && (n.pathname = "/ws"), n.toString();
}
function V5(t) {
  return JSON.stringify({ type: "AUTH", token: t });
}
function J5(t) {
  return JSON.stringify({
    type: "SUBSCRIBE",
    sub_id: sv,
    topic: Z5(t)
  });
}
function _h(t, e, n) {
  return JSON.stringify({
    type: "PUBLISH",
    topic: W5(t),
    event_type: e,
    payload: n
  });
}
function G5() {
  return JSON.stringify({ type: "PING" });
}
function q5(t) {
  if (!t || typeof t != "object") return null;
  const e = t;
  return e.type !== "EVENT" || !e.event || typeof e.event != "object" ? null : e.event.payload ?? null;
}
function Y5(t) {
  return !!(t && typeof t == "object" && t.type === "AUTH_OK");
}
function X5(t) {
  if (!t || typeof t != "object") return !1;
  const e = t;
  return e.type === "SUBSCRIBED" && e.sub_id === sv;
}
function hc(t) {
  return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in t && t.BYTES_PER_ELEMENT === 1;
}
const gc = (t) => t ? `"${t}" ` : "";
function pc(t, e = "") {
  if (typeof t != "number")
    throw new TypeError(gc(e) + "expected number, got " + typeof t);
  if (!Number.isSafeInteger(t) || t < 0)
    throw new RangeError(gc(e) + "expected integer >= 0, got " + t);
  return t;
}
function Xt(t, e, n = "") {
  if (hc(t) && (e === void 0 || t.length === e))
    return t;
  e !== void 0 && pc(e, "length");
  const r = hc(t), o = e !== void 0 ? ` of length ${e}` : "", i = r ? `length=${t.length}` : `type=${typeof t}`, a = gc(n) + "expected Uint8Array" + o + ", got " + i;
  throw r ? new RangeError(a) : new TypeError(a);
}
function yh(t, e = !0) {
  if (t.destroyed)
    throw new Error("hash was destroyed");
  if (e && t.finished)
    throw new Error("digest() was already called");
}
function Q5(t, e) {
  Xt(t, void 0, "output");
  const n = e.outputLen;
  if (!(t.length >= n))
    throw new RangeError('"output" expected length >= ' + n);
}
function $5(t, e) {
  if (Q5(t, e), !Ri(t))
    throw new Error("invalid output, must be aligned");
}
function e8(t) {
  return new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
}
function ro(t) {
  return new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4));
}
function Fr(...t) {
  for (let e = 0; e < t.length; e++)
    t[e].fill(0);
}
function _a(t) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength);
}
const ya = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function av(t) {
  return t << 24 & 4278190080 | t << 8 & 16711680 | t >>> 8 & 65280 | t >>> 24 & 255;
}
const Bt = ya ? (t) => t : (t) => av(t) >>> 0;
function t8(t) {
  for (let e = 0; e < t.length; e++)
    t[e] = av(t[e]);
  return t;
}
const Cu = ya ? (t) => t : t8;
function n8(t, e) {
  if (t = Xt(t), e = Xt(e), t.length !== e.length)
    return !1;
  let n = 0;
  for (let r = 0; r < t.length; r++)
    n |= t[r] ^ e[r];
  return n === 0;
}
function r8(t, e, n) {
  const r = e, o = n || (() => []), i = (l, c) => r(c, ...o(l)).update(l).digest(), a = r(new Uint8Array(t), ...o(new Uint8Array(0)));
  return i.outputLen = a.outputLen, i.blockLen = a.blockLen, i.create = (l, ...c) => r(l, ...c), i;
}
const o8 = /* @__NO_SIDE_EFFECTS__ */ (t, e) => {
  function n(r, ...o) {
    if (Xt(r, void 0, "key"), t.nonceLength !== void 0) {
      const f = o[0];
      Xt(f, t.varSizeNonce ? void 0 : t.nonceLength, "nonce");
    }
    const i = t.tagLength, a = t.nonceLength !== void 0 ? 1 : 0;
    if (!t.withAAD) {
      for (let f = a; f < o.length; f++)
        if (hc(o[f]))
          throw new Error("AAD not supported");
    }
    t.withAAD && o[a] !== void 0 && Xt(o[a], void 0, "AAD");
    const l = e(r, ...o), c = (f, h) => {
      if (h !== void 0) {
        if (f !== 2)
          throw new Error("cipher output not supported");
        Xt(h, void 0, "output");
      }
    };
    let d = !1;
    return {
      encrypt(f, h) {
        if (d)
          throw new Error("cannot encrypt() twice with same key + nonce");
        return d = !0, Xt(f, void 0, "data"), c(l.encrypt.length, h), l.encrypt(f, h);
      },
      decrypt(f, h) {
        if (Xt(f, void 0, "data"), i && f.length < i)
          throw new Error('"ciphertext" expected length >= tagLength=' + i);
        return c(l.decrypt.length, h), l.decrypt(f, h);
      }
    };
  }
  return Object.assign(n, t), n;
};
function i8(t, e, n = !0) {
  if (e === void 0)
    return new Uint8Array(t);
  if (Xt(e, t, "output"), n && !Ri(e))
    throw new Error("invalid output, must be aligned");
  return e;
}
function s8(t, e, n) {
  pc(t), pc(e);
  const r = new Uint8Array(16), o = _a(r);
  return o.setBigUint64(0, BigInt(e), n), o.setBigUint64(8, BigInt(t), n), r;
}
function Ri(t) {
  return t.byteOffset % 4 === 0;
}
function Li(t) {
  return Uint8Array.from(Xt(t));
}
const Jr = 16, lv = /* @__PURE__ */ new Uint8Array(16), ii = /* @__PURE__ */ ro(lv), a8 = 225, l8 = (t, e, n, r) => {
  const o = r & 1;
  return {
    s3: n << 31 | r >>> 1,
    s2: e << 31 | n >>> 1,
    s1: t << 31 | e >>> 1,
    // NIST SP 800-38D §6.3 applies `V >> 1` and XORs R on carry. In this
    // 4x32-bit split, R = 0xe1 || 0^120 lives in the top byte of s0.
    s0: t >>> 1 ^ a8 << 24 & -(o & 1)
    // reduce % poly
  };
}, ms = (t) => (t >>> 0 & 255) << 24 | (t >>> 8 & 255) << 16 | (t >>> 16 & 255) << 8 | t >>> 24 & 255 | 0, c8 = (t) => t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2;
class u8 {
  blockLen = Jr;
  outputLen = Jr;
  s0 = 0;
  s1 = 0;
  s2 = 0;
  s3 = 0;
  finished = !1;
  destroyed = !1;
  t;
  W;
  windowSize;
  // We select bits per window adaptively based on expectedLength
  constructor(e, n) {
    Xt(e, 16, "key"), e = Li(e);
    const r = _a(e);
    let o = r.getUint32(0, !1), i = r.getUint32(4, !1), a = r.getUint32(8, !1), l = r.getUint32(12, !1);
    const c = [];
    for (let m = 0; m < 128; m++)
      c.push({ s0: ms(o), s1: ms(i), s2: ms(a), s3: ms(l) }), { s0: o, s1: i, s2: a, s3: l } = l8(o, i, a, l);
    const d = c8(n || 1024);
    if (![1, 2, 4, 8].includes(d))
      throw new Error("ghash: invalid window size, expected 2, 4 or 8");
    this.W = d;
    const f = 128 / d, h = this.windowSize = 2 ** d, p = [];
    for (let m = 0; m < f; m++)
      for (let w = 0; w < h; w++) {
        let y = 0, k = 0, O = 0, C = 0;
        for (let P = 0; P < d; P++) {
          if (!(w >>> d - P - 1 & 1))
            continue;
          const { s0: T, s1: M, s2: H, s3: q } = c[d * m + P];
          y ^= T, k ^= M, O ^= H, C ^= q;
        }
        p.push({ s0: y, s1: k, s2: O, s3: C });
      }
    this.t = p;
  }
  _updateBlock(e, n, r, o) {
    e ^= this.s0, n ^= this.s1, r ^= this.s2, o ^= this.s3;
    const { W: i, t: a, windowSize: l } = this;
    let c = 0, d = 0, u = 0, f = 0;
    const h = (1 << i) - 1;
    let p = 0;
    for (const m of [e, n, r, o])
      for (let w = 0; w < 4; w++) {
        const y = m >>> 8 * w & 255;
        for (let k = 8 / i - 1; k >= 0; k--) {
          const O = y >>> i * k & h, { s0: C, s1: P, s2: S, s3: T } = a[p * l + O];
          c ^= C, d ^= P, u ^= S, f ^= T, p += 1;
        }
      }
    this.s0 = c, this.s1 = d, this.s2 = u, this.s3 = f;
  }
  update(e) {
    yh(this), Xt(e), e = Li(e);
    const n = ro(e), r = Math.floor(e.length / Jr), o = e.length % Jr;
    for (let i = 0; i < r; i++)
      this._updateBlock(Bt(n[i * 4 + 0]), Bt(n[i * 4 + 1]), Bt(n[i * 4 + 2]), Bt(n[i * 4 + 3]));
    return o && (lv.set(e.subarray(r * Jr)), this._updateBlock(Bt(ii[0]), Bt(ii[1]), Bt(ii[2]), Bt(ii[3])), Fr(ii)), this;
  }
  destroy() {
    this.destroyed = !0;
    const { t: e } = this;
    for (const n of e)
      n.s0 = 0, n.s1 = 0, n.s2 = 0, n.s3 = 0;
  }
  digestInto(e) {
    yh(this), $5(e, this), this.finished = !0;
    const { s0: n, s1: r, s2: o, s3: i } = this, a = ro(e);
    a[0] = n, a[1] = r, a[2] = o, a[3] = i, ya || Cu(a.subarray(0, Jr / 4));
  }
  digest() {
    const e = new Uint8Array(Jr);
    return this.digestInto(e), this.destroy(), e;
  }
}
const bh = /* @__PURE__ */ r8(16, (t, e) => new u8(t, e), (t) => [t.length]), mc = 16, d8 = 4, vs = /* @__PURE__ */ new Uint8Array(mc), f8 = 283;
function h8(t) {
  if (![16, 24, 32].includes(t.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + t.length);
}
function Au(t) {
  return t << 1 ^ f8 & -(t >> 7);
}
function wh(t, e) {
  let n = 0;
  for (; e > 0; e >>= 1)
    n ^= t & -(e & 1), t = Au(t);
  return n;
}
const g8 = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256);
  for (let n = 0, r = 1; n < 256; n++, r ^= Au(r))
    t[n] = r;
  const e = new Uint8Array(256);
  e[0] = 99;
  for (let n = 0; n < 255; n++) {
    let r = t[255 - n];
    r |= r << 8, e[t[n]] = (r ^ r >> 4 ^ r >> 5 ^ r >> 6 ^ r >> 7 ^ 99) & 255;
  }
  return Fr(t), e;
})(), p8 = (t) => t << 24 | t >>> 8, Al = (t) => t << 8 | t >>> 24;
function m8(t, e) {
  if (t.length !== 256)
    throw new Error("wrong sbox length");
  const n = new Uint32Array(256).map((d, u) => e(t[u])), r = n.map(Al), o = r.map(Al), i = o.map(Al), a = new Uint32Array(256 * 256), l = new Uint32Array(256 * 256), c = new Uint16Array(256 * 256);
  for (let d = 0; d < 256; d++)
    for (let u = 0; u < 256; u++) {
      const f = d * 256 + u;
      a[f] = n[d] ^ r[u], l[f] = o[d] ^ i[u], c[f] = t[d] << 8 | t[u];
    }
  return { sbox: t, sbox2: c, T0: n, T1: r, T2: o, T3: i, T01: a, T23: l };
}
const cv = /* @__PURE__ */ m8(g8, (t) => wh(t, 3) << 24 | t << 16 | t << 8 | wh(t, 2)), v8 = /* @__PURE__ */ (() => {
  const t = new Uint8Array(16);
  for (let e = 0, n = 1; e < 16; e++, n = Au(n))
    t[e] = n;
  return t;
})();
function _8(t) {
  Xt(t);
  const e = t.length;
  h8(t);
  const { sbox2: n } = cv, r = [];
  (!ya || !Ri(t)) && r.push(t = Li(t));
  const o = Cu(ro(t)), i = o.length, a = (c) => yi(n, c, c, c, c), l = new Uint32Array(e + 28);
  l.set(o);
  for (let c = i; c < l.length; c++) {
    let d = l[c - 1];
    c % i === 0 ? d = a(p8(d)) ^ v8[c / i - 1] : i > 6 && c % i === 4 && (d = a(d)), l[c] = l[c - i] ^ d;
  }
  return Fr(...r), l;
}
function _s(t, e, n, r, o, i) {
  return t[n << 8 & 65280 | r >>> 8 & 255] ^ e[o >>> 8 & 65280 | i >>> 24 & 255];
}
function yi(t, e, n, r, o) {
  return t[e & 255 | n & 65280] | t[r >>> 16 & 255 | o >>> 16 & 65280] << 16;
}
function kh(t, e, n, r, o) {
  const { sbox2: i, T01: a, T23: l } = cv;
  let c = 0;
  e ^= t[c++], n ^= t[c++], r ^= t[c++], o ^= t[c++];
  const d = t.length / 4 - 2;
  for (let m = 0; m < d; m++) {
    const w = t[c++] ^ _s(a, l, e, n, r, o), y = t[c++] ^ _s(a, l, n, r, o, e), k = t[c++] ^ _s(a, l, r, o, e, n), O = t[c++] ^ _s(a, l, o, e, n, r);
    e = w, n = y, r = k, o = O;
  }
  const u = t[c++] ^ yi(i, e, n, r, o), f = t[c++] ^ yi(i, n, r, o, e), h = t[c++] ^ yi(i, r, o, e, n), p = t[c++] ^ yi(i, o, e, n, r);
  return { s0: u, s1: f, s2: h, s3: p };
}
function ys(t, e, n, r, o) {
  Xt(n, mc, "nonce"), Xt(r), o = i8(r.length, o);
  const i = n, a = ro(i), l = _a(i), c = ro(r), d = ro(o), u = e ? 0 : 12, f = r.length;
  let h = l.getUint32(u, e);
  for (let m = 0; m + 4 <= c.length; m += 4) {
    const { s0: w, s1: y, s2: k, s3: O } = kh(t, Bt(a[0]), Bt(a[1]), Bt(a[2]), Bt(a[3]));
    d[m + 0] = c[m + 0] ^ Bt(w), d[m + 1] = c[m + 1] ^ Bt(y), d[m + 2] = c[m + 2] ^ Bt(k), d[m + 3] = c[m + 3] ^ Bt(O), h = h + 1 >>> 0, l.setUint32(u, h, e);
  }
  const p = mc * Math.floor(c.length / d8);
  if (p < f) {
    const { s0: m, s1: w, s2: y, s3: k } = kh(t, Bt(a[0]), Bt(a[1]), Bt(a[2]), Bt(a[3])), O = new Uint32Array([m, w, y, k]);
    Cu(O);
    const C = e8(O);
    for (let P = p, S = 0; P < f; P++, S++)
      o[P] = r[P] ^ C[S];
    Fr(O);
  }
  return o;
}
function y8(t, e, n, r, o) {
  const i = o ? o.length : 0, a = t.create(n, r.length + i);
  o && a.update(o);
  const l = s8(8 * r.length, 8 * i, e);
  a.update(r), a.update(l);
  const c = a.digest();
  return Fr(l), c;
}
const uv = /* @__PURE__ */ o8({ blockSize: 16, nonceLength: 12, tagLength: 16, withAAD: !0, varSizeNonce: !0 }, function(e, n, r) {
  if (n.length < 8)
    throw new Error("aes/gcm: invalid nonce length");
  const o = 16;
  function i(l, c, d) {
    const u = y8(bh, !1, l, d, r);
    for (let f = 0; f < c.length; f++)
      u[f] ^= c[f];
    return u;
  }
  function a() {
    const l = _8(e), c = vs.slice(), d = vs.slice();
    if (ys(l, !1, d, d, c), n.length === 12)
      d.set(n);
    else {
      const f = vs.slice();
      _a(f).setBigUint64(8, BigInt(n.length * 8), !1);
      const p = bh.create(c).update(n).update(f);
      p.digestInto(d), p.destroy();
    }
    const u = ys(l, !1, d, vs);
    return { xk: l, authKey: c, counter: d, tagMask: u };
  }
  return {
    encrypt(l) {
      const { xk: c, authKey: d, counter: u, tagMask: f } = a(), h = new Uint8Array(l.length + o), p = [c, d, u, f];
      Ri(l) || p.push(l = Li(l)), ys(c, !1, u, l, h.subarray(0, l.length));
      const m = i(d, f, h.subarray(0, h.length - o));
      return p.push(m), h.set(m, l.length), Fr(...p), h;
    },
    decrypt(l) {
      const { xk: c, authKey: d, counter: u, tagMask: f } = a(), h = [c, d, f, u];
      Ri(l) || h.push(l = Li(l));
      const p = l.subarray(0, -o), m = l.subarray(-o), w = i(d, f, p);
      if (h.push(w), !n8(w, m))
        throw Fr(...h), new Error("aes-gcm: invalid tag");
      const y = ys(c, !1, u, p);
      return Fr(...h), y;
    }
  };
});
function Sh(t) {
  return t instanceof Uint8Array || ArrayBuffer.isView(t) && t.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in t && t.BYTES_PER_ELEMENT === 1;
}
const vc = (t) => t ? `"${t}" ` : "";
function _c(t, e = "") {
  if (typeof t != "number")
    throw new TypeError(vc(e) + "expected number, got " + typeof t);
  if (!Number.isSafeInteger(t) || t < 0)
    throw new RangeError(vc(e) + "expected integer >= 0, got " + t);
  return t;
}
function Di(t, e, n = "") {
  if (Sh(t) && e === void 0)
    return t;
  const r = Sh(t), o = "", i = r ? `length=${t.length}` : `type=${typeof t}`, a = vc(n) + "expected Uint8Array" + o + ", got " + i;
  throw r ? new RangeError(a) : new TypeError(a);
}
function Pu(t) {
  if (typeof t != "function" || typeof t.create != "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  if (_c(t.outputLen), _c(t.blockLen), t.outputLen < 1 || t.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
const b8 = (t, e) => {
  if (t === null || typeof t != "object" || Array.isArray(t))
    throw new TypeError((e === "object" ? "" : `"${e}" `) + "expected object, got type=" + typeof t);
}, xh = (t, e) => {
  b8(t, e);
  const n = Object.getPrototypeOf(t);
  if (n !== Object.prototype && n !== null)
    throw new TypeError(`"${e}" expected plain object`);
  if (Object.hasOwn(t, "__proto__"))
    throw new TypeError(`"${e}.__proto__" is not allowed`);
};
function $s(t, e = !0) {
  if (t.destroyed)
    throw new Error("hash was destroyed");
  if (e && t.finished)
    throw new Error("digest() was already called");
}
function dv(t, e) {
  Di(t, void 0, "output");
  const n = e.outputLen;
  if (!(t.length >= n))
    throw new RangeError('"output" expected length >= ' + n);
}
function Qr(...t) {
  for (let e = 0; e < t.length; e++)
    t[e].fill(0);
}
function Pl(t) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength);
}
function Wn(t, e) {
  return t << 32 - e | t >>> e;
}
function w8(t, e, n = "opts") {
  return xh(t, "defaults"), e !== void 0 && xh(e, n), Object.assign(/* @__PURE__ */ Object.create(null), t, e);
}
function k8(t, e = {}) {
  if (typeof t != "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof t);
  e = w8({}, e, "info");
  const n = (o, i) => t(i).update(o).digest(), r = t(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (o) => t(o), Object.assign(n, e), Object.freeze(n);
}
const S8 = (t) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, t])
});
class Eh {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(e, n) {
    if (Pu(e), Di(n, void 0, "key"), this.iHash = e.create(), typeof this.iHash.update != "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, o = new Uint8Array(r);
    o.set(n.length > r ? e.create().update(n).digest() : n);
    for (let i = 0; i < o.length; i++)
      o[i] ^= 54;
    this.iHash.update(o), this.oHash = e.create();
    for (let i = 0; i < o.length; i++)
      o[i] ^= 106;
    this.oHash.update(o), Qr(o);
  }
  update(e) {
    return $s(this), this.iHash.update(e), this;
  }
  digestInto(e) {
    $s(this), dv(e, this), this.finished = !0;
    const n = e.subarray(0, this.outputLen);
    this.iHash.digestInto(n), this.oHash.update(n), this.oHash.digestInto(n), this.destroy();
  }
  digest() {
    const e = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(e), e;
  }
  _cloneInto(e) {
    e ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash: n, iHash: r, finished: o, destroyed: i, blockLen: a, outputLen: l, canXOF: c } = this;
    return e = e, e.finished = o, e.destroyed = i, e.blockLen = a, e.outputLen = l, e.canXOF = c, e.oHash = n._cloneInto(e.oHash), e.iHash = r._cloneInto(e.iHash), e;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Iu = /* @__PURE__ */ (() => {
  const t = ((e, n, r) => new Eh(e, n).update(r).digest());
  return t.create = (e, n) => new Eh(e, n), t;
})(), si = /* @__PURE__ */ Uint8Array.of(0), x8 = /* @__PURE__ */ Uint8Array.of();
function E8(t, e, n, r = 32, o) {
  Pu(t), _c(r, "length"), Di(e, void 0, "prk");
  const i = t.outputLen;
  if (e.length < i)
    throw new Error('"prk" must be at least HashLen octets');
  if (r > 255 * i)
    throw new Error("Length must be <= 255*HashLen");
  const a = Math.ceil(r / i);
  if (n === void 0 ? n = x8 : Di(n, void 0, "info"), !a)
    return o && Qr(e), new Uint8Array();
  const l = o && a === 1 ? e : new Uint8Array(a * i), { iHash: c, oHash: d } = Iu.create(t, e), u = o ? e : new Uint8Array(i), f = a > 1 ? o?.iHash || t.create() : void 0;
  for (let p = 0; p < a - 1; p++) {
    si[0] = p + 1;
    const m = c._cloneInto(f);
    p && m.update(u), m.update(n).update(si).digestInto(u), d._cloneInto(f).update(u).digestInto(u), l.set(u, i * p);
  }
  if (si[0] = a, a > 1 && c.update(u), c.update(n).update(si).digestInto(u), d.update(u).digestInto(u), l.set(u, i * (a - 1)), c.destroy(), d.destroy(), f?.destroy(), u !== l && Qr(u), Qr(si), r === l.length)
    return l;
  const h = l.slice(0, r);
  return Qr(l), h;
}
const zu = (t, e, n, r, o) => {
  Pu(t), n === void 0 && (n = new Uint8Array(t.outputLen));
  const i = Iu.create(t, n).update(e);
  return E8(t, i.digest(), r, o, i);
}, T8 = (t) => t / 2 ** 32 | 0, C8 = (t) => t >>> 0;
function A8(t, e, n, r) {
  const o = T8(n), i = C8(n);
  t.setUint32(e, r ? i : o, r), t.setUint32(e + 4, r ? o : i, r);
}
function P8(t, e, n) {
  return t & e ^ ~t & n;
}
function I8(t, e, n) {
  return t & e ^ t & n ^ e & n;
}
class z8 {
  blockLen;
  outputLen;
  canXOF = !1;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = !1;
  length = 0;
  pos = 0;
  destroyed = !1;
  constructor(e, n, r, o) {
    this.blockLen = e, this.outputLen = n, this.padOffset = r, this.isLE = o, this.buffer = new Uint8Array(e), this.view = Pl(this.buffer);
  }
  update(e) {
    $s(this), Di(e);
    const { view: n, buffer: r, blockLen: o } = this, i = e.length;
    let a = !1;
    for (let l = 0; l < i; ) {
      const c = Math.min(o - this.pos, i - l);
      if (c === o) {
        const d = Pl(e);
        for (; o <= i - l; l += o)
          this.process(d, l);
        a = !0;
        continue;
      }
      r.set(l === 0 && c === i ? e : e.subarray(l, l + c), this.pos), this.pos += c, l += c, this.pos === o && (this.process(n, 0), this.pos = 0, a = !0);
    }
    return this.length += e.length, a && this.roundClean(), this;
  }
  digestInto(e) {
    $s(this), dv(e, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: o, isLE: i } = this;
    let { pos: a } = this;
    n[a++] = 128, n.fill(0, a), this.padOffset > o - a && (this.process(r, 0), n.fill(0)), A8(r, o - 8, this.length * 8, i), this.process(r, 0), this.roundClean();
    const l = e === n ? r : Pl(e), c = this.outputLen, d = c / 4, u = this.get();
    if (c % 4 || d > u.length)
      throw new Error("invalid outputLen");
    for (let f = 0; f < d; f++)
      l.setUint32(4 * f, u[f], i);
  }
  digest() {
    const { buffer: e, outputLen: n } = this;
    this.digestInto(e);
    const r = e.slice(0, n);
    return this.destroy(), r;
  }
  _cloneIntoMeta(e) {
    const { buffer: n, length: r, finished: o, destroyed: i, pos: a } = this;
    return e.destroyed = i, e.finished = o, e.length = r, e.pos = a, a && e.buffer.set(n), e;
  }
  clone() {
    return this._cloneInto();
  }
}
const M8 = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), O8 = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), Tr = /* @__PURE__ */ new Uint32Array(64);
class F8 extends z8 {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(e, n) {
    super(64, e, 8, !1), this.A = n[0] | 0, this.B = n[1] | 0, this.C = n[2] | 0, this.D = n[3] | 0, this.E = n[4] | 0, this.F = n[5] | 0, this.G = n[6] | 0, this.H = n[7] | 0;
  }
  get() {
    const { A: e, B: n, C: r, D: o, E: i, F: a, G: l, H: c } = this;
    return [e, n, r, o, i, a, l, c];
  }
  // prettier-ignore
  set(e, n, r, o, i, a, l, c) {
    this.A = e | 0, this.B = n | 0, this.C = r | 0, this.D = o | 0, this.E = i | 0, this.F = a | 0, this.G = l | 0, this.H = c | 0;
  }
  _cloneInto(e) {
    return (e ||= new this.constructor()).set(...this.get()), this._cloneIntoMeta(e);
  }
  process(e, n) {
    for (let f = 0; f < 16; f++, n += 4)
      Tr[f] = e.getUint32(n, !1);
    for (let f = 16; f < 64; f++) {
      const h = Tr[f - 15], p = Tr[f - 2], m = Wn(h, 7) ^ Wn(h, 18) ^ h >>> 3, w = Wn(p, 17) ^ Wn(p, 19) ^ p >>> 10;
      Tr[f] = w + Tr[f - 7] + m + Tr[f - 16] | 0;
    }
    let { A: r, B: o, C: i, D: a, E: l, F: c, G: d, H: u } = this;
    for (let f = 0; f < 64; f++) {
      const h = Wn(l, 6) ^ Wn(l, 11) ^ Wn(l, 25), p = u + h + P8(l, c, d) + O8[f] + Tr[f] | 0, w = (Wn(r, 2) ^ Wn(r, 13) ^ Wn(r, 22)) + I8(r, o, i) | 0;
      u = d, d = c, c = l, l = a + p | 0, a = i, i = o, o = r, r = p + w | 0;
    }
    r = r + this.A | 0, o = o + this.B | 0, i = i + this.C | 0, a = a + this.D | 0, l = l + this.E | 0, c = c + this.F | 0, d = d + this.G | 0, u = u + this.H | 0, this.set(r, o, i, a, l, c, d, u);
  }
  roundClean() {
    Qr(Tr);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), Qr(this.buffer);
  }
}
class R8 extends F8 {
  constructor() {
    super(32, M8);
  }
}
const ba = /* @__PURE__ */ k8(
  () => new R8(),
  /* @__PURE__ */ S8(1)
), bi = "room", fv = "drawnosaurus-live-v1", Wo = 32, Rr = 12, Mu = 1, L8 = "hydrawn-store-write-v1", D8 = "hydrawn-store-picture-v1", ea = new TextEncoder();
function N8() {
  const t = new Uint8Array(Wo);
  return crypto.getRandomValues(t), t;
}
function hv(t, e = "") {
  const n = Ni(t), r = new URLSearchParams(yv(e));
  r.delete(bi), r.set(bi, n);
  const o = [];
  let i = null;
  for (const [l, c] of r.entries()) {
    if (l === bi) {
      i = c;
      continue;
    }
    o.push(`${encodeURIComponent(l)}=${encodeURIComponent(c)}`);
  }
  if (i === null)
    throw new Error("room key missing after format");
  return `#${[...o, `${bi}=${i}`].join("&")}`;
}
function gv(t) {
  const n = new URLSearchParams(yv(t)).get(bi);
  if (!n) return null;
  try {
    const r = yc(n);
    return r.byteLength !== Wo ? null : r;
  } catch {
    return null;
  }
}
const B8 = "drawnosaurus:roomKey:", wa = () => globalThis.crypto?.subtle ?? void 0;
async function U8(t) {
  const e = ea.encode(`drawnosaurus-board:${t}`), n = ea.encode(`${fv}:board-room`), r = wa();
  if (!r)
    return zu(ba, e, new Uint8Array(), n, Wo);
  const o = await r.importKey("raw", e, "HKDF", !1, ["deriveBits"]), i = await r.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: n },
    o,
    Wo * 8
  );
  return new Uint8Array(i);
}
function j8(t, e) {
  if (!(typeof localStorage > "u" || !t))
    try {
      localStorage.setItem(`${B8}${t}`, Ni(e));
    } catch {
    }
}
function H8(t, e) {
  const n = hv(e, t.hash);
  typeof history < "u" && history.replaceState(null, "", `${t.pathname}${t.search}${n}`);
}
async function W8(t, e) {
  const n = await U8(t);
  j8(t, n);
  const r = gv(e.hash);
  return (!r || !Z8(r, n)) && H8(e, n), n;
}
function Z8(t, e) {
  if (t.byteLength !== e.byteLength) return !1;
  let n = 0;
  for (let r = 0; r < t.byteLength; r++) n |= t[r] ^ e[r];
  return n === 0;
}
async function pv(t, e = wa() ?? null) {
  if (t.byteLength !== Wo)
    throw new Error(`room key must be ${Wo} bytes`);
  const n = ea.encode(fv);
  if (!e)
    return { engine: "fallback", key: zu(ba, t, new Uint8Array(), n, 32) };
  const r = jr(t), o = await e.importKey("raw", r, "HKDF", !1, ["deriveKey"]), i = await e.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: n },
    o,
    { name: "AES-GCM", length: 256 },
    !1,
    ["encrypt", "decrypt"]
  );
  return { engine: "webcrypto", subtle: e, key: i };
}
async function mv(t, e, n) {
  return t.engine === "fallback" ? uv(t.key, e).encrypt(n) : new Uint8Array(
    await t.subtle.encrypt(
      { name: "AES-GCM", iv: jr(e) },
      t.key,
      jr(n)
    )
  );
}
async function vv(t, e, n) {
  try {
    return t.engine === "fallback" ? uv(t.key, e).decrypt(n) : new Uint8Array(
      await t.subtle.decrypt(
        { name: "AES-GCM", iv: jr(e) },
        t.key,
        jr(n)
      )
    );
  } catch {
    return null;
  }
}
async function K8(t, e) {
  const n = crypto.getRandomValues(new Uint8Array(Rr));
  return {
    v: Mu,
    iv: Ni(n),
    ct: Ni(await mv(t, n, e))
  };
}
async function V8(t, e) {
  if (e.v !== Mu || !e.iv || !e.ct)
    return null;
  let n, r;
  try {
    n = yc(e.iv), r = yc(e.ct);
  } catch {
    return null;
  }
  return n.byteLength !== Rr || r.byteLength === 0 ? null : vv(t, n, r);
}
async function Th(t, e) {
  const n = crypto.getRandomValues(new Uint8Array(Rr)), r = await mv(t, n, e), o = new Uint8Array(Rr + r.byteLength);
  return o.set(n), o.set(r, Rr), o;
}
async function Ch(t, e) {
  return e.byteLength < Rr + 16 ? null : vv(t, e.subarray(0, Rr), e.subarray(Rr));
}
async function _v(t, e, n) {
  const r = ea.encode(e);
  if (!n) return zu(ba, t, new Uint8Array(), r, 32);
  const o = await n.importKey("raw", jr(t), "HKDF", !1, ["deriveBits"]), i = await n.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: r },
    o,
    256
  );
  return new Uint8Array(i);
}
async function J8(t, e = wa() ?? null) {
  return Ni(await _v(t, L8, e));
}
async function G8(t, e, n = wa() ?? null) {
  const r = await _v(t, D8, n);
  let o;
  if (n) {
    const i = await n.importKey(
      "raw",
      jr(r),
      { name: "HMAC", hash: "SHA-256" },
      !1,
      ["sign"]
    );
    o = new Uint8Array(await n.sign("HMAC", i, jr(e)));
  } else
    o = Iu(ba, r, e);
  return Array.from(o.subarray(0, 16), (i) => i.toString(16).padStart(2, "0")).join("");
}
function Ah(t) {
  if (!t || typeof t != "object") return !1;
  const e = t;
  return e.v === Mu && typeof e.iv == "string" && typeof e.ct == "string";
}
function yv(t) {
  return t.startsWith("#") ? t.slice(1) : t;
}
function jr(t) {
  const e = new Uint8Array(t.byteLength);
  return e.set(t), e.buffer;
}
function Ni(t) {
  let e = "";
  for (const n of t)
    e += String.fromCharCode(n);
  return btoa(e).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function yc(t) {
  if (!/^[A-Za-z0-9_-]*$/.test(t))
    throw new Error("invalid base64url");
  const e = t + "=".repeat((4 - t.length % 4) % 4), n = atob(e.replace(/-/g, "+").replace(/_/g, "/")), r = new Uint8Array(n.length);
  for (let o = 0; o < n.length; o++)
    r[o] = n.charCodeAt(o);
  return r;
}
const Ph = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599"], q8 = new TextEncoder(), Y8 = new TextDecoder(), X8 = 45e3, Q8 = 1e4, $8 = 15e3, e7 = 500, t7 = 15e3, n7 = "dev", r7 = 5e3, o7 = 1e4, i7 = 256 * 1024;
function s7() {
  if (typeof window > "u")
    return { clientId: "ssr", name: "Guest", color: "#1971c2" };
  const t = `user_${Math.random().toString(36).slice(2, 11)}`;
  let e = sessionStorage.getItem("drawnosaurus:userName");
  e || (e = `Dino ${Math.floor(Math.random() * 900 + 100)}`, sessionStorage.setItem("drawnosaurus:userName", e));
  const n = Math.abs(t.split("").reduce((r, o) => r + o.charCodeAt(0), 0)) % Ph.length;
  return { clientId: t, name: e, color: Ph[n] ?? "#1971c2" };
}
class a7 {
  /**
   * @param roomKey When set, every frame is AES-GCM sealed and plaintext inbound is
   * dropped (no downgrade). When null, frames stay JSON plaintext for unkeyed URLs.
   */
  constructor(e, n = null) {
    this.slug = e, this.roomKey = n;
  }
  slug;
  profile = s7();
  ws = null;
  peers = /* @__PURE__ */ new Map();
  listeners = [];
  stateListeners = [];
  /** What this client holds, repeated on every join and heartbeat. */
  claims = {};
  /** The slide this client is presenting, repeated with its presence; `undefined` when
   *  not presenting — `null` is the one slide of a frame-less board. */
  presenting;
  heartbeatTimer = null;
  /**
   * Frames go out in the order they were sent. Sealing is asynchronous, and two seals
   * in flight can finish in either order — a gesture's preview arriving after its end
   * would leave a shape frozen mid-move on everyone else's screen.
   */
  outbound = Promise.resolve();
  patchListeners = [];
  statusListeners = [];
  joinListeners = [];
  storedListeners = [];
  /** True once AUTH+SUBSCRIBE have completed for the current socket. */
  sessionReady = !1;
  roomKey;
  intentionalClose = !1;
  reconnectAttempt = 0;
  reconnectTimer = null;
  peerSweepTimer = null;
  status = "disconnected";
  preferredUrl;
  sync = null;
  /** The server's name for this client's connection (`AUTH_OK.conn_id` or a relay welcome). */
  socketId;
  linkTimer = null;
  /** When the ping in flight was sent, and when anything was last heard. */
  pingSentAt = 0;
  heardAt = 0;
  /** Whether this server answers pings at all: an older one does not. */
  answersPings = !1;
  /** Outbound frames queued until AUTH+SUBSCRIBE completes. */
  pendingOutbound = [];
  get encrypted() {
    return this.roomKey !== null;
  }
  get connectionStatus() {
    return this.status;
  }
  /**
   * The network is back: try now rather than at the end of a backoff that may have grown
   * to fifteen seconds while it was gone.
   */
  onOnline = () => {
    this.intentionalClose || this.ws || (this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.reconnectAttempt = 0, this.openSocket());
  };
  setRoomKey(e) {
    this.roomKey = e;
  }
  /** How to bring someone who joins up to date, and to be brought up to date on joining. */
  setSceneSync(e) {
    this.sync = e;
  }
  connect(e) {
    typeof window > "u" || (this.intentionalClose = !1, this.preferredUrl = e, window.addEventListener("online", this.onOnline), this.openSocket(), this.peerSweepTimer || (this.peerSweepTimer = setInterval(() => this.sweepStalePeers(), Q8)), this.heartbeatTimer || (this.heartbeatTimer = setInterval(() => this.sendPresence(), $8)), this.linkTimer || (this.linkTimer = setInterval(() => this.checkLink(), r7)));
  }
  openSocket() {
    if (this.ws) return;
    const e = this.preferredUrl ?? this.defaultWsUrl();
    this.sessionReady = !1, this.setStatus("connecting");
    try {
      const n = new WebSocket(e);
      this.ws = n, this.socketId = void 0, this.answersPings = !1, this.pingSentAt = 0, n.onopen = () => {
        this.ws === n && (this.reconnectAttempt = 0, this.heardAt = Date.now(), n.send(V5(Q2() || n7)));
      }, n.onmessage = (r) => {
        this.ws === n && (this.heardAt = Date.now(), this.onServerFrame(r.data));
      }, n.onclose = () => {
        this.ws === n && this.lost();
      }, n.onerror = () => {
      };
    } catch {
      this.sessionReady = !1, this.ws = null, this.setStatus("disconnected"), this.intentionalClose || this.scheduleReconnect();
    }
  }
  async onServerFrame(e) {
    if (this.isPong(e)) {
      this.answersPings = !0;
      return;
    }
    let n;
    try {
      n = JSON.parse(e);
    } catch {
      return;
    }
    if (Y5(n)) {
      const o = n.conn_id;
      typeof o == "string" && (this.socketId = o), this.ws?.send(J5(this.slug));
      return;
    }
    if (X5(n)) {
      this.sessionReady = !0, this.setStatus("connected"), this.flushPendingOutbound();
      const o = {
        type: "join",
        clientId: this.profile.clientId,
        name: this.profile.name,
        color: this.profile.color
      };
      this.sync && (o.have = this.sync.inventory()), this.send(o), this.sendPresence();
      return;
    }
    if (this.handleControl(n)) return;
    const r = q5(n);
    r !== null && await this.receivePayload(r);
  }
  /** The link is gone: forget who was here, say so, and try again. */
  lost() {
    this.sessionReady = !1, this.ws = null, this.peers.size > 0 && (this.peers.clear(), this.notifyPeers(), this.notifyState()), this.setStatus("disconnected"), this.intentionalClose || this.scheduleReconnect();
  }
  /** Pings, and gives up on a link that has stopped answering — see `pingFrame`. */
  checkLink() {
    const e = this.ws;
    if (!e || !this.sessionReady || e.readyState !== WebSocket.OPEN) return;
    const n = Date.now(), r = this.pingSentAt > this.heardAt;
    if (r && this.answersPings && n - this.pingSentAt >= o7) {
      e.onopen = e.onmessage = e.onclose = e.onerror = null;
      try {
        e.close();
      } catch {
      }
      this.lost();
      return;
    }
    r || (e.send(G5()), this.pingSentAt = n);
  }
  isPong(e) {
    if (e === '{"type":"pong"}') return !0;
    try {
      const n = JSON.parse(e);
      return n.type === "PONG" || n.type === "pong";
    } catch {
      return !1;
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalClose) return;
    const e = Math.min(e7 * 2 ** this.reconnectAttempt, t7);
    this.reconnectAttempt += 1, this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null, this.openSocket();
    }, e);
  }
  setStatus(e) {
    if (this.status !== e) {
      this.status = e;
      for (const n of this.statusListeners) n(e);
    }
  }
  defaultWsUrl() {
    return K5(X2(), window.location.href);
  }
  /**
   * `tool`/`down` ride along only for the laser (`DrawSurface` passes them while it is
   * the active tool): an ordinary cursor's wire payload is exactly what it was before
   * either existed, which is what keeps this additive rather than a format bump.
   */
  sendCursor(e, n, r = "pointer", o = !1) {
    this.send({
      type: "cursor",
      clientId: this.profile.clientId,
      name: this.profile.name,
      color: this.profile.color,
      x: e,
      y: n,
      ...r === "laser" ? { tool: r, down: o } : {}
    });
  }
  /** Tells `to`, who joined, that the online copy now has what this client had. */
  sendStored(e) {
    this.send({ type: "stored", clientId: this.profile.clientId, to: e });
  }
  sendPatch(e) {
    this.send({
      type: "patch",
      clientId: this.profile.clientId,
      patch: e
    });
  }
  /** Says what this client now holds, and keeps saying it — see `PRESENCE_HEARTBEAT_MS`. */
  setClaims(e) {
    this.claims = e, this.sendPresence();
  }
  get ownClaims() {
    return this.claims;
  }
  sendPresence() {
    const e = {
      type: "presence",
      clientId: this.profile.clientId,
      name: this.profile.name,
      color: this.profile.color,
      claims: this.claims
    };
    this.socketId && (e.socket = this.socketId), this.send(e), this.presenting !== void 0 && this.sendPresentFrame(this.presenting);
  }
  sendPreview(e) {
    this.send({ type: "preview", clientId: this.profile.clientId, elements: e });
  }
  sendPreviewEnd() {
    this.send({ type: "preview-end", clientId: this.profile.clientId });
  }
  /** Announces the slide now showing — the frame's id, or `null` for a frame-less
   *  board's one slide. Call again on every slide change; see `presentation.ts`. */
  sendPresent(e) {
    this.presenting = e, this.sendPresentFrame(e);
  }
  sendPresentFrame(e) {
    this.send({
      type: "present",
      clientId: this.profile.clientId,
      name: this.profile.name,
      color: this.profile.color,
      frameId: e
    });
  }
  sendPresentEnd() {
    this.presenting = void 0, this.send({ type: "present-end", clientId: this.profile.clientId });
  }
  send(e) {
    const n = this.ws;
    if (!n || !this.sessionReady || n.readyState !== WebSocket.OPEN)
      return (e.type === "join" || e.type === "leave" || e.type === "cursor" || e.type === "presence") && (this.pendingOutbound = this.pendingOutbound.filter((o) => o.type !== e.type)), this.pendingOutbound.push(e), this.pendingOutbound.length > 64 && (this.pendingOutbound = this.pendingOutbound.slice(-48)), Promise.resolve();
    if ((e.type === "cursor" || e.type === "preview") && n.bufferedAmount > i7)
      return Promise.resolve();
    const r = this.encodeOutbound(e);
    return this.outbound = this.outbound.then(async () => {
      const o = await r;
      if (o === null || n.readyState !== WebSocket.OPEN || !this.sessionReady) return;
      let i;
      try {
        i = JSON.parse(o);
      } catch {
        return;
      }
      n.send(_h(this.slug, e.type, i));
    }), this.outbound;
  }
  async flushPendingOutbound() {
    const e = this.pendingOutbound;
    this.pendingOutbound = [];
    for (const n of e)
      await this.send(n);
  }
  /**
   * Collab payload as it appears inside PUBLISH / EVENT (object, not a double-encoded string).
   * Tests stringify this to assert ciphertext has no plaintext markers.
   */
  async encodeOutbound(e) {
    const n = await this.encodePayload(e);
    return n === null ? null : JSON.stringify(n);
  }
  async encodePayload(e) {
    if (!this.roomKey) return e;
    try {
      return await K8(this.roomKey, q8.encode(JSON.stringify(e)));
    } catch {
      return null;
    }
  }
  /** Accept a collab payload (sealed envelope or plaintext message). */
  async receiveFrame(e) {
    if (this.isPong(e)) {
      this.answersPings = !0;
      return;
    }
    let n;
    try {
      n = JSON.parse(e);
    } catch {
      return;
    }
    this.handleControl(n) || await this.receivePayload(n);
  }
  async receivePayload(e) {
    if (this.roomKey) {
      if (!Ah(e))
        return;
      const n = await V8(this.roomKey, e);
      if (!n) return;
      try {
        const r = JSON.parse(Y8.decode(n));
        this.handleMessage(r);
      } catch {
      }
      return;
    }
    Ah(e) || this.handleMessage(e);
  }
  /** `welcome` and `gone` — from a test relay, or mirrored when AUTH_OK names the socket. */
  handleControl(e) {
    if (typeof e != "object" || e === null || "clientId" in e) return !1;
    const { type: n, socket: r } = e;
    if (typeof r != "string") return !1;
    if (n === "welcome")
      return this.socketId = r, this.sendPresence(), !0;
    if (n === "gone") {
      let o = !1;
      for (const [i, a] of this.peers)
        a.socket === r && (this.peers.delete(i), o = !0);
      return o && (this.notifyPeers(), this.notifyState()), !0;
    }
    return !1;
  }
  handleMessage(e) {
    if (e.clientId !== this.profile.clientId)
      if (e.type === "cursor")
        this.upsertPeer(e.clientId, {
          name: e.name,
          color: e.color,
          x: e.x,
          y: e.y,
          pointed: !0,
          tool: e.tool ?? "pointer",
          down: e.down ?? !1
        }), this.notifyPeers();
      else if (e.type === "join")
        this.upsertPeer(e.clientId, Ih({ name: e.name, color: e.color }, e.socket)), this.notifyPeers(), this.notifyState(), this.sendPresence(), e.have && this.sync && this.send({
          type: "sync",
          clientId: this.profile.clientId,
          to: e.clientId,
          elements: this.sync.missing(e.have),
          have: this.sync.inventory()
        }), this.joinListeners.forEach((n) => n(e.clientId));
      else if (e.type === "sync") {
        if (e.to !== this.profile.clientId) return;
        if (Array.isArray(e.elements) && e.elements.length > 0) {
          const n = { elements: e.elements };
          this.patchListeners.forEach((r) => r(n));
        }
        if (e.have && this.sync) {
          const n = this.sync.missing(e.have);
          n.length > 0 && this.sendPatch({ elements: n });
        }
      } else if (e.type === "presence")
        this.upsertPeer(
          e.clientId,
          Ih({ name: e.name, color: e.color, claims: e.claims ?? {} }, e.socket)
        ), this.notifyPeers(), this.notifyState();
      else if (e.type === "preview") {
        if (!Array.isArray(e.elements)) return;
        this.upsertPeer(e.clientId, { preview: e.elements }), this.notifyState();
      } else if (e.type === "preview-end") {
        const n = this.peers.get(e.clientId);
        if (!n?.preview) return;
        delete n.preview, this.notifyState();
      } else if (e.type === "present") {
        if (e.frameId !== null && typeof e.frameId != "string") return;
        this.upsertPeer(e.clientId, { name: e.name, color: e.color, presenting: e.frameId }), this.notifyState();
      } else if (e.type === "present-end") {
        const n = this.peers.get(e.clientId);
        if (n?.presenting === void 0) return;
        delete n.presenting, this.notifyState();
      } else e.type === "patch" ? this.patchListeners.forEach((n) => n(e.patch)) : e.type === "stored" ? e.to === this.profile.clientId && this.storedListeners.forEach((n) => n(e.clientId)) : e.type === "leave" && (this.peers.delete(e.clientId), this.notifyPeers(), this.notifyState());
  }
  /** Updates what is known of a peer, meeting them first if need be. Any word from them is a sign of life. */
  upsertPeer(e, n) {
    const o = this.peers.get(e) ?? {
      clientId: e,
      name: "Guest",
      color: "#1971c2",
      x: 0,
      y: 0,
      lastActive: 0,
      claims: {}
    };
    Object.assign(o, n, { lastActive: Date.now() }), this.peers.set(e, o);
  }
  sweepStalePeers() {
    const e = Date.now() - X8;
    let n = !1;
    for (const [r, o] of this.peers)
      o.lastActive < e && (this.peers.delete(r), n = !0);
    n && (this.notifyPeers(), this.notifyState());
  }
  onPeers(e) {
    return this.listeners.push(e), e(Array.from(this.peers.values())), () => {
      this.listeners = this.listeners.filter((n) => n !== e);
    };
  }
  /**
   * Called when what a peer holds or is doing changes — not on every cursor move, which
   * `onPeers` reports sixty times a second and which the engine has no use for.
   */
  onPeerState(e) {
    return this.stateListeners.push(e), e(Array.from(this.peers.values())), () => {
      this.stateListeners = this.stateListeners.filter((n) => n !== e);
    };
  }
  onRemotePatch(e) {
    return this.patchListeners.push(e), () => {
      this.patchListeners = this.patchListeners.filter((n) => n !== e);
    };
  }
  /** Someone joined — not this client's own join, echoed back. */
  onJoin(e) {
    return this.joinListeners.push(e), () => {
      this.joinListeners = this.joinListeners.filter((n) => n !== e);
    };
  }
  /** A peer says the online copy now has what it had for this client: `from`, its id. */
  onStored(e) {
    return this.storedListeners.push(e), () => {
      this.storedListeners = this.storedListeners.filter((n) => n !== e);
    };
  }
  onStatus(e) {
    return this.statusListeners.push(e), e(this.status), () => {
      this.statusListeners = this.statusListeners.filter((n) => n !== e);
    };
  }
  notifyPeers() {
    const e = Array.from(this.peers.values());
    this.listeners.forEach((n) => n(e));
  }
  notifyState() {
    const e = Array.from(this.peers.values());
    this.stateListeners.forEach((n) => n(e));
  }
  disconnect() {
    if (this.intentionalClose = !0, typeof window < "u" && window.removeEventListener("online", this.onOnline), this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.peerSweepTimer && (clearInterval(this.peerSweepTimer), this.peerSweepTimer = null), this.heartbeatTimer && (clearInterval(this.heartbeatTimer), this.heartbeatTimer = null), this.linkTimer && (clearInterval(this.linkTimer), this.linkTimer = null), this.ws) {
      const e = this.ws, n = { type: "leave", clientId: this.profile.clientId };
      this.encodeOutbound(n).then((r) => {
        if (r && e.readyState === WebSocket.OPEN && this.sessionReady)
          try {
            e.send(_h(this.slug, "leave", JSON.parse(r)));
          } catch {
          }
        (e.readyState === WebSocket.OPEN || e.readyState === WebSocket.CONNECTING) && e.close();
      }), this.ws = null;
    }
    this.sessionReady = !1, this.pendingOutbound = [], this.peers.clear(), this.notifyPeers(), this.notifyState(), this.setStatus("disconnected");
  }
}
function Ih(t, e) {
  return typeof e == "string" ? { ...t, socket: e } : t;
}
function l7(t, e) {
  return t.at < e.at || t.at === e.at && t.clientId < e.clientId;
}
function c7(t, e) {
  const n = /* @__PURE__ */ new Map();
  for (const o of [t, ...e])
    for (const [i, a] of Object.entries(o.claims)) {
      const l = { clientId: o.clientId, at: a }, c = n.get(i);
      (!c || l7(l, c)) && n.set(i, l);
    }
  const r = (o, i) => {
    const a = n.get(i);
    return !a || a.clientId === o;
  };
  return e.map((o) => ({
    id: o.clientId,
    name: o.name,
    color: o.color,
    holds: Object.keys(o.claims).filter((i) => r(o.clientId, i)),
    preview: (o.preview ?? []).filter((i) => r(o.clientId, i.id))
  }));
}
function u7(t, e, n) {
  const r = {};
  for (const o of e) r[o] = t[o] ?? n;
  return r;
}
function d7(t) {
  return t <= 4e3 ? 33 : t <= 16e3 ? 50 : t <= 64e3 ? 120 : t <= 256e3 ? 300 : 600;
}
function f7(t, e, n) {
  const r = new Set(e.map((o) => o.clientId));
  for (const o of t)
    o.tool === "laser" && o.down && !r.has(o.clientId) && n(o.clientId, o.color, o.x, o.y, !1);
  for (const o of e)
    o.tool !== "laser" || !o.pointed || n(o.clientId, o.color, o.x, o.y, !!o.down);
}
async function h7({
  browser: t,
  slug: e,
  location: n,
  secret: r
}) {
  return t ? r : W8(e, n);
}
const zh = (t) => {
  const { type: e, isDeleted: n } = t;
  return e === "image" && !n;
}, Mh = (t) => t.dataUrl !== void 0;
function g7(t) {
  return typeof t == "object" && t !== null && t.type === "osidraw-delta";
}
class p7 {
  tracker = new wm();
  /**
   * What peers are sent a diff of. Changed in place and told to the tracker by id, so a
   * send compares what changed and not the board — see `sceneMirror.ts`.
   */
  live = new Sm();
  /**
   * The pictures the room already has, left off what is sent to it — see
   * `autosave/pictures.ts`. Everyone in it loaded the board, or was sent it on joining.
   */
  pictures = new Yc();
  /** Seed from the board load so the first stroke is a diff, not a full dump. */
  reset(e) {
    this.live.replace(e), this.tracker.reset(e), this.pictures.reset(e);
  }
  /**
   * Fold an engine scene event into the mirror and return the patch peers need,
   * or null when nothing changed for collaboration purposes.
   */
  ingest(e, n = Date.now(), r = () => Math.floor(Math.random() * 2147483647)) {
    return this.observe(e) ? this.takePatch(n, r) : null;
  }
  /**
   * Fold an engine scene event into the mirror, without deciding that peers have it.
   *
   * Separate from {@link takePatch} for the time the socket is down. `ingest` marked each
   * change as shared the moment it was diffed, while the send that followed was dropped
   * for want of a connection — so everything drawn offline was never sent at all. Now a
   * change is only taken when it can go, and what piles up offline goes out as one
   * patch on reconnect. Returns false for a payload that is not a scene event.
   */
  observe(e) {
    let n;
    try {
      n = JSON.parse(e);
    } catch {
      return !1;
    }
    return g7(n) ? (this.live.apply(n), this.tracker.noteChanged(n.updated.map((r) => r.id)), this.tracker.noteChanged(n.removed), n.order && this.tracker.noteEverything(), !0) : typeof n == "object" && n !== null && Array.isArray(n.elements) ? (this.live.replace(n.elements), this.tracker.noteEverything(), !0) : !1;
  }
  /**
   * What peers do not have yet, marked as theirs. Null when they have everything.
   *
   * Without the pictures they already have: moving a photo sent the photo to everyone,
   * every time.
   */
  takePatch(e = Date.now(), n = () => Math.floor(Math.random() * 2147483647)) {
    const r = this.tracker.diff(this.live.elements, e, n, this.live.lookup);
    if (!r) return null;
    this.tracker.acknowledge(r);
    const o = this.pictures.strip(r.elements);
    return this.pictures.note(r.elements), r.order ? { elements: o, order: r.order } : { elements: o };
  }
  /**
   * A peer's elements, each image that came without its picture given the one here: its
   * sender left it off because the room had it.
   */
  withPictures(e) {
    return lp(e, this.live.lookup);
  }
  /** What this client has — see {@link Inventory}. Call after sending what is pending. */
  inventory() {
    const e = {};
    for (const n of this.tracker.knownElements()) {
      const r = [n.version, n.versionNonce];
      zh(n) && r.push(Mh(n) ? 1 : 0), e[n.id] = r;
    }
    return e;
  }
  /**
   * What a peer with `have` lacks: whatever they have not got, or have an older copy
   * of, or have without its picture — whole, pictures included. Deletions only of what
   * they have. Call after sending what is pending, so it is all known here.
   */
  missing(e) {
    const n = [];
    for (const r of this.tracker.knownElements()) {
      const o = e[r.id];
      if (!o) {
        r.isDeleted || n.push(r);
        continue;
      }
      const [i = 0, a = 0, l] = o, c = r.version > i || r.version === i && r.versionNonce > a, d = l === 0 && zh(r) && Mh(r);
      (c || d) && n.push(r);
    }
    return n;
  }
  /**
   * Apply a peer's patch to the local mirror without producing an outbound patch —
   * otherwise we would echo their edit straight back.
   */
  adoptRemote(e) {
    if (this.pictures.note(e.elements), e.order) {
      const n = new Map(this.live.elements.map((o) => [o.id, o]));
      for (const o of e.elements) n.set(o.id, o);
      const r = [];
      for (const o of e.order) {
        const i = n.get(o);
        i && (r.push(i), n.delete(o));
      }
      for (const o of n.values()) r.push(o);
      this.live.replace(r);
    } else
      this.live.apply({ updated: e.elements, removed: [] });
    this.tracker.acknowledge(e);
  }
  get snapshot() {
    return this.live.elements;
  }
}
function m7(t) {
  if (t.order && t.order.length > 0) {
    const e = new Map(t.elements.filter((r) => !r.isDeleted).map((r) => [r.id, r])), n = t.order.map((r) => e.get(r)).filter((r) => r !== void 0);
    for (const r of e.values())
      n.includes(r) || n.push(r);
    return JSON.stringify({ type: "osidraw", version: 1, elements: n });
  }
  return JSON.stringify({
    type: "osidraw-delta",
    updated: t.elements.filter((e) => !e.isDeleted),
    removed: t.elements.filter((e) => e.isDeleted).map((e) => e.id)
  });
}
function v7(t) {
  return t === "saving" ? "Saving…" : t === "pending" ? "Unsaved changes" : t === "error" ? "Save failed — retrying" : t === "too-large" ? "Not saved — board over 16 MB" : t === "refused" ? "Not saved — refused by the server" : t === "unread" ? "Not loaded — this browser could not read it" : "Saved";
}
function _7(t) {
  return t === "error" || t === "too-large" || t === "refused" || t === "unread";
}
function y7(t, e) {
  return e && t === "idle" ? "unread" : t;
}
function b7(t, e) {
  return t === "connected" ? null : e.everConnected ? "Connection lost — reconnecting…" : e.everFailed || t === "disconnected" ? "Live collaboration offline — retrying" : null;
}
async function w7(t, e, n) {
  const r = await t.secret(e);
  if (r) return r;
  const o = gv(n);
  return o && await t.keepSecret(e, o), o;
}
const k7 = (t, e, n) => `${t.replace(/\/$/, "")}/boards/${e}${hv(n)}`, S7 = (t, e) => {
  if (t === null || e === null) return t === e;
  if (t.byteLength !== e.byteLength) return !1;
  let n = 0;
  for (let r = 0; r < t.byteLength; r++) n |= t[r] ^ e[r];
  return n === 0;
}, Oh = {
  idle: "Shared copy saved",
  pending: "Shared copy: unsaved changes",
  saving: "Saving the shared copy…",
  error: "Shared copy unavailable — retrying",
  "too-large": "Shared copy not saved — over 10 MB",
  refused: "Shared copy not saved — this link cannot write it",
  unread: "Shared copy unavailable — could not be read",
  unsent: "Shared copy may lack the last seconds before the tab closed"
};
function x7(t, { unread: e, unsent: n }) {
  return t === "too-large" || t === "refused" || t === "error" ? t : e ? "unread" : n ? "unsent" : t;
}
const Ou = (t) => `hydrawn:unsent:${t}`;
function Fu(t, e) {
  try {
    return t();
  } catch {
    return e;
  }
}
const E7 = (t, e) => Fu(() => t?.setItem(Ou(e), "1"), void 0), Fh = (t, e) => Fu(() => t?.removeItem(Ou(e)), void 0), Rh = (t, e) => Fu(() => t?.getItem(Ou(e)) === "1", !1), T7 = 48, Ru = 180, C7 = 28;
function A7(t) {
  const e = t.chips > 0 ? t.chips + t.gap : 0, n = t.chips > 0 ? t.gap + C7 : 0, r = Math.min(t.title, T7), o = (t.viewport - t.toolbar) / 2 - t.margin, i = t.leftFixed + r + n, a = t.right, l = o < Math.max(i, a), c = l ? t.viewport - 2 * t.margin - t.right - t.gap : o;
  let d = c - t.leftFixed - e, u = !1;
  return d < r && e > 0 && (u = !0, d = c - t.leftFixed - n), {
    toolbarOwnRow: l,
    titleMaxWidth: Math.max(0, Math.min(Ru, Math.round(d))),
    foldChips: u
  };
}
var P7 = /* @__PURE__ */ F('<input type="text" class="title-input svelte-ysb7vk" aria-label="Edit board title"/>'), I7 = /* @__PURE__ */ F('<button type="button" class="board-title-btn svelte-ysb7vk" title="Click to rename"><span class="board-title svelte-ysb7vk"> </span></button>'), Lh = /* @__PURE__ */ F('<span class="dot-pulse svelte-ysb7vk"></span>'), z7 = /* @__PURE__ */ F('<span class="save-status live-status trouble svelte-ysb7vk" aria-live="polite" aria-label="Live collaboration"><span class="dot-offline svelte-ysb7vk"></span> </span>'), M7 = /* @__PURE__ */ F('<span class="save-status shared-status svelte-ysb7vk" aria-live="polite" aria-label="Shared copy"> </span>'), O7 = /* @__PURE__ */ F('<span class="dot-offline svelte-ysb7vk"></span>'), F7 = /* @__PURE__ */ F('<span class="dot-quiet svelte-ysb7vk"></span>'), R7 = /* @__PURE__ */ F('<span aria-live="polite"><!> <span class="folded-words svelte-ysb7vk"> </span></span>'), L7 = /* @__PURE__ */ F('<button type="button" class="share-btn svelte-ysb7vk" aria-label="Share &amp; collaborate" title="Live Collaboration"><svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> <span>Share</span></button>'), D7 = /* @__PURE__ */ F('<header class="draw-header svelte-ysb7vk" aria-label="Canvas header"><div class="left-group svelte-ysb7vk"><div class="menu-anchor svelte-ysb7vk"><button type="button" class="menu-btn svelte-ysb7vk" aria-label="Open main menu" aria-haspopup="menu" title="Main menu"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg></button> <!></div> <!> <div><span aria-live="polite" aria-label="Save status"><!> </span> <!> <!></div> <!></div> <div class="right-group svelte-ysb7vk"><!> <button type="button" class="help-btn svelte-ysb7vk" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button></div></header>');
function N7(t, e) {
  ot(e, !0);
  let n = ke(e, "title", 3, "Untitled"), r = ke(e, "status", 3, "idle"), o = ke(e, "live", 3, null), i = ke(e, "shared", 3, null), a = ke(e, "toolbarWidth", 3, 0), l = ke(e, "phone", 3, !1), c = /* @__PURE__ */ B(!1), d = /* @__PURE__ */ B("");
  function u() {
    _(d, n()), _(c, !0);
  }
  function f() {
    if (!s(c)) return;
    _(c, !1);
    const Q = s(d).trim();
    Q && Q !== n() && e.onRename?.(Q);
  }
  function h(Q) {
    Q.key === "Enter" ? f() : Q.key === "Escape" && _(c, !1);
  }
  const p = /* @__PURE__ */ X(() => v7(r())), m = /* @__PURE__ */ X(() => _7(r()));
  let w = /* @__PURE__ */ B(ft({
    toolbarOwnRow: !1,
    titleMaxWidth: Ru,
    foldChips: !1
  })), y = /* @__PURE__ */ B(void 0), k = /* @__PURE__ */ B(void 0), O = /* @__PURE__ */ B(void 0), C = /* @__PURE__ */ B(void 0), P = /* @__PURE__ */ B(void 0), S = /* @__PURE__ */ B(void 0), T = /* @__PURE__ */ B(void 0);
  function M() {
    if (l() || !s(y) || !s(k) || !s(O) || !s(C) || !s(P) || !s(S) || !s(T))
      return;
    const Q = Math.max(0, s(C).offsetLeft - (s(O).offsetLeft + s(O).offsetWidth)), de = Math.max(0, s(C).offsetWidth - s(P).offsetWidth), me = A7({
      toolbar: a(),
      leftFixed: s(O).offsetWidth + Q + de,
      title: s(P).scrollWidth,
      chips: s(S).offsetWidth,
      right: s(T).offsetWidth,
      gap: Q,
      margin: s(y).offsetLeft,
      viewport: window.innerWidth
    });
    _(w, me, !0), e.onPlan?.(me);
  }
  bt(() => {
    n(), r(), o(), i(), a(), l(), M();
  });
  const H = /* @__PURE__ */ X(() => [
    s(p),
    o(),
    i() ? Oh[i()] : null
  ].filter((Q) => !!Q).join(" · "));
  var q = D7();
  Qe("resize", $t, M);
  var R = z(q), K = z(R), ie = z(K), ne = b(ie, 2);
  tm(ne, () => e.menu ?? Mi), Je(K, (Q) => _(O, Q), () => s(O));
  var $ = b(K, 2);
  {
    var G = (Q) => {
      var de = P7();
      ou(de, !0);
      let me;
      Y(() => me = ht(de, "", me, {
        "max-width": l() ? void 0 : `${s(w).titleMaxWidth}px`
      })), Qe("blur", de, f), I("keydown", de, h), Zi(de, () => s(d), (Pe) => _(d, Pe)), A(Q, de);
    }, W = (Q) => {
      var de = I7(), me = z(de);
      let Pe;
      var Ie = ae(me, !0);
      Je(me, (Ke) => _(P, Ke), () => s(P)), Je(de, (Ke) => _(C, Ke), () => s(C)), Y(() => {
        Pe = ht(me, "", Pe, {
          "max-width": l() ? void 0 : `${s(w).titleMaxWidth}px`
        }), le(Ie, n());
      }), I("click", de, u), A(Q, de);
    };
    j($, (Q) => {
      s(c) ? Q(G) : Q(W, -1);
    });
  }
  var J = b($, 2);
  let E;
  var L = z(J);
  let V;
  var ee = z(L);
  {
    var ge = (Q) => {
      var de = Lh();
      A(Q, de);
    };
    j(ee, (Q) => {
      r() === "saving" && Q(ge);
    });
  }
  var re = b(ee), se = b(L, 2);
  {
    var xe = (Q) => {
      var de = z7(), me = b(z(de));
      Y(() => le(me, ` ${o() ?? ""}`)), A(Q, de);
    };
    j(se, (Q) => {
      o() && Q(xe);
    });
  }
  var be = b(se, 2);
  {
    var Me = (Q) => {
      var de = M7(), me = ae(de, !0);
      Y(() => le(me, Oh[i()])), A(Q, de);
    };
    j(be, (Q) => {
      i() && Q(Me);
    });
  }
  Je(J, (Q) => _(S, Q), () => s(S));
  var Re = b(J, 2);
  {
    var Se = (Q) => {
      var de = R7();
      let me;
      var Pe = z(de);
      {
        var Ie = (Ve) => {
          var dt = Lh();
          A(Ve, dt);
        }, Ke = (Ve) => {
          var dt = O7();
          A(Ve, dt);
        }, De = (Ve) => {
          var dt = F7();
          A(Ve, dt);
        };
        j(Pe, (Ve) => {
          r() === "saving" ? Ve(Ie) : s(m) ? Ve(Ke, 1) : Ve(De, -1);
        });
      }
      var We = b(Pe, 2), Ge = ae(We, !0);
      Y(() => {
        me = Ce(de, 1, "save-status folded-status svelte-ysb7vk", null, me, { trouble: s(m) }), N(de, "aria-label", s(H)), N(de, "title", s(H)), le(Ge, s(H));
      }), A(Q, de);
    };
    j(Re, (Q) => {
      s(w).foldChips && Q(Se);
    });
  }
  Je(R, (Q) => _(k, Q), () => s(k));
  var Z = b(R, 2), _e = z(Z);
  {
    var ve = (Q) => {
      var de = L7();
      I("click", de, function(...me) {
        e.onOpenShare?.apply(this, me);
      }), A(Q, de);
    };
    j(_e, (Q) => {
      e.onOpenShare && Q(ve);
    });
  }
  var Le = b(_e, 2);
  Je(Z, (Q) => _(T, Q), () => s(T)), Je(q, (Q) => _(y, Q), () => s(y)), Y(() => {
    E = Ce(J, 1, "chips svelte-ysb7vk", null, E, { folded: s(w).foldChips }), V = Ce(L, 1, "save-status svelte-ysb7vk", null, V, { saving: r() === "saving", trouble: s(m) }), le(re, ` ${s(p) ?? ""}`);
  }), I("click", ie, function(...Q) {
    e.onToggleMenu?.apply(this, Q);
  }), I("click", Le, function(...Q) {
    e.onOpenShortcuts?.apply(this, Q);
  }), A(t, q), it();
}
ct(["click", "keydown"]);
const B7 = {}, bc = "dev";
function U7(t) {
  const e = (n) => typeof n == "string" && n.trim() !== "" && n !== "unknown" ? n.trim() : bc;
  return { app: e(t.VITE_BUILD_APP_SHA), engine: e(t.VITE_BUILD_ENGINE_SHA) };
}
function j7(t) {
  return t.app === bc && t.engine === bc ? "live source (make dev)" : `app ${t.app} · engine ${t.engine}`;
}
const H7 = U7(B7);
function Pi(t, e) {
  const n = URL.createObjectURL(e), r = document.createElement("a");
  r.href = n, r.download = t, r.click(), URL.revokeObjectURL(n);
}
var W7 = /* @__PURE__ */ mr('<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" class="svelte-1k0zi6s"><path></path></svg>'), Z7 = /* @__PURE__ */ mr("<path></path>"), K7 = /* @__PURE__ */ mr('<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="svelte-1k0zi6s"></svg>');
function En(t, e) {
  const n = {
    folder: "m9.257 6.351.183.183H15.819c.34 0 .727.182 1.051.506.323.323.505.708.505 1.05v5.819c0 .316-.183.7-.52 1.035-.337.338-.723.522-1.037.522H4.182c-.352 0-.74-.181-1.058-.5-.318-.318-.499-.705-.499-1.057V5.182c0-.351.181-.736.5-1.054.32-.321.71-.503 1.057-.503H6.53l2.726 2.726Z",
    disk: "M3.333 14.167v1.666c0 .92.747 1.667 1.667 1.667h10c.92 0 1.667-.746 1.667-1.667v-1.666M5.833 9.167 10 13.333l4.167-4.166M10 3.333v10",
    trash: "M3.333 5.833h13.334M8.333 9.167v5M11.667 9.167v5M4.167 5.833l.833 10c0 .92.746 1.667 1.667 1.667h6.666c.92 0 1.667-.746 1.667-1.667l.833-10M7.5 5.833v-2.5c0-.46.373-.833.833-.833h3.334c.46 0 .833.373.833.833v2.5",
    sun: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 4.167V2.5M14.167 5.833l1.166-1.166M15.833 10H17.5M14.167 14.167l1.166 1.166M10 15.833V17.5M5.833 14.167l-1.166 1.166M5 10H3.333M5.833 5.833 4.667 4.667",
    // Four rounded squares, for "My drawings" — the oracle has no gallery to borrow from.
    gallery: "M4.167 3.333h3.333c.46 0 .833.373.833.834V7.5c0 .46-.373.833-.833.833H4.167a.833.833 0 0 1-.834-.833V4.167c0-.46.373-.834.834-.834ZM12.5 3.333h3.333c.46 0 .834.373.834.834V7.5c0 .46-.374.833-.834.833H12.5a.833.833 0 0 1-.833-.833V4.167c0-.46.373-.834.833-.834ZM4.167 11.667h3.333c.46 0 .833.373.833.833v3.333c0 .46-.373.834-.833.834H4.167a.833.833 0 0 1-.834-.834V12.5c0-.46.373-.833.834-.833ZM12.5 11.667h3.333c.46 0 .834.373.834.833v3.333c0 .46-.374.834-.834.834H12.5a.833.833 0 0 1-.833-.834V12.5c0-.46.373-.833.833-.833Z",
    moon: "M10 2.5h.328a6.25 6.25 0 0 0 6.6 10.372A7.5 7.5 0 1 1 10 2.493V2.5Z"
  }, r = {
    image: {
      width: 1.25,
      paths: [
        "M15 8h.01",
        "M12 20h-5a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v5",
        "M4 15l4 -4c.928 -.893 2.072 -.893 3 0l4 4",
        "M14 14l1 -1c.617 -.593 1.328 -.793 2.009 -.598",
        "M19 16v6",
        "M22 19l-3 3l-3 -3"
      ]
    },
    diagram: {
      width: 1.25,
      paths: [
        "M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        "M4 6l8 0",
        "M16 6l4 0",
        "M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        "M4 12l2 0",
        "M10 12l10 0",
        "M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        "M4 18l11 0",
        "M19 18l1 0"
      ]
    },
    collab: {
      width: 1.5,
      paths: [
        "M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
        "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2",
        "M16 3.13a4 4 0 0 1 0 7.75",
        "M21 21v-2a4 4 0 0 0 -3 -3.85"
      ]
    },
    help: {
      width: 1.5,
      paths: [
        "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
        "M12 17v.01",
        "M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"
      ]
    },
    system: {
      width: 1.5,
      paths: [
        "M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1v-10z",
        "M7 20h10M9 16v4M15 16v4"
      ]
    },
    // Tabler's `player-play`, for "Present" — not from the oracle, which has no such
    // feature; picked because it is the shape every presentation tool already uses.
    play: { width: 1.5, paths: ["M7 4v16l13 -8z"] },
    // Tabler's `route`, for "Presentation path": two stops and the way between them.
    route: {
      width: 1.5,
      paths: [
        "M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
        "M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z",
        "M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"
      ]
    }
  }, o = /* @__PURE__ */ X(() => n[e.name]), i = /* @__PURE__ */ X(() => r[e.name]);
  var a = on(), l = Ue(a);
  {
    var c = (u) => {
      var f = W7(), h = ae(f);
      Y(() => N(h, "d", s(o))), A(u, f);
    }, d = (u) => {
      var f = K7();
      Ze(f, 20, () => s(i).paths, (h) => h, (h, p) => {
        var m = Z7();
        Y(() => N(m, "d", p)), A(h, m);
      }), Y(() => N(f, "stroke-width", s(i).width)), A(u, f);
    };
    j(l, (u) => {
      s(o) ? u(c) : s(i) && u(d, 1);
    });
  }
  A(t, a);
}
async function V7(t, e, n, r) {
  const o = new Uint8Array(await t.arrayBuffer()), i = e.restoreFromImage(o);
  return "restored" in i && i.restored || e.loadScene(J7(o, n, r)) ? "restored" : "not-a-drawing";
}
function J7(t, e, n) {
  const r = new TextDecoder().decode(t);
  return _m(r, e, n) ?? r;
}
const G7 = {
  open: "Ctrl+O",
  save: "Ctrl+S",
  export: "Ctrl+Shift+E",
  present: "Ctrl+Alt+P",
  help: "?",
  snap: "Alt+S"
};
function q7(t) {
  return t === "phone" ? {} : G7;
}
var Y7 = /* @__PURE__ */ F('<a><!> <span class="dropdown-menu-item__text svelte-uens9z">My drawings</span></a>'), _o = /* @__PURE__ */ F('<span class="dropdown-menu-item__shortcut svelte-uens9z"> </span>'), X7 = /* @__PURE__ */ F('<button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Live collaboration…</span></button>'), Q7 = /* @__PURE__ */ F('<button type="button" role="radio"><!></button>'), $7 = /* @__PURE__ */ F('<button type="button" role="radio"> </button>'), eE = /* @__PURE__ */ F('<div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Snap to grid</span> <button type="button" role="switch" aria-label="Snap to grid"><span class="knob svelte-uens9z"></span></button></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Grid size</span> <div class="RadioGroup svelte-uens9z" role="radiogroup" aria-label="Grid size"></div></div>', 1), tE = /* @__PURE__ */ F('<button type="button" role="radio"></button>'), nE = /* @__PURE__ */ F('<input type="file" accept=".osidraw,.json,.excalidraw" hidden=""/> <div class="dropdown-menu main-menu svelte-uens9z" role="menu" aria-orientation="vertical" aria-label="Main menu" tabindex="-1"><div class="dropdown-menu-container svelte-uens9z"><!> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Open</span> <!></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Save to disk</span> <!></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Export image…</span> <!></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Mermaid to diagram…</span></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Templates…</span></button> <!> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Present</span> <!></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Presentation path…</span></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Keyboard shortcuts</span> <!></button> <button type="button" role="menuitem" class="dropdown-menu-item svelte-uens9z"><!> <span class="dropdown-menu-item__text svelte-uens9z">Reset the canvas</span></button> <div class="dropdown-menu-separator svelte-uens9z" role="separator"></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Theme</span> <div class="RadioGroup svelte-uens9z" role="radiogroup" aria-label="Theme"></div></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Snap to objects</span> <!> <button type="button" role="switch" aria-label="Snap to objects"><span class="knob svelte-uens9z"></span></button></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Focus while typing</span> <button type="button" role="switch" aria-label="Focus while typing"><span class="knob svelte-uens9z"></span></button></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Dynamic size</span> <button type="button" role="switch" aria-label="Dynamic size"><span class="knob svelte-uens9z"></span></button></div> <div class="dropdown-menu-item-bare svelte-uens9z"><span class="dropdown-menu-item__text svelte-uens9z">Show grid</span> <button type="button" role="switch" aria-label="Show grid"><span class="knob svelte-uens9z"></span></button></div> <!> <div class="dropdown-menu-separator svelte-uens9z" role="separator"></div> <div class="dropdown-menu-item-custom svelte-uens9z"><div class="menu-section-label svelte-uens9z">Canvas background</div> <div class="swatches svelte-uens9z" role="radiogroup" aria-label="Canvas background"></div></div> <div class="dropdown-menu-separator svelte-uens9z" role="separator"></div> <div class="build-stamp svelte-uens9z" data-testid="build-stamp"> </div></div></div>', 1);
function rE(t, e) {
  ot(e, !0);
  let n = ke(e, "formFactor", 3, "desktop"), r = ke(e, "themePreference", 3, "light"), o = ke(e, "canvasBackground", 3, null), i = ke(e, "objectsSnap", 3, !1), a = ke(e, "dynamicSize", 3, !0), l = ke(e, "focusModeEnabled", 3, !0);
  const { galleryHref: c } = bm();
  let d, u;
  Gt(() => yn(u));
  function f(he) {
    he(), e.onClose();
  }
  function h() {
    d?.click();
  }
  async function p(he) {
    const D = he.target.files?.[0];
    if (!D || !e.engine) return;
    const oe = () => Math.floor(Math.random() * 2147483647);
    if (await V7(D, e.engine, Date.now(), oe) === "not-a-drawing") {
      alert("Could not load that file — it is not a drawing this app understands.");
      return;
    }
    e.onClose();
  }
  function m() {
    e.engine && Pi("drawing.osidraw", new Blob([e.engine.exportJson()], { type: "application/json" }));
  }
  function w() {
    confirm("Reset the canvas? This clears the drawing and cannot be undone.") && e.engine?.clear();
  }
  function y(he) {
    const D = [...u?.querySelectorAll("[role='menuitem']") ?? []];
    if (D.length === 0) return;
    const oe = D.indexOf(Ur(u).activeElement);
    if (he.key === "ArrowDown" || he.key === "ArrowUp") {
      he.preventDefault();
      const Oe = he.key === "ArrowDown" ? 1 : -1, ce = oe < 0 ? Oe > 0 ? 0 : D.length - 1 : (oe + Oe + D.length) % D.length;
      D[ce]?.focus();
    } else he.key === "Home" ? (he.preventDefault(), D[0]?.focus()) : he.key === "End" && (he.preventDefault(), D[D.length - 1]?.focus());
  }
  const k = [
    { value: "light", icon: "sun", label: "Light" },
    { value: "dark", icon: "moon", label: "Dark" },
    { value: "system", icon: "system", label: "System" }
  ], O = /* @__PURE__ */ X(() => q7(n()));
  var C = { openFile: h }, P = nE();
  Qe("pointerdown", $t, (he) => {
    u && !u.contains(vr(he)) && e.onClose();
  });
  var S = Ue(P);
  Je(S, (he) => d = he, () => d);
  var T = b(S, 2), M = z(T), H = z(M);
  {
    var q = (he) => {
      var D = Y7();
      U3(
        D,
        () => ({
          role: "menuitem",
          class: "dropdown-menu-item",
          href: c
        }),
        void 0,
        void 0,
        void 0,
        "svelte-uens9z"
      );
      var oe = z(D);
      En(oe, { name: "gallery" }), A(he, D);
    };
    j(H, (he) => {
      c !== void 0 && he(q);
    });
  }
  var R = b(H, 2), K = z(R);
  En(K, { name: "folder" });
  var ie = b(K, 4);
  {
    var ne = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).open)), A(he, D);
    };
    j(ie, (he) => {
      s(O).open && he(ne);
    });
  }
  var $ = b(R, 2), G = z($);
  En(G, { name: "disk" });
  var W = b(G, 4);
  {
    var J = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).save)), A(he, D);
    };
    j(W, (he) => {
      s(O).save && he(J);
    });
  }
  var E = b($, 2), L = z(E);
  En(L, { name: "image" });
  var V = b(L, 4);
  {
    var ee = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).export)), A(he, D);
    };
    j(V, (he) => {
      s(O).export && he(ee);
    });
  }
  var ge = b(E, 2), re = z(ge);
  En(re, { name: "diagram" });
  var se = b(ge, 2), xe = z(se);
  En(xe, { name: "diagram" });
  var be = b(se, 2);
  {
    var Me = (he) => {
      const D = /* @__PURE__ */ X(() => e.onOpenShare);
      var oe = X7(), Oe = z(oe);
      En(Oe, { name: "collab" }), I("click", oe, () => f(s(D))), A(he, oe);
    };
    j(be, (he) => {
      e.onOpenShare && he(Me);
    });
  }
  var Re = b(be, 2), Se = z(Re);
  En(Se, { name: "play" });
  var Z = b(Se, 4);
  {
    var _e = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).present)), A(he, D);
    };
    j(Z, (he) => {
      s(O).present && he(_e);
    });
  }
  var ve = b(Re, 2), Le = z(ve);
  En(Le, { name: "route" });
  var Q = b(ve, 2), de = z(Q);
  En(de, { name: "help" });
  var me = b(de, 4);
  {
    var Pe = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).help)), A(he, D);
    };
    j(me, (he) => {
      s(O).help && he(Pe);
    });
  }
  var Ie = b(Q, 2), Ke = z(Ie);
  En(Ke, { name: "trash" });
  var De = b(Ie, 4), We = b(z(De), 2);
  Ze(We, 21, () => k, (he) => he.value, (he, D) => {
    var oe = Q7();
    let Oe;
    var ce = z(oe);
    En(ce, {
      get name() {
        return s(D).icon;
      }
    }), Y(() => {
      Oe = Ce(oe, 1, "RadioGroup__choice svelte-uens9z", null, Oe, { active: r() === s(D).value }), N(oe, "aria-checked", r() === s(D).value), N(oe, "aria-label", s(D).label), N(oe, "title", s(D).label);
    }), I("click", oe, () => e.onPickTheme(s(D).value)), A(he, oe);
  });
  var Ge = b(De, 2), Ve = b(z(Ge), 2);
  {
    var dt = (he) => {
      var D = _o(), oe = ae(D, !0);
      Y(() => le(oe, s(O).snap)), A(he, D);
    };
    j(Ve, (he) => {
      s(O).snap && he(dt);
    });
  }
  var _t = b(Ve, 2);
  let Ot;
  var At = b(Ge, 2), Rt = b(z(At), 2);
  let fe;
  var pe = b(At, 2), et = b(z(pe), 2);
  let xt;
  var ye = b(pe, 2), tt = b(z(ye), 2);
  let qe;
  var Vt = b(ye, 2);
  {
    var Pt = (he) => {
      var D = eE(), oe = Ue(D), Oe = b(z(oe), 2);
      let ce;
      var Ee = b(oe, 2), Ye = b(z(Ee), 2);
      Ze(Ye, 21, () => C6, (yt) => yt.value, (yt, nt) => {
        var st = $7();
        let Et;
        var en = ae(st, !0);
        Y(() => {
          Et = Ce(st, 1, "RadioGroup__choice text svelte-uens9z", null, Et, { active: e.grid.size === s(nt).value }), N(st, "aria-checked", e.grid.size === s(nt).value), N(st, "aria-label", `Grid size ${s(nt).label}`), le(en, s(nt).label);
        }), I("click", st, () => e.onPickGrid({ size: s(nt).value })), A(yt, st);
      }), Y(() => {
        ce = Ce(Oe, 1, "switch svelte-uens9z", null, ce, { on: e.grid.snap }), N(Oe, "aria-checked", e.grid.snap);
      }), I("click", Oe, () => e.onPickGrid({ snap: !e.grid.snap })), A(he, D);
    };
    j(Vt, (he) => {
      e.grid.enabled && he(Pt);
    });
  }
  var Be = b(Vt, 4), Ht = b(z(Be), 2);
  Ze(Ht, 20, () => T6, (he) => he, (he, D) => {
    var oe = tE();
    let Oe, ce;
    Y(() => {
      Oe = Ce(oe, 1, "swatch svelte-uens9z", null, Oe, { active: o() === D }), N(oe, "aria-checked", o() === D), N(oe, "aria-label", D), N(oe, "title", D), ce = ht(oe, "", ce, { "--swatch-color": D });
    }), I("click", oe, () => e.onPickCanvasBackground(D)), A(he, oe);
  });
  var bn = b(Be, 4), wn = ae(bn, !0);
  return Je(T, (he) => u = he, () => u), Y(
    (he) => {
      Ot = Ce(_t, 1, "switch svelte-uens9z", null, Ot, { on: i() }), N(_t, "aria-checked", i()), fe = Ce(Rt, 1, "switch svelte-uens9z", null, fe, { on: l() }), N(Rt, "aria-checked", l()), xt = Ce(et, 1, "switch svelte-uens9z", null, xt, { on: a() }), N(et, "aria-checked", a()), qe = Ce(tt, 1, "switch svelte-uens9z", null, qe, { on: e.grid.enabled }), N(tt, "aria-checked", e.grid.enabled), le(wn, he);
    },
    [() => j7(H7)]
  ), I("change", S, p), I("keydown", T, y), I("click", R, h), I("click", $, () => f(m)), I("click", E, () => f(e.onOpenExport)), I("click", ge, () => f(e.onOpenMermaid)), I("click", se, () => f(e.onOpenTemplates)), I("click", Re, () => f(e.onOpenPresent)), I("click", ve, () => f(e.onOpenPath)), I("click", Q, () => f(e.onOpenShortcuts)), I("click", Ie, () => f(w)), I("click", _t, function(...he) {
    e.onToggleObjectsSnap?.apply(this, he);
  }), I("click", Rt, function(...he) {
    e.onToggleFocusMode?.apply(this, he);
  }), I("click", et, function(...he) {
    e.onToggleDynamicSize?.apply(this, he);
  }), I("click", tt, () => e.onPickGrid({ enabled: !e.grid.enabled })), A(t, P), it(C);
}
ct(["change", "keydown", "click"]);
const oE = [
  {
    surface: "header",
    hidden: !1,
    // The top-left wrapper never takes a zen class (`LayerUI.tsx@1118751f:241-244`), so
    // the main menu stays put; its island only loses its shadow (`Island.scss@1118751f:11-13`).
    oracle: "LayerUI.tsx@1118751f:241-244"
  },
  {
    surface: "toolbar",
    hidden: !1,
    // "zen-mode" lands on the toolbar *container* and hides two things inside it — the
    // keybinding badges and the hint viewer — and nothing else.
    oracle: "Toolbar.tsx@1118751f:250"
  },
  {
    surface: "toolbarKeyHints",
    hidden: !0,
    // The two selectors the oracle's `.App-toolbar-container.zen-mode` rule hides: the
    // keybinding badge under each tool, and the hint viewer.
    oracle: "Toolbar.scss@1118751f:5-10"
  },
  {
    surface: "inspector",
    hidden: !0,
    // "transition-left" → `translate(-999px, 0)`.
    oracle: "LayerUI.tsx@1118751f:253-255"
  },
  {
    surface: "zoomBar",
    hidden: !1,
    // The class the oracle puts on the footer left, `…--transition-left`, is defined by no
    // rule, so the zoom actions do not move.
    oracle: "Footer.tsx@1118751f:40-42"
  },
  {
    surface: "undoButton",
    hidden: !0,
    // Undo and redo take `--transition-bottom` → `translate(0, 92px)`, the one footer row
    // the oracle's CSS does define.
    oracle: "Footer.tsx@1118751f:56-58"
  },
  {
    surface: "pathPanel",
    hidden: !0,
    // Ours: the oracle has no presentation mode and so no path panel. It is the same kind
    // of floating side panel as the style panel, and "focus on the canvas"
    // (`shortkey.md:384`) reads the same way about it.
    oracle: "LayerUI.tsx@1118751f:253-255"
  },
  {
    surface: "canvas",
    hidden: !1,
    // The point of the flag: `shortkey.md:384`, "focus on the canvas".
    oracle: "actionToggleZenMode.tsx@1118751f:9-27"
  },
  {
    surface: "textEditor",
    hidden: !1,
    // The text editor's container is a sibling of the whole chrome, not a child of it, so
    // no zen rule reaches it — and a text box that vanishes mid-sentence is the trap this
    // feature is most likely to fall into.
    oracle: "App.tsx@1118751f:2529-2531"
  },
  {
    surface: "contextMenu",
    hidden: !1,
    // Likewise a sibling container; `zenModeEnabled` appears in no menu code.
    oracle: "App.tsx@1118751f:2530"
  },
  {
    surface: "modals",
    hidden: !1,
    // `zenModeEnabled` reaches no dialog. The one line that reads it for a dialog's sake
    // only decides whether the exit button shows.
    oracle: "App.tsx@1118751f:2505-2508"
  },
  {
    surface: "exitZenMode",
    hidden: !1,
    // "disable-zen-mode" is `opacity: 0; visibility: hidden` until it gains
    // "disable-zen-mode--visible", so the way out appears with the flag and only with it.
    oracle: "Actions.tsx@1118751f:915-931"
  }
];
function iE(t) {
  const e = oE.find((n) => n.surface === t);
  if (!e) throw new Error(`zen: no chrome surface "${t}"`);
  return e;
}
function Io(t, e) {
  return e ? !iE(t).hidden : !0;
}
var sE = /* @__PURE__ */ F('<span class="hotkey-badge svelte-1tnl5mk"> </span>'), aE = /* @__PURE__ */ F('<button type="button"><!> <!></button>'), lE = /* @__PURE__ */ F('<kbd class="svelte-1tnl5mk"> </kbd>'), cE = /* @__PURE__ */ F('<button type="button" role="menuitemradio"><!> <span class="name svelte-1tnl5mk"> </span> <!></button>'), uE = /* @__PURE__ */ F('<div class="menu draw-panel svelte-1tnl5mk" role="menu" aria-label="More tools"></div>'), dE = /* @__PURE__ */ F('<div class="draw-panel bar svelte-1tnl5mk" role="toolbar" aria-label="Drawing tools" data-viewport-ui="top"><button type="button" title="Keep tool active — Q"><!></button> <div class="rule svelte-1tnl5mk" aria-hidden="true"></div> <!> <div class="rule svelte-1tnl5mk" aria-hidden="true"></div> <div class="more svelte-1tnl5mk" role="none"><button type="button" aria-haspopup="menu" title="More tools"><!> <span class="caret svelte-1tnl5mk" aria-hidden="true"></span></button> <!></div></div>');
function fE(t, e) {
  ot(e, !0);
  let n = ke(e, "zenMode", 3, !1), r = /* @__PURE__ */ B(!1), o = /* @__PURE__ */ B(void 0), i = /* @__PURE__ */ B(void 0);
  bt(() => {
    if (!s(o)) return;
    const T = () => e.onWidth?.(s(o).offsetWidth);
    T();
    const M = new ResizeObserver(T);
    return M.observe(s(o)), () => M.disconnect();
  });
  const a = /* @__PURE__ */ X(() => Xx(e.active) ? Ar(e.active) : void 0);
  function l(T) {
    T.preventDefault();
  }
  function c(T) {
    _(r, !1), e.onSelect(T);
  }
  function d(T) {
    s(r) && s(o) && !s(o).contains(vr(T)) && _(r, !1);
  }
  function u(T) {
    if (T.key === "Escape") {
      T.stopPropagation(), _(r, !1), s(i)?.focus();
      return;
    }
    if (T.key !== "ArrowDown" && T.key !== "ArrowUp") return;
    T.preventDefault();
    const M = Array.from(s(o)?.querySelectorAll(".menu-item") ?? []);
    if (M.length === 0) return;
    const H = M.indexOf(Ur(s(o)).activeElement), q = T.key === "ArrowDown" ? H + 1 : H - 1;
    M[(q + M.length) % M.length]?.focus();
  }
  var f = dE();
  Qe("pointerdown", $t, d);
  var h = z(f);
  let p;
  var m = z(h);
  {
    let T = /* @__PURE__ */ X(() => e.toolLocked ? "lock" : "lockOpen");
    lt(m, {
      get name() {
        return s(T);
      },
      size: 16
    });
  }
  var w = b(h, 4);
  Ze(w, 17, () => Lm, (T) => T.tool, (T, M) => {
    var H = aE();
    let q;
    var R = z(H);
    lt(R, {
      get name() {
        return s(M).icon;
      },
      size: 18
    });
    var K = b(R, 2);
    {
      var ie = ($) => {
        var G = sE(), W = ae(G, !0);
        Y((J) => le(W, J), [() => vi(s(M))]), A($, G);
      }, ne = /* @__PURE__ */ X(() => Io("toolbarKeyHints", n()));
      j(K, ($) => {
        s(ne) && $(ie);
      });
    }
    Y(
      ($, G) => {
        N(H, "aria-label", $), N(H, "aria-pressed", e.active === s(M).tool), N(H, "title", G), q = Ce(H, 1, "svelte-1tnl5mk", null, q, { active: e.active === s(M).tool });
      },
      [
        () => `${s(M).label} (${vi(s(M))})`,
        () => `${s(M).label} — ${vi(s(M))}`
      ]
    ), I("mousedown", H, l), I("click", H, () => e.onSelect(s(M).tool)), A(T, H);
  });
  var y = b(w, 4), k = z(y);
  let O;
  var C = z(k);
  {
    let T = /* @__PURE__ */ X(() => s(a)?.icon ?? "more");
    lt(C, {
      get name() {
        return s(T);
      },
      size: 18
    });
  }
  Je(k, (T) => _(i, T), () => s(i));
  var P = b(k, 2);
  {
    var S = (T) => {
      var M = uE();
      Ze(M, 21, () => ma, (H) => H.tool, (H, q) => {
        var R = cE();
        let K;
        var ie = z(R);
        lt(ie, {
          get name() {
            return s(q).icon;
          },
          size: 16
        });
        var ne = b(ie, 2), $ = ae(ne, !0), G = b(ne, 2);
        {
          var W = (E) => {
            var L = lE(), V = ae(L, !0);
            Y((ee) => le(V, ee), [() => vi(s(q))]), A(E, L);
          }, J = /* @__PURE__ */ X(() => Io("toolbarKeyHints", n()));
          j(G, (E) => {
            s(J) && E(W);
          });
        }
        Y(() => {
          K = Ce(R, 1, "menu-item svelte-1tnl5mk", null, K, { on: e.active === s(q).tool }), N(R, "aria-checked", e.active === s(q).tool), le($, s(q).label);
        }), I("mousedown", R, l), I("click", R, () => c(s(q).tool)), A(H, R);
      }), A(T, M);
    };
    j(P, (T) => {
      s(r) && T(S);
    });
  }
  Je(f, (T) => _(o, T), () => s(o)), Y(() => {
    N(h, "aria-label", `Keep tool active after drawing (Q) — ${e.toolLocked ? "on" : "off"}`), N(h, "aria-pressed", e.toolLocked), p = Ce(h, 1, "svelte-1tnl5mk", null, p, { active: e.toolLocked }), O = Ce(k, 1, "trigger svelte-1tnl5mk", null, O, { active: !!s(a) }), N(k, "aria-label", s(a) ? `More tools — ${s(a).label} selected` : "More tools"), N(k, "aria-expanded", s(r));
  }), I("mousedown", h, l), I("click", h, function(...T) {
    e.onToggleToolLock?.apply(this, T);
  }), I("keydown", y, u), I("mousedown", k, l), I("click", k, () => _(r, !s(r))), A(t, f), it();
}
ct(["mousedown", "click", "keydown"]);
const bv = 36, wv = 4, wc = ["hand", "select", "freedraw", "eraser", "shapes", "lines", "more"], kc = ["text", "image", "frame"], xo = ["rectangle", "diamond", "ellipse"], Eo = ["arrow", "line"], Dh = wc.length * bv + (wc.length - 1) * wv, hE = bv + wv;
function gE(t) {
  return t < Dh ? 0 : Math.min(
    kc.length,
    Math.floor((t - Dh) / hE)
  );
}
function pE(t, e = {}) {
  const n = gE(t), r = kc.slice(0, n), o = ma.map((u) => u.tool), i = o.filter((u) => !r.includes(u)), a = o.find((u) => u === e.active), l = r.includes(e.active), c = xo.find((u) => u === e.shape) ?? xo[0], d = Eo.find((u) => u === e.linear) ?? Eo[0];
  return {
    shown: [...wc.slice(0, 6), ...kc.slice(0, n), "more"],
    promoted: r,
    overflow: i,
    wears: {
      shapes: c,
      lines: d,
      // `extraToolSelected ? extraIcon : DotsIcon`
      // (`MobileToolbar.tsx@1118751f:135-154`): the trigger wears the active extra tool's
      // own icon only while that tool is behind More — a text tool promoted onto the row
      // is already on it, and has its own button.
      more: a && !l ? a : null
    }
  };
}
var Nh = /* @__PURE__ */ F('<button type="button" role="menuitemradio"><!> <span class="name svelte-1mv3ffm"> </span></button>'), mE = /* @__PURE__ */ F('<div class="menu draw-panel svelte-1mv3ffm" role="menu" tabindex="-1"></div>'), vE = /* @__PURE__ */ F('<div class="slot pop svelte-1mv3ffm"><button type="button" aria-haspopup="menu"><!></button> <!></div>'), _E = /* @__PURE__ */ F('<div class="menu draw-panel svelte-1mv3ffm" role="menu" tabindex="-1" aria-label="More tools"></div>'), yE = /* @__PURE__ */ F('<div class="slot pop svelte-1mv3ffm"><button type="button" aria-label="More tools" aria-haspopup="menu" title="More tools"><!></button> <!></div>'), bE = /* @__PURE__ */ F('<button type="button"><!></button>'), wE = /* @__PURE__ */ F('<div class="mobile-bar-row svelte-1mv3ffm" role="toolbar" aria-label="Drawing tools"></div>');
function kE(t, e) {
  ot(e, !0);
  let n = /* @__PURE__ */ B(null), r = /* @__PURE__ */ B(ft(xo[0])), o = /* @__PURE__ */ B(ft(Eo[0])), i = /* @__PURE__ */ B(0), a = /* @__PURE__ */ B(void 0);
  function l() {
    const y = s(a)?.parentElement ?? null;
    if (!y) {
      _(i, typeof window > "u" ? 0 : window.innerWidth, !0);
      return;
    }
    const k = getComputedStyle(y);
    _(i, y.clientWidth - parseFloat(k.paddingLeft || "0") - parseFloat(k.paddingRight || "0"));
  }
  bt(() => {
    if (!s(a)) return;
    l();
    const y = s(a).parentElement;
    if (!y) return;
    const k = new ResizeObserver(l);
    return k.observe(y), () => k.disconnect();
  });
  const c = /* @__PURE__ */ X(() => pE(s(i), {
    shape: s(r),
    linear: s(o),
    active: e.active
  }));
  function d(y) {
    return y === "shapes" ? Ar(s(c).wears.shapes)?.icon ?? "rectangle" : y === "lines" ? Ar(s(c).wears.lines)?.icon ?? "arrow" : y === "more" ? s(c).wears.more ? Ar(s(c).wears.more)?.icon ?? "more" : "more" : Ar(y)?.icon ?? "more";
  }
  function u(y) {
    return y === "shapes" ? "Shapes" : y === "lines" ? "Lines" : y === "more" ? "More tools" : Ar(y)?.label ?? y;
  }
  const f = { shapes: xo, lines: Eo };
  function h(y) {
    xo.includes(y) && _(r, y, !0), Eo.includes(y) && _(o, y, !0), _(n, null), e.onSelect(y);
  }
  function p(y) {
    if (!s(n)) return;
    const k = vr(y);
    k && s(a)?.contains(k) || _(n, null);
  }
  function m(y) {
    y.key === "Escape" && s(n) && (y.stopPropagation(), _(n, null));
  }
  var w = wE();
  Qe("pointerdown", $t, p), Ze(w, 20, () => s(c).shown, (y) => y, (y, k) => {
    var O = on(), C = Ue(O);
    {
      var P = (M) => {
        const H = /* @__PURE__ */ X(() => k === "shapes" ? "shapes" : "lines"), q = /* @__PURE__ */ X(() => s(H) === "shapes" ? s(c).wears.shapes : s(c).wears.lines);
        var R = vE(), K = z(R);
        let ie;
        var ne = z(K);
        {
          let W = /* @__PURE__ */ X(() => d(k));
          lt(ne, {
            get name() {
              return s(W);
            },
            size: 20
          });
        }
        var $ = b(K, 2);
        {
          var G = (W) => {
            var J = mE();
            Ze(J, 20, () => f[s(H)], (E) => E, (E, L) => {
              const V = /* @__PURE__ */ X(() => qs.find((be) => be.tool === L));
              var ee = Nh();
              let ge;
              var re = z(ee);
              {
                let be = /* @__PURE__ */ X(() => s(V)?.icon ?? "more");
                lt(re, {
                  get name() {
                    return s(be);
                  },
                  size: 16
                });
              }
              var se = b(re, 2), xe = ae(se, !0);
              Y(() => {
                ge = Ce(ee, 1, "menu-item svelte-1mv3ffm", null, ge, { on: e.active === L }), N(ee, "aria-checked", e.active === L), N(ee, "aria-label", s(V)?.label ?? L), le(xe, s(V)?.label ?? L);
              }), I("click", ee, () => h(L)), A(E, ee);
            }), Y((E) => N(J, "aria-label", E), [() => u(k)]), I("keydown", J, m), A(W, J);
          };
          j($, (W) => {
            s(n) === s(H) && W(G);
          });
        }
        Y(
          (W) => {
            ie = Ce(K, 1, "tool svelte-1mv3ffm", null, ie, { active: e.active === s(q) }), N(K, "aria-label", s(H) === "shapes" ? `Shapes (${xo.length})` : `Lines (${Eo.length})`), N(K, "aria-expanded", s(n) === s(H)), N(K, "title", W);
          },
          [() => u(k)]
        ), I("click", K, () => _(n, s(n) === s(H) ? null : s(H), !0)), A(M, R);
      }, S = (M) => {
        var H = yE(), q = z(H);
        let R;
        var K = z(q);
        {
          let $ = /* @__PURE__ */ X(() => d("more"));
          lt(K, {
            get name() {
              return s($);
            },
            size: 20
          });
        }
        var ie = b(q, 2);
        {
          var ne = ($) => {
            var G = _E();
            Ze(G, 20, () => s(c).overflow, (W) => W, (W, J) => {
              const E = /* @__PURE__ */ X(() => qs.find((se) => se.tool === J));
              var L = Nh();
              let V;
              var ee = z(L);
              {
                let se = /* @__PURE__ */ X(() => s(E)?.icon ?? "more");
                lt(ee, {
                  get name() {
                    return s(se);
                  },
                  size: 16
                });
              }
              var ge = b(ee, 2), re = ae(ge, !0);
              Y(() => {
                V = Ce(L, 1, "menu-item svelte-1mv3ffm", null, V, { on: e.active === J }), N(L, "aria-checked", e.active === J), N(L, "aria-label", s(E)?.label ?? J), le(re, s(E)?.label ?? J);
              }), I("click", L, () => h(J)), A(W, L);
            }), I("keydown", G, m), A($, G);
          };
          j(ie, ($) => {
            s(n) === "more" && $(ne);
          });
        }
        Y(() => {
          R = Ce(q, 1, "tool svelte-1mv3ffm", null, R, { active: !!s(c).wears.more }), N(q, "aria-expanded", s(n) === "more");
        }), I("click", q, () => _(n, s(n) === "more" ? null : "more", !0)), A(M, H);
      }, T = (M) => {
        const H = /* @__PURE__ */ X(() => Ar(k));
        var q = on(), R = Ue(q);
        {
          var K = (ie) => {
            var ne = bE();
            let $;
            var G = z(ne);
            lt(G, {
              get name() {
                return s(H).icon;
              },
              size: 20
            }), Y(() => {
              $ = Ce(ne, 1, "tool svelte-1mv3ffm", null, $, { active: e.active === s(H).tool }), N(ne, "aria-label", s(H).label), N(ne, "title", s(H).label);
            }), I("click", ne, () => h(s(H).tool)), A(ie, ne);
          };
          j(R, (ie) => {
            s(H) && ie(K);
          });
        }
        A(M, q);
      };
      j(C, (M) => {
        k === "shapes" || k === "lines" ? M(P) : k === "more" ? M(S, 1) : M(T, -1);
      });
    }
    A(y, O);
  }), Je(w, (y) => _(a, y), () => s(a)), A(t, w), it();
}
ct(["click", "keydown"]);
var SE = /* @__PURE__ */ F('<div class="row svelte-1kk3jp4"><span class="svelte-1kk3jp4"> </span> <!></div>');
function Ne(t, e) {
  var n = SE(), r = z(n), o = ae(r, !0), i = b(r, 2);
  tm(i, () => e.children), Y(() => le(o, e.label)), A(t, n);
}
var xE = /* @__PURE__ */ F('<button type="button"></button>'), EE = /* @__PURE__ */ F('<div class="picks svelte-1nf1l6d"></div> <div class="divider svelte-1nf1l6d"></div>', 1), Bh = /* @__PURE__ */ F('<button type="button"><span class="hotkey svelte-1nf1l6d"> </span></button>'), TE = /* @__PURE__ */ F('<div class="heading svelte-1nf1l6d">Most used custom colors</div> <div class="grid svelte-1nf1l6d"></div>', 1), CE = /* @__PURE__ */ F('<button type="button" aria-label="Shade"><span class="hotkey svelte-1nf1l6d"> </span></button>'), AE = /* @__PURE__ */ F('<div class="grid svelte-1nf1l6d"></div>'), PE = /* @__PURE__ */ F('<div class="none svelte-1nf1l6d">No shades available for this color</div>'), IE = /* @__PURE__ */ F('<button type="button" class="dropper svelte-1nf1l6d" aria-label="Pick color from canvas" title="Pick color from canvas — I"><!></button>'), zE = /* @__PURE__ */ F('<div class="message svelte-1nf1l6d" role="alert"> </div>'), ME = /* @__PURE__ */ F('<div class="picker draw-panel svelte-1nf1l6d" popover="manual" role="dialog" tabindex="-1"><!> <div class="heading svelte-1nf1l6d">Colors</div> <div class="grid svelte-1nf1l6d"></div> <div class="heading svelte-1nf1l6d">Shades</div> <!> <div class="heading svelte-1nf1l6d">Hex code</div> <div><span aria-hidden="true" class="svelte-1nf1l6d">#</span> <input aria-label="Hex code" spellcheck="false" class="svelte-1nf1l6d"/> <!></div> <!></div>'), OE = /* @__PURE__ */ F('<div><!> <button type="button" aria-haspopup="dialog"></button></div> <!>', 1);
function Zo(t, e) {
  ot(e, !0);
  let n = ke(e, "hideTransparent", 3, !1), r = ke(e, "compact", 3, !1), o = /* @__PURE__ */ B(void 0), i = /* @__PURE__ */ B(void 0), a = /* @__PURE__ */ B(void 0), l = /* @__PURE__ */ B(ft({ left: 0, top: 0 })), c = /* @__PURE__ */ B(null), d = /* @__PURE__ */ B(0), u = /* @__PURE__ */ B(ft([])), f = /* @__PURE__ */ B(""), h = /* @__PURE__ */ B(null), p = null;
  const m = /* @__PURE__ */ X(() => va(e.value)), w = typeof window < "u" && "EyeDropper" in window;
  bt(() => {
    if (e.open)
      return dn(() => {
        _(u, e.customColors(), !0), _(c, _6(e.value, s(u)), !0), _(d, s(m)?.shade ?? u6(e.kind), !0), _(f, (e.value ?? "").replace(/^#/, ""), !0), _(h, null);
        const E = s(o)?.getBoundingClientRect();
        if (E) {
          let ee = E.right + 16;
          ee + 216 > window.innerWidth - 8 && (ee = E.left - 216 - 16), ee + 216 > window.innerWidth - 8 && (ee = window.innerWidth - 216 - 8), _(
            l,
            {
              left: Math.max(8, ee),
              top: Math.max(8, Math.min(E.top - 12, window.innerHeight - 330 - 8))
            },
            !0
          );
        }
        Br().then(() => {
          s(i)?.showPopover(), p = yn(s(i));
        });
      }), () => {
        p?.(), p = null;
      };
  }), bt(() => {
    const E = s(m)?.shade;
    E != null && dn(() => _(d, E, !0)), Ur(s(a)).activeElement !== s(a) && _(f, (e.value ?? "").replace(/^#/, ""), !0);
  });
  function y(E) {
    E.preventDefault();
  }
  function k(E, L = s(c)) {
    _(c, L, !0), e.onPick(E);
  }
  function O() {
    e.onToggle(!1);
  }
  async function C() {
    if (!w) return;
    const E = window.EyeDropper;
    try {
      const { sRGBHex: L } = await new E().open();
      k(L.toLowerCase());
    } catch {
    }
  }
  function P(E) {
    const L = v6(E, {
      section: s(c),
      color: e.value,
      customColors: s(u),
      activeShade: s(d)
    });
    L && (E.preventDefault(), E.stopPropagation(), L.kind === "close" ? O() : L.kind === "eyedropper" ? C() : L.kind === "pick" ? k(L.color, L.section) : L.kind === "section" && (_(c, L.section, !0), L.color && e.onPick(L.color), L.section === "hex" ? s(a)?.focus() : s(i)?.focus()));
  }
  function S(E) {
    const L = m6(E);
    _(f, E.toLowerCase().trim().replace(/^#/, ""), !0), _(h, L.error, !0), L.color && k(L.color, "hex");
  }
  function T(E) {
    E.key !== "Tab" && (E.key === "Escape" && (E.preventDefault(), s(i)?.focus()), E.stopPropagation());
  }
  function M(E) {
    if (!e.open) return;
    const L = vr(E);
    L && (s(i)?.contains(L) || s(o)?.contains(L)) || e.onToggle(!1);
  }
  var H = OE();
  Qe("pointerdown", $t, M);
  var q = Ue(H);
  let R;
  var K = z(q);
  {
    var ie = (E) => {
      var L = EE(), V = Ue(L);
      Ze(V, 20, () => e.picks, (ee) => ee, (ee, ge) => {
        var re = xE();
        let se, xe;
        Y(
          (be, Me) => {
            se = Ce(re, 1, "dot svelte-1nf1l6d", null, se, { transparent: be, on: e.value === ge }), N(re, "aria-label", ge), N(re, "aria-pressed", e.value === ge), xe = ht(re, "", xe, { background: Me });
          },
          [
            () => Kn(ge),
            () => Kn(ge) ? void 0 : ge
          ]
        ), I("mousedown", re, y), I("click", re, () => e.onPick(ge)), A(ee, re);
      }), A(E, L);
    };
    j(K, (E) => {
      r() || E(ie);
    });
  }
  var ne = b(K, 2);
  let $, G;
  Je(ne, (E) => _(o, E), () => s(o));
  var W = b(q, 2);
  {
    var J = (E) => {
      var L = ME();
      let V;
      var ee = z(L);
      {
        var ge = (Q) => {
          var de = TE(), me = b(Ue(de), 2);
          Ze(me, 22, () => s(u), (Pe) => Pe, (Pe, Ie, Ke) => {
            var De = Bh();
            let We, Ge;
            var Ve = z(De), dt = ae(Ve, !0);
            Y(() => {
              We = Ce(De, 1, "cell svelte-1nf1l6d", null, We, { active: e.value === Ie }), N(De, "aria-label", `${Ie} — ${s(Ke) + 1}`), N(De, "title", Ie), Ge = ht(De, "", Ge, { background: Ie }), le(dt, s(Ke) + 1);
            }), I("mousedown", De, y), I("click", De, () => k(Ie, "custom")), A(Pe, De);
          }), A(Q, de);
        };
        j(ee, (Q) => {
          s(u).length && Q(ge);
        });
      }
      var re = b(ee, 4);
      Ze(re, 23, () => Pr, ([Q, de]) => Q, (Q, de, me) => {
        var Pe = /* @__PURE__ */ X(() => lS(s(de), 2));
        let Ie = () => s(Pe)[0], Ke = () => s(Pe)[1];
        const De = /* @__PURE__ */ X(() => _i(Ke(), s(d)));
        var We = Bh();
        let Ge, Ve;
        var dt = z(We), _t = ae(dt, !0);
        Y(
          (Ot, At, Rt, fe) => {
            Ge = Ce(We, 1, "cell svelte-1nf1l6d", null, Ge, { transparent: Ot, active: s(m)?.name === Ie() }), N(We, "hidden", At), N(We, "aria-label", `${lh[Ie()]} — ${Ps[s(me)]}`), N(We, "title", Rt), Ve = ht(We, "", Ve, { background: fe }), le(_t, Ps[s(me)]);
          },
          [
            () => Kn(s(De)),
            () => n() && Kn(s(De)),
            () => `${lh[Ie()]}${s(De).startsWith("#") ? ` ${s(De)}` : ""} — ${Ps[s(me)]}`,
            () => Kn(s(De)) ? void 0 : s(De)
          ]
        ), I("mousedown", We, y), I("click", We, () => k(s(De), "baseColors")), A(Q, We);
      });
      var se = b(re, 4);
      {
        var xe = (Q) => {
          const de = /* @__PURE__ */ X(() => Pr[s(m).index]?.[1] ?? []);
          var me = AE();
          Ze(me, 22, () => s(de), (Pe) => Pe, (Pe, Ie, Ke) => {
            var De = CE();
            let We, Ge;
            var Ve = z(De), dt = ae(Ve);
            Y(() => {
              We = Ce(De, 1, "cell svelte-1nf1l6d", null, We, { active: s(Ke) === s(m).shade }), N(De, "title", `${s(m).name} - ${s(Ke) + 1}`), Ge = ht(De, "", Ge, { background: Ie }), le(dt, `⇧${s(Ke) + 1}`);
            }), I("mousedown", De, y), I("click", De, () => k(Ie, "shades")), A(Pe, De);
          }), A(Q, me);
        }, be = (Q) => {
          var de = PE();
          A(Q, de);
        };
        j(se, (Q) => {
          s(m) && s(m).shade !== null ? Q(xe) : Q(be, -1);
        });
      }
      var Me = b(se, 4);
      let Re;
      var Se = b(z(Me), 2);
      Je(Se, (Q) => _(a, Q), () => s(a));
      var Z = b(Se, 2);
      {
        var _e = (Q) => {
          var de = IE(), me = z(de);
          lt(me, { name: "eyeDropper", size: 16 }), I("mousedown", de, y), I("click", de, () => {
            C();
          }), A(Q, de);
        };
        j(Z, (Q) => {
          w && Q(_e);
        });
      }
      var ve = b(Me, 2);
      {
        var Le = (Q) => {
          var de = zE(), me = ae(de, !0);
          Y(() => le(me, s(h))), A(Q, de);
        };
        j(ve, (Q) => {
          s(h) && Q(Le);
        });
      }
      Je(L, (Q) => _(i, Q), () => s(i)), Y(() => {
        N(L, "aria-label", `${e.label} colour picker`), V = ht(L, "", V, { left: `${s(l).left}px`, top: `${s(l).top}px` }), Re = Ce(Me, 1, "hex svelte-1nf1l6d", null, Re, { error: s(h) !== null }), N(Se, "aria-invalid", s(h) !== null), _n(Se, s(f));
      }), I("keydown", L, P), I("input", Se, (Q) => S(Q.currentTarget.value)), I("keydown", Se, T), Qe("focus", Se, () => _(c, "hex")), Qe("blur", Se, () => {
        _(f, (e.value ?? "").replace(/^#/, ""), !0), _(h, null);
      }), A(E, L);
    };
    j(W, (E) => {
      e.open && E(J);
    });
  }
  Y(
    (E, L) => {
      R = Ce(q, 1, "swatches svelte-1nf1l6d", null, R, { compact: r() }), $ = Ce(ne, 1, "dot current svelte-1nf1l6d", null, $, { transparent: E, mixed: e.value === null }), N(ne, "aria-label", e.label), N(ne, "aria-expanded", e.open), N(ne, "title", e.value === null ? `${e.label}: mixed` : `${e.label}: ${e.value}`), G = ht(ne, "", G, { background: L });
    },
    [
      () => e.value !== null && Kn(e.value),
      () => e.value !== null && !Kn(e.value) ? e.value : void 0
    ]
  ), I("mousedown", ne, y), I("click", ne, () => e.onToggle(!e.open)), A(t, H), it();
}
ct(["mousedown", "click", "keydown", "input"]);
var FE = /* @__PURE__ */ F('<span class="badge svelte-1tkogeh" aria-hidden="true">old</span>'), RE = /* @__PURE__ */ F('<button type="button"><!> <span class="name svelte-1tkogeh"> </span> <!></button>'), LE = /* @__PURE__ */ F('<button type="button" role="radio"><!></button>'), DE = /* @__PURE__ */ F('<div class="picks svelte-1tkogeh" role="radiogroup" aria-label="Font family"></div> <div class="divider svelte-1tkogeh"></div>', 1), NE = /* @__PURE__ */ F('<div class="group" role="group" aria-label="In this scene"><div class="heading svelte-1tkogeh">In this scene</div> <!></div>'), BE = /* @__PURE__ */ F('<div class="group" role="group" aria-label="Available fonts"><div class="heading svelte-1tkogeh">Available fonts</div> <!></div>'), UE = /* @__PURE__ */ F('<div class="none svelte-1tkogeh">No fonts found</div>'), jE = /* @__PURE__ */ F('<div class="picker draw-panel svelte-1tkogeh" popover="manual" role="dialog" aria-label="Font picker" tabindex="-1"><input class="search svelte-1tkogeh" type="text" placeholder="Quick search" aria-label="Quick search" spellcheck="false"/> <div class="list svelte-1tkogeh"><!> <!> <!></div></div>'), HE = /* @__PURE__ */ F('<div><!> <button type="button" aria-label="Show font picker" aria-haspopup="dialog"><!></button></div> <!>', 1);
function Lu(t, e) {
  ot(e, !0);
  const n = (E, L = Mi) => {
    var V = RE();
    let ee;
    var ge = z(V);
    lt(ge, {
      get name() {
        return L().icon;
      },
      size: 16
    });
    var re = b(ge, 2);
    let se;
    var xe = ae(re, !0), be = b(re, 2);
    {
      var Me = (Re) => {
        var Se = FE();
        A(Re, Se);
      };
      j(be, (Re) => {
        L().deprecated && Re(Me);
      });
    }
    Y(
      (Re) => {
        ee = Ce(V, 1, "item svelte-1tkogeh", null, ee, { chosen: L().id === s(p) }), N(V, "data-hovered", L().id === s(d)), N(V, "aria-label", L().label), N(V, "aria-current", L().id === s(p)), N(V, "title", L().label), se = ht(re, "", se, { "font-family": Re }), le(xe, L().label);
      },
      [() => e.stackOf(L().id)]
    ), I("mousedown", V, y), I("mousemove", V, () => k(L().id)), I("click", V, () => P(L().id)), A(E, V);
  };
  let r = ke(e, "compact", 3, !1), o = /* @__PURE__ */ B(void 0), i = /* @__PURE__ */ B(void 0), a = /* @__PURE__ */ B(void 0), l = /* @__PURE__ */ B(ft({ left: 0, top: 0 })), c = /* @__PURE__ */ B(""), d = /* @__PURE__ */ B(null), u = /* @__PURE__ */ B(ft([])), f = /* @__PURE__ */ B(null), h = null;
  const p = /* @__PURE__ */ X(() => e.open ? s(f) : e.value), m = /* @__PURE__ */ X(() => M6(s(u), s(c))), w = /* @__PURE__ */ X(() => [...s(m).inScene, ...s(m).available].map((E) => E.id));
  bt(() => {
    if (e.open)
      return dn(() => {
        _(f, e.value, !0), _(c, ""), _(d, null), _(u, e.sceneFamilies(), !0);
        const E = s(o)?.getBoundingClientRect();
        E && _(
          l,
          {
            left: E.right + 16,
            top: Math.max(8, Math.min(E.top - 12, window.innerHeight - 320 - 8))
          },
          !0
        ), Br().then(() => {
          s(i)?.showPopover(), h = yn(s(a));
        });
      }), () => {
        _(d, null), e.onPreview(null), h?.(), h = null;
      };
  });
  function y(E) {
    E.preventDefault();
  }
  function k(E) {
    s(d) !== E && (_(d, E, !0), e.onPreview(E));
  }
  function O() {
    s(d) !== null && (_(d, null), e.onPreview(null));
  }
  function C() {
    e.onToggle(!1);
  }
  function P(E) {
    e.onPick(E), C();
  }
  function S(E) {
    const L = O6(E, s(d) ?? s(f), s(w));
    L && (E.preventDefault(), E.stopPropagation(), L.kind === "focusSearch" ? s(a)?.focus() : L.kind === "close" ? C() : L.kind === "select" ? P(L.id) : L.kind === "hover" && (k(L.id), Br().then(() => s(i)?.querySelector('[data-hovered="true"]')?.scrollIntoView({ block: "nearest" }))));
  }
  function T(E) {
    _(c, E, !0);
    const L = s(d) ?? s(f);
    if (!E.trim() || L !== null && s(w).includes(L)) return;
    const [V] = s(w);
    V === void 0 ? O() : k(V);
  }
  function M(E) {
    if (!e.open) return;
    const L = vr(E);
    L && (s(i)?.contains(L) || s(o)?.contains(L)) || e.onToggle(!1);
  }
  var H = HE();
  Qe("pointerdown", $t, M);
  var q = Ue(H);
  let R;
  var K = z(q);
  {
    var ie = (E) => {
      var L = DE(), V = Ue(L);
      Ze(V, 21, () => I6, (ee) => ee.id, (ee, ge) => {
        var re = LE();
        let se;
        var xe = z(re);
        lt(xe, {
          get name() {
            return s(ge).icon;
          },
          size: 14
        }), Y(() => {
          N(re, "aria-checked", s(p) === s(ge).id), N(re, "aria-label", s(ge).label), N(re, "title", s(ge).label), se = Ce(re, 1, "svelte-1tkogeh", null, se, { on: s(p) === s(ge).id });
        }), I("mousedown", re, y), I("click", re, () => e.onPick(s(ge).id)), A(ee, re);
      }), A(E, L);
    };
    j(K, (E) => {
      r() || E(ie);
    });
  }
  var ne = b(K, 2);
  let $;
  var G = z(ne);
  lt(G, { name: "text", size: 14 }), Je(ne, (E) => _(o, E), () => s(o));
  var W = b(q, 2);
  {
    var J = (E) => {
      var L = jE();
      let V;
      var ee = z(L);
      Je(ee, (Se) => _(a, Se), () => s(a));
      var ge = b(ee, 2), re = z(ge);
      {
        var se = (Se) => {
          var Z = NE(), _e = b(z(Z), 2);
          Ze(_e, 17, () => s(m).inScene, (ve) => ve.id, (ve, Le) => {
            n(ve, () => s(Le));
          }), A(Se, Z);
        };
        j(re, (Se) => {
          s(m).inScene.length && Se(se);
        });
      }
      var xe = b(re, 2);
      {
        var be = (Se) => {
          var Z = BE(), _e = b(z(Z), 2);
          Ze(_e, 17, () => s(m).available, (ve) => ve.id, (ve, Le) => {
            n(ve, () => s(Le));
          }), A(Se, Z);
        };
        j(xe, (Se) => {
          s(m).available.length && Se(be);
        });
      }
      var Me = b(xe, 2);
      {
        var Re = (Se) => {
          var Z = UE();
          A(Se, Z);
        };
        j(Me, (Se) => {
          s(w).length === 0 && Se(Re);
        });
      }
      Je(L, (Se) => _(i, Se), () => s(i)), Y(() => {
        V = ht(L, "", V, { left: `${s(l).left}px`, top: `${s(l).top}px` }), _n(ee, s(c));
      }), I("keydown", L, S), Qe("pointerleave", L, O), I("input", ee, (Se) => T(Se.currentTarget.value)), A(E, L);
    };
    j(W, (E) => {
      e.open && E(J);
    });
  }
  Y(
    (E) => {
      R = Ce(q, 1, "fonts svelte-1tkogeh", null, R, { compact: r() }), $ = Ce(ne, 1, "trigger svelte-1tkogeh", null, $, { on: e.open }), N(ne, "aria-expanded", e.open), N(ne, "title", E);
    },
    [() => `Font family: ${z6(s(p))}`]
  ), I("mousedown", ne, y), I("click", ne, () => e.onToggle(!e.open)), A(t, H), it();
}
ct(["mousedown", "mousemove", "click", "keydown", "input"]);
var WE = /* @__PURE__ */ F('<button type="button"> </button>'), ZE = /* @__PURE__ */ F('<div class="seg svelte-g5xv8s" role="group"></div>');
function rn(t, e) {
  ot(e, !0);
  function n(o) {
    o.preventDefault();
  }
  var r = ZE();
  Ze(r, 21, () => e.options, (o) => String(o.value), (o, i) => {
    var a = WE();
    let l;
    var c = ae(a, !0);
    Y(() => {
      N(a, "aria-pressed", s(i).value === e.value), l = Ce(a, 1, "svelte-g5xv8s", null, l, { on: s(i).value === e.value }), le(c, s(i).label);
    }), I("mousedown", a, n), I("click", a, () => e.onPick(s(i).value)), A(o, a);
  }), Y(() => N(r, "aria-label", e.ariaLabel)), A(t, r), it();
}
ct(["mousedown", "click"]);
var KE = /* @__PURE__ */ F('<button type="button" role="radio"><!></button>'), VE = /* @__PURE__ */ F('<div class="choice svelte-11pzfdq" role="radiogroup"></div>');
function zr(t, e) {
  ot(e, !0);
  function n(o) {
    o.preventDefault();
  }
  var r = VE();
  Ze(r, 21, () => e.options, (o) => o.value, (o, i) => {
    var a = KE();
    let l;
    var c = z(a);
    lt(c, {
      get name() {
        return s(i).icon;
      },
      size: 14
    }), Y(() => {
      N(a, "aria-checked", s(i).value === e.value), N(a, "aria-label", s(i).label), N(a, "title", s(i).label), l = Ce(a, 1, "svelte-11pzfdq", null, l, { on: s(i).value === e.value });
    }), I("mousedown", a, n), I("click", a, () => e.onPick(s(i).value)), A(o, a);
  }), Y(() => N(r, "aria-label", e.ariaLabel)), A(t, r), it();
}
ct(["mousedown", "click"]);
var JE = /* @__PURE__ */ F('<button type="button" class="svelte-1v9fr7j"><!></button>'), GE = /* @__PURE__ */ F('<div class="icons svelte-1v9fr7j"></div>');
function Gn(t, e) {
  function n(o) {
    o.preventDefault();
  }
  var r = GE();
  Ze(r, 21, () => e.buttons, (o) => o.label, (o, i) => {
    var a = JE(), l = z(a);
    lt(l, {
      get name() {
        return s(i).icon;
      },
      size: 14
    }), Y(() => {
      N(a, "aria-label", s(i).label), N(a, "title", s(i).label);
    }), I("mousedown", a, n), I("click", a, function(...c) {
      s(i).onPick?.apply(this, c);
    }), A(o, a);
  }), A(t, r);
}
ct(["mousedown", "click"]);
var Uh = /* @__PURE__ */ F("<!> <!> <!> <!> <!>", 1), qE = /* @__PURE__ */ F('<button type="button" role="radio"><span> </span></button>'), YE = /* @__PURE__ */ F('<div class="heads svelte-6qktot" role="radiogroup"></div>'), XE = /* @__PURE__ */ F('<div class="arrowheads svelte-6qktot"></div>'), QE = /* @__PURE__ */ F("<!> <!>", 1), $E = /* @__PURE__ */ F('<div class="font-size svelte-6qktot"><!> <input type="number" aria-label="Font size in pixels" placeholder="mixed" class="svelte-6qktot"/></div>'), eT = /* @__PURE__ */ F("<!> <!> <!> <!>", 1), tT = /* @__PURE__ */ F('<input type="number" aria-label="Sides" placeholder="mixed"/>'), nT = /* @__PURE__ */ F('<input type="range" aria-label="Ratio" class="svelte-6qktot"/>'), rT = /* @__PURE__ */ F("<!> <!> <!>", 1), oT = /* @__PURE__ */ F('<input type="range" aria-label="Opacity" class="svelte-6qktot"/>');
function Rn(t, e) {
  ot(e, !0);
  const n = /* @__PURE__ */ X(() => Jm(e.summary)), r = /* @__PURE__ */ X(() => [
    { end: "start", value: e.summary.startArrowhead },
    { end: "end", value: e.summary.endArrowhead }
  ]);
  function o(S, T) {
    e.run((M) => M.setArrowheads({ [S]: T }));
  }
  const i = /* @__PURE__ */ X(() => e.summary.opacity ?? e.engine?.getNextStyle().opacity ?? 100), a = /* @__PURE__ */ X(() => e.summary.opacity === null ? "mixed" : `${e.summary.opacity}%`);
  let l = !1;
  function c(S) {
    l && (l = !1, e.onApply({ opacity: Number(S) }));
  }
  const d = /* @__PURE__ */ X(() => e.summary.figureRatio ?? (Jn.min + Jn.max) / 2), u = /* @__PURE__ */ X(() => e.summary.figureRatio === null ? "mixed" : e.summary.figureRatio.toFixed(2));
  let f = !1;
  function h(S) {
    f && (f = !1, e.onApply({ figureRatio: Number(S) }));
  }
  var p = on(), m = Ue(p);
  {
    var w = (S) => {
      var T = Uh(), M = Ue(T);
      {
        var H = (J) => {
          Ne(J, {
            label: "Fill style",
            children: (E, L) => {
              rn(E, {
                ariaLabel: "Fill style",
                get options() {
                  return Zm;
                },
                get value() {
                  return e.summary.fillStyle;
                },
                onPick: (V) => e.onApply({ fillStyle: V })
              });
            }
          });
        };
        j(M, (J) => {
          e.can.fill && J(H);
        });
      }
      var q = b(M, 2);
      {
        var R = (J) => {
          Ne(J, {
            label: "Width",
            children: (E, L) => {
              rn(E, {
                ariaLabel: "Stroke width",
                get options() {
                  return Um;
                },
                get value() {
                  return e.summary.strokeWidth;
                },
                onPick: (V) => e.onApply({ strokeWidth: Number(V) })
              });
            }
          });
        };
        j(q, (J) => {
          e.can.strokeWidth && J(R);
        });
      }
      var K = b(q, 2);
      {
        var ie = (J) => {
          Ne(J, {
            label: "Stroke style",
            children: (E, L) => {
              rn(E, {
                ariaLabel: "Stroke style",
                get options() {
                  return jm;
                },
                get value() {
                  return e.summary.strokeStyle;
                },
                onPick: (V) => e.onApply({ strokeStyle: V })
              });
            }
          });
        };
        j(K, (J) => {
          e.can.strokeStyle && J(ie);
        });
      }
      var ne = b(K, 2);
      {
        var $ = (J) => {
          Ne(J, {
            label: "Sloppiness",
            children: (E, L) => {
              rn(E, {
                ariaLabel: "Sloppiness",
                get options() {
                  return Hm;
                },
                get value() {
                  return e.summary.roughness;
                },
                onPick: (V) => e.onApply({ roughness: Number(V) })
              });
            }
          });
        };
        j(ne, (J) => {
          e.can.sloppiness && J($);
        });
      }
      var G = b(ne, 2);
      {
        var W = (J) => {
          Ne(J, {
            label: "Edges",
            children: (E, L) => {
              rn(E, {
                ariaLabel: "Edges",
                get options() {
                  return Wm;
                },
                get value() {
                  return e.summary.edges;
                },
                onPick: (V) => e.onApply({ roundness: Ys(V === "round" ? "round" : "sharp") })
              });
            }
          });
        };
        j(G, (J) => {
          e.can.roundness && J(W);
        });
      }
      A(S, T);
    }, y = (S) => {
      var T = QE(), M = Ue(T);
      {
        var H = (K) => {
          Ne(K, {
            label: "Arrow type",
            children: (ie, ne) => {
              zr(ie, {
                ariaLabel: "Arrow type",
                get options() {
                  return Su;
                },
                get value() {
                  return e.summary.arrowType;
                },
                onPick: ($) => e.run((G) => G.setArrowType($))
              });
            }
          });
        };
        j(M, (K) => {
          e.can.arrowType && K(H);
        });
      }
      var q = b(M, 2);
      {
        var R = (K) => {
          Ne(K, {
            label: "Arrowheads",
            children: (ie, ne) => {
              var $ = XE();
              Ze($, 21, () => s(r), (G) => G.end, (G, W) => {
                var J = YE();
                Ze(J, 20, () => mu, (E) => E, (E, L) => {
                  var V = qE();
                  let ee;
                  var ge = z(V);
                  let re;
                  var se = ae(ge, !0);
                  Y(() => {
                    N(V, "aria-checked", s(W).value === L), N(V, "aria-label", `${s(W).end === "start" ? "Start" : "End"} ${Uo[L]}`), N(V, "title", Uo[L]), ee = Ce(V, 1, "svelte-6qktot", null, ee, { on: s(W).value === L }), re = Ce(ge, 1, "svelte-6qktot", null, re, { flip: s(W).end === "start" }), le(se, vu[L]);
                  }), I("click", V, () => o(s(W).end, L)), A(E, V);
                }), Y(() => N(J, "aria-label", `${s(W).end === "start" ? "Start" : "End"} arrowhead`)), A(G, J);
              }), A(ie, $);
            }
          });
        };
        j(q, (K) => {
          e.can.arrowheads && K(R);
        });
      }
      A(S, T);
    }, k = (S) => {
      var T = eT(), M = Ue(T);
      {
        var H = (G) => {
          Ne(G, {
            label: "Font size",
            children: (W, J) => {
              var E = $E(), L = z(E);
              rn(L, {
                ariaLabel: "Font size",
                get options() {
                  return Km;
                },
                get value() {
                  return e.summary.fontSize;
                },
                onPick: (ee) => e.run((ge) => ge.setFontSize(Number(ee)))
              });
              var V = b(L, 2);
              N(V, "min", 1), N(V, "max", 1e3), N(V, "step", 1), Y(() => _n(V, e.summary.fontSize ?? "")), I("change", V, (ee) => {
                const ge = Gm(ee.currentTarget.value);
                ge !== null && e.run((re) => re.setFontSize(ge));
              }), A(W, E);
            }
          });
        };
        j(M, (G) => {
          e.can.text && G(H);
        });
      }
      var q = b(M, 2);
      {
        var R = (G) => {
          Ne(G, {
            label: "Text align",
            children: (W, J) => {
              zr(W, {
                ariaLabel: "Text alignment",
                get options() {
                  return wu;
                },
                get value() {
                  return e.summary.textAlign;
                },
                onPick: (E) => e.run((L) => L.setTextAlign(E))
              });
            }
          });
        };
        j(q, (G) => {
          e.can.textAlign && G(R);
        });
      }
      var K = b(q, 2);
      {
        var ie = (G) => {
          Ne(G, {
            label: "Vertical align",
            children: (W, J) => {
              zr(W, {
                ariaLabel: "Vertical text alignment",
                get options() {
                  return ku;
                },
                get value() {
                  return e.summary.verticalAlign;
                },
                onPick: (E) => e.run((L) => L.setVerticalAlign(E))
              });
            }
          });
        };
        j(K, (G) => {
          e.can.verticalAlign && G(ie);
        });
      }
      var ne = b(K, 2);
      {
        var $ = (G) => {
          Ne(G, {
            label: "Text wrap",
            children: (W, J) => {
              rn(W, {
                ariaLabel: "Text wrap",
                get options() {
                  return Vm;
                },
                get value() {
                  return s(n);
                },
                onPick: (E) => e.run((L) => L.setTextWrap(E === "wrap"))
              });
            }
          });
        };
        j(ne, (G) => {
          e.can.wrap && G($);
        });
      }
      A(S, T);
    }, O = (S) => {
      var T = rT(), M = Ue(T);
      {
        var H = (ne) => {
          Ne(ne, {
            label: "Shape",
            children: ($, G) => {
              zr($, {
                ariaLabel: "Shape",
                get options() {
                  return xu;
                },
                get value() {
                  return e.summary.figureKind;
                },
                onPick: (W) => e.onApply({ figureKind: W })
              });
            }
          });
        };
        j(M, (ne) => {
          e.can.figureKind && ne(H);
        });
      }
      var q = b(M, 2);
      {
        var R = (ne) => {
          Ne(ne, {
            label: "Sides",
            children: ($, G) => {
              var W = tT();
              N(W, "step", 1), Y(() => {
                N(W, "min", Xs.min), N(W, "max", Xs.max), _n(W, e.summary.figureSides ?? "");
              }), I("change", W, (J) => {
                const E = Number(J.currentTarget.value);
                Number.isFinite(E) && e.onApply({ figureSides: E });
              }), A($, W);
            }
          });
        };
        j(q, (ne) => {
          e.can.figureSides && ne(R);
        });
      }
      var K = b(q, 2);
      {
        var ie = (ne) => {
          {
            let $ = /* @__PURE__ */ X(() => `Ratio — ${s(u)}`);
            Ne(ne, {
              get label() {
                return s($);
              },
              children: (G, W) => {
                var J = nT();
                Y(() => {
                  N(J, "min", Jn.min), N(J, "max", Jn.max), N(J, "step", Jn.step), _n(J, s(d)), N(J, "aria-valuetext", s(u));
                }), I("input", J, (E) => {
                  f = !0, e.onPreview({ figureRatio: Number(E.currentTarget.value) });
                }), I("change", J, (E) => h(E.currentTarget.value)), I("pointerup", J, (E) => h(E.currentTarget.value)), A(G, J);
              }
            });
          }
        };
        j(K, (ne) => {
          e.can.figureRatio && ne(ie);
        });
      }
      A(S, T);
    }, C = (S) => {
      {
        let T = /* @__PURE__ */ X(() => `Opacity — ${s(a)}`);
        Ne(S, {
          get label() {
            return s(T);
          },
          children: (M, H) => {
            var q = oT();
            N(q, "min", 0), N(q, "max", 100), N(q, "step", 10), Y(() => {
              _n(q, s(i)), N(q, "aria-valuetext", s(a));
            }), I("input", q, (R) => {
              l = !0, e.onPreview({ opacity: Number(R.currentTarget.value) });
            }), I("change", q, (R) => c(R.currentTarget.value)), I("pointerup", q, (R) => c(R.currentTarget.value)), A(M, q);
          }
        });
      }
    }, P = (S) => {
      var T = Uh(), M = Ue(T);
      {
        var H = (J) => {
          Ne(J, {
            label: "Layers",
            children: (E, L) => {
              {
                let V = /* @__PURE__ */ X(() => [
                  {
                    label: `Send to back (${In("back")})`,
                    icon: "sendToBack",
                    onPick: () => e.run((ee) => ee.reorderSelection("back"))
                  },
                  {
                    label: `Send backward (${In("backward")})`,
                    icon: "backward",
                    onPick: () => e.run((ee) => ee.reorderSelection("backward"))
                  },
                  {
                    label: `Bring forward (${In("forward")})`,
                    icon: "forward",
                    onPick: () => e.run((ee) => ee.reorderSelection("forward"))
                  },
                  {
                    label: `Bring to front (${In("front")})`,
                    icon: "bringToFront",
                    onPick: () => e.run((ee) => ee.reorderSelection("front"))
                  }
                ]);
                Gn(E, {
                  get buttons() {
                    return s(V);
                  }
                });
              }
            }
          });
        };
        j(M, (J) => {
          e.can.layers && J(H);
        });
      }
      var q = b(M, 2);
      {
        var R = (J) => {
          Ne(J, {
            label: "Mirror",
            children: (E, L) => {
              Gn(E, {
                buttons: [
                  {
                    label: "Flip horizontally",
                    icon: "flipHorizontal",
                    onPick: () => e.run((V) => V.flipSelection("horizontal"))
                  },
                  {
                    label: "Flip vertically",
                    icon: "flipVertical",
                    onPick: () => e.run((V) => V.flipSelection("vertical"))
                  }
                ]
              });
            }
          });
        };
        j(q, (J) => {
          e.can.mirror && J(R);
        });
      }
      var K = b(q, 2);
      {
        var ie = (J) => {
          Ne(J, {
            label: "Group",
            children: (E, L) => {
              Gn(E, {
                buttons: [
                  {
                    label: "Group selection",
                    icon: "group",
                    onPick: () => e.run((V) => V.groupSelection())
                  },
                  {
                    label: "Ungroup selection",
                    icon: "ungroup",
                    onPick: () => e.run((V) => V.ungroupSelection())
                  }
                ]
              });
            }
          });
        };
        j(K, (J) => {
          e.can.group && J(ie);
        });
      }
      var ne = b(K, 2);
      {
        var $ = (J) => {
          Ne(J, {
            label: "Align",
            children: (E, L) => {
              Gn(E, {
                buttons: [
                  {
                    label: "Align left",
                    icon: "alignLeft",
                    onPick: () => e.run((V) => V.alignSelection("left"))
                  },
                  {
                    label: "Align horizontal centres",
                    icon: "alignCenterX",
                    onPick: () => e.run((V) => V.alignSelection("centerX"))
                  },
                  {
                    label: "Align right",
                    icon: "alignRight",
                    onPick: () => e.run((V) => V.alignSelection("right"))
                  },
                  {
                    label: "Align top",
                    icon: "alignTop",
                    onPick: () => e.run((V) => V.alignSelection("top"))
                  },
                  {
                    label: "Align vertical centres",
                    icon: "alignCenterY",
                    onPick: () => e.run((V) => V.alignSelection("centerY"))
                  },
                  {
                    label: "Align bottom",
                    icon: "alignBottom",
                    onPick: () => e.run((V) => V.alignSelection("bottom"))
                  }
                ]
              });
            }
          });
        };
        j(ne, (J) => {
          e.can.align && J($);
        });
      }
      var G = b(ne, 2);
      {
        var W = (J) => {
          Ne(J, {
            label: "Distribute",
            children: (E, L) => {
              Gn(E, {
                buttons: [
                  {
                    label: "Distribute horizontally",
                    icon: "distributeX",
                    onPick: () => e.run((V) => V.distributeSelection("x"))
                  },
                  {
                    label: "Distribute vertically",
                    icon: "distributeY",
                    onPick: () => e.run((V) => V.distributeSelection("y"))
                  }
                ]
              });
            }
          });
        };
        j(G, (J) => {
          e.can.distribute && J(W);
        });
      }
      A(S, T);
    };
    j(m, (S) => {
      e.section === "shape" ? S(w) : e.section === "arrow" ? S(y, 1) : e.section === "text" ? S(k, 2) : e.section === "figure" ? S(O, 3) : e.section === "opacity" ? S(C, 4) : e.section === "actions" && S(P, 5);
    });
  }
  A(t, p), it();
}
ct(["click", "change", "input", "pointerup"]);
const kv = 32, Sv = 6, jh = 9, xv = jh * kv + (jh - 1) * Sv, Ev = kv + Sv;
function iT(t) {
  return t >= xv + Ev;
}
function sT(t) {
  return t >= xv + 2 * Ev;
}
function aT(t, e) {
  const n = [];
  e.strokeColor && n.push("stroke"), e.backgroundColor && n.push("background"), (e.fill || e.strokeWidth || e.strokeStyle || e.sloppiness) && n.push("shape properties"), (e.arrowType || e.arrowheads) && n.push("arrow properties"), e.polygon && n.push("polygon"), (e.text || e.textAlign || e.verticalAlign || e.wrap) && n.push("text"), e.figureKind && n.push("figure"), e.opacity && n.push("opacity"), (e.layers || e.mirror || e.group || e.align || e.distribute) && n.push("layer actions");
  const r = iT(t), o = sT(t), i = ["undo", "redo"];
  return o && i.push("duplicate"), r && i.push("delete"), {
    left: n,
    right: i,
    overflow: [
      ...o ? [] : ["duplicate"],
      ...r ? [] : ["delete"]
    ]
  };
}
var Hh = /* @__PURE__ */ F('<div class="slot colour svelte-ig664m"><!></div>'), lT = /* @__PURE__ */ F('<button type="button" aria-label="Close shape into a filled polygon" title="Close the line into a filled shape"><!></button>'), cT = /* @__PURE__ */ F('<div class="slot pop svelte-ig664m"><button type="button" aria-haspopup="dialog"><!></button></div>'), uT = /* @__PURE__ */ F('<button type="button" class="tool svelte-ig664m" aria-label="Undo" title="Undo"><!></button>'), dT = /* @__PURE__ */ F('<button type="button" class="tool svelte-ig664m" aria-label="Redo" title="Redo"><!></button>'), fT = /* @__PURE__ */ F('<button type="button" class="tool svelte-ig664m" aria-label="Duplicate selection" title="Duplicate selection"><!></button>'), hT = /* @__PURE__ */ F('<button type="button" class="tool svelte-ig664m" aria-label="Delete selection" title="Delete selection"><!></button>'), gT = /* @__PURE__ */ F("<!> <!>", 1), pT = /* @__PURE__ */ F('<button type="button" class="sheet-action svelte-ig664m" aria-label="Duplicate selection"><!> <span>Duplicate</span></button>'), mT = /* @__PURE__ */ F('<button type="button" class="sheet-action svelte-ig664m" aria-label="Delete selection"><!> <span>Delete</span></button>'), vT = /* @__PURE__ */ F("<!> <!> <!>", 1), _T = /* @__PURE__ */ F('<div class="sheet draw-panel svelte-ig664m" role="dialog"><!></div>'), yT = /* @__PURE__ */ F('<div class="mobile-strip-row svelte-ig664m" role="toolbar" aria-label="Shape actions"><!> <span class="gap svelte-ig664m" aria-hidden="true"></span> <!></div> <!>', 1);
function bT(t, e) {
  ot(e, !0);
  let n = ke(e, "themeMode", 3, "light"), r = /* @__PURE__ */ B(null), o = /* @__PURE__ */ B(null), i = /* @__PURE__ */ B(!1), a = /* @__PURE__ */ B(0), l = /* @__PURE__ */ B(void 0);
  function c() {
    const G = s(l)?.parentElement ?? null;
    if (!G) {
      _(a, typeof window > "u" ? 0 : window.innerWidth, !0);
      return;
    }
    const W = getComputedStyle(G);
    _(a, G.clientWidth - parseFloat(W.paddingLeft || "0") - parseFloat(W.paddingRight || "0"));
  }
  bt(() => {
    if (!s(l)) return;
    c();
    const G = s(l).parentElement;
    if (!G) return;
    const W = new ResizeObserver(c);
    return W.observe(G), () => W.disconnect();
  });
  const d = /* @__PURE__ */ X(() => e.summary.count > 0 ? e.can : { ...e.can, strokeColor: !0, backgroundColor: !0 }), u = /* @__PURE__ */ X(() => aT(s(a), s(d))), f = /* @__PURE__ */ X(() => jo("stroke", e.summary.strokeDomain, n())), h = /* @__PURE__ */ X(() => jo("background", e.summary.backgroundDomain, n())), p = /* @__PURE__ */ X(() => e.engine?.getNextStyle() ?? null), m = /* @__PURE__ */ X(() => e.summary.count > 0 ? e.summary.strokeColor : s(p)?.strokeColor ?? null), w = /* @__PURE__ */ X(() => e.summary.count > 0 ? e.summary.backgroundColor : s(p)?.backgroundColor ?? null);
  function y(G) {
    return () => bu(e.engine?.colorCounts(G === "stroke" ? "strokeColor" : "backgroundColor") ?? []);
  }
  function k(G) {
    _(r, s(r) === G ? null : G, !0), _(o, null), _(i, !1);
  }
  function O(G) {
    const W = vr(G);
    W && s(l)?.contains(W) || (_(r, null), _(o, null), _(i, !1));
  }
  const C = /* @__PURE__ */ X(() => e.summary.isPolygon ?? !1);
  let P = 0;
  async function S(G) {
    const W = ++P;
    e.engine && (await Ho(document.fonts, e.engine.fontFamily(G ?? void 0)), W === P && e.run((J) => J.previewFontFamily(G ?? void 0)));
  }
  async function T(G) {
    e.engine && (P++, e.engine.previewFontFamily(void 0), await Ho(document.fonts, e.engine.fontFamily(G)), e.run((W) => W.setFontFamily(G)));
  }
  const M = {
    stroke: "Stroke",
    background: "Background",
    "shape properties": "Shape properties",
    "arrow properties": "Arrow properties",
    polygon: "Close shape",
    text: "Text properties",
    figure: "Figure properties",
    opacity: "Opacity",
    "layer actions": "Layer actions"
  }, H = {
    stroke: "rectangle",
    background: "rectangle",
    "shape properties": "rectangle",
    "arrow properties": "arrow",
    polygon: "polygonClosed",
    text: "text",
    figure: "figure",
    opacity: "opacity",
    "layer actions": "sendToBack"
  };
  var q = yT();
  Qe("pointerdown", $t, O);
  var R = Ue(q), K = z(R);
  Ze(K, 16, () => s(u).left, (G) => G, (G, W) => {
    var J = on(), E = Ue(J);
    {
      var L = (re) => {
        var se = Hh(), xe = z(se);
        {
          let be = /* @__PURE__ */ X(() => s(o) === "stroke"), Me = /* @__PURE__ */ X(() => y("stroke"));
          Zo(xe, {
            get label() {
              return s(f).label;
            },
            kind: "stroke",
            get value() {
              return s(m);
            },
            get picks() {
              return s(f).picks;
            },
            get hideTransparent() {
              return s(f).hideTransparent;
            },
            get open() {
              return s(be);
            },
            get customColors() {
              return s(Me);
            },
            onToggle: (Re) => _(o, Re ? "stroke" : null, !0),
            onPick: (Re) => {
              e.onApply({ strokeColor: Re }), _(o, null);
            },
            compact: !0
          });
        }
        A(re, se);
      }, V = (re) => {
        var se = Hh(), xe = z(se);
        {
          let be = /* @__PURE__ */ X(() => s(o) === "background"), Me = /* @__PURE__ */ X(() => y("background"));
          Zo(xe, {
            get label() {
              return s(h).label;
            },
            kind: "background",
            get value() {
              return s(w);
            },
            get picks() {
              return s(h).picks;
            },
            get hideTransparent() {
              return s(h).hideTransparent;
            },
            get open() {
              return s(be);
            },
            get customColors() {
              return s(Me);
            },
            onToggle: (Re) => _(o, Re ? "background" : null, !0),
            onPick: (Re) => {
              e.onApply({ backgroundColor: Re }), _(o, null);
            },
            compact: !0
          });
        }
        A(re, se);
      }, ee = (re) => {
        var se = lT();
        let xe;
        var be = z(se);
        lt(be, { name: "polygonClosed", size: 16 }), Y(() => {
          xe = Ce(se, 1, "tool svelte-ig664m", null, xe, { on: s(C) }), N(se, "aria-pressed", s(C));
        }), I("click", se, () => e.run((Me) => Me.togglePolygon())), A(re, se);
      }, ge = (re) => {
        var se = cT(), xe = z(se);
        let be;
        var Me = z(xe);
        lt(Me, {
          get name() {
            return H[W];
          },
          size: 16
        }), Y(() => {
          be = Ce(xe, 1, "tool svelte-ig664m", null, be, { on: s(r) === W }), N(xe, "aria-label", M[W]), N(xe, "aria-expanded", s(r) === W), N(xe, "title", M[W]);
        }), I("click", xe, () => k(W)), A(re, se);
      };
      j(E, (re) => {
        W === "stroke" ? re(L) : W === "background" ? re(V, 1) : W === "polygon" ? re(ee, 2) : re(ge, -1);
      });
    }
    A(G, J);
  });
  var ie = b(K, 4);
  Ze(ie, 16, () => s(u).right, (G) => G, (G, W) => {
    var J = on(), E = Ue(J);
    {
      var L = (re) => {
        var se = uT(), xe = z(se);
        lt(xe, { name: "undo", size: 16 }), I("click", se, () => e.run((be) => be.undo())), A(re, se);
      }, V = (re) => {
        var se = dT(), xe = z(se);
        lt(xe, { name: "redo", size: 16 }), I("click", se, () => e.run((be) => be.redo())), A(re, se);
      }, ee = (re) => {
        var se = on(), xe = Ue(se);
        {
          var be = (Me) => {
            var Re = fT(), Se = z(Re);
            lt(Se, { name: "copy", size: 16 }), I("click", Re, () => e.run((Z) => Z.duplicateSelection())), A(Me, Re);
          };
          j(xe, (Me) => {
            e.summary.count > 0 && Me(be);
          });
        }
        A(re, se);
      }, ge = (re) => {
        var se = on(), xe = Ue(se);
        {
          var be = (Me) => {
            var Re = hT(), Se = z(Re);
            lt(Se, { name: "trash", size: 16 }), I("click", Re, () => e.run((Z) => Z.deleteSelection())), A(Me, Re);
          };
          j(xe, (Me) => {
            e.summary.count > 0 && Me(be);
          });
        }
        A(re, se);
      };
      j(E, (re) => {
        W === "undo" ? re(L) : W === "redo" ? re(V, 1) : W === "duplicate" ? re(ee, 2) : W === "delete" && re(ge, 3);
      });
    }
    A(G, J);
  }), Je(R, (G) => _(l, G), () => s(l));
  var ne = b(R, 2);
  {
    var $ = (G) => {
      var W = _T(), J = z(W);
      {
        var E = (se) => {
          Rn(se, {
            section: "shape",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, L = (se) => {
          Rn(se, {
            section: "arrow",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, V = (se) => {
          var xe = gT(), be = Ue(xe);
          {
            var Me = (Se) => {
              Ne(Se, {
                label: "Font family",
                children: (Z, _e) => {
                  Lu(Z, {
                    get value() {
                      return e.summary.fontFamily;
                    },
                    get open() {
                      return s(i);
                    },
                    sceneFamilies: () => e.engine?.sceneFontFamilies() ?? [],
                    stackOf: (ve) => e.engine?.fontFamily(ve) ?? "sans-serif",
                    onToggle: (ve) => _(i, ve, !0),
                    onPick: (ve) => {
                      T(ve);
                    },
                    onPreview: (ve) => {
                      S(ve);
                    }
                  });
                }
              });
            };
            j(be, (Se) => {
              e.can.text && Se(Me);
            });
          }
          var Re = b(be, 2);
          Rn(Re, {
            section: "text",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          }), A(se, xe);
        }, ee = (se) => {
          Rn(se, {
            section: "figure",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, ge = (se) => {
          Rn(se, {
            section: "opacity",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, re = (se) => {
          var xe = vT(), be = Ue(xe);
          Rn(be, {
            section: "actions",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
          var Me = b(be, 2);
          {
            var Re = (Le) => {
              Ne(Le, {
                label: "Duplicate",
                children: (Q, de) => {
                  var me = pT(), Pe = z(me);
                  lt(Pe, { name: "copy", size: 14 }), I("click", me, () => e.run((Ie) => Ie.duplicateSelection())), A(Q, me);
                }
              });
            }, Se = /* @__PURE__ */ X(() => s(u).overflow.includes("duplicate"));
            j(Me, (Le) => {
              s(Se) && Le(Re);
            });
          }
          var Z = b(Me, 2);
          {
            var _e = (Le) => {
              Ne(Le, {
                label: "Delete",
                children: (Q, de) => {
                  var me = mT(), Pe = z(me);
                  lt(Pe, { name: "trash", size: 14 }), I("click", me, () => e.run((Ie) => Ie.deleteSelection())), A(Q, me);
                }
              });
            }, ve = /* @__PURE__ */ X(() => s(u).overflow.includes("delete"));
            j(Z, (Le) => {
              s(ve) && Le(_e);
            });
          }
          A(se, xe);
        };
        j(J, (se) => {
          s(r) === "shape properties" ? se(E) : s(r) === "arrow properties" ? se(L, 1) : s(r) === "text" ? se(V, 2) : s(r) === "figure" ? se(ee, 3) : s(r) === "opacity" ? se(ge, 4) : s(r) === "layer actions" && se(re, 5);
        });
      }
      Y(() => N(W, "aria-label", M[s(r)])), A(G, W);
    };
    j(ne, (G) => {
      s(r) && G($);
    });
  }
  A(t, q), it();
}
ct(["click"]);
function wT(t, e) {
  const n = [];
  return t.strokeColor && n.push("stroke"), t.backgroundColor && n.push("background"), (t.fill || t.strokeWidth || t.strokeStyle || t.sloppiness || t.roundness || t.opacity) && n.push("shape properties"), (t.arrowType || t.arrowheads) && n.push("arrow properties"), t.text && n.push("font family"), (t.text || t.textAlign || t.verticalAlign || t.wrap) && n.push("text properties"), e && (n.push("duplicate"), n.push("delete"), n.push("actions")), n;
}
var Wh = /* @__PURE__ */ F('<button type="button" class="tool svelte-12qp9hc"><!></button>'), kT = /* @__PURE__ */ F('<button type="button" aria-haspopup="dialog"><!></button>'), ST = /* @__PURE__ */ F('<div class="item svelte-12qp9hc"><!></div>'), xT = /* @__PURE__ */ F("<!> <!>", 1), ET = /* @__PURE__ */ F('<div class="popover draw-panel svelte-12qp9hc" popover="manual" role="dialog" tabindex="-1"><!></div>'), TT = /* @__PURE__ */ F('<aside class="draw-panel panel svelte-12qp9hc" aria-label="Style panel" data-viewport-ui="side"><div class="column svelte-12qp9hc"></div></aside> <!>', 1);
function CT(t, e) {
  ot(e, !0);
  let n = ke(e, "themeMode", 3, "light"), r = /* @__PURE__ */ B(null), o = /* @__PURE__ */ B(null), i = /* @__PURE__ */ B(!1), a = /* @__PURE__ */ B(ft({ left: 0, top: 0 })), l = /* @__PURE__ */ B(void 0), c = /* @__PURE__ */ B(void 0), d = null;
  const u = /* @__PURE__ */ X(() => wT(e.can, e.summary.count > 0)), f = /* @__PURE__ */ X(() => jo("stroke", e.summary.strokeDomain, n())), h = /* @__PURE__ */ X(() => jo("background", e.summary.backgroundDomain, n()));
  function p(R) {
    return () => bu(e.engine?.colorCounts(R === "stroke" ? "strokeColor" : "backgroundColor") ?? []);
  }
  const m = {
    stroke: "Stroke",
    background: "Background",
    "shape properties": "Shape properties",
    "arrow properties": "Arrow properties",
    "font family": "Font family",
    "text properties": "Text properties",
    duplicate: "Duplicate selection",
    delete: "Delete selection",
    actions: "Selection actions"
  }, w = {
    stroke: "rectangle",
    background: "rectangle",
    "shape properties": "adjustments",
    "arrow properties": "arrow",
    "font family": "text",
    "text properties": "textSize",
    duplicate: "copy",
    delete: "trash",
    actions: "more"
  };
  function y(R, K) {
    if (_(o, null), _(i, !1), s(r) === R) {
      _(r, null);
      return;
    }
    const ie = K.currentTarget;
    if (ie) {
      const G = ie.getBoundingClientRect();
      let W = G.right + 8;
      W + 208 > window.innerWidth - 8 && (W = G.left - 208 - 8), W + 208 > window.innerWidth - 8 && (W = window.innerWidth - 208 - 8), _(
        a,
        {
          left: Math.max(8, W),
          top: Math.max(8, Math.min(G.top - 8, window.innerHeight - 320 - 8))
        },
        !0
      );
    }
    _(r, R, !0);
  }
  bt(() => {
    if (s(r))
      return Br().then(() => {
        s(c)?.showPopover(), d = yn(s(c));
      }), () => {
        d?.(), d = null;
      };
  });
  function k(R) {
    const K = vr(R);
    K && (s(l)?.contains(K) || s(c)?.contains(K)) || (_(r, null), _(o, null), _(i, !1));
  }
  let O = 0;
  async function C(R) {
    const K = ++O;
    e.engine && (await Ho(document.fonts, e.engine.fontFamily(R ?? void 0)), K === O && e.run((ie) => ie.previewFontFamily(R ?? void 0)));
  }
  async function P(R) {
    e.engine && (O++, e.engine.previewFontFamily(void 0), await Ho(document.fonts, e.engine.fontFamily(R)), e.run((K) => K.setFontFamily(R)));
  }
  var S = TT();
  Qe("pointerdown", $t, k);
  var T = Ue(S), M = z(T);
  Ze(M, 20, () => s(u), (R) => R, (R, K) => {
    var ie = ST(), ne = z(ie);
    {
      var $ = (V) => {
        {
          let ee = /* @__PURE__ */ X(() => s(o) === "stroke"), ge = /* @__PURE__ */ X(() => p("stroke"));
          Zo(V, {
            get label() {
              return s(f).label;
            },
            kind: "stroke",
            get value() {
              return e.summary.strokeColor;
            },
            get picks() {
              return s(f).picks;
            },
            get hideTransparent() {
              return s(f).hideTransparent;
            },
            get open() {
              return s(ee);
            },
            get customColors() {
              return s(ge);
            },
            onToggle: (re) => _(o, re ? "stroke" : null, !0),
            onPick: (re) => {
              e.onApply({ strokeColor: re }), _(o, null);
            },
            compact: !0
          });
        }
      }, G = (V) => {
        {
          let ee = /* @__PURE__ */ X(() => s(o) === "background"), ge = /* @__PURE__ */ X(() => p("background"));
          Zo(V, {
            get label() {
              return s(h).label;
            },
            kind: "background",
            get value() {
              return e.summary.backgroundColor;
            },
            get picks() {
              return s(h).picks;
            },
            get hideTransparent() {
              return s(h).hideTransparent;
            },
            get open() {
              return s(ee);
            },
            get customColors() {
              return s(ge);
            },
            onToggle: (re) => _(o, re ? "background" : null, !0),
            onPick: (re) => {
              e.onApply({ backgroundColor: re }), _(o, null);
            },
            compact: !0
          });
        }
      }, W = (V) => {
        Lu(V, {
          get value() {
            return e.summary.fontFamily;
          },
          get open() {
            return s(i);
          },
          sceneFamilies: () => e.engine?.sceneFontFamilies() ?? [],
          stackOf: (ee) => e.engine?.fontFamily(ee) ?? "sans-serif",
          onToggle: (ee) => _(i, ee, !0),
          onPick: (ee) => {
            P(ee);
          },
          onPreview: (ee) => {
            C(ee);
          },
          compact: !0
        });
      }, J = (V) => {
        var ee = Wh(), ge = z(ee);
        lt(ge, {
          get name() {
            return w[K];
          },
          size: 16
        }), Y(() => {
          N(ee, "aria-label", m[K]), N(ee, "title", m[K]);
        }), I("click", ee, () => e.run((re) => re.duplicateSelection())), A(V, ee);
      }, E = (V) => {
        var ee = Wh(), ge = z(ee);
        lt(ge, {
          get name() {
            return w[K];
          },
          size: 16
        }), Y(() => {
          N(ee, "aria-label", m[K]), N(ee, "title", m[K]);
        }), I("click", ee, () => e.run((re) => re.deleteSelection())), A(V, ee);
      }, L = (V) => {
        var ee = kT();
        let ge;
        var re = z(ee);
        lt(re, {
          get name() {
            return w[K];
          },
          size: 16
        }), Y(() => {
          ge = Ce(ee, 1, "tool svelte-12qp9hc", null, ge, { on: s(r) === K }), N(ee, "aria-label", m[K]), N(ee, "aria-expanded", s(r) === K), N(ee, "title", m[K]);
        }), I("click", ee, (se) => y(K, se)), A(V, ee);
      };
      j(ne, (V) => {
        K === "stroke" ? V($) : K === "background" ? V(G, 1) : K === "font family" ? V(W, 2) : K === "duplicate" ? V(J, 3) : K === "delete" ? V(E, 4) : V(L, -1);
      });
    }
    A(R, ie);
  }), Je(T, (R) => _(l, R), () => s(l));
  var H = b(T, 2);
  {
    var q = (R) => {
      var K = ET();
      let ie;
      var ne = z(K);
      {
        var $ = (E) => {
          var L = xT(), V = Ue(L);
          Rn(V, {
            section: "shape",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
          var ee = b(V, 2);
          Rn(ee, {
            section: "opacity",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          }), A(E, L);
        }, G = (E) => {
          Rn(E, {
            section: "arrow",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, W = (E) => {
          Rn(E, {
            section: "text",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        }, J = (E) => {
          Rn(E, {
            section: "actions",
            get summary() {
              return e.summary;
            },
            get can() {
              return e.can;
            },
            get engine() {
              return e.engine;
            },
            get onApply() {
              return e.onApply;
            },
            get onPreview() {
              return e.onPreview;
            },
            get run() {
              return e.run;
            }
          });
        };
        j(ne, (E) => {
          s(r) === "shape properties" ? E($) : s(r) === "arrow properties" ? E(G, 1) : s(r) === "text properties" ? E(W, 2) : s(r) === "actions" && E(J, 3);
        });
      }
      Je(K, (E) => _(c, E), () => s(c)), Y(() => {
        N(K, "aria-label", m[s(r)]), ie = ht(K, "", ie, { left: `${s(a).left}px`, top: `${s(a).top}px` });
      }), I("keydown", K, (E) => {
        E.key === "Escape" && (E.stopPropagation(), _(r, null));
      }), A(R, K);
    };
    j(H, (R) => {
      s(r) && R(q);
    });
  }
  A(t, S), it();
}
ct(["click", "keydown"]);
var AT = /* @__PURE__ */ F('<button type="button" class="preset-chip svelte-ooemhm"> </button>'), PT = /* @__PURE__ */ F('<input type="text" class="preset-rename svelte-ooemhm"/>'), IT = /* @__PURE__ */ F('<span class="preset-chip preset-chip--user svelte-ooemhm"><button type="button" class="svelte-ooemhm"> </button> <button type="button" class="preset-chip__action svelte-ooemhm">✎</button> <button type="button" class="preset-chip__action svelte-ooemhm">✕</button></span>'), zT = /* @__PURE__ */ F('<div class="preset-row svelte-ooemhm"><!> <!> <button type="button" class="preset-chip preset-chip--add svelte-ooemhm" aria-label="Save current style as a preset">+</button></div>'), MT = /* @__PURE__ */ F('<button type="button" title="Close the line into a filled shape"><!></button>'), OT = /* @__PURE__ */ F('<input type="number" aria-label="Sides" placeholder="mixed"/>'), FT = /* @__PURE__ */ F('<input type="range" aria-label="Ratio" class="svelte-ooemhm"/>'), RT = /* @__PURE__ */ F('<div class="font-size svelte-ooemhm"><!> <input type="number" aria-label="Font size in pixels" placeholder="mixed" class="svelte-ooemhm"/></div>'), LT = /* @__PURE__ */ F("<!> <!>", 1), DT = /* @__PURE__ */ F('<button type="button" role="radio"><span> </span></button>'), NT = /* @__PURE__ */ F('<div class="heads svelte-ooemhm" role="radiogroup"></div>'), BT = /* @__PURE__ */ F('<div class="arrowheads svelte-ooemhm"></div>'), UT = /* @__PURE__ */ F('<input type="range" aria-label="Opacity" class="svelte-ooemhm"/>'), jT = /* @__PURE__ */ F('<aside class="draw-panel panel svelte-ooemhm" aria-label="Style inspector" data-viewport-ui="side"><div class="title svelte-ooemhm"> </div> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!></aside>');
function HT(t, e) {
  ot(e, !0);
  let n = ke(e, "themeMode", 3, "light"), r = ke(e, "builtinPresets", 19, () => []), o = ke(e, "userPresets", 19, () => []), i = /* @__PURE__ */ B(null), a = /* @__PURE__ */ B("");
  function l(D) {
    _(i, D.id, !0), _(a, D.name, !0);
  }
  function c() {
    if (!s(i)) return;
    const D = s(a).trim();
    D && e.onRenamePreset?.(s(i), D), _(i, null);
  }
  const d = /* @__PURE__ */ X(() => jo("stroke", e.summary.strokeDomain, n())), u = /* @__PURE__ */ X(() => jo("background", e.summary.backgroundDomain, n())), f = /* @__PURE__ */ X(() => {
    if (e.summary.count > 1) return `${e.summary.count} selected`;
    const D = e.summary.count === 1 ? e.summary.kinds[0] : void 0;
    return D ? D.charAt(0).toUpperCase() + D.slice(1) : "Style";
  });
  function h(D) {
    return () => bu(e.engine?.colorCounts(D === "stroke" ? "strokeColor" : "backgroundColor") ?? []);
  }
  const p = /* @__PURE__ */ X(() => e.summary.isPolygon ?? !1);
  let m = !1;
  function w(D) {
    m && (m = !1, e.onApply({ opacity: Number(D) }));
  }
  const y = /* @__PURE__ */ X(() => e.summary.opacity ?? e.engine?.getNextStyle().opacity ?? 100), k = /* @__PURE__ */ X(() => e.summary.opacity === null ? "mixed" : `${e.summary.opacity}%`);
  let O = !1;
  function C(D) {
    O && (O = !1, e.onApply({ figureRatio: Number(D) }));
  }
  const P = /* @__PURE__ */ X(() => e.summary.figureRatio ?? (Jn.min + Jn.max) / 2), S = /* @__PURE__ */ X(() => e.summary.figureRatio === null ? "mixed" : e.summary.figureRatio.toFixed(2)), T = /* @__PURE__ */ X(() => [
    { end: "start", value: e.summary.startArrowhead },
    { end: "end", value: e.summary.endArrowhead }
  ]);
  function M(D, oe) {
    e.run((Oe) => Oe.setArrowheads({ [D]: oe }));
  }
  let H = 0;
  async function q(D) {
    const oe = ++H;
    e.engine && (D !== null && await Ho(document.fonts, e.engine.fontFamily(D)), oe === H && e.run((Oe) => Oe.previewFontFamily(D ?? void 0)));
  }
  async function R(D) {
    e.engine && (H++, e.engine.previewFontFamily(void 0), await Ho(document.fonts, e.engine.fontFamily(D)), e.run((oe) => oe.setFontFamily(D)));
  }
  const K = /* @__PURE__ */ X(() => Jm(e.summary));
  function ie(D) {
    e.run((oe) => oe.setTextWrap(D === "wrap"));
  }
  var ne = jT(), $ = z(ne), G = ae($, !0), W = b($, 2);
  Ne(W, {
    label: "Presets",
    children: (D, oe) => {
      var Oe = zT(), ce = z(Oe);
      Ze(ce, 17, r, (yt) => yt.id, (yt, nt) => {
        var st = AT(), Et = ae(st, !0);
        Y(() => {
          N(st, "title", s(nt).name), le(Et, s(nt).name);
        }), I("click", st, () => e.onApplyPreset?.(s(nt))), A(yt, st);
      });
      var Ee = b(ce, 2);
      Ze(Ee, 17, o, (yt) => yt.id, (yt, nt) => {
        var st = on(), Et = Ue(st);
        {
          var en = (hn) => {
            var gn = PT();
            ou(gn, !0), Y(() => N(gn, "aria-label", `Rename ${s(nt).name}`)), Qe("blur", gn, c), I("keydown", gn, (mt) => {
              mt.key === "Enter" ? c() : mt.key === "Escape" && _(i, null);
            }), Zi(gn, () => s(a), (mt) => _(a, mt)), A(hn, gn);
          }, kn = (hn) => {
            var gn = IT(), mt = z(gn), _r = ae(mt, !0), Zr = b(mt, 2), fo = b(Zr, 2);
            Y(() => {
              N(mt, "title", s(nt).name), le(_r, s(nt).name), N(Zr, "aria-label", `Rename ${s(nt).name}`), N(fo, "aria-label", `Delete ${s(nt).name}`);
            }), I("click", mt, () => e.onApplyPreset?.(s(nt))), I("click", Zr, () => l(s(nt))), I("click", fo, () => e.onDeletePreset?.(s(nt).id)), A(hn, gn);
          };
          j(Et, (hn) => {
            s(i) === s(nt).id ? hn(en) : hn(kn, -1);
          });
        }
        A(yt, st);
      });
      var Ye = b(Ee, 2);
      I("click", Ye, () => e.onSavePreset?.()), A(D, Oe);
    }
  });
  var J = b(W, 2);
  {
    var E = (D) => {
      Ne(D, {
        get label() {
          return s(d).label;
        },
        children: (oe, Oe) => {
          {
            let ce = /* @__PURE__ */ X(() => e.openPicker === "stroke"), Ee = /* @__PURE__ */ X(() => h("stroke"));
            Zo(oe, {
              get label() {
                return s(d).label;
              },
              kind: "stroke",
              get value() {
                return e.summary.strokeColor;
              },
              get picks() {
                return s(d).picks;
              },
              get hideTransparent() {
                return s(d).hideTransparent;
              },
              get open() {
                return s(ce);
              },
              get customColors() {
                return s(Ee);
              },
              onToggle: (Ye) => e.onOpenPicker(Ye ? "stroke" : null),
              onPick: (Ye) => e.onApply({ strokeColor: Ye })
            });
          }
        }
      });
    };
    j(J, (D) => {
      e.can.strokeColor && D(E);
    });
  }
  var L = b(J, 2);
  {
    var V = (D) => {
      Ne(D, {
        get label() {
          return s(u).label;
        },
        children: (oe, Oe) => {
          {
            let ce = /* @__PURE__ */ X(() => e.openPicker === "background"), Ee = /* @__PURE__ */ X(() => h("background"));
            Zo(oe, {
              get label() {
                return s(u).label;
              },
              kind: "background",
              get value() {
                return e.summary.backgroundColor;
              },
              get picks() {
                return s(u).picks;
              },
              get hideTransparent() {
                return s(u).hideTransparent;
              },
              get open() {
                return s(ce);
              },
              get customColors() {
                return s(Ee);
              },
              onToggle: (Ye) => e.onOpenPicker(Ye ? "background" : null),
              onPick: (Ye) => e.onApply({ backgroundColor: Ye })
            });
          }
        }
      });
    };
    j(L, (D) => {
      e.can.backgroundColor && D(V);
    });
  }
  var ee = b(L, 2);
  {
    var ge = (D) => {
      Ne(D, {
        label: "Fill style",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Fill style",
            get options() {
              return Zm;
            },
            get value() {
              return e.summary.fillStyle;
            },
            onPick: (ce) => e.onApply({ fillStyle: ce })
          });
        }
      });
    };
    j(ee, (D) => {
      e.can.fill && D(ge);
    });
  }
  var re = b(ee, 2);
  {
    var se = (D) => {
      Ne(D, {
        label: "Width",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Stroke width",
            get options() {
              return Um;
            },
            get value() {
              return e.summary.strokeWidth;
            },
            onPick: (ce) => e.onApply({ strokeWidth: Number(ce) })
          });
        }
      });
    };
    j(re, (D) => {
      e.can.strokeWidth && D(se);
    });
  }
  var xe = b(re, 2);
  {
    var be = (D) => {
      Ne(D, {
        label: "Stroke style",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Stroke style",
            get options() {
              return jm;
            },
            get value() {
              return e.summary.strokeStyle;
            },
            onPick: (ce) => e.onApply({ strokeStyle: ce })
          });
        }
      });
    };
    j(xe, (D) => {
      e.can.strokeStyle && D(be);
    });
  }
  var Me = b(xe, 2);
  {
    var Re = (D) => {
      Ne(D, {
        label: "Sloppiness",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Sloppiness",
            get options() {
              return Hm;
            },
            get value() {
              return e.summary.roughness;
            },
            onPick: (ce) => e.onApply({ roughness: Number(ce) })
          });
        }
      });
    };
    j(Me, (D) => {
      e.can.sloppiness && D(Re);
    });
  }
  var Se = b(Me, 2);
  {
    var Z = (D) => {
      Ne(D, {
        label: "Edges",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Edges",
            get options() {
              return Wm;
            },
            get value() {
              return e.summary.edges;
            },
            onPick: (ce) => e.onApply({ roundness: Ys(ce === "round" ? "round" : "sharp") })
          });
        }
      });
    };
    j(Se, (D) => {
      e.can.roundness && D(Z);
    });
  }
  var _e = b(Se, 2);
  {
    var ve = (D) => {
      Ne(D, {
        label: "Close shape",
        children: (oe, Oe) => {
          var ce = MT();
          let Ee;
          var Ye = z(ce);
          lt(Ye, { name: "polygonClosed", size: 14 }), Y(() => {
            Ee = Ce(ce, 1, "polygon-toggle svelte-ooemhm", null, Ee, { on: s(p) }), N(ce, "aria-pressed", s(p)), N(ce, "aria-label", `Close shape into a filled polygon — ${s(p) ? "on" : "off"}`);
          }), I("mousedown", ce, (yt) => yt.preventDefault()), I("click", ce, () => e.run((yt) => yt.togglePolygon())), A(oe, ce);
        }
      });
    };
    j(_e, (D) => {
      e.can.polygon && D(ve);
    });
  }
  var Le = b(_e, 2);
  {
    var Q = (D) => {
      Ne(D, {
        label: "Arrow type",
        children: (oe, Oe) => {
          zr(oe, {
            ariaLabel: "Arrow type",
            get options() {
              return Su;
            },
            get value() {
              return e.summary.arrowType;
            },
            onPick: (ce) => e.run((Ee) => Ee.setArrowType(ce))
          });
        }
      });
    };
    j(Le, (D) => {
      e.can.arrowType && D(Q);
    });
  }
  var de = b(Le, 2);
  {
    var me = (D) => {
      Ne(D, {
        label: "Shape",
        children: (oe, Oe) => {
          zr(oe, {
            ariaLabel: "Shape",
            get options() {
              return xu;
            },
            get value() {
              return e.summary.figureKind;
            },
            onPick: (ce) => e.onApply({ figureKind: ce })
          });
        }
      });
    };
    j(de, (D) => {
      e.can.figureKind && D(me);
    });
  }
  var Pe = b(de, 2);
  {
    var Ie = (D) => {
      Ne(D, {
        label: "Sides",
        children: (oe, Oe) => {
          var ce = OT();
          N(ce, "step", 1), Y(() => {
            N(ce, "min", Xs.min), N(ce, "max", Xs.max), _n(ce, e.summary.figureSides ?? "");
          }), I("change", ce, (Ee) => {
            const Ye = Number(Ee.currentTarget.value);
            Number.isFinite(Ye) && e.onApply({ figureSides: Ye });
          }), A(oe, ce);
        }
      });
    };
    j(Pe, (D) => {
      e.can.figureSides && D(Ie);
    });
  }
  var Ke = b(Pe, 2);
  {
    var De = (D) => {
      {
        let oe = /* @__PURE__ */ X(() => `Ratio — ${s(S)}`);
        Ne(D, {
          get label() {
            return s(oe);
          },
          children: (Oe, ce) => {
            var Ee = FT();
            Y(() => {
              N(Ee, "min", Jn.min), N(Ee, "max", Jn.max), N(Ee, "step", Jn.step), _n(Ee, s(P)), N(Ee, "aria-valuetext", s(S));
            }), I("input", Ee, (Ye) => {
              O = !0, e.onPreview({ figureRatio: Number(Ye.currentTarget.value) });
            }), I("change", Ee, (Ye) => C(Ye.currentTarget.value)), I("pointerup", Ee, (Ye) => C(Ye.currentTarget.value)), A(Oe, Ee);
          }
        });
      }
    };
    j(Ke, (D) => {
      e.can.figureRatio && D(De);
    });
  }
  var We = b(Ke, 2);
  {
    var Ge = (D) => {
      var oe = LT(), Oe = Ue(oe);
      Ne(Oe, {
        label: "Font family",
        children: (Ee, Ye) => {
          {
            let yt = /* @__PURE__ */ X(() => e.openPicker === "font");
            Lu(Ee, {
              get value() {
                return e.summary.fontFamily;
              },
              get open() {
                return s(yt);
              },
              sceneFamilies: () => e.engine?.sceneFontFamilies() ?? [],
              stackOf: (nt) => e.engine?.fontFamily(nt) ?? "sans-serif",
              onToggle: (nt) => e.onOpenPicker(nt ? "font" : null),
              onPick: (nt) => {
                R(nt);
              },
              onPreview: (nt) => {
                q(nt);
              }
            });
          }
        }
      });
      var ce = b(Oe, 2);
      Ne(ce, {
        label: "Font size",
        children: (Ee, Ye) => {
          var yt = RT(), nt = z(yt);
          rn(nt, {
            ariaLabel: "Font size",
            get options() {
              return Km;
            },
            get value() {
              return e.summary.fontSize;
            },
            onPick: (Et) => e.run((en) => en.setFontSize(Number(Et)))
          });
          var st = b(nt, 2);
          N(st, "min", 1), N(st, "max", 1e3), N(st, "step", 1), Y(() => _n(st, e.summary.fontSize ?? "")), I("change", st, (Et) => {
            const en = Gm(Et.currentTarget.value);
            en !== null && e.run((kn) => kn.setFontSize(en));
          }), A(Ee, yt);
        }
      }), A(D, oe);
    };
    j(We, (D) => {
      e.can.text && D(Ge);
    });
  }
  var Ve = b(We, 2);
  {
    var dt = (D) => {
      Ne(D, {
        label: "Text align",
        children: (oe, Oe) => {
          zr(oe, {
            ariaLabel: "Text alignment",
            get options() {
              return wu;
            },
            get value() {
              return e.summary.textAlign;
            },
            onPick: (ce) => e.run((Ee) => Ee.setTextAlign(ce))
          });
        }
      });
    };
    j(Ve, (D) => {
      e.can.text && e.can.textAlign && D(dt);
    });
  }
  var _t = b(Ve, 2);
  {
    var Ot = (D) => {
      Ne(D, {
        label: "Vertical align",
        children: (oe, Oe) => {
          zr(oe, {
            ariaLabel: "Vertical text alignment",
            get options() {
              return ku;
            },
            get value() {
              return e.summary.verticalAlign;
            },
            onPick: (ce) => e.run((Ee) => Ee.setVerticalAlign(ce))
          });
        }
      });
    };
    j(_t, (D) => {
      e.can.verticalAlign && D(Ot);
    });
  }
  var At = b(_t, 2);
  {
    var Rt = (D) => {
      Ne(D, {
        label: "Text wrap",
        children: (oe, Oe) => {
          rn(oe, {
            ariaLabel: "Text wrap",
            get options() {
              return Vm;
            },
            get value() {
              return s(K);
            },
            onPick: (ce) => ie(ce === "wrap" ? "wrap" : "grow")
          });
        }
      });
    };
    j(At, (D) => {
      e.can.wrap && D(Rt);
    });
  }
  var fe = b(At, 2);
  {
    var pe = (D) => {
      Ne(D, {
        label: "Arrowheads",
        children: (oe, Oe) => {
          var ce = BT();
          Ze(ce, 21, () => s(T), (Ee) => Ee.end, (Ee, Ye) => {
            var yt = NT();
            Ze(yt, 20, () => mu, (nt) => nt, (nt, st) => {
              var Et = DT();
              let en;
              var kn = z(Et);
              let hn;
              var gn = ae(kn, !0);
              Y(() => {
                N(Et, "aria-checked", s(Ye).value === st), N(Et, "aria-label", `${s(Ye).end === "start" ? "Start" : "End"} ${Uo[st]}`), N(Et, "title", Uo[st]), en = Ce(Et, 1, "svelte-ooemhm", null, en, { on: s(Ye).value === st }), hn = Ce(kn, 1, "svelte-ooemhm", null, hn, { flip: s(Ye).end === "start" }), le(gn, vu[st]);
              }), I("mousedown", Et, (mt) => mt.preventDefault()), I("click", Et, () => M(s(Ye).end, st)), A(nt, Et);
            }), Y(() => N(yt, "aria-label", `${s(Ye).end === "start" ? "Start" : "End"} arrowhead`)), A(Ee, yt);
          }), A(oe, ce);
        }
      });
    };
    j(fe, (D) => {
      e.can.arrowheads && D(pe);
    });
  }
  var et = b(fe, 2);
  {
    var xt = (D) => {
      {
        let oe = /* @__PURE__ */ X(() => `Opacity — ${s(k)}`);
        Ne(D, {
          get label() {
            return s(oe);
          },
          children: (Oe, ce) => {
            var Ee = UT();
            N(Ee, "min", 0), N(Ee, "max", 100), N(Ee, "step", 10), Y(() => {
              _n(Ee, s(y)), N(Ee, "aria-valuetext", s(k));
            }), I("input", Ee, (Ye) => {
              m = !0, e.onPreview({ opacity: Number(Ye.currentTarget.value) });
            }), I("change", Ee, (Ye) => w(Ye.currentTarget.value)), I("pointerup", Ee, (Ye) => w(Ye.currentTarget.value)), A(Oe, Ee);
          }
        });
      }
    };
    j(et, (D) => {
      e.can.opacity && D(xt);
    });
  }
  var ye = b(et, 2);
  {
    var tt = (D) => {
      Ne(D, {
        label: "Layers",
        children: (oe, Oe) => {
          {
            let ce = /* @__PURE__ */ X(() => [
              {
                label: `Send to back (${In("back")})`,
                icon: "sendToBack",
                onPick: () => e.run((Ee) => Ee.reorderSelection("back"))
              },
              {
                label: `Send backward (${In("backward")})`,
                icon: "backward",
                onPick: () => e.run((Ee) => Ee.reorderSelection("backward"))
              },
              {
                label: `Bring forward (${In("forward")})`,
                icon: "forward",
                onPick: () => e.run((Ee) => Ee.reorderSelection("forward"))
              },
              {
                label: `Bring to front (${In("front")})`,
                icon: "bringToFront",
                onPick: () => e.run((Ee) => Ee.reorderSelection("front"))
              }
            ]);
            Gn(oe, {
              get buttons() {
                return s(ce);
              }
            });
          }
        }
      });
    };
    j(ye, (D) => {
      e.can.layers && e.engine && D(tt);
    });
  }
  var qe = b(ye, 2);
  {
    var Vt = (D) => {
      Ne(D, {
        label: "Mirror",
        children: (oe, Oe) => {
          Gn(oe, {
            buttons: [
              {
                label: "Flip horizontally",
                icon: "flipHorizontal",
                onPick: () => e.run((ce) => ce.flipSelection("horizontal"))
              },
              {
                label: "Flip vertically",
                icon: "flipVertical",
                onPick: () => e.run((ce) => ce.flipSelection("vertical"))
              }
            ]
          });
        }
      });
    };
    j(qe, (D) => {
      e.can.mirror && e.engine && D(Vt);
    });
  }
  var Pt = b(qe, 2);
  {
    var Be = (D) => {
      Ne(D, {
        label: "Group",
        children: (oe, Oe) => {
          Gn(oe, {
            buttons: [
              {
                label: "Group selection",
                icon: "group",
                onPick: () => e.run((ce) => ce.groupSelection())
              },
              {
                label: "Ungroup selection",
                icon: "ungroup",
                onPick: () => e.run((ce) => ce.ungroupSelection())
              }
            ]
          });
        }
      });
    };
    j(Pt, (D) => {
      e.engine && (e.summary.count >= 2 || e.summary.isGroup) && D(Be);
    });
  }
  var Ht = b(Pt, 2);
  {
    var bn = (D) => {
      Ne(D, {
        label: "Align",
        children: (oe, Oe) => {
          Gn(oe, {
            buttons: [
              {
                label: "Align left",
                icon: "alignLeft",
                onPick: () => e.run((ce) => ce.alignSelection("left"))
              },
              {
                label: "Align horizontal centres",
                icon: "alignCenterX",
                onPick: () => e.run((ce) => ce.alignSelection("centerX"))
              },
              {
                label: "Align right",
                icon: "alignRight",
                onPick: () => e.run((ce) => ce.alignSelection("right"))
              },
              {
                label: "Align top",
                icon: "alignTop",
                onPick: () => e.run((ce) => ce.alignSelection("top"))
              },
              {
                label: "Align vertical centres",
                icon: "alignCenterY",
                onPick: () => e.run((ce) => ce.alignSelection("centerY"))
              },
              {
                label: "Align bottom",
                icon: "alignBottom",
                onPick: () => e.run((ce) => ce.alignSelection("bottom"))
              }
            ]
          });
        }
      });
    };
    j(Ht, (D) => {
      e.can.align && e.engine && D(bn);
    });
  }
  var wn = b(Ht, 2);
  {
    var he = (D) => {
      Ne(D, {
        label: "Distribute",
        children: (oe, Oe) => {
          Gn(oe, {
            buttons: [
              {
                label: "Distribute horizontally",
                icon: "distributeX",
                onPick: () => e.run((ce) => ce.distributeSelection("x"))
              },
              {
                label: "Distribute vertically",
                icon: "distributeY",
                onPick: () => e.run((ce) => ce.distributeSelection("y"))
              }
            ]
          });
        }
      });
    };
    j(wn, (D) => {
      e.can.distribute && e.engine && D(he);
    });
  }
  Y(() => le(G, s(f))), A(t, ne), it();
}
ct([
  "click",
  "keydown",
  "mousedown",
  "change",
  "input",
  "pointerup"
]);
const Wr = (t) => t === "autoshape" ? "rectangle" : t, Tv = (t) => [
  "rectangle",
  "stickynote",
  "embed",
  "ellipse",
  "diamond",
  "line",
  "freedraw",
  "bucketfill",
  "figure"
].includes(Wr(t)), Zh = (t) => Tv(t) && t !== "stickynote", Kh = (t) => [
  "rectangle",
  "stickynote",
  "ellipse",
  "diamond",
  "freedraw",
  "arrow",
  "line",
  "text",
  "embed",
  "figure"
].includes(Wr(t)), WT = (t) => ["rectangle", "ellipse", "diamond", "freedraw", "arrow", "line", "embed", "figure"].includes(
  Wr(t)
), Cv = (t) => ["rectangle", "ellipse", "diamond", "arrow", "line", "embed", "figure"].includes(
  Wr(t)
), ZT = (t) => Cv(t) || t === "stickynote", KT = (t) => ["rectangle", "stickynote", "diamond", "line", "image", "embed"].includes(Wr(t)), Av = (t) => Wr(t) === "arrow", VT = Av, JT = (t) => Wr(t) === "text", Il = (t) => Wr(t) === "figure", GT = (t) => t !== "select" && t !== "lasso" && t !== "hand" && t !== "eraser" && // The laser leaves nothing behind, so there is nothing for a style to apply to. A
// panel of stroke widths hanging over the board while you present is noise.
t !== "laser" && // A frame has a fixed appearance — Excalidraw's shape actions exclude frames
// entirely — so there is nothing to offer while the frame tool is active either.
t !== "frame" && // The image tool opens a file picker and is gone again; a panel that flashes up for
// the length of a dialog is noise. A *selected* image still shows one, because that
// is driven by the selection rather than by the tool.
t !== "image" && // Same as the image tool: it opens a dialog and is gone. A *selected* embed still
// shows a panel, because that is driven by the selection.
t !== "embed";
function qT(t, e, n) {
  const { kinds: r } = e, o = (c) => c(t) || r.some((d) => c(d)), i = e.count > 0, a = r.length === 1 ? r[0] : null;
  return {
    visible: GT(t) || i,
    strokeColor: Kh(t) && a !== "image" && a !== "frame" || r.some(Kh),
    // `canChangeBackgroundColor` (`shapeActionPredicates.ts@1118751f:64-78`): a note's
    // label, the target while it is typed, keeps the picker because its note takes it.
    backgroundColor: o(Tv) || e.backgroundDomain !== "regular",
    // A fill style only means something once there is a fill to style — except for the
    // bucket, which never paints transparent because it falls back to a real colour when
    // none is chosen. Without this the fill row is hidden exactly when nothing has been
    // picked yet, which is every first use of the tool.
    fill: t === "bucketfill" || Zh(t) && !Kn(n) || e.filledKinds.some(Zh),
    strokeWidth: o(WT),
    strokeStyle: o(Cv),
    sloppiness: o(ZT),
    roundness: o(KT),
    arrowType: o(VT),
    arrowheads: o(Av),
    // Selection-only, like `align`/`distribute` above: the tool has no points yet for
    // "four or more" to ask about, so there is nothing to offer before something is drawn.
    polygon: e.canTogglePolygon,
    text: t === "text" || r.some(JT),
    textAlign: t === "text" || e.textAlignable,
    verticalAlign: e.verticalAlignable,
    wrap: e.hasFreeText || e.hasLabel,
    figureKind: o(Il),
    figureSides: o(Il) && e.figureHasSides,
    figureRatio: o(Il) && e.figureHasRatio,
    // `shapeActionPredicates.ts@1118751f:157`: every selection, a frame included, and
    // every tool but the auto-shape one. The panel's own visibility rules out the tools
    // that draw nothing.
    opacity: t !== "autoshape" || i,
    layers: i,
    mirror: i,
    group: i,
    align: e.canAlign,
    distribute: e.canDistribute
  };
}
const YT = {
  refused: "Couldn't copy to clipboard.",
  empty: "Cannot export empty canvas.",
  "too-big": "The canvas may be too big."
};
function XT(t, e) {
  return t.kind !== "copied" ? YT[t.kind] : `Copied ${t.scope === "selection" ? "selection" : "canvas"} to clipboard as ${e === "png" ? "PNG" : "SVG"}`;
}
function QT(t) {
  const e = t.clipboard;
  return {
    // `probablySupportsClipboardWriteText` — `clipboard.ts@1118751f:65-66`.
    canWriteText: !!e && typeof e.writeText == "function",
    // `probablySupportsClipboardBlob` — `:68-72`, and it is a conjunction of three: the
    // `write` method, a `ClipboardItem` constructor, and `toBlob` on the canvas prototype.
    canWriteBlob: !!e && typeof e.write == "function" && t.hasClipboardItem === !0 && t.canEncodeCanvas === !0
  };
}
function $T() {
  const t = typeof window > "u" ? void 0 : window;
  return QT({
    clipboard: t?.navigator.clipboard,
    hasClipboardItem: !!t && "ClipboardItem" in t,
    canEncodeCanvas: !!t?.HTMLCanvasElement && "toBlob" in t.HTMLCanvasElement.prototype
  });
}
async function eC(t, e, n = nC()) {
  const r = t.clipboardCopy(e, $T());
  if (!r.supported)
    return r.refusal === "nothing-to-copy" ? { kind: "empty" } : { kind: "refused" };
  const o = await tC(r, e, n);
  return o === "too-big" ? { kind: "too-big" } : o ? { kind: "copied", scope: r.scope } : { kind: "refused" };
}
async function tC(t, e, n) {
  if (!n) return !1;
  try {
    if (e === "png") {
      const r = await t.blob;
      if (!r) return "too-big";
      await n.write([new ClipboardItem({ [t.mime]: r })]);
    } else if (t.text !== void 0)
      await n.writeText(t.text);
    else
      return !1;
    return !0;
  } catch {
    return !1;
  }
}
function nC() {
  return typeof window > "u" ? void 0 : window.navigator.clipboard;
}
const rC = {
  "fill-region-not-closed": "Couldn't find an enclosed region to fill here.",
  "fill-region-too-complex": "This region is too complex to fill."
};
function oC(t) {
  return `${t?.trim() || "Someone"} is working on this — it is theirs until they let go.`;
}
var iC = /* @__PURE__ */ F('<div class="rule svelte-1bq2jl" aria-hidden="true"></div> <button type="button" aria-label="Undo (⌘Z)" title="Undo — ⌘Z" class="svelte-1bq2jl"><!></button> <button type="button" aria-label="Redo (⌘⇧Z)" title="Redo — ⌘⇧Z" class="svelte-1bq2jl"><!></button>', 1), sC = /* @__PURE__ */ F('<div class="rule svelte-1bq2jl" aria-hidden="true"></div> <button type="button" class="back svelte-1bq2jl" aria-label="Scroll back to content"><!> <span>Fit</span></button>', 1), aC = /* @__PURE__ */ F('<div class="draw-panel bar svelte-1bq2jl" role="group" aria-label="Zoom and history controls"><div class="zoom-actions svelte-1bq2jl"><button type="button" aria-label="Zoom out (⌘−)" title="Zoom out — ⌘−" class="svelte-1bq2jl"><!></button> <button type="button" class="pct svelte-1bq2jl" title="Reset zoom — ⌘0"> </button> <button type="button" aria-label="Zoom in (⌘+)" title="Zoom in — ⌘+" class="svelte-1bq2jl"><!></button> <button type="button" aria-label="Zoom to fit (⇧1)" title="Zoom to fit — ⇧1" class="svelte-1bq2jl"><!></button></div> <!> <!></div>');
function lC(t, e) {
  ot(e, !0);
  let n = ke(e, "zenMode", 3, !1);
  function r(C) {
    C.preventDefault();
  }
  var o = aC(), i = z(o), a = z(i), l = z(a);
  lt(l, { name: "zoomOut", size: 15 });
  var c = b(a, 2), d = ae(c), u = b(c, 2), f = z(u);
  lt(f, { name: "zoomIn", size: 15 });
  var h = b(u, 2), p = z(h);
  lt(p, { name: "fit", size: 15 });
  var m = b(i, 2);
  {
    var w = (C) => {
      var P = iC(), S = b(Ue(P), 2), T = z(S);
      lt(T, { name: "undo", size: 15 });
      var M = b(S, 2), H = z(M);
      lt(H, { name: "redo", size: 15 }), I("mousedown", S, r), I("click", S, () => e.engine?.undo()), I("mousedown", M, r), I("click", M, () => e.engine?.redo()), A(C, P);
    }, y = /* @__PURE__ */ X(() => Io("undoButton", n()));
    j(m, (C) => {
      s(y) && C(w);
    });
  }
  var k = b(m, 2);
  {
    var O = (C) => {
      var P = sC(), S = b(Ue(P), 2), T = z(S);
      lt(T, { name: "focus", size: 15 }), I("mousedown", S, r), I("click", S, () => e.engine?.fit()), A(C, P);
    };
    j(k, (C) => {
      e.contentVisible || C(O);
    });
  }
  Y(() => {
    N(c, "aria-label", `Zoom ${e.zoom} percent — reset to 100 percent (⌘0)`), le(d, `${e.zoom ?? ""}%`);
  }), I("mousedown", a, r), I("click", a, () => e.engine?.zoomOut()), I("mousedown", c, r), I("click", c, () => e.engine?.zoomReset()), I("mousedown", u, r), I("click", u, () => e.engine?.zoomIn()), I("mousedown", h, r), I("click", h, function(...C) {
    e.onFit?.apply(this, C);
  }), A(t, o), it();
}
ct(["mousedown", "click"]);
var cC = /* @__PURE__ */ F('<textarea aria-label="Text editor" dir="auto" wrap="off"></textarea>');
function uC(t, e) {
  ot(e, !0);
  let n = /* @__PURE__ */ B(void 0), r = /* @__PURE__ */ B(0), o = !1, i = !0;
  const a = /* @__PURE__ */ X(() => (e.revision, s(r), e.engine.textEditLayout())), l = /* @__PURE__ */ X(() => {
    if (!s(a)) return null;
    const C = s(n)?.parentElement;
    return G4(s(a), {
      width: C?.clientWidth ?? window.innerWidth,
      height: C?.clientHeight ?? window.innerHeight
    });
  }), c = /* @__PURE__ */ X(() => !!(s(a) && !s(a).containerId && s(a).wrap));
  bt(() => {
    s(a) || d(!1);
  }), Gt(() => {
    if (s(n))
      return s(n).value = e.request.text, !e.request.text && e.engine.updateTextEdit("") && _(r, s(r) + 1), s(n).focus(), e.request.caret === void 0 ? s(n).select() : s(n).setSelectionRange(e.request.caret, e.request.caret), window.addEventListener("pointerdown", m, !0), window.addEventListener("beforeunload", u), () => {
        window.removeEventListener("pointerdown", m, !0), window.removeEventListener("pointerup", w), window.removeEventListener("beforeunload", u);
      };
  });
  function d(C, P = !1, S = !1) {
    if (o) return;
    o = !0;
    const T = Ur(s(n)), M = T.activeElement === s(n);
    C && s(n) && e.engine.commitTextEdit(s(n).value, P), M && T.querySelector('.draw-chrome [role="application"]')?.focus(), e.onDone(S);
  }
  function u() {
    d(!0);
  }
  function f() {
    if (!s(n) || o) return;
    const C = ex(s(n).value);
    if (C !== s(n).value) {
      const P = s(n).selectionStart;
      s(n).value = C, s(n).setSelectionRange(P, P);
    }
    if (!e.engine.updateTextEdit(s(n).value)) return d(!1);
    _(r, s(r) + 1), e.onInput?.();
  }
  function h(C) {
    const P = q4(C);
    if (!(!P || !s(n))) {
      if (C.preventDefault(), C.stopPropagation(), P === "submit") d(!0, !0);
      else if (P === "save")
        d(!0, !0), e.onSave?.();
      else if (P === "zoomIn") e.engine.zoomIn();
      else if (P === "zoomOut") e.engine.zoomOut();
      else if (P === "zoomReset") e.engine.zoomReset();
      else if (P === "indent" || P === "outdent") {
        const S = {
          value: s(n).value,
          selectionStart: s(n).selectionStart,
          selectionEnd: s(n).selectionEnd
        }, T = P === "indent" ? Q4(S) : $4(S);
        s(n).value = T.value, s(n).setSelectionRange(T.selectionStart, T.selectionEnd), f();
      }
    }
  }
  function p(C) {
    const P = C.clipboardData?.getData("text/plain") ?? "", S = P ? tx(P) : null;
    if (S === null || !s(n) || (C.preventDefault(), !S)) return;
    const { selectionStart: T, selectionEnd: M, value: H } = s(n);
    s(n).value = H.slice(0, T) + S + H.slice(M);
    const q = T + S.length;
    s(n).setSelectionRange(q, q), f();
  }
  function m(C) {
    const P = vr(C);
    if (!(o || P === s(n)))
      if (ix(P, C.button))
        i = !1, window.addEventListener("pointerup", w);
      else {
        const S = P instanceof HTMLCanvasElement;
        d(!0, !1, S && C.button === 0);
      }
  }
  function w() {
    window.removeEventListener("pointerup", w), setTimeout(() => {
      if (o || !s(n)) return;
      const C = Ur(s(n)).activeElement;
      (Am(C) || C?.closest('select, [role="dialog"]')) && C !== s(n) || (i = !0, s(n).focus());
    });
  }
  var y = cC();
  Qe("resize", $t, () => _(r, s(r) + 1)), N(y, "spellcheck", !1);
  let k, O;
  Je(y, (C) => _(n, C), () => s(n)), Y(
    (C) => {
      k = Ce(y, 1, "svelte-fots5z", null, k, { wrap: s(a)?.wrap, boxed: s(c) }), O = ht(y, "", O, {
        "outline-offset": s(c) && s(a) ? `${4 / s(a).zoom}px` : void 0,
        "outline-width": s(c) && s(a) ? `${1 / s(a).zoom}px` : void 0,
        left: s(l) ? `${s(l).left}px` : void 0,
        top: s(l) ? `${s(l).top}px` : void 0,
        width: s(l) ? `${s(l).width}px` : void 0,
        height: s(l) ? `${s(l).height}px` : void 0,
        "max-height": s(l) ? `${s(l).maxHeight}px` : void 0,
        transform: s(l)?.transform,
        "font-size": s(a) ? `${s(a).fontSize}px` : void 0,
        "font-family": C,
        "line-height": s(a)?.lineHeight,
        "text-align": s(a)?.textAlign,
        color: s(a)?.color,
        opacity: s(a)?.opacity
      }), y.dir = y.dir;
    },
    [
      () => s(a) ? e.engine.fontFamily(s(a).fontFamily) : void 0
    ]
  ), I("input", y, f), I("keydown", y, h), Qe("paste", y, p), Qe("focus", y, () => i = !0), Qe("blur", y, () => {
    i && d(!0);
  }), A(t, y), it();
}
ct(["input", "keydown"]);
var dC = /* @__PURE__ */ F('<input aria-label="Frame name" dir="auto" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" class="svelte-vnuno9"/>');
function fC(t, e) {
  ot(e, !0);
  let n = /* @__PURE__ */ B(void 0), r = !1;
  function o(c) {
    r || (r = !0, s(n) && e.engine.renameFrame(e.request.id, s(n).value), Ur(s(n)).querySelector('.draw-chrome [role="application"]')?.focus(), e.onDone());
  }
  Gt(() => {
    s(n) && (s(n).value = e.request.name, s(n).focus(), s(n).select());
  });
  function i(c) {
    (c.key === "Enter" || c.key === "Escape") && (c.preventDefault(), c.stopPropagation(), o());
  }
  var a = dC();
  let l;
  Je(a, (c) => _(n, c), () => s(n)), Y(() => {
    l = ht(a, "", l, {
      left: `${e.request.x ?? ""}px`,
      top: `${e.request.y ?? ""}px`,
      width: `${e.request.width ?? ""}px`,
      height: `${e.request.height ?? ""}px`,
      "font-size": `${e.request.fontSize ?? ""}px`,
      color: e.request.color
    }), a.dir = a.dir;
  }), I("keydown", a, i), Qe("blur", a, () => o()), A(t, a), it();
}
ct(["keydown"]);
var hC = /* @__PURE__ */ F('<button type="button"> </button>'), gC = /* @__PURE__ */ F('<div class="modal-backdrop svelte-gyoty4" role="dialog" aria-modal="true" aria-labelledby="export-title"><div class="modal-card pop-in svelte-gyoty4" tabindex="-1"><div class="modal-header svelte-gyoty4"><h3 id="export-title" class="svelte-gyoty4">Export Drawing</h3> <button type="button" class="close-btn svelte-gyoty4" aria-label="Close dialog">✕</button></div> <div class="options-section svelte-gyoty4"><label class="option-row svelte-gyoty4"><span>Transparent background</span> <input type="checkbox"/></label> <label class="option-row svelte-gyoty4"><span>Selection only</span> <input type="checkbox"/></label> <label class="option-row svelte-gyoty4"><span>Dark mode</span> <input type="checkbox"/></label> <div class="option-row svelte-gyoty4"><span>Export Scale</span> <div class="scale-chips svelte-gyoty4"></div></div></div> <div class="actions-grid svelte-gyoty4"><button type="button" class="action-card primary svelte-gyoty4"><div class="card-icon svelte-gyoty4">PNG</div> <div class="card-text svelte-gyoty4"><strong class="svelte-gyoty4">PNG Image</strong> <span class="svelte-gyoty4"> </span></div></button> <button type="button" class="action-card svelte-gyoty4"><div class="card-icon svg-badge svelte-gyoty4">SVG</div> <div class="card-text svelte-gyoty4"><strong class="svelte-gyoty4">SVG Vector</strong> <span class="svelte-gyoty4">Scalable vector graphics for design tools</span></div></button> <button type="button" class="action-card svelte-gyoty4"><div class="card-icon json-badge svelte-gyoty4">OSI</div> <div class="card-text svelte-gyoty4"><strong class="svelte-gyoty4">.osidraw File</strong> <span class="svelte-gyoty4">Native JSON scene for backup & reload</span></div></button></div></div></div>');
function pC(t, e) {
  ot(e, !0);
  let n = /* @__PURE__ */ B(!1), r = /* @__PURE__ */ B(2), o = /* @__PURE__ */ B(!1), i = /* @__PURE__ */ B(!1);
  function a() {
    return (e.engine?.debugSnapshot().scene.selectedCount ?? 0) > 0;
  }
  let l = /* @__PURE__ */ B(ft(a())), c;
  Gt(() => yn(c));
  async function d() {
    if (e.engine) {
      _(i, !0);
      try {
        const W = await e.engine.exportPng({
          scale: s(r),
          transparent: s(n),
          selectionOnly: s(l),
          darkMode: s(o)
        });
        W && Pi("drawing.png", W), e.onClose();
      } finally {
        _(i, !1);
      }
    }
  }
  function u() {
    if (!e.engine) return;
    const W = e.engine.exportSvg({
      selectionOnly: s(l),
      transparent: s(n),
      darkMode: s(o)
    });
    W && Pi("drawing.svg", new Blob([W], { type: "image/svg+xml" })), e.onClose();
  }
  function f() {
    if (!e.engine) return;
    const W = e.engine.exportJson();
    W && Pi("drawing.osidraw", new Blob([W], { type: "application/json" })), e.onClose();
  }
  var h = gC(), p = z(h), m = z(p), w = b(z(m), 2), y = b(m, 2), k = z(y), O = b(z(k), 2), C = b(k, 2), P = b(z(C), 2), S = b(C, 2), T = b(z(S), 2), M = b(S, 2), H = b(z(M), 2);
  Ze(H, 20, () => [1, 2, 3], (W) => W, (W, J) => {
    var E = hC();
    let L;
    var V = ae(E);
    Y(() => {
      L = Ce(E, 1, "scale-chip svelte-gyoty4", null, L, { active: s(r) === J }), le(V, `${J ?? ""}x`);
    }), I("click", E, () => _(r, J, !0)), A(W, E);
  });
  var q = b(y, 2), R = z(q), K = b(z(R), 2), ie = b(z(K), 2), ne = ae(ie), $ = b(R, 2), G = b($, 2);
  Je(p, (W) => c = W, () => c), Y(() => {
    R.disabled = s(i), le(ne, `High-res raster (${s(r) ?? ""}x resolution)`);
  }), I("click", w, function(...W) {
    e.onClose?.apply(this, W);
  }), Cs(O, () => s(n), (W) => _(n, W)), Cs(P, () => s(l), (W) => _(l, W)), Cs(T, () => s(o), (W) => _(o, W)), I("click", R, d), I("click", $, u), I("click", G, f), A(t, h), it();
}
ct(["click"]);
var mC = /* @__PURE__ */ F('<p class="error svelte-1fz0pjh" role="alert"> </p>'), vC = /* @__PURE__ */ F(`<div class="modal-backdrop svelte-1fz0pjh"><div class="modal-card svelte-1fz0pjh" role="dialog" aria-modal="true" aria-labelledby="mermaid-title"><div class="modal-header svelte-1fz0pjh"><h3 id="mermaid-title" class="svelte-1fz0pjh">Mermaid to diagram</h3> <button type="button" class="close-btn svelte-1fz0pjh" aria-label="Close dialog">✕</button></div> <p class="description svelte-1fz0pjh">Flowchart, sequence, class, entity relationship and state diagrams become shapes you can edit.
      Every other type is placed as a picture.</p> <div class="panels svelte-1fz0pjh"><label class="panel svelte-1fz0pjh"><span class="panel-title svelte-1fz0pjh">Mermaid syntax</span> <textarea spellcheck="false" placeholder="Write a Mermaid diagram definition here…" class="svelte-1fz0pjh"></textarea></label> <div class="panel svelte-1fz0pjh"><span class="panel-title svelte-1fz0pjh">Preview</span> <div><!> <!></div></div></div> <div class="actions svelte-1fz0pjh"><span class="hint svelte-1fz0pjh">Ctrl/Cmd+Enter</span> <button type="button" class="btn-primary svelte-1fz0pjh">Insert ▸</button></div></div></div>`);
function _C(t, e) {
  ot(e, !0);
  const n = `flowchart TD
 A[Christmas] -->|Get money| B(Go shopping)
 B --> C{Let me think}
 C -->|One| D[Laptop]
 C -->|Two| E[iPhone]
 C -->|Three| F[Car]`, r = "drawnosaurus:mermaid-definition", o = 200;
  function i() {
    try {
      return localStorage.getItem(r);
    } catch {
      return null;
    }
  }
  function a($) {
    try {
      localStorage.setItem(r, $);
    } catch {
    }
  }
  let l = /* @__PURE__ */ B(ft(i() ?? n)), c = /* @__PURE__ */ B([]), d = /* @__PURE__ */ B(null), u = /* @__PURE__ */ B(null), f = /* @__PURE__ */ B(void 0);
  Gt(() => yn(s(f)));
  let h = 0;
  bt(() => {
    const $ = s(l), G = ++h, W = setTimeout(
      async () => {
        if (!$.trim()) {
          _(c, []), _(d, null);
          return;
        }
        try {
          const J = await Qm($);
          if (G !== h) return;
          _(c, J), _(d, null);
        } catch (J) {
          if (G !== h) return;
          _(c, []), _(d, J instanceof Error ? J.message : String(J), !0);
        }
        a($);
      },
      o
    );
    return () => clearTimeout(W);
  }), bt(() => {
    s(u) && (s(u).clear(), s(c).length !== 0 && (s(u).insertJson(fc(s(c))), s(u).zoomToFitSelection(), s(u).clearSelection()));
  });
  function p() {
    s(c).length !== 0 && (e.onInsert(s(c)), e.onClose());
  }
  function m($) {
    $.key === "Enter" && ($.ctrlKey || $.metaKey) && ($.preventDefault(), p());
  }
  var w = vC(), y = z(w), k = z(y), O = b(z(k), 2), C = b(k, 4), P = z(C), S = b(z(P), 2);
  Je(S, ($) => _(f, $), () => s(f));
  var T = b(P, 2), M = b(z(T), 2);
  let H;
  var q = z(M);
  Em(q, {
    ariaLabel: "Mermaid preview",
    onReady: ($) => _(u, $)
  });
  var R = b(q, 2);
  {
    var K = ($) => {
      var G = mC(), W = ae(G, !0);
      Y(() => le(W, s(d))), A($, G);
    };
    j(R, ($) => {
      s(d) && $(K);
    });
  }
  var ie = b(C, 2), ne = b(z(ie), 2);
  Y(() => {
    H = Ce(M, 1, "preview svelte-1fz0pjh", null, H, { failed: s(d) !== null }), ne.disabled = s(c).length === 0;
  }), I("click", O, function(...$) {
    e.onClose?.apply(this, $);
  }), I("keydown", S, m), Zi(S, () => s(l), ($) => _(l, $)), I("click", ne, p), A(t, w), it();
}
ct(["click", "keydown"]);
const yC = "osidraw", bC = 1, wC = [{ id: "el-260524539-1615866694", type: "rectangle", x: 580, y: 370, width: 120, height: 60, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1390234229, boundTextId: "el-2025009984-659528785", version: 2, versionNonce: 709654287, updated: 867.3000000044703, isDeleted: !1 }, { id: "el-2025009984-659528785", type: "text", x: 617.5, y: 387.5, width: 45, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1300351246, text: "Cart", originalText: "Cart", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-260524539-1615866694", version: 1, versionNonce: 24077442, updated: 820.5, isDeleted: !1 }, { id: "el-1666301893-23337906", type: "rectangle", x: 800, y: 370, width: 120, height: 60, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2132660709, boundTextId: "el-2067364059-1985358620", version: 2, versionNonce: 204890311, updated: 884.1000000014901, isDeleted: !1 }, { id: "el-2067364059-1985358620", type: "text", x: 820, y: 387.5, width: 80, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1837163361, text: "Address", originalText: "Address", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1666301893-23337906", version: 1, versionNonce: 1264774975, updated: 884.1000000014901, isDeleted: !1 }, { id: "el-1751442433-485358619", type: "arrow", x: 706, y: 400, width: 88, height: 0, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: null, seed: 895078149, points: [[0, 0], [88, 0]], startBinding: "el-260524539-1615866694", endBinding: "el-1666301893-23337906", startFixedPoint: [0.5, 0.5], endFixedPoint: [0.5, 0.5], startBindMode: "orbit", endBindMode: "orbit", version: 1, versionNonce: 643248330, updated: 867.3000000044703, isDeleted: !1 }, { id: "el-1618437212-795697210", type: "rectangle", x: 1020, y: 370, width: 120, height: 60, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2133617981, boundTextId: "el-386109097-1479881416", version: 2, versionNonce: 1665993928, updated: 917.1000000014901, isDeleted: !1 }, { id: "el-386109097-1479881416", type: "text", x: 1039.5, y: 387.5, width: 81, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 471803839, text: "Payment", originalText: "Payment", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1618437212-795697210", version: 1, versionNonce: 524044406, updated: 901, isDeleted: !1 }, { id: "el-247879310-1612036741", type: "arrow", x: 926, y: 400, width: 88, height: 0, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: null, seed: 162357363, points: [[0, 0], [88, 0]], startBinding: "el-1666301893-23337906", endBinding: "el-1618437212-795697210", startFixedPoint: [0.5, 0.5], endFixedPoint: [0.5, 0.5], startBindMode: "orbit", endBindMode: "orbit", version: 1, versionNonce: 1456416271, updated: 901, isDeleted: !1 }, { id: "el-2081457044-512786550", type: "diamond", x: 1240, y: 370, width: 120, height: 70, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 416748393, boundTextId: "el-488675003-896830121", version: 2, versionNonce: 1732692771, updated: 933.9000000059605, isDeleted: !1 }, { id: "el-488675003-896830121", type: "text", x: 1275, y: 392.5, width: 50, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2057361731, text: "Paid?", originalText: "Paid?", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-2081457044-512786550", version: 1, versionNonce: 2079961939, updated: 917.1000000014901, isDeleted: !1 }, { id: "el-1495041945-642272225", type: "arrow", x: 1146, y: 401.5, width: 84.78873370870383, height: 1.9270166751978195, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: null, seed: 460154784, points: [[0, 0], [84.78873370870383, 1.9270166751978195]], startBinding: "el-1618437212-795697210", endBinding: "el-2081457044-512786550", startFixedPoint: [0.5, 0.5], endFixedPoint: [0.5, 0.5], startBindMode: "orbit", endBindMode: "orbit", version: 2, versionNonce: 1905577798, updated: 933.9000000059605, isDeleted: !1 }, { id: "el-337047676-1186029542", type: "figure", x: 1103.39797628447, y: 479.9927110580464, width: 166.13506107600165, height: 89.9917999403022, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1949858106, boundTextId: "el-39825276-1118950690", figure: { kind: "document" }, version: 2, versionNonce: 526702717, updated: 1170.5, isDeleted: !1 }, { id: "el-39825276-1118950690", type: "text", x: 1149.9655068224706, y: 512.4886110281975, width: 73, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 113186780, text: "Receipt", originalText: "Receipt", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-337047676-1186029542", version: 1, versionNonce: 366021838, updated: 1170.5, isDeleted: !1 }, { id: "el-1627468698-2123035187", type: "figure", x: 1339.6121388607642, y: 479.9927110580464, width: 129.98815546932542, height: 89.9917999403022, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1327294898, boundTextId: "el-1108783826-2001304092", figure: { kind: "cylinder" }, version: 2, versionNonce: 884034791, updated: 1403.8000000044703, isDeleted: !1 }, { id: "el-1108783826-2001304092", type: "text", x: 1351.6062165954268, y: 512.4886110281975, width: 106, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1594523257, text: "Orders DB", originalText: "Orders DB", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1627468698-2123035187", version: 1, versionNonce: 1455456385, updated: 1403.8000000044703, isDeleted: !1 }, { id: "el-516130385-909155433", type: "arrow", x: 1300.0000256633002, y: 437.99998592470246, width: -97.31249202828371, height: 35.992725133343924, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2053669866, points: [[0, 0], [-97.31249202828371, 35.992725133343924]], startBinding: "el-2081457044-512786550", endBinding: "el-337047676-1186029542", startFixedPoint: [0.5000002138608352, 0.9714283703528922], endFixedPoint: [0.49999999999999933, 0], startBindMode: "inside", endBindMode: "orbit", boundTextId: "el-1996868144-2001275115", version: 2, versionNonce: 307289448, updated: 1785.9000000059605, isDeleted: !1 }, { id: "el-1996868144-2001275115", type: "text", x: 1234.8437796491585, y: 443.4963484913745, width: 33, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1480995551, text: "yes", originalText: "yes", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-516130385-909155433", version: 1, versionNonce: 1521355845, updated: 1783.5, isDeleted: !1 }, { id: "el-446618966-2025577876", type: "arrow", x: 1300.0000256633002, y: 437.99998592470246, width: 90.7209695887068, height: 36.41869286915221, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 155207939, points: [[0, 0], [90.7209695887068, 36.41869286915221]], startBinding: "el-2081457044-512786550", endBinding: "el-1627468698-2123035187", startFixedPoint: [0.5000002138608352, 0.9714283703528922], endFixedPoint: [0.4999999999999991, 0], startBindMode: "inside", endBindMode: "orbit", boundTextId: "el-1373523798-1553231909", version: 2, versionNonce: 1631816022, updated: 2170.2000000029802, isDeleted: !1 }, { id: "el-1373523798-1553231909", type: "text", x: 1333.8605104576536, y: 443.70933235927856, width: 23, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 912174100, text: "no", originalText: "no", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-446618966-2025577876", version: 1, versionNonce: 1845878016, updated: 2170.2000000029802, isDeleted: !1 }], kC = {
  type: yC,
  version: bC,
  elements: wC
}, SC = "osidraw", xC = 1, EC = /* @__PURE__ */ JSON.parse('[{"id":"el-861310756-2042793310","type":"ellipse","x":480,"y":220,"width":90,"height":55,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1137566322,"boundTextId":"el-272586509-1864142233","frameId":"el-105976981-940970198","version":2,"versionNonce":2067163922,"updated":2020.7000000029802,"isDeleted":false},{"id":"el-272586509-1864142233","type":"text","x":506.68019484660533,"y":235.05456351736996,"width":37,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1986876977,"text":"Web","originalText":"Web","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-861310756-2042793310","version":1,"versionNonce":1449098369,"updated":2006.7000000029802,"isDeleted":false},{"id":"el-1708155620-616176932","type":"ellipse","x":659.9887445767051,"y":219.99436908414032,"width":129.99798437584468,"height":54.99934247744034,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1372269935,"boundTextId":"el-1976510121-936873533","frameId":"el-105976981-940970198","version":2,"versionNonce":1993322552,"updated":2204,"isDeleted":false},{"id":"el-1976510121-936873533","type":"text","x":696.5265086182561,"y":235.04883630956078,"width":57,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1333274078,"text":"Mobile","originalText":"Mobile","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1708155620-616176932","version":1,"versionNonce":917821382,"updated":2190.5,"isDeleted":false},{"id":"el-105976981-940970198","type":"frame","x":460,"y":180,"width":680,"height":110,"angle":0,"strokeColor":"#bbbbbb","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"roundness":8,"seed":1998838725,"name":"Clients","version":2,"versionNonce":383707026,"updated":1820.5,"isDeleted":false},{"id":"el-1534639237-285429736","type":"figure","x":480.0156744601694,"y":379.9744108142843,"width":129.98146353889308,"height":70.00588093733325,"angle":0,"strokeColor":"#1971c2","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":1,"strokeStyle":"solid","roughness":0,"opacity":100,"roundness":0,"seed":1950142401,"boundTextId":"el-38418306-500811152","frameId":"el-806726626-195800411","figure":{"kind":"polygon","sides":6},"version":3,"versionNonce":1957409051,"updated":4470.5,"isDeleted":false},{"id":"el-38418306-500811152","type":"text","x":525.006406229616,"y":402.9773512829509,"width":40,"height":24,"angle":0,"strokeColor":"#1971c2","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1624649650,"text":"Auth","originalText":"Auth","fontSize":20,"fontFamily":3,"lineHeight":1.2,"containerId":"el-1534639237-285429736","version":2,"versionNonce":3367393,"updated":4470.5,"isDeleted":false},{"id":"el-577146645-1944697028","type":"figure","x":679.9801750356758,"y":379.98702112181417,"width":129.9968091813863,"height":69.99276779941778,"angle":0,"strokeColor":"#1971c2","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":1,"strokeStyle":"solid","roughness":0,"opacity":100,"roundness":0,"seed":909522782,"boundTextId":"el-2020446680-127828297","frameId":"el-806726626-195800411","figure":{"kind":"polygon","sides":6},"version":3,"versionNonce":572218066,"updated":4470.5,"isDeleted":false},{"id":"el-2020446680-127828297","type":"text","x":714.9785796263689,"y":402.9834050215231,"width":60,"height":24,"angle":0,"strokeColor":"#1971c2","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":584440005,"text":"Orders","originalText":"Orders","fontSize":20,"fontFamily":3,"lineHeight":1.2,"containerId":"el-577146645-1944697028","version":2,"versionNonce":631529058,"updated":4470.5,"isDeleted":false},{"id":"el-376172695-1852794590","type":"arrow","x":615.9971379990625,"y":414.97787030060107,"width":57.98303703661327,"height":0.005015703271794791,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":71745826,"points":[[0,0],[57.98303703661327,0.005015703271794791]],"startBinding":"el-1534639237-285429736","endBinding":"el-577146645-1944697028","startFixedPoint":[1,0.5],"endFixedPoint":[0,0.4999999999999996],"startBindMode":"orbit","endBindMode":"orbit","boundTextId":"el-888383897-1352361291","frameId":"el-806726626-195800411","version":2,"versionNonce":1386003205,"updated":4056.10000000149,"isDeleted":false},{"id":"el-888383897-1352361291","type":"text","x":609.4886565173691,"y":402.48037815223694,"width":71,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1351060109,"text":"verifies","originalText":"verifies","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-376172695-1852794590","version":1,"versionNonce":1510500015,"updated":4053.89999999851,"isDeleted":false},{"id":"el-806726626-195800411","type":"frame","x":460,"y":340,"width":680,"height":130,"angle":0,"strokeColor":"#bbbbbb","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"roundness":8,"seed":182713499,"name":"Services","version":2,"versionNonce":62883274,"updated":1839.2000000029802,"isDeleted":false},{"id":"el-333346167-1278311785","type":"figure","x":480.0036033161255,"y":559.9709158882108,"width":99.99193360634439,"height":69.99435352444118,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1948870078,"boundTextId":"el-1180344007-794895088","frameId":"el-737847456-1862356263","figure":{"kind":"cylinder"},"version":2,"versionNonce":1076361811,"updated":2906.8000000044703,"isDeleted":false},{"id":"el-1180344007-794895088","type":"text","x":513.9995701192977,"y":582.4680926504313,"width":32,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1689685583,"text":"DB","originalText":"DB","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-333346167-1278311785","version":1,"versionNonce":1019796747,"updated":2906.8000000044703,"isDeleted":false},{"id":"el-737847456-1862356263","type":"frame","x":460,"y":520,"width":680,"height":120,"angle":0,"strokeColor":"#bbbbbb","backgroundColor":"transparent","fillStyle":"solid","strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"roundness":8,"seed":80028906,"name":"Data","version":2,"versionNonce":739955924,"updated":1854,"isDeleted":false},{"id":"el-2101373125-451765709","type":"arrow","x":526.1419013329669,"y":280.99160180296616,"width":17.73807753640017,"height":93.07239975989643,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":2054376021,"points":[[0,0],[17.73807753640017,93.07239975989643]],"startBinding":"el-861310756-2042793310","endBinding":"el-1534639237-285429736","startFixedPoint":[0.5,1],"endFixedPoint":[0.5000000000000004,0],"startBindMode":"orbit","endBindMode":"orbit","boundTextId":"el-1666664213-2132554470","version":2,"versionNonce":1799377622,"updated":3290.39999999851,"isDeleted":false},{"id":"el-1666664213-2132554470","type":"text","x":498.51094010116697,"y":315.02780168291434,"width":73,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":254158083,"text":"signs in","originalText":"signs in","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-2101373125-451765709","version":1,"versionNonce":2083559277,"updated":3290.39999999851,"isDeleted":false},{"id":"el-1649971978-1392240702","type":"arrow","x":726.1293188828539,"y":280.9893809566297,"width":17.72386610356091,"height":93.08698854197297,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1696821325,"points":[[0,0],[17.72386610356091,93.08698854197297]],"startBinding":"el-1708155620-616176932","endBinding":"el-577146645-1944697028","startFixedPoint":[0.5,1],"endFixedPoint":[0.49999999999999956,0],"startBindMode":"orbit","endBindMode":"orbit","boundTextId":"el-394627298-1330493030","version":2,"versionNonce":550510544,"updated":3672.89999999851,"isDeleted":false},{"id":"el-394627298-1330493030","type":"text","x":675.4912519346344,"y":315.03287522761616,"width":119,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":681318464,"text":"places order","originalText":"places order","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1649971978-1392240702","version":1,"versionNonce":638627911,"updated":3670.7000000029802,"isDeleted":false},{"id":"el-1085430571-1810523625","type":"arrow","x":737.0210343046689,"y":454.05116026037564,"width":-195.99001359909073,"height":100.2756618865547,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1158378921,"points":[[0,0],[-195.99001359909073,100.2756618865547]],"startBinding":"el-577146645-1944697028","endBinding":"el-333346167-1278311785","startFixedPoint":[0.49999999999999956,1],"endFixedPoint":[0.4999999999999997,0],"startBindMode":"orbit","endBindMode":"orbit","boundTextId":"el-100533370-904618720","version":2,"versionNonce":1674995075,"updated":4438.5,"isDeleted":false},{"id":"el-100533370-904618720","type":"text","x":598.5260275051236,"y":491.68899120365296,"width":81,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1661392148,"text":"persists","originalText":"persists","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1085430571-1810523625","version":1,"versionNonce":1587576886,"updated":4438.5,"isDeleted":false}]'), TC = {
  type: SC,
  version: xC,
  elements: EC
}, CC = "osidraw", AC = 1, PC = [{ id: "el-1330503479-586737240", type: "text", x: 490, y: 167.5, width: 122, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1873167945, text: "Sprint Retro", originalText: "Sprint Retro", fontSize: 20, fontFamily: 5, lineHeight: 1.25, version: 1, versionNonce: 1095674780, updated: 795.6999999955297, isDeleted: !1 }, { id: "el-1433640715-1862991863", type: "stickynote", x: 470, y: 255, width: 170, height: 110, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 331744374, boundTextId: "el-1305328768-1339006686", frameId: "el-703012747-435339295", baseHeight: 110, created: 1790408901630, version: 2, versionNonce: 810032103, updated: 1555.0999999940395, isDeleted: !1 }, { id: "el-1305328768-1339006686", type: "text", x: 509.5, y: 279, width: 91, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1091985694, text: `Great
teamwork`, originalText: "Great teamwork", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1433640715-1862991863", baseFontSize: 20, version: 1, versionNonce: 47574727, updated: 1541.7999999970198, isDeleted: !1 }, { id: "el-1225579394-211629997", type: "stickynote", x: 470, y: 395, width: 170, height: 110, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2085355350, boundTextId: "el-1043967976-516923422", frameId: "el-703012747-435339295", baseHeight: 110, created: 1790408901763, version: 2, versionNonce: 2141775487, updated: 1688.5999999940395, isDeleted: !1 }, { id: "el-1043967976-516923422", type: "text", x: 486.5, y: 437.5, width: 137, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 588211563, text: "Fast releases", originalText: "Fast releases", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1225579394-211629997", baseFontSize: 20, version: 1, versionNonce: 347130609, updated: 1675.7999999970198, isDeleted: !1 }, { id: "el-703012747-435339295", type: "frame", x: 450, y: 210, width: 220, height: 400, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 772254594, name: "Went well", version: 2, versionNonce: 1264014504, updated: 1397.1999999955297, isDeleted: !1 }, { id: "el-1911119146-839088542", type: "stickynote", x: 710, y: 255, width: 170, height: 110, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 242356305, boundTextId: "el-1286707473-1650176982", frameId: "el-2092887972-295669345", baseHeight: 110, created: 1790408901913, version: 2, versionNonce: 1207856470, updated: 1824.5, isDeleted: !1 }, { id: "el-1286707473-1650176982", type: "text", x: 734.5, y: 297.5, width: 121, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 209472195, text: "Slow reviews", originalText: "Slow reviews", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1911119146-839088542", baseFontSize: 20, version: 1, versionNonce: 901342826, updated: 1824.5, isDeleted: !1 }, { id: "el-1287545137-948287607", type: "stickynote", x: 710, y: 395, width: 170, height: 110, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1154578899, boundTextId: "el-31288230-1584712038", frameId: "el-2092887972-295669345", baseHeight: 110, created: 1790408902046, version: 2, versionNonce: 377526040, updated: 1971.7999999970198, isDeleted: !1 }, { id: "el-31288230-1584712038", type: "text", x: 737.5, y: 437.5, width: 115, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1235048574, text: "Flaky tests", originalText: "Flaky tests", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1287545137-948287607", baseFontSize: 20, version: 1, versionNonce: 534818024, updated: 1958.7999999970198, isDeleted: !1 }, { id: "el-2092887972-295669345", type: "frame", x: 690, y: 210, width: 220, height: 400, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 528650774, name: "To improve", version: 2, versionNonce: 1273188964, updated: 1410.1999999955297, isDeleted: !1 }, { id: "el-1831536570-672218652", type: "stickynote", x: 950, y: 255, width: 170, height: 100, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1568143624, boundTextId: "el-1233468604-768035324", frameId: "el-939292257-646237980", baseHeight: 100, created: 1790408902196, version: 2, versionNonce: 85793531, updated: 2107.7999999970198, isDeleted: !1 }, { id: "el-1233468604-768035324", type: "text", x: 969.5, y: 292.5, width: 131, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1101393254, text: "Add CI cache", originalText: "Add CI cache", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-1831536570-672218652", baseFontSize: 20, version: 1, versionNonce: 290564904, updated: 2107.7999999970198, isDeleted: !1 }, { id: "el-120123835-2145135187", type: "stickynote", x: 950, y: 375, width: 170, height: 100, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 453745659, boundTextId: "el-730948272-1272599008", frameId: "el-939292257-646237980", baseHeight: 100, created: 1790408902329, version: 2, versionNonce: 1111741029, updated: 2241.0999999940395, isDeleted: !1 }, { id: "el-730948272-1272599008", type: "text", x: 990.5, y: 412.5, width: 89, height: 25, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 131470850, text: "Pair more", originalText: "Pair more", fontSize: 20, fontFamily: 5, lineHeight: 1.25, containerId: "el-120123835-2145135187", baseFontSize: 20, version: 1, versionNonce: 1264561758, updated: 2241.0999999940395, isDeleted: !1 }, { id: "el-1175199065-1056943304", type: "stickynote", x: 950, y: 495, width: 170, height: 100, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#ffdf6b", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1237470697, boundTextId: "el-1318860747-596128674", frameId: "el-939292257-646237980", baseHeight: 100, created: 1790408902463, version: 2, versionNonce: 2070754494, updated: 2388.5999999940395, isDeleted: !1 }, { id: "el-1318860747-596128674", type: "text", x: 995.5, y: 514, width: 79, height: 45, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 793727441, text: `Retro on
Fridays`, originalText: "Retro on Fridays", fontSize: 18, fontFamily: 5, lineHeight: 1.25, containerId: "el-1175199065-1056943304", baseFontSize: 20, version: 1, versionNonce: 1542850038, updated: 2375.2999999970198, isDeleted: !1 }, { id: "el-939292257-646237980", type: "frame", x: 930, y: 210, width: 220, height: 400, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 1601704690, name: "Actions", version: 2, versionNonce: 872751502, updated: 1422.1999999955297, isDeleted: !1 }], IC = {
  type: CC,
  version: AC,
  elements: PC
}, zC = "osidraw", MC = 1, OC = [{ id: "el-1315239215-682023165", type: "text", x: 470, y: 235.5, width: 154, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 551814747, text: `Slow onboarding
Manual support`, originalText: `Slow onboarding
Manual support`, fontSize: 20, fontFamily: 5, lineHeight: 1.25, frameId: "el-197850082-1988092262", version: 1, versionNonce: 1971096593, updated: 986.6000000014901, isDeleted: !1 }, { id: "el-176092090-266060315", type: "ellipse", x: 665, y: 248, width: 90, height: 90, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1247155574, frameId: "el-197850082-1988092262", version: 1, versionNonce: 1230468935, updated: 1759.2000000029802, isDeleted: !1 }, { id: "el-197850082-1988092262", type: "frame", x: 450, y: 190, width: 330, height: 190, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 1514390391, name: "Problem", version: 2, versionNonce: 1098927944, updated: 974.3999999985099, isDeleted: !1 }, { id: "el-1584999153-109364348", type: "text", x: 820, y: 235.5, width: 177, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 563675365, text: `One click checkout
Auto receipts`, originalText: `One click checkout
Auto receipts`, fontSize: 20, fontFamily: 5, lineHeight: 1.25, frameId: "el-398158445-155267726", version: 1, versionNonce: 1535910695, updated: 1229.8999999985099, isDeleted: !1 }, { id: "el-1133158889-1311099393", type: "figure", x: 1015, y: 248, width: 90, height: 90, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1906462456, frameId: "el-398158445-155267726", figure: { kind: "star", sides: 6 }, version: 1, versionNonce: 639642326, updated: 1976.2999999970198, isDeleted: !1 }, { id: "el-398158445-155267726", type: "frame", x: 800, y: 190, width: 330, height: 190, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 676032570, name: "Solution", version: 2, versionNonce: 1638375795, updated: 1217.5, isDeleted: !1 }, { id: "el-349698360-781320279", type: "text", x: 470, y: 445.5, width: 172, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 896386885, text: `2M target users
20% MoM growth`, originalText: `2M target users
20% MoM growth`, fontSize: 20, fontFamily: 5, lineHeight: 1.25, frameId: "el-782528921-2143410935", version: 1, versionNonce: 1392540591, updated: 1464.1000000014901, isDeleted: !1 }, { id: "el-823321944-1983746689", type: "figure", x: 665, y: 458, width: 90, height: 90, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 2038088217, frameId: "el-782528921-2143410935", figure: { kind: "polygon", sides: 5 }, version: 2, versionNonce: 994779449, updated: 2293.60000000149, isDeleted: !1 }, { id: "el-782528921-2143410935", type: "frame", x: 450, y: 400, width: 330, height: 190, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 63706797, name: "Market", version: 2, versionNonce: 618317946, updated: 1448.7000000029802, isDeleted: !1 }, { id: "el-1614745267-219055066", type: "text", x: 820, y: 445.5, width: 120, height: 50, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: 8, seed: 1485628632, text: `$500k seed
18mo runway`, originalText: `$500k seed
18mo runway`, fontSize: 20, fontFamily: 5, lineHeight: 1.25, frameId: "el-1088069637-367348057", version: 1, versionNonce: 1850347881, updated: 1691.1000000014901, isDeleted: !1 }, { id: "el-580708548-139235795", type: "line", x: 980, y: 460, width: 130, height: 110, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, roundness: null, seed: 2269319, points: [[0, 70], [65, 0], [130, 70], [65, 110], [0, 70]], polygon: !0, frameId: "el-1088069637-367348057", version: 2, versionNonce: 1364102779, updated: 3076.2000000029802, isDeleted: !1 }, { id: "el-1088069637-367348057", type: "frame", x: 800, y: 400, width: 330, height: 190, angle: 0, strokeColor: "#bbbbbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, roundness: 8, seed: 1244233432, name: "Ask", version: 2, versionNonce: 382897016, updated: 1682.2000000029802, isDeleted: !1 }], FC = {
  type: zC,
  version: MC,
  elements: OC
}, RC = "osidraw", LC = 1, DC = /* @__PURE__ */ JSON.parse('[{"id":"el-1940618347-1382905073","type":"ellipse","x":715,"y":360,"width":170,"height":100,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":751951009,"boundTextId":"el-1977007378-164867242","version":2,"versionNonce":1711728060,"updated":976,"isDeleted":false},{"id":"el-1977007378-164867242","type":"text","x":776.8959235991434,"y":397.6446609406726,"width":46,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":230814905,"text":"Idea","originalText":"Idea","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1940618347-1382905073","version":1,"versionNonce":1322620904,"updated":961.2000000029802,"isDeleted":false},{"id":"el-703217251-956882889","type":"rectangle","x":994.9995301977119,"y":385.00047088537275,"width":129.99877895086183,"height":49.999378555646615,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1096725205,"boundTextId":"el-1859440781-1679146003","version":2,"versionNonce":938102552,"updated":1158.7000000029802,"isDeleted":false},{"id":"el-1859440781-1679146003","type":"text","x":1027.4989196731428,"y":397.500160163196,"width":65,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1029500572,"text":"Design","originalText":"Design","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-703217251-956882889","version":1,"versionNonce":1138388297,"updated":1145.6000000014901,"isDeleted":false},{"id":"el-251650182-1789922901","type":"arrow","x":890.9036070902309,"y":412.57685413344655,"width":98.09592310748098,"height":21.42362808349884,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":517168045,"points":[[0,0],[49.08181685978934,21.42362808349884],[98.09592310748098,0.04085164021802257]],"startBinding":"el-1940618347-1382905073","endBinding":"el-703217251-956882889","startFixedPoint":[1,0.5],"endFixedPoint":[0,0.49999999999999944],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":2136369670,"updated":1610.6000000014901,"isDeleted":false},{"id":"el-1594704200-1511417603","type":"rectangle","x":865.0009701635621,"y":255.00169168216507,"width":129.99866949250588,"height":49.99948826634841,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":527352065,"boundTextId":"el-613793507-429415762","version":2,"versionNonce":1447944575,"updated":1944.5,"isDeleted":false},{"id":"el-613793507-429415762","type":"text","x":894.000304909815,"y":267.5014358153393,"width":72,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":267217513,"text":"Budget","originalText":"Budget","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1594704200-1511417603","version":1,"versionNonce":759422771,"updated":1944.5,"isDeleted":false},{"id":"el-1392747746-1017321315","type":"arrow","x":848.7540050999829,"y":361.24660648633727,"width":78.02000337042739,"height":50.24542653782379,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":2082026658,"points":[[0,0],[52.87714436105273,-3.48681123708991],[78.02000337042739,-50.24542653782379]],"startBinding":"el-1940618347-1382905073","endBinding":"el-1594704200-1511417603","startFixedPoint":[0.7867882652940171,0.012466064863372707],"endFixedPoint":[0.49999999999999956,1],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":1565887533,"updated":2393.60000000149,"isDeleted":false},{"id":"el-303278112-2027898787","type":"rectangle","x":605.0036311785503,"y":255.00169168216507,"width":129.99866949250588,"height":49.99948826634841,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1444882597,"boundTextId":"el-43181303-1995994367","version":2,"versionNonce":1222726292,"updated":2727.5,"isDeleted":false},{"id":"el-43181303-1995994367","type":"text","x":632.0029659248032,"y":267.5014358153393,"width":76,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":672020607,"text":"Timeline","originalText":"Timeline","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-303278112-2027898787","version":1,"versionNonce":819271865,"updated":2727.5,"isDeleted":false},{"id":"el-1799606905-1629375551","type":"arrow","x":751.2468243533724,"y":361.2462707964136,"width":78.01770484137614,"height":50.245090847900144,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":914790811,"points":[[0,0],[-52.876106774015966,-3.486750202558369],[-78.01770484137614,-50.245090847900144]],"startBinding":"el-1940618347-1382905073","endBinding":"el-303278112-2027898787","startFixedPoint":[0.21321661384336707,0.012462707964136257],"endFixedPoint":[0.49999999999999956,1],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":1012708557,"updated":3176.89999999851,"isDeleted":false},{"id":"el-1449385551-1724529645","type":"rectangle","x":475.00496168604445,"y":385.00036117467096,"width":129.99866949250588,"height":49.99948826634841,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":2051075397,"boundTextId":"el-994188258-1267511782","version":2,"versionNonce":574679011,"updated":3511.7000000029802,"isDeleted":false},{"id":"el-994188258-1267511782","type":"text","x":514.5042964322975,"y":397.50010530784516,"width":51,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":2110534447,"text":"Team","originalText":"Team","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1449385551-1724529645","version":1,"versionNonce":1055706069,"updated":3511.7000000029802,"isDeleted":false},{"id":"el-1885294585-1009461782","type":"arrow","x":709.0963465045709,"y":412.57623411652185,"width":98.09271532602042,"height":21.423839180031052,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1447610446,"points":[[0,0],[-49.094498923668766,21.423839180031052],[-98.09271532602042,0.04213442514867438]],"startBinding":"el-1940618347-1382905073","endBinding":"el-1449385551-1724529645","startFixedPoint":[0,0.5],"endFixedPoint":[1,0.5],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":1605482946,"updated":3960,"isDeleted":false},{"id":"el-494879695-490924943","type":"rectangle","x":605.0036311785503,"y":514.9990306671768,"width":129.99866949250588,"height":49.99948826634841,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1738855859,"boundTextId":"el-1160967288-1519772619","version":2,"versionNonce":1025723583,"updated":4294.39999999851,"isDeleted":false},{"id":"el-1160967288-1519772619","type":"text","x":643.5029659248032,"y":527.498774800351,"width":53,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1240149203,"text":"Risks","originalText":"Risks","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-494879695-490924943","version":1,"versionNonce":221641723,"updated":4294.39999999851,"isDeleted":false},{"id":"el-764722674-261521080","type":"arrow","x":751.246885387904,"y":458.75375671568196,"width":78.01776960814311,"height":50.24527395149488,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1750234274,"points":[[0,0],[-52.87616780854751,3.4868722716215643],[-78.01776960814311,50.24527395149488]],"startBinding":"el-1940618347-1382905073","endBinding":"el-494879695-490924943","startFixedPoint":[0.2132169728700232,0.9875375671568196],"endFixedPoint":[0.49999999999999956,0],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":749431395,"updated":4743.39999999851,"isDeleted":false},{"id":"el-1841683736-859093105","type":"rectangle","x":865.0009701635621,"y":514.9990306671768,"width":129.99866949250588,"height":49.99948826634841,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1384800493,"boundTextId":"el-2081388482-206715444","version":2,"versionNonce":110892379,"updated":5092.10000000149,"isDeleted":false},{"id":"el-2081388482-206715444","type":"text","x":883.500304909815,"y":527.498774800351,"width":93,"height":25,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":907842823,"text":"Marketing","originalText":"Marketing","fontSize":20,"fontFamily":5,"lineHeight":1.25,"containerId":"el-1841683736-859093105","version":1,"versionNonce":927178697,"updated":5079,"isDeleted":false},{"id":"el-1986398578-1304989000","type":"arrow","x":848.7509017017503,"y":458.7515692178641,"width":78.02235135103058,"height":50.247461449312766,"angle":0,"strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":301163406,"points":[[0,0],[52.869701615747886,3.4815881080650684],[78.02235135103058,50.247461449312766]],"startBinding":"el-1940618347-1382905073","endBinding":"el-1841683736-859093105","startFixedPoint":[0.7867700100102959,0.9875156921786408],"endFixedPoint":[0.49999999999999956,0],"startBindMode":"orbit","endBindMode":"orbit","version":2,"versionNonce":154153066,"updated":5527.5,"isDeleted":false},{"id":"el-1833163191-419339784","type":"figure","x":770.0019424575,"y":185.0024081092773,"width":59.999385919618135,"height":59.99938591961808,"angle":0,"strokeColor":"#e03131","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1064682300,"figure":{"kind":"star","sides":6},"version":2,"versionNonce":2103504747,"updated":5941.60000000149,"isDeleted":false},{"id":"el-503046482-648375805","type":"figure","x":770.0019424575,"y":584.9983142400646,"width":59.999385919618135,"height":59.999385919618135,"angle":0,"strokeColor":"#2f9e44","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":2047688747,"figure":{"kind":"star","sides":6},"version":2,"versionNonce":745346813,"updated":6191.70000000298,"isDeleted":false},{"id":"el-384658359-1834878728","type":"figure","x":460.00511520614,"y":200.0022545891818,"width":69.99928357288775,"height":59.999385919618135,"angle":0,"strokeColor":"#1971c2","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":1112023,"figure":{"kind":"polygon","sides":3},"version":3,"versionNonce":920926017,"updated":6441.79999999702,"isDeleted":false},{"id":"el-1921167024-444914104","type":"figure","x":1059.998974402321,"y":579.9983654134297,"width":69.99928357288763,"height":59.999385919618135,"angle":0,"strokeColor":"#f08c00","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":2,"strokeStyle":"solid","roughness":1,"opacity":100,"roundness":8,"seed":3239419,"figure":{"kind":"polygon","sides":3},"version":3,"versionNonce":317046705,"updated":6708.39999999851,"isDeleted":false}]'), NC = {
  type: RC,
  version: LC,
  elements: DC
}, BC = [
  {
    id: "checkout",
    name: "Checkout flow",
    description: "A flowchart from cart to payment, with a branching decision.",
    file: kC
  },
  {
    id: "architecture",
    name: "System architecture",
    description: "Clients, services and data, each in its own frame, connected and labelled.",
    file: TC
  },
  {
    id: "retro",
    name: "Sprint retro",
    description: "Three columns of sticky notes: went well, to improve, and actions.",
    file: IC
  },
  {
    id: "pitch",
    name: "Pitch deck",
    description: "Four slides as frames, ready to step through in Present mode.",
    file: FC
  },
  {
    id: "mindmap",
    name: "Mind map",
    description: "A central idea with branches radiating out to it.",
    file: NC
  }
];
var UC = /* @__PURE__ */ F('<span class="template-status svelte-7r1god">Adding…</span>'), jC = /* @__PURE__ */ F('<li><button type="button" class="template-row svelte-7r1god"><span class="template-preview svelte-7r1god"><img alt="" loading="lazy" class="svelte-7r1god"/></span> <span class="template-text svelte-7r1god"><span class="template-name svelte-7r1god"> </span> <span class="template-description svelte-7r1god"> </span></span> <!></button></li>'), HC = /* @__PURE__ */ F('<p class="error-msg svelte-7r1god" role="alert"> </p>'), WC = /* @__PURE__ */ F('<div class="modal-backdrop svelte-7r1god" role="dialog" aria-modal="true" aria-labelledby="templates-title"><div class="modal-card svelte-7r1god" tabindex="-1"><div class="modal-header svelte-7r1god"><h3 id="templates-title" class="svelte-7r1god">Templates</h3> <button type="button" class="close-btn svelte-7r1god" aria-label="Close dialog">✕</button></div> <p class="hint svelte-7r1god">Starts a new board if you can create one here, or drops it into this board otherwise.</p> <ul class="template-list svelte-7r1god"></ul> <!> <div class="actions svelte-7r1god"><button type="button" class="btn-cancel svelte-7r1god">Cancel</button></div></div></div>');
function ZC(t, e) {
  ot(e, !0);
  const { store: n, openBoard: r } = bm();
  let o = /* @__PURE__ */ B(null), i = /* @__PURE__ */ B(null), a;
  Gt(() => yn(a));
  async function l(k) {
    if (!s(o)) {
      if (_(o, k.id, !0), _(i, null), r === void 0) {
        e.onInsert(JSON.stringify(k.file)), e.onClose();
        return;
      }
      try {
        const O = await n.create(k.name);
        await n.replace(O.slug, k.file, O.rev), e.onClose(), await r(O.slug);
      } catch (O) {
        if (O instanceof Ft && O.status === 403) {
          e.onInsert(JSON.stringify(k.file)), e.onClose();
          return;
        }
        _(i, O instanceof Error ? O.message : "Could not use that template.", !0), _(o, null);
      }
    }
  }
  var c = WC(), d = z(c), u = z(d), f = b(z(u), 2), h = b(u, 4);
  Ze(h, 21, () => BC, (k) => k.id, (k, O) => {
    var C = jC(), P = z(C), S = z(P), T = ae(S), M = b(S, 2), H = z(M), q = ae(H, !0), R = b(H, 2), K = ae(R, !0), ie = b(M, 2);
    {
      var ne = ($) => {
        var G = UC();
        A($, G);
      };
      j(ie, ($) => {
        s(o) === s(O).id && $(ne);
      });
    }
    Y(() => {
      P.disabled = s(o) !== null, N(T, "src", `/templates/${s(O).id}.png`), le(q, s(O).name), le(K, s(O).description);
    }), I("click", P, () => l(s(O))), A(k, C);
  });
  var p = b(h, 2);
  {
    var m = (k) => {
      var O = HC(), C = ae(O, !0);
      Y(() => le(C, s(i))), A(k, O);
    };
    j(p, (k) => {
      s(i) && k(m);
    });
  }
  var w = b(p, 2), y = ae(w);
  Je(d, (k) => a = k, () => a), I("click", f, function(...k) {
    e.onClose?.apply(this, k);
  }), I("click", y, function(...k) {
    e.onClose?.apply(this, k);
  }), A(t, c), it();
}
ct(["click"]);
var qr = /* @__PURE__ */ ((t) => (t[t.Border = -1] = "Border", t[t.Data = 0] = "Data", t[t.Function = 1] = "Function", t[t.Position = 2] = "Position", t[t.Timing = 3] = "Timing", t[t.Alignment = 4] = "Alignment", t))(qr || {});
const KC = [0, 1], Pv = [1, 0], Iv = [2, 3], zv = [3, 2], VC = {
  L: KC,
  M: Pv,
  Q: Iv,
  H: zv
}, JC = /^\d*$/, GC = /^[A-Z0-9 $%*+./:-]*$/, zl = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:", Du = 1, Nu = 40, Vh = 3, qC = 3, bs = 40, YC = 10, Mv = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  // 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  // High
], Ov = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  // 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  // High
];
class XC {
  /* -- Constructor (low level) and fields -- */
  // Creates a new QR Code with the given version number,
  // error correction level, data codeword bytes, and mask number.
  // This is a low-level API that most users should not use directly.
  // A mid-level API is the encodeSegments() function.
  constructor(e, n, r, o) {
    if (this.version = e, this.ecc = n, e < Du || e > Nu)
      throw new RangeError("Version value out of range");
    if (o < -1 || o > 7)
      throw new RangeError("Mask value out of range");
    this.size = e * 4 + 17;
    const i = Array.from({ length: this.size }).fill(!1);
    for (let l = 0; l < this.size; l++)
      this.modules.push(i.slice()), this.types.push(i.map(() => 0));
    this.drawFunctionPatterns();
    const a = this.addEccAndInterleave(r);
    if (this.drawCodewords(a), o === -1) {
      let l = 1e9;
      for (let c = 0; c < 8; c++) {
        this.applyMask(c), this.drawFormatBits(c);
        const d = this.getPenaltyScore();
        d < l && (o = c, l = d), this.applyMask(c);
      }
    }
    this.mask = o, this.applyMask(o), this.drawFormatBits(o);
  }
  /* -- Fields -- */
  // The width and height of this QR Code, measured in modules, between
  // 21 and 177 (inclusive). This is equal to version * 4 + 17.
  size;
  // The index of the mask pattern used in this QR Code, which is between 0 and 7 (inclusive).
  // Even if a QR Code is created with automatic masking requested (mask = -1),
  // the resulting object still has a mask value between 0 and 7.
  mask;
  // The modules of this QR Code (false = light, true = dark).
  // Immutable after constructor finishes. Accessed through getModule().
  modules = [];
  types = [];
  /* -- Accessor methods -- */
  // Returns the color of the module (pixel) at the given coordinates, which is false
  // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
  // If the given coordinates are out of bounds, then false (light) is returned.
  getModule(e, n) {
    return e >= 0 && e < this.size && n >= 0 && n < this.size && this.modules[n][e];
  }
  /* -- Private helper methods for constructor: Drawing function modules -- */
  // Reads this object's version field, and draws and marks all function modules.
  drawFunctionPatterns() {
    for (let r = 0; r < this.size; r++)
      this.setFunctionModule(6, r, r % 2 === 0, qr.Timing), this.setFunctionModule(r, 6, r % 2 === 0, qr.Timing);
    this.drawFinderPattern(3, 3), this.drawFinderPattern(this.size - 4, 3), this.drawFinderPattern(3, this.size - 4);
    const e = this.getAlignmentPatternPositions(), n = e.length;
    for (let r = 0; r < n; r++)
      for (let o = 0; o < n; o++)
        r === 0 && o === 0 || r === 0 && o === n - 1 || r === n - 1 && o === 0 || this.drawAlignmentPattern(e[r], e[o]);
    this.drawFormatBits(0), this.drawVersion();
  }
  // Draws two copies of the format bits (with its own error correction code)
  // based on the given mask and this object's error correction level field.
  drawFormatBits(e) {
    const n = this.ecc[1] << 3 | e;
    let r = n;
    for (let i = 0; i < 10; i++)
      r = r << 1 ^ (r >>> 9) * 1335;
    const o = (n << 10 | r) ^ 21522;
    for (let i = 0; i <= 5; i++)
      this.setFunctionModule(8, i, rr(o, i));
    this.setFunctionModule(8, 7, rr(o, 6)), this.setFunctionModule(8, 8, rr(o, 7)), this.setFunctionModule(7, 8, rr(o, 8));
    for (let i = 9; i < 15; i++)
      this.setFunctionModule(14 - i, 8, rr(o, i));
    for (let i = 0; i < 8; i++)
      this.setFunctionModule(this.size - 1 - i, 8, rr(o, i));
    for (let i = 8; i < 15; i++)
      this.setFunctionModule(8, this.size - 15 + i, rr(o, i));
    this.setFunctionModule(8, this.size - 8, !0);
  }
  // Draws two copies of the version bits (with its own error correction code),
  // based on this object's version field, iff 7 <= version <= 40.
  drawVersion() {
    if (this.version < 7)
      return;
    let e = this.version;
    for (let r = 0; r < 12; r++)
      e = e << 1 ^ (e >>> 11) * 7973;
    const n = this.version << 12 | e;
    for (let r = 0; r < 18; r++) {
      const o = rr(n, r), i = this.size - 11 + r % 3, a = Math.floor(r / 3);
      this.setFunctionModule(i, a, o), this.setFunctionModule(a, i, o);
    }
  }
  // Draws a 9*9 finder pattern including the border separator,
  // with the center module at (x, y). Modules can be out of bounds.
  drawFinderPattern(e, n) {
    for (let r = -4; r <= 4; r++)
      for (let o = -4; o <= 4; o++) {
        const i = Math.max(Math.abs(o), Math.abs(r)), a = e + o, l = n + r;
        a >= 0 && a < this.size && l >= 0 && l < this.size && this.setFunctionModule(a, l, i !== 2 && i !== 4, qr.Position);
      }
  }
  // Draws a 5*5 alignment pattern, with the center module
  // at (x, y). All modules must be in bounds.
  drawAlignmentPattern(e, n) {
    for (let r = -2; r <= 2; r++)
      for (let o = -2; o <= 2; o++)
        this.setFunctionModule(
          e + o,
          n + r,
          Math.max(Math.abs(o), Math.abs(r)) !== 1,
          qr.Alignment
        );
  }
  // Sets the color of a module and marks it as a function module.
  // Only used by the constructor. Coordinates must be in bounds.
  setFunctionModule(e, n, r, o = qr.Function) {
    this.modules[n][e] = r, this.types[n][e] = o;
  }
  /* -- Private helper methods for constructor: Codewords and masking -- */
  // Returns a new byte string representing the given data with the appropriate error correction
  // codewords appended to it, based on this object's version and error correction level.
  addEccAndInterleave(e) {
    const n = this.version, r = this.ecc;
    if (e.length !== Is(n, r))
      throw new RangeError("Invalid argument");
    const o = Ov[r[0]][n], i = Mv[r[0]][n], a = Math.floor(Sc(n) / 8), l = o - a % o, c = Math.floor(a / o), d = [], u = sA(i);
    for (let h = 0, p = 0; h < o; h++) {
      const m = e.slice(p, p + c - i + (h < l ? 0 : 1));
      p += m.length;
      const w = aA(m, u);
      h < l && m.push(0), d.push(m.concat(w));
    }
    const f = [];
    for (let h = 0; h < d[0].length; h++)
      d.forEach((p, m) => {
        (h !== c - i || m >= l) && f.push(p[h]);
      });
    return f;
  }
  // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
  // data area of this QR Code. Function modules need to be marked off before this is called.
  drawCodewords(e) {
    if (e.length !== Math.floor(Sc(this.version) / 8))
      throw new RangeError("Invalid argument");
    let n = 0;
    for (let r = this.size - 1; r >= 1; r -= 2) {
      r === 6 && (r = 5);
      for (let o = 0; o < this.size; o++)
        for (let i = 0; i < 2; i++) {
          const a = r - i, c = (r + 1 & 2) === 0 ? this.size - 1 - o : o;
          !this.types[c][a] && n < e.length * 8 && (this.modules[c][a] = rr(e[n >>> 3], 7 - (n & 7)), n++);
        }
    }
  }
  // XORs the codeword modules in this QR Code with the given mask pattern.
  // The function modules must be marked and the codeword bits must be drawn
  // before masking. Due to the arithmetic of XOR, calling applyMask() with
  // the same mask value a second time will undo the mask. A final well-formed
  // QR Code needs exactly one (not zero, two, etc.) mask applied.
  applyMask(e) {
    if (e < 0 || e > 7)
      throw new RangeError("Mask value out of range");
    for (let n = 0; n < this.size; n++)
      for (let r = 0; r < this.size; r++) {
        let o;
        switch (e) {
          case 0:
            o = (r + n) % 2 === 0;
            break;
          case 1:
            o = n % 2 === 0;
            break;
          case 2:
            o = r % 3 === 0;
            break;
          case 3:
            o = (r + n) % 3 === 0;
            break;
          case 4:
            o = (Math.floor(r / 3) + Math.floor(n / 2)) % 2 === 0;
            break;
          case 5:
            o = r * n % 2 + r * n % 3 === 0;
            break;
          case 6:
            o = (r * n % 2 + r * n % 3) % 2 === 0;
            break;
          case 7:
            o = ((r + n) % 2 + r * n % 3) % 2 === 0;
            break;
          default:
            throw new Error("Unreachable");
        }
        !this.types[n][r] && o && (this.modules[n][r] = !this.modules[n][r]);
      }
  }
  // Calculates and returns the penalty score based on state of this QR Code's current modules.
  // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
  getPenaltyScore() {
    let e = 0;
    for (let i = 0; i < this.size; i++) {
      let a = !1, l = 0;
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (let d = 0; d < this.size; d++)
        this.modules[i][d] === a ? (l++, l === 5 ? e += Vh : l > 5 && e++) : (this.finderPenaltyAddHistory(l, c), a || (e += this.finderPenaltyCountPatterns(c) * bs), a = this.modules[i][d], l = 1);
      e += this.finderPenaltyTerminateAndCount(a, l, c) * bs;
    }
    for (let i = 0; i < this.size; i++) {
      let a = !1, l = 0;
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (let d = 0; d < this.size; d++)
        this.modules[d][i] === a ? (l++, l === 5 ? e += Vh : l > 5 && e++) : (this.finderPenaltyAddHistory(l, c), a || (e += this.finderPenaltyCountPatterns(c) * bs), a = this.modules[d][i], l = 1);
      e += this.finderPenaltyTerminateAndCount(a, l, c) * bs;
    }
    for (let i = 0; i < this.size - 1; i++)
      for (let a = 0; a < this.size - 1; a++) {
        const l = this.modules[i][a];
        l === this.modules[i][a + 1] && l === this.modules[i + 1][a] && l === this.modules[i + 1][a + 1] && (e += qC);
      }
    let n = 0;
    for (const i of this.modules)
      n = i.reduce((a, l) => a + (l ? 1 : 0), n);
    const r = this.size * this.size, o = Math.ceil(Math.abs(n * 20 - r * 10) / r) - 1;
    return e += o * YC, e;
  }
  /* -- Private helper functions -- */
  // Returns an ascending list of positions of alignment patterns for this version number.
  // Each position is in the range [0,177), and are used on both the x and y axes.
  // This could be implemented as lookup table of 40 variable-length lists of integers.
  getAlignmentPatternPositions() {
    if (this.version === 1)
      return [];
    {
      const e = Math.floor(this.version / 7) + 2, n = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (e * 2 - 2)) * 2, r = [6];
      for (let o = this.size - 7; r.length < e; o -= n)
        r.splice(1, 0, o);
      return r;
    }
  }
  // Can only be called immediately after a light run is added, and
  // returns either 0, 1, or 2. A helper function for getPenaltyScore().
  finderPenaltyCountPatterns(e) {
    const n = e[1], r = n > 0 && e[2] === n && e[3] === n * 3 && e[4] === n && e[5] === n;
    return (r && e[0] >= n * 4 && e[6] >= n ? 1 : 0) + (r && e[6] >= n * 4 && e[0] >= n ? 1 : 0);
  }
  // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
  finderPenaltyTerminateAndCount(e, n, r) {
    return e && (this.finderPenaltyAddHistory(n, r), n = 0), n += this.size, this.finderPenaltyAddHistory(n, r), this.finderPenaltyCountPatterns(r);
  }
  // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
  finderPenaltyAddHistory(e, n) {
    n[0] === 0 && (e += this.size), n.pop(), n.unshift(e);
  }
}
function lr(t, e, n) {
  if (e < 0 || e > 31 || t >>> e)
    throw new RangeError("Value out of range");
  for (let r = e - 1; r >= 0; r--)
    n.push(t >>> r & 1);
}
function rr(t, e) {
  return (t >>> e & 1) !== 0;
}
class Bu {
  // Creates a new QR Code segment with the given attributes and data.
  // The character count (numChars) must agree with the mode and the bit buffer length,
  // but the constraint isn't checked. The given bit buffer is cloned and stored.
  constructor(e, n, r) {
    if (this.mode = e, this.numChars = n, this.bitData = r, n < 0)
      throw new RangeError("Invalid argument");
    this.bitData = r.slice();
  }
  /* -- Methods -- */
  // Returns a new copy of the data bits of this segment.
  getData() {
    return this.bitData.slice();
  }
}
const QC = [1, 10, 12, 14], $C = [2, 9, 11, 13], eA = [4, 8, 16, 16];
function Fv(t, e) {
  return t[Math.floor((e + 7) / 17) + 1];
}
function Rv(t) {
  const e = [];
  for (const n of t)
    lr(n, 8, e);
  return new Bu(eA, t.length, e);
}
function tA(t) {
  if (!Lv(t))
    throw new RangeError("String contains non-numeric characters");
  const e = [];
  for (let n = 0; n < t.length; ) {
    const r = Math.min(t.length - n, 3);
    lr(Number.parseInt(t.substring(n, n + r), 10), r * 3 + 1, e), n += r;
  }
  return new Bu(QC, t.length, e);
}
function nA(t) {
  if (!Dv(t))
    throw new RangeError("String contains unencodable characters in alphanumeric mode");
  const e = [];
  let n;
  for (n = 0; n + 2 <= t.length; n += 2) {
    let r = zl.indexOf(t.charAt(n)) * 45;
    r += zl.indexOf(t.charAt(n + 1)), lr(r, 11, e);
  }
  return n < t.length && lr(zl.indexOf(t.charAt(n)), 6, e), new Bu($C, t.length, e);
}
function rA(t) {
  return t === "" ? [] : Lv(t) ? [tA(t)] : Dv(t) ? [nA(t)] : [Rv(iA(t))];
}
function Lv(t) {
  return JC.test(t);
}
function Dv(t) {
  return GC.test(t);
}
function oA(t, e) {
  let n = 0;
  for (const r of t) {
    const o = Fv(r.mode, e);
    if (r.numChars >= 1 << o)
      return Number.POSITIVE_INFINITY;
    n += 4 + o + r.bitData.length;
  }
  return n;
}
function iA(t) {
  t = encodeURI(t);
  const e = [];
  for (let n = 0; n < t.length; n++)
    t.charAt(n) !== "%" ? e.push(t.charCodeAt(n)) : (e.push(Number.parseInt(t.substring(n + 1, n + 3), 16)), n += 2);
  return e;
}
function Sc(t) {
  if (t < Du || t > Nu)
    throw new RangeError("Version number out of range");
  let e = (16 * t + 128) * t + 64;
  if (t >= 2) {
    const n = Math.floor(t / 7) + 2;
    e -= (25 * n - 10) * n - 55, t >= 7 && (e -= 36);
  }
  return e;
}
function Is(t, e) {
  return Math.floor(Sc(t) / 8) - Mv[e[0]][t] * Ov[e[0]][t];
}
function sA(t) {
  if (t < 1 || t > 255)
    throw new RangeError("Degree out of range");
  const e = [];
  for (let r = 0; r < t - 1; r++)
    e.push(0);
  e.push(1);
  let n = 1;
  for (let r = 0; r < t; r++) {
    for (let o = 0; o < e.length; o++)
      e[o] = xc(e[o], n), o + 1 < e.length && (e[o] ^= e[o + 1]);
    n = xc(n, 2);
  }
  return e;
}
function aA(t, e) {
  const n = e.map((r) => 0);
  for (const r of t) {
    const o = r ^ n.shift();
    n.push(0), e.forEach((i, a) => n[a] ^= xc(i, o));
  }
  return n;
}
function xc(t, e) {
  if (t >>> 8 || e >>> 8)
    throw new RangeError("Byte out of range");
  let n = 0;
  for (let r = 7; r >= 0; r--)
    n = n << 1 ^ (n >>> 7) * 285, n ^= (e >>> r & 1) * t;
  return n;
}
function lA(t, e, n = 1, r = 40, o = -1, i = !0) {
  if (!(Du <= n && n <= r && r <= Nu) || o < -1 || o > 7)
    throw new RangeError("Invalid value");
  let a, l;
  for (a = n; ; a++) {
    const f = Is(a, e) * 8, h = oA(t, a);
    if (h <= f) {
      l = h;
      break;
    }
    if (a >= r)
      throw new RangeError("Data too long");
  }
  for (const f of [Pv, Iv, zv])
    i && l <= Is(a, f) * 8 && (e = f);
  const c = [];
  for (const f of t) {
    lr(f.mode[0], 4, c), lr(f.numChars, Fv(f.mode, a), c);
    for (const h of f.getData())
      c.push(h);
  }
  const d = Is(a, e) * 8;
  lr(0, Math.min(4, d - c.length), c), lr(0, (8 - c.length % 8) % 8, c);
  for (let f = 236; c.length < d; f ^= 253)
    lr(f, 8, c);
  const u = Array.from({ length: Math.ceil(c.length / 8) }, () => 0);
  return c.forEach((f, h) => u[h >>> 3] |= f << 7 - (h & 7)), new XC(a, e, u, o);
}
function cA(t, e) {
  const {
    ecc: n = "L",
    boostEcc: r = !1,
    minVersion: o = 1,
    maxVersion: i = 40,
    maskPattern: a = -1,
    border: l = 1
  } = e || {}, c = typeof t == "string" ? rA(t) : Array.isArray(t) ? [Rv(t)] : void 0;
  if (!c)
    throw new Error(`uqr only supports encoding string and binary data, but got: ${typeof t}`);
  const d = lA(
    c,
    VC[n],
    o,
    i,
    a,
    r
  ), u = uA({
    version: d.version,
    maskPattern: d.mask,
    size: d.size,
    data: d.modules,
    types: d.types
  }, l);
  return e?.invert && (u.data = u.data.map((f) => f.map((h) => !h))), e?.onEncoded?.(u), u;
}
function uA(t, e = 1) {
  if (!e)
    return t;
  const { size: n } = t, r = n + e * 2;
  t.size = r, t.data.forEach((i) => {
    for (let a = 0; a < e; a++)
      i.unshift(!1), i.push(!1);
  });
  for (let i = 0; i < e; i++)
    t.data.unshift(Array.from({ length: r }, (a) => !1)), t.data.push(Array.from({ length: r }, (a) => !1));
  const o = qr.Border;
  t.types.forEach((i) => {
    for (let a = 0; a < e; a++)
      i.unshift(o), i.push(o);
  });
  for (let i = 0; i < e; i++)
    t.types.unshift(Array.from({ length: r }, (a) => o)), t.types.push(Array.from({ length: r }, (a) => o));
  return t;
}
function Jh(t) {
  return t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function dA(t, e = {}) {
  const n = cA(t, e), {
    pixelSize: r = 10,
    whiteColor: o = "white",
    blackColor: i = "black"
  } = e, a = n.size * r, l = n.size * r;
  let c = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${a}">`;
  const d = [];
  for (let u = 0; u < n.size; u++)
    for (let f = 0; f < n.size; f++) {
      const h = f * r, p = u * r;
      n.data[u][f] && d.push(`M${h},${p}h${r}v${r}h-${r}z`);
    }
  return c += `<rect fill="${Jh(o)}" width="${l}" height="${a}"/>`, c += `<path fill="${Jh(i)}" d="${d.join("")}"/>`, c += "</svg>", c;
}
function fA(t, e) {
  const n = `${t.pathname}${t.search}${t.hash}`, r = [], o = (l) => e?.lan.find((c) => Gh(c.origin, l))?.over ?? "unknown", i = (l, c) => {
    const d = c.replace(/\/$/, ""), u = `${d}${n}`;
    if (r.some((h) => h.url === u)) return;
    const f = { kind: l, url: u };
    l === "network" && (f.via = Bk(new URL(d).host) ? "address" : "name", f.over = o(d)), r.push(f);
  }, a = new URL(t.origin);
  Nk(a.host) || i(e?.public && Gh(e.public, t.origin) ? "internet" : "network", t.origin);
  for (const { origin: l } of e?.lan ?? []) i("network", l);
  return e?.public && i("internet", e.public), r.length === 0 && i("this-computer", t.origin), r;
}
const Gh = (t, e) => {
  try {
    return new URL(t).origin === new URL(e).origin;
  } catch {
    return !1;
  }
}, hA = {
  wired: "People on the wired network",
  wifi: "People on this Wi-Fi",
  unknown: "People on your network"
};
function gA(t) {
  const e = new URL(t.url).host;
  switch (t.kind) {
    case "network": {
      const n = t.via === "name" ? `Uses this computer's name, ${e}, so it keeps working if its address changes.` : `By this computer's address, ${e}.`, r = t.over === "wired" ? " From the Wi-Fi it opens only where the Wi-Fi reaches the wired network." : "";
      return { title: hA[t.over ?? "unknown"], hint: `${n}${r}` };
    }
    case "internet":
      return {
        title: "Anyone, anywhere",
        hint: "A public link: works on any network, phones on mobile data included."
      };
    case "this-computer":
      return {
        title: "Only this computer",
        hint: "Nobody else can open this address. Restart with `make up` so your network address is known."
      };
  }
}
function pA(t) {
  const e = t.filter((n) => n.kind === "network");
  return e.length > 0 && e.every((n) => n.over === "wired") ? "Someone on the Wi-Fi, at home or on a phone? This computer is on the wired network only, so the links above may not reach them." : "Not on the same network — at home, or on a phone's mobile data?";
}
async function mA(t) {
  if (typeof window < "u" && window.isSecureContext && navigator.clipboard)
    try {
      return await navigator.clipboard.writeText(t), !0;
    } catch {
    }
  if (typeof document > "u") return !1;
  const e = document.createElement("textarea");
  e.value = t, e.setAttribute("readonly", ""), e.style.position = "fixed", e.style.opacity = "0", document.body.append(e), e.select();
  let n = !1;
  try {
    n = document.execCommand("copy");
  } catch {
    n = !1;
  }
  return e.remove(), n;
}
var vA = /* @__PURE__ */ F('<p class="copy-failed svelte-slw6up" role="alert">Could not copy — select the link and press Ctrl+C.</p>'), _A = /* @__PURE__ */ F(`<div class="qr svelte-slw6up"><img alt="QR code of the link" class="svelte-slw6up"/> <span>Scan it with a phone or tablet's camera to open the board there.</span></div>`), yA = /* @__PURE__ */ F('<div><div class="link-label svelte-slw6up"><span class="link-title svelte-slw6up"> </span> <span class="link-hint svelte-slw6up"> </span></div> <div class="link-box svelte-slw6up"><input readonly="" class="svelte-slw6up"/> <button type="button" class="copy-btn svelte-slw6up"> </button> <button type="button" class="qr-btn svelte-slw6up" aria-label="Show a QR code of this link">QR</button></div> <!> <!></div>'), bA = /* @__PURE__ */ F('<details class="more svelte-slw6up"><summary class="svelte-slw6up"> </summary> <!></details>'), wA = /* @__PURE__ */ F('<p class="svelte-slw6up">Opening a public link… it takes about ten seconds.</p>'), kA = /* @__PURE__ */ F('<!> <p class="svelte-slw6up">Open until you stop it, or restart Hydrawn. <button type="button" class="text-btn svelte-slw6up">Stop sharing on the internet</button></p>', 1), qh = /* @__PURE__ */ F('<p class="tunnel-error svelte-slw6up" role="alert"> </p>'), SA = /* @__PURE__ */ F('<p class="svelte-slw6up"> </p> <button type="button" class="internet-btn svelte-slw6up">Share on the internet</button> <!>', 1), xA = /* @__PURE__ */ F('<section class="internet svelte-slw6up" aria-label="Internet link"><!> <!></section>'), EA = /* @__PURE__ */ F('<div class="peer-item svelte-slw6up"><div class="avatar svelte-slw6up"> </div> <span class="name svelte-slw6up"> </span></div>'), TA = /* @__PURE__ */ F(`<div class="modal-backdrop svelte-slw6up" role="dialog" aria-modal="true" aria-labelledby="share-title"><div class="modal-card pop-in svelte-slw6up" tabindex="-1"><div class="modal-header svelte-slw6up"><div class="title-with-status svelte-slw6up"><h3 id="share-title" class="svelte-slw6up">Live Collaboration</h3> <span><span class="pulse-dot svelte-slw6up"></span> </span></div> <button type="button" class="close-btn svelte-slw6up" aria-label="Close dialog">✕</button></div> <p class="lead svelte-slw6up">Send this link. Whoever opens it draws on this board with you, live.</p> <!> <!> <!> <details class="help svelte-slw6up"><summary class="svelte-slw6up">How does this work?</summary> <ol class="svelte-slw6up"><li>Copy the link and send it — chat, email — or show its QR code to someone with a phone.</li> <li>They open it in any browser. Nothing to install, no account.</li> <li>If it does not open for them, try one of the other links. If none do, their network cannot
          reach this computer: use <strong>Share on the internet</strong>.</li></ol> <p class="svelte-slw6up">The part after <code>#</code> is the room's secret key. It never reaches the server, so live changes
        stay end-to-end encrypted — and anyone who has the link can edit this board.</p></details> <div class="peers-section svelte-slw6up"><div class="peers-header svelte-slw6up"><h4 class="svelte-slw6up">Active Collaborators</h4> <span class="count-badge svelte-slw6up"> </span></div> <div class="peers-list svelte-slw6up"><div class="peer-item me svelte-slw6up"><div class="avatar svelte-slw6up">You</div> <span class="name svelte-slw6up">You (Host)</span></div> <!></div></div></div></div>`);
function CA(t, e) {
  ot(e, !0);
  const n = (Z, _e = Mi, ve = Mi) => {
    const Le = /* @__PURE__ */ X(() => gA(_e()));
    var Q = yA();
    let de;
    var me = z(Q), Pe = z(me), Ie = ae(Pe, !0), Ke = b(Pe, 2), De = ae(Ke, !0), We = b(me, 2), Ge = z(We), Ve = b(Ge, 2), dt = ae(Ve, !0), _t = b(Ve, 2), Ot = b(We, 2);
    {
      var At = (pe) => {
        var et = vA();
        A(pe, et);
      };
      j(Ot, (pe) => {
        s(l) === _e().url && pe(At);
      });
    }
    var Rt = b(Ot, 2);
    {
      var fe = (pe) => {
        var et = _A(), xt = z(et);
        Y((ye) => N(xt, "src", ye), [() => S(_e().url)]), A(pe, et);
      };
      j(Rt, (pe) => {
        s(c) === _e().url && pe(fe);
      });
    }
    Y(() => {
      de = Ce(Q, 1, "link-row svelte-slw6up", null, de, { "link-row--primary": ve() }), N(Q, "data-kind", _e().kind), le(Ie, s(Le).title), le(De, s(Le).hint), _n(Ge, _e().url), N(Ge, "aria-label", `Share link — ${s(Le).title}`), le(dt, s(a) === _e().url ? "Copied! ✓" : "Copy link"), N(_t, "aria-pressed", s(c) === _e().url);
    }), Qe("focus", Ge, (pe) => pe.currentTarget.select()), I("click", Ve, () => P(_e().url)), I("click", _t, () => _(c, s(c) === _e().url ? null : _e().url, !0)), A(Z, Q);
  };
  let r = ke(e, "peers", 19, () => []), o = ke(e, "connectionStatus", 3, "disconnected"), i = /* @__PURE__ */ B(null), a = /* @__PURE__ */ B(null), l = /* @__PURE__ */ B(null), c = /* @__PURE__ */ B(null), d = /* @__PURE__ */ B(!1), u = /* @__PURE__ */ B(null), f;
  async function h() {
    try {
      _(i, await Qg(), !0);
    } catch {
    }
  }
  Gt(() => {
    const Z = yn(f);
    return h(), Z;
  });
  let p = null;
  bt(() => {
    const Z = s(i)?.tunnel.state === "starting";
    Z && !p && (p = setInterval(() => {
      h();
    }, 1e3)), !Z && p && (clearInterval(p), p = null);
  }), Wi(() => {
    p && clearInterval(p);
  });
  const m = /* @__PURE__ */ X(() => typeof window > "u" ? [] : fA(
    {
      origin: window.location.origin,
      pathname: window.location.pathname || `/boards/${e.slug}`,
      search: window.location.search,
      hash: window.location.hash
    },
    s(i)
  )), w = /* @__PURE__ */ X(() => s(m)[0]), y = /* @__PURE__ */ X(() => s(i)?.canManage ? s(m).find((Z) => Z.kind === "internet" && Z !== s(w)) : void 0), k = /* @__PURE__ */ X(() => s(m).slice(1).filter((Z) => Z !== s(y))), O = /* @__PURE__ */ X(() => s(i)?.tunnel.state ?? "unavailable"), C = /* @__PURE__ */ X(() => o() === "connected" ? "Live" : o() === "connecting" ? "Connecting…" : "Offline");
  async function P(Z) {
    await mA(Z) ? (_(a, Z, !0), _(l, null), setTimeout(
      () => {
        s(a) === Z && _(a, null);
      },
      2e3
    )) : _(l, Z, !0);
  }
  const S = (Z) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dA(Z, { pixelSize: 4, border: 2 }))}`;
  async function T() {
    _(d, !0), _(u, null);
    try {
      _(i, await $g(), !0);
    } catch (Z) {
      _(u, Z instanceof Error ? Z.message : "the internet link did not open", !0);
    } finally {
      _(d, !1);
    }
  }
  async function M() {
    _(d, !0), _(u, null);
    try {
      _(i, await ep(), !0), s(c) && !s(m).some((Z) => Z.url === s(c)) && _(c, null);
    } catch (Z) {
      _(u, Z instanceof Error ? Z.message : "the internet link did not close", !0);
    } finally {
      _(d, !1);
    }
  }
  var H = TA(), q = z(H), R = z(q), K = z(R), ie = b(z(K), 2);
  let ne;
  var $ = b(z(ie)), G = b(K, 2), W = b(R, 4);
  {
    var J = (Z) => {
      n(Z, () => s(w), () => !0);
    };
    j(W, (Z) => {
      s(w) && Z(J);
    });
  }
  var E = b(W, 2);
  {
    var L = (Z) => {
      var _e = bA(), ve = z(_e), Le = ae(ve), Q = b(ve, 2);
      Ze(Q, 17, () => s(k), (de) => de.url, (de, me) => {
        n(de, () => s(me), () => !1);
      }), Y(() => le(Le, `Other links (${s(k).length ?? ""})`)), A(Z, _e);
    };
    j(E, (Z) => {
      s(k).length > 0 && Z(L);
    });
  }
  var V = b(E, 2);
  {
    var ee = (Z) => {
      var _e = xA(), ve = z(_e);
      {
        var Le = (Ie) => {
          var Ke = wA();
          A(Ie, Ke);
        }, Q = (Ie) => {
          var Ke = kA(), De = Ue(Ke);
          {
            var We = (dt) => {
              n(dt, () => s(y), () => !1);
            };
            j(De, (dt) => {
              s(y) && dt(We);
            });
          }
          var Ge = b(De, 2), Ve = b(z(Ge));
          Y(() => Ve.disabled = s(d)), I("click", Ve, M), A(Ie, Ke);
        }, de = (Ie) => {
          var Ke = SA(), De = Ue(Ke), We = ae(De, !0), Ge = b(De, 2), Ve = b(Ge, 2);
          {
            var dt = (_t) => {
              var Ot = qh(), At = ae(Ot);
              Y(() => le(At, `It did not open: ${s(i).tunnel.message ?? ""}.`)), A(_t, Ot);
            };
            j(Ve, (_t) => {
              s(O) === "failed" && s(i)?.tunnel.message && _t(dt);
            });
          }
          Y(
            (_t) => {
              le(We, _t), Ge.disabled = s(d);
            },
            [() => pA(s(m))]
          ), I("click", Ge, T), A(Ie, Ke);
        };
        j(ve, (Ie) => {
          s(O) === "starting" ? Ie(Le) : s(O) === "on" ? Ie(Q, 1) : Ie(de, -1);
        });
      }
      var me = b(ve, 2);
      {
        var Pe = (Ie) => {
          var Ke = qh(), De = ae(Ke, !0);
          Y(() => le(De, s(u))), A(Ie, Ke);
        };
        j(me, (Ie) => {
          s(u) && Ie(Pe);
        });
      }
      A(Z, _e);
    };
    j(V, (Z) => {
      s(i)?.canManage && s(O) !== "unavailable" && Z(ee);
    });
  }
  var ge = b(V, 4), re = z(ge), se = b(z(re), 2), xe = ae(se), be = b(re, 2), Me = z(be), Re = z(Me);
  ht(Re, "", {}, { background: "#6965db" });
  var Se = b(Me, 2);
  Ze(Se, 17, r, (Z) => Z.clientId, (Z, _e) => {
    var ve = EA(), Le = z(ve);
    let Q;
    var de = ae(Le, !0), me = b(Le, 2), Pe = ae(me, !0);
    Y(
      (Ie) => {
        Q = ht(Le, "", Q, { background: s(_e).color }), le(de, Ie), le(Pe, s(_e).name);
      },
      [() => s(_e).name.slice(0, 2).toUpperCase()]
    ), A(Z, ve);
  }), Je(q, (Z) => f = Z, () => f), Y(() => {
    ne = Ce(ie, 1, "live-pill svelte-slw6up", null, ne, {
      "live-pill--offline": o() !== "connected",
      "live-pill--connecting": o() === "connecting"
    }), le($, ` ${s(C) ?? ""}`), le(xe, `${r().length + 1} online`);
  }), I("click", G, function(...Z) {
    e.onClose?.apply(this, Z);
  }), A(t, H), it();
}
ct(["click"]);
ct(["click"]);
var AA = /* @__PURE__ */ F('<li class="svelte-ol660w"><span class="desc svelte-ol660w"> </span> <kbd class="svelte-ol660w"> </kbd></li>'), PA = /* @__PURE__ */ F('<div class="shortcut-section svelte-ol660w"><h4 class="svelte-ol660w"> </h4> <ul class="svelte-ol660w"></ul></div>'), IA = /* @__PURE__ */ F('<div class="modal-backdrop svelte-ol660w" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title"><div class="modal-card svelte-ol660w" tabindex="-1"><div class="modal-header svelte-ol660w"><h3 id="shortcuts-title" class="svelte-ol660w">Keyboard Shortcuts</h3> <button type="button" class="close-btn svelte-ol660w" aria-label="Close dialog">✕</button></div> <div class="shortcuts-grid svelte-ol660w"></div></div></div>');
function zA(t, e) {
  ot(e, !0);
  let n;
  const r = s6();
  Gt(() => yn(n));
  var o = IA(), i = z(o), a = z(i), l = b(z(a), 2), c = b(a, 2);
  Ze(c, 21, () => r, (d) => d.section, (d, u) => {
    var f = PA(), h = z(f), p = ae(h, !0), m = b(h, 2);
    Ze(m, 21, () => s(u).entries, (w) => w.id, (w, y) => {
      var k = AA(), O = z(k), C = ae(O, !0), P = b(O, 2), S = ae(P, !0);
      Y(
        (T) => {
          le(C, s(y).label), le(S, T);
        },
        [() => ut(s(y).id)]
      ), A(w, k);
    }), Y(() => le(p, s(u).section)), A(d, f);
  }), Je(i, (d) => n = d, () => n), I("click", l, function(...d) {
    e.onClose?.apply(this, d);
  }), A(t, o), it();
}
ct(["click"]);
var MA = /* @__PURE__ */ F('<div class="palette-group-label svelte-39sje9"> </div>'), OA = /* @__PURE__ */ F('<kbd class="palette-item__shortcut svelte-39sje9"> </kbd>'), FA = /* @__PURE__ */ F('<button type="button" role="option"><span class="palette-item__label svelte-39sje9"> </span> <!></button>'), RA = /* @__PURE__ */ F('<div class="palette-group"><!> <!></div>'), LA = /* @__PURE__ */ F('<div class="palette-empty svelte-39sje9">No matching commands</div>'), DA = /* @__PURE__ */ F('<div class="modal-backdrop svelte-39sje9" role="dialog" aria-modal="true" aria-label="Command palette"><div class="palette-card svelte-39sje9"><input type="text" role="combobox" aria-label="Command palette" aria-expanded="true" aria-controls="palette-listbox" aria-autocomplete="list" placeholder="Type a command…" class="palette-input svelte-39sje9"/> <div id="palette-listbox" role="listbox" class="palette-list svelte-39sje9" aria-label="Commands"><!> <!></div></div></div>');
function NA(t, e) {
  ot(e, !0);
  let n = ke(e, "recentId", 3, null), r = /* @__PURE__ */ B(""), o = /* @__PURE__ */ B(0), i = /* @__PURE__ */ B(void 0), a = /* @__PURE__ */ B(void 0), l = null;
  const c = /* @__PURE__ */ X(() => N6(e.commands, s(r), n())), d = /* @__PURE__ */ X(() => s(c).flatMap((P) => P.commands)), u = /* @__PURE__ */ X(() => s(d)[s(o)]);
  Gt(() => {
    l = yn(s(i));
  }), Wi(() => {
    const P = Ur(s(a)).activeElement;
    (P === null || P === document.body || s(a)?.contains(P)) && l?.();
  });
  function f() {
    const P = s(d)[s(o)];
    P && (P.run(), e.onRun?.(P.id), e.onClose());
  }
  function h(P) {
    P.key === "ArrowDown" ? (P.preventDefault(), _(o, s(d).length === 0 ? 0 : (s(o) + 1) % s(d).length, !0)) : P.key === "ArrowUp" ? (P.preventDefault(), _(
      o,
      s(d).length === 0 ? 0 : (s(o) - 1 + s(d).length) % s(d).length,
      !0
    )) : P.key === "Enter" ? (P.preventDefault(), f()) : P.key === "Escape" && (P.preventDefault(), e.onClose());
  }
  var p = DA(), m = z(p), w = z(m);
  Je(w, (P) => _(i, P), () => s(i));
  var y = b(w, 2), k = z(y);
  Ze(k, 17, () => s(c), (P) => P.category, (P, S) => {
    var T = RA(), M = z(T);
    {
      var H = (R) => {
        var K = MA(), ie = ae(K, !0);
        Y(() => le(ie, s(S).category)), A(R, K);
      };
      j(M, (R) => {
        s(S).category !== "Results" && R(H);
      });
    }
    var q = b(M, 2);
    Ze(q, 17, () => s(S).commands, (R) => R.id, (R, K) => {
      const ie = /* @__PURE__ */ X(() => s(d).indexOf(s(K)));
      var ne = FA();
      let $;
      var G = z(ne), W = ae(G, !0), J = b(G, 2);
      {
        var E = (L) => {
          var V = OA(), ee = ae(V, !0);
          Y(() => le(ee, s(K).shortcut)), A(L, V);
        };
        j(J, (L) => {
          s(K).shortcut && L(E);
        });
      }
      Y(() => {
        N(ne, "id", `palette-option-${s(K).id}`), N(ne, "aria-selected", s(ie) === s(o)), $ = Ce(ne, 1, "palette-item svelte-39sje9", null, $, { active: s(ie) === s(o) }), le(W, s(K).label);
      }), Qe("mouseenter", ne, () => _(o, s(ie), !0)), I("click", ne, () => {
        _(o, s(ie), !0), f();
      }), A(R, ne);
    }), A(P, T);
  });
  var O = b(k, 2);
  {
    var C = (P) => {
      var S = LA();
      A(P, S);
    };
    j(O, (P) => {
      s(d).length === 0 && P(C);
    });
  }
  Je(p, (P) => _(a, P), () => s(a)), Y(() => N(w, "aria-activedescendant", s(u) ? `palette-option-${s(u).id}` : void 0)), I("input", w, () => _(o, 0)), I("keydown", w, h), Zi(w, () => s(r), (P) => _(r, P)), A(t, p), it();
}
ct(["input", "keydown", "click"]);
var BA = /* @__PURE__ */ F('<button type="button"> </button>'), UA = /* @__PURE__ */ F('<div class="extremity svelte-aybbfz"><div class="cap svelte-aybbfz"> </div> <div class="kinds svelte-aybbfz"></div></div>');
function Yh(t, e) {
  ot(e, !0);
  var n = UA(), r = z(n), o = ae(r, !0), i = b(r, 2);
  Ze(i, 20, () => mu, (a) => a, (a, l) => {
    var c = BA();
    let d;
    var u = ae(c, !0);
    Y(() => {
      N(c, "aria-label", `${e.title}: ${Uo[l]}`), N(c, "aria-pressed", e.active === l), N(c, "title", Uo[l]), d = Ce(c, 1, "svelte-aybbfz", null, d, { on: e.active === l }), le(u, vu[l]);
    }), I("click", c, () => e.onSelect(l)), A(a, c);
  }), Y(() => le(o, e.title)), A(t, n), it();
}
ct(["click"]);
var jA = /* @__PURE__ */ F('<!> <!> <div class="rule svelte-nl0nhh" aria-hidden="true"></div>', 1), HA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Edit link…</span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div>', 1), WA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span> </span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div>', 1), ZA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Group</span><span class="hint svelte-nl0nhh"> </span></button>'), KA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Enable text auto-resizing</span></button>'), VA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Unbind text</span></button>'), JA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Bind text to the container</span></button>'), GA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Wrap text in a container</span></button>'), qA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Ungroup</span><span class="hint svelte-nl0nhh"> </span></button>'), YA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Duplicate</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy</span><span class="hint svelte-nl0nhh"> </span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy to clipboard as PNG</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy to clipboard as SVG</span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy styles</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Paste styles</span><span class="hint svelte-nl0nhh"> </span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Bring to front</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Bring forward</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Send backward</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Send to back</span><span class="hint svelte-nl0nhh"> </span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Flip horizontal</span><span class="hint svelte-nl0nhh">⇧H</span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Flip vertical</span><span class="hint svelte-nl0nhh">⇧V</span></button> <!> <!> <!> <!> <!> <!> <button type="button" role="menuitem" class="svelte-nl0nhh"><span> </span> <span class="hint svelte-nl0nhh"> </span></button> <div class="rule svelte-nl0nhh" aria-hidden="true"></div> <button type="button" class="danger svelte-nl0nhh" role="menuitem"><span>Delete</span><span class="hint svelte-nl0nhh">⌫</span></button>', 1), XA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Unlock all</span></button>'), QA = /* @__PURE__ */ F('<button type="button" role="menuitem" class="svelte-nl0nhh"><span>Paste</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy to clipboard as PNG</span><span class="hint svelte-nl0nhh"> </span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Copy to clipboard as SVG</span></button> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Select all</span><span class="hint svelte-nl0nhh"> </span></button> <!> <button type="button" role="menuitem" class="svelte-nl0nhh"><span>Zoom to fit</span><span class="hint svelte-nl0nhh">⇧1</span></button>', 1), $A = /* @__PURE__ */ F('<button type="button" class="away svelte-nl0nhh" aria-label="Close menu"></button> <div class="draw-panel menu svelte-nl0nhh" role="menu" tabindex="-1" aria-label="Canvas menu"><!> <!> <!> <!></div>', 1);
function eP(t, e) {
  ot(e, !0);
  let n = ke(e, "unlockAll", 3, !1), r, o = /* @__PURE__ */ B(ft({ left: 0, top: 0 }));
  const i = /* @__PURE__ */ X(() => Rm(e.element));
  Gt(() => yn(r)), bt(() => {
    e.x, e.y, Br().then(() => {
      const C = r, P = C?.offsetParent;
      !C || !P || _(o, qx(e.x, e.y, { width: C.offsetWidth, height: C.offsetHeight }, { width: P.clientWidth, height: P.clientHeight }), !0);
    });
  });
  var a = $A(), l = Ue(a), c = b(l, 2);
  let d;
  var u = z(c);
  {
    var f = (C) => {
      var P = jA(), S = Ue(P);
      Yh(S, {
        title: "Start",
        get active() {
          return e.element.linear.start;
        },
        onSelect: (M) => e.onPickArrowhead({ start: M })
      });
      var T = b(S, 2);
      Yh(T, {
        title: "End",
        get active() {
          return e.element.linear.end;
        },
        onSelect: (M) => e.onPickArrowhead({ end: M })
      }), A(C, P);
    };
    j(u, (C) => {
      e.element?.linear && C(f);
    });
  }
  var h = b(u, 2);
  {
    var p = (C) => {
      const P = /* @__PURE__ */ X(() => e.element.embedId);
      var S = HA(), T = Ue(S);
      I("click", T, () => e.onEditLink(s(P))), A(C, S);
    };
    j(h, (C) => {
      e.element?.embedId && C(p);
    });
  }
  var m = b(h, 2);
  {
    var w = (C) => {
      var P = WA(), S = Ue(P), T = z(S), M = ae(T, !0);
      Y(() => le(M, s(i).label)), I("click", S, () => e.onVectorize(s(i).elementId)), A(C, P);
    };
    j(m, (C) => {
      s(i) && C(w);
    });
  }
  var y = b(m, 2);
  {
    var k = (C) => {
      var P = YA(), S = Ue(P), T = b(z(S)), M = ae(T, !0), H = b(S, 2), q = b(z(H)), R = ae(q, !0), K = b(H, 4), ie = b(z(K)), ne = ae(ie, !0), $ = b(K, 2), G = b($, 4), W = b(z(G)), J = ae(W, !0), E = b(G, 2), L = b(z(E)), V = ae(L, !0), ee = b(E, 4), ge = b(z(ee)), re = ae(ge, !0), se = b(ee, 2), xe = b(z(se)), be = ae(xe, !0), Me = b(se, 2), Re = b(z(Me)), Se = ae(Re, !0), Z = b(Me, 2), _e = b(z(Z)), ve = ae(_e, !0), Le = b(Z, 4), Q = b(Le, 2), de = b(Q, 2);
      {
        var me = (ye) => {
          var tt = ZA(), qe = b(z(tt)), Vt = ae(qe, !0);
          Y((Pt) => le(Vt, Pt), [() => nn("CtrlOrCmd+G")]), I("click", tt, () => e.onRun((Pt) => Pt.groupSelection())), A(ye, tt);
        };
        j(de, (ye) => {
          e.element.multi && !e.element.grouped && ye(me);
        });
      }
      var Pe = b(de, 2);
      {
        var Ie = (ye) => {
          var tt = KA();
          I("click", tt, () => e.onRun((qe) => qe.setTextAutoResize(!0))), A(ye, tt);
        };
        j(Pe, (ye) => {
          e.element.text.autoResize && ye(Ie);
        });
      }
      var Ke = b(Pe, 2);
      {
        var De = (ye) => {
          var tt = VA();
          I("click", tt, () => e.onRun((qe) => qe.unbindText())), A(ye, tt);
        };
        j(Ke, (ye) => {
          e.element.text.unbind && ye(De);
        });
      }
      var We = b(Ke, 2);
      {
        var Ge = (ye) => {
          var tt = JA();
          I("click", tt, () => e.onRun((qe) => qe.bindText())), A(ye, tt);
        };
        j(We, (ye) => {
          e.element.text.bind && ye(Ge);
        });
      }
      var Ve = b(We, 2);
      {
        var dt = (ye) => {
          var tt = GA();
          I("click", tt, () => e.onRun((qe) => qe.wrapTextInContainer())), A(ye, tt);
        };
        j(Ve, (ye) => {
          e.element.text.wrap && ye(dt);
        });
      }
      var _t = b(Ve, 2);
      {
        var Ot = (ye) => {
          var tt = qA(), qe = b(z(tt)), Vt = ae(qe, !0);
          Y((Pt) => le(Vt, Pt), [() => nn("CtrlOrCmd+Shift+G")]), I("click", tt, () => e.onRun((Pt) => Pt.ungroupSelection())), A(ye, tt);
        };
        j(_t, (ye) => {
          e.element.grouped && ye(Ot);
        });
      }
      var At = b(_t, 2), Rt = z(At), fe = ae(Rt, !0), pe = b(Rt, 2), et = ae(pe, !0), xt = b(At, 4);
      Y(
        (ye, tt, qe, Vt, Pt, Be, Ht, bn, wn, he) => {
          le(M, ye), le(R, tt), le(ne, qe), le(J, Vt), le(V, Pt), le(re, Be), le(be, Ht), le(Se, bn), le(ve, wn), le(fe, e.element.locked ? "Unlock" : "Lock"), le(et, he);
        },
        [
          () => nn("CtrlOrCmd+D"),
          () => nn("CtrlOrCmd+C"),
          () => nn("Alt+Shift+C"),
          () => nn("CtrlOrCmd+Alt+C"),
          () => nn("CtrlOrCmd+Alt+V"),
          () => In("front"),
          () => In("forward"),
          () => In("backward"),
          () => In("back"),
          () => nn("CtrlOrCmd+Shift+L")
        ]
      ), I("click", S, () => e.onRun((ye) => ye.duplicateSelection())), I("click", H, () => e.onRun((ye) => ye.copySelection())), I("click", K, () => e.onCopyToClipboard("png")), I("click", $, () => e.onCopyToClipboard("svg")), I("click", G, function(...ye) {
        e.onCopyStyles?.apply(this, ye);
      }), I("click", E, () => e.onRun((ye) => ye.pasteStyles())), I("click", ee, () => e.onRun((ye) => ye.reorderSelection("front"))), I("click", se, () => e.onRun((ye) => ye.reorderSelection("forward"))), I("click", Me, () => e.onRun((ye) => ye.reorderSelection("backward"))), I("click", Z, () => e.onRun((ye) => ye.reorderSelection("back"))), I("click", Le, () => e.onRun((ye) => ye.flipSelection("horizontal"))), I("click", Q, () => e.onRun((ye) => ye.flipSelection("vertical"))), I("click", At, () => e.onRun((ye) => ye.toggleLockSelection())), I("click", xt, () => e.onRun((ye) => ye.deleteSelection())), A(C, P);
    }, O = (C) => {
      var P = QA(), S = Ue(P), T = b(z(S)), M = ae(T, !0), H = b(S, 2), q = b(z(H)), R = ae(q, !0), K = b(H, 2), ie = b(K, 2), ne = b(z(ie)), $ = ae(ne, !0), G = b(ie, 2);
      {
        var W = (E) => {
          var L = XA();
          I("click", L, () => e.onRun((V) => V.unlockAll())), A(E, L);
        };
        j(G, (E) => {
          n() && E(W);
        });
      }
      var J = b(G, 2);
      Y(
        (E, L, V) => {
          le(M, E), le(R, L), le($, V);
        },
        [
          () => nn("CtrlOrCmd+V"),
          () => nn("Alt+Shift+C"),
          () => nn("CtrlOrCmd+A")
        ]
      ), I("click", S, () => e.onRun((E, L) => E.pasteJson(null, L))), I("click", H, () => e.onCopyToClipboard("png")), I("click", K, () => e.onCopyToClipboard("svg")), I("click", ie, () => e.onRun((E) => E.selectAll())), I("click", J, function(...E) {
        e.onFit?.apply(this, E);
      }), A(C, P);
    };
    j(y, (C) => {
      e.element ? C(k) : C(O, -1);
    });
  }
  Je(c, (C) => r = C, () => r), Y(() => d = ht(c, "", d, { left: `${s(o).left}px`, top: `${s(o).top}px` })), I("click", l, function(...C) {
    e.onClose?.apply(this, C);
  }), I("contextmenu", l, (C) => {
    C.preventDefault(), e.onClose();
  }), I("keydown", c, (C) => {
    C.key === "Escape" && e.onClose();
  }), A(t, a), it();
}
ct(["click", "contextmenu", "keydown"]);
function tP(t) {
  const e = new TextEncoder().encode(t);
  let n = "";
  for (let r = 0; r < e.length; r += 32768)
    n += String.fromCharCode(...e.subarray(r, r + 32768));
  return `data:image/svg+xml;base64,${btoa(n)}`;
}
class ta extends Error {
  constructor() {
    super("the trace was cancelled"), this.name = "TraceCancelled";
  }
}
class Uu {
  constructor(e) {
    this.waiting = /* @__PURE__ */ new Map(), this.nextId = 0, this.busy = !1, this.queued = null, this.terminated = !1, this.worker = new Worker(new URL(
      /* @vite-ignore */
      "" + new URL("assets/vectorize.worker-fdEm_fp7.js", import.meta.url).href,
      import.meta.url
    ), {
      type: "module"
    }), this.worker.onmessage = (n) => {
      const r = n.data;
      if (r.type === "progress") {
        e(r.progress);
        return;
      }
      const o = this.waiting.get(r.id);
      o && (this.waiting.delete(r.id), r.type === "done" ? o.resolve(r.value) : o.reject(new Error(r.message)));
    }, this.worker.onerror = (n) => {
      n.preventDefault(), this.fail(new Error(n.message || "the tracer failed to load"));
    };
  }
  /**
   * A worker holding `bitmap`'s pixels. The bitmap is copied, not transferred, so the
   * caller can open another worker over it after a cancel.
   */
  static async open(e, n) {
    const r = new Uu(n);
    return await r.request({ type: "open", bitmap: e }), r;
  }
  /** Traces with `config`; `null` when a newer render replaced this one first. */
  render(e) {
    return this.busy ? (this.queued?.resolve(null), new Promise((n, r) => {
      this.queued = { config: e, resolve: n, reject: r };
    })) : this.run(e);
  }
  /** The last trace's rings, as `DrawEngine.vectorizeImage` takes them. */
  async rings() {
    const e = await this.request({ type: "rings" });
    if (!e) throw new Error("nothing has been traced yet");
    return e;
  }
  /** Stops whatever is running, for good. Every pending request rejects. */
  terminate() {
    this.terminated || (this.terminated = !0, this.worker.terminate(), this.fail(new ta()));
  }
  async run(e) {
    this.busy = !0;
    try {
      return await this.request({ type: "render", config: e });
    } finally {
      this.busy = !1;
      const n = this.queued;
      this.queued = null, n && this.run(n.config).then(n.resolve, n.reject);
    }
  }
  request(e) {
    if (this.terminated) return Promise.reject(new ta());
    const n = ++this.nextId;
    return new Promise((r, o) => {
      this.waiting.set(n, { resolve: r, reject: o }), this.worker.postMessage({ ...e, id: n });
    });
  }
  fail(e) {
    for (const n of this.waiting.values()) n.reject(e);
    this.waiting.clear(), this.queued?.reject(e), this.queued = null;
  }
}
const nP = 1024, na = 5e3, rP = 32, oP = {
  maxElements: Fo,
  maxPointsPerElement: Ns,
  maxTraceShapes: na,
  maxDataUrlLength: Ro,
  maxGroupDepth: rP
}, Nv = {
  colours: { min: 1, max: 16 },
  detail: { min: 1, max: 16 },
  smoothness: { min: 0, max: 12 }
}, Ec = [
  // vtracer's Poster is 16 apart and 8 bits; 32 apart halves the shapes on a photo.
  {
    preset: "poster",
    label: "Poster",
    dials: { colours: 13, detail: 13, smoothness: 4 },
    colorPrecision: 6
  },
  {
    preset: "photo",
    label: "Photo",
    dials: { colours: 11, detail: 7, smoothness: 12 },
    colorPrecision: 6
  },
  { preset: "bw", label: "Line art", dials: { colours: 13, detail: 13, smoothness: 4 } }
];
function Tc(t) {
  return Ec.find((e) => e.preset === t) ?? Ec[0];
}
function iP(t) {
  return 8 * (17 - ju("colours", t));
}
function sP(t) {
  return 17 - ju("detail", t);
}
function aP(t) {
  return 15 * ju("smoothness", t);
}
function ju(t, e) {
  const { min: n, max: r } = Nv[t];
  return Math.min(r, Math.max(n, Math.round(e)));
}
function Bv(t, e) {
  return !(t === "bw" && e === "colours");
}
function lP(t, e) {
  const n = Tc(t);
  return {
    preset: t,
    ...n.colorPrecision === void 0 ? {} : { colorPrecision: n.colorPrecision },
    ...Bv(t, "colours") ? { layerDifference: iP(e.colours) } : {},
    filterSpeckle: sP(e.detail),
    cornerThreshold: aP(e.smoothness)
  };
}
function Cc(t) {
  return 26 + 4 * Math.ceil(t / 3);
}
function Xh(t) {
  return t === "poster" ? "Try the Photo preset, or fewer colours." : t === "photo" ? "Try fewer colours or less detail." : "Try less detail.";
}
function cP(t, e, n) {
  return t.shapes === 0 ? "Nothing was traced. Try more detail." : e === "shapes" && t.shapes > na ? `${oo(t.shapes)} shapes is too many to edit — at most ${oo(na)} at once. ${Xh(n)}` : e === "picture" && Cc(t.svgBytes) > Ro ? `The picture would be ${ra(Cc(t.svgBytes))} — at most ${ra(Ro)}. ${Xh(n)}` : null;
}
function uP(t) {
  switch (t) {
    case "not-an-image":
      return "The image is no longer on the board.";
    case "locked":
      return "The image is locked. Unlock it to vectorize it.";
    case "held":
      return "Someone else has the image selected.";
    case "empty":
      return "Nothing was traced. Try more detail.";
    case "malformed":
      return "The trace could not be read. Try again.";
    case "too-many-shapes":
      return `Too many shapes to edit — at most ${oo(na)} at once.`;
    case "board-full":
      return `The board would hold more than ${oo(Fo)} elements. Insert it as one picture instead.`;
    case "not-a-picture":
      return "The picture could not be made. Try again.";
    case "too-large":
      return `The picture is over ${ra(Ro)}. Try fewer colours.`;
  }
}
function dP(t, e) {
  return e === "picture" ? `One picture · ${ra(Cc(t.svgBytes))} · ${oo(t.regions)} regions` : `${oo(t.shapes)} shapes · ${oo(t.points)} points`;
}
const fP = {
  // Measured: finding the colours is 80–95% of a trace; see `TRACE_MAX_SIDE`.
  segment: { label: "Finding colours", from: 0, to: 0.8 },
  compose: { label: "Tracing outlines", from: 0.8, to: 0.9 },
  optimize: { label: "Smoothing curves", from: 0.9, to: 1 }
};
function hP(t) {
  const e = fP[t.phase], n = Math.min(1, Math.max(0, t.fraction));
  return { label: e.label, value: e.from + (e.to - e.from) * n };
}
function oo(t) {
  return t.toLocaleString("en-US");
}
function ra(t) {
  return `${(t / (1024 * 1024)).toFixed(1)} MB`;
}
var gP = /* @__PURE__ */ F('<img alt="Preview of the trace" class="svelte-1hklhmy"/>'), pP = /* @__PURE__ */ F('<button type="button" class="small svelte-1hklhmy">Cancel trace</button>'), mP = /* @__PURE__ */ F('<div class="working svelte-1hklhmy"><progress max="1" aria-label="Tracing progress" class="svelte-1hklhmy"></progress> <!></div>'), vP = /* @__PURE__ */ F('<div class="working svelte-1hklhmy"><button type="button" class="small svelte-1hklhmy">Trace again</button></div>'), _P = /* @__PURE__ */ F('<p class="warning svelte-1hklhmy" role="alert"> </p>'), yP = /* @__PURE__ */ F('<p class="error svelte-1hklhmy" role="alert"> </p>'), bP = /* @__PURE__ */ F('<label><span class="name"> </span> <span class="end svelte-1hklhmy" aria-hidden="true"> </span> <input type="range" step="1" class="svelte-1hklhmy"/> <span class="end svelte-1hklhmy" aria-hidden="true"> </span></label>'), wP = /* @__PURE__ */ F('<div class="modal-backdrop svelte-1hklhmy" role="dialog" aria-modal="true" aria-labelledby="vectorize-title"><div class="modal-card svelte-1hklhmy" tabindex="-1"><div class="modal-header svelte-1hklhmy"><h3 id="vectorize-title" class="svelte-1hklhmy">Vectorize image</h3> <button type="button" class="close-btn svelte-1hklhmy" aria-label="Close dialog">✕</button></div> <div class="preview svelte-1hklhmy"><!> <!></div> <p class="stats svelte-1hklhmy" role="status" aria-live="polite"> </p> <!> <!> <div class="controls svelte-1hklhmy"><!> <!> <fieldset class="svelte-1hklhmy"><legend class="svelte-1hklhmy">Insert as</legend> <label class="svelte-1hklhmy"><input type="radio" name="vectorize-as"/> Editable shapes</label> <label class="svelte-1hklhmy"><input type="radio" name="vectorize-as"/> One vector picture</label></fieldset> <label class="check svelte-1hklhmy"><input type="checkbox"/> Keep the original image</label></div> <div class="actions svelte-1hklhmy"><button type="button" class="btn-cancel svelte-1hklhmy">Cancel</button> <button type="button" class="btn-primary svelte-1hklhmy"> </button></div></div></div>');
function kP(t, e) {
  ot(e, !0);
  const n = [], r = 300, o = [
    {
      dial: "colours",
      label: "Colours",
      less: "Fewer",
      more: "More"
    },
    { dial: "detail", label: "Detail", less: "Less", more: "More" },
    {
      dial: "smoothness",
      label: "Smoothness",
      less: "Sharp",
      more: "Smooth"
    }
  ];
  let i = /* @__PURE__ */ B("photo"), a = /* @__PURE__ */ B(ft({ ...Tc("photo").dials })), l = /* @__PURE__ */ B("shapes"), c = /* @__PURE__ */ B(!1), d = /* @__PURE__ */ B("loading"), u = /* @__PURE__ */ B(ft({ label: "Reading the picture", value: 0 })), f = /* @__PURE__ */ B(null), h = /* @__PURE__ */ B(null), p = /* @__PURE__ */ B(null), m = /* @__PURE__ */ B(!1);
  const w = /* @__PURE__ */ X(() => s(f) ? cP(s(f).stats, s(l), s(i)) : null), y = /* @__PURE__ */ X(() => s(d) === "ready" && s(f) !== null && s(w) === null && !s(m) && e.engine !== null);
  let k, O = null, C = null, P = null, S, T = 0, M = !1;
  Gt(() => {
    const fe = yn(k);
    return H(), () => {
      fe(), M = !0, clearTimeout(S), C?.terminate(), P?.then((pe) => pe.terminate()).catch(() => {
      }), O?.close(), s(h) && URL.revokeObjectURL(s(h));
    };
  });
  async function H() {
    try {
      O = await q();
    } catch {
      _(d, "failed"), _(p, "The picture could not be read. It may not have finished arriving yet.");
      return;
    }
    M || await K();
  }
  async function q() {
    const fe = e.engine?.getSelectedElements().find((ye) => ye.id === e.imageId), pe = fe?.dataUrl;
    if (!fe || !pe) throw new Error("no picture");
    const et = new Image();
    et.src = pe, await et.decode();
    const xt = iv(et.naturalWidth || Math.abs(fe.width), et.naturalHeight || Math.abs(fe.height), nP);
    return createImageBitmap(et, {
      resizeWidth: Math.max(1, Math.round(xt.width)),
      resizeHeight: Math.max(1, Math.round(xt.height)),
      resizeQuality: "high"
    });
  }
  async function R() {
    if (C) return C;
    if (!O) throw new Error("no picture");
    P ??= Uu.open(O, (pe) => {
      s(d) === "tracing" && _(u, hP(pe), !0);
    });
    const fe = P;
    try {
      const pe = await fe;
      if (P !== fe)
        throw pe.terminate(), new ta();
      return C = pe, pe;
    } catch (pe) {
      throw P === fe && (P = null), pe;
    }
  }
  async function K() {
    const fe = ++T;
    _(d, "tracing"), _(u, { label: "Starting", value: 0 }, !0), _(p, null);
    try {
      const pe = await (await R()).render(lP(s(i), s(a)));
      if (pe === null || fe !== T || M) return;
      _(f, pe, !0), s(h) && URL.revokeObjectURL(s(h)), _(h, URL.createObjectURL(new Blob([pe.svg], { type: "image/svg+xml" })), !0), _(d, "ready");
    } catch (pe) {
      if (pe instanceof ta || fe !== T || M) return;
      _(d, "failed"), _(p, `Tracing failed: ${pe instanceof Error ? pe.message : String(pe)}`);
    }
  }
  function ie() {
    return O ? K() : H();
  }
  function ne(fe) {
    clearTimeout(S), S = setTimeout(() => {
      K();
    }, fe);
  }
  function $(fe) {
    _(i, fe, !0), _(a, { ...Tc(fe).dials }, !0), ne(0);
  }
  function G(fe, pe) {
    _(a, { ...s(a), [fe]: pe }, !0), ne(r);
  }
  function W() {
    T += 1, clearTimeout(S), C?.terminate(), C = null, P = null, _(d, "cancelled");
  }
  async function J() {
    if (!(!s(y) || !e.engine || !s(f) || !C)) {
      _(m, !0), _(p, null);
      try {
        const fe = { keepOriginal: s(c), limits: oP }, pe = s(l) === "shapes" ? e.engine.vectorizeImage(e.imageId, { as: "shapes", rings: await C.rings() }, fe) : e.engine.vectorizeImage(e.imageId, { as: "picture", dataUrl: tP(s(f).svg) }, fe);
        "refused" in pe ? _(p, uP(pe.refused), !0) : e.onClose();
      } catch (fe) {
        _(p, `Inserting failed: ${fe instanceof Error ? fe.message : String(fe)}`);
      } finally {
        _(m, !1);
      }
    }
  }
  const E = /* @__PURE__ */ X(() => s(d) === "loading" ? "Reading the picture…" : s(d) === "tracing" ? `${s(u).label}…` : s(d) === "cancelled" ? "Tracing cancelled." : s(d) === "failed" || !s(f) ? "Nothing traced." : dP(s(f).stats, s(l)));
  var L = wP(), V = z(L), ee = z(V), ge = b(z(ee), 2), re = b(ee, 2), se = z(re);
  {
    var xe = (fe) => {
      var pe = gP();
      Y(() => N(pe, "src", s(h))), A(fe, pe);
    };
    j(se, (fe) => {
      s(h) && fe(xe);
    });
  }
  var be = b(se, 2);
  {
    var Me = (fe) => {
      var pe = mP(), et = z(pe), xt = b(et, 2);
      {
        var ye = (tt) => {
          var qe = pP();
          I("click", qe, W), A(tt, qe);
        };
        j(xt, (tt) => {
          s(d) === "tracing" && tt(ye);
        });
      }
      Y(() => _n(et, s(u).value)), A(fe, pe);
    }, Re = (fe) => {
      var pe = vP(), et = ae(pe);
      I("click", et, () => {
        ie();
      }), A(fe, pe);
    };
    j(be, (fe) => {
      s(d) === "tracing" || s(d) === "loading" ? fe(Me) : (s(d) === "cancelled" || s(d) === "failed") && fe(Re, 1);
    });
  }
  var Se = b(re, 2), Z = ae(Se, !0), _e = b(Se, 2);
  {
    var ve = (fe) => {
      var pe = _P(), et = ae(pe, !0);
      Y(() => le(et, s(w))), A(fe, pe);
    };
    j(_e, (fe) => {
      s(w) && s(d) === "ready" && fe(ve);
    });
  }
  var Le = b(_e, 2);
  {
    var Q = (fe) => {
      var pe = yP(), et = ae(pe, !0);
      Y(() => le(et, s(p))), A(fe, pe);
    };
    j(Le, (fe) => {
      s(p) && fe(Q);
    });
  }
  var de = b(Le, 2), me = z(de);
  {
    let fe = /* @__PURE__ */ X(() => Ec.map((pe) => ({ label: pe.label, value: pe.preset })));
    rn(me, {
      get options() {
        return s(fe);
      },
      get value() {
        return s(i);
      },
      ariaLabel: "Preset",
      onPick: (pe) => $(pe)
    });
  }
  var Pe = b(me, 2);
  Ze(Pe, 17, () => o, (fe) => fe.dial, (fe, pe) => {
    const et = /* @__PURE__ */ X(() => Nv[s(pe).dial]), xt = /* @__PURE__ */ X(() => Bv(s(i), s(pe).dial));
    var ye = bP();
    let tt;
    var qe = z(ye), Vt = ae(qe, !0), Pt = b(qe, 2), Be = ae(Pt, !0), Ht = b(Pt, 2), bn = b(Ht, 2), wn = ae(bn, !0);
    Y(() => {
      tt = Ce(ye, 1, "slider svelte-1hklhmy", null, tt, { off: !s(xt) }), le(Vt, s(pe).label), le(Be, s(pe).less), N(Ht, "min", s(et).min), N(Ht, "max", s(et).max), _n(Ht, s(a)[s(pe).dial]), Ht.disabled = !s(xt), N(Ht, "aria-valuetext", s(xt) ? `${s(a)[s(pe).dial]} of ${s(et).max}` : "Not used"), le(wn, s(pe).more);
    }), I("input", Ht, (he) => G(s(pe).dial, he.currentTarget.valueAsNumber)), A(fe, ye);
  });
  var Ie = b(Pe, 2), Ke = b(z(Ie), 2), De = z(Ke);
  De.value = De.__value = "shapes";
  var We = b(Ke, 2), Ge = z(We);
  Ge.value = Ge.__value = "picture";
  var Ve = b(Ie, 2), dt = z(Ve), _t = b(de, 2), Ot = z(_t), At = b(Ot, 2), Rt = ae(At, !0);
  Je(V, (fe) => k = fe, () => k), Y(() => {
    N(re, "aria-busy", s(d) === "tracing" || s(d) === "loading"), le(Z, s(E)), At.disabled = !s(y), le(Rt, s(m) ? "Inserting…" : "Insert");
  }), I("click", ge, function(...fe) {
    e.onClose?.apply(this, fe);
  }), Bf(n, [], De, () => s(l), (fe) => _(l, fe)), Bf(n, [], Ge, () => s(l), (fe) => _(l, fe)), Cs(dt, () => s(c), (fe) => _(c, fe)), I("click", Ot, function(...fe) {
    e.onClose?.apply(this, fe);
  }), I("click", At, () => {
    J();
  }), A(t, L), it();
}
ct(["click", "input"]);
var SP = /* @__PURE__ */ F("<!> <!> <!> <!> <!> <!> <!> <!>", 1);
function xP(t, e) {
  ot(e, !0);
  let n = ke(e, "slug", 3, ""), r = ke(e, "peers", 19, () => []), o = ke(e, "connectionStatus", 3, "disconnected");
  ke(e, "secret", 3, null);
  let i = ke(e, "menu", 15, null), a = ke(e, "showMainMenu", 15, !1), l = ke(e, "showExport", 15, !1), c = ke(e, "showMermaid", 15, !1), d = ke(e, "showTemplates", 15, !1), u = ke(e, "showShare", 15, !1), f = ke(e, "showShortcuts", 15, !1), h = ke(e, "showPalette", 15, !1), p = ke(e, "paletteCommands", 19, () => []), m = ke(e, "paletteRecentId", 3, null), w = ke(e, "vectorizeId", 15, null);
  function y(E) {
    if (E.key === "Escape") {
      if (i()) i(null);
      else if (w()) w(null);
      else if (h()) h(!1);
      else if (l()) l(!1);
      else if (c()) c(!1);
      else if (d()) d(!1);
      else if (u()) u(!1);
      else if (f()) f(!1);
      else if (a()) a(!1);
      else return;
      E.preventDefault();
    }
  }
  var k = SP();
  Qe("keydown", $t, y);
  var O = Ue(k);
  {
    var C = (E) => {
      pC(E, {
        get engine() {
          return e.engine;
        },
        onClose: () => l(!1)
      });
    };
    j(O, (E) => {
      l() && E(C);
    });
  }
  var P = b(O, 2);
  {
    var S = (E) => {
      _C(E, {
        get onInsert() {
          return e.onInsertMermaid;
        },
        onClose: () => c(!1)
      });
    };
    j(P, (E) => {
      c() && E(S);
    });
  }
  var T = b(P, 2);
  {
    var M = (E) => {
      ZC(E, {
        get onInsert() {
          return e.onInsertTemplate;
        },
        onClose: () => d(!1)
      });
    };
    j(T, (E) => {
      d() && E(M);
    });
  }
  var H = b(T, 2);
  {
    var q = (E) => {
      var L = on(), V = Ue(L);
      {
        var ee = (ge) => {
          CA(ge, {
            get slug() {
              return n();
            },
            get peers() {
              return r();
            },
            get connectionStatus() {
              return o();
            },
            onClose: () => u(!1)
          });
        };
        j(V, (ge) => {
          ge(ee, -1);
        });
      }
      A(E, L);
    };
    j(H, (E) => {
      u() && E(q);
    });
  }
  var R = b(H, 2);
  {
    var K = (E) => {
      zA(E, { onClose: () => f(!1) });
    };
    j(R, (E) => {
      f() && E(K);
    });
  }
  var ie = b(R, 2);
  {
    var ne = (E) => {
      NA(E, {
        get commands() {
          return p();
        },
        get recentId() {
          return m();
        },
        get onRun() {
          return e.onPaletteRun;
        },
        onClose: () => h(!1)
      });
    };
    j(ie, (E) => {
      h() && E(ne);
    });
  }
  var $ = b(ie, 2);
  {
    var G = (E) => {
      kP(E, {
        get engine() {
          return e.engine;
        },
        get imageId() {
          return w();
        },
        onClose: () => w(null)
      });
    };
    j($, (E) => {
      w() && E(G);
    });
  }
  var W = b($, 2);
  {
    var J = (E) => {
      eP(E, {
        get x() {
          return i().x;
        },
        get y() {
          return i().y;
        },
        get element() {
          return i().element;
        },
        get unlockAll() {
          return i().unlockAll;
        },
        onPickArrowhead: (L) => {
          e.engine?.setArrowheads(L), i(i()?.element?.linear ? {
            ...i(),
            element: {
              ...i().element,
              linear: { ...i().element.linear, ...L }
            }
          } : i());
        },
        onRun: (L) => {
          e.engine && i() && L(e.engine, e.engine.screenToWorld(i().x, i().y)), i(null);
        },
        onCopyStyles: () => {
          i(null), e.onCopyStyles();
        },
        onCopyToClipboard: (L) => {
          i(null), e.onCopyToClipboard(L);
        },
        onFit: () => {
          i(null), e.onFit();
        },
        onEditLink: (L) => {
          i(null), e.onEditEmbedLink(L);
        },
        onVectorize: (L) => {
          i(null), w(L);
        },
        onClose: () => {
          i(null);
        }
      });
    };
    j(W, (E) => {
      i() && E(J);
    });
  }
  A(t, k), it();
}
var EP = /* @__PURE__ */ F('<div class="cursor-wrapper svelte-5ka6m"><svg class="cursor-icon svelte-5ka6m" viewBox="0 0 16 16" width="20" height="20"><path d="M0 0 L14 6 L7 8 L5 15 Z" stroke="#ffffff" stroke-width="1.5"></path></svg> <span class="cursor-tag svelte-5ka6m"> </span></div>'), TP = /* @__PURE__ */ F('<div class="peer-cursors-layer svelte-5ka6m" aria-hidden="true"></div>');
function CP(t, e) {
  ot(e, !0);
  let n = ke(e, "peers", 19, () => []);
  function r(i, a) {
    if (!e.camera) return { sx: i, sy: a };
    const { x: l, y: c } = So(e.camera, i, a);
    return { sx: l, sy: c };
  }
  var o = TP();
  Ze(o, 21, () => n().filter((i) => i.pointed), (i) => i.clientId, (i, a) => {
    const l = /* @__PURE__ */ X(() => r(s(a).x, s(a).y));
    var c = EP();
    let d;
    var u = z(c), f = b(u, 2);
    let h;
    var p = ae(f, !0);
    Y(() => {
      d = ht(c, "", d, {
        transform: `translate(${s(l).sx ?? ""}px, ${s(l).sy ?? ""}px)`
      }), N(u, "fill", s(a).color), h = ht(f, "", h, { background: s(a).color }), le(p, s(a).name);
    }), A(i, c);
  }), A(t, o), it();
}
const Uv = 599, AP = 1e3, PP = 500, IP = 1180;
function zP(t, e) {
  return t <= Uv || e < PP && t < AP;
}
function MP(t, e) {
  const n = Math.min(t, e), r = Math.max(t, e);
  return n > Uv && r <= IP;
}
function Qh(t, e) {
  return zP(t, e) ? "phone" : MP(t, e) ? "tablet" : "desktop";
}
const OP = 500, FP = 10, $h = 2;
function RP(t) {
  const e = /* @__PURE__ */ new Map();
  let n = !1, r = !1, o = !1, i = 0, a = { x: 0, y: 0 }, l = { x: 0, y: 0 }, c = null;
  function d() {
    c !== null && (clearTimeout(c), c = null);
  }
  function u() {
    n = !1, r = !1, i = 0, l = { x: 0, y: 0 };
  }
  function f() {
    const [w, y] = [...e.values()].slice(0, 2);
    if (!w || !y || !(w.moved && y.moved)) return;
    w.moved = !1, y.moved = !1;
    const k = { x: (w.x + y.x) / 2, y: (w.y + y.y) / 2 }, O = (k.x - a.x) * $h, C = (k.y - a.y) * $h;
    (O !== 0 || C !== 0) && t.panBy(O, C);
    const P = Math.hypot(y.x - w.x, y.y - w.y), S = i <= 0 ? 1 : P / i;
    S !== 1 && t.zoomAt(k.x, k.y, S), a = k, i = P;
  }
  function h() {
    const [w, y] = [...e.values()].slice(0, 2);
    w && y && (a = { x: (w.x + y.x) / 2, y: (w.y + y.y) / 2 }, i = Math.hypot(y.x - w.x, y.y - w.y), w.moved = !1, y.moved = !1), n = !0;
  }
  function p(w) {
    return w.pointerType === "touch";
  }
  const m = (w) => ({ swallow: w });
  return {
    down(w) {
      return p(w) ? n ? (e.set(w.pointerId, { x: w.x, y: w.y, moved: !1 }), m(!0)) : e.size === 0 ? (e.set(w.pointerId, { x: w.x, y: w.y, moved: !1 }), l = { x: w.x, y: w.y }, c = setTimeout(() => {
        c = null, r = !0, n = !0, o = !0, t.openContextMenu(w.x, w.y);
      }, OP), m(!1)) : (d(), e.size === 1 && t.cancelGesture(), e.set(w.pointerId, { x: w.x, y: w.y, moved: !1 }), h(), m(!0)) : m(!1);
    },
    move(w) {
      if (!p(w)) return m(!1);
      if (n) {
        const y = e.get(w.pointerId);
        return y && e.size >= 2 && (y.x = w.x, y.y = w.y, y.moved = !0, f()), m(!0);
      }
      return c !== null && Math.hypot(w.x - l.x, w.y - l.y) > FP && d(), m(!1);
    },
    up(w) {
      if (!p(w) || !e.has(w.pointerId)) return m(!1);
      d(), e.delete(w.pointerId);
      const y = e.size > 0 || r;
      return e.size === 0 && u(), m(y);
    },
    /**
     * Whether the click that follows this gesture belongs to it.
     *
     * A finger that opened a menu is still down when the menu appears, and the menu is
     * under it: the lift produces a click, and that click lands on the menu's own
     * backdrop — which would close the menu the long press had just opened. The
     * browser's compatibility click cannot be prevented (the press was not, and the
     * engine needs it), so the caller swallows it here instead.
     *
     * Claimed once: the click after that is the person's.
     */
    consumeClick() {
      return o ? (o = !1, !0) : !1;
    }
  };
}
var LP = /* @__PURE__ */ mr('<svg class="eraser-trail-canvas" aria-hidden="true"><path></path></svg>'), DP = /* @__PURE__ */ F('<div class="present-dim" aria-hidden="true"></div> <div class="present-dim" aria-hidden="true"></div> <div class="present-dim" aria-hidden="true"></div> <div class="present-dim" aria-hidden="true"></div>', 1), NP = /* @__PURE__ */ F('<span class="path-badge" aria-hidden="true"> </span>'), BP = /* @__PURE__ */ F('<span class="embed-hint">Click to interact</span>'), UP = /* @__PURE__ */ F('<div><iframe title="Embedded page" allowfullscreen="" loading="lazy"></iframe></div> <!>', 1), jP = /* @__PURE__ */ F('<p class="image-notice" role="status"> </p>'), HP = /* @__PURE__ */ F('<div class="mobile-dock" data-viewport-ui="bottom"><!> <!></div>'), WP = /* @__PURE__ */ F('<button type="button" class="exit-zen-mode" aria-label="Exit zen mode (Alt+Z)" title="Exit zen mode — Alt+Z">Exit zen mode</button>'), ZP = /* @__PURE__ */ F('<div role="presentation"></div>'), KP = /* @__PURE__ */ F('<div><!> <div class="canvas-host"><!> <!> <!> <!> <!> <!></div> <input class="sr-only" type="file" aria-label="Insert image"/> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!></div>');
function VP(t, e) {
  ot(e, !0);
  let n = ke(e, "title", 3, "Untitled"), r = ke(e, "slug", 3, ""), o = ke(e, "status", 3, "idle"), i = ke(e, "ariaLabel", 3, "Drawing canvas"), a = ke(e, "browser", 3, !1), l = ke(e, "collaboration", 3, !0), c = ke(e, "roomSecret", 3, null), d = ke(e, "shared", 3, null), u = /* @__PURE__ */ B(null), f = /* @__PURE__ */ B(ft(Js)), h = /* @__PURE__ */ B("light"), p = /* @__PURE__ */ B("light"), m = /* @__PURE__ */ B(null), w = /* @__PURE__ */ B(ft({ ...yo })), y = /* @__PURE__ */ B(!1), k = /* @__PURE__ */ B(!0), O = /* @__PURE__ */ B("#1e1e1e"), C = /* @__PURE__ */ B("select"), P = /* @__PURE__ */ B(!1), S = /* @__PURE__ */ B(ft(typeof window > "u" ? "desktop" : Qh(window.innerWidth, window.innerHeight)));
  bt(() => {
    const g = () => {
      _(S, Qh(window.innerWidth, window.innerHeight), !0);
    };
    return window.addEventListener("resize", g), window.addEventListener("orientationchange", g), () => {
      window.removeEventListener("resize", g), window.removeEventListener("orientationchange", g);
    };
  }), bt(() => {
    s(S), queueMicrotask(ho);
  });
  let T = /* @__PURE__ */ B(0), M = /* @__PURE__ */ B(0), H = /* @__PURE__ */ B(ft({
    toolbarOwnRow: !1,
    titleMaxWidth: Ru,
    foldChips: !1
  })), q = /* @__PURE__ */ B(0), R = /* @__PURE__ */ B(null), K = /* @__PURE__ */ B(!1), ie = /* @__PURE__ */ B(!1);
  const ne = /* @__PURE__ */ X(() => (s(q), s(u)?.selectionStyle() ?? gm)), $ = /* @__PURE__ */ X(() => qT(s(C), s(ne), s(ne).backgroundColor ?? "transparent"));
  bt(() => {
    const g = s($).visible;
    s(K) || _(ie, g, !0);
  });
  let G = /* @__PURE__ */ B(null), W = /* @__PURE__ */ B(null), J = /* @__PURE__ */ B(0), E = /* @__PURE__ */ B(!0), L = /* @__PURE__ */ B(!1), V = !1, ee = null, ge = null, re = !1;
  bt(() => {
    const g = s(u);
    if (g)
      return P6(document.fonts, () => {
        g.fontsLoaded(), _(J, s(J) + 1);
      });
  });
  let se = /* @__PURE__ */ B(100), xe = /* @__PURE__ */ B(!0), be = /* @__PURE__ */ B(void 0), Me = /* @__PURE__ */ B(null), Re = /* @__PURE__ */ B("");
  const Se = new p5({
    decayTime: 220,
    size: 16,
    streamline: 0.25,
    onUpdate: (g) => {
      _(Re, g, !0);
    }
  });
  let Z = /* @__PURE__ */ B(!1), _e = /* @__PURE__ */ B(ft([])), ve = /* @__PURE__ */ B(0);
  const Le = /* @__PURE__ */ X(() => s(_e)[s(ve)] ?? null);
  let Q = null, de = null, me = /* @__PURE__ */ B(null), Pe = /* @__PURE__ */ B(!1), Ie = null, Ke = !1;
  const De = /* @__PURE__ */ X(() => {
    if (!s(Z) || !s(be) || !s(Le)?.frameId || !s(Le).bounds)
      return null;
    const { minX: g, minY: x, maxX: U, maxY: ue } = s(Le).bounds, Te = So(s(be), g, x), je = So(s(be), U, ue);
    return {
      x: Te.x,
      y: Te.y,
      width: je.x - Te.x,
      height: je.y - Te.y
    };
  }), We = /* @__PURE__ */ X(() => {
    const g = s(De);
    if (!g) return null;
    const x = Math.max(0, g.x), U = Math.max(0, g.y), ue = Math.max(0, g.width), Te = Math.max(0, g.height);
    return { top: U, bottom: U + Te, left: x, right: x + ue, height: Te };
  });
  let Ge = /* @__PURE__ */ B(!1), Ve = /* @__PURE__ */ B(!1), dt = /* @__PURE__ */ B(!1), _t = /* @__PURE__ */ B(!1), Ot = /* @__PURE__ */ B(!1);
  const At = /* @__PURE__ */ X(() => () => _(Ot, !0));
  let Rt = /* @__PURE__ */ B(!1), fe = /* @__PURE__ */ B(!1), pe = /* @__PURE__ */ B(null), et = /* @__PURE__ */ B(null), xt = /* @__PURE__ */ B(!1), ye = /* @__PURE__ */ B(ft([]));
  const tt = /* @__PURE__ */ X(() => {
    const g = s(be);
    return !s(xt) || s(Z) || !g ? [] : s(ye).flatMap((x, U) => {
      if (!x.bounds) return [];
      const ue = So(g, x.bounds.minX, x.bounds.minY);
      return [{ id: x.frameId, step: U + 1, x: ue.x, y: ue.y }];
    });
  });
  let qe = /* @__PURE__ */ B(ft([])), Vt = /* @__PURE__ */ B(ft([])), Pt = /* @__PURE__ */ B("disconnected"), Be = null, Ht = ft({ everConnected: !1, everFailed: !1 }), bn = /* @__PURE__ */ B(!1), wn = !1, he = !1, D = null, oe, Oe, ce, Ee, Ye, yt;
  const nt = /* @__PURE__ */ X(() => r() && l() && !s(bn) ? b7(s(Pt), Ht) : null), st = new p7();
  let Et = [], en = "", kn = 0, hn = null;
  const gn = /* @__PURE__ */ X(() => T4(s(C)));
  function mt() {
    _(q, s(u)?.styleRevision() ?? 0, !0);
  }
  function _r(g) {
    s(u)?.applyStyle(g), mt();
  }
  function Zr(g) {
    s(T) > 0 ? s(u)?.previewStyle(g) : s(u)?.setNextStyle(g), mt();
  }
  function fo() {
    s(u)?.copyStyles() && Kr("Copied styles.");
  }
  async function Hu(g) {
    if (!s(u)) return;
    const x = await eC(s(u), g);
    Kr(XT(x, g));
  }
  function qv() {
    s(u)?.pasteStyles(), mt();
  }
  function Yv(g) {
    const x = gh(s(qe)).find((U) => U.id === g);
    x && _r(x.style);
  }
  function Xv() {
    if (!s(u)) return;
    const g = s(u).getSelectedElements()[0] ?? s(u).getNextStyle(), x = l5({
      ...g,
      fontFamily: s(ne).fontFamily ?? void 0,
      fontSize: s(ne).fontSize ?? void 0,
      textAlign: s(ne).textAlign ?? void 0
    });
    _(qe, u5(s(qe), `Preset ${s(qe).length + 1}`, x), !0), Tl(localStorage, s(qe));
  }
  function Qv(g, x) {
    _(qe, d5(s(qe), g, x), !0), Tl(localStorage, s(qe));
  }
  function $v(g) {
    _(qe, f5(s(qe), g), !0), Tl(localStorage, s(qe));
  }
  function ka(g) {
    return s(G) !== null && g?.matches?.('textarea[aria-label="Text editor"]') ? "textEditor" : e6(g) ? "overlay" : sh(g) ? "field" : "board";
  }
  function Wu(g) {
    s(u)?.stepFontSize(g), mt();
  }
  function e0(g) {
    const x = r6(g, {
      selected: s(ne).count,
      tool: s(C),
      strokeRow: s(ie) && s($).strokeColor,
      backgroundRow: s(ie) && s($).backgroundColor,
      fontRow: s(ie) && s($).text,
      target: ka(g.target)
    });
    x && (g.preventDefault(), g.stopPropagation(), x === "copyStyles" ? fo() : x === "pasteStyles" ? qv() : x === "fontSizeUp" || x === "fontSizeDown" ? Wu(x === "fontSizeUp") : x === "fontPicker" ? _(R, "font") : _(R, x === "strokePicker" ? "stroke" : "background", !0));
  }
  function Zu() {
    return typeof window < "u" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function Ki() {
    _(h, oh(s(p), Zu()), !0);
    const g = s(h) === "dark" ? a9 : Js;
    _(
      f,
      {
        ...g,
        background: s(m) ?? g.background
      },
      !0
    ), _(O, s(h) === "dark" ? "#f8f9fa" : "#1e1e1e", !0), s(u)?.setTheme(s(f)), typeof document < "u" && Vi().classList.toggle("dark", s(h) === "dark");
    const x = s(u)?.getNextStyle();
    x && (x.strokeColor === "#1e1e1e" || x.strokeColor === "#f8f9fa") && (s(u)?.setNextStyle({ strokeColor: s(O) }), mt());
  }
  function Ku(g) {
    _(p, g, !0), e.theme === void 0 && Rx(typeof localStorage > "u" ? void 0 : localStorage, g), Ki();
  }
  function Vi() {
    return e.themeRoot ?? document.documentElement;
  }
  bt(() => {
    e.theme === void 0 || e.theme === dn(() => s(p)) || (_(p, e.theme, !0), dn(Ki));
  });
  function Sa(g) {
    Vu(Wx({ objectsSnap: s(y), grid: s(w) }, g));
  }
  function xa() {
    Vu(Hx({ objectsSnap: s(y), grid: s(w) }));
  }
  function Vu(g) {
    const x = typeof localStorage > "u" ? void 0 : localStorage;
    _(w, g.grid, !0), _(y, g.objectsSnap, !0), Bx(x, s(w)), jx(x, s(y)), s(u)?.setGrid(s(w)), s(u)?.setObjectsSnap(s(y));
  }
  function t0(g) {
    _(m, g, !0), Dx(typeof localStorage > "u" ? void 0 : localStorage, g), Ki();
  }
  function Ju() {
    _(E, !s(E)), D4(typeof localStorage > "u" ? void 0 : localStorage, s(E));
  }
  function n0() {
    _(k, !s(k)), Kx(typeof localStorage > "u" ? void 0 : localStorage, s(k)), s(u)?.setDynamicSize(s(k));
  }
  function Ea() {
    _(L, !s(L));
  }
  let er = /* @__PURE__ */ B(void 0), Ji = /* @__PURE__ */ B(void 0), Ta = /* @__PURE__ */ B(void 0), Gi = /* @__PURE__ */ B(null), Gu = 0;
  function Kr(g) {
    _(Gi, g, !0), !(typeof window > "u") && (clearTimeout(Gu), Gu = window.setTimeout(() => _(Gi, null), 5e3));
  }
  let qi = null;
  async function qu(g, x) {
    const U = await U5(g, j5);
    if ("rejection" in U)
      return Kr(Cl(U.rejection)), null;
    const ue = await H5(U.file);
    return ue ? s(u)?.insertImage(ue.dataUrl, ue.naturalWidth, ue.naturalHeight, x.x, x.y) ?? null : (Kr(Cl("decode")), null);
  }
  async function Yu(g, x) {
    const U = [];
    for (const [ue, Te] of g.entries()) {
      const je = await qu(Te, { x: x.x + ue * 24, y: x.y + ue * 24 });
      je && U.push(je);
    }
    U.length > 1 && s(u)?.select(U), s(P) || Sn("select");
  }
  function tr() {
    const g = s(er)?.getBoundingClientRect();
    return g ? { x: g.width / 2, y: g.height / 2 } : { x: 0, y: 0 };
  }
  async function r0(g) {
    const x = g.currentTarget, U = x.files?.[0];
    x.value = "";
    const ue = qi ?? tr();
    qi = null, U && await qu(U, ue), Sn("select");
  }
  function o0() {
    qi = null, s(C) === "image" && Sn("select");
  }
  function Xu(g) {
    return !!(g instanceof Element ? g : null)?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], dialog');
  }
  function Qu(g) {
    return Array.from(g.dataTransfer?.types ?? []).includes("Files");
  }
  function i0(g) {
    Qu(g) && g.preventDefault();
  }
  async function s0(g) {
    if (!Qu(g) || (g.preventDefault(), Xu(g.target))) return;
    const x = vh(Array.from(g.dataTransfer?.files ?? []));
    if (x.length === 0) {
      Kr(Cl("type"));
      return;
    }
    const U = s(er)?.getBoundingClientRect(), ue = U ? { x: g.clientX - U.left, y: g.clientY - U.top } : tr();
    await Yu(x, ue);
  }
  let Ca = null;
  function a0(g) {
    if (Xu(g.target)) return;
    const x = vh(Array.from(g.clipboardData?.files ?? []));
    if (x.length === 0) {
      const U = g.clipboardData?.getData("text/plain") ?? "";
      if (s(u) && s5(U)) {
        g.preventDefault(), g.stopPropagation(), l0(s(u), U);
        return;
      }
      const ue = () => Math.floor(Math.random() * 2147483647), Te = U ? _m(U, Date.now(), ue) : null;
      if (Te === null || !s(u)) return;
      g.preventDefault(), g.stopPropagation(), s(u).pasteJson(Te);
      return;
    }
    g.preventDefault(), g.stopPropagation(), Yu(x, Ca ?? tr());
  }
  async function l0(g, x) {
    const U = Ca ?? tr(), ue = g.screenToWorld(U.x, U.y);
    try {
      g.insertJson(fc(await Qm(x)), ue);
    } catch {
      g.pasteText(x, ue) || g.pasteJson(null, ue);
    }
  }
  function c0() {
    qi = null, s(Ta)?.click();
  }
  let Aa = /* @__PURE__ */ B(!1), Yi = /* @__PURE__ */ B(null), yr = /* @__PURE__ */ B([]), br = /* @__PURE__ */ B(null), Xo = /* @__PURE__ */ B(null), Pa = null;
  const Xi = {}, u0 = /* @__PURE__ */ new Set();
  function wr() {
    _(yr, s(u) ? I5(z5(s(u).embedFramesJson()), u0) : []), s(br) && !s(yr).some((g) => g.id === s(br)) && _(br, null);
  }
  function $u(g, x) {
    const U = s(yr).filter((Te) => C5(Te, g, x));
    if (U.length === 0 || !s(u)) return null;
    const ue = s(u).hitTest(g, x);
    return U.find((Te) => Te.id === ue?.id) ?? null;
  }
  function d0(g) {
    const x = Pa;
    if (Pa = null, !x || s(C) !== "select" || s(yr).length === 0 || !A5(x, { ...g, at: performance.now() })) return;
    const U = $u(g.x, g.y);
    if (!U) return;
    _(br, U.id, !0), _(Xo, null);
    const ue = P5(U.url), Te = Xi[U.id]?.contentWindow;
    ue && Te && Te.postMessage(ue, new URL(U.url).origin);
  }
  function f0(g, x) {
    return Xi[x] = g, {
      destroy() {
        Xi[x] === g && delete Xi[x];
      }
    };
  }
  const h0 = typeof location > "u" ? "" : location.hostname;
  let Ia = !1;
  function g0() {
    Ia || (Ia = !0, queueMicrotask(() => requestAnimationFrame(() => {
      Ia = !1, wr();
    })));
  }
  bt(() => {
    e.scene, s(u) && queueMicrotask(wr);
  });
  function p0(g) {
    const x = tr();
    s(u)?.insertEmbed(g, x.x, x.y), wr(), Sn("select");
  }
  function m0(g) {
    if (!s(u)) return;
    const x = tr();
    s(u).insertDefaultShape(g, x.x, x.y) && Sn("select"), mt();
  }
  function v0(g) {
    if (!s(u)) return;
    const x = tr();
    s(u).setNextFigure(g), s(u).insertDefaultShape("figure", x.x, x.y) && Sn("select"), mt();
  }
  function Sn(g) {
    _(C, g, !0), s(u)?.setTool(g);
  }
  function _0(g, x) {
    if (re && (re = !1, s(C) === "text"))
      return !0;
    if (_(br, null), Pa = !x || x.button === 0 && !x.shiftKey && !x.altKey && !x.ctrlKey && !x.metaKey ? { x: g.x, y: g.y, at: performance.now() } : null, Be && s(u)) {
      if (s(C) === "select" || s(C) === "eraser") {
        const ue = s(u).peerAt(g.x, g.y);
        ue && Kr(oC(Et.find((Te) => Te.clientId === ue)?.name));
      }
      Ra();
    }
    s(C) === "eraser" && Se.start(g.x, g.y);
  }
  function y0(g) {
    s(yr).length > 0 && g0(), s(C) === "eraser" && Se.addPoint(g.x, g.y);
  }
  function b0(g) {
    d0(g), s(C) === "eraser" && Se.stop();
  }
  function w0() {
    if (!s(u)) return;
    const g = s(u).getSelectedElements().map((x) => x.id);
    s(u).cancelPointer(), g.length > 0 && s(u).getSelectedElements().length === 0 && s(u).select(g);
  }
  function k0(g, x) {
    const U = s(er)?.querySelector("canvas");
    if (!U || !s(u)) return;
    const ue = s(u).getSelectedElements().map((je) => je.id);
    s(u).cancelPointer();
    const Te = U.getBoundingClientRect();
    U.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: !0,
      cancelable: !0,
      clientX: Te.left + g,
      clientY: Te.top + x,
      button: 2
    })), ue.length > 0 && s(u).getSelectedElements().length === 0 && s(u).select(ue);
  }
  bt(() => {
    const g = s(er);
    if (!g) return;
    const x = RP({
      zoomAt: ($e, Lt, xr) => s(u)?.zoomAt($e, Lt, xr),
      panBy: ($e, Lt) => s(u)?.panBy($e, Lt),
      cancelGesture: w0,
      openContextMenu: k0
    }), U = ($e) => {
      const Lt = g.getBoundingClientRect();
      return {
        pointerId: $e.pointerId,
        x: $e.clientX - Lt.left,
        y: $e.clientY - Lt.top,
        pointerType: $e.pointerType
      };
    }, ue = ($e, Lt) => {
      Lt.swallow && ($e.stopPropagation(), $e.preventDefault());
    }, Te = ($e) => ue($e, x.down(U($e))), je = ($e) => ue($e, x.move(U($e))), vt = ($e) => ue($e, x.up(U($e))), pn = ($e) => {
      x.consumeClick() && ($e.stopPropagation(), $e.preventDefault());
    };
    return g.addEventListener("pointerdown", Te, !0), g.addEventListener("pointermove", je, !0), g.addEventListener("pointerup", vt, !0), g.addEventListener("pointercancel", vt, !0), window.addEventListener("click", pn, !0), () => {
      g.removeEventListener("pointerdown", Te, !0), g.removeEventListener("pointermove", je, !0), g.removeEventListener("pointerup", vt, !0), g.removeEventListener("pointercancel", vt, !0), window.removeEventListener("click", pn, !0);
    };
  });
  function S0(g) {
    mt(), e.onSceneChange?.(g, "local"), wr(), ts(), s(xn) && go(), Be && (st.observe(g), Qi());
  }
  function Qi() {
    if (!Be || Be.connectionStatus !== "connected") return;
    const g = st.takePatch();
    g && Be.sendPatch(g);
  }
  function za() {
    if (!s(u) || !Be) return;
    const g = c7(
      {
        clientId: Be.profile.clientId,
        claims: Be.ownClaims
      },
      Et
    ), x = JSON.stringify(g);
    x !== en && (en = x, s(u).setPeers(g), _(J, s(J) + 1));
  }
  function ed(g) {
    if (!Be) return;
    const x = Be.ownClaims, U = u7(x, g, Date.now());
    Object.keys(U).length === Object.keys(x).length && Object.keys(U).every((Te) => Te in x) || (Be.setClaims(U), za());
  }
  function ho() {
    !s(u) || !s(er) || !s(Ji) || s(u).setViewportOffsets(A4(s(Ji), s(er)));
  }
  function x0(g) {
    const x = g.key.startsWith("Arrow") && (g.ctrlKey || g.metaKey || g.altKey), U = g.shiftKey && /^Digit[123]$/.test(g.code);
    (x || U) && ho();
  }
  function Ma() {
    ho(), s(u)?.zoomToFit();
  }
  let Oa = /* @__PURE__ */ B(!1), Vr = /* @__PURE__ */ B(null);
  function td() {
    if (!s(u) || !s(be)) {
      _(Vr, null);
      return;
    }
    const g = yl(s(u).pendingFlowchartElements());
    if (!g) {
      _(Vr, null);
      return;
    }
    const x = So(s(be), g.x + g.width / 2, g.y);
    _(Vr, { x: x.x, y: x.y }, !0);
  }
  function E0(g) {
    Pm(g) || s(u)?.flowchartSetShape(g);
  }
  const nd = "Switch shape";
  let xn = /* @__PURE__ */ B(null);
  function T0(g) {
    if (!s(u) || s(Z)) return;
    const x = Sx(g, {
      open: s(xn) !== null,
      switchable: s(u).canConvertSelection(),
      onBoard: g.target?.matches?.('[role="application"]') ?? !1
    });
    if (x) {
      if (x === "close") {
        Qo();
        return;
      }
      g.preventDefault(), x === "open" ? s(u).beginConversion() : s(u).convertSelection(null, x === "forward"), go();
    }
  }
  function go() {
    if (!s(u) || !s(be)) return;
    const g = s(u).getSelectedElements(), x = yl(g);
    if (!x) {
      Qo();
      return;
    }
    const U = s(u).sharedConversionType(), ue = Ex(U);
    if (!ue.length) {
      Qo();
      return;
    }
    _(
      xn,
      {
        ...zx(x, s(be)),
        current: U,
        types: ue
      },
      !0
    );
  }
  function Qo() {
    s(xn) && (_(xn, null), s(u)?.endConversion());
  }
  let po = 0, Fa = !1, $i = "", rd = 0;
  function Ra() {
    po || (po = requestAnimationFrame(od));
  }
  function od() {
    if (po = 0, !s(u) || !Be) return;
    const g = s(K) || s(u).linearInProgress() || s(G) !== null;
    if (!g || s(Vt).length === 0) {
      if (Fa && (Be.sendPreviewEnd(), Fa = !1, $i = ""), !g) return;
    } else if (Be.connectionStatus === "connected" && performance.now() - rd >= d7($i.length)) {
      const x = s(u).gestureElements(), U = JSON.stringify(x);
      x.length > 0 && U !== $i && (Be.sendPreview(x), Fa = !0, $i = U, rd = performance.now());
    }
    po = requestAnimationFrame(od);
  }
  function id(g) {
    if (!s(u) || !g.elements?.length && !g.order?.length) return;
    const x = st.withPictures(g.elements ?? []), U = g.order ? { elements: x, order: g.order } : { elements: x }, ue = { type: "osidraw", version: 1, elements: U.elements ?? [] };
    U.order && (ue.order = U.order), s(u).applyRemotePatch(JSON.stringify(ue)) && (mt(), st.adoptRemote(U), e.onSceneChange?.(
      U.order?.length ? s(u).exportJson() : m7(U),
      "remote"
    ), wr(), ts());
  }
  async function sd() {
    if (!e.fetchLatest) return;
    let g;
    try {
      g = await e.fetchLatest();
    } catch {
      return;
    }
    id({ elements: g });
  }
  function La() {
    return typeof window < "u" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function $o() {
    const g = s(er)?.getBoundingClientRect();
    return { width: g?.width ?? 0, height: g?.height ?? 0 };
  }
  function C0(g) {
    g.key === "Enter" && !g.metaKey && !g.ctrlKey && !g.altKey && ka(g.target) === "board" && (V = !0, setTimeout(() => V = !1));
  }
  function A0() {
    if (!s(u)) return;
    const g = yl(s(u).getSelectedElements());
    if (!g) return;
    ee = s(u).cameraTarget;
    const x = R4(g, $o(), s(u).camera);
    ge?.cancel(), ge = kl(s(u).camera, x, (U) => gs(s(u), U), { reducedMotion: La(), source: s(u) });
  }
  function P0() {
    if (!s(u) || !ee) return;
    const g = ee;
    ee = null, ge?.cancel(), ge = kl(s(u).camera, g, (x) => gs(s(u), x), { reducedMotion: La(), source: s(u) });
  }
  function Da() {
    return s(u) ? JSON.parse(s(u).exportJson()).elements ?? [] : [];
  }
  function es(g, x = {}) {
    if (!s(u)) return;
    _(ve, Math.min(Math.max(g, 0), Math.max(s(_e).length - 1, 0)), !0);
    const U = s(_e)[s(ve)];
    Q?.cancel(), U?.bounds && (Q = Na(bl(U.bounds, $o(), Sl), { instant: x.instant })), Be && Be.sendPresent(U?.frameId ?? null);
  }
  function Na(g, x = {}) {
    if (!s(u)) return null;
    const U = F4(s(u).camera, g, $o());
    return kl(s(u).camera, g, (ue) => gs(s(u), ue), {
      durationMs: U.durationMs,
      path: U.at,
      reducedMotion: x.instant || La(),
      source: s(u),
      onDone: x.onDone
    });
  }
  function ts() {
    s(xt) && _(ye, xl(Da()).filter((g) => g.frameId), !0);
  }
  function ad() {
    _(xt, !0), ts();
  }
  let Ba = null;
  function I0(g) {
    const x = s(ye).find((U) => U.frameId === g)?.bounds;
    x && (Ba?.cancel(), Ba = Na(bl(x, $o(), Sl)));
  }
  function z0(g) {
    s(u) && (s(u).setPresentationPath(g), ts());
  }
  function Ua(g) {
    es(B4(g, s(ve), s(_e).length));
  }
  async function ns() {
    if (!(!s(u) || s(Z))) {
      s(Pe) && (_(Pe, !1), Ie?.cancel()), _(_e, xl(Da()), !0), de = {
        camera: s(u).camera,
        tool: s(C),
        toolLocked: s(u).getToolLocked()
      }, _(Z, !0), Sn("laser"), await Br(), es(0, { instant: !1 });
      try {
        await Vi().requestFullscreen?.(), ja = document.fullscreenElement !== null;
      } catch {
      }
    }
  }
  let ja = !1, kr = /* @__PURE__ */ B(null), Ha = "";
  function M0() {
    s(Z) && ja && !document.fullscreenElement && Wa();
  }
  async function Wa() {
    if (!s(Z)) return;
    Q?.cancel(), _(Z, !1), _(_e, [], !0), _(kr, null), Ha = "";
    const g = de;
    if (de = null, s(u) && g && (gs(s(u), g.camera), Sn(g.tool), s(u).getToolLocked() !== g.toolLocked && s(u).setToolLocked(g.toolLocked)), Be && Be.sendPresentEnd(), ja = !1, document.fullscreenElement)
      try {
        await document.exitFullscreen();
      } catch {
      }
  }
  function O0(g) {
    const x = g.find((U) => U.presenting !== void 0) ?? null;
    if (_(
      me,
      x ? {
        name: x.name,
        presenting: x.presenting ?? null
      } : null,
      !0
    ), !s(me)) {
      _(Pe, !1);
      return;
    }
    s(Pe) && ld(s(me).presenting);
  }
  function ld(g) {
    if (!s(u)) return;
    const x = xl(Da()).find((U) => U.frameId === g);
    x?.bounds && (Ie?.cancel(), Ke = !0, Ie = Na(bl(x.bounds, $o(), Sl), {
      onDone: () => {
        Ke = !1;
      }
    }));
  }
  function F0() {
    _(Pe, !s(Pe)), s(Pe) && s(me) ? ld(s(me).presenting) : Ie?.cancel();
  }
  function R0(g) {
    if (!s(Z) && !s(Pe) || g.key === "Tab") return !1;
    if (s(Z)) {
      const { action: x, typed: U } = W4(g.key, Ha);
      return Ha = U, g.preventDefault(), g.stopPropagation(), x === "exit" ? Wa() : x === "black" || x === "white" ? _(kr, s(kr) === x ? null : x, !0) : x && s(kr) ? _(kr, null) : typeof x == "object" && x ? es(x.goto) : x && Ua(x), !0;
    }
    return g.key !== "Escape" ? !1 : (g.preventDefault(), g.stopPropagation(), _(Pe, !1), Ie?.cancel(), !0);
  }
  function L0() {
    s(Z) && es(s(ve), { instant: !0 });
  }
  Gt(() => {
    _(p, e.theme ?? Fx(localStorage), !0), _(m, Lx(localStorage), !0), _(w, Nx(localStorage), !0), _(y, Ux(localStorage), !0), _(k, Zx(localStorage), !0), _(E, L4(localStorage), !0), _(qe, g5(localStorage), !0), s(u)?.setObjectsSnap(s(y)), s(u)?.setDynamicSize(s(k)), _(h, oh(s(p), Zu()), !0), Vi().classList.toggle("dark", s(h) === "dark");
    const g = Vx(getComputedStyle(Vi()), void 0, s(m));
    _(f, g.theme, !0), _(O, g.ink, !0);
    const x = window.matchMedia("(prefers-color-scheme: dark)"), U = () => {
      s(p) === "system" && Ki();
    };
    return x.addEventListener("change", U), r() && (st.reset(e.scene.toArray()), !a() && l() && (async () => {
      const ue = await h7({
        browser: a(),
        slug: r(),
        location: window.location,
        secret: null
      });
      if (ue === null) {
        _(bn, !0);
        return;
      }
      await dd(ue);
    })()), () => {
      wn = !0, x.removeEventListener("change", U), oe?.(), Oe?.(), ce?.(), Ee?.(), Ye?.(), yt?.(), Be?.disconnect();
    };
  });
  let cd = null, ud = null;
  function D0() {
    return cd ??= new Promise((g) => {
      ud = g;
    }), cd;
  }
  async function dd(g) {
    if (he || wn || (he = !0, s(u) || await D0(), wn)) return;
    const x = await pv(g);
    wn || (Be = new a7(r(), x), oe = Be.onPeers((U) => {
      s(u) && f7(s(Vt), U, s(u).peerLaser.bind(s(u))), _(Vt, U, !0);
    }), Oe = Be.onPeerState((U) => {
      Et = U, za(), O0(U);
    }), s(u) && ed(s(u).getSelectedElements().map((U) => U.id)), Be.setSceneSync({
      inventory: () => (Qi(), st.inventory()),
      missing: (U) => (Qi(), st.missing(U))
    }), ce = Be.onStatus((U) => {
      const ue = U === "connected" && Ht.everConnected;
      s(Pt) === "connecting" && U === "disconnected" && (Ht.everFailed = !0), U === "connected" && (Ht.everConnected = !0), _(Pt, U, !0), U === "connected" && (Qi(), ue && sd());
    }), Ee = Be.onRemotePatch(id), Ye = Be.onJoin((U) => {
      e.onPeerJoined && (async () => {
        try {
          await e.onPeerJoined();
        } catch {
        }
        Be?.sendStored(U);
      })();
    }), yt = Be.onStored(() => {
      sd();
    }), Be.connect());
  }
  bt(() => {
    const g = c();
    if (a()) {
      if (!g || !r()) {
        _(bn, !0);
        return;
      }
      _(bn, !1), !(D !== null && S7(D, g)) && (D = g, dd(g));
    }
  }), Wi(() => {
    kn && cancelAnimationFrame(kn), ei && cancelAnimationFrame(ei), po && cancelAnimationFrame(po), Q?.cancel(), Ie?.cancel(), Ba?.cancel(), Se.clear(), Be?.disconnect();
  });
  function N0(g) {
    s(Pe) && !Ke && _(Pe, !1), s(G) && _(J, s(J) + 1), hn = g, _(be, g, !0), s(Oa) && td(), s(xn) && go(), !kn && (kn = requestAnimationFrame(() => {
      kn = 0;
      const x = hn;
      hn = null, x && (_(se, th(x.scale), !0), _(xe, s(u)?.contentInView() ?? !0, !0), wr());
    }));
  }
  let ei = 0, Za = null, rs = { x: Number.NaN, y: Number.NaN }, os = /* @__PURE__ */ B(null), fd = !1, Ka = null;
  function B0(g) {
    const x = g.currentTarget;
    if (!x) return;
    const U = x.getBoundingClientRect(), ue = g.clientX - U.left, Te = g.clientY - U.top;
    if (Ka = { x: ue, y: Te }, fd = g.buttons !== 0, Ca = { x: ue, y: Te }, Be && s(be)) {
      const je = ic(s(be), ue, Te);
      Za = { x: je.x, y: je.y };
    }
    ei || (ei = requestAnimationFrame(() => {
      ei = 0;
      const je = Ka;
      if (Ka = null, je && s(u)) {
        _(os, s(u).hoverCursor(je.x, je.y), !0);
        const pn = !fd && s(C) === "select" && s(yr).length > 0 ? $u(je.x, je.y) : null;
        _(Xo, pn && pn.id !== s(br) ? pn.id : null, !0), s(Xo) && _(os, "pointer");
      }
      const vt = Za;
      Za = null, !(!vt || !Be) && (Math.abs(vt.x - rs.x) < 1 && Math.abs(vt.y - rs.y) < 1 || (rs = vt, Be.sendCursor(vt.x, vt.y, s(C) === "laser" ? "laser" : "pointer", s(K))));
    }));
  }
  function Va(g, x) {
    if (!Be || !s(be) || s(C) !== "laser") return;
    const U = g.currentTarget;
    if (!U) return;
    const ue = U.getBoundingClientRect(), Te = ic(s(be), g.clientX - ue.left, g.clientY - ue.top);
    rs = Te, Be.sendCursor(Te.x, Te.y, "laser", x);
  }
  function U0() {
    _(os, null), _(Xo, null);
  }
  let Ja = /* @__PURE__ */ B(null);
  function hd() {
    s(u) && Pi("drawing.osidraw", new Blob([s(u).exportJson()], { type: "application/json" }));
  }
  function j0(g) {
    const x = vr(g);
    if (e.themeRoot && !e.themeRoot.contains(x) || sh(x)) return;
    const U = g.metaKey || g.ctrlKey, ue = g.key.toLowerCase(), Te = o6(g, s(Z), ka(x));
    if (g.key === "Escape")
      Se.stop(), _(br, null);
    else {
      if (t6(x))
        return;
      U && g.shiftKey && ue === "e" ? (g.preventDefault(), _(Ve, !0)) : U && ue === "o" ? (g.preventDefault(), _(Ge, !0), queueMicrotask(() => s(Ja)?.openFile())) : U && ue === "s" ? (g.preventDefault(), hd()) : Te ? H0(Te, g) : !U && g.key === "?" && (g.preventDefault(), _(Rt, !0));
    }
  }
  function H0(g, x) {
    switch (x.preventDefault(), g) {
      case "snap":
        xa();
        break;
      case "grid":
        Sa({ enabled: !s(w).enabled });
        break;
      case "zen":
        Ea();
        break;
      case "copyAsPng":
        Hu("png");
        break;
      case "present":
        ns();
        break;
      case "palette":
        _(fe, !0);
        break;
      default: {
        const U = g;
        throw new Error(`shortcutRegistry: no app shortcut runs "${U}"`);
      }
    }
  }
  function W0() {
    if (!s(u)) return null;
    const g = ih(s(u).getSelectedElements(), s(u).selectionLocked(), s(u).selectionIsGroup());
    return g && {
      can: s($),
      element: g,
      switchable: s(u).canConvertSelection()
    };
  }
  const Z0 = () => ({
    setTool: Sn,
    insertShape: m0,
    insertFigure: v0,
    zoomIn: () => s(u)?.zoomIn(),
    zoomOut: () => s(u)?.zoomOut(),
    zoomReset: () => s(u)?.zoomReset(),
    zoomToFit: Ma,
    zoomToFitSelectionInViewport: () => {
      ho(), s(u)?.zoomToFitSelectionInViewport();
    },
    zoomToFitSelection: () => {
      ho(), s(u)?.zoomToFitSelection();
    },
    pickTheme: Ku,
    toggleGrid: () => Sa({ enabled: !s(w).enabled }),
    toggleObjectsSnap: xa,
    toggleFocusMode: Ju,
    toggleZenMode: Ea,
    openExport: () => _(Ve, !0),
    openTemplates: () => _(_t, !0),
    openMermaid: () => _(dt, !0),
    enterPresent: () => {
      ns();
    },
    openPath: ad,
    presets: gh(s(qe)).map((g) => ({ id: g.id, name: g.name })),
    applyStylePreset: Yv,
    selection: W0(),
    run: (g) => {
      s(u) && (g(s(u)), mt());
    },
    applyStyle: _r,
    openPicker: (g) => _(R, g, !0),
    openShapeSwitch: () => {
      s(u)?.beginConversion(), go();
    },
    copyStyles: fo,
    stepFontSize: Wu,
    vectorize: (g) => _(et, g, !0)
  }), K0 = /* @__PURE__ */ X(() => s(fe) ? W6(Z0()) : []);
  var nr = KP();
  Qe("keydown", $t, j0), Qe("resize", $t, L0), Qe("fullscreenchange", Fp, M0);
  let gd, pd;
  var md = z(nr);
  {
    var V0 = (g) => {
      {
        const x = (Te) => {
          var je = on(), vt = Ue(je);
          {
            var pn = ($e) => {
              {
                let Lt = /* @__PURE__ */ X(() => l() ? s(At) : void 0);
                Je(
                  rE($e, {
                    get engine() {
                      return s(u);
                    },
                    get formFactor() {
                      return s(S);
                    },
                    get themePreference() {
                      return s(p);
                    },
                    get canvasBackground() {
                      return s(m);
                    },
                    get grid() {
                      return s(w);
                    },
                    get objectsSnap() {
                      return s(y);
                    },
                    get dynamicSize() {
                      return s(k);
                    },
                    get focusModeEnabled() {
                      return s(E);
                    },
                    onPickTheme: Ku,
                    onPickCanvasBackground: t0,
                    onPickGrid: Sa,
                    onToggleObjectsSnap: xa,
                    onToggleDynamicSize: n0,
                    onToggleFocusMode: Ju,
                    onOpenExport: () => _(Ve, !0),
                    onOpenMermaid: () => _(dt, !0),
                    onOpenTemplates: () => _(_t, !0),
                    get onOpenShare() {
                      return s(Lt);
                    },
                    onOpenShortcuts: () => _(Rt, !0),
                    onOpenPresent: () => {
                      ns();
                    },
                    onOpenPath: ad,
                    onClose: () => _(Ge, !1)
                  }),
                  (xr) => _(Ja, xr),
                  () => s(Ja)
                );
              }
            };
            j(vt, ($e) => {
              s(Ge) && $e(pn);
            });
          }
          A(Te, je);
        };
        let U = /* @__PURE__ */ X(() => l() ? s(At) : void 0), ue = /* @__PURE__ */ X(() => s(S) === "phone");
        N7(g, {
          get title() {
            return n();
          },
          get status() {
            return o();
          },
          get live() {
            return s(nt);
          },
          get shared() {
            return d();
          },
          onToggleMenu: () => _(Ge, !s(Ge)),
          get onOpenShare() {
            return s(U);
          },
          onOpenShortcuts: () => _(Rt, !0),
          get toolbarWidth() {
            return s(M);
          },
          get phone() {
            return s(ue);
          },
          onPlan: (Te) => _(H, Te, !0),
          menu: x,
          $$slots: { menu: !0 }
        });
      }
    };
    j(md, (g) => {
      s(Z) || g(V0);
    });
  }
  var Sr = b(md, 2), vd = z(Sr);
  Em(vd, {
    get scene() {
      return e.scene;
    },
    get theme() {
      return s(f);
    },
    get defaultStroke() {
      return s(O);
    },
    get ariaLabel() {
      return i();
    },
    onSceneChange: S0,
    onCameraChange: N0,
    onReady: (g) => {
      _(u, g), ud?.(), _(be, g.camera, !0), _(se, th(g.camera.scale), !0), g.setGrid(s(w)), g.setObjectsSnap(s(y)), g.setDynamicSize(s(k)), _(q, g.styleRevision(), !0), wr(), en = "", za(), e.onReady?.(g);
    },
    onToolChange: (g) => {
      _(C, g, !0), mt(), g === "image" && c0(), g === "embed" && _(Aa, !0);
    },
    onSelectionChange: (g) => {
      _(T, g.length, !0), _(R, null), mt(), ed(g), s(xn) && s(u)?.canConvertSelection() ? go() : Qo();
    },
    onNotice: (g) => Kr(rC[g]),
    onRequestTextEdit: (g) => {
      _(G, g, !0), V && (V = !1, s(E) && A0()), Be && Ra();
    },
    onRequestFrameRename: (g) => {
      _(W, g, !0);
    },
    onContextMenu: (g, x) => {
      s(u) && _(
        Me,
        {
          x: g.x,
          y: g.y,
          element: x === "canvas" ? null : ih(s(u).getSelectedElements(), s(u).selectionLocked(), s(u).selectionIsGroup(), s(u).selectionStyle()),
          // The board menu's "Unlock all", on its oracle's predicate: nothing selected and
          // something locked (`actionElementLock.ts@1118751f:166-171`).
          unlockAll: x === "canvas" && s(u).canUnlockAll()
        },
        !0
      );
    },
    onToolLockChange: (g) => {
      _(P, g, !0);
    },
    onFlowchartCreatingChange: (g) => {
      _(Oa, g, !0), g ? td() : _(Vr, null);
    },
    onPointerDown: _0,
    onPointerMove: y0,
    onPointerUp: b0
  });
  var _d = b(vd, 2);
  {
    var J0 = (g) => {
      var x = LP(), U = ae(x);
      Y(() => {
        N(U, "d", s(Re)), N(U, "fill", s(h) === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)");
      }), A(g, x);
    };
    j(_d, (g) => {
      s(Re) && g(J0);
    });
  }
  var yd = b(_d, 2);
  {
    var G0 = (g) => {
      var x = DP(), U = Ue(x);
      let ue;
      var Te = b(U, 2);
      let je;
      var vt = b(Te, 2);
      let pn;
      var $e = b(vt, 2);
      let Lt;
      Y(() => {
        ue = ht(U, "", ue, {
          top: "0",
          left: "0",
          right: "0",
          height: `${s(We).top}px`
        }), je = ht(Te, "", je, {
          top: `${s(We).bottom}px`,
          left: "0",
          right: "0",
          bottom: "0"
        }), pn = ht(vt, "", pn, {
          top: `${s(We).top}px`,
          left: "0",
          width: `${s(We).left}px`,
          height: `${s(We).height}px`
        }), Lt = ht($e, "", Lt, {
          top: `${s(We).top}px`,
          left: `${s(We).right}px`,
          right: "0",
          height: `${s(We).height}px`
        });
      }), A(g, x);
    };
    j(yd, (g) => {
      s(We) && g(G0);
    });
  }
  var bd = b(yd, 2);
  Ze(bd, 17, () => s(tt), (g) => g.id, (g, x) => {
    var U = NP();
    let ue;
    var Te = ae(U, !0);
    Y(() => {
      ue = ht(U, "", ue, { left: `${s(x).x}px`, top: `${s(x).y}px` }), le(Te, s(x).step);
    }), A(g, U);
  });
  var wd = b(bd, 2);
  {
    var q0 = (g) => {
      rh(g, {
        label: "Flowchart node shape",
        keyHints: !0,
        get x() {
          return s(Vr).x;
        },
        get y() {
          return s(Vr).y;
        },
        onChoose: E0
      });
    };
    j(wd, (g) => {
      s(Oa) && s(Vr) && g(q0);
    });
  }
  var Y0 = b(wd, 2);
  {
    var X0 = (g) => {
      rh(g, {
        label: nd,
        below: !0,
        get x() {
          return s(xn).x;
        },
        get y() {
          return s(xn).y;
        },
        get current() {
          return s(xn).current;
        },
        get types() {
          return s(xn).types;
        },
        onChoose: (x) => {
          s(u)?.convertSelection(x), go();
        }
      });
    };
    j(Y0, (g) => {
      s(xn) && g(X0);
    });
  }
  Je(Sr, (g) => _(er, g), () => s(er));
  var ti = b(Sr, 2);
  Je(ti, (g) => _(Ta, g), () => s(Ta));
  var kd = b(ti, 2);
  Ze(kd, 17, () => s(yr), (g) => g.id, (g, x) => {
    var U = UP(), ue = Ue(U);
    let Te;
    var je = z(ue);
    P3(je, ($e, Lt) => f0?.($e, Lt), () => s(x).id);
    var vt = b(ue, 2);
    {
      var pn = ($e) => {
        var Lt = BP();
        let xr;
        Y(() => xr = ht(Lt, "", xr, {
          left: `${s(x).x + s(x).width / 2}px`,
          top: `${s(x).y + s(x).height / 2}px`
        })), A($e, Lt);
      };
      j(vt, ($e) => {
        s(x).id === s(Xo) && $e(pn);
      });
    }
    Y(
      ($e, Lt, xr, v1) => {
        Te = Ce(ue, 1, "embed-frame", null, Te, { active: s(x).id === s(br) }), ht(ue, $e), N(je, "src", Lt), N(je, "srcdoc", s(x).srcdoc), N(je, "sandbox", xr), N(je, "referrerpolicy", y5), N(je, "allow", b5), ht(je, v1);
      },
      [
        () => `${E5(s(x))};--embed-scale:${s(x).scale}`,
        () => s(x).srcdoc ? void 0 : w5(s(x), h0),
        () => _5(s(x)),
        () => T5(s(x))
      ]
    ), A(g, U);
  });
  var Sd = b(kd, 2);
  {
    var Q0 = (g) => {
      var x = jP(), U = ae(x, !0);
      Y(() => le(U, s(Gi))), A(g, x);
    };
    j(Sd, (g) => {
      s(Gi) && g(Q0);
    });
  }
  var xd = b(Sd, 2);
  {
    var $0 = (g) => {
      const x = /* @__PURE__ */ X(() => s(Yi));
      ph(g, {
        get engine() {
          return s(u);
        },
        get initial() {
          return s(x).url;
        },
        onInsert: (U) => {
          s(u)?.setEmbedUrl(s(x).id, U) && wr();
        },
        onClose: () => {
          _(Yi, null);
        }
      });
    }, e1 = (g) => {
      ph(g, {
        get engine() {
          return s(u);
        },
        onInsert: p0,
        onClose: () => {
          _(Aa, !1), s(C) === "embed" && Sn("select");
        }
      });
    };
    j(xd, (g) => {
      s(Yi) ? g($0) : s(Aa) && g(e1, 1);
    });
  }
  var Ed = b(xd, 2);
  CP(Ed, {
    get peers() {
      return s(Vt);
    },
    get camera() {
      return s(be);
    }
  });
  var Td = b(Ed, 2);
  {
    var t1 = (g) => {
      var x = HP(), U = z(x);
      {
        var ue = (je) => {
          bT(je, {
            get summary() {
              return s(ne);
            },
            get can() {
              return s($);
            },
            get engine() {
              return s(u);
            },
            get themeMode() {
              return s(h);
            },
            onApply: _r,
            onPreview: Zr,
            run: (vt) => {
              s(u) && (vt(s(u)), mt());
            }
          });
        };
        j(U, (je) => {
          s($).visible && je(ue);
        });
      }
      var Te = b(U, 2);
      kE(Te, {
        get active() {
          return s(C);
        },
        onSelect: Sn
      }), A(g, x);
    };
    j(Td, (g) => {
      !s(Z) && s(S) === "phone" && g(t1);
    });
  }
  var Cd = b(Td, 2);
  {
    var n1 = (g) => {
      fE(g, {
        get active() {
          return s(C);
        },
        get toolLocked() {
          return s(P);
        },
        get zenMode() {
          return s(L);
        },
        onSelect: Sn,
        onWidth: (x) => _(M, x, !0),
        onToggleToolLock: () => {
          s(u) && (s(u).setToolLocked(!s(u).getToolLocked()), _(P, s(u).getToolLocked(), !0));
        }
      });
    };
    j(Cd, (g) => {
      !s(Z) && s(S) !== "phone" && g(n1);
    });
  }
  var Ad = b(Cd, 2);
  {
    var r1 = (g) => {
      var x = on(), U = Ue(x);
      {
        var ue = (je) => {
          CT(je, {
            get summary() {
              return s(ne);
            },
            get can() {
              return s($);
            },
            get engine() {
              return s(u);
            },
            get themeMode() {
              return s(h);
            },
            onApply: _r,
            onPreview: Zr,
            run: (vt) => {
              s(u) && (vt(s(u)), mt());
            }
          });
        }, Te = (je) => {
          HT(je, {
            get summary() {
              return s(ne);
            },
            get can() {
              return s($);
            },
            get engine() {
              return s(u);
            },
            get themeMode() {
              return s(h);
            },
            get openPicker() {
              return s(R);
            },
            get builtinPresets() {
              return $m;
            },
            get userPresets() {
              return s(qe);
            },
            onApplyPreset: (vt) => _r(vt.style),
            onSavePreset: Xv,
            onRenamePreset: Qv,
            onDeletePreset: $v,
            onOpenPicker: (vt) => _(R, vt, !0),
            onApply: _r,
            onPreview: Zr,
            run: (vt) => {
              s(u) && (vt(s(u)), mt());
            }
          });
        };
        j(U, (je) => {
          s(S) === "tablet" ? je(ue) : je(Te, -1);
        });
      }
      A(g, x);
    }, o1 = /* @__PURE__ */ X(() => s(ie) && !s(Z) && Io("inspector", s(L)) && s(S) !== "phone");
    j(Ad, (g) => {
      s(o1) && g(r1);
    });
  }
  var Pd = b(Ad, 2);
  {
    var i1 = (g) => {
      lC(g, {
        get engine() {
          return s(u);
        },
        get zoom() {
          return s(se);
        },
        get contentVisible() {
          return s(xe);
        },
        get zenMode() {
          return s(L);
        },
        onFit: Ma
      });
    };
    j(Pd, (g) => {
      !s(Z) && s(S) !== "phone" && g(i1);
    });
  }
  var Id = b(Pd, 2);
  {
    var s1 = (g) => {
      var x = WP();
      I("click", x, Ea), A(g, x);
    }, a1 = /* @__PURE__ */ X(() => s(L) && !s(Z) && Io("exitZenMode", s(L)));
    j(Id, (g) => {
      s(a1) && g(s1);
    });
  }
  var zd = b(Id, 2);
  {
    var l1 = (g) => {
      hx(g, {
        get stops() {
          return s(ye);
        },
        onVisit: I0,
        onReorder: z0,
        onPresent: () => {
          ns();
        },
        onClose: () => _(xt, !1)
      });
    }, c1 = /* @__PURE__ */ X(() => s(xt) && !s(Z) && Io("pathPanel", s(L)));
    j(zd, (g) => {
      s(c1) && g(l1);
    });
  }
  var Md = b(zd, 2);
  {
    var u1 = (g) => {
      var x = ZP();
      let U;
      Y(() => U = Ce(x, 1, "present-blank", null, U, { white: s(kr) === "white" })), I("click", x, () => _(kr, null)), A(g, x);
    };
    j(Md, (g) => {
      s(Z) && s(kr) && g(u1);
    });
  }
  var Od = b(Md, 2);
  {
    var d1 = (g) => {
      J4(g, {
        get index() {
          return s(ve);
        },
        get count() {
          return s(_e).length;
        },
        onPrev: () => Ua("prev"),
        onNext: () => Ua("next"),
        onExit: () => {
          Wa();
        }
      });
    }, f1 = (g) => {
      mx(g, {
        get name() {
          return s(me).name;
        },
        get following() {
          return s(Pe);
        },
        onToggle: F0
      });
    };
    j(Od, (g) => {
      s(Z) ? g(d1) : s(me) && g(f1, 1);
    });
  }
  var Fd = b(Od, 2);
  {
    var h1 = (g) => {
      var x = on(), U = Ue(x);
      Of(U, () => s(G).id, (ue) => {
        {
          let Te = /* @__PURE__ */ X(() => s(q) + s(J));
          uC(ue, {
            get engine() {
              return s(u);
            },
            get request() {
              return s(G);
            },
            get revision() {
              return s(Te);
            },
            onInput: () => {
              Be && Ra();
            },
            onSave: hd,
            onDone: (je) => {
              _(G, null), P0(), je && (re = !0, setTimeout(() => re = !1)), mt();
            }
          });
        }
      }), A(g, x);
    };
    j(Fd, (g) => {
      s(G) && s(u) && g(h1);
    });
  }
  var Rd = b(Fd, 2);
  {
    var g1 = (g) => {
      var x = on(), U = Ue(x);
      Of(U, () => s(W).id, (ue) => {
        fC(ue, {
          get engine() {
            return s(u);
          },
          get request() {
            return s(W);
          },
          onDone: () => _(W, null)
        });
      }), A(g, x);
    };
    j(Rd, (g) => {
      s(W) && s(u) && g(g1);
    });
  }
  var p1 = b(Rd, 2);
  {
    var m1 = (g) => {
      xP(g, {
        get engine() {
          return s(u);
        },
        get slug() {
          return r();
        },
        get peers() {
          return s(Vt);
        },
        get connectionStatus() {
          return s(Pt);
        },
        get secret() {
          return c();
        },
        get onShareLive() {
          return e.onShareLive;
        },
        get paletteCommands() {
          return s(K0);
        },
        get paletteRecentId() {
          return s(pe);
        },
        onPaletteRun: (x) => _(pe, x, !0),
        onCopyStyles: fo,
        onCopyToClipboard: (x) => {
          Hu(x);
        },
        onFit: Ma,
        onEditEmbedLink: (x) => {
          const U = s(yr).find((ue) => ue.id === x)?.url;
          U && _(Yi, { id: x, url: U }, !0);
        },
        onInsertMermaid: (x) => {
          if (!s(u)) return;
          const U = tr();
          s(u).insertJson(fc(x), s(u).screenToWorld(U.x, U.y)) && (ho(), s(u).zoomToFitSelectionInViewport());
        },
        onInsertTemplate: (x) => {
          if (!s(u)) return;
          const U = tr();
          s(u).pasteJson(x, s(u).screenToWorld(U.x, U.y));
        },
        get menu() {
          return s(Me);
        },
        set menu(x) {
          _(Me, x, !0);
        },
        get showMainMenu() {
          return s(Ge);
        },
        set showMainMenu(x) {
          _(Ge, x, !0);
        },
        get showExport() {
          return s(Ve);
        },
        set showExport(x) {
          _(Ve, x, !0);
        },
        get showMermaid() {
          return s(dt);
        },
        set showMermaid(x) {
          _(dt, x, !0);
        },
        get showTemplates() {
          return s(_t);
        },
        set showTemplates(x) {
          _(_t, x, !0);
        },
        get showShare() {
          return s(Ot);
        },
        set showShare(x) {
          _(Ot, x, !0);
        },
        get showShortcuts() {
          return s(Rt);
        },
        set showShortcuts(x) {
          _(Rt, x, !0);
        },
        get showPalette() {
          return s(fe);
        },
        set showPalette(x) {
          _(fe, x, !0);
        },
        get vectorizeId() {
          return s(et);
        },
        set vectorizeId(x) {
          _(et, x, !0);
        }
      });
    };
    j(p1, (g) => {
      s(Z) || g(m1);
    });
  }
  Je(nr, (g) => _(Ji, g), () => s(Ji)), Y(() => {
    gd = Ce(nr, 1, "draw-chrome", null, gd, {
      phone: s(S) === "phone",
      tablet: s(S) === "tablet",
      "toolbar-row": s(H).toolbarOwnRow
    }), pd = ht(nr, "", pd, { cursor: s(os) ?? s(gn) }), N(ti, "accept", L5);
  }), Qe(
    "keydown",
    nr,
    (g) => {
      C0(g), R0(g) || (e0(g), T0(g)), x0(g);
    },
    !0
  ), Qe("dragover", nr, i0), Qe("drop", nr, s0), Qe("paste", nr, a0, !0), I("pointermove", Sr, B0), Qe("mouseleave", Sr, U0), Qe(
    "pointerdown",
    Sr,
    (g) => {
      g.target.closest?.(`[aria-label="${nd}"]`) || Qo(), _(K, !0), Va(g, !0);
    },
    !0
  ), I("pointerup", Sr, (g) => {
    _(K, !1), Va(g, !1);
  }), Qe("pointercancel", Sr, (g) => {
    _(K, !1), Va(g, !1);
  }), I(
    "change",
    // The engine is up: the live link, waiting for it, may go.
    // Known from the start rather than from the first pan: the cursor we send and
    // the peers' cursors we draw are both placed with it, and without it ours was
    // never sent and theirs sat at the corner until someone moved the camera.
    // The arrow key again keeps the tool and moves the next arrow's type.
    // "canvas" opens the board menu even when a selection is kept from before this
    // right-click (a right-click never clears it) — the menu kind is the hit's own,
    // not read back off whatever is still selected.
    // The board menu's "Unlock all", on its oracle's predicate: nothing selected and
    // something locked (`actionElementLock.ts@1118751f:166-171`).
    ti,
    r0
  ), Qe("cancel", ti, o0), A(t, nr), it();
}
ct(["pointermove", "pointerup", "change", "click"]);
const Ac = 1 << 20, JP = 10 << 20, jv = JP / Ac;
async function Hv(t, e) {
  const n = new Blob([t.slice()]).stream().pipeThrough(e);
  return new Uint8Array(await new Response(n).arrayBuffer());
}
const GP = (t) => Hv(t, new CompressionStream("gzip")), qP = (t) => Hv(t, new DecompressionStream("gzip")), eg = 5, YP = 64 * 1024, Wv = 1, Zv = 2, Kv = 10, Pc = new TextEncoder(), Ic = new TextDecoder(), Ml = /* @__PURE__ */ Symbol("moved"), XP = (t) => t;
function QP(t) {
  if (!("dataUrl" in t)) return t;
  const e = { ...t };
  return delete e.dataUrl, e;
}
const $P = () => new Ft(413, "drawing_too_large", "the drawing is larger than its online copy holds"), Ol = () => new Ft(403, "unreadable", "the online copy does not open with this link's secret"), Vv = (t) => new Ft(502, "bad_response", `the online copy answered with ${t}`);
async function ws(t) {
  const e = await t.json().catch(() => null);
  return new Ft(
    t.status,
    e?.error?.code ?? "http_error",
    e?.error?.message ?? `the online copy answered ${t.status}`
  );
}
function Fl(t) {
  const e = /^"(0|[1-9]\d{0,14})"$/.exec(t ?? "")?.[1];
  if (e === void 0) throw Vv(`the ETag ${String(t)}`);
  return Number(e);
}
function eI(t) {
  const e = Number(t ?? "1");
  if (!Number.isInteger(e) || e < 1 || e > jv)
    throw Vv(`x-parts ${String(t)}`);
  return e;
}
function tg(t) {
  const e = [];
  for (let n = 0; n < t.byteLength; n += Ac)
    e.push(t.slice(n, n + Ac));
  if (e.length > jv) throw $P();
  return e;
}
function Jv(t) {
  const e = new Uint8Array(t.reduce((r, o) => r + o.byteLength, 0));
  let n = 0;
  for (const r of t)
    e.set(r, n), n += r.byteLength;
  return e;
}
function ng(...t) {
  return Jv(t.map((e) => e instanceof Uint8Array ? e : Uint8Array.from(e)));
}
const rg = () => Array.from(
  crypto.getRandomValues(new Uint8Array(16)),
  (t) => t.toString(16).padStart(2, "0")
).join("");
function tI(t) {
  let e;
  try {
    e = atob(t);
  } catch {
    return null;
  }
  const n = new Uint8Array(e.length);
  for (let r = 0; r < e.length; r++) n[r] = e.charCodeAt(r);
  return n;
}
function nI(t) {
  let e = "";
  for (let n = 0; n < t.byteLength; n += 32768)
    e += String.fromCharCode(...t.subarray(n, n + 32768));
  return btoa(e);
}
function rI(t) {
  const e = t.indexOf(","), n = e > 0 ? t.slice(0, e) : "", r = n.endsWith(";base64") ? tI(t.slice(e + 1)) : null;
  return r === null ? ng([Zv], Pc.encode(t)) : ng([Wv], Pc.encode(n), [Kv], r);
}
function oI(t) {
  if (t[0] === Zv) return Ic.decode(t.subarray(1));
  const e = t.indexOf(Kv);
  return t[0] !== Wv || e < 0 ? null : `${Ic.decode(t.subarray(1, e))},${nI(t.subarray(e + 1))}`;
}
function iI(t, ...e) {
  const n = /* @__PURE__ */ new Map();
  for (const { id: r, isDeleted: o } of t) {
    if (o) continue;
    const i = e.map((a) => a.get(r)).find((a) => a !== void 0);
    i !== void 0 && n.set(r, i);
  }
  return n;
}
function sI(t) {
  if (!t || typeof t != "object") return !1;
  const e = t;
  return e.type === "hydrawn-copy" && e.version === 1 && Array.isArray(e.elements) && e.elements.every(
    (n) => n !== null && typeof n == "object" && typeof n.id == "string"
  ) && e.pictures !== null && typeof e.pictures == "object" && Object.values(e.pictures).every((n) => typeof n == "string");
}
function aI(t) {
  return t instanceof Ft ? t.status === 413 ? "too-large" : t.status === 400 || t.status === 403 || t.status === 422 ? "refused" : "retry" : "retry";
}
class lI {
  /** Set while the page is closing: a request of KEEPALIVE_BYTES or less may outlive it. */
  leaving = !1;
  base;
  secret;
  fetch;
  sealing = null;
  token = null;
  /** The copy as last read or written, without pictures; null when it must be read. */
  current = null;
  /** What the store holds as each element's picture, so a save leaves those off. */
  held = new Yc();
  /** Element id → picture id, for every picture this page sent or read. */
  pictureOf = /* @__PURE__ */ new Map();
  /** Picture id → its data URL, for every picture the store is known to hold. */
  stored = /* @__PURE__ */ new Map();
  constructor({ slug: e, secret: n, fetch: r }) {
    this.base = `/store/v1/drawings/${e}`, this.secret = n, this.fetch = r ?? ((o, i) => fetch(o, i));
  }
  /** The copy, pictures in, tombstones kept; null when nothing is stored for the drawing. */
  async read() {
    const e = await this.readScene();
    if (e === null) return null;
    const n = [];
    for (const r of e.elements) {
      const o = e.refs.get(r.id), i = o === void 0 ? void 0 : await this.picture(o);
      o !== void 0 && this.pictureOf.set(r.id, o), n.push(i === void 0 ? r : { ...r, dataUrl: i });
    }
    return this.held.note(n), { rev: e.rev, elements: n };
  }
  /** Merges `patch` — this page's own edits — into the copy, its new pictures sent first. */
  async save(e) {
    const n = [], r = /* @__PURE__ */ new Map();
    for (const i of this.held.strip(e.elements)) {
      const { id: a, isDeleted: l, dataUrl: c } = XP(i);
      if (!l && c !== void 0) {
        const d = await this.sendPicture(c);
        this.pictureOf.set(a, d), r.set(a, d);
      }
      n.push(QP(i));
    }
    let o = 0;
    for (let i = 0; i < eg; i++) {
      const a = this.current ?? await this.readScene() ?? { rev: o, elements: [], refs: /* @__PURE__ */ new Map() }, l = ip(a.elements, n).elements, c = e.order === void 0 ? l : sp(l, e.order), d = iI(c, r, this.pictureOf, a.refs), u = await this.writeScene(await this.seal(c, d), a.rev);
      if (u.landed) {
        this.current = { rev: u.rev, elements: c, refs: d }, this.held.note(e.elements);
        return;
      }
      this.current = null, o = u.rev;
    }
    throw new Ft(503, "busy", "other saves kept landing first; this one waits");
  }
  key() {
    return this.sealing ??= pv(this.secret), this.sealing;
  }
  async headers(e = {}) {
    return this.token ??= J8(this.secret), {
      authorization: `Bearer ${await this.token}`,
      "content-type": "application/octet-stream",
      ...e
    };
  }
  async send(e, n) {
    const r = n.body?.byteLength ?? 0;
    try {
      return await this.fetch(`${this.base}${e}`, {
        ...n,
        keepalive: this.leaving && r <= YP
      });
    } catch {
      throw new Ft(503, "store_unreachable", "the online copy could not be reached");
    }
  }
  /**
   * An item's bytes, every part: part 0 says how many there are. MOVED when a later part
   * is not part 0's write — gone, or another ETag — and null when nothing is stored.
   */
  async readItem(e) {
    const n = await this.send(e, { method: "GET" });
    if (n.status === 404) return null;
    if (!n.ok) throw await ws(n);
    const r = n.headers.get("etag"), o = eI(n.headers.get("x-parts")), i = [new Uint8Array(await n.arrayBuffer())];
    for (let a = 1; a < o; a++) {
      const l = await this.send(`${e}/parts/${a}`, { method: "GET" });
      if (l.status === 404 || l.ok && l.headers.get("etag") !== r) return Ml;
      if (!l.ok) throw await ws(l);
      i.push(new Uint8Array(await l.arrayBuffer()));
    }
    return { bytes: Jv(i), etag: r };
  }
  async readScene() {
    for (let e = 0; e < eg; e++) {
      const n = await this.readItem("");
      if (n === Ml) continue;
      if (n === null) return null;
      const r = Fl(n.etag), o = await this.open(n.bytes), i = { rev: r, elements: o.elements, refs: new Map(Object.entries(o.pictures)) };
      return (this.current === null || r >= this.current.rev) && (this.current = i), i;
    }
    throw new Ft(503, "busy", "the online copy kept changing while it was read");
  }
  async open(e) {
    const n = await Ch(await this.key(), e);
    if (n === null) throw Ol();
    try {
      const r = JSON.parse(Ic.decode(await qP(n)));
      if (sI(r)) return r;
    } catch {
    }
    throw Ol();
  }
  async seal(e, n) {
    const r = {
      type: "hydrawn-copy",
      version: 1,
      elements: e,
      pictures: Object.fromEntries(n)
    };
    return Th(await this.key(), await GP(Pc.encode(JSON.stringify(r))));
  }
  /** Writes the scene on `rev`: landed with its new rev, or beaten by the rev that won. */
  async writeScene(e, n) {
    const r = tg(e), o = { "if-match": String(n) };
    let i = null;
    if (r.length === 1)
      i = await this.send("", {
        method: "PUT",
        headers: await this.headers(o),
        body: r[0]
      });
    else {
      const l = `/staged/${rg()}`, c = { ...o, "x-parts": String(r.length) };
      for (const [d, u] of r.entries()) {
        const f = await this.send(`${l}/parts/${d}`, {
          method: "PUT",
          headers: await this.headers(c),
          body: u
        });
        if (!f.ok) {
          i = f;
          break;
        }
      }
      i ??= await this.send(l, { method: "POST", headers: await this.headers(o) });
    }
    if (i.ok) return { landed: !0, rev: Fl(i.headers.get("etag")) };
    const a = await ws(i);
    if (a.status === 409 && a.code === "conflict")
      return { landed: !1, rev: Fl(i.headers.get("etag")) };
    throw a;
  }
  /** Sends a picture the store does not hold yet, under a fresh upload id; its id. */
  async sendPicture(e) {
    const n = rI(e), r = await G8(this.secret, n);
    if (this.stored.has(r)) return r;
    const o = tg(await Th(await this.key(), n)), i = o.length === 1 ? `/pictures/${r}` : `/pictures/${r}/uploads/${rg()}`, a = o.length === 1 ? {} : { "x-parts": String(o.length) };
    for (const [l, c] of o.entries()) {
      const d = await this.send(o.length === 1 ? i : `${i}/parts/${l}`, {
        method: "PUT",
        headers: await this.headers(a),
        body: c
      });
      if (d.ok) continue;
      const u = await ws(d);
      if (u.status === 409 && u.code === "part_exists") break;
      throw u;
    }
    return this.stored.set(r, e), r;
  }
  /** A stored picture's data URL; undefined when the store has none under `pid`. */
  async picture(e) {
    const n = this.stored.get(e);
    if (n !== void 0) return n;
    const r = await this.readItem(`/pictures/${e}`);
    if (r === null || r === Ml) return;
    const o = await Ch(await this.key(), r.bytes), i = o === null ? null : oI(o);
    if (i === null) throw Ol();
    return this.stored.set(e, i), i;
  }
}
const cI = 2e4;
class uI {
  copy;
  saver;
  readScene;
  slug;
  storage;
  /** Whether the last write had something to write: the mark is about that. */
  wrote = !1;
  constructor(e) {
    this.copy = e.copy, this.readScene = e.readScene, this.slug = e.slug, this.storage = e.storage ?? null, this.saver = new km({
      readScene: e.readScene,
      lookup: e.lookup,
      throttleMs: e.throttleMs ?? cI,
      classify: aI,
      send: async (n) => {
        this.wrote = !0, await this.copy.save(n), Fh(this.storage, this.slug);
      },
      onStatus: (n) => e.onStatus?.(n)
    });
  }
  /** What the copy is known to hold, so the same is not sent again. */
  resetKnown(e) {
    this.saver.tracker.reset(e);
  }
  /**
   * The whole scene, as the drawing's first copy.
   *
   * Written before the drawing's id reaches the relay: the write stores the drawing's
   * write proof, and whoever watched the relay could otherwise claim it first.
   */
  async writeFirstCopy() {
    const e = [...this.readScene()];
    await this.copy.save({ elements: e }), this.resetKnown(e);
  }
  /** This page changed these elements. */
  noteChanged(e) {
    this.saver.tracker.noteChanged(e), this.saver.notify();
  }
  /**
   * This page changed something only a full comparison can find — an undo, a reorder.
   *
   * The whole scene goes then, and it holds what peers sent as well: a full comparison
   * cannot tell the two apart, and the copy merges by element anyway, so the newer stamp
   * of each wins and nothing is lost.
   */
  noteEverything() {
    this.saver.tracker.noteEverything(), this.saver.notify();
  }
  /** The pending edits, written at once: a peer joined, and the copy must have them. */
  async saveNow() {
    await this.saver.flush();
  }
  /** The page is gone: the timer and the retries stop with it. */
  dispose() {
    this.saver.dispose();
  }
  /**
   * The page is leaving: what is left goes out, and the copy may yet lack it.
   *
   * A `keepalive` request only carries 64 KB (`sharing/storedCopy.ts`), and a bigger one
   * is dropped rather than risk the tab's memory — so the mark is left, and the next tab
   * says the last seconds may be missing.
   */
  async leave() {
    this.copy.leaving = !0, this.wrote = !1, await this.saver.flush(), this.wrote ? E7(this.storage, this.slug) : Fh(this.storage, this.slug);
  }
}
function dI(t) {
  let e = null, n = null;
  async function r() {
    e ??= (t.mint ?? N8)(), await t.writeFirstCopy(e), await t.keepSecret(e), t.goLive(e);
    const o = k7(t.origin, t.slug, e);
    return t.replaceState(o), o;
  }
  return {
    start() {
      return n ??= r().catch((o) => {
        throw n = null, o;
      }), n;
    }
  };
}
const fI = 3e3, hI = 1e4;
class gI {
  deps;
  dirty = !1;
  inFlight = !1;
  timer;
  lastAttemptAt = Number.NEGATIVE_INFINITY;
  disposed = !1;
  constructor(e) {
    this.deps = e;
  }
  /** The scene changed: the stored picture is out of date. */
  noteChanged() {
    this.dirty = !0;
  }
  /** Arms the debounce when a save lands; the other transitions mean nothing landed. */
  onStatus(e, n) {
    e === "saving" && n === "idle" && this.schedule();
  }
  /** A board with elements and no picture yet gets one without waiting for an edit. */
  backfill() {
    this.dirty = !0, this.schedule();
  }
  /** For `visibilitychange` to hidden: no debounce, no spacing. */
  async flushNow() {
    this.cancelTimer(), await this.run();
  }
  dispose() {
    this.disposed = !0, this.cancelTimer();
  }
  schedule() {
    if (this.disposed) return;
    this.cancelTimer();
    const e = Math.max(fI, this.lastAttemptAt + hI - this.deps.now());
    this.timer = setTimeout(() => {
      this.timer = void 0, this.run();
    }, e);
  }
  cancelTimer() {
    this.timer !== void 0 && clearTimeout(this.timer), this.timer = void 0;
  }
  async run() {
    if (this.disposed || this.inFlight || !this.dirty) return;
    this.inFlight = !0, this.dirty = !1, this.lastAttemptAt = this.deps.now();
    let e = !1;
    try {
      const n = await this.deps.render();
      if (n === null || n.size > _k) return;
      await this.deps.upload(n);
    } catch (n) {
      e = !0, this.dirty = !0, console.debug("thumbnail upload failed; the next save retries", n);
    } finally {
      this.inFlight = !1, this.dirty && !e && this.schedule();
    }
  }
}
var pI = /* @__PURE__ */ F('<div class="loading-state engine-failed svelte-1dwk0uq"><p role="alert">The drawing engine could not load.</p> <button type="button">Reload</button></div>'), mI = /* @__PURE__ */ F('<div class="loading-state svelte-1dwk0uq"><p>Loading board…</p></div>'), vI = /* @__PURE__ */ F('<div class="board svelte-1dwk0uq"><div class="surface svelte-1dwk0uq"><!></div></div>');
function _I(t, e) {
  ot(e, !0);
  let n = ke(e, "secrets", 3, null), r = ke(e, "browser", 3, !1), o = ke(e, "collaboration", 3, !0), i = ke(e, "title", 15, "Board"), a = ke(e, "readOnly", 3, !1);
  V9({
    get store() {
      return e.store;
    },
    get openBoard() {
      return e.openBoard;
    },
    get galleryHref() {
      return e.galleryHref;
    }
  });
  let l = /* @__PURE__ */ B(void 0), c = /* @__PURE__ */ B("idle"), d = /* @__PURE__ */ B(!1), u = /* @__PURE__ */ B(!1), f = /* @__PURE__ */ B(null), h = /* @__PURE__ */ B("idle"), p = /* @__PURE__ */ B(!1);
  const m = new Sm(), w = () => typeof localStorage > "u" ? void 0 : localStorage, y = dn(() => r() || a()) ? null : new Q9(e4());
  function k(Z) {
    return Z instanceof Ft ? Z.status === 413 ? "too-large" : Z.status === 400 || Z.status === 422 ? "refused" : "retry" : "retry";
  }
  const O = new Yc();
  let C = null, P = !1, S = "idle", T = !1;
  const M = new gI({
    render: async () => C === null ? null : await C.exportThumbnail(),
    upload: (Z) => e.store.putThumbnail(e.slug, Z),
    now: () => Date.now()
  }), H = new km({
    readScene: () => m.elements,
    lookup: m.lookup,
    send: async (Z) => {
      for (const _e of r4({ ...Z, elements: O.strip(Z.elements) }))
        await e.store.patchElements(e.slug, _e);
      O.note(Z.elements);
    },
    onStatus: (Z) => {
      M.onStatus(S, Z), S = Z, _(c, Z, !0);
    },
    classify: k
  });
  let q = null, R = /* @__PURE__ */ B(null);
  function K(Z) {
    q = new lI({ slug: e.slug, secret: Z }), _(
      R,
      new uI({
        slug: e.slug,
        copy: q,
        readScene: () => m.elements,
        lookup: m.lookup,
        storage: w() ?? null,
        onStatus: (_e) => {
          _(h, _e, !0), _(p, Rh(w() ?? null, e.slug), !0);
        }
      }),
      !0
    );
  }
  let ie = null;
  async function ne() {
    return ie ??= dI({
      slug: e.slug,
      origin: window.location.origin,
      writeFirstCopy: async (Z) => {
        K(Z), await s(R)?.writeFirstCopy();
      },
      keepSecret: async (Z) => {
        await n()?.keepSecret(e.slug, Z);
      },
      goLive: (Z) => {
        _(f, Z, !0);
      },
      replaceState: (Z) => {
        history.replaceState(null, "", Z);
      }
    }), ie.start();
  }
  async function $() {
    await s(R)?.saveNow();
  }
  const G = /* @__PURE__ */ X(() => s(R) ? x7(s(h), { unread: s(d), unsent: s(p) }) : null);
  Gt(() => {
    r() && T9(w(), e.slug), (async () => {
      const _e = r() && n() ? await w7(n(), e.slug, window.location.hash) : null;
      _e && (_(f, _e, !0), K(_e));
      const [ve, Le] = await Promise.all([
        W9({
          slug: e.slug,
          browser: r(),
          store: e.store,
          drafts: y,
          storage: w(),
          stored: q,
          now: () => Date.now(),
          nonce: () => Math.floor(Math.random() * 2147483647),
          newTitle: e.newTitle
        }),
        // The engine's loader keeps a rejection, so the engine is not tried again in
        // this page: the failure is the page's to report, not the loader's to retry.
        pm().then(() => !0, () => !1)
      ]);
      if (T) return;
      if (!Le) {
        _(u, !0);
        return;
      }
      const { loaded: Q, elements: de, resave: me } = ve;
      i(ve.title), P = ve.needsThumbnailBackfill, _(d, ve.failure !== null), H.tracker.reset(Q), O.reset(Q), m.replace(de), s(R)?.resetKnown(ve.copied ?? Q), _(l, new hm([...de, ...ve.tombstones]), !0), !a() && (me.length > 0 && (H.tracker.noteChanged(me), H.notify()), ve.copied && (H.tracker.noteEverything(), H.notify()));
    })();
    const Z = () => {
      document.visibilityState === "hidden" && W();
    };
    return document.addEventListener("visibilitychange", Z), () => {
      document.removeEventListener("visibilitychange", Z);
    };
  });
  function W() {
    H.flush(), y?.flush(), M.flushNow(), s(R) && s(R).leave().then(() => {
      _(p, Rh(w() ?? null, e.slug), !0);
    });
  }
  function J() {
    return s(c);
  }
  function E() {
    return H.flush();
  }
  async function L() {
    if (r())
      return (await q?.read())?.elements ?? [];
    const Z = await e.store.get(e.slug, { tombstones: !0 });
    return Gs(JSON.stringify(Z.scene)) ?? [];
  }
  Wi(() => {
    T = !0, H.dispose(), s(R)?.dispose(), M.dispose();
  });
  function V(Z) {
    C = Z, a() && Z.setTool("hand"), !(!P || a()) && (P = !1, M.backfill());
  }
  function ee(Z, _e) {
    if (a()) return;
    M.noteChanged();
    let ve;
    try {
      ve = JSON.parse(Z);
    } catch {
      return;
    }
    if (ge(ve)) {
      const Le = m.apply(ve);
      H.tracker.noteChanged(ve.updated.map((Q) => Q.id)), H.tracker.noteChanged(ve.removed), _e === "local" && (s(R)?.noteChanged(ve.updated.map((Q) => Q.id)), s(R)?.noteChanged(ve.removed)), ve.order ? (H.tracker.noteEverything(), y?.record(e.slug, ve.updated, ve.removed, { order: m.elements.map((Q) => Q.id) })) : y?.record(e.slug, ve.updated, ve.removed, { appended: Le });
    } else {
      const Le = Gs(Z);
      if (Le === null) return;
      const { changed: Q, removed: de } = m.replace(Le, (me, Pe) => me.version === Pe.version && me.versionNonce === Pe.versionNonce);
      H.tracker.noteEverything(), _e === "local" && s(R)?.noteEverything(), y?.record(e.slug, Q, de, { order: m.elements.map((me) => me.id) });
    }
    H.notify();
  }
  const ge = (Z) => typeof Z == "object" && Z !== null && Z.type === "osidraw-delta";
  var re = { flushPending: W, saveStatus: J, flush: E }, se = vI(), xe = z(se), be = z(xe);
  {
    var Me = (Z) => {
      {
        let _e = /* @__PURE__ */ X(() => y7(s(c), s(d)));
        VP(Z, {
          get scene() {
            return s(l);
          },
          get title() {
            return i();
          },
          get slug() {
            return e.slug;
          },
          get status() {
            return s(_e);
          },
          onSceneChange: ee,
          onReady: V,
          fetchLatest: L,
          get browser() {
            return r();
          },
          get collaboration() {
            return o();
          },
          get theme() {
            return e.theme;
          },
          get themeRoot() {
            return e.themeRoot;
          },
          get roomSecret() {
            return s(f);
          },
          onShareLive: ne,
          onPeerJoined: $,
          get shared() {
            return s(G);
          },
          ariaLabel: "Board canvas"
        });
      }
    }, Re = (Z) => {
      var _e = pI(), ve = b(z(_e), 2);
      I("click", ve, () => location.reload()), A(Z, _e);
    }, Se = (Z) => {
      var _e = mI();
      A(Z, _e);
    };
    j(be, (Z) => {
      s(l) !== void 0 ? Z(Me) : s(u) ? Z(Re, 1) : Z(Se, -1);
    });
  }
  return A(t, se), it(re);
}
ct(["click"]);
const Gv = "hydrawn-board";
let og = null;
function yI(t) {
  return t === void 0 ? Promise.resolve() : (og ??= dm({ module_or_path: t }), og);
}
function bI(t, e) {
  const n = document.createElement("div");
  n.className = Gv, t.append(n);
  const r = ft({
    store: e.store,
    slug: e.slug,
    newTitle: e.title,
    title: e.title ?? "Board",
    theme: e.theme,
    themeRoot: n,
    readOnly: e.readOnly ?? !1,
    browser: !1,
    collaboration: !1
  });
  let o = null, i = !1;
  const a = yI(e.engineUrl).catch(() => {
  }).then(() => {
    i || (o = w3(_I, { target: n, props: r }));
  });
  return {
    setTheme(l) {
      r.theme = l;
    },
    async destroy() {
      i || (i = !0, await a, o !== null && (o.flushPending(), await S3(o, { outro: !1 }), o = null), n.remove());
    }
  };
}
const SI = Gv, xI = bI, EI = Ft, TI = cp, CI = Kk;
export {
  SI as BOARD_ROOT_CLASS,
  EI as BoardStoreError,
  CI as boardCss,
  TI as createHostedStore,
  xI as mountBoard
};
