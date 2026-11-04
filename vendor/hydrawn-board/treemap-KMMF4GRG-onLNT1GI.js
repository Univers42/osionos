import { m as st, f as Ed, d as $d } from "./min-siJ17h_Z.js";
import { b as xd, l as Sd, c as kd, m as Id, r as co, n as ns } from "./_baseUniq-Ctt22pB8.js";
import { b8 as Cd } from "./index-Bx7N355m.js";
function wd(t, e) {
  return xd(st(t, e));
}
function Nd(t, e) {
  return t && t.length ? Sd(t, kd(e)) : [];
}
function le(t) {
  return typeof t == "object" && t !== null && typeof t.$type == "string";
}
function ze(t) {
  return typeof t == "object" && t !== null && typeof t.$refText == "string";
}
function _d(t) {
  return typeof t == "object" && t !== null && typeof t.name == "string" && typeof t.type == "string" && typeof t.path == "string";
}
function jr(t) {
  return typeof t == "object" && t !== null && le(t.container) && ze(t.reference) && typeof t.message == "string";
}
class qu {
  constructor() {
    this.subtypes = {}, this.allSubtypes = {};
  }
  isInstance(e, n) {
    return le(e) && this.isSubtype(e.$type, n);
  }
  isSubtype(e, n) {
    if (e === n)
      return !0;
    let r = this.subtypes[e];
    r || (r = this.subtypes[e] = {});
    const i = r[n];
    if (i !== void 0)
      return i;
    {
      const s = this.computeIsSubtype(e, n);
      return r[n] = s, s;
    }
  }
  getAllSubTypes(e) {
    const n = this.allSubtypes[e];
    if (n)
      return n;
    {
      const r = this.getAllTypes(), i = [];
      for (const s of r)
        this.isSubtype(s, e) && i.push(s);
      return this.allSubtypes[e] = i, i;
    }
  }
}
function er(t) {
  return typeof t == "object" && t !== null && Array.isArray(t.content);
}
function Yu(t) {
  return typeof t == "object" && t !== null && typeof t.tokenType == "object";
}
function Xu(t) {
  return er(t) && typeof t.fullText == "string";
}
class ne {
  constructor(e, n) {
    this.startFn = e, this.nextFn = n;
  }
  iterator() {
    const e = {
      state: this.startFn(),
      next: () => this.nextFn(e.state),
      [Symbol.iterator]: () => e
    };
    return e;
  }
  [Symbol.iterator]() {
    return this.iterator();
  }
  isEmpty() {
    return !!this.iterator().next().done;
  }
  count() {
    const e = this.iterator();
    let n = 0, r = e.next();
    for (; !r.done; )
      n++, r = e.next();
    return n;
  }
  toArray() {
    const e = [], n = this.iterator();
    let r;
    do
      r = n.next(), r.value !== void 0 && e.push(r.value);
    while (!r.done);
    return e;
  }
  toSet() {
    return new Set(this);
  }
  toMap(e, n) {
    const r = this.map((i) => [
      e ? e(i) : i,
      n ? n(i) : i
    ]);
    return new Map(r);
  }
  toString() {
    return this.join();
  }
  concat(e) {
    return new ne(() => ({ first: this.startFn(), firstDone: !1, iterator: e[Symbol.iterator]() }), (n) => {
      let r;
      if (!n.firstDone) {
        do
          if (r = this.nextFn(n.first), !r.done)
            return r;
        while (!r.done);
        n.firstDone = !0;
      }
      do
        if (r = n.iterator.next(), !r.done)
          return r;
      while (!r.done);
      return Ae;
    });
  }
  join(e = ",") {
    const n = this.iterator();
    let r = "", i, s = !1;
    do
      i = n.next(), i.done || (s && (r += e), r += bd(i.value)), s = !0;
    while (!i.done);
    return r;
  }
  indexOf(e, n = 0) {
    const r = this.iterator();
    let i = 0, s = r.next();
    for (; !s.done; ) {
      if (i >= n && s.value === e)
        return i;
      s = r.next(), i++;
    }
    return -1;
  }
  every(e) {
    const n = this.iterator();
    let r = n.next();
    for (; !r.done; ) {
      if (!e(r.value))
        return !1;
      r = n.next();
    }
    return !0;
  }
  some(e) {
    const n = this.iterator();
    let r = n.next();
    for (; !r.done; ) {
      if (e(r.value))
        return !0;
      r = n.next();
    }
    return !1;
  }
  forEach(e) {
    const n = this.iterator();
    let r = 0, i = n.next();
    for (; !i.done; )
      e(i.value, r), i = n.next(), r++;
  }
  map(e) {
    return new ne(this.startFn, (n) => {
      const { done: r, value: i } = this.nextFn(n);
      return r ? Ae : { done: !1, value: e(i) };
    });
  }
  filter(e) {
    return new ne(this.startFn, (n) => {
      let r;
      do
        if (r = this.nextFn(n), !r.done && e(r.value))
          return r;
      while (!r.done);
      return Ae;
    });
  }
  nonNullable() {
    return this.filter((e) => e != null);
  }
  reduce(e, n) {
    const r = this.iterator();
    let i = n, s = r.next();
    for (; !s.done; )
      i === void 0 ? i = s.value : i = e(i, s.value), s = r.next();
    return i;
  }
  reduceRight(e, n) {
    return this.recursiveReduce(this.iterator(), e, n);
  }
  recursiveReduce(e, n, r) {
    const i = e.next();
    if (i.done)
      return r;
    const s = this.recursiveReduce(e, n, r);
    return s === void 0 ? i.value : n(s, i.value);
  }
  find(e) {
    const n = this.iterator();
    let r = n.next();
    for (; !r.done; ) {
      if (e(r.value))
        return r.value;
      r = n.next();
    }
  }
  findIndex(e) {
    const n = this.iterator();
    let r = 0, i = n.next();
    for (; !i.done; ) {
      if (e(i.value))
        return r;
      i = n.next(), r++;
    }
    return -1;
  }
  includes(e) {
    const n = this.iterator();
    let r = n.next();
    for (; !r.done; ) {
      if (r.value === e)
        return !0;
      r = n.next();
    }
    return !1;
  }
  flatMap(e) {
    return new ne(() => ({ this: this.startFn() }), (n) => {
      do {
        if (n.iterator) {
          const s = n.iterator.next();
          if (s.done)
            n.iterator = void 0;
          else
            return s;
        }
        const { done: r, value: i } = this.nextFn(n.this);
        if (!r) {
          const s = e(i);
          if (ii(s))
            n.iterator = s[Symbol.iterator]();
          else
            return { done: !1, value: s };
        }
      } while (n.iterator);
      return Ae;
    });
  }
  flat(e) {
    if (e === void 0 && (e = 1), e <= 0)
      return this;
    const n = e > 1 ? this.flat(e - 1) : this;
    return new ne(() => ({ this: n.startFn() }), (r) => {
      do {
        if (r.iterator) {
          const a = r.iterator.next();
          if (a.done)
            r.iterator = void 0;
          else
            return a;
        }
        const { done: i, value: s } = n.nextFn(r.this);
        if (!i)
          if (ii(s))
            r.iterator = s[Symbol.iterator]();
          else
            return { done: !1, value: s };
      } while (r.iterator);
      return Ae;
    });
  }
  head() {
    const n = this.iterator().next();
    if (!n.done)
      return n.value;
  }
  tail(e = 1) {
    return new ne(() => {
      const n = this.startFn();
      for (let r = 0; r < e; r++)
        if (this.nextFn(n).done)
          return n;
      return n;
    }, this.nextFn);
  }
  limit(e) {
    return new ne(() => ({ size: 0, state: this.startFn() }), (n) => (n.size++, n.size > e ? Ae : this.nextFn(n.state)));
  }
  distinct(e) {
    return new ne(() => ({ set: /* @__PURE__ */ new Set(), internalState: this.startFn() }), (n) => {
      let r;
      do
        if (r = this.nextFn(n.internalState), !r.done) {
          const i = e ? e(r.value) : r.value;
          if (!n.set.has(i))
            return n.set.add(i), r;
        }
      while (!r.done);
      return Ae;
    });
  }
  exclude(e, n) {
    const r = /* @__PURE__ */ new Set();
    for (const i of e) {
      const s = n ? n(i) : i;
      r.add(s);
    }
    return this.filter((i) => {
      const s = n ? n(i) : i;
      return !r.has(s);
    });
  }
}
function bd(t) {
  return typeof t == "string" ? t : typeof t > "u" ? "undefined" : typeof t.toString == "function" ? t.toString() : Object.prototype.toString.call(t);
}
function ii(t) {
  return !!t && typeof t[Symbol.iterator] == "function";
}
const Od = new ne(() => {
}, () => Ae), Ae = Object.freeze({ done: !0, value: void 0 });
function re(...t) {
  if (t.length === 1) {
    const e = t[0];
    if (e instanceof ne)
      return e;
    if (ii(e))
      return new ne(() => e[Symbol.iterator](), (n) => n.next());
    if (typeof e.length == "number")
      return new ne(() => ({ index: 0 }), (n) => n.index < e.length ? { done: !1, value: e[n.index++] } : Ae);
  }
  return t.length > 1 ? new ne(() => ({ collIndex: 0, arrIndex: 0 }), (e) => {
    do {
      if (e.iterator) {
        const n = e.iterator.next();
        if (!n.done)
          return n;
        e.iterator = void 0;
      }
      if (e.array) {
        if (e.arrIndex < e.array.length)
          return { done: !1, value: e.array[e.arrIndex++] };
        e.array = void 0, e.arrIndex = 0;
      }
      if (e.collIndex < t.length) {
        const n = t[e.collIndex++];
        ii(n) ? e.iterator = n[Symbol.iterator]() : n && typeof n.length == "number" && (e.array = n);
      }
    } while (e.iterator || e.array || e.collIndex < t.length);
    return Ae;
  }) : Od;
}
class Ra extends ne {
  constructor(e, n, r) {
    super(() => ({
      iterators: r?.includeRoot ? [[e][Symbol.iterator]()] : [n(e)[Symbol.iterator]()],
      pruned: !1
    }), (i) => {
      for (i.pruned && (i.iterators.pop(), i.pruned = !1); i.iterators.length > 0; ) {
        const a = i.iterators[i.iterators.length - 1].next();
        if (a.done)
          i.iterators.pop();
        else
          return i.iterators.push(n(a.value)[Symbol.iterator]()), a;
      }
      return Ae;
    });
  }
  iterator() {
    const e = {
      state: this.startFn(),
      next: () => this.nextFn(e.state),
      prune: () => {
        e.state.pruned = !0;
      },
      [Symbol.iterator]: () => e
    };
    return e;
  }
}
var Ls;
(function(t) {
  function e(s) {
    return s.reduce((a, o) => a + o, 0);
  }
  t.sum = e;
  function n(s) {
    return s.reduce((a, o) => a * o, 0);
  }
  t.product = n;
  function r(s) {
    return s.reduce((a, o) => Math.min(a, o));
  }
  t.min = r;
  function i(s) {
    return s.reduce((a, o) => Math.max(a, o));
  }
  t.max = i;
})(Ls || (Ls = {}));
function Ps(t) {
  return new Ra(t, (e) => er(e) ? e.content : [], { includeRoot: !0 });
}
function Ld(t, e) {
  for (; t.container; )
    if (t = t.container, t === e)
      return !0;
  return !1;
}
function Ms(t) {
  return {
    start: {
      character: t.startColumn - 1,
      line: t.startLine - 1
    },
    end: {
      character: t.endColumn,
      // endColumn uses the correct index
      line: t.endLine - 1
    }
  };
}
function si(t) {
  if (!t)
    return;
  const { offset: e, end: n, range: r } = t;
  return {
    range: r,
    offset: e,
    end: n,
    length: n - e
  };
}
var rt;
(function(t) {
  t[t.Before = 0] = "Before", t[t.After = 1] = "After", t[t.OverlapFront = 2] = "OverlapFront", t[t.OverlapBack = 3] = "OverlapBack", t[t.Inside = 4] = "Inside", t[t.Outside = 5] = "Outside";
})(rt || (rt = {}));
function Pd(t, e) {
  if (t.end.line < e.start.line || t.end.line === e.start.line && t.end.character <= e.start.character)
    return rt.Before;
  if (t.start.line > e.end.line || t.start.line === e.end.line && t.start.character >= e.end.character)
    return rt.After;
  const n = t.start.line > e.start.line || t.start.line === e.start.line && t.start.character >= e.start.character, r = t.end.line < e.end.line || t.end.line === e.end.line && t.end.character <= e.end.character;
  return n && r ? rt.Inside : n ? rt.OverlapBack : r ? rt.OverlapFront : rt.Outside;
}
function Md(t, e) {
  return Pd(t, e) > rt.After;
}
const Dd = /^[\w\p{L}]$/u;
function Fd(t, e) {
  if (t) {
    const n = Gd(t, !0);
    if (n && fo(n, e))
      return n;
    if (Xu(t)) {
      const r = t.content.findIndex((i) => !i.hidden);
      for (let i = r - 1; i >= 0; i--) {
        const s = t.content[i];
        if (fo(s, e))
          return s;
      }
    }
  }
}
function fo(t, e) {
  return Yu(t) && e.includes(t.tokenType.name);
}
function Gd(t, e = !0) {
  for (; t.container; ) {
    const n = t.container;
    let r = n.content.indexOf(t);
    for (; r > 0; ) {
      r--;
      const i = n.content[r];
      if (e || !i.hidden)
        return i;
    }
    t = n;
  }
}
class Ju extends Error {
  constructor(e, n) {
    super(e ? `${n} at ${e.range.start.line}:${e.range.start.character}` : n);
  }
}
function or(t) {
  throw new Error("Error! The input value was not handled.");
}
const vr = "AbstractRule", Rr = "AbstractType", rs = "Condition", ho = "TypeDefinition", is = "ValueLiteral", gn = "AbstractElement";
function Ud(t) {
  return F.isInstance(t, gn);
}
const Ar = "ArrayLiteral", Er = "ArrayType", yn = "BooleanLiteral";
function Bd(t) {
  return F.isInstance(t, yn);
}
const Tn = "Conjunction";
function jd(t) {
  return F.isInstance(t, Tn);
}
const vn = "Disjunction";
function Kd(t) {
  return F.isInstance(t, vn);
}
const $r = "Grammar", ss = "GrammarImport", Rn = "InferredType";
function Zu(t) {
  return F.isInstance(t, Rn);
}
const An = "Interface";
function Qu(t) {
  return F.isInstance(t, An);
}
const as = "NamedArgument", En = "Negation";
function Hd(t) {
  return F.isInstance(t, En);
}
const xr = "NumberLiteral", Sr = "Parameter", $n = "ParameterReference";
function Vd(t) {
  return F.isInstance(t, $n);
}
const xn = "ParserRule";
function _e(t) {
  return F.isInstance(t, xn);
}
const kr = "ReferenceType", Kr = "ReturnType";
function Wd(t) {
  return F.isInstance(t, Kr);
}
const Sn = "SimpleType";
function zd(t) {
  return F.isInstance(t, Sn);
}
const Ir = "StringLiteral", qt = "TerminalRule";
function Gt(t) {
  return F.isInstance(t, qt);
}
const kn = "Type";
function ec(t) {
  return F.isInstance(t, kn);
}
const os = "TypeAttribute", Cr = "UnionType", In = "Action";
function wi(t) {
  return F.isInstance(t, In);
}
const Cn = "Alternatives";
function tc(t) {
  return F.isInstance(t, Cn);
}
const wn = "Assignment";
function bt(t) {
  return F.isInstance(t, wn);
}
const Nn = "CharacterRange";
function qd(t) {
  return F.isInstance(t, Nn);
}
const _n = "CrossReference";
function Aa(t) {
  return F.isInstance(t, _n);
}
const bn = "EndOfFile";
function Yd(t) {
  return F.isInstance(t, bn);
}
const On = "Group";
function Ea(t) {
  return F.isInstance(t, On);
}
const Ln = "Keyword";
function Ot(t) {
  return F.isInstance(t, Ln);
}
const Pn = "NegatedToken";
function Xd(t) {
  return F.isInstance(t, Pn);
}
const Mn = "RegexToken";
function Jd(t) {
  return F.isInstance(t, Mn);
}
const Dn = "RuleCall";
function Lt(t) {
  return F.isInstance(t, Dn);
}
const Fn = "TerminalAlternatives";
function Zd(t) {
  return F.isInstance(t, Fn);
}
const Gn = "TerminalGroup";
function Qd(t) {
  return F.isInstance(t, Gn);
}
const Un = "TerminalRuleCall";
function eh(t) {
  return F.isInstance(t, Un);
}
const Bn = "UnorderedGroup";
function nc(t) {
  return F.isInstance(t, Bn);
}
const jn = "UntilToken";
function th(t) {
  return F.isInstance(t, jn);
}
const Kn = "Wildcard";
function nh(t) {
  return F.isInstance(t, Kn);
}
class rc extends qu {
  getAllTypes() {
    return [gn, vr, Rr, In, Cn, Ar, Er, wn, yn, Nn, rs, Tn, _n, vn, bn, $r, ss, On, Rn, An, Ln, as, Pn, En, xr, Sr, $n, xn, kr, Mn, Kr, Dn, Sn, Ir, Fn, Gn, qt, Un, kn, os, ho, Cr, Bn, jn, is, Kn];
  }
  computeIsSubtype(e, n) {
    switch (e) {
      case In:
      case Cn:
      case wn:
      case Nn:
      case _n:
      case bn:
      case On:
      case Ln:
      case Pn:
      case Mn:
      case Dn:
      case Fn:
      case Gn:
      case Un:
      case Bn:
      case jn:
      case Kn:
        return this.isSubtype(gn, n);
      case Ar:
      case xr:
      case Ir:
        return this.isSubtype(is, n);
      case Er:
      case kr:
      case Sn:
      case Cr:
        return this.isSubtype(ho, n);
      case yn:
        return this.isSubtype(rs, n) || this.isSubtype(is, n);
      case Tn:
      case vn:
      case En:
      case $n:
        return this.isSubtype(rs, n);
      case Rn:
      case An:
      case kn:
        return this.isSubtype(Rr, n);
      case xn:
        return this.isSubtype(vr, n) || this.isSubtype(Rr, n);
      case qt:
        return this.isSubtype(vr, n);
      default:
        return !1;
    }
  }
  getReferenceType(e) {
    const n = `${e.container.$type}:${e.property}`;
    switch (n) {
      case "Action:type":
      case "CrossReference:type":
      case "Interface:superTypes":
      case "ParserRule:returnType":
      case "SimpleType:typeRef":
        return Rr;
      case "Grammar:hiddenTokens":
      case "ParserRule:hiddenTokens":
      case "RuleCall:rule":
        return vr;
      case "Grammar:usedGrammars":
        return $r;
      case "NamedArgument:parameter":
      case "ParameterReference:parameter":
        return Sr;
      case "TerminalRuleCall:rule":
        return qt;
      default:
        throw new Error(`${n} is not a valid reference id.`);
    }
  }
  getTypeMetaData(e) {
    switch (e) {
      case gn:
        return {
          name: gn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" }
          ]
        };
      case Ar:
        return {
          name: Ar,
          properties: [
            { name: "elements", defaultValue: [] }
          ]
        };
      case Er:
        return {
          name: Er,
          properties: [
            { name: "elementType" }
          ]
        };
      case yn:
        return {
          name: yn,
          properties: [
            { name: "true", defaultValue: !1 }
          ]
        };
      case Tn:
        return {
          name: Tn,
          properties: [
            { name: "left" },
            { name: "right" }
          ]
        };
      case vn:
        return {
          name: vn,
          properties: [
            { name: "left" },
            { name: "right" }
          ]
        };
      case $r:
        return {
          name: $r,
          properties: [
            { name: "definesHiddenTokens", defaultValue: !1 },
            { name: "hiddenTokens", defaultValue: [] },
            { name: "imports", defaultValue: [] },
            { name: "interfaces", defaultValue: [] },
            { name: "isDeclared", defaultValue: !1 },
            { name: "name" },
            { name: "rules", defaultValue: [] },
            { name: "types", defaultValue: [] },
            { name: "usedGrammars", defaultValue: [] }
          ]
        };
      case ss:
        return {
          name: ss,
          properties: [
            { name: "path" }
          ]
        };
      case Rn:
        return {
          name: Rn,
          properties: [
            { name: "name" }
          ]
        };
      case An:
        return {
          name: An,
          properties: [
            { name: "attributes", defaultValue: [] },
            { name: "name" },
            { name: "superTypes", defaultValue: [] }
          ]
        };
      case as:
        return {
          name: as,
          properties: [
            { name: "calledByName", defaultValue: !1 },
            { name: "parameter" },
            { name: "value" }
          ]
        };
      case En:
        return {
          name: En,
          properties: [
            { name: "value" }
          ]
        };
      case xr:
        return {
          name: xr,
          properties: [
            { name: "value" }
          ]
        };
      case Sr:
        return {
          name: Sr,
          properties: [
            { name: "name" }
          ]
        };
      case $n:
        return {
          name: $n,
          properties: [
            { name: "parameter" }
          ]
        };
      case xn:
        return {
          name: xn,
          properties: [
            { name: "dataType" },
            { name: "definesHiddenTokens", defaultValue: !1 },
            { name: "definition" },
            { name: "entry", defaultValue: !1 },
            { name: "fragment", defaultValue: !1 },
            { name: "hiddenTokens", defaultValue: [] },
            { name: "inferredType" },
            { name: "name" },
            { name: "parameters", defaultValue: [] },
            { name: "returnType" },
            { name: "wildcard", defaultValue: !1 }
          ]
        };
      case kr:
        return {
          name: kr,
          properties: [
            { name: "referenceType" }
          ]
        };
      case Kr:
        return {
          name: Kr,
          properties: [
            { name: "name" }
          ]
        };
      case Sn:
        return {
          name: Sn,
          properties: [
            { name: "primitiveType" },
            { name: "stringType" },
            { name: "typeRef" }
          ]
        };
      case Ir:
        return {
          name: Ir,
          properties: [
            { name: "value" }
          ]
        };
      case qt:
        return {
          name: qt,
          properties: [
            { name: "definition" },
            { name: "fragment", defaultValue: !1 },
            { name: "hidden", defaultValue: !1 },
            { name: "name" },
            { name: "type" }
          ]
        };
      case kn:
        return {
          name: kn,
          properties: [
            { name: "name" },
            { name: "type" }
          ]
        };
      case os:
        return {
          name: os,
          properties: [
            { name: "defaultValue" },
            { name: "isOptional", defaultValue: !1 },
            { name: "name" },
            { name: "type" }
          ]
        };
      case Cr:
        return {
          name: Cr,
          properties: [
            { name: "types", defaultValue: [] }
          ]
        };
      case In:
        return {
          name: In,
          properties: [
            { name: "cardinality" },
            { name: "feature" },
            { name: "inferredType" },
            { name: "lookahead" },
            { name: "operator" },
            { name: "type" }
          ]
        };
      case Cn:
        return {
          name: Cn,
          properties: [
            { name: "cardinality" },
            { name: "elements", defaultValue: [] },
            { name: "lookahead" }
          ]
        };
      case wn:
        return {
          name: wn,
          properties: [
            { name: "cardinality" },
            { name: "feature" },
            { name: "lookahead" },
            { name: "operator" },
            { name: "terminal" }
          ]
        };
      case Nn:
        return {
          name: Nn,
          properties: [
            { name: "cardinality" },
            { name: "left" },
            { name: "lookahead" },
            { name: "right" }
          ]
        };
      case _n:
        return {
          name: _n,
          properties: [
            { name: "cardinality" },
            { name: "deprecatedSyntax", defaultValue: !1 },
            { name: "lookahead" },
            { name: "terminal" },
            { name: "type" }
          ]
        };
      case bn:
        return {
          name: bn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" }
          ]
        };
      case On:
        return {
          name: On,
          properties: [
            { name: "cardinality" },
            { name: "elements", defaultValue: [] },
            { name: "guardCondition" },
            { name: "lookahead" }
          ]
        };
      case Ln:
        return {
          name: Ln,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "value" }
          ]
        };
      case Pn:
        return {
          name: Pn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "terminal" }
          ]
        };
      case Mn:
        return {
          name: Mn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "regex" }
          ]
        };
      case Dn:
        return {
          name: Dn,
          properties: [
            { name: "arguments", defaultValue: [] },
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "rule" }
          ]
        };
      case Fn:
        return {
          name: Fn,
          properties: [
            { name: "cardinality" },
            { name: "elements", defaultValue: [] },
            { name: "lookahead" }
          ]
        };
      case Gn:
        return {
          name: Gn,
          properties: [
            { name: "cardinality" },
            { name: "elements", defaultValue: [] },
            { name: "lookahead" }
          ]
        };
      case Un:
        return {
          name: Un,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "rule" }
          ]
        };
      case Bn:
        return {
          name: Bn,
          properties: [
            { name: "cardinality" },
            { name: "elements", defaultValue: [] },
            { name: "lookahead" }
          ]
        };
      case jn:
        return {
          name: jn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" },
            { name: "terminal" }
          ]
        };
      case Kn:
        return {
          name: Kn,
          properties: [
            { name: "cardinality" },
            { name: "lookahead" }
          ]
        };
      default:
        return {
          name: e,
          properties: []
        };
    }
  }
}
const F = new rc();
function rh(t) {
  for (const [e, n] of Object.entries(t))
    e.startsWith("$") || (Array.isArray(n) ? n.forEach((r, i) => {
      le(r) && (r.$container = t, r.$containerProperty = e, r.$containerIndex = i);
    }) : le(n) && (n.$container = t, n.$containerProperty = e));
}
function Ni(t, e) {
  let n = t;
  for (; n; ) {
    if (e(n))
      return n;
    n = n.$container;
  }
}
function pt(t) {
  const n = Ds(t).$document;
  if (!n)
    throw new Error("AST node has no document.");
  return n;
}
function Ds(t) {
  for (; t.$container; )
    t = t.$container;
  return t;
}
function $a(t, e) {
  if (!t)
    throw new Error("Node must be an AstNode.");
  const n = e?.range;
  return new ne(() => ({
    keys: Object.keys(t),
    keyIndex: 0,
    arrayIndex: 0
  }), (r) => {
    for (; r.keyIndex < r.keys.length; ) {
      const i = r.keys[r.keyIndex];
      if (!i.startsWith("$")) {
        const s = t[i];
        if (le(s)) {
          if (r.keyIndex++, po(s, n))
            return { done: !1, value: s };
        } else if (Array.isArray(s)) {
          for (; r.arrayIndex < s.length; ) {
            const a = r.arrayIndex++, o = s[a];
            if (le(o) && po(o, n))
              return { done: !1, value: o };
          }
          r.arrayIndex = 0;
        }
      }
      r.keyIndex++;
    }
    return Ae;
  });
}
function lr(t, e) {
  if (!t)
    throw new Error("Root node must be an AstNode.");
  return new Ra(t, (n) => $a(n, e));
}
function Xt(t, e) {
  if (!t)
    throw new Error("Root node must be an AstNode.");
  return new Ra(t, (n) => $a(n, e), { includeRoot: !0 });
}
function po(t, e) {
  var n;
  if (!e)
    return !0;
  const r = (n = t.$cstNode) === null || n === void 0 ? void 0 : n.range;
  return r ? Md(r, e) : !1;
}
function ic(t) {
  return new ne(() => ({
    keys: Object.keys(t),
    keyIndex: 0,
    arrayIndex: 0
  }), (e) => {
    for (; e.keyIndex < e.keys.length; ) {
      const n = e.keys[e.keyIndex];
      if (!n.startsWith("$")) {
        const r = t[n];
        if (ze(r))
          return e.keyIndex++, { done: !1, value: { reference: r, container: t, property: n } };
        if (Array.isArray(r)) {
          for (; e.arrayIndex < r.length; ) {
            const i = e.arrayIndex++, s = r[i];
            if (ze(s))
              return { done: !1, value: { reference: s, container: t, property: n, index: i } };
          }
          e.arrayIndex = 0;
        }
      }
      e.keyIndex++;
    }
    return Ae;
  });
}
function ih(t, e) {
  const n = t.getTypeMetaData(e.$type), r = e;
  for (const i of n.properties)
    i.defaultValue !== void 0 && r[i.name] === void 0 && (r[i.name] = sc(i.defaultValue));
}
function sc(t) {
  return Array.isArray(t) ? [...t.map(sc)] : t;
}
function N(t) {
  return t.charCodeAt(0);
}
function ls(t, e) {
  Array.isArray(t) ? t.forEach(function(n) {
    e.push(n);
  }) : e.push(t);
}
function dn(t, e) {
  if (t[e] === !0)
    throw "duplicate flag " + e;
  t[e], t[e] = !0;
}
function zt(t) {
  if (t === void 0)
    throw Error("Internal Error - Should never get here!");
  return !0;
}
function sh() {
  throw Error("Internal Error - Should never get here!");
}
function mo(t) {
  return t.type === "Character";
}
const ai = [];
for (let t = N("0"); t <= N("9"); t++)
  ai.push(t);
const oi = [N("_")].concat(ai);
for (let t = N("a"); t <= N("z"); t++)
  oi.push(t);
for (let t = N("A"); t <= N("Z"); t++)
  oi.push(t);
const go = [
  N(" "),
  N("\f"),
  N(`
`),
  N("\r"),
  N("	"),
  N("\v"),
  N("	"),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N(" "),
  N("\u2028"),
  N("\u2029"),
  N(" "),
  N(" "),
  N("　"),
  N("\uFEFF")
], ah = /[0-9a-fA-F]/, wr = /[0-9]/, oh = /[1-9]/;
class ac {
  constructor() {
    this.idx = 0, this.input = "", this.groupIdx = 0;
  }
  saveState() {
    return {
      idx: this.idx,
      input: this.input,
      groupIdx: this.groupIdx
    };
  }
  restoreState(e) {
    this.idx = e.idx, this.input = e.input, this.groupIdx = e.groupIdx;
  }
  pattern(e) {
    this.idx = 0, this.input = e, this.groupIdx = 0, this.consumeChar("/");
    const n = this.disjunction();
    this.consumeChar("/");
    const r = {
      type: "Flags",
      loc: { begin: this.idx, end: e.length },
      global: !1,
      ignoreCase: !1,
      multiLine: !1,
      unicode: !1,
      sticky: !1
    };
    for (; this.isRegExpFlag(); )
      switch (this.popChar()) {
        case "g":
          dn(r, "global");
          break;
        case "i":
          dn(r, "ignoreCase");
          break;
        case "m":
          dn(r, "multiLine");
          break;
        case "u":
          dn(r, "unicode");
          break;
        case "y":
          dn(r, "sticky");
          break;
      }
    if (this.idx !== this.input.length)
      throw Error("Redundant input: " + this.input.substring(this.idx));
    return {
      type: "Pattern",
      flags: r,
      value: n,
      loc: this.loc(0)
    };
  }
  disjunction() {
    const e = [], n = this.idx;
    for (e.push(this.alternative()); this.peekChar() === "|"; )
      this.consumeChar("|"), e.push(this.alternative());
    return { type: "Disjunction", value: e, loc: this.loc(n) };
  }
  alternative() {
    const e = [], n = this.idx;
    for (; this.isTerm(); )
      e.push(this.term());
    return { type: "Alternative", value: e, loc: this.loc(n) };
  }
  term() {
    return this.isAssertion() ? this.assertion() : this.atom();
  }
  assertion() {
    const e = this.idx;
    switch (this.popChar()) {
      case "^":
        return {
          type: "StartAnchor",
          loc: this.loc(e)
        };
      case "$":
        return { type: "EndAnchor", loc: this.loc(e) };
      // '\b' or '\B'
      case "\\":
        switch (this.popChar()) {
          case "b":
            return {
              type: "WordBoundary",
              loc: this.loc(e)
            };
          case "B":
            return {
              type: "NonWordBoundary",
              loc: this.loc(e)
            };
        }
        throw Error("Invalid Assertion Escape");
      // '(?=' or '(?!'
      case "(":
        this.consumeChar("?");
        let n;
        switch (this.popChar()) {
          case "=":
            n = "Lookahead";
            break;
          case "!":
            n = "NegativeLookahead";
            break;
        }
        zt(n);
        const r = this.disjunction();
        return this.consumeChar(")"), {
          type: n,
          value: r,
          loc: this.loc(e)
        };
    }
    return sh();
  }
  quantifier(e = !1) {
    let n;
    const r = this.idx;
    switch (this.popChar()) {
      case "*":
        n = {
          atLeast: 0,
          atMost: 1 / 0
        };
        break;
      case "+":
        n = {
          atLeast: 1,
          atMost: 1 / 0
        };
        break;
      case "?":
        n = {
          atLeast: 0,
          atMost: 1
        };
        break;
      case "{":
        const i = this.integerIncludingZero();
        switch (this.popChar()) {
          case "}":
            n = {
              atLeast: i,
              atMost: i
            };
            break;
          case ",":
            let s;
            this.isDigit() ? (s = this.integerIncludingZero(), n = {
              atLeast: i,
              atMost: s
            }) : n = {
              atLeast: i,
              atMost: 1 / 0
            }, this.consumeChar("}");
            break;
        }
        if (e === !0 && n === void 0)
          return;
        zt(n);
        break;
    }
    if (!(e === !0 && n === void 0) && zt(n))
      return this.peekChar(0) === "?" ? (this.consumeChar("?"), n.greedy = !1) : n.greedy = !0, n.type = "Quantifier", n.loc = this.loc(r), n;
  }
  atom() {
    let e;
    const n = this.idx;
    switch (this.peekChar()) {
      case ".":
        e = this.dotAll();
        break;
      case "\\":
        e = this.atomEscape();
        break;
      case "[":
        e = this.characterClass();
        break;
      case "(":
        e = this.group();
        break;
    }
    if (e === void 0 && this.isPatternCharacter() && (e = this.patternCharacter()), zt(e))
      return e.loc = this.loc(n), this.isQuantifier() && (e.quantifier = this.quantifier()), e;
  }
  dotAll() {
    return this.consumeChar("."), {
      type: "Set",
      complement: !0,
      value: [N(`
`), N("\r"), N("\u2028"), N("\u2029")]
    };
  }
  atomEscape() {
    switch (this.consumeChar("\\"), this.peekChar()) {
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        return this.decimalEscapeAtom();
      case "d":
      case "D":
      case "s":
      case "S":
      case "w":
      case "W":
        return this.characterClassEscape();
      case "f":
      case "n":
      case "r":
      case "t":
      case "v":
        return this.controlEscapeAtom();
      case "c":
        return this.controlLetterEscapeAtom();
      case "0":
        return this.nulCharacterAtom();
      case "x":
        return this.hexEscapeSequenceAtom();
      case "u":
        return this.regExpUnicodeEscapeSequenceAtom();
      default:
        return this.identityEscapeAtom();
    }
  }
  decimalEscapeAtom() {
    return { type: "GroupBackReference", value: this.positiveInteger() };
  }
  characterClassEscape() {
    let e, n = !1;
    switch (this.popChar()) {
      case "d":
        e = ai;
        break;
      case "D":
        e = ai, n = !0;
        break;
      case "s":
        e = go;
        break;
      case "S":
        e = go, n = !0;
        break;
      case "w":
        e = oi;
        break;
      case "W":
        e = oi, n = !0;
        break;
    }
    if (zt(e))
      return { type: "Set", value: e, complement: n };
  }
  controlEscapeAtom() {
    let e;
    switch (this.popChar()) {
      case "f":
        e = N("\f");
        break;
      case "n":
        e = N(`
`);
        break;
      case "r":
        e = N("\r");
        break;
      case "t":
        e = N("	");
        break;
      case "v":
        e = N("\v");
        break;
    }
    if (zt(e))
      return { type: "Character", value: e };
  }
  controlLetterEscapeAtom() {
    this.consumeChar("c");
    const e = this.popChar();
    if (/[a-zA-Z]/.test(e) === !1)
      throw Error("Invalid ");
    return { type: "Character", value: e.toUpperCase().charCodeAt(0) - 64 };
  }
  nulCharacterAtom() {
    return this.consumeChar("0"), { type: "Character", value: N("\0") };
  }
  hexEscapeSequenceAtom() {
    return this.consumeChar("x"), this.parseHexDigits(2);
  }
  regExpUnicodeEscapeSequenceAtom() {
    return this.consumeChar("u"), this.parseHexDigits(4);
  }
  identityEscapeAtom() {
    const e = this.popChar();
    return { type: "Character", value: N(e) };
  }
  classPatternCharacterAtom() {
    switch (this.peekChar()) {
      // istanbul ignore next
      case `
`:
      // istanbul ignore next
      case "\r":
      // istanbul ignore next
      case "\u2028":
      // istanbul ignore next
      case "\u2029":
      // istanbul ignore next
      case "\\":
      // istanbul ignore next
      case "]":
        throw Error("TBD");
      default:
        const e = this.popChar();
        return { type: "Character", value: N(e) };
    }
  }
  characterClass() {
    const e = [];
    let n = !1;
    for (this.consumeChar("["), this.peekChar(0) === "^" && (this.consumeChar("^"), n = !0); this.isClassAtom(); ) {
      const r = this.classAtom();
      if (r.type, mo(r) && this.isRangeDash()) {
        this.consumeChar("-");
        const i = this.classAtom();
        if (i.type, mo(i)) {
          if (i.value < r.value)
            throw Error("Range out of order in character class");
          e.push({ from: r.value, to: i.value });
        } else
          ls(r.value, e), e.push(N("-")), ls(i.value, e);
      } else
        ls(r.value, e);
    }
    return this.consumeChar("]"), { type: "Set", complement: n, value: e };
  }
  classAtom() {
    switch (this.peekChar()) {
      // istanbul ignore next
      case "]":
      // istanbul ignore next
      case `
`:
      // istanbul ignore next
      case "\r":
      // istanbul ignore next
      case "\u2028":
      // istanbul ignore next
      case "\u2029":
        throw Error("TBD");
      case "\\":
        return this.classEscape();
      default:
        return this.classPatternCharacterAtom();
    }
  }
  classEscape() {
    switch (this.consumeChar("\\"), this.peekChar()) {
      // Matches a backspace.
      // (Not to be confused with \b word boundary outside characterClass)
      case "b":
        return this.consumeChar("b"), { type: "Character", value: N("\b") };
      case "d":
      case "D":
      case "s":
      case "S":
      case "w":
      case "W":
        return this.characterClassEscape();
      case "f":
      case "n":
      case "r":
      case "t":
      case "v":
        return this.controlEscapeAtom();
      case "c":
        return this.controlLetterEscapeAtom();
      case "0":
        return this.nulCharacterAtom();
      case "x":
        return this.hexEscapeSequenceAtom();
      case "u":
        return this.regExpUnicodeEscapeSequenceAtom();
      default:
        return this.identityEscapeAtom();
    }
  }
  group() {
    let e = !0;
    this.consumeChar("("), this.peekChar(0) === "?" ? (this.consumeChar("?"), this.consumeChar(":"), e = !1) : this.groupIdx++;
    const n = this.disjunction();
    this.consumeChar(")");
    const r = {
      type: "Group",
      capturing: e,
      value: n
    };
    return e && (r.idx = this.groupIdx), r;
  }
  positiveInteger() {
    let e = this.popChar();
    if (oh.test(e) === !1)
      throw Error("Expecting a positive integer");
    for (; wr.test(this.peekChar(0)); )
      e += this.popChar();
    return parseInt(e, 10);
  }
  integerIncludingZero() {
    let e = this.popChar();
    if (wr.test(e) === !1)
      throw Error("Expecting an integer");
    for (; wr.test(this.peekChar(0)); )
      e += this.popChar();
    return parseInt(e, 10);
  }
  patternCharacter() {
    const e = this.popChar();
    switch (e) {
      // istanbul ignore next
      case `
`:
      // istanbul ignore next
      case "\r":
      // istanbul ignore next
      case "\u2028":
      // istanbul ignore next
      case "\u2029":
      // istanbul ignore next
      case "^":
      // istanbul ignore next
      case "$":
      // istanbul ignore next
      case "\\":
      // istanbul ignore next
      case ".":
      // istanbul ignore next
      case "*":
      // istanbul ignore next
      case "+":
      // istanbul ignore next
      case "?":
      // istanbul ignore next
      case "(":
      // istanbul ignore next
      case ")":
      // istanbul ignore next
      case "[":
      // istanbul ignore next
      case "|":
        throw Error("TBD");
      default:
        return { type: "Character", value: N(e) };
    }
  }
  isRegExpFlag() {
    switch (this.peekChar(0)) {
      case "g":
      case "i":
      case "m":
      case "u":
      case "y":
        return !0;
      default:
        return !1;
    }
  }
  isRangeDash() {
    return this.peekChar() === "-" && this.isClassAtom(1);
  }
  isDigit() {
    return wr.test(this.peekChar(0));
  }
  isClassAtom(e = 0) {
    switch (this.peekChar(e)) {
      case "]":
      case `
`:
      case "\r":
      case "\u2028":
      case "\u2029":
        return !1;
      default:
        return !0;
    }
  }
  isTerm() {
    return this.isAtom() || this.isAssertion();
  }
  isAtom() {
    if (this.isPatternCharacter())
      return !0;
    switch (this.peekChar(0)) {
      case ".":
      case "\\":
      // atomEscape
      case "[":
      // characterClass
      // TODO: isAtom must be called before isAssertion - disambiguate
      case "(":
        return !0;
      default:
        return !1;
    }
  }
  isAssertion() {
    switch (this.peekChar(0)) {
      case "^":
      case "$":
        return !0;
      // '\b' or '\B'
      case "\\":
        switch (this.peekChar(1)) {
          case "b":
          case "B":
            return !0;
          default:
            return !1;
        }
      // '(?=' or '(?!'
      case "(":
        return this.peekChar(1) === "?" && (this.peekChar(2) === "=" || this.peekChar(2) === "!");
      default:
        return !1;
    }
  }
  isQuantifier() {
    const e = this.saveState();
    try {
      return this.quantifier(!0) !== void 0;
    } catch {
      return !1;
    } finally {
      this.restoreState(e);
    }
  }
  isPatternCharacter() {
    switch (this.peekChar()) {
      case "^":
      case "$":
      case "\\":
      case ".":
      case "*":
      case "+":
      case "?":
      case "(":
      case ")":
      case "[":
      case "|":
      case "/":
      case `
`:
      case "\r":
      case "\u2028":
      case "\u2029":
        return !1;
      default:
        return !0;
    }
  }
  parseHexDigits(e) {
    let n = "";
    for (let i = 0; i < e; i++) {
      const s = this.popChar();
      if (ah.test(s) === !1)
        throw Error("Expecting a HexDecimal digits");
      n += s;
    }
    return { type: "Character", value: parseInt(n, 16) };
  }
  peekChar(e = 0) {
    return this.input[this.idx + e];
  }
  popChar() {
    const e = this.peekChar(0);
    return this.consumeChar(void 0), e;
  }
  consumeChar(e) {
    if (e !== void 0 && this.input[this.idx] !== e)
      throw Error("Expected: '" + e + "' but found: '" + this.input[this.idx] + "' at offset: " + this.idx);
    if (this.idx >= this.input.length)
      throw Error("Unexpected end of input");
    this.idx++;
  }
  loc(e) {
    return { begin: e, end: this.idx };
  }
}
class _i {
  visitChildren(e) {
    for (const n in e) {
      const r = e[n];
      e.hasOwnProperty(n) && (r.type !== void 0 ? this.visit(r) : Array.isArray(r) && r.forEach((i) => {
        this.visit(i);
      }, this));
    }
  }
  visit(e) {
    switch (e.type) {
      case "Pattern":
        this.visitPattern(e);
        break;
      case "Flags":
        this.visitFlags(e);
        break;
      case "Disjunction":
        this.visitDisjunction(e);
        break;
      case "Alternative":
        this.visitAlternative(e);
        break;
      case "StartAnchor":
        this.visitStartAnchor(e);
        break;
      case "EndAnchor":
        this.visitEndAnchor(e);
        break;
      case "WordBoundary":
        this.visitWordBoundary(e);
        break;
      case "NonWordBoundary":
        this.visitNonWordBoundary(e);
        break;
      case "Lookahead":
        this.visitLookahead(e);
        break;
      case "NegativeLookahead":
        this.visitNegativeLookahead(e);
        break;
      case "Character":
        this.visitCharacter(e);
        break;
      case "Set":
        this.visitSet(e);
        break;
      case "Group":
        this.visitGroup(e);
        break;
      case "GroupBackReference":
        this.visitGroupBackReference(e);
        break;
      case "Quantifier":
        this.visitQuantifier(e);
        break;
    }
    this.visitChildren(e);
  }
  visitPattern(e) {
  }
  visitFlags(e) {
  }
  visitDisjunction(e) {
  }
  visitAlternative(e) {
  }
  // Assertion
  visitStartAnchor(e) {
  }
  visitEndAnchor(e) {
  }
  visitWordBoundary(e) {
  }
  visitNonWordBoundary(e) {
  }
  visitLookahead(e) {
  }
  visitNegativeLookahead(e) {
  }
  // atoms
  visitCharacter(e) {
  }
  visitSet(e) {
  }
  visitGroup(e) {
  }
  visitGroupBackReference(e) {
  }
  visitQuantifier(e) {
  }
}
const lh = /\r?\n/gm, uh = new ac();
class ch extends _i {
  constructor() {
    super(...arguments), this.isStarting = !0, this.endRegexpStack = [], this.multiline = !1;
  }
  get endRegex() {
    return this.endRegexpStack.join("");
  }
  reset(e) {
    this.multiline = !1, this.regex = e, this.startRegexp = "", this.isStarting = !0, this.endRegexpStack = [];
  }
  visitGroup(e) {
    e.quantifier && (this.isStarting = !1, this.endRegexpStack = []);
  }
  visitCharacter(e) {
    const n = String.fromCharCode(e.value);
    if (!this.multiline && n === `
` && (this.multiline = !0), e.quantifier)
      this.isStarting = !1, this.endRegexpStack = [];
    else {
      const r = bi(n);
      this.endRegexpStack.push(r), this.isStarting && (this.startRegexp += r);
    }
  }
  visitSet(e) {
    if (!this.multiline) {
      const n = this.regex.substring(e.loc.begin, e.loc.end), r = new RegExp(n);
      this.multiline = !!`
`.match(r);
    }
    if (e.quantifier)
      this.isStarting = !1, this.endRegexpStack = [];
    else {
      const n = this.regex.substring(e.loc.begin, e.loc.end);
      this.endRegexpStack.push(n), this.isStarting && (this.startRegexp += n);
    }
  }
  visitChildren(e) {
    e.type === "Group" && e.quantifier || super.visitChildren(e);
  }
}
const us = new ch();
function fh(t) {
  try {
    return typeof t == "string" && (t = new RegExp(t)), t = t.toString(), us.reset(t), us.visit(uh.pattern(t)), us.multiline;
  } catch {
    return !1;
  }
}
const dh = `\f
\r	\v              \u2028\u2029  　\uFEFF`.split("");
function Fs(t) {
  const e = typeof t == "string" ? new RegExp(t) : t;
  return dh.some((n) => e.test(n));
}
function bi(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hh(t) {
  return Array.prototype.map.call(t, (e) => /\w/.test(e) ? `[${e.toLowerCase()}${e.toUpperCase()}]` : bi(e)).join("");
}
function ph(t, e) {
  const n = mh(t), r = e.match(n);
  return !!r && r[0].length > 0;
}
function mh(t) {
  typeof t == "string" && (t = new RegExp(t));
  const e = t, n = t.source;
  let r = 0;
  function i() {
    let s = "", a;
    function o(u) {
      s += n.substr(r, u), r += u;
    }
    function l(u) {
      s += "(?:" + n.substr(r, u) + "|$)", r += u;
    }
    for (; r < n.length; )
      switch (n[r]) {
        case "\\":
          switch (n[r + 1]) {
            case "c":
              l(3);
              break;
            case "x":
              l(4);
              break;
            case "u":
              e.unicode ? n[r + 2] === "{" ? l(n.indexOf("}", r) - r + 1) : l(6) : l(2);
              break;
            case "p":
            case "P":
              e.unicode ? l(n.indexOf("}", r) - r + 1) : l(2);
              break;
            case "k":
              l(n.indexOf(">", r) - r + 1);
              break;
            default:
              l(2);
              break;
          }
          break;
        case "[":
          a = /\[(?:\\.|.)*?\]/g, a.lastIndex = r, a = a.exec(n) || [], l(a[0].length);
          break;
        case "|":
        case "^":
        case "$":
        case "*":
        case "+":
        case "?":
          o(1);
          break;
        case "{":
          a = /\{\d+,?\d*\}/g, a.lastIndex = r, a = a.exec(n), a ? o(a[0].length) : l(1);
          break;
        case "(":
          if (n[r + 1] === "?")
            switch (n[r + 2]) {
              case ":":
                s += "(?:", r += 3, s += i() + "|$)";
                break;
              case "=":
                s += "(?=", r += 3, s += i() + ")";
                break;
              case "!":
                a = r, r += 3, i(), s += n.substr(a, r - a);
                break;
              case "<":
                switch (n[r + 3]) {
                  case "=":
                  case "!":
                    a = r, r += 4, i(), s += n.substr(a, r - a);
                    break;
                  default:
                    o(n.indexOf(">", r) - r + 1), s += i() + "|$)";
                    break;
                }
                break;
            }
          else
            o(1), s += i() + "|$)";
          break;
        case ")":
          return ++r, s;
        default:
          l(1);
          break;
      }
    return s;
  }
  return new RegExp(i(), t.flags);
}
function gh(t) {
  return t.rules.find((e) => _e(e) && e.entry);
}
function yh(t) {
  return t.rules.filter((e) => Gt(e) && e.hidden);
}
function oc(t, e) {
  const n = /* @__PURE__ */ new Set(), r = gh(t);
  if (!r)
    return new Set(t.rules);
  const i = [r].concat(yh(t));
  for (const a of i)
    lc(a, n, e);
  const s = /* @__PURE__ */ new Set();
  for (const a of t.rules)
    (n.has(a.name) || Gt(a) && a.hidden) && s.add(a);
  return s;
}
function lc(t, e, n) {
  e.add(t.name), lr(t).forEach((r) => {
    if (Lt(r) || n) {
      const i = r.rule.ref;
      i && !e.has(i.name) && lc(i, e, n);
    }
  });
}
function Th(t) {
  if (t.terminal)
    return t.terminal;
  if (t.type.ref) {
    const e = cc(t.type.ref);
    return e?.terminal;
  }
}
function vh(t) {
  return t.hidden && !Fs(Ia(t));
}
function Rh(t, e) {
  return !t || !e ? [] : xa(t, e, t.astNode, !0);
}
function uc(t, e, n) {
  if (!t || !e)
    return;
  const r = xa(t, e, t.astNode, !0);
  if (r.length !== 0)
    return n !== void 0 ? n = Math.max(0, Math.min(n, r.length - 1)) : n = 0, r[n];
}
function xa(t, e, n, r) {
  if (!r) {
    const i = Ni(t.grammarSource, bt);
    if (i && i.feature === e)
      return [t];
  }
  return er(t) && t.astNode === n ? t.content.flatMap((i) => xa(i, e, n, !1)) : [];
}
function Ah(t, e, n) {
  if (!t)
    return;
  const r = Eh(t, e, t?.astNode);
  if (r.length !== 0)
    return n !== void 0 ? n = Math.max(0, Math.min(n, r.length - 1)) : n = 0, r[n];
}
function Eh(t, e, n) {
  if (t.astNode !== n)
    return [];
  if (Ot(t.grammarSource) && t.grammarSource.value === e)
    return [t];
  const r = Ps(t).iterator();
  let i;
  const s = [];
  do
    if (i = r.next(), !i.done) {
      const a = i.value;
      a.astNode === n ? Ot(a.grammarSource) && a.grammarSource.value === e && s.push(a) : r.prune();
    }
  while (!i.done);
  return s;
}
function $h(t) {
  var e;
  const n = t.astNode;
  for (; n === ((e = t.container) === null || e === void 0 ? void 0 : e.astNode); ) {
    const r = Ni(t.grammarSource, bt);
    if (r)
      return r;
    t = t.container;
  }
}
function cc(t) {
  let e = t;
  return Zu(e) && (wi(e.$container) ? e = e.$container.$container : _e(e.$container) ? e = e.$container : or(e.$container)), fc(t, e, /* @__PURE__ */ new Map());
}
function fc(t, e, n) {
  var r;
  function i(s, a) {
    let o;
    return Ni(s, bt) || (o = fc(a, a, n)), n.set(t, o), o;
  }
  if (n.has(t))
    return n.get(t);
  n.set(t, void 0);
  for (const s of lr(e)) {
    if (bt(s) && s.feature.toLowerCase() === "name")
      return n.set(t, s), s;
    if (Lt(s) && _e(s.rule.ref))
      return i(s, s.rule.ref);
    if (zd(s) && (!((r = s.typeRef) === null || r === void 0) && r.ref))
      return i(s, s.typeRef.ref);
  }
}
function dc(t) {
  return hc(t, /* @__PURE__ */ new Set());
}
function hc(t, e) {
  if (e.has(t))
    return !0;
  e.add(t);
  for (const n of lr(t))
    if (Lt(n)) {
      if (!n.rule.ref || _e(n.rule.ref) && !hc(n.rule.ref, e))
        return !1;
    } else {
      if (bt(n))
        return !1;
      if (wi(n))
        return !1;
    }
  return !!t.definition;
}
function Sa(t) {
  if (t.inferredType)
    return t.inferredType.name;
  if (t.dataType)
    return t.dataType;
  if (t.returnType) {
    const e = t.returnType.ref;
    if (e) {
      if (_e(e))
        return e.name;
      if (Qu(e) || ec(e))
        return e.name;
    }
  }
}
function ka(t) {
  var e;
  if (_e(t))
    return dc(t) ? t.name : (e = Sa(t)) !== null && e !== void 0 ? e : t.name;
  if (Qu(t) || ec(t) || Wd(t))
    return t.name;
  if (wi(t)) {
    const n = xh(t);
    if (n)
      return n;
  } else if (Zu(t))
    return t.name;
  throw new Error("Cannot get name of Unknown Type");
}
function xh(t) {
  var e;
  if (t.inferredType)
    return t.inferredType.name;
  if (!((e = t.type) === null || e === void 0) && e.ref)
    return ka(t.type.ref);
}
function Sh(t) {
  var e, n, r;
  return Gt(t) ? (n = (e = t.type) === null || e === void 0 ? void 0 : e.name) !== null && n !== void 0 ? n : "string" : (r = Sa(t)) !== null && r !== void 0 ? r : t.name;
}
function Ia(t) {
  const e = {
    s: !1,
    i: !1,
    u: !1
  }, n = ln(t.definition, e), r = Object.entries(e).filter(([, i]) => i).map(([i]) => i).join("");
  return new RegExp(n, r);
}
const Ca = /[\s\S]/.source;
function ln(t, e) {
  if (Zd(t))
    return kh(t);
  if (Qd(t))
    return Ih(t);
  if (qd(t))
    return Nh(t);
  if (eh(t)) {
    const n = t.rule.ref;
    if (!n)
      throw new Error("Missing rule reference.");
    return at(ln(n.definition), {
      cardinality: t.cardinality,
      lookahead: t.lookahead
    });
  } else {
    if (Xd(t))
      return wh(t);
    if (th(t))
      return Ch(t);
    if (Jd(t)) {
      const n = t.regex.lastIndexOf("/"), r = t.regex.substring(1, n), i = t.regex.substring(n + 1);
      return e && (e.i = i.includes("i"), e.s = i.includes("s"), e.u = i.includes("u")), at(r, {
        cardinality: t.cardinality,
        lookahead: t.lookahead,
        wrap: !1
      });
    } else {
      if (nh(t))
        return at(Ca, {
          cardinality: t.cardinality,
          lookahead: t.lookahead
        });
      throw new Error(`Invalid terminal element: ${t?.$type}`);
    }
  }
}
function kh(t) {
  return at(t.elements.map((e) => ln(e)).join("|"), {
    cardinality: t.cardinality,
    lookahead: t.lookahead
  });
}
function Ih(t) {
  return at(t.elements.map((e) => ln(e)).join(""), {
    cardinality: t.cardinality,
    lookahead: t.lookahead
  });
}
function Ch(t) {
  return at(`${Ca}*?${ln(t.terminal)}`, {
    cardinality: t.cardinality,
    lookahead: t.lookahead
  });
}
function wh(t) {
  return at(`(?!${ln(t.terminal)})${Ca}*?`, {
    cardinality: t.cardinality,
    lookahead: t.lookahead
  });
}
function Nh(t) {
  return t.right ? at(`[${cs(t.left)}-${cs(t.right)}]`, {
    cardinality: t.cardinality,
    lookahead: t.lookahead,
    wrap: !1
  }) : at(cs(t.left), {
    cardinality: t.cardinality,
    lookahead: t.lookahead,
    wrap: !1
  });
}
function cs(t) {
  return bi(t.value);
}
function at(t, e) {
  var n;
  return (e.wrap !== !1 || e.lookahead) && (t = `(${(n = e.lookahead) !== null && n !== void 0 ? n : ""}${t})`), e.cardinality ? `${t}${e.cardinality}` : t;
}
function _h(t) {
  const e = [], n = t.Grammar;
  for (const r of n.rules)
    Gt(r) && vh(r) && fh(Ia(r)) && e.push(r.name);
  return {
    multilineCommentRules: e,
    nameRegexp: Dd
  };
}
var pc = typeof global == "object" && global && global.Object === Object && global, bh = typeof self == "object" && self && self.Object === Object && self, Ye = pc || bh || Function("return this")(), be = Ye.Symbol, mc = Object.prototype, Oh = mc.hasOwnProperty, Lh = mc.toString, hn = be ? be.toStringTag : void 0;
function Ph(t) {
  var e = Oh.call(t, hn), n = t[hn];
  try {
    t[hn] = void 0;
    var r = !0;
  } catch {
  }
  var i = Lh.call(t);
  return r && (e ? t[hn] = n : delete t[hn]), i;
}
var Mh = Object.prototype, Dh = Mh.toString;
function Fh(t) {
  return Dh.call(t);
}
var Gh = "[object Null]", Uh = "[object Undefined]", yo = be ? be.toStringTag : void 0;
function Rt(t) {
  return t == null ? t === void 0 ? Uh : Gh : yo && yo in Object(t) ? Ph(t) : Fh(t);
}
function Be(t) {
  return t != null && typeof t == "object";
}
var Bh = "[object Symbol]";
function Oi(t) {
  return typeof t == "symbol" || Be(t) && Rt(t) == Bh;
}
function Li(t, e) {
  for (var n = -1, r = t == null ? 0 : t.length, i = Array(r); ++n < r; )
    i[n] = e(t[n], n, t);
  return i;
}
var P = Array.isArray, To = be ? be.prototype : void 0, vo = To ? To.toString : void 0;
function gc(t) {
  if (typeof t == "string")
    return t;
  if (P(t))
    return Li(t, gc) + "";
  if (Oi(t))
    return vo ? vo.call(t) : "";
  var e = t + "";
  return e == "0" && 1 / t == -1 / 0 ? "-0" : e;
}
var jh = /\s/;
function Kh(t) {
  for (var e = t.length; e-- && jh.test(t.charAt(e)); )
    ;
  return e;
}
var Hh = /^\s+/;
function Vh(t) {
  return t && t.slice(0, Kh(t) + 1).replace(Hh, "");
}
function Oe(t) {
  var e = typeof t;
  return t != null && (e == "object" || e == "function");
}
var Ro = NaN, Wh = /^[-+]0x[0-9a-f]+$/i, zh = /^0b[01]+$/i, qh = /^0o[0-7]+$/i, Yh = parseInt;
function Xh(t) {
  if (typeof t == "number")
    return t;
  if (Oi(t))
    return Ro;
  if (Oe(t)) {
    var e = typeof t.valueOf == "function" ? t.valueOf() : t;
    t = Oe(e) ? e + "" : e;
  }
  if (typeof t != "string")
    return t === 0 ? t : +t;
  t = Vh(t);
  var n = zh.test(t);
  return n || qh.test(t) ? Yh(t.slice(2), n ? 2 : 8) : Wh.test(t) ? Ro : +t;
}
var Ao = 1 / 0, Jh = 17976931348623157e292;
function Zh(t) {
  if (!t)
    return t === 0 ? t : 0;
  if (t = Xh(t), t === Ao || t === -Ao) {
    var e = t < 0 ? -1 : 1;
    return e * Jh;
  }
  return t === t ? t : 0;
}
function Pi(t) {
  var e = Zh(t), n = e % 1;
  return e === e ? n ? e - n : e : 0;
}
function Qt(t) {
  return t;
}
var Qh = "[object AsyncFunction]", ep = "[object Function]", tp = "[object GeneratorFunction]", np = "[object Proxy]";
function ct(t) {
  if (!Oe(t))
    return !1;
  var e = Rt(t);
  return e == ep || e == tp || e == Qh || e == np;
}
var fs = Ye["__core-js_shared__"], Eo = (function() {
  var t = /[^.]+$/.exec(fs && fs.keys && fs.keys.IE_PROTO || "");
  return t ? "Symbol(src)_1." + t : "";
})();
function rp(t) {
  return !!Eo && Eo in t;
}
var ip = Function.prototype, sp = ip.toString;
function Ut(t) {
  if (t != null) {
    try {
      return sp.call(t);
    } catch {
    }
    try {
      return t + "";
    } catch {
    }
  }
  return "";
}
var ap = /[\\^$.*+?()[\]{}|]/g, op = /^\[object .+?Constructor\]$/, lp = Function.prototype, up = Object.prototype, cp = lp.toString, fp = up.hasOwnProperty, dp = RegExp(
  "^" + cp.call(fp).replace(ap, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function hp(t) {
  if (!Oe(t) || rp(t))
    return !1;
  var e = ct(t) ? dp : op;
  return e.test(Ut(t));
}
function pp(t, e) {
  return t?.[e];
}
function Bt(t, e) {
  var n = pp(t, e);
  return hp(n) ? n : void 0;
}
var Gs = Bt(Ye, "WeakMap"), $o = Object.create, mp = /* @__PURE__ */ (function() {
  function t() {
  }
  return function(e) {
    if (!Oe(e))
      return {};
    if ($o)
      return $o(e);
    t.prototype = e;
    var n = new t();
    return t.prototype = void 0, n;
  };
})();
function gp(t, e, n) {
  switch (n.length) {
    case 0:
      return t.call(e);
    case 1:
      return t.call(e, n[0]);
    case 2:
      return t.call(e, n[0], n[1]);
    case 3:
      return t.call(e, n[0], n[1], n[2]);
  }
  return t.apply(e, n);
}
function X() {
}
function yp(t, e) {
  var n = -1, r = t.length;
  for (e || (e = Array(r)); ++n < r; )
    e[n] = t[n];
  return e;
}
var Tp = 800, vp = 16, Rp = Date.now;
function Ap(t) {
  var e = 0, n = 0;
  return function() {
    var r = Rp(), i = vp - (r - n);
    if (n = r, i > 0) {
      if (++e >= Tp)
        return arguments[0];
    } else
      e = 0;
    return t.apply(void 0, arguments);
  };
}
function Ep(t) {
  return function() {
    return t;
  };
}
var li = (function() {
  try {
    var t = Bt(Object, "defineProperty");
    return t({}, "", {}), t;
  } catch {
  }
})(), $p = li ? function(t, e) {
  return li(t, "toString", {
    configurable: !0,
    enumerable: !1,
    value: Ep(e),
    writable: !0
  });
} : Qt, xp = Ap($p);
function yc(t, e) {
  for (var n = -1, r = t == null ? 0 : t.length; ++n < r && e(t[n], n, t) !== !1; )
    ;
  return t;
}
function Tc(t, e, n, r) {
  for (var i = t.length, s = n + -1; ++s < i; )
    if (e(t[s], s, t))
      return s;
  return -1;
}
function Sp(t) {
  return t !== t;
}
function kp(t, e, n) {
  for (var r = n - 1, i = t.length; ++r < i; )
    if (t[r] === e)
      return r;
  return -1;
}
function wa(t, e, n) {
  return e === e ? kp(t, e, n) : Tc(t, Sp, n);
}
function vc(t, e) {
  var n = t == null ? 0 : t.length;
  return !!n && wa(t, e, 0) > -1;
}
var Ip = 9007199254740991, Cp = /^(?:0|[1-9]\d*)$/;
function Mi(t, e) {
  var n = typeof t;
  return e = e ?? Ip, !!e && (n == "number" || n != "symbol" && Cp.test(t)) && t > -1 && t % 1 == 0 && t < e;
}
function Na(t, e, n) {
  e == "__proto__" && li ? li(t, e, {
    configurable: !0,
    enumerable: !0,
    value: n,
    writable: !0
  }) : t[e] = n;
}
function ur(t, e) {
  return t === e || t !== t && e !== e;
}
var wp = Object.prototype, Np = wp.hasOwnProperty;
function Di(t, e, n) {
  var r = t[e];
  (!(Np.call(t, e) && ur(r, n)) || n === void 0 && !(e in t)) && Na(t, e, n);
}
function cr(t, e, n, r) {
  var i = !n;
  n || (n = {});
  for (var s = -1, a = e.length; ++s < a; ) {
    var o = e[s], l = void 0;
    l === void 0 && (l = t[o]), i ? Na(n, o, l) : Di(n, o, l);
  }
  return n;
}
var xo = Math.max;
function _p(t, e, n) {
  return e = xo(e === void 0 ? t.length - 1 : e, 0), function() {
    for (var r = arguments, i = -1, s = xo(r.length - e, 0), a = Array(s); ++i < s; )
      a[i] = r[e + i];
    i = -1;
    for (var o = Array(e + 1); ++i < e; )
      o[i] = r[i];
    return o[e] = n(a), gp(t, this, o);
  };
}
function _a(t, e) {
  return xp(_p(t, e, Qt), t + "");
}
var bp = 9007199254740991;
function ba(t) {
  return typeof t == "number" && t > -1 && t % 1 == 0 && t <= bp;
}
function Xe(t) {
  return t != null && ba(t.length) && !ct(t);
}
function Rc(t, e, n) {
  if (!Oe(n))
    return !1;
  var r = typeof e;
  return (r == "number" ? Xe(n) && Mi(e, n.length) : r == "string" && e in n) ? ur(n[e], t) : !1;
}
function Op(t) {
  return _a(function(e, n) {
    var r = -1, i = n.length, s = i > 1 ? n[i - 1] : void 0, a = i > 2 ? n[2] : void 0;
    for (s = t.length > 3 && typeof s == "function" ? (i--, s) : void 0, a && Rc(n[0], n[1], a) && (s = i < 3 ? void 0 : s, i = 1), e = Object(e); ++r < i; ) {
      var o = n[r];
      o && t(e, o, r, s);
    }
    return e;
  });
}
var Lp = Object.prototype;
function fr(t) {
  var e = t && t.constructor, n = typeof e == "function" && e.prototype || Lp;
  return t === n;
}
function Pp(t, e) {
  for (var n = -1, r = Array(t); ++n < t; )
    r[n] = e(n);
  return r;
}
var Mp = "[object Arguments]";
function So(t) {
  return Be(t) && Rt(t) == Mp;
}
var Ac = Object.prototype, Dp = Ac.hasOwnProperty, Fp = Ac.propertyIsEnumerable, Fi = So(/* @__PURE__ */ (function() {
  return arguments;
})()) ? So : function(t) {
  return Be(t) && Dp.call(t, "callee") && !Fp.call(t, "callee");
};
function Gp() {
  return !1;
}
var Ec = typeof exports == "object" && exports && !exports.nodeType && exports, ko = Ec && typeof module == "object" && module && !module.nodeType && module, Up = ko && ko.exports === Ec, Io = Up ? Ye.Buffer : void 0, Bp = Io ? Io.isBuffer : void 0, tr = Bp || Gp, jp = "[object Arguments]", Kp = "[object Array]", Hp = "[object Boolean]", Vp = "[object Date]", Wp = "[object Error]", zp = "[object Function]", qp = "[object Map]", Yp = "[object Number]", Xp = "[object Object]", Jp = "[object RegExp]", Zp = "[object Set]", Qp = "[object String]", em = "[object WeakMap]", tm = "[object ArrayBuffer]", nm = "[object DataView]", rm = "[object Float32Array]", im = "[object Float64Array]", sm = "[object Int8Array]", am = "[object Int16Array]", om = "[object Int32Array]", lm = "[object Uint8Array]", um = "[object Uint8ClampedArray]", cm = "[object Uint16Array]", fm = "[object Uint32Array]", B = {};
B[rm] = B[im] = B[sm] = B[am] = B[om] = B[lm] = B[um] = B[cm] = B[fm] = !0;
B[jp] = B[Kp] = B[tm] = B[Hp] = B[nm] = B[Vp] = B[Wp] = B[zp] = B[qp] = B[Yp] = B[Xp] = B[Jp] = B[Zp] = B[Qp] = B[em] = !1;
function dm(t) {
  return Be(t) && ba(t.length) && !!B[Rt(t)];
}
function Gi(t) {
  return function(e) {
    return t(e);
  };
}
var $c = typeof exports == "object" && exports && !exports.nodeType && exports, Zn = $c && typeof module == "object" && module && !module.nodeType && module, hm = Zn && Zn.exports === $c, ds = hm && pc.process, mt = (function() {
  try {
    var t = Zn && Zn.require && Zn.require("util").types;
    return t || ds && ds.binding && ds.binding("util");
  } catch {
  }
})(), Co = mt && mt.isTypedArray, Oa = Co ? Gi(Co) : dm, pm = Object.prototype, mm = pm.hasOwnProperty;
function xc(t, e) {
  var n = P(t), r = !n && Fi(t), i = !n && !r && tr(t), s = !n && !r && !i && Oa(t), a = n || r || i || s, o = a ? Pp(t.length, String) : [], l = o.length;
  for (var u in t)
    (e || mm.call(t, u)) && !(a && // Safari 9 has enumerable `arguments.length` in strict mode.
    (u == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
    i && (u == "offset" || u == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
    s && (u == "buffer" || u == "byteLength" || u == "byteOffset") || // Skip index properties.
    Mi(u, l))) && o.push(u);
  return o;
}
function Sc(t, e) {
  return function(n) {
    return t(e(n));
  };
}
var gm = Sc(Object.keys, Object), ym = Object.prototype, Tm = ym.hasOwnProperty;
function kc(t) {
  if (!fr(t))
    return gm(t);
  var e = [];
  for (var n in Object(t))
    Tm.call(t, n) && n != "constructor" && e.push(n);
  return e;
}
function Le(t) {
  return Xe(t) ? xc(t) : kc(t);
}
var vm = Object.prototype, Rm = vm.hasOwnProperty, $e = Op(function(t, e) {
  if (fr(e) || Xe(e)) {
    cr(e, Le(e), t);
    return;
  }
  for (var n in e)
    Rm.call(e, n) && Di(t, n, e[n]);
});
function Am(t) {
  var e = [];
  if (t != null)
    for (var n in Object(t))
      e.push(n);
  return e;
}
var Em = Object.prototype, $m = Em.hasOwnProperty;
function xm(t) {
  if (!Oe(t))
    return Am(t);
  var e = fr(t), n = [];
  for (var r in t)
    r == "constructor" && (e || !$m.call(t, r)) || n.push(r);
  return n;
}
function La(t) {
  return Xe(t) ? xc(t, !0) : xm(t);
}
var Sm = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, km = /^\w*$/;
function Pa(t, e) {
  if (P(t))
    return !1;
  var n = typeof t;
  return n == "number" || n == "symbol" || n == "boolean" || t == null || Oi(t) ? !0 : km.test(t) || !Sm.test(t) || e != null && t in Object(e);
}
var nr = Bt(Object, "create");
function Im() {
  this.__data__ = nr ? nr(null) : {}, this.size = 0;
}
function Cm(t) {
  var e = this.has(t) && delete this.__data__[t];
  return this.size -= e ? 1 : 0, e;
}
var wm = "__lodash_hash_undefined__", Nm = Object.prototype, _m = Nm.hasOwnProperty;
function bm(t) {
  var e = this.__data__;
  if (nr) {
    var n = e[t];
    return n === wm ? void 0 : n;
  }
  return _m.call(e, t) ? e[t] : void 0;
}
var Om = Object.prototype, Lm = Om.hasOwnProperty;
function Pm(t) {
  var e = this.__data__;
  return nr ? e[t] !== void 0 : Lm.call(e, t);
}
var Mm = "__lodash_hash_undefined__";
function Dm(t, e) {
  var n = this.__data__;
  return this.size += this.has(t) ? 0 : 1, n[t] = nr && e === void 0 ? Mm : e, this;
}
function Pt(t) {
  var e = -1, n = t == null ? 0 : t.length;
  for (this.clear(); ++e < n; ) {
    var r = t[e];
    this.set(r[0], r[1]);
  }
}
Pt.prototype.clear = Im;
Pt.prototype.delete = Cm;
Pt.prototype.get = bm;
Pt.prototype.has = Pm;
Pt.prototype.set = Dm;
function Fm() {
  this.__data__ = [], this.size = 0;
}
function Ui(t, e) {
  for (var n = t.length; n--; )
    if (ur(t[n][0], e))
      return n;
  return -1;
}
var Gm = Array.prototype, Um = Gm.splice;
function Bm(t) {
  var e = this.__data__, n = Ui(e, t);
  if (n < 0)
    return !1;
  var r = e.length - 1;
  return n == r ? e.pop() : Um.call(e, n, 1), --this.size, !0;
}
function jm(t) {
  var e = this.__data__, n = Ui(e, t);
  return n < 0 ? void 0 : e[n][1];
}
function Km(t) {
  return Ui(this.__data__, t) > -1;
}
function Hm(t, e) {
  var n = this.__data__, r = Ui(n, t);
  return r < 0 ? (++this.size, n.push([t, e])) : n[r][1] = e, this;
}
function ft(t) {
  var e = -1, n = t == null ? 0 : t.length;
  for (this.clear(); ++e < n; ) {
    var r = t[e];
    this.set(r[0], r[1]);
  }
}
ft.prototype.clear = Fm;
ft.prototype.delete = Bm;
ft.prototype.get = jm;
ft.prototype.has = Km;
ft.prototype.set = Hm;
var rr = Bt(Ye, "Map");
function Vm() {
  this.size = 0, this.__data__ = {
    hash: new Pt(),
    map: new (rr || ft)(),
    string: new Pt()
  };
}
function Wm(t) {
  var e = typeof t;
  return e == "string" || e == "number" || e == "symbol" || e == "boolean" ? t !== "__proto__" : t === null;
}
function Bi(t, e) {
  var n = t.__data__;
  return Wm(e) ? n[typeof e == "string" ? "string" : "hash"] : n.map;
}
function zm(t) {
  var e = Bi(this, t).delete(t);
  return this.size -= e ? 1 : 0, e;
}
function qm(t) {
  return Bi(this, t).get(t);
}
function Ym(t) {
  return Bi(this, t).has(t);
}
function Xm(t, e) {
  var n = Bi(this, t), r = n.size;
  return n.set(t, e), this.size += n.size == r ? 0 : 1, this;
}
function dt(t) {
  var e = -1, n = t == null ? 0 : t.length;
  for (this.clear(); ++e < n; ) {
    var r = t[e];
    this.set(r[0], r[1]);
  }
}
dt.prototype.clear = Vm;
dt.prototype.delete = zm;
dt.prototype.get = qm;
dt.prototype.has = Ym;
dt.prototype.set = Xm;
var Jm = "Expected a function";
function Ma(t, e) {
  if (typeof t != "function" || e != null && typeof e != "function")
    throw new TypeError(Jm);
  var n = function() {
    var r = arguments, i = e ? e.apply(this, r) : r[0], s = n.cache;
    if (s.has(i))
      return s.get(i);
    var a = t.apply(this, r);
    return n.cache = s.set(i, a) || s, a;
  };
  return n.cache = new (Ma.Cache || dt)(), n;
}
Ma.Cache = dt;
var Zm = 500;
function Qm(t) {
  var e = Ma(t, function(r) {
    return n.size === Zm && n.clear(), r;
  }), n = e.cache;
  return e;
}
var eg = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g, tg = /\\(\\)?/g, ng = Qm(function(t) {
  var e = [];
  return t.charCodeAt(0) === 46 && e.push(""), t.replace(eg, function(n, r, i, s) {
    e.push(i ? s.replace(tg, "$1") : r || n);
  }), e;
});
function rg(t) {
  return t == null ? "" : gc(t);
}
function ji(t, e) {
  return P(t) ? t : Pa(t, e) ? [t] : ng(rg(t));
}
function dr(t) {
  if (typeof t == "string" || Oi(t))
    return t;
  var e = t + "";
  return e == "0" && 1 / t == -1 / 0 ? "-0" : e;
}
function Da(t, e) {
  e = ji(e, t);
  for (var n = 0, r = e.length; t != null && n < r; )
    t = t[dr(e[n++])];
  return n && n == r ? t : void 0;
}
function ig(t, e, n) {
  var r = t == null ? void 0 : Da(t, e);
  return r === void 0 ? n : r;
}
function Fa(t, e) {
  for (var n = -1, r = e.length, i = t.length; ++n < r; )
    t[i + n] = e[n];
  return t;
}
var wo = be ? be.isConcatSpreadable : void 0;
function sg(t) {
  return P(t) || Fi(t) || !!(wo && t && t[wo]);
}
function Ga(t, e, n, r, i) {
  var s = -1, a = t.length;
  for (n || (n = sg), i || (i = []); ++s < a; ) {
    var o = t[s];
    n(o) ? Fa(i, o) : r || (i[i.length] = o);
  }
  return i;
}
function Ge(t) {
  var e = t == null ? 0 : t.length;
  return e ? Ga(t) : [];
}
var Ic = Sc(Object.getPrototypeOf, Object);
function Cc(t, e, n) {
  var r = -1, i = t.length;
  e < 0 && (e = -e > i ? 0 : i + e), n = n > i ? i : n, n < 0 && (n += i), i = e > n ? 0 : n - e >>> 0, e >>>= 0;
  for (var s = Array(i); ++r < i; )
    s[r] = t[r + e];
  return s;
}
function ag(t, e, n, r) {
  var i = -1, s = t == null ? 0 : t.length;
  for (r && s && (n = t[++i]); ++i < s; )
    n = e(n, t[i], i, t);
  return n;
}
function og() {
  this.__data__ = new ft(), this.size = 0;
}
function lg(t) {
  var e = this.__data__, n = e.delete(t);
  return this.size = e.size, n;
}
function ug(t) {
  return this.__data__.get(t);
}
function cg(t) {
  return this.__data__.has(t);
}
var fg = 200;
function dg(t, e) {
  var n = this.__data__;
  if (n instanceof ft) {
    var r = n.__data__;
    if (!rr || r.length < fg - 1)
      return r.push([t, e]), this.size = ++n.size, this;
    n = this.__data__ = new dt(r);
  }
  return n.set(t, e), this.size = n.size, this;
}
function qe(t) {
  var e = this.__data__ = new ft(t);
  this.size = e.size;
}
qe.prototype.clear = og;
qe.prototype.delete = lg;
qe.prototype.get = ug;
qe.prototype.has = cg;
qe.prototype.set = dg;
function hg(t, e) {
  return t && cr(e, Le(e), t);
}
function pg(t, e) {
  return t && cr(e, La(e), t);
}
var wc = typeof exports == "object" && exports && !exports.nodeType && exports, No = wc && typeof module == "object" && module && !module.nodeType && module, mg = No && No.exports === wc, _o = mg ? Ye.Buffer : void 0, bo = _o ? _o.allocUnsafe : void 0;
function gg(t, e) {
  var n = t.length, r = bo ? bo(n) : new t.constructor(n);
  return t.copy(r), r;
}
function Ua(t, e) {
  for (var n = -1, r = t == null ? 0 : t.length, i = 0, s = []; ++n < r; ) {
    var a = t[n];
    e(a, n, t) && (s[i++] = a);
  }
  return s;
}
function Nc() {
  return [];
}
var yg = Object.prototype, Tg = yg.propertyIsEnumerable, Oo = Object.getOwnPropertySymbols, Ba = Oo ? function(t) {
  return t == null ? [] : (t = Object(t), Ua(Oo(t), function(e) {
    return Tg.call(t, e);
  }));
} : Nc;
function vg(t, e) {
  return cr(t, Ba(t), e);
}
var Rg = Object.getOwnPropertySymbols, _c = Rg ? function(t) {
  for (var e = []; t; )
    Fa(e, Ba(t)), t = Ic(t);
  return e;
} : Nc;
function Ag(t, e) {
  return cr(t, _c(t), e);
}
function bc(t, e, n) {
  var r = e(t);
  return P(t) ? r : Fa(r, n(t));
}
function Us(t) {
  return bc(t, Le, Ba);
}
function Eg(t) {
  return bc(t, La, _c);
}
var Bs = Bt(Ye, "DataView"), js = Bt(Ye, "Promise"), Jt = Bt(Ye, "Set"), Lo = "[object Map]", $g = "[object Object]", Po = "[object Promise]", Mo = "[object Set]", Do = "[object WeakMap]", Fo = "[object DataView]", xg = Ut(Bs), Sg = Ut(rr), kg = Ut(js), Ig = Ut(Jt), Cg = Ut(Gs), we = Rt;
(Bs && we(new Bs(new ArrayBuffer(1))) != Fo || rr && we(new rr()) != Lo || js && we(js.resolve()) != Po || Jt && we(new Jt()) != Mo || Gs && we(new Gs()) != Do) && (we = function(t) {
  var e = Rt(t), n = e == $g ? t.constructor : void 0, r = n ? Ut(n) : "";
  if (r)
    switch (r) {
      case xg:
        return Fo;
      case Sg:
        return Lo;
      case kg:
        return Po;
      case Ig:
        return Mo;
      case Cg:
        return Do;
    }
  return e;
});
var wg = Object.prototype, Ng = wg.hasOwnProperty;
function _g(t) {
  var e = t.length, n = new t.constructor(e);
  return e && typeof t[0] == "string" && Ng.call(t, "index") && (n.index = t.index, n.input = t.input), n;
}
var ui = Ye.Uint8Array;
function bg(t) {
  var e = new t.constructor(t.byteLength);
  return new ui(e).set(new ui(t)), e;
}
function Og(t, e) {
  var n = t.buffer;
  return new t.constructor(n, t.byteOffset, t.byteLength);
}
var Lg = /\w*$/;
function Pg(t) {
  var e = new t.constructor(t.source, Lg.exec(t));
  return e.lastIndex = t.lastIndex, e;
}
var Go = be ? be.prototype : void 0, Uo = Go ? Go.valueOf : void 0;
function Mg(t) {
  return Uo ? Object(Uo.call(t)) : {};
}
function Dg(t, e) {
  var n = t.buffer;
  return new t.constructor(n, t.byteOffset, t.length);
}
var Fg = "[object Boolean]", Gg = "[object Date]", Ug = "[object Map]", Bg = "[object Number]", jg = "[object RegExp]", Kg = "[object Set]", Hg = "[object String]", Vg = "[object Symbol]", Wg = "[object ArrayBuffer]", zg = "[object DataView]", qg = "[object Float32Array]", Yg = "[object Float64Array]", Xg = "[object Int8Array]", Jg = "[object Int16Array]", Zg = "[object Int32Array]", Qg = "[object Uint8Array]", ey = "[object Uint8ClampedArray]", ty = "[object Uint16Array]", ny = "[object Uint32Array]";
function ry(t, e, n) {
  var r = t.constructor;
  switch (e) {
    case Wg:
      return bg(t);
    case Fg:
    case Gg:
      return new r(+t);
    case zg:
      return Og(t);
    case qg:
    case Yg:
    case Xg:
    case Jg:
    case Zg:
    case Qg:
    case ey:
    case ty:
    case ny:
      return Dg(t);
    case Ug:
      return new r();
    case Bg:
    case Hg:
      return new r(t);
    case jg:
      return Pg(t);
    case Kg:
      return new r();
    case Vg:
      return Mg(t);
  }
}
function iy(t) {
  return typeof t.constructor == "function" && !fr(t) ? mp(Ic(t)) : {};
}
var sy = "[object Map]";
function ay(t) {
  return Be(t) && we(t) == sy;
}
var Bo = mt && mt.isMap, oy = Bo ? Gi(Bo) : ay, ly = "[object Set]";
function uy(t) {
  return Be(t) && we(t) == ly;
}
var jo = mt && mt.isSet, cy = jo ? Gi(jo) : uy, fy = 2, Oc = "[object Arguments]", dy = "[object Array]", hy = "[object Boolean]", py = "[object Date]", my = "[object Error]", Lc = "[object Function]", gy = "[object GeneratorFunction]", yy = "[object Map]", Ty = "[object Number]", Pc = "[object Object]", vy = "[object RegExp]", Ry = "[object Set]", Ay = "[object String]", Ey = "[object Symbol]", $y = "[object WeakMap]", xy = "[object ArrayBuffer]", Sy = "[object DataView]", ky = "[object Float32Array]", Iy = "[object Float64Array]", Cy = "[object Int8Array]", wy = "[object Int16Array]", Ny = "[object Int32Array]", _y = "[object Uint8Array]", by = "[object Uint8ClampedArray]", Oy = "[object Uint16Array]", Ly = "[object Uint32Array]", G = {};
G[Oc] = G[dy] = G[xy] = G[Sy] = G[hy] = G[py] = G[ky] = G[Iy] = G[Cy] = G[wy] = G[Ny] = G[yy] = G[Ty] = G[Pc] = G[vy] = G[Ry] = G[Ay] = G[Ey] = G[_y] = G[by] = G[Oy] = G[Ly] = !0;
G[my] = G[Lc] = G[$y] = !1;
function Hr(t, e, n, r, i, s) {
  var a, o = e & fy;
  if (a !== void 0)
    return a;
  if (!Oe(t))
    return t;
  var l = P(t);
  if (l)
    return a = _g(t), yp(t, a);
  var u = we(t), c = u == Lc || u == gy;
  if (tr(t))
    return gg(t);
  if (u == Pc || u == Oc || c && !i)
    return a = c ? {} : iy(t), o ? Ag(t, pg(a, t)) : vg(t, hg(a, t));
  if (!G[u])
    return i ? t : {};
  a = ry(t, u), s || (s = new qe());
  var f = s.get(t);
  if (f)
    return f;
  s.set(t, a), cy(t) ? t.forEach(function(m) {
    a.add(Hr(m, e, n, m, t, s));
  }) : oy(t) && t.forEach(function(m, g) {
    a.set(g, Hr(m, e, n, g, t, s));
  });
  var d = Us, h = l ? void 0 : d(t);
  return yc(h || t, function(m, g) {
    h && (g = m, m = t[g]), Di(a, g, Hr(m, e, n, g, t, s));
  }), a;
}
var Py = 4;
function se(t) {
  return Hr(t, Py);
}
function hr(t) {
  for (var e = -1, n = t == null ? 0 : t.length, r = 0, i = []; ++e < n; ) {
    var s = t[e];
    s && (i[r++] = s);
  }
  return i;
}
var My = "__lodash_hash_undefined__";
function Dy(t) {
  return this.__data__.set(t, My), this;
}
function Fy(t) {
  return this.__data__.has(t);
}
function en(t) {
  var e = -1, n = t == null ? 0 : t.length;
  for (this.__data__ = new dt(); ++e < n; )
    this.add(t[e]);
}
en.prototype.add = en.prototype.push = Dy;
en.prototype.has = Fy;
function Mc(t, e) {
  for (var n = -1, r = t == null ? 0 : t.length; ++n < r; )
    if (e(t[n], n, t))
      return !0;
  return !1;
}
function ja(t, e) {
  return t.has(e);
}
var Gy = 1, Uy = 2;
function Dc(t, e, n, r, i, s) {
  var a = n & Gy, o = t.length, l = e.length;
  if (o != l && !(a && l > o))
    return !1;
  var u = s.get(t), c = s.get(e);
  if (u && c)
    return u == e && c == t;
  var f = -1, d = !0, h = n & Uy ? new en() : void 0;
  for (s.set(t, e), s.set(e, t); ++f < o; ) {
    var m = t[f], g = e[f];
    if (r)
      var R = a ? r(g, m, f, e, t, s) : r(m, g, f, t, e, s);
    if (R !== void 0) {
      if (R)
        continue;
      d = !1;
      break;
    }
    if (h) {
      if (!Mc(e, function(y, E) {
        if (!ja(h, E) && (m === y || i(m, y, n, r, s)))
          return h.push(E);
      })) {
        d = !1;
        break;
      }
    } else if (!(m === g || i(m, g, n, r, s))) {
      d = !1;
      break;
    }
  }
  return s.delete(t), s.delete(e), d;
}
function By(t) {
  var e = -1, n = Array(t.size);
  return t.forEach(function(r, i) {
    n[++e] = [i, r];
  }), n;
}
function Ka(t) {
  var e = -1, n = Array(t.size);
  return t.forEach(function(r) {
    n[++e] = r;
  }), n;
}
var jy = 1, Ky = 2, Hy = "[object Boolean]", Vy = "[object Date]", Wy = "[object Error]", zy = "[object Map]", qy = "[object Number]", Yy = "[object RegExp]", Xy = "[object Set]", Jy = "[object String]", Zy = "[object Symbol]", Qy = "[object ArrayBuffer]", eT = "[object DataView]", Ko = be ? be.prototype : void 0, hs = Ko ? Ko.valueOf : void 0;
function tT(t, e, n, r, i, s, a) {
  switch (n) {
    case eT:
      if (t.byteLength != e.byteLength || t.byteOffset != e.byteOffset)
        return !1;
      t = t.buffer, e = e.buffer;
    case Qy:
      return !(t.byteLength != e.byteLength || !s(new ui(t), new ui(e)));
    case Hy:
    case Vy:
    case qy:
      return ur(+t, +e);
    case Wy:
      return t.name == e.name && t.message == e.message;
    case Yy:
    case Jy:
      return t == e + "";
    case zy:
      var o = By;
    case Xy:
      var l = r & jy;
      if (o || (o = Ka), t.size != e.size && !l)
        return !1;
      var u = a.get(t);
      if (u)
        return u == e;
      r |= Ky, a.set(t, e);
      var c = Dc(o(t), o(e), r, i, s, a);
      return a.delete(t), c;
    case Zy:
      if (hs)
        return hs.call(t) == hs.call(e);
  }
  return !1;
}
var nT = 1, rT = Object.prototype, iT = rT.hasOwnProperty;
function sT(t, e, n, r, i, s) {
  var a = n & nT, o = Us(t), l = o.length, u = Us(e), c = u.length;
  if (l != c && !a)
    return !1;
  for (var f = l; f--; ) {
    var d = o[f];
    if (!(a ? d in e : iT.call(e, d)))
      return !1;
  }
  var h = s.get(t), m = s.get(e);
  if (h && m)
    return h == e && m == t;
  var g = !0;
  s.set(t, e), s.set(e, t);
  for (var R = a; ++f < l; ) {
    d = o[f];
    var y = t[d], E = e[d];
    if (r)
      var v = a ? r(E, y, d, e, t, s) : r(y, E, d, t, e, s);
    if (!(v === void 0 ? y === E || i(y, E, n, r, s) : v)) {
      g = !1;
      break;
    }
    R || (R = d == "constructor");
  }
  if (g && !R) {
    var S = t.constructor, M = e.constructor;
    S != M && "constructor" in t && "constructor" in e && !(typeof S == "function" && S instanceof S && typeof M == "function" && M instanceof M) && (g = !1);
  }
  return s.delete(t), s.delete(e), g;
}
var aT = 1, Ho = "[object Arguments]", Vo = "[object Array]", Nr = "[object Object]", oT = Object.prototype, Wo = oT.hasOwnProperty;
function lT(t, e, n, r, i, s) {
  var a = P(t), o = P(e), l = a ? Vo : we(t), u = o ? Vo : we(e);
  l = l == Ho ? Nr : l, u = u == Ho ? Nr : u;
  var c = l == Nr, f = u == Nr, d = l == u;
  if (d && tr(t)) {
    if (!tr(e))
      return !1;
    a = !0, c = !1;
  }
  if (d && !c)
    return s || (s = new qe()), a || Oa(t) ? Dc(t, e, n, r, i, s) : tT(t, e, l, n, r, i, s);
  if (!(n & aT)) {
    var h = c && Wo.call(t, "__wrapped__"), m = f && Wo.call(e, "__wrapped__");
    if (h || m) {
      var g = h ? t.value() : t, R = m ? e.value() : e;
      return s || (s = new qe()), i(g, R, n, r, s);
    }
  }
  return d ? (s || (s = new qe()), sT(t, e, n, r, i, s)) : !1;
}
function Ha(t, e, n, r, i) {
  return t === e ? !0 : t == null || e == null || !Be(t) && !Be(e) ? t !== t && e !== e : lT(t, e, n, r, Ha, i);
}
var uT = 1, cT = 2;
function fT(t, e, n, r) {
  var i = n.length, s = i;
  if (t == null)
    return !s;
  for (t = Object(t); i--; ) {
    var a = n[i];
    if (a[2] ? a[1] !== t[a[0]] : !(a[0] in t))
      return !1;
  }
  for (; ++i < s; ) {
    a = n[i];
    var o = a[0], l = t[o], u = a[1];
    if (a[2]) {
      if (l === void 0 && !(o in t))
        return !1;
    } else {
      var c = new qe(), f;
      if (!(f === void 0 ? Ha(u, l, uT | cT, r, c) : f))
        return !1;
    }
  }
  return !0;
}
function Fc(t) {
  return t === t && !Oe(t);
}
function dT(t) {
  for (var e = Le(t), n = e.length; n--; ) {
    var r = e[n], i = t[r];
    e[n] = [r, i, Fc(i)];
  }
  return e;
}
function Gc(t, e) {
  return function(n) {
    return n == null ? !1 : n[t] === e && (e !== void 0 || t in Object(n));
  };
}
function hT(t) {
  var e = dT(t);
  return e.length == 1 && e[0][2] ? Gc(e[0][0], e[0][1]) : function(n) {
    return n === t || fT(n, t, e);
  };
}
function pT(t, e) {
  return t != null && e in Object(t);
}
function Uc(t, e, n) {
  e = ji(e, t);
  for (var r = -1, i = e.length, s = !1; ++r < i; ) {
    var a = dr(e[r]);
    if (!(s = t != null && n(t, a)))
      break;
    t = t[a];
  }
  return s || ++r != i ? s : (i = t == null ? 0 : t.length, !!i && ba(i) && Mi(a, i) && (P(t) || Fi(t)));
}
function mT(t, e) {
  return t != null && Uc(t, e, pT);
}
var gT = 1, yT = 2;
function TT(t, e) {
  return Pa(t) && Fc(e) ? Gc(dr(t), e) : function(n) {
    var r = ig(n, t);
    return r === void 0 && r === e ? mT(n, t) : Ha(e, r, gT | yT);
  };
}
function vT(t) {
  return function(e) {
    return e?.[t];
  };
}
function RT(t) {
  return function(e) {
    return Da(e, t);
  };
}
function AT(t) {
  return Pa(t) ? vT(dr(t)) : RT(t);
}
function Je(t) {
  return typeof t == "function" ? t : t == null ? Qt : typeof t == "object" ? P(t) ? TT(t[0], t[1]) : hT(t) : AT(t);
}
function ET(t, e, n, r) {
  for (var i = -1, s = t == null ? 0 : t.length; ++i < s; ) {
    var a = t[i];
    e(r, a, n(a), t);
  }
  return r;
}
function $T(t) {
  return function(e, n, r) {
    for (var i = -1, s = Object(e), a = r(e), o = a.length; o--; ) {
      var l = a[++i];
      if (n(s[l], l, s) === !1)
        break;
    }
    return e;
  };
}
var xT = $T();
function ST(t, e) {
  return t && xT(t, e, Le);
}
function kT(t, e) {
  return function(n, r) {
    if (n == null)
      return n;
    if (!Xe(n))
      return t(n, r);
    for (var i = n.length, s = -1, a = Object(n); ++s < i && r(a[s], s, a) !== !1; )
      ;
    return n;
  };
}
var jt = kT(ST);
function IT(t, e, n, r) {
  return jt(t, function(i, s, a) {
    e(r, i, n(i), a);
  }), r;
}
function CT(t, e) {
  return function(n, r) {
    var i = P(n) ? ET : IT, s = e ? e() : {};
    return i(n, t, Je(r), s);
  };
}
var Bc = Object.prototype, wT = Bc.hasOwnProperty, Va = _a(function(t, e) {
  t = Object(t);
  var n = -1, r = e.length, i = r > 2 ? e[2] : void 0;
  for (i && Rc(e[0], e[1], i) && (r = 1); ++n < r; )
    for (var s = e[n], a = La(s), o = -1, l = a.length; ++o < l; ) {
      var u = a[o], c = t[u];
      (c === void 0 || ur(c, Bc[u]) && !wT.call(t, u)) && (t[u] = s[u]);
    }
  return t;
});
function zo(t) {
  return Be(t) && Xe(t);
}
var NT = 200;
function _T(t, e, n, r) {
  var i = -1, s = vc, a = !0, o = t.length, l = [], u = e.length;
  if (!o)
    return l;
  e.length >= NT && (s = ja, a = !1, e = new en(e));
  e:
    for (; ++i < o; ) {
      var c = t[i], f = c;
      if (c = c !== 0 ? c : 0, a && f === f) {
        for (var d = u; d--; )
          if (e[d] === f)
            continue e;
        l.push(c);
      } else s(e, f, r) || l.push(c);
    }
  return l;
}
var Ki = _a(function(t, e) {
  return zo(t) ? _T(t, Ga(e, 1, zo, !0)) : [];
});
function tn(t) {
  var e = t == null ? 0 : t.length;
  return e ? t[e - 1] : void 0;
}
function te(t, e, n) {
  var r = t == null ? 0 : t.length;
  return r ? (e = e === void 0 ? 1 : Pi(e), Cc(t, e < 0 ? 0 : e, r)) : [];
}
function ir(t, e, n) {
  var r = t == null ? 0 : t.length;
  return r ? (e = e === void 0 ? 1 : Pi(e), e = r - e, Cc(t, 0, e < 0 ? 0 : e)) : [];
}
function bT(t) {
  return typeof t == "function" ? t : Qt;
}
function w(t, e) {
  var n = P(t) ? yc : jt;
  return n(t, bT(e));
}
function OT(t, e) {
  for (var n = -1, r = t == null ? 0 : t.length; ++n < r; )
    if (!e(t[n], n, t))
      return !1;
  return !0;
}
function LT(t, e) {
  var n = !0;
  return jt(t, function(r, i, s) {
    return n = !!e(r, i, s), n;
  }), n;
}
function Ue(t, e, n) {
  var r = P(t) ? OT : LT;
  return r(t, Je(e));
}
function jc(t, e) {
  var n = [];
  return jt(t, function(r, i, s) {
    e(r, i, s) && n.push(r);
  }), n;
}
function Pe(t, e) {
  var n = P(t) ? Ua : jc;
  return n(t, Je(e));
}
function PT(t) {
  return function(e, n, r) {
    var i = Object(e);
    if (!Xe(e)) {
      var s = Je(n);
      e = Le(e), n = function(o) {
        return s(i[o], o, i);
      };
    }
    var a = t(e, n, r);
    return a > -1 ? i[s ? e[a] : a] : void 0;
  };
}
var MT = Math.max;
function DT(t, e, n) {
  var r = t == null ? 0 : t.length;
  if (!r)
    return -1;
  var i = n == null ? 0 : Pi(n);
  return i < 0 && (i = MT(r + i, 0)), Tc(t, Je(e), i);
}
var nn = PT(DT);
function je(t) {
  return t && t.length ? t[0] : void 0;
}
function FT(t, e) {
  var n = -1, r = Xe(t) ? Array(t.length) : [];
  return jt(t, function(i, s, a) {
    r[++n] = e(i, s, a);
  }), r;
}
function I(t, e) {
  var n = P(t) ? Li : FT;
  return n(t, Je(e));
}
function Ne(t, e) {
  return Ga(I(t, e));
}
var GT = Object.prototype, UT = GT.hasOwnProperty, BT = CT(function(t, e, n) {
  UT.call(t, n) ? t[n].push(e) : Na(t, n, [e]);
}), jT = Object.prototype, KT = jT.hasOwnProperty;
function HT(t, e) {
  return t != null && KT.call(t, e);
}
function C(t, e) {
  return t != null && Uc(t, e, HT);
}
var VT = "[object String]";
function pe(t) {
  return typeof t == "string" || !P(t) && Be(t) && Rt(t) == VT;
}
function WT(t, e) {
  return Li(e, function(n) {
    return t[n];
  });
}
function J(t) {
  return t == null ? [] : WT(t, Le(t));
}
var zT = Math.max;
function de(t, e, n, r) {
  t = Xe(t) ? t : J(t), n = n ? Pi(n) : 0;
  var i = t.length;
  return n < 0 && (n = zT(i + n, 0)), pe(t) ? n <= i && t.indexOf(e, n) > -1 : !!i && wa(t, e, n) > -1;
}
function qo(t, e, n) {
  var r = t == null ? 0 : t.length;
  if (!r)
    return -1;
  var i = 0;
  return wa(t, e, i);
}
var qT = "[object Map]", YT = "[object Set]", XT = Object.prototype, JT = XT.hasOwnProperty;
function U(t) {
  if (t == null)
    return !0;
  if (Xe(t) && (P(t) || typeof t == "string" || typeof t.splice == "function" || tr(t) || Oa(t) || Fi(t)))
    return !t.length;
  var e = we(t);
  if (e == qT || e == YT)
    return !t.size;
  if (fr(t))
    return !kc(t).length;
  for (var n in t)
    if (JT.call(t, n))
      return !1;
  return !0;
}
var ZT = "[object RegExp]";
function QT(t) {
  return Be(t) && Rt(t) == ZT;
}
var Yo = mt && mt.isRegExp, ot = Yo ? Gi(Yo) : QT;
function lt(t) {
  return t === void 0;
}
var ev = "Expected a function";
function tv(t) {
  if (typeof t != "function")
    throw new TypeError(ev);
  return function() {
    var e = arguments;
    switch (e.length) {
      case 0:
        return !t.call(this);
      case 1:
        return !t.call(this, e[0]);
      case 2:
        return !t.call(this, e[0], e[1]);
      case 3:
        return !t.call(this, e[0], e[1], e[2]);
    }
    return !t.apply(this, e);
  };
}
function nv(t, e, n, r) {
  if (!Oe(t))
    return t;
  e = ji(e, t);
  for (var i = -1, s = e.length, a = s - 1, o = t; o != null && ++i < s; ) {
    var l = dr(e[i]), u = n;
    if (l === "__proto__" || l === "constructor" || l === "prototype")
      return t;
    if (i != a) {
      var c = o[l];
      u = void 0, u === void 0 && (u = Oe(c) ? c : Mi(e[i + 1]) ? [] : {});
    }
    Di(o, l, u), o = o[l];
  }
  return t;
}
function rv(t, e, n) {
  for (var r = -1, i = e.length, s = {}; ++r < i; ) {
    var a = e[r], o = Da(t, a);
    n(o, a) && nv(s, ji(a, t), o);
  }
  return s;
}
function Ke(t, e) {
  if (t == null)
    return {};
  var n = Li(Eg(t), function(r) {
    return [r];
  });
  return e = Je(e), rv(t, n, function(r, i) {
    return e(r, i[0]);
  });
}
function iv(t, e, n, r, i) {
  return i(t, function(s, a, o) {
    n = r ? (r = !1, s) : e(n, s, a, o);
  }), n;
}
function xe(t, e, n) {
  var r = P(t) ? ag : iv, i = arguments.length < 3;
  return r(t, Je(e), n, i, jt);
}
function Hi(t, e) {
  var n = P(t) ? Ua : jc;
  return n(t, tv(Je(e)));
}
function sv(t, e) {
  var n;
  return jt(t, function(r, i, s) {
    return n = e(r, i, s), !n;
  }), !!n;
}
function Kc(t, e, n) {
  var r = P(t) ? Mc : sv;
  return r(t, Je(e));
}
var av = 1 / 0, ov = Jt && 1 / Ka(new Jt([, -0]))[1] == av ? function(t) {
  return new Jt(t);
} : X, lv = 200;
function uv(t, e, n) {
  var r = -1, i = vc, s = t.length, a = !0, o = [], l = o;
  if (s >= lv) {
    var u = ov(t);
    if (u)
      return Ka(u);
    a = !1, i = ja, l = new en();
  } else
    l = o;
  e:
    for (; ++r < s; ) {
      var c = t[r], f = c;
      if (c = c !== 0 ? c : 0, a && f === f) {
        for (var d = l.length; d--; )
          if (l[d] === f)
            continue e;
        o.push(c);
      } else i(l, f, n) || (l !== o && l.push(f), o.push(c));
    }
  return o;
}
function Wa(t) {
  return t && t.length ? uv(t) : [];
}
function Ks(t) {
  console && console.error && console.error(`Error: ${t}`);
}
function Hc(t) {
  console && console.warn && console.warn(`Warning: ${t}`);
}
function Vc(t) {
  const e = (/* @__PURE__ */ new Date()).getTime(), n = t();
  return { time: (/* @__PURE__ */ new Date()).getTime() - e, value: n };
}
function Wc(t) {
  function e() {
  }
  e.prototype = t;
  const n = new e();
  function r() {
    return typeof n.bar;
  }
  return r(), r(), t;
}
function cv(t) {
  return fv(t) ? t.LABEL : t.name;
}
function fv(t) {
  return pe(t.LABEL) && t.LABEL !== "";
}
class Ze {
  get definition() {
    return this._definition;
  }
  set definition(e) {
    this._definition = e;
  }
  constructor(e) {
    this._definition = e;
  }
  accept(e) {
    e.visit(this), w(this.definition, (n) => {
      n.accept(e);
    });
  }
}
class ce extends Ze {
  constructor(e) {
    super([]), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
  set definition(e) {
  }
  get definition() {
    return this.referencedRule !== void 0 ? this.referencedRule.definition : [];
  }
  accept(e) {
    e.visit(this);
  }
}
class un extends Ze {
  constructor(e) {
    super(e.definition), this.orgText = "", $e(this, Ke(e, (n) => n !== void 0));
  }
}
class me extends Ze {
  constructor(e) {
    super(e.definition), this.ignoreAmbiguities = !1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
let ie = class extends Ze {
  constructor(e) {
    super(e.definition), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
};
class Se extends Ze {
  constructor(e) {
    super(e.definition), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
class ke extends Ze {
  constructor(e) {
    super(e.definition), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
class z extends Ze {
  constructor(e) {
    super(e.definition), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
class ge extends Ze {
  constructor(e) {
    super(e.definition), this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
class ye extends Ze {
  get definition() {
    return this._definition;
  }
  set definition(e) {
    this._definition = e;
  }
  constructor(e) {
    super(e.definition), this.idx = 1, this.ignoreAmbiguities = !1, this.hasPredicates = !1, $e(this, Ke(e, (n) => n !== void 0));
  }
}
class j {
  constructor(e) {
    this.idx = 1, $e(this, Ke(e, (n) => n !== void 0));
  }
  accept(e) {
    e.visit(this);
  }
}
function dv(t) {
  return I(t, Vr);
}
function Vr(t) {
  function e(n) {
    return I(n, Vr);
  }
  if (t instanceof ce) {
    const n = {
      type: "NonTerminal",
      name: t.nonTerminalName,
      idx: t.idx
    };
    return pe(t.label) && (n.label = t.label), n;
  } else {
    if (t instanceof me)
      return {
        type: "Alternative",
        definition: e(t.definition)
      };
    if (t instanceof ie)
      return {
        type: "Option",
        idx: t.idx,
        definition: e(t.definition)
      };
    if (t instanceof Se)
      return {
        type: "RepetitionMandatory",
        idx: t.idx,
        definition: e(t.definition)
      };
    if (t instanceof ke)
      return {
        type: "RepetitionMandatoryWithSeparator",
        idx: t.idx,
        separator: Vr(new j({ terminalType: t.separator })),
        definition: e(t.definition)
      };
    if (t instanceof ge)
      return {
        type: "RepetitionWithSeparator",
        idx: t.idx,
        separator: Vr(new j({ terminalType: t.separator })),
        definition: e(t.definition)
      };
    if (t instanceof z)
      return {
        type: "Repetition",
        idx: t.idx,
        definition: e(t.definition)
      };
    if (t instanceof ye)
      return {
        type: "Alternation",
        idx: t.idx,
        definition: e(t.definition)
      };
    if (t instanceof j) {
      const n = {
        type: "Terminal",
        name: t.terminalType.name,
        label: cv(t.terminalType),
        idx: t.idx
      };
      pe(t.label) && (n.terminalLabel = t.label);
      const r = t.terminalType.PATTERN;
      return t.terminalType.PATTERN && (n.pattern = ot(r) ? r.source : r), n;
    } else {
      if (t instanceof un)
        return {
          type: "Rule",
          name: t.name,
          orgText: t.orgText,
          definition: e(t.definition)
        };
      throw Error("non exhaustive match");
    }
  }
}
class cn {
  visit(e) {
    const n = e;
    switch (n.constructor) {
      case ce:
        return this.visitNonTerminal(n);
      case me:
        return this.visitAlternative(n);
      case ie:
        return this.visitOption(n);
      case Se:
        return this.visitRepetitionMandatory(n);
      case ke:
        return this.visitRepetitionMandatoryWithSeparator(n);
      case ge:
        return this.visitRepetitionWithSeparator(n);
      case z:
        return this.visitRepetition(n);
      case ye:
        return this.visitAlternation(n);
      case j:
        return this.visitTerminal(n);
      case un:
        return this.visitRule(n);
      /* c8 ignore next 2 */
      default:
        throw Error("non exhaustive match");
    }
  }
  /* c8 ignore next */
  visitNonTerminal(e) {
  }
  /* c8 ignore next */
  visitAlternative(e) {
  }
  /* c8 ignore next */
  visitOption(e) {
  }
  /* c8 ignore next */
  visitRepetition(e) {
  }
  /* c8 ignore next */
  visitRepetitionMandatory(e) {
  }
  /* c8 ignore next 3 */
  visitRepetitionMandatoryWithSeparator(e) {
  }
  /* c8 ignore next */
  visitRepetitionWithSeparator(e) {
  }
  /* c8 ignore next */
  visitAlternation(e) {
  }
  /* c8 ignore next */
  visitTerminal(e) {
  }
  /* c8 ignore next */
  visitRule(e) {
  }
}
function hv(t) {
  return t instanceof me || t instanceof ie || t instanceof z || t instanceof Se || t instanceof ke || t instanceof ge || t instanceof j || t instanceof un;
}
function ci(t, e = []) {
  return t instanceof ie || t instanceof z || t instanceof ge ? !0 : t instanceof ye ? Kc(t.definition, (r) => ci(r, e)) : t instanceof ce && de(e, t) ? !1 : t instanceof Ze ? (t instanceof ce && e.push(t), Ue(t.definition, (r) => ci(r, e))) : !1;
}
function pv(t) {
  return t instanceof ye;
}
function We(t) {
  if (t instanceof ce)
    return "SUBRULE";
  if (t instanceof ie)
    return "OPTION";
  if (t instanceof ye)
    return "OR";
  if (t instanceof Se)
    return "AT_LEAST_ONE";
  if (t instanceof ke)
    return "AT_LEAST_ONE_SEP";
  if (t instanceof ge)
    return "MANY_SEP";
  if (t instanceof z)
    return "MANY";
  if (t instanceof j)
    return "CONSUME";
  throw Error("non exhaustive match");
}
class Vi {
  walk(e, n = []) {
    w(e.definition, (r, i) => {
      const s = te(e.definition, i + 1);
      if (r instanceof ce)
        this.walkProdRef(r, s, n);
      else if (r instanceof j)
        this.walkTerminal(r, s, n);
      else if (r instanceof me)
        this.walkFlat(r, s, n);
      else if (r instanceof ie)
        this.walkOption(r, s, n);
      else if (r instanceof Se)
        this.walkAtLeastOne(r, s, n);
      else if (r instanceof ke)
        this.walkAtLeastOneSep(r, s, n);
      else if (r instanceof ge)
        this.walkManySep(r, s, n);
      else if (r instanceof z)
        this.walkMany(r, s, n);
      else if (r instanceof ye)
        this.walkOr(r, s, n);
      else
        throw Error("non exhaustive match");
    });
  }
  walkTerminal(e, n, r) {
  }
  walkProdRef(e, n, r) {
  }
  walkFlat(e, n, r) {
    const i = n.concat(r);
    this.walk(e, i);
  }
  walkOption(e, n, r) {
    const i = n.concat(r);
    this.walk(e, i);
  }
  walkAtLeastOne(e, n, r) {
    const i = [
      new ie({ definition: e.definition })
    ].concat(n, r);
    this.walk(e, i);
  }
  walkAtLeastOneSep(e, n, r) {
    const i = Xo(e, n, r);
    this.walk(e, i);
  }
  walkMany(e, n, r) {
    const i = [
      new ie({ definition: e.definition })
    ].concat(n, r);
    this.walk(e, i);
  }
  walkManySep(e, n, r) {
    const i = Xo(e, n, r);
    this.walk(e, i);
  }
  walkOr(e, n, r) {
    const i = n.concat(r);
    w(e.definition, (s) => {
      const a = new me({ definition: [s] });
      this.walk(a, i);
    });
  }
}
function Xo(t, e, n) {
  return [
    new ie({
      definition: [
        new j({ terminalType: t.separator })
      ].concat(t.definition)
    })
  ].concat(e, n);
}
function pr(t) {
  if (t instanceof ce)
    return pr(t.referencedRule);
  if (t instanceof j)
    return yv(t);
  if (hv(t))
    return mv(t);
  if (pv(t))
    return gv(t);
  throw Error("non exhaustive match");
}
function mv(t) {
  let e = [];
  const n = t.definition;
  let r = 0, i = n.length > r, s, a = !0;
  for (; i && a; )
    s = n[r], a = ci(s), e = e.concat(pr(s)), r = r + 1, i = n.length > r;
  return Wa(e);
}
function gv(t) {
  const e = I(t.definition, (n) => pr(n));
  return Wa(Ge(e));
}
function yv(t) {
  return [t.terminalType];
}
const zc = "_~IN~_";
class Tv extends Vi {
  constructor(e) {
    super(), this.topProd = e, this.follows = {};
  }
  startWalking() {
    return this.walk(this.topProd), this.follows;
  }
  walkTerminal(e, n, r) {
  }
  walkProdRef(e, n, r) {
    const i = Rv(e.referencedRule, e.idx) + this.topProd.name, s = n.concat(r), a = new me({ definition: s }), o = pr(a);
    this.follows[i] = o;
  }
}
function vv(t) {
  const e = {};
  return w(t, (n) => {
    const r = new Tv(n).startWalking();
    $e(e, r);
  }), e;
}
function Rv(t, e) {
  return t.name + e + zc;
}
let Wr = {};
const Av = new ac();
function Wi(t) {
  const e = t.toString();
  if (Wr.hasOwnProperty(e))
    return Wr[e];
  {
    const n = Av.pattern(e);
    return Wr[e] = n, n;
  }
}
function Ev() {
  Wr = {};
}
const qc = "Complement Sets are not supported for first char optimization", fi = `Unable to use "first char" lexer optimizations:
`;
function $v(t, e = !1) {
  try {
    const n = Wi(t);
    return Hs(n.value, {}, n.flags.ignoreCase);
  } catch (n) {
    if (n.message === qc)
      e && Hc(`${fi}	Unable to optimize: < ${t.toString()} >
	Complement Sets cannot be automatically optimized.
	This will disable the lexer's first char optimizations.
	See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#COMPLEMENT for details.`);
    else {
      let r = "";
      e && (r = `
	This will disable the lexer's first char optimizations.
	See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#REGEXP_PARSING for details.`), Ks(`${fi}
	Failed parsing: < ${t.toString()} >
	Using the @chevrotain/regexp-to-ast library
	Please open an issue at: https://github.com/chevrotain/chevrotain/issues` + r);
    }
  }
  return [];
}
function Hs(t, e, n) {
  switch (t.type) {
    case "Disjunction":
      for (let i = 0; i < t.value.length; i++)
        Hs(t.value[i], e, n);
      break;
    case "Alternative":
      const r = t.value;
      for (let i = 0; i < r.length; i++) {
        const s = r[i];
        switch (s.type) {
          case "EndAnchor":
          // A group back reference cannot affect potential starting char.
          // because if a back reference is the first production than automatically
          // the group being referenced has had to come BEFORE so its codes have already been added
          case "GroupBackReference":
          // assertions do not affect potential starting codes
          case "Lookahead":
          case "NegativeLookahead":
          case "StartAnchor":
          case "WordBoundary":
          case "NonWordBoundary":
            continue;
        }
        const a = s;
        switch (a.type) {
          case "Character":
            _r(a.value, e, n);
            break;
          case "Set":
            if (a.complement === !0)
              throw Error(qc);
            w(a.value, (l) => {
              if (typeof l == "number")
                _r(l, e, n);
              else {
                const u = l;
                if (n === !0)
                  for (let c = u.from; c <= u.to; c++)
                    _r(c, e, n);
                else {
                  for (let c = u.from; c <= u.to && c < Vn; c++)
                    _r(c, e, n);
                  if (u.to >= Vn) {
                    const c = u.from >= Vn ? u.from : Vn, f = u.to, d = gt(c), h = gt(f);
                    for (let m = d; m <= h; m++)
                      e[m] = m;
                  }
                }
              }
            });
            break;
          case "Group":
            Hs(a.value, e, n);
            break;
          /* istanbul ignore next */
          default:
            throw Error("Non Exhaustive Match");
        }
        const o = a.quantifier !== void 0 && a.quantifier.atLeast === 0;
        if (
          // A group may be optional due to empty contents /(?:)/
          // or if everything inside it is optional /((a)?)/
          a.type === "Group" && Vs(a) === !1 || // If this term is not a group it may only be optional if it has an optional quantifier
          a.type !== "Group" && o === !1
        )
          break;
      }
      break;
    /* istanbul ignore next */
    default:
      throw Error("non exhaustive match!");
  }
  return J(e);
}
function _r(t, e, n) {
  const r = gt(t);
  e[r] = r, n === !0 && xv(t, e);
}
function xv(t, e) {
  const n = String.fromCharCode(t), r = n.toUpperCase();
  if (r !== n) {
    const i = gt(r.charCodeAt(0));
    e[i] = i;
  } else {
    const i = n.toLowerCase();
    if (i !== n) {
      const s = gt(i.charCodeAt(0));
      e[s] = s;
    }
  }
}
function Jo(t, e) {
  return nn(t.value, (n) => {
    if (typeof n == "number")
      return de(e, n);
    {
      const r = n;
      return nn(e, (i) => r.from <= i && i <= r.to) !== void 0;
    }
  });
}
function Vs(t) {
  const e = t.quantifier;
  return e && e.atLeast === 0 ? !0 : t.value ? P(t.value) ? Ue(t.value, Vs) : Vs(t.value) : !1;
}
class Sv extends _i {
  constructor(e) {
    super(), this.targetCharCodes = e, this.found = !1;
  }
  visitChildren(e) {
    if (this.found !== !0) {
      switch (e.type) {
        case "Lookahead":
          this.visitLookahead(e);
          return;
        case "NegativeLookahead":
          this.visitNegativeLookahead(e);
          return;
      }
      super.visitChildren(e);
    }
  }
  visitCharacter(e) {
    de(this.targetCharCodes, e.value) && (this.found = !0);
  }
  visitSet(e) {
    e.complement ? Jo(e, this.targetCharCodes) === void 0 && (this.found = !0) : Jo(e, this.targetCharCodes) !== void 0 && (this.found = !0);
  }
}
function za(t, e) {
  if (e instanceof RegExp) {
    const n = Wi(e), r = new Sv(t);
    return r.visit(n), r.found;
  } else
    return nn(e, (n) => de(t, n.charCodeAt(0))) !== void 0;
}
const Mt = "PATTERN", Hn = "defaultMode", br = "modes";
let Yc = typeof new RegExp("(?:)").sticky == "boolean";
function kv(t, e) {
  e = Va(e, {
    useSticky: Yc,
    debug: !1,
    safeMode: !1,
    positionTracking: "full",
    lineTerminatorCharacters: ["\r", `
`],
    tracer: (E, v) => v()
  });
  const n = e.tracer;
  n("initCharCodeToOptimizedIndexMap", () => {
    Yv();
  });
  let r;
  n("Reject Lexer.NA", () => {
    r = Hi(t, (E) => E[Mt] === he.NA);
  });
  let i = !1, s;
  n("Transform Patterns", () => {
    i = !1, s = I(r, (E) => {
      const v = E[Mt];
      if (ot(v)) {
        const S = v.source;
        return S.length === 1 && // only these regExp meta characters which can appear in a length one regExp
        S !== "^" && S !== "$" && S !== "." && !v.ignoreCase ? S : S.length === 2 && S[0] === "\\" && // not a meta character
        !de([
          "d",
          "D",
          "s",
          "S",
          "t",
          "r",
          "n",
          "t",
          "0",
          "c",
          "b",
          "B",
          "f",
          "v",
          "w",
          "W"
        ], S[1]) ? S[1] : e.useSticky ? Qo(v) : Zo(v);
      } else {
        if (ct(v))
          return i = !0, { exec: v };
        if (typeof v == "object")
          return i = !0, v;
        if (typeof v == "string") {
          if (v.length === 1)
            return v;
          {
            const S = v.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"), M = new RegExp(S);
            return e.useSticky ? Qo(M) : Zo(M);
          }
        } else
          throw Error("non exhaustive match");
      }
    });
  });
  let a, o, l, u, c;
  n("misc mapping", () => {
    a = I(r, (E) => E.tokenTypeIdx), o = I(r, (E) => {
      const v = E.GROUP;
      if (v !== he.SKIPPED) {
        if (pe(v))
          return v;
        if (lt(v))
          return !1;
        throw Error("non exhaustive match");
      }
    }), l = I(r, (E) => {
      const v = E.LONGER_ALT;
      if (v)
        return P(v) ? I(v, (M) => qo(r, M)) : [qo(r, v)];
    }), u = I(r, (E) => E.PUSH_MODE), c = I(r, (E) => C(E, "POP_MODE"));
  });
  let f;
  n("Line Terminator Handling", () => {
    const E = Zc(e.lineTerminatorCharacters);
    f = I(r, (v) => !1), e.positionTracking !== "onlyOffset" && (f = I(r, (v) => C(v, "LINE_BREAKS") ? !!v.LINE_BREAKS : Jc(v, E) === !1 && za(E, v.PATTERN)));
  });
  let d, h, m, g;
  n("Misc Mapping #2", () => {
    d = I(r, Xc), h = I(s, Wv), m = xe(r, (E, v) => {
      const S = v.GROUP;
      return pe(S) && S !== he.SKIPPED && (E[S] = []), E;
    }, {}), g = I(s, (E, v) => ({
      pattern: s[v],
      longerAlt: l[v],
      canLineTerminator: f[v],
      isCustom: d[v],
      short: h[v],
      group: o[v],
      push: u[v],
      pop: c[v],
      tokenTypeIdx: a[v],
      tokenType: r[v]
    }));
  });
  let R = !0, y = [];
  return e.safeMode || n("First Char Optimization", () => {
    y = xe(r, (E, v, S) => {
      if (typeof v.PATTERN == "string") {
        const M = v.PATTERN.charCodeAt(0), ae = gt(M);
        ps(E, ae, g[S]);
      } else if (P(v.START_CHARS_HINT)) {
        let M;
        w(v.START_CHARS_HINT, (ae) => {
          const Me = typeof ae == "string" ? ae.charCodeAt(0) : ae, Te = gt(Me);
          M !== Te && (M = Te, ps(E, Te, g[S]));
        });
      } else if (ot(v.PATTERN))
        if (v.PATTERN.unicode)
          R = !1, e.ensureOptimizations && Ks(`${fi}	Unable to analyze < ${v.PATTERN.toString()} > pattern.
	The regexp unicode flag is not currently supported by the regexp-to-ast library.
	This will disable the lexer's first char optimizations.
	For details See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#UNICODE_OPTIMIZE`);
        else {
          const M = $v(v.PATTERN, e.ensureOptimizations);
          U(M) && (R = !1), w(M, (ae) => {
            ps(E, ae, g[S]);
          });
        }
      else
        e.ensureOptimizations && Ks(`${fi}	TokenType: <${v.name}> is using a custom token pattern without providing <start_chars_hint> parameter.
	This will disable the lexer's first char optimizations.
	For details See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#CUSTOM_OPTIMIZE`), R = !1;
      return E;
    }, []);
  }), {
    emptyGroups: m,
    patternIdxToConfig: g,
    charCodeToPatternIdxToConfig: y,
    hasCustom: i,
    canBeOptimized: R
  };
}
function Iv(t, e) {
  let n = [];
  const r = wv(t);
  n = n.concat(r.errors);
  const i = Nv(r.valid), s = i.valid;
  return n = n.concat(i.errors), n = n.concat(Cv(s)), n = n.concat(Fv(s)), n = n.concat(Gv(s, e)), n = n.concat(Uv(s)), n;
}
function Cv(t) {
  let e = [];
  const n = Pe(t, (r) => ot(r[Mt]));
  return e = e.concat(bv(n)), e = e.concat(Pv(n)), e = e.concat(Mv(n)), e = e.concat(Dv(n)), e = e.concat(Ov(n)), e;
}
function wv(t) {
  const e = Pe(t, (i) => !C(i, Mt)), n = I(e, (i) => ({
    message: "Token Type: ->" + i.name + "<- missing static 'PATTERN' property",
    type: q.MISSING_PATTERN,
    tokenTypes: [i]
  })), r = Ki(t, e);
  return { errors: n, valid: r };
}
function Nv(t) {
  const e = Pe(t, (i) => {
    const s = i[Mt];
    return !ot(s) && !ct(s) && !C(s, "exec") && !pe(s);
  }), n = I(e, (i) => ({
    message: "Token Type: ->" + i.name + "<- static 'PATTERN' can only be a RegExp, a Function matching the {CustomPatternMatcherFunc} type or an Object matching the {ICustomPattern} interface.",
    type: q.INVALID_PATTERN,
    tokenTypes: [i]
  })), r = Ki(t, e);
  return { errors: n, valid: r };
}
const _v = /[^\\][$]/;
function bv(t) {
  class e extends _i {
    constructor() {
      super(...arguments), this.found = !1;
    }
    visitEndAnchor(s) {
      this.found = !0;
    }
  }
  const n = Pe(t, (i) => {
    const s = i.PATTERN;
    try {
      const a = Wi(s), o = new e();
      return o.visit(a), o.found;
    } catch {
      return _v.test(s.source);
    }
  });
  return I(n, (i) => ({
    message: `Unexpected RegExp Anchor Error:
	Token Type: ->` + i.name + `<- static 'PATTERN' cannot contain end of input anchor '$'
	See chevrotain.io/docs/guide/resolving_lexer_errors.html#ANCHORS	for details.`,
    type: q.EOI_ANCHOR_FOUND,
    tokenTypes: [i]
  }));
}
function Ov(t) {
  const e = Pe(t, (r) => r.PATTERN.test(""));
  return I(e, (r) => ({
    message: "Token Type: ->" + r.name + "<- static 'PATTERN' must not match an empty string",
    type: q.EMPTY_MATCH_PATTERN,
    tokenTypes: [r]
  }));
}
const Lv = /[^\\[][\^]|^\^/;
function Pv(t) {
  class e extends _i {
    constructor() {
      super(...arguments), this.found = !1;
    }
    visitStartAnchor(s) {
      this.found = !0;
    }
  }
  const n = Pe(t, (i) => {
    const s = i.PATTERN;
    try {
      const a = Wi(s), o = new e();
      return o.visit(a), o.found;
    } catch {
      return Lv.test(s.source);
    }
  });
  return I(n, (i) => ({
    message: `Unexpected RegExp Anchor Error:
	Token Type: ->` + i.name + `<- static 'PATTERN' cannot contain start of input anchor '^'
	See https://chevrotain.io/docs/guide/resolving_lexer_errors.html#ANCHORS	for details.`,
    type: q.SOI_ANCHOR_FOUND,
    tokenTypes: [i]
  }));
}
function Mv(t) {
  const e = Pe(t, (r) => {
    const i = r[Mt];
    return i instanceof RegExp && (i.multiline || i.global);
  });
  return I(e, (r) => ({
    message: "Token Type: ->" + r.name + "<- static 'PATTERN' may NOT contain global('g') or multiline('m')",
    type: q.UNSUPPORTED_FLAGS_FOUND,
    tokenTypes: [r]
  }));
}
function Dv(t) {
  const e = [];
  let n = I(t, (s) => xe(t, (a, o) => (s.PATTERN.source === o.PATTERN.source && !de(e, o) && o.PATTERN !== he.NA && (e.push(o), a.push(o)), a), []));
  n = hr(n);
  const r = Pe(n, (s) => s.length > 1);
  return I(r, (s) => {
    const a = I(s, (l) => l.name);
    return {
      message: `The same RegExp pattern ->${je(s).PATTERN}<-has been used in all of the following Token Types: ${a.join(", ")} <-`,
      type: q.DUPLICATE_PATTERNS_FOUND,
      tokenTypes: s
    };
  });
}
function Fv(t) {
  const e = Pe(t, (r) => {
    if (!C(r, "GROUP"))
      return !1;
    const i = r.GROUP;
    return i !== he.SKIPPED && i !== he.NA && !pe(i);
  });
  return I(e, (r) => ({
    message: "Token Type: ->" + r.name + "<- static 'GROUP' can only be Lexer.SKIPPED/Lexer.NA/A String",
    type: q.INVALID_GROUP_TYPE_FOUND,
    tokenTypes: [r]
  }));
}
function Gv(t, e) {
  const n = Pe(t, (i) => i.PUSH_MODE !== void 0 && !de(e, i.PUSH_MODE));
  return I(n, (i) => ({
    message: `Token Type: ->${i.name}<- static 'PUSH_MODE' value cannot refer to a Lexer Mode ->${i.PUSH_MODE}<-which does not exist`,
    type: q.PUSH_MODE_DOES_NOT_EXIST,
    tokenTypes: [i]
  }));
}
function Uv(t) {
  const e = [], n = xe(t, (r, i, s) => {
    const a = i.PATTERN;
    return a === he.NA || (pe(a) ? r.push({ str: a, idx: s, tokenType: i }) : ot(a) && jv(a) && r.push({ str: a.source, idx: s, tokenType: i })), r;
  }, []);
  return w(t, (r, i) => {
    w(n, ({ str: s, idx: a, tokenType: o }) => {
      if (i < a && Bv(s, r.PATTERN)) {
        const l = `Token: ->${o.name}<- can never be matched.
Because it appears AFTER the Token Type ->${r.name}<-in the lexer's definition.
See https://chevrotain.io/docs/guide/resolving_lexer_errors.html#UNREACHABLE`;
        e.push({
          message: l,
          type: q.UNREACHABLE_PATTERN,
          tokenTypes: [r, o]
        });
      }
    });
  }), e;
}
function Bv(t, e) {
  if (ot(e)) {
    const n = e.exec(t);
    return n !== null && n.index === 0;
  } else {
    if (ct(e))
      return e(t, 0, [], {});
    if (C(e, "exec"))
      return e.exec(t, 0, [], {});
    if (typeof e == "string")
      return e === t;
    throw Error("non exhaustive match");
  }
}
function jv(t) {
  return nn([
    ".",
    "\\",
    "[",
    "]",
    "|",
    "^",
    "$",
    "(",
    ")",
    "?",
    "*",
    "+",
    "{"
  ], (n) => t.source.indexOf(n) !== -1) === void 0;
}
function Zo(t) {
  const e = t.ignoreCase ? "i" : "";
  return new RegExp(`^(?:${t.source})`, e);
}
function Qo(t) {
  const e = t.ignoreCase ? "iy" : "y";
  return new RegExp(`${t.source}`, e);
}
function Kv(t, e, n) {
  const r = [];
  return C(t, Hn) || r.push({
    message: "A MultiMode Lexer cannot be initialized without a <" + Hn + `> property in its definition
`,
    type: q.MULTI_MODE_LEXER_WITHOUT_DEFAULT_MODE
  }), C(t, br) || r.push({
    message: "A MultiMode Lexer cannot be initialized without a <" + br + `> property in its definition
`,
    type: q.MULTI_MODE_LEXER_WITHOUT_MODES_PROPERTY
  }), C(t, br) && C(t, Hn) && !C(t.modes, t.defaultMode) && r.push({
    message: `A MultiMode Lexer cannot be initialized with a ${Hn}: <${t.defaultMode}>which does not exist
`,
    type: q.MULTI_MODE_LEXER_DEFAULT_MODE_VALUE_DOES_NOT_EXIST
  }), C(t, br) && w(t.modes, (i, s) => {
    w(i, (a, o) => {
      if (lt(a))
        r.push({
          message: `A Lexer cannot be initialized using an undefined Token Type. Mode:<${s}> at index: <${o}>
`,
          type: q.LEXER_DEFINITION_CANNOT_CONTAIN_UNDEFINED
        });
      else if (C(a, "LONGER_ALT")) {
        const l = P(a.LONGER_ALT) ? a.LONGER_ALT : [a.LONGER_ALT];
        w(l, (u) => {
          !lt(u) && !de(i, u) && r.push({
            message: `A MultiMode Lexer cannot be initialized with a longer_alt <${u.name}> on token <${a.name}> outside of mode <${s}>
`,
            type: q.MULTI_MODE_LEXER_LONGER_ALT_NOT_IN_CURRENT_MODE
          });
        });
      }
    });
  }), r;
}
function Hv(t, e, n) {
  const r = [];
  let i = !1;
  const s = hr(Ge(J(t.modes))), a = Hi(s, (l) => l[Mt] === he.NA), o = Zc(n);
  return e && w(a, (l) => {
    const u = Jc(l, o);
    if (u !== !1) {
      const f = {
        message: qv(l, u),
        type: u.issue,
        tokenType: l
      };
      r.push(f);
    } else
      C(l, "LINE_BREAKS") ? l.LINE_BREAKS === !0 && (i = !0) : za(o, l.PATTERN) && (i = !0);
  }), e && !i && r.push({
    message: `Warning: No LINE_BREAKS Found.
	This Lexer has been defined to track line and column information,
	But none of the Token Types can be identified as matching a line terminator.
	See https://chevrotain.io/docs/guide/resolving_lexer_errors.html#LINE_BREAKS 
	for details.`,
    type: q.NO_LINE_BREAKS_FLAGS
  }), r;
}
function Vv(t) {
  const e = {}, n = Le(t);
  return w(n, (r) => {
    const i = t[r];
    if (P(i))
      e[r] = [];
    else
      throw Error("non exhaustive match");
  }), e;
}
function Xc(t) {
  const e = t.PATTERN;
  if (ot(e))
    return !1;
  if (ct(e))
    return !0;
  if (C(e, "exec"))
    return !0;
  if (pe(e))
    return !1;
  throw Error("non exhaustive match");
}
function Wv(t) {
  return pe(t) && t.length === 1 ? t.charCodeAt(0) : !1;
}
const zv = {
  // implements /\n|\r\n?/g.test
  test: function(t) {
    const e = t.length;
    for (let n = this.lastIndex; n < e; n++) {
      const r = t.charCodeAt(n);
      if (r === 10)
        return this.lastIndex = n + 1, !0;
      if (r === 13)
        return t.charCodeAt(n + 1) === 10 ? this.lastIndex = n + 2 : this.lastIndex = n + 1, !0;
    }
    return !1;
  },
  lastIndex: 0
};
function Jc(t, e) {
  if (C(t, "LINE_BREAKS"))
    return !1;
  if (ot(t.PATTERN)) {
    try {
      za(e, t.PATTERN);
    } catch (n) {
      return {
        issue: q.IDENTIFY_TERMINATOR,
        errMsg: n.message
      };
    }
    return !1;
  } else {
    if (pe(t.PATTERN))
      return !1;
    if (Xc(t))
      return { issue: q.CUSTOM_LINE_BREAK };
    throw Error("non exhaustive match");
  }
}
function qv(t, e) {
  if (e.issue === q.IDENTIFY_TERMINATOR)
    return `Warning: unable to identify line terminator usage in pattern.
	The problem is in the <${t.name}> Token Type
	 Root cause: ${e.errMsg}.
	For details See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#IDENTIFY_TERMINATOR`;
  if (e.issue === q.CUSTOM_LINE_BREAK)
    return `Warning: A Custom Token Pattern should specify the <line_breaks> option.
	The problem is in the <${t.name}> Token Type
	For details See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#CUSTOM_LINE_BREAK`;
  throw Error("non exhaustive match");
}
function Zc(t) {
  return I(t, (n) => pe(n) ? n.charCodeAt(0) : n);
}
function ps(t, e, n) {
  t[e] === void 0 ? t[e] = [n] : t[e].push(n);
}
const Vn = 256;
let zr = [];
function gt(t) {
  return t < Vn ? t : zr[t];
}
function Yv() {
  if (U(zr)) {
    zr = new Array(65536);
    for (let t = 0; t < 65536; t++)
      zr[t] = t > 255 ? 255 + ~~(t / 255) : t;
  }
}
function mr(t, e) {
  const n = t.tokenTypeIdx;
  return n === e.tokenTypeIdx ? !0 : e.isParent === !0 && e.categoryMatchesMap[n] === !0;
}
function di(t, e) {
  return t.tokenTypeIdx === e.tokenTypeIdx;
}
let el = 1;
const Qc = {};
function gr(t) {
  const e = Xv(t);
  Jv(e), Qv(e), Zv(e), w(e, (n) => {
    n.isParent = n.categoryMatches.length > 0;
  });
}
function Xv(t) {
  let e = se(t), n = t, r = !0;
  for (; r; ) {
    n = hr(Ge(I(n, (s) => s.CATEGORIES)));
    const i = Ki(n, e);
    e = e.concat(i), U(i) ? r = !1 : n = i;
  }
  return e;
}
function Jv(t) {
  w(t, (e) => {
    tf(e) || (Qc[el] = e, e.tokenTypeIdx = el++), tl(e) && !P(e.CATEGORIES) && (e.CATEGORIES = [e.CATEGORIES]), tl(e) || (e.CATEGORIES = []), eR(e) || (e.categoryMatches = []), tR(e) || (e.categoryMatchesMap = {});
  });
}
function Zv(t) {
  w(t, (e) => {
    e.categoryMatches = [], w(e.categoryMatchesMap, (n, r) => {
      e.categoryMatches.push(Qc[r].tokenTypeIdx);
    });
  });
}
function Qv(t) {
  w(t, (e) => {
    ef([], e);
  });
}
function ef(t, e) {
  w(t, (n) => {
    e.categoryMatchesMap[n.tokenTypeIdx] = !0;
  }), w(e.CATEGORIES, (n) => {
    const r = t.concat(e);
    de(r, n) || ef(r, n);
  });
}
function tf(t) {
  return C(t, "tokenTypeIdx");
}
function tl(t) {
  return C(t, "CATEGORIES");
}
function eR(t) {
  return C(t, "categoryMatches");
}
function tR(t) {
  return C(t, "categoryMatchesMap");
}
function nR(t) {
  return C(t, "tokenTypeIdx");
}
const Ws = {
  buildUnableToPopLexerModeMessage(t) {
    return `Unable to pop Lexer Mode after encountering Token ->${t.image}<- The Mode Stack is empty`;
  },
  buildUnexpectedCharactersMessage(t, e, n, r, i) {
    return `unexpected character: ->${t.charAt(e)}<- at offset: ${e}, skipped ${n} characters.`;
  }
};
var q;
(function(t) {
  t[t.MISSING_PATTERN = 0] = "MISSING_PATTERN", t[t.INVALID_PATTERN = 1] = "INVALID_PATTERN", t[t.EOI_ANCHOR_FOUND = 2] = "EOI_ANCHOR_FOUND", t[t.UNSUPPORTED_FLAGS_FOUND = 3] = "UNSUPPORTED_FLAGS_FOUND", t[t.DUPLICATE_PATTERNS_FOUND = 4] = "DUPLICATE_PATTERNS_FOUND", t[t.INVALID_GROUP_TYPE_FOUND = 5] = "INVALID_GROUP_TYPE_FOUND", t[t.PUSH_MODE_DOES_NOT_EXIST = 6] = "PUSH_MODE_DOES_NOT_EXIST", t[t.MULTI_MODE_LEXER_WITHOUT_DEFAULT_MODE = 7] = "MULTI_MODE_LEXER_WITHOUT_DEFAULT_MODE", t[t.MULTI_MODE_LEXER_WITHOUT_MODES_PROPERTY = 8] = "MULTI_MODE_LEXER_WITHOUT_MODES_PROPERTY", t[t.MULTI_MODE_LEXER_DEFAULT_MODE_VALUE_DOES_NOT_EXIST = 9] = "MULTI_MODE_LEXER_DEFAULT_MODE_VALUE_DOES_NOT_EXIST", t[t.LEXER_DEFINITION_CANNOT_CONTAIN_UNDEFINED = 10] = "LEXER_DEFINITION_CANNOT_CONTAIN_UNDEFINED", t[t.SOI_ANCHOR_FOUND = 11] = "SOI_ANCHOR_FOUND", t[t.EMPTY_MATCH_PATTERN = 12] = "EMPTY_MATCH_PATTERN", t[t.NO_LINE_BREAKS_FLAGS = 13] = "NO_LINE_BREAKS_FLAGS", t[t.UNREACHABLE_PATTERN = 14] = "UNREACHABLE_PATTERN", t[t.IDENTIFY_TERMINATOR = 15] = "IDENTIFY_TERMINATOR", t[t.CUSTOM_LINE_BREAK = 16] = "CUSTOM_LINE_BREAK", t[t.MULTI_MODE_LEXER_LONGER_ALT_NOT_IN_CURRENT_MODE = 17] = "MULTI_MODE_LEXER_LONGER_ALT_NOT_IN_CURRENT_MODE";
})(q || (q = {}));
const Wn = {
  deferDefinitionErrorsHandling: !1,
  positionTracking: "full",
  lineTerminatorsPattern: /\n|\r\n?/g,
  lineTerminatorCharacters: [`
`, "\r"],
  ensureOptimizations: !1,
  safeMode: !1,
  errorMessageProvider: Ws,
  traceInitPerf: !1,
  skipValidations: !1,
  recoveryEnabled: !0
};
Object.freeze(Wn);
class he {
  constructor(e, n = Wn) {
    if (this.lexerDefinition = e, this.lexerDefinitionErrors = [], this.lexerDefinitionWarning = [], this.patternIdxToConfig = {}, this.charCodeToPatternIdxToConfig = {}, this.modes = [], this.emptyGroups = {}, this.trackStartLines = !0, this.trackEndLines = !0, this.hasCustom = !1, this.canModeBeOptimized = {}, this.TRACE_INIT = (i, s) => {
      if (this.traceInitPerf === !0) {
        this.traceInitIndent++;
        const a = new Array(this.traceInitIndent + 1).join("	");
        this.traceInitIndent < this.traceInitMaxIdent && console.log(`${a}--> <${i}>`);
        const { time: o, value: l } = Vc(s), u = o > 10 ? console.warn : console.log;
        return this.traceInitIndent < this.traceInitMaxIdent && u(`${a}<-- <${i}> time: ${o}ms`), this.traceInitIndent--, l;
      } else
        return s();
    }, typeof n == "boolean")
      throw Error(`The second argument to the Lexer constructor is now an ILexerConfig Object.
a boolean 2nd argument is no longer supported`);
    this.config = $e({}, Wn, n);
    const r = this.config.traceInitPerf;
    r === !0 ? (this.traceInitMaxIdent = 1 / 0, this.traceInitPerf = !0) : typeof r == "number" && (this.traceInitMaxIdent = r, this.traceInitPerf = !0), this.traceInitIndent = -1, this.TRACE_INIT("Lexer Constructor", () => {
      let i, s = !0;
      this.TRACE_INIT("Lexer Config handling", () => {
        if (this.config.lineTerminatorsPattern === Wn.lineTerminatorsPattern)
          this.config.lineTerminatorsPattern = zv;
        else if (this.config.lineTerminatorCharacters === Wn.lineTerminatorCharacters)
          throw Error(`Error: Missing <lineTerminatorCharacters> property on the Lexer config.
	For details See: https://chevrotain.io/docs/guide/resolving_lexer_errors.html#MISSING_LINE_TERM_CHARS`);
        if (n.safeMode && n.ensureOptimizations)
          throw Error('"safeMode" and "ensureOptimizations" flags are mutually exclusive.');
        this.trackStartLines = /full|onlyStart/i.test(this.config.positionTracking), this.trackEndLines = /full/i.test(this.config.positionTracking), P(e) ? i = {
          modes: { defaultMode: se(e) },
          defaultMode: Hn
        } : (s = !1, i = se(e));
      }), this.config.skipValidations === !1 && (this.TRACE_INIT("performRuntimeChecks", () => {
        this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(Kv(i, this.trackStartLines, this.config.lineTerminatorCharacters));
      }), this.TRACE_INIT("performWarningRuntimeChecks", () => {
        this.lexerDefinitionWarning = this.lexerDefinitionWarning.concat(Hv(i, this.trackStartLines, this.config.lineTerminatorCharacters));
      })), i.modes = i.modes ? i.modes : {}, w(i.modes, (o, l) => {
        i.modes[l] = Hi(o, (u) => lt(u));
      });
      const a = Le(i.modes);
      if (w(i.modes, (o, l) => {
        this.TRACE_INIT(`Mode: <${l}> processing`, () => {
          if (this.modes.push(l), this.config.skipValidations === !1 && this.TRACE_INIT("validatePatterns", () => {
            this.lexerDefinitionErrors = this.lexerDefinitionErrors.concat(Iv(o, a));
          }), U(this.lexerDefinitionErrors)) {
            gr(o);
            let u;
            this.TRACE_INIT("analyzeTokenTypes", () => {
              u = kv(o, {
                lineTerminatorCharacters: this.config.lineTerminatorCharacters,
                positionTracking: n.positionTracking,
                ensureOptimizations: n.ensureOptimizations,
                safeMode: n.safeMode,
                tracer: this.TRACE_INIT
              });
            }), this.patternIdxToConfig[l] = u.patternIdxToConfig, this.charCodeToPatternIdxToConfig[l] = u.charCodeToPatternIdxToConfig, this.emptyGroups = $e({}, this.emptyGroups, u.emptyGroups), this.hasCustom = u.hasCustom || this.hasCustom, this.canModeBeOptimized[l] = u.canBeOptimized;
          }
        });
      }), this.defaultMode = i.defaultMode, !U(this.lexerDefinitionErrors) && !this.config.deferDefinitionErrorsHandling) {
        const l = I(this.lexerDefinitionErrors, (u) => u.message).join(`-----------------------
`);
        throw new Error(`Errors detected in definition of Lexer:
` + l);
      }
      w(this.lexerDefinitionWarning, (o) => {
        Hc(o.message);
      }), this.TRACE_INIT("Choosing sub-methods implementations", () => {
        if (Yc ? (this.chopInput = Qt, this.match = this.matchWithTest) : (this.updateLastIndex = X, this.match = this.matchWithExec), s && (this.handleModes = X), this.trackStartLines === !1 && (this.computeNewColumn = Qt), this.trackEndLines === !1 && (this.updateTokenEndLineColumnLocation = X), /full/i.test(this.config.positionTracking))
          this.createTokenInstance = this.createFullToken;
        else if (/onlyStart/i.test(this.config.positionTracking))
          this.createTokenInstance = this.createStartOnlyToken;
        else if (/onlyOffset/i.test(this.config.positionTracking))
          this.createTokenInstance = this.createOffsetOnlyToken;
        else
          throw Error(`Invalid <positionTracking> config option: "${this.config.positionTracking}"`);
        this.hasCustom ? (this.addToken = this.addTokenUsingPush, this.handlePayload = this.handlePayloadWithCustom) : (this.addToken = this.addTokenUsingMemberAccess, this.handlePayload = this.handlePayloadNoCustom);
      }), this.TRACE_INIT("Failed Optimization Warnings", () => {
        const o = xe(this.canModeBeOptimized, (l, u, c) => (u === !1 && l.push(c), l), []);
        if (n.ensureOptimizations && !U(o))
          throw Error(`Lexer Modes: < ${o.join(", ")} > cannot be optimized.
	 Disable the "ensureOptimizations" lexer config flag to silently ignore this and run the lexer in an un-optimized mode.
	 Or inspect the console log for details on how to resolve these issues.`);
      }), this.TRACE_INIT("clearRegExpParserCache", () => {
        Ev();
      }), this.TRACE_INIT("toFastProperties", () => {
        Wc(this);
      });
    });
  }
  tokenize(e, n = this.defaultMode) {
    if (!U(this.lexerDefinitionErrors)) {
      const i = I(this.lexerDefinitionErrors, (s) => s.message).join(`-----------------------
`);
      throw new Error(`Unable to Tokenize because Errors detected in definition of Lexer:
` + i);
    }
    return this.tokenizeInternal(e, n);
  }
  // There is quite a bit of duplication between this and "tokenizeInternalLazy"
  // This is intentional due to performance considerations.
  // this method also used quite a bit of `!` none null assertions because it is too optimized
  // for `tsc` to always understand it is "safe"
  tokenizeInternal(e, n) {
    let r, i, s, a, o, l, u, c, f, d, h, m, g, R, y;
    const E = e, v = E.length;
    let S = 0, M = 0;
    const ae = this.hasCustom ? 0 : Math.floor(e.length / 10), Me = new Array(ae), Te = [];
    let Ve = this.trackStartLines ? 1 : void 0, Ie = this.trackStartLines ? 1 : void 0;
    const $ = Vv(this.emptyGroups), T = this.trackStartLines, k = this.config.lineTerminatorsPattern;
    let x = 0, O = [], b = [];
    const _ = [], ve = [];
    Object.freeze(ve);
    let Z;
    function W() {
      return O;
    }
    function It(oe) {
      const Ce = gt(oe), Wt = b[Ce];
      return Wt === void 0 ? ve : Wt;
    }
    const Ad = (oe) => {
      if (_.length === 1 && // if we have both a POP_MODE and a PUSH_MODE this is in-fact a "transition"
      // So no error should occur.
      oe.tokenType.PUSH_MODE === void 0) {
        const Ce = this.config.errorMessageProvider.buildUnableToPopLexerModeMessage(oe);
        Te.push({
          offset: oe.startOffset,
          line: oe.startLine,
          column: oe.startColumn,
          length: oe.image.length,
          message: Ce
        });
      } else {
        _.pop();
        const Ce = tn(_);
        O = this.patternIdxToConfig[Ce], b = this.charCodeToPatternIdxToConfig[Ce], x = O.length;
        const Wt = this.canModeBeOptimized[Ce] && this.config.safeMode === !1;
        b && Wt ? Z = It : Z = W;
      }
    };
    function oo(oe) {
      _.push(oe), b = this.charCodeToPatternIdxToConfig[oe], O = this.patternIdxToConfig[oe], x = O.length, x = O.length;
      const Ce = this.canModeBeOptimized[oe] && this.config.safeMode === !1;
      b && Ce ? Z = It : Z = W;
    }
    oo.call(this, n);
    let De;
    const lo = this.config.recoveryEnabled;
    for (; S < v; ) {
      l = null;
      const oe = E.charCodeAt(S), Ce = Z(oe), Wt = Ce.length;
      for (r = 0; r < Wt; r++) {
        De = Ce[r];
        const Re = De.pattern;
        u = null;
        const Qe = De.short;
        if (Qe !== !1 ? oe === Qe && (l = Re) : De.isCustom === !0 ? (y = Re.exec(E, S, Me, $), y !== null ? (l = y[0], y.payload !== void 0 && (u = y.payload)) : l = null) : (this.updateLastIndex(Re, S), l = this.match(Re, e, S)), l !== null) {
          if (o = De.longerAlt, o !== void 0) {
            const ht = o.length;
            for (s = 0; s < ht; s++) {
              const et = O[o[s]], Ct = et.pattern;
              if (c = null, et.isCustom === !0 ? (y = Ct.exec(E, S, Me, $), y !== null ? (a = y[0], y.payload !== void 0 && (c = y.payload)) : a = null) : (this.updateLastIndex(Ct, S), a = this.match(Ct, e, S)), a && a.length > l.length) {
                l = a, u = c, De = et;
                break;
              }
            }
          }
          break;
        }
      }
      if (l !== null) {
        if (f = l.length, d = De.group, d !== void 0 && (h = De.tokenTypeIdx, m = this.createTokenInstance(l, S, h, De.tokenType, Ve, Ie, f), this.handlePayload(m, u), d === !1 ? M = this.addToken(Me, M, m) : $[d].push(m)), e = this.chopInput(e, f), S = S + f, Ie = this.computeNewColumn(Ie, f), T === !0 && De.canLineTerminator === !0) {
          let Re = 0, Qe, ht;
          k.lastIndex = 0;
          do
            Qe = k.test(l), Qe === !0 && (ht = k.lastIndex - 1, Re++);
          while (Qe === !0);
          Re !== 0 && (Ve = Ve + Re, Ie = f - ht, this.updateTokenEndLineColumnLocation(m, d, ht, Re, Ve, Ie, f));
        }
        this.handleModes(De, Ad, oo, m);
      } else {
        const Re = S, Qe = Ve, ht = Ie;
        let et = lo === !1;
        for (; et === !1 && S < v; )
          for (e = this.chopInput(e, 1), S++, i = 0; i < x; i++) {
            const Ct = O[i], ts = Ct.pattern, uo = Ct.short;
            if (uo !== !1 ? E.charCodeAt(S) === uo && (et = !0) : Ct.isCustom === !0 ? et = ts.exec(E, S, Me, $) !== null : (this.updateLastIndex(ts, S), et = ts.exec(e) !== null), et === !0)
              break;
          }
        if (g = S - Re, Ie = this.computeNewColumn(Ie, g), R = this.config.errorMessageProvider.buildUnexpectedCharactersMessage(E, Re, g, Qe, ht), Te.push({
          offset: Re,
          line: Qe,
          column: ht,
          length: g,
          message: R
        }), lo === !1)
          break;
      }
    }
    return this.hasCustom || (Me.length = M), {
      tokens: Me,
      groups: $,
      errors: Te
    };
  }
  handleModes(e, n, r, i) {
    if (e.pop === !0) {
      const s = e.push;
      n(i), s !== void 0 && r.call(this, s);
    } else e.push !== void 0 && r.call(this, e.push);
  }
  chopInput(e, n) {
    return e.substring(n);
  }
  updateLastIndex(e, n) {
    e.lastIndex = n;
  }
  // TODO: decrease this under 600 characters? inspect stripping comments option in TSC compiler
  updateTokenEndLineColumnLocation(e, n, r, i, s, a, o) {
    let l, u;
    n !== void 0 && (l = r === o - 1, u = l ? -1 : 0, i === 1 && l === !0 || (e.endLine = s + u, e.endColumn = a - 1 + -u));
  }
  computeNewColumn(e, n) {
    return e + n;
  }
  createOffsetOnlyToken(e, n, r, i) {
    return {
      image: e,
      startOffset: n,
      tokenTypeIdx: r,
      tokenType: i
    };
  }
  createStartOnlyToken(e, n, r, i, s, a) {
    return {
      image: e,
      startOffset: n,
      startLine: s,
      startColumn: a,
      tokenTypeIdx: r,
      tokenType: i
    };
  }
  createFullToken(e, n, r, i, s, a, o) {
    return {
      image: e,
      startOffset: n,
      endOffset: n + o - 1,
      startLine: s,
      endLine: s,
      startColumn: a,
      endColumn: a + o - 1,
      tokenTypeIdx: r,
      tokenType: i
    };
  }
  addTokenUsingPush(e, n, r) {
    return e.push(r), n;
  }
  addTokenUsingMemberAccess(e, n, r) {
    return e[n] = r, n++, n;
  }
  handlePayloadNoCustom(e, n) {
  }
  handlePayloadWithCustom(e, n) {
    n !== null && (e.payload = n);
  }
  matchWithTest(e, n, r) {
    return e.test(n) === !0 ? n.substring(r, e.lastIndex) : null;
  }
  matchWithExec(e, n) {
    const r = e.exec(n);
    return r !== null ? r[0] : null;
  }
}
he.SKIPPED = "This marks a skipped Token pattern, this means each token identified by it willbe consumed and then thrown into oblivion, this can be used to for example to completely ignore whitespace.";
he.NA = /NOT_APPLICABLE/;
function Zt(t) {
  return nf(t) ? t.LABEL : t.name;
}
function nf(t) {
  return pe(t.LABEL) && t.LABEL !== "";
}
const rR = "parent", nl = "categories", rl = "label", il = "group", sl = "push_mode", al = "pop_mode", ol = "longer_alt", ll = "line_breaks", ul = "start_chars_hint";
function rf(t) {
  return iR(t);
}
function iR(t) {
  const e = t.pattern, n = {};
  if (n.name = t.name, lt(e) || (n.PATTERN = e), C(t, rR))
    throw `The parent property is no longer supported.
See: https://github.com/chevrotain/chevrotain/issues/564#issuecomment-349062346 for details.`;
  return C(t, nl) && (n.CATEGORIES = t[nl]), gr([n]), C(t, rl) && (n.LABEL = t[rl]), C(t, il) && (n.GROUP = t[il]), C(t, al) && (n.POP_MODE = t[al]), C(t, sl) && (n.PUSH_MODE = t[sl]), C(t, ol) && (n.LONGER_ALT = t[ol]), C(t, ll) && (n.LINE_BREAKS = t[ll]), C(t, ul) && (n.START_CHARS_HINT = t[ul]), n;
}
const yt = rf({ name: "EOF", pattern: he.NA });
gr([yt]);
function qa(t, e, n, r, i, s, a, o) {
  return {
    image: e,
    startOffset: n,
    endOffset: r,
    startLine: i,
    endLine: s,
    startColumn: a,
    endColumn: o,
    tokenTypeIdx: t.tokenTypeIdx,
    tokenType: t
  };
}
function sf(t, e) {
  return mr(t, e);
}
const Yt = {
  buildMismatchTokenMessage({ expected: t, actual: e, previous: n, ruleName: r }) {
    return `Expecting ${nf(t) ? `--> ${Zt(t)} <--` : `token of type --> ${t.name} <--`} but found --> '${e.image}' <--`;
  },
  buildNotAllInputParsedMessage({ firstRedundant: t, ruleName: e }) {
    return "Redundant input, expecting EOF but found: " + t.image;
  },
  buildNoViableAltMessage({ expectedPathsPerAlt: t, actual: e, previous: n, customUserDescription: r, ruleName: i }) {
    const s = "Expecting: ", o = `
but found: '` + je(e).image + "'";
    if (r)
      return s + r + o;
    {
      const l = xe(t, (d, h) => d.concat(h), []), u = I(l, (d) => `[${I(d, (h) => Zt(h)).join(", ")}]`), f = `one of these possible Token sequences:
${I(u, (d, h) => `  ${h + 1}. ${d}`).join(`
`)}`;
      return s + f + o;
    }
  },
  buildEarlyExitMessage({ expectedIterationPaths: t, actual: e, customUserDescription: n, ruleName: r }) {
    const i = "Expecting: ", a = `
but found: '` + je(e).image + "'";
    if (n)
      return i + n + a;
    {
      const l = `expecting at least one iteration which starts with one of these possible Token sequences::
  <${I(t, (u) => `[${I(u, (c) => Zt(c)).join(",")}]`).join(" ,")}>`;
      return i + l + a;
    }
  }
};
Object.freeze(Yt);
const sR = {
  buildRuleNotFoundError(t, e) {
    return "Invalid grammar, reference to a rule which is not defined: ->" + e.nonTerminalName + `<-
inside top level rule: ->` + t.name + "<-";
  }
}, _t = {
  buildDuplicateFoundError(t, e) {
    function n(c) {
      return c instanceof j ? c.terminalType.name : c instanceof ce ? c.nonTerminalName : "";
    }
    const r = t.name, i = je(e), s = i.idx, a = We(i), o = n(i), l = s > 0;
    let u = `->${a}${l ? s : ""}<- ${o ? `with argument: ->${o}<-` : ""}
                  appears more than once (${e.length} times) in the top level rule: ->${r}<-.                  
                  For further details see: https://chevrotain.io/docs/FAQ.html#NUMERICAL_SUFFIXES 
                  `;
    return u = u.replace(/[ \t]+/g, " "), u = u.replace(/\s\s+/g, `
`), u;
  },
  buildNamespaceConflictError(t) {
    return `Namespace conflict found in grammar.
The grammar has both a Terminal(Token) and a Non-Terminal(Rule) named: <${t.name}>.
To resolve this make sure each Terminal and Non-Terminal names are unique
This is easy to accomplish by using the convention that Terminal names start with an uppercase letter
and Non-Terminal names start with a lower case letter.`;
  },
  buildAlternationPrefixAmbiguityError(t) {
    const e = I(t.prefixPath, (i) => Zt(i)).join(", "), n = t.alternation.idx === 0 ? "" : t.alternation.idx;
    return `Ambiguous alternatives: <${t.ambiguityIndices.join(" ,")}> due to common lookahead prefix
in <OR${n}> inside <${t.topLevelRule.name}> Rule,
<${e}> may appears as a prefix path in all these alternatives.
See: https://chevrotain.io/docs/guide/resolving_grammar_errors.html#COMMON_PREFIX
For Further details.`;
  },
  buildAlternationAmbiguityError(t) {
    const e = I(t.prefixPath, (i) => Zt(i)).join(", "), n = t.alternation.idx === 0 ? "" : t.alternation.idx;
    let r = `Ambiguous Alternatives Detected: <${t.ambiguityIndices.join(" ,")}> in <OR${n}> inside <${t.topLevelRule.name}> Rule,
<${e}> may appears as a prefix path in all these alternatives.
`;
    return r = r + `See: https://chevrotain.io/docs/guide/resolving_grammar_errors.html#AMBIGUOUS_ALTERNATIVES
For Further details.`, r;
  },
  buildEmptyRepetitionError(t) {
    let e = We(t.repetition);
    return t.repetition.idx !== 0 && (e += t.repetition.idx), `The repetition <${e}> within Rule <${t.topLevelRule.name}> can never consume any tokens.
This could lead to an infinite loop.`;
  },
  // TODO: remove - `errors_public` from nyc.config.js exclude
  //       once this method is fully removed from this file
  buildTokenNameError(t) {
    return "deprecated";
  },
  buildEmptyAlternationError(t) {
    return `Ambiguous empty alternative: <${t.emptyChoiceIdx + 1}> in <OR${t.alternation.idx}> inside <${t.topLevelRule.name}> Rule.
Only the last alternative may be an empty alternative.`;
  },
  buildTooManyAlternativesError(t) {
    return `An Alternation cannot have more than 256 alternatives:
<OR${t.alternation.idx}> inside <${t.topLevelRule.name}> Rule.
 has ${t.alternation.definition.length + 1} alternatives.`;
  },
  buildLeftRecursionError(t) {
    const e = t.topLevelRule.name, n = I(t.leftRecursionPath, (s) => s.name), r = `${e} --> ${n.concat([e]).join(" --> ")}`;
    return `Left Recursion found in grammar.
rule: <${e}> can be invoked from itself (directly or indirectly)
without consuming any Tokens. The grammar path that causes this is: 
 ${r}
 To fix this refactor your grammar to remove the left recursion.
see: https://en.wikipedia.org/wiki/LL_parser#Left_factoring.`;
  },
  // TODO: remove - `errors_public` from nyc.config.js exclude
  //       once this method is fully removed from this file
  buildInvalidRuleNameError(t) {
    return "deprecated";
  },
  buildDuplicateRuleNameError(t) {
    let e;
    return t.topLevelRule instanceof un ? e = t.topLevelRule.name : e = t.topLevelRule, `Duplicate definition, rule: ->${e}<- is already defined in the grammar: ->${t.grammarName}<-`;
  }
};
function aR(t, e) {
  const n = new oR(t, e);
  return n.resolveRefs(), n.errors;
}
class oR extends cn {
  constructor(e, n) {
    super(), this.nameToTopRule = e, this.errMsgProvider = n, this.errors = [];
  }
  resolveRefs() {
    w(J(this.nameToTopRule), (e) => {
      this.currTopLevel = e, e.accept(this);
    });
  }
  visitNonTerminal(e) {
    const n = this.nameToTopRule[e.nonTerminalName];
    if (n)
      e.referencedRule = n;
    else {
      const r = this.errMsgProvider.buildRuleNotFoundError(this.currTopLevel, e);
      this.errors.push({
        message: r,
        type: fe.UNRESOLVED_SUBRULE_REF,
        ruleName: this.currTopLevel.name,
        unresolvedRefName: e.nonTerminalName
      });
    }
  }
}
class lR extends Vi {
  constructor(e, n) {
    super(), this.topProd = e, this.path = n, this.possibleTokTypes = [], this.nextProductionName = "", this.nextProductionOccurrence = 0, this.found = !1, this.isAtEndOfPath = !1;
  }
  startWalking() {
    if (this.found = !1, this.path.ruleStack[0] !== this.topProd.name)
      throw Error("The path does not start with the walker's top Rule!");
    return this.ruleStack = se(this.path.ruleStack).reverse(), this.occurrenceStack = se(this.path.occurrenceStack).reverse(), this.ruleStack.pop(), this.occurrenceStack.pop(), this.updateExpectedNext(), this.walk(this.topProd), this.possibleTokTypes;
  }
  walk(e, n = []) {
    this.found || super.walk(e, n);
  }
  walkProdRef(e, n, r) {
    if (e.referencedRule.name === this.nextProductionName && e.idx === this.nextProductionOccurrence) {
      const i = n.concat(r);
      this.updateExpectedNext(), this.walk(e.referencedRule, i);
    }
  }
  updateExpectedNext() {
    U(this.ruleStack) ? (this.nextProductionName = "", this.nextProductionOccurrence = 0, this.isAtEndOfPath = !0) : (this.nextProductionName = this.ruleStack.pop(), this.nextProductionOccurrence = this.occurrenceStack.pop());
  }
}
class uR extends lR {
  constructor(e, n) {
    super(e, n), this.path = n, this.nextTerminalName = "", this.nextTerminalOccurrence = 0, this.nextTerminalName = this.path.lastTok.name, this.nextTerminalOccurrence = this.path.lastTokOccurrence;
  }
  walkTerminal(e, n, r) {
    if (this.isAtEndOfPath && e.terminalType.name === this.nextTerminalName && e.idx === this.nextTerminalOccurrence && !this.found) {
      const i = n.concat(r), s = new me({ definition: i });
      this.possibleTokTypes = pr(s), this.found = !0;
    }
  }
}
class zi extends Vi {
  constructor(e, n) {
    super(), this.topRule = e, this.occurrence = n, this.result = {
      token: void 0,
      occurrence: void 0,
      isEndOfRule: void 0
    };
  }
  startWalking() {
    return this.walk(this.topRule), this.result;
  }
}
class cR extends zi {
  walkMany(e, n, r) {
    if (e.idx === this.occurrence) {
      const i = je(n.concat(r));
      this.result.isEndOfRule = i === void 0, i instanceof j && (this.result.token = i.terminalType, this.result.occurrence = i.idx);
    } else
      super.walkMany(e, n, r);
  }
}
class cl extends zi {
  walkManySep(e, n, r) {
    if (e.idx === this.occurrence) {
      const i = je(n.concat(r));
      this.result.isEndOfRule = i === void 0, i instanceof j && (this.result.token = i.terminalType, this.result.occurrence = i.idx);
    } else
      super.walkManySep(e, n, r);
  }
}
class fR extends zi {
  walkAtLeastOne(e, n, r) {
    if (e.idx === this.occurrence) {
      const i = je(n.concat(r));
      this.result.isEndOfRule = i === void 0, i instanceof j && (this.result.token = i.terminalType, this.result.occurrence = i.idx);
    } else
      super.walkAtLeastOne(e, n, r);
  }
}
class fl extends zi {
  walkAtLeastOneSep(e, n, r) {
    if (e.idx === this.occurrence) {
      const i = je(n.concat(r));
      this.result.isEndOfRule = i === void 0, i instanceof j && (this.result.token = i.terminalType, this.result.occurrence = i.idx);
    } else
      super.walkAtLeastOneSep(e, n, r);
  }
}
function zs(t, e, n = []) {
  n = se(n);
  let r = [], i = 0;
  function s(o) {
    return o.concat(te(t, i + 1));
  }
  function a(o) {
    const l = zs(s(o), e, n);
    return r.concat(l);
  }
  for (; n.length < e && i < t.length; ) {
    const o = t[i];
    if (o instanceof me)
      return a(o.definition);
    if (o instanceof ce)
      return a(o.definition);
    if (o instanceof ie)
      r = a(o.definition);
    else if (o instanceof Se) {
      const l = o.definition.concat([
        new z({
          definition: o.definition
        })
      ]);
      return a(l);
    } else if (o instanceof ke) {
      const l = [
        new me({ definition: o.definition }),
        new z({
          definition: [new j({ terminalType: o.separator })].concat(o.definition)
        })
      ];
      return a(l);
    } else if (o instanceof ge) {
      const l = o.definition.concat([
        new z({
          definition: [new j({ terminalType: o.separator })].concat(o.definition)
        })
      ]);
      r = a(l);
    } else if (o instanceof z) {
      const l = o.definition.concat([
        new z({
          definition: o.definition
        })
      ]);
      r = a(l);
    } else {
      if (o instanceof ye)
        return w(o.definition, (l) => {
          U(l.definition) === !1 && (r = a(l.definition));
        }), r;
      if (o instanceof j)
        n.push(o.terminalType);
      else
        throw Error("non exhaustive match");
    }
    i++;
  }
  return r.push({
    partialPath: n,
    suffixDef: te(t, i)
  }), r;
}
function af(t, e, n, r) {
  const i = "EXIT_NONE_TERMINAL", s = [i], a = "EXIT_ALTERNATIVE";
  let o = !1;
  const l = e.length, u = l - r - 1, c = [], f = [];
  for (f.push({
    idx: -1,
    def: t,
    ruleStack: [],
    occurrenceStack: []
  }); !U(f); ) {
    const d = f.pop();
    if (d === a) {
      o && tn(f).idx <= u && f.pop();
      continue;
    }
    const h = d.def, m = d.idx, g = d.ruleStack, R = d.occurrenceStack;
    if (U(h))
      continue;
    const y = h[0];
    if (y === i) {
      const E = {
        idx: m,
        def: te(h),
        ruleStack: ir(g),
        occurrenceStack: ir(R)
      };
      f.push(E);
    } else if (y instanceof j)
      if (m < l - 1) {
        const E = m + 1, v = e[E];
        if (n(v, y.terminalType)) {
          const S = {
            idx: E,
            def: te(h),
            ruleStack: g,
            occurrenceStack: R
          };
          f.push(S);
        }
      } else if (m === l - 1)
        c.push({
          nextTokenType: y.terminalType,
          nextTokenOccurrence: y.idx,
          ruleStack: g,
          occurrenceStack: R
        }), o = !0;
      else
        throw Error("non exhaustive match");
    else if (y instanceof ce) {
      const E = se(g);
      E.push(y.nonTerminalName);
      const v = se(R);
      v.push(y.idx);
      const S = {
        idx: m,
        def: y.definition.concat(s, te(h)),
        ruleStack: E,
        occurrenceStack: v
      };
      f.push(S);
    } else if (y instanceof ie) {
      const E = {
        idx: m,
        def: te(h),
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(E), f.push(a);
      const v = {
        idx: m,
        def: y.definition.concat(te(h)),
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(v);
    } else if (y instanceof Se) {
      const E = new z({
        definition: y.definition,
        idx: y.idx
      }), v = y.definition.concat([E], te(h)), S = {
        idx: m,
        def: v,
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(S);
    } else if (y instanceof ke) {
      const E = new j({
        terminalType: y.separator
      }), v = new z({
        definition: [E].concat(y.definition),
        idx: y.idx
      }), S = y.definition.concat([v], te(h)), M = {
        idx: m,
        def: S,
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(M);
    } else if (y instanceof ge) {
      const E = {
        idx: m,
        def: te(h),
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(E), f.push(a);
      const v = new j({
        terminalType: y.separator
      }), S = new z({
        definition: [v].concat(y.definition),
        idx: y.idx
      }), M = y.definition.concat([S], te(h)), ae = {
        idx: m,
        def: M,
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(ae);
    } else if (y instanceof z) {
      const E = {
        idx: m,
        def: te(h),
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(E), f.push(a);
      const v = new z({
        definition: y.definition,
        idx: y.idx
      }), S = y.definition.concat([v], te(h)), M = {
        idx: m,
        def: S,
        ruleStack: g,
        occurrenceStack: R
      };
      f.push(M);
    } else if (y instanceof ye)
      for (let E = y.definition.length - 1; E >= 0; E--) {
        const v = y.definition[E], S = {
          idx: m,
          def: v.definition.concat(te(h)),
          ruleStack: g,
          occurrenceStack: R
        };
        f.push(S), f.push(a);
      }
    else if (y instanceof me)
      f.push({
        idx: m,
        def: y.definition.concat(te(h)),
        ruleStack: g,
        occurrenceStack: R
      });
    else if (y instanceof un)
      f.push(dR(y, m, g, R));
    else
      throw Error("non exhaustive match");
  }
  return c;
}
function dR(t, e, n, r) {
  const i = se(n);
  i.push(t.name);
  const s = se(r);
  return s.push(1), {
    idx: e,
    def: t.definition,
    ruleStack: i,
    occurrenceStack: s
  };
}
var H;
(function(t) {
  t[t.OPTION = 0] = "OPTION", t[t.REPETITION = 1] = "REPETITION", t[t.REPETITION_MANDATORY = 2] = "REPETITION_MANDATORY", t[t.REPETITION_MANDATORY_WITH_SEPARATOR = 3] = "REPETITION_MANDATORY_WITH_SEPARATOR", t[t.REPETITION_WITH_SEPARATOR = 4] = "REPETITION_WITH_SEPARATOR", t[t.ALTERNATION = 5] = "ALTERNATION";
})(H || (H = {}));
function Ya(t) {
  if (t instanceof ie || t === "Option")
    return H.OPTION;
  if (t instanceof z || t === "Repetition")
    return H.REPETITION;
  if (t instanceof Se || t === "RepetitionMandatory")
    return H.REPETITION_MANDATORY;
  if (t instanceof ke || t === "RepetitionMandatoryWithSeparator")
    return H.REPETITION_MANDATORY_WITH_SEPARATOR;
  if (t instanceof ge || t === "RepetitionWithSeparator")
    return H.REPETITION_WITH_SEPARATOR;
  if (t instanceof ye || t === "Alternation")
    return H.ALTERNATION;
  throw Error("non exhaustive match");
}
function dl(t) {
  const { occurrence: e, rule: n, prodType: r, maxLookahead: i } = t, s = Ya(r);
  return s === H.ALTERNATION ? qi(e, n, i) : Yi(e, n, s, i);
}
function hR(t, e, n, r, i, s) {
  const a = qi(t, e, n), o = uf(a) ? di : mr;
  return s(a, r, o, i);
}
function pR(t, e, n, r, i, s) {
  const a = Yi(t, e, i, n), o = uf(a) ? di : mr;
  return s(a[0], o, r);
}
function mR(t, e, n, r) {
  const i = t.length, s = Ue(t, (a) => Ue(a, (o) => o.length === 1));
  if (e)
    return function(a) {
      const o = I(a, (l) => l.GATE);
      for (let l = 0; l < i; l++) {
        const u = t[l], c = u.length, f = o[l];
        if (!(f !== void 0 && f.call(this) === !1))
          e: for (let d = 0; d < c; d++) {
            const h = u[d], m = h.length;
            for (let g = 0; g < m; g++) {
              const R = this.LA(g + 1);
              if (n(R, h[g]) === !1)
                continue e;
            }
            return l;
          }
      }
    };
  if (s && !r) {
    const a = I(t, (l) => Ge(l)), o = xe(a, (l, u, c) => (w(u, (f) => {
      C(l, f.tokenTypeIdx) || (l[f.tokenTypeIdx] = c), w(f.categoryMatches, (d) => {
        C(l, d) || (l[d] = c);
      });
    }), l), {});
    return function() {
      const l = this.LA(1);
      return o[l.tokenTypeIdx];
    };
  } else
    return function() {
      for (let a = 0; a < i; a++) {
        const o = t[a], l = o.length;
        e: for (let u = 0; u < l; u++) {
          const c = o[u], f = c.length;
          for (let d = 0; d < f; d++) {
            const h = this.LA(d + 1);
            if (n(h, c[d]) === !1)
              continue e;
          }
          return a;
        }
      }
    };
}
function gR(t, e, n) {
  const r = Ue(t, (s) => s.length === 1), i = t.length;
  if (r && !n) {
    const s = Ge(t);
    if (s.length === 1 && U(s[0].categoryMatches)) {
      const o = s[0].tokenTypeIdx;
      return function() {
        return this.LA(1).tokenTypeIdx === o;
      };
    } else {
      const a = xe(s, (o, l, u) => (o[l.tokenTypeIdx] = !0, w(l.categoryMatches, (c) => {
        o[c] = !0;
      }), o), []);
      return function() {
        const o = this.LA(1);
        return a[o.tokenTypeIdx] === !0;
      };
    }
  } else
    return function() {
      e: for (let s = 0; s < i; s++) {
        const a = t[s], o = a.length;
        for (let l = 0; l < o; l++) {
          const u = this.LA(l + 1);
          if (e(u, a[l]) === !1)
            continue e;
        }
        return !0;
      }
      return !1;
    };
}
class yR extends Vi {
  constructor(e, n, r) {
    super(), this.topProd = e, this.targetOccurrence = n, this.targetProdType = r;
  }
  startWalking() {
    return this.walk(this.topProd), this.restDef;
  }
  checkIsTarget(e, n, r, i) {
    return e.idx === this.targetOccurrence && this.targetProdType === n ? (this.restDef = r.concat(i), !0) : !1;
  }
  walkOption(e, n, r) {
    this.checkIsTarget(e, H.OPTION, n, r) || super.walkOption(e, n, r);
  }
  walkAtLeastOne(e, n, r) {
    this.checkIsTarget(e, H.REPETITION_MANDATORY, n, r) || super.walkOption(e, n, r);
  }
  walkAtLeastOneSep(e, n, r) {
    this.checkIsTarget(e, H.REPETITION_MANDATORY_WITH_SEPARATOR, n, r) || super.walkOption(e, n, r);
  }
  walkMany(e, n, r) {
    this.checkIsTarget(e, H.REPETITION, n, r) || super.walkOption(e, n, r);
  }
  walkManySep(e, n, r) {
    this.checkIsTarget(e, H.REPETITION_WITH_SEPARATOR, n, r) || super.walkOption(e, n, r);
  }
}
class of extends cn {
  constructor(e, n, r) {
    super(), this.targetOccurrence = e, this.targetProdType = n, this.targetRef = r, this.result = [];
  }
  checkIsTarget(e, n) {
    e.idx === this.targetOccurrence && this.targetProdType === n && (this.targetRef === void 0 || e === this.targetRef) && (this.result = e.definition);
  }
  visitOption(e) {
    this.checkIsTarget(e, H.OPTION);
  }
  visitRepetition(e) {
    this.checkIsTarget(e, H.REPETITION);
  }
  visitRepetitionMandatory(e) {
    this.checkIsTarget(e, H.REPETITION_MANDATORY);
  }
  visitRepetitionMandatoryWithSeparator(e) {
    this.checkIsTarget(e, H.REPETITION_MANDATORY_WITH_SEPARATOR);
  }
  visitRepetitionWithSeparator(e) {
    this.checkIsTarget(e, H.REPETITION_WITH_SEPARATOR);
  }
  visitAlternation(e) {
    this.checkIsTarget(e, H.ALTERNATION);
  }
}
function hl(t) {
  const e = new Array(t);
  for (let n = 0; n < t; n++)
    e[n] = [];
  return e;
}
function ms(t) {
  let e = [""];
  for (let n = 0; n < t.length; n++) {
    const r = t[n], i = [];
    for (let s = 0; s < e.length; s++) {
      const a = e[s];
      i.push(a + "_" + r.tokenTypeIdx);
      for (let o = 0; o < r.categoryMatches.length; o++) {
        const l = "_" + r.categoryMatches[o];
        i.push(a + l);
      }
    }
    e = i;
  }
  return e;
}
function TR(t, e, n) {
  for (let r = 0; r < t.length; r++) {
    if (r === n)
      continue;
    const i = t[r];
    for (let s = 0; s < e.length; s++) {
      const a = e[s];
      if (i[a] === !0)
        return !1;
    }
  }
  return !0;
}
function lf(t, e) {
  const n = I(t, (a) => zs([a], 1)), r = hl(n.length), i = I(n, (a) => {
    const o = {};
    return w(a, (l) => {
      const u = ms(l.partialPath);
      w(u, (c) => {
        o[c] = !0;
      });
    }), o;
  });
  let s = n;
  for (let a = 1; a <= e; a++) {
    const o = s;
    s = hl(o.length);
    for (let l = 0; l < o.length; l++) {
      const u = o[l];
      for (let c = 0; c < u.length; c++) {
        const f = u[c].partialPath, d = u[c].suffixDef, h = ms(f);
        if (TR(i, h, l) || U(d) || f.length === e) {
          const g = r[l];
          if (qs(g, f) === !1) {
            g.push(f);
            for (let R = 0; R < h.length; R++) {
              const y = h[R];
              i[l][y] = !0;
            }
          }
        } else {
          const g = zs(d, a + 1, f);
          s[l] = s[l].concat(g), w(g, (R) => {
            const y = ms(R.partialPath);
            w(y, (E) => {
              i[l][E] = !0;
            });
          });
        }
      }
    }
  }
  return r;
}
function qi(t, e, n, r) {
  const i = new of(t, H.ALTERNATION, r);
  return e.accept(i), lf(i.result, n);
}
function Yi(t, e, n, r) {
  const i = new of(t, n);
  e.accept(i);
  const s = i.result, o = new yR(e, t, n).startWalking(), l = new me({ definition: s }), u = new me({ definition: o });
  return lf([l, u], r);
}
function qs(t, e) {
  e: for (let n = 0; n < t.length; n++) {
    const r = t[n];
    if (r.length === e.length) {
      for (let i = 0; i < r.length; i++) {
        const s = e[i], a = r[i];
        if ((s === a || a.categoryMatchesMap[s.tokenTypeIdx] !== void 0) === !1)
          continue e;
      }
      return !0;
    }
  }
  return !1;
}
function vR(t, e) {
  return t.length < e.length && Ue(t, (n, r) => {
    const i = e[r];
    return n === i || i.categoryMatchesMap[n.tokenTypeIdx];
  });
}
function uf(t) {
  return Ue(t, (e) => Ue(e, (n) => Ue(n, (r) => U(r.categoryMatches))));
}
function RR(t) {
  const e = t.lookaheadStrategy.validate({
    rules: t.rules,
    tokenTypes: t.tokenTypes,
    grammarName: t.grammarName
  });
  return I(e, (n) => Object.assign({ type: fe.CUSTOM_LOOKAHEAD_VALIDATION }, n));
}
function AR(t, e, n, r) {
  const i = Ne(t, (l) => ER(l, n)), s = LR(t, e, n), a = Ne(t, (l) => NR(l, n)), o = Ne(t, (l) => SR(l, t, r, n));
  return i.concat(s, a, o);
}
function ER(t, e) {
  const n = new xR();
  t.accept(n);
  const r = n.allProductions, i = BT(r, $R), s = Ke(i, (o) => o.length > 1);
  return I(J(s), (o) => {
    const l = je(o), u = e.buildDuplicateFoundError(t, o), c = We(l), f = {
      message: u,
      type: fe.DUPLICATE_PRODUCTIONS,
      ruleName: t.name,
      dslName: c,
      occurrence: l.idx
    }, d = cf(l);
    return d && (f.parameter = d), f;
  });
}
function $R(t) {
  return `${We(t)}_#_${t.idx}_#_${cf(t)}`;
}
function cf(t) {
  return t instanceof j ? t.terminalType.name : t instanceof ce ? t.nonTerminalName : "";
}
class xR extends cn {
  constructor() {
    super(...arguments), this.allProductions = [];
  }
  visitNonTerminal(e) {
    this.allProductions.push(e);
  }
  visitOption(e) {
    this.allProductions.push(e);
  }
  visitRepetitionWithSeparator(e) {
    this.allProductions.push(e);
  }
  visitRepetitionMandatory(e) {
    this.allProductions.push(e);
  }
  visitRepetitionMandatoryWithSeparator(e) {
    this.allProductions.push(e);
  }
  visitRepetition(e) {
    this.allProductions.push(e);
  }
  visitAlternation(e) {
    this.allProductions.push(e);
  }
  visitTerminal(e) {
    this.allProductions.push(e);
  }
}
function SR(t, e, n, r) {
  const i = [];
  if (xe(e, (a, o) => o.name === t.name ? a + 1 : a, 0) > 1) {
    const a = r.buildDuplicateRuleNameError({
      topLevelRule: t,
      grammarName: n
    });
    i.push({
      message: a,
      type: fe.DUPLICATE_RULE_NAME,
      ruleName: t.name
    });
  }
  return i;
}
function kR(t, e, n) {
  const r = [];
  let i;
  return de(e, t) || (i = `Invalid rule override, rule: ->${t}<- cannot be overridden in the grammar: ->${n}<-as it is not defined in any of the super grammars `, r.push({
    message: i,
    type: fe.INVALID_RULE_OVERRIDE,
    ruleName: t
  })), r;
}
function ff(t, e, n, r = []) {
  const i = [], s = qr(e.definition);
  if (U(s))
    return [];
  {
    const a = t.name;
    de(s, t) && i.push({
      message: n.buildLeftRecursionError({
        topLevelRule: t,
        leftRecursionPath: r
      }),
      type: fe.LEFT_RECURSION,
      ruleName: a
    });
    const l = Ki(s, r.concat([t])), u = Ne(l, (c) => {
      const f = se(r);
      return f.push(c), ff(t, c, n, f);
    });
    return i.concat(u);
  }
}
function qr(t) {
  let e = [];
  if (U(t))
    return e;
  const n = je(t);
  if (n instanceof ce)
    e.push(n.referencedRule);
  else if (n instanceof me || n instanceof ie || n instanceof Se || n instanceof ke || n instanceof ge || n instanceof z)
    e = e.concat(qr(n.definition));
  else if (n instanceof ye)
    e = Ge(I(n.definition, (s) => qr(s.definition)));
  else if (!(n instanceof j)) throw Error("non exhaustive match");
  const r = ci(n), i = t.length > 1;
  if (r && i) {
    const s = te(t);
    return e.concat(qr(s));
  } else
    return e;
}
class Xa extends cn {
  constructor() {
    super(...arguments), this.alternations = [];
  }
  visitAlternation(e) {
    this.alternations.push(e);
  }
}
function IR(t, e) {
  const n = new Xa();
  t.accept(n);
  const r = n.alternations;
  return Ne(r, (s) => {
    const a = ir(s.definition);
    return Ne(a, (o, l) => {
      const u = af([o], [], mr, 1);
      return U(u) ? [
        {
          message: e.buildEmptyAlternationError({
            topLevelRule: t,
            alternation: s,
            emptyChoiceIdx: l
          }),
          type: fe.NONE_LAST_EMPTY_ALT,
          ruleName: t.name,
          occurrence: s.idx,
          alternative: l + 1
        }
      ] : [];
    });
  });
}
function CR(t, e, n) {
  const r = new Xa();
  t.accept(r);
  let i = r.alternations;
  return i = Hi(i, (a) => a.ignoreAmbiguities === !0), Ne(i, (a) => {
    const o = a.idx, l = a.maxLookahead || e, u = qi(o, t, l, a), c = bR(u, a, t, n), f = OR(u, a, t, n);
    return c.concat(f);
  });
}
class wR extends cn {
  constructor() {
    super(...arguments), this.allProductions = [];
  }
  visitRepetitionWithSeparator(e) {
    this.allProductions.push(e);
  }
  visitRepetitionMandatory(e) {
    this.allProductions.push(e);
  }
  visitRepetitionMandatoryWithSeparator(e) {
    this.allProductions.push(e);
  }
  visitRepetition(e) {
    this.allProductions.push(e);
  }
}
function NR(t, e) {
  const n = new Xa();
  t.accept(n);
  const r = n.alternations;
  return Ne(r, (s) => s.definition.length > 255 ? [
    {
      message: e.buildTooManyAlternativesError({
        topLevelRule: t,
        alternation: s
      }),
      type: fe.TOO_MANY_ALTS,
      ruleName: t.name,
      occurrence: s.idx
    }
  ] : []);
}
function _R(t, e, n) {
  const r = [];
  return w(t, (i) => {
    const s = new wR();
    i.accept(s);
    const a = s.allProductions;
    w(a, (o) => {
      const l = Ya(o), u = o.maxLookahead || e, c = o.idx, d = Yi(c, i, l, u)[0];
      if (U(Ge(d))) {
        const h = n.buildEmptyRepetitionError({
          topLevelRule: i,
          repetition: o
        });
        r.push({
          message: h,
          type: fe.NO_NON_EMPTY_LOOKAHEAD,
          ruleName: i.name
        });
      }
    });
  }), r;
}
function bR(t, e, n, r) {
  const i = [], s = xe(t, (o, l, u) => (e.definition[u].ignoreAmbiguities === !0 || w(l, (c) => {
    const f = [u];
    w(t, (d, h) => {
      u !== h && qs(d, c) && // ignore (skip) ambiguities with this "other" alternative
      e.definition[h].ignoreAmbiguities !== !0 && f.push(h);
    }), f.length > 1 && !qs(i, c) && (i.push(c), o.push({
      alts: f,
      path: c
    }));
  }), o), []);
  return I(s, (o) => {
    const l = I(o.alts, (c) => c + 1);
    return {
      message: r.buildAlternationAmbiguityError({
        topLevelRule: n,
        alternation: e,
        ambiguityIndices: l,
        prefixPath: o.path
      }),
      type: fe.AMBIGUOUS_ALTS,
      ruleName: n.name,
      occurrence: e.idx,
      alternatives: o.alts
    };
  });
}
function OR(t, e, n, r) {
  const i = xe(t, (a, o, l) => {
    const u = I(o, (c) => ({ idx: l, path: c }));
    return a.concat(u);
  }, []);
  return hr(Ne(i, (a) => {
    if (e.definition[a.idx].ignoreAmbiguities === !0)
      return [];
    const l = a.idx, u = a.path, c = Pe(i, (d) => (
      // ignore (skip) ambiguities with this "other" alternative
      e.definition[d.idx].ignoreAmbiguities !== !0 && d.idx < l && // checking for strict prefix because identical lookaheads
      // will be be detected using a different validation.
      vR(d.path, u)
    ));
    return I(c, (d) => {
      const h = [d.idx + 1, l + 1], m = e.idx === 0 ? "" : e.idx;
      return {
        message: r.buildAlternationPrefixAmbiguityError({
          topLevelRule: n,
          alternation: e,
          ambiguityIndices: h,
          prefixPath: d.path
        }),
        type: fe.AMBIGUOUS_PREFIX_ALTS,
        ruleName: n.name,
        occurrence: m,
        alternatives: h
      };
    });
  }));
}
function LR(t, e, n) {
  const r = [], i = I(e, (s) => s.name);
  return w(t, (s) => {
    const a = s.name;
    if (de(i, a)) {
      const o = n.buildNamespaceConflictError(s);
      r.push({
        message: o,
        type: fe.CONFLICT_TOKENS_RULES_NAMESPACE,
        ruleName: a
      });
    }
  }), r;
}
function PR(t) {
  const e = Va(t, {
    errMsgProvider: sR
  }), n = {};
  return w(t.rules, (r) => {
    n[r.name] = r;
  }), aR(n, e.errMsgProvider);
}
function MR(t) {
  return t = Va(t, {
    errMsgProvider: _t
  }), AR(t.rules, t.tokenTypes, t.errMsgProvider, t.grammarName);
}
const df = "MismatchedTokenException", hf = "NoViableAltException", pf = "EarlyExitException", mf = "NotAllInputParsedException", gf = [
  df,
  hf,
  pf,
  mf
];
Object.freeze(gf);
function hi(t) {
  return de(gf, t.name);
}
class Xi extends Error {
  constructor(e, n) {
    super(e), this.token = n, this.resyncedTokens = [], Object.setPrototypeOf(this, new.target.prototype), Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  }
}
class yf extends Xi {
  constructor(e, n, r) {
    super(e, n), this.previousToken = r, this.name = df;
  }
}
class DR extends Xi {
  constructor(e, n, r) {
    super(e, n), this.previousToken = r, this.name = hf;
  }
}
class FR extends Xi {
  constructor(e, n) {
    super(e, n), this.name = mf;
  }
}
class GR extends Xi {
  constructor(e, n, r) {
    super(e, n), this.previousToken = r, this.name = pf;
  }
}
const gs = {}, Tf = "InRuleRecoveryException";
class UR extends Error {
  constructor(e) {
    super(e), this.name = Tf;
  }
}
class BR {
  initRecoverable(e) {
    this.firstAfterRepMap = {}, this.resyncFollows = {}, this.recoveryEnabled = C(e, "recoveryEnabled") ? e.recoveryEnabled : ut.recoveryEnabled, this.recoveryEnabled && (this.attemptInRepetitionRecovery = jR);
  }
  getTokenToInsert(e) {
    const n = qa(e, "", NaN, NaN, NaN, NaN, NaN, NaN);
    return n.isInsertedInRecovery = !0, n;
  }
  canTokenTypeBeInsertedInRecovery(e) {
    return !0;
  }
  canTokenTypeBeDeletedInRecovery(e) {
    return !0;
  }
  tryInRepetitionRecovery(e, n, r, i) {
    const s = this.findReSyncTokenType(), a = this.exportLexerState(), o = [];
    let l = !1;
    const u = this.LA(1);
    let c = this.LA(1);
    const f = () => {
      const d = this.LA(0), h = this.errorMessageProvider.buildMismatchTokenMessage({
        expected: i,
        actual: u,
        previous: d,
        ruleName: this.getCurrRuleFullName()
      }), m = new yf(h, u, this.LA(0));
      m.resyncedTokens = ir(o), this.SAVE_ERROR(m);
    };
    for (; !l; )
      if (this.tokenMatcher(c, i)) {
        f();
        return;
      } else if (r.call(this)) {
        f(), e.apply(this, n);
        return;
      } else this.tokenMatcher(c, s) ? l = !0 : (c = this.SKIP_TOKEN(), this.addToResyncTokens(c, o));
    this.importLexerState(a);
  }
  shouldInRepetitionRecoveryBeTried(e, n, r) {
    return !(r === !1 || this.tokenMatcher(this.LA(1), e) || this.isBackTracking() || this.canPerformInRuleRecovery(e, this.getFollowsForInRuleRecovery(e, n)));
  }
  // Error Recovery functionality
  getFollowsForInRuleRecovery(e, n) {
    const r = this.getCurrentGrammarPath(e, n);
    return this.getNextPossibleTokenTypes(r);
  }
  tryInRuleRecovery(e, n) {
    if (this.canRecoverWithSingleTokenInsertion(e, n))
      return this.getTokenToInsert(e);
    if (this.canRecoverWithSingleTokenDeletion(e)) {
      const r = this.SKIP_TOKEN();
      return this.consumeToken(), r;
    }
    throw new UR("sad sad panda");
  }
  canPerformInRuleRecovery(e, n) {
    return this.canRecoverWithSingleTokenInsertion(e, n) || this.canRecoverWithSingleTokenDeletion(e);
  }
  canRecoverWithSingleTokenInsertion(e, n) {
    if (!this.canTokenTypeBeInsertedInRecovery(e) || U(n))
      return !1;
    const r = this.LA(1);
    return nn(n, (s) => this.tokenMatcher(r, s)) !== void 0;
  }
  canRecoverWithSingleTokenDeletion(e) {
    return this.canTokenTypeBeDeletedInRecovery(e) ? this.tokenMatcher(this.LA(2), e) : !1;
  }
  isInCurrentRuleReSyncSet(e) {
    const n = this.getCurrFollowKey(), r = this.getFollowSetFromFollowKey(n);
    return de(r, e);
  }
  findReSyncTokenType() {
    const e = this.flattenFollowSet();
    let n = this.LA(1), r = 2;
    for (; ; ) {
      const i = nn(e, (s) => sf(n, s));
      if (i !== void 0)
        return i;
      n = this.LA(r), r++;
    }
  }
  getCurrFollowKey() {
    if (this.RULE_STACK.length === 1)
      return gs;
    const e = this.getLastExplicitRuleShortName(), n = this.getLastExplicitRuleOccurrenceIndex(), r = this.getPreviousExplicitRuleShortName();
    return {
      ruleName: this.shortRuleNameToFullName(e),
      idxInCallingRule: n,
      inRule: this.shortRuleNameToFullName(r)
    };
  }
  buildFullFollowKeyStack() {
    const e = this.RULE_STACK, n = this.RULE_OCCURRENCE_STACK;
    return I(e, (r, i) => i === 0 ? gs : {
      ruleName: this.shortRuleNameToFullName(r),
      idxInCallingRule: n[i],
      inRule: this.shortRuleNameToFullName(e[i - 1])
    });
  }
  flattenFollowSet() {
    const e = I(this.buildFullFollowKeyStack(), (n) => this.getFollowSetFromFollowKey(n));
    return Ge(e);
  }
  getFollowSetFromFollowKey(e) {
    if (e === gs)
      return [yt];
    const n = e.ruleName + e.idxInCallingRule + zc + e.inRule;
    return this.resyncFollows[n];
  }
  // It does not make any sense to include a virtual EOF token in the list of resynced tokens
  // as EOF does not really exist and thus does not contain any useful information (line/column numbers)
  addToResyncTokens(e, n) {
    return this.tokenMatcher(e, yt) || n.push(e), n;
  }
  reSyncTo(e) {
    const n = [];
    let r = this.LA(1);
    for (; this.tokenMatcher(r, e) === !1; )
      r = this.SKIP_TOKEN(), this.addToResyncTokens(r, n);
    return ir(n);
  }
  attemptInRepetitionRecovery(e, n, r, i, s, a, o) {
  }
  getCurrentGrammarPath(e, n) {
    const r = this.getHumanReadableRuleStack(), i = se(this.RULE_OCCURRENCE_STACK);
    return {
      ruleStack: r,
      occurrenceStack: i,
      lastTok: e,
      lastTokOccurrence: n
    };
  }
  getHumanReadableRuleStack() {
    return I(this.RULE_STACK, (e) => this.shortRuleNameToFullName(e));
  }
}
function jR(t, e, n, r, i, s, a) {
  const o = this.getKeyForAutomaticLookahead(r, i);
  let l = this.firstAfterRepMap[o];
  if (l === void 0) {
    const d = this.getCurrRuleFullName(), h = this.getGAstProductions()[d];
    l = new s(h, i).startWalking(), this.firstAfterRepMap[o] = l;
  }
  let u = l.token, c = l.occurrence;
  const f = l.isEndOfRule;
  this.RULE_STACK.length === 1 && f && u === void 0 && (u = yt, c = 1), !(u === void 0 || c === void 0) && this.shouldInRepetitionRecoveryBeTried(u, c, a) && this.tryInRepetitionRecovery(t, e, n, u);
}
const KR = 4, At = 8, vf = 1 << At, Rf = 2 << At, Ys = 3 << At, Xs = 4 << At, Js = 5 << At, Yr = 6 << At;
function ys(t, e, n) {
  return n | e | t;
}
class Ja {
  constructor(e) {
    var n;
    this.maxLookahead = (n = e?.maxLookahead) !== null && n !== void 0 ? n : ut.maxLookahead;
  }
  validate(e) {
    const n = this.validateNoLeftRecursion(e.rules);
    if (U(n)) {
      const r = this.validateEmptyOrAlternatives(e.rules), i = this.validateAmbiguousAlternationAlternatives(e.rules, this.maxLookahead), s = this.validateSomeNonEmptyLookaheadPath(e.rules, this.maxLookahead);
      return [
        ...n,
        ...r,
        ...i,
        ...s
      ];
    }
    return n;
  }
  validateNoLeftRecursion(e) {
    return Ne(e, (n) => ff(n, n, _t));
  }
  validateEmptyOrAlternatives(e) {
    return Ne(e, (n) => IR(n, _t));
  }
  validateAmbiguousAlternationAlternatives(e, n) {
    return Ne(e, (r) => CR(r, n, _t));
  }
  validateSomeNonEmptyLookaheadPath(e, n) {
    return _R(e, n, _t);
  }
  buildLookaheadForAlternation(e) {
    return hR(e.prodOccurrence, e.rule, e.maxLookahead, e.hasPredicates, e.dynamicTokensEnabled, mR);
  }
  buildLookaheadForOptional(e) {
    return pR(e.prodOccurrence, e.rule, e.maxLookahead, e.dynamicTokensEnabled, Ya(e.prodType), gR);
  }
}
class HR {
  initLooksAhead(e) {
    this.dynamicTokensEnabled = C(e, "dynamicTokensEnabled") ? e.dynamicTokensEnabled : ut.dynamicTokensEnabled, this.maxLookahead = C(e, "maxLookahead") ? e.maxLookahead : ut.maxLookahead, this.lookaheadStrategy = C(e, "lookaheadStrategy") ? e.lookaheadStrategy : new Ja({ maxLookahead: this.maxLookahead }), this.lookAheadFuncsCache = /* @__PURE__ */ new Map();
  }
  preComputeLookaheadFunctions(e) {
    w(e, (n) => {
      this.TRACE_INIT(`${n.name} Rule Lookahead`, () => {
        const { alternation: r, repetition: i, option: s, repetitionMandatory: a, repetitionMandatoryWithSeparator: o, repetitionWithSeparator: l } = WR(n);
        w(r, (u) => {
          const c = u.idx === 0 ? "" : u.idx;
          this.TRACE_INIT(`${We(u)}${c}`, () => {
            const f = this.lookaheadStrategy.buildLookaheadForAlternation({
              prodOccurrence: u.idx,
              rule: n,
              maxLookahead: u.maxLookahead || this.maxLookahead,
              hasPredicates: u.hasPredicates,
              dynamicTokensEnabled: this.dynamicTokensEnabled
            }), d = ys(this.fullRuleNameToShort[n.name], vf, u.idx);
            this.setLaFuncCache(d, f);
          });
        }), w(i, (u) => {
          this.computeLookaheadFunc(n, u.idx, Ys, "Repetition", u.maxLookahead, We(u));
        }), w(s, (u) => {
          this.computeLookaheadFunc(n, u.idx, Rf, "Option", u.maxLookahead, We(u));
        }), w(a, (u) => {
          this.computeLookaheadFunc(n, u.idx, Xs, "RepetitionMandatory", u.maxLookahead, We(u));
        }), w(o, (u) => {
          this.computeLookaheadFunc(n, u.idx, Yr, "RepetitionMandatoryWithSeparator", u.maxLookahead, We(u));
        }), w(l, (u) => {
          this.computeLookaheadFunc(n, u.idx, Js, "RepetitionWithSeparator", u.maxLookahead, We(u));
        });
      });
    });
  }
  computeLookaheadFunc(e, n, r, i, s, a) {
    this.TRACE_INIT(`${a}${n === 0 ? "" : n}`, () => {
      const o = this.lookaheadStrategy.buildLookaheadForOptional({
        prodOccurrence: n,
        rule: e,
        maxLookahead: s || this.maxLookahead,
        dynamicTokensEnabled: this.dynamicTokensEnabled,
        prodType: i
      }), l = ys(this.fullRuleNameToShort[e.name], r, n);
      this.setLaFuncCache(l, o);
    });
  }
  // this actually returns a number, but it is always used as a string (object prop key)
  getKeyForAutomaticLookahead(e, n) {
    const r = this.getLastExplicitRuleShortName();
    return ys(r, e, n);
  }
  getLaFuncFromCache(e) {
    return this.lookAheadFuncsCache.get(e);
  }
  /* istanbul ignore next */
  setLaFuncCache(e, n) {
    this.lookAheadFuncsCache.set(e, n);
  }
}
class VR extends cn {
  constructor() {
    super(...arguments), this.dslMethods = {
      option: [],
      alternation: [],
      repetition: [],
      repetitionWithSeparator: [],
      repetitionMandatory: [],
      repetitionMandatoryWithSeparator: []
    };
  }
  reset() {
    this.dslMethods = {
      option: [],
      alternation: [],
      repetition: [],
      repetitionWithSeparator: [],
      repetitionMandatory: [],
      repetitionMandatoryWithSeparator: []
    };
  }
  visitOption(e) {
    this.dslMethods.option.push(e);
  }
  visitRepetitionWithSeparator(e) {
    this.dslMethods.repetitionWithSeparator.push(e);
  }
  visitRepetitionMandatory(e) {
    this.dslMethods.repetitionMandatory.push(e);
  }
  visitRepetitionMandatoryWithSeparator(e) {
    this.dslMethods.repetitionMandatoryWithSeparator.push(e);
  }
  visitRepetition(e) {
    this.dslMethods.repetition.push(e);
  }
  visitAlternation(e) {
    this.dslMethods.alternation.push(e);
  }
}
const Or = new VR();
function WR(t) {
  Or.reset(), t.accept(Or);
  const e = Or.dslMethods;
  return Or.reset(), e;
}
function pl(t, e) {
  isNaN(t.startOffset) === !0 ? (t.startOffset = e.startOffset, t.endOffset = e.endOffset) : t.endOffset < e.endOffset && (t.endOffset = e.endOffset);
}
function ml(t, e) {
  isNaN(t.startOffset) === !0 ? (t.startOffset = e.startOffset, t.startColumn = e.startColumn, t.startLine = e.startLine, t.endOffset = e.endOffset, t.endColumn = e.endColumn, t.endLine = e.endLine) : t.endOffset < e.endOffset && (t.endOffset = e.endOffset, t.endColumn = e.endColumn, t.endLine = e.endLine);
}
function zR(t, e, n) {
  t.children[n] === void 0 ? t.children[n] = [e] : t.children[n].push(e);
}
function qR(t, e, n) {
  t.children[e] === void 0 ? t.children[e] = [n] : t.children[e].push(n);
}
const YR = "name";
function Af(t, e) {
  Object.defineProperty(t, YR, {
    enumerable: !1,
    configurable: !0,
    writable: !1,
    value: e
  });
}
function XR(t, e) {
  const n = Le(t), r = n.length;
  for (let i = 0; i < r; i++) {
    const s = n[i], a = t[s], o = a.length;
    for (let l = 0; l < o; l++) {
      const u = a[l];
      u.tokenTypeIdx === void 0 && this[u.name](u.children, e);
    }
  }
}
function JR(t, e) {
  const n = function() {
  };
  Af(n, t + "BaseSemantics");
  const r = {
    visit: function(i, s) {
      if (P(i) && (i = i[0]), !lt(i))
        return this[i.name](i.children, s);
    },
    validateVisitor: function() {
      const i = QR(this, e);
      if (!U(i)) {
        const s = I(i, (a) => a.msg);
        throw Error(`Errors Detected in CST Visitor <${this.constructor.name}>:
	${s.join(`

`).replace(/\n/g, `
	`)}`);
      }
    }
  };
  return n.prototype = r, n.prototype.constructor = n, n._RULE_NAMES = e, n;
}
function ZR(t, e, n) {
  const r = function() {
  };
  Af(r, t + "BaseSemanticsWithDefaults");
  const i = Object.create(n.prototype);
  return w(e, (s) => {
    i[s] = XR;
  }), r.prototype = i, r.prototype.constructor = r, r;
}
var Zs;
(function(t) {
  t[t.REDUNDANT_METHOD = 0] = "REDUNDANT_METHOD", t[t.MISSING_METHOD = 1] = "MISSING_METHOD";
})(Zs || (Zs = {}));
function QR(t, e) {
  return eA(t, e);
}
function eA(t, e) {
  const n = Pe(e, (i) => ct(t[i]) === !1), r = I(n, (i) => ({
    msg: `Missing visitor method: <${i}> on ${t.constructor.name} CST Visitor.`,
    type: Zs.MISSING_METHOD,
    methodName: i
  }));
  return hr(r);
}
class tA {
  initTreeBuilder(e) {
    if (this.CST_STACK = [], this.outputCst = e.outputCst, this.nodeLocationTracking = C(e, "nodeLocationTracking") ? e.nodeLocationTracking : ut.nodeLocationTracking, !this.outputCst)
      this.cstInvocationStateUpdate = X, this.cstFinallyStateUpdate = X, this.cstPostTerminal = X, this.cstPostNonTerminal = X, this.cstPostRule = X;
    else if (/full/i.test(this.nodeLocationTracking))
      this.recoveryEnabled ? (this.setNodeLocationFromToken = ml, this.setNodeLocationFromNode = ml, this.cstPostRule = X, this.setInitialNodeLocation = this.setInitialNodeLocationFullRecovery) : (this.setNodeLocationFromToken = X, this.setNodeLocationFromNode = X, this.cstPostRule = this.cstPostRuleFull, this.setInitialNodeLocation = this.setInitialNodeLocationFullRegular);
    else if (/onlyOffset/i.test(this.nodeLocationTracking))
      this.recoveryEnabled ? (this.setNodeLocationFromToken = pl, this.setNodeLocationFromNode = pl, this.cstPostRule = X, this.setInitialNodeLocation = this.setInitialNodeLocationOnlyOffsetRecovery) : (this.setNodeLocationFromToken = X, this.setNodeLocationFromNode = X, this.cstPostRule = this.cstPostRuleOnlyOffset, this.setInitialNodeLocation = this.setInitialNodeLocationOnlyOffsetRegular);
    else if (/none/i.test(this.nodeLocationTracking))
      this.setNodeLocationFromToken = X, this.setNodeLocationFromNode = X, this.cstPostRule = X, this.setInitialNodeLocation = X;
    else
      throw Error(`Invalid <nodeLocationTracking> config option: "${e.nodeLocationTracking}"`);
  }
  setInitialNodeLocationOnlyOffsetRecovery(e) {
    e.location = {
      startOffset: NaN,
      endOffset: NaN
    };
  }
  setInitialNodeLocationOnlyOffsetRegular(e) {
    e.location = {
      // without error recovery the starting Location of a new CstNode is guaranteed
      // To be the next Token's startOffset (for valid inputs).
      // For invalid inputs there won't be any CSTOutput so this potential
      // inaccuracy does not matter
      startOffset: this.LA(1).startOffset,
      endOffset: NaN
    };
  }
  setInitialNodeLocationFullRecovery(e) {
    e.location = {
      startOffset: NaN,
      startLine: NaN,
      startColumn: NaN,
      endOffset: NaN,
      endLine: NaN,
      endColumn: NaN
    };
  }
  /**
       *  @see setInitialNodeLocationOnlyOffsetRegular for explanation why this work
  
       * @param cstNode
       */
  setInitialNodeLocationFullRegular(e) {
    const n = this.LA(1);
    e.location = {
      startOffset: n.startOffset,
      startLine: n.startLine,
      startColumn: n.startColumn,
      endOffset: NaN,
      endLine: NaN,
      endColumn: NaN
    };
  }
  cstInvocationStateUpdate(e) {
    const n = {
      name: e,
      children: /* @__PURE__ */ Object.create(null)
    };
    this.setInitialNodeLocation(n), this.CST_STACK.push(n);
  }
  cstFinallyStateUpdate() {
    this.CST_STACK.pop();
  }
  cstPostRuleFull(e) {
    const n = this.LA(0), r = e.location;
    r.startOffset <= n.startOffset ? (r.endOffset = n.endOffset, r.endLine = n.endLine, r.endColumn = n.endColumn) : (r.startOffset = NaN, r.startLine = NaN, r.startColumn = NaN);
  }
  cstPostRuleOnlyOffset(e) {
    const n = this.LA(0), r = e.location;
    r.startOffset <= n.startOffset ? r.endOffset = n.endOffset : r.startOffset = NaN;
  }
  cstPostTerminal(e, n) {
    const r = this.CST_STACK[this.CST_STACK.length - 1];
    zR(r, n, e), this.setNodeLocationFromToken(r.location, n);
  }
  cstPostNonTerminal(e, n) {
    const r = this.CST_STACK[this.CST_STACK.length - 1];
    qR(r, n, e), this.setNodeLocationFromNode(r.location, e.location);
  }
  getBaseCstVisitorConstructor() {
    if (lt(this.baseCstVisitorConstructor)) {
      const e = JR(this.className, Le(this.gastProductionsCache));
      return this.baseCstVisitorConstructor = e, e;
    }
    return this.baseCstVisitorConstructor;
  }
  getBaseCstVisitorConstructorWithDefaults() {
    if (lt(this.baseCstVisitorWithDefaultsConstructor)) {
      const e = ZR(this.className, Le(this.gastProductionsCache), this.getBaseCstVisitorConstructor());
      return this.baseCstVisitorWithDefaultsConstructor = e, e;
    }
    return this.baseCstVisitorWithDefaultsConstructor;
  }
  getLastExplicitRuleShortName() {
    const e = this.RULE_STACK;
    return e[e.length - 1];
  }
  getPreviousExplicitRuleShortName() {
    const e = this.RULE_STACK;
    return e[e.length - 2];
  }
  getLastExplicitRuleOccurrenceIndex() {
    const e = this.RULE_OCCURRENCE_STACK;
    return e[e.length - 1];
  }
}
class nA {
  initLexerAdapter() {
    this.tokVector = [], this.tokVectorLength = 0, this.currIdx = -1;
  }
  set input(e) {
    if (this.selfAnalysisDone !== !0)
      throw Error("Missing <performSelfAnalysis> invocation at the end of the Parser's constructor.");
    this.reset(), this.tokVector = e, this.tokVectorLength = e.length;
  }
  get input() {
    return this.tokVector;
  }
  // skips a token and returns the next token
  SKIP_TOKEN() {
    return this.currIdx <= this.tokVector.length - 2 ? (this.consumeToken(), this.LA(1)) : mi;
  }
  // Lexer (accessing Token vector) related methods which can be overridden to implement lazy lexers
  // or lexers dependent on parser context.
  LA(e) {
    const n = this.currIdx + e;
    return n < 0 || this.tokVectorLength <= n ? mi : this.tokVector[n];
  }
  consumeToken() {
    this.currIdx++;
  }
  exportLexerState() {
    return this.currIdx;
  }
  importLexerState(e) {
    this.currIdx = e;
  }
  resetLexerState() {
    this.currIdx = -1;
  }
  moveToTerminatedState() {
    this.currIdx = this.tokVector.length - 1;
  }
  getLexerPosition() {
    return this.exportLexerState();
  }
}
class rA {
  ACTION(e) {
    return e.call(this);
  }
  consume(e, n, r) {
    return this.consumeInternal(n, e, r);
  }
  subrule(e, n, r) {
    return this.subruleInternal(n, e, r);
  }
  option(e, n) {
    return this.optionInternal(n, e);
  }
  or(e, n) {
    return this.orInternal(n, e);
  }
  many(e, n) {
    return this.manyInternal(e, n);
  }
  atLeastOne(e, n) {
    return this.atLeastOneInternal(e, n);
  }
  CONSUME(e, n) {
    return this.consumeInternal(e, 0, n);
  }
  CONSUME1(e, n) {
    return this.consumeInternal(e, 1, n);
  }
  CONSUME2(e, n) {
    return this.consumeInternal(e, 2, n);
  }
  CONSUME3(e, n) {
    return this.consumeInternal(e, 3, n);
  }
  CONSUME4(e, n) {
    return this.consumeInternal(e, 4, n);
  }
  CONSUME5(e, n) {
    return this.consumeInternal(e, 5, n);
  }
  CONSUME6(e, n) {
    return this.consumeInternal(e, 6, n);
  }
  CONSUME7(e, n) {
    return this.consumeInternal(e, 7, n);
  }
  CONSUME8(e, n) {
    return this.consumeInternal(e, 8, n);
  }
  CONSUME9(e, n) {
    return this.consumeInternal(e, 9, n);
  }
  SUBRULE(e, n) {
    return this.subruleInternal(e, 0, n);
  }
  SUBRULE1(e, n) {
    return this.subruleInternal(e, 1, n);
  }
  SUBRULE2(e, n) {
    return this.subruleInternal(e, 2, n);
  }
  SUBRULE3(e, n) {
    return this.subruleInternal(e, 3, n);
  }
  SUBRULE4(e, n) {
    return this.subruleInternal(e, 4, n);
  }
  SUBRULE5(e, n) {
    return this.subruleInternal(e, 5, n);
  }
  SUBRULE6(e, n) {
    return this.subruleInternal(e, 6, n);
  }
  SUBRULE7(e, n) {
    return this.subruleInternal(e, 7, n);
  }
  SUBRULE8(e, n) {
    return this.subruleInternal(e, 8, n);
  }
  SUBRULE9(e, n) {
    return this.subruleInternal(e, 9, n);
  }
  OPTION(e) {
    return this.optionInternal(e, 0);
  }
  OPTION1(e) {
    return this.optionInternal(e, 1);
  }
  OPTION2(e) {
    return this.optionInternal(e, 2);
  }
  OPTION3(e) {
    return this.optionInternal(e, 3);
  }
  OPTION4(e) {
    return this.optionInternal(e, 4);
  }
  OPTION5(e) {
    return this.optionInternal(e, 5);
  }
  OPTION6(e) {
    return this.optionInternal(e, 6);
  }
  OPTION7(e) {
    return this.optionInternal(e, 7);
  }
  OPTION8(e) {
    return this.optionInternal(e, 8);
  }
  OPTION9(e) {
    return this.optionInternal(e, 9);
  }
  OR(e) {
    return this.orInternal(e, 0);
  }
  OR1(e) {
    return this.orInternal(e, 1);
  }
  OR2(e) {
    return this.orInternal(e, 2);
  }
  OR3(e) {
    return this.orInternal(e, 3);
  }
  OR4(e) {
    return this.orInternal(e, 4);
  }
  OR5(e) {
    return this.orInternal(e, 5);
  }
  OR6(e) {
    return this.orInternal(e, 6);
  }
  OR7(e) {
    return this.orInternal(e, 7);
  }
  OR8(e) {
    return this.orInternal(e, 8);
  }
  OR9(e) {
    return this.orInternal(e, 9);
  }
  MANY(e) {
    this.manyInternal(0, e);
  }
  MANY1(e) {
    this.manyInternal(1, e);
  }
  MANY2(e) {
    this.manyInternal(2, e);
  }
  MANY3(e) {
    this.manyInternal(3, e);
  }
  MANY4(e) {
    this.manyInternal(4, e);
  }
  MANY5(e) {
    this.manyInternal(5, e);
  }
  MANY6(e) {
    this.manyInternal(6, e);
  }
  MANY7(e) {
    this.manyInternal(7, e);
  }
  MANY8(e) {
    this.manyInternal(8, e);
  }
  MANY9(e) {
    this.manyInternal(9, e);
  }
  MANY_SEP(e) {
    this.manySepFirstInternal(0, e);
  }
  MANY_SEP1(e) {
    this.manySepFirstInternal(1, e);
  }
  MANY_SEP2(e) {
    this.manySepFirstInternal(2, e);
  }
  MANY_SEP3(e) {
    this.manySepFirstInternal(3, e);
  }
  MANY_SEP4(e) {
    this.manySepFirstInternal(4, e);
  }
  MANY_SEP5(e) {
    this.manySepFirstInternal(5, e);
  }
  MANY_SEP6(e) {
    this.manySepFirstInternal(6, e);
  }
  MANY_SEP7(e) {
    this.manySepFirstInternal(7, e);
  }
  MANY_SEP8(e) {
    this.manySepFirstInternal(8, e);
  }
  MANY_SEP9(e) {
    this.manySepFirstInternal(9, e);
  }
  AT_LEAST_ONE(e) {
    this.atLeastOneInternal(0, e);
  }
  AT_LEAST_ONE1(e) {
    return this.atLeastOneInternal(1, e);
  }
  AT_LEAST_ONE2(e) {
    this.atLeastOneInternal(2, e);
  }
  AT_LEAST_ONE3(e) {
    this.atLeastOneInternal(3, e);
  }
  AT_LEAST_ONE4(e) {
    this.atLeastOneInternal(4, e);
  }
  AT_LEAST_ONE5(e) {
    this.atLeastOneInternal(5, e);
  }
  AT_LEAST_ONE6(e) {
    this.atLeastOneInternal(6, e);
  }
  AT_LEAST_ONE7(e) {
    this.atLeastOneInternal(7, e);
  }
  AT_LEAST_ONE8(e) {
    this.atLeastOneInternal(8, e);
  }
  AT_LEAST_ONE9(e) {
    this.atLeastOneInternal(9, e);
  }
  AT_LEAST_ONE_SEP(e) {
    this.atLeastOneSepFirstInternal(0, e);
  }
  AT_LEAST_ONE_SEP1(e) {
    this.atLeastOneSepFirstInternal(1, e);
  }
  AT_LEAST_ONE_SEP2(e) {
    this.atLeastOneSepFirstInternal(2, e);
  }
  AT_LEAST_ONE_SEP3(e) {
    this.atLeastOneSepFirstInternal(3, e);
  }
  AT_LEAST_ONE_SEP4(e) {
    this.atLeastOneSepFirstInternal(4, e);
  }
  AT_LEAST_ONE_SEP5(e) {
    this.atLeastOneSepFirstInternal(5, e);
  }
  AT_LEAST_ONE_SEP6(e) {
    this.atLeastOneSepFirstInternal(6, e);
  }
  AT_LEAST_ONE_SEP7(e) {
    this.atLeastOneSepFirstInternal(7, e);
  }
  AT_LEAST_ONE_SEP8(e) {
    this.atLeastOneSepFirstInternal(8, e);
  }
  AT_LEAST_ONE_SEP9(e) {
    this.atLeastOneSepFirstInternal(9, e);
  }
  RULE(e, n, r = gi) {
    if (de(this.definedRulesNames, e)) {
      const a = {
        message: _t.buildDuplicateRuleNameError({
          topLevelRule: e,
          grammarName: this.className
        }),
        type: fe.DUPLICATE_RULE_NAME,
        ruleName: e
      };
      this.definitionErrors.push(a);
    }
    this.definedRulesNames.push(e);
    const i = this.defineRule(e, n, r);
    return this[e] = i, i;
  }
  OVERRIDE_RULE(e, n, r = gi) {
    const i = kR(e, this.definedRulesNames, this.className);
    this.definitionErrors = this.definitionErrors.concat(i);
    const s = this.defineRule(e, n, r);
    return this[e] = s, s;
  }
  BACKTRACK(e, n) {
    return function() {
      this.isBackTrackingStack.push(1);
      const r = this.saveRecogState();
      try {
        return e.apply(this, n), !0;
      } catch (i) {
        if (hi(i))
          return !1;
        throw i;
      } finally {
        this.reloadRecogState(r), this.isBackTrackingStack.pop();
      }
    };
  }
  // GAST export APIs
  getGAstProductions() {
    return this.gastProductionsCache;
  }
  getSerializedGastProductions() {
    return dv(J(this.gastProductionsCache));
  }
}
class iA {
  initRecognizerEngine(e, n) {
    if (this.className = this.constructor.name, this.shortRuleNameToFull = {}, this.fullRuleNameToShort = {}, this.ruleShortNameIdx = 256, this.tokenMatcher = di, this.subruleIdx = 0, this.definedRulesNames = [], this.tokensMap = {}, this.isBackTrackingStack = [], this.RULE_STACK = [], this.RULE_OCCURRENCE_STACK = [], this.gastProductionsCache = {}, C(n, "serializedGrammar"))
      throw Error(`The Parser's configuration can no longer contain a <serializedGrammar> property.
	See: https://chevrotain.io/docs/changes/BREAKING_CHANGES.html#_6-0-0
	For Further details.`);
    if (P(e)) {
      if (U(e))
        throw Error(`A Token Vocabulary cannot be empty.
	Note that the first argument for the parser constructor
	is no longer a Token vector (since v4.0).`);
      if (typeof e[0].startOffset == "number")
        throw Error(`The Parser constructor no longer accepts a token vector as the first argument.
	See: https://chevrotain.io/docs/changes/BREAKING_CHANGES.html#_4-0-0
	For Further details.`);
    }
    if (P(e))
      this.tokensMap = xe(e, (s, a) => (s[a.name] = a, s), {});
    else if (C(e, "modes") && Ue(Ge(J(e.modes)), nR)) {
      const s = Ge(J(e.modes)), a = Wa(s);
      this.tokensMap = xe(a, (o, l) => (o[l.name] = l, o), {});
    } else if (Oe(e))
      this.tokensMap = se(e);
    else
      throw new Error("<tokensDictionary> argument must be An Array of Token constructors, A dictionary of Token constructors or an IMultiModeLexerDefinition");
    this.tokensMap.EOF = yt;
    const r = C(e, "modes") ? Ge(J(e.modes)) : J(e), i = Ue(r, (s) => U(s.categoryMatches));
    this.tokenMatcher = i ? di : mr, gr(J(this.tokensMap));
  }
  defineRule(e, n, r) {
    if (this.selfAnalysisDone)
      throw Error(`Grammar rule <${e}> may not be defined after the 'performSelfAnalysis' method has been called'
Make sure that all grammar rule definitions are done before 'performSelfAnalysis' is called.`);
    const i = C(r, "resyncEnabled") ? r.resyncEnabled : gi.resyncEnabled, s = C(r, "recoveryValueFunc") ? r.recoveryValueFunc : gi.recoveryValueFunc, a = this.ruleShortNameIdx << KR + At;
    this.ruleShortNameIdx++, this.shortRuleNameToFull[a] = e, this.fullRuleNameToShort[e] = a;
    let o;
    return this.outputCst === !0 ? o = function(...c) {
      try {
        this.ruleInvocationStateUpdate(a, e, this.subruleIdx), n.apply(this, c);
        const f = this.CST_STACK[this.CST_STACK.length - 1];
        return this.cstPostRule(f), f;
      } catch (f) {
        return this.invokeRuleCatch(f, i, s);
      } finally {
        this.ruleFinallyStateUpdate();
      }
    } : o = function(...c) {
      try {
        return this.ruleInvocationStateUpdate(a, e, this.subruleIdx), n.apply(this, c);
      } catch (f) {
        return this.invokeRuleCatch(f, i, s);
      } finally {
        this.ruleFinallyStateUpdate();
      }
    }, Object.assign(o, { ruleName: e, originalGrammarAction: n });
  }
  invokeRuleCatch(e, n, r) {
    const i = this.RULE_STACK.length === 1, s = n && !this.isBackTracking() && this.recoveryEnabled;
    if (hi(e)) {
      const a = e;
      if (s) {
        const o = this.findReSyncTokenType();
        if (this.isInCurrentRuleReSyncSet(o))
          if (a.resyncedTokens = this.reSyncTo(o), this.outputCst) {
            const l = this.CST_STACK[this.CST_STACK.length - 1];
            return l.recoveredNode = !0, l;
          } else
            return r(e);
        else {
          if (this.outputCst) {
            const l = this.CST_STACK[this.CST_STACK.length - 1];
            l.recoveredNode = !0, a.partialCstResult = l;
          }
          throw a;
        }
      } else {
        if (i)
          return this.moveToTerminatedState(), r(e);
        throw a;
      }
    } else
      throw e;
  }
  // Implementation of parsing DSL
  optionInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(Rf, n);
    return this.optionInternalLogic(e, n, r);
  }
  optionInternalLogic(e, n, r) {
    let i = this.getLaFuncFromCache(r), s;
    if (typeof e != "function") {
      s = e.DEF;
      const a = e.GATE;
      if (a !== void 0) {
        const o = i;
        i = () => a.call(this) && o.call(this);
      }
    } else
      s = e;
    if (i.call(this) === !0)
      return s.call(this);
  }
  atLeastOneInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(Xs, e);
    return this.atLeastOneInternalLogic(e, n, r);
  }
  atLeastOneInternalLogic(e, n, r) {
    let i = this.getLaFuncFromCache(r), s;
    if (typeof n != "function") {
      s = n.DEF;
      const a = n.GATE;
      if (a !== void 0) {
        const o = i;
        i = () => a.call(this) && o.call(this);
      }
    } else
      s = n;
    if (i.call(this) === !0) {
      let a = this.doSingleRepetition(s);
      for (; i.call(this) === !0 && a === !0; )
        a = this.doSingleRepetition(s);
    } else
      throw this.raiseEarlyExitException(e, H.REPETITION_MANDATORY, n.ERR_MSG);
    this.attemptInRepetitionRecovery(this.atLeastOneInternal, [e, n], i, Xs, e, fR);
  }
  atLeastOneSepFirstInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(Yr, e);
    this.atLeastOneSepFirstInternalLogic(e, n, r);
  }
  atLeastOneSepFirstInternalLogic(e, n, r) {
    const i = n.DEF, s = n.SEP;
    if (this.getLaFuncFromCache(r).call(this) === !0) {
      i.call(this);
      const o = () => this.tokenMatcher(this.LA(1), s);
      for (; this.tokenMatcher(this.LA(1), s) === !0; )
        this.CONSUME(s), i.call(this);
      this.attemptInRepetitionRecovery(this.repetitionSepSecondInternal, [
        e,
        s,
        o,
        i,
        fl
      ], o, Yr, e, fl);
    } else
      throw this.raiseEarlyExitException(e, H.REPETITION_MANDATORY_WITH_SEPARATOR, n.ERR_MSG);
  }
  manyInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(Ys, e);
    return this.manyInternalLogic(e, n, r);
  }
  manyInternalLogic(e, n, r) {
    let i = this.getLaFuncFromCache(r), s;
    if (typeof n != "function") {
      s = n.DEF;
      const o = n.GATE;
      if (o !== void 0) {
        const l = i;
        i = () => o.call(this) && l.call(this);
      }
    } else
      s = n;
    let a = !0;
    for (; i.call(this) === !0 && a === !0; )
      a = this.doSingleRepetition(s);
    this.attemptInRepetitionRecovery(
      this.manyInternal,
      [e, n],
      i,
      Ys,
      e,
      cR,
      // The notStuck parameter is only relevant when "attemptInRepetitionRecovery"
      // is invoked from manyInternal, in the MANY_SEP case and AT_LEAST_ONE[_SEP]
      // An infinite loop cannot occur as:
      // - Either the lookahead is guaranteed to consume something (Single Token Separator)
      // - AT_LEAST_ONE by definition is guaranteed to consume something (or error out).
      a
    );
  }
  manySepFirstInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(Js, e);
    this.manySepFirstInternalLogic(e, n, r);
  }
  manySepFirstInternalLogic(e, n, r) {
    const i = n.DEF, s = n.SEP;
    if (this.getLaFuncFromCache(r).call(this) === !0) {
      i.call(this);
      const o = () => this.tokenMatcher(this.LA(1), s);
      for (; this.tokenMatcher(this.LA(1), s) === !0; )
        this.CONSUME(s), i.call(this);
      this.attemptInRepetitionRecovery(this.repetitionSepSecondInternal, [
        e,
        s,
        o,
        i,
        cl
      ], o, Js, e, cl);
    }
  }
  repetitionSepSecondInternal(e, n, r, i, s) {
    for (; r(); )
      this.CONSUME(n), i.call(this);
    this.attemptInRepetitionRecovery(this.repetitionSepSecondInternal, [
      e,
      n,
      r,
      i,
      s
    ], r, Yr, e, s);
  }
  doSingleRepetition(e) {
    const n = this.getLexerPosition();
    return e.call(this), this.getLexerPosition() > n;
  }
  orInternal(e, n) {
    const r = this.getKeyForAutomaticLookahead(vf, n), i = P(e) ? e : e.DEF, a = this.getLaFuncFromCache(r).call(this, i);
    if (a !== void 0)
      return i[a].ALT.call(this);
    this.raiseNoAltException(n, e.ERR_MSG);
  }
  ruleFinallyStateUpdate() {
    if (this.RULE_STACK.pop(), this.RULE_OCCURRENCE_STACK.pop(), this.cstFinallyStateUpdate(), this.RULE_STACK.length === 0 && this.isAtEndOfInput() === !1) {
      const e = this.LA(1), n = this.errorMessageProvider.buildNotAllInputParsedMessage({
        firstRedundant: e,
        ruleName: this.getCurrRuleFullName()
      });
      this.SAVE_ERROR(new FR(n, e));
    }
  }
  subruleInternal(e, n, r) {
    let i;
    try {
      const s = r !== void 0 ? r.ARGS : void 0;
      return this.subruleIdx = n, i = e.apply(this, s), this.cstPostNonTerminal(i, r !== void 0 && r.LABEL !== void 0 ? r.LABEL : e.ruleName), i;
    } catch (s) {
      throw this.subruleInternalError(s, r, e.ruleName);
    }
  }
  subruleInternalError(e, n, r) {
    throw hi(e) && e.partialCstResult !== void 0 && (this.cstPostNonTerminal(e.partialCstResult, n !== void 0 && n.LABEL !== void 0 ? n.LABEL : r), delete e.partialCstResult), e;
  }
  consumeInternal(e, n, r) {
    let i;
    try {
      const s = this.LA(1);
      this.tokenMatcher(s, e) === !0 ? (this.consumeToken(), i = s) : this.consumeInternalError(e, s, r);
    } catch (s) {
      i = this.consumeInternalRecovery(e, n, s);
    }
    return this.cstPostTerminal(r !== void 0 && r.LABEL !== void 0 ? r.LABEL : e.name, i), i;
  }
  consumeInternalError(e, n, r) {
    let i;
    const s = this.LA(0);
    throw r !== void 0 && r.ERR_MSG ? i = r.ERR_MSG : i = this.errorMessageProvider.buildMismatchTokenMessage({
      expected: e,
      actual: n,
      previous: s,
      ruleName: this.getCurrRuleFullName()
    }), this.SAVE_ERROR(new yf(i, n, s));
  }
  consumeInternalRecovery(e, n, r) {
    if (this.recoveryEnabled && // TODO: more robust checking of the exception type. Perhaps Typescript extending expressions?
    r.name === "MismatchedTokenException" && !this.isBackTracking()) {
      const i = this.getFollowsForInRuleRecovery(e, n);
      try {
        return this.tryInRuleRecovery(e, i);
      } catch (s) {
        throw s.name === Tf ? r : s;
      }
    } else
      throw r;
  }
  saveRecogState() {
    const e = this.errors, n = se(this.RULE_STACK);
    return {
      errors: e,
      lexerState: this.exportLexerState(),
      RULE_STACK: n,
      CST_STACK: this.CST_STACK
    };
  }
  reloadRecogState(e) {
    this.errors = e.errors, this.importLexerState(e.lexerState), this.RULE_STACK = e.RULE_STACK;
  }
  ruleInvocationStateUpdate(e, n, r) {
    this.RULE_OCCURRENCE_STACK.push(r), this.RULE_STACK.push(e), this.cstInvocationStateUpdate(n);
  }
  isBackTracking() {
    return this.isBackTrackingStack.length !== 0;
  }
  getCurrRuleFullName() {
    const e = this.getLastExplicitRuleShortName();
    return this.shortRuleNameToFull[e];
  }
  shortRuleNameToFullName(e) {
    return this.shortRuleNameToFull[e];
  }
  isAtEndOfInput() {
    return this.tokenMatcher(this.LA(1), yt);
  }
  reset() {
    this.resetLexerState(), this.subruleIdx = 0, this.isBackTrackingStack = [], this.errors = [], this.RULE_STACK = [], this.CST_STACK = [], this.RULE_OCCURRENCE_STACK = [];
  }
}
class sA {
  initErrorHandler(e) {
    this._errors = [], this.errorMessageProvider = C(e, "errorMessageProvider") ? e.errorMessageProvider : ut.errorMessageProvider;
  }
  SAVE_ERROR(e) {
    if (hi(e))
      return e.context = {
        ruleStack: this.getHumanReadableRuleStack(),
        ruleOccurrenceStack: se(this.RULE_OCCURRENCE_STACK)
      }, this._errors.push(e), e;
    throw Error("Trying to save an Error which is not a RecognitionException");
  }
  get errors() {
    return se(this._errors);
  }
  set errors(e) {
    this._errors = e;
  }
  // TODO: consider caching the error message computed information
  raiseEarlyExitException(e, n, r) {
    const i = this.getCurrRuleFullName(), s = this.getGAstProductions()[i], o = Yi(e, s, n, this.maxLookahead)[0], l = [];
    for (let c = 1; c <= this.maxLookahead; c++)
      l.push(this.LA(c));
    const u = this.errorMessageProvider.buildEarlyExitMessage({
      expectedIterationPaths: o,
      actual: l,
      previous: this.LA(0),
      customUserDescription: r,
      ruleName: i
    });
    throw this.SAVE_ERROR(new GR(u, this.LA(1), this.LA(0)));
  }
  // TODO: consider caching the error message computed information
  raiseNoAltException(e, n) {
    const r = this.getCurrRuleFullName(), i = this.getGAstProductions()[r], s = qi(e, i, this.maxLookahead), a = [];
    for (let u = 1; u <= this.maxLookahead; u++)
      a.push(this.LA(u));
    const o = this.LA(0), l = this.errorMessageProvider.buildNoViableAltMessage({
      expectedPathsPerAlt: s,
      actual: a,
      previous: o,
      customUserDescription: n,
      ruleName: this.getCurrRuleFullName()
    });
    throw this.SAVE_ERROR(new DR(l, this.LA(1), o));
  }
}
class aA {
  initContentAssist() {
  }
  computeContentAssist(e, n) {
    const r = this.gastProductionsCache[e];
    if (lt(r))
      throw Error(`Rule ->${e}<- does not exist in this grammar.`);
    return af([r], n, this.tokenMatcher, this.maxLookahead);
  }
  // TODO: should this be a member method or a utility? it does not have any state or usage of 'this'...
  // TODO: should this be more explicitly part of the public API?
  getNextPossibleTokenTypes(e) {
    const n = je(e.ruleStack), i = this.getGAstProductions()[n];
    return new uR(i, e).startWalking();
  }
}
const Ji = {
  description: "This Object indicates the Parser is during Recording Phase"
};
Object.freeze(Ji);
const gl = !0, yl = Math.pow(2, At) - 1, Ef = rf({ name: "RECORDING_PHASE_TOKEN", pattern: he.NA });
gr([Ef]);
const $f = qa(
  Ef,
  `This IToken indicates the Parser is in Recording Phase
	See: https://chevrotain.io/docs/guide/internals.html#grammar-recording for details`,
  // Using "-1" instead of NaN (as in EOF) because an actual number is less likely to
  // cause errors if the output of LA or CONSUME would be (incorrectly) used during the recording phase.
  -1,
  -1,
  -1,
  -1,
  -1,
  -1
);
Object.freeze($f);
const oA = {
  name: `This CSTNode indicates the Parser is in Recording Phase
	See: https://chevrotain.io/docs/guide/internals.html#grammar-recording for details`,
  children: {}
};
class lA {
  initGastRecorder(e) {
    this.recordingProdStack = [], this.RECORDING_PHASE = !1;
  }
  enableRecording() {
    this.RECORDING_PHASE = !0, this.TRACE_INIT("Enable Recording", () => {
      for (let e = 0; e < 10; e++) {
        const n = e > 0 ? e : "";
        this[`CONSUME${n}`] = function(r, i) {
          return this.consumeInternalRecord(r, e, i);
        }, this[`SUBRULE${n}`] = function(r, i) {
          return this.subruleInternalRecord(r, e, i);
        }, this[`OPTION${n}`] = function(r) {
          return this.optionInternalRecord(r, e);
        }, this[`OR${n}`] = function(r) {
          return this.orInternalRecord(r, e);
        }, this[`MANY${n}`] = function(r) {
          this.manyInternalRecord(e, r);
        }, this[`MANY_SEP${n}`] = function(r) {
          this.manySepFirstInternalRecord(e, r);
        }, this[`AT_LEAST_ONE${n}`] = function(r) {
          this.atLeastOneInternalRecord(e, r);
        }, this[`AT_LEAST_ONE_SEP${n}`] = function(r) {
          this.atLeastOneSepFirstInternalRecord(e, r);
        };
      }
      this.consume = function(e, n, r) {
        return this.consumeInternalRecord(n, e, r);
      }, this.subrule = function(e, n, r) {
        return this.subruleInternalRecord(n, e, r);
      }, this.option = function(e, n) {
        return this.optionInternalRecord(n, e);
      }, this.or = function(e, n) {
        return this.orInternalRecord(n, e);
      }, this.many = function(e, n) {
        this.manyInternalRecord(e, n);
      }, this.atLeastOne = function(e, n) {
        this.atLeastOneInternalRecord(e, n);
      }, this.ACTION = this.ACTION_RECORD, this.BACKTRACK = this.BACKTRACK_RECORD, this.LA = this.LA_RECORD;
    });
  }
  disableRecording() {
    this.RECORDING_PHASE = !1, this.TRACE_INIT("Deleting Recording methods", () => {
      const e = this;
      for (let n = 0; n < 10; n++) {
        const r = n > 0 ? n : "";
        delete e[`CONSUME${r}`], delete e[`SUBRULE${r}`], delete e[`OPTION${r}`], delete e[`OR${r}`], delete e[`MANY${r}`], delete e[`MANY_SEP${r}`], delete e[`AT_LEAST_ONE${r}`], delete e[`AT_LEAST_ONE_SEP${r}`];
      }
      delete e.consume, delete e.subrule, delete e.option, delete e.or, delete e.many, delete e.atLeastOne, delete e.ACTION, delete e.BACKTRACK, delete e.LA;
    });
  }
  //   Parser methods are called inside an ACTION?
  //   Maybe try/catch/finally on ACTIONS while disabling the recorders state changes?
  // @ts-expect-error -- noop place holder
  ACTION_RECORD(e) {
  }
  // Executing backtracking logic will break our recording logic assumptions
  BACKTRACK_RECORD(e, n) {
    return () => !0;
  }
  // LA is part of the official API and may be used for custom lookahead logic
  // by end users who may forget to wrap it in ACTION or inside a GATE
  LA_RECORD(e) {
    return mi;
  }
  topLevelRuleRecord(e, n) {
    try {
      const r = new un({ definition: [], name: e });
      return r.name = e, this.recordingProdStack.push(r), n.call(this), this.recordingProdStack.pop(), r;
    } catch (r) {
      if (r.KNOWN_RECORDER_ERROR !== !0)
        try {
          r.message = r.message + `
	 This error was thrown during the "grammar recording phase" For more info see:
	https://chevrotain.io/docs/guide/internals.html#grammar-recording`;
        } catch {
          throw r;
        }
      throw r;
    }
  }
  // Implementation of parsing DSL
  optionInternalRecord(e, n) {
    return pn.call(this, ie, e, n);
  }
  atLeastOneInternalRecord(e, n) {
    pn.call(this, Se, n, e);
  }
  atLeastOneSepFirstInternalRecord(e, n) {
    pn.call(this, ke, n, e, gl);
  }
  manyInternalRecord(e, n) {
    pn.call(this, z, n, e);
  }
  manySepFirstInternalRecord(e, n) {
    pn.call(this, ge, n, e, gl);
  }
  orInternalRecord(e, n) {
    return uA.call(this, e, n);
  }
  subruleInternalRecord(e, n, r) {
    if (pi(n), !e || C(e, "ruleName") === !1) {
      const o = new Error(`<SUBRULE${Tl(n)}> argument is invalid expecting a Parser method reference but got: <${JSON.stringify(e)}>
 inside top level rule: <${this.recordingProdStack[0].name}>`);
      throw o.KNOWN_RECORDER_ERROR = !0, o;
    }
    const i = tn(this.recordingProdStack), s = e.ruleName, a = new ce({
      idx: n,
      nonTerminalName: s,
      label: r?.LABEL,
      // The resolving of the `referencedRule` property will be done once all the Rule's GASTs have been created
      referencedRule: void 0
    });
    return i.definition.push(a), this.outputCst ? oA : Ji;
  }
  consumeInternalRecord(e, n, r) {
    if (pi(n), !tf(e)) {
      const a = new Error(`<CONSUME${Tl(n)}> argument is invalid expecting a TokenType reference but got: <${JSON.stringify(e)}>
 inside top level rule: <${this.recordingProdStack[0].name}>`);
      throw a.KNOWN_RECORDER_ERROR = !0, a;
    }
    const i = tn(this.recordingProdStack), s = new j({
      idx: n,
      terminalType: e,
      label: r?.LABEL
    });
    return i.definition.push(s), $f;
  }
}
function pn(t, e, n, r = !1) {
  pi(n);
  const i = tn(this.recordingProdStack), s = ct(e) ? e : e.DEF, a = new t({ definition: [], idx: n });
  return r && (a.separator = e.SEP), C(e, "MAX_LOOKAHEAD") && (a.maxLookahead = e.MAX_LOOKAHEAD), this.recordingProdStack.push(a), s.call(this), i.definition.push(a), this.recordingProdStack.pop(), Ji;
}
function uA(t, e) {
  pi(e);
  const n = tn(this.recordingProdStack), r = P(t) === !1, i = r === !1 ? t : t.DEF, s = new ye({
    definition: [],
    idx: e,
    ignoreAmbiguities: r && t.IGNORE_AMBIGUITIES === !0
  });
  C(t, "MAX_LOOKAHEAD") && (s.maxLookahead = t.MAX_LOOKAHEAD);
  const a = Kc(i, (o) => ct(o.GATE));
  return s.hasPredicates = a, n.definition.push(s), w(i, (o) => {
    const l = new me({ definition: [] });
    s.definition.push(l), C(o, "IGNORE_AMBIGUITIES") ? l.ignoreAmbiguities = o.IGNORE_AMBIGUITIES : C(o, "GATE") && (l.ignoreAmbiguities = !0), this.recordingProdStack.push(l), o.ALT.call(this), this.recordingProdStack.pop();
  }), Ji;
}
function Tl(t) {
  return t === 0 ? "" : `${t}`;
}
function pi(t) {
  if (t < 0 || t > yl) {
    const e = new Error(
      // The stack trace will contain all the needed details
      `Invalid DSL Method idx value: <${t}>
	Idx value must be a none negative value smaller than ${yl + 1}`
    );
    throw e.KNOWN_RECORDER_ERROR = !0, e;
  }
}
class cA {
  initPerformanceTracer(e) {
    if (C(e, "traceInitPerf")) {
      const n = e.traceInitPerf, r = typeof n == "number";
      this.traceInitMaxIdent = r ? n : 1 / 0, this.traceInitPerf = r ? n > 0 : n;
    } else
      this.traceInitMaxIdent = 0, this.traceInitPerf = ut.traceInitPerf;
    this.traceInitIndent = -1;
  }
  TRACE_INIT(e, n) {
    if (this.traceInitPerf === !0) {
      this.traceInitIndent++;
      const r = new Array(this.traceInitIndent + 1).join("	");
      this.traceInitIndent < this.traceInitMaxIdent && console.log(`${r}--> <${e}>`);
      const { time: i, value: s } = Vc(n), a = i > 10 ? console.warn : console.log;
      return this.traceInitIndent < this.traceInitMaxIdent && a(`${r}<-- <${e}> time: ${i}ms`), this.traceInitIndent--, s;
    } else
      return n();
  }
}
function fA(t, e) {
  e.forEach((n) => {
    const r = n.prototype;
    Object.getOwnPropertyNames(r).forEach((i) => {
      if (i === "constructor")
        return;
      const s = Object.getOwnPropertyDescriptor(r, i);
      s && (s.get || s.set) ? Object.defineProperty(t.prototype, i, s) : t.prototype[i] = n.prototype[i];
    });
  });
}
const mi = qa(yt, "", NaN, NaN, NaN, NaN, NaN, NaN);
Object.freeze(mi);
const ut = Object.freeze({
  recoveryEnabled: !1,
  maxLookahead: 3,
  dynamicTokensEnabled: !1,
  outputCst: !0,
  errorMessageProvider: Yt,
  nodeLocationTracking: "none",
  traceInitPerf: !1,
  skipValidations: !1
}), gi = Object.freeze({
  recoveryValueFunc: () => {
  },
  resyncEnabled: !0
});
var fe;
(function(t) {
  t[t.INVALID_RULE_NAME = 0] = "INVALID_RULE_NAME", t[t.DUPLICATE_RULE_NAME = 1] = "DUPLICATE_RULE_NAME", t[t.INVALID_RULE_OVERRIDE = 2] = "INVALID_RULE_OVERRIDE", t[t.DUPLICATE_PRODUCTIONS = 3] = "DUPLICATE_PRODUCTIONS", t[t.UNRESOLVED_SUBRULE_REF = 4] = "UNRESOLVED_SUBRULE_REF", t[t.LEFT_RECURSION = 5] = "LEFT_RECURSION", t[t.NONE_LAST_EMPTY_ALT = 6] = "NONE_LAST_EMPTY_ALT", t[t.AMBIGUOUS_ALTS = 7] = "AMBIGUOUS_ALTS", t[t.CONFLICT_TOKENS_RULES_NAMESPACE = 8] = "CONFLICT_TOKENS_RULES_NAMESPACE", t[t.INVALID_TOKEN_NAME = 9] = "INVALID_TOKEN_NAME", t[t.NO_NON_EMPTY_LOOKAHEAD = 10] = "NO_NON_EMPTY_LOOKAHEAD", t[t.AMBIGUOUS_PREFIX_ALTS = 11] = "AMBIGUOUS_PREFIX_ALTS", t[t.TOO_MANY_ALTS = 12] = "TOO_MANY_ALTS", t[t.CUSTOM_LOOKAHEAD_VALIDATION = 13] = "CUSTOM_LOOKAHEAD_VALIDATION";
})(fe || (fe = {}));
function vl(t = void 0) {
  return function() {
    return t;
  };
}
class yr {
  /**
   *  @deprecated use the **instance** method with the same name instead
   */
  static performSelfAnalysis(e) {
    throw Error("The **static** `performSelfAnalysis` method has been deprecated.	\nUse the **instance** method with the same name instead.");
  }
  performSelfAnalysis() {
    this.TRACE_INIT("performSelfAnalysis", () => {
      let e;
      this.selfAnalysisDone = !0;
      const n = this.className;
      this.TRACE_INIT("toFastProps", () => {
        Wc(this);
      }), this.TRACE_INIT("Grammar Recording", () => {
        try {
          this.enableRecording(), w(this.definedRulesNames, (i) => {
            const a = this[i].originalGrammarAction;
            let o;
            this.TRACE_INIT(`${i} Rule`, () => {
              o = this.topLevelRuleRecord(i, a);
            }), this.gastProductionsCache[i] = o;
          });
        } finally {
          this.disableRecording();
        }
      });
      let r = [];
      if (this.TRACE_INIT("Grammar Resolving", () => {
        r = PR({
          rules: J(this.gastProductionsCache)
        }), this.definitionErrors = this.definitionErrors.concat(r);
      }), this.TRACE_INIT("Grammar Validations", () => {
        if (U(r) && this.skipValidations === !1) {
          const i = MR({
            rules: J(this.gastProductionsCache),
            tokenTypes: J(this.tokensMap),
            errMsgProvider: _t,
            grammarName: n
          }), s = RR({
            lookaheadStrategy: this.lookaheadStrategy,
            rules: J(this.gastProductionsCache),
            tokenTypes: J(this.tokensMap),
            grammarName: n
          });
          this.definitionErrors = this.definitionErrors.concat(i, s);
        }
      }), U(this.definitionErrors) && (this.recoveryEnabled && this.TRACE_INIT("computeAllProdsFollows", () => {
        const i = vv(J(this.gastProductionsCache));
        this.resyncFollows = i;
      }), this.TRACE_INIT("ComputeLookaheadFunctions", () => {
        var i, s;
        (s = (i = this.lookaheadStrategy).initialize) === null || s === void 0 || s.call(i, {
          rules: J(this.gastProductionsCache)
        }), this.preComputeLookaheadFunctions(J(this.gastProductionsCache));
      })), !yr.DEFER_DEFINITION_ERRORS_HANDLING && !U(this.definitionErrors))
        throw e = I(this.definitionErrors, (i) => i.message), new Error(`Parser Definition Errors detected:
 ${e.join(`
-------------------------------
`)}`);
    });
  }
  constructor(e, n) {
    this.definitionErrors = [], this.selfAnalysisDone = !1;
    const r = this;
    if (r.initErrorHandler(n), r.initLexerAdapter(), r.initLooksAhead(n), r.initRecognizerEngine(e, n), r.initRecoverable(n), r.initTreeBuilder(n), r.initContentAssist(), r.initGastRecorder(n), r.initPerformanceTracer(n), C(n, "ignoredIssues"))
      throw new Error(`The <ignoredIssues> IParserConfig property has been deprecated.
	Please use the <IGNORE_AMBIGUITIES> flag on the relevant DSL method instead.
	See: https://chevrotain.io/docs/guide/resolving_grammar_errors.html#IGNORING_AMBIGUITIES
	For further details.`);
    this.skipValidations = C(n, "skipValidations") ? n.skipValidations : ut.skipValidations;
  }
}
yr.DEFER_DEFINITION_ERRORS_HANDLING = !1;
fA(yr, [
  BR,
  HR,
  tA,
  nA,
  iA,
  rA,
  sA,
  aA,
  lA,
  cA
]);
class dA extends yr {
  constructor(e, n = ut) {
    const r = se(n);
    r.outputCst = !1, super(e, r);
  }
}
function rn(t, e, n) {
  return `${t.name}_${e}_${n}`;
}
const Tt = 1, hA = 2, xf = 4, Sf = 5, Tr = 7, pA = 8, mA = 9, gA = 10, yA = 11, kf = 12;
class Za {
  constructor(e) {
    this.target = e;
  }
  isEpsilon() {
    return !1;
  }
}
class Qa extends Za {
  constructor(e, n) {
    super(e), this.tokenType = n;
  }
}
class If extends Za {
  constructor(e) {
    super(e);
  }
  isEpsilon() {
    return !0;
  }
}
class eo extends Za {
  constructor(e, n, r) {
    super(e), this.rule = n, this.followState = r;
  }
  isEpsilon() {
    return !0;
  }
}
function TA(t) {
  const e = {
    decisionMap: {},
    decisionStates: [],
    ruleToStartState: /* @__PURE__ */ new Map(),
    ruleToStopState: /* @__PURE__ */ new Map(),
    states: []
  };
  vA(e, t);
  const n = t.length;
  for (let r = 0; r < n; r++) {
    const i = t[r], s = Kt(e, i, i);
    s !== void 0 && NA(e, i, s);
  }
  return e;
}
function vA(t, e) {
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r], s = Q(t, i, void 0, {
      type: hA
    }), a = Q(t, i, void 0, {
      type: Tr
    });
    s.stop = a, t.ruleToStartState.set(i, s), t.ruleToStopState.set(i, a);
  }
}
function Cf(t, e, n) {
  return n instanceof j ? to(t, e, n.terminalType, n) : n instanceof ce ? wA(t, e, n) : n instanceof ye ? xA(t, e, n) : n instanceof ie ? SA(t, e, n) : n instanceof z ? RA(t, e, n) : n instanceof ge ? AA(t, e, n) : n instanceof Se ? EA(t, e, n) : n instanceof ke ? $A(t, e, n) : Kt(t, e, n);
}
function RA(t, e, n) {
  const r = Q(t, e, n, {
    type: Sf
  });
  Et(t, r);
  const i = fn(t, e, r, n, Kt(t, e, n));
  return Nf(t, e, n, i);
}
function AA(t, e, n) {
  const r = Q(t, e, n, {
    type: Sf
  });
  Et(t, r);
  const i = fn(t, e, r, n, Kt(t, e, n)), s = to(t, e, n.separator, n);
  return Nf(t, e, n, i, s);
}
function EA(t, e, n) {
  const r = Q(t, e, n, {
    type: xf
  });
  Et(t, r);
  const i = fn(t, e, r, n, Kt(t, e, n));
  return wf(t, e, n, i);
}
function $A(t, e, n) {
  const r = Q(t, e, n, {
    type: xf
  });
  Et(t, r);
  const i = fn(t, e, r, n, Kt(t, e, n)), s = to(t, e, n.separator, n);
  return wf(t, e, n, i, s);
}
function xA(t, e, n) {
  const r = Q(t, e, n, {
    type: Tt
  });
  Et(t, r);
  const i = st(n.definition, (a) => Cf(t, e, a));
  return fn(t, e, r, n, ...i);
}
function SA(t, e, n) {
  const r = Q(t, e, n, {
    type: Tt
  });
  Et(t, r);
  const i = fn(t, e, r, n, Kt(t, e, n));
  return kA(t, e, n, i);
}
function Kt(t, e, n) {
  const r = Id(st(n.definition, (i) => Cf(t, e, i)), (i) => i !== void 0);
  return r.length === 1 ? r[0] : r.length === 0 ? void 0 : CA(t, r);
}
function wf(t, e, n, r, i) {
  const s = r.left, a = r.right, o = Q(t, e, n, {
    type: yA
  });
  Et(t, o);
  const l = Q(t, e, n, {
    type: kf
  });
  return s.loopback = o, l.loopback = o, t.decisionMap[rn(e, i ? "RepetitionMandatoryWithSeparator" : "RepetitionMandatory", n.idx)] = o, Y(a, o), i === void 0 ? (Y(o, s), Y(o, l)) : (Y(o, l), Y(o, i.left), Y(i.right, s)), {
    left: s,
    right: l
  };
}
function Nf(t, e, n, r, i) {
  const s = r.left, a = r.right, o = Q(t, e, n, {
    type: gA
  });
  Et(t, o);
  const l = Q(t, e, n, {
    type: kf
  }), u = Q(t, e, n, {
    type: mA
  });
  return o.loopback = u, l.loopback = u, Y(o, s), Y(o, l), Y(a, u), i !== void 0 ? (Y(u, l), Y(u, i.left), Y(i.right, s)) : Y(u, o), t.decisionMap[rn(e, i ? "RepetitionWithSeparator" : "Repetition", n.idx)] = o, {
    left: o,
    right: l
  };
}
function kA(t, e, n, r) {
  const i = r.left, s = r.right;
  return Y(i, s), t.decisionMap[rn(e, "Option", n.idx)] = i, r;
}
function Et(t, e) {
  return t.decisionStates.push(e), e.decision = t.decisionStates.length - 1, e.decision;
}
function fn(t, e, n, r, ...i) {
  const s = Q(t, e, r, {
    type: pA,
    start: n
  });
  n.end = s;
  for (const o of i)
    o !== void 0 ? (Y(n, o.left), Y(o.right, s)) : Y(n, s);
  const a = {
    left: n,
    right: s
  };
  return t.decisionMap[rn(e, IA(r), r.idx)] = n, a;
}
function IA(t) {
  if (t instanceof ye)
    return "Alternation";
  if (t instanceof ie)
    return "Option";
  if (t instanceof z)
    return "Repetition";
  if (t instanceof ge)
    return "RepetitionWithSeparator";
  if (t instanceof Se)
    return "RepetitionMandatory";
  if (t instanceof ke)
    return "RepetitionMandatoryWithSeparator";
  throw new Error("Invalid production type encountered");
}
function CA(t, e) {
  const n = e.length;
  for (let s = 0; s < n - 1; s++) {
    const a = e[s];
    let o;
    a.left.transitions.length === 1 && (o = a.left.transitions[0]);
    const l = o instanceof eo, u = o, c = e[s + 1].left;
    a.left.type === Tt && a.right.type === Tt && o !== void 0 && (l && u.followState === a.right || o.target === a.right) ? (l ? u.followState = c : o.target = c, _A(t, a.right)) : Y(a.right, c);
  }
  const r = e[0], i = e[n - 1];
  return {
    left: r.left,
    right: i.right
  };
}
function to(t, e, n, r) {
  const i = Q(t, e, r, {
    type: Tt
  }), s = Q(t, e, r, {
    type: Tt
  });
  return no(i, new Qa(s, n)), {
    left: i,
    right: s
  };
}
function wA(t, e, n) {
  const r = n.referencedRule, i = t.ruleToStartState.get(r), s = Q(t, e, n, {
    type: Tt
  }), a = Q(t, e, n, {
    type: Tt
  }), o = new eo(i, r, a);
  return no(s, o), {
    left: s,
    right: a
  };
}
function NA(t, e, n) {
  const r = t.ruleToStartState.get(e);
  Y(r, n.left);
  const i = t.ruleToStopState.get(e);
  return Y(n.right, i), {
    left: r,
    right: i
  };
}
function Y(t, e) {
  const n = new If(e);
  no(t, n);
}
function Q(t, e, n, r) {
  const i = Object.assign({
    atn: t,
    production: n,
    epsilonOnlyTransitions: !1,
    rule: e,
    transitions: [],
    nextTokenWithinRule: [],
    stateNumber: t.states.length
  }, r);
  return t.states.push(i), i;
}
function no(t, e) {
  t.transitions.length === 0 && (t.epsilonOnlyTransitions = e.isEpsilon()), t.transitions.push(e);
}
function _A(t, e) {
  t.states.splice(t.states.indexOf(e), 1);
}
const yi = {};
class Qs {
  constructor() {
    this.map = {}, this.configs = [];
  }
  get size() {
    return this.configs.length;
  }
  finalize() {
    this.map = {};
  }
  add(e) {
    const n = _f(e);
    n in this.map || (this.map[n] = this.configs.length, this.configs.push(e));
  }
  get elements() {
    return this.configs;
  }
  get alts() {
    return st(this.configs, (e) => e.alt);
  }
  get key() {
    let e = "";
    for (const n in this.map)
      e += n + ":";
    return e;
  }
}
function _f(t, e = !0) {
  return `${e ? `a${t.alt}` : ""}s${t.state.stateNumber}:${t.stack.map((n) => n.stateNumber.toString()).join("_")}`;
}
function bA(t, e) {
  const n = {};
  return (r) => {
    const i = r.toString();
    let s = n[i];
    return s !== void 0 || (s = {
      atnStartState: t,
      decision: e,
      states: {}
    }, n[i] = s), s;
  };
}
class bf {
  constructor() {
    this.predicates = [];
  }
  is(e) {
    return e >= this.predicates.length || this.predicates[e];
  }
  set(e, n) {
    this.predicates[e] = n;
  }
  toString() {
    let e = "";
    const n = this.predicates.length;
    for (let r = 0; r < n; r++)
      e += this.predicates[r] === !0 ? "1" : "0";
    return e;
  }
}
const Rl = new bf();
class OA extends Ja {
  constructor(e) {
    var n;
    super(), this.logging = (n = e?.logging) !== null && n !== void 0 ? n : ((r) => console.log(r));
  }
  initialize(e) {
    this.atn = TA(e.rules), this.dfas = LA(this.atn);
  }
  validateAmbiguousAlternationAlternatives() {
    return [];
  }
  validateEmptyOrAlternatives() {
    return [];
  }
  buildLookaheadForAlternation(e) {
    const { prodOccurrence: n, rule: r, hasPredicates: i, dynamicTokensEnabled: s } = e, a = this.dfas, o = this.logging, l = rn(r, "Alternation", n), c = this.atn.decisionMap[l].decision, f = st(dl({
      maxLookahead: 1,
      occurrence: n,
      prodType: "Alternation",
      rule: r
    }), (d) => st(d, (h) => h[0]));
    if (Al(f, !1) && !s) {
      const d = co(f, (h, m, g) => (ns(m, (R) => {
        R && (h[R.tokenTypeIdx] = g, ns(R.categoryMatches, (y) => {
          h[y] = g;
        }));
      }), h), {});
      return i ? function(h) {
        var m;
        const g = this.LA(1), R = d[g.tokenTypeIdx];
        if (h !== void 0 && R !== void 0) {
          const y = (m = h[R]) === null || m === void 0 ? void 0 : m.GATE;
          if (y !== void 0 && y.call(this) === !1)
            return;
        }
        return R;
      } : function() {
        const h = this.LA(1);
        return d[h.tokenTypeIdx];
      };
    } else return i ? function(d) {
      const h = new bf(), m = d === void 0 ? 0 : d.length;
      for (let R = 0; R < m; R++) {
        const y = d?.[R].GATE;
        h.set(R, y === void 0 || y.call(this));
      }
      const g = Ts.call(this, a, c, h, o);
      return typeof g == "number" ? g : void 0;
    } : function() {
      const d = Ts.call(this, a, c, Rl, o);
      return typeof d == "number" ? d : void 0;
    };
  }
  buildLookaheadForOptional(e) {
    const { prodOccurrence: n, rule: r, prodType: i, dynamicTokensEnabled: s } = e, a = this.dfas, o = this.logging, l = rn(r, i, n), c = this.atn.decisionMap[l].decision, f = st(dl({
      maxLookahead: 1,
      occurrence: n,
      prodType: i,
      rule: r
    }), (d) => st(d, (h) => h[0]));
    if (Al(f) && f[0][0] && !s) {
      const d = f[0], h = Ed(d);
      if (h.length === 1 && Cd(h[0].categoryMatches)) {
        const g = h[0].tokenTypeIdx;
        return function() {
          return this.LA(1).tokenTypeIdx === g;
        };
      } else {
        const m = co(h, (g, R) => (R !== void 0 && (g[R.tokenTypeIdx] = !0, ns(R.categoryMatches, (y) => {
          g[y] = !0;
        })), g), {});
        return function() {
          const g = this.LA(1);
          return m[g.tokenTypeIdx] === !0;
        };
      }
    }
    return function() {
      const d = Ts.call(this, a, c, Rl, o);
      return typeof d == "object" ? !1 : d === 0;
    };
  }
}
function Al(t, e = !0) {
  const n = /* @__PURE__ */ new Set();
  for (const r of t) {
    const i = /* @__PURE__ */ new Set();
    for (const s of r) {
      if (s === void 0) {
        if (e)
          break;
        return !1;
      }
      const a = [s.tokenTypeIdx].concat(s.categoryMatches);
      for (const o of a)
        if (n.has(o)) {
          if (!i.has(o))
            return !1;
        } else
          n.add(o), i.add(o);
    }
  }
  return !0;
}
function LA(t) {
  const e = t.decisionStates.length, n = Array(e);
  for (let r = 0; r < e; r++)
    n[r] = bA(t.decisionStates[r], r);
  return n;
}
function Ts(t, e, n, r) {
  const i = t[e](n);
  let s = i.start;
  if (s === void 0) {
    const o = VA(i.atnStartState);
    s = Lf(i, Of(o)), i.start = s;
  }
  return PA.apply(this, [i, s, n, r]);
}
function PA(t, e, n, r) {
  let i = e, s = 1;
  const a = [];
  let o = this.LA(s++);
  for (; ; ) {
    let l = BA(i, o);
    if (l === void 0 && (l = MA.apply(this, [t, i, o, s, n, r])), l === yi)
      return UA(a, i, o);
    if (l.isAcceptState === !0)
      return l.prediction;
    i = l, a.push(o), o = this.LA(s++);
  }
}
function MA(t, e, n, r, i, s) {
  const a = jA(e.configs, n, i);
  if (a.size === 0)
    return El(t, e, n, yi), yi;
  let o = Of(a);
  const l = HA(a, i);
  if (l !== void 0)
    o.isAcceptState = !0, o.prediction = l, o.configs.uniqueAlt = l;
  else if (YA(a)) {
    const u = $d(a.alts);
    o.isAcceptState = !0, o.prediction = u, o.configs.uniqueAlt = u, DA.apply(this, [t, r, a.alts, s]);
  }
  return o = El(t, e, n, o), o;
}
function DA(t, e, n, r) {
  const i = [];
  for (let u = 1; u <= e; u++)
    i.push(this.LA(u).tokenType);
  const s = t.atnStartState, a = s.rule, o = s.production, l = FA({
    topLevelRule: a,
    ambiguityIndices: n,
    production: o,
    prefixPath: i
  });
  r(l);
}
function FA(t) {
  const e = st(t.prefixPath, (i) => Zt(i)).join(", "), n = t.production.idx === 0 ? "" : t.production.idx;
  let r = `Ambiguous Alternatives Detected: <${t.ambiguityIndices.join(", ")}> in <${GA(t.production)}${n}> inside <${t.topLevelRule.name}> Rule,
<${e}> may appears as a prefix path in all these alternatives.
`;
  return r = r + `See: https://chevrotain.io/docs/guide/resolving_grammar_errors.html#AMBIGUOUS_ALTERNATIVES
For Further details.`, r;
}
function GA(t) {
  if (t instanceof ce)
    return "SUBRULE";
  if (t instanceof ie)
    return "OPTION";
  if (t instanceof ye)
    return "OR";
  if (t instanceof Se)
    return "AT_LEAST_ONE";
  if (t instanceof ke)
    return "AT_LEAST_ONE_SEP";
  if (t instanceof ge)
    return "MANY_SEP";
  if (t instanceof z)
    return "MANY";
  if (t instanceof j)
    return "CONSUME";
  throw Error("non exhaustive match");
}
function UA(t, e, n) {
  const r = wd(e.configs.elements, (s) => s.state.transitions), i = Nd(r.filter((s) => s instanceof Qa).map((s) => s.tokenType), (s) => s.tokenTypeIdx);
  return {
    actualToken: n,
    possibleTokenTypes: i,
    tokenPath: t
  };
}
function BA(t, e) {
  return t.edges[e.tokenTypeIdx];
}
function jA(t, e, n) {
  const r = new Qs(), i = [];
  for (const a of t.elements) {
    if (n.is(a.alt) === !1)
      continue;
    if (a.state.type === Tr) {
      i.push(a);
      continue;
    }
    const o = a.state.transitions.length;
    for (let l = 0; l < o; l++) {
      const u = a.state.transitions[l], c = KA(u, e);
      c !== void 0 && r.add({
        state: c,
        alt: a.alt,
        stack: a.stack
      });
    }
  }
  let s;
  if (i.length === 0 && r.size === 1 && (s = r), s === void 0) {
    s = new Qs();
    for (const a of r.elements)
      Ti(a, s);
  }
  if (i.length > 0 && !zA(s))
    for (const a of i)
      s.add(a);
  return s;
}
function KA(t, e) {
  if (t instanceof Qa && sf(e, t.tokenType))
    return t.target;
}
function HA(t, e) {
  let n;
  for (const r of t.elements)
    if (e.is(r.alt) === !0) {
      if (n === void 0)
        n = r.alt;
      else if (n !== r.alt)
        return;
    }
  return n;
}
function Of(t) {
  return {
    configs: t,
    edges: {},
    isAcceptState: !1,
    prediction: -1
  };
}
function El(t, e, n, r) {
  return r = Lf(t, r), e.edges[n.tokenTypeIdx] = r, r;
}
function Lf(t, e) {
  if (e === yi)
    return e;
  const n = e.configs.key, r = t.states[n];
  return r !== void 0 ? r : (e.configs.finalize(), t.states[n] = e, e);
}
function VA(t) {
  const e = new Qs(), n = t.transitions.length;
  for (let r = 0; r < n; r++) {
    const s = {
      state: t.transitions[r].target,
      alt: r,
      stack: []
    };
    Ti(s, e);
  }
  return e;
}
function Ti(t, e) {
  const n = t.state;
  if (n.type === Tr) {
    if (t.stack.length > 0) {
      const i = [...t.stack], a = {
        state: i.pop(),
        alt: t.alt,
        stack: i
      };
      Ti(a, e);
    } else
      e.add(t);
    return;
  }
  n.epsilonOnlyTransitions || e.add(t);
  const r = n.transitions.length;
  for (let i = 0; i < r; i++) {
    const s = n.transitions[i], a = WA(t, s);
    a !== void 0 && Ti(a, e);
  }
}
function WA(t, e) {
  if (e instanceof If)
    return {
      state: e.target,
      alt: t.alt,
      stack: t.stack
    };
  if (e instanceof eo) {
    const n = [...t.stack, e.followState];
    return {
      state: e.target,
      alt: t.alt,
      stack: n
    };
  }
}
function zA(t) {
  for (const e of t.elements)
    if (e.state.type === Tr)
      return !0;
  return !1;
}
function qA(t) {
  for (const e of t.elements)
    if (e.state.type !== Tr)
      return !1;
  return !0;
}
function YA(t) {
  if (qA(t))
    return !0;
  const e = XA(t.elements);
  return JA(e) && !ZA(e);
}
function XA(t) {
  const e = /* @__PURE__ */ new Map();
  for (const n of t) {
    const r = _f(n, !1);
    let i = e.get(r);
    i === void 0 && (i = {}, e.set(r, i)), i[n.alt] = !0;
  }
  return e;
}
function JA(t) {
  for (const e of Array.from(t.values()))
    if (Object.keys(e).length > 1)
      return !0;
  return !1;
}
function ZA(t) {
  for (const e of Array.from(t.values()))
    if (Object.keys(e).length === 1)
      return !0;
  return !1;
}
var $l;
(function(t) {
  function e(n) {
    return typeof n == "string";
  }
  t.is = e;
})($l || ($l = {}));
var ea;
(function(t) {
  function e(n) {
    return typeof n == "string";
  }
  t.is = e;
})(ea || (ea = {}));
var xl;
(function(t) {
  t.MIN_VALUE = -2147483648, t.MAX_VALUE = 2147483647;
  function e(n) {
    return typeof n == "number" && t.MIN_VALUE <= n && n <= t.MAX_VALUE;
  }
  t.is = e;
})(xl || (xl = {}));
var vi;
(function(t) {
  t.MIN_VALUE = 0, t.MAX_VALUE = 2147483647;
  function e(n) {
    return typeof n == "number" && t.MIN_VALUE <= n && n <= t.MAX_VALUE;
  }
  t.is = e;
})(vi || (vi = {}));
var D;
(function(t) {
  function e(r, i) {
    return r === Number.MAX_VALUE && (r = vi.MAX_VALUE), i === Number.MAX_VALUE && (i = vi.MAX_VALUE), { line: r, character: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.objectLiteral(i) && p.uinteger(i.line) && p.uinteger(i.character);
  }
  t.is = n;
})(D || (D = {}));
var L;
(function(t) {
  function e(r, i, s, a) {
    if (p.uinteger(r) && p.uinteger(i) && p.uinteger(s) && p.uinteger(a))
      return { start: D.create(r, i), end: D.create(s, a) };
    if (D.is(r) && D.is(i))
      return { start: r, end: i };
    throw new Error(`Range#create called with invalid arguments[${r}, ${i}, ${s}, ${a}]`);
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.objectLiteral(i) && D.is(i.start) && D.is(i.end);
  }
  t.is = n;
})(L || (L = {}));
var Ri;
(function(t) {
  function e(r, i) {
    return { uri: r, range: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.objectLiteral(i) && L.is(i.range) && (p.string(i.uri) || p.undefined(i.uri));
  }
  t.is = n;
})(Ri || (Ri = {}));
var Sl;
(function(t) {
  function e(r, i, s, a) {
    return { targetUri: r, targetRange: i, targetSelectionRange: s, originSelectionRange: a };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.objectLiteral(i) && L.is(i.targetRange) && p.string(i.targetUri) && L.is(i.targetSelectionRange) && (L.is(i.originSelectionRange) || p.undefined(i.originSelectionRange));
  }
  t.is = n;
})(Sl || (Sl = {}));
var ta;
(function(t) {
  function e(r, i, s, a) {
    return {
      red: r,
      green: i,
      blue: s,
      alpha: a
    };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && p.numberRange(i.red, 0, 1) && p.numberRange(i.green, 0, 1) && p.numberRange(i.blue, 0, 1) && p.numberRange(i.alpha, 0, 1);
  }
  t.is = n;
})(ta || (ta = {}));
var kl;
(function(t) {
  function e(r, i) {
    return {
      range: r,
      color: i
    };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && L.is(i.range) && ta.is(i.color);
  }
  t.is = n;
})(kl || (kl = {}));
var Il;
(function(t) {
  function e(r, i, s) {
    return {
      label: r,
      textEdit: i,
      additionalTextEdits: s
    };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && p.string(i.label) && (p.undefined(i.textEdit) || an.is(i)) && (p.undefined(i.additionalTextEdits) || p.typedArray(i.additionalTextEdits, an.is));
  }
  t.is = n;
})(Il || (Il = {}));
var Cl;
(function(t) {
  t.Comment = "comment", t.Imports = "imports", t.Region = "region";
})(Cl || (Cl = {}));
var wl;
(function(t) {
  function e(r, i, s, a, o, l) {
    const u = {
      startLine: r,
      endLine: i
    };
    return p.defined(s) && (u.startCharacter = s), p.defined(a) && (u.endCharacter = a), p.defined(o) && (u.kind = o), p.defined(l) && (u.collapsedText = l), u;
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && p.uinteger(i.startLine) && p.uinteger(i.startLine) && (p.undefined(i.startCharacter) || p.uinteger(i.startCharacter)) && (p.undefined(i.endCharacter) || p.uinteger(i.endCharacter)) && (p.undefined(i.kind) || p.string(i.kind));
  }
  t.is = n;
})(wl || (wl = {}));
var na;
(function(t) {
  function e(r, i) {
    return {
      location: r,
      message: i
    };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && Ri.is(i.location) && p.string(i.message);
  }
  t.is = n;
})(na || (na = {}));
var Nl;
(function(t) {
  t.Error = 1, t.Warning = 2, t.Information = 3, t.Hint = 4;
})(Nl || (Nl = {}));
var _l;
(function(t) {
  t.Unnecessary = 1, t.Deprecated = 2;
})(_l || (_l = {}));
var bl;
(function(t) {
  function e(n) {
    const r = n;
    return p.objectLiteral(r) && p.string(r.href);
  }
  t.is = e;
})(bl || (bl = {}));
var Ai;
(function(t) {
  function e(r, i, s, a, o, l) {
    let u = { range: r, message: i };
    return p.defined(s) && (u.severity = s), p.defined(a) && (u.code = a), p.defined(o) && (u.source = o), p.defined(l) && (u.relatedInformation = l), u;
  }
  t.create = e;
  function n(r) {
    var i;
    let s = r;
    return p.defined(s) && L.is(s.range) && p.string(s.message) && (p.number(s.severity) || p.undefined(s.severity)) && (p.integer(s.code) || p.string(s.code) || p.undefined(s.code)) && (p.undefined(s.codeDescription) || p.string((i = s.codeDescription) === null || i === void 0 ? void 0 : i.href)) && (p.string(s.source) || p.undefined(s.source)) && (p.undefined(s.relatedInformation) || p.typedArray(s.relatedInformation, na.is));
  }
  t.is = n;
})(Ai || (Ai = {}));
var sn;
(function(t) {
  function e(r, i, ...s) {
    let a = { title: r, command: i };
    return p.defined(s) && s.length > 0 && (a.arguments = s), a;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.string(i.title) && p.string(i.command);
  }
  t.is = n;
})(sn || (sn = {}));
var an;
(function(t) {
  function e(s, a) {
    return { range: s, newText: a };
  }
  t.replace = e;
  function n(s, a) {
    return { range: { start: s, end: s }, newText: a };
  }
  t.insert = n;
  function r(s) {
    return { range: s, newText: "" };
  }
  t.del = r;
  function i(s) {
    const a = s;
    return p.objectLiteral(a) && p.string(a.newText) && L.is(a.range);
  }
  t.is = i;
})(an || (an = {}));
var ra;
(function(t) {
  function e(r, i, s) {
    const a = { label: r };
    return i !== void 0 && (a.needsConfirmation = i), s !== void 0 && (a.description = s), a;
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && p.string(i.label) && (p.boolean(i.needsConfirmation) || i.needsConfirmation === void 0) && (p.string(i.description) || i.description === void 0);
  }
  t.is = n;
})(ra || (ra = {}));
var on;
(function(t) {
  function e(n) {
    const r = n;
    return p.string(r);
  }
  t.is = e;
})(on || (on = {}));
var Ol;
(function(t) {
  function e(s, a, o) {
    return { range: s, newText: a, annotationId: o };
  }
  t.replace = e;
  function n(s, a, o) {
    return { range: { start: s, end: s }, newText: a, annotationId: o };
  }
  t.insert = n;
  function r(s, a) {
    return { range: s, newText: "", annotationId: a };
  }
  t.del = r;
  function i(s) {
    const a = s;
    return an.is(a) && (ra.is(a.annotationId) || on.is(a.annotationId));
  }
  t.is = i;
})(Ol || (Ol = {}));
var ia;
(function(t) {
  function e(r, i) {
    return { textDocument: r, edits: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && ua.is(i.textDocument) && Array.isArray(i.edits);
  }
  t.is = n;
})(ia || (ia = {}));
var sa;
(function(t) {
  function e(r, i, s) {
    let a = {
      kind: "create",
      uri: r
    };
    return i !== void 0 && (i.overwrite !== void 0 || i.ignoreIfExists !== void 0) && (a.options = i), s !== void 0 && (a.annotationId = s), a;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return i && i.kind === "create" && p.string(i.uri) && (i.options === void 0 || (i.options.overwrite === void 0 || p.boolean(i.options.overwrite)) && (i.options.ignoreIfExists === void 0 || p.boolean(i.options.ignoreIfExists))) && (i.annotationId === void 0 || on.is(i.annotationId));
  }
  t.is = n;
})(sa || (sa = {}));
var aa;
(function(t) {
  function e(r, i, s, a) {
    let o = {
      kind: "rename",
      oldUri: r,
      newUri: i
    };
    return s !== void 0 && (s.overwrite !== void 0 || s.ignoreIfExists !== void 0) && (o.options = s), a !== void 0 && (o.annotationId = a), o;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return i && i.kind === "rename" && p.string(i.oldUri) && p.string(i.newUri) && (i.options === void 0 || (i.options.overwrite === void 0 || p.boolean(i.options.overwrite)) && (i.options.ignoreIfExists === void 0 || p.boolean(i.options.ignoreIfExists))) && (i.annotationId === void 0 || on.is(i.annotationId));
  }
  t.is = n;
})(aa || (aa = {}));
var oa;
(function(t) {
  function e(r, i, s) {
    let a = {
      kind: "delete",
      uri: r
    };
    return i !== void 0 && (i.recursive !== void 0 || i.ignoreIfNotExists !== void 0) && (a.options = i), s !== void 0 && (a.annotationId = s), a;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return i && i.kind === "delete" && p.string(i.uri) && (i.options === void 0 || (i.options.recursive === void 0 || p.boolean(i.options.recursive)) && (i.options.ignoreIfNotExists === void 0 || p.boolean(i.options.ignoreIfNotExists))) && (i.annotationId === void 0 || on.is(i.annotationId));
  }
  t.is = n;
})(oa || (oa = {}));
var la;
(function(t) {
  function e(n) {
    let r = n;
    return r && (r.changes !== void 0 || r.documentChanges !== void 0) && (r.documentChanges === void 0 || r.documentChanges.every((i) => p.string(i.kind) ? sa.is(i) || aa.is(i) || oa.is(i) : ia.is(i)));
  }
  t.is = e;
})(la || (la = {}));
var Ll;
(function(t) {
  function e(r) {
    return { uri: r };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.string(i.uri);
  }
  t.is = n;
})(Ll || (Ll = {}));
var Pl;
(function(t) {
  function e(r, i) {
    return { uri: r, version: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.string(i.uri) && p.integer(i.version);
  }
  t.is = n;
})(Pl || (Pl = {}));
var ua;
(function(t) {
  function e(r, i) {
    return { uri: r, version: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.string(i.uri) && (i.version === null || p.integer(i.version));
  }
  t.is = n;
})(ua || (ua = {}));
var Ml;
(function(t) {
  function e(r, i, s, a) {
    return { uri: r, languageId: i, version: s, text: a };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.string(i.uri) && p.string(i.languageId) && p.integer(i.version) && p.string(i.text);
  }
  t.is = n;
})(Ml || (Ml = {}));
var ca;
(function(t) {
  t.PlainText = "plaintext", t.Markdown = "markdown";
  function e(n) {
    const r = n;
    return r === t.PlainText || r === t.Markdown;
  }
  t.is = e;
})(ca || (ca = {}));
var sr;
(function(t) {
  function e(n) {
    const r = n;
    return p.objectLiteral(n) && ca.is(r.kind) && p.string(r.value);
  }
  t.is = e;
})(sr || (sr = {}));
var Dl;
(function(t) {
  t.Text = 1, t.Method = 2, t.Function = 3, t.Constructor = 4, t.Field = 5, t.Variable = 6, t.Class = 7, t.Interface = 8, t.Module = 9, t.Property = 10, t.Unit = 11, t.Value = 12, t.Enum = 13, t.Keyword = 14, t.Snippet = 15, t.Color = 16, t.File = 17, t.Reference = 18, t.Folder = 19, t.EnumMember = 20, t.Constant = 21, t.Struct = 22, t.Event = 23, t.Operator = 24, t.TypeParameter = 25;
})(Dl || (Dl = {}));
var Fl;
(function(t) {
  t.PlainText = 1, t.Snippet = 2;
})(Fl || (Fl = {}));
var Gl;
(function(t) {
  t.Deprecated = 1;
})(Gl || (Gl = {}));
var Ul;
(function(t) {
  function e(r, i, s) {
    return { newText: r, insert: i, replace: s };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return i && p.string(i.newText) && L.is(i.insert) && L.is(i.replace);
  }
  t.is = n;
})(Ul || (Ul = {}));
var Bl;
(function(t) {
  t.asIs = 1, t.adjustIndentation = 2;
})(Bl || (Bl = {}));
var jl;
(function(t) {
  function e(n) {
    const r = n;
    return r && (p.string(r.detail) || r.detail === void 0) && (p.string(r.description) || r.description === void 0);
  }
  t.is = e;
})(jl || (jl = {}));
var Kl;
(function(t) {
  function e(n) {
    return { label: n };
  }
  t.create = e;
})(Kl || (Kl = {}));
var Hl;
(function(t) {
  function e(n, r) {
    return { items: n || [], isIncomplete: !!r };
  }
  t.create = e;
})(Hl || (Hl = {}));
var Ei;
(function(t) {
  function e(r) {
    return r.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
  }
  t.fromPlainText = e;
  function n(r) {
    const i = r;
    return p.string(i) || p.objectLiteral(i) && p.string(i.language) && p.string(i.value);
  }
  t.is = n;
})(Ei || (Ei = {}));
var Vl;
(function(t) {
  function e(n) {
    let r = n;
    return !!r && p.objectLiteral(r) && (sr.is(r.contents) || Ei.is(r.contents) || p.typedArray(r.contents, Ei.is)) && (n.range === void 0 || L.is(n.range));
  }
  t.is = e;
})(Vl || (Vl = {}));
var Wl;
(function(t) {
  function e(n, r) {
    return r ? { label: n, documentation: r } : { label: n };
  }
  t.create = e;
})(Wl || (Wl = {}));
var zl;
(function(t) {
  function e(n, r, ...i) {
    let s = { label: n };
    return p.defined(r) && (s.documentation = r), p.defined(i) ? s.parameters = i : s.parameters = [], s;
  }
  t.create = e;
})(zl || (zl = {}));
var ql;
(function(t) {
  t.Text = 1, t.Read = 2, t.Write = 3;
})(ql || (ql = {}));
var Yl;
(function(t) {
  function e(n, r) {
    let i = { range: n };
    return p.number(r) && (i.kind = r), i;
  }
  t.create = e;
})(Yl || (Yl = {}));
var Xl;
(function(t) {
  t.File = 1, t.Module = 2, t.Namespace = 3, t.Package = 4, t.Class = 5, t.Method = 6, t.Property = 7, t.Field = 8, t.Constructor = 9, t.Enum = 10, t.Interface = 11, t.Function = 12, t.Variable = 13, t.Constant = 14, t.String = 15, t.Number = 16, t.Boolean = 17, t.Array = 18, t.Object = 19, t.Key = 20, t.Null = 21, t.EnumMember = 22, t.Struct = 23, t.Event = 24, t.Operator = 25, t.TypeParameter = 26;
})(Xl || (Xl = {}));
var Jl;
(function(t) {
  t.Deprecated = 1;
})(Jl || (Jl = {}));
var Zl;
(function(t) {
  function e(n, r, i, s, a) {
    let o = {
      name: n,
      kind: r,
      location: { uri: s, range: i }
    };
    return a && (o.containerName = a), o;
  }
  t.create = e;
})(Zl || (Zl = {}));
var Ql;
(function(t) {
  function e(n, r, i, s) {
    return s !== void 0 ? { name: n, kind: r, location: { uri: i, range: s } } : { name: n, kind: r, location: { uri: i } };
  }
  t.create = e;
})(Ql || (Ql = {}));
var eu;
(function(t) {
  function e(r, i, s, a, o, l) {
    let u = {
      name: r,
      detail: i,
      kind: s,
      range: a,
      selectionRange: o
    };
    return l !== void 0 && (u.children = l), u;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return i && p.string(i.name) && p.number(i.kind) && L.is(i.range) && L.is(i.selectionRange) && (i.detail === void 0 || p.string(i.detail)) && (i.deprecated === void 0 || p.boolean(i.deprecated)) && (i.children === void 0 || Array.isArray(i.children)) && (i.tags === void 0 || Array.isArray(i.tags));
  }
  t.is = n;
})(eu || (eu = {}));
var tu;
(function(t) {
  t.Empty = "", t.QuickFix = "quickfix", t.Refactor = "refactor", t.RefactorExtract = "refactor.extract", t.RefactorInline = "refactor.inline", t.RefactorRewrite = "refactor.rewrite", t.Source = "source", t.SourceOrganizeImports = "source.organizeImports", t.SourceFixAll = "source.fixAll";
})(tu || (tu = {}));
var $i;
(function(t) {
  t.Invoked = 1, t.Automatic = 2;
})($i || ($i = {}));
var nu;
(function(t) {
  function e(r, i, s) {
    let a = { diagnostics: r };
    return i != null && (a.only = i), s != null && (a.triggerKind = s), a;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.typedArray(i.diagnostics, Ai.is) && (i.only === void 0 || p.typedArray(i.only, p.string)) && (i.triggerKind === void 0 || i.triggerKind === $i.Invoked || i.triggerKind === $i.Automatic);
  }
  t.is = n;
})(nu || (nu = {}));
var ru;
(function(t) {
  function e(r, i, s) {
    let a = { title: r }, o = !0;
    return typeof i == "string" ? (o = !1, a.kind = i) : sn.is(i) ? a.command = i : a.edit = i, o && s !== void 0 && (a.kind = s), a;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return i && p.string(i.title) && (i.diagnostics === void 0 || p.typedArray(i.diagnostics, Ai.is)) && (i.kind === void 0 || p.string(i.kind)) && (i.edit !== void 0 || i.command !== void 0) && (i.command === void 0 || sn.is(i.command)) && (i.isPreferred === void 0 || p.boolean(i.isPreferred)) && (i.edit === void 0 || la.is(i.edit));
  }
  t.is = n;
})(ru || (ru = {}));
var iu;
(function(t) {
  function e(r, i) {
    let s = { range: r };
    return p.defined(i) && (s.data = i), s;
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && L.is(i.range) && (p.undefined(i.command) || sn.is(i.command));
  }
  t.is = n;
})(iu || (iu = {}));
var su;
(function(t) {
  function e(r, i) {
    return { tabSize: r, insertSpaces: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && p.uinteger(i.tabSize) && p.boolean(i.insertSpaces);
  }
  t.is = n;
})(su || (su = {}));
var au;
(function(t) {
  function e(r, i, s) {
    return { range: r, target: i, data: s };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.defined(i) && L.is(i.range) && (p.undefined(i.target) || p.string(i.target));
  }
  t.is = n;
})(au || (au = {}));
var ou;
(function(t) {
  function e(r, i) {
    return { range: r, parent: i };
  }
  t.create = e;
  function n(r) {
    let i = r;
    return p.objectLiteral(i) && L.is(i.range) && (i.parent === void 0 || t.is(i.parent));
  }
  t.is = n;
})(ou || (ou = {}));
var lu;
(function(t) {
  t.namespace = "namespace", t.type = "type", t.class = "class", t.enum = "enum", t.interface = "interface", t.struct = "struct", t.typeParameter = "typeParameter", t.parameter = "parameter", t.variable = "variable", t.property = "property", t.enumMember = "enumMember", t.event = "event", t.function = "function", t.method = "method", t.macro = "macro", t.keyword = "keyword", t.modifier = "modifier", t.comment = "comment", t.string = "string", t.number = "number", t.regexp = "regexp", t.operator = "operator", t.decorator = "decorator";
})(lu || (lu = {}));
var uu;
(function(t) {
  t.declaration = "declaration", t.definition = "definition", t.readonly = "readonly", t.static = "static", t.deprecated = "deprecated", t.abstract = "abstract", t.async = "async", t.modification = "modification", t.documentation = "documentation", t.defaultLibrary = "defaultLibrary";
})(uu || (uu = {}));
var cu;
(function(t) {
  function e(n) {
    const r = n;
    return p.objectLiteral(r) && (r.resultId === void 0 || typeof r.resultId == "string") && Array.isArray(r.data) && (r.data.length === 0 || typeof r.data[0] == "number");
  }
  t.is = e;
})(cu || (cu = {}));
var fu;
(function(t) {
  function e(r, i) {
    return { range: r, text: i };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return i != null && L.is(i.range) && p.string(i.text);
  }
  t.is = n;
})(fu || (fu = {}));
var du;
(function(t) {
  function e(r, i, s) {
    return { range: r, variableName: i, caseSensitiveLookup: s };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return i != null && L.is(i.range) && p.boolean(i.caseSensitiveLookup) && (p.string(i.variableName) || i.variableName === void 0);
  }
  t.is = n;
})(du || (du = {}));
var hu;
(function(t) {
  function e(r, i) {
    return { range: r, expression: i };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return i != null && L.is(i.range) && (p.string(i.expression) || i.expression === void 0);
  }
  t.is = n;
})(hu || (hu = {}));
var pu;
(function(t) {
  function e(r, i) {
    return { frameId: r, stoppedLocation: i };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.defined(i) && L.is(r.stoppedLocation);
  }
  t.is = n;
})(pu || (pu = {}));
var fa;
(function(t) {
  t.Type = 1, t.Parameter = 2;
  function e(n) {
    return n === 1 || n === 2;
  }
  t.is = e;
})(fa || (fa = {}));
var da;
(function(t) {
  function e(r) {
    return { value: r };
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && (i.tooltip === void 0 || p.string(i.tooltip) || sr.is(i.tooltip)) && (i.location === void 0 || Ri.is(i.location)) && (i.command === void 0 || sn.is(i.command));
  }
  t.is = n;
})(da || (da = {}));
var mu;
(function(t) {
  function e(r, i, s) {
    const a = { position: r, label: i };
    return s !== void 0 && (a.kind = s), a;
  }
  t.create = e;
  function n(r) {
    const i = r;
    return p.objectLiteral(i) && D.is(i.position) && (p.string(i.label) || p.typedArray(i.label, da.is)) && (i.kind === void 0 || fa.is(i.kind)) && i.textEdits === void 0 || p.typedArray(i.textEdits, an.is) && (i.tooltip === void 0 || p.string(i.tooltip) || sr.is(i.tooltip)) && (i.paddingLeft === void 0 || p.boolean(i.paddingLeft)) && (i.paddingRight === void 0 || p.boolean(i.paddingRight));
  }
  t.is = n;
})(mu || (mu = {}));
var gu;
(function(t) {
  function e(n) {
    return { kind: "snippet", value: n };
  }
  t.createSnippet = e;
})(gu || (gu = {}));
var yu;
(function(t) {
  function e(n, r, i, s) {
    return { insertText: n, filterText: r, range: i, command: s };
  }
  t.create = e;
})(yu || (yu = {}));
var Tu;
(function(t) {
  function e(n) {
    return { items: n };
  }
  t.create = e;
})(Tu || (Tu = {}));
var vu;
(function(t) {
  t.Invoked = 0, t.Automatic = 1;
})(vu || (vu = {}));
var Ru;
(function(t) {
  function e(n, r) {
    return { range: n, text: r };
  }
  t.create = e;
})(Ru || (Ru = {}));
var Au;
(function(t) {
  function e(n, r) {
    return { triggerKind: n, selectedCompletionInfo: r };
  }
  t.create = e;
})(Au || (Au = {}));
var Eu;
(function(t) {
  function e(n) {
    const r = n;
    return p.objectLiteral(r) && ea.is(r.uri) && p.string(r.name);
  }
  t.is = e;
})(Eu || (Eu = {}));
var $u;
(function(t) {
  function e(s, a, o, l) {
    return new QA(s, a, o, l);
  }
  t.create = e;
  function n(s) {
    let a = s;
    return !!(p.defined(a) && p.string(a.uri) && (p.undefined(a.languageId) || p.string(a.languageId)) && p.uinteger(a.lineCount) && p.func(a.getText) && p.func(a.positionAt) && p.func(a.offsetAt));
  }
  t.is = n;
  function r(s, a) {
    let o = s.getText(), l = i(a, (c, f) => {
      let d = c.range.start.line - f.range.start.line;
      return d === 0 ? c.range.start.character - f.range.start.character : d;
    }), u = o.length;
    for (let c = l.length - 1; c >= 0; c--) {
      let f = l[c], d = s.offsetAt(f.range.start), h = s.offsetAt(f.range.end);
      if (h <= u)
        o = o.substring(0, d) + f.newText + o.substring(h, o.length);
      else
        throw new Error("Overlapping edit");
      u = d;
    }
    return o;
  }
  t.applyEdits = r;
  function i(s, a) {
    if (s.length <= 1)
      return s;
    const o = s.length / 2 | 0, l = s.slice(0, o), u = s.slice(o);
    i(l, a), i(u, a);
    let c = 0, f = 0, d = 0;
    for (; c < l.length && f < u.length; )
      a(l[c], u[f]) <= 0 ? s[d++] = l[c++] : s[d++] = u[f++];
    for (; c < l.length; )
      s[d++] = l[c++];
    for (; f < u.length; )
      s[d++] = u[f++];
    return s;
  }
})($u || ($u = {}));
let QA = class {
  constructor(e, n, r, i) {
    this._uri = e, this._languageId = n, this._version = r, this._content = i, this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(e) {
    if (e) {
      let n = this.offsetAt(e.start), r = this.offsetAt(e.end);
      return this._content.substring(n, r);
    }
    return this._content;
  }
  update(e, n) {
    this._content = e.text, this._version = n, this._lineOffsets = void 0;
  }
  getLineOffsets() {
    if (this._lineOffsets === void 0) {
      let e = [], n = this._content, r = !0;
      for (let i = 0; i < n.length; i++) {
        r && (e.push(i), r = !1);
        let s = n.charAt(i);
        r = s === "\r" || s === `
`, s === "\r" && i + 1 < n.length && n.charAt(i + 1) === `
` && i++;
      }
      r && n.length > 0 && e.push(n.length), this._lineOffsets = e;
    }
    return this._lineOffsets;
  }
  positionAt(e) {
    e = Math.max(Math.min(e, this._content.length), 0);
    let n = this.getLineOffsets(), r = 0, i = n.length;
    if (i === 0)
      return D.create(0, e);
    for (; r < i; ) {
      let a = Math.floor((r + i) / 2);
      n[a] > e ? i = a : r = a + 1;
    }
    let s = r - 1;
    return D.create(s, e - n[s]);
  }
  offsetAt(e) {
    let n = this.getLineOffsets();
    if (e.line >= n.length)
      return this._content.length;
    if (e.line < 0)
      return 0;
    let r = n[e.line], i = e.line + 1 < n.length ? n[e.line + 1] : this._content.length;
    return Math.max(Math.min(r + e.character, i), r);
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
};
var p;
(function(t) {
  const e = Object.prototype.toString;
  function n(h) {
    return typeof h < "u";
  }
  t.defined = n;
  function r(h) {
    return typeof h > "u";
  }
  t.undefined = r;
  function i(h) {
    return h === !0 || h === !1;
  }
  t.boolean = i;
  function s(h) {
    return e.call(h) === "[object String]";
  }
  t.string = s;
  function a(h) {
    return e.call(h) === "[object Number]";
  }
  t.number = a;
  function o(h, m, g) {
    return e.call(h) === "[object Number]" && m <= h && h <= g;
  }
  t.numberRange = o;
  function l(h) {
    return e.call(h) === "[object Number]" && -2147483648 <= h && h <= 2147483647;
  }
  t.integer = l;
  function u(h) {
    return e.call(h) === "[object Number]" && 0 <= h && h <= 2147483647;
  }
  t.uinteger = u;
  function c(h) {
    return e.call(h) === "[object Function]";
  }
  t.func = c;
  function f(h) {
    return h !== null && typeof h == "object";
  }
  t.objectLiteral = f;
  function d(h, m) {
    return Array.isArray(h) && h.every(m);
  }
  t.typedArray = d;
})(p || (p = {}));
class eE {
  constructor() {
    this.nodeStack = [];
  }
  get current() {
    var e;
    return (e = this.nodeStack[this.nodeStack.length - 1]) !== null && e !== void 0 ? e : this.rootNode;
  }
  buildRootNode(e) {
    return this.rootNode = new Mf(e), this.rootNode.root = this.rootNode, this.nodeStack = [this.rootNode], this.rootNode;
  }
  buildCompositeNode(e) {
    const n = new ro();
    return n.grammarSource = e, n.root = this.rootNode, this.current.content.push(n), this.nodeStack.push(n), n;
  }
  buildLeafNode(e, n) {
    const r = new ha(e.startOffset, e.image.length, Ms(e), e.tokenType, !n);
    return r.grammarSource = n, r.root = this.rootNode, this.current.content.push(r), r;
  }
  removeNode(e) {
    const n = e.container;
    if (n) {
      const r = n.content.indexOf(e);
      r >= 0 && n.content.splice(r, 1);
    }
  }
  addHiddenNodes(e) {
    const n = [];
    for (const s of e) {
      const a = new ha(s.startOffset, s.image.length, Ms(s), s.tokenType, !0);
      a.root = this.rootNode, n.push(a);
    }
    let r = this.current, i = !1;
    if (r.content.length > 0) {
      r.content.push(...n);
      return;
    }
    for (; r.container; ) {
      const s = r.container.content.indexOf(r);
      if (s > 0) {
        r.container.content.splice(s, 0, ...n), i = !0;
        break;
      }
      r = r.container;
    }
    i || this.rootNode.content.unshift(...n);
  }
  construct(e) {
    const n = this.current;
    typeof e.$type == "string" && (this.current.astNode = e), e.$cstNode = n;
    const r = this.nodeStack.pop();
    r?.content.length === 0 && this.removeNode(r);
  }
}
class Pf {
  /** @deprecated use `container` instead. */
  get parent() {
    return this.container;
  }
  /** @deprecated use `grammarSource` instead. */
  get feature() {
    return this.grammarSource;
  }
  get hidden() {
    return !1;
  }
  get astNode() {
    var e, n;
    const r = typeof ((e = this._astNode) === null || e === void 0 ? void 0 : e.$type) == "string" ? this._astNode : (n = this.container) === null || n === void 0 ? void 0 : n.astNode;
    if (!r)
      throw new Error("This node has no associated AST element");
    return r;
  }
  set astNode(e) {
    this._astNode = e;
  }
  /** @deprecated use `astNode` instead. */
  get element() {
    return this.astNode;
  }
  get text() {
    return this.root.fullText.substring(this.offset, this.end);
  }
}
class ha extends Pf {
  get offset() {
    return this._offset;
  }
  get length() {
    return this._length;
  }
  get end() {
    return this._offset + this._length;
  }
  get hidden() {
    return this._hidden;
  }
  get tokenType() {
    return this._tokenType;
  }
  get range() {
    return this._range;
  }
  constructor(e, n, r, i, s = !1) {
    super(), this._hidden = s, this._offset = e, this._tokenType = i, this._length = n, this._range = r;
  }
}
class ro extends Pf {
  constructor() {
    super(...arguments), this.content = new io(this);
  }
  /** @deprecated use `content` instead. */
  get children() {
    return this.content;
  }
  get offset() {
    var e, n;
    return (n = (e = this.firstNonHiddenNode) === null || e === void 0 ? void 0 : e.offset) !== null && n !== void 0 ? n : 0;
  }
  get length() {
    return this.end - this.offset;
  }
  get end() {
    var e, n;
    return (n = (e = this.lastNonHiddenNode) === null || e === void 0 ? void 0 : e.end) !== null && n !== void 0 ? n : 0;
  }
  get range() {
    const e = this.firstNonHiddenNode, n = this.lastNonHiddenNode;
    if (e && n) {
      if (this._rangeCache === void 0) {
        const { range: r } = e, { range: i } = n;
        this._rangeCache = { start: r.start, end: i.end.line < r.start.line ? r.start : i.end };
      }
      return this._rangeCache;
    } else
      return { start: D.create(0, 0), end: D.create(0, 0) };
  }
  get firstNonHiddenNode() {
    for (const e of this.content)
      if (!e.hidden)
        return e;
    return this.content[0];
  }
  get lastNonHiddenNode() {
    for (let e = this.content.length - 1; e >= 0; e--) {
      const n = this.content[e];
      if (!n.hidden)
        return n;
    }
    return this.content[this.content.length - 1];
  }
}
class io extends Array {
  constructor(e) {
    super(), this.parent = e, Object.setPrototypeOf(this, io.prototype);
  }
  push(...e) {
    return this.addParents(e), super.push(...e);
  }
  unshift(...e) {
    return this.addParents(e), super.unshift(...e);
  }
  splice(e, n, ...r) {
    return this.addParents(r), super.splice(e, n, ...r);
  }
  addParents(e) {
    for (const n of e)
      n.container = this.parent;
  }
}
class Mf extends ro {
  get text() {
    return this._text.substring(this.offset, this.end);
  }
  get fullText() {
    return this._text;
  }
  constructor(e) {
    super(), this._text = "", this._text = e ?? "";
  }
}
const pa = /* @__PURE__ */ Symbol("Datatype");
function vs(t) {
  return t.$type === pa;
}
const xu = "​", Df = (t) => t.endsWith(xu) ? t : t + xu;
class Ff {
  constructor(e) {
    this._unorderedGroups = /* @__PURE__ */ new Map(), this.allRules = /* @__PURE__ */ new Map(), this.lexer = e.parser.Lexer;
    const n = this.lexer.definition, r = e.LanguageMetaData.mode === "production";
    this.wrapper = new sE(n, Object.assign(Object.assign({}, e.parser.ParserConfig), { skipValidations: r, errorMessageProvider: e.parser.ParserErrorMessageProvider }));
  }
  alternatives(e, n) {
    this.wrapper.wrapOr(e, n);
  }
  optional(e, n) {
    this.wrapper.wrapOption(e, n);
  }
  many(e, n) {
    this.wrapper.wrapMany(e, n);
  }
  atLeastOne(e, n) {
    this.wrapper.wrapAtLeastOne(e, n);
  }
  getRule(e) {
    return this.allRules.get(e);
  }
  isRecording() {
    return this.wrapper.IS_RECORDING;
  }
  get unorderedGroups() {
    return this._unorderedGroups;
  }
  getRuleStack() {
    return this.wrapper.RULE_STACK;
  }
  finalize() {
    this.wrapper.wrapSelfAnalysis();
  }
}
class tE extends Ff {
  get current() {
    return this.stack[this.stack.length - 1];
  }
  constructor(e) {
    super(e), this.nodeBuilder = new eE(), this.stack = [], this.assignmentMap = /* @__PURE__ */ new Map(), this.linker = e.references.Linker, this.converter = e.parser.ValueConverter, this.astReflection = e.shared.AstReflection;
  }
  rule(e, n) {
    const r = this.computeRuleType(e), i = this.wrapper.DEFINE_RULE(Df(e.name), this.startImplementation(r, n).bind(this));
    return this.allRules.set(e.name, i), e.entry && (this.mainRule = i), i;
  }
  computeRuleType(e) {
    if (!e.fragment) {
      if (dc(e))
        return pa;
      {
        const n = Sa(e);
        return n ?? e.name;
      }
    }
  }
  parse(e, n = {}) {
    this.nodeBuilder.buildRootNode(e);
    const r = this.lexerResult = this.lexer.tokenize(e);
    this.wrapper.input = r.tokens;
    const i = n.rule ? this.allRules.get(n.rule) : this.mainRule;
    if (!i)
      throw new Error(n.rule ? `No rule found with name '${n.rule}'` : "No main rule available.");
    const s = i.call(this.wrapper, {});
    return this.nodeBuilder.addHiddenNodes(r.hidden), this.unorderedGroups.clear(), this.lexerResult = void 0, {
      value: s,
      lexerErrors: r.errors,
      lexerReport: r.report,
      parserErrors: this.wrapper.errors
    };
  }
  startImplementation(e, n) {
    return (r) => {
      const i = !this.isRecording() && e !== void 0;
      if (i) {
        const a = { $type: e };
        this.stack.push(a), e === pa && (a.value = "");
      }
      let s;
      try {
        s = n(r);
      } catch {
        s = void 0;
      }
      return s === void 0 && i && (s = this.construct()), s;
    };
  }
  extractHiddenTokens(e) {
    const n = this.lexerResult.hidden;
    if (!n.length)
      return [];
    const r = e.startOffset;
    for (let i = 0; i < n.length; i++)
      if (n[i].startOffset > r)
        return n.splice(0, i);
    return n.splice(0, n.length);
  }
  consume(e, n, r) {
    const i = this.wrapper.wrapConsume(e, n);
    if (!this.isRecording() && this.isValidToken(i)) {
      const s = this.extractHiddenTokens(i);
      this.nodeBuilder.addHiddenNodes(s);
      const a = this.nodeBuilder.buildLeafNode(i, r), { assignment: o, isCrossRef: l } = this.getAssignment(r), u = this.current;
      if (o) {
        const c = Ot(r) ? i.image : this.converter.convert(i.image, a);
        this.assign(o.operator, o.feature, c, a, l);
      } else if (vs(u)) {
        let c = i.image;
        Ot(r) || (c = this.converter.convert(c, a).toString()), u.value += c;
      }
    }
  }
  /**
   * Most consumed parser tokens are valid. However there are two cases in which they are not valid:
   *
   * 1. They were inserted during error recovery by the parser. These tokens don't really exist and should not be further processed
   * 2. They contain invalid token ranges. This might include the special EOF token, or other tokens produced by invalid token builders.
   */
  isValidToken(e) {
    return !e.isInsertedInRecovery && !isNaN(e.startOffset) && typeof e.endOffset == "number" && !isNaN(e.endOffset);
  }
  subrule(e, n, r, i, s) {
    let a;
    !this.isRecording() && !r && (a = this.nodeBuilder.buildCompositeNode(i));
    const o = this.wrapper.wrapSubrule(e, n, s);
    !this.isRecording() && a && a.length > 0 && this.performSubruleAssignment(o, i, a);
  }
  performSubruleAssignment(e, n, r) {
    const { assignment: i, isCrossRef: s } = this.getAssignment(n);
    if (i)
      this.assign(i.operator, i.feature, e, r, s);
    else if (!i) {
      const a = this.current;
      if (vs(a))
        a.value += e.toString();
      else if (typeof e == "object" && e) {
        const l = this.assignWithoutOverride(e, a);
        this.stack.pop(), this.stack.push(l);
      }
    }
  }
  action(e, n) {
    if (!this.isRecording()) {
      let r = this.current;
      if (n.feature && n.operator) {
        r = this.construct(), this.nodeBuilder.removeNode(r.$cstNode), this.nodeBuilder.buildCompositeNode(n).content.push(r.$cstNode);
        const s = { $type: e };
        this.stack.push(s), this.assign(n.operator, n.feature, r, r.$cstNode, !1);
      } else
        r.$type = e;
    }
  }
  construct() {
    if (this.isRecording())
      return;
    const e = this.current;
    return rh(e), this.nodeBuilder.construct(e), this.stack.pop(), vs(e) ? this.converter.convert(e.value, e.$cstNode) : (ih(this.astReflection, e), e);
  }
  getAssignment(e) {
    if (!this.assignmentMap.has(e)) {
      const n = Ni(e, bt);
      this.assignmentMap.set(e, {
        assignment: n,
        isCrossRef: n ? Aa(n.terminal) : !1
      });
    }
    return this.assignmentMap.get(e);
  }
  assign(e, n, r, i, s) {
    const a = this.current;
    let o;
    switch (s && typeof r == "string" ? o = this.linker.buildReference(a, n, i, r) : o = r, e) {
      case "=": {
        a[n] = o;
        break;
      }
      case "?=": {
        a[n] = !0;
        break;
      }
      case "+=":
        Array.isArray(a[n]) || (a[n] = []), a[n].push(o);
    }
  }
  assignWithoutOverride(e, n) {
    for (const [i, s] of Object.entries(n)) {
      const a = e[i];
      a === void 0 ? e[i] = s : Array.isArray(a) && Array.isArray(s) && (s.push(...a), e[i] = s);
    }
    const r = e.$cstNode;
    return r && (r.astNode = void 0, e.$cstNode = void 0), e;
  }
  get definitionErrors() {
    return this.wrapper.definitionErrors;
  }
}
class nE {
  buildMismatchTokenMessage(e) {
    return Yt.buildMismatchTokenMessage(e);
  }
  buildNotAllInputParsedMessage(e) {
    return Yt.buildNotAllInputParsedMessage(e);
  }
  buildNoViableAltMessage(e) {
    return Yt.buildNoViableAltMessage(e);
  }
  buildEarlyExitMessage(e) {
    return Yt.buildEarlyExitMessage(e);
  }
}
class Gf extends nE {
  buildMismatchTokenMessage({ expected: e, actual: n }) {
    return `Expecting ${e.LABEL ? "`" + e.LABEL + "`" : e.name.endsWith(":KW") ? `keyword '${e.name.substring(0, e.name.length - 3)}'` : `token of type '${e.name}'`} but found \`${n.image}\`.`;
  }
  buildNotAllInputParsedMessage({ firstRedundant: e }) {
    return `Expecting end of file but found \`${e.image}\`.`;
  }
}
class rE extends Ff {
  constructor() {
    super(...arguments), this.tokens = [], this.elementStack = [], this.lastElementStack = [], this.nextTokenIndex = 0, this.stackSize = 0;
  }
  action() {
  }
  construct() {
  }
  parse(e) {
    this.resetState();
    const n = this.lexer.tokenize(e, { mode: "partial" });
    return this.tokens = n.tokens, this.wrapper.input = [...this.tokens], this.mainRule.call(this.wrapper, {}), this.unorderedGroups.clear(), {
      tokens: this.tokens,
      elementStack: [...this.lastElementStack],
      tokenIndex: this.nextTokenIndex
    };
  }
  rule(e, n) {
    const r = this.wrapper.DEFINE_RULE(Df(e.name), this.startImplementation(n).bind(this));
    return this.allRules.set(e.name, r), e.entry && (this.mainRule = r), r;
  }
  resetState() {
    this.elementStack = [], this.lastElementStack = [], this.nextTokenIndex = 0, this.stackSize = 0;
  }
  startImplementation(e) {
    return (n) => {
      const r = this.keepStackSize();
      try {
        e(n);
      } finally {
        this.resetStackSize(r);
      }
    };
  }
  removeUnexpectedElements() {
    this.elementStack.splice(this.stackSize);
  }
  keepStackSize() {
    const e = this.elementStack.length;
    return this.stackSize = e, e;
  }
  resetStackSize(e) {
    this.removeUnexpectedElements(), this.stackSize = e;
  }
  consume(e, n, r) {
    this.wrapper.wrapConsume(e, n), this.isRecording() || (this.lastElementStack = [...this.elementStack, r], this.nextTokenIndex = this.currIdx + 1);
  }
  subrule(e, n, r, i, s) {
    this.before(i), this.wrapper.wrapSubrule(e, n, s), this.after(i);
  }
  before(e) {
    this.isRecording() || this.elementStack.push(e);
  }
  after(e) {
    if (!this.isRecording()) {
      const n = this.elementStack.lastIndexOf(e);
      n >= 0 && this.elementStack.splice(n);
    }
  }
  get currIdx() {
    return this.wrapper.currIdx;
  }
}
const iE = {
  recoveryEnabled: !0,
  nodeLocationTracking: "full",
  skipValidations: !0,
  errorMessageProvider: new Gf()
};
class sE extends dA {
  constructor(e, n) {
    const r = n && "maxLookahead" in n;
    super(e, Object.assign(Object.assign(Object.assign({}, iE), { lookaheadStrategy: r ? new Ja({ maxLookahead: n.maxLookahead }) : new OA({
      // If validations are skipped, don't log the lookahead warnings
      logging: n.skipValidations ? () => {
      } : void 0
    }) }), n));
  }
  get IS_RECORDING() {
    return this.RECORDING_PHASE;
  }
  DEFINE_RULE(e, n) {
    return this.RULE(e, n);
  }
  wrapSelfAnalysis() {
    this.performSelfAnalysis();
  }
  wrapConsume(e, n) {
    return this.consume(e, n);
  }
  wrapSubrule(e, n, r) {
    return this.subrule(e, n, {
      ARGS: [r]
    });
  }
  wrapOr(e, n) {
    this.or(e, n);
  }
  wrapOption(e, n) {
    this.option(e, n);
  }
  wrapMany(e, n) {
    this.many(e, n);
  }
  wrapAtLeastOne(e, n) {
    this.atLeastOne(e, n);
  }
}
function Uf(t, e, n) {
  return aE({
    parser: e,
    tokens: n,
    ruleNames: /* @__PURE__ */ new Map()
  }, t), e;
}
function aE(t, e) {
  const n = oc(e, !1), r = re(e.rules).filter(_e).filter((i) => n.has(i));
  for (const i of r) {
    const s = Object.assign(Object.assign({}, t), { consume: 1, optional: 1, subrule: 1, many: 1, or: 1 });
    t.parser.rule(i, Dt(s, i.definition));
  }
}
function Dt(t, e, n = !1) {
  let r;
  if (Ot(e))
    r = hE(t, e);
  else if (wi(e))
    r = oE(t, e);
  else if (bt(e))
    r = Dt(t, e.terminal);
  else if (Aa(e))
    r = Bf(t, e);
  else if (Lt(e))
    r = lE(t, e);
  else if (tc(e))
    r = cE(t, e);
  else if (nc(e))
    r = fE(t, e);
  else if (Ea(e))
    r = dE(t, e);
  else if (Yd(e)) {
    const i = t.consume++;
    r = () => t.parser.consume(i, yt, e);
  } else
    throw new Ju(e.$cstNode, `Unexpected element type: ${e.$type}`);
  return jf(t, n ? void 0 : xi(e), r, e.cardinality);
}
function oE(t, e) {
  const n = ka(e);
  return () => t.parser.action(n, e);
}
function lE(t, e) {
  const n = e.rule.ref;
  if (_e(n)) {
    const r = t.subrule++, i = n.fragment, s = e.arguments.length > 0 ? uE(n, e.arguments) : () => ({});
    return (a) => t.parser.subrule(r, Kf(t, n), i, e, s(a));
  } else if (Gt(n)) {
    const r = t.consume++, i = ma(t, n.name);
    return () => t.parser.consume(r, i, e);
  } else if (n)
    or();
  else
    throw new Ju(e.$cstNode, `Undefined rule: ${e.rule.$refText}`);
}
function uE(t, e) {
  const n = e.map((r) => it(r.value));
  return (r) => {
    const i = {};
    for (let s = 0; s < n.length; s++) {
      const a = t.parameters[s], o = n[s];
      i[a.name] = o(r);
    }
    return i;
  };
}
function it(t) {
  if (Kd(t)) {
    const e = it(t.left), n = it(t.right);
    return (r) => e(r) || n(r);
  } else if (jd(t)) {
    const e = it(t.left), n = it(t.right);
    return (r) => e(r) && n(r);
  } else if (Hd(t)) {
    const e = it(t.value);
    return (n) => !e(n);
  } else if (Vd(t)) {
    const e = t.parameter.ref.name;
    return (n) => n !== void 0 && n[e] === !0;
  } else if (Bd(t)) {
    const e = !!t.true;
    return () => e;
  }
  or();
}
function cE(t, e) {
  if (e.elements.length === 1)
    return Dt(t, e.elements[0]);
  {
    const n = [];
    for (const i of e.elements) {
      const s = {
        // Since we handle the guard condition in the alternative already
        // We can ignore the group guard condition inside
        ALT: Dt(t, i, !0)
      }, a = xi(i);
      a && (s.GATE = it(a)), n.push(s);
    }
    const r = t.or++;
    return (i) => t.parser.alternatives(r, n.map((s) => {
      const a = {
        ALT: () => s.ALT(i)
      }, o = s.GATE;
      return o && (a.GATE = () => o(i)), a;
    }));
  }
}
function fE(t, e) {
  if (e.elements.length === 1)
    return Dt(t, e.elements[0]);
  const n = [];
  for (const o of e.elements) {
    const l = {
      // Since we handle the guard condition in the alternative already
      // We can ignore the group guard condition inside
      ALT: Dt(t, o, !0)
    }, u = xi(o);
    u && (l.GATE = it(u)), n.push(l);
  }
  const r = t.or++, i = (o, l) => {
    const u = l.getRuleStack().join("-");
    return `uGroup_${o}_${u}`;
  }, s = (o) => t.parser.alternatives(r, n.map((l, u) => {
    const c = { ALT: () => !0 }, f = t.parser;
    c.ALT = () => {
      if (l.ALT(o), !f.isRecording()) {
        const h = i(r, f);
        f.unorderedGroups.get(h) || f.unorderedGroups.set(h, []);
        const m = f.unorderedGroups.get(h);
        typeof m?.[u] > "u" && (m[u] = !0);
      }
    };
    const d = l.GATE;
    return d ? c.GATE = () => d(o) : c.GATE = () => {
      const h = f.unorderedGroups.get(i(r, f));
      return !h?.[u];
    }, c;
  })), a = jf(t, xi(e), s, "*");
  return (o) => {
    a(o), t.parser.isRecording() || t.parser.unorderedGroups.delete(i(r, t.parser));
  };
}
function dE(t, e) {
  const n = e.elements.map((r) => Dt(t, r));
  return (r) => n.forEach((i) => i(r));
}
function xi(t) {
  if (Ea(t))
    return t.guardCondition;
}
function Bf(t, e, n = e.terminal) {
  if (n)
    if (Lt(n) && _e(n.rule.ref)) {
      const r = n.rule.ref, i = t.subrule++;
      return (s) => t.parser.subrule(i, Kf(t, r), !1, e, s);
    } else if (Lt(n) && Gt(n.rule.ref)) {
      const r = t.consume++, i = ma(t, n.rule.ref.name);
      return () => t.parser.consume(r, i, e);
    } else if (Ot(n)) {
      const r = t.consume++, i = ma(t, n.value);
      return () => t.parser.consume(r, i, e);
    } else
      throw new Error("Could not build cross reference parser");
  else {
    if (!e.type.ref)
      throw new Error("Could not resolve reference to type: " + e.type.$refText);
    const r = cc(e.type.ref), i = r?.terminal;
    if (!i)
      throw new Error("Could not find name assignment for type: " + ka(e.type.ref));
    return Bf(t, e, i);
  }
}
function hE(t, e) {
  const n = t.consume++, r = t.tokens[e.value];
  if (!r)
    throw new Error("Could not find token for keyword: " + e.value);
  return () => t.parser.consume(n, r, e);
}
function jf(t, e, n, r) {
  const i = e && it(e);
  if (!r)
    if (i) {
      const s = t.or++;
      return (a) => t.parser.alternatives(s, [
        {
          ALT: () => n(a),
          GATE: () => i(a)
        },
        {
          ALT: vl(),
          GATE: () => !i(a)
        }
      ]);
    } else
      return n;
  if (r === "*") {
    const s = t.many++;
    return (a) => t.parser.many(s, {
      DEF: () => n(a),
      GATE: i ? () => i(a) : void 0
    });
  } else if (r === "+") {
    const s = t.many++;
    if (i) {
      const a = t.or++;
      return (o) => t.parser.alternatives(a, [
        {
          ALT: () => t.parser.atLeastOne(s, {
            DEF: () => n(o)
          }),
          GATE: () => i(o)
        },
        {
          ALT: vl(),
          GATE: () => !i(o)
        }
      ]);
    } else
      return (a) => t.parser.atLeastOne(s, {
        DEF: () => n(a)
      });
  } else if (r === "?") {
    const s = t.optional++;
    return (a) => t.parser.optional(s, {
      DEF: () => n(a),
      GATE: i ? () => i(a) : void 0
    });
  } else
    or();
}
function Kf(t, e) {
  const n = pE(t, e), r = t.parser.getRule(n);
  if (!r)
    throw new Error(`Rule "${n}" not found."`);
  return r;
}
function pE(t, e) {
  if (_e(e))
    return e.name;
  if (t.ruleNames.has(e))
    return t.ruleNames.get(e);
  {
    let n = e, r = n.$container, i = e.$type;
    for (; !_e(r); )
      (Ea(r) || tc(r) || nc(r)) && (i = r.elements.indexOf(n).toString() + ":" + i), n = r, r = r.$container;
    return i = r.name + ":" + i, t.ruleNames.set(e, i), i;
  }
}
function ma(t, e) {
  const n = t.tokens[e];
  if (!n)
    throw new Error(`Token "${e}" not found."`);
  return n;
}
function mE(t) {
  const e = t.Grammar, n = t.parser.Lexer, r = new rE(t);
  return Uf(e, r, n.definition), r.finalize(), r;
}
function gE(t) {
  const e = yE(t);
  return e.finalize(), e;
}
function yE(t) {
  const e = t.Grammar, n = t.parser.Lexer, r = new tE(t);
  return Uf(e, r, n.definition);
}
class Hf {
  constructor() {
    this.diagnostics = [];
  }
  buildTokens(e, n) {
    const r = re(oc(e, !1)), i = this.buildTerminalTokens(r), s = this.buildKeywordTokens(r, i, n);
    return i.forEach((a) => {
      const o = a.PATTERN;
      typeof o == "object" && o && "test" in o && Fs(o) ? s.unshift(a) : s.push(a);
    }), s;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  flushLexingReport(e) {
    return { diagnostics: this.popDiagnostics() };
  }
  popDiagnostics() {
    const e = [...this.diagnostics];
    return this.diagnostics = [], e;
  }
  buildTerminalTokens(e) {
    return e.filter(Gt).filter((n) => !n.fragment).map((n) => this.buildTerminalToken(n)).toArray();
  }
  buildTerminalToken(e) {
    const n = Ia(e), r = this.requiresCustomPattern(n) ? this.regexPatternFunction(n) : n, i = {
      name: e.name,
      PATTERN: r
    };
    return typeof r == "function" && (i.LINE_BREAKS = !0), e.hidden && (i.GROUP = Fs(n) ? he.SKIPPED : "hidden"), i;
  }
  requiresCustomPattern(e) {
    return e.flags.includes("u") || e.flags.includes("s") ? !0 : !!(e.source.includes("?<=") || e.source.includes("?<!"));
  }
  regexPatternFunction(e) {
    const n = new RegExp(e, e.flags + "y");
    return (r, i) => (n.lastIndex = i, n.exec(r));
  }
  buildKeywordTokens(e, n, r) {
    return e.filter(_e).flatMap((i) => lr(i).filter(Ot)).distinct((i) => i.value).toArray().sort((i, s) => s.value.length - i.value.length).map((i) => this.buildKeywordToken(i, n, !!r?.caseInsensitive));
  }
  buildKeywordToken(e, n, r) {
    const i = this.buildKeywordPattern(e, r), s = {
      name: e.value,
      PATTERN: i,
      LONGER_ALT: this.findLongerAlt(e, n)
    };
    return typeof i == "function" && (s.LINE_BREAKS = !0), s;
  }
  buildKeywordPattern(e, n) {
    return n ? new RegExp(hh(e.value)) : e.value;
  }
  findLongerAlt(e, n) {
    return n.reduce((r, i) => {
      const s = i?.PATTERN;
      return s?.source && ph("^" + s.source + "$", e.value) && r.push(i), r;
    }, []);
  }
}
class Vf {
  convert(e, n) {
    let r = n.grammarSource;
    if (Aa(r) && (r = Th(r)), Lt(r)) {
      const i = r.rule.ref;
      if (!i)
        throw new Error("This cst node was not parsed by a rule.");
      return this.runConverter(i, e, n);
    }
    return e;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runConverter(e, n, r) {
    var i;
    switch (e.name.toUpperCase()) {
      case "INT":
        return tt.convertInt(n);
      case "STRING":
        return tt.convertString(n);
      case "ID":
        return tt.convertID(n);
    }
    switch ((i = Sh(e)) === null || i === void 0 ? void 0 : i.toLowerCase()) {
      case "number":
        return tt.convertNumber(n);
      case "boolean":
        return tt.convertBoolean(n);
      case "bigint":
        return tt.convertBigint(n);
      case "date":
        return tt.convertDate(n);
      default:
        return n;
    }
  }
}
var tt;
(function(t) {
  function e(u) {
    let c = "";
    for (let f = 1; f < u.length - 1; f++) {
      const d = u.charAt(f);
      if (d === "\\") {
        const h = u.charAt(++f);
        c += n(h);
      } else
        c += d;
    }
    return c;
  }
  t.convertString = e;
  function n(u) {
    switch (u) {
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return `
`;
      case "r":
        return "\r";
      case "t":
        return "	";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return u;
    }
  }
  function r(u) {
    return u.charAt(0) === "^" ? u.substring(1) : u;
  }
  t.convertID = r;
  function i(u) {
    return parseInt(u);
  }
  t.convertInt = i;
  function s(u) {
    return BigInt(u);
  }
  t.convertBigint = s;
  function a(u) {
    return new Date(u);
  }
  t.convertDate = a;
  function o(u) {
    return Number(u);
  }
  t.convertNumber = o;
  function l(u) {
    return u.toLowerCase() === "true";
  }
  t.convertBoolean = l;
})(tt || (tt = {}));
var wt = {}, Lr = {}, Su;
function Wf() {
  if (Su) return Lr;
  Su = 1, Object.defineProperty(Lr, "__esModule", { value: !0 });
  let t;
  function e() {
    if (t === void 0)
      throw new Error("No runtime abstraction layer installed");
    return t;
  }
  return (function(n) {
    function r(i) {
      if (i === void 0)
        throw new Error("No runtime abstraction layer provided");
      t = i;
    }
    n.install = r;
  })(e || (e = {})), Lr.default = e, Lr;
}
var ee = {}, ku;
function TE() {
  if (ku) return ee;
  ku = 1, Object.defineProperty(ee, "__esModule", { value: !0 }), ee.stringArray = ee.array = ee.func = ee.error = ee.number = ee.string = ee.boolean = void 0;
  function t(o) {
    return o === !0 || o === !1;
  }
  ee.boolean = t;
  function e(o) {
    return typeof o == "string" || o instanceof String;
  }
  ee.string = e;
  function n(o) {
    return typeof o == "number" || o instanceof Number;
  }
  ee.number = n;
  function r(o) {
    return o instanceof Error;
  }
  ee.error = r;
  function i(o) {
    return typeof o == "function";
  }
  ee.func = i;
  function s(o) {
    return Array.isArray(o);
  }
  ee.array = s;
  function a(o) {
    return s(o) && o.every((l) => e(l));
  }
  return ee.stringArray = a, ee;
}
var Nt = {}, Iu;
function zf() {
  if (Iu) return Nt;
  Iu = 1, Object.defineProperty(Nt, "__esModule", { value: !0 }), Nt.Emitter = Nt.Event = void 0;
  const t = Wf();
  var e;
  (function(i) {
    const s = { dispose() {
    } };
    i.None = function() {
      return s;
    };
  })(e || (Nt.Event = e = {}));
  class n {
    add(s, a = null, o) {
      this._callbacks || (this._callbacks = [], this._contexts = []), this._callbacks.push(s), this._contexts.push(a), Array.isArray(o) && o.push({ dispose: () => this.remove(s, a) });
    }
    remove(s, a = null) {
      if (!this._callbacks)
        return;
      let o = !1;
      for (let l = 0, u = this._callbacks.length; l < u; l++)
        if (this._callbacks[l] === s)
          if (this._contexts[l] === a) {
            this._callbacks.splice(l, 1), this._contexts.splice(l, 1);
            return;
          } else
            o = !0;
      if (o)
        throw new Error("When adding a listener with a context, you should remove it with the same context");
    }
    invoke(...s) {
      if (!this._callbacks)
        return [];
      const a = [], o = this._callbacks.slice(0), l = this._contexts.slice(0);
      for (let u = 0, c = o.length; u < c; u++)
        try {
          a.push(o[u].apply(l[u], s));
        } catch (f) {
          (0, t.default)().console.error(f);
        }
      return a;
    }
    isEmpty() {
      return !this._callbacks || this._callbacks.length === 0;
    }
    dispose() {
      this._callbacks = void 0, this._contexts = void 0;
    }
  }
  class r {
    constructor(s) {
      this._options = s;
    }
    /**
     * For the public to allow to subscribe
     * to events from this Emitter
     */
    get event() {
      return this._event || (this._event = (s, a, o) => {
        this._callbacks || (this._callbacks = new n()), this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty() && this._options.onFirstListenerAdd(this), this._callbacks.add(s, a);
        const l = {
          dispose: () => {
            this._callbacks && (this._callbacks.remove(s, a), l.dispose = r._noop, this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty() && this._options.onLastListenerRemove(this));
          }
        };
        return Array.isArray(o) && o.push(l), l;
      }), this._event;
    }
    /**
     * To be kept private to fire an event to
     * subscribers
     */
    fire(s) {
      this._callbacks && this._callbacks.invoke.call(this._callbacks, s);
    }
    dispose() {
      this._callbacks && (this._callbacks.dispose(), this._callbacks = void 0);
    }
  }
  return Nt.Emitter = r, r._noop = function() {
  }, Nt;
}
var Cu;
function vE() {
  if (Cu) return wt;
  Cu = 1, Object.defineProperty(wt, "__esModule", { value: !0 }), wt.CancellationTokenSource = wt.CancellationToken = void 0;
  const t = Wf(), e = TE(), n = zf();
  var r;
  (function(o) {
    o.None = Object.freeze({
      isCancellationRequested: !1,
      onCancellationRequested: n.Event.None
    }), o.Cancelled = Object.freeze({
      isCancellationRequested: !0,
      onCancellationRequested: n.Event.None
    });
    function l(u) {
      const c = u;
      return c && (c === o.None || c === o.Cancelled || e.boolean(c.isCancellationRequested) && !!c.onCancellationRequested);
    }
    o.is = l;
  })(r || (wt.CancellationToken = r = {}));
  const i = Object.freeze(function(o, l) {
    const u = (0, t.default)().timer.setTimeout(o.bind(l), 0);
    return { dispose() {
      u.dispose();
    } };
  });
  class s {
    constructor() {
      this._isCancelled = !1;
    }
    cancel() {
      this._isCancelled || (this._isCancelled = !0, this._emitter && (this._emitter.fire(void 0), this.dispose()));
    }
    get isCancellationRequested() {
      return this._isCancelled;
    }
    get onCancellationRequested() {
      return this._isCancelled ? i : (this._emitter || (this._emitter = new n.Emitter()), this._emitter.event);
    }
    dispose() {
      this._emitter && (this._emitter.dispose(), this._emitter = void 0);
    }
  }
  class a {
    get token() {
      return this._token || (this._token = new s()), this._token;
    }
    cancel() {
      this._token ? this._token.cancel() : this._token = r.Cancelled;
    }
    dispose() {
      this._token ? this._token instanceof s && this._token.dispose() : this._token = r.None;
    }
  }
  return wt.CancellationTokenSource = a, wt;
}
var V = vE();
function RE() {
  return new Promise((t) => {
    typeof setImmediate > "u" ? setTimeout(t, 0) : setImmediate(t);
  });
}
let Xr = 0, AE = 10;
function EE() {
  return Xr = performance.now(), new V.CancellationTokenSource();
}
const Si = /* @__PURE__ */ Symbol("OperationCancelled");
function Zi(t) {
  return t === Si;
}
async function Ee(t) {
  if (t === V.CancellationToken.None)
    return;
  const e = performance.now();
  if (e - Xr >= AE && (Xr = e, await RE(), Xr = performance.now()), t.isCancellationRequested)
    throw Si;
}
class so {
  constructor() {
    this.promise = new Promise((e, n) => {
      this.resolve = (r) => (e(r), this), this.reject = (r) => (n(r), this);
    });
  }
}
class ar {
  constructor(e, n, r, i) {
    this._uri = e, this._languageId = n, this._version = r, this._content = i, this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(e) {
    if (e) {
      const n = this.offsetAt(e.start), r = this.offsetAt(e.end);
      return this._content.substring(n, r);
    }
    return this._content;
  }
  update(e, n) {
    for (const r of e)
      if (ar.isIncremental(r)) {
        const i = Yf(r.range), s = this.offsetAt(i.start), a = this.offsetAt(i.end);
        this._content = this._content.substring(0, s) + r.text + this._content.substring(a, this._content.length);
        const o = Math.max(i.start.line, 0), l = Math.max(i.end.line, 0);
        let u = this._lineOffsets;
        const c = wu(r.text, !1, s);
        if (l - o === c.length)
          for (let d = 0, h = c.length; d < h; d++)
            u[d + o + 1] = c[d];
        else
          c.length < 1e4 ? u.splice(o + 1, l - o, ...c) : this._lineOffsets = u = u.slice(0, o + 1).concat(c, u.slice(l + 1));
        const f = r.text.length - (a - s);
        if (f !== 0)
          for (let d = o + 1 + c.length, h = u.length; d < h; d++)
            u[d] = u[d] + f;
      } else if (ar.isFull(r))
        this._content = r.text, this._lineOffsets = void 0;
      else
        throw new Error("Unknown change event received");
    this._version = n;
  }
  getLineOffsets() {
    return this._lineOffsets === void 0 && (this._lineOffsets = wu(this._content, !0)), this._lineOffsets;
  }
  positionAt(e) {
    e = Math.max(Math.min(e, this._content.length), 0);
    const n = this.getLineOffsets();
    let r = 0, i = n.length;
    if (i === 0)
      return { line: 0, character: e };
    for (; r < i; ) {
      const a = Math.floor((r + i) / 2);
      n[a] > e ? i = a : r = a + 1;
    }
    const s = r - 1;
    return e = this.ensureBeforeEOL(e, n[s]), { line: s, character: e - n[s] };
  }
  offsetAt(e) {
    const n = this.getLineOffsets();
    if (e.line >= n.length)
      return this._content.length;
    if (e.line < 0)
      return 0;
    const r = n[e.line];
    if (e.character <= 0)
      return r;
    const i = e.line + 1 < n.length ? n[e.line + 1] : this._content.length, s = Math.min(r + e.character, i);
    return this.ensureBeforeEOL(s, r);
  }
  getLineRange(e) {
    const n = this.getLineOffsets();
    if (e >= n.length) {
      const a = n.length - 1;
      return { start: { line: a, character: 0 }, end: { line: a, character: this._content.length - n[a] } };
    } else if (e < 0)
      return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const r = n[e], i = e + 1 < n.length ? n[e + 1] : this._content.length, s = this.ensureBeforeEOL(i, r);
    return { start: { line: e, character: 0 }, end: { line: e, character: s - r } };
  }
  getEOLCharacters(e) {
    const n = this.getLineOffsets();
    if (e >= n.length)
      return "";
    if (e < 0)
      return "";
    const r = e + 1 < n.length ? n[e + 1] : this._content.length, i = this.ensureBeforeEOL(r, n[e]);
    return this._content.substring(i, r);
  }
  ensureBeforeEOL(e, n) {
    for (; e > n && qf(this._content.charCodeAt(e - 1)); )
      e--;
    return e;
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
  static isIncremental(e) {
    const n = e;
    return n != null && typeof n.text == "string" && n.range !== void 0 && (n.rangeLength === void 0 || typeof n.rangeLength == "number");
  }
  static isFull(e) {
    const n = e;
    return n != null && typeof n.text == "string" && n.range === void 0 && n.rangeLength === void 0;
  }
}
var ga;
(function(t) {
  function e(i, s, a, o) {
    return new ar(i, s, a, o);
  }
  t.create = e;
  function n(i, s, a) {
    if (i instanceof ar)
      return i.update(s, a), i;
    throw new Error("TextDocument.update: document must be created by TextDocument.create");
  }
  t.update = n;
  function r(i, s) {
    const a = i.getText(), o = ya(s.map($E), (c, f) => {
      const d = c.range.start.line - f.range.start.line;
      return d === 0 ? c.range.start.character - f.range.start.character : d;
    });
    let l = 0;
    const u = [];
    for (const c of o) {
      const f = i.offsetAt(c.range.start);
      if (f < l)
        throw new Error("Overlapping edit");
      f > l && u.push(a.substring(l, f)), c.newText.length && u.push(c.newText), l = i.offsetAt(c.range.end);
    }
    return u.push(a.substr(l)), u.join("");
  }
  t.applyEdits = r;
})(ga || (ga = {}));
function ya(t, e) {
  if (t.length <= 1)
    return t;
  const n = t.length / 2 | 0, r = t.slice(0, n), i = t.slice(n);
  ya(r, e), ya(i, e);
  let s = 0, a = 0, o = 0;
  for (; s < r.length && a < i.length; )
    e(r[s], i[a]) <= 0 ? t[o++] = r[s++] : t[o++] = i[a++];
  for (; s < r.length; )
    t[o++] = r[s++];
  for (; a < i.length; )
    t[o++] = i[a++];
  return t;
}
function wu(t, e, n = 0) {
  const r = e ? [n] : [];
  for (let i = 0; i < t.length; i++) {
    const s = t.charCodeAt(i);
    qf(s) && (s === 13 && i + 1 < t.length && t.charCodeAt(i + 1) === 10 && i++, r.push(n + i + 1));
  }
  return r;
}
function qf(t) {
  return t === 13 || t === 10;
}
function Yf(t) {
  const e = t.start, n = t.end;
  return e.line > n.line || e.line === n.line && e.character > n.character ? { start: n, end: e } : t;
}
function $E(t) {
  const e = Yf(t.range);
  return e !== t.range ? { newText: t.newText, range: e } : t;
}
var Xf;
(() => {
  var t = { 470: (i) => {
    function s(l) {
      if (typeof l != "string") throw new TypeError("Path must be a string. Received " + JSON.stringify(l));
    }
    function a(l, u) {
      for (var c, f = "", d = 0, h = -1, m = 0, g = 0; g <= l.length; ++g) {
        if (g < l.length) c = l.charCodeAt(g);
        else {
          if (c === 47) break;
          c = 47;
        }
        if (c === 47) {
          if (!(h === g - 1 || m === 1)) if (h !== g - 1 && m === 2) {
            if (f.length < 2 || d !== 2 || f.charCodeAt(f.length - 1) !== 46 || f.charCodeAt(f.length - 2) !== 46) {
              if (f.length > 2) {
                var R = f.lastIndexOf("/");
                if (R !== f.length - 1) {
                  R === -1 ? (f = "", d = 0) : d = (f = f.slice(0, R)).length - 1 - f.lastIndexOf("/"), h = g, m = 0;
                  continue;
                }
              } else if (f.length === 2 || f.length === 1) {
                f = "", d = 0, h = g, m = 0;
                continue;
              }
            }
            u && (f.length > 0 ? f += "/.." : f = "..", d = 2);
          } else f.length > 0 ? f += "/" + l.slice(h + 1, g) : f = l.slice(h + 1, g), d = g - h - 1;
          h = g, m = 0;
        } else c === 46 && m !== -1 ? ++m : m = -1;
      }
      return f;
    }
    var o = { resolve: function() {
      for (var l, u = "", c = !1, f = arguments.length - 1; f >= -1 && !c; f--) {
        var d;
        f >= 0 ? d = arguments[f] : (l === void 0 && (l = process.cwd()), d = l), s(d), d.length !== 0 && (u = d + "/" + u, c = d.charCodeAt(0) === 47);
      }
      return u = a(u, !c), c ? u.length > 0 ? "/" + u : "/" : u.length > 0 ? u : ".";
    }, normalize: function(l) {
      if (s(l), l.length === 0) return ".";
      var u = l.charCodeAt(0) === 47, c = l.charCodeAt(l.length - 1) === 47;
      return (l = a(l, !u)).length !== 0 || u || (l = "."), l.length > 0 && c && (l += "/"), u ? "/" + l : l;
    }, isAbsolute: function(l) {
      return s(l), l.length > 0 && l.charCodeAt(0) === 47;
    }, join: function() {
      if (arguments.length === 0) return ".";
      for (var l, u = 0; u < arguments.length; ++u) {
        var c = arguments[u];
        s(c), c.length > 0 && (l === void 0 ? l = c : l += "/" + c);
      }
      return l === void 0 ? "." : o.normalize(l);
    }, relative: function(l, u) {
      if (s(l), s(u), l === u || (l = o.resolve(l)) === (u = o.resolve(u))) return "";
      for (var c = 1; c < l.length && l.charCodeAt(c) === 47; ++c) ;
      for (var f = l.length, d = f - c, h = 1; h < u.length && u.charCodeAt(h) === 47; ++h) ;
      for (var m = u.length - h, g = d < m ? d : m, R = -1, y = 0; y <= g; ++y) {
        if (y === g) {
          if (m > g) {
            if (u.charCodeAt(h + y) === 47) return u.slice(h + y + 1);
            if (y === 0) return u.slice(h + y);
          } else d > g && (l.charCodeAt(c + y) === 47 ? R = y : y === 0 && (R = 0));
          break;
        }
        var E = l.charCodeAt(c + y);
        if (E !== u.charCodeAt(h + y)) break;
        E === 47 && (R = y);
      }
      var v = "";
      for (y = c + R + 1; y <= f; ++y) y !== f && l.charCodeAt(y) !== 47 || (v.length === 0 ? v += ".." : v += "/..");
      return v.length > 0 ? v + u.slice(h + R) : (h += R, u.charCodeAt(h) === 47 && ++h, u.slice(h));
    }, _makeLong: function(l) {
      return l;
    }, dirname: function(l) {
      if (s(l), l.length === 0) return ".";
      for (var u = l.charCodeAt(0), c = u === 47, f = -1, d = !0, h = l.length - 1; h >= 1; --h) if ((u = l.charCodeAt(h)) === 47) {
        if (!d) {
          f = h;
          break;
        }
      } else d = !1;
      return f === -1 ? c ? "/" : "." : c && f === 1 ? "//" : l.slice(0, f);
    }, basename: function(l, u) {
      if (u !== void 0 && typeof u != "string") throw new TypeError('"ext" argument must be a string');
      s(l);
      var c, f = 0, d = -1, h = !0;
      if (u !== void 0 && u.length > 0 && u.length <= l.length) {
        if (u.length === l.length && u === l) return "";
        var m = u.length - 1, g = -1;
        for (c = l.length - 1; c >= 0; --c) {
          var R = l.charCodeAt(c);
          if (R === 47) {
            if (!h) {
              f = c + 1;
              break;
            }
          } else g === -1 && (h = !1, g = c + 1), m >= 0 && (R === u.charCodeAt(m) ? --m == -1 && (d = c) : (m = -1, d = g));
        }
        return f === d ? d = g : d === -1 && (d = l.length), l.slice(f, d);
      }
      for (c = l.length - 1; c >= 0; --c) if (l.charCodeAt(c) === 47) {
        if (!h) {
          f = c + 1;
          break;
        }
      } else d === -1 && (h = !1, d = c + 1);
      return d === -1 ? "" : l.slice(f, d);
    }, extname: function(l) {
      s(l);
      for (var u = -1, c = 0, f = -1, d = !0, h = 0, m = l.length - 1; m >= 0; --m) {
        var g = l.charCodeAt(m);
        if (g !== 47) f === -1 && (d = !1, f = m + 1), g === 46 ? u === -1 ? u = m : h !== 1 && (h = 1) : u !== -1 && (h = -1);
        else if (!d) {
          c = m + 1;
          break;
        }
      }
      return u === -1 || f === -1 || h === 0 || h === 1 && u === f - 1 && u === c + 1 ? "" : l.slice(u, f);
    }, format: function(l) {
      if (l === null || typeof l != "object") throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof l);
      return (function(u, c) {
        var f = c.dir || c.root, d = c.base || (c.name || "") + (c.ext || "");
        return f ? f === c.root ? f + d : f + "/" + d : d;
      })(0, l);
    }, parse: function(l) {
      s(l);
      var u = { root: "", dir: "", base: "", ext: "", name: "" };
      if (l.length === 0) return u;
      var c, f = l.charCodeAt(0), d = f === 47;
      d ? (u.root = "/", c = 1) : c = 0;
      for (var h = -1, m = 0, g = -1, R = !0, y = l.length - 1, E = 0; y >= c; --y) if ((f = l.charCodeAt(y)) !== 47) g === -1 && (R = !1, g = y + 1), f === 46 ? h === -1 ? h = y : E !== 1 && (E = 1) : h !== -1 && (E = -1);
      else if (!R) {
        m = y + 1;
        break;
      }
      return h === -1 || g === -1 || E === 0 || E === 1 && h === g - 1 && h === m + 1 ? g !== -1 && (u.base = u.name = m === 0 && d ? l.slice(1, g) : l.slice(m, g)) : (m === 0 && d ? (u.name = l.slice(1, h), u.base = l.slice(1, g)) : (u.name = l.slice(m, h), u.base = l.slice(m, g)), u.ext = l.slice(h, g)), m > 0 ? u.dir = l.slice(0, m - 1) : d && (u.dir = "/"), u;
    }, sep: "/", delimiter: ":", win32: null, posix: null };
    o.posix = o, i.exports = o;
  } }, e = {};
  function n(i) {
    var s = e[i];
    if (s !== void 0) return s.exports;
    var a = e[i] = { exports: {} };
    return t[i](a, a.exports, n), a.exports;
  }
  n.d = (i, s) => {
    for (var a in s) n.o(s, a) && !n.o(i, a) && Object.defineProperty(i, a, { enumerable: !0, get: s[a] });
  }, n.o = (i, s) => Object.prototype.hasOwnProperty.call(i, s), n.r = (i) => {
    typeof Symbol < "u" && Symbol.toStringTag && Object.defineProperty(i, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(i, "__esModule", { value: !0 });
  };
  var r = {};
  (() => {
    let i;
    n.r(r), n.d(r, { URI: () => d, Utils: () => Ie }), typeof process == "object" ? i = process.platform === "win32" : typeof navigator == "object" && (i = navigator.userAgent.indexOf("Windows") >= 0);
    const s = /^\w[\w\d+.-]*$/, a = /^\//, o = /^\/\//;
    function l($, T) {
      if (!$.scheme && T) throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${$.authority}", path: "${$.path}", query: "${$.query}", fragment: "${$.fragment}"}`);
      if ($.scheme && !s.test($.scheme)) throw new Error("[UriError]: Scheme contains illegal characters.");
      if ($.path) {
        if ($.authority) {
          if (!a.test($.path)) throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
        } else if (o.test($.path)) throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
      }
    }
    const u = "", c = "/", f = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
    class d {
      static isUri(T) {
        return T instanceof d || !!T && typeof T.authority == "string" && typeof T.fragment == "string" && typeof T.path == "string" && typeof T.query == "string" && typeof T.scheme == "string" && typeof T.fsPath == "string" && typeof T.with == "function" && typeof T.toString == "function";
      }
      scheme;
      authority;
      path;
      query;
      fragment;
      constructor(T, k, x, O, b, _ = !1) {
        typeof T == "object" ? (this.scheme = T.scheme || u, this.authority = T.authority || u, this.path = T.path || u, this.query = T.query || u, this.fragment = T.fragment || u) : (this.scheme = /* @__PURE__ */ (function(ve, Z) {
          return ve || Z ? ve : "file";
        })(T, _), this.authority = k || u, this.path = (function(ve, Z) {
          switch (ve) {
            case "https":
            case "http":
            case "file":
              Z ? Z[0] !== c && (Z = c + Z) : Z = c;
          }
          return Z;
        })(this.scheme, x || u), this.query = O || u, this.fragment = b || u, l(this, _));
      }
      get fsPath() {
        return E(this);
      }
      with(T) {
        if (!T) return this;
        let { scheme: k, authority: x, path: O, query: b, fragment: _ } = T;
        return k === void 0 ? k = this.scheme : k === null && (k = u), x === void 0 ? x = this.authority : x === null && (x = u), O === void 0 ? O = this.path : O === null && (O = u), b === void 0 ? b = this.query : b === null && (b = u), _ === void 0 ? _ = this.fragment : _ === null && (_ = u), k === this.scheme && x === this.authority && O === this.path && b === this.query && _ === this.fragment ? this : new m(k, x, O, b, _);
      }
      static parse(T, k = !1) {
        const x = f.exec(T);
        return x ? new m(x[2] || u, ae(x[4] || u), ae(x[5] || u), ae(x[7] || u), ae(x[9] || u), k) : new m(u, u, u, u, u);
      }
      static file(T) {
        let k = u;
        if (i && (T = T.replace(/\\/g, c)), T[0] === c && T[1] === c) {
          const x = T.indexOf(c, 2);
          x === -1 ? (k = T.substring(2), T = c) : (k = T.substring(2, x), T = T.substring(x) || c);
        }
        return new m("file", k, T, u, u);
      }
      static from(T) {
        const k = new m(T.scheme, T.authority, T.path, T.query, T.fragment);
        return l(k, !0), k;
      }
      toString(T = !1) {
        return v(this, T);
      }
      toJSON() {
        return this;
      }
      static revive(T) {
        if (T) {
          if (T instanceof d) return T;
          {
            const k = new m(T);
            return k._formatted = T.external, k._fsPath = T._sep === h ? T.fsPath : null, k;
          }
        }
        return T;
      }
    }
    const h = i ? 1 : void 0;
    class m extends d {
      _formatted = null;
      _fsPath = null;
      get fsPath() {
        return this._fsPath || (this._fsPath = E(this)), this._fsPath;
      }
      toString(T = !1) {
        return T ? v(this, !0) : (this._formatted || (this._formatted = v(this, !1)), this._formatted);
      }
      toJSON() {
        const T = { $mid: 1 };
        return this._fsPath && (T.fsPath = this._fsPath, T._sep = h), this._formatted && (T.external = this._formatted), this.path && (T.path = this.path), this.scheme && (T.scheme = this.scheme), this.authority && (T.authority = this.authority), this.query && (T.query = this.query), this.fragment && (T.fragment = this.fragment), T;
      }
    }
    const g = { 58: "%3A", 47: "%2F", 63: "%3F", 35: "%23", 91: "%5B", 93: "%5D", 64: "%40", 33: "%21", 36: "%24", 38: "%26", 39: "%27", 40: "%28", 41: "%29", 42: "%2A", 43: "%2B", 44: "%2C", 59: "%3B", 61: "%3D", 32: "%20" };
    function R($, T, k) {
      let x, O = -1;
      for (let b = 0; b < $.length; b++) {
        const _ = $.charCodeAt(b);
        if (_ >= 97 && _ <= 122 || _ >= 65 && _ <= 90 || _ >= 48 && _ <= 57 || _ === 45 || _ === 46 || _ === 95 || _ === 126 || T && _ === 47 || k && _ === 91 || k && _ === 93 || k && _ === 58) O !== -1 && (x += encodeURIComponent($.substring(O, b)), O = -1), x !== void 0 && (x += $.charAt(b));
        else {
          x === void 0 && (x = $.substr(0, b));
          const ve = g[_];
          ve !== void 0 ? (O !== -1 && (x += encodeURIComponent($.substring(O, b)), O = -1), x += ve) : O === -1 && (O = b);
        }
      }
      return O !== -1 && (x += encodeURIComponent($.substring(O))), x !== void 0 ? x : $;
    }
    function y($) {
      let T;
      for (let k = 0; k < $.length; k++) {
        const x = $.charCodeAt(k);
        x === 35 || x === 63 ? (T === void 0 && (T = $.substr(0, k)), T += g[x]) : T !== void 0 && (T += $[k]);
      }
      return T !== void 0 ? T : $;
    }
    function E($, T) {
      let k;
      return k = $.authority && $.path.length > 1 && $.scheme === "file" ? `//${$.authority}${$.path}` : $.path.charCodeAt(0) === 47 && ($.path.charCodeAt(1) >= 65 && $.path.charCodeAt(1) <= 90 || $.path.charCodeAt(1) >= 97 && $.path.charCodeAt(1) <= 122) && $.path.charCodeAt(2) === 58 ? $.path[1].toLowerCase() + $.path.substr(2) : $.path, i && (k = k.replace(/\//g, "\\")), k;
    }
    function v($, T) {
      const k = T ? y : R;
      let x = "", { scheme: O, authority: b, path: _, query: ve, fragment: Z } = $;
      if (O && (x += O, x += ":"), (b || O === "file") && (x += c, x += c), b) {
        let W = b.indexOf("@");
        if (W !== -1) {
          const It = b.substr(0, W);
          b = b.substr(W + 1), W = It.lastIndexOf(":"), W === -1 ? x += k(It, !1, !1) : (x += k(It.substr(0, W), !1, !1), x += ":", x += k(It.substr(W + 1), !1, !0)), x += "@";
        }
        b = b.toLowerCase(), W = b.lastIndexOf(":"), W === -1 ? x += k(b, !1, !0) : (x += k(b.substr(0, W), !1, !0), x += b.substr(W));
      }
      if (_) {
        if (_.length >= 3 && _.charCodeAt(0) === 47 && _.charCodeAt(2) === 58) {
          const W = _.charCodeAt(1);
          W >= 65 && W <= 90 && (_ = `/${String.fromCharCode(W + 32)}:${_.substr(3)}`);
        } else if (_.length >= 2 && _.charCodeAt(1) === 58) {
          const W = _.charCodeAt(0);
          W >= 65 && W <= 90 && (_ = `${String.fromCharCode(W + 32)}:${_.substr(2)}`);
        }
        x += k(_, !0, !1);
      }
      return ve && (x += "?", x += k(ve, !1, !1)), Z && (x += "#", x += T ? Z : R(Z, !1, !1)), x;
    }
    function S($) {
      try {
        return decodeURIComponent($);
      } catch {
        return $.length > 3 ? $.substr(0, 3) + S($.substr(3)) : $;
      }
    }
    const M = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
    function ae($) {
      return $.match(M) ? $.replace(M, ((T) => S(T))) : $;
    }
    var Me = n(470);
    const Te = Me.posix || Me, Ve = "/";
    var Ie;
    (function($) {
      $.joinPath = function(T, ...k) {
        return T.with({ path: Te.join(T.path, ...k) });
      }, $.resolvePath = function(T, ...k) {
        let x = T.path, O = !1;
        x[0] !== Ve && (x = Ve + x, O = !0);
        let b = Te.resolve(x, ...k);
        return O && b[0] === Ve && !T.authority && (b = b.substring(1)), T.with({ path: b });
      }, $.dirname = function(T) {
        if (T.path.length === 0 || T.path === Ve) return T;
        let k = Te.dirname(T.path);
        return k.length === 1 && k.charCodeAt(0) === 46 && (k = ""), T.with({ path: k });
      }, $.basename = function(T) {
        return Te.basename(T.path);
      }, $.extname = function(T) {
        return Te.extname(T.path);
      };
    })(Ie || (Ie = {}));
  })(), Xf = r;
})();
const { URI: Ft, Utils: mn } = Xf;
var vt;
(function(t) {
  t.basename = mn.basename, t.dirname = mn.dirname, t.extname = mn.extname, t.joinPath = mn.joinPath, t.resolvePath = mn.resolvePath;
  function e(i, s) {
    return i?.toString() === s?.toString();
  }
  t.equals = e;
  function n(i, s) {
    const a = typeof i == "string" ? i : i.path, o = typeof s == "string" ? s : s.path, l = a.split("/").filter((h) => h.length > 0), u = o.split("/").filter((h) => h.length > 0);
    let c = 0;
    for (; c < l.length && l[c] === u[c]; c++)
      ;
    const f = "../".repeat(l.length - c), d = u.slice(c).join("/");
    return f + d;
  }
  t.relative = n;
  function r(i) {
    return Ft.parse(i.toString()).toString();
  }
  t.normalize = r;
})(vt || (vt = {}));
var K;
(function(t) {
  t[t.Changed = 0] = "Changed", t[t.Parsed = 1] = "Parsed", t[t.IndexedContent = 2] = "IndexedContent", t[t.ComputedScopes = 3] = "ComputedScopes", t[t.Linked = 4] = "Linked", t[t.IndexedReferences = 5] = "IndexedReferences", t[t.Validated = 6] = "Validated";
})(K || (K = {}));
class xE {
  constructor(e) {
    this.serviceRegistry = e.ServiceRegistry, this.textDocuments = e.workspace.TextDocuments, this.fileSystemProvider = e.workspace.FileSystemProvider;
  }
  async fromUri(e, n = V.CancellationToken.None) {
    const r = await this.fileSystemProvider.readFile(e);
    return this.createAsync(e, r, n);
  }
  fromTextDocument(e, n, r) {
    return n = n ?? Ft.parse(e.uri), V.CancellationToken.is(r) ? this.createAsync(n, e, r) : this.create(n, e, r);
  }
  fromString(e, n, r) {
    return V.CancellationToken.is(r) ? this.createAsync(n, e, r) : this.create(n, e, r);
  }
  fromModel(e, n) {
    return this.create(n, { $model: e });
  }
  create(e, n, r) {
    if (typeof n == "string") {
      const i = this.parse(e, n, r);
      return this.createLangiumDocument(i, e, void 0, n);
    } else if ("$model" in n) {
      const i = { value: n.$model, parserErrors: [], lexerErrors: [] };
      return this.createLangiumDocument(i, e);
    } else {
      const i = this.parse(e, n.getText(), r);
      return this.createLangiumDocument(i, e, n);
    }
  }
  async createAsync(e, n, r) {
    if (typeof n == "string") {
      const i = await this.parseAsync(e, n, r);
      return this.createLangiumDocument(i, e, void 0, n);
    } else {
      const i = await this.parseAsync(e, n.getText(), r);
      return this.createLangiumDocument(i, e, n);
    }
  }
  /**
   * Create a LangiumDocument from a given parse result.
   *
   * A TextDocument is created on demand if it is not provided as argument here. Usually this
   * should not be necessary because the main purpose of the TextDocument is to convert between
   * text ranges and offsets, which is done solely in LSP request handling.
   *
   * With the introduction of {@link update} below this method is supposed to be mainly called
   * during workspace initialization and on addition/recognition of new files, while changes in
   * existing documents are processed via {@link update}.
   */
  createLangiumDocument(e, n, r, i) {
    let s;
    if (r)
      s = {
        parseResult: e,
        uri: n,
        state: K.Parsed,
        references: [],
        textDocument: r
      };
    else {
      const a = this.createTextDocumentGetter(n, i);
      s = {
        parseResult: e,
        uri: n,
        state: K.Parsed,
        references: [],
        get textDocument() {
          return a();
        }
      };
    }
    return e.value.$document = s, s;
  }
  async update(e, n) {
    var r, i;
    const s = (r = e.parseResult.value.$cstNode) === null || r === void 0 ? void 0 : r.root.fullText, a = (i = this.textDocuments) === null || i === void 0 ? void 0 : i.get(e.uri.toString()), o = a ? a.getText() : await this.fileSystemProvider.readFile(e.uri);
    if (a)
      Object.defineProperty(e, "textDocument", {
        value: a
      });
    else {
      const l = this.createTextDocumentGetter(e.uri, o);
      Object.defineProperty(e, "textDocument", {
        get: l
      });
    }
    return s !== o && (e.parseResult = await this.parseAsync(e.uri, o, n), e.parseResult.value.$document = e), e.state = K.Parsed, e;
  }
  parse(e, n, r) {
    return this.serviceRegistry.getServices(e).parser.LangiumParser.parse(n, r);
  }
  parseAsync(e, n, r) {
    return this.serviceRegistry.getServices(e).parser.AsyncParser.parse(n, r);
  }
  createTextDocumentGetter(e, n) {
    const r = this.serviceRegistry;
    let i;
    return () => i ?? (i = ga.create(e.toString(), r.getServices(e).LanguageMetaData.languageId, 0, n ?? ""));
  }
}
class SE {
  constructor(e) {
    this.documentMap = /* @__PURE__ */ new Map(), this.langiumDocumentFactory = e.workspace.LangiumDocumentFactory, this.serviceRegistry = e.ServiceRegistry;
  }
  get all() {
    return re(this.documentMap.values());
  }
  addDocument(e) {
    const n = e.uri.toString();
    if (this.documentMap.has(n))
      throw new Error(`A document with the URI '${n}' is already present.`);
    this.documentMap.set(n, e);
  }
  getDocument(e) {
    const n = e.toString();
    return this.documentMap.get(n);
  }
  async getOrCreateDocument(e, n) {
    let r = this.getDocument(e);
    return r || (r = await this.langiumDocumentFactory.fromUri(e, n), this.addDocument(r), r);
  }
  createDocument(e, n, r) {
    if (r)
      return this.langiumDocumentFactory.fromString(n, e, r).then((i) => (this.addDocument(i), i));
    {
      const i = this.langiumDocumentFactory.fromString(n, e);
      return this.addDocument(i), i;
    }
  }
  hasDocument(e) {
    return this.documentMap.has(e.toString());
  }
  invalidateDocument(e) {
    const n = e.toString(), r = this.documentMap.get(n);
    return r && (this.serviceRegistry.getServices(e).references.Linker.unlink(r), r.state = K.Changed, r.precomputedScopes = void 0, r.diagnostics = void 0), r;
  }
  deleteDocument(e) {
    const n = e.toString(), r = this.documentMap.get(n);
    return r && (r.state = K.Changed, this.documentMap.delete(n)), r;
  }
}
const Rs = /* @__PURE__ */ Symbol("ref_resolving");
class kE {
  constructor(e) {
    this.reflection = e.shared.AstReflection, this.langiumDocuments = () => e.shared.workspace.LangiumDocuments, this.scopeProvider = e.references.ScopeProvider, this.astNodeLocator = e.workspace.AstNodeLocator;
  }
  async link(e, n = V.CancellationToken.None) {
    for (const r of Xt(e.parseResult.value))
      await Ee(n), ic(r).forEach((i) => this.doLink(i, e));
  }
  doLink(e, n) {
    var r;
    const i = e.reference;
    if (i._ref === void 0) {
      i._ref = Rs;
      try {
        const s = this.getCandidate(e);
        if (jr(s))
          i._ref = s;
        else if (i._nodeDescription = s, this.langiumDocuments().hasDocument(s.documentUri)) {
          const a = this.loadAstNode(s);
          i._ref = a ?? this.createLinkingError(e, s);
        } else
          i._ref = void 0;
      } catch (s) {
        console.error(`An error occurred while resolving reference to '${i.$refText}':`, s);
        const a = (r = s.message) !== null && r !== void 0 ? r : String(s);
        i._ref = Object.assign(Object.assign({}, e), { message: `An error occurred while resolving reference to '${i.$refText}': ${a}` });
      }
      n.references.push(i);
    }
  }
  unlink(e) {
    for (const n of e.references)
      delete n._ref, delete n._nodeDescription;
    e.references = [];
  }
  getCandidate(e) {
    const r = this.scopeProvider.getScope(e).getElement(e.reference.$refText);
    return r ?? this.createLinkingError(e);
  }
  buildReference(e, n, r, i) {
    const s = this, a = {
      $refNode: r,
      $refText: i,
      get ref() {
        var o;
        if (le(this._ref))
          return this._ref;
        if (_d(this._nodeDescription)) {
          const l = s.loadAstNode(this._nodeDescription);
          this._ref = l ?? s.createLinkingError({ reference: a, container: e, property: n }, this._nodeDescription);
        } else if (this._ref === void 0) {
          this._ref = Rs;
          const l = Ds(e).$document, u = s.getLinkedNode({ reference: a, container: e, property: n });
          if (u.error && l && l.state < K.ComputedScopes)
            return this._ref = void 0;
          this._ref = (o = u.node) !== null && o !== void 0 ? o : u.error, this._nodeDescription = u.descr, l?.references.push(this);
        } else if (this._ref === Rs)
          throw new Error(`Cyclic reference resolution detected: ${s.astNodeLocator.getAstNodePath(e)}/${n} (symbol '${i}')`);
        return le(this._ref) ? this._ref : void 0;
      },
      get $nodeDescription() {
        return this._nodeDescription;
      },
      get error() {
        return jr(this._ref) ? this._ref : void 0;
      }
    };
    return a;
  }
  getLinkedNode(e) {
    var n;
    try {
      const r = this.getCandidate(e);
      if (jr(r))
        return { error: r };
      const i = this.loadAstNode(r);
      return i ? { node: i, descr: r } : {
        descr: r,
        error: this.createLinkingError(e, r)
      };
    } catch (r) {
      console.error(`An error occurred while resolving reference to '${e.reference.$refText}':`, r);
      const i = (n = r.message) !== null && n !== void 0 ? n : String(r);
      return {
        error: Object.assign(Object.assign({}, e), { message: `An error occurred while resolving reference to '${e.reference.$refText}': ${i}` })
      };
    }
  }
  loadAstNode(e) {
    if (e.node)
      return e.node;
    const n = this.langiumDocuments().getDocument(e.documentUri);
    if (n)
      return this.astNodeLocator.getAstNode(n.parseResult.value, e.path);
  }
  createLinkingError(e, n) {
    const r = Ds(e.container).$document;
    r && r.state < K.ComputedScopes && console.warn(`Attempted reference resolution before document reached ComputedScopes state (${r.uri}).`);
    const i = this.reflection.getReferenceType(e);
    return Object.assign(Object.assign({}, e), { message: `Could not resolve reference to ${i} named '${e.reference.$refText}'.`, targetDescription: n });
  }
}
function IE(t) {
  return typeof t.name == "string";
}
class CE {
  getName(e) {
    if (IE(e))
      return e.name;
  }
  getNameNode(e) {
    return uc(e.$cstNode, "name");
  }
}
class wE {
  constructor(e) {
    this.nameProvider = e.references.NameProvider, this.index = e.shared.workspace.IndexManager, this.nodeLocator = e.workspace.AstNodeLocator;
  }
  findDeclaration(e) {
    if (e) {
      const n = $h(e), r = e.astNode;
      if (n && r) {
        const i = r[n.feature];
        if (ze(i))
          return i.ref;
        if (Array.isArray(i)) {
          for (const s of i)
            if (ze(s) && s.$refNode && s.$refNode.offset <= e.offset && s.$refNode.end >= e.end)
              return s.ref;
        }
      }
      if (r) {
        const i = this.nameProvider.getNameNode(r);
        if (i && (i === e || Ld(e, i)))
          return r;
      }
    }
  }
  findDeclarationNode(e) {
    const n = this.findDeclaration(e);
    if (n?.$cstNode) {
      const r = this.nameProvider.getNameNode(n);
      return r ?? n.$cstNode;
    }
  }
  findReferences(e, n) {
    const r = [];
    if (n.includeDeclaration) {
      const s = this.getReferenceToSelf(e);
      s && r.push(s);
    }
    let i = this.index.findAllReferences(e, this.nodeLocator.getAstNodePath(e));
    return n.documentUri && (i = i.filter((s) => vt.equals(s.sourceUri, n.documentUri))), r.push(...i), re(r);
  }
  getReferenceToSelf(e) {
    const n = this.nameProvider.getNameNode(e);
    if (n) {
      const r = pt(e), i = this.nodeLocator.getAstNodePath(e);
      return {
        sourceUri: r.uri,
        sourcePath: i,
        targetUri: r.uri,
        targetPath: i,
        segment: si(n),
        local: !0
      };
    }
  }
}
class ki {
  constructor(e) {
    if (this.map = /* @__PURE__ */ new Map(), e)
      for (const [n, r] of e)
        this.add(n, r);
  }
  /**
   * The total number of values in the multimap.
   */
  get size() {
    return Ls.sum(re(this.map.values()).map((e) => e.length));
  }
  /**
   * Clear all entries in the multimap.
   */
  clear() {
    this.map.clear();
  }
  /**
   * Operates differently depending on whether a `value` is given:
   *  * With a value, this method deletes the specific key / value pair from the multimap.
   *  * Without a value, all values associated with the given key are deleted.
   *
   * @returns `true` if a value existed and has been removed, or `false` if the specified
   *     key / value does not exist.
   */
  delete(e, n) {
    if (n === void 0)
      return this.map.delete(e);
    {
      const r = this.map.get(e);
      if (r) {
        const i = r.indexOf(n);
        if (i >= 0)
          return r.length === 1 ? this.map.delete(e) : r.splice(i, 1), !0;
      }
      return !1;
    }
  }
  /**
   * Returns an array of all values associated with the given key. If no value exists,
   * an empty array is returned.
   *
   * _Note:_ The returned array is assumed not to be modified. Use the `set` method to add a
   * value and `delete` to remove a value from the multimap.
   */
  get(e) {
    var n;
    return (n = this.map.get(e)) !== null && n !== void 0 ? n : [];
  }
  /**
   * Operates differently depending on whether a `value` is given:
   *  * With a value, this method returns `true` if the specific key / value pair is present in the multimap.
   *  * Without a value, this method returns `true` if the given key is present in the multimap.
   */
  has(e, n) {
    if (n === void 0)
      return this.map.has(e);
    {
      const r = this.map.get(e);
      return r ? r.indexOf(n) >= 0 : !1;
    }
  }
  /**
   * Add the given key / value pair to the multimap.
   */
  add(e, n) {
    return this.map.has(e) ? this.map.get(e).push(n) : this.map.set(e, [n]), this;
  }
  /**
   * Add the given set of key / value pairs to the multimap.
   */
  addAll(e, n) {
    return this.map.has(e) ? this.map.get(e).push(...n) : this.map.set(e, Array.from(n)), this;
  }
  /**
   * Invokes the given callback function for every key / value pair in the multimap.
   */
  forEach(e) {
    this.map.forEach((n, r) => n.forEach((i) => e(i, r, this)));
  }
  /**
   * Returns an iterator of key, value pairs for every entry in the map.
   */
  [Symbol.iterator]() {
    return this.entries().iterator();
  }
  /**
   * Returns a stream of key, value pairs for every entry in the map.
   */
  entries() {
    return re(this.map.entries()).flatMap(([e, n]) => n.map((r) => [e, r]));
  }
  /**
   * Returns a stream of keys in the map.
   */
  keys() {
    return re(this.map.keys());
  }
  /**
   * Returns a stream of values in the map.
   */
  values() {
    return re(this.map.values()).flat();
  }
  /**
   * Returns a stream of key, value set pairs for every key in the map.
   */
  entriesGroupedByKey() {
    return re(this.map.entries());
  }
}
class Nu {
  get size() {
    return this.map.size;
  }
  constructor(e) {
    if (this.map = /* @__PURE__ */ new Map(), this.inverse = /* @__PURE__ */ new Map(), e)
      for (const [n, r] of e)
        this.set(n, r);
  }
  clear() {
    this.map.clear(), this.inverse.clear();
  }
  set(e, n) {
    return this.map.set(e, n), this.inverse.set(n, e), this;
  }
  get(e) {
    return this.map.get(e);
  }
  getKey(e) {
    return this.inverse.get(e);
  }
  delete(e) {
    const n = this.map.get(e);
    return n !== void 0 ? (this.map.delete(e), this.inverse.delete(n), !0) : !1;
  }
}
class NE {
  constructor(e) {
    this.nameProvider = e.references.NameProvider, this.descriptions = e.workspace.AstNodeDescriptionProvider;
  }
  async computeExports(e, n = V.CancellationToken.None) {
    return this.computeExportsForNode(e.parseResult.value, e, void 0, n);
  }
  /**
   * Creates {@link AstNodeDescription AstNodeDescriptions} for the given {@link AstNode parentNode} and its children.
   * The list of children to be considered is determined by the function parameter {@link children}.
   * By default only the direct children of {@link parentNode} are visited, nested nodes are not exported.
   *
   * @param parentNode AST node to be exported, i.e., of which an {@link AstNodeDescription} shall be added to the returned list.
   * @param document The document containing the AST node to be exported.
   * @param children A function called with {@link parentNode} as single argument and returning an {@link Iterable} supplying the children to be visited, which must be directly or transitively contained in {@link parentNode}.
   * @param cancelToken Indicates when to cancel the current operation.
   * @throws `OperationCancelled` if a user action occurs during execution.
   * @returns A list of {@link AstNodeDescription AstNodeDescriptions} to be published to index.
   */
  async computeExportsForNode(e, n, r = $a, i = V.CancellationToken.None) {
    const s = [];
    this.exportNode(e, s, n);
    for (const a of r(e))
      await Ee(i), this.exportNode(a, s, n);
    return s;
  }
  /**
   * Add a single node to the list of exports if it has a name. Override this method to change how
   * symbols are exported, e.g. by modifying their exported name.
   */
  exportNode(e, n, r) {
    const i = this.nameProvider.getName(e);
    i && n.push(this.descriptions.createDescription(e, i, r));
  }
  async computeLocalScopes(e, n = V.CancellationToken.None) {
    const r = e.parseResult.value, i = new ki();
    for (const s of lr(r))
      await Ee(n), this.processNode(s, e, i);
    return i;
  }
  /**
   * Process a single node during scopes computation. The default implementation makes the node visible
   * in the subtree of its container (if the node has a name). Override this method to change this,
   * e.g. by increasing the visibility to a higher level in the AST.
   */
  processNode(e, n, r) {
    const i = e.$container;
    if (i) {
      const s = this.nameProvider.getName(e);
      s && r.add(i, this.descriptions.createDescription(e, s, n));
    }
  }
}
class _u {
  constructor(e, n, r) {
    var i;
    this.elements = e, this.outerScope = n, this.caseInsensitive = (i = r?.caseInsensitive) !== null && i !== void 0 ? i : !1;
  }
  getAllElements() {
    return this.outerScope ? this.elements.concat(this.outerScope.getAllElements()) : this.elements;
  }
  getElement(e) {
    const n = this.caseInsensitive ? this.elements.find((r) => r.name.toLowerCase() === e.toLowerCase()) : this.elements.find((r) => r.name === e);
    if (n)
      return n;
    if (this.outerScope)
      return this.outerScope.getElement(e);
  }
}
class _E {
  constructor(e, n, r) {
    var i;
    this.elements = /* @__PURE__ */ new Map(), this.caseInsensitive = (i = r?.caseInsensitive) !== null && i !== void 0 ? i : !1;
    for (const s of e) {
      const a = this.caseInsensitive ? s.name.toLowerCase() : s.name;
      this.elements.set(a, s);
    }
    this.outerScope = n;
  }
  getElement(e) {
    const n = this.caseInsensitive ? e.toLowerCase() : e, r = this.elements.get(n);
    if (r)
      return r;
    if (this.outerScope)
      return this.outerScope.getElement(e);
  }
  getAllElements() {
    let e = re(this.elements.values());
    return this.outerScope && (e = e.concat(this.outerScope.getAllElements())), e;
  }
}
class Jf {
  constructor() {
    this.toDispose = [], this.isDisposed = !1;
  }
  onDispose(e) {
    this.toDispose.push(e);
  }
  dispose() {
    this.throwIfDisposed(), this.clear(), this.isDisposed = !0, this.toDispose.forEach((e) => e.dispose());
  }
  throwIfDisposed() {
    if (this.isDisposed)
      throw new Error("This cache has already been disposed");
  }
}
class bE extends Jf {
  constructor() {
    super(...arguments), this.cache = /* @__PURE__ */ new Map();
  }
  has(e) {
    return this.throwIfDisposed(), this.cache.has(e);
  }
  set(e, n) {
    this.throwIfDisposed(), this.cache.set(e, n);
  }
  get(e, n) {
    if (this.throwIfDisposed(), this.cache.has(e))
      return this.cache.get(e);
    if (n) {
      const r = n();
      return this.cache.set(e, r), r;
    } else
      return;
  }
  delete(e) {
    return this.throwIfDisposed(), this.cache.delete(e);
  }
  clear() {
    this.throwIfDisposed(), this.cache.clear();
  }
}
class OE extends Jf {
  constructor(e) {
    super(), this.cache = /* @__PURE__ */ new Map(), this.converter = e ?? ((n) => n);
  }
  has(e, n) {
    return this.throwIfDisposed(), this.cacheForContext(e).has(n);
  }
  set(e, n, r) {
    this.throwIfDisposed(), this.cacheForContext(e).set(n, r);
  }
  get(e, n, r) {
    this.throwIfDisposed();
    const i = this.cacheForContext(e);
    if (i.has(n))
      return i.get(n);
    if (r) {
      const s = r();
      return i.set(n, s), s;
    } else
      return;
  }
  delete(e, n) {
    return this.throwIfDisposed(), this.cacheForContext(e).delete(n);
  }
  clear(e) {
    if (this.throwIfDisposed(), e) {
      const n = this.converter(e);
      this.cache.delete(n);
    } else
      this.cache.clear();
  }
  cacheForContext(e) {
    const n = this.converter(e);
    let r = this.cache.get(n);
    return r || (r = /* @__PURE__ */ new Map(), this.cache.set(n, r)), r;
  }
}
class LE extends bE {
  /**
   * Creates a new workspace cache.
   *
   * @param sharedServices Service container instance to hook into document lifecycle events.
   * @param state Optional document state on which the cache should evict.
   * If not provided, the cache will evict on `DocumentBuilder#onUpdate`.
   * *Deleted* documents are considered in both cases.
   */
  constructor(e, n) {
    super(), n ? (this.toDispose.push(e.workspace.DocumentBuilder.onBuildPhase(n, () => {
      this.clear();
    })), this.toDispose.push(e.workspace.DocumentBuilder.onUpdate((r, i) => {
      i.length > 0 && this.clear();
    }))) : this.toDispose.push(e.workspace.DocumentBuilder.onUpdate(() => {
      this.clear();
    }));
  }
}
class PE {
  constructor(e) {
    this.reflection = e.shared.AstReflection, this.nameProvider = e.references.NameProvider, this.descriptions = e.workspace.AstNodeDescriptionProvider, this.indexManager = e.shared.workspace.IndexManager, this.globalScopeCache = new LE(e.shared);
  }
  getScope(e) {
    const n = [], r = this.reflection.getReferenceType(e), i = pt(e.container).precomputedScopes;
    if (i) {
      let a = e.container;
      do {
        const o = i.get(a);
        o.length > 0 && n.push(re(o).filter((l) => this.reflection.isSubtype(l.type, r))), a = a.$container;
      } while (a);
    }
    let s = this.getGlobalScope(r, e);
    for (let a = n.length - 1; a >= 0; a--)
      s = this.createScope(n[a], s);
    return s;
  }
  /**
   * Create a scope for the given collection of AST node descriptions.
   */
  createScope(e, n, r) {
    return new _u(re(e), n, r);
  }
  /**
   * Create a scope for the given collection of AST nodes, which need to be transformed into respective
   * descriptions first. This is done using the `NameProvider` and `AstNodeDescriptionProvider` services.
   */
  createScopeForNodes(e, n, r) {
    const i = re(e).map((s) => {
      const a = this.nameProvider.getName(s);
      if (a)
        return this.descriptions.createDescription(s, a);
    }).nonNullable();
    return new _u(i, n, r);
  }
  /**
   * Create a global scope filtered for the given reference type.
   */
  getGlobalScope(e, n) {
    return this.globalScopeCache.get(e, () => new _E(this.indexManager.allElements(e)));
  }
}
function ME(t) {
  return typeof t.$comment == "string";
}
function bu(t) {
  return typeof t == "object" && !!t && ("$ref" in t || "$error" in t);
}
class DE {
  constructor(e) {
    this.ignoreProperties = /* @__PURE__ */ new Set(["$container", "$containerProperty", "$containerIndex", "$document", "$cstNode"]), this.langiumDocuments = e.shared.workspace.LangiumDocuments, this.astNodeLocator = e.workspace.AstNodeLocator, this.nameProvider = e.references.NameProvider, this.commentProvider = e.documentation.CommentProvider;
  }
  serialize(e, n) {
    const r = n ?? {}, i = n?.replacer, s = (o, l) => this.replacer(o, l, r), a = i ? (o, l) => i(o, l, s) : s;
    try {
      return this.currentDocument = pt(e), JSON.stringify(e, a, n?.space);
    } finally {
      this.currentDocument = void 0;
    }
  }
  deserialize(e, n) {
    const r = n ?? {}, i = JSON.parse(e);
    return this.linkNode(i, i, r), i;
  }
  replacer(e, n, { refText: r, sourceText: i, textRegions: s, comments: a, uriConverter: o }) {
    var l, u, c, f;
    if (!this.ignoreProperties.has(e))
      if (ze(n)) {
        const d = n.ref, h = r ? n.$refText : void 0;
        if (d) {
          const m = pt(d);
          let g = "";
          this.currentDocument && this.currentDocument !== m && (o ? g = o(m.uri, n) : g = m.uri.toString());
          const R = this.astNodeLocator.getAstNodePath(d);
          return {
            $ref: `${g}#${R}`,
            $refText: h
          };
        } else
          return {
            $error: (u = (l = n.error) === null || l === void 0 ? void 0 : l.message) !== null && u !== void 0 ? u : "Could not resolve reference",
            $refText: h
          };
      } else if (le(n)) {
        let d;
        if (s && (d = this.addAstNodeRegionWithAssignmentsTo(Object.assign({}, n)), (!e || n.$document) && d?.$textRegion && (d.$textRegion.documentURI = (c = this.currentDocument) === null || c === void 0 ? void 0 : c.uri.toString())), i && !e && (d ?? (d = Object.assign({}, n)), d.$sourceText = (f = n.$cstNode) === null || f === void 0 ? void 0 : f.text), a) {
          d ?? (d = Object.assign({}, n));
          const h = this.commentProvider.getComment(n);
          h && (d.$comment = h.replace(/\r/g, ""));
        }
        return d ?? n;
      } else
        return n;
  }
  addAstNodeRegionWithAssignmentsTo(e) {
    const n = (r) => ({
      offset: r.offset,
      end: r.end,
      length: r.length,
      range: r.range
    });
    if (e.$cstNode) {
      const r = e.$textRegion = n(e.$cstNode), i = r.assignments = {};
      return Object.keys(e).filter((s) => !s.startsWith("$")).forEach((s) => {
        const a = Rh(e.$cstNode, s).map(n);
        a.length !== 0 && (i[s] = a);
      }), e;
    }
  }
  linkNode(e, n, r, i, s, a) {
    for (const [l, u] of Object.entries(e))
      if (Array.isArray(u))
        for (let c = 0; c < u.length; c++) {
          const f = u[c];
          bu(f) ? u[c] = this.reviveReference(e, l, n, f, r) : le(f) && this.linkNode(f, n, r, e, l, c);
        }
      else bu(u) ? e[l] = this.reviveReference(e, l, n, u, r) : le(u) && this.linkNode(u, n, r, e, l);
    const o = e;
    o.$container = i, o.$containerProperty = s, o.$containerIndex = a;
  }
  reviveReference(e, n, r, i, s) {
    let a = i.$refText, o = i.$error;
    if (i.$ref) {
      const l = this.getRefNode(r, i.$ref, s.uriConverter);
      if (le(l))
        return a || (a = this.nameProvider.getName(l)), {
          $refText: a ?? "",
          ref: l
        };
      o = l;
    }
    if (o) {
      const l = {
        $refText: a ?? ""
      };
      return l.error = {
        container: e,
        property: n,
        message: o,
        reference: l
      }, l;
    } else
      return;
  }
  getRefNode(e, n, r) {
    try {
      const i = n.indexOf("#");
      if (i === 0) {
        const l = this.astNodeLocator.getAstNode(e, n.substring(1));
        return l || "Could not resolve path: " + n;
      }
      if (i < 0) {
        const l = r ? r(n) : Ft.parse(n), u = this.langiumDocuments.getDocument(l);
        return u ? u.parseResult.value : "Could not find document for URI: " + n;
      }
      const s = r ? r(n.substring(0, i)) : Ft.parse(n.substring(0, i)), a = this.langiumDocuments.getDocument(s);
      if (!a)
        return "Could not find document for URI: " + n;
      if (i === n.length - 1)
        return a.parseResult.value;
      const o = this.astNodeLocator.getAstNode(a.parseResult.value, n.substring(i + 1));
      return o || "Could not resolve URI: " + n;
    } catch (i) {
      return String(i);
    }
  }
}
class FE {
  /**
   * @deprecated Use the new `fileExtensionMap` (or `languageIdMap`) property instead.
   */
  get map() {
    return this.fileExtensionMap;
  }
  constructor(e) {
    this.languageIdMap = /* @__PURE__ */ new Map(), this.fileExtensionMap = /* @__PURE__ */ new Map(), this.textDocuments = e?.workspace.TextDocuments;
  }
  register(e) {
    const n = e.LanguageMetaData;
    for (const r of n.fileExtensions)
      this.fileExtensionMap.has(r) && console.warn(`The file extension ${r} is used by multiple languages. It is now assigned to '${n.languageId}'.`), this.fileExtensionMap.set(r, e);
    this.languageIdMap.set(n.languageId, e), this.languageIdMap.size === 1 ? this.singleton = e : this.singleton = void 0;
  }
  getServices(e) {
    var n, r;
    if (this.singleton !== void 0)
      return this.singleton;
    if (this.languageIdMap.size === 0)
      throw new Error("The service registry is empty. Use `register` to register the services of a language.");
    const i = (r = (n = this.textDocuments) === null || n === void 0 ? void 0 : n.get(e)) === null || r === void 0 ? void 0 : r.languageId;
    if (i !== void 0) {
      const o = this.languageIdMap.get(i);
      if (o)
        return o;
    }
    const s = vt.extname(e), a = this.fileExtensionMap.get(s);
    if (!a)
      throw i ? new Error(`The service registry contains no services for the extension '${s}' for language '${i}'.`) : new Error(`The service registry contains no services for the extension '${s}'.`);
    return a;
  }
  hasServices(e) {
    try {
      return this.getServices(e), !0;
    } catch {
      return !1;
    }
  }
  get all() {
    return Array.from(this.languageIdMap.values());
  }
}
function zn(t) {
  return { code: t };
}
var Ii;
(function(t) {
  t.all = ["fast", "slow", "built-in"];
})(Ii || (Ii = {}));
class GE {
  constructor(e) {
    this.entries = new ki(), this.entriesBefore = [], this.entriesAfter = [], this.reflection = e.shared.AstReflection;
  }
  /**
   * Register a set of validation checks. Each value in the record can be either a single validation check (i.e. a function)
   * or an array of validation checks.
   *
   * @param checksRecord Set of validation checks to register.
   * @param category Optional category for the validation checks (defaults to `'fast'`).
   * @param thisObj Optional object to be used as `this` when calling the validation check functions.
   */
  register(e, n = this, r = "fast") {
    if (r === "built-in")
      throw new Error("The 'built-in' category is reserved for lexer, parser, and linker errors.");
    for (const [i, s] of Object.entries(e)) {
      const a = s;
      if (Array.isArray(a))
        for (const o of a) {
          const l = {
            check: this.wrapValidationException(o, n),
            category: r
          };
          this.addEntry(i, l);
        }
      else if (typeof a == "function") {
        const o = {
          check: this.wrapValidationException(a, n),
          category: r
        };
        this.addEntry(i, o);
      } else
        or();
    }
  }
  wrapValidationException(e, n) {
    return async (r, i, s) => {
      await this.handleException(() => e.call(n, r, i, s), "An error occurred during validation", i, r);
    };
  }
  async handleException(e, n, r, i) {
    try {
      await e();
    } catch (s) {
      if (Zi(s))
        throw s;
      console.error(`${n}:`, s), s instanceof Error && s.stack && console.error(s.stack);
      const a = s instanceof Error ? s.message : String(s);
      r("error", `${n}: ${a}`, { node: i });
    }
  }
  addEntry(e, n) {
    if (e === "AstNode") {
      this.entries.add("AstNode", n);
      return;
    }
    for (const r of this.reflection.getAllSubTypes(e))
      this.entries.add(r, n);
  }
  getChecks(e, n) {
    let r = re(this.entries.get(e)).concat(this.entries.get("AstNode"));
    return n && (r = r.filter((i) => n.includes(i.category))), r.map((i) => i.check);
  }
  /**
   * Register logic which will be executed once before validating all the nodes of an AST/Langium document.
   * This helps to prepare or initialize some information which are required or reusable for the following checks on the AstNodes.
   *
   * As an example, for validating unique fully-qualified names of nodes in the AST,
   * here the map for mapping names to nodes could be established.
   * During the usual checks on the nodes, they are put into this map with their name.
   *
   * Note that this approach makes validations stateful, which is relevant e.g. when cancelling the validation.
   * Therefore it is recommended to clear stored information
   * _before_ validating an AST to validate each AST unaffected from other ASTs
   * AND _after_ validating the AST to free memory by information which are no longer used.
   *
   * @param checkBefore a set-up function which will be called once before actually validating an AST
   * @param thisObj Optional object to be used as `this` when calling the validation check functions.
   */
  registerBeforeDocument(e, n = this) {
    this.entriesBefore.push(this.wrapPreparationException(e, "An error occurred during set-up of the validation", n));
  }
  /**
   * Register logic which will be executed once after validating all the nodes of an AST/Langium document.
   * This helps to finally evaluate information which are collected during the checks on the AstNodes.
   *
   * As an example, for validating unique fully-qualified names of nodes in the AST,
   * here the map with all the collected nodes and their names is checked
   * and validation hints are created for all nodes with the same name.
   *
   * Note that this approach makes validations stateful, which is relevant e.g. when cancelling the validation.
   * Therefore it is recommended to clear stored information
   * _before_ validating an AST to validate each AST unaffected from other ASTs
   * AND _after_ validating the AST to free memory by information which are no longer used.
   *
   * @param checkBefore a set-up function which will be called once before actually validating an AST
   * @param thisObj Optional object to be used as `this` when calling the validation check functions.
   */
  registerAfterDocument(e, n = this) {
    this.entriesAfter.push(this.wrapPreparationException(e, "An error occurred during tear-down of the validation", n));
  }
  wrapPreparationException(e, n, r) {
    return async (i, s, a, o) => {
      await this.handleException(() => e.call(r, i, s, a, o), n, s, i);
    };
  }
  get checksBefore() {
    return this.entriesBefore;
  }
  get checksAfter() {
    return this.entriesAfter;
  }
}
class UE {
  constructor(e) {
    this.validationRegistry = e.validation.ValidationRegistry, this.metadata = e.LanguageMetaData;
  }
  async validateDocument(e, n = {}, r = V.CancellationToken.None) {
    const i = e.parseResult, s = [];
    if (await Ee(r), (!n.categories || n.categories.includes("built-in")) && (this.processLexingErrors(i, s, n), n.stopAfterLexingErrors && s.some((a) => {
      var o;
      return ((o = a.data) === null || o === void 0 ? void 0 : o.code) === Fe.LexingError;
    }) || (this.processParsingErrors(i, s, n), n.stopAfterParsingErrors && s.some((a) => {
      var o;
      return ((o = a.data) === null || o === void 0 ? void 0 : o.code) === Fe.ParsingError;
    })) || (this.processLinkingErrors(e, s, n), n.stopAfterLinkingErrors && s.some((a) => {
      var o;
      return ((o = a.data) === null || o === void 0 ? void 0 : o.code) === Fe.LinkingError;
    }))))
      return s;
    try {
      s.push(...await this.validateAst(i.value, n, r));
    } catch (a) {
      if (Zi(a))
        throw a;
      console.error("An error occurred during validation:", a);
    }
    return await Ee(r), s;
  }
  processLexingErrors(e, n, r) {
    var i, s, a;
    const o = [...e.lexerErrors, ...(s = (i = e.lexerReport) === null || i === void 0 ? void 0 : i.diagnostics) !== null && s !== void 0 ? s : []];
    for (const l of o) {
      const u = (a = l.severity) !== null && a !== void 0 ? a : "error", c = {
        severity: As(u),
        range: {
          start: {
            line: l.line - 1,
            character: l.column - 1
          },
          end: {
            line: l.line - 1,
            character: l.column + l.length - 1
          }
        },
        message: l.message,
        data: jE(u),
        source: this.getSource()
      };
      n.push(c);
    }
  }
  processParsingErrors(e, n, r) {
    for (const i of e.parserErrors) {
      let s;
      if (isNaN(i.token.startOffset)) {
        if ("previousToken" in i) {
          const a = i.previousToken;
          if (isNaN(a.startOffset)) {
            const o = { line: 0, character: 0 };
            s = { start: o, end: o };
          } else {
            const o = { line: a.endLine - 1, character: a.endColumn };
            s = { start: o, end: o };
          }
        }
      } else
        s = Ms(i.token);
      if (s) {
        const a = {
          severity: As("error"),
          range: s,
          message: i.message,
          data: zn(Fe.ParsingError),
          source: this.getSource()
        };
        n.push(a);
      }
    }
  }
  processLinkingErrors(e, n, r) {
    for (const i of e.references) {
      const s = i.error;
      if (s) {
        const a = {
          node: s.container,
          property: s.property,
          index: s.index,
          data: {
            code: Fe.LinkingError,
            containerType: s.container.$type,
            property: s.property,
            refText: s.reference.$refText
          }
        };
        n.push(this.toDiagnostic("error", s.message, a));
      }
    }
  }
  async validateAst(e, n, r = V.CancellationToken.None) {
    const i = [], s = (a, o, l) => {
      i.push(this.toDiagnostic(a, o, l));
    };
    return await this.validateAstBefore(e, n, s, r), await this.validateAstNodes(e, n, s, r), await this.validateAstAfter(e, n, s, r), i;
  }
  async validateAstBefore(e, n, r, i = V.CancellationToken.None) {
    var s;
    const a = this.validationRegistry.checksBefore;
    for (const o of a)
      await Ee(i), await o(e, r, (s = n.categories) !== null && s !== void 0 ? s : [], i);
  }
  async validateAstNodes(e, n, r, i = V.CancellationToken.None) {
    await Promise.all(Xt(e).map(async (s) => {
      await Ee(i);
      const a = this.validationRegistry.getChecks(s.$type, n.categories);
      for (const o of a)
        await o(s, r, i);
    }));
  }
  async validateAstAfter(e, n, r, i = V.CancellationToken.None) {
    var s;
    const a = this.validationRegistry.checksAfter;
    for (const o of a)
      await Ee(i), await o(e, r, (s = n.categories) !== null && s !== void 0 ? s : [], i);
  }
  toDiagnostic(e, n, r) {
    return {
      message: n,
      range: BE(r),
      severity: As(e),
      code: r.code,
      codeDescription: r.codeDescription,
      tags: r.tags,
      relatedInformation: r.relatedInformation,
      data: r.data,
      source: this.getSource()
    };
  }
  getSource() {
    return this.metadata.languageId;
  }
}
function BE(t) {
  if (t.range)
    return t.range;
  let e;
  return typeof t.property == "string" ? e = uc(t.node.$cstNode, t.property, t.index) : typeof t.keyword == "string" && (e = Ah(t.node.$cstNode, t.keyword, t.index)), e ?? (e = t.node.$cstNode), e ? e.range : {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 }
  };
}
function As(t) {
  switch (t) {
    case "error":
      return 1;
    case "warning":
      return 2;
    case "info":
      return 3;
    case "hint":
      return 4;
    default:
      throw new Error("Invalid diagnostic severity: " + t);
  }
}
function jE(t) {
  switch (t) {
    case "error":
      return zn(Fe.LexingError);
    case "warning":
      return zn(Fe.LexingWarning);
    case "info":
      return zn(Fe.LexingInfo);
    case "hint":
      return zn(Fe.LexingHint);
    default:
      throw new Error("Invalid diagnostic severity: " + t);
  }
}
var Fe;
(function(t) {
  t.LexingError = "lexing-error", t.LexingWarning = "lexing-warning", t.LexingInfo = "lexing-info", t.LexingHint = "lexing-hint", t.ParsingError = "parsing-error", t.LinkingError = "linking-error";
})(Fe || (Fe = {}));
class KE {
  constructor(e) {
    this.astNodeLocator = e.workspace.AstNodeLocator, this.nameProvider = e.references.NameProvider;
  }
  createDescription(e, n, r) {
    const i = r ?? pt(e);
    n ?? (n = this.nameProvider.getName(e));
    const s = this.astNodeLocator.getAstNodePath(e);
    if (!n)
      throw new Error(`Node at path ${s} has no name.`);
    let a;
    const o = () => {
      var l;
      return a ?? (a = si((l = this.nameProvider.getNameNode(e)) !== null && l !== void 0 ? l : e.$cstNode));
    };
    return {
      node: e,
      name: n,
      get nameSegment() {
        return o();
      },
      selectionSegment: si(e.$cstNode),
      type: e.$type,
      documentUri: i.uri,
      path: s
    };
  }
}
class HE {
  constructor(e) {
    this.nodeLocator = e.workspace.AstNodeLocator;
  }
  async createDescriptions(e, n = V.CancellationToken.None) {
    const r = [], i = e.parseResult.value;
    for (const s of Xt(i))
      await Ee(n), ic(s).filter((a) => !jr(a)).forEach((a) => {
        const o = this.createDescription(a);
        o && r.push(o);
      });
    return r;
  }
  createDescription(e) {
    const n = e.reference.$nodeDescription, r = e.reference.$refNode;
    if (!n || !r)
      return;
    const i = pt(e.container).uri;
    return {
      sourceUri: i,
      sourcePath: this.nodeLocator.getAstNodePath(e.container),
      targetUri: n.documentUri,
      targetPath: n.path,
      segment: si(r),
      local: vt.equals(n.documentUri, i)
    };
  }
}
class VE {
  constructor() {
    this.segmentSeparator = "/", this.indexSeparator = "@";
  }
  getAstNodePath(e) {
    if (e.$container) {
      const n = this.getAstNodePath(e.$container), r = this.getPathSegment(e);
      return n + this.segmentSeparator + r;
    }
    return "";
  }
  getPathSegment({ $containerProperty: e, $containerIndex: n }) {
    if (!e)
      throw new Error("Missing '$containerProperty' in AST node.");
    return n !== void 0 ? e + this.indexSeparator + n : e;
  }
  getAstNode(e, n) {
    return n.split(this.segmentSeparator).reduce((i, s) => {
      if (!i || s.length === 0)
        return i;
      const a = s.indexOf(this.indexSeparator);
      if (a > 0) {
        const o = s.substring(0, a), l = parseInt(s.substring(a + 1)), u = i[o];
        return u?.[l];
      }
      return i[s];
    }, e);
  }
}
var WE = zf();
class zE {
  constructor(e) {
    this._ready = new so(), this.settings = {}, this.workspaceConfig = !1, this.onConfigurationSectionUpdateEmitter = new WE.Emitter(), this.serviceRegistry = e.ServiceRegistry;
  }
  get ready() {
    return this._ready.promise;
  }
  initialize(e) {
    var n, r;
    this.workspaceConfig = (r = (n = e.capabilities.workspace) === null || n === void 0 ? void 0 : n.configuration) !== null && r !== void 0 ? r : !1;
  }
  async initialized(e) {
    if (this.workspaceConfig) {
      if (e.register) {
        const n = this.serviceRegistry.all;
        e.register({
          // Listen to configuration changes for all languages
          section: n.map((r) => this.toSectionName(r.LanguageMetaData.languageId))
        });
      }
      if (e.fetchConfiguration) {
        const n = this.serviceRegistry.all.map((i) => ({
          // Fetch the configuration changes for all languages
          section: this.toSectionName(i.LanguageMetaData.languageId)
        })), r = await e.fetchConfiguration(n);
        n.forEach((i, s) => {
          this.updateSectionConfiguration(i.section, r[s]);
        });
      }
    }
    this._ready.resolve();
  }
  /**
   *  Updates the cached configurations using the `change` notification parameters.
   *
   * @param change The parameters of a change configuration notification.
   * `settings` property of the change object could be expressed as `Record<string, Record<string, any>>`
   */
  updateConfiguration(e) {
    e.settings && Object.keys(e.settings).forEach((n) => {
      const r = e.settings[n];
      this.updateSectionConfiguration(n, r), this.onConfigurationSectionUpdateEmitter.fire({ section: n, configuration: r });
    });
  }
  updateSectionConfiguration(e, n) {
    this.settings[e] = n;
  }
  /**
  * Returns a configuration value stored for the given language.
  *
  * @param language The language id
  * @param configuration Configuration name
  */
  async getConfiguration(e, n) {
    await this.ready;
    const r = this.toSectionName(e);
    if (this.settings[r])
      return this.settings[r][n];
  }
  toSectionName(e) {
    return `${e}`;
  }
  get onConfigurationSectionUpdate() {
    return this.onConfigurationSectionUpdateEmitter.event;
  }
}
var Qn;
(function(t) {
  function e(n) {
    return {
      dispose: async () => await n()
    };
  }
  t.create = e;
})(Qn || (Qn = {}));
class qE {
  constructor(e) {
    this.updateBuildOptions = {
      // Default: run only the built-in validation checks and those in the _fast_ category (includes those without category)
      validation: {
        categories: ["built-in", "fast"]
      }
    }, this.updateListeners = [], this.buildPhaseListeners = new ki(), this.documentPhaseListeners = new ki(), this.buildState = /* @__PURE__ */ new Map(), this.documentBuildWaiters = /* @__PURE__ */ new Map(), this.currentState = K.Changed, this.langiumDocuments = e.workspace.LangiumDocuments, this.langiumDocumentFactory = e.workspace.LangiumDocumentFactory, this.textDocuments = e.workspace.TextDocuments, this.indexManager = e.workspace.IndexManager, this.serviceRegistry = e.ServiceRegistry;
  }
  async build(e, n = {}, r = V.CancellationToken.None) {
    var i, s;
    for (const a of e) {
      const o = a.uri.toString();
      if (a.state === K.Validated) {
        if (typeof n.validation == "boolean" && n.validation)
          a.state = K.IndexedReferences, a.diagnostics = void 0, this.buildState.delete(o);
        else if (typeof n.validation == "object") {
          const l = this.buildState.get(o), u = (i = l?.result) === null || i === void 0 ? void 0 : i.validationChecks;
          if (u) {
            const f = ((s = n.validation.categories) !== null && s !== void 0 ? s : Ii.all).filter((d) => !u.includes(d));
            f.length > 0 && (this.buildState.set(o, {
              completed: !1,
              options: {
                validation: Object.assign(Object.assign({}, n.validation), { categories: f })
              },
              result: l.result
            }), a.state = K.IndexedReferences);
          }
        }
      } else
        this.buildState.delete(o);
    }
    this.currentState = K.Changed, await this.emitUpdate(e.map((a) => a.uri), []), await this.buildDocuments(e, n, r);
  }
  async update(e, n, r = V.CancellationToken.None) {
    this.currentState = K.Changed;
    for (const a of n)
      this.langiumDocuments.deleteDocument(a), this.buildState.delete(a.toString()), this.indexManager.remove(a);
    for (const a of e) {
      if (!this.langiumDocuments.invalidateDocument(a)) {
        const l = this.langiumDocumentFactory.fromModel({ $type: "INVALID" }, a);
        l.state = K.Changed, this.langiumDocuments.addDocument(l);
      }
      this.buildState.delete(a.toString());
    }
    const i = re(e).concat(n).map((a) => a.toString()).toSet();
    this.langiumDocuments.all.filter((a) => !i.has(a.uri.toString()) && this.shouldRelink(a, i)).forEach((a) => {
      this.serviceRegistry.getServices(a.uri).references.Linker.unlink(a), a.state = Math.min(a.state, K.ComputedScopes), a.diagnostics = void 0;
    }), await this.emitUpdate(e, n), await Ee(r);
    const s = this.sortDocuments(this.langiumDocuments.all.filter((a) => {
      var o;
      return a.state < K.Linked || !(!((o = this.buildState.get(a.uri.toString())) === null || o === void 0) && o.completed);
    }).toArray());
    await this.buildDocuments(s, this.updateBuildOptions, r);
  }
  async emitUpdate(e, n) {
    await Promise.all(this.updateListeners.map((r) => r(e, n)));
  }
  /**
   * Sort the given documents by priority. By default, documents with an open text document are prioritized.
   * This is useful to ensure that visible documents show their diagnostics before all other documents.
   *
   * This improves the responsiveness in large workspaces as users usually don't care about diagnostics
   * in files that are currently not opened in the editor.
   */
  sortDocuments(e) {
    let n = 0, r = e.length - 1;
    for (; n < r; ) {
      for (; n < e.length && this.hasTextDocument(e[n]); )
        n++;
      for (; r >= 0 && !this.hasTextDocument(e[r]); )
        r--;
      n < r && ([e[n], e[r]] = [e[r], e[n]]);
    }
    return e;
  }
  hasTextDocument(e) {
    var n;
    return !!(!((n = this.textDocuments) === null || n === void 0) && n.get(e.uri));
  }
  /**
   * Check whether the given document should be relinked after changes were found in the given URIs.
   */
  shouldRelink(e, n) {
    return e.references.some((r) => r.error !== void 0) ? !0 : this.indexManager.isAffected(e, n);
  }
  onUpdate(e) {
    return this.updateListeners.push(e), Qn.create(() => {
      const n = this.updateListeners.indexOf(e);
      n >= 0 && this.updateListeners.splice(n, 1);
    });
  }
  /**
   * Build the given documents by stepping through all build phases. If a document's state indicates
   * that a certain build phase is already done, the phase is skipped for that document.
   *
   * @param documents The documents to build.
   * @param options the {@link BuildOptions} to use.
   * @param cancelToken A cancellation token that can be used to cancel the build.
   * @returns A promise that resolves when the build is done.
   */
  async buildDocuments(e, n, r) {
    this.prepareBuild(e, n), await this.runCancelable(e, K.Parsed, r, (s) => this.langiumDocumentFactory.update(s, r)), await this.runCancelable(e, K.IndexedContent, r, (s) => this.indexManager.updateContent(s, r)), await this.runCancelable(e, K.ComputedScopes, r, async (s) => {
      const a = this.serviceRegistry.getServices(s.uri).references.ScopeComputation;
      s.precomputedScopes = await a.computeLocalScopes(s, r);
    }), await this.runCancelable(e, K.Linked, r, (s) => this.serviceRegistry.getServices(s.uri).references.Linker.link(s, r)), await this.runCancelable(e, K.IndexedReferences, r, (s) => this.indexManager.updateReferences(s, r));
    const i = e.filter((s) => this.shouldValidate(s));
    await this.runCancelable(i, K.Validated, r, (s) => this.validate(s, r));
    for (const s of e) {
      const a = this.buildState.get(s.uri.toString());
      a && (a.completed = !0);
    }
  }
  /**
   * Runs prior to beginning the build process to update the {@link DocumentBuildState} for each document
   *
   * @param documents collection of documents to be built
   * @param options the {@link BuildOptions} to use
   */
  prepareBuild(e, n) {
    for (const r of e) {
      const i = r.uri.toString(), s = this.buildState.get(i);
      (!s || s.completed) && this.buildState.set(i, {
        completed: !1,
        options: n,
        result: s?.result
      });
    }
  }
  /**
   * Runs a cancelable operation on a set of documents to bring them to a specified {@link DocumentState}.
   *
   * @param documents The array of documents to process.
   * @param targetState The target {@link DocumentState} to bring the documents to.
   * @param cancelToken A token that can be used to cancel the operation.
   * @param callback A function to be called for each document.
   * @returns A promise that resolves when all documents have been processed or the operation is canceled.
   * @throws Will throw `OperationCancelled` if the operation is canceled via a `CancellationToken`.
   */
  async runCancelable(e, n, r, i) {
    const s = e.filter((o) => o.state < n);
    for (const o of s)
      await Ee(r), await i(o), o.state = n, await this.notifyDocumentPhase(o, n, r);
    const a = e.filter((o) => o.state === n);
    await this.notifyBuildPhase(a, n, r), this.currentState = n;
  }
  onBuildPhase(e, n) {
    return this.buildPhaseListeners.add(e, n), Qn.create(() => {
      this.buildPhaseListeners.delete(e, n);
    });
  }
  onDocumentPhase(e, n) {
    return this.documentPhaseListeners.add(e, n), Qn.create(() => {
      this.documentPhaseListeners.delete(e, n);
    });
  }
  waitUntil(e, n, r) {
    let i;
    if (n && "path" in n ? i = n : r = n, r ?? (r = V.CancellationToken.None), i) {
      const s = this.langiumDocuments.getDocument(i);
      if (s && s.state > e)
        return Promise.resolve(i);
    }
    return this.currentState >= e ? Promise.resolve(void 0) : r.isCancellationRequested ? Promise.reject(Si) : new Promise((s, a) => {
      const o = this.onBuildPhase(e, () => {
        if (o.dispose(), l.dispose(), i) {
          const u = this.langiumDocuments.getDocument(i);
          s(u?.uri);
        } else
          s(void 0);
      }), l = r.onCancellationRequested(() => {
        o.dispose(), l.dispose(), a(Si);
      });
    });
  }
  async notifyDocumentPhase(e, n, r) {
    const s = this.documentPhaseListeners.get(n).slice();
    for (const a of s)
      try {
        await a(e, r);
      } catch (o) {
        if (!Zi(o))
          throw o;
      }
  }
  async notifyBuildPhase(e, n, r) {
    if (e.length === 0)
      return;
    const s = this.buildPhaseListeners.get(n).slice();
    for (const a of s)
      await Ee(r), await a(e, r);
  }
  /**
   * Determine whether the given document should be validated during a build. The default
   * implementation checks the `validation` property of the build options. If it's set to `true`
   * or a `ValidationOptions` object, the document is included in the validation phase.
   */
  shouldValidate(e) {
    return !!this.getBuildOptions(e).validation;
  }
  /**
   * Run validation checks on the given document and store the resulting diagnostics in the document.
   * If the document already contains diagnostics, the new ones are added to the list.
   */
  async validate(e, n) {
    var r, i;
    const s = this.serviceRegistry.getServices(e.uri).validation.DocumentValidator, a = this.getBuildOptions(e).validation, o = typeof a == "object" ? a : void 0, l = await s.validateDocument(e, o, n);
    e.diagnostics ? e.diagnostics.push(...l) : e.diagnostics = l;
    const u = this.buildState.get(e.uri.toString());
    if (u) {
      (r = u.result) !== null && r !== void 0 || (u.result = {});
      const c = (i = o?.categories) !== null && i !== void 0 ? i : Ii.all;
      u.result.validationChecks ? u.result.validationChecks.push(...c) : u.result.validationChecks = [...c];
    }
  }
  getBuildOptions(e) {
    var n, r;
    return (r = (n = this.buildState.get(e.uri.toString())) === null || n === void 0 ? void 0 : n.options) !== null && r !== void 0 ? r : {};
  }
}
class YE {
  constructor(e) {
    this.symbolIndex = /* @__PURE__ */ new Map(), this.symbolByTypeIndex = new OE(), this.referenceIndex = /* @__PURE__ */ new Map(), this.documents = e.workspace.LangiumDocuments, this.serviceRegistry = e.ServiceRegistry, this.astReflection = e.AstReflection;
  }
  findAllReferences(e, n) {
    const r = pt(e).uri, i = [];
    return this.referenceIndex.forEach((s) => {
      s.forEach((a) => {
        vt.equals(a.targetUri, r) && a.targetPath === n && i.push(a);
      });
    }), re(i);
  }
  allElements(e, n) {
    let r = re(this.symbolIndex.keys());
    return n && (r = r.filter((i) => !n || n.has(i))), r.map((i) => this.getFileDescriptions(i, e)).flat();
  }
  getFileDescriptions(e, n) {
    var r;
    return n ? this.symbolByTypeIndex.get(e, n, () => {
      var s;
      return ((s = this.symbolIndex.get(e)) !== null && s !== void 0 ? s : []).filter((o) => this.astReflection.isSubtype(o.type, n));
    }) : (r = this.symbolIndex.get(e)) !== null && r !== void 0 ? r : [];
  }
  remove(e) {
    const n = e.toString();
    this.symbolIndex.delete(n), this.symbolByTypeIndex.clear(n), this.referenceIndex.delete(n);
  }
  async updateContent(e, n = V.CancellationToken.None) {
    const i = await this.serviceRegistry.getServices(e.uri).references.ScopeComputation.computeExports(e, n), s = e.uri.toString();
    this.symbolIndex.set(s, i), this.symbolByTypeIndex.clear(s);
  }
  async updateReferences(e, n = V.CancellationToken.None) {
    const i = await this.serviceRegistry.getServices(e.uri).workspace.ReferenceDescriptionProvider.createDescriptions(e, n);
    this.referenceIndex.set(e.uri.toString(), i);
  }
  isAffected(e, n) {
    const r = this.referenceIndex.get(e.uri.toString());
    return r ? r.some((i) => !i.local && n.has(i.targetUri.toString())) : !1;
  }
}
class XE {
  constructor(e) {
    this.initialBuildOptions = {}, this._ready = new so(), this.serviceRegistry = e.ServiceRegistry, this.langiumDocuments = e.workspace.LangiumDocuments, this.documentBuilder = e.workspace.DocumentBuilder, this.fileSystemProvider = e.workspace.FileSystemProvider, this.mutex = e.workspace.WorkspaceLock;
  }
  get ready() {
    return this._ready.promise;
  }
  get workspaceFolders() {
    return this.folders;
  }
  initialize(e) {
    var n;
    this.folders = (n = e.workspaceFolders) !== null && n !== void 0 ? n : void 0;
  }
  initialized(e) {
    return this.mutex.write((n) => {
      var r;
      return this.initializeWorkspace((r = this.folders) !== null && r !== void 0 ? r : [], n);
    });
  }
  async initializeWorkspace(e, n = V.CancellationToken.None) {
    const r = await this.performStartup(e);
    await Ee(n), await this.documentBuilder.build(r, this.initialBuildOptions, n);
  }
  /**
   * Performs the uninterruptable startup sequence of the workspace manager.
   * This methods loads all documents in the workspace and other documents and returns them.
   */
  async performStartup(e) {
    const n = this.serviceRegistry.all.flatMap((s) => s.LanguageMetaData.fileExtensions), r = [], i = (s) => {
      r.push(s), this.langiumDocuments.hasDocument(s.uri) || this.langiumDocuments.addDocument(s);
    };
    return await this.loadAdditionalDocuments(e, i), await Promise.all(e.map((s) => [s, this.getRootFolder(s)]).map(async (s) => this.traverseFolder(...s, n, i))), this._ready.resolve(), r;
  }
  /**
   * Load all additional documents that shall be visible in the context of the given workspace
   * folders and add them to the collector. This can be used to include built-in libraries of
   * your language, which can be either loaded from provided files or constructed in memory.
   */
  loadAdditionalDocuments(e, n) {
    return Promise.resolve();
  }
  /**
   * Determine the root folder of the source documents in the given workspace folder.
   * The default implementation returns the URI of the workspace folder, but you can override
   * this to return a subfolder like `src` instead.
   */
  getRootFolder(e) {
    return Ft.parse(e.uri);
  }
  /**
   * Traverse the file system folder identified by the given URI and its subfolders. All
   * contained files that match the file extensions are added to the collector.
   */
  async traverseFolder(e, n, r, i) {
    const s = await this.fileSystemProvider.readDirectory(n);
    await Promise.all(s.map(async (a) => {
      if (this.includeEntry(e, a, r)) {
        if (a.isDirectory)
          await this.traverseFolder(e, a.uri, r, i);
        else if (a.isFile) {
          const o = await this.langiumDocuments.getOrCreateDocument(a.uri);
          i(o);
        }
      }
    }));
  }
  /**
   * Determine whether the given folder entry shall be included while indexing the workspace.
   */
  includeEntry(e, n, r) {
    const i = vt.basename(n.uri);
    if (i.startsWith("."))
      return !1;
    if (n.isDirectory)
      return i !== "node_modules" && i !== "out";
    if (n.isFile) {
      const s = vt.extname(n.uri);
      return r.includes(s);
    }
    return !1;
  }
}
class JE {
  buildUnexpectedCharactersMessage(e, n, r, i, s) {
    return Ws.buildUnexpectedCharactersMessage(e, n, r, i, s);
  }
  buildUnableToPopLexerModeMessage(e) {
    return Ws.buildUnableToPopLexerModeMessage(e);
  }
}
const ZE = { mode: "full" };
class QE {
  constructor(e) {
    this.errorMessageProvider = e.parser.LexerErrorMessageProvider, this.tokenBuilder = e.parser.TokenBuilder;
    const n = this.tokenBuilder.buildTokens(e.Grammar, {
      caseInsensitive: e.LanguageMetaData.caseInsensitive
    });
    this.tokenTypes = this.toTokenTypeDictionary(n);
    const r = Ou(n) ? Object.values(n) : n, i = e.LanguageMetaData.mode === "production";
    this.chevrotainLexer = new he(r, {
      positionTracking: "full",
      skipValidations: i,
      errorMessageProvider: this.errorMessageProvider
    });
  }
  get definition() {
    return this.tokenTypes;
  }
  tokenize(e, n = ZE) {
    var r, i, s;
    const a = this.chevrotainLexer.tokenize(e);
    return {
      tokens: a.tokens,
      errors: a.errors,
      hidden: (r = a.groups.hidden) !== null && r !== void 0 ? r : [],
      report: (s = (i = this.tokenBuilder).flushLexingReport) === null || s === void 0 ? void 0 : s.call(i, e)
    };
  }
  toTokenTypeDictionary(e) {
    if (Ou(e))
      return e;
    const n = Zf(e) ? Object.values(e.modes).flat() : e, r = {};
    return n.forEach((i) => r[i.name] = i), r;
  }
}
function e$(t) {
  return Array.isArray(t) && (t.length === 0 || "name" in t[0]);
}
function Zf(t) {
  return t && "modes" in t && "defaultMode" in t;
}
function Ou(t) {
  return !e$(t) && !Zf(t);
}
function t$(t, e, n) {
  let r, i;
  typeof t == "string" ? (i = e, r = n) : (i = t.range.start, r = e), i || (i = D.create(0, 0));
  const s = Qf(t), a = ao(r), o = i$({
    lines: s,
    position: i,
    options: a
  });
  return u$({
    index: 0,
    tokens: o,
    position: i
  });
}
function n$(t, e) {
  const n = ao(e), r = Qf(t);
  if (r.length === 0)
    return !1;
  const i = r[0], s = r[r.length - 1], a = n.start, o = n.end;
  return !!a?.exec(i) && !!o?.exec(s);
}
function Qf(t) {
  let e = "";
  return typeof t == "string" ? e = t : e = t.text, e.split(lh);
}
const Lu = /\s*(@([\p{L}][\p{L}\p{N}]*)?)/uy, r$ = /\{(@[\p{L}][\p{L}\p{N}]*)(\s*)([^\r\n}]+)?\}/gu;
function i$(t) {
  var e, n, r;
  const i = [];
  let s = t.position.line, a = t.position.character;
  for (let o = 0; o < t.lines.length; o++) {
    const l = o === 0, u = o === t.lines.length - 1;
    let c = t.lines[o], f = 0;
    if (l && t.options.start) {
      const h = (e = t.options.start) === null || e === void 0 ? void 0 : e.exec(c);
      h && (f = h.index + h[0].length);
    } else {
      const h = (n = t.options.line) === null || n === void 0 ? void 0 : n.exec(c);
      h && (f = h.index + h[0].length);
    }
    if (u) {
      const h = (r = t.options.end) === null || r === void 0 ? void 0 : r.exec(c);
      h && (c = c.substring(0, h.index));
    }
    if (c = c.substring(0, l$(c)), Ta(c, f) >= c.length) {
      if (i.length > 0) {
        const h = D.create(s, a);
        i.push({
          type: "break",
          content: "",
          range: L.create(h, h)
        });
      }
    } else {
      Lu.lastIndex = f;
      const h = Lu.exec(c);
      if (h) {
        const m = h[0], g = h[1], R = D.create(s, a + f), y = D.create(s, a + f + m.length);
        i.push({
          type: "tag",
          content: g,
          range: L.create(R, y)
        }), f += m.length, f = Ta(c, f);
      }
      if (f < c.length) {
        const m = c.substring(f), g = Array.from(m.matchAll(r$));
        i.push(...s$(g, m, s, a + f));
      }
    }
    s++, a = 0;
  }
  return i.length > 0 && i[i.length - 1].type === "break" ? i.slice(0, -1) : i;
}
function s$(t, e, n, r) {
  const i = [];
  if (t.length === 0) {
    const s = D.create(n, r), a = D.create(n, r + e.length);
    i.push({
      type: "text",
      content: e,
      range: L.create(s, a)
    });
  } else {
    let s = 0;
    for (const o of t) {
      const l = o.index, u = e.substring(s, l);
      u.length > 0 && i.push({
        type: "text",
        content: e.substring(s, l),
        range: L.create(D.create(n, s + r), D.create(n, l + r))
      });
      let c = u.length + 1;
      const f = o[1];
      if (i.push({
        type: "inline-tag",
        content: f,
        range: L.create(D.create(n, s + c + r), D.create(n, s + c + f.length + r))
      }), c += f.length, o.length === 4) {
        c += o[2].length;
        const d = o[3];
        i.push({
          type: "text",
          content: d,
          range: L.create(D.create(n, s + c + r), D.create(n, s + c + d.length + r))
        });
      } else
        i.push({
          type: "text",
          content: "",
          range: L.create(D.create(n, s + c + r), D.create(n, s + c + r))
        });
      s = l + o[0].length;
    }
    const a = e.substring(s);
    a.length > 0 && i.push({
      type: "text",
      content: a,
      range: L.create(D.create(n, s + r), D.create(n, s + r + a.length))
    });
  }
  return i;
}
const a$ = /\S/, o$ = /\s*$/;
function Ta(t, e) {
  const n = t.substring(e).match(a$);
  return n ? e + n.index : t.length;
}
function l$(t) {
  const e = t.match(o$);
  if (e && typeof e.index == "number")
    return e.index;
}
function u$(t) {
  var e, n, r, i;
  const s = D.create(t.position.line, t.position.character);
  if (t.tokens.length === 0)
    return new Pu([], L.create(s, s));
  const a = [];
  for (; t.index < t.tokens.length; ) {
    const u = c$(t, a[a.length - 1]);
    u && a.push(u);
  }
  const o = (n = (e = a[0]) === null || e === void 0 ? void 0 : e.range.start) !== null && n !== void 0 ? n : s, l = (i = (r = a[a.length - 1]) === null || r === void 0 ? void 0 : r.range.end) !== null && i !== void 0 ? i : s;
  return new Pu(a, L.create(o, l));
}
function c$(t, e) {
  const n = t.tokens[t.index];
  if (n.type === "tag")
    return td(t, !1);
  if (n.type === "text" || n.type === "inline-tag")
    return ed(t);
  f$(n, e), t.index++;
}
function f$(t, e) {
  if (e) {
    const n = new rd("", t.range);
    "inlines" in e ? e.inlines.push(n) : e.content.inlines.push(n);
  }
}
function ed(t) {
  let e = t.tokens[t.index];
  const n = e;
  let r = e;
  const i = [];
  for (; e && e.type !== "break" && e.type !== "tag"; )
    i.push(d$(t)), r = e, e = t.tokens[t.index];
  return new va(i, L.create(n.range.start, r.range.end));
}
function d$(t) {
  return t.tokens[t.index].type === "inline-tag" ? td(t, !0) : nd(t);
}
function td(t, e) {
  const n = t.tokens[t.index++], r = n.content.substring(1), i = t.tokens[t.index];
  if (i?.type === "text")
    if (e) {
      const s = nd(t);
      return new $s(r, new va([s], s.range), e, L.create(n.range.start, s.range.end));
    } else {
      const s = ed(t);
      return new $s(r, s, e, L.create(n.range.start, s.range.end));
    }
  else {
    const s = n.range;
    return new $s(r, new va([], s), e, s);
  }
}
function nd(t) {
  const e = t.tokens[t.index++];
  return new rd(e.content, e.range);
}
function ao(t) {
  if (!t)
    return ao({
      start: "/**",
      end: "*/",
      line: "*"
    });
  const { start: e, end: n, line: r } = t;
  return {
    start: Es(e, !0),
    end: Es(n, !1),
    line: Es(r, !0)
  };
}
function Es(t, e) {
  if (typeof t == "string" || typeof t == "object") {
    const n = typeof t == "string" ? bi(t) : t.source;
    return e ? new RegExp(`^\\s*${n}`) : new RegExp(`\\s*${n}\\s*$`);
  } else
    return t;
}
class Pu {
  constructor(e, n) {
    this.elements = e, this.range = n;
  }
  getTag(e) {
    return this.getAllTags().find((n) => n.name === e);
  }
  getTags(e) {
    return this.getAllTags().filter((n) => n.name === e);
  }
  getAllTags() {
    return this.elements.filter((e) => "name" in e);
  }
  toString() {
    let e = "";
    for (const n of this.elements)
      if (e.length === 0)
        e = n.toString();
      else {
        const r = n.toString();
        e += Mu(e) + r;
      }
    return e.trim();
  }
  toMarkdown(e) {
    let n = "";
    for (const r of this.elements)
      if (n.length === 0)
        n = r.toMarkdown(e);
      else {
        const i = r.toMarkdown(e);
        n += Mu(n) + i;
      }
    return n.trim();
  }
}
class $s {
  constructor(e, n, r, i) {
    this.name = e, this.content = n, this.inline = r, this.range = i;
  }
  toString() {
    let e = `@${this.name}`;
    const n = this.content.toString();
    return this.content.inlines.length === 1 ? e = `${e} ${n}` : this.content.inlines.length > 1 && (e = `${e}
${n}`), this.inline ? `{${e}}` : e;
  }
  toMarkdown(e) {
    var n, r;
    return (r = (n = e?.renderTag) === null || n === void 0 ? void 0 : n.call(e, this)) !== null && r !== void 0 ? r : this.toMarkdownDefault(e);
  }
  toMarkdownDefault(e) {
    const n = this.content.toMarkdown(e);
    if (this.inline) {
      const s = h$(this.name, n, e ?? {});
      if (typeof s == "string")
        return s;
    }
    let r = "";
    e?.tag === "italic" || e?.tag === void 0 ? r = "*" : e?.tag === "bold" ? r = "**" : e?.tag === "bold-italic" && (r = "***");
    let i = `${r}@${this.name}${r}`;
    return this.content.inlines.length === 1 ? i = `${i} — ${n}` : this.content.inlines.length > 1 && (i = `${i}
${n}`), this.inline ? `{${i}}` : i;
  }
}
function h$(t, e, n) {
  var r, i;
  if (t === "linkplain" || t === "linkcode" || t === "link") {
    const s = e.indexOf(" ");
    let a = e;
    if (s > 0) {
      const l = Ta(e, s);
      a = e.substring(l), e = e.substring(0, s);
    }
    return (t === "linkcode" || t === "link" && n.link === "code") && (a = `\`${a}\``), (i = (r = n.renderLink) === null || r === void 0 ? void 0 : r.call(n, e, a)) !== null && i !== void 0 ? i : p$(e, a);
  }
}
function p$(t, e) {
  try {
    return Ft.parse(t, !0), `[${e}](${t})`;
  } catch {
    return t;
  }
}
class va {
  constructor(e, n) {
    this.inlines = e, this.range = n;
  }
  toString() {
    let e = "";
    for (let n = 0; n < this.inlines.length; n++) {
      const r = this.inlines[n], i = this.inlines[n + 1];
      e += r.toString(), i && i.range.start.line > r.range.start.line && (e += `
`);
    }
    return e;
  }
  toMarkdown(e) {
    let n = "";
    for (let r = 0; r < this.inlines.length; r++) {
      const i = this.inlines[r], s = this.inlines[r + 1];
      n += i.toMarkdown(e), s && s.range.start.line > i.range.start.line && (n += `
`);
    }
    return n;
  }
}
class rd {
  constructor(e, n) {
    this.text = e, this.range = n;
  }
  toString() {
    return this.text;
  }
  toMarkdown() {
    return this.text;
  }
}
function Mu(t) {
  return t.endsWith(`
`) ? `
` : `

`;
}
class m$ {
  constructor(e) {
    this.indexManager = e.shared.workspace.IndexManager, this.commentProvider = e.documentation.CommentProvider;
  }
  getDocumentation(e) {
    const n = this.commentProvider.getComment(e);
    if (n && n$(n))
      return t$(n).toMarkdown({
        renderLink: (i, s) => this.documentationLinkRenderer(e, i, s),
        renderTag: (i) => this.documentationTagRenderer(e, i)
      });
  }
  documentationLinkRenderer(e, n, r) {
    var i;
    const s = (i = this.findNameInPrecomputedScopes(e, n)) !== null && i !== void 0 ? i : this.findNameInGlobalScope(e, n);
    if (s && s.nameSegment) {
      const a = s.nameSegment.range.start.line + 1, o = s.nameSegment.range.start.character + 1, l = s.documentUri.with({ fragment: `L${a},${o}` });
      return `[${r}](${l.toString()})`;
    } else
      return;
  }
  documentationTagRenderer(e, n) {
  }
  findNameInPrecomputedScopes(e, n) {
    const i = pt(e).precomputedScopes;
    if (!i)
      return;
    let s = e;
    do {
      const o = i.get(s).find((l) => l.name === n);
      if (o)
        return o;
      s = s.$container;
    } while (s);
  }
  findNameInGlobalScope(e, n) {
    return this.indexManager.allElements().find((i) => i.name === n);
  }
}
class g$ {
  constructor(e) {
    this.grammarConfig = () => e.parser.GrammarConfig;
  }
  getComment(e) {
    var n;
    return ME(e) ? e.$comment : (n = Fd(e.$cstNode, this.grammarConfig().multilineCommentRules)) === null || n === void 0 ? void 0 : n.text;
  }
}
class y$ {
  constructor(e) {
    this.syncParser = e.parser.LangiumParser;
  }
  parse(e, n) {
    return Promise.resolve(this.syncParser.parse(e));
  }
}
class T$ {
  constructor() {
    this.previousTokenSource = new V.CancellationTokenSource(), this.writeQueue = [], this.readQueue = [], this.done = !0;
  }
  write(e) {
    this.cancelWrite();
    const n = EE();
    return this.previousTokenSource = n, this.enqueue(this.writeQueue, e, n.token);
  }
  read(e) {
    return this.enqueue(this.readQueue, e);
  }
  enqueue(e, n, r = V.CancellationToken.None) {
    const i = new so(), s = {
      action: n,
      deferred: i,
      cancellationToken: r
    };
    return e.push(s), this.performNextOperation(), i.promise;
  }
  async performNextOperation() {
    if (!this.done)
      return;
    const e = [];
    if (this.writeQueue.length > 0)
      e.push(this.writeQueue.shift());
    else if (this.readQueue.length > 0)
      e.push(...this.readQueue.splice(0, this.readQueue.length));
    else
      return;
    this.done = !1, await Promise.all(e.map(async ({ action: n, deferred: r, cancellationToken: i }) => {
      try {
        const s = await Promise.resolve().then(() => n(i));
        r.resolve(s);
      } catch (s) {
        Zi(s) ? r.resolve(void 0) : r.reject(s);
      }
    })), this.done = !0, this.performNextOperation();
  }
  cancelWrite() {
    this.previousTokenSource.cancel();
  }
}
class v$ {
  constructor(e) {
    this.grammarElementIdMap = new Nu(), this.tokenTypeIdMap = new Nu(), this.grammar = e.Grammar, this.lexer = e.parser.Lexer, this.linker = e.references.Linker;
  }
  dehydrate(e) {
    return {
      lexerErrors: e.lexerErrors,
      lexerReport: e.lexerReport ? this.dehydrateLexerReport(e.lexerReport) : void 0,
      // We need to create shallow copies of the errors
      // The original errors inherit from the `Error` class, which is not transferable across worker threads
      parserErrors: e.parserErrors.map((n) => Object.assign(Object.assign({}, n), { message: n.message })),
      value: this.dehydrateAstNode(e.value, this.createDehyrationContext(e.value))
    };
  }
  dehydrateLexerReport(e) {
    return e;
  }
  createDehyrationContext(e) {
    const n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
    for (const i of Xt(e))
      n.set(i, {});
    if (e.$cstNode)
      for (const i of Ps(e.$cstNode))
        r.set(i, {});
    return {
      astNodes: n,
      cstNodes: r
    };
  }
  dehydrateAstNode(e, n) {
    const r = n.astNodes.get(e);
    r.$type = e.$type, r.$containerIndex = e.$containerIndex, r.$containerProperty = e.$containerProperty, e.$cstNode !== void 0 && (r.$cstNode = this.dehydrateCstNode(e.$cstNode, n));
    for (const [i, s] of Object.entries(e))
      if (!i.startsWith("$"))
        if (Array.isArray(s)) {
          const a = [];
          r[i] = a;
          for (const o of s)
            le(o) ? a.push(this.dehydrateAstNode(o, n)) : ze(o) ? a.push(this.dehydrateReference(o, n)) : a.push(o);
        } else le(s) ? r[i] = this.dehydrateAstNode(s, n) : ze(s) ? r[i] = this.dehydrateReference(s, n) : s !== void 0 && (r[i] = s);
    return r;
  }
  dehydrateReference(e, n) {
    const r = {};
    return r.$refText = e.$refText, e.$refNode && (r.$refNode = n.cstNodes.get(e.$refNode)), r;
  }
  dehydrateCstNode(e, n) {
    const r = n.cstNodes.get(e);
    return Xu(e) ? r.fullText = e.fullText : r.grammarSource = this.getGrammarElementId(e.grammarSource), r.hidden = e.hidden, r.astNode = n.astNodes.get(e.astNode), er(e) ? r.content = e.content.map((i) => this.dehydrateCstNode(i, n)) : Yu(e) && (r.tokenType = e.tokenType.name, r.offset = e.offset, r.length = e.length, r.startLine = e.range.start.line, r.startColumn = e.range.start.character, r.endLine = e.range.end.line, r.endColumn = e.range.end.character), r;
  }
  hydrate(e) {
    const n = e.value, r = this.createHydrationContext(n);
    return "$cstNode" in n && this.hydrateCstNode(n.$cstNode, r), {
      lexerErrors: e.lexerErrors,
      lexerReport: e.lexerReport,
      parserErrors: e.parserErrors,
      value: this.hydrateAstNode(n, r)
    };
  }
  createHydrationContext(e) {
    const n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
    for (const s of Xt(e))
      n.set(s, {});
    let i;
    if (e.$cstNode)
      for (const s of Ps(e.$cstNode)) {
        let a;
        "fullText" in s ? (a = new Mf(s.fullText), i = a) : "content" in s ? a = new ro() : "tokenType" in s && (a = this.hydrateCstLeafNode(s)), a && (r.set(s, a), a.root = i);
      }
    return {
      astNodes: n,
      cstNodes: r
    };
  }
  hydrateAstNode(e, n) {
    const r = n.astNodes.get(e);
    r.$type = e.$type, r.$containerIndex = e.$containerIndex, r.$containerProperty = e.$containerProperty, e.$cstNode && (r.$cstNode = n.cstNodes.get(e.$cstNode));
    for (const [i, s] of Object.entries(e))
      if (!i.startsWith("$"))
        if (Array.isArray(s)) {
          const a = [];
          r[i] = a;
          for (const o of s)
            le(o) ? a.push(this.setParent(this.hydrateAstNode(o, n), r)) : ze(o) ? a.push(this.hydrateReference(o, r, i, n)) : a.push(o);
        } else le(s) ? r[i] = this.setParent(this.hydrateAstNode(s, n), r) : ze(s) ? r[i] = this.hydrateReference(s, r, i, n) : s !== void 0 && (r[i] = s);
    return r;
  }
  setParent(e, n) {
    return e.$container = n, e;
  }
  hydrateReference(e, n, r, i) {
    return this.linker.buildReference(n, r, i.cstNodes.get(e.$refNode), e.$refText);
  }
  hydrateCstNode(e, n, r = 0) {
    const i = n.cstNodes.get(e);
    if (typeof e.grammarSource == "number" && (i.grammarSource = this.getGrammarElement(e.grammarSource)), i.astNode = n.astNodes.get(e.astNode), er(i))
      for (const s of e.content) {
        const a = this.hydrateCstNode(s, n, r++);
        i.content.push(a);
      }
    return i;
  }
  hydrateCstLeafNode(e) {
    const n = this.getTokenType(e.tokenType), r = e.offset, i = e.length, s = e.startLine, a = e.startColumn, o = e.endLine, l = e.endColumn, u = e.hidden;
    return new ha(r, i, {
      start: {
        line: s,
        character: a
      },
      end: {
        line: o,
        character: l
      }
    }, n, u);
  }
  getTokenType(e) {
    return this.lexer.definition[e];
  }
  getGrammarElementId(e) {
    if (e)
      return this.grammarElementIdMap.size === 0 && this.createGrammarElementIdMap(), this.grammarElementIdMap.get(e);
  }
  getGrammarElement(e) {
    return this.grammarElementIdMap.size === 0 && this.createGrammarElementIdMap(), this.grammarElementIdMap.getKey(e);
  }
  createGrammarElementIdMap() {
    let e = 0;
    for (const n of Xt(this.grammar))
      Ud(n) && this.grammarElementIdMap.set(n, e++);
  }
}
function $t(t) {
  return {
    documentation: {
      CommentProvider: (e) => new g$(e),
      DocumentationProvider: (e) => new m$(e)
    },
    parser: {
      AsyncParser: (e) => new y$(e),
      GrammarConfig: (e) => _h(e),
      LangiumParser: (e) => gE(e),
      CompletionParser: (e) => mE(e),
      ValueConverter: () => new Vf(),
      TokenBuilder: () => new Hf(),
      Lexer: (e) => new QE(e),
      ParserErrorMessageProvider: () => new Gf(),
      LexerErrorMessageProvider: () => new JE()
    },
    workspace: {
      AstNodeLocator: () => new VE(),
      AstNodeDescriptionProvider: (e) => new KE(e),
      ReferenceDescriptionProvider: (e) => new HE(e)
    },
    references: {
      Linker: (e) => new kE(e),
      NameProvider: () => new CE(),
      ScopeProvider: (e) => new PE(e),
      ScopeComputation: (e) => new NE(e),
      References: (e) => new wE(e)
    },
    serializer: {
      Hydrator: (e) => new v$(e),
      JsonSerializer: (e) => new DE(e)
    },
    validation: {
      DocumentValidator: (e) => new UE(e),
      ValidationRegistry: (e) => new GE(e)
    },
    shared: () => t.shared
  };
}
function xt(t) {
  return {
    ServiceRegistry: (e) => new FE(e),
    workspace: {
      LangiumDocuments: (e) => new SE(e),
      LangiumDocumentFactory: (e) => new xE(e),
      DocumentBuilder: (e) => new qE(e),
      IndexManager: (e) => new YE(e),
      WorkspaceManager: (e) => new XE(e),
      FileSystemProvider: (e) => t.fileSystemProvider(e),
      WorkspaceLock: () => new T$(),
      ConfigurationProvider: (e) => new zE(e)
    }
  };
}
var Du;
(function(t) {
  t.merge = (e, n) => Ci(Ci({}, e), n);
})(Du || (Du = {}));
function ue(t, e, n, r, i, s, a, o, l) {
  const u = [t, e, n, r, i, s, a, o, l].reduce(Ci, {});
  return id(u);
}
const R$ = /* @__PURE__ */ Symbol("isProxy");
function id(t, e) {
  const n = new Proxy({}, {
    deleteProperty: () => !1,
    set: () => {
      throw new Error("Cannot set property on injected service container");
    },
    get: (r, i) => i === R$ ? !0 : Gu(r, i, t, e || n),
    getOwnPropertyDescriptor: (r, i) => (Gu(r, i, t, e || n), Object.getOwnPropertyDescriptor(r, i)),
    // used by for..in
    has: (r, i) => i in t,
    // used by ..in..
    ownKeys: () => [...Object.getOwnPropertyNames(t)]
    // used by for..in
  });
  return n;
}
const Fu = /* @__PURE__ */ Symbol();
function Gu(t, e, n, r) {
  if (e in t) {
    if (t[e] instanceof Error)
      throw new Error("Construction failure. Please make sure that your dependencies are constructable.", { cause: t[e] });
    if (t[e] === Fu)
      throw new Error('Cycle detected. Please make "' + String(e) + '" lazy. Visit https://langium.org/docs/reference/configuration-services/#resolving-cyclic-dependencies');
    return t[e];
  } else if (e in n) {
    const i = n[e];
    t[e] = Fu;
    try {
      t[e] = typeof i == "function" ? i(r) : id(i, r);
    } catch (s) {
      throw t[e] = s instanceof Error ? s : void 0, s;
    }
    return t[e];
  } else
    return;
}
function Ci(t, e) {
  if (e) {
    for (const [n, r] of Object.entries(e))
      if (r !== void 0) {
        const i = t[n];
        i !== null && r !== null && typeof i == "object" && typeof r == "object" ? t[n] = Ci(i, r) : t[n] = r;
      }
  }
  return t;
}
class A$ {
  readFile() {
    throw new Error("No file system is available.");
  }
  async readDirectory() {
    return [];
  }
}
const St = {
  fileSystemProvider: () => new A$()
}, E$ = {
  Grammar: () => {
  },
  LanguageMetaData: () => ({
    caseInsensitive: !1,
    fileExtensions: [".langium"],
    languageId: "langium"
  })
}, $$ = {
  AstReflection: () => new rc()
};
function x$() {
  const t = ue(xt(St), $$), e = ue($t({ shared: t }), E$);
  return t.ServiceRegistry.register(e), e;
}
function Ht(t) {
  var e;
  const n = x$(), r = n.serializer.JsonSerializer.deserialize(t);
  return n.shared.workspace.LangiumDocumentFactory.fromModel(r, Ft.parse(`memory://${(e = r.name) !== null && e !== void 0 ? e : "grammar"}.langium`)), r;
}
var S$ = Object.defineProperty, A = (t, e) => S$(t, "name", { value: e, configurable: !0 }), Uu = "Statement", Jr = "Architecture";
function k$(t) {
  return He.isInstance(t, Jr);
}
A(k$, "isArchitecture");
var Pr = "Axis", qn = "Branch";
function I$(t) {
  return He.isInstance(t, qn);
}
A(I$, "isBranch");
var Mr = "Checkout", Dr = "CherryPicking", xs = "ClassDefStatement", Yn = "Commit";
function C$(t) {
  return He.isInstance(t, Yn);
}
A(C$, "isCommit");
var Ss = "Curve", ks = "Edge", Is = "Entry", Xn = "GitGraph";
function w$(t) {
  return He.isInstance(t, Xn);
}
A(w$, "isGitGraph");
var Cs = "Group", Zr = "Info";
function N$(t) {
  return He.isInstance(t, Zr);
}
A(N$, "isInfo");
var Fr = "Item", ws = "Junction", Jn = "Merge";
function _$(t) {
  return He.isInstance(t, Jn);
}
A(_$, "isMerge");
var Ns = "Option", Qr = "Packet";
function b$(t) {
  return He.isInstance(t, Qr);
}
A(b$, "isPacket");
var ei = "PacketBlock";
function O$(t) {
  return He.isInstance(t, ei);
}
A(O$, "isPacketBlock");
var ti = "Pie";
function L$(t) {
  return He.isInstance(t, ti);
}
A(L$, "isPie");
var ni = "PieSection";
function P$(t) {
  return He.isInstance(t, ni);
}
A(P$, "isPieSection");
var _s = "Radar", bs = "Service", ri = "Treemap";
function M$(t) {
  return He.isInstance(t, ri);
}
A(M$, "isTreemap");
var Os = "TreemapRow", Gr = "Direction", Ur = "Leaf", Br = "Section", sd = class extends qu {
  static {
    A(this, "MermaidAstReflection");
  }
  getAllTypes() {
    return [Jr, Pr, qn, Mr, Dr, xs, Yn, Ss, Gr, ks, Is, Xn, Cs, Zr, Fr, ws, Ur, Jn, Ns, Qr, ei, ti, ni, _s, Br, bs, Uu, ri, Os];
  }
  computeIsSubtype(t, e) {
    switch (t) {
      case qn:
      case Mr:
      case Dr:
      case Yn:
      case Jn:
        return this.isSubtype(Uu, e);
      case Gr:
        return this.isSubtype(Xn, e);
      case Ur:
      case Br:
        return this.isSubtype(Fr, e);
      default:
        return !1;
    }
  }
  getReferenceType(t) {
    const e = `${t.container.$type}:${t.property}`;
    if (e === "Entry:axis")
      return Pr;
    throw new Error(`${e} is not a valid reference id.`);
  }
  getTypeMetaData(t) {
    switch (t) {
      case Jr:
        return {
          name: Jr,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "edges", defaultValue: [] },
            { name: "groups", defaultValue: [] },
            { name: "junctions", defaultValue: [] },
            { name: "services", defaultValue: [] },
            { name: "title" }
          ]
        };
      case Pr:
        return {
          name: Pr,
          properties: [
            { name: "label" },
            { name: "name" }
          ]
        };
      case qn:
        return {
          name: qn,
          properties: [
            { name: "name" },
            { name: "order" }
          ]
        };
      case Mr:
        return {
          name: Mr,
          properties: [
            { name: "branch" }
          ]
        };
      case Dr:
        return {
          name: Dr,
          properties: [
            { name: "id" },
            { name: "parent" },
            { name: "tags", defaultValue: [] }
          ]
        };
      case xs:
        return {
          name: xs,
          properties: [
            { name: "className" },
            { name: "styleText" }
          ]
        };
      case Yn:
        return {
          name: Yn,
          properties: [
            { name: "id" },
            { name: "message" },
            { name: "tags", defaultValue: [] },
            { name: "type" }
          ]
        };
      case Ss:
        return {
          name: Ss,
          properties: [
            { name: "entries", defaultValue: [] },
            { name: "label" },
            { name: "name" }
          ]
        };
      case ks:
        return {
          name: ks,
          properties: [
            { name: "lhsDir" },
            { name: "lhsGroup", defaultValue: !1 },
            { name: "lhsId" },
            { name: "lhsInto", defaultValue: !1 },
            { name: "rhsDir" },
            { name: "rhsGroup", defaultValue: !1 },
            { name: "rhsId" },
            { name: "rhsInto", defaultValue: !1 },
            { name: "title" }
          ]
        };
      case Is:
        return {
          name: Is,
          properties: [
            { name: "axis" },
            { name: "value" }
          ]
        };
      case Xn:
        return {
          name: Xn,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "statements", defaultValue: [] },
            { name: "title" }
          ]
        };
      case Cs:
        return {
          name: Cs,
          properties: [
            { name: "icon" },
            { name: "id" },
            { name: "in" },
            { name: "title" }
          ]
        };
      case Zr:
        return {
          name: Zr,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "title" }
          ]
        };
      case Fr:
        return {
          name: Fr,
          properties: [
            { name: "classSelector" },
            { name: "name" }
          ]
        };
      case ws:
        return {
          name: ws,
          properties: [
            { name: "id" },
            { name: "in" }
          ]
        };
      case Jn:
        return {
          name: Jn,
          properties: [
            { name: "branch" },
            { name: "id" },
            { name: "tags", defaultValue: [] },
            { name: "type" }
          ]
        };
      case Ns:
        return {
          name: Ns,
          properties: [
            { name: "name" },
            { name: "value", defaultValue: !1 }
          ]
        };
      case Qr:
        return {
          name: Qr,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "blocks", defaultValue: [] },
            { name: "title" }
          ]
        };
      case ei:
        return {
          name: ei,
          properties: [
            { name: "bits" },
            { name: "end" },
            { name: "label" },
            { name: "start" }
          ]
        };
      case ti:
        return {
          name: ti,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "sections", defaultValue: [] },
            { name: "showData", defaultValue: !1 },
            { name: "title" }
          ]
        };
      case ni:
        return {
          name: ni,
          properties: [
            { name: "label" },
            { name: "value" }
          ]
        };
      case _s:
        return {
          name: _s,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "axes", defaultValue: [] },
            { name: "curves", defaultValue: [] },
            { name: "options", defaultValue: [] },
            { name: "title" }
          ]
        };
      case bs:
        return {
          name: bs,
          properties: [
            { name: "icon" },
            { name: "iconText" },
            { name: "id" },
            { name: "in" },
            { name: "title" }
          ]
        };
      case ri:
        return {
          name: ri,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "title" },
            { name: "TreemapRows", defaultValue: [] }
          ]
        };
      case Os:
        return {
          name: Os,
          properties: [
            { name: "indent" },
            { name: "item" }
          ]
        };
      case Gr:
        return {
          name: Gr,
          properties: [
            { name: "accDescr" },
            { name: "accTitle" },
            { name: "dir" },
            { name: "statements", defaultValue: [] },
            { name: "title" }
          ]
        };
      case Ur:
        return {
          name: Ur,
          properties: [
            { name: "classSelector" },
            { name: "name" },
            { name: "value" }
          ]
        };
      case Br:
        return {
          name: Br,
          properties: [
            { name: "classSelector" },
            { name: "name" }
          ]
        };
      default:
        return {
          name: t,
          properties: []
        };
    }
  }
}, He = new sd(), Bu, D$ = /* @__PURE__ */ A(() => Bu ?? (Bu = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Info","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"Info","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[],"cardinality":"*"},{"$type":"Keyword","value":"info"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[],"cardinality":"*"},{"$type":"Group","elements":[{"$type":"Keyword","value":"showInfo"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[],"cardinality":"*"}],"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[],"cardinality":"?"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@7"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@8"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false}],"definesHiddenTokens":false,"hiddenTokens":[],"interfaces":[],"types":[],"usedGrammars":[]}`)), "InfoGrammar"), ju, F$ = /* @__PURE__ */ A(() => ju ?? (ju = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Packet","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"Packet","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[],"cardinality":"*"},{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"packet"},{"$type":"Keyword","value":"packet-beta"}]},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]},{"$type":"Assignment","feature":"blocks","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[]}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"PacketBlock","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"Assignment","feature":"start","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":"-"},{"$type":"Assignment","feature":"end","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}}],"cardinality":"?"}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"+"},{"$type":"Assignment","feature":"bits","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}}]}]},{"$type":"Keyword","value":":"},{"$type":"Assignment","feature":"label","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@11"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@8"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@9"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false}],"definesHiddenTokens":false,"hiddenTokens":[],"interfaces":[],"types":[],"usedGrammars":[]}`)), "PacketGrammar"), Ku, G$ = /* @__PURE__ */ A(() => Ku ?? (Ku = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Pie","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"Pie","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@16"},"arguments":[],"cardinality":"*"},{"$type":"Keyword","value":"pie"},{"$type":"Assignment","feature":"showData","operator":"?=","terminal":{"$type":"Keyword","value":"showData"},"cardinality":"?"},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]},{"$type":"Assignment","feature":"sections","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@16"},"arguments":[]}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"PieSection","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"label","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@14"},"arguments":[]}},{"$type":"Keyword","value":":"},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"FLOAT_PIE","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/-?[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT_PIE","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/-?(0|[1-9][0-9]*)(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER_PIE","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@2"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@3"}}]},"fragment":false,"hidden":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@16"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@10"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@11"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@12"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false}],"definesHiddenTokens":false,"hiddenTokens":[],"interfaces":[],"types":[],"usedGrammars":[]}`)), "PieGrammar"), Hu, U$ = /* @__PURE__ */ A(() => Hu ?? (Hu = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Architecture","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"Architecture","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@23"},"arguments":[],"cardinality":"*"},{"$type":"Keyword","value":"architecture-beta"},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@23"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[]}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"Statement","definition":{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"groups","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}},{"$type":"Assignment","feature":"services","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]}},{"$type":"Assignment","feature":"junctions","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]}},{"$type":"Assignment","feature":"edges","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"LeftPort","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":":"},{"$type":"Assignment","feature":"lhsDir","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"RightPort","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"rhsDir","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}},{"$type":"Keyword","value":":"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"Arrow","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]},{"$type":"Assignment","feature":"lhsInto","operator":"?=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@11"},"arguments":[]},"cardinality":"?"},{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"--"},{"$type":"Group","elements":[{"$type":"Keyword","value":"-"},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@29"},"arguments":[]}},{"$type":"Keyword","value":"-"}]}]},{"$type":"Assignment","feature":"rhsInto","operator":"?=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@11"},"arguments":[]},"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Group","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"group"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Assignment","feature":"icon","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@28"},"arguments":[]},"cardinality":"?"},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@29"},"arguments":[]},"cardinality":"?"},{"$type":"Group","elements":[{"$type":"Keyword","value":"in"},{"$type":"Assignment","feature":"in","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}}],"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Service","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"service"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"iconText","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@21"},"arguments":[]}},{"$type":"Assignment","feature":"icon","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@28"},"arguments":[]}}],"cardinality":"?"},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@29"},"arguments":[]},"cardinality":"?"},{"$type":"Group","elements":[{"$type":"Keyword","value":"in"},{"$type":"Assignment","feature":"in","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}}],"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Junction","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"junction"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":"in"},{"$type":"Assignment","feature":"in","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}}],"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Edge","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"lhsId","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Assignment","feature":"lhsGroup","operator":"?=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@10"},"arguments":[]},"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]},{"$type":"Assignment","feature":"rhsId","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Assignment","feature":"rhsGroup","operator":"?=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@10"},"arguments":[]},"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"ARROW_DIRECTION","definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"L"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"R"}}]},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"T"}}]},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"B"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ARROW_GROUP","definition":{"$type":"RegexToken","regex":"/\\\\{group\\\\}/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ARROW_INTO","definition":{"$type":"RegexToken","regex":"/<|>/"},"fragment":false,"hidden":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@23"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@15"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@16"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@18"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@19"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false},{"$type":"TerminalRule","name":"ARCH_ICON","definition":{"$type":"RegexToken","regex":"/\\\\([\\\\w-:]+\\\\)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ARCH_TITLE","definition":{"$type":"RegexToken","regex":"/\\\\[[\\\\w ]+\\\\]/"},"fragment":false,"hidden":false}],"definesHiddenTokens":false,"hiddenTokens":[],"interfaces":[],"types":[],"usedGrammars":[]}`)), "ArchitectureGrammar"), Vu, B$ = /* @__PURE__ */ A(() => Vu ?? (Vu = Ht(`{"$type":"Grammar","isDeclared":true,"name":"GitGraph","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"GitGraph","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[],"cardinality":"*"},{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"gitGraph"},{"$type":"Group","elements":[{"$type":"Keyword","value":"gitGraph"},{"$type":"Keyword","value":":"}]},{"$type":"Keyword","value":"gitGraph:"},{"$type":"Group","elements":[{"$type":"Keyword","value":"gitGraph"},{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]},{"$type":"Keyword","value":":"}]}]},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]},{"$type":"Assignment","feature":"statements","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[]}}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Statement","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Direction","definition":{"$type":"Assignment","feature":"dir","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"LR"},{"$type":"Keyword","value":"TB"},{"$type":"Keyword","value":"BT"}]}},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Commit","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"commit"},{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"Keyword","value":"id:"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"msg:","cardinality":"?"},{"$type":"Assignment","feature":"message","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"tag:"},{"$type":"Assignment","feature":"tags","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"type:"},{"$type":"Assignment","feature":"type","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"NORMAL"},{"$type":"Keyword","value":"REVERSE"},{"$type":"Keyword","value":"HIGHLIGHT"}]}}]}],"cardinality":"*"},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Branch","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"branch"},{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@24"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}]}},{"$type":"Group","elements":[{"$type":"Keyword","value":"order:"},{"$type":"Assignment","feature":"order","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@15"},"arguments":[]}}],"cardinality":"?"},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Merge","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"merge"},{"$type":"Assignment","feature":"branch","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@24"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}]}},{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"Keyword","value":"id:"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"tag:"},{"$type":"Assignment","feature":"tags","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"type:"},{"$type":"Assignment","feature":"type","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"NORMAL"},{"$type":"Keyword","value":"REVERSE"},{"$type":"Keyword","value":"HIGHLIGHT"}]}}]}],"cardinality":"*"},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Checkout","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"checkout"},{"$type":"Keyword","value":"switch"}]},{"$type":"Assignment","feature":"branch","operator":"=","terminal":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@24"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"CherryPicking","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"cherry-pick"},{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"Keyword","value":"id:"},{"$type":"Assignment","feature":"id","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"tag:"},{"$type":"Assignment","feature":"tags","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"parent:"},{"$type":"Assignment","feature":"parent","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]}],"cardinality":"*"},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@11"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@14"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@15"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false},{"$type":"TerminalRule","name":"REFERENCE","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\\\w([-\\\\./\\\\w]*[-\\\\w])?/"},"fragment":false,"hidden":false}],"definesHiddenTokens":false,"hiddenTokens":[],"interfaces":[],"types":[],"usedGrammars":[]}`)), "GitGraphGrammar"), Wu, j$ = /* @__PURE__ */ A(() => Wu ?? (Wu = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Radar","imports":[],"rules":[{"$type":"ParserRule","entry":true,"name":"Radar","definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Alternatives","elements":[{"$type":"Keyword","value":"radar-beta"},{"$type":"Keyword","value":"radar-beta:"},{"$type":"Group","elements":[{"$type":"Keyword","value":"radar-beta"},{"$type":"Keyword","value":":"}]}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@10"},"arguments":[]},{"$type":"Group","elements":[{"$type":"Keyword","value":"axis"},{"$type":"Assignment","feature":"axes","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":","},{"$type":"Assignment","feature":"axes","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]}}],"cardinality":"*"}]},{"$type":"Group","elements":[{"$type":"Keyword","value":"curve"},{"$type":"Assignment","feature":"curves","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":","},{"$type":"Assignment","feature":"curves","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]}}],"cardinality":"*"}]},{"$type":"Group","elements":[{"$type":"Assignment","feature":"options","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":","},{"$type":"Assignment","feature":"options","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]}}],"cardinality":"*"}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[]}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"Label","definition":{"$type":"Group","elements":[{"$type":"Keyword","value":"["},{"$type":"Assignment","feature":"label","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@18"},"arguments":[]}},{"$type":"Keyword","value":"]"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Axis","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[],"cardinality":"?"}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Curve","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@1"},"arguments":[],"cardinality":"?"},{"$type":"Keyword","value":"{"},{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]},{"$type":"Keyword","value":"}"}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"Entries","definition":{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Assignment","feature":"entries","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":","},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Assignment","feature":"entries","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]}}],"cardinality":"*"},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"}]},{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Assignment","feature":"entries","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"Keyword","value":","},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"},{"$type":"Assignment","feature":"entries","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@5"},"arguments":[]}}],"cardinality":"*"},{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"*"}]}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"DetailedEntry","returnType":{"$ref":"#/interfaces@0"},"definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"axis","operator":"=","terminal":{"$type":"CrossReference","type":{"$ref":"#/rules@2"},"terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[]},"deprecatedSyntax":false}},{"$type":"Keyword","value":":","cardinality":"?"},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"NumberEntry","returnType":{"$ref":"#/interfaces@0"},"definition":{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Option","definition":{"$type":"Alternatives","elements":[{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Keyword","value":"showLegend"}},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@11"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Keyword","value":"ticks"}},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Keyword","value":"max"}},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Keyword","value":"min"}},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}}]},{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"Keyword","value":"graticule"}},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]}}]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"GRATICULE","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"circle"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"polygon"}}]},"fragment":false,"hidden":false},{"$type":"ParserRule","fragment":true,"name":"EOL","dataType":"string","definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[],"cardinality":"+"},{"$type":"EndOfFile"}]},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Group","elements":[{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@12"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@13"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@14"},"arguments":[]}}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"FLOAT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/[0-9]+\\\\.[0-9]+(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"INT","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"RegexToken","regex":"/0|[1-9][0-9]*(?!\\\\.)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER","type":{"$type":"ReturnType","name":"number"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@15"}},{"$type":"TerminalRuleCall","rule":{"$ref":"#/rules@16"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STRING","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/\\"([^\\"\\\\\\\\]|\\\\\\\\.)*\\"|'([^'\\\\\\\\]|\\\\\\\\.)*'/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID","type":{"$type":"ReturnType","name":"string"},"definition":{"$type":"RegexToken","regex":"/[\\\\w]([-\\\\w]*\\\\w)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NEWLINE","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WHITESPACE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"YAML","definition":{"$type":"RegexToken","regex":"/---[\\\\t ]*\\\\r?\\\\n(?:[\\\\S\\\\s]*?\\\\r?\\\\n)?---(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"DIRECTIVE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%{[\\\\S\\\\s]*?}%%(?:\\\\r?\\\\n|(?!\\\\S))/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"SINGLE_LINE_COMMENT","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*%%[^\\\\n\\\\r]*/"},"fragment":false}],"interfaces":[{"$type":"Interface","name":"Entry","attributes":[{"$type":"TypeAttribute","name":"axis","isOptional":true,"type":{"$type":"ReferenceType","referenceType":{"$type":"SimpleType","typeRef":{"$ref":"#/rules@2"}}}},{"$type":"TypeAttribute","name":"value","type":{"$type":"SimpleType","primitiveType":"number"},"isOptional":false}],"superTypes":[]}],"definesHiddenTokens":false,"hiddenTokens":[],"types":[],"usedGrammars":[]}`)), "RadarGrammar"), zu, K$ = /* @__PURE__ */ A(() => zu ?? (zu = Ht(`{"$type":"Grammar","isDeclared":true,"name":"Treemap","rules":[{"$type":"ParserRule","fragment":true,"name":"TitleAndAccessibilities","definition":{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"accDescr","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@2"},"arguments":[]}},{"$type":"Assignment","feature":"accTitle","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@3"},"arguments":[]}},{"$type":"Assignment","feature":"title","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@4"},"arguments":[]}}],"cardinality":"+"},"definesHiddenTokens":false,"entry":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"BOOLEAN","type":{"$type":"ReturnType","name":"boolean"},"definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"true"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"false"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_DESCR","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accDescr(?:[\\\\t ]*:([^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)|\\\\s*{([^}]*)})/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ACC_TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*accTitle[\\\\t ]*:(?:[^\\\\n\\\\r]*?(?=%%)|[^\\\\n\\\\r]*)/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"TITLE","definition":{"$type":"RegexToken","regex":"/[\\\\t ]*title(?:[\\\\t ][^\\\\n\\\\r]*?(?=%%)|[\\\\t ][^\\\\n\\\\r]*|)/"},"fragment":false,"hidden":false},{"$type":"ParserRule","entry":true,"name":"Treemap","returnType":{"$ref":"#/interfaces@4"},"definition":{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@6"},"arguments":[]},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@0"},"arguments":[]},{"$type":"Assignment","feature":"TreemapRows","operator":"+=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@14"},"arguments":[]}}],"cardinality":"*"}]},"definesHiddenTokens":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"TREEMAP_KEYWORD","definition":{"$type":"TerminalAlternatives","elements":[{"$type":"CharacterRange","left":{"$type":"Keyword","value":"treemap-beta"}},{"$type":"CharacterRange","left":{"$type":"Keyword","value":"treemap"}}]},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"CLASS_DEF","definition":{"$type":"RegexToken","regex":"/classDef\\\\s+([a-zA-Z_][a-zA-Z0-9_]+)(?:\\\\s+([^;\\\\r\\\\n]*))?(?:;)?/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"STYLE_SEPARATOR","definition":{"$type":"CharacterRange","left":{"$type":"Keyword","value":":::"}},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"SEPARATOR","definition":{"$type":"CharacterRange","left":{"$type":"Keyword","value":":"}},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"COMMA","definition":{"$type":"CharacterRange","left":{"$type":"Keyword","value":","}},"fragment":false,"hidden":false},{"$type":"TerminalRule","hidden":true,"name":"WS","definition":{"$type":"RegexToken","regex":"/[ \\\\t]+/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"ML_COMMENT","definition":{"$type":"RegexToken","regex":"/\\\\%\\\\%[^\\\\n]*/"},"fragment":false},{"$type":"TerminalRule","hidden":true,"name":"NL","definition":{"$type":"RegexToken","regex":"/\\\\r?\\\\n/"},"fragment":false},{"$type":"ParserRule","name":"TreemapRow","definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"indent","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[]},"cardinality":"?"},{"$type":"Alternatives","elements":[{"$type":"Assignment","feature":"item","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@16"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@15"},"arguments":[]}]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"ClassDef","dataType":"string","definition":{"$type":"RuleCall","rule":{"$ref":"#/rules@7"},"arguments":[]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Item","returnType":{"$ref":"#/interfaces@0"},"definition":{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@18"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@17"},"arguments":[]}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Section","returnType":{"$ref":"#/interfaces@1"},"definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@23"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]},{"$type":"Assignment","feature":"classSelector","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[]}}],"cardinality":"?"}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"ParserRule","name":"Leaf","returnType":{"$ref":"#/interfaces@2"},"definition":{"$type":"Group","elements":[{"$type":"Assignment","feature":"name","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@23"},"arguments":[]}},{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[],"cardinality":"?"},{"$type":"Alternatives","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@9"},"arguments":[]},{"$type":"RuleCall","rule":{"$ref":"#/rules@10"},"arguments":[]}]},{"$type":"RuleCall","rule":{"$ref":"#/rules@19"},"arguments":[],"cardinality":"?"},{"$type":"Assignment","feature":"value","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@22"},"arguments":[]}},{"$type":"Group","elements":[{"$type":"RuleCall","rule":{"$ref":"#/rules@8"},"arguments":[]},{"$type":"Assignment","feature":"classSelector","operator":"=","terminal":{"$type":"RuleCall","rule":{"$ref":"#/rules@20"},"arguments":[]}}],"cardinality":"?"}]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"INDENTATION","definition":{"$type":"RegexToken","regex":"/[ \\\\t]{1,}/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"ID2","definition":{"$type":"RegexToken","regex":"/[a-zA-Z_][a-zA-Z0-9_]*/"},"fragment":false,"hidden":false},{"$type":"TerminalRule","name":"NUMBER2","definition":{"$type":"RegexToken","regex":"/[0-9_\\\\.\\\\,]+/"},"fragment":false,"hidden":false},{"$type":"ParserRule","name":"MyNumber","dataType":"number","definition":{"$type":"RuleCall","rule":{"$ref":"#/rules@21"},"arguments":[]},"definesHiddenTokens":false,"entry":false,"fragment":false,"hiddenTokens":[],"parameters":[],"wildcard":false},{"$type":"TerminalRule","name":"STRING2","definition":{"$type":"RegexToken","regex":"/\\"[^\\"]*\\"|'[^']*'/"},"fragment":false,"hidden":false}],"interfaces":[{"$type":"Interface","name":"Item","attributes":[{"$type":"TypeAttribute","name":"name","type":{"$type":"SimpleType","primitiveType":"string"},"isOptional":false},{"$type":"TypeAttribute","name":"classSelector","isOptional":true,"type":{"$type":"SimpleType","primitiveType":"string"}}],"superTypes":[]},{"$type":"Interface","name":"Section","superTypes":[{"$ref":"#/interfaces@0"}],"attributes":[]},{"$type":"Interface","name":"Leaf","superTypes":[{"$ref":"#/interfaces@0"}],"attributes":[{"$type":"TypeAttribute","name":"value","type":{"$type":"SimpleType","primitiveType":"number"},"isOptional":false}]},{"$type":"Interface","name":"ClassDefStatement","attributes":[{"$type":"TypeAttribute","name":"className","type":{"$type":"SimpleType","primitiveType":"string"},"isOptional":false},{"$type":"TypeAttribute","name":"styleText","type":{"$type":"SimpleType","primitiveType":"string"},"isOptional":false}],"superTypes":[]},{"$type":"Interface","name":"Treemap","attributes":[{"$type":"TypeAttribute","name":"TreemapRows","type":{"$type":"ArrayType","elementType":{"$type":"SimpleType","typeRef":{"$ref":"#/rules@14"}}},"isOptional":false},{"$type":"TypeAttribute","name":"title","isOptional":true,"type":{"$type":"SimpleType","primitiveType":"string"}},{"$type":"TypeAttribute","name":"accTitle","isOptional":true,"type":{"$type":"SimpleType","primitiveType":"string"}},{"$type":"TypeAttribute","name":"accDescr","isOptional":true,"type":{"$type":"SimpleType","primitiveType":"string"}}],"superTypes":[]}],"definesHiddenTokens":false,"hiddenTokens":[],"imports":[],"types":[],"usedGrammars":[],"$comment":"/**\\n * Treemap grammar for Langium\\n * Converted from mindmap grammar\\n *\\n * The ML_COMMENT and NL hidden terminals handle whitespace, comments, and newlines\\n * before the treemap keyword, allowing for empty lines and comments before the\\n * treemap declaration.\\n */"}`)), "TreemapGrammar"), H$ = {
  languageId: "info",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, V$ = {
  languageId: "packet",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, W$ = {
  languageId: "pie",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, z$ = {
  languageId: "architecture",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, q$ = {
  languageId: "gitGraph",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, Y$ = {
  languageId: "radar",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, X$ = {
  languageId: "treemap",
  fileExtensions: [".mmd", ".mermaid"],
  caseInsensitive: !1,
  mode: "production"
}, Vt = {
  AstReflection: /* @__PURE__ */ A(() => new sd(), "AstReflection")
}, J$ = {
  Grammar: /* @__PURE__ */ A(() => D$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => H$, "LanguageMetaData"),
  parser: {}
}, Z$ = {
  Grammar: /* @__PURE__ */ A(() => F$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => V$, "LanguageMetaData"),
  parser: {}
}, Q$ = {
  Grammar: /* @__PURE__ */ A(() => G$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => W$, "LanguageMetaData"),
  parser: {}
}, ex = {
  Grammar: /* @__PURE__ */ A(() => U$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => z$, "LanguageMetaData"),
  parser: {}
}, tx = {
  Grammar: /* @__PURE__ */ A(() => B$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => q$, "LanguageMetaData"),
  parser: {}
}, nx = {
  Grammar: /* @__PURE__ */ A(() => j$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => Y$, "LanguageMetaData"),
  parser: {}
}, rx = {
  Grammar: /* @__PURE__ */ A(() => K$(), "Grammar"),
  LanguageMetaData: /* @__PURE__ */ A(() => X$, "LanguageMetaData"),
  parser: {}
}, ix = /accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/, sx = /accTitle[\t ]*:([^\n\r]*)/, ax = /title([\t ][^\n\r]*|)/, ox = {
  ACC_DESCR: ix,
  ACC_TITLE: sx,
  TITLE: ax
}, Qi = class extends Vf {
  static {
    A(this, "AbstractMermaidValueConverter");
  }
  runConverter(t, e, n) {
    let r = this.runCommonConverter(t, e, n);
    return r === void 0 && (r = this.runCustomConverter(t, e, n)), r === void 0 ? super.runConverter(t, e, n) : r;
  }
  runCommonConverter(t, e, n) {
    const r = ox[t.name];
    if (r === void 0)
      return;
    const i = r.exec(e);
    if (i !== null) {
      if (i[1] !== void 0)
        return i[1].trim().replace(/[\t ]{2,}/gm, " ");
      if (i[2] !== void 0)
        return i[2].replace(/^\s*/gm, "").replace(/\s+$/gm, "").replace(/[\t ]{2,}/gm, " ").replace(/[\n\r]{2,}/gm, `
`);
    }
  }
}, es = class extends Qi {
  static {
    A(this, "CommonValueConverter");
  }
  runCustomConverter(t, e, n) {
  }
}, kt = class extends Hf {
  static {
    A(this, "AbstractMermaidTokenBuilder");
  }
  constructor(t) {
    super(), this.keywords = new Set(t);
  }
  buildKeywordTokens(t, e, n) {
    const r = super.buildKeywordTokens(t, e, n);
    return r.forEach((i) => {
      this.keywords.has(i.name) && i.PATTERN !== void 0 && (i.PATTERN = new RegExp(i.PATTERN.toString() + "(?:(?=%%)|(?!\\S))"));
    }), r;
  }
};
(class extends kt {
  static {
    A(this, "CommonTokenBuilder");
  }
});
var lx = class extends kt {
  static {
    A(this, "GitGraphTokenBuilder");
  }
  constructor() {
    super(["gitGraph"]);
  }
}, ad = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new lx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new es(), "ValueConverter")
  }
};
function od(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    tx,
    ad
  );
  return e.ServiceRegistry.register(n), { shared: e, GitGraph: n };
}
A(od, "createGitGraphServices");
var ux = class extends kt {
  static {
    A(this, "InfoTokenBuilder");
  }
  constructor() {
    super(["info", "showInfo"]);
  }
}, ld = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new ux(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new es(), "ValueConverter")
  }
};
function ud(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    J$,
    ld
  );
  return e.ServiceRegistry.register(n), { shared: e, Info: n };
}
A(ud, "createInfoServices");
var cx = class extends kt {
  static {
    A(this, "PacketTokenBuilder");
  }
  constructor() {
    super(["packet"]);
  }
}, cd = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new cx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new es(), "ValueConverter")
  }
};
function fd(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    Z$,
    cd
  );
  return e.ServiceRegistry.register(n), { shared: e, Packet: n };
}
A(fd, "createPacketServices");
var fx = class extends kt {
  static {
    A(this, "PieTokenBuilder");
  }
  constructor() {
    super(["pie", "showData"]);
  }
}, dx = class extends Qi {
  static {
    A(this, "PieValueConverter");
  }
  runCustomConverter(t, e, n) {
    if (t.name === "PIE_SECTION_LABEL")
      return e.replace(/"/g, "").trim();
  }
}, dd = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new fx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new dx(), "ValueConverter")
  }
};
function hd(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    Q$,
    dd
  );
  return e.ServiceRegistry.register(n), { shared: e, Pie: n };
}
A(hd, "createPieServices");
var hx = class extends kt {
  static {
    A(this, "ArchitectureTokenBuilder");
  }
  constructor() {
    super(["architecture"]);
  }
}, px = class extends Qi {
  static {
    A(this, "ArchitectureValueConverter");
  }
  runCustomConverter(t, e, n) {
    if (t.name === "ARCH_ICON")
      return e.replace(/[()]/g, "").trim();
    if (t.name === "ARCH_TEXT_ICON")
      return e.replace(/["()]/g, "");
    if (t.name === "ARCH_TITLE")
      return e.replace(/[[\]]/g, "").trim();
  }
}, pd = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new hx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new px(), "ValueConverter")
  }
};
function md(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    ex,
    pd
  );
  return e.ServiceRegistry.register(n), { shared: e, Architecture: n };
}
A(md, "createArchitectureServices");
var mx = class extends kt {
  static {
    A(this, "RadarTokenBuilder");
  }
  constructor() {
    super(["radar-beta"]);
  }
}, gd = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new mx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new es(), "ValueConverter")
  }
};
function yd(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    nx,
    gd
  );
  return e.ServiceRegistry.register(n), { shared: e, Radar: n };
}
A(yd, "createRadarServices");
var gx = class extends kt {
  static {
    A(this, "TreemapTokenBuilder");
  }
  constructor() {
    super(["treemap"]);
  }
}, yx = /classDef\s+([A-Z_a-z]\w+)(?:\s+([^\n\r;]*))?;?/, Tx = class extends Qi {
  static {
    A(this, "TreemapValueConverter");
  }
  runCustomConverter(t, e, n) {
    if (t.name === "NUMBER2")
      return parseFloat(e.replace(/,/g, ""));
    if (t.name === "SEPARATOR")
      return e.substring(1, e.length - 1);
    if (t.name === "STRING2")
      return e.substring(1, e.length - 1);
    if (t.name === "INDENTATION")
      return e.length;
    if (t.name === "ClassDef") {
      if (typeof e != "string")
        return e;
      const r = yx.exec(e);
      if (r)
        return {
          $type: "ClassDefStatement",
          className: r[1],
          styleText: r[2] || void 0
        };
    }
  }
};
function Td(t) {
  const e = t.validation.TreemapValidator, n = t.validation.ValidationRegistry;
  if (n) {
    const r = {
      Treemap: e.checkSingleRoot.bind(e)
      // Remove unused validation for TreemapRow
    };
    n.register(r, e);
  }
}
A(Td, "registerValidationChecks");
var vx = class {
  static {
    A(this, "TreemapValidator");
  }
  /**
   * Validates that a treemap has only one root node.
   * A root node is defined as a node that has no indentation.
   */
  checkSingleRoot(t, e) {
    let n;
    for (const r of t.TreemapRows)
      r.item && (n === void 0 && // Check if this is a root node (no indentation)
      r.indent === void 0 ? n = 0 : r.indent === void 0 ? e("error", "Multiple root nodes are not allowed in a treemap.", {
        node: r,
        property: "item"
      }) : n !== void 0 && n >= parseInt(r.indent, 10) && e("error", "Multiple root nodes are not allowed in a treemap.", {
        node: r,
        property: "item"
      }));
  }
}, vd = {
  parser: {
    TokenBuilder: /* @__PURE__ */ A(() => new gx(), "TokenBuilder"),
    ValueConverter: /* @__PURE__ */ A(() => new Tx(), "ValueConverter")
  },
  validation: {
    TreemapValidator: /* @__PURE__ */ A(() => new vx(), "TreemapValidator")
  }
};
function Rd(t = St) {
  const e = ue(
    xt(t),
    Vt
  ), n = ue(
    $t({ shared: e }),
    rx,
    vd
  );
  return e.ServiceRegistry.register(n), Td(n), { shared: e, Treemap: n };
}
A(Rd, "createTreemapServices");
var nt = {}, Rx = {
  info: /* @__PURE__ */ A(async () => {
    const { createInfoServices: t } = await Promise.resolve().then(() => $x), e = t().Info.parser.LangiumParser;
    nt.info = e;
  }, "info"),
  packet: /* @__PURE__ */ A(async () => {
    const { createPacketServices: t } = await Promise.resolve().then(() => xx), e = t().Packet.parser.LangiumParser;
    nt.packet = e;
  }, "packet"),
  pie: /* @__PURE__ */ A(async () => {
    const { createPieServices: t } = await Promise.resolve().then(() => Sx), e = t().Pie.parser.LangiumParser;
    nt.pie = e;
  }, "pie"),
  architecture: /* @__PURE__ */ A(async () => {
    const { createArchitectureServices: t } = await Promise.resolve().then(() => kx), e = t().Architecture.parser.LangiumParser;
    nt.architecture = e;
  }, "architecture"),
  gitGraph: /* @__PURE__ */ A(async () => {
    const { createGitGraphServices: t } = await Promise.resolve().then(() => Ix), e = t().GitGraph.parser.LangiumParser;
    nt.gitGraph = e;
  }, "gitGraph"),
  radar: /* @__PURE__ */ A(async () => {
    const { createRadarServices: t } = await Promise.resolve().then(() => Cx), e = t().Radar.parser.LangiumParser;
    nt.radar = e;
  }, "radar"),
  treemap: /* @__PURE__ */ A(async () => {
    const { createTreemapServices: t } = await Promise.resolve().then(() => wx), e = t().Treemap.parser.LangiumParser;
    nt.treemap = e;
  }, "treemap")
};
async function Ax(t, e) {
  const n = Rx[t];
  if (!n)
    throw new Error(`Unknown diagram type: ${t}`);
  nt[t] || await n();
  const i = nt[t].parse(e);
  if (i.lexerErrors.length > 0 || i.parserErrors.length > 0)
    throw new Ex(i);
  return i.value;
}
A(Ax, "parse");
var Ex = class extends Error {
  constructor(t) {
    const e = t.lexerErrors.map((r) => r.message).join(`
`), n = t.parserErrors.map((r) => r.message).join(`
`);
    super(`Parsing failed: ${e} ${n}`), this.result = t;
  }
  static {
    A(this, "MermaidParseError");
  }
};
const $x = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  InfoModule: ld,
  createInfoServices: ud
}, Symbol.toStringTag, { value: "Module" })), xx = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  PacketModule: cd,
  createPacketServices: fd
}, Symbol.toStringTag, { value: "Module" })), Sx = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  PieModule: dd,
  createPieServices: hd
}, Symbol.toStringTag, { value: "Module" })), kx = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ArchitectureModule: pd,
  createArchitectureServices: md
}, Symbol.toStringTag, { value: "Module" })), Ix = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GitGraphModule: ad,
  createGitGraphServices: od
}, Symbol.toStringTag, { value: "Module" })), Cx = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  RadarModule: gd,
  createRadarServices: yd
}, Symbol.toStringTag, { value: "Module" })), wx = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  TreemapModule: vd,
  createTreemapServices: Rd
}, Symbol.toStringTag, { value: "Module" }));
export {
  Ax as p
};
