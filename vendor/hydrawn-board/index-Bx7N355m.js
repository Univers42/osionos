const mx = {
  rect: "rectangle",
  circle: "ellipse"
}, Yn = {
  startOnLoad: !1,
  flowchart: { curve: "linear" },
  themeVariables: {
    fontSize: "20px"
  },
  maxEdges: 500,
  maxTextSize: 5e4
};
class Ci {
  constructor({ converter: e }) {
    this.convert = (r, i) => this.converter(r, {
      ...i,
      fontSize: i.fontSize || 20
    }), this.converter = e;
  }
}
var nr;
(function(t) {
  t.ROUND = "round", t.STADIUM = "stadium", t.DOUBLECIRCLE = "doublecircle", t.CIRCLE = "circle", t.DIAMOND = "diamond", t.CYLINDER = "cylinder";
})(nr || (nr = {}));
var Gt;
(function(t) {
  t.COLOR = "color";
})(Gt || (Gt = {}));
var gt;
(function(t) {
  t.FILL = "fill", t.STROKE = "stroke", t.STROKE_WIDTH = "stroke-width", t.STROKE_DASHARRAY = "stroke-dasharray";
})(gt || (gt = {}));
function yx(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var Mi = {}, ch;
function xx() {
  if (ch) return Mi;
  ch = 1, Object.defineProperty(Mi, "__esModule", { value: !0 }), Mi.removeMarkdown = void 0;
  var t = function(e, r) {
    r === void 0 && (r = {
      listUnicodeChar: ""
    }), r = r || {}, r.listUnicodeChar = r.hasOwnProperty("listUnicodeChar") ? r.listUnicodeChar : !1, r.stripListLeaders = r.hasOwnProperty("stripListLeaders") ? r.stripListLeaders : !0, r.gfm = r.hasOwnProperty("gfm") ? r.gfm : !0, r.useImgAltText = r.hasOwnProperty("useImgAltText") ? r.useImgAltText : !0, r.preserveLinks = r.hasOwnProperty("preserveLinks") ? r.preserveLinks : !1;
    var i = e || "";
    i = i.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, "");
    try {
      r.stripListLeaders && (r.listUnicodeChar ? i = i.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, r.listUnicodeChar + " $1") : i = i.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, "$1")), r.gfm && (i = i.replace(/\n={2,}/g, `
`).replace(/~{3}.*\n/g, "").replace(/~~/g, "").replace(/`{3}.*\n/g, "")), r.preserveLinks && (i = i.replace(/\[(.*?)\][\[\(](.*?)[\]\)]/g, "$1 ($2)")), i = i.replace(/<[^>]*>/g, "").replace(/^[=\-]{2,}\s*$/g, "").replace(/\[\^.+?\](\: .*?$)?/g, "").replace(/\s{0,2}\[.*?\]: .*?$/g, "").replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, r.useImgAltText ? "$1" : "").replace(/\[(.*?)\][\[\(].*?[\]\)]/g, "$1").replace(/^\s{0,3}>\s?/g, "").replace(/(^|\n)\s{0,3}>\s?/g, `

`).replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "").replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, "$1$2$3").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2").replace(/(`{3,})(.*?)\1/gm, "$2").replace(/`(.+?)`/g, "$1").replace(/\n{2,}/g, `

`);
    } catch (n) {
      return console.error(n), e;
    }
    return i;
  };
  return Mi.removeMarkdown = t, Mi;
}
var bx = xx();
const wx = {
  arrow_circle: {
    endArrowhead: "circle"
  },
  arrow_cross: {
    endArrowhead: "bar"
  },
  arrow_open: {
    endArrowhead: null,
    startArrowhead: null
  },
  double_arrow_circle: {
    endArrowhead: "circle",
    startArrowhead: "circle"
  },
  double_arrow_cross: {
    endArrowhead: "bar",
    startArrowhead: "bar"
  },
  double_arrow_point: {
    endArrowhead: "arrow",
    startArrowhead: "arrow"
  }
}, Cx = (t) => wx[t], Ua = (t) => {
  let e = t.text;
  return t.labelType === "markdown" && (e = bx.removeMarkdown(t.text)), _x(e);
}, _x = (t) => {
  const e = /\s?(fa|fab):[a-zA-Z0-9-]+/g;
  return t.replace(e, "");
}, on = (t) => {
  const e = {};
  return Object.keys(t).forEach((r) => {
    switch (r) {
      case gt.FILL: {
        e.backgroundColor = t[r], e.fillStyle = "solid";
        break;
      }
      case gt.STROKE: {
        e.strokeColor = t[r];
        break;
      }
      case gt.STROKE_WIDTH: {
        e.strokeWidth = Number(t[r]?.split("px")[0]);
        break;
      }
      case gt.STROKE_DASHARRAY: {
        e.strokeStyle = "dashed";
        break;
      }
    }
  }), e;
}, bo = (t) => {
  const e = {};
  return Object.keys(t).forEach((r) => {
    r === Gt.COLOR && (e.strokeColor = t[r]);
  }), e;
}, kx = (t, e) => [t, e], Sx = 32, xf = 0.62, vx = 12, Tx = 12, bf = (t, e) => Math.max(20, Math.ceil(t.length * e * xf)), Ax = (t, e, r, i) => {
  const n = i || 20;
  if (t !== nr.CYLINDER || !e || e.includes(`
`))
    return n;
  const s = Math.max(20, r - vx);
  return bf(e, n) <= s ? n : Math.max(Tx, Math.floor(s / (e.length * xf)));
}, Lx = (t) => {
  const e = {};
  t.subGraphs.map((i) => {
    i.nodeIds.forEach((n) => {
      e[i.id] = {
        id: i.id,
        parent: null,
        isLeaf: !1
      }, e[n] = {
        id: n,
        parent: i.id,
        isLeaf: t.vertices[n] !== void 0
      };
    });
  });
  const r = {};
  return [...Object.keys(t.vertices), ...t.subGraphs.map((i) => i.id)].forEach((i) => {
    if (!e[i])
      return;
    let n = e[i];
    const s = [];
    for (n.isLeaf || s.push(`subgraph_group_${n.id}`); n.parent; )
      s.push(`subgraph_group_${n.parent}`), n = e[n.parent];
    r[i] = s;
  }), {
    getGroupIds: (i) => r[i] || [],
    getParentId: (i) => e[i] ? e[i].parent : null
  };
}, Ex = new Ci({
  converter: (t, e) => {
    const r = [], i = e.fontSize, { getGroupIds: n, getParentId: s } = Lx(t);
    return t.subGraphs.reverse().forEach((a) => {
      const o = n(a.id), l = Ua(a), u = bf(l, i || 16) + Sx * 2, f = Math.max(a.width, u), d = a.x - (f - a.width) / 2, g = on(a.containerStyle), m = bo(a.labelStyle), y = {
        id: a.id,
        type: "rectangle",
        groupIds: o,
        x: d,
        y: a.y,
        width: f,
        height: a.height,
        label: {
          groupIds: o,
          text: l,
          fontSize: i,
          verticalAlign: "top",
          ...m
        },
        ...g
      };
      r.push(y);
    }), Object.values(t.vertices).forEach((a) => {
      if (!a)
        return;
      const o = n(a.id), l = Ua(a), c = Ax(a.type, l, a.width, i), h = on(a.containerStyle), u = bo(a.labelStyle);
      let f = {
        id: a.id,
        type: "rectangle",
        groupIds: o,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        strokeWidth: 2,
        label: {
          groupIds: o,
          text: l,
          fontSize: c,
          ...u
        },
        link: a.link || null,
        ...h
      };
      switch (a.type) {
        case nr.STADIUM: {
          f = { ...f, roundness: { type: 3 } };
          break;
        }
        case nr.ROUND: {
          f = { ...f, roundness: { type: 3 } };
          break;
        }
        case nr.DOUBLECIRCLE: {
          o.push(`doublecircle_${a.id}}`);
          const g = {
            type: "ellipse",
            groupIds: o,
            x: a.x + 5,
            y: a.y + 5,
            width: a.width - 10,
            height: a.height - 10,
            strokeWidth: 2,
            roundness: { type: 3 },
            label: {
              groupIds: o,
              text: l,
              fontSize: c,
              ...u
            }
          };
          f = { ...f, groupIds: o, type: "ellipse" }, r.push(g);
          break;
        }
        case nr.CIRCLE: {
          f.type = "ellipse";
          break;
        }
        case nr.DIAMOND: {
          f.type = "diamond";
          break;
        }
      }
      r.push(f);
    }), t.edges.forEach((a) => {
      let o = [];
      const l = s(a.start), c = s(a.end);
      l && l === c && (o = n(l));
      const { startX: h, startY: u, reflectionPoints: f } = a, d = f.map((C) => kx(C.x - f[0].x, C.y - f[0].y)), g = Cx(a.type || "arrow_point"), m = r.find((C) => C.id === a.start), y = r.find((C) => C.id === a.end);
      if (!m || !y)
        return;
      const b = {
        id: `${a.start}_${a.end}`,
        type: "arrow",
        groupIds: o,
        x: h,
        y: u,
        // 4 and 2 are the Excalidraw's stroke width of thick and thin respectively
        // TODO: use constant exported from Excalidraw package
        strokeWidth: a.stroke === "thick" ? 4 : 2,
        strokeStyle: a.stroke === "dotted" ? "dashed" : void 0,
        points: d,
        ...a.text ? { label: { text: Ua(a), fontSize: i, groupIds: o } } : {},
        roundness: {
          type: 2
        },
        ...g,
        start: {
          id: m.id || ""
        },
        end: {
          id: y.id || ""
        }
      };
      r.push(b);
    }), {
      elements: r
    };
  }
});
let fe = (t = 21) => crypto.getRandomValues(new Uint8Array(t)).reduce((e, r) => (r &= 63, r < 36 ? e += r.toString(36) : r < 62 ? e += (r - 26).toString(36).toUpperCase() : r > 62 ? e += "-" : e += "_", e), "");
const Bx = new Ci({
  converter: (t) => {
    const e = fe(), { width: r, height: i } = t, n = {
      type: "image",
      x: 0,
      y: 0,
      width: r,
      height: i,
      status: "saved",
      fileId: e
    };
    return { files: {
      [e]: {
        id: e,
        mimeType: t.mimeType,
        dataURL: t.dataURL
      }
    }, elements: [n] };
  }
}), Qi = (t, e) => [t, e], kl = (t) => t.replace(/\\n/g, `
`), Br = (t) => {
  const e = {
    type: "line",
    x: t.startX,
    y: t.startY,
    points: [
      Qi(0, 0),
      Qi(t.endX - t.startX, t.endY - t.startY)
    ],
    width: t.endX - t.startX,
    height: t.endY - t.startY,
    strokeStyle: t.strokeStyle || "solid",
    strokeColor: t.strokeColor || "#000",
    strokeWidth: t.strokeWidth || 1
  };
  return t.groupId && Object.assign(e, { groupIds: [t.groupId] }), t.id && Object.assign(e, { id: t.id }), e;
}, Mr = (t) => {
  const e = {
    type: "text",
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    text: kl(t.text) || "",
    fontSize: t.fontSize,
    verticalAlign: "top",
    strokeColor: t.color
  };
  return t.groupId && Object.assign(e, { groupIds: [t.groupId] }), t.id && Object.assign(e, { id: t.id }), e;
}, si = (t) => {
  const e = {
    text: kl(t?.label?.text || ""),
    fontSize: t?.label?.fontSize,
    textAlign: t.label?.textAlign,
    verticalAlign: t.label?.verticalAlign || "middle",
    strokeColor: t.label?.color || "#000",
    ...t.groupId ? { groupIds: [t.groupId] } : {}
  };
  let r = {};
  t.type === "rectangle" && t.subtype === "activation" && (r = {
    backgroundColor: "#e9ecef",
    fillStyle: "solid"
  });
  const i = {
    id: t.id,
    type: t.type,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    label: e,
    strokeStyle: t?.strokeStyle,
    strokeWidth: t?.strokeWidth,
    strokeColor: t?.strokeColor,
    backgroundColor: t?.bgColor,
    fillStyle: "solid",
    ...r
  };
  return t.groupId && Object.assign(i, { groupIds: [t.groupId] }), i;
}, Sl = (t) => {
  const e = {
    type: "arrow",
    x: t.startX,
    y: t.startY,
    points: t.points?.map(([r, i]) => Qi(r, i)) || [
      Qi(0, 0),
      Qi(t.endX - t.startX, t.endY - t.startY)
    ],
    width: t.endX - t.startX,
    height: t.endY - t.startY,
    strokeStyle: t?.strokeStyle || "solid",
    endArrowhead: t?.endArrowhead || null,
    startArrowhead: t?.startArrowhead || null,
    label: {
      text: kl(t?.label?.text || ""),
      fontSize: 16,
      textAlign: t?.label?.textAlign,
      verticalAlign: t?.label?.verticalAlign
    },
    roundness: {
      type: 2
    },
    start: t.start,
    end: t.end
  };
  return t.groupId && Object.assign(e, { groupIds: [t.groupId] }), e;
}, jn = 10, Xa = 16, Mx = 24, $x = 4, Fx = (t) => {
  if (!t)
    return !0;
  const e = t.trim().toLowerCase();
  return e === "transparent" || e === "none" || e === "rgba(0,0,0,0)" || e === "rgba(0, 0, 0, 0)";
}, Ox = (t, e) => Math.max(20, Math.round(t.length * e * 0.6)), hh = (t, e, r = !0) => {
  const i = t, n = i.groupIds ?? [];
  if (n.includes(e) || (i.groupIds = [...n, e]), !r || !i.label)
    return;
  const s = i.label.groupIds ?? [];
  s.includes(e) || (i.label.groupIds = [...s, e]);
}, Dx = new Ci({
  converter: (t) => {
    const e = [], r = [];
    if (Object.values(t.nodes).forEach((i) => {
      !i || !i.length || i.forEach((n) => {
        let s;
        switch (n.type) {
          case "line":
            s = Br(n);
            break;
          case "rectangle":
          case "ellipse":
            s = si(n);
            break;
          case "text":
            s = Mr(n);
            break;
          default:
            throw `unknown type ${n.type}`;
        }
        n.type === "rectangle" && n?.subtype === "activation" ? r.push(s) : e.push(s);
      });
    }), Object.values(t.lines).forEach((i) => {
      i && e.push(Br(i));
    }), Object.values(t.arrows).forEach((i) => {
      i && (e.push(Sl(i)), i.sequenceNumber && e.push(si(i.sequenceNumber)));
    }), e.push(...r), t.loops) {
      const { lines: i, texts: n, nodes: s } = t.loops;
      i.forEach((a) => {
        e.push(Br(a));
      }), n.forEach((a) => {
        e.push(Mr(a));
      }), s.forEach((a) => {
        e.push(si(a));
      });
    }
    return t.groups && t.groups.forEach((i) => {
      const { actorKeys: n, name: s } = i;
      let a = 1 / 0, o = 1 / 0, l = 0, c = 0;
      if (!n.length)
        return;
      const h = e.filter((b) => {
        if (b.id) {
          const C = b.id.indexOf("-"), k = b.id.substring(0, C);
          return n.includes(k);
        }
        return !1;
      });
      if (!h.length || (h.forEach((b) => {
        b.x === void 0 || b.y === void 0 || b.width === void 0 || b.height === void 0 || (a = Math.min(a, b.x), o = Math.min(o, b.y), l = Math.max(l, b.x + b.width), c = Math.max(c, b.y + b.height));
      }), !Number.isFinite(a) || !Number.isFinite(o) || !Number.isFinite(l) || !Number.isFinite(c)))
        return;
      const u = a - jn, f = o - jn, d = l - a + jn * 2, g = c - o + jn * 2, m = fe(), y = fe(), x = si({
        type: "rectangle",
        x: u,
        y: f,
        width: d,
        height: g,
        bgColor: Fx(i.fill) ? void 0 : i.fill,
        strokeColor: "#1f1f1f",
        strokeWidth: 1,
        id: m,
        groupId: y
      });
      if (e.unshift(x), e.forEach((b) => {
        b.id !== m && (b.x === void 0 || b.y === void 0 || b.width === void 0 || b.height === void 0 || b.x >= a && b.x + b.width <= l && b.y >= o && b.y + b.height <= c && hh(b, y));
      }), s) {
        const b = Mr({
          id: fe(),
          text: s,
          x: u + $x,
          y: f - Mx,
          width: Ox(s, Xa),
          height: Xa + 8,
          fontSize: Xa,
          color: "#1f1f1f",
          groupId: y
        });
        hh(b, y, !1), e.push(b);
      }
    }), { elements: e };
  }
}), Ix = new Ci({
  converter: (t) => {
    const e = [];
    return t.nodes.forEach((r) => {
      !r || !r.length || r.forEach((i) => {
        let n;
        switch (i.type) {
          case "line":
            n = Br(i);
            break;
          case "rectangle":
          case "ellipse":
            n = si(i);
            break;
          case "text":
            n = Mr(i);
            break;
          default:
            throw `unknown type ${i.type}`;
        }
        e.push(n);
      });
    }), Object.values(t.lines).forEach((r) => {
      r && e.push(Br(r));
    }), Object.values(t.arrows).forEach((r) => {
      if (!r)
        return;
      const i = Sl(r);
      e.push(i);
    }), Object.values(t.text).forEach((r) => {
      const i = Mr(r);
      e.push(i);
    }), Object.values(t.namespaces).forEach((r) => {
      const i = Object.keys(r.classes), n = [...i], s = [...t.lines, ...t.arrows, ...t.text];
      i.forEach((o) => {
        const l = s.filter((c) => c.metadata && c.metadata.classId === o).map((c) => c.id);
        l.length && n.push(...l);
      });
      const a = {
        type: "frame",
        id: fe(),
        name: r.id,
        children: n
      };
      e.push(a);
    }), { elements: e };
  }
}), Rx = new Ci({
  converter: (t) => {
    const e = [];
    return t.nodes.forEach((r) => {
      !r || !r.length || r.forEach((i) => {
        let n;
        switch (i.type) {
          case "line":
            n = Br(i);
            break;
          case "rectangle":
          case "ellipse":
            n = si(i);
            break;
          case "text":
            n = Mr(i);
            break;
          default:
            throw `unknown type ${i.type}`;
        }
        e.push(n);
      });
    }), t.lines.forEach((r) => {
      e.push(Br(r));
    }), t.arrows.forEach((r) => {
      e.push(Sl(r));
    }), t.text.forEach((r) => {
      e.push(Mr(r));
    }), { elements: e };
  }
}), xs = (t, e) => [t, e], Wi = 16, wf = 14, Px = 1, wo = "#000000", Cf = 5, Nx = Cf * 2, zx = Cf * 2, Wx = 1.25, _f = /* @__PURE__ */ new Set([
  "choice",
  "fork",
  "join",
  "stateStart",
  "stateEnd",
  "divider"
]), Co = (t) => t.shape === "stateEnd" ? [`state_end_group_${t.id}`] : void 0, kf = (t) => t.shape === "rectWithTitle" && t.description.length ? [t.text, ...t.description].join(`
`) : t.text;
let xr;
const qx = () => {
  if (xr !== void 0)
    return xr;
  if (typeof document > "u")
    return xr = null, xr;
  try {
    xr = document.createElement("canvas").getContext("2d");
  } catch {
    xr = null;
  }
  return xr;
}, ui = (t, e) => {
  const r = qx();
  return r ? (r.font = `${e}px Excalifont, sans-serif`, r.measureText(t).width) : t.length * e * 0.6;
}, Hx = (t, e, r) => {
  if (ui(t, e) <= r)
    return [t];
  const i = [];
  let n = "";
  for (const s of t) {
    const a = `${n}${s}`;
    if (n && ui(a, e) > r) {
      i.push(n), n = s;
      continue;
    }
    n = a;
  }
  return n && i.push(n), i;
}, Yx = (t, e, r) => {
  if (!t.trim() || ui(t, e) <= r)
    return t;
  const i = t.split(/\s+/).filter(Boolean), n = [];
  let s = "";
  for (const a of i) {
    const o = Hx(a, e, r);
    for (const [l, c] of o.entries()) {
      const u = s ? `${s}${s && l === 0 ? " " : ""}${c}` : c;
      if (ui(u, e) <= r) {
        s = u;
        continue;
      }
      s && n.push(s), s = c;
    }
    o.length > 1;
  }
  return n.push(s), n.join(`
`);
}, jx = (t, e, r) => {
  const n = t.map((o) => Yx(o, e, r)).join(`
`).split(`
`), s = Math.max(...n.map((o) => ui(o, e))), a = n.length * e * Wx;
  return {
    width: s,
    height: a
  };
}, Ux = (t, e, r, i) => {
  const n = t.split(`
`);
  for (let s = Wi; s >= wf; s -= Px) {
    const { height: a } = jx(n, s, e);
    if (a <= r)
      return s;
  }
  return i;
}, Xx = (t) => {
  const e = kf(t);
  if (!e || _f.has(t.shape))
    return Wi;
  const r = Math.max(1, t.width - Nx), i = Math.max(1, t.height - zx), n = e.split(`
`);
  return n.length > 1 && Math.max(...n.map((a) => ui(a, Wi))) <= r ? Wi : Ux(e, r, i, n.length === 1 ? Wi : wf);
}, Gx = (t) => {
  if (_f.has(t.shape))
    return;
  const e = kf(t);
  if (e)
    return {
      text: e,
      fontSize: Xx(t),
      verticalAlign: t.shape === "rectWithTitle" || t.shape === "roundedWithTitle" ? "top" : "middle",
      ...bo(t.labelStyle)
    };
}, Vx = (t) => {
  const e = on(t.containerStyle), r = Gx(t), i = t.shape === "choice" ? "diamond" : t.shape === "stateStart" || t.shape === "stateEnd" ? "ellipse" : "rectangle", n = t.shape === "rect" || t.shape === "rectWithTitle" || t.shape === "roundedWithTitle", s = t.shape === "stateStart" || t.shape === "fork" || t.shape === "join", a = e.backgroundColor || e.strokeColor || wo, o = e.strokeColor || e.backgroundColor || wo;
  return {
    id: t.id,
    type: i,
    ...Co(t) ? { groupIds: Co(t) } : {},
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    ...r ? { label: r } : {},
    ...e,
    ...n ? { roundness: { type: 3 } } : {},
    ...s ? {
      backgroundColor: a,
      strokeColor: o,
      fillStyle: "solid"
    } : {}
  };
}, Kx = (t) => {
  if (!t.dividerLine)
    return null;
  const e = on(t.containerStyle);
  return {
    id: `${t.id}__divider`,
    type: "line",
    x: t.dividerLine.startX,
    y: t.dividerLine.startY,
    width: t.dividerLine.endX - t.dividerLine.startX,
    height: t.dividerLine.endY - t.dividerLine.startY,
    points: [
      xs(0, 0),
      xs(t.dividerLine.endX - t.dividerLine.startX, t.dividerLine.endY - t.dividerLine.startY)
    ],
    strokeColor: e.strokeColor || "#000",
    strokeWidth: e.strokeWidth || 1
  };
}, Zx = (t) => {
  const e = on(t.containerStyle), r = Math.max(2, Math.min(t.width, t.height) * 0.32), i = t.endInnerColor || e.strokeColor || e.backgroundColor || wo;
  return {
    id: `${t.id}__inner`,
    type: "ellipse",
    groupIds: Co(t),
    x: t.x + r,
    y: t.y + r,
    width: Math.max(1, t.width - r * 2),
    height: Math.max(1, t.height - r * 2),
    backgroundColor: i,
    strokeColor: i,
    fillStyle: "solid",
    strokeWidth: 1
  };
}, Qx = (t) => {
  const e = t.reflectionPoints.map((r, i, n) => {
    const s = n[0];
    return i === 0 ? xs(0, 0) : xs(r.x - s.x, r.y - s.y);
  });
  return {
    id: t.id,
    type: "arrow",
    x: t.startX,
    y: t.startY,
    width: t.endX - t.startX,
    height: t.endY - t.startY,
    points: e,
    strokeColor: t.strokeColor || "#000",
    strokeWidth: t.strokeWidth || 2,
    strokeStyle: t.strokeStyle || "solid",
    endArrowhead: t.isNoteEdge ? null : "triangle",
    roundness: { type: 2 },
    start: { id: t.start },
    end: { id: t.end },
    ...t.text ? {
      label: {
        text: t.text,
        fontSize: 16
      }
    } : {}
  };
}, Jx = new Ci({
  converter: (t) => {
    const e = [];
    return t.nodes.forEach((r) => {
      if (!r.isRenderable)
        return;
      const i = Vx(r);
      e.push(i);
      const n = Kx(r);
      n && e.push(n), r.shape === "stateEnd" && e.push(Zx(r));
    }), t.edges.forEach((r) => {
      e.push(Qx(r));
    }), { elements: e };
  }
}), se = (t) => {
  t = eb(t);
  const e = t.replace(/#(\d+);/g, "&#$1;").replace(/#([a-z]+);/g, "&$1;"), r = document.createElement("textarea");
  return r.innerHTML = e, r.value;
}, $r = (t) => {
  const r = t.getAttribute("transform")?.match(/translate\(([ \d.-]+),\s*([\d.-]+)\)/);
  let i = 0, n = 0;
  return r && (i = Number(r[1]), n = Number(r[2])), { transformX: i, transformY: n };
}, tb = (t) => {
  let e = t;
  return e = e.replace(/style.*:\S*#.*;/g, (r) => r.substring(0, r.length - 1)), e = e.replace(/classDef.*:\S*#.*;/g, (r) => r.substring(0, r.length - 1)), e = e.replace(/#\w+;/g, (r) => {
    const i = r.substring(1, r.length - 1);
    return /^\+?\d+$/.test(i) ? `ﬂ°°${i}¶ß` : `ﬂ°${i}¶ß`;
  }), e;
}, eb = function(t) {
  return t.replace(/ﬂ°°/g, "#").replace(/ﬂ°/g, "&").replace(/¶ß/g, ";");
}, rb = 0.5, vl = (t, e = rb) => {
  const r = [];
  return t.forEach((i) => {
    const n = r[r.length - 1];
    if (!n) {
      r.push(i);
      return;
    }
    Math.hypot(i[0] - n[0], i[1] - n[1]) <= e || r.push(i);
  }), r;
}, Tl = (t) => {
  const e = t.getAttribute("d");
  if (!e)
    return null;
  const r = Array.from(e.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi), (i) => Number(i[0]));
  return r.length < 4 ? null : {
    startX: r[0],
    startY: r[1],
    endX: r[r.length - 2],
    endY: r[r.length - 1]
  };
}, Sf = (t) => {
  const e = t.getAttribute("data-points");
  if (!e) {
    const r = Tl(t);
    return r ? [
      { x: r.startX, y: r.startY },
      { x: r.endX, y: r.endY }
    ] : [];
  }
  try {
    const r = atob(e), i = JSON.parse(r);
    return Array.isArray(i) ? i.filter((n) => n && typeof n.x == "number" && typeof n.y == "number" && Number.isFinite(n.x) && Number.isFinite(n.y)) : [];
  } catch {
    return [];
  }
}, vf = (t, e = { x: 0, y: 0 }, r = "LM") => {
  if (t.tagName.toLowerCase() !== "path")
    throw new Error(`Invalid input: Expected an HTMLElement of tag "path", got ${t.tagName}`);
  const i = t.getAttribute("d");
  if (!i)
    throw new Error('Path element does not contain a "d" attribute');
  const n = i.split(new RegExp(`(?=[${r}])`)), s = n[0].substring(1).split(",").map((l) => parseFloat(l)), a = n[n.length - 1].substring(1).split(",").map((l) => parseFloat(l)), o = n.map((l) => {
    const c = l[0], h = l.substring(1).split(",").map((u) => parseFloat(u));
    return c === "C" ? {
      x: h[4],
      y: h[5],
      command: c
    } : { x: h[0], y: h[1], command: c };
  }).filter((l, c, h) => {
    if (c === 0 || c === h.length - 1)
      return !0;
    if (l.x === h[c - 1].x && l.y === h[c - 1].y || c === h.length - 2 && l.command === "C")
      return !1;
    if (c === h.length - 2 && (h[c - 1].x === l.x || h[c - 1].y === l.y)) {
      const u = h[h.length - 1];
      return Math.hypot(u.x - l.x, u.y - l.y) > 20;
    }
    return l.x !== h[c - 1].x || l.y !== h[c - 1].y;
  }).map((l) => ({
    x: l.x + e.x,
    y: l.y + e.y
  }));
  return {
    startX: s[0] + e.x,
    startY: s[1] + e.y,
    endX: a[0] + e.x,
    endY: a[1] + e.y,
    reflectionPoints: o
  };
}, ib = (t) => ({
  ...t,
  elements: t.elements.map((e) => {
    if (!("points" in e) || !Array.isArray(e.points))
      return e;
    const r = e.points;
    if (r.length < 2)
      return e;
    const i = vl(r);
    return i.length === r.length ? e : {
      ...e,
      points: i
    };
  })
}), nb = (t, e = {}) => {
  const r = (() => {
    switch (t.type) {
      case "graphImage":
        return Bx.convert(t, e);
      case "flowchart":
        return Ex.convert(t, e);
      case "sequence":
        return Dx.convert(t, e);
      case "class":
        return Ix.convert(t, e);
      case "erd":
        return Rx.convert(t, e);
      case "state":
        return Jx.convert(t, e);
      default:
        throw new Error(`graphToExcalidraw: unknown graph type "${t.type}, only flowcharts are supported!"`);
    }
  })();
  return ib(r);
};
var uh = {
  name: "mermaid",
  version: "11.12.2",
  description: "Markdown-ish syntax for generating flowcharts, mindmaps, sequence diagrams, class diagrams, gantt charts, git graphs and more.",
  type: "module",
  module: "./dist/mermaid.core.mjs",
  types: "./dist/mermaid.d.ts",
  exports: {
    ".": {
      types: "./dist/mermaid.d.ts",
      import: "./dist/mermaid.core.mjs",
      default: "./dist/mermaid.core.mjs"
    },
    "./*": "./*"
  },
  keywords: [
    "diagram",
    "markdown",
    "flowchart",
    "sequence diagram",
    "gantt",
    "class diagram",
    "git graph",
    "mindmap",
    "packet diagram",
    "c4 diagram",
    "er diagram",
    "pie chart",
    "pie diagram",
    "quadrant chart",
    "requirement diagram",
    "graph"
  ],
  scripts: {
    clean: "rimraf dist",
    dev: "pnpm -w dev",
    "docs:code": "typedoc src/defaultConfig.ts src/config.ts src/mermaid.ts && prettier --write ./src/docs/config/setup",
    "docs:build": "rimraf ../../docs && pnpm docs:code && pnpm docs:spellcheck && tsx scripts/docs.cli.mts",
    "docs:verify": "pnpm docs:code && pnpm docs:spellcheck && tsx scripts/docs.cli.mts --verify",
    "docs:pre:vitepress": "pnpm --filter ./src/docs prefetch && rimraf src/vitepress && pnpm docs:code && tsx scripts/docs.cli.mts --vitepress && pnpm --filter ./src/vitepress install --no-frozen-lockfile --ignore-scripts",
    "docs:build:vitepress": "pnpm docs:pre:vitepress && (cd src/vitepress && pnpm run build) && cpy --flat src/docs/landing/ ./src/vitepress/.vitepress/dist/landing",
    "docs:dev": 'pnpm docs:pre:vitepress && concurrently "pnpm --filter ./src/vitepress dev" "tsx scripts/docs.cli.mts --watch --vitepress"',
    "docs:dev:docker": 'pnpm docs:pre:vitepress && concurrently "pnpm --filter ./src/vitepress dev:docker" "tsx scripts/docs.cli.mts --watch --vitepress"',
    "docs:serve": "pnpm docs:build:vitepress && vitepress serve src/vitepress",
    "docs:spellcheck": 'cspell "src/docs/**/*.md"',
    "docs:release-version": "tsx scripts/update-release-version.mts",
    "docs:verify-version": "tsx scripts/update-release-version.mts --verify",
    "types:build-config": "tsx scripts/create-types-from-json-schema.mts",
    "types:verify-config": "tsx scripts/create-types-from-json-schema.mts --verify",
    checkCircle: "npx madge --circular ./src",
    prepublishOnly: "pnpm docs:verify-version"
  },
  repository: {
    type: "git",
    url: "https://github.com/mermaid-js/mermaid"
  },
  author: "Knut Sveidqvist",
  license: "MIT",
  standard: {
    ignore: [
      "**/parser/*.js",
      "dist/**/*.js",
      "cypress/**/*.js"
    ],
    globals: [
      "page"
    ]
  },
  dependencies: {
    "@braintree/sanitize-url": "^7.1.1",
    "@iconify/utils": "^3.0.1",
    "@mermaid-js/parser": "workspace:^",
    "@types/d3": "^7.4.3",
    cytoscape: "^3.29.3",
    "cytoscape-cose-bilkent": "^4.1.0",
    "cytoscape-fcose": "^2.2.0",
    d3: "^7.9.0",
    "d3-sankey": "^0.12.3",
    "dagre-d3-es": "7.0.13",
    dayjs: "^1.11.18",
    dompurify: "^3.2.5",
    katex: "^0.16.22",
    khroma: "^2.1.0",
    "lodash-es": "^4.17.21",
    marked: "^16.2.1",
    roughjs: "^4.6.6",
    stylis: "^4.3.6",
    "ts-dedent": "^2.2.0",
    uuid: "^11.1.0"
  },
  devDependencies: {
    "@adobe/jsonschema2md": "^8.0.5",
    "@iconify/types": "^2.0.0",
    "@types/cytoscape": "^3.21.9",
    "@types/cytoscape-fcose": "^2.2.4",
    "@types/d3-sankey": "^0.12.4",
    "@types/d3-scale": "^4.0.9",
    "@types/d3-scale-chromatic": "^3.1.0",
    "@types/d3-selection": "^3.0.11",
    "@types/d3-shape": "^3.1.7",
    "@types/jsdom": "^21.1.7",
    "@types/katex": "^0.16.7",
    "@types/lodash-es": "^4.17.12",
    "@types/micromatch": "^4.0.9",
    "@types/stylis": "^4.2.7",
    "@types/uuid": "^10.0.0",
    ajv: "^8.17.1",
    canvas: "^3.1.2",
    chokidar: "3.6.0",
    concurrently: "^9.1.2",
    "csstree-validator": "^4.0.1",
    globby: "^14.1.0",
    jison: "^0.4.18",
    "js-base64": "^3.7.8",
    jsdom: "^26.1.0",
    "json-schema-to-typescript": "^15.0.4",
    micromatch: "^4.0.8",
    "path-browserify": "^1.0.1",
    prettier: "^3.5.3",
    remark: "^15.0.1",
    "remark-frontmatter": "^5.0.0",
    "remark-gfm": "^4.0.1",
    rimraf: "^6.0.1",
    "start-server-and-test": "^2.0.13",
    "type-fest": "^4.35.0",
    typedoc: "^0.28.12",
    "typedoc-plugin-markdown": "^4.8.1",
    typescript: "~5.7.3",
    "unist-util-flatmap": "^1.0.0",
    "unist-util-visit": "^5.0.0",
    vitepress: "^1.6.4",
    "vitepress-plugin-search": "1.0.4-alpha.22"
  },
  files: [
    "dist/",
    "README.md"
  ],
  publishConfig: {
    access: "public"
  }
}, ss = { exports: {} }, sb = ss.exports, fh;
function ab() {
  return fh || (fh = 1, (function(t, e) {
    (function(r, i) {
      t.exports = i();
    })(sb, (function() {
      var r = 1e3, i = 6e4, n = 36e5, s = "millisecond", a = "second", o = "minute", l = "hour", c = "day", h = "week", u = "month", f = "quarter", d = "year", g = "date", m = "Invalid Date", y = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/, x = /\[([^\]]+)]|YYYY|YY|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g, b = { name: "en", weekdays: "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"), months: "January_February_March_April_May_June_July_August_September_October_November_December".split("_"), ordinal: function($) {
        var F = ["th", "st", "nd", "rd"], A = $ % 100;
        return "[" + $ + (F[(A - 20) % 10] || F[A] || F[0]) + "]";
      } }, C = function($, F, A) {
        var L = String($);
        return !L || L.length >= F ? $ : "" + Array(F + 1 - L.length).join(A) + $;
      }, k = { s: C, z: function($) {
        var F = -$.utcOffset(), A = Math.abs(F), L = Math.floor(A / 60), M = A % 60;
        return (F <= 0 ? "+" : "-") + C(L, 2, "0") + ":" + C(M, 2, "0");
      }, m: function $(F, A) {
        if (F.date() < A.date()) return -$(A, F);
        var L = 12 * (A.year() - F.year()) + (A.month() - F.month()), M = F.clone().add(L, u), H = A - M < 0, Y = F.clone().add(L + (H ? -1 : 1), u);
        return +(-(L + (A - M) / (H ? M - Y : Y - M)) || 0);
      }, a: function($) {
        return $ < 0 ? Math.ceil($) || 0 : Math.floor($);
      }, p: function($) {
        return { M: u, y: d, w: h, d: c, D: g, h: l, m: o, s: a, ms: s, Q: f }[$] || String($ || "").toLowerCase().replace(/s$/, "");
      }, u: function($) {
        return $ === void 0;
      } }, _ = "en", E = {};
      E[_] = b;
      var B = "$isDayjsObject", S = function($) {
        return $ instanceof W || !(!$ || !$[B]);
      }, I = function $(F, A, L) {
        var M;
        if (!F) return _;
        if (typeof F == "string") {
          var H = F.toLowerCase();
          E[H] && (M = H), A && (E[H] = A, M = H);
          var Y = F.split("-");
          if (!M && Y.length > 1) return $(Y[0]);
        } else {
          var it = F.name;
          E[it] = F, M = it;
        }
        return !L && M && (_ = M), M || !L && _;
      }, O = function($, F) {
        if (S($)) return $.clone();
        var A = typeof F == "object" ? F : {};
        return A.date = $, A.args = arguments, new W(A);
      }, D = k;
      D.l = I, D.i = S, D.w = function($, F) {
        return O($, { locale: F.$L, utc: F.$u, x: F.$x, $offset: F.$offset });
      };
      var W = (function() {
        function $(A) {
          this.$L = I(A.locale, null, !0), this.parse(A), this.$x = this.$x || A.x || {}, this[B] = !0;
        }
        var F = $.prototype;
        return F.parse = function(A) {
          this.$d = (function(L) {
            var M = L.date, H = L.utc;
            if (M === null) return /* @__PURE__ */ new Date(NaN);
            if (D.u(M)) return /* @__PURE__ */ new Date();
            if (M instanceof Date) return new Date(M);
            if (typeof M == "string" && !/Z$/i.test(M)) {
              var Y = M.match(y);
              if (Y) {
                var it = Y[2] - 1 || 0, J = (Y[7] || "0").substring(0, 3);
                return H ? new Date(Date.UTC(Y[1], it, Y[3] || 1, Y[4] || 0, Y[5] || 0, Y[6] || 0, J)) : new Date(Y[1], it, Y[3] || 1, Y[4] || 0, Y[5] || 0, Y[6] || 0, J);
              }
            }
            return new Date(M);
          })(A), this.init();
        }, F.init = function() {
          var A = this.$d;
          this.$y = A.getFullYear(), this.$M = A.getMonth(), this.$D = A.getDate(), this.$W = A.getDay(), this.$H = A.getHours(), this.$m = A.getMinutes(), this.$s = A.getSeconds(), this.$ms = A.getMilliseconds();
        }, F.$utils = function() {
          return D;
        }, F.isValid = function() {
          return this.$d.toString() !== m;
        }, F.isSame = function(A, L) {
          var M = O(A);
          return this.startOf(L) <= M && M <= this.endOf(L);
        }, F.isAfter = function(A, L) {
          return O(A) < this.startOf(L);
        }, F.isBefore = function(A, L) {
          return this.endOf(L) < O(A);
        }, F.$g = function(A, L, M) {
          return D.u(A) ? this[L] : this.set(M, A);
        }, F.unix = function() {
          return Math.floor(this.valueOf() / 1e3);
        }, F.valueOf = function() {
          return this.$d.getTime();
        }, F.startOf = function(A, L) {
          var M = this, H = !!D.u(L) || L, Y = D.p(A), it = function(ve, At) {
            var Te = D.w(M.$u ? Date.UTC(M.$y, At, ve) : new Date(M.$y, At, ve), M);
            return H ? Te : Te.endOf(c);
          }, J = function(ve, At) {
            return D.w(M.toDate()[ve].apply(M.toDate("s"), (H ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(At)), M);
          }, tt = this.$W, ht = this.$M, Z = this.$D, Bt = "set" + (this.$u ? "UTC" : "");
          switch (Y) {
            case d:
              return H ? it(1, 0) : it(31, 11);
            case u:
              return H ? it(1, ht) : it(0, ht + 1);
            case h:
              var It = this.$locale().weekStart || 0, Se = (tt < It ? tt + 7 : tt) - It;
              return it(H ? Z - Se : Z + (6 - Se), ht);
            case c:
            case g:
              return J(Bt + "Hours", 0);
            case l:
              return J(Bt + "Minutes", 1);
            case o:
              return J(Bt + "Seconds", 2);
            case a:
              return J(Bt + "Milliseconds", 3);
            default:
              return this.clone();
          }
        }, F.endOf = function(A) {
          return this.startOf(A, !1);
        }, F.$set = function(A, L) {
          var M, H = D.p(A), Y = "set" + (this.$u ? "UTC" : ""), it = (M = {}, M[c] = Y + "Date", M[g] = Y + "Date", M[u] = Y + "Month", M[d] = Y + "FullYear", M[l] = Y + "Hours", M[o] = Y + "Minutes", M[a] = Y + "Seconds", M[s] = Y + "Milliseconds", M)[H], J = H === c ? this.$D + (L - this.$W) : L;
          if (H === u || H === d) {
            var tt = this.clone().set(g, 1);
            tt.$d[it](J), tt.init(), this.$d = tt.set(g, Math.min(this.$D, tt.daysInMonth())).$d;
          } else it && this.$d[it](J);
          return this.init(), this;
        }, F.set = function(A, L) {
          return this.clone().$set(A, L);
        }, F.get = function(A) {
          return this[D.p(A)]();
        }, F.add = function(A, L) {
          var M, H = this;
          A = Number(A);
          var Y = D.p(L), it = function(ht) {
            var Z = O(H);
            return D.w(Z.date(Z.date() + Math.round(ht * A)), H);
          };
          if (Y === u) return this.set(u, this.$M + A);
          if (Y === d) return this.set(d, this.$y + A);
          if (Y === c) return it(1);
          if (Y === h) return it(7);
          var J = (M = {}, M[o] = i, M[l] = n, M[a] = r, M)[Y] || 1, tt = this.$d.getTime() + A * J;
          return D.w(tt, this);
        }, F.subtract = function(A, L) {
          return this.add(-1 * A, L);
        }, F.format = function(A) {
          var L = this, M = this.$locale();
          if (!this.isValid()) return M.invalidDate || m;
          var H = A || "YYYY-MM-DDTHH:mm:ssZ", Y = D.z(this), it = this.$H, J = this.$m, tt = this.$M, ht = M.weekdays, Z = M.months, Bt = M.meridiem, It = function(At, Te, Ze, Xr) {
            return At && (At[Te] || At(L, H)) || Ze[Te].slice(0, Xr);
          }, Se = function(At) {
            return D.s(it % 12 || 12, At, "0");
          }, ve = Bt || function(At, Te, Ze) {
            var Xr = At < 12 ? "AM" : "PM";
            return Ze ? Xr.toLowerCase() : Xr;
          };
          return H.replace(x, (function(At, Te) {
            return Te || (function(Ze) {
              switch (Ze) {
                case "YY":
                  return String(L.$y).slice(-2);
                case "YYYY":
                  return D.s(L.$y, 4, "0");
                case "M":
                  return tt + 1;
                case "MM":
                  return D.s(tt + 1, 2, "0");
                case "MMM":
                  return It(M.monthsShort, tt, Z, 3);
                case "MMMM":
                  return It(Z, tt);
                case "D":
                  return L.$D;
                case "DD":
                  return D.s(L.$D, 2, "0");
                case "d":
                  return String(L.$W);
                case "dd":
                  return It(M.weekdaysMin, L.$W, ht, 2);
                case "ddd":
                  return It(M.weekdaysShort, L.$W, ht, 3);
                case "dddd":
                  return ht[L.$W];
                case "H":
                  return String(it);
                case "HH":
                  return D.s(it, 2, "0");
                case "h":
                  return Se(1);
                case "hh":
                  return Se(2);
                case "a":
                  return ve(it, J, !0);
                case "A":
                  return ve(it, J, !1);
                case "m":
                  return String(J);
                case "mm":
                  return D.s(J, 2, "0");
                case "s":
                  return String(L.$s);
                case "ss":
                  return D.s(L.$s, 2, "0");
                case "SSS":
                  return D.s(L.$ms, 3, "0");
                case "Z":
                  return Y;
              }
              return null;
            })(At) || Y.replace(":", "");
          }));
        }, F.utcOffset = function() {
          return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
        }, F.diff = function(A, L, M) {
          var H, Y = this, it = D.p(L), J = O(A), tt = (J.utcOffset() - this.utcOffset()) * i, ht = this - J, Z = function() {
            return D.m(Y, J);
          };
          switch (it) {
            case d:
              H = Z() / 12;
              break;
            case u:
              H = Z();
              break;
            case f:
              H = Z() / 3;
              break;
            case h:
              H = (ht - tt) / 6048e5;
              break;
            case c:
              H = (ht - tt) / 864e5;
              break;
            case l:
              H = ht / n;
              break;
            case o:
              H = ht / i;
              break;
            case a:
              H = ht / r;
              break;
            default:
              H = ht;
          }
          return M ? H : D.a(H);
        }, F.daysInMonth = function() {
          return this.endOf(u).$D;
        }, F.$locale = function() {
          return E[this.$L];
        }, F.locale = function(A, L) {
          if (!A) return this.$L;
          var M = this.clone(), H = I(A, L, !0);
          return H && (M.$L = H), M;
        }, F.clone = function() {
          return D.w(this.$d, this);
        }, F.toDate = function() {
          return new Date(this.valueOf());
        }, F.toJSON = function() {
          return this.isValid() ? this.toISOString() : null;
        }, F.toISOString = function() {
          return this.$d.toISOString();
        }, F.toString = function() {
          return this.$d.toUTCString();
        }, $;
      })(), N = W.prototype;
      return O.prototype = N, [["$ms", s], ["$s", a], ["$m", o], ["$H", l], ["$W", c], ["$M", u], ["$y", d], ["$D", g]].forEach((function($) {
        N[$[1]] = function(F) {
          return this.$g(F, $[0], $[1]);
        };
      })), O.extend = function($, F) {
        return $.$i || ($(F, W, O), $.$i = !0), O;
      }, O.locale = I, O.isDayjs = S, O.unix = function($) {
        return O(1e3 * $);
      }, O.en = E[_], O.Ls = E, O.p = {}, O;
    }));
  })(ss)), ss.exports;
}
var ob = ab();
const lb = /* @__PURE__ */ yx(ob);
var Tf = Object.defineProperty, p = (t, e) => Tf(t, "name", { value: e, configurable: !0 }), cb = (t, e) => {
  for (var r in e)
    Tf(t, r, { get: e[r], enumerable: !0 });
}, ze = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
}, R = {
  trace: /* @__PURE__ */ p((...t) => {
  }, "trace"),
  debug: /* @__PURE__ */ p((...t) => {
  }, "debug"),
  info: /* @__PURE__ */ p((...t) => {
  }, "info"),
  warn: /* @__PURE__ */ p((...t) => {
  }, "warn"),
  error: /* @__PURE__ */ p((...t) => {
  }, "error"),
  fatal: /* @__PURE__ */ p((...t) => {
  }, "fatal")
}, Al = /* @__PURE__ */ p(function(t = "fatal") {
  let e = ze.fatal;
  typeof t == "string" ? t.toLowerCase() in ze && (e = ze[t]) : typeof t == "number" && (e = t), R.trace = () => {
  }, R.debug = () => {
  }, R.info = () => {
  }, R.warn = () => {
  }, R.error = () => {
  }, R.fatal = () => {
  }, e <= ze.fatal && (R.fatal = console.error ? console.error.bind(console, he("FATAL"), "color: orange") : console.log.bind(console, "\x1B[35m", he("FATAL"))), e <= ze.error && (R.error = console.error ? console.error.bind(console, he("ERROR"), "color: orange") : console.log.bind(console, "\x1B[31m", he("ERROR"))), e <= ze.warn && (R.warn = console.warn ? console.warn.bind(console, he("WARN"), "color: orange") : console.log.bind(console, "\x1B[33m", he("WARN"))), e <= ze.info && (R.info = console.info ? console.info.bind(console, he("INFO"), "color: lightblue") : console.log.bind(console, "\x1B[34m", he("INFO"))), e <= ze.debug && (R.debug = console.debug ? console.debug.bind(console, he("DEBUG"), "color: lightgreen") : console.log.bind(console, "\x1B[32m", he("DEBUG"))), e <= ze.trace && (R.trace = console.debug ? console.debug.bind(console, he("TRACE"), "color: lightgreen") : console.log.bind(console, "\x1B[32m", he("TRACE")));
}, "setLogLevel"), he = /* @__PURE__ */ p((t) => `%c${lb().format("ss.SSS")} : ${t} : `, "format");
const as = {
  /* CLAMP */
  min: {
    r: 0,
    g: 0,
    b: 0,
    s: 0,
    l: 0,
    a: 0
  },
  max: {
    r: 255,
    g: 255,
    b: 255,
    h: 360,
    s: 100,
    l: 100,
    a: 1
  },
  clamp: {
    r: (t) => t >= 255 ? 255 : t < 0 ? 0 : t,
    g: (t) => t >= 255 ? 255 : t < 0 ? 0 : t,
    b: (t) => t >= 255 ? 255 : t < 0 ? 0 : t,
    h: (t) => t % 360,
    s: (t) => t >= 100 ? 100 : t < 0 ? 0 : t,
    l: (t) => t >= 100 ? 100 : t < 0 ? 0 : t,
    a: (t) => t >= 1 ? 1 : t < 0 ? 0 : t
  },
  /* CONVERSION */
  //SOURCE: https://planetcalc.com/7779
  toLinear: (t) => {
    const e = t / 255;
    return t > 0.03928 ? Math.pow((e + 0.055) / 1.055, 2.4) : e / 12.92;
  },
  //SOURCE: https://gist.github.com/mjackson/5311256
  hue2rgb: (t, e, r) => (r < 0 && (r += 1), r > 1 && (r -= 1), r < 1 / 6 ? t + (e - t) * 6 * r : r < 1 / 2 ? e : r < 2 / 3 ? t + (e - t) * (2 / 3 - r) * 6 : t),
  hsl2rgb: ({ h: t, s: e, l: r }, i) => {
    if (!e)
      return r * 2.55;
    t /= 360, e /= 100, r /= 100;
    const n = r < 0.5 ? r * (1 + e) : r + e - r * e, s = 2 * r - n;
    switch (i) {
      case "r":
        return as.hue2rgb(s, n, t + 1 / 3) * 255;
      case "g":
        return as.hue2rgb(s, n, t) * 255;
      case "b":
        return as.hue2rgb(s, n, t - 1 / 3) * 255;
    }
  },
  rgb2hsl: ({ r: t, g: e, b: r }, i) => {
    t /= 255, e /= 255, r /= 255;
    const n = Math.max(t, e, r), s = Math.min(t, e, r), a = (n + s) / 2;
    if (i === "l")
      return a * 100;
    if (n === s)
      return 0;
    const o = n - s, l = a > 0.5 ? o / (2 - n - s) : o / (n + s);
    if (i === "s")
      return l * 100;
    switch (n) {
      case t:
        return ((e - r) / o + (e < r ? 6 : 0)) * 60;
      case e:
        return ((r - t) / o + 2) * 60;
      case r:
        return ((t - e) / o + 4) * 60;
      default:
        return -1;
    }
  }
}, hb = {
  /* API */
  clamp: (t, e, r) => e > r ? Math.min(e, Math.max(r, t)) : Math.min(r, Math.max(e, t)),
  round: (t) => Math.round(t * 1e10) / 1e10
}, ub = {
  /* API */
  dec2hex: (t) => {
    const e = Math.round(t).toString(16);
    return e.length > 1 ? e : `0${e}`;
  }
}, ct = {
  channel: as,
  lang: hb,
  unit: ub
}, rr = {};
for (let t = 0; t <= 255; t++)
  rr[t] = ct.unit.dec2hex(t);
const Wt = {
  ALL: 0,
  RGB: 1,
  HSL: 2
};
class fb {
  constructor() {
    this.type = Wt.ALL;
  }
  /* API */
  get() {
    return this.type;
  }
  set(e) {
    if (this.type && this.type !== e)
      throw new Error("Cannot change both RGB and HSL channels at the same time");
    this.type = e;
  }
  reset() {
    this.type = Wt.ALL;
  }
  is(e) {
    return this.type === e;
  }
}
class db {
  /* CONSTRUCTOR */
  constructor(e, r) {
    this.color = r, this.changed = !1, this.data = e, this.type = new fb();
  }
  /* API */
  set(e, r) {
    return this.color = r, this.changed = !1, this.data = e, this.type.type = Wt.ALL, this;
  }
  /* HELPERS */
  _ensureHSL() {
    const e = this.data, { h: r, s: i, l: n } = e;
    r === void 0 && (e.h = ct.channel.rgb2hsl(e, "h")), i === void 0 && (e.s = ct.channel.rgb2hsl(e, "s")), n === void 0 && (e.l = ct.channel.rgb2hsl(e, "l"));
  }
  _ensureRGB() {
    const e = this.data, { r, g: i, b: n } = e;
    r === void 0 && (e.r = ct.channel.hsl2rgb(e, "r")), i === void 0 && (e.g = ct.channel.hsl2rgb(e, "g")), n === void 0 && (e.b = ct.channel.hsl2rgb(e, "b"));
  }
  /* GETTERS */
  get r() {
    const e = this.data, r = e.r;
    return !this.type.is(Wt.HSL) && r !== void 0 ? r : (this._ensureHSL(), ct.channel.hsl2rgb(e, "r"));
  }
  get g() {
    const e = this.data, r = e.g;
    return !this.type.is(Wt.HSL) && r !== void 0 ? r : (this._ensureHSL(), ct.channel.hsl2rgb(e, "g"));
  }
  get b() {
    const e = this.data, r = e.b;
    return !this.type.is(Wt.HSL) && r !== void 0 ? r : (this._ensureHSL(), ct.channel.hsl2rgb(e, "b"));
  }
  get h() {
    const e = this.data, r = e.h;
    return !this.type.is(Wt.RGB) && r !== void 0 ? r : (this._ensureRGB(), ct.channel.rgb2hsl(e, "h"));
  }
  get s() {
    const e = this.data, r = e.s;
    return !this.type.is(Wt.RGB) && r !== void 0 ? r : (this._ensureRGB(), ct.channel.rgb2hsl(e, "s"));
  }
  get l() {
    const e = this.data, r = e.l;
    return !this.type.is(Wt.RGB) && r !== void 0 ? r : (this._ensureRGB(), ct.channel.rgb2hsl(e, "l"));
  }
  get a() {
    return this.data.a;
  }
  /* SETTERS */
  set r(e) {
    this.type.set(Wt.RGB), this.changed = !0, this.data.r = e;
  }
  set g(e) {
    this.type.set(Wt.RGB), this.changed = !0, this.data.g = e;
  }
  set b(e) {
    this.type.set(Wt.RGB), this.changed = !0, this.data.b = e;
  }
  set h(e) {
    this.type.set(Wt.HSL), this.changed = !0, this.data.h = e;
  }
  set s(e) {
    this.type.set(Wt.HSL), this.changed = !0, this.data.s = e;
  }
  set l(e) {
    this.type.set(Wt.HSL), this.changed = !0, this.data.l = e;
  }
  set a(e) {
    this.changed = !0, this.data.a = e;
  }
}
const na = new db({ r: 0, g: 0, b: 0, a: 0 }, "transparent"), oi = {
  /* VARIABLES */
  re: /^#((?:[a-f0-9]{2}){2,4}|[a-f0-9]{3})$/i,
  /* API */
  parse: (t) => {
    if (t.charCodeAt(0) !== 35)
      return;
    const e = t.match(oi.re);
    if (!e)
      return;
    const r = e[1], i = parseInt(r, 16), n = r.length, s = n % 4 === 0, a = n > 4, o = a ? 1 : 17, l = a ? 8 : 4, c = s ? 0 : -1, h = a ? 255 : 15;
    return na.set({
      r: (i >> l * (c + 3) & h) * o,
      g: (i >> l * (c + 2) & h) * o,
      b: (i >> l * (c + 1) & h) * o,
      a: s ? (i & h) * o / 255 : 1
    }, t);
  },
  stringify: (t) => {
    const { r: e, g: r, b: i, a: n } = t;
    return n < 1 ? `#${rr[Math.round(e)]}${rr[Math.round(r)]}${rr[Math.round(i)]}${rr[Math.round(n * 255)]}` : `#${rr[Math.round(e)]}${rr[Math.round(r)]}${rr[Math.round(i)]}`;
  }
}, vr = {
  /* VARIABLES */
  re: /^hsla?\(\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?(?:deg|grad|rad|turn)?)\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?%)\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?%)(?:\s*?(?:,|\/)\s*?\+?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?(%)?))?\s*?\)$/i,
  hueRe: /^(.+?)(deg|grad|rad|turn)$/i,
  /* HELPERS */
  _hue2deg: (t) => {
    const e = t.match(vr.hueRe);
    if (e) {
      const [, r, i] = e;
      switch (i) {
        case "grad":
          return ct.channel.clamp.h(parseFloat(r) * 0.9);
        case "rad":
          return ct.channel.clamp.h(parseFloat(r) * 180 / Math.PI);
        case "turn":
          return ct.channel.clamp.h(parseFloat(r) * 360);
      }
    }
    return ct.channel.clamp.h(parseFloat(t));
  },
  /* API */
  parse: (t) => {
    const e = t.charCodeAt(0);
    if (e !== 104 && e !== 72)
      return;
    const r = t.match(vr.re);
    if (!r)
      return;
    const [, i, n, s, a, o] = r;
    return na.set({
      h: vr._hue2deg(i),
      s: ct.channel.clamp.s(parseFloat(n)),
      l: ct.channel.clamp.l(parseFloat(s)),
      a: a ? ct.channel.clamp.a(o ? parseFloat(a) / 100 : parseFloat(a)) : 1
    }, t);
  },
  stringify: (t) => {
    const { h: e, s: r, l: i, a: n } = t;
    return n < 1 ? `hsla(${ct.lang.round(e)}, ${ct.lang.round(r)}%, ${ct.lang.round(i)}%, ${n})` : `hsl(${ct.lang.round(e)}, ${ct.lang.round(r)}%, ${ct.lang.round(i)}%)`;
  }
}, Ji = {
  /* VARIABLES */
  colors: {
    aliceblue: "#f0f8ff",
    antiquewhite: "#faebd7",
    aqua: "#00ffff",
    aquamarine: "#7fffd4",
    azure: "#f0ffff",
    beige: "#f5f5dc",
    bisque: "#ffe4c4",
    black: "#000000",
    blanchedalmond: "#ffebcd",
    blue: "#0000ff",
    blueviolet: "#8a2be2",
    brown: "#a52a2a",
    burlywood: "#deb887",
    cadetblue: "#5f9ea0",
    chartreuse: "#7fff00",
    chocolate: "#d2691e",
    coral: "#ff7f50",
    cornflowerblue: "#6495ed",
    cornsilk: "#fff8dc",
    crimson: "#dc143c",
    cyanaqua: "#00ffff",
    darkblue: "#00008b",
    darkcyan: "#008b8b",
    darkgoldenrod: "#b8860b",
    darkgray: "#a9a9a9",
    darkgreen: "#006400",
    darkgrey: "#a9a9a9",
    darkkhaki: "#bdb76b",
    darkmagenta: "#8b008b",
    darkolivegreen: "#556b2f",
    darkorange: "#ff8c00",
    darkorchid: "#9932cc",
    darkred: "#8b0000",
    darksalmon: "#e9967a",
    darkseagreen: "#8fbc8f",
    darkslateblue: "#483d8b",
    darkslategray: "#2f4f4f",
    darkslategrey: "#2f4f4f",
    darkturquoise: "#00ced1",
    darkviolet: "#9400d3",
    deeppink: "#ff1493",
    deepskyblue: "#00bfff",
    dimgray: "#696969",
    dimgrey: "#696969",
    dodgerblue: "#1e90ff",
    firebrick: "#b22222",
    floralwhite: "#fffaf0",
    forestgreen: "#228b22",
    fuchsia: "#ff00ff",
    gainsboro: "#dcdcdc",
    ghostwhite: "#f8f8ff",
    gold: "#ffd700",
    goldenrod: "#daa520",
    gray: "#808080",
    green: "#008000",
    greenyellow: "#adff2f",
    grey: "#808080",
    honeydew: "#f0fff0",
    hotpink: "#ff69b4",
    indianred: "#cd5c5c",
    indigo: "#4b0082",
    ivory: "#fffff0",
    khaki: "#f0e68c",
    lavender: "#e6e6fa",
    lavenderblush: "#fff0f5",
    lawngreen: "#7cfc00",
    lemonchiffon: "#fffacd",
    lightblue: "#add8e6",
    lightcoral: "#f08080",
    lightcyan: "#e0ffff",
    lightgoldenrodyellow: "#fafad2",
    lightgray: "#d3d3d3",
    lightgreen: "#90ee90",
    lightgrey: "#d3d3d3",
    lightpink: "#ffb6c1",
    lightsalmon: "#ffa07a",
    lightseagreen: "#20b2aa",
    lightskyblue: "#87cefa",
    lightslategray: "#778899",
    lightslategrey: "#778899",
    lightsteelblue: "#b0c4de",
    lightyellow: "#ffffe0",
    lime: "#00ff00",
    limegreen: "#32cd32",
    linen: "#faf0e6",
    magenta: "#ff00ff",
    maroon: "#800000",
    mediumaquamarine: "#66cdaa",
    mediumblue: "#0000cd",
    mediumorchid: "#ba55d3",
    mediumpurple: "#9370db",
    mediumseagreen: "#3cb371",
    mediumslateblue: "#7b68ee",
    mediumspringgreen: "#00fa9a",
    mediumturquoise: "#48d1cc",
    mediumvioletred: "#c71585",
    midnightblue: "#191970",
    mintcream: "#f5fffa",
    mistyrose: "#ffe4e1",
    moccasin: "#ffe4b5",
    navajowhite: "#ffdead",
    navy: "#000080",
    oldlace: "#fdf5e6",
    olive: "#808000",
    olivedrab: "#6b8e23",
    orange: "#ffa500",
    orangered: "#ff4500",
    orchid: "#da70d6",
    palegoldenrod: "#eee8aa",
    palegreen: "#98fb98",
    paleturquoise: "#afeeee",
    palevioletred: "#db7093",
    papayawhip: "#ffefd5",
    peachpuff: "#ffdab9",
    peru: "#cd853f",
    pink: "#ffc0cb",
    plum: "#dda0dd",
    powderblue: "#b0e0e6",
    purple: "#800080",
    rebeccapurple: "#663399",
    red: "#ff0000",
    rosybrown: "#bc8f8f",
    royalblue: "#4169e1",
    saddlebrown: "#8b4513",
    salmon: "#fa8072",
    sandybrown: "#f4a460",
    seagreen: "#2e8b57",
    seashell: "#fff5ee",
    sienna: "#a0522d",
    silver: "#c0c0c0",
    skyblue: "#87ceeb",
    slateblue: "#6a5acd",
    slategray: "#708090",
    slategrey: "#708090",
    snow: "#fffafa",
    springgreen: "#00ff7f",
    tan: "#d2b48c",
    teal: "#008080",
    thistle: "#d8bfd8",
    transparent: "#00000000",
    turquoise: "#40e0d0",
    violet: "#ee82ee",
    wheat: "#f5deb3",
    white: "#ffffff",
    whitesmoke: "#f5f5f5",
    yellow: "#ffff00",
    yellowgreen: "#9acd32"
  },
  /* API */
  parse: (t) => {
    t = t.toLowerCase();
    const e = Ji.colors[t];
    if (e)
      return oi.parse(e);
  },
  stringify: (t) => {
    const e = oi.stringify(t);
    for (const r in Ji.colors)
      if (Ji.colors[r] === e)
        return r;
  }
}, qi = {
  /* VARIABLES */
  re: /^rgba?\(\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))(?:\s*?(?:,|\/)\s*?\+?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?)))?\s*?\)$/i,
  /* API */
  parse: (t) => {
    const e = t.charCodeAt(0);
    if (e !== 114 && e !== 82)
      return;
    const r = t.match(qi.re);
    if (!r)
      return;
    const [, i, n, s, a, o, l, c, h] = r;
    return na.set({
      r: ct.channel.clamp.r(n ? parseFloat(i) * 2.55 : parseFloat(i)),
      g: ct.channel.clamp.g(a ? parseFloat(s) * 2.55 : parseFloat(s)),
      b: ct.channel.clamp.b(l ? parseFloat(o) * 2.55 : parseFloat(o)),
      a: c ? ct.channel.clamp.a(h ? parseFloat(c) / 100 : parseFloat(c)) : 1
    }, t);
  },
  stringify: (t) => {
    const { r: e, g: r, b: i, a: n } = t;
    return n < 1 ? `rgba(${ct.lang.round(e)}, ${ct.lang.round(r)}, ${ct.lang.round(i)}, ${ct.lang.round(n)})` : `rgb(${ct.lang.round(e)}, ${ct.lang.round(r)}, ${ct.lang.round(i)})`;
  }
}, Ie = {
  /* VARIABLES */
  format: {
    keyword: Ji,
    hex: oi,
    rgb: qi,
    rgba: qi,
    hsl: vr,
    hsla: vr
  },
  /* API */
  parse: (t) => {
    if (typeof t != "string")
      return t;
    const e = oi.parse(t) || qi.parse(t) || vr.parse(t) || Ji.parse(t);
    if (e)
      return e;
    throw new Error(`Unsupported color format: "${t}"`);
  },
  stringify: (t) => !t.changed && t.color ? t.color : t.type.is(Wt.HSL) || t.data.r === void 0 ? vr.stringify(t) : t.a < 1 || !Number.isInteger(t.r) || !Number.isInteger(t.g) || !Number.isInteger(t.b) ? qi.stringify(t) : oi.stringify(t)
}, Af = (t, e) => {
  const r = Ie.parse(t);
  for (const i in e)
    r[i] = ct.channel.clamp[i](e[i]);
  return Ie.stringify(r);
}, tn = (t, e, r = 0, i = 1) => {
  if (typeof t != "number")
    return Af(t, { a: e });
  const n = na.set({
    r: ct.channel.clamp.r(t),
    g: ct.channel.clamp.g(e),
    b: ct.channel.clamp.b(r),
    a: ct.channel.clamp.a(i)
  });
  return Ie.stringify(n);
}, pb = (t) => {
  const { r: e, g: r, b: i } = Ie.parse(t), n = 0.2126 * ct.channel.toLinear(e) + 0.7152 * ct.channel.toLinear(r) + 0.0722 * ct.channel.toLinear(i);
  return ct.lang.round(n);
}, gb = (t) => pb(t) >= 0.5, _n = (t) => !gb(t), Lf = (t, e, r) => {
  const i = Ie.parse(t), n = i[e], s = ct.channel.clamp[e](n + r);
  return n !== s && (i[e] = s), Ie.stringify(i);
}, X = (t, e) => Lf(t, "l", e), nt = (t, e) => Lf(t, "l", -e), T = (t, e) => {
  const r = Ie.parse(t), i = {};
  for (const n in e)
    e[n] && (i[n] = r[n] + e[n]);
  return Af(t, i);
}, mb = (t, e, r = 50) => {
  const { r: i, g: n, b: s, a } = Ie.parse(t), { r: o, g: l, b: c, a: h } = Ie.parse(e), u = r / 100, f = u * 2 - 1, d = a - h, m = ((f * d === -1 ? f : (f + d) / (1 + f * d)) + 1) / 2, y = 1 - m, x = i * m + o * y, b = n * m + l * y, C = s * m + c * y, k = a * u + h * (1 - u);
  return tn(x, b, C, k);
}, q = (t, e = 100) => {
  const r = Ie.parse(t);
  return r.r = 255 - r.r, r.g = 255 - r.g, r.b = 255 - r.b, mb(r, t, e);
};
function dh(t, e) {
  (e == null || e > t.length) && (e = t.length);
  for (var r = 0, i = Array(e); r < e; r++) i[r] = t[r];
  return i;
}
function yb(t) {
  if (Array.isArray(t)) return t;
}
function xb(t, e) {
  var r = t == null ? null : typeof Symbol < "u" && t[Symbol.iterator] || t["@@iterator"];
  if (r != null) {
    var i, n, s, a, o = [], l = !0, c = !1;
    try {
      if (s = (r = r.call(t)).next, e !== 0) for (; !(l = (i = s.call(r)).done) && (o.push(i.value), o.length !== e); l = !0) ;
    } catch (h) {
      c = !0, n = h;
    } finally {
      try {
        if (!l && r.return != null && (a = r.return(), Object(a) !== a)) return;
      } finally {
        if (c) throw n;
      }
    }
    return o;
  }
}
function bb() {
  throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function wb(t, e) {
  return yb(t) || xb(t, e) || Cb(t, e) || bb();
}
function Cb(t, e) {
  if (t) {
    if (typeof t == "string") return dh(t, e);
    var r = {}.toString.call(t).slice(8, -1);
    return r === "Object" && t.constructor && (r = t.constructor.name), r === "Map" || r === "Set" ? Array.from(t) : r === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r) ? dh(t, e) : void 0;
  }
}
const Ef = Object.entries, ph = Object.setPrototypeOf, _b = Object.isFrozen, kb = Object.getPrototypeOf, Sb = Object.getOwnPropertyDescriptor;
let Ot = Object.freeze, Rt = Object.seal, ri = Object.create, Bf = typeof Reflect < "u" && Reflect, _o = Bf.apply, ko = Bf.construct;
Ot || (Ot = function(e) {
  return e;
});
Rt || (Rt = function(e) {
  return e;
});
_o || (_o = function(e, r) {
  for (var i = arguments.length, n = new Array(i > 2 ? i - 2 : 0), s = 2; s < i; s++)
    n[s - 2] = arguments[s];
  return e.apply(r, n);
});
ko || (ko = function(e) {
  for (var r = arguments.length, i = new Array(r > 1 ? r - 1 : 0), n = 1; n < r; n++)
    i[n - 1] = arguments[n];
  return new e(...i);
});
const Cr = Et(Array.prototype.forEach), vb = Et(Array.prototype.lastIndexOf), gh = Et(Array.prototype.pop), $i = Et(Array.prototype.push), Tb = Et(Array.prototype.splice), li = Array.isArray, Hi = Et(String.prototype.toLowerCase), Ga = Et(String.prototype.toString), mh = Et(String.prototype.match), Fi = Et(String.prototype.replace), yh = Et(String.prototype.indexOf), Ab = Et(String.prototype.trim), Lb = Et(Number.prototype.toString), Eb = Et(Boolean.prototype.toString), xh = typeof BigInt > "u" ? null : Et(BigInt.prototype.toString), bh = typeof Symbol > "u" ? null : Et(Symbol.prototype.toString), ee = Et(Object.prototype.hasOwnProperty), Oi = Et(Object.prototype.toString), zt = Et(RegExp.prototype.test), br = Bb(TypeError);
function Et(t) {
  return function(e) {
    e instanceof RegExp && (e.lastIndex = 0);
    for (var r = arguments.length, i = new Array(r > 1 ? r - 1 : 0), n = 1; n < r; n++)
      i[n - 1] = arguments[n];
    return _o(t, e, i);
  };
}
function Bb(t) {
  return function() {
    for (var e = arguments.length, r = new Array(e), i = 0; i < e; i++)
      r[i] = arguments[i];
    return ko(t, r);
  };
}
function pt(t, e) {
  let r = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : Hi;
  if (ph && ph(t, null), !li(e))
    return t;
  let i = e.length;
  for (; i--; ) {
    let n = e[i];
    if (typeof n == "string") {
      const s = r(n);
      s !== n && (_b(e) || (e[i] = s), n = s);
    }
    t[n] = !0;
  }
  return t;
}
function Mb(t) {
  for (let e = 0; e < t.length; e++)
    ee(t, e) || (t[e] = null);
  return t;
}
function le(t) {
  const e = ri(null);
  for (const i of Ef(t)) {
    var r = wb(i, 2);
    const n = r[0], s = r[1];
    ee(t, n) && (li(s) ? e[n] = Mb(s) : s && typeof s == "object" && s.constructor === Object ? e[n] = le(s) : e[n] = s);
  }
  return e;
}
function $b(t) {
  switch (typeof t) {
    case "string":
      return t;
    case "number":
      return Lb(t);
    case "boolean":
      return Eb(t);
    case "bigint":
      return xh ? xh(t) : "0";
    case "symbol":
      return bh ? bh(t) : "Symbol()";
    case "undefined":
      return Oi(t);
    case "function":
    case "object": {
      if (t === null)
        return Oi(t);
      const e = t, r = ue(e, "toString");
      if (typeof r == "function") {
        const i = r(e);
        return typeof i == "string" ? i : Oi(i);
      }
      return Oi(t);
    }
    default:
      return Oi(t);
  }
}
function ue(t, e) {
  for (; t !== null; ) {
    const i = Sb(t, e);
    if (i) {
      if (i.get)
        return Et(i.get);
      if (typeof i.value == "function")
        return Et(i.value);
    }
    t = kb(t);
  }
  function r() {
    return null;
  }
  return r;
}
function Fb(t) {
  try {
    return zt(t, ""), !0;
  } catch {
    return !1;
  }
}
const wh = Ot(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "search", "section", "select", "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]), Va = Ot(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "enterkeyhint", "exportparts", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "inputmode", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "part", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]), Ka = Ot(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]), Ob = Ot(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]), Za = Ot(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]), Db = Ot(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]), Ch = Ot(["#text"]), _h = Ot(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "command", "commandfor", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "exportparts", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inert", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "part", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "slot", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns"]), Qa = Ot(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dominant-baseline", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "mask-type", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "pointer-events", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-orientation", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "vector-effect", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]), kh = Ot(["accent", "accentunder", "align", "bevelled", "close", "columnalign", "columnlines", "columnspacing", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lquote", "lspace", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]), Un = Ot(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]), Ib = Rt(/{{[\w\W]*|^[\w\W]*}}/g), Rb = Rt(/<%[\w\W]*|^[\w\W]*%>/g), Pb = Rt(/\${[\w\W]*/g), Nb = Rt(/^data-[\-\w.\u00B7-\uFFFF]+$/), zb = Rt(/^aria-[\-\w]+$/), Sh = Rt(
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  // eslint-disable-line no-useless-escape
), Wb = Rt(/^(?:\w+script|data):/i), qb = Rt(
  /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g
  // eslint-disable-line no-control-regex
), Hb = Rt(/^html$/i), Yb = Rt(/^[a-z][.\w]*(-[.\w]+)+$/i), vh = Rt(/<[/\w!]/g), Th = Rt(/<[/\w]/g), jb = Rt(/<\/no(script|embed|frames)/i), Ub = Rt(/\/>/i), ae = {
  element: 1,
  attribute: 2,
  text: 3,
  cdataSection: 4,
  entityReference: 5,
  // Deprecated
  entityNode: 6,
  // Deprecated
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  documentFragment: 11,
  notation: 12
  // Deprecated
}, Mf = ["style", "script", "xmp", "iframe", "noembed", "noframes", "plaintext", "noscript"], Xb = Ot(pt({}, Mf)), Gb = (function() {
  const t = {};
  return Cr(Mf, (e) => {
    t[e] = Rt(new RegExp("</" + e + "(?=[\\t\\n\\f\\r />])", "i"));
  }), Ot(t);
})(), Vb = function() {
  return typeof window > "u" ? null : window;
}, Kb = function(e, r) {
  if (typeof e != "object" || typeof e.createPolicy != "function")
    return null;
  let i = null;
  const n = "data-tt-policy-suffix";
  r && r.hasAttribute(n) && (i = r.getAttribute(n));
  const s = "dompurify" + (i ? "#" + i : "");
  try {
    return e.createPolicy(s, {
      createHTML(a) {
        return a;
      },
      createScriptURL(a) {
        return a;
      }
    });
  } catch {
    return console.warn("TrustedTypes policy " + s + " could not be created."), null;
  }
}, Ah = function() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
}, er = function(e, r, i, n) {
  return ee(e, r) && li(e[r]) ? pt(n.base ? le(n.base) : {}, e[r], n.transform) : i;
}, Ja = function(e, r, i) {
  const n = ee(e, r) ? e[r] : void 0;
  return n && typeof n == "object" ? le(n) : i();
};
function $f() {
  let t = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : Vb();
  const e = (z) => $f(z);
  if (e.version = "3.4.15", e.removed = [], !t || !t.document || t.document.nodeType !== ae.document || !t.Element)
    return e.isSupported = !1, e;
  let r = t.document;
  const i = r, n = i.currentScript;
  t.DocumentFragment;
  const s = t.HTMLTemplateElement, a = t.Node, o = t.Element, l = t.NodeFilter, c = t.NamedNodeMap;
  c === void 0 && (t.NamedNodeMap || t.MozNamedAttrMap), t.HTMLFormElement;
  const h = t.DOMParser, u = t.trustedTypes, f = o.prototype, d = ue(f, "cloneNode"), g = ue(f, "remove"), m = ue(f, "removeAttributeNode"), y = ue(f, "nextSibling"), x = ue(f, "childNodes"), b = ue(f, "parentNode"), C = ue(f, "shadowRoot"), k = ue(f, "attributes"), _ = a && a.prototype ? ue(a.prototype, "nodeType") : null, E = a && a.prototype ? ue(a.prototype, "nodeName") : null, B = a && a.prototype ? ue(a.prototype, "ownerDocument") : null, S = function(w) {
    return _ ? _(w) : w.nodeType;
  }, I = function(w) {
    return E ? E(w) : w.nodeName;
  };
  if (typeof s == "function") {
    const z = r.createElement("template");
    z.content && z.content.ownerDocument && (r = z.content.ownerDocument);
  }
  let O, D = "", W, N = !1, $ = 0;
  const F = function() {
    if ($ > 0)
      throw br('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.');
  }, A = function(w) {
    F(), $++;
    try {
      return O.createHTML(w);
    } finally {
      $--;
    }
  }, L = function(w) {
    F(), $++;
    try {
      return O.createScriptURL(w);
    } finally {
      $--;
    }
  }, M = function() {
    return N || (W = Kb(u, n), N = !0), W;
  }, H = r, Y = H.implementation, it = H.createNodeIterator, J = H.createDocumentFragment, tt = H.getElementsByTagName, ht = i.importNode;
  let Z = Ah();
  e.isSupported = typeof Ef == "function" && typeof b == "function" && Y && Y.createHTMLDocument !== void 0;
  const Bt = Ib, It = Rb, Se = Pb, ve = Nb, At = zb, Te = Wb, Ze = qb, Xr = Yb;
  let Oc = Sh, Ct = null;
  const Ma = pt({}, [...wh, ...Va, ...Ka, ...Za, ...Ch]);
  let _t = null;
  const $a = pt({}, [..._h, ...Qa, ...kh, ...Un]);
  let Ae = Object.seal(ri(null, {
    tagNameCheck: {
      writable: !0,
      configurable: !1,
      enumerable: !0,
      value: null
    },
    attributeNameCheck: {
      writable: !0,
      configurable: !1,
      enumerable: !0,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: !0,
      configurable: !1,
      enumerable: !0,
      value: !1
    }
  })), Li = null, Dc = null;
  const Qe = Object.seal(ri(null, {
    tagCheck: {
      writable: !0,
      configurable: !1,
      enumerable: !0,
      value: null
    },
    attributeCheck: {
      writable: !0,
      configurable: !1,
      enumerable: !0,
      value: null
    }
  }));
  let Ic = !0, Fa = !0, Rc = !1, Pc = !0, Je = !1, gr = !0, mr = !1, Oa = !1, $n = null, Fn = null, Da = !1, Gr = !1, On = !1, Dn = !1, Nc = !0, zc = !1;
  const Wc = "user-content-";
  let Ia = !0, Ra = !1, Vr = {}, Kr = null;
  const qc = pt({}, [
    "annotation-xml",
    "audio",
    "colgroup",
    "desc",
    "foreignobject",
    "head",
    "iframe",
    "math",
    "mi",
    "mn",
    "mo",
    "ms",
    "mtext",
    "noembed",
    "noframes",
    "noscript",
    "plaintext",
    "script",
    // <selectedcontent> mirrors the selected <option>'s subtree, cloned by
    // the UA (customizable <select>) — including any on* handlers — and the
    // engine re-mirrors synchronously whenever a removal changes which
    // option/selectedcontent is current, even inside DOMPurify's inert
    // DOMParser document. Hoisting its children on removal re-inserts a fresh
    // mirror target ahead of the walk, which the engine refills, looping
    // forever (DoS) and amplifying output. Dropping its content on removal
    // (rather than hoisting) breaks that cascade; the content is a duplicate
    // of the option, which is sanitized on its own. See campaign-3 F1/F6.
    "selectedcontent",
    "style",
    "svg",
    "template",
    "thead",
    "title",
    "video",
    "xmp"
  ]);
  let Hc = null;
  const Yc = pt({}, ["audio", "video", "img", "source", "image", "track"]);
  let jc = null;
  const Uc = pt({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]), In = "http://www.w3.org/1998/Math/MathML", Rn = "http://www.w3.org/2000/svg", Le = "http://www.w3.org/1999/xhtml";
  let Zr = Le, Pa = !1, Na = null;
  const tx = pt({}, [In, Rn, Le], Ga), Xc = Ot(["mi", "mo", "mn", "ms", "mtext"]);
  let za = pt({}, Xc);
  const Gc = Ot(["annotation-xml"]);
  let Wa = pt({}, Gc);
  const ex = pt({}, ["title", "style", "font", "a", "script"]);
  let Ei = null;
  const rx = ["application/xhtml+xml", "text/html"], ix = "text/html";
  let vt = null, Qr = null;
  const nx = r.createElement("form"), Vc = function(w) {
    return w instanceof RegExp || w instanceof Function;
  }, qa = function() {
    let w = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    if (Qr && Qr === w)
      return;
    (!w || typeof w != "object") && (w = {}), w = le(w), Ei = // eslint-disable-next-line unicorn/prefer-includes
    rx.indexOf(w.PARSER_MEDIA_TYPE) === -1 ? ix : w.PARSER_MEDIA_TYPE, vt = Ei === "application/xhtml+xml" ? Ga : Hi, Ct = er(w, "ALLOWED_TAGS", Ma, {
      transform: vt
    }), _t = er(w, "ALLOWED_ATTR", $a, {
      transform: vt
    }), Na = er(w, "ALLOWED_NAMESPACES", tx, {
      transform: Ga
    }), jc = er(w, "ADD_URI_SAFE_ATTR", Uc, {
      transform: vt,
      base: Uc
    }), Hc = er(w, "ADD_DATA_URI_TAGS", Yc, {
      transform: vt,
      base: Yc
    }), Kr = er(w, "FORBID_CONTENTS", qc, {
      transform: vt
    }), Li = er(w, "FORBID_TAGS", le({}), {
      transform: vt
    }), Dc = er(w, "FORBID_ATTR", le({}), {
      transform: vt
    }), Vr = ee(w, "USE_PROFILES") ? w.USE_PROFILES && typeof w.USE_PROFILES == "object" ? le(w.USE_PROFILES) : w.USE_PROFILES : !1, Ic = w.ALLOW_ARIA_ATTR !== !1, Fa = w.ALLOW_DATA_ATTR !== !1, Rc = w.ALLOW_UNKNOWN_PROTOCOLS || !1, Pc = w.ALLOW_SELF_CLOSE_IN_ATTR !== !1, Je = w.SAFE_FOR_TEMPLATES || !1, gr = w.SAFE_FOR_XML !== !1, mr = w.WHOLE_DOCUMENT || !1, Gr = w.RETURN_DOM || !1, On = w.RETURN_DOM_FRAGMENT || !1, Dn = w.RETURN_TRUSTED_TYPE || !1, Da = w.FORCE_BODY || !1, Nc = w.SANITIZE_DOM !== !1, zc = w.SANITIZE_NAMED_PROPS || !1, Ia = w.KEEP_CONTENT !== !1, Ra = w.IN_PLACE || !1, Oc = Fb(w.ALLOWED_URI_REGEXP) ? w.ALLOWED_URI_REGEXP : Sh, Zr = typeof w.NAMESPACE == "string" ? w.NAMESPACE : Le, za = Ja(
      w,
      "MATHML_TEXT_INTEGRATION_POINTS",
      () => pt({}, Xc)
      // Default built-in map
    ), Wa = Ja(
      w,
      "HTML_INTEGRATION_POINTS",
      () => pt({}, Gc)
      // Default built-in map
    );
    const v = Ja(w, "CUSTOM_ELEMENT_HANDLING", () => ri(null));
    if (Ae = ri(null), ee(v, "tagNameCheck") && Vc(v.tagNameCheck) && (Ae.tagNameCheck = v.tagNameCheck), ee(v, "attributeNameCheck") && Vc(v.attributeNameCheck) && (Ae.attributeNameCheck = v.attributeNameCheck), ee(v, "allowCustomizedBuiltInElements") && typeof v.allowCustomizedBuiltInElements == "boolean" && (Ae.allowCustomizedBuiltInElements = v.allowCustomizedBuiltInElements), Rt(Ae), Je && (Fa = !1), On && (Gr = !0), Vr && (Ct = pt({}, Ch), _t = ri(null), Vr.html === !0 && (pt(Ct, wh), pt(_t, _h)), Vr.svg === !0 && (pt(Ct, Va), pt(_t, Qa), pt(_t, Un)), Vr.svgFilters === !0 && (pt(Ct, Ka), pt(_t, Qa), pt(_t, Un)), Vr.mathMl === !0 && (pt(Ct, Za), pt(_t, kh), pt(_t, Un))), Qe.tagCheck = null, Qe.attributeCheck = null, ee(w, "ADD_TAGS") && (typeof w.ADD_TAGS == "function" ? Qe.tagCheck = w.ADD_TAGS : li(w.ADD_TAGS) && (Ct === Ma && (Ct = le(Ct)), pt(Ct, w.ADD_TAGS, vt))), ee(w, "ADD_ATTR") && (typeof w.ADD_ATTR == "function" ? Qe.attributeCheck = w.ADD_ATTR : li(w.ADD_ATTR) && (_t === $a && (_t = le(_t)), pt(_t, w.ADD_ATTR, vt))), ee(w, "ADD_FORBID_CONTENTS") && li(w.ADD_FORBID_CONTENTS) && (Kr === qc && (Kr = le(Kr)), pt(Kr, w.ADD_FORBID_CONTENTS, vt)), Ia && (Ct["#text"] = !0), mr && pt(Ct, ["html", "head", "body"]), Ct.table && (pt(Ct, ["tbody"]), delete Li.tbody), w.TRUSTED_TYPES_POLICY) {
      if (typeof w.TRUSTED_TYPES_POLICY.createHTML != "function")
        throw br('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      if (typeof w.TRUSTED_TYPES_POLICY.createScriptURL != "function")
        throw br('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      const P = O;
      O = w.TRUSTED_TYPES_POLICY;
      try {
        D = A("");
      } catch (j) {
        throw O = P, j;
      }
    } else w.TRUSTED_TYPES_POLICY === null ? (O = void 0, D = "") : (O === void 0 && (O = M()), O && typeof D == "string" && (D = A("")));
    Ot && Ot(w), Qr = w;
  }, Kc = pt({}, [...Va, ...Ka, ...Ob]), Zc = pt({}, [...Za, ...Db]), sx = function(w, v, P) {
    return v.namespaceURI === Le ? w === "svg" : v.namespaceURI === In ? w === "svg" && (P === "annotation-xml" || za[P]) : !!Kc[w];
  }, ax = function(w, v, P) {
    return v.namespaceURI === Le ? w === "math" : v.namespaceURI === Rn ? w === "math" && Wa[P] : !!Zc[w];
  }, ox = function(w, v, P) {
    return v.namespaceURI === Rn && !Wa[P] || v.namespaceURI === In && !za[P] ? !1 : !Zc[w] && (ex[w] || !Kc[w]);
  }, lx = function(w) {
    let v = b(w);
    (!v || !v.tagName) && (v = {
      namespaceURI: Zr,
      tagName: "template"
    });
    const P = Hi(w.tagName), j = Hi(v.tagName);
    return Na[w.namespaceURI] ? w.namespaceURI === Rn ? sx(P, v, j) : w.namespaceURI === In ? ax(P, v, j) : w.namespaceURI === Le ? ox(P, v, j) : !!(Ei === "application/xhtml+xml" && Na[w.namespaceURI]) : !1;
  }, tr = function(w) {
    $i(e.removed, {
      element: w
    });
    try {
      b(w).removeChild(w);
    } catch {
      if (g(w), !b(w))
        throw br("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
    }
  }, Qc = function(w, v, P) {
    try {
      m(w, v);
    } catch {
      try {
        w.removeAttribute(P);
      } catch {
      }
    }
  }, Pn = function(w) {
    Nn(w);
    const v = x(w);
    if (v) {
      const j = [];
      Cr(v, (et) => {
        $i(j, et);
      }), Cr(j, (et) => {
        try {
          g(et);
        } catch {
        }
      });
    }
    const P = k(w);
    if (P)
      for (let j = P.length - 1; j >= 0; --j) {
        const et = P[j], lt = et && et.name;
        typeof lt == "string" && Qc(w, et, lt);
      }
  }, yr = function(w, v, P) {
    if (!P)
      try {
        P = v.getAttributeNode(w);
      } catch {
        P = null;
      }
    $i(e.removed, {
      attribute: P || null,
      from: v
    });
    try {
      P ? m(v, P) : v.removeAttribute(w);
    } catch {
      try {
        v.removeAttribute(w);
      } catch {
      }
    }
    if (w === "is")
      if (Gr || On)
        try {
          tr(v);
        } catch {
        }
      else
        try {
          v.setAttribute(w, "");
        } catch {
        }
  }, cx = function(w) {
    const v = k(w);
    if (v)
      for (let P = v.length - 1; P >= 0; --P) {
        const j = v[P], et = j && j.name;
        typeof et != "string" || _t[vt(et)] || Qc(w, j, et);
      }
  }, Nn = function(w) {
    const v = [w];
    for (; v.length > 0; ) {
      const P = v.pop();
      S(P) === ae.element && cx(P);
      const et = x(P);
      if (et)
        for (let lt = et.length - 1; lt >= 0; --lt)
          v.push(et[lt]);
    }
  }, Jc = function(w, v) {
    return gr ? w === "patchsrc" ? !0 : w === "for" && v !== "label" && v !== "output" : !1;
  }, hx = function(w) {
    if (!gr)
      return;
    const v = [w];
    for (; v.length > 0; ) {
      const P = v.pop(), j = S(P);
      if (j === ae.processingInstruction || j === ae.comment && zt(Th, P.data)) {
        try {
          g(P);
        } catch {
        }
        continue;
      }
      if (j === ae.element) {
        const lt = P, bt = vt(I(P));
        try {
          lt.hasAttribute && lt.hasAttribute("patchsrc") && lt.removeAttribute("patchsrc"), lt.hasAttribute && lt.hasAttribute("for") && Jc("for", bt) && lt.removeAttribute("for");
        } catch {
        }
      }
      const et = x(P);
      if (et)
        for (let lt = et.length - 1; lt >= 0; --lt)
          v.push(et[lt]);
    }
  }, th = function(w) {
    let v = null, P = null;
    if (Da)
      w = "<remove></remove>" + w;
    else {
      const lt = mh(w, /^[\r\n\t ]+/);
      P = lt && lt[0];
    }
    Ei === "application/xhtml+xml" && Zr === Le && (w = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + w + "</body></html>");
    const j = O ? A(w) : w;
    if (Zr === Le)
      try {
        v = new h().parseFromString(j, Ei);
      } catch {
      }
    if (!v || !v.documentElement) {
      v = Y.createDocument(Zr, "template", null);
      try {
        v.documentElement.innerHTML = Pa ? D : j;
      } catch {
      }
    }
    const et = v.body || v.documentElement;
    return w && P && et.insertBefore(r.createTextNode(P), et.childNodes[0] || null), Zr === Le ? tt.call(v, mr ? "html" : "body")[0] : mr ? v.documentElement : et;
  }, eh = function(w) {
    const v = B ? B(w) : w.ownerDocument;
    return it.call(
      v || w,
      w,
      // eslint-disable-next-line no-bitwise
      l.SHOW_ELEMENT | l.SHOW_COMMENT | l.SHOW_TEXT | l.SHOW_PROCESSING_INSTRUCTION | l.SHOW_CDATA_SECTION,
      null
    );
  }, zn = function(w) {
    return w = Fi(w, Bt, " "), w = Fi(w, It, " "), w = Fi(w, Se, " "), w;
  }, Ha = function(w) {
    var v;
    w.normalize();
    const P = B ? B(w) : w.ownerDocument, j = it.call(
      P || w,
      w,
      // eslint-disable-next-line no-bitwise
      l.SHOW_TEXT | l.SHOW_COMMENT | l.SHOW_CDATA_SECTION | l.SHOW_PROCESSING_INSTRUCTION,
      null
    );
    let et = j.nextNode();
    for (; et; )
      et.data = zn(et.data), et = j.nextNode();
    const lt = (v = w.querySelectorAll) === null || v === void 0 ? void 0 : v.call(w, "template");
    lt && Cr(lt, (bt) => {
      Jr(bt.content) && Ha(bt.content);
    });
  }, Wn = function(w) {
    const v = E ? E(w) : null;
    return typeof v != "string" || vt(v) !== "form" ? !1 : typeof w.nodeName != "string" || typeof w.textContent != "string" || typeof w.removeChild != "function" || // Realm-safe NamedNodeMap detection: equality against the cached
    // prototype getter. Clobbered .attributes (e.g. <input name="attributes">)
    // makes the direct read diverge from the cached read; a clean form
    // (same-realm OR foreign-realm) has both reads pointing at the same
    // canonical NamedNodeMap.
    w.attributes !== k(w) || typeof w.removeAttribute != "function" || // A form descendant named "removeAttributeNode" or "getAttributeNode"
    // shadows these Attr-node methods via [LegacyOverrideBuiltIns].
    // _removeAttribute() / _stripAttributeNode() reach for
    // element.removeAttributeNode(attr) first; when it is shadowed the call
    // throws and the name-based fallback element.removeAttribute(name)
    // ASCII-lowercases its lookup key in an HTML document, silently missing
    // a case-preserved event-handler attribute (e.g. an ONANIMATIONSTART
    // that reached the sanitizer through an XML/XHTML parse). Flag the form
    // so it is removed wholesale, exactly as for the other shadowed methods.
    typeof w.removeAttributeNode != "function" || typeof w.getAttributeNode != "function" || typeof w.setAttribute != "function" || typeof w.namespaceURI != "string" || typeof w.insertBefore != "function" || typeof w.hasChildNodes != "function" || // NodeType clobbering probe. Cached Node.prototype.nodeType getter
    // returns the integer 1 for any Element regardless of realm; direct
    // read on a clobbered form (e.g. <input name="nodeType">) returns
    // the named child element. Cheap addition — nodeType is read from
    // an internal slot, no serialization cost — and removes a residual
    // clobbering surface used by several mXSS / PI / comment branches
    // in _sanitizeElements that compare currentNode.nodeType directly.
    w.nodeType !== _(w) || // HTMLFormElement has [LegacyOverrideBuiltIns]: a descendant named
    // "childNodes" shadows the prototype getter. Direct reads of
    // form.childNodes from a clobbered form return the named child
    // instead of the real NodeList, so any walk that reads it directly
    // skips the form's real children. Compare the direct read to the
    // cached Node.prototype getter — when the form's named-property
    // getter intercepts the read, the two values differ and we flag
    // the form. This catches every clobbering child type (input,
    // select, etc.) regardless of whether the named child happens to
    // carry a numeric .length, which a typeof-based probe would miss
    // (e.g. HTMLSelectElement.length is a defined unsigned-long).
    w.childNodes !== x(w);
  }, Jr = function(w) {
    if (!_ || typeof w != "object" || w === null)
      return !1;
    try {
      return _(w) === ae.documentFragment;
    } catch {
      return !1;
    }
  }, Bi = function(w) {
    if (!_ || typeof w != "object" || w === null)
      return !1;
    try {
      return typeof _(w) == "number";
    } catch {
      return !1;
    }
  };
  function Ee(z, w, v) {
    z.length !== 0 && Cr(z, (P) => {
      P.call(e, w, v, Qr);
    });
  }
  const ux = function(w, v) {
    return !!(gr && w.hasChildNodes() && !Bi(w.firstElementChild) && zt(vh, w.textContent) && zt(vh, w.innerHTML) || gr && w.namespaceURI === Le && Xb[v] && (Bi(w.firstElementChild) || typeof w.textContent == "string" && zt(Gb[v], w.textContent)) || w.nodeType === ae.processingInstruction || gr && w.nodeType === ae.comment && zt(Th, w.data));
  }, qn = function(w, v) {
    if (w instanceof RegExp)
      return zt(w, v);
    if (w instanceof Function) {
      for (var P = arguments.length, j = new Array(P > 2 ? P - 2 : 0), et = 2; et < P; et++)
        j[et - 2] = arguments[et];
      return !!w(v, ...j);
    }
    return !1;
  }, fx = function(w, v, P) {
    if (!Li[v] && ah(v) && qn(Ae.tagNameCheck, v))
      return !1;
    if (Ia && !Kr[v]) {
      const j = b(w), et = x(w);
      if (et && j) {
        const lt = et.length;
        for (let bt = lt - 1; bt >= 0; --bt) {
          const St = w === P ? d(et[bt], !0) : et[bt];
          j.insertBefore(St, y(w));
        }
      }
    }
    return tr(w), !0;
  }, rh = function(w, v, P, j) {
    return w.length === 0 ? v : v === P || v === j ? le(v) : v;
  }, ih = function(w, v) {
    return w === v || b(w) !== null ? !1 : (Ra && Nn(w), !0);
  }, nh = function(w, v) {
    if (Ee(Z.beforeSanitizeElements, w, null), ih(w, v))
      return !0;
    if (Wn(w))
      return tr(w), !0;
    const P = vt(I(w));
    if (Ct = rh(Z.uponSanitizeElement, Ct, Ma, $n), Ee(Z.uponSanitizeElement, w, {
      tagName: P,
      allowedTags: Ct
    }), ih(w, v))
      return !0;
    if (ux(w, P))
      return tr(w), !0;
    if (Li[P] || !(Qe.tagCheck instanceof Function && Qe.tagCheck(P)) && !Ct[P]) {
      const et = fx(w, P, v);
      return et === !1 && Ee(Z.afterSanitizeElements, w, null), et;
    }
    if (S(w) === ae.element && !lx(w) || (P === "noscript" || P === "noembed" || P === "noframes") && zt(jb, w.innerHTML))
      return tr(w), !0;
    if (Je && w.nodeType === ae.text) {
      const et = zn(w.textContent);
      w.textContent !== et && ($i(e.removed, {
        element: w.cloneNode()
      }), w.textContent = et);
    }
    return Ee(Z.afterSanitizeElements, w, null), !1;
  }, sh = function(w, v, P) {
    if (Dc[v] || Jc(v, w) || Nc && (v === "id" || v === "name") && (P in r || P in nx))
      return !1;
    const j = _t[v] || Qe.attributeCheck instanceof Function && Qe.attributeCheck(v, w);
    return Fa && zt(ve, v) || Ic && zt(At, v) ? !0 : j ? jc[v] || zt(Oc, Fi(P, Ze, "")) || (v === "src" || v === "xlink:href" || v === "href") && w !== "script" && yh(P, "data:") === 0 && Hc[w] || Rc && !zt(Te, Fi(P, Ze, "")) ? !0 : !P : (
      // Condition a) covers a basically valid custom element tag name whose
      // tag passes the configured tagNameCheck and whose attribute name
      // passes the configured attributeNameCheck ...
      ah(w) && qn(Ae.tagNameCheck, w) && qn(Ae.attributeNameCheck, v, w) || // Condition b) covers an `is` attribute whose value passes the
      // configured tagNameCheck while customized built-in elements are
      // allowed.
      v === "is" && Ae.allowCustomizedBuiltInElements && qn(Ae.tagNameCheck, P)
    );
  }, dx = pt({}, ["annotation-xml", "color-profile", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "missing-glyph"]), ah = function(w) {
    return !dx[Hi(w)] && zt(Xr, w);
  }, px = function(w, v, P, j) {
    if (O && typeof u == "object" && typeof u.getAttributeType == "function" && !P)
      switch (u.getAttributeType(w, v)) {
        case "TrustedHTML":
          return A(j);
        case "TrustedScriptURL":
          return L(j);
      }
    return j;
  }, gx = function(w, v, P, j) {
    try {
      return P ? w.setAttributeNS(P, v, j) : w.setAttribute(v, j), Wn(w) ? (tr(w), !1) : !0;
    } catch {
      return yr(v, w), !1;
    }
  }, oh = function(w) {
    Ee(Z.beforeSanitizeAttributes, w, null);
    const v = w.attributes;
    if (!v || Wn(w))
      return;
    _t = rh(Z.uponSanitizeAttribute, _t, $a, Fn);
    const P = {
      attrName: "",
      attrValue: "",
      keepAttr: !0,
      allowedAttributes: _t,
      forceKeepAttr: void 0
    };
    let j = v.length;
    const et = vt(w.nodeName);
    for (; j--; ) {
      const lt = v[j], bt = lt.name, St = lt.namespaceURI, Qt = lt.value, Jt = vt(bt), ja = Qt;
      let Xt = bt === "value" ? ja : Ab(ja), lh = !1;
      if (P.attrName = Jt, P.attrValue = Xt, P.keepAttr = !0, P.forceKeepAttr = void 0, Ee(Z.uponSanitizeAttribute, w, P), Xt = P.attrValue, zc && (Jt === "id" || Jt === "name") && yh(Xt, Wc) !== 0 && (yr(bt, w, lt), Xt = Wc + Xt, lh = !0), gr && zt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, Xt)) {
        yr(bt, w, lt);
        continue;
      }
      if (Jt === "attributename" && mh(Xt, "href")) {
        yr(bt, w, lt);
        continue;
      }
      if (!P.forceKeepAttr) {
        if (!P.keepAttr) {
          yr(bt, w, lt);
          continue;
        }
        if (!Pc && zt(Ub, Xt)) {
          yr(bt, w, lt);
          continue;
        }
        if (Je && (Xt = zn(Xt)), !sh(et, Jt, Xt)) {
          yr(bt, w, lt);
          continue;
        }
        Xt = px(et, Jt, St, Xt), Xt !== ja && gx(w, bt, St, Xt) && lh && gh(e.removed);
      }
    }
    Ee(Z.afterSanitizeAttributes, w, null);
  }, Hn = function(w) {
    let v = null;
    const P = eh(w);
    for (Ee(Z.beforeSanitizeShadowDOM, w, null); v = P.nextNode(); )
      if (Ee(Z.uponSanitizeShadowNode, v, null), nh(v, w), oh(v), Jr(v.content) && Hn(v.content), S(v) === ae.element) {
        const j = C(v);
        Jr(j) && (Ya(j), Hn(j));
      }
    Ee(Z.afterSanitizeShadowDOM, w, null);
  }, Ya = function(w) {
    const v = [{
      node: w,
      shadow: null
    }];
    for (; v.length > 0; ) {
      const P = v.pop();
      if (P.shadow) {
        Hn(P.shadow);
        continue;
      }
      const j = P.node, lt = S(j) === ae.element, bt = x(j);
      if (bt)
        for (let St = bt.length - 1; St >= 0; --St)
          v.push({
            node: bt[St],
            shadow: null
          });
      if (lt) {
        const St = E ? E(j) : null;
        if (typeof St == "string" && vt(St) === "template") {
          const Qt = j.content;
          Jr(Qt) && v.push({
            node: Qt,
            shadow: null
          });
        }
      }
      if (lt) {
        const St = C(j);
        Jr(St) && v.push({
          node: null,
          shadow: St
        }, {
          node: St,
          shadow: null
        });
      }
    }
  };
  return e.sanitize = function(z) {
    let w = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, v = null, P = null, j = null, et = null;
    if (Pa = !z, Pa && (z = "<!-->"), typeof z != "string" && !Bi(z) && (z = $b(z), typeof z != "string"))
      throw br("dirty is not a string, aborting");
    if (!e.isSupported)
      return z;
    Oa ? (Ct = $n, _t = Fn) : qa(w), (Z.uponSanitizeElement.length > 0 || Z.uponSanitizeAttribute.length > 0) && (Ct = le(Ct)), Z.uponSanitizeAttribute.length > 0 && (_t = le(_t)), e.removed = [];
    const lt = Ra && typeof z != "string" && Bi(z);
    if (lt) {
      hx(z);
      const Qt = I(z);
      if (typeof Qt == "string") {
        const Jt = vt(Qt);
        if (!Ct[Jt] || Li[Jt])
          throw Pn(z), br("root node is forbidden and cannot be sanitized in-place");
      }
      if (Wn(z))
        throw Pn(z), br("root node is clobbered and cannot be sanitized in-place");
      try {
        Ya(z);
      } catch (Jt) {
        throw Pn(z), Jt;
      }
    } else if (Bi(z))
      v = th("<!---->"), P = v.ownerDocument.importNode(z, !0), P.nodeType === ae.element && P.nodeName === "BODY" || P.nodeName === "HTML" ? v = P : v.appendChild(P), Ya(v);
    else {
      if (!Gr && !Je && !mr && // eslint-disable-next-line unicorn/prefer-includes
      z.indexOf("<") === -1)
        return O && Dn ? A(z) : z;
      if (v = th(z), !v)
        return Gr ? null : Dn ? D : "";
    }
    v && Da && tr(v.firstChild);
    const bt = lt ? z : v;
    try {
      const Qt = eh(bt);
      for (; j = Qt.nextNode(); )
        nh(j, bt), oh(j), Jr(j.content) && Hn(j.content);
    } catch (Qt) {
      throw lt && (Pn(z), Cr(e.removed, (Jt) => {
        Jt.element && Nn(Jt.element);
      })), Qt;
    }
    if (lt)
      return Cr(e.removed, (Qt) => {
        Qt.element && Nn(Qt.element);
      }), Je && Ha(z), z;
    if (Gr) {
      if (Je && Ha(v), On)
        for (et = J.call(v.ownerDocument); v.firstChild; )
          et.appendChild(v.firstChild);
      else
        et = v;
      return (_t.shadowroot || _t.shadowrootmode) && (et = ht.call(i, et, !0)), et;
    }
    let St = mr ? v.outerHTML : v.innerHTML;
    return mr && Ct["!doctype"] && v.ownerDocument && v.ownerDocument.doctype && v.ownerDocument.doctype.name && zt(Hb, v.ownerDocument.doctype.name) && (St = "<!DOCTYPE " + v.ownerDocument.doctype.name + `>
` + St), Je && (St = zn(St)), O && Dn ? A(St) : St;
  }, e.setConfig = function() {
    let z = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    qa(z), Oa = !0, $n = Ct, Fn = _t;
  }, e.clearConfig = function() {
    Qr = null, Oa = !1, $n = null, Fn = null, O = W, D = "";
  }, e.isValidAttribute = function(z, w, v) {
    Qr || qa({});
    const P = vt(z), j = vt(w);
    return sh(P, j, v);
  }, e.addHook = function(z, w) {
    typeof w == "function" && ee(Z, z) && $i(Z[z], w);
  }, e.removeHook = function(z, w) {
    if (ee(Z, z)) {
      if (w !== void 0) {
        const v = vb(Z[z], w);
        return v === -1 ? void 0 : Tb(Z[z], v, 1)[0];
      }
      return gh(Z[z]);
    }
  }, e.removeHooks = function(z) {
    ee(Z, z) && (Z[z] = []);
  }, e.removeAllHooks = function() {
    Z = Ah();
  }, e;
}
var fi = $f(), Ff = /^-{3}\s*[\n\r](.*?)[\n\r]-{3}\s*[\n\r]+/s, en = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi, Zb = /\s*%%.*\n/gm, Of = class extends Error {
  static {
    p(this, "UnknownDiagramError");
  }
  constructor(t) {
    super(t), this.name = "UnknownDiagramError";
  }
}, Or = {}, Ll = /* @__PURE__ */ p(function(t, e) {
  t = t.replace(Ff, "").replace(en, "").replace(Zb, `
`);
  for (const [r, { detector: i }] of Object.entries(Or))
    if (i(t, e))
      return r;
  throw new Of(
    `No diagram type detected matching given configuration for text: ${t}`
  );
}, "detectType"), So = /* @__PURE__ */ p((...t) => {
  for (const { id: e, detector: r, loader: i } of t)
    Df(e, r, i);
}, "registerLazyLoadedDiagrams"), Df = /* @__PURE__ */ p((t, e, r) => {
  Or[t] && R.warn(`Detector with key ${t} already exists. Overwriting.`), Or[t] = { detector: e, loader: r }, R.debug(`Detector with key ${t} added${r ? " with loader" : ""}`);
}, "addDetector"), Qb = /* @__PURE__ */ p((t) => Or[t].loader, "getDiagramLoader"), vo = /* @__PURE__ */ p((t, e, { depth: r = 2, clobber: i = !1 } = {}) => {
  const n = { depth: r, clobber: i };
  return Array.isArray(e) && !Array.isArray(t) ? (e.forEach((s) => vo(t, s, n)), t) : Array.isArray(e) && Array.isArray(t) ? (e.forEach((s) => {
    t.includes(s) || t.push(s);
  }), t) : t === void 0 || r <= 0 ? t != null && typeof t == "object" && typeof e == "object" ? Object.assign(t, e) : e : (e !== void 0 && typeof t == "object" && typeof e == "object" && Object.keys(e).forEach((s) => {
    typeof e[s] == "object" && (t[s] === void 0 || typeof t[s] == "object") ? (t[s] === void 0 && (t[s] = Array.isArray(e[s]) ? [] : {}), t[s] = vo(t[s], e[s], { depth: r - 1, clobber: i })) : (i || typeof t[s] != "object" && typeof e[s] != "object") && (t[s] = e[s]);
  }), t);
}, "assignWithDepth"), $t = vo, sa = "#ffffff", aa = "#f2f2f2", Vt = /* @__PURE__ */ p((t, e) => e ? T(t, { s: -40, l: 10 }) : T(t, { s: -40, l: -10 }), "mkBorder"), Jb = class {
  static {
    p(this, "Theme");
  }
  constructor() {
    this.background = "#f4f4f4", this.primaryColor = "#fff4dd", this.noteBkgColor = "#fff5ad", this.noteTextColor = "#333", this.THEME_COLOR_LIMIT = 12, this.fontFamily = '"trebuchet ms", verdana, arial, sans-serif', this.fontSize = "16px";
  }
  updateColors() {
    if (this.primaryTextColor = this.primaryTextColor || (this.darkMode ? "#eee" : "#333"), this.secondaryColor = this.secondaryColor || T(this.primaryColor, { h: -120 }), this.tertiaryColor = this.tertiaryColor || T(this.primaryColor, { h: 180, l: 5 }), this.primaryBorderColor = this.primaryBorderColor || Vt(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || Vt(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || Vt(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || Vt(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || "#fff5ad", this.noteTextColor = this.noteTextColor || "#333", this.secondaryTextColor = this.secondaryTextColor || q(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || q(this.tertiaryColor), this.lineColor = this.lineColor || q(this.background), this.arrowheadColor = this.arrowheadColor || q(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.primaryBorderColor, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? nt(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || nt(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || q(this.lineColor), this.sectionBkgColor = this.sectionBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.altSectionBkgColor || "white", this.sectionBkgColor = this.sectionBkgColor || this.secondaryColor, this.sectionBkgColor2 = this.sectionBkgColor2 || this.primaryColor, this.excludeBkgColor = this.excludeBkgColor || "#eeeeee", this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || this.primaryColor, this.activeTaskBorderColor = this.activeTaskBorderColor || this.primaryColor, this.activeTaskBkgColor = this.activeTaskBkgColor || X(this.primaryColor, 23), this.gridColor = this.gridColor || "lightgrey", this.doneTaskBkgColor = this.doneTaskBkgColor || "lightgrey", this.doneTaskBorderColor = this.doneTaskBorderColor || "grey", this.critBorderColor = this.critBorderColor || "#ff8888", this.critBkgColor = this.critBkgColor || "red", this.todayLineColor = this.todayLineColor || "red", this.vertLineColor = this.vertLineColor || "navy", this.taskTextColor = this.taskTextColor || this.textColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || "#003163", this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.darkMode ? (this.rowOdd = this.rowOdd || nt(this.mainBkg, 5) || "#ffffff", this.rowEven = this.rowEven || nt(this.mainBkg, 10)) : (this.rowOdd = this.rowOdd || X(this.mainBkg, 75) || "#ffffff", this.rowEven = this.rowEven || X(this.mainBkg, 5)), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || this.tertiaryColor, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || T(this.primaryColor, { h: 30 }), this.cScale4 = this.cScale4 || T(this.primaryColor, { h: 60 }), this.cScale5 = this.cScale5 || T(this.primaryColor, { h: 90 }), this.cScale6 = this.cScale6 || T(this.primaryColor, { h: 120 }), this.cScale7 = this.cScale7 || T(this.primaryColor, { h: 150 }), this.cScale8 = this.cScale8 || T(this.primaryColor, { h: 210, l: 150 }), this.cScale9 = this.cScale9 || T(this.primaryColor, { h: 270 }), this.cScale10 = this.cScale10 || T(this.primaryColor, { h: 300 }), this.cScale11 = this.cScale11 || T(this.primaryColor, { h: 330 }), this.darkMode)
      for (let e = 0; e < this.THEME_COLOR_LIMIT; e++)
        this["cScale" + e] = nt(this["cScale" + e], 75);
    else
      for (let e = 0; e < this.THEME_COLOR_LIMIT; e++)
        this["cScale" + e] = nt(this["cScale" + e], 25);
    for (let e = 0; e < this.THEME_COLOR_LIMIT; e++)
      this["cScaleInv" + e] = this["cScaleInv" + e] || q(this["cScale" + e]);
    for (let e = 0; e < this.THEME_COLOR_LIMIT; e++)
      this.darkMode ? this["cScalePeer" + e] = this["cScalePeer" + e] || X(this["cScale" + e], 10) : this["cScalePeer" + e] = this["cScalePeer" + e] || nt(this["cScale" + e], 10);
    this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
    for (let e = 0; e < this.THEME_COLOR_LIMIT; e++)
      this["cScaleLabel" + e] = this["cScaleLabel" + e] || this.scaleLabelColor;
    const t = this.darkMode ? -4 : -1;
    for (let e = 0; e < 5; e++)
      this["surface" + e] = this["surface" + e] || T(this.mainBkg, { h: 180, s: -15, l: t * (5 + e * 3) }), this["surfacePeer" + e] = this["surfacePeer" + e] || T(this.mainBkg, { h: 180, s: -15, l: t * (8 + e * 3) });
    this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || this.primaryColor, this.fillType1 = this.fillType1 || this.secondaryColor, this.fillType2 = this.fillType2 || T(this.primaryColor, { h: 64 }), this.fillType3 = this.fillType3 || T(this.secondaryColor, { h: 64 }), this.fillType4 = this.fillType4 || T(this.primaryColor, { h: -64 }), this.fillType5 = this.fillType5 || T(this.secondaryColor, { h: -64 }), this.fillType6 = this.fillType6 || T(this.primaryColor, { h: 128 }), this.fillType7 = this.fillType7 || T(this.secondaryColor, { h: 128 }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || T(this.primaryColor, { l: -10 }), this.pie5 = this.pie5 || T(this.secondaryColor, { l: -10 }), this.pie6 = this.pie6 || T(this.tertiaryColor, { l: -10 }), this.pie7 = this.pie7 || T(this.primaryColor, { h: 60, l: -10 }), this.pie8 = this.pie8 || T(this.primaryColor, { h: -60, l: -10 }), this.pie9 = this.pie9 || T(this.primaryColor, { h: 120, l: 0 }), this.pie10 = this.pie10 || T(this.primaryColor, { h: 60, l: -20 }), this.pie11 = this.pie11 || T(this.primaryColor, { h: -60, l: -20 }), this.pie12 = this.pie12 || T(this.primaryColor, { h: 120, l: -10 }), this.pieTitleTextSize = this.pieTitleTextSize || "25px", this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || "17px", this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || "17px", this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || "black", this.pieStrokeWidth = this.pieStrokeWidth || "2px", this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || "2px", this.pieOuterStrokeColor = this.pieOuterStrokeColor || "black", this.pieOpacity = this.pieOpacity || "0.7", this.radar = {
      axisColor: this.radar?.axisColor || this.lineColor,
      axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
      axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
      curveOpacity: this.radar?.curveOpacity || 0.5,
      curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
      graticuleColor: this.radar?.graticuleColor || "#DEDEDE",
      graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
      graticuleOpacity: this.radar?.graticuleOpacity || 0.3,
      legendBoxSize: this.radar?.legendBoxSize || 12,
      legendFontSize: this.radar?.legendFontSize || 12
    }, this.archEdgeColor = this.archEdgeColor || "#777", this.archEdgeArrowColor = this.archEdgeArrowColor || "#777", this.archEdgeWidth = this.archEdgeWidth || "3", this.archGroupBorderColor = this.archGroupBorderColor || "#000", this.archGroupBorderWidth = this.archGroupBorderWidth || "2px", this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || T(this.primaryColor, { r: 5, g: 5, b: 5 }), this.quadrant3Fill = this.quadrant3Fill || T(this.primaryColor, { r: 10, g: 10, b: 10 }), this.quadrant4Fill = this.quadrant4Fill || T(this.primaryColor, { r: 15, g: 15, b: 15 }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || T(this.primaryTextColor, { r: -5, g: -5, b: -5 }), this.quadrant3TextFill = this.quadrant3TextFill || T(this.primaryTextColor, { r: -10, g: -10, b: -10 }), this.quadrant4TextFill = this.quadrant4TextFill || T(this.primaryTextColor, { r: -15, g: -15, b: -15 }), this.quadrantPointFill = this.quadrantPointFill || _n(this.quadrant1Fill) ? X(this.quadrant1Fill) : nt(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
      backgroundColor: this.xyChart?.backgroundColor || this.background,
      titleColor: this.xyChart?.titleColor || this.primaryTextColor,
      xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
      xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
      xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
      xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
      yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
      yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
      yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
      yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
      plotColorPalette: this.xyChart?.plotColorPalette || "#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0"
    }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || "1", this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? nt(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || T(this.primaryColor, { h: -30 }), this.git4 = this.git4 || T(this.primaryColor, { h: -60 }), this.git5 = this.git5 || T(this.primaryColor, { h: -90 }), this.git6 = this.git6 || T(this.primaryColor, { h: 60 }), this.git7 = this.git7 || T(this.primaryColor, { h: 120 }), this.darkMode ? (this.git0 = X(this.git0, 25), this.git1 = X(this.git1, 25), this.git2 = X(this.git2, 25), this.git3 = X(this.git3, 25), this.git4 = X(this.git4, 25), this.git5 = X(this.git5, 25), this.git6 = X(this.git6, 25), this.git7 = X(this.git7, 25)) : (this.git0 = nt(this.git0, 25), this.git1 = nt(this.git1, 25), this.git2 = nt(this.git2, 25), this.git3 = nt(this.git3, 25), this.git4 = nt(this.git4, 25), this.git5 = nt(this.git5, 25), this.git6 = nt(this.git6, 25), this.git7 = nt(this.git7, 25)), this.gitInv0 = this.gitInv0 || q(this.git0), this.gitInv1 = this.gitInv1 || q(this.git1), this.gitInv2 = this.gitInv2 || q(this.git2), this.gitInv3 = this.gitInv3 || q(this.git3), this.gitInv4 = this.gitInv4 || q(this.git4), this.gitInv5 = this.gitInv5 || q(this.git5), this.gitInv6 = this.gitInv6 || q(this.git6), this.gitInv7 = this.gitInv7 || q(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? "black" : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || "10px", this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || "10px", this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || sa, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || aa;
  }
  calculate(t) {
    if (typeof t != "object") {
      this.updateColors();
      return;
    }
    const e = Object.keys(t);
    e.forEach((r) => {
      this[r] = t[r];
    }), this.updateColors(), e.forEach((r) => {
      this[r] = t[r];
    });
  }
}, t1 = /* @__PURE__ */ p((t) => {
  const e = new Jb();
  return e.calculate(t), e;
}, "getThemeVariables"), e1 = class {
  static {
    p(this, "Theme");
  }
  constructor() {
    this.background = "#333", this.primaryColor = "#1f2020", this.secondaryColor = X(this.primaryColor, 16), this.tertiaryColor = T(this.primaryColor, { h: -160 }), this.primaryBorderColor = q(this.background), this.secondaryBorderColor = Vt(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = Vt(this.tertiaryColor, this.darkMode), this.primaryTextColor = q(this.primaryColor), this.secondaryTextColor = q(this.secondaryColor), this.tertiaryTextColor = q(this.tertiaryColor), this.lineColor = q(this.background), this.textColor = q(this.background), this.mainBkg = "#1f2020", this.secondBkg = "calculated", this.mainContrastColor = "lightgrey", this.darkTextColor = X(q("#323D47"), 10), this.lineColor = "calculated", this.border1 = "#ccc", this.border2 = tn(255, 255, 255, 0.25), this.arrowheadColor = "calculated", this.fontFamily = '"trebuchet ms", verdana, arial, sans-serif', this.fontSize = "16px", this.labelBackground = "#181818", this.textColor = "#ccc", this.THEME_COLOR_LIMIT = 12, this.nodeBkg = "calculated", this.nodeBorder = "calculated", this.clusterBkg = "calculated", this.clusterBorder = "calculated", this.defaultLinkColor = "calculated", this.titleColor = "#F9FFFE", this.edgeLabelBackground = "calculated", this.actorBorder = "calculated", this.actorBkg = "calculated", this.actorTextColor = "calculated", this.actorLineColor = "calculated", this.signalColor = "calculated", this.signalTextColor = "calculated", this.labelBoxBkgColor = "calculated", this.labelBoxBorderColor = "calculated", this.labelTextColor = "calculated", this.loopTextColor = "calculated", this.noteBorderColor = "calculated", this.noteBkgColor = "#fff5ad", this.noteTextColor = "calculated", this.activationBorderColor = "calculated", this.activationBkgColor = "calculated", this.sequenceNumberColor = "black", this.sectionBkgColor = nt("#EAE8D9", 30), this.altSectionBkgColor = "calculated", this.sectionBkgColor2 = "#EAE8D9", this.excludeBkgColor = nt(this.sectionBkgColor, 10), this.taskBorderColor = tn(255, 255, 255, 70), this.taskBkgColor = "calculated", this.taskTextColor = "calculated", this.taskTextLightColor = "calculated", this.taskTextOutsideColor = "calculated", this.taskTextClickableColor = "#003163", this.activeTaskBorderColor = tn(255, 255, 255, 50), this.activeTaskBkgColor = "#81B1DB", this.gridColor = "calculated", this.doneTaskBkgColor = "calculated", this.doneTaskBorderColor = "grey", this.critBorderColor = "#E83737", this.critBkgColor = "#E83737", this.taskTextDarkColor = "calculated", this.todayLineColor = "#DB5757", this.vertLineColor = "#00BFFF", this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = "calculated", this.archEdgeArrowColor = "calculated", this.archEdgeWidth = "3", this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = "2px", this.rowOdd = this.rowOdd || X(this.mainBkg, 5) || "#ffffff", this.rowEven = this.rowEven || nt(this.mainBkg, 10), this.labelColor = "calculated", this.errorBkgColor = "#a44141", this.errorTextColor = "#ddd";
  }
  updateColors() {
    this.secondBkg = X(this.mainBkg, 16), this.lineColor = this.mainContrastColor, this.arrowheadColor = this.mainContrastColor, this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.edgeLabelBackground = X(this.labelBackground, 25), this.actorBorder = this.border1, this.actorBkg = this.mainBkg, this.actorTextColor = this.mainContrastColor, this.actorLineColor = this.actorBorder, this.signalColor = this.mainContrastColor, this.signalTextColor = this.mainContrastColor, this.labelBoxBkgColor = this.actorBkg, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.mainContrastColor, this.loopTextColor = this.mainContrastColor, this.noteBorderColor = this.secondaryBorderColor, this.noteBkgColor = this.secondBkg, this.noteTextColor = this.secondaryTextColor, this.activationBorderColor = this.border1, this.activationBkgColor = this.secondBkg, this.altSectionBkgColor = this.background, this.taskBkgColor = X(this.mainBkg, 23), this.taskTextColor = this.darkTextColor, this.taskTextLightColor = this.mainContrastColor, this.taskTextOutsideColor = this.taskTextLightColor, this.gridColor = this.mainContrastColor, this.doneTaskBkgColor = this.mainContrastColor, this.taskTextDarkColor = this.darkTextColor, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || "#555", this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = "#f4f4f4", this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = T(this.primaryColor, { h: 64 }), this.fillType3 = T(this.secondaryColor, { h: 64 }), this.fillType4 = T(this.primaryColor, { h: -64 }), this.fillType5 = T(this.secondaryColor, { h: -64 }), this.fillType6 = T(this.primaryColor, { h: 128 }), this.fillType7 = T(this.secondaryColor, { h: 128 }), this.cScale1 = this.cScale1 || "#0b0000", this.cScale2 = this.cScale2 || "#4d1037", this.cScale3 = this.cScale3 || "#3f5258", this.cScale4 = this.cScale4 || "#4f2f1b", this.cScale5 = this.cScale5 || "#6e0a0a", this.cScale6 = this.cScale6 || "#3b0048", this.cScale7 = this.cScale7 || "#995a01", this.cScale8 = this.cScale8 || "#154706", this.cScale9 = this.cScale9 || "#161722", this.cScale10 = this.cScale10 || "#00296f", this.cScale11 = this.cScale11 || "#01629c", this.cScale12 = this.cScale12 || "#010029", this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || T(this.primaryColor, { h: 30 }), this.cScale4 = this.cScale4 || T(this.primaryColor, { h: 60 }), this.cScale5 = this.cScale5 || T(this.primaryColor, { h: 90 }), this.cScale6 = this.cScale6 || T(this.primaryColor, { h: 120 }), this.cScale7 = this.cScale7 || T(this.primaryColor, { h: 150 }), this.cScale8 = this.cScale8 || T(this.primaryColor, { h: 210 }), this.cScale9 = this.cScale9 || T(this.primaryColor, { h: 270 }), this.cScale10 = this.cScale10 || T(this.primaryColor, { h: 300 }), this.cScale11 = this.cScale11 || T(this.primaryColor, { h: 330 });
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleInv" + t] = this["cScaleInv" + t] || q(this["cScale" + t]);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScalePeer" + t] = this["cScalePeer" + t] || X(this["cScale" + t], 10);
    for (let t = 0; t < 5; t++)
      this["surface" + t] = this["surface" + t] || T(this.mainBkg, { h: 30, s: -30, l: -(-10 + t * 4) }), this["surfacePeer" + t] = this["surfacePeer" + t] || T(this.mainBkg, { h: 30, s: -30, l: -(-7 + t * 4) });
    this.scaleLabelColor = this.scaleLabelColor || (this.darkMode ? "black" : this.labelTextColor);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleLabel" + t] = this["cScaleLabel" + t] || this.scaleLabelColor;
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["pie" + t] = this["cScale" + t];
    this.pieTitleTextSize = this.pieTitleTextSize || "25px", this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || "17px", this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || "17px", this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || "black", this.pieStrokeWidth = this.pieStrokeWidth || "2px", this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || "2px", this.pieOuterStrokeColor = this.pieOuterStrokeColor || "black", this.pieOpacity = this.pieOpacity || "0.7", this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || T(this.primaryColor, { r: 5, g: 5, b: 5 }), this.quadrant3Fill = this.quadrant3Fill || T(this.primaryColor, { r: 10, g: 10, b: 10 }), this.quadrant4Fill = this.quadrant4Fill || T(this.primaryColor, { r: 15, g: 15, b: 15 }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || T(this.primaryTextColor, { r: -5, g: -5, b: -5 }), this.quadrant3TextFill = this.quadrant3TextFill || T(this.primaryTextColor, { r: -10, g: -10, b: -10 }), this.quadrant4TextFill = this.quadrant4TextFill || T(this.primaryTextColor, { r: -15, g: -15, b: -15 }), this.quadrantPointFill = this.quadrantPointFill || _n(this.quadrant1Fill) ? X(this.quadrant1Fill) : nt(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
      backgroundColor: this.xyChart?.backgroundColor || this.background,
      titleColor: this.xyChart?.titleColor || this.primaryTextColor,
      xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
      xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
      xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
      xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
      yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
      yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
      yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
      yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
      plotColorPalette: this.xyChart?.plotColorPalette || "#3498db,#2ecc71,#e74c3c,#f1c40f,#bdc3c7,#ffffff,#34495e,#9b59b6,#1abc9c,#e67e22"
    }, this.packet = {
      startByteColor: this.primaryTextColor,
      endByteColor: this.primaryTextColor,
      labelColor: this.primaryTextColor,
      titleColor: this.primaryTextColor,
      blockStrokeColor: this.primaryTextColor,
      blockFillColor: this.background
    }, this.radar = {
      axisColor: this.radar?.axisColor || this.lineColor,
      axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
      axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
      curveOpacity: this.radar?.curveOpacity || 0.5,
      curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
      graticuleColor: this.radar?.graticuleColor || "#DEDEDE",
      graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
      graticuleOpacity: this.radar?.graticuleOpacity || 0.3,
      legendBoxSize: this.radar?.legendBoxSize || 12,
      legendFontSize: this.radar?.legendFontSize || 12
    }, this.classText = this.primaryTextColor, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || "1", this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? nt(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = X(this.secondaryColor, 20), this.git1 = X(this.pie2 || this.secondaryColor, 20), this.git2 = X(this.pie3 || this.tertiaryColor, 20), this.git3 = X(this.pie4 || T(this.primaryColor, { h: -30 }), 20), this.git4 = X(this.pie5 || T(this.primaryColor, { h: -60 }), 20), this.git5 = X(this.pie6 || T(this.primaryColor, { h: -90 }), 10), this.git6 = X(this.pie7 || T(this.primaryColor, { h: 60 }), 10), this.git7 = X(this.pie8 || T(this.primaryColor, { h: 120 }), 20), this.gitInv0 = this.gitInv0 || q(this.git0), this.gitInv1 = this.gitInv1 || q(this.git1), this.gitInv2 = this.gitInv2 || q(this.git2), this.gitInv3 = this.gitInv3 || q(this.git3), this.gitInv4 = this.gitInv4 || q(this.git4), this.gitInv5 = this.gitInv5 || q(this.git5), this.gitInv6 = this.gitInv6 || q(this.git6), this.gitInv7 = this.gitInv7 || q(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || q(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || q(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || "10px", this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || "10px", this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || X(this.background, 12), this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || X(this.background, 2), this.nodeBorder = this.nodeBorder || "#999";
  }
  calculate(t) {
    if (typeof t != "object") {
      this.updateColors();
      return;
    }
    const e = Object.keys(t);
    e.forEach((r) => {
      this[r] = t[r];
    }), this.updateColors(), e.forEach((r) => {
      this[r] = t[r];
    });
  }
}, r1 = /* @__PURE__ */ p((t) => {
  const e = new e1();
  return e.calculate(t), e;
}, "getThemeVariables"), i1 = class {
  static {
    p(this, "Theme");
  }
  constructor() {
    this.background = "#f4f4f4", this.primaryColor = "#ECECFF", this.secondaryColor = T(this.primaryColor, { h: 120 }), this.secondaryColor = "#ffffde", this.tertiaryColor = T(this.primaryColor, { h: -160 }), this.primaryBorderColor = Vt(this.primaryColor, this.darkMode), this.secondaryBorderColor = Vt(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = Vt(this.tertiaryColor, this.darkMode), this.primaryTextColor = q(this.primaryColor), this.secondaryTextColor = q(this.secondaryColor), this.tertiaryTextColor = q(this.tertiaryColor), this.lineColor = q(this.background), this.textColor = q(this.background), this.background = "white", this.mainBkg = "#ECECFF", this.secondBkg = "#ffffde", this.lineColor = "#333333", this.border1 = "#9370DB", this.border2 = "#aaaa33", this.arrowheadColor = "#333333", this.fontFamily = '"trebuchet ms", verdana, arial, sans-serif', this.fontSize = "16px", this.labelBackground = "rgba(232,232,232, 0.8)", this.textColor = "#333", this.THEME_COLOR_LIMIT = 12, this.nodeBkg = "calculated", this.nodeBorder = "calculated", this.clusterBkg = "calculated", this.clusterBorder = "calculated", this.defaultLinkColor = "calculated", this.titleColor = "calculated", this.edgeLabelBackground = "calculated", this.actorBorder = "calculated", this.actorBkg = "calculated", this.actorTextColor = "black", this.actorLineColor = "calculated", this.signalColor = "calculated", this.signalTextColor = "calculated", this.labelBoxBkgColor = "calculated", this.labelBoxBorderColor = "calculated", this.labelTextColor = "calculated", this.loopTextColor = "calculated", this.noteBorderColor = "calculated", this.noteBkgColor = "#fff5ad", this.noteTextColor = "calculated", this.activationBorderColor = "#666", this.activationBkgColor = "#f4f4f4", this.sequenceNumberColor = "white", this.sectionBkgColor = "calculated", this.altSectionBkgColor = "calculated", this.sectionBkgColor2 = "calculated", this.excludeBkgColor = "#eeeeee", this.taskBorderColor = "calculated", this.taskBkgColor = "calculated", this.taskTextLightColor = "calculated", this.taskTextColor = this.taskTextLightColor, this.taskTextDarkColor = "calculated", this.taskTextOutsideColor = this.taskTextDarkColor, this.taskTextClickableColor = "calculated", this.activeTaskBorderColor = "calculated", this.activeTaskBkgColor = "calculated", this.gridColor = "calculated", this.doneTaskBkgColor = "calculated", this.doneTaskBorderColor = "calculated", this.critBorderColor = "calculated", this.critBkgColor = "calculated", this.todayLineColor = "calculated", this.vertLineColor = "calculated", this.sectionBkgColor = tn(102, 102, 255, 0.49), this.altSectionBkgColor = "white", this.sectionBkgColor2 = "#fff400", this.taskBorderColor = "#534fbc", this.taskBkgColor = "#8a90dd", this.taskTextLightColor = "white", this.taskTextColor = "calculated", this.taskTextDarkColor = "black", this.taskTextOutsideColor = "calculated", this.taskTextClickableColor = "#003163", this.activeTaskBorderColor = "#534fbc", this.activeTaskBkgColor = "#bfc7ff", this.gridColor = "lightgrey", this.doneTaskBkgColor = "lightgrey", this.doneTaskBorderColor = "grey", this.critBorderColor = "#ff8888", this.critBkgColor = "red", this.todayLineColor = "red", this.vertLineColor = "navy", this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = "calculated", this.archEdgeArrowColor = "calculated", this.archEdgeWidth = "3", this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = "2px", this.rowOdd = "calculated", this.rowEven = "calculated", this.labelColor = "black", this.errorBkgColor = "#552222", this.errorTextColor = "#552222", this.updateColors();
  }
  updateColors() {
    this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || T(this.primaryColor, { h: 30 }), this.cScale4 = this.cScale4 || T(this.primaryColor, { h: 60 }), this.cScale5 = this.cScale5 || T(this.primaryColor, { h: 90 }), this.cScale6 = this.cScale6 || T(this.primaryColor, { h: 120 }), this.cScale7 = this.cScale7 || T(this.primaryColor, { h: 150 }), this.cScale8 = this.cScale8 || T(this.primaryColor, { h: 210 }), this.cScale9 = this.cScale9 || T(this.primaryColor, { h: 270 }), this.cScale10 = this.cScale10 || T(this.primaryColor, { h: 300 }), this.cScale11 = this.cScale11 || T(this.primaryColor, { h: 330 }), this.cScalePeer1 = this.cScalePeer1 || nt(this.secondaryColor, 45), this.cScalePeer2 = this.cScalePeer2 || nt(this.tertiaryColor, 40);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScale" + t] = nt(this["cScale" + t], 10), this["cScalePeer" + t] = this["cScalePeer" + t] || nt(this["cScale" + t], 25);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleInv" + t] = this["cScaleInv" + t] || T(this["cScale" + t], { h: 180 });
    for (let t = 0; t < 5; t++)
      this["surface" + t] = this["surface" + t] || T(this.mainBkg, { h: 30, l: -(5 + t * 5) }), this["surfacePeer" + t] = this["surfacePeer" + t] || T(this.mainBkg, { h: 30, l: -(7 + t * 5) });
    if (this.scaleLabelColor = this.scaleLabelColor !== "calculated" && this.scaleLabelColor ? this.scaleLabelColor : this.labelTextColor, this.labelTextColor !== "calculated") {
      this.cScaleLabel0 = this.cScaleLabel0 || q(this.labelTextColor), this.cScaleLabel3 = this.cScaleLabel3 || q(this.labelTextColor);
      for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
        this["cScaleLabel" + t] = this["cScaleLabel" + t] || this.labelTextColor;
    }
    this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.titleColor = this.textColor, this.edgeLabelBackground = this.labelBackground, this.actorBorder = X(this.border1, 23), this.actorBkg = this.mainBkg, this.labelBoxBkgColor = this.actorBkg, this.signalColor = this.textColor, this.signalTextColor = this.textColor, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.actorTextColor, this.loopTextColor = this.actorTextColor, this.noteBorderColor = this.border2, this.noteTextColor = this.actorTextColor, this.actorLineColor = this.actorBorder, this.taskTextColor = this.taskTextLightColor, this.taskTextOutsideColor = this.taskTextDarkColor, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.rowOdd = this.rowOdd || X(this.primaryColor, 75) || "#ffffff", this.rowEven = this.rowEven || X(this.primaryColor, 1), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || "#f0f0f0", this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.specialStateColor = this.lineColor, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = T(this.primaryColor, { h: 64 }), this.fillType3 = T(this.secondaryColor, { h: 64 }), this.fillType4 = T(this.primaryColor, { h: -64 }), this.fillType5 = T(this.secondaryColor, { h: -64 }), this.fillType6 = T(this.primaryColor, { h: 128 }), this.fillType7 = T(this.secondaryColor, { h: 128 }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || T(this.tertiaryColor, { l: -40 }), this.pie4 = this.pie4 || T(this.primaryColor, { l: -10 }), this.pie5 = this.pie5 || T(this.secondaryColor, { l: -30 }), this.pie6 = this.pie6 || T(this.tertiaryColor, { l: -20 }), this.pie7 = this.pie7 || T(this.primaryColor, { h: 60, l: -20 }), this.pie8 = this.pie8 || T(this.primaryColor, { h: -60, l: -40 }), this.pie9 = this.pie9 || T(this.primaryColor, { h: 120, l: -40 }), this.pie10 = this.pie10 || T(this.primaryColor, { h: 60, l: -40 }), this.pie11 = this.pie11 || T(this.primaryColor, { h: -90, l: -40 }), this.pie12 = this.pie12 || T(this.primaryColor, { h: 120, l: -30 }), this.pieTitleTextSize = this.pieTitleTextSize || "25px", this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || "17px", this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || "17px", this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || "black", this.pieStrokeWidth = this.pieStrokeWidth || "2px", this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || "2px", this.pieOuterStrokeColor = this.pieOuterStrokeColor || "black", this.pieOpacity = this.pieOpacity || "0.7", this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || T(this.primaryColor, { r: 5, g: 5, b: 5 }), this.quadrant3Fill = this.quadrant3Fill || T(this.primaryColor, { r: 10, g: 10, b: 10 }), this.quadrant4Fill = this.quadrant4Fill || T(this.primaryColor, { r: 15, g: 15, b: 15 }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || T(this.primaryTextColor, { r: -5, g: -5, b: -5 }), this.quadrant3TextFill = this.quadrant3TextFill || T(this.primaryTextColor, { r: -10, g: -10, b: -10 }), this.quadrant4TextFill = this.quadrant4TextFill || T(this.primaryTextColor, { r: -15, g: -15, b: -15 }), this.quadrantPointFill = this.quadrantPointFill || _n(this.quadrant1Fill) ? X(this.quadrant1Fill) : nt(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.radar = {
      axisColor: this.radar?.axisColor || this.lineColor,
      axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
      axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
      curveOpacity: this.radar?.curveOpacity || 0.5,
      curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
      graticuleColor: this.radar?.graticuleColor || "#DEDEDE",
      graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
      graticuleOpacity: this.radar?.graticuleOpacity || 0.3,
      legendBoxSize: this.radar?.legendBoxSize || 12,
      legendFontSize: this.radar?.legendFontSize || 12
    }, this.xyChart = {
      backgroundColor: this.xyChart?.backgroundColor || this.background,
      titleColor: this.xyChart?.titleColor || this.primaryTextColor,
      xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
      xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
      xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
      xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
      yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
      yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
      yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
      yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
      plotColorPalette: this.xyChart?.plotColorPalette || "#ECECFF,#8493A6,#FFC3A0,#DCDDE1,#B8E994,#D1A36F,#C3CDE6,#FFB6C1,#496078,#F8F3E3"
    }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || "1", this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.labelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || T(this.primaryColor, { h: -30 }), this.git4 = this.git4 || T(this.primaryColor, { h: -60 }), this.git5 = this.git5 || T(this.primaryColor, { h: -90 }), this.git6 = this.git6 || T(this.primaryColor, { h: 60 }), this.git7 = this.git7 || T(this.primaryColor, { h: 120 }), this.darkMode ? (this.git0 = X(this.git0, 25), this.git1 = X(this.git1, 25), this.git2 = X(this.git2, 25), this.git3 = X(this.git3, 25), this.git4 = X(this.git4, 25), this.git5 = X(this.git5, 25), this.git6 = X(this.git6, 25), this.git7 = X(this.git7, 25)) : (this.git0 = nt(this.git0, 25), this.git1 = nt(this.git1, 25), this.git2 = nt(this.git2, 25), this.git3 = nt(this.git3, 25), this.git4 = nt(this.git4, 25), this.git5 = nt(this.git5, 25), this.git6 = nt(this.git6, 25), this.git7 = nt(this.git7, 25)), this.gitInv0 = this.gitInv0 || nt(q(this.git0), 25), this.gitInv1 = this.gitInv1 || q(this.git1), this.gitInv2 = this.gitInv2 || q(this.git2), this.gitInv3 = this.gitInv3 || q(this.git3), this.gitInv4 = this.gitInv4 || q(this.git4), this.gitInv5 = this.gitInv5 || q(this.git5), this.gitInv6 = this.gitInv6 || q(this.git6), this.gitInv7 = this.gitInv7 || q(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || q(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || q(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || "10px", this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || "10px", this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || sa, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || aa;
  }
  calculate(t) {
    if (Object.keys(this).forEach((r) => {
      this[r] === "calculated" && (this[r] = void 0);
    }), typeof t != "object") {
      this.updateColors();
      return;
    }
    const e = Object.keys(t);
    e.forEach((r) => {
      this[r] = t[r];
    }), this.updateColors(), e.forEach((r) => {
      this[r] = t[r];
    });
  }
}, n1 = /* @__PURE__ */ p((t) => {
  const e = new i1();
  return e.calculate(t), e;
}, "getThemeVariables"), s1 = class {
  static {
    p(this, "Theme");
  }
  constructor() {
    this.background = "#f4f4f4", this.primaryColor = "#cde498", this.secondaryColor = "#cdffb2", this.background = "white", this.mainBkg = "#cde498", this.secondBkg = "#cdffb2", this.lineColor = "green", this.border1 = "#13540c", this.border2 = "#6eaa49", this.arrowheadColor = "green", this.fontFamily = '"trebuchet ms", verdana, arial, sans-serif', this.fontSize = "16px", this.tertiaryColor = X("#cde498", 10), this.primaryBorderColor = Vt(this.primaryColor, this.darkMode), this.secondaryBorderColor = Vt(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = Vt(this.tertiaryColor, this.darkMode), this.primaryTextColor = q(this.primaryColor), this.secondaryTextColor = q(this.secondaryColor), this.tertiaryTextColor = q(this.primaryColor), this.lineColor = q(this.background), this.textColor = q(this.background), this.THEME_COLOR_LIMIT = 12, this.nodeBkg = "calculated", this.nodeBorder = "calculated", this.clusterBkg = "calculated", this.clusterBorder = "calculated", this.defaultLinkColor = "calculated", this.titleColor = "#333", this.edgeLabelBackground = "#e8e8e8", this.actorBorder = "calculated", this.actorBkg = "calculated", this.actorTextColor = "black", this.actorLineColor = "calculated", this.signalColor = "#333", this.signalTextColor = "#333", this.labelBoxBkgColor = "calculated", this.labelBoxBorderColor = "#326932", this.labelTextColor = "calculated", this.loopTextColor = "calculated", this.noteBorderColor = "calculated", this.noteBkgColor = "#fff5ad", this.noteTextColor = "calculated", this.activationBorderColor = "#666", this.activationBkgColor = "#f4f4f4", this.sequenceNumberColor = "white", this.sectionBkgColor = "#6eaa49", this.altSectionBkgColor = "white", this.sectionBkgColor2 = "#6eaa49", this.excludeBkgColor = "#eeeeee", this.taskBorderColor = "calculated", this.taskBkgColor = "#487e3a", this.taskTextLightColor = "white", this.taskTextColor = "calculated", this.taskTextDarkColor = "black", this.taskTextOutsideColor = "calculated", this.taskTextClickableColor = "#003163", this.activeTaskBorderColor = "calculated", this.activeTaskBkgColor = "calculated", this.gridColor = "lightgrey", this.doneTaskBkgColor = "lightgrey", this.doneTaskBorderColor = "grey", this.critBorderColor = "#ff8888", this.critBkgColor = "red", this.todayLineColor = "red", this.vertLineColor = "#00BFFF", this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = "calculated", this.archEdgeArrowColor = "calculated", this.archEdgeWidth = "3", this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = "2px", this.labelColor = "black", this.errorBkgColor = "#552222", this.errorTextColor = "#552222";
  }
  updateColors() {
    this.actorBorder = nt(this.mainBkg, 20), this.actorBkg = this.mainBkg, this.labelBoxBkgColor = this.actorBkg, this.labelTextColor = this.actorTextColor, this.loopTextColor = this.actorTextColor, this.noteBorderColor = this.border2, this.noteTextColor = this.actorTextColor, this.actorLineColor = this.actorBorder, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || T(this.primaryColor, { h: 30 }), this.cScale4 = this.cScale4 || T(this.primaryColor, { h: 60 }), this.cScale5 = this.cScale5 || T(this.primaryColor, { h: 90 }), this.cScale6 = this.cScale6 || T(this.primaryColor, { h: 120 }), this.cScale7 = this.cScale7 || T(this.primaryColor, { h: 150 }), this.cScale8 = this.cScale8 || T(this.primaryColor, { h: 210 }), this.cScale9 = this.cScale9 || T(this.primaryColor, { h: 270 }), this.cScale10 = this.cScale10 || T(this.primaryColor, { h: 300 }), this.cScale11 = this.cScale11 || T(this.primaryColor, { h: 330 }), this.cScalePeer1 = this.cScalePeer1 || nt(this.secondaryColor, 45), this.cScalePeer2 = this.cScalePeer2 || nt(this.tertiaryColor, 40);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScale" + t] = nt(this["cScale" + t], 10), this["cScalePeer" + t] = this["cScalePeer" + t] || nt(this["cScale" + t], 25);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleInv" + t] = this["cScaleInv" + t] || T(this["cScale" + t], { h: 180 });
    this.scaleLabelColor = this.scaleLabelColor !== "calculated" && this.scaleLabelColor ? this.scaleLabelColor : this.labelTextColor;
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleLabel" + t] = this["cScaleLabel" + t] || this.scaleLabelColor;
    for (let t = 0; t < 5; t++)
      this["surface" + t] = this["surface" + t] || T(this.mainBkg, { h: 30, s: -30, l: -(5 + t * 5) }), this["surfacePeer" + t] = this["surfacePeer" + t] || T(this.mainBkg, { h: 30, s: -30, l: -(8 + t * 5) });
    this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.taskBorderColor = this.border1, this.taskTextColor = this.taskTextLightColor, this.taskTextOutsideColor = this.taskTextDarkColor, this.activeTaskBorderColor = this.taskBorderColor, this.activeTaskBkgColor = this.mainBkg, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.rowOdd = this.rowOdd || X(this.mainBkg, 75) || "#ffffff", this.rowEven = this.rowEven || X(this.mainBkg, 20), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || "#f0f0f0", this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = this.lineColor, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = T(this.primaryColor, { h: 64 }), this.fillType3 = T(this.secondaryColor, { h: 64 }), this.fillType4 = T(this.primaryColor, { h: -64 }), this.fillType5 = T(this.secondaryColor, { h: -64 }), this.fillType6 = T(this.primaryColor, { h: 128 }), this.fillType7 = T(this.secondaryColor, { h: 128 }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || T(this.primaryColor, { l: -30 }), this.pie5 = this.pie5 || T(this.secondaryColor, { l: -30 }), this.pie6 = this.pie6 || T(this.tertiaryColor, { h: 40, l: -40 }), this.pie7 = this.pie7 || T(this.primaryColor, { h: 60, l: -10 }), this.pie8 = this.pie8 || T(this.primaryColor, { h: -60, l: -10 }), this.pie9 = this.pie9 || T(this.primaryColor, { h: 120, l: 0 }), this.pie10 = this.pie10 || T(this.primaryColor, { h: 60, l: -50 }), this.pie11 = this.pie11 || T(this.primaryColor, { h: -60, l: -50 }), this.pie12 = this.pie12 || T(this.primaryColor, { h: 120, l: -50 }), this.pieTitleTextSize = this.pieTitleTextSize || "25px", this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || "17px", this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || "17px", this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || "black", this.pieStrokeWidth = this.pieStrokeWidth || "2px", this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || "2px", this.pieOuterStrokeColor = this.pieOuterStrokeColor || "black", this.pieOpacity = this.pieOpacity || "0.7", this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || T(this.primaryColor, { r: 5, g: 5, b: 5 }), this.quadrant3Fill = this.quadrant3Fill || T(this.primaryColor, { r: 10, g: 10, b: 10 }), this.quadrant4Fill = this.quadrant4Fill || T(this.primaryColor, { r: 15, g: 15, b: 15 }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || T(this.primaryTextColor, { r: -5, g: -5, b: -5 }), this.quadrant3TextFill = this.quadrant3TextFill || T(this.primaryTextColor, { r: -10, g: -10, b: -10 }), this.quadrant4TextFill = this.quadrant4TextFill || T(this.primaryTextColor, { r: -15, g: -15, b: -15 }), this.quadrantPointFill = this.quadrantPointFill || _n(this.quadrant1Fill) ? X(this.quadrant1Fill) : nt(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.packet = {
      startByteColor: this.primaryTextColor,
      endByteColor: this.primaryTextColor,
      labelColor: this.primaryTextColor,
      titleColor: this.primaryTextColor,
      blockStrokeColor: this.primaryTextColor,
      blockFillColor: this.mainBkg
    }, this.radar = {
      axisColor: this.radar?.axisColor || this.lineColor,
      axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
      axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
      curveOpacity: this.radar?.curveOpacity || 0.5,
      curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
      graticuleColor: this.radar?.graticuleColor || "#DEDEDE",
      graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
      graticuleOpacity: this.radar?.graticuleOpacity || 0.3,
      legendBoxSize: this.radar?.legendBoxSize || 12,
      legendFontSize: this.radar?.legendFontSize || 12
    }, this.xyChart = {
      backgroundColor: this.xyChart?.backgroundColor || this.background,
      titleColor: this.xyChart?.titleColor || this.primaryTextColor,
      xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
      xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
      xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
      xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
      yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
      yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
      yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
      yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
      plotColorPalette: this.xyChart?.plotColorPalette || "#CDE498,#FF6B6B,#A0D2DB,#D7BDE2,#F0F0F0,#FFC3A0,#7FD8BE,#FF9A8B,#FAF3E0,#FFF176"
    }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || "1", this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.edgeLabelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || T(this.primaryColor, { h: -30 }), this.git4 = this.git4 || T(this.primaryColor, { h: -60 }), this.git5 = this.git5 || T(this.primaryColor, { h: -90 }), this.git6 = this.git6 || T(this.primaryColor, { h: 60 }), this.git7 = this.git7 || T(this.primaryColor, { h: 120 }), this.darkMode ? (this.git0 = X(this.git0, 25), this.git1 = X(this.git1, 25), this.git2 = X(this.git2, 25), this.git3 = X(this.git3, 25), this.git4 = X(this.git4, 25), this.git5 = X(this.git5, 25), this.git6 = X(this.git6, 25), this.git7 = X(this.git7, 25)) : (this.git0 = nt(this.git0, 25), this.git1 = nt(this.git1, 25), this.git2 = nt(this.git2, 25), this.git3 = nt(this.git3, 25), this.git4 = nt(this.git4, 25), this.git5 = nt(this.git5, 25), this.git6 = nt(this.git6, 25), this.git7 = nt(this.git7, 25)), this.gitInv0 = this.gitInv0 || q(this.git0), this.gitInv1 = this.gitInv1 || q(this.git1), this.gitInv2 = this.gitInv2 || q(this.git2), this.gitInv3 = this.gitInv3 || q(this.git3), this.gitInv4 = this.gitInv4 || q(this.git4), this.gitInv5 = this.gitInv5 || q(this.git5), this.gitInv6 = this.gitInv6 || q(this.git6), this.gitInv7 = this.gitInv7 || q(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || q(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || q(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || "10px", this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || "10px", this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || sa, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || aa;
  }
  calculate(t) {
    if (typeof t != "object") {
      this.updateColors();
      return;
    }
    const e = Object.keys(t);
    e.forEach((r) => {
      this[r] = t[r];
    }), this.updateColors(), e.forEach((r) => {
      this[r] = t[r];
    });
  }
}, a1 = /* @__PURE__ */ p((t) => {
  const e = new s1();
  return e.calculate(t), e;
}, "getThemeVariables"), o1 = class {
  static {
    p(this, "Theme");
  }
  constructor() {
    this.primaryColor = "#eee", this.contrast = "#707070", this.secondaryColor = X(this.contrast, 55), this.background = "#ffffff", this.tertiaryColor = T(this.primaryColor, { h: -160 }), this.primaryBorderColor = Vt(this.primaryColor, this.darkMode), this.secondaryBorderColor = Vt(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = Vt(this.tertiaryColor, this.darkMode), this.primaryTextColor = q(this.primaryColor), this.secondaryTextColor = q(this.secondaryColor), this.tertiaryTextColor = q(this.tertiaryColor), this.lineColor = q(this.background), this.textColor = q(this.background), this.mainBkg = "#eee", this.secondBkg = "calculated", this.lineColor = "#666", this.border1 = "#999", this.border2 = "calculated", this.note = "#ffa", this.text = "#333", this.critical = "#d42", this.done = "#bbb", this.arrowheadColor = "#333333", this.fontFamily = '"trebuchet ms", verdana, arial, sans-serif', this.fontSize = "16px", this.THEME_COLOR_LIMIT = 12, this.nodeBkg = "calculated", this.nodeBorder = "calculated", this.clusterBkg = "calculated", this.clusterBorder = "calculated", this.defaultLinkColor = "calculated", this.titleColor = "calculated", this.edgeLabelBackground = "white", this.actorBorder = "calculated", this.actorBkg = "calculated", this.actorTextColor = "calculated", this.actorLineColor = this.actorBorder, this.signalColor = "calculated", this.signalTextColor = "calculated", this.labelBoxBkgColor = "calculated", this.labelBoxBorderColor = "calculated", this.labelTextColor = "calculated", this.loopTextColor = "calculated", this.noteBorderColor = "calculated", this.noteBkgColor = "calculated", this.noteTextColor = "calculated", this.activationBorderColor = "#666", this.activationBkgColor = "#f4f4f4", this.sequenceNumberColor = "white", this.sectionBkgColor = "calculated", this.altSectionBkgColor = "white", this.sectionBkgColor2 = "calculated", this.excludeBkgColor = "#eeeeee", this.taskBorderColor = "calculated", this.taskBkgColor = "calculated", this.taskTextLightColor = "white", this.taskTextColor = "calculated", this.taskTextDarkColor = "calculated", this.taskTextOutsideColor = "calculated", this.taskTextClickableColor = "#003163", this.activeTaskBorderColor = "calculated", this.activeTaskBkgColor = "calculated", this.gridColor = "calculated", this.doneTaskBkgColor = "calculated", this.doneTaskBorderColor = "calculated", this.critBkgColor = "calculated", this.critBorderColor = "calculated", this.todayLineColor = "calculated", this.vertLineColor = "calculated", this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = "calculated", this.archEdgeArrowColor = "calculated", this.archEdgeWidth = "3", this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = "2px", this.rowOdd = this.rowOdd || X(this.mainBkg, 75) || "#ffffff", this.rowEven = this.rowEven || "#f4f4f4", this.labelColor = "black", this.errorBkgColor = "#552222", this.errorTextColor = "#552222";
  }
  updateColors() {
    this.secondBkg = X(this.contrast, 55), this.border2 = this.contrast, this.actorBorder = X(this.border1, 23), this.actorBkg = this.mainBkg, this.actorTextColor = this.text, this.actorLineColor = this.actorBorder, this.signalColor = this.text, this.signalTextColor = this.text, this.labelBoxBkgColor = this.actorBkg, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.text, this.loopTextColor = this.text, this.noteBorderColor = "#999", this.noteBkgColor = "#666", this.noteTextColor = "#fff", this.cScale0 = this.cScale0 || "#555", this.cScale1 = this.cScale1 || "#F4F4F4", this.cScale2 = this.cScale2 || "#555", this.cScale3 = this.cScale3 || "#BBB", this.cScale4 = this.cScale4 || "#777", this.cScale5 = this.cScale5 || "#999", this.cScale6 = this.cScale6 || "#DDD", this.cScale7 = this.cScale7 || "#FFF", this.cScale8 = this.cScale8 || "#DDD", this.cScale9 = this.cScale9 || "#BBB", this.cScale10 = this.cScale10 || "#999", this.cScale11 = this.cScale11 || "#777";
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleInv" + t] = this["cScaleInv" + t] || q(this["cScale" + t]);
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this.darkMode ? this["cScalePeer" + t] = this["cScalePeer" + t] || X(this["cScale" + t], 10) : this["cScalePeer" + t] = this["cScalePeer" + t] || nt(this["cScale" + t], 10);
    this.scaleLabelColor = this.scaleLabelColor || (this.darkMode ? "black" : this.labelTextColor), this.cScaleLabel0 = this.cScaleLabel0 || this.cScale1, this.cScaleLabel2 = this.cScaleLabel2 || this.cScale1;
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["cScaleLabel" + t] = this["cScaleLabel" + t] || this.scaleLabelColor;
    for (let t = 0; t < 5; t++)
      this["surface" + t] = this["surface" + t] || T(this.mainBkg, { l: -(5 + t * 5) }), this["surfacePeer" + t] = this["surfacePeer" + t] || T(this.mainBkg, { l: -(8 + t * 5) });
    this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.titleColor = this.text, this.sectionBkgColor = X(this.contrast, 30), this.sectionBkgColor2 = X(this.contrast, 30), this.taskBorderColor = nt(this.contrast, 10), this.taskBkgColor = this.contrast, this.taskTextColor = this.taskTextLightColor, this.taskTextDarkColor = this.text, this.taskTextOutsideColor = this.taskTextDarkColor, this.activeTaskBorderColor = this.taskBorderColor, this.activeTaskBkgColor = this.mainBkg, this.gridColor = X(this.border1, 30), this.doneTaskBkgColor = this.done, this.doneTaskBorderColor = this.lineColor, this.critBkgColor = this.critical, this.critBorderColor = nt(this.critBkgColor, 10), this.todayLineColor = this.critBkgColor, this.vertLineColor = this.critBkgColor, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.transitionColor = this.transitionColor || "#000", this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || "#f4f4f4", this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.stateBorder = this.stateBorder || "#000", this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = "#222", this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = T(this.primaryColor, { h: 64 }), this.fillType3 = T(this.secondaryColor, { h: 64 }), this.fillType4 = T(this.primaryColor, { h: -64 }), this.fillType5 = T(this.secondaryColor, { h: -64 }), this.fillType6 = T(this.primaryColor, { h: 128 }), this.fillType7 = T(this.secondaryColor, { h: 128 });
    for (let t = 0; t < this.THEME_COLOR_LIMIT; t++)
      this["pie" + t] = this["cScale" + t];
    this.pie12 = this.pie0, this.pieTitleTextSize = this.pieTitleTextSize || "25px", this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || "17px", this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || "17px", this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || "black", this.pieStrokeWidth = this.pieStrokeWidth || "2px", this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || "2px", this.pieOuterStrokeColor = this.pieOuterStrokeColor || "black", this.pieOpacity = this.pieOpacity || "0.7", this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || T(this.primaryColor, { r: 5, g: 5, b: 5 }), this.quadrant3Fill = this.quadrant3Fill || T(this.primaryColor, { r: 10, g: 10, b: 10 }), this.quadrant4Fill = this.quadrant4Fill || T(this.primaryColor, { r: 15, g: 15, b: 15 }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || T(this.primaryTextColor, { r: -5, g: -5, b: -5 }), this.quadrant3TextFill = this.quadrant3TextFill || T(this.primaryTextColor, { r: -10, g: -10, b: -10 }), this.quadrant4TextFill = this.quadrant4TextFill || T(this.primaryTextColor, { r: -15, g: -15, b: -15 }), this.quadrantPointFill = this.quadrantPointFill || _n(this.quadrant1Fill) ? X(this.quadrant1Fill) : nt(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
      backgroundColor: this.xyChart?.backgroundColor || this.background,
      titleColor: this.xyChart?.titleColor || this.primaryTextColor,
      xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
      xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
      xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
      xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
      yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
      yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
      yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
      yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
      plotColorPalette: this.xyChart?.plotColorPalette || "#EEE,#6BB8E4,#8ACB88,#C7ACD6,#E8DCC2,#FFB2A8,#FFF380,#7E8D91,#FFD8B1,#FAF3E0"
    }, this.radar = {
      axisColor: this.radar?.axisColor || this.lineColor,
      axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
      axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
      curveOpacity: this.radar?.curveOpacity || 0.5,
      curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
      graticuleColor: this.radar?.graticuleColor || "#DEDEDE",
      graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
      graticuleOpacity: this.radar?.graticuleOpacity || 0.3,
      legendBoxSize: this.radar?.legendBoxSize || 12,
      legendFontSize: this.radar?.legendFontSize || 12
    }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || "1", this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.edgeLabelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = nt(this.pie1, 25) || this.primaryColor, this.git1 = this.pie2 || this.secondaryColor, this.git2 = this.pie3 || this.tertiaryColor, this.git3 = this.pie4 || T(this.primaryColor, { h: -30 }), this.git4 = this.pie5 || T(this.primaryColor, { h: -60 }), this.git5 = this.pie6 || T(this.primaryColor, { h: -90 }), this.git6 = this.pie7 || T(this.primaryColor, { h: 60 }), this.git7 = this.pie8 || T(this.primaryColor, { h: 120 }), this.gitInv0 = this.gitInv0 || q(this.git0), this.gitInv1 = this.gitInv1 || q(this.git1), this.gitInv2 = this.gitInv2 || q(this.git2), this.gitInv3 = this.gitInv3 || q(this.git3), this.gitInv4 = this.gitInv4 || q(this.git4), this.gitInv5 = this.gitInv5 || q(this.git5), this.gitInv6 = this.gitInv6 || q(this.git6), this.gitInv7 = this.gitInv7 || q(this.git7), this.branchLabelColor = this.branchLabelColor || this.labelTextColor, this.gitBranchLabel0 = this.branchLabelColor, this.gitBranchLabel1 = "white", this.gitBranchLabel2 = this.branchLabelColor, this.gitBranchLabel3 = "white", this.gitBranchLabel4 = this.branchLabelColor, this.gitBranchLabel5 = this.branchLabelColor, this.gitBranchLabel6 = this.branchLabelColor, this.gitBranchLabel7 = this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || "10px", this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || "10px", this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || sa, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || aa;
  }
  calculate(t) {
    if (typeof t != "object") {
      this.updateColors();
      return;
    }
    const e = Object.keys(t);
    e.forEach((r) => {
      this[r] = t[r];
    }), this.updateColors(), e.forEach((r) => {
      this[r] = t[r];
    });
  }
}, l1 = /* @__PURE__ */ p((t) => {
  const e = new o1();
  return e.calculate(t), e;
}, "getThemeVariables"), Ye = {
  base: {
    getThemeVariables: t1
  },
  dark: {
    getThemeVariables: r1
  },
  default: {
    getThemeVariables: n1
  },
  forest: {
    getThemeVariables: a1
  },
  neutral: {
    getThemeVariables: l1
  }
}, Be = {
  flowchart: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    subGraphTitleMargin: {
      top: 0,
      bottom: 0
    },
    diagramPadding: 8,
    htmlLabels: !0,
    nodeSpacing: 50,
    rankSpacing: 50,
    curve: "basis",
    padding: 15,
    defaultRenderer: "dagre-wrapper",
    wrappingWidth: 200,
    inheritDir: !1
  },
  sequence: {
    useMaxWidth: !0,
    hideUnusedParticipants: !1,
    activationWidth: 10,
    diagramMarginX: 50,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
    messageAlign: "center",
    mirrorActors: !0,
    forceMenus: !1,
    bottomMarginAdj: 1,
    rightAngles: !1,
    showSequenceNumbers: !1,
    actorFontSize: 14,
    actorFontFamily: '"Open Sans", sans-serif',
    actorFontWeight: 400,
    noteFontSize: 14,
    noteFontFamily: '"trebuchet ms", verdana, arial, sans-serif',
    noteFontWeight: 400,
    noteAlign: "center",
    messageFontSize: 16,
    messageFontFamily: '"trebuchet ms", verdana, arial, sans-serif',
    messageFontWeight: 400,
    wrap: !1,
    wrapPadding: 10,
    labelBoxWidth: 50,
    labelBoxHeight: 20
  },
  gantt: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    rightPadding: 75,
    leftPadding: 75,
    gridLineStartPadding: 35,
    fontSize: 11,
    sectionFontSize: 11,
    numberSectionStyles: 4,
    axisFormat: "%Y-%m-%d",
    topAxis: !1,
    displayMode: "",
    weekday: "sunday"
  },
  journey: {
    useMaxWidth: !0,
    diagramMarginX: 50,
    diagramMarginY: 10,
    leftMargin: 150,
    maxLabelWidth: 360,
    width: 150,
    height: 50,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
    messageAlign: "center",
    bottomMarginAdj: 1,
    rightAngles: !1,
    taskFontSize: 14,
    taskFontFamily: '"Open Sans", sans-serif',
    taskMargin: 50,
    activationWidth: 10,
    textPlacement: "fo",
    actorColours: [
      "#8FBC8F",
      "#7CFC00",
      "#00FFFF",
      "#20B2AA",
      "#B0E0E6",
      "#FFFFE0"
    ],
    sectionFills: [
      "#191970",
      "#8B008B",
      "#4B0082",
      "#2F4F4F",
      "#800000",
      "#8B4513",
      "#00008B"
    ],
    sectionColours: [
      "#fff"
    ],
    titleColor: "",
    titleFontFamily: '"trebuchet ms", verdana, arial, sans-serif',
    titleFontSize: "4ex"
  },
  class: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    arrowMarkerAbsolute: !1,
    dividerMargin: 10,
    padding: 5,
    textHeight: 10,
    defaultRenderer: "dagre-wrapper",
    htmlLabels: !1,
    hideEmptyMembersBox: !1
  },
  state: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    dividerMargin: 10,
    sizeUnit: 5,
    padding: 8,
    textHeight: 10,
    titleShift: -15,
    noteMargin: 10,
    forkWidth: 70,
    forkHeight: 7,
    miniPadding: 2,
    fontSizeFactor: 5.02,
    fontSize: 24,
    labelHeight: 16,
    edgeLengthFactor: "20",
    compositTitleSize: 35,
    radius: 5,
    defaultRenderer: "dagre-wrapper"
  },
  er: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    diagramPadding: 20,
    layoutDirection: "TB",
    minEntityWidth: 100,
    minEntityHeight: 75,
    entityPadding: 15,
    nodeSpacing: 140,
    rankSpacing: 80,
    stroke: "gray",
    fill: "honeydew",
    fontSize: 12
  },
  pie: {
    useMaxWidth: !0,
    textPosition: 0.75
  },
  quadrantChart: {
    useMaxWidth: !0,
    chartWidth: 500,
    chartHeight: 500,
    titleFontSize: 20,
    titlePadding: 10,
    quadrantPadding: 5,
    xAxisLabelPadding: 5,
    yAxisLabelPadding: 5,
    xAxisLabelFontSize: 16,
    yAxisLabelFontSize: 16,
    quadrantLabelFontSize: 16,
    quadrantTextTopPadding: 5,
    pointTextPadding: 5,
    pointLabelFontSize: 12,
    pointRadius: 5,
    xAxisPosition: "top",
    yAxisPosition: "left",
    quadrantInternalBorderStrokeWidth: 1,
    quadrantExternalBorderStrokeWidth: 2
  },
  xyChart: {
    useMaxWidth: !0,
    width: 700,
    height: 500,
    titleFontSize: 20,
    titlePadding: 10,
    showDataLabel: !1,
    showTitle: !0,
    xAxis: {
      $ref: "#/$defs/XYChartAxisConfig",
      showLabel: !0,
      labelFontSize: 14,
      labelPadding: 5,
      showTitle: !0,
      titleFontSize: 16,
      titlePadding: 5,
      showTick: !0,
      tickLength: 5,
      tickWidth: 2,
      showAxisLine: !0,
      axisLineWidth: 2
    },
    yAxis: {
      $ref: "#/$defs/XYChartAxisConfig",
      showLabel: !0,
      labelFontSize: 14,
      labelPadding: 5,
      showTitle: !0,
      titleFontSize: 16,
      titlePadding: 5,
      showTick: !0,
      tickLength: 5,
      tickWidth: 2,
      showAxisLine: !0,
      axisLineWidth: 2
    },
    chartOrientation: "vertical",
    plotReservedSpacePercent: 50
  },
  requirement: {
    useMaxWidth: !0,
    rect_fill: "#f9f9f9",
    text_color: "#333",
    rect_border_size: "0.5px",
    rect_border_color: "#bbb",
    rect_min_width: 200,
    rect_min_height: 200,
    fontSize: 14,
    rect_padding: 10,
    line_height: 20
  },
  mindmap: {
    useMaxWidth: !0,
    padding: 10,
    maxNodeWidth: 200,
    layoutAlgorithm: "cose-bilkent"
  },
  kanban: {
    useMaxWidth: !0,
    padding: 8,
    sectionWidth: 200,
    ticketBaseUrl: ""
  },
  timeline: {
    useMaxWidth: !0,
    diagramMarginX: 50,
    diagramMarginY: 10,
    leftMargin: 150,
    width: 150,
    height: 50,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
    messageAlign: "center",
    bottomMarginAdj: 1,
    rightAngles: !1,
    taskFontSize: 14,
    taskFontFamily: '"Open Sans", sans-serif',
    taskMargin: 50,
    activationWidth: 10,
    textPlacement: "fo",
    actorColours: [
      "#8FBC8F",
      "#7CFC00",
      "#00FFFF",
      "#20B2AA",
      "#B0E0E6",
      "#FFFFE0"
    ],
    sectionFills: [
      "#191970",
      "#8B008B",
      "#4B0082",
      "#2F4F4F",
      "#800000",
      "#8B4513",
      "#00008B"
    ],
    sectionColours: [
      "#fff"
    ],
    disableMulticolor: !1
  },
  gitGraph: {
    useMaxWidth: !0,
    titleTopMargin: 25,
    diagramPadding: 8,
    nodeLabel: {
      width: 75,
      height: 100,
      x: -25,
      y: 0
    },
    mainBranchName: "main",
    mainBranchOrder: 0,
    showCommitLabel: !0,
    showBranches: !0,
    rotateCommitLabel: !0,
    parallelCommits: !1,
    arrowMarkerAbsolute: !1
  },
  c4: {
    useMaxWidth: !0,
    diagramMarginX: 50,
    diagramMarginY: 10,
    c4ShapeMargin: 50,
    c4ShapePadding: 20,
    width: 216,
    height: 60,
    boxMargin: 10,
    c4ShapeInRow: 4,
    nextLinePaddingX: 0,
    c4BoundaryInRow: 2,
    personFontSize: 14,
    personFontFamily: '"Open Sans", sans-serif',
    personFontWeight: "normal",
    external_personFontSize: 14,
    external_personFontFamily: '"Open Sans", sans-serif',
    external_personFontWeight: "normal",
    systemFontSize: 14,
    systemFontFamily: '"Open Sans", sans-serif',
    systemFontWeight: "normal",
    external_systemFontSize: 14,
    external_systemFontFamily: '"Open Sans", sans-serif',
    external_systemFontWeight: "normal",
    system_dbFontSize: 14,
    system_dbFontFamily: '"Open Sans", sans-serif',
    system_dbFontWeight: "normal",
    external_system_dbFontSize: 14,
    external_system_dbFontFamily: '"Open Sans", sans-serif',
    external_system_dbFontWeight: "normal",
    system_queueFontSize: 14,
    system_queueFontFamily: '"Open Sans", sans-serif',
    system_queueFontWeight: "normal",
    external_system_queueFontSize: 14,
    external_system_queueFontFamily: '"Open Sans", sans-serif',
    external_system_queueFontWeight: "normal",
    boundaryFontSize: 14,
    boundaryFontFamily: '"Open Sans", sans-serif',
    boundaryFontWeight: "normal",
    messageFontSize: 12,
    messageFontFamily: '"Open Sans", sans-serif',
    messageFontWeight: "normal",
    containerFontSize: 14,
    containerFontFamily: '"Open Sans", sans-serif',
    containerFontWeight: "normal",
    external_containerFontSize: 14,
    external_containerFontFamily: '"Open Sans", sans-serif',
    external_containerFontWeight: "normal",
    container_dbFontSize: 14,
    container_dbFontFamily: '"Open Sans", sans-serif',
    container_dbFontWeight: "normal",
    external_container_dbFontSize: 14,
    external_container_dbFontFamily: '"Open Sans", sans-serif',
    external_container_dbFontWeight: "normal",
    container_queueFontSize: 14,
    container_queueFontFamily: '"Open Sans", sans-serif',
    container_queueFontWeight: "normal",
    external_container_queueFontSize: 14,
    external_container_queueFontFamily: '"Open Sans", sans-serif',
    external_container_queueFontWeight: "normal",
    componentFontSize: 14,
    componentFontFamily: '"Open Sans", sans-serif',
    componentFontWeight: "normal",
    external_componentFontSize: 14,
    external_componentFontFamily: '"Open Sans", sans-serif',
    external_componentFontWeight: "normal",
    component_dbFontSize: 14,
    component_dbFontFamily: '"Open Sans", sans-serif',
    component_dbFontWeight: "normal",
    external_component_dbFontSize: 14,
    external_component_dbFontFamily: '"Open Sans", sans-serif',
    external_component_dbFontWeight: "normal",
    component_queueFontSize: 14,
    component_queueFontFamily: '"Open Sans", sans-serif',
    component_queueFontWeight: "normal",
    external_component_queueFontSize: 14,
    external_component_queueFontFamily: '"Open Sans", sans-serif',
    external_component_queueFontWeight: "normal",
    wrap: !0,
    wrapPadding: 10,
    person_bg_color: "#08427B",
    person_border_color: "#073B6F",
    external_person_bg_color: "#686868",
    external_person_border_color: "#8A8A8A",
    system_bg_color: "#1168BD",
    system_border_color: "#3C7FC0",
    system_db_bg_color: "#1168BD",
    system_db_border_color: "#3C7FC0",
    system_queue_bg_color: "#1168BD",
    system_queue_border_color: "#3C7FC0",
    external_system_bg_color: "#999999",
    external_system_border_color: "#8A8A8A",
    external_system_db_bg_color: "#999999",
    external_system_db_border_color: "#8A8A8A",
    external_system_queue_bg_color: "#999999",
    external_system_queue_border_color: "#8A8A8A",
    container_bg_color: "#438DD5",
    container_border_color: "#3C7FC0",
    container_db_bg_color: "#438DD5",
    container_db_border_color: "#3C7FC0",
    container_queue_bg_color: "#438DD5",
    container_queue_border_color: "#3C7FC0",
    external_container_bg_color: "#B3B3B3",
    external_container_border_color: "#A6A6A6",
    external_container_db_bg_color: "#B3B3B3",
    external_container_db_border_color: "#A6A6A6",
    external_container_queue_bg_color: "#B3B3B3",
    external_container_queue_border_color: "#A6A6A6",
    component_bg_color: "#85BBF0",
    component_border_color: "#78A8D8",
    component_db_bg_color: "#85BBF0",
    component_db_border_color: "#78A8D8",
    component_queue_bg_color: "#85BBF0",
    component_queue_border_color: "#78A8D8",
    external_component_bg_color: "#CCCCCC",
    external_component_border_color: "#BFBFBF",
    external_component_db_bg_color: "#CCCCCC",
    external_component_db_border_color: "#BFBFBF",
    external_component_queue_bg_color: "#CCCCCC",
    external_component_queue_border_color: "#BFBFBF"
  },
  sankey: {
    useMaxWidth: !0,
    width: 600,
    height: 400,
    linkColor: "gradient",
    nodeAlignment: "justify",
    showValues: !0,
    prefix: "",
    suffix: ""
  },
  block: {
    useMaxWidth: !0,
    padding: 8
  },
  packet: {
    useMaxWidth: !0,
    rowHeight: 32,
    bitWidth: 32,
    bitsPerRow: 32,
    showBits: !0,
    paddingX: 5,
    paddingY: 5
  },
  architecture: {
    useMaxWidth: !0,
    padding: 40,
    iconSize: 80,
    fontSize: 16
  },
  radar: {
    useMaxWidth: !0,
    width: 600,
    height: 600,
    marginTop: 50,
    marginRight: 50,
    marginBottom: 50,
    marginLeft: 50,
    axisScaleFactor: 1,
    axisLabelFactor: 1.05,
    curveTension: 0.17
  },
  theme: "default",
  look: "classic",
  handDrawnSeed: 0,
  layout: "dagre",
  maxTextSize: 5e4,
  maxEdges: 500,
  darkMode: !1,
  fontFamily: '"trebuchet ms", verdana, arial, sans-serif;',
  logLevel: 5,
  securityLevel: "strict",
  startOnLoad: !0,
  arrowMarkerAbsolute: !1,
  secure: [
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "suppressErrorRendering",
    "maxEdges"
  ],
  legacyMathML: !1,
  forceLegacyMathML: !1,
  deterministicIds: !1,
  fontSize: 16,
  markdownAutoWrap: !0,
  suppressErrorRendering: !1
}, If = {
  ...Be,
  // Set, even though they're `undefined` so that `configKeys` finds these keys
  // TODO: Should we replace these with `null` so that they can go in the JSON Schema?
  deterministicIDSeed: void 0,
  elk: {
    // mergeEdges is needed here to be considered
    mergeEdges: !1,
    nodePlacementStrategy: "BRANDES_KOEPF",
    forceNodeModelOrder: !1,
    considerModelOrder: "NODES_AND_EDGES"
  },
  themeCSS: void 0,
  // add non-JSON default config values
  themeVariables: Ye.default.getThemeVariables(),
  sequence: {
    ...Be.sequence,
    messageFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.messageFontFamily,
        fontSize: this.messageFontSize,
        fontWeight: this.messageFontWeight
      };
    }, "messageFont"),
    noteFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.noteFontFamily,
        fontSize: this.noteFontSize,
        fontWeight: this.noteFontWeight
      };
    }, "noteFont"),
    actorFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.actorFontFamily,
        fontSize: this.actorFontSize,
        fontWeight: this.actorFontWeight
      };
    }, "actorFont")
  },
  class: {
    hideEmptyMembersBox: !1
  },
  gantt: {
    ...Be.gantt,
    tickInterval: void 0,
    useWidth: void 0
    // can probably be removed since `configKeys` already includes this
  },
  c4: {
    ...Be.c4,
    useWidth: void 0,
    personFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.personFontFamily,
        fontSize: this.personFontSize,
        fontWeight: this.personFontWeight
      };
    }, "personFont"),
    flowchart: {
      ...Be.flowchart,
      inheritDir: !1
      // default to legacy behavior
    },
    external_personFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_personFontFamily,
        fontSize: this.external_personFontSize,
        fontWeight: this.external_personFontWeight
      };
    }, "external_personFont"),
    systemFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.systemFontFamily,
        fontSize: this.systemFontSize,
        fontWeight: this.systemFontWeight
      };
    }, "systemFont"),
    external_systemFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_systemFontFamily,
        fontSize: this.external_systemFontSize,
        fontWeight: this.external_systemFontWeight
      };
    }, "external_systemFont"),
    system_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.system_dbFontFamily,
        fontSize: this.system_dbFontSize,
        fontWeight: this.system_dbFontWeight
      };
    }, "system_dbFont"),
    external_system_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_system_dbFontFamily,
        fontSize: this.external_system_dbFontSize,
        fontWeight: this.external_system_dbFontWeight
      };
    }, "external_system_dbFont"),
    system_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.system_queueFontFamily,
        fontSize: this.system_queueFontSize,
        fontWeight: this.system_queueFontWeight
      };
    }, "system_queueFont"),
    external_system_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_system_queueFontFamily,
        fontSize: this.external_system_queueFontSize,
        fontWeight: this.external_system_queueFontWeight
      };
    }, "external_system_queueFont"),
    containerFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.containerFontFamily,
        fontSize: this.containerFontSize,
        fontWeight: this.containerFontWeight
      };
    }, "containerFont"),
    external_containerFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_containerFontFamily,
        fontSize: this.external_containerFontSize,
        fontWeight: this.external_containerFontWeight
      };
    }, "external_containerFont"),
    container_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.container_dbFontFamily,
        fontSize: this.container_dbFontSize,
        fontWeight: this.container_dbFontWeight
      };
    }, "container_dbFont"),
    external_container_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_container_dbFontFamily,
        fontSize: this.external_container_dbFontSize,
        fontWeight: this.external_container_dbFontWeight
      };
    }, "external_container_dbFont"),
    container_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.container_queueFontFamily,
        fontSize: this.container_queueFontSize,
        fontWeight: this.container_queueFontWeight
      };
    }, "container_queueFont"),
    external_container_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_container_queueFontFamily,
        fontSize: this.external_container_queueFontSize,
        fontWeight: this.external_container_queueFontWeight
      };
    }, "external_container_queueFont"),
    componentFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.componentFontFamily,
        fontSize: this.componentFontSize,
        fontWeight: this.componentFontWeight
      };
    }, "componentFont"),
    external_componentFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_componentFontFamily,
        fontSize: this.external_componentFontSize,
        fontWeight: this.external_componentFontWeight
      };
    }, "external_componentFont"),
    component_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.component_dbFontFamily,
        fontSize: this.component_dbFontSize,
        fontWeight: this.component_dbFontWeight
      };
    }, "component_dbFont"),
    external_component_dbFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_component_dbFontFamily,
        fontSize: this.external_component_dbFontSize,
        fontWeight: this.external_component_dbFontWeight
      };
    }, "external_component_dbFont"),
    component_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.component_queueFontFamily,
        fontSize: this.component_queueFontSize,
        fontWeight: this.component_queueFontWeight
      };
    }, "component_queueFont"),
    external_component_queueFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.external_component_queueFontFamily,
        fontSize: this.external_component_queueFontSize,
        fontWeight: this.external_component_queueFontWeight
      };
    }, "external_component_queueFont"),
    boundaryFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.boundaryFontFamily,
        fontSize: this.boundaryFontSize,
        fontWeight: this.boundaryFontWeight
      };
    }, "boundaryFont"),
    messageFont: /* @__PURE__ */ p(function() {
      return {
        fontFamily: this.messageFontFamily,
        fontSize: this.messageFontSize,
        fontWeight: this.messageFontWeight
      };
    }, "messageFont")
  },
  pie: {
    ...Be.pie,
    useWidth: 984
  },
  xyChart: {
    ...Be.xyChart,
    useWidth: void 0
  },
  requirement: {
    ...Be.requirement,
    useWidth: void 0
  },
  packet: {
    ...Be.packet
  },
  radar: {
    ...Be.radar
  },
  treemap: {
    useMaxWidth: !0,
    padding: 10,
    diagramPadding: 8,
    showValues: !0,
    nodeWidth: 100,
    nodeHeight: 40,
    borderWidth: 1,
    valueFontSize: 12,
    labelFontSize: 14,
    valueFormat: ","
  }
}, Rf = /* @__PURE__ */ p((t, e = "") => Object.keys(t).reduce((r, i) => Array.isArray(t[i]) ? r : typeof t[i] == "object" && t[i] !== null ? [...r, e + i, ...Rf(t[i], "")] : [...r, e + i], []), "keyify"), c1 = new Set(Rf(If, "")), Pf = If, bs = /* @__PURE__ */ p((t) => {
  if (R.debug("sanitizeDirective called with", t), !(typeof t != "object" || t == null)) {
    if (Array.isArray(t)) {
      t.forEach((e) => bs(e));
      return;
    }
    for (const e of Object.keys(t)) {
      if (R.debug("Checking key", e), e.startsWith("__") || e.includes("proto") || e.includes("constr") || !c1.has(e) || t[e] == null) {
        R.debug("sanitize deleting key: ", e), delete t[e];
        continue;
      }
      if (typeof t[e] == "object") {
        R.debug("sanitizing object", e), bs(t[e]);
        continue;
      }
      const r = ["themeCSS", "fontFamily", "altFontFamily"];
      for (const i of r)
        e.includes(i) && (R.debug("sanitizing css option", e), t[e] = h1(t[e]));
    }
    if (t.themeVariables)
      for (const e of Object.keys(t.themeVariables)) {
        const r = t.themeVariables[e];
        r?.match && !r.match(/^[\d "#%(),.;A-Za-z]+$/) && (t.themeVariables[e] = "");
      }
    R.debug("After sanitization", t);
  }
}, "sanitizeDirective"), h1 = /* @__PURE__ */ p((t) => {
  let e = 0, r = 0;
  for (const i of t) {
    if (e < r)
      return "{ /* ERROR: Unbalanced CSS */ }";
    i === "{" ? e++ : i === "}" && r++;
  }
  return e !== r ? "{ /* ERROR: Unbalanced CSS */ }" : t;
}, "sanitizeCss"), di = Object.freeze(Pf), re = $t({}, di), ws, Dr = [], rn = $t({}, di), oa = /* @__PURE__ */ p((t, e) => {
  let r = $t({}, t), i = {};
  for (const n of e)
    Wf(n), i = $t(i, n);
  if (r = $t(r, i), i.theme && i.theme in Ye) {
    const n = $t({}, ws), s = $t(
      n.themeVariables || {},
      i.themeVariables
    );
    r.theme && r.theme in Ye && (r.themeVariables = Ye[r.theme].getThemeVariables(s));
  }
  return rn = r, qf(rn), rn;
}, "updateCurrentConfig"), u1 = /* @__PURE__ */ p((t) => (re = $t({}, di), re = $t(re, t), t.theme && Ye[t.theme] && (re.themeVariables = Ye[t.theme].getThemeVariables(t.themeVariables)), oa(re, Dr), re), "setSiteConfig"), f1 = /* @__PURE__ */ p((t) => {
  ws = $t({}, t);
}, "saveConfigFromInitialize"), d1 = /* @__PURE__ */ p((t) => (re = $t(re, t), oa(re, Dr), re), "updateSiteConfig"), Nf = /* @__PURE__ */ p(() => $t({}, re), "getSiteConfig"), zf = /* @__PURE__ */ p((t) => (qf(t), $t(rn, t), Ht()), "setConfig"), Ht = /* @__PURE__ */ p(() => $t({}, rn), "getConfig"), Wf = /* @__PURE__ */ p((t) => {
  t && (["secure", ...re.secure ?? []].forEach((e) => {
    Object.hasOwn(t, e) && (R.debug(`Denied attempt to modify a secure key ${e}`, t[e]), delete t[e]);
  }), Object.keys(t).forEach((e) => {
    e.startsWith("__") && delete t[e];
  }), Object.keys(t).forEach((e) => {
    typeof t[e] == "string" && (t[e].includes("<") || t[e].includes(">") || t[e].includes("url(data:")) && delete t[e], typeof t[e] == "object" && Wf(t[e]);
  }));
}, "sanitize"), p1 = /* @__PURE__ */ p((t) => {
  bs(t), t.fontFamily && !t.themeVariables?.fontFamily && (t.themeVariables = {
    ...t.themeVariables,
    fontFamily: t.fontFamily
  }), Dr.push(t), oa(re, Dr);
}, "addDirective"), Cs = /* @__PURE__ */ p((t = re) => {
  Dr = [], oa(t, Dr);
}, "reset"), g1 = {
  LAZY_LOAD_DEPRECATED: "The configuration options lazyLoadedDiagrams and loadExternalDiagramsAtStartup are deprecated. Please use registerExternalDiagrams instead."
}, Lh = {}, m1 = /* @__PURE__ */ p((t) => {
  Lh[t] || (R.warn(g1[t]), Lh[t] = !0);
}, "issueWarning"), qf = /* @__PURE__ */ p((t) => {
  t && (t.lazyLoadedDiagrams || t.loadExternalDiagramsAtStartup) && m1("LAZY_LOAD_DEPRECATED");
}, "checkConfig"), CF = /* @__PURE__ */ p(() => {
  let t = {};
  ws && (t = $t(t, ws));
  for (const e of Dr)
    t = $t(t, e);
  return t;
}, "getUserDefinedConfig"), kn = /<br\s*\/?>/gi, y1 = /* @__PURE__ */ p((t) => t ? jf(t).replace(/\\n/g, "#br#").split("#br#") : [""], "getRows"), x1 = /* @__PURE__ */ (() => {
  let t = !1;
  return () => {
    t || (Hf(), t = !0);
  };
})();
function Hf() {
  const t = "data-temp-href-target";
  fi.addHook("beforeSanitizeAttributes", (e) => {
    e.tagName === "A" && e.hasAttribute("target") && e.setAttribute(t, e.getAttribute("target") ?? "");
  }), fi.addHook("afterSanitizeAttributes", (e) => {
    e.tagName === "A" && e.hasAttribute(t) && (e.setAttribute("target", e.getAttribute(t) ?? ""), e.removeAttribute(t), e.getAttribute("target") === "_blank" && e.setAttribute("rel", "noopener"));
  });
}
p(Hf, "setupDompurifyHooks");
var Yf = /* @__PURE__ */ p((t) => (x1(), fi.sanitize(t)), "removeScript"), Eh = /* @__PURE__ */ p((t, e) => {
  if (e.flowchart?.htmlLabels !== !1) {
    const r = e.securityLevel;
    r === "antiscript" || r === "strict" ? t = Yf(t) : r !== "loose" && (t = jf(t), t = t.replace(/</g, "&lt;").replace(/>/g, "&gt;"), t = t.replace(/=/g, "&equals;"), t = _1(t));
  }
  return t;
}, "sanitizeMore"), de = /* @__PURE__ */ p((t, e) => t && (e.dompurifyConfig ? t = fi.sanitize(Eh(t, e), e.dompurifyConfig).toString() : t = fi.sanitize(Eh(t, e), {
  FORBID_TAGS: ["style"]
}).toString(), t), "sanitizeText"), b1 = /* @__PURE__ */ p((t, e) => typeof t == "string" ? de(t, e) : t.flat().map((r) => de(r, e)), "sanitizeTextOrArray"), w1 = /* @__PURE__ */ p((t) => kn.test(t), "hasBreaks"), C1 = /* @__PURE__ */ p((t) => t.split(kn), "splitBreaks"), _1 = /* @__PURE__ */ p((t) => t.replace(/#br#/g, "<br/>"), "placeholderToBreak"), jf = /* @__PURE__ */ p((t) => t.replace(kn, "#br#"), "breakToPlaceholder"), k1 = /* @__PURE__ */ p((t) => {
  let e = "";
  return t && (e = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.search, e = CSS.escape(e)), e;
}, "getUrl"), Dt = /* @__PURE__ */ p((t) => !(t === !1 || ["false", "null", "0"].includes(String(t).trim().toLowerCase())), "evaluate"), S1 = /* @__PURE__ */ p(function(...t) {
  const e = t.filter((r) => !isNaN(r));
  return Math.max(...e);
}, "getMax"), v1 = /* @__PURE__ */ p(function(...t) {
  const e = t.filter((r) => !isNaN(r));
  return Math.min(...e);
}, "getMin"), Bh = /* @__PURE__ */ p(function(t) {
  const e = t.split(/(,)/), r = [];
  for (let i = 0; i < e.length; i++) {
    let n = e[i];
    if (n === "," && i > 0 && i + 1 < e.length) {
      const s = e[i - 1], a = e[i + 1];
      T1(s, a) && (n = s + "," + a, i++, r.pop());
    }
    r.push(A1(n));
  }
  return r.join("");
}, "parseGenericTypes"), To = /* @__PURE__ */ p((t, e) => Math.max(0, t.split(e).length - 1), "countOccurrence"), T1 = /* @__PURE__ */ p((t, e) => {
  const r = To(t, "~"), i = To(e, "~");
  return r === 1 && i === 1;
}, "shouldCombineSets"), A1 = /* @__PURE__ */ p((t) => {
  const e = To(t, "~");
  let r = !1;
  if (e <= 1)
    return t;
  e % 2 !== 0 && t.startsWith("~") && (t = t.substring(1), r = !0);
  const i = [...t];
  let n = i.indexOf("~"), s = i.lastIndexOf("~");
  for (; n !== -1 && s !== -1 && n !== s; )
    i[n] = "<", i[s] = ">", n = i.indexOf("~"), s = i.lastIndexOf("~");
  return r && i.unshift("~"), i.join("");
}, "processSet"), Mh = /* @__PURE__ */ p(() => window.MathMLElement !== void 0, "isMathMLSupported"), Ao = /\$\$(.*)\$\$/g, pi = /* @__PURE__ */ p((t) => (t.match(Ao)?.length ?? 0) > 0, "hasKatex"), _F = /* @__PURE__ */ p(async (t, e) => {
  const r = document.createElement("div");
  r.innerHTML = await El(t, e), r.id = "katex-temp", r.style.visibility = "hidden", r.style.position = "absolute", r.style.top = "0", document.querySelector("body")?.insertAdjacentElement("beforeend", r);
  const n = { width: r.clientWidth, height: r.clientHeight };
  return r.remove(), n;
}, "calculateMathMLDimensions"), L1 = /* @__PURE__ */ p(async (t, e) => {
  if (!pi(t))
    return t;
  if (!(Mh() || e.legacyMathML || e.forceLegacyMathML))
    return t.replace(Ao, "MathML is unsupported in this environment.");
  {
    const { default: r } = await import("./katex-DoRnZ_sp.js"), i = e.forceLegacyMathML || !Mh() && e.legacyMathML ? "htmlAndMathml" : "mathml";
    return t.split(kn).map(
      (n) => pi(n) ? `<div style="display: flex; align-items: center; justify-content: center; white-space: nowrap;">${n}</div>` : `<div>${n}</div>`
    ).join("").replace(
      Ao,
      (n, s) => r.renderToString(s, {
        throwOnError: !0,
        displayMode: !0,
        output: i
      }).replace(/\n/g, " ").replace(/<annotation.*<\/annotation>/g, "")
    );
  }
}, "renderKatexUnsanitized"), El = /* @__PURE__ */ p(async (t, e) => de(await L1(t, e), e), "renderKatexSanitized"), _i = {
  getRows: y1,
  sanitizeText: de,
  sanitizeTextOrArray: b1,
  hasBreaks: w1,
  splitBreaks: C1,
  lineBreakRegex: kn,
  removeScript: Yf,
  getUrl: k1,
  evaluate: Dt,
  getMax: S1,
  getMin: v1
}, E1 = /* @__PURE__ */ p(function(t, e) {
  for (let r of e)
    t.attr(r[0], r[1]);
}, "d3Attrs"), B1 = /* @__PURE__ */ p(function(t, e, r) {
  let i = /* @__PURE__ */ new Map();
  return r ? (i.set("width", "100%"), i.set("style", `max-width: ${e}px;`)) : (i.set("height", t), i.set("width", e)), i;
}, "calculateSvgSizeAttrs"), Uf = /* @__PURE__ */ p(function(t, e, r, i) {
  const n = B1(e, r, i);
  E1(t, n);
}, "configureSvgSize"), M1 = /* @__PURE__ */ p(function(t, e, r, i) {
  const n = e.node().getBBox(), s = n.width, a = n.height;
  R.info(`SVG bounds: ${s}x${a}`, n);
  let o = 0, l = 0;
  R.info(`Graph bounds: ${o}x${l}`, t), o = s + r * 2, l = a + r * 2, R.info(`Calculated bounds: ${o}x${l}`), Uf(e, l, o, i);
  const c = `${n.x - r} ${n.y - r} ${n.width + 2 * r} ${n.height + 2 * r}`;
  e.attr("viewBox", c);
}, "setupGraphViewbox"), os = {}, $1 = /* @__PURE__ */ p((t, e, r) => {
  let i = "";
  return t in os && os[t] ? i = os[t](r) : R.warn(`No theme found for ${t}`), ` & {
    font-family: ${r.fontFamily};
    font-size: ${r.fontSize};
    fill: ${r.textColor}
  }
  @keyframes edge-animation-frame {
    from {
      stroke-dashoffset: 0;
    }
  }
  @keyframes dash {
    to {
      stroke-dashoffset: 0;
    }
  }
  & .edge-animation-slow {
    stroke-dasharray: 9,5 !important;
    stroke-dashoffset: 900;
    animation: dash 50s linear infinite;
    stroke-linecap: round;
  }
  & .edge-animation-fast {
    stroke-dasharray: 9,5 !important;
    stroke-dashoffset: 900;
    animation: dash 20s linear infinite;
    stroke-linecap: round;
  }
  /* Classes common for multiple diagrams */

  & .error-icon {
    fill: ${r.errorBkgColor};
  }
  & .error-text {
    fill: ${r.errorTextColor};
    stroke: ${r.errorTextColor};
  }

  & .edge-thickness-normal {
    stroke-width: 1px;
  }
  & .edge-thickness-thick {
    stroke-width: 3.5px
  }
  & .edge-pattern-solid {
    stroke-dasharray: 0;
  }
  & .edge-thickness-invisible {
    stroke-width: 0;
    fill: none;
  }
  & .edge-pattern-dashed{
    stroke-dasharray: 3;
  }
  .edge-pattern-dotted {
    stroke-dasharray: 2;
  }

  & .marker {
    fill: ${r.lineColor};
    stroke: ${r.lineColor};
  }
  & .marker.cross {
    stroke: ${r.lineColor};
  }

  & svg {
    font-family: ${r.fontFamily};
    font-size: ${r.fontSize};
  }
   & p {
    margin: 0
   }

  ${i}

  ${e}
`;
}, "getStyles"), F1 = /* @__PURE__ */ p((t, e) => {
  e !== void 0 && (os[t] = e);
}, "addStylesForDiagram"), O1 = $1, Xf = {};
cb(Xf, {
  clear: () => D1,
  getAccDescription: () => N1,
  getAccTitle: () => R1,
  getDiagramTitle: () => W1,
  setAccDescription: () => P1,
  setAccTitle: () => I1,
  setDiagramTitle: () => z1
});
var Bl = "", Ml = "", $l = "", Fl = /* @__PURE__ */ p((t) => de(t, Ht()), "sanitizeText"), D1 = /* @__PURE__ */ p(() => {
  Bl = "", $l = "", Ml = "";
}, "clear"), I1 = /* @__PURE__ */ p((t) => {
  Bl = Fl(t).replace(/^\s+/g, "");
}, "setAccTitle"), R1 = /* @__PURE__ */ p(() => Bl, "getAccTitle"), P1 = /* @__PURE__ */ p((t) => {
  $l = Fl(t).replace(/\n\s+/g, `
`);
}, "setAccDescription"), N1 = /* @__PURE__ */ p(() => $l, "getAccDescription"), z1 = /* @__PURE__ */ p((t) => {
  Ml = Fl(t);
}, "setDiagramTitle"), W1 = /* @__PURE__ */ p(() => Ml, "getDiagramTitle"), $h = R, q1 = Al, yt = Ht, kF = zf, SF = di, Ol = /* @__PURE__ */ p((t) => de(t, yt()), "sanitizeText"), H1 = M1, Y1 = /* @__PURE__ */ p(() => Xf, "getCommonDb"), _s = {}, ks = /* @__PURE__ */ p((t, e, r) => {
  _s[t] && $h.warn(`Diagram with id ${t} already registered. Overwriting.`), _s[t] = e, r && Df(t, r), F1(t, e.styles), e.injectUtils?.(
    $h,
    q1,
    yt,
    Ol,
    H1,
    Y1(),
    () => {
    }
  );
}, "registerDiagram"), Lo = /* @__PURE__ */ p((t) => {
  if (t in _s)
    return _s[t];
  throw new j1(t);
}, "getDiagram"), j1 = class extends Error {
  static {
    p(this, "DiagramNotFoundError");
  }
  constructor(t) {
    super(`Diagram ${t} not found.`);
  }
}, U1 = { value: () => {
} };
function Gf() {
  for (var t = 0, e = arguments.length, r = {}, i; t < e; ++t) {
    if (!(i = arguments[t] + "") || i in r || /[\s.]/.test(i)) throw new Error("illegal type: " + i);
    r[i] = [];
  }
  return new ls(r);
}
function ls(t) {
  this._ = t;
}
function X1(t, e) {
  return t.trim().split(/^|\s+/).map(function(r) {
    var i = "", n = r.indexOf(".");
    if (n >= 0 && (i = r.slice(n + 1), r = r.slice(0, n)), r && !e.hasOwnProperty(r)) throw new Error("unknown type: " + r);
    return { type: r, name: i };
  });
}
ls.prototype = Gf.prototype = {
  constructor: ls,
  on: function(t, e) {
    var r = this._, i = X1(t + "", r), n, s = -1, a = i.length;
    if (arguments.length < 2) {
      for (; ++s < a; ) if ((n = (t = i[s]).type) && (n = G1(r[n], t.name))) return n;
      return;
    }
    if (e != null && typeof e != "function") throw new Error("invalid callback: " + e);
    for (; ++s < a; )
      if (n = (t = i[s]).type) r[n] = Fh(r[n], t.name, e);
      else if (e == null) for (n in r) r[n] = Fh(r[n], t.name, null);
    return this;
  },
  copy: function() {
    var t = {}, e = this._;
    for (var r in e) t[r] = e[r].slice();
    return new ls(t);
  },
  call: function(t, e) {
    if ((n = arguments.length - 2) > 0) for (var r = new Array(n), i = 0, n, s; i < n; ++i) r[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    for (s = this._[t], i = 0, n = s.length; i < n; ++i) s[i].value.apply(e, r);
  },
  apply: function(t, e, r) {
    if (!this._.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    for (var i = this._[t], n = 0, s = i.length; n < s; ++n) i[n].value.apply(e, r);
  }
};
function G1(t, e) {
  for (var r = 0, i = t.length, n; r < i; ++r)
    if ((n = t[r]).name === e)
      return n.value;
}
function Fh(t, e, r) {
  for (var i = 0, n = t.length; i < n; ++i)
    if (t[i].name === e) {
      t[i] = U1, t = t.slice(0, i).concat(t.slice(i + 1));
      break;
    }
  return r != null && t.push({ name: e, value: r }), t;
}
var Eo = "http://www.w3.org/1999/xhtml";
const Oh = {
  svg: "http://www.w3.org/2000/svg",
  xhtml: Eo,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};
function la(t) {
  var e = t += "", r = e.indexOf(":");
  return r >= 0 && (e = t.slice(0, r)) !== "xmlns" && (t = t.slice(r + 1)), Oh.hasOwnProperty(e) ? { space: Oh[e], local: t } : t;
}
function V1(t) {
  return function() {
    var e = this.ownerDocument, r = this.namespaceURI;
    return r === Eo && e.documentElement.namespaceURI === Eo ? e.createElement(t) : e.createElementNS(r, t);
  };
}
function K1(t) {
  return function() {
    return this.ownerDocument.createElementNS(t.space, t.local);
  };
}
function Vf(t) {
  var e = la(t);
  return (e.local ? K1 : V1)(e);
}
function Z1() {
}
function Dl(t) {
  return t == null ? Z1 : function() {
    return this.querySelector(t);
  };
}
function Q1(t) {
  typeof t != "function" && (t = Dl(t));
  for (var e = this._groups, r = e.length, i = new Array(r), n = 0; n < r; ++n)
    for (var s = e[n], a = s.length, o = i[n] = new Array(a), l, c, h = 0; h < a; ++h)
      (l = s[h]) && (c = t.call(l, l.__data__, h, s)) && ("__data__" in l && (c.__data__ = l.__data__), o[h] = c);
  return new ce(i, this._parents);
}
function J1(t) {
  return t == null ? [] : Array.isArray(t) ? t : Array.from(t);
}
function t2() {
  return [];
}
function Kf(t) {
  return t == null ? t2 : function() {
    return this.querySelectorAll(t);
  };
}
function e2(t) {
  return function() {
    return J1(t.apply(this, arguments));
  };
}
function r2(t) {
  typeof t == "function" ? t = e2(t) : t = Kf(t);
  for (var e = this._groups, r = e.length, i = [], n = [], s = 0; s < r; ++s)
    for (var a = e[s], o = a.length, l, c = 0; c < o; ++c)
      (l = a[c]) && (i.push(t.call(l, l.__data__, c, a)), n.push(l));
  return new ce(i, n);
}
function Zf(t) {
  return function() {
    return this.matches(t);
  };
}
function Qf(t) {
  return function(e) {
    return e.matches(t);
  };
}
var i2 = Array.prototype.find;
function n2(t) {
  return function() {
    return i2.call(this.children, t);
  };
}
function s2() {
  return this.firstElementChild;
}
function a2(t) {
  return this.select(t == null ? s2 : n2(typeof t == "function" ? t : Qf(t)));
}
var o2 = Array.prototype.filter;
function l2() {
  return Array.from(this.children);
}
function c2(t) {
  return function() {
    return o2.call(this.children, t);
  };
}
function h2(t) {
  return this.selectAll(t == null ? l2 : c2(typeof t == "function" ? t : Qf(t)));
}
function u2(t) {
  typeof t != "function" && (t = Zf(t));
  for (var e = this._groups, r = e.length, i = new Array(r), n = 0; n < r; ++n)
    for (var s = e[n], a = s.length, o = i[n] = [], l, c = 0; c < a; ++c)
      (l = s[c]) && t.call(l, l.__data__, c, s) && o.push(l);
  return new ce(i, this._parents);
}
function Jf(t) {
  return new Array(t.length);
}
function f2() {
  return new ce(this._enter || this._groups.map(Jf), this._parents);
}
function Ss(t, e) {
  this.ownerDocument = t.ownerDocument, this.namespaceURI = t.namespaceURI, this._next = null, this._parent = t, this.__data__ = e;
}
Ss.prototype = {
  constructor: Ss,
  appendChild: function(t) {
    return this._parent.insertBefore(t, this._next);
  },
  insertBefore: function(t, e) {
    return this._parent.insertBefore(t, e);
  },
  querySelector: function(t) {
    return this._parent.querySelector(t);
  },
  querySelectorAll: function(t) {
    return this._parent.querySelectorAll(t);
  }
};
function d2(t) {
  return function() {
    return t;
  };
}
function p2(t, e, r, i, n, s) {
  for (var a = 0, o, l = e.length, c = s.length; a < c; ++a)
    (o = e[a]) ? (o.__data__ = s[a], i[a] = o) : r[a] = new Ss(t, s[a]);
  for (; a < l; ++a)
    (o = e[a]) && (n[a] = o);
}
function g2(t, e, r, i, n, s, a) {
  var o, l, c = /* @__PURE__ */ new Map(), h = e.length, u = s.length, f = new Array(h), d;
  for (o = 0; o < h; ++o)
    (l = e[o]) && (f[o] = d = a.call(l, l.__data__, o, e) + "", c.has(d) ? n[o] = l : c.set(d, l));
  for (o = 0; o < u; ++o)
    d = a.call(t, s[o], o, s) + "", (l = c.get(d)) ? (i[o] = l, l.__data__ = s[o], c.delete(d)) : r[o] = new Ss(t, s[o]);
  for (o = 0; o < h; ++o)
    (l = e[o]) && c.get(f[o]) === l && (n[o] = l);
}
function m2(t) {
  return t.__data__;
}
function y2(t, e) {
  if (!arguments.length) return Array.from(this, m2);
  var r = e ? g2 : p2, i = this._parents, n = this._groups;
  typeof t != "function" && (t = d2(t));
  for (var s = n.length, a = new Array(s), o = new Array(s), l = new Array(s), c = 0; c < s; ++c) {
    var h = i[c], u = n[c], f = u.length, d = x2(t.call(h, h && h.__data__, c, i)), g = d.length, m = o[c] = new Array(g), y = a[c] = new Array(g), x = l[c] = new Array(f);
    r(h, u, m, y, x, d, e);
    for (var b = 0, C = 0, k, _; b < g; ++b)
      if (k = m[b]) {
        for (b >= C && (C = b + 1); !(_ = y[C]) && ++C < g; ) ;
        k._next = _ || null;
      }
  }
  return a = new ce(a, i), a._enter = o, a._exit = l, a;
}
function x2(t) {
  return typeof t == "object" && "length" in t ? t : Array.from(t);
}
function b2() {
  return new ce(this._exit || this._groups.map(Jf), this._parents);
}
function w2(t, e, r) {
  var i = this.enter(), n = this, s = this.exit();
  return typeof t == "function" ? (i = t(i), i && (i = i.selection())) : i = i.append(t + ""), e != null && (n = e(n), n && (n = n.selection())), r == null ? s.remove() : r(s), i && n ? i.merge(n).order() : n;
}
function C2(t) {
  for (var e = t.selection ? t.selection() : t, r = this._groups, i = e._groups, n = r.length, s = i.length, a = Math.min(n, s), o = new Array(n), l = 0; l < a; ++l)
    for (var c = r[l], h = i[l], u = c.length, f = o[l] = new Array(u), d, g = 0; g < u; ++g)
      (d = c[g] || h[g]) && (f[g] = d);
  for (; l < n; ++l)
    o[l] = r[l];
  return new ce(o, this._parents);
}
function _2() {
  for (var t = this._groups, e = -1, r = t.length; ++e < r; )
    for (var i = t[e], n = i.length - 1, s = i[n], a; --n >= 0; )
      (a = i[n]) && (s && a.compareDocumentPosition(s) ^ 4 && s.parentNode.insertBefore(a, s), s = a);
  return this;
}
function k2(t) {
  t || (t = S2);
  function e(u, f) {
    return u && f ? t(u.__data__, f.__data__) : !u - !f;
  }
  for (var r = this._groups, i = r.length, n = new Array(i), s = 0; s < i; ++s) {
    for (var a = r[s], o = a.length, l = n[s] = new Array(o), c, h = 0; h < o; ++h)
      (c = a[h]) && (l[h] = c);
    l.sort(e);
  }
  return new ce(n, this._parents).order();
}
function S2(t, e) {
  return t < e ? -1 : t > e ? 1 : t >= e ? 0 : NaN;
}
function v2() {
  var t = arguments[0];
  return arguments[0] = this, t.apply(null, arguments), this;
}
function T2() {
  return Array.from(this);
}
function A2() {
  for (var t = this._groups, e = 0, r = t.length; e < r; ++e)
    for (var i = t[e], n = 0, s = i.length; n < s; ++n) {
      var a = i[n];
      if (a) return a;
    }
  return null;
}
function L2() {
  let t = 0;
  for (const e of this) ++t;
  return t;
}
function E2() {
  return !this.node();
}
function B2(t) {
  for (var e = this._groups, r = 0, i = e.length; r < i; ++r)
    for (var n = e[r], s = 0, a = n.length, o; s < a; ++s)
      (o = n[s]) && t.call(o, o.__data__, s, n);
  return this;
}
function M2(t) {
  return function() {
    this.removeAttribute(t);
  };
}
function $2(t) {
  return function() {
    this.removeAttributeNS(t.space, t.local);
  };
}
function F2(t, e) {
  return function() {
    this.setAttribute(t, e);
  };
}
function O2(t, e) {
  return function() {
    this.setAttributeNS(t.space, t.local, e);
  };
}
function D2(t, e) {
  return function() {
    var r = e.apply(this, arguments);
    r == null ? this.removeAttribute(t) : this.setAttribute(t, r);
  };
}
function I2(t, e) {
  return function() {
    var r = e.apply(this, arguments);
    r == null ? this.removeAttributeNS(t.space, t.local) : this.setAttributeNS(t.space, t.local, r);
  };
}
function R2(t, e) {
  var r = la(t);
  if (arguments.length < 2) {
    var i = this.node();
    return r.local ? i.getAttributeNS(r.space, r.local) : i.getAttribute(r);
  }
  return this.each((e == null ? r.local ? $2 : M2 : typeof e == "function" ? r.local ? I2 : D2 : r.local ? O2 : F2)(r, e));
}
function td(t) {
  return t.ownerDocument && t.ownerDocument.defaultView || t.document && t || t.defaultView;
}
function P2(t) {
  return function() {
    this.style.removeProperty(t);
  };
}
function N2(t, e, r) {
  return function() {
    this.style.setProperty(t, e, r);
  };
}
function z2(t, e, r) {
  return function() {
    var i = e.apply(this, arguments);
    i == null ? this.style.removeProperty(t) : this.style.setProperty(t, i, r);
  };
}
function W2(t, e, r) {
  return arguments.length > 1 ? this.each((e == null ? P2 : typeof e == "function" ? z2 : N2)(t, e, r ?? "")) : gi(this.node(), t);
}
function gi(t, e) {
  return t.style.getPropertyValue(e) || td(t).getComputedStyle(t, null).getPropertyValue(e);
}
function q2(t) {
  return function() {
    delete this[t];
  };
}
function H2(t, e) {
  return function() {
    this[t] = e;
  };
}
function Y2(t, e) {
  return function() {
    var r = e.apply(this, arguments);
    r == null ? delete this[t] : this[t] = r;
  };
}
function j2(t, e) {
  return arguments.length > 1 ? this.each((e == null ? q2 : typeof e == "function" ? Y2 : H2)(t, e)) : this.node()[t];
}
function ed(t) {
  return t.trim().split(/^|\s+/);
}
function Il(t) {
  return t.classList || new rd(t);
}
function rd(t) {
  this._node = t, this._names = ed(t.getAttribute("class") || "");
}
rd.prototype = {
  add: function(t) {
    var e = this._names.indexOf(t);
    e < 0 && (this._names.push(t), this._node.setAttribute("class", this._names.join(" ")));
  },
  remove: function(t) {
    var e = this._names.indexOf(t);
    e >= 0 && (this._names.splice(e, 1), this._node.setAttribute("class", this._names.join(" ")));
  },
  contains: function(t) {
    return this._names.indexOf(t) >= 0;
  }
};
function id(t, e) {
  for (var r = Il(t), i = -1, n = e.length; ++i < n; ) r.add(e[i]);
}
function nd(t, e) {
  for (var r = Il(t), i = -1, n = e.length; ++i < n; ) r.remove(e[i]);
}
function U2(t) {
  return function() {
    id(this, t);
  };
}
function X2(t) {
  return function() {
    nd(this, t);
  };
}
function G2(t, e) {
  return function() {
    (e.apply(this, arguments) ? id : nd)(this, t);
  };
}
function V2(t, e) {
  var r = ed(t + "");
  if (arguments.length < 2) {
    for (var i = Il(this.node()), n = -1, s = r.length; ++n < s; ) if (!i.contains(r[n])) return !1;
    return !0;
  }
  return this.each((typeof e == "function" ? G2 : e ? U2 : X2)(r, e));
}
function K2() {
  this.textContent = "";
}
function Z2(t) {
  return function() {
    this.textContent = t;
  };
}
function Q2(t) {
  return function() {
    var e = t.apply(this, arguments);
    this.textContent = e ?? "";
  };
}
function J2(t) {
  return arguments.length ? this.each(t == null ? K2 : (typeof t == "function" ? Q2 : Z2)(t)) : this.node().textContent;
}
function tw() {
  this.innerHTML = "";
}
function ew(t) {
  return function() {
    this.innerHTML = t;
  };
}
function rw(t) {
  return function() {
    var e = t.apply(this, arguments);
    this.innerHTML = e ?? "";
  };
}
function iw(t) {
  return arguments.length ? this.each(t == null ? tw : (typeof t == "function" ? rw : ew)(t)) : this.node().innerHTML;
}
function nw() {
  this.nextSibling && this.parentNode.appendChild(this);
}
function sw() {
  return this.each(nw);
}
function aw() {
  this.previousSibling && this.parentNode.insertBefore(this, this.parentNode.firstChild);
}
function ow() {
  return this.each(aw);
}
function lw(t) {
  var e = typeof t == "function" ? t : Vf(t);
  return this.select(function() {
    return this.appendChild(e.apply(this, arguments));
  });
}
function cw() {
  return null;
}
function hw(t, e) {
  var r = typeof t == "function" ? t : Vf(t), i = e == null ? cw : typeof e == "function" ? e : Dl(e);
  return this.select(function() {
    return this.insertBefore(r.apply(this, arguments), i.apply(this, arguments) || null);
  });
}
function uw() {
  var t = this.parentNode;
  t && t.removeChild(this);
}
function fw() {
  return this.each(uw);
}
function dw() {
  var t = this.cloneNode(!1), e = this.parentNode;
  return e ? e.insertBefore(t, this.nextSibling) : t;
}
function pw() {
  var t = this.cloneNode(!0), e = this.parentNode;
  return e ? e.insertBefore(t, this.nextSibling) : t;
}
function gw(t) {
  return this.select(t ? pw : dw);
}
function mw(t) {
  return arguments.length ? this.property("__data__", t) : this.node().__data__;
}
function yw(t) {
  return function(e) {
    t.call(this, e, this.__data__);
  };
}
function xw(t) {
  return t.trim().split(/^|\s+/).map(function(e) {
    var r = "", i = e.indexOf(".");
    return i >= 0 && (r = e.slice(i + 1), e = e.slice(0, i)), { type: e, name: r };
  });
}
function bw(t) {
  return function() {
    var e = this.__on;
    if (e) {
      for (var r = 0, i = -1, n = e.length, s; r < n; ++r)
        s = e[r], (!t.type || s.type === t.type) && s.name === t.name ? this.removeEventListener(s.type, s.listener, s.options) : e[++i] = s;
      ++i ? e.length = i : delete this.__on;
    }
  };
}
function ww(t, e, r) {
  return function() {
    var i = this.__on, n, s = yw(e);
    if (i) {
      for (var a = 0, o = i.length; a < o; ++a)
        if ((n = i[a]).type === t.type && n.name === t.name) {
          this.removeEventListener(n.type, n.listener, n.options), this.addEventListener(n.type, n.listener = s, n.options = r), n.value = e;
          return;
        }
    }
    this.addEventListener(t.type, s, r), n = { type: t.type, name: t.name, value: e, listener: s, options: r }, i ? i.push(n) : this.__on = [n];
  };
}
function Cw(t, e, r) {
  var i = xw(t + ""), n, s = i.length, a;
  if (arguments.length < 2) {
    var o = this.node().__on;
    if (o) {
      for (var l = 0, c = o.length, h; l < c; ++l)
        for (n = 0, h = o[l]; n < s; ++n)
          if ((a = i[n]).type === h.type && a.name === h.name)
            return h.value;
    }
    return;
  }
  for (o = e ? ww : bw, n = 0; n < s; ++n) this.each(o(i[n], e, r));
  return this;
}
function sd(t, e, r) {
  var i = td(t), n = i.CustomEvent;
  typeof n == "function" ? n = new n(e, r) : (n = i.document.createEvent("Event"), r ? (n.initEvent(e, r.bubbles, r.cancelable), n.detail = r.detail) : n.initEvent(e, !1, !1)), t.dispatchEvent(n);
}
function _w(t, e) {
  return function() {
    return sd(this, t, e);
  };
}
function kw(t, e) {
  return function() {
    return sd(this, t, e.apply(this, arguments));
  };
}
function Sw(t, e) {
  return this.each((typeof e == "function" ? kw : _w)(t, e));
}
function* vw() {
  for (var t = this._groups, e = 0, r = t.length; e < r; ++e)
    for (var i = t[e], n = 0, s = i.length, a; n < s; ++n)
      (a = i[n]) && (yield a);
}
var ad = [null];
function ce(t, e) {
  this._groups = t, this._parents = e;
}
function Sn() {
  return new ce([[document.documentElement]], ad);
}
function Tw() {
  return this;
}
ce.prototype = Sn.prototype = {
  constructor: ce,
  select: Q1,
  selectAll: r2,
  selectChild: a2,
  selectChildren: h2,
  filter: u2,
  data: y2,
  enter: f2,
  exit: b2,
  join: w2,
  merge: C2,
  selection: Tw,
  order: _2,
  sort: k2,
  call: v2,
  nodes: T2,
  node: A2,
  size: L2,
  empty: E2,
  each: B2,
  attr: R2,
  style: W2,
  property: j2,
  classed: V2,
  text: J2,
  html: iw,
  raise: sw,
  lower: ow,
  append: lw,
  insert: hw,
  remove: fw,
  clone: gw,
  datum: mw,
  on: Cw,
  dispatch: Sw,
  [Symbol.iterator]: vw
};
function dt(t) {
  return typeof t == "string" ? new ce([[document.querySelector(t)]], [document.documentElement]) : new ce([[t]], ad);
}
function Rl(t, e, r) {
  t.prototype = e.prototype = r, r.constructor = t;
}
function od(t, e) {
  var r = Object.create(t.prototype);
  for (var i in e) r[i] = e[i];
  return r;
}
function vn() {
}
var ln = 0.7, vs = 1 / ln, ci = "\\s*([+-]?\\d+)\\s*", cn = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*", De = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*", Aw = /^#([0-9a-f]{3,8})$/, Lw = new RegExp(`^rgb\\(${ci},${ci},${ci}\\)$`), Ew = new RegExp(`^rgb\\(${De},${De},${De}\\)$`), Bw = new RegExp(`^rgba\\(${ci},${ci},${ci},${cn}\\)$`), Mw = new RegExp(`^rgba\\(${De},${De},${De},${cn}\\)$`), $w = new RegExp(`^hsl\\(${cn},${De},${De}\\)$`), Fw = new RegExp(`^hsla\\(${cn},${De},${De},${cn}\\)$`), Dh = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
Rl(vn, hn, {
  copy(t) {
    return Object.assign(new this.constructor(), this, t);
  },
  displayable() {
    return this.rgb().displayable();
  },
  hex: Ih,
  // Deprecated! Use color.formatHex.
  formatHex: Ih,
  formatHex8: Ow,
  formatHsl: Dw,
  formatRgb: Rh,
  toString: Rh
});
function Ih() {
  return this.rgb().formatHex();
}
function Ow() {
  return this.rgb().formatHex8();
}
function Dw() {
  return ld(this).formatHsl();
}
function Rh() {
  return this.rgb().formatRgb();
}
function hn(t) {
  var e, r;
  return t = (t + "").trim().toLowerCase(), (e = Aw.exec(t)) ? (r = e[1].length, e = parseInt(e[1], 16), r === 6 ? Ph(e) : r === 3 ? new ne(e >> 8 & 15 | e >> 4 & 240, e >> 4 & 15 | e & 240, (e & 15) << 4 | e & 15, 1) : r === 8 ? Xn(e >> 24 & 255, e >> 16 & 255, e >> 8 & 255, (e & 255) / 255) : r === 4 ? Xn(e >> 12 & 15 | e >> 8 & 240, e >> 8 & 15 | e >> 4 & 240, e >> 4 & 15 | e & 240, ((e & 15) << 4 | e & 15) / 255) : null) : (e = Lw.exec(t)) ? new ne(e[1], e[2], e[3], 1) : (e = Ew.exec(t)) ? new ne(e[1] * 255 / 100, e[2] * 255 / 100, e[3] * 255 / 100, 1) : (e = Bw.exec(t)) ? Xn(e[1], e[2], e[3], e[4]) : (e = Mw.exec(t)) ? Xn(e[1] * 255 / 100, e[2] * 255 / 100, e[3] * 255 / 100, e[4]) : (e = $w.exec(t)) ? Wh(e[1], e[2] / 100, e[3] / 100, 1) : (e = Fw.exec(t)) ? Wh(e[1], e[2] / 100, e[3] / 100, e[4]) : Dh.hasOwnProperty(t) ? Ph(Dh[t]) : t === "transparent" ? new ne(NaN, NaN, NaN, 0) : null;
}
function Ph(t) {
  return new ne(t >> 16 & 255, t >> 8 & 255, t & 255, 1);
}
function Xn(t, e, r, i) {
  return i <= 0 && (t = e = r = NaN), new ne(t, e, r, i);
}
function Iw(t) {
  return t instanceof vn || (t = hn(t)), t ? (t = t.rgb(), new ne(t.r, t.g, t.b, t.opacity)) : new ne();
}
function Bo(t, e, r, i) {
  return arguments.length === 1 ? Iw(t) : new ne(t, e, r, i ?? 1);
}
function ne(t, e, r, i) {
  this.r = +t, this.g = +e, this.b = +r, this.opacity = +i;
}
Rl(ne, Bo, od(vn, {
  brighter(t) {
    return t = t == null ? vs : Math.pow(vs, t), new ne(this.r * t, this.g * t, this.b * t, this.opacity);
  },
  darker(t) {
    return t = t == null ? ln : Math.pow(ln, t), new ne(this.r * t, this.g * t, this.b * t, this.opacity);
  },
  rgb() {
    return this;
  },
  clamp() {
    return new ne(Fr(this.r), Fr(this.g), Fr(this.b), Ts(this.opacity));
  },
  displayable() {
    return -0.5 <= this.r && this.r < 255.5 && -0.5 <= this.g && this.g < 255.5 && -0.5 <= this.b && this.b < 255.5 && 0 <= this.opacity && this.opacity <= 1;
  },
  hex: Nh,
  // Deprecated! Use color.formatHex.
  formatHex: Nh,
  formatHex8: Rw,
  formatRgb: zh,
  toString: zh
}));
function Nh() {
  return `#${Tr(this.r)}${Tr(this.g)}${Tr(this.b)}`;
}
function Rw() {
  return `#${Tr(this.r)}${Tr(this.g)}${Tr(this.b)}${Tr((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
}
function zh() {
  const t = Ts(this.opacity);
  return `${t === 1 ? "rgb(" : "rgba("}${Fr(this.r)}, ${Fr(this.g)}, ${Fr(this.b)}${t === 1 ? ")" : `, ${t})`}`;
}
function Ts(t) {
  return isNaN(t) ? 1 : Math.max(0, Math.min(1, t));
}
function Fr(t) {
  return Math.max(0, Math.min(255, Math.round(t) || 0));
}
function Tr(t) {
  return t = Fr(t), (t < 16 ? "0" : "") + t.toString(16);
}
function Wh(t, e, r, i) {
  return i <= 0 ? t = e = r = NaN : r <= 0 || r >= 1 ? t = e = NaN : e <= 0 && (t = NaN), new be(t, e, r, i);
}
function ld(t) {
  if (t instanceof be) return new be(t.h, t.s, t.l, t.opacity);
  if (t instanceof vn || (t = hn(t)), !t) return new be();
  if (t instanceof be) return t;
  t = t.rgb();
  var e = t.r / 255, r = t.g / 255, i = t.b / 255, n = Math.min(e, r, i), s = Math.max(e, r, i), a = NaN, o = s - n, l = (s + n) / 2;
  return o ? (e === s ? a = (r - i) / o + (r < i) * 6 : r === s ? a = (i - e) / o + 2 : a = (e - r) / o + 4, o /= l < 0.5 ? s + n : 2 - s - n, a *= 60) : o = l > 0 && l < 1 ? 0 : a, new be(a, o, l, t.opacity);
}
function Pw(t, e, r, i) {
  return arguments.length === 1 ? ld(t) : new be(t, e, r, i ?? 1);
}
function be(t, e, r, i) {
  this.h = +t, this.s = +e, this.l = +r, this.opacity = +i;
}
Rl(be, Pw, od(vn, {
  brighter(t) {
    return t = t == null ? vs : Math.pow(vs, t), new be(this.h, this.s, this.l * t, this.opacity);
  },
  darker(t) {
    return t = t == null ? ln : Math.pow(ln, t), new be(this.h, this.s, this.l * t, this.opacity);
  },
  rgb() {
    var t = this.h % 360 + (this.h < 0) * 360, e = isNaN(t) || isNaN(this.s) ? 0 : this.s, r = this.l, i = r + (r < 0.5 ? r : 1 - r) * e, n = 2 * r - i;
    return new ne(
      to(t >= 240 ? t - 240 : t + 120, n, i),
      to(t, n, i),
      to(t < 120 ? t + 240 : t - 120, n, i),
      this.opacity
    );
  },
  clamp() {
    return new be(qh(this.h), Gn(this.s), Gn(this.l), Ts(this.opacity));
  },
  displayable() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && 0 <= this.l && this.l <= 1 && 0 <= this.opacity && this.opacity <= 1;
  },
  formatHsl() {
    const t = Ts(this.opacity);
    return `${t === 1 ? "hsl(" : "hsla("}${qh(this.h)}, ${Gn(this.s) * 100}%, ${Gn(this.l) * 100}%${t === 1 ? ")" : `, ${t})`}`;
  }
}));
function qh(t) {
  return t = (t || 0) % 360, t < 0 ? t + 360 : t;
}
function Gn(t) {
  return Math.max(0, Math.min(1, t || 0));
}
function to(t, e, r) {
  return (t < 60 ? e + (r - e) * t / 60 : t < 180 ? r : t < 240 ? e + (r - e) * (240 - t) / 60 : e) * 255;
}
const Pl = (t) => () => t;
function cd(t, e) {
  return function(r) {
    return t + r * e;
  };
}
function Nw(t, e, r) {
  return t = Math.pow(t, r), e = Math.pow(e, r) - t, r = 1 / r, function(i) {
    return Math.pow(t + i * e, r);
  };
}
function vF(t, e) {
  var r = e - t;
  return r ? cd(t, r > 180 || r < -180 ? r - 360 * Math.round(r / 360) : r) : Pl(isNaN(t) ? e : t);
}
function zw(t) {
  return (t = +t) == 1 ? hd : function(e, r) {
    return r - e ? Nw(e, r, t) : Pl(isNaN(e) ? r : e);
  };
}
function hd(t, e) {
  var r = e - t;
  return r ? cd(t, r) : Pl(isNaN(t) ? e : t);
}
const Hh = (function t(e) {
  var r = zw(e);
  function i(n, s) {
    var a = r((n = Bo(n)).r, (s = Bo(s)).r), o = r(n.g, s.g), l = r(n.b, s.b), c = hd(n.opacity, s.opacity);
    return function(h) {
      return n.r = a(h), n.g = o(h), n.b = l(h), n.opacity = c(h), n + "";
    };
  }
  return i.gamma = t, i;
})(1);
function ir(t, e) {
  return t = +t, e = +e, function(r) {
    return t * (1 - r) + e * r;
  };
}
var Mo = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g, eo = new RegExp(Mo.source, "g");
function Ww(t) {
  return function() {
    return t;
  };
}
function qw(t) {
  return function(e) {
    return t(e) + "";
  };
}
function Hw(t, e) {
  var r = Mo.lastIndex = eo.lastIndex = 0, i, n, s, a = -1, o = [], l = [];
  for (t = t + "", e = e + ""; (i = Mo.exec(t)) && (n = eo.exec(e)); )
    (s = n.index) > r && (s = e.slice(r, s), o[a] ? o[a] += s : o[++a] = s), (i = i[0]) === (n = n[0]) ? o[a] ? o[a] += n : o[++a] = n : (o[++a] = null, l.push({ i: a, x: ir(i, n) })), r = eo.lastIndex;
  return r < e.length && (s = e.slice(r), o[a] ? o[a] += s : o[++a] = s), o.length < 2 ? l[0] ? qw(l[0].x) : Ww(e) : (e = l.length, function(c) {
    for (var h = 0, u; h < e; ++h) o[(u = l[h]).i] = u.x(c);
    return o.join("");
  });
}
var Yh = 180 / Math.PI, $o = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  skewX: 0,
  scaleX: 1,
  scaleY: 1
};
function ud(t, e, r, i, n, s) {
  var a, o, l;
  return (a = Math.sqrt(t * t + e * e)) && (t /= a, e /= a), (l = t * r + e * i) && (r -= t * l, i -= e * l), (o = Math.sqrt(r * r + i * i)) && (r /= o, i /= o, l /= o), t * i < e * r && (t = -t, e = -e, l = -l, a = -a), {
    translateX: n,
    translateY: s,
    rotate: Math.atan2(e, t) * Yh,
    skewX: Math.atan(l) * Yh,
    scaleX: a,
    scaleY: o
  };
}
var Vn;
function Yw(t) {
  const e = new (typeof DOMMatrix == "function" ? DOMMatrix : WebKitCSSMatrix)(t + "");
  return e.isIdentity ? $o : ud(e.a, e.b, e.c, e.d, e.e, e.f);
}
function jw(t) {
  return t == null || (Vn || (Vn = document.createElementNS("http://www.w3.org/2000/svg", "g")), Vn.setAttribute("transform", t), !(t = Vn.transform.baseVal.consolidate())) ? $o : (t = t.matrix, ud(t.a, t.b, t.c, t.d, t.e, t.f));
}
function fd(t, e, r, i) {
  function n(c) {
    return c.length ? c.pop() + " " : "";
  }
  function s(c, h, u, f, d, g) {
    if (c !== u || h !== f) {
      var m = d.push("translate(", null, e, null, r);
      g.push({ i: m - 4, x: ir(c, u) }, { i: m - 2, x: ir(h, f) });
    } else (u || f) && d.push("translate(" + u + e + f + r);
  }
  function a(c, h, u, f) {
    c !== h ? (c - h > 180 ? h += 360 : h - c > 180 && (c += 360), f.push({ i: u.push(n(u) + "rotate(", null, i) - 2, x: ir(c, h) })) : h && u.push(n(u) + "rotate(" + h + i);
  }
  function o(c, h, u, f) {
    c !== h ? f.push({ i: u.push(n(u) + "skewX(", null, i) - 2, x: ir(c, h) }) : h && u.push(n(u) + "skewX(" + h + i);
  }
  function l(c, h, u, f, d, g) {
    if (c !== u || h !== f) {
      var m = d.push(n(d) + "scale(", null, ",", null, ")");
      g.push({ i: m - 4, x: ir(c, u) }, { i: m - 2, x: ir(h, f) });
    } else (u !== 1 || f !== 1) && d.push(n(d) + "scale(" + u + "," + f + ")");
  }
  return function(c, h) {
    var u = [], f = [];
    return c = t(c), h = t(h), s(c.translateX, c.translateY, h.translateX, h.translateY, u, f), a(c.rotate, h.rotate, u, f), o(c.skewX, h.skewX, u, f), l(c.scaleX, c.scaleY, h.scaleX, h.scaleY, u, f), c = h = null, function(d) {
      for (var g = -1, m = f.length, y; ++g < m; ) u[(y = f[g]).i] = y.x(d);
      return u.join("");
    };
  };
}
var Uw = fd(Yw, "px, ", "px)", "deg)"), Xw = fd(jw, ", ", ")", ")"), mi = 0, Yi = 0, Di = 0, dd = 1e3, As, ji, Ls = 0, Ir = 0, ca = 0, un = typeof performance == "object" && performance.now ? performance : Date, pd = typeof window == "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(t) {
  setTimeout(t, 17);
};
function Nl() {
  return Ir || (pd(Gw), Ir = un.now() + ca);
}
function Gw() {
  Ir = 0;
}
function Es() {
  this._call = this._time = this._next = null;
}
Es.prototype = gd.prototype = {
  constructor: Es,
  restart: function(t, e, r) {
    if (typeof t != "function") throw new TypeError("callback is not a function");
    r = (r == null ? Nl() : +r) + (e == null ? 0 : +e), !this._next && ji !== this && (ji ? ji._next = this : As = this, ji = this), this._call = t, this._time = r, Fo();
  },
  stop: function() {
    this._call && (this._call = null, this._time = 1 / 0, Fo());
  }
};
function gd(t, e, r) {
  var i = new Es();
  return i.restart(t, e, r), i;
}
function Vw() {
  Nl(), ++mi;
  for (var t = As, e; t; )
    (e = Ir - t._time) >= 0 && t._call.call(void 0, e), t = t._next;
  --mi;
}
function jh() {
  Ir = (Ls = un.now()) + ca, mi = Yi = 0;
  try {
    Vw();
  } finally {
    mi = 0, Zw(), Ir = 0;
  }
}
function Kw() {
  var t = un.now(), e = t - Ls;
  e > dd && (ca -= e, Ls = t);
}
function Zw() {
  for (var t, e = As, r, i = 1 / 0; e; )
    e._call ? (i > e._time && (i = e._time), t = e, e = e._next) : (r = e._next, e._next = null, e = t ? t._next = r : As = r);
  ji = t, Fo(i);
}
function Fo(t) {
  if (!mi) {
    Yi && (Yi = clearTimeout(Yi));
    var e = t - Ir;
    e > 24 ? (t < 1 / 0 && (Yi = setTimeout(jh, t - un.now() - ca)), Di && (Di = clearInterval(Di))) : (Di || (Ls = un.now(), Di = setInterval(Kw, dd)), mi = 1, pd(jh));
  }
}
function Uh(t, e, r) {
  var i = new Es();
  return e = e == null ? 0 : +e, i.restart((n) => {
    i.stop(), t(n + e);
  }, e, r), i;
}
var Qw = Gf("start", "end", "cancel", "interrupt"), Jw = [], md = 0, Xh = 1, Oo = 2, cs = 3, Gh = 4, Do = 5, hs = 6;
function ha(t, e, r, i, n, s) {
  var a = t.__transition;
  if (!a) t.__transition = {};
  else if (r in a) return;
  tC(t, r, {
    name: e,
    index: i,
    // For context during callback.
    group: n,
    // For context during callback.
    on: Qw,
    tween: Jw,
    time: s.time,
    delay: s.delay,
    duration: s.duration,
    ease: s.ease,
    timer: null,
    state: md
  });
}
function zl(t, e) {
  var r = ke(t, e);
  if (r.state > md) throw new Error("too late; already scheduled");
  return r;
}
function Pe(t, e) {
  var r = ke(t, e);
  if (r.state > cs) throw new Error("too late; already running");
  return r;
}
function ke(t, e) {
  var r = t.__transition;
  if (!r || !(r = r[e])) throw new Error("transition not found");
  return r;
}
function tC(t, e, r) {
  var i = t.__transition, n;
  i[e] = r, r.timer = gd(s, 0, r.time);
  function s(c) {
    r.state = Xh, r.timer.restart(a, r.delay, r.time), r.delay <= c && a(c - r.delay);
  }
  function a(c) {
    var h, u, f, d;
    if (r.state !== Xh) return l();
    for (h in i)
      if (d = i[h], d.name === r.name) {
        if (d.state === cs) return Uh(a);
        d.state === Gh ? (d.state = hs, d.timer.stop(), d.on.call("interrupt", t, t.__data__, d.index, d.group), delete i[h]) : +h < e && (d.state = hs, d.timer.stop(), d.on.call("cancel", t, t.__data__, d.index, d.group), delete i[h]);
      }
    if (Uh(function() {
      r.state === cs && (r.state = Gh, r.timer.restart(o, r.delay, r.time), o(c));
    }), r.state = Oo, r.on.call("start", t, t.__data__, r.index, r.group), r.state === Oo) {
      for (r.state = cs, n = new Array(f = r.tween.length), h = 0, u = -1; h < f; ++h)
        (d = r.tween[h].value.call(t, t.__data__, r.index, r.group)) && (n[++u] = d);
      n.length = u + 1;
    }
  }
  function o(c) {
    for (var h = c < r.duration ? r.ease.call(null, c / r.duration) : (r.timer.restart(l), r.state = Do, 1), u = -1, f = n.length; ++u < f; )
      n[u].call(t, h);
    r.state === Do && (r.on.call("end", t, t.__data__, r.index, r.group), l());
  }
  function l() {
    r.state = hs, r.timer.stop(), delete i[e];
    for (var c in i) return;
    delete t.__transition;
  }
}
function eC(t, e) {
  var r = t.__transition, i, n, s = !0, a;
  if (r) {
    e = e == null ? null : e + "";
    for (a in r) {
      if ((i = r[a]).name !== e) {
        s = !1;
        continue;
      }
      n = i.state > Oo && i.state < Do, i.state = hs, i.timer.stop(), i.on.call(n ? "interrupt" : "cancel", t, t.__data__, i.index, i.group), delete r[a];
    }
    s && delete t.__transition;
  }
}
function rC(t) {
  return this.each(function() {
    eC(this, t);
  });
}
function iC(t, e) {
  var r, i;
  return function() {
    var n = Pe(this, t), s = n.tween;
    if (s !== r) {
      i = r = s;
      for (var a = 0, o = i.length; a < o; ++a)
        if (i[a].name === e) {
          i = i.slice(), i.splice(a, 1);
          break;
        }
    }
    n.tween = i;
  };
}
function nC(t, e, r) {
  var i, n;
  if (typeof r != "function") throw new Error();
  return function() {
    var s = Pe(this, t), a = s.tween;
    if (a !== i) {
      n = (i = a).slice();
      for (var o = { name: e, value: r }, l = 0, c = n.length; l < c; ++l)
        if (n[l].name === e) {
          n[l] = o;
          break;
        }
      l === c && n.push(o);
    }
    s.tween = n;
  };
}
function sC(t, e) {
  var r = this._id;
  if (t += "", arguments.length < 2) {
    for (var i = ke(this.node(), r).tween, n = 0, s = i.length, a; n < s; ++n)
      if ((a = i[n]).name === t)
        return a.value;
    return null;
  }
  return this.each((e == null ? iC : nC)(r, t, e));
}
function Wl(t, e, r) {
  var i = t._id;
  return t.each(function() {
    var n = Pe(this, i);
    (n.value || (n.value = {}))[e] = r.apply(this, arguments);
  }), function(n) {
    return ke(n, i).value[e];
  };
}
function yd(t, e) {
  var r;
  return (typeof e == "number" ? ir : e instanceof hn ? Hh : (r = hn(e)) ? (e = r, Hh) : Hw)(t, e);
}
function aC(t) {
  return function() {
    this.removeAttribute(t);
  };
}
function oC(t) {
  return function() {
    this.removeAttributeNS(t.space, t.local);
  };
}
function lC(t, e, r) {
  var i, n = r + "", s;
  return function() {
    var a = this.getAttribute(t);
    return a === n ? null : a === i ? s : s = e(i = a, r);
  };
}
function cC(t, e, r) {
  var i, n = r + "", s;
  return function() {
    var a = this.getAttributeNS(t.space, t.local);
    return a === n ? null : a === i ? s : s = e(i = a, r);
  };
}
function hC(t, e, r) {
  var i, n, s;
  return function() {
    var a, o = r(this), l;
    return o == null ? void this.removeAttribute(t) : (a = this.getAttribute(t), l = o + "", a === l ? null : a === i && l === n ? s : (n = l, s = e(i = a, o)));
  };
}
function uC(t, e, r) {
  var i, n, s;
  return function() {
    var a, o = r(this), l;
    return o == null ? void this.removeAttributeNS(t.space, t.local) : (a = this.getAttributeNS(t.space, t.local), l = o + "", a === l ? null : a === i && l === n ? s : (n = l, s = e(i = a, o)));
  };
}
function fC(t, e) {
  var r = la(t), i = r === "transform" ? Xw : yd;
  return this.attrTween(t, typeof e == "function" ? (r.local ? uC : hC)(r, i, Wl(this, "attr." + t, e)) : e == null ? (r.local ? oC : aC)(r) : (r.local ? cC : lC)(r, i, e));
}
function dC(t, e) {
  return function(r) {
    this.setAttribute(t, e.call(this, r));
  };
}
function pC(t, e) {
  return function(r) {
    this.setAttributeNS(t.space, t.local, e.call(this, r));
  };
}
function gC(t, e) {
  var r, i;
  function n() {
    var s = e.apply(this, arguments);
    return s !== i && (r = (i = s) && pC(t, s)), r;
  }
  return n._value = e, n;
}
function mC(t, e) {
  var r, i;
  function n() {
    var s = e.apply(this, arguments);
    return s !== i && (r = (i = s) && dC(t, s)), r;
  }
  return n._value = e, n;
}
function yC(t, e) {
  var r = "attr." + t;
  if (arguments.length < 2) return (r = this.tween(r)) && r._value;
  if (e == null) return this.tween(r, null);
  if (typeof e != "function") throw new Error();
  var i = la(t);
  return this.tween(r, (i.local ? gC : mC)(i, e));
}
function xC(t, e) {
  return function() {
    zl(this, t).delay = +e.apply(this, arguments);
  };
}
function bC(t, e) {
  return e = +e, function() {
    zl(this, t).delay = e;
  };
}
function wC(t) {
  var e = this._id;
  return arguments.length ? this.each((typeof t == "function" ? xC : bC)(e, t)) : ke(this.node(), e).delay;
}
function CC(t, e) {
  return function() {
    Pe(this, t).duration = +e.apply(this, arguments);
  };
}
function _C(t, e) {
  return e = +e, function() {
    Pe(this, t).duration = e;
  };
}
function kC(t) {
  var e = this._id;
  return arguments.length ? this.each((typeof t == "function" ? CC : _C)(e, t)) : ke(this.node(), e).duration;
}
function SC(t, e) {
  if (typeof e != "function") throw new Error();
  return function() {
    Pe(this, t).ease = e;
  };
}
function vC(t) {
  var e = this._id;
  return arguments.length ? this.each(SC(e, t)) : ke(this.node(), e).ease;
}
function TC(t, e) {
  return function() {
    var r = e.apply(this, arguments);
    if (typeof r != "function") throw new Error();
    Pe(this, t).ease = r;
  };
}
function AC(t) {
  if (typeof t != "function") throw new Error();
  return this.each(TC(this._id, t));
}
function LC(t) {
  typeof t != "function" && (t = Zf(t));
  for (var e = this._groups, r = e.length, i = new Array(r), n = 0; n < r; ++n)
    for (var s = e[n], a = s.length, o = i[n] = [], l, c = 0; c < a; ++c)
      (l = s[c]) && t.call(l, l.__data__, c, s) && o.push(l);
  return new Ue(i, this._parents, this._name, this._id);
}
function EC(t) {
  if (t._id !== this._id) throw new Error();
  for (var e = this._groups, r = t._groups, i = e.length, n = r.length, s = Math.min(i, n), a = new Array(i), o = 0; o < s; ++o)
    for (var l = e[o], c = r[o], h = l.length, u = a[o] = new Array(h), f, d = 0; d < h; ++d)
      (f = l[d] || c[d]) && (u[d] = f);
  for (; o < i; ++o)
    a[o] = e[o];
  return new Ue(a, this._parents, this._name, this._id);
}
function BC(t) {
  return (t + "").trim().split(/^|\s+/).every(function(e) {
    var r = e.indexOf(".");
    return r >= 0 && (e = e.slice(0, r)), !e || e === "start";
  });
}
function MC(t, e, r) {
  var i, n, s = BC(e) ? zl : Pe;
  return function() {
    var a = s(this, t), o = a.on;
    o !== i && (n = (i = o).copy()).on(e, r), a.on = n;
  };
}
function $C(t, e) {
  var r = this._id;
  return arguments.length < 2 ? ke(this.node(), r).on.on(t) : this.each(MC(r, t, e));
}
function FC(t) {
  return function() {
    var e = this.parentNode;
    for (var r in this.__transition) if (+r !== t) return;
    e && e.removeChild(this);
  };
}
function OC() {
  return this.on("end.remove", FC(this._id));
}
function DC(t) {
  var e = this._name, r = this._id;
  typeof t != "function" && (t = Dl(t));
  for (var i = this._groups, n = i.length, s = new Array(n), a = 0; a < n; ++a)
    for (var o = i[a], l = o.length, c = s[a] = new Array(l), h, u, f = 0; f < l; ++f)
      (h = o[f]) && (u = t.call(h, h.__data__, f, o)) && ("__data__" in h && (u.__data__ = h.__data__), c[f] = u, ha(c[f], e, r, f, c, ke(h, r)));
  return new Ue(s, this._parents, e, r);
}
function IC(t) {
  var e = this._name, r = this._id;
  typeof t != "function" && (t = Kf(t));
  for (var i = this._groups, n = i.length, s = [], a = [], o = 0; o < n; ++o)
    for (var l = i[o], c = l.length, h, u = 0; u < c; ++u)
      if (h = l[u]) {
        for (var f = t.call(h, h.__data__, u, l), d, g = ke(h, r), m = 0, y = f.length; m < y; ++m)
          (d = f[m]) && ha(d, e, r, m, f, g);
        s.push(f), a.push(h);
      }
  return new Ue(s, a, e, r);
}
var RC = Sn.prototype.constructor;
function PC() {
  return new RC(this._groups, this._parents);
}
function NC(t, e) {
  var r, i, n;
  return function() {
    var s = gi(this, t), a = (this.style.removeProperty(t), gi(this, t));
    return s === a ? null : s === r && a === i ? n : n = e(r = s, i = a);
  };
}
function xd(t) {
  return function() {
    this.style.removeProperty(t);
  };
}
function zC(t, e, r) {
  var i, n = r + "", s;
  return function() {
    var a = gi(this, t);
    return a === n ? null : a === i ? s : s = e(i = a, r);
  };
}
function WC(t, e, r) {
  var i, n, s;
  return function() {
    var a = gi(this, t), o = r(this), l = o + "";
    return o == null && (l = o = (this.style.removeProperty(t), gi(this, t))), a === l ? null : a === i && l === n ? s : (n = l, s = e(i = a, o));
  };
}
function qC(t, e) {
  var r, i, n, s = "style." + e, a = "end." + s, o;
  return function() {
    var l = Pe(this, t), c = l.on, h = l.value[s] == null ? o || (o = xd(e)) : void 0;
    (c !== r || n !== h) && (i = (r = c).copy()).on(a, n = h), l.on = i;
  };
}
function HC(t, e, r) {
  var i = (t += "") == "transform" ? Uw : yd;
  return e == null ? this.styleTween(t, NC(t, i)).on("end.style." + t, xd(t)) : typeof e == "function" ? this.styleTween(t, WC(t, i, Wl(this, "style." + t, e))).each(qC(this._id, t)) : this.styleTween(t, zC(t, i, e), r).on("end.style." + t, null);
}
function YC(t, e, r) {
  return function(i) {
    this.style.setProperty(t, e.call(this, i), r);
  };
}
function jC(t, e, r) {
  var i, n;
  function s() {
    var a = e.apply(this, arguments);
    return a !== n && (i = (n = a) && YC(t, a, r)), i;
  }
  return s._value = e, s;
}
function UC(t, e, r) {
  var i = "style." + (t += "");
  if (arguments.length < 2) return (i = this.tween(i)) && i._value;
  if (e == null) return this.tween(i, null);
  if (typeof e != "function") throw new Error();
  return this.tween(i, jC(t, e, r ?? ""));
}
function XC(t) {
  return function() {
    this.textContent = t;
  };
}
function GC(t) {
  return function() {
    var e = t(this);
    this.textContent = e ?? "";
  };
}
function VC(t) {
  return this.tween("text", typeof t == "function" ? GC(Wl(this, "text", t)) : XC(t == null ? "" : t + ""));
}
function KC(t) {
  return function(e) {
    this.textContent = t.call(this, e);
  };
}
function ZC(t) {
  var e, r;
  function i() {
    var n = t.apply(this, arguments);
    return n !== r && (e = (r = n) && KC(n)), e;
  }
  return i._value = t, i;
}
function QC(t) {
  var e = "text";
  if (arguments.length < 1) return (e = this.tween(e)) && e._value;
  if (t == null) return this.tween(e, null);
  if (typeof t != "function") throw new Error();
  return this.tween(e, ZC(t));
}
function JC() {
  for (var t = this._name, e = this._id, r = bd(), i = this._groups, n = i.length, s = 0; s < n; ++s)
    for (var a = i[s], o = a.length, l, c = 0; c < o; ++c)
      if (l = a[c]) {
        var h = ke(l, e);
        ha(l, t, r, c, a, {
          time: h.time + h.delay + h.duration,
          delay: 0,
          duration: h.duration,
          ease: h.ease
        });
      }
  return new Ue(i, this._parents, t, r);
}
function t_() {
  var t, e, r = this, i = r._id, n = r.size();
  return new Promise(function(s, a) {
    var o = { value: a }, l = { value: function() {
      --n === 0 && s();
    } };
    r.each(function() {
      var c = Pe(this, i), h = c.on;
      h !== t && (e = (t = h).copy(), e._.cancel.push(o), e._.interrupt.push(o), e._.end.push(l)), c.on = e;
    }), n === 0 && s();
  });
}
var e_ = 0;
function Ue(t, e, r, i) {
  this._groups = t, this._parents = e, this._name = r, this._id = i;
}
function bd() {
  return ++e_;
}
var We = Sn.prototype;
Ue.prototype = {
  constructor: Ue,
  select: DC,
  selectAll: IC,
  selectChild: We.selectChild,
  selectChildren: We.selectChildren,
  filter: LC,
  merge: EC,
  selection: PC,
  transition: JC,
  call: We.call,
  nodes: We.nodes,
  node: We.node,
  size: We.size,
  empty: We.empty,
  each: We.each,
  on: $C,
  attr: fC,
  attrTween: yC,
  style: HC,
  styleTween: UC,
  text: VC,
  textTween: QC,
  remove: OC,
  tween: sC,
  delay: wC,
  duration: kC,
  ease: vC,
  easeVarying: AC,
  end: t_,
  [Symbol.iterator]: We[Symbol.iterator]
};
function r_(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}
var i_ = {
  time: null,
  // Set on use.
  delay: 0,
  duration: 250,
  ease: r_
};
function n_(t, e) {
  for (var r; !(r = t.__transition) || !(r = r[e]); )
    if (!(t = t.parentNode))
      throw new Error(`transition ${e} not found`);
  return r;
}
function s_(t) {
  var e, r;
  t instanceof Ue ? (e = t._id, t = t._name) : (e = bd(), (r = i_).time = Nl(), t = t == null ? null : t + "");
  for (var i = this._groups, n = i.length, s = 0; s < n; ++s)
    for (var a = i[s], o = a.length, l, c = 0; c < o; ++c)
      (l = a[c]) && ha(l, t, e, c, a, r || n_(l, e));
  return new Ue(i, this._parents, t, e);
}
Sn.prototype.interrupt = rC;
Sn.prototype.transition = s_;
const Io = Math.PI, Ro = 2 * Io, _r = 1e-6, a_ = Ro - _r;
function wd(t) {
  this._ += t[0];
  for (let e = 1, r = t.length; e < r; ++e)
    this._ += arguments[e] + t[e];
}
function o_(t) {
  let e = Math.floor(t);
  if (!(e >= 0)) throw new Error(`invalid digits: ${t}`);
  if (e > 15) return wd;
  const r = 10 ** e;
  return function(i) {
    this._ += i[0];
    for (let n = 1, s = i.length; n < s; ++n)
      this._ += Math.round(arguments[n] * r) / r + i[n];
  };
}
class l_ {
  constructor(e) {
    this._x0 = this._y0 = // start of current subpath
    this._x1 = this._y1 = null, this._ = "", this._append = e == null ? wd : o_(e);
  }
  moveTo(e, r) {
    this._append`M${this._x0 = this._x1 = +e},${this._y0 = this._y1 = +r}`;
  }
  closePath() {
    this._x1 !== null && (this._x1 = this._x0, this._y1 = this._y0, this._append`Z`);
  }
  lineTo(e, r) {
    this._append`L${this._x1 = +e},${this._y1 = +r}`;
  }
  quadraticCurveTo(e, r, i, n) {
    this._append`Q${+e},${+r},${this._x1 = +i},${this._y1 = +n}`;
  }
  bezierCurveTo(e, r, i, n, s, a) {
    this._append`C${+e},${+r},${+i},${+n},${this._x1 = +s},${this._y1 = +a}`;
  }
  arcTo(e, r, i, n, s) {
    if (e = +e, r = +r, i = +i, n = +n, s = +s, s < 0) throw new Error(`negative radius: ${s}`);
    let a = this._x1, o = this._y1, l = i - e, c = n - r, h = a - e, u = o - r, f = h * h + u * u;
    if (this._x1 === null)
      this._append`M${this._x1 = e},${this._y1 = r}`;
    else if (f > _r) if (!(Math.abs(u * l - c * h) > _r) || !s)
      this._append`L${this._x1 = e},${this._y1 = r}`;
    else {
      let d = i - a, g = n - o, m = l * l + c * c, y = d * d + g * g, x = Math.sqrt(m), b = Math.sqrt(f), C = s * Math.tan((Io - Math.acos((m + f - y) / (2 * x * b))) / 2), k = C / b, _ = C / x;
      Math.abs(k - 1) > _r && this._append`L${e + k * h},${r + k * u}`, this._append`A${s},${s},0,0,${+(u * d > h * g)},${this._x1 = e + _ * l},${this._y1 = r + _ * c}`;
    }
  }
  arc(e, r, i, n, s, a) {
    if (e = +e, r = +r, i = +i, a = !!a, i < 0) throw new Error(`negative radius: ${i}`);
    let o = i * Math.cos(n), l = i * Math.sin(n), c = e + o, h = r + l, u = 1 ^ a, f = a ? n - s : s - n;
    this._x1 === null ? this._append`M${c},${h}` : (Math.abs(this._x1 - c) > _r || Math.abs(this._y1 - h) > _r) && this._append`L${c},${h}`, i && (f < 0 && (f = f % Ro + Ro), f > a_ ? this._append`A${i},${i},0,1,${u},${e - o},${r - l}A${i},${i},0,1,${u},${this._x1 = c},${this._y1 = h}` : f > _r && this._append`A${i},${i},0,${+(f >= Io)},${u},${this._x1 = e + i * Math.cos(s)},${this._y1 = r + i * Math.sin(s)}`);
  }
  rect(e, r, i, n) {
    this._append`M${this._x0 = this._x1 = +e},${this._y0 = this._y1 = +r}h${i = +i}v${+n}h${-i}Z`;
  }
  toString() {
    return this._;
  }
}
function ti(t) {
  return function() {
    return t;
  };
}
const TF = Math.abs, AF = Math.atan2, LF = Math.cos, EF = Math.max, BF = Math.min, MF = Math.sin, $F = Math.sqrt, Vh = 1e-12, ql = Math.PI, Kh = ql / 2, FF = 2 * ql;
function OF(t) {
  return t > 1 ? 0 : t < -1 ? ql : Math.acos(t);
}
function DF(t) {
  return t >= 1 ? Kh : t <= -1 ? -Kh : Math.asin(t);
}
function c_(t) {
  let e = 3;
  return t.digits = function(r) {
    if (!arguments.length) return e;
    if (r == null)
      e = null;
    else {
      const i = Math.floor(r);
      if (!(i >= 0)) throw new RangeError(`invalid digits: ${r}`);
      e = i;
    }
    return t;
  }, () => new l_(e);
}
function h_(t) {
  return typeof t == "object" && "length" in t ? t : Array.from(t);
}
function Cd(t) {
  this._context = t;
}
Cd.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._point = 0;
  },
  lineEnd: function() {
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
        break;
      case 1:
        this._point = 2;
      // falls through
      default:
        this._context.lineTo(t, e);
        break;
    }
  }
};
function Bs(t) {
  return new Cd(t);
}
function u_(t) {
  return t[0];
}
function f_(t) {
  return t[1];
}
function d_(t, e) {
  var r = ti(!0), i = null, n = Bs, s = null, a = c_(o);
  t = typeof t == "function" ? t : t === void 0 ? u_ : ti(t), e = typeof e == "function" ? e : e === void 0 ? f_ : ti(e);
  function o(l) {
    var c, h = (l = h_(l)).length, u, f = !1, d;
    for (i == null && (s = n(d = a())), c = 0; c <= h; ++c)
      !(c < h && r(u = l[c], c, l)) === f && ((f = !f) ? s.lineStart() : s.lineEnd()), f && s.point(+t(u, c, l), +e(u, c, l));
    if (d) return s = null, d + "" || null;
  }
  return o.x = function(l) {
    return arguments.length ? (t = typeof l == "function" ? l : ti(+l), o) : t;
  }, o.y = function(l) {
    return arguments.length ? (e = typeof l == "function" ? l : ti(+l), o) : e;
  }, o.defined = function(l) {
    return arguments.length ? (r = typeof l == "function" ? l : ti(!!l), o) : r;
  }, o.curve = function(l) {
    return arguments.length ? (n = l, i != null && (s = n(i)), o) : n;
  }, o.context = function(l) {
    return arguments.length ? (l == null ? i = s = null : s = n(i = l), o) : i;
  }, o;
}
class _d {
  constructor(e, r) {
    this._context = e, this._x = r;
  }
  areaStart() {
    this._line = 0;
  }
  areaEnd() {
    this._line = NaN;
  }
  lineStart() {
    this._point = 0;
  }
  lineEnd() {
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  }
  point(e, r) {
    switch (e = +e, r = +r, this._point) {
      case 0: {
        this._point = 1, this._line ? this._context.lineTo(e, r) : this._context.moveTo(e, r);
        break;
      }
      case 1:
        this._point = 2;
      // falls through
      default: {
        this._x ? this._context.bezierCurveTo(this._x0 = (this._x0 + e) / 2, this._y0, this._x0, r, e, r) : this._context.bezierCurveTo(this._x0, this._y0 = (this._y0 + r) / 2, e, this._y0, e, r);
        break;
      }
    }
    this._x0 = e, this._y0 = r;
  }
}
function kd(t) {
  return new _d(t, !0);
}
function Sd(t) {
  return new _d(t, !1);
}
function or() {
}
function Ms(t, e, r) {
  t._context.bezierCurveTo(
    (2 * t._x0 + t._x1) / 3,
    (2 * t._y0 + t._y1) / 3,
    (t._x0 + 2 * t._x1) / 3,
    (t._y0 + 2 * t._y1) / 3,
    (t._x0 + 4 * t._x1 + e) / 6,
    (t._y0 + 4 * t._y1 + r) / 6
  );
}
function ua(t) {
  this._context = t;
}
ua.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._y0 = this._y1 = NaN, this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 3:
        Ms(this, this._x1, this._y1);
      // falls through
      case 2:
        this._context.lineTo(this._x1, this._y1);
        break;
    }
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
        break;
      case 1:
        this._point = 2;
        break;
      case 2:
        this._point = 3, this._context.lineTo((5 * this._x0 + this._x1) / 6, (5 * this._y0 + this._y1) / 6);
      // falls through
      default:
        Ms(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = t, this._y0 = this._y1, this._y1 = e;
  }
};
function us(t) {
  return new ua(t);
}
function vd(t) {
  this._context = t;
}
vd.prototype = {
  areaStart: or,
  areaEnd: or,
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._x3 = this._x4 = this._y0 = this._y1 = this._y2 = this._y3 = this._y4 = NaN, this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 1: {
        this._context.moveTo(this._x2, this._y2), this._context.closePath();
        break;
      }
      case 2: {
        this._context.moveTo((this._x2 + 2 * this._x3) / 3, (this._y2 + 2 * this._y3) / 3), this._context.lineTo((this._x3 + 2 * this._x2) / 3, (this._y3 + 2 * this._y2) / 3), this._context.closePath();
        break;
      }
      case 3: {
        this.point(this._x2, this._y2), this.point(this._x3, this._y3), this.point(this._x4, this._y4);
        break;
      }
    }
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._x2 = t, this._y2 = e;
        break;
      case 1:
        this._point = 2, this._x3 = t, this._y3 = e;
        break;
      case 2:
        this._point = 3, this._x4 = t, this._y4 = e, this._context.moveTo((this._x0 + 4 * this._x1 + t) / 6, (this._y0 + 4 * this._y1 + e) / 6);
        break;
      default:
        Ms(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = t, this._y0 = this._y1, this._y1 = e;
  }
};
function p_(t) {
  return new vd(t);
}
function Td(t) {
  this._context = t;
}
Td.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._y0 = this._y1 = NaN, this._point = 0;
  },
  lineEnd: function() {
    (this._line || this._line !== 0 && this._point === 3) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1;
        break;
      case 1:
        this._point = 2;
        break;
      case 2:
        this._point = 3;
        var r = (this._x0 + 4 * this._x1 + t) / 6, i = (this._y0 + 4 * this._y1 + e) / 6;
        this._line ? this._context.lineTo(r, i) : this._context.moveTo(r, i);
        break;
      case 3:
        this._point = 4;
      // falls through
      default:
        Ms(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = t, this._y0 = this._y1, this._y1 = e;
  }
};
function g_(t) {
  return new Td(t);
}
function Ad(t, e) {
  this._basis = new ua(t), this._beta = e;
}
Ad.prototype = {
  lineStart: function() {
    this._x = [], this._y = [], this._basis.lineStart();
  },
  lineEnd: function() {
    var t = this._x, e = this._y, r = t.length - 1;
    if (r > 0)
      for (var i = t[0], n = e[0], s = t[r] - i, a = e[r] - n, o = -1, l; ++o <= r; )
        l = o / r, this._basis.point(
          this._beta * t[o] + (1 - this._beta) * (i + l * s),
          this._beta * e[o] + (1 - this._beta) * (n + l * a)
        );
    this._x = this._y = null, this._basis.lineEnd();
  },
  point: function(t, e) {
    this._x.push(+t), this._y.push(+e);
  }
};
const m_ = (function t(e) {
  function r(i) {
    return e === 1 ? new ua(i) : new Ad(i, e);
  }
  return r.beta = function(i) {
    return t(+i);
  }, r;
})(0.85);
function $s(t, e, r) {
  t._context.bezierCurveTo(
    t._x1 + t._k * (t._x2 - t._x0),
    t._y1 + t._k * (t._y2 - t._y0),
    t._x2 + t._k * (t._x1 - e),
    t._y2 + t._k * (t._y1 - r),
    t._x2,
    t._y2
  );
}
function Hl(t, e) {
  this._context = t, this._k = (1 - e) / 6;
}
Hl.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._y0 = this._y1 = this._y2 = NaN, this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 2:
        this._context.lineTo(this._x2, this._y2);
        break;
      case 3:
        $s(this, this._x1, this._y1);
        break;
    }
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
        break;
      case 1:
        this._point = 2, this._x1 = t, this._y1 = e;
        break;
      case 2:
        this._point = 3;
      // falls through
      default:
        $s(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const Ld = (function t(e) {
  function r(i) {
    return new Hl(i, e);
  }
  return r.tension = function(i) {
    return t(+i);
  }, r;
})(0);
function Yl(t, e) {
  this._context = t, this._k = (1 - e) / 6;
}
Yl.prototype = {
  areaStart: or,
  areaEnd: or,
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._x3 = this._x4 = this._x5 = this._y0 = this._y1 = this._y2 = this._y3 = this._y4 = this._y5 = NaN, this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 1: {
        this._context.moveTo(this._x3, this._y3), this._context.closePath();
        break;
      }
      case 2: {
        this._context.lineTo(this._x3, this._y3), this._context.closePath();
        break;
      }
      case 3: {
        this.point(this._x3, this._y3), this.point(this._x4, this._y4), this.point(this._x5, this._y5);
        break;
      }
    }
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._x3 = t, this._y3 = e;
        break;
      case 1:
        this._point = 2, this._context.moveTo(this._x4 = t, this._y4 = e);
        break;
      case 2:
        this._point = 3, this._x5 = t, this._y5 = e;
        break;
      default:
        $s(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const y_ = (function t(e) {
  function r(i) {
    return new Yl(i, e);
  }
  return r.tension = function(i) {
    return t(+i);
  }, r;
})(0);
function jl(t, e) {
  this._context = t, this._k = (1 - e) / 6;
}
jl.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._y0 = this._y1 = this._y2 = NaN, this._point = 0;
  },
  lineEnd: function() {
    (this._line || this._line !== 0 && this._point === 3) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1;
        break;
      case 1:
        this._point = 2;
        break;
      case 2:
        this._point = 3, this._line ? this._context.lineTo(this._x2, this._y2) : this._context.moveTo(this._x2, this._y2);
        break;
      case 3:
        this._point = 4;
      // falls through
      default:
        $s(this, t, e);
        break;
    }
    this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const x_ = (function t(e) {
  function r(i) {
    return new jl(i, e);
  }
  return r.tension = function(i) {
    return t(+i);
  }, r;
})(0);
function Ul(t, e, r) {
  var i = t._x1, n = t._y1, s = t._x2, a = t._y2;
  if (t._l01_a > Vh) {
    var o = 2 * t._l01_2a + 3 * t._l01_a * t._l12_a + t._l12_2a, l = 3 * t._l01_a * (t._l01_a + t._l12_a);
    i = (i * o - t._x0 * t._l12_2a + t._x2 * t._l01_2a) / l, n = (n * o - t._y0 * t._l12_2a + t._y2 * t._l01_2a) / l;
  }
  if (t._l23_a > Vh) {
    var c = 2 * t._l23_2a + 3 * t._l23_a * t._l12_a + t._l12_2a, h = 3 * t._l23_a * (t._l23_a + t._l12_a);
    s = (s * c + t._x1 * t._l23_2a - e * t._l12_2a) / h, a = (a * c + t._y1 * t._l23_2a - r * t._l12_2a) / h;
  }
  t._context.bezierCurveTo(i, n, s, a, t._x2, t._y2);
}
function Ed(t, e) {
  this._context = t, this._alpha = e;
}
Ed.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._y0 = this._y1 = this._y2 = NaN, this._l01_a = this._l12_a = this._l23_a = this._l01_2a = this._l12_2a = this._l23_2a = this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 2:
        this._context.lineTo(this._x2, this._y2);
        break;
      case 3:
        this.point(this._x2, this._y2);
        break;
    }
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    if (t = +t, e = +e, this._point) {
      var r = this._x2 - t, i = this._y2 - e;
      this._l23_a = Math.sqrt(this._l23_2a = Math.pow(r * r + i * i, this._alpha));
    }
    switch (this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
        break;
      case 1:
        this._point = 2;
        break;
      case 2:
        this._point = 3;
      // falls through
      default:
        Ul(this, t, e);
        break;
    }
    this._l01_a = this._l12_a, this._l12_a = this._l23_a, this._l01_2a = this._l12_2a, this._l12_2a = this._l23_2a, this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const Bd = (function t(e) {
  function r(i) {
    return e ? new Ed(i, e) : new Hl(i, 0);
  }
  return r.alpha = function(i) {
    return t(+i);
  }, r;
})(0.5);
function Md(t, e) {
  this._context = t, this._alpha = e;
}
Md.prototype = {
  areaStart: or,
  areaEnd: or,
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._x3 = this._x4 = this._x5 = this._y0 = this._y1 = this._y2 = this._y3 = this._y4 = this._y5 = NaN, this._l01_a = this._l12_a = this._l23_a = this._l01_2a = this._l12_2a = this._l23_2a = this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 1: {
        this._context.moveTo(this._x3, this._y3), this._context.closePath();
        break;
      }
      case 2: {
        this._context.lineTo(this._x3, this._y3), this._context.closePath();
        break;
      }
      case 3: {
        this.point(this._x3, this._y3), this.point(this._x4, this._y4), this.point(this._x5, this._y5);
        break;
      }
    }
  },
  point: function(t, e) {
    if (t = +t, e = +e, this._point) {
      var r = this._x2 - t, i = this._y2 - e;
      this._l23_a = Math.sqrt(this._l23_2a = Math.pow(r * r + i * i, this._alpha));
    }
    switch (this._point) {
      case 0:
        this._point = 1, this._x3 = t, this._y3 = e;
        break;
      case 1:
        this._point = 2, this._context.moveTo(this._x4 = t, this._y4 = e);
        break;
      case 2:
        this._point = 3, this._x5 = t, this._y5 = e;
        break;
      default:
        Ul(this, t, e);
        break;
    }
    this._l01_a = this._l12_a, this._l12_a = this._l23_a, this._l01_2a = this._l12_2a, this._l12_2a = this._l23_2a, this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const b_ = (function t(e) {
  function r(i) {
    return e ? new Md(i, e) : new Yl(i, 0);
  }
  return r.alpha = function(i) {
    return t(+i);
  }, r;
})(0.5);
function $d(t, e) {
  this._context = t, this._alpha = e;
}
$d.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._x2 = this._y0 = this._y1 = this._y2 = NaN, this._l01_a = this._l12_a = this._l23_a = this._l01_2a = this._l12_2a = this._l23_2a = this._point = 0;
  },
  lineEnd: function() {
    (this._line || this._line !== 0 && this._point === 3) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    if (t = +t, e = +e, this._point) {
      var r = this._x2 - t, i = this._y2 - e;
      this._l23_a = Math.sqrt(this._l23_2a = Math.pow(r * r + i * i, this._alpha));
    }
    switch (this._point) {
      case 0:
        this._point = 1;
        break;
      case 1:
        this._point = 2;
        break;
      case 2:
        this._point = 3, this._line ? this._context.lineTo(this._x2, this._y2) : this._context.moveTo(this._x2, this._y2);
        break;
      case 3:
        this._point = 4;
      // falls through
      default:
        Ul(this, t, e);
        break;
    }
    this._l01_a = this._l12_a, this._l12_a = this._l23_a, this._l01_2a = this._l12_2a, this._l12_2a = this._l23_2a, this._x0 = this._x1, this._x1 = this._x2, this._x2 = t, this._y0 = this._y1, this._y1 = this._y2, this._y2 = e;
  }
};
const w_ = (function t(e) {
  function r(i) {
    return e ? new $d(i, e) : new jl(i, 0);
  }
  return r.alpha = function(i) {
    return t(+i);
  }, r;
})(0.5);
function Fd(t) {
  this._context = t;
}
Fd.prototype = {
  areaStart: or,
  areaEnd: or,
  lineStart: function() {
    this._point = 0;
  },
  lineEnd: function() {
    this._point && this._context.closePath();
  },
  point: function(t, e) {
    t = +t, e = +e, this._point ? this._context.lineTo(t, e) : (this._point = 1, this._context.moveTo(t, e));
  }
};
function C_(t) {
  return new Fd(t);
}
function Zh(t) {
  return t < 0 ? -1 : 1;
}
function Qh(t, e, r) {
  var i = t._x1 - t._x0, n = e - t._x1, s = (t._y1 - t._y0) / (i || n < 0 && -0), a = (r - t._y1) / (n || i < 0 && -0), o = (s * n + a * i) / (i + n);
  return (Zh(s) + Zh(a)) * Math.min(Math.abs(s), Math.abs(a), 0.5 * Math.abs(o)) || 0;
}
function Jh(t, e) {
  var r = t._x1 - t._x0;
  return r ? (3 * (t._y1 - t._y0) / r - e) / 2 : e;
}
function ro(t, e, r) {
  var i = t._x0, n = t._y0, s = t._x1, a = t._y1, o = (s - i) / 3;
  t._context.bezierCurveTo(i + o, n + o * e, s - o, a - o * r, s, a);
}
function Fs(t) {
  this._context = t;
}
Fs.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x0 = this._x1 = this._y0 = this._y1 = this._t0 = NaN, this._point = 0;
  },
  lineEnd: function() {
    switch (this._point) {
      case 2:
        this._context.lineTo(this._x1, this._y1);
        break;
      case 3:
        ro(this, this._t0, Jh(this, this._t0));
        break;
    }
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  },
  point: function(t, e) {
    var r = NaN;
    if (t = +t, e = +e, !(t === this._x1 && e === this._y1)) {
      switch (this._point) {
        case 0:
          this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
          break;
        case 1:
          this._point = 2;
          break;
        case 2:
          this._point = 3, ro(this, Jh(this, r = Qh(this, t, e)), r);
          break;
        default:
          ro(this, this._t0, r = Qh(this, t, e));
          break;
      }
      this._x0 = this._x1, this._x1 = t, this._y0 = this._y1, this._y1 = e, this._t0 = r;
    }
  }
};
function Od(t) {
  this._context = new Dd(t);
}
(Od.prototype = Object.create(Fs.prototype)).point = function(t, e) {
  Fs.prototype.point.call(this, e, t);
};
function Dd(t) {
  this._context = t;
}
Dd.prototype = {
  moveTo: function(t, e) {
    this._context.moveTo(e, t);
  },
  closePath: function() {
    this._context.closePath();
  },
  lineTo: function(t, e) {
    this._context.lineTo(e, t);
  },
  bezierCurveTo: function(t, e, r, i, n, s) {
    this._context.bezierCurveTo(e, t, i, r, s, n);
  }
};
function Id(t) {
  return new Fs(t);
}
function Rd(t) {
  return new Od(t);
}
function Pd(t) {
  this._context = t;
}
Pd.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x = [], this._y = [];
  },
  lineEnd: function() {
    var t = this._x, e = this._y, r = t.length;
    if (r)
      if (this._line ? this._context.lineTo(t[0], e[0]) : this._context.moveTo(t[0], e[0]), r === 2)
        this._context.lineTo(t[1], e[1]);
      else
        for (var i = tu(t), n = tu(e), s = 0, a = 1; a < r; ++s, ++a)
          this._context.bezierCurveTo(i[0][s], n[0][s], i[1][s], n[1][s], t[a], e[a]);
    (this._line || this._line !== 0 && r === 1) && this._context.closePath(), this._line = 1 - this._line, this._x = this._y = null;
  },
  point: function(t, e) {
    this._x.push(+t), this._y.push(+e);
  }
};
function tu(t) {
  var e, r = t.length - 1, i, n = new Array(r), s = new Array(r), a = new Array(r);
  for (n[0] = 0, s[0] = 2, a[0] = t[0] + 2 * t[1], e = 1; e < r - 1; ++e) n[e] = 1, s[e] = 4, a[e] = 4 * t[e] + 2 * t[e + 1];
  for (n[r - 1] = 2, s[r - 1] = 7, a[r - 1] = 8 * t[r - 1] + t[r], e = 1; e < r; ++e) i = n[e] / s[e - 1], s[e] -= i, a[e] -= i * a[e - 1];
  for (n[r - 1] = a[r - 1] / s[r - 1], e = r - 2; e >= 0; --e) n[e] = (a[e] - n[e + 1]) / s[e];
  for (s[r - 1] = (t[r] + n[r - 1]) / 2, e = 0; e < r - 1; ++e) s[e] = 2 * t[e + 1] - n[e + 1];
  return [n, s];
}
function Nd(t) {
  return new Pd(t);
}
function fa(t, e) {
  this._context = t, this._t = e;
}
fa.prototype = {
  areaStart: function() {
    this._line = 0;
  },
  areaEnd: function() {
    this._line = NaN;
  },
  lineStart: function() {
    this._x = this._y = NaN, this._point = 0;
  },
  lineEnd: function() {
    0 < this._t && this._t < 1 && this._point === 2 && this._context.lineTo(this._x, this._y), (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line >= 0 && (this._t = 1 - this._t, this._line = 1 - this._line);
  },
  point: function(t, e) {
    switch (t = +t, e = +e, this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(t, e) : this._context.moveTo(t, e);
        break;
      case 1:
        this._point = 2;
      // falls through
      default: {
        if (this._t <= 0)
          this._context.lineTo(this._x, e), this._context.lineTo(t, e);
        else {
          var r = this._x * (1 - this._t) + t * this._t;
          this._context.lineTo(r, this._y), this._context.lineTo(r, e);
        }
        break;
      }
    }
    this._x = t, this._y = e;
  }
};
function zd(t) {
  return new fa(t, 0.5);
}
function Wd(t) {
  return new fa(t, 0);
}
function qd(t) {
  return new fa(t, 1);
}
function Ui(t, e, r) {
  this.k = t, this.x = e, this.y = r;
}
Ui.prototype = {
  constructor: Ui,
  scale: function(t) {
    return t === 1 ? this : new Ui(this.k * t, this.x, this.y);
  },
  translate: function(t, e) {
    return t === 0 & e === 0 ? this : new Ui(this.k, this.x + this.k * t, this.y + this.k * e);
  },
  apply: function(t) {
    return [t[0] * this.k + this.x, t[1] * this.k + this.y];
  },
  applyX: function(t) {
    return t * this.k + this.x;
  },
  applyY: function(t) {
    return t * this.k + this.y;
  },
  invert: function(t) {
    return [(t[0] - this.x) / this.k, (t[1] - this.y) / this.k];
  },
  invertX: function(t) {
    return (t - this.x) / this.k;
  },
  invertY: function(t) {
    return (t - this.y) / this.k;
  },
  rescaleX: function(t) {
    return t.copy().domain(t.range().map(this.invertX, this).map(t.invert, t));
  },
  rescaleY: function(t) {
    return t.copy().domain(t.range().map(this.invertY, this).map(t.invert, t));
  },
  toString: function() {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  }
};
Ui.prototype;
var __ = /* @__PURE__ */ p((t) => {
  const { securityLevel: e } = yt();
  let r = dt("body");
  if (e === "sandbox") {
    const s = dt(`#i${t}`).node()?.contentDocument ?? document;
    r = dt(s.body);
  }
  return r.select(`#${t}`);
}, "selectSvgElement");
function Xl(t) {
  return typeof t > "u" || t === null;
}
p(Xl, "isNothing");
function Hd(t) {
  return typeof t == "object" && t !== null;
}
p(Hd, "isObject");
function Yd(t) {
  return Array.isArray(t) ? t : Xl(t) ? [] : [t];
}
p(Yd, "toArray");
function jd(t, e) {
  var r, i, n, s;
  if (e)
    for (s = Object.keys(e), r = 0, i = s.length; r < i; r += 1)
      n = s[r], t[n] = e[n];
  return t;
}
p(jd, "extend");
function Ud(t, e) {
  var r = "", i;
  for (i = 0; i < e; i += 1)
    r += t;
  return r;
}
p(Ud, "repeat");
function Xd(t) {
  return t === 0 && Number.NEGATIVE_INFINITY === 1 / t;
}
p(Xd, "isNegativeZero");
var k_ = Xl, S_ = Hd, v_ = Yd, T_ = Ud, A_ = Xd, L_ = jd, Ft = {
  isNothing: k_,
  isObject: S_,
  toArray: v_,
  repeat: T_,
  isNegativeZero: A_,
  extend: L_
};
function Gl(t, e) {
  var r = "", i = t.reason || "(unknown reason)";
  return t.mark ? (t.mark.name && (r += 'in "' + t.mark.name + '" '), r += "(" + (t.mark.line + 1) + ":" + (t.mark.column + 1) + ")", !e && t.mark.snippet && (r += `

` + t.mark.snippet), i + " " + r) : i;
}
p(Gl, "formatError");
function yi(t, e) {
  Error.call(this), this.name = "YAMLException", this.reason = t, this.mark = e, this.message = Gl(this, !1), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = new Error().stack || "";
}
p(yi, "YAMLException$1");
yi.prototype = Object.create(Error.prototype);
yi.prototype.constructor = yi;
yi.prototype.toString = /* @__PURE__ */ p(function(e) {
  return this.name + ": " + Gl(this, e);
}, "toString");
var ie = yi;
function fs(t, e, r, i, n) {
  var s = "", a = "", o = Math.floor(n / 2) - 1;
  return i - e > o && (s = " ... ", e = i - o + s.length), r - i > o && (a = " ...", r = i + o - a.length), {
    str: s + t.slice(e, r).replace(/\t/g, "→") + a,
    pos: i - e + s.length
    // relative position
  };
}
p(fs, "getLine");
function ds(t, e) {
  return Ft.repeat(" ", e - t.length) + t;
}
p(ds, "padStart");
function Gd(t, e) {
  if (e = Object.create(e || null), !t.buffer) return null;
  e.maxLength || (e.maxLength = 79), typeof e.indent != "number" && (e.indent = 1), typeof e.linesBefore != "number" && (e.linesBefore = 3), typeof e.linesAfter != "number" && (e.linesAfter = 2);
  for (var r = /\r?\n|\r|\0/g, i = [0], n = [], s, a = -1; s = r.exec(t.buffer); )
    n.push(s.index), i.push(s.index + s[0].length), t.position <= s.index && a < 0 && (a = i.length - 2);
  a < 0 && (a = i.length - 1);
  var o = "", l, c, h = Math.min(t.line + e.linesAfter, n.length).toString().length, u = e.maxLength - (e.indent + h + 3);
  for (l = 1; l <= e.linesBefore && !(a - l < 0); l++)
    c = fs(
      t.buffer,
      i[a - l],
      n[a - l],
      t.position - (i[a] - i[a - l]),
      u
    ), o = Ft.repeat(" ", e.indent) + ds((t.line - l + 1).toString(), h) + " | " + c.str + `
` + o;
  for (c = fs(t.buffer, i[a], n[a], t.position, u), o += Ft.repeat(" ", e.indent) + ds((t.line + 1).toString(), h) + " | " + c.str + `
`, o += Ft.repeat("-", e.indent + h + 3 + c.pos) + `^
`, l = 1; l <= e.linesAfter && !(a + l >= n.length); l++)
    c = fs(
      t.buffer,
      i[a + l],
      n[a + l],
      t.position - (i[a] - i[a + l]),
      u
    ), o += Ft.repeat(" ", e.indent) + ds((t.line + l + 1).toString(), h) + " | " + c.str + `
`;
  return o.replace(/\n$/, "");
}
p(Gd, "makeSnippet");
var E_ = Gd, B_ = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
], M_ = [
  "scalar",
  "sequence",
  "mapping"
];
function Vd(t) {
  var e = {};
  return t !== null && Object.keys(t).forEach(function(r) {
    t[r].forEach(function(i) {
      e[String(i)] = r;
    });
  }), e;
}
p(Vd, "compileStyleAliases");
function Kd(t, e) {
  if (e = e || {}, Object.keys(e).forEach(function(r) {
    if (B_.indexOf(r) === -1)
      throw new ie('Unknown option "' + r + '" is met in definition of "' + t + '" YAML type.');
  }), this.options = e, this.tag = t, this.kind = e.kind || null, this.resolve = e.resolve || function() {
    return !0;
  }, this.construct = e.construct || function(r) {
    return r;
  }, this.instanceOf = e.instanceOf || null, this.predicate = e.predicate || null, this.represent = e.represent || null, this.representName = e.representName || null, this.defaultStyle = e.defaultStyle || null, this.multi = e.multi || !1, this.styleAliases = Vd(e.styleAliases || null), M_.indexOf(this.kind) === -1)
    throw new ie('Unknown kind "' + this.kind + '" is specified for "' + t + '" YAML type.');
}
p(Kd, "Type$1");
var Yt = Kd;
function Po(t, e) {
  var r = [];
  return t[e].forEach(function(i) {
    var n = r.length;
    r.forEach(function(s, a) {
      s.tag === i.tag && s.kind === i.kind && s.multi === i.multi && (n = a);
    }), r[n] = i;
  }), r;
}
p(Po, "compileList");
function Zd() {
  var t = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, e, r;
  function i(n) {
    n.multi ? (t.multi[n.kind].push(n), t.multi.fallback.push(n)) : t[n.kind][n.tag] = t.fallback[n.tag] = n;
  }
  for (p(i, "collectType"), e = 0, r = arguments.length; e < r; e += 1)
    arguments[e].forEach(i);
  return t;
}
p(Zd, "compileMap");
function Os(t) {
  return this.extend(t);
}
p(Os, "Schema$1");
Os.prototype.extend = /* @__PURE__ */ p(function(e) {
  var r = [], i = [];
  if (e instanceof Yt)
    i.push(e);
  else if (Array.isArray(e))
    i = i.concat(e);
  else if (e && (Array.isArray(e.implicit) || Array.isArray(e.explicit)))
    e.implicit && (r = r.concat(e.implicit)), e.explicit && (i = i.concat(e.explicit));
  else
    throw new ie("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  r.forEach(function(s) {
    if (!(s instanceof Yt))
      throw new ie("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    if (s.loadKind && s.loadKind !== "scalar")
      throw new ie("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    if (s.multi)
      throw new ie("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
  }), i.forEach(function(s) {
    if (!(s instanceof Yt))
      throw new ie("Specified list of YAML types (or a single Type object) contains a non-Type object.");
  });
  var n = Object.create(Os.prototype);
  return n.implicit = (this.implicit || []).concat(r), n.explicit = (this.explicit || []).concat(i), n.compiledImplicit = Po(n, "implicit"), n.compiledExplicit = Po(n, "explicit"), n.compiledTypeMap = Zd(n.compiledImplicit, n.compiledExplicit), n;
}, "extend");
var $_ = Os, F_ = new Yt("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: /* @__PURE__ */ p(function(t) {
    return t !== null ? t : "";
  }, "construct")
}), O_ = new Yt("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: /* @__PURE__ */ p(function(t) {
    return t !== null ? t : [];
  }, "construct")
}), D_ = new Yt("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: /* @__PURE__ */ p(function(t) {
    return t !== null ? t : {};
  }, "construct")
}), I_ = new $_({
  explicit: [
    F_,
    O_,
    D_
  ]
});
function Qd(t) {
  if (t === null) return !0;
  var e = t.length;
  return e === 1 && t === "~" || e === 4 && (t === "null" || t === "Null" || t === "NULL");
}
p(Qd, "resolveYamlNull");
function Jd() {
  return null;
}
p(Jd, "constructYamlNull");
function tp(t) {
  return t === null;
}
p(tp, "isNull");
var R_ = new Yt("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: Qd,
  construct: Jd,
  predicate: tp,
  represent: {
    canonical: /* @__PURE__ */ p(function() {
      return "~";
    }, "canonical"),
    lowercase: /* @__PURE__ */ p(function() {
      return "null";
    }, "lowercase"),
    uppercase: /* @__PURE__ */ p(function() {
      return "NULL";
    }, "uppercase"),
    camelcase: /* @__PURE__ */ p(function() {
      return "Null";
    }, "camelcase"),
    empty: /* @__PURE__ */ p(function() {
      return "";
    }, "empty")
  },
  defaultStyle: "lowercase"
});
function ep(t) {
  if (t === null) return !1;
  var e = t.length;
  return e === 4 && (t === "true" || t === "True" || t === "TRUE") || e === 5 && (t === "false" || t === "False" || t === "FALSE");
}
p(ep, "resolveYamlBoolean");
function rp(t) {
  return t === "true" || t === "True" || t === "TRUE";
}
p(rp, "constructYamlBoolean");
function ip(t) {
  return Object.prototype.toString.call(t) === "[object Boolean]";
}
p(ip, "isBoolean");
var P_ = new Yt("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: ep,
  construct: rp,
  predicate: ip,
  represent: {
    lowercase: /* @__PURE__ */ p(function(t) {
      return t ? "true" : "false";
    }, "lowercase"),
    uppercase: /* @__PURE__ */ p(function(t) {
      return t ? "TRUE" : "FALSE";
    }, "uppercase"),
    camelcase: /* @__PURE__ */ p(function(t) {
      return t ? "True" : "False";
    }, "camelcase")
  },
  defaultStyle: "lowercase"
});
function np(t) {
  return 48 <= t && t <= 57 || 65 <= t && t <= 70 || 97 <= t && t <= 102;
}
p(np, "isHexCode");
function sp(t) {
  return 48 <= t && t <= 55;
}
p(sp, "isOctCode");
function ap(t) {
  return 48 <= t && t <= 57;
}
p(ap, "isDecCode");
function op(t) {
  if (t === null) return !1;
  var e = t.length, r = 0, i = !1, n;
  if (!e) return !1;
  if (n = t[r], (n === "-" || n === "+") && (n = t[++r]), n === "0") {
    if (r + 1 === e) return !0;
    if (n = t[++r], n === "b") {
      for (r++; r < e; r++)
        if (n = t[r], n !== "_") {
          if (n !== "0" && n !== "1") return !1;
          i = !0;
        }
      return i && n !== "_";
    }
    if (n === "x") {
      for (r++; r < e; r++)
        if (n = t[r], n !== "_") {
          if (!np(t.charCodeAt(r))) return !1;
          i = !0;
        }
      return i && n !== "_";
    }
    if (n === "o") {
      for (r++; r < e; r++)
        if (n = t[r], n !== "_") {
          if (!sp(t.charCodeAt(r))) return !1;
          i = !0;
        }
      return i && n !== "_";
    }
  }
  if (n === "_") return !1;
  for (; r < e; r++)
    if (n = t[r], n !== "_") {
      if (!ap(t.charCodeAt(r)))
        return !1;
      i = !0;
    }
  return !(!i || n === "_");
}
p(op, "resolveYamlInteger");
function lp(t) {
  var e = t, r = 1, i;
  if (e.indexOf("_") !== -1 && (e = e.replace(/_/g, "")), i = e[0], (i === "-" || i === "+") && (i === "-" && (r = -1), e = e.slice(1), i = e[0]), e === "0") return 0;
  if (i === "0") {
    if (e[1] === "b") return r * parseInt(e.slice(2), 2);
    if (e[1] === "x") return r * parseInt(e.slice(2), 16);
    if (e[1] === "o") return r * parseInt(e.slice(2), 8);
  }
  return r * parseInt(e, 10);
}
p(lp, "constructYamlInteger");
function cp(t) {
  return Object.prototype.toString.call(t) === "[object Number]" && t % 1 === 0 && !Ft.isNegativeZero(t);
}
p(cp, "isInteger");
var N_ = new Yt("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: op,
  construct: lp,
  predicate: cp,
  represent: {
    binary: /* @__PURE__ */ p(function(t) {
      return t >= 0 ? "0b" + t.toString(2) : "-0b" + t.toString(2).slice(1);
    }, "binary"),
    octal: /* @__PURE__ */ p(function(t) {
      return t >= 0 ? "0o" + t.toString(8) : "-0o" + t.toString(8).slice(1);
    }, "octal"),
    decimal: /* @__PURE__ */ p(function(t) {
      return t.toString(10);
    }, "decimal"),
    /* eslint-disable max-len */
    hexadecimal: /* @__PURE__ */ p(function(t) {
      return t >= 0 ? "0x" + t.toString(16).toUpperCase() : "-0x" + t.toString(16).toUpperCase().slice(1);
    }, "hexadecimal")
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
}), z_ = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function hp(t) {
  return !(t === null || !z_.test(t) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  t[t.length - 1] === "_");
}
p(hp, "resolveYamlFloat");
function up(t) {
  var e, r;
  return e = t.replace(/_/g, "").toLowerCase(), r = e[0] === "-" ? -1 : 1, "+-".indexOf(e[0]) >= 0 && (e = e.slice(1)), e === ".inf" ? r === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY : e === ".nan" ? NaN : r * parseFloat(e, 10);
}
p(up, "constructYamlFloat");
var W_ = /^[-+]?[0-9]+e/;
function fp(t, e) {
  var r;
  if (isNaN(t))
    switch (e) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  else if (Number.POSITIVE_INFINITY === t)
    switch (e) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  else if (Number.NEGATIVE_INFINITY === t)
    switch (e) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  else if (Ft.isNegativeZero(t))
    return "-0.0";
  return r = t.toString(10), W_.test(r) ? r.replace("e", ".e") : r;
}
p(fp, "representYamlFloat");
function dp(t) {
  return Object.prototype.toString.call(t) === "[object Number]" && (t % 1 !== 0 || Ft.isNegativeZero(t));
}
p(dp, "isFloat");
var q_ = new Yt("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: hp,
  construct: up,
  predicate: dp,
  represent: fp,
  defaultStyle: "lowercase"
}), pp = I_.extend({
  implicit: [
    R_,
    P_,
    N_,
    q_
  ]
}), H_ = pp, gp = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
), mp = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function yp(t) {
  return t === null ? !1 : gp.exec(t) !== null || mp.exec(t) !== null;
}
p(yp, "resolveYamlTimestamp");
function xp(t) {
  var e, r, i, n, s, a, o, l = 0, c = null, h, u, f;
  if (e = gp.exec(t), e === null && (e = mp.exec(t)), e === null) throw new Error("Date resolve error");
  if (r = +e[1], i = +e[2] - 1, n = +e[3], !e[4])
    return new Date(Date.UTC(r, i, n));
  if (s = +e[4], a = +e[5], o = +e[6], e[7]) {
    for (l = e[7].slice(0, 3); l.length < 3; )
      l += "0";
    l = +l;
  }
  return e[9] && (h = +e[10], u = +(e[11] || 0), c = (h * 60 + u) * 6e4, e[9] === "-" && (c = -c)), f = new Date(Date.UTC(r, i, n, s, a, o, l)), c && f.setTime(f.getTime() - c), f;
}
p(xp, "constructYamlTimestamp");
function bp(t) {
  return t.toISOString();
}
p(bp, "representYamlTimestamp");
var Y_ = new Yt("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: yp,
  construct: xp,
  instanceOf: Date,
  represent: bp
});
function wp(t) {
  return t === "<<" || t === null;
}
p(wp, "resolveYamlMerge");
var j_ = new Yt("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: wp
}), Vl = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
function Cp(t) {
  if (t === null) return !1;
  var e, r, i = 0, n = t.length, s = Vl;
  for (r = 0; r < n; r++)
    if (e = s.indexOf(t.charAt(r)), !(e > 64)) {
      if (e < 0) return !1;
      i += 6;
    }
  return i % 8 === 0;
}
p(Cp, "resolveYamlBinary");
function _p(t) {
  var e, r, i = t.replace(/[\r\n=]/g, ""), n = i.length, s = Vl, a = 0, o = [];
  for (e = 0; e < n; e++)
    e % 4 === 0 && e && (o.push(a >> 16 & 255), o.push(a >> 8 & 255), o.push(a & 255)), a = a << 6 | s.indexOf(i.charAt(e));
  return r = n % 4 * 6, r === 0 ? (o.push(a >> 16 & 255), o.push(a >> 8 & 255), o.push(a & 255)) : r === 18 ? (o.push(a >> 10 & 255), o.push(a >> 2 & 255)) : r === 12 && o.push(a >> 4 & 255), new Uint8Array(o);
}
p(_p, "constructYamlBinary");
function kp(t) {
  var e = "", r = 0, i, n, s = t.length, a = Vl;
  for (i = 0; i < s; i++)
    i % 3 === 0 && i && (e += a[r >> 18 & 63], e += a[r >> 12 & 63], e += a[r >> 6 & 63], e += a[r & 63]), r = (r << 8) + t[i];
  return n = s % 3, n === 0 ? (e += a[r >> 18 & 63], e += a[r >> 12 & 63], e += a[r >> 6 & 63], e += a[r & 63]) : n === 2 ? (e += a[r >> 10 & 63], e += a[r >> 4 & 63], e += a[r << 2 & 63], e += a[64]) : n === 1 && (e += a[r >> 2 & 63], e += a[r << 4 & 63], e += a[64], e += a[64]), e;
}
p(kp, "representYamlBinary");
function Sp(t) {
  return Object.prototype.toString.call(t) === "[object Uint8Array]";
}
p(Sp, "isBinary");
var U_ = new Yt("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: Cp,
  construct: _p,
  predicate: Sp,
  represent: kp
}), X_ = Object.prototype.hasOwnProperty, G_ = Object.prototype.toString;
function vp(t) {
  if (t === null) return !0;
  var e = [], r, i, n, s, a, o = t;
  for (r = 0, i = o.length; r < i; r += 1) {
    if (n = o[r], a = !1, G_.call(n) !== "[object Object]") return !1;
    for (s in n)
      if (X_.call(n, s))
        if (!a) a = !0;
        else return !1;
    if (!a) return !1;
    if (e.indexOf(s) === -1) e.push(s);
    else return !1;
  }
  return !0;
}
p(vp, "resolveYamlOmap");
function Tp(t) {
  return t !== null ? t : [];
}
p(Tp, "constructYamlOmap");
var V_ = new Yt("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: vp,
  construct: Tp
}), K_ = Object.prototype.toString;
function Ap(t) {
  if (t === null) return !0;
  var e, r, i, n, s, a = t;
  for (s = new Array(a.length), e = 0, r = a.length; e < r; e += 1) {
    if (i = a[e], K_.call(i) !== "[object Object]" || (n = Object.keys(i), n.length !== 1)) return !1;
    s[e] = [n[0], i[n[0]]];
  }
  return !0;
}
p(Ap, "resolveYamlPairs");
function Lp(t) {
  if (t === null) return [];
  var e, r, i, n, s, a = t;
  for (s = new Array(a.length), e = 0, r = a.length; e < r; e += 1)
    i = a[e], n = Object.keys(i), s[e] = [n[0], i[n[0]]];
  return s;
}
p(Lp, "constructYamlPairs");
var Z_ = new Yt("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: Ap,
  construct: Lp
}), Q_ = Object.prototype.hasOwnProperty;
function Ep(t) {
  if (t === null) return !0;
  var e, r = t;
  for (e in r)
    if (Q_.call(r, e) && r[e] !== null)
      return !1;
  return !0;
}
p(Ep, "resolveYamlSet");
function Bp(t) {
  return t !== null ? t : {};
}
p(Bp, "constructYamlSet");
var J_ = new Yt("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: Ep,
  construct: Bp
}), Mp = H_.extend({
  implicit: [
    Y_,
    j_
  ],
  explicit: [
    U_,
    V_,
    Z_,
    J_
  ]
}), lr = Object.prototype.hasOwnProperty, Ds = 1, $p = 2, Fp = 3, Is = 4, io = 1, tk = 2, eu = 3, ek = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, rk = /[\x85\u2028\u2029]/, ik = /[,\[\]\{\}]/, Op = /^(?:!|!!|![a-z\-]+!)$/i, Dp = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function No(t) {
  return Object.prototype.toString.call(t);
}
p(No, "_class");
function Ce(t) {
  return t === 10 || t === 13;
}
p(Ce, "is_EOL");
function ar(t) {
  return t === 9 || t === 32;
}
p(ar, "is_WHITE_SPACE");
function Kt(t) {
  return t === 9 || t === 32 || t === 10 || t === 13;
}
p(Kt, "is_WS_OR_EOL");
function Ar(t) {
  return t === 44 || t === 91 || t === 93 || t === 123 || t === 125;
}
p(Ar, "is_FLOW_INDICATOR");
function Ip(t) {
  var e;
  return 48 <= t && t <= 57 ? t - 48 : (e = t | 32, 97 <= e && e <= 102 ? e - 97 + 10 : -1);
}
p(Ip, "fromHexCode");
function Rp(t) {
  return t === 120 ? 2 : t === 117 ? 4 : t === 85 ? 8 : 0;
}
p(Rp, "escapedHexLen");
function Pp(t) {
  return 48 <= t && t <= 57 ? t - 48 : -1;
}
p(Pp, "fromDecimalCode");
function zo(t) {
  return t === 48 ? "\0" : t === 97 ? "\x07" : t === 98 ? "\b" : t === 116 || t === 9 ? "	" : t === 110 ? `
` : t === 118 ? "\v" : t === 102 ? "\f" : t === 114 ? "\r" : t === 101 ? "\x1B" : t === 32 ? " " : t === 34 ? '"' : t === 47 ? "/" : t === 92 ? "\\" : t === 78 ? "" : t === 95 ? " " : t === 76 ? "\u2028" : t === 80 ? "\u2029" : "";
}
p(zo, "simpleEscapeSequence");
function Np(t) {
  return t <= 65535 ? String.fromCharCode(t) : String.fromCharCode(
    (t - 65536 >> 10) + 55296,
    (t - 65536 & 1023) + 56320
  );
}
p(Np, "charFromCodepoint");
var zp = new Array(256), Wp = new Array(256);
for (wr = 0; wr < 256; wr++)
  zp[wr] = zo(wr) ? 1 : 0, Wp[wr] = zo(wr);
var wr;
function qp(t, e) {
  this.input = t, this.filename = e.filename || null, this.schema = e.schema || Mp, this.onWarning = e.onWarning || null, this.legacy = e.legacy || !1, this.json = e.json || !1, this.listener = e.listener || null, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = t.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.firstTabInLine = -1, this.documents = [];
}
p(qp, "State$1");
function Kl(t, e) {
  var r = {
    name: t.filename,
    buffer: t.input.slice(0, -1),
    // omit trailing \0
    position: t.position,
    line: t.line,
    column: t.position - t.lineStart
  };
  return r.snippet = E_(r), new ie(e, r);
}
p(Kl, "generateError");
function rt(t, e) {
  throw Kl(t, e);
}
p(rt, "throwError");
function fn(t, e) {
  t.onWarning && t.onWarning.call(null, Kl(t, e));
}
p(fn, "throwWarning");
var ru = {
  YAML: /* @__PURE__ */ p(function(e, r, i) {
    var n, s, a;
    e.version !== null && rt(e, "duplication of %YAML directive"), i.length !== 1 && rt(e, "YAML directive accepts exactly one argument"), n = /^([0-9]+)\.([0-9]+)$/.exec(i[0]), n === null && rt(e, "ill-formed argument of the YAML directive"), s = parseInt(n[1], 10), a = parseInt(n[2], 10), s !== 1 && rt(e, "unacceptable YAML version of the document"), e.version = i[0], e.checkLineBreaks = a < 2, a !== 1 && a !== 2 && fn(e, "unsupported YAML version of the document");
  }, "handleYamlDirective"),
  TAG: /* @__PURE__ */ p(function(e, r, i) {
    var n, s;
    i.length !== 2 && rt(e, "TAG directive accepts exactly two arguments"), n = i[0], s = i[1], Op.test(n) || rt(e, "ill-formed tag handle (first argument) of the TAG directive"), lr.call(e.tagMap, n) && rt(e, 'there is a previously declared suffix for "' + n + '" tag handle'), Dp.test(s) || rt(e, "ill-formed tag prefix (second argument) of the TAG directive");
    try {
      s = decodeURIComponent(s);
    } catch {
      rt(e, "tag prefix is malformed: " + s);
    }
    e.tagMap[n] = s;
  }, "handleTagDirective")
};
function je(t, e, r, i) {
  var n, s, a, o;
  if (e < r) {
    if (o = t.input.slice(e, r), i)
      for (n = 0, s = o.length; n < s; n += 1)
        a = o.charCodeAt(n), a === 9 || 32 <= a && a <= 1114111 || rt(t, "expected valid JSON character");
    else ek.test(o) && rt(t, "the stream contains non-printable characters");
    t.result += o;
  }
}
p(je, "captureSegment");
function Wo(t, e, r, i) {
  var n, s, a, o;
  for (Ft.isObject(r) || rt(t, "cannot merge mappings; the provided source object is unacceptable"), n = Object.keys(r), a = 0, o = n.length; a < o; a += 1)
    s = n[a], lr.call(e, s) || (e[s] = r[s], i[s] = !0);
}
p(Wo, "mergeMappings");
function Lr(t, e, r, i, n, s, a, o, l) {
  var c, h;
  if (Array.isArray(n))
    for (n = Array.prototype.slice.call(n), c = 0, h = n.length; c < h; c += 1)
      Array.isArray(n[c]) && rt(t, "nested arrays are not supported inside keys"), typeof n == "object" && No(n[c]) === "[object Object]" && (n[c] = "[object Object]");
  if (typeof n == "object" && No(n) === "[object Object]" && (n = "[object Object]"), n = String(n), e === null && (e = {}), i === "tag:yaml.org,2002:merge")
    if (Array.isArray(s))
      for (c = 0, h = s.length; c < h; c += 1)
        Wo(t, e, s[c], r);
    else
      Wo(t, e, s, r);
  else
    !t.json && !lr.call(r, n) && lr.call(e, n) && (t.line = a || t.line, t.lineStart = o || t.lineStart, t.position = l || t.position, rt(t, "duplicated mapping key")), n === "__proto__" ? Object.defineProperty(e, n, {
      configurable: !0,
      enumerable: !0,
      writable: !0,
      value: s
    }) : e[n] = s, delete r[n];
  return e;
}
p(Lr, "storeMappingPair");
function da(t) {
  var e;
  e = t.input.charCodeAt(t.position), e === 10 ? t.position++ : e === 13 ? (t.position++, t.input.charCodeAt(t.position) === 10 && t.position++) : rt(t, "a line break is expected"), t.line += 1, t.lineStart = t.position, t.firstTabInLine = -1;
}
p(da, "readLineBreak");
function Tt(t, e, r) {
  for (var i = 0, n = t.input.charCodeAt(t.position); n !== 0; ) {
    for (; ar(n); )
      n === 9 && t.firstTabInLine === -1 && (t.firstTabInLine = t.position), n = t.input.charCodeAt(++t.position);
    if (e && n === 35)
      do
        n = t.input.charCodeAt(++t.position);
      while (n !== 10 && n !== 13 && n !== 0);
    if (Ce(n))
      for (da(t), n = t.input.charCodeAt(t.position), i++, t.lineIndent = 0; n === 32; )
        t.lineIndent++, n = t.input.charCodeAt(++t.position);
    else
      break;
  }
  return r !== -1 && i !== 0 && t.lineIndent < r && fn(t, "deficient indentation"), i;
}
p(Tt, "skipSeparationSpace");
function Tn(t) {
  var e = t.position, r;
  return r = t.input.charCodeAt(e), !!((r === 45 || r === 46) && r === t.input.charCodeAt(e + 1) && r === t.input.charCodeAt(e + 2) && (e += 3, r = t.input.charCodeAt(e), r === 0 || Kt(r)));
}
p(Tn, "testDocumentSeparator");
function pa(t, e) {
  e === 1 ? t.result += " " : e > 1 && (t.result += Ft.repeat(`
`, e - 1));
}
p(pa, "writeFoldedLines");
function Hp(t, e, r) {
  var i, n, s, a, o, l, c, h, u = t.kind, f = t.result, d;
  if (d = t.input.charCodeAt(t.position), Kt(d) || Ar(d) || d === 35 || d === 38 || d === 42 || d === 33 || d === 124 || d === 62 || d === 39 || d === 34 || d === 37 || d === 64 || d === 96 || (d === 63 || d === 45) && (n = t.input.charCodeAt(t.position + 1), Kt(n) || r && Ar(n)))
    return !1;
  for (t.kind = "scalar", t.result = "", s = a = t.position, o = !1; d !== 0; ) {
    if (d === 58) {
      if (n = t.input.charCodeAt(t.position + 1), Kt(n) || r && Ar(n))
        break;
    } else if (d === 35) {
      if (i = t.input.charCodeAt(t.position - 1), Kt(i))
        break;
    } else {
      if (t.position === t.lineStart && Tn(t) || r && Ar(d))
        break;
      if (Ce(d))
        if (l = t.line, c = t.lineStart, h = t.lineIndent, Tt(t, !1, -1), t.lineIndent >= e) {
          o = !0, d = t.input.charCodeAt(t.position);
          continue;
        } else {
          t.position = a, t.line = l, t.lineStart = c, t.lineIndent = h;
          break;
        }
    }
    o && (je(t, s, a, !1), pa(t, t.line - l), s = a = t.position, o = !1), ar(d) || (a = t.position + 1), d = t.input.charCodeAt(++t.position);
  }
  return je(t, s, a, !1), t.result ? !0 : (t.kind = u, t.result = f, !1);
}
p(Hp, "readPlainScalar");
function Yp(t, e) {
  var r, i, n;
  if (r = t.input.charCodeAt(t.position), r !== 39)
    return !1;
  for (t.kind = "scalar", t.result = "", t.position++, i = n = t.position; (r = t.input.charCodeAt(t.position)) !== 0; )
    if (r === 39)
      if (je(t, i, t.position, !0), r = t.input.charCodeAt(++t.position), r === 39)
        i = t.position, t.position++, n = t.position;
      else
        return !0;
    else Ce(r) ? (je(t, i, n, !0), pa(t, Tt(t, !1, e)), i = n = t.position) : t.position === t.lineStart && Tn(t) ? rt(t, "unexpected end of the document within a single quoted scalar") : (t.position++, n = t.position);
  rt(t, "unexpected end of the stream within a single quoted scalar");
}
p(Yp, "readSingleQuotedScalar");
function jp(t, e) {
  var r, i, n, s, a, o;
  if (o = t.input.charCodeAt(t.position), o !== 34)
    return !1;
  for (t.kind = "scalar", t.result = "", t.position++, r = i = t.position; (o = t.input.charCodeAt(t.position)) !== 0; ) {
    if (o === 34)
      return je(t, r, t.position, !0), t.position++, !0;
    if (o === 92) {
      if (je(t, r, t.position, !0), o = t.input.charCodeAt(++t.position), Ce(o))
        Tt(t, !1, e);
      else if (o < 256 && zp[o])
        t.result += Wp[o], t.position++;
      else if ((a = Rp(o)) > 0) {
        for (n = a, s = 0; n > 0; n--)
          o = t.input.charCodeAt(++t.position), (a = Ip(o)) >= 0 ? s = (s << 4) + a : rt(t, "expected hexadecimal character");
        t.result += Np(s), t.position++;
      } else
        rt(t, "unknown escape sequence");
      r = i = t.position;
    } else Ce(o) ? (je(t, r, i, !0), pa(t, Tt(t, !1, e)), r = i = t.position) : t.position === t.lineStart && Tn(t) ? rt(t, "unexpected end of the document within a double quoted scalar") : (t.position++, i = t.position);
  }
  rt(t, "unexpected end of the stream within a double quoted scalar");
}
p(jp, "readDoubleQuotedScalar");
function Up(t, e) {
  var r = !0, i, n, s, a = t.tag, o, l = t.anchor, c, h, u, f, d, g = /* @__PURE__ */ Object.create(null), m, y, x, b;
  if (b = t.input.charCodeAt(t.position), b === 91)
    h = 93, d = !1, o = [];
  else if (b === 123)
    h = 125, d = !0, o = {};
  else
    return !1;
  for (t.anchor !== null && (t.anchorMap[t.anchor] = o), b = t.input.charCodeAt(++t.position); b !== 0; ) {
    if (Tt(t, !0, e), b = t.input.charCodeAt(t.position), b === h)
      return t.position++, t.tag = a, t.anchor = l, t.kind = d ? "mapping" : "sequence", t.result = o, !0;
    r ? b === 44 && rt(t, "expected the node content, but found ','") : rt(t, "missed comma between flow collection entries"), y = m = x = null, u = f = !1, b === 63 && (c = t.input.charCodeAt(t.position + 1), Kt(c) && (u = f = !0, t.position++, Tt(t, !0, e))), i = t.line, n = t.lineStart, s = t.position, Rr(t, e, Ds, !1, !0), y = t.tag, m = t.result, Tt(t, !0, e), b = t.input.charCodeAt(t.position), (f || t.line === i) && b === 58 && (u = !0, b = t.input.charCodeAt(++t.position), Tt(t, !0, e), Rr(t, e, Ds, !1, !0), x = t.result), d ? Lr(t, o, g, y, m, x, i, n, s) : u ? o.push(Lr(t, null, g, y, m, x, i, n, s)) : o.push(m), Tt(t, !0, e), b = t.input.charCodeAt(t.position), b === 44 ? (r = !0, b = t.input.charCodeAt(++t.position)) : r = !1;
  }
  rt(t, "unexpected end of the stream within a flow collection");
}
p(Up, "readFlowCollection");
function Xp(t, e) {
  var r, i, n = io, s = !1, a = !1, o = e, l = 0, c = !1, h, u;
  if (u = t.input.charCodeAt(t.position), u === 124)
    i = !1;
  else if (u === 62)
    i = !0;
  else
    return !1;
  for (t.kind = "scalar", t.result = ""; u !== 0; )
    if (u = t.input.charCodeAt(++t.position), u === 43 || u === 45)
      io === n ? n = u === 43 ? eu : tk : rt(t, "repeat of a chomping mode identifier");
    else if ((h = Pp(u)) >= 0)
      h === 0 ? rt(t, "bad explicit indentation width of a block scalar; it cannot be less than one") : a ? rt(t, "repeat of an indentation width identifier") : (o = e + h - 1, a = !0);
    else
      break;
  if (ar(u)) {
    do
      u = t.input.charCodeAt(++t.position);
    while (ar(u));
    if (u === 35)
      do
        u = t.input.charCodeAt(++t.position);
      while (!Ce(u) && u !== 0);
  }
  for (; u !== 0; ) {
    for (da(t), t.lineIndent = 0, u = t.input.charCodeAt(t.position); (!a || t.lineIndent < o) && u === 32; )
      t.lineIndent++, u = t.input.charCodeAt(++t.position);
    if (!a && t.lineIndent > o && (o = t.lineIndent), Ce(u)) {
      l++;
      continue;
    }
    if (t.lineIndent < o) {
      n === eu ? t.result += Ft.repeat(`
`, s ? 1 + l : l) : n === io && s && (t.result += `
`);
      break;
    }
    for (i ? ar(u) ? (c = !0, t.result += Ft.repeat(`
`, s ? 1 + l : l)) : c ? (c = !1, t.result += Ft.repeat(`
`, l + 1)) : l === 0 ? s && (t.result += " ") : t.result += Ft.repeat(`
`, l) : t.result += Ft.repeat(`
`, s ? 1 + l : l), s = !0, a = !0, l = 0, r = t.position; !Ce(u) && u !== 0; )
      u = t.input.charCodeAt(++t.position);
    je(t, r, t.position, !1);
  }
  return !0;
}
p(Xp, "readBlockScalar");
function qo(t, e) {
  var r, i = t.tag, n = t.anchor, s = [], a, o = !1, l;
  if (t.firstTabInLine !== -1) return !1;
  for (t.anchor !== null && (t.anchorMap[t.anchor] = s), l = t.input.charCodeAt(t.position); l !== 0 && (t.firstTabInLine !== -1 && (t.position = t.firstTabInLine, rt(t, "tab characters must not be used in indentation")), !(l !== 45 || (a = t.input.charCodeAt(t.position + 1), !Kt(a)))); ) {
    if (o = !0, t.position++, Tt(t, !0, -1) && t.lineIndent <= e) {
      s.push(null), l = t.input.charCodeAt(t.position);
      continue;
    }
    if (r = t.line, Rr(t, e, Fp, !1, !0), s.push(t.result), Tt(t, !0, -1), l = t.input.charCodeAt(t.position), (t.line === r || t.lineIndent > e) && l !== 0)
      rt(t, "bad indentation of a sequence entry");
    else if (t.lineIndent < e)
      break;
  }
  return o ? (t.tag = i, t.anchor = n, t.kind = "sequence", t.result = s, !0) : !1;
}
p(qo, "readBlockSequence");
function Gp(t, e, r) {
  var i, n, s, a, o, l, c = t.tag, h = t.anchor, u = {}, f = /* @__PURE__ */ Object.create(null), d = null, g = null, m = null, y = !1, x = !1, b;
  if (t.firstTabInLine !== -1) return !1;
  for (t.anchor !== null && (t.anchorMap[t.anchor] = u), b = t.input.charCodeAt(t.position); b !== 0; ) {
    if (!y && t.firstTabInLine !== -1 && (t.position = t.firstTabInLine, rt(t, "tab characters must not be used in indentation")), i = t.input.charCodeAt(t.position + 1), s = t.line, (b === 63 || b === 58) && Kt(i))
      b === 63 ? (y && (Lr(t, u, f, d, g, null, a, o, l), d = g = m = null), x = !0, y = !0, n = !0) : y ? (y = !1, n = !0) : rt(t, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), t.position += 1, b = i;
    else {
      if (a = t.line, o = t.lineStart, l = t.position, !Rr(t, r, $p, !1, !0))
        break;
      if (t.line === s) {
        for (b = t.input.charCodeAt(t.position); ar(b); )
          b = t.input.charCodeAt(++t.position);
        if (b === 58)
          b = t.input.charCodeAt(++t.position), Kt(b) || rt(t, "a whitespace character is expected after the key-value separator within a block mapping"), y && (Lr(t, u, f, d, g, null, a, o, l), d = g = m = null), x = !0, y = !1, n = !1, d = t.tag, g = t.result;
        else if (x)
          rt(t, "can not read an implicit mapping pair; a colon is missed");
        else
          return t.tag = c, t.anchor = h, !0;
      } else if (x)
        rt(t, "can not read a block mapping entry; a multiline key may not be an implicit key");
      else
        return t.tag = c, t.anchor = h, !0;
    }
    if ((t.line === s || t.lineIndent > e) && (y && (a = t.line, o = t.lineStart, l = t.position), Rr(t, e, Is, !0, n) && (y ? g = t.result : m = t.result), y || (Lr(t, u, f, d, g, m, a, o, l), d = g = m = null), Tt(t, !0, -1), b = t.input.charCodeAt(t.position)), (t.line === s || t.lineIndent > e) && b !== 0)
      rt(t, "bad indentation of a mapping entry");
    else if (t.lineIndent < e)
      break;
  }
  return y && Lr(t, u, f, d, g, null, a, o, l), x && (t.tag = c, t.anchor = h, t.kind = "mapping", t.result = u), x;
}
p(Gp, "readBlockMapping");
function Vp(t) {
  var e, r = !1, i = !1, n, s, a;
  if (a = t.input.charCodeAt(t.position), a !== 33) return !1;
  if (t.tag !== null && rt(t, "duplication of a tag property"), a = t.input.charCodeAt(++t.position), a === 60 ? (r = !0, a = t.input.charCodeAt(++t.position)) : a === 33 ? (i = !0, n = "!!", a = t.input.charCodeAt(++t.position)) : n = "!", e = t.position, r) {
    do
      a = t.input.charCodeAt(++t.position);
    while (a !== 0 && a !== 62);
    t.position < t.length ? (s = t.input.slice(e, t.position), a = t.input.charCodeAt(++t.position)) : rt(t, "unexpected end of the stream within a verbatim tag");
  } else {
    for (; a !== 0 && !Kt(a); )
      a === 33 && (i ? rt(t, "tag suffix cannot contain exclamation marks") : (n = t.input.slice(e - 1, t.position + 1), Op.test(n) || rt(t, "named tag handle cannot contain such characters"), i = !0, e = t.position + 1)), a = t.input.charCodeAt(++t.position);
    s = t.input.slice(e, t.position), ik.test(s) && rt(t, "tag suffix cannot contain flow indicator characters");
  }
  s && !Dp.test(s) && rt(t, "tag name cannot contain such characters: " + s);
  try {
    s = decodeURIComponent(s);
  } catch {
    rt(t, "tag name is malformed: " + s);
  }
  return r ? t.tag = s : lr.call(t.tagMap, n) ? t.tag = t.tagMap[n] + s : n === "!" ? t.tag = "!" + s : n === "!!" ? t.tag = "tag:yaml.org,2002:" + s : rt(t, 'undeclared tag handle "' + n + '"'), !0;
}
p(Vp, "readTagProperty");
function Kp(t) {
  var e, r;
  if (r = t.input.charCodeAt(t.position), r !== 38) return !1;
  for (t.anchor !== null && rt(t, "duplication of an anchor property"), r = t.input.charCodeAt(++t.position), e = t.position; r !== 0 && !Kt(r) && !Ar(r); )
    r = t.input.charCodeAt(++t.position);
  return t.position === e && rt(t, "name of an anchor node must contain at least one character"), t.anchor = t.input.slice(e, t.position), !0;
}
p(Kp, "readAnchorProperty");
function Zp(t) {
  var e, r, i;
  if (i = t.input.charCodeAt(t.position), i !== 42) return !1;
  for (i = t.input.charCodeAt(++t.position), e = t.position; i !== 0 && !Kt(i) && !Ar(i); )
    i = t.input.charCodeAt(++t.position);
  return t.position === e && rt(t, "name of an alias node must contain at least one character"), r = t.input.slice(e, t.position), lr.call(t.anchorMap, r) || rt(t, 'unidentified alias "' + r + '"'), t.result = t.anchorMap[r], Tt(t, !0, -1), !0;
}
p(Zp, "readAlias");
function Rr(t, e, r, i, n) {
  var s, a, o, l = 1, c = !1, h = !1, u, f, d, g, m, y;
  if (t.listener !== null && t.listener("open", t), t.tag = null, t.anchor = null, t.kind = null, t.result = null, s = a = o = Is === r || Fp === r, i && Tt(t, !0, -1) && (c = !0, t.lineIndent > e ? l = 1 : t.lineIndent === e ? l = 0 : t.lineIndent < e && (l = -1)), l === 1)
    for (; Vp(t) || Kp(t); )
      Tt(t, !0, -1) ? (c = !0, o = s, t.lineIndent > e ? l = 1 : t.lineIndent === e ? l = 0 : t.lineIndent < e && (l = -1)) : o = !1;
  if (o && (o = c || n), (l === 1 || Is === r) && (Ds === r || $p === r ? m = e : m = e + 1, y = t.position - t.lineStart, l === 1 ? o && (qo(t, y) || Gp(t, y, m)) || Up(t, m) ? h = !0 : (a && Xp(t, m) || Yp(t, m) || jp(t, m) ? h = !0 : Zp(t) ? (h = !0, (t.tag !== null || t.anchor !== null) && rt(t, "alias node should not have any properties")) : Hp(t, m, Ds === r) && (h = !0, t.tag === null && (t.tag = "?")), t.anchor !== null && (t.anchorMap[t.anchor] = t.result)) : l === 0 && (h = o && qo(t, y))), t.tag === null)
    t.anchor !== null && (t.anchorMap[t.anchor] = t.result);
  else if (t.tag === "?") {
    for (t.result !== null && t.kind !== "scalar" && rt(t, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + t.kind + '"'), u = 0, f = t.implicitTypes.length; u < f; u += 1)
      if (g = t.implicitTypes[u], g.resolve(t.result)) {
        t.result = g.construct(t.result), t.tag = g.tag, t.anchor !== null && (t.anchorMap[t.anchor] = t.result);
        break;
      }
  } else if (t.tag !== "!") {
    if (lr.call(t.typeMap[t.kind || "fallback"], t.tag))
      g = t.typeMap[t.kind || "fallback"][t.tag];
    else
      for (g = null, d = t.typeMap.multi[t.kind || "fallback"], u = 0, f = d.length; u < f; u += 1)
        if (t.tag.slice(0, d[u].tag.length) === d[u].tag) {
          g = d[u];
          break;
        }
    g || rt(t, "unknown tag !<" + t.tag + ">"), t.result !== null && g.kind !== t.kind && rt(t, "unacceptable node kind for !<" + t.tag + '> tag; it should be "' + g.kind + '", not "' + t.kind + '"'), g.resolve(t.result, t.tag) ? (t.result = g.construct(t.result, t.tag), t.anchor !== null && (t.anchorMap[t.anchor] = t.result)) : rt(t, "cannot resolve a node with !<" + t.tag + "> explicit tag");
  }
  return t.listener !== null && t.listener("close", t), t.tag !== null || t.anchor !== null || h;
}
p(Rr, "composeNode");
function Qp(t) {
  var e = t.position, r, i, n, s = !1, a;
  for (t.version = null, t.checkLineBreaks = t.legacy, t.tagMap = /* @__PURE__ */ Object.create(null), t.anchorMap = /* @__PURE__ */ Object.create(null); (a = t.input.charCodeAt(t.position)) !== 0 && (Tt(t, !0, -1), a = t.input.charCodeAt(t.position), !(t.lineIndent > 0 || a !== 37)); ) {
    for (s = !0, a = t.input.charCodeAt(++t.position), r = t.position; a !== 0 && !Kt(a); )
      a = t.input.charCodeAt(++t.position);
    for (i = t.input.slice(r, t.position), n = [], i.length < 1 && rt(t, "directive name must not be less than one character in length"); a !== 0; ) {
      for (; ar(a); )
        a = t.input.charCodeAt(++t.position);
      if (a === 35) {
        do
          a = t.input.charCodeAt(++t.position);
        while (a !== 0 && !Ce(a));
        break;
      }
      if (Ce(a)) break;
      for (r = t.position; a !== 0 && !Kt(a); )
        a = t.input.charCodeAt(++t.position);
      n.push(t.input.slice(r, t.position));
    }
    a !== 0 && da(t), lr.call(ru, i) ? ru[i](t, i, n) : fn(t, 'unknown document directive "' + i + '"');
  }
  if (Tt(t, !0, -1), t.lineIndent === 0 && t.input.charCodeAt(t.position) === 45 && t.input.charCodeAt(t.position + 1) === 45 && t.input.charCodeAt(t.position + 2) === 45 ? (t.position += 3, Tt(t, !0, -1)) : s && rt(t, "directives end mark is expected"), Rr(t, t.lineIndent - 1, Is, !1, !0), Tt(t, !0, -1), t.checkLineBreaks && rk.test(t.input.slice(e, t.position)) && fn(t, "non-ASCII line breaks are interpreted as content"), t.documents.push(t.result), t.position === t.lineStart && Tn(t)) {
    t.input.charCodeAt(t.position) === 46 && (t.position += 3, Tt(t, !0, -1));
    return;
  }
  if (t.position < t.length - 1)
    rt(t, "end of the stream or a document separator is expected");
  else
    return;
}
p(Qp, "readDocument");
function Zl(t, e) {
  t = String(t), e = e || {}, t.length !== 0 && (t.charCodeAt(t.length - 1) !== 10 && t.charCodeAt(t.length - 1) !== 13 && (t += `
`), t.charCodeAt(0) === 65279 && (t = t.slice(1)));
  var r = new qp(t, e), i = t.indexOf("\0");
  for (i !== -1 && (r.position = i, rt(r, "null byte is not allowed in input")), r.input += "\0"; r.input.charCodeAt(r.position) === 32; )
    r.lineIndent += 1, r.position += 1;
  for (; r.position < r.length - 1; )
    Qp(r);
  return r.documents;
}
p(Zl, "loadDocuments");
function nk(t, e, r) {
  e !== null && typeof e == "object" && typeof r > "u" && (r = e, e = null);
  var i = Zl(t, r);
  if (typeof e != "function")
    return i;
  for (var n = 0, s = i.length; n < s; n += 1)
    e(i[n]);
}
p(nk, "loadAll$1");
function Jp(t, e) {
  var r = Zl(t, e);
  if (r.length !== 0) {
    if (r.length === 1)
      return r[0];
    throw new ie("expected a single document in the stream, but found more");
  }
}
p(Jp, "load$1");
var sk = Jp, ak = {
  load: sk
}, tg = Object.prototype.toString, eg = Object.prototype.hasOwnProperty, Ql = 65279, ok = 9, dn = 10, lk = 13, ck = 32, hk = 33, uk = 34, Ho = 35, fk = 37, dk = 38, pk = 39, gk = 42, rg = 44, mk = 45, Rs = 58, yk = 61, xk = 62, bk = 63, wk = 64, ig = 91, ng = 93, Ck = 96, sg = 123, _k = 124, ag = 125, Ut = {};
Ut[0] = "\\0";
Ut[7] = "\\a";
Ut[8] = "\\b";
Ut[9] = "\\t";
Ut[10] = "\\n";
Ut[11] = "\\v";
Ut[12] = "\\f";
Ut[13] = "\\r";
Ut[27] = "\\e";
Ut[34] = '\\"';
Ut[92] = "\\\\";
Ut[133] = "\\N";
Ut[160] = "\\_";
Ut[8232] = "\\L";
Ut[8233] = "\\P";
var kk = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
], Sk = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function og(t, e) {
  var r, i, n, s, a, o, l;
  if (e === null) return {};
  for (r = {}, i = Object.keys(e), n = 0, s = i.length; n < s; n += 1)
    a = i[n], o = String(e[a]), a.slice(0, 2) === "!!" && (a = "tag:yaml.org,2002:" + a.slice(2)), l = t.compiledTypeMap.fallback[a], l && eg.call(l.styleAliases, o) && (o = l.styleAliases[o]), r[a] = o;
  return r;
}
p(og, "compileStyleMap");
function lg(t) {
  var e, r, i;
  if (e = t.toString(16).toUpperCase(), t <= 255)
    r = "x", i = 2;
  else if (t <= 65535)
    r = "u", i = 4;
  else if (t <= 4294967295)
    r = "U", i = 8;
  else
    throw new ie("code point within a string may not be greater than 0xFFFFFFFF");
  return "\\" + r + Ft.repeat("0", i - e.length) + e;
}
p(lg, "encodeHex");
var vk = 1, pn = 2;
function cg(t) {
  this.schema = t.schema || Mp, this.indent = Math.max(1, t.indent || 2), this.noArrayIndent = t.noArrayIndent || !1, this.skipInvalid = t.skipInvalid || !1, this.flowLevel = Ft.isNothing(t.flowLevel) ? -1 : t.flowLevel, this.styleMap = og(this.schema, t.styles || null), this.sortKeys = t.sortKeys || !1, this.lineWidth = t.lineWidth || 80, this.noRefs = t.noRefs || !1, this.noCompatMode = t.noCompatMode || !1, this.condenseFlow = t.condenseFlow || !1, this.quotingType = t.quotingType === '"' ? pn : vk, this.forceQuotes = t.forceQuotes || !1, this.replacer = typeof t.replacer == "function" ? t.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
}
p(cg, "State");
function Yo(t, e) {
  for (var r = Ft.repeat(" ", e), i = 0, n = -1, s = "", a, o = t.length; i < o; )
    n = t.indexOf(`
`, i), n === -1 ? (a = t.slice(i), i = o) : (a = t.slice(i, n + 1), i = n + 1), a.length && a !== `
` && (s += r), s += a;
  return s;
}
p(Yo, "indentString");
function Ps(t, e) {
  return `
` + Ft.repeat(" ", t.indent * e);
}
p(Ps, "generateNextLine");
function hg(t, e) {
  var r, i, n;
  for (r = 0, i = t.implicitTypes.length; r < i; r += 1)
    if (n = t.implicitTypes[r], n.resolve(e))
      return !0;
  return !1;
}
p(hg, "testImplicitResolving");
function gn(t) {
  return t === ck || t === ok;
}
p(gn, "isWhitespace");
function xi(t) {
  return 32 <= t && t <= 126 || 161 <= t && t <= 55295 && t !== 8232 && t !== 8233 || 57344 <= t && t <= 65533 && t !== Ql || 65536 <= t && t <= 1114111;
}
p(xi, "isPrintable");
function jo(t) {
  return xi(t) && t !== Ql && t !== lk && t !== dn;
}
p(jo, "isNsCharOrWhitespace");
function Uo(t, e, r) {
  var i = jo(t), n = i && !gn(t);
  return (
    // ns-plain-safe
    (r ? (
      // c = flow-in
      i
    ) : i && t !== rg && t !== ig && t !== ng && t !== sg && t !== ag) && t !== Ho && !(e === Rs && !n) || jo(e) && !gn(e) && t === Ho || e === Rs && n
  );
}
p(Uo, "isPlainSafe");
function ug(t) {
  return xi(t) && t !== Ql && !gn(t) && t !== mk && t !== bk && t !== Rs && t !== rg && t !== ig && t !== ng && t !== sg && t !== ag && t !== Ho && t !== dk && t !== gk && t !== hk && t !== _k && t !== yk && t !== xk && t !== pk && t !== uk && t !== fk && t !== wk && t !== Ck;
}
p(ug, "isPlainSafeFirst");
function fg(t) {
  return !gn(t) && t !== Rs;
}
p(fg, "isPlainSafeLast");
function ai(t, e) {
  var r = t.charCodeAt(e), i;
  return r >= 55296 && r <= 56319 && e + 1 < t.length && (i = t.charCodeAt(e + 1), i >= 56320 && i <= 57343) ? (r - 55296) * 1024 + i - 56320 + 65536 : r;
}
p(ai, "codePointAt");
function Jl(t) {
  var e = /^\n* /;
  return e.test(t);
}
p(Jl, "needIndentIndicator");
var dg = 1, Xo = 2, pg = 3, gg = 4, ii = 5;
function mg(t, e, r, i, n, s, a, o) {
  var l, c = 0, h = null, u = !1, f = !1, d = i !== -1, g = -1, m = ug(ai(t, 0)) && fg(ai(t, t.length - 1));
  if (e || a)
    for (l = 0; l < t.length; c >= 65536 ? l += 2 : l++) {
      if (c = ai(t, l), !xi(c))
        return ii;
      m = m && Uo(c, h, o), h = c;
    }
  else {
    for (l = 0; l < t.length; c >= 65536 ? l += 2 : l++) {
      if (c = ai(t, l), c === dn)
        u = !0, d && (f = f || // Foldable line = too long, and not more-indented.
        l - g - 1 > i && t[g + 1] !== " ", g = l);
      else if (!xi(c))
        return ii;
      m = m && Uo(c, h, o), h = c;
    }
    f = f || d && l - g - 1 > i && t[g + 1] !== " ";
  }
  return !u && !f ? m && !a && !n(t) ? dg : s === pn ? ii : Xo : r > 9 && Jl(t) ? ii : a ? s === pn ? ii : Xo : f ? gg : pg;
}
p(mg, "chooseScalarStyle");
function yg(t, e, r, i, n) {
  t.dump = (function() {
    if (e.length === 0)
      return t.quotingType === pn ? '""' : "''";
    if (!t.noCompatMode && (kk.indexOf(e) !== -1 || Sk.test(e)))
      return t.quotingType === pn ? '"' + e + '"' : "'" + e + "'";
    var s = t.indent * Math.max(1, r), a = t.lineWidth === -1 ? -1 : Math.max(Math.min(t.lineWidth, 40), t.lineWidth - s), o = i || t.flowLevel > -1 && r >= t.flowLevel;
    function l(c) {
      return hg(t, c);
    }
    switch (p(l, "testAmbiguity"), mg(
      e,
      o,
      t.indent,
      a,
      l,
      t.quotingType,
      t.forceQuotes && !i,
      n
    )) {
      case dg:
        return e;
      case Xo:
        return "'" + e.replace(/'/g, "''") + "'";
      case pg:
        return "|" + Go(e, t.indent) + Vo(Yo(e, s));
      case gg:
        return ">" + Go(e, t.indent) + Vo(Yo(xg(e, a), s));
      case ii:
        return '"' + bg(e) + '"';
      default:
        throw new ie("impossible error: invalid scalar style");
    }
  })();
}
p(yg, "writeScalar");
function Go(t, e) {
  var r = Jl(t) ? String(e) : "", i = t[t.length - 1] === `
`, n = i && (t[t.length - 2] === `
` || t === `
`), s = n ? "+" : i ? "" : "-";
  return r + s + `
`;
}
p(Go, "blockHeader");
function Vo(t) {
  return t[t.length - 1] === `
` ? t.slice(0, -1) : t;
}
p(Vo, "dropEndingNewline");
function xg(t, e) {
  for (var r = /(\n+)([^\n]*)/g, i = (function() {
    var c = t.indexOf(`
`);
    return c = c !== -1 ? c : t.length, r.lastIndex = c, Ko(t.slice(0, c), e);
  })(), n = t[0] === `
` || t[0] === " ", s, a; a = r.exec(t); ) {
    var o = a[1], l = a[2];
    s = l[0] === " ", i += o + (!n && !s && l !== "" ? `
` : "") + Ko(l, e), n = s;
  }
  return i;
}
p(xg, "foldString");
function Ko(t, e) {
  if (t === "" || t[0] === " ") return t;
  for (var r = / [^ ]/g, i, n = 0, s, a = 0, o = 0, l = ""; i = r.exec(t); )
    o = i.index, o - n > e && (s = a > n ? a : o, l += `
` + t.slice(n, s), n = s + 1), a = o;
  return l += `
`, t.length - n > e && a > n ? l += t.slice(n, a) + `
` + t.slice(a + 1) : l += t.slice(n), l.slice(1);
}
p(Ko, "foldLine");
function bg(t) {
  for (var e = "", r = 0, i, n = 0; n < t.length; r >= 65536 ? n += 2 : n++)
    r = ai(t, n), i = Ut[r], !i && xi(r) ? (e += t[n], r >= 65536 && (e += t[n + 1])) : e += i || lg(r);
  return e;
}
p(bg, "escapeString");
function wg(t, e, r) {
  var i = "", n = t.tag, s, a, o;
  for (s = 0, a = r.length; s < a; s += 1)
    o = r[s], t.replacer && (o = t.replacer.call(r, String(s), o)), (Re(t, e, o, !1, !1) || typeof o > "u" && Re(t, e, null, !1, !1)) && (i !== "" && (i += "," + (t.condenseFlow ? "" : " ")), i += t.dump);
  t.tag = n, t.dump = "[" + i + "]";
}
p(wg, "writeFlowSequence");
function Zo(t, e, r, i) {
  var n = "", s = t.tag, a, o, l;
  for (a = 0, o = r.length; a < o; a += 1)
    l = r[a], t.replacer && (l = t.replacer.call(r, String(a), l)), (Re(t, e + 1, l, !0, !0, !1, !0) || typeof l > "u" && Re(t, e + 1, null, !0, !0, !1, !0)) && ((!i || n !== "") && (n += Ps(t, e)), t.dump && dn === t.dump.charCodeAt(0) ? n += "-" : n += "- ", n += t.dump);
  t.tag = s, t.dump = n || "[]";
}
p(Zo, "writeBlockSequence");
function Cg(t, e, r) {
  var i = "", n = t.tag, s = Object.keys(r), a, o, l, c, h;
  for (a = 0, o = s.length; a < o; a += 1)
    h = "", i !== "" && (h += ", "), t.condenseFlow && (h += '"'), l = s[a], c = r[l], t.replacer && (c = t.replacer.call(r, l, c)), Re(t, e, l, !1, !1) && (t.dump.length > 1024 && (h += "? "), h += t.dump + (t.condenseFlow ? '"' : "") + ":" + (t.condenseFlow ? "" : " "), Re(t, e, c, !1, !1) && (h += t.dump, i += h));
  t.tag = n, t.dump = "{" + i + "}";
}
p(Cg, "writeFlowMapping");
function _g(t, e, r, i) {
  var n = "", s = t.tag, a = Object.keys(r), o, l, c, h, u, f;
  if (t.sortKeys === !0)
    a.sort();
  else if (typeof t.sortKeys == "function")
    a.sort(t.sortKeys);
  else if (t.sortKeys)
    throw new ie("sortKeys must be a boolean or a function");
  for (o = 0, l = a.length; o < l; o += 1)
    f = "", (!i || n !== "") && (f += Ps(t, e)), c = a[o], h = r[c], t.replacer && (h = t.replacer.call(r, c, h)), Re(t, e + 1, c, !0, !0, !0) && (u = t.tag !== null && t.tag !== "?" || t.dump && t.dump.length > 1024, u && (t.dump && dn === t.dump.charCodeAt(0) ? f += "?" : f += "? "), f += t.dump, u && (f += Ps(t, e)), Re(t, e + 1, h, !0, u) && (t.dump && dn === t.dump.charCodeAt(0) ? f += ":" : f += ": ", f += t.dump, n += f));
  t.tag = s, t.dump = n || "{}";
}
p(_g, "writeBlockMapping");
function Qo(t, e, r) {
  var i, n, s, a, o, l;
  for (n = r ? t.explicitTypes : t.implicitTypes, s = 0, a = n.length; s < a; s += 1)
    if (o = n[s], (o.instanceOf || o.predicate) && (!o.instanceOf || typeof e == "object" && e instanceof o.instanceOf) && (!o.predicate || o.predicate(e))) {
      if (r ? o.multi && o.representName ? t.tag = o.representName(e) : t.tag = o.tag : t.tag = "?", o.represent) {
        if (l = t.styleMap[o.tag] || o.defaultStyle, tg.call(o.represent) === "[object Function]")
          i = o.represent(e, l);
        else if (eg.call(o.represent, l))
          i = o.represent[l](e, l);
        else
          throw new ie("!<" + o.tag + '> tag resolver accepts not "' + l + '" style');
        t.dump = i;
      }
      return !0;
    }
  return !1;
}
p(Qo, "detectType");
function Re(t, e, r, i, n, s, a) {
  t.tag = null, t.dump = r, Qo(t, r, !1) || Qo(t, r, !0);
  var o = tg.call(t.dump), l = i, c;
  i && (i = t.flowLevel < 0 || t.flowLevel > e);
  var h = o === "[object Object]" || o === "[object Array]", u, f;
  if (h && (u = t.duplicates.indexOf(r), f = u !== -1), (t.tag !== null && t.tag !== "?" || f || t.indent !== 2 && e > 0) && (n = !1), f && t.usedDuplicates[u])
    t.dump = "*ref_" + u;
  else {
    if (h && f && !t.usedDuplicates[u] && (t.usedDuplicates[u] = !0), o === "[object Object]")
      i && Object.keys(t.dump).length !== 0 ? (_g(t, e, t.dump, n), f && (t.dump = "&ref_" + u + t.dump)) : (Cg(t, e, t.dump), f && (t.dump = "&ref_" + u + " " + t.dump));
    else if (o === "[object Array]")
      i && t.dump.length !== 0 ? (t.noArrayIndent && !a && e > 0 ? Zo(t, e - 1, t.dump, n) : Zo(t, e, t.dump, n), f && (t.dump = "&ref_" + u + t.dump)) : (wg(t, e, t.dump), f && (t.dump = "&ref_" + u + " " + t.dump));
    else if (o === "[object String]")
      t.tag !== "?" && yg(t, t.dump, e, s, l);
    else {
      if (o === "[object Undefined]")
        return !1;
      if (t.skipInvalid) return !1;
      throw new ie("unacceptable kind of an object to dump " + o);
    }
    t.tag !== null && t.tag !== "?" && (c = encodeURI(
      t.tag[0] === "!" ? t.tag.slice(1) : t.tag
    ).replace(/!/g, "%21"), t.tag[0] === "!" ? c = "!" + c : c.slice(0, 18) === "tag:yaml.org,2002:" ? c = "!!" + c.slice(18) : c = "!<" + c + ">", t.dump = c + " " + t.dump);
  }
  return !0;
}
p(Re, "writeNode");
function kg(t, e) {
  var r = [], i = [], n, s;
  for (Ns(t, r, i), n = 0, s = i.length; n < s; n += 1)
    e.duplicates.push(r[i[n]]);
  e.usedDuplicates = new Array(s);
}
p(kg, "getDuplicateReferences");
function Ns(t, e, r) {
  var i, n, s;
  if (t !== null && typeof t == "object")
    if (n = e.indexOf(t), n !== -1)
      r.indexOf(n) === -1 && r.push(n);
    else if (e.push(t), Array.isArray(t))
      for (n = 0, s = t.length; n < s; n += 1)
        Ns(t[n], e, r);
    else
      for (i = Object.keys(t), n = 0, s = i.length; n < s; n += 1)
        Ns(t[i[n]], e, r);
}
p(Ns, "inspectNode");
function Tk(t, e) {
  e = e || {};
  var r = new cg(e);
  r.noRefs || kg(t, r);
  var i = t;
  return r.replacer && (i = r.replacer.call({ "": i }, "", i)), Re(r, 0, i, !0, !0) ? r.dump + `
` : "";
}
p(Tk, "dump$1");
function Ak(t, e) {
  return function() {
    throw new Error("Function yaml." + t + " is removed in js-yaml 4. Use yaml." + e + " instead, which is now safe by default.");
  };
}
p(Ak, "renamed");
var Lk = pp, Ek = ak.load;
var qt = {
  aggregation: 17.25,
  extension: 17.25,
  composition: 17.25,
  dependency: 6,
  lollipop: 13.5,
  arrow_point: 4
  //arrow_cross: 24,
}, iu = {
  arrow_point: 9,
  arrow_cross: 12.5,
  arrow_circle: 12.5
};
function Xi(t, e) {
  if (t === void 0 || e === void 0)
    return { angle: 0, deltaX: 0, deltaY: 0 };
  t = kt(t), e = kt(e);
  const [r, i] = [t.x, t.y], [n, s] = [e.x, e.y], a = n - r, o = s - i;
  return { angle: Math.atan(o / a), deltaX: a, deltaY: o };
}
p(Xi, "calculateDeltaAndAngle");
var kt = /* @__PURE__ */ p((t) => Array.isArray(t) ? { x: t[0], y: t[1] } : t, "pointTransformer"), Bk = /* @__PURE__ */ p((t) => ({
  x: /* @__PURE__ */ p(function(e, r, i) {
    let n = 0;
    const s = kt(i[0]).x < kt(i[i.length - 1]).x ? "left" : "right";
    if (r === 0 && Object.hasOwn(qt, t.arrowTypeStart)) {
      const { angle: d, deltaX: g } = Xi(i[0], i[1]);
      n = qt[t.arrowTypeStart] * Math.cos(d) * (g >= 0 ? 1 : -1);
    } else if (r === i.length - 1 && Object.hasOwn(qt, t.arrowTypeEnd)) {
      const { angle: d, deltaX: g } = Xi(
        i[i.length - 1],
        i[i.length - 2]
      );
      n = qt[t.arrowTypeEnd] * Math.cos(d) * (g >= 0 ? 1 : -1);
    }
    const a = Math.abs(
      kt(e).x - kt(i[i.length - 1]).x
    ), o = Math.abs(
      kt(e).y - kt(i[i.length - 1]).y
    ), l = Math.abs(kt(e).x - kt(i[0]).x), c = Math.abs(kt(e).y - kt(i[0]).y), h = qt[t.arrowTypeStart], u = qt[t.arrowTypeEnd], f = 1;
    if (a < u && a > 0 && o < u) {
      let d = u + f - a;
      d *= s === "right" ? -1 : 1, n -= d;
    }
    if (l < h && l > 0 && c < h) {
      let d = h + f - l;
      d *= s === "right" ? -1 : 1, n += d;
    }
    return kt(e).x + n;
  }, "x"),
  y: /* @__PURE__ */ p(function(e, r, i) {
    let n = 0;
    const s = kt(i[0]).y < kt(i[i.length - 1]).y ? "down" : "up";
    if (r === 0 && Object.hasOwn(qt, t.arrowTypeStart)) {
      const { angle: d, deltaY: g } = Xi(i[0], i[1]);
      n = qt[t.arrowTypeStart] * Math.abs(Math.sin(d)) * (g >= 0 ? 1 : -1);
    } else if (r === i.length - 1 && Object.hasOwn(qt, t.arrowTypeEnd)) {
      const { angle: d, deltaY: g } = Xi(
        i[i.length - 1],
        i[i.length - 2]
      );
      n = qt[t.arrowTypeEnd] * Math.abs(Math.sin(d)) * (g >= 0 ? 1 : -1);
    }
    const a = Math.abs(
      kt(e).y - kt(i[i.length - 1]).y
    ), o = Math.abs(
      kt(e).x - kt(i[i.length - 1]).x
    ), l = Math.abs(kt(e).y - kt(i[0]).y), c = Math.abs(kt(e).x - kt(i[0]).x), h = qt[t.arrowTypeStart], u = qt[t.arrowTypeEnd], f = 1;
    if (a < u && a > 0 && o < u) {
      let d = u + f - a;
      d *= s === "up" ? -1 : 1, n -= d;
    }
    if (l < h && l > 0 && c < h) {
      let d = h + f - l;
      d *= s === "up" ? -1 : 1, n += d;
    }
    return kt(e).y + n;
  }, "y")
}), "getLineFunctionsWithOffset"), tc = /* @__PURE__ */ p(({
  flowchart: t
}) => {
  const e = t?.subGraphTitleMargin?.top ?? 0, r = t?.subGraphTitleMargin?.bottom ?? 0, i = e + r;
  return {
    subGraphTitleTopMargin: e,
    subGraphTitleBottomMargin: r,
    subGraphTitleTotalMargin: i
  };
}, "getSubGraphTitleMargins"), Mk = /* @__PURE__ */ p((t) => {
  const { handDrawnSeed: e } = yt();
  return {
    fill: t,
    hachureAngle: 120,
    // angle of hachure,
    hachureGap: 4,
    fillWeight: 2,
    roughness: 0.7,
    stroke: t,
    seed: e
  };
}, "solidStateFill"), ki = /* @__PURE__ */ p((t) => {
  const e = $k([
    ...t.cssCompiledStyles || [],
    ...t.cssStyles || [],
    ...t.labelStyle || []
  ]);
  return { stylesMap: e, stylesArray: [...e] };
}, "compileStyles"), $k = /* @__PURE__ */ p((t) => {
  const e = /* @__PURE__ */ new Map();
  return t.forEach((r) => {
    const [i, n] = r.split(":");
    e.set(i.trim(), n?.trim());
  }), e;
}, "styles2Map"), Sg = /* @__PURE__ */ p((t) => t === "color" || t === "font-size" || t === "font-family" || t === "font-weight" || t === "font-style" || t === "text-decoration" || t === "text-align" || t === "text-transform" || t === "line-height" || t === "letter-spacing" || t === "word-spacing" || t === "text-shadow" || t === "text-overflow" || t === "white-space" || t === "word-wrap" || t === "word-break" || t === "overflow-wrap" || t === "hyphens", "isLabelStyle"), K = /* @__PURE__ */ p((t) => {
  const { stylesArray: e } = ki(t), r = [], i = [], n = [], s = [];
  return e.forEach((a) => {
    const o = a[0];
    Sg(o) ? r.push(a.join(":") + " !important") : (i.push(a.join(":") + " !important"), o.includes("stroke") && n.push(a.join(":") + " !important"), o === "fill" && s.push(a.join(":") + " !important"));
  }), {
    labelStyles: r.join(";"),
    nodeStyles: i.join(";"),
    stylesArray: e,
    borderStyles: n,
    backgroundStyles: s
  };
}, "styles2String"), V = /* @__PURE__ */ p((t, e) => {
  const { themeVariables: r, handDrawnSeed: i } = yt(), { nodeBorder: n, mainBkg: s } = r, { stylesMap: a } = ki(t);
  return Object.assign(
    {
      roughness: 0.7,
      fill: a.get("fill") || s,
      fillStyle: "hachure",
      // solid fill
      fillWeight: 4,
      hachureGap: 5.2,
      stroke: a.get("stroke") || n,
      seed: i,
      strokeWidth: a.get("stroke-width")?.replace("px", "") || 1.3,
      fillLineDash: [0, 0],
      strokeLineDash: Fk(a.get("stroke-dasharray"))
    },
    e
  );
}, "userNodeOverrides"), Fk = /* @__PURE__ */ p((t) => {
  if (!t)
    return [0, 0];
  const e = t.trim().split(/\s+/).map(Number);
  if (e.length === 1) {
    const n = isNaN(e[0]) ? 0 : e[0];
    return [n, n];
  }
  const r = isNaN(e[0]) ? 0 : e[0], i = isNaN(e[1]) ? 0 : e[1];
  return [r, i];
}, "getStrokeDashArray"), Kn = {}, Mt = {}, nu;
function Ok() {
  return nu || (nu = 1, Object.defineProperty(Mt, "__esModule", { value: !0 }), Mt.BLANK_URL = Mt.relativeFirstCharacters = Mt.whitespaceEscapeCharsRegex = Mt.urlSchemeRegex = Mt.ctrlCharactersRegex = Mt.htmlCtrlEntityRegex = Mt.htmlEntitiesRegex = Mt.invalidProtocolRegex = void 0, Mt.invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im, Mt.htmlEntitiesRegex = /&#(\w+)(^\w|;)?/g, Mt.htmlCtrlEntityRegex = /&(newline|tab);/gi, Mt.ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim, Mt.urlSchemeRegex = /^.+(:|&colon;)/gim, Mt.whitespaceEscapeCharsRegex = /(\\|%5[cC])((%(6[eE]|72|74))|[nrt])/g, Mt.relativeFirstCharacters = [".", "/"], Mt.BLANK_URL = "about:blank"), Mt;
}
var su;
function Dk() {
  if (su) return Kn;
  su = 1, Object.defineProperty(Kn, "__esModule", { value: !0 }), Kn.sanitizeUrl = s;
  var t = Ok();
  function e(a) {
    return t.relativeFirstCharacters.indexOf(a[0]) > -1;
  }
  function r(a) {
    var o = a.replace(t.ctrlCharactersRegex, "");
    return o.replace(t.htmlEntitiesRegex, function(l, c) {
      return String.fromCharCode(c);
    });
  }
  function i(a) {
    return URL.canParse(a);
  }
  function n(a) {
    try {
      return decodeURIComponent(a);
    } catch {
      return a;
    }
  }
  function s(a) {
    if (!a)
      return t.BLANK_URL;
    var o, l = n(a.trim());
    do
      l = r(l).replace(t.htmlCtrlEntityRegex, "").replace(t.ctrlCharactersRegex, "").replace(t.whitespaceEscapeCharsRegex, "").trim(), l = n(l), o = l.match(t.ctrlCharactersRegex) || l.match(t.htmlEntitiesRegex) || l.match(t.htmlCtrlEntityRegex) || l.match(t.whitespaceEscapeCharsRegex);
    while (o && o.length > 0);
    var c = l;
    if (!c)
      return t.BLANK_URL;
    if (e(c))
      return c;
    var h = c.trimStart(), u = h.match(t.urlSchemeRegex);
    if (!u)
      return c;
    var f = u[0].toLowerCase().trim();
    if (t.invalidProtocolRegex.test(f))
      return t.BLANK_URL;
    var d = h.replace(/\\/g, "/");
    if (f === "mailto:" || f.includes("://"))
      return d;
    if (f === "http:" || f === "https:") {
      if (!i(d))
        return t.BLANK_URL;
      var g = new URL(d);
      return g.protocol = g.protocol.toLowerCase(), g.hostname = g.hostname.toLowerCase(), g.toString();
    }
    return d;
  }
  return Kn;
}
var Ik = Dk(), vg = typeof global == "object" && global && global.Object === Object && global, Rk = typeof self == "object" && self && self.Object === Object && self, Ne = vg || Rk || Function("return this")(), zs = Ne.Symbol, Tg = Object.prototype, Pk = Tg.hasOwnProperty, Nk = Tg.toString, Ii = zs ? zs.toStringTag : void 0;
function zk(t) {
  var e = Pk.call(t, Ii), r = t[Ii];
  try {
    t[Ii] = void 0;
    var i = !0;
  } catch {
  }
  var n = Nk.call(t);
  return i && (e ? t[Ii] = r : delete t[Ii]), n;
}
var Wk = Object.prototype, qk = Wk.toString;
function Hk(t) {
  return qk.call(t);
}
var Yk = "[object Null]", jk = "[object Undefined]", au = zs ? zs.toStringTag : void 0;
function Si(t) {
  return t == null ? t === void 0 ? jk : Yk : au && au in Object(t) ? zk(t) : Hk(t);
}
function qr(t) {
  var e = typeof t;
  return t != null && (e == "object" || e == "function");
}
var Uk = "[object AsyncFunction]", Xk = "[object Function]", Gk = "[object GeneratorFunction]", Vk = "[object Proxy]";
function ec(t) {
  if (!qr(t))
    return !1;
  var e = Si(t);
  return e == Xk || e == Gk || e == Uk || e == Vk;
}
var no = Ne["__core-js_shared__"], ou = (function() {
  var t = /[^.]+$/.exec(no && no.keys && no.keys.IE_PROTO || "");
  return t ? "Symbol(src)_1." + t : "";
})();
function Kk(t) {
  return !!ou && ou in t;
}
var Zk = Function.prototype, Qk = Zk.toString;
function Hr(t) {
  if (t != null) {
    try {
      return Qk.call(t);
    } catch {
    }
    try {
      return t + "";
    } catch {
    }
  }
  return "";
}
var Jk = /[\\^$.*+?()[\]{}|]/g, tS = /^\[object .+?Constructor\]$/, eS = Function.prototype, rS = Object.prototype, iS = eS.toString, nS = rS.hasOwnProperty, sS = RegExp(
  "^" + iS.call(nS).replace(Jk, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function aS(t) {
  if (!qr(t) || Kk(t))
    return !1;
  var e = ec(t) ? sS : tS;
  return e.test(Hr(t));
}
function oS(t, e) {
  return t?.[e];
}
function Yr(t, e) {
  var r = oS(t, e);
  return aS(r) ? r : void 0;
}
var mn = Yr(Object, "create");
function lS() {
  this.__data__ = mn ? mn(null) : {}, this.size = 0;
}
function cS(t) {
  var e = this.has(t) && delete this.__data__[t];
  return this.size -= e ? 1 : 0, e;
}
var hS = "__lodash_hash_undefined__", uS = Object.prototype, fS = uS.hasOwnProperty;
function dS(t) {
  var e = this.__data__;
  if (mn) {
    var r = e[t];
    return r === hS ? void 0 : r;
  }
  return fS.call(e, t) ? e[t] : void 0;
}
var pS = Object.prototype, gS = pS.hasOwnProperty;
function mS(t) {
  var e = this.__data__;
  return mn ? e[t] !== void 0 : gS.call(e, t);
}
var yS = "__lodash_hash_undefined__";
function xS(t, e) {
  var r = this.__data__;
  return this.size += this.has(t) ? 0 : 1, r[t] = mn && e === void 0 ? yS : e, this;
}
function Pr(t) {
  var e = -1, r = t == null ? 0 : t.length;
  for (this.clear(); ++e < r; ) {
    var i = t[e];
    this.set(i[0], i[1]);
  }
}
Pr.prototype.clear = lS;
Pr.prototype.delete = cS;
Pr.prototype.get = dS;
Pr.prototype.has = mS;
Pr.prototype.set = xS;
function bS() {
  this.__data__ = [], this.size = 0;
}
function ga(t, e) {
  return t === e || t !== t && e !== e;
}
function ma(t, e) {
  for (var r = t.length; r--; )
    if (ga(t[r][0], e))
      return r;
  return -1;
}
var wS = Array.prototype, CS = wS.splice;
function _S(t) {
  var e = this.__data__, r = ma(e, t);
  if (r < 0)
    return !1;
  var i = e.length - 1;
  return r == i ? e.pop() : CS.call(e, r, 1), --this.size, !0;
}
function kS(t) {
  var e = this.__data__, r = ma(e, t);
  return r < 0 ? void 0 : e[r][1];
}
function SS(t) {
  return ma(this.__data__, t) > -1;
}
function vS(t, e) {
  var r = this.__data__, i = ma(r, t);
  return i < 0 ? (++this.size, r.push([t, e])) : r[i][1] = e, this;
}
function Ke(t) {
  var e = -1, r = t == null ? 0 : t.length;
  for (this.clear(); ++e < r; ) {
    var i = t[e];
    this.set(i[0], i[1]);
  }
}
Ke.prototype.clear = bS;
Ke.prototype.delete = _S;
Ke.prototype.get = kS;
Ke.prototype.has = SS;
Ke.prototype.set = vS;
var yn = Yr(Ne, "Map");
function TS() {
  this.size = 0, this.__data__ = {
    hash: new Pr(),
    map: new (yn || Ke)(),
    string: new Pr()
  };
}
function AS(t) {
  var e = typeof t;
  return e == "string" || e == "number" || e == "symbol" || e == "boolean" ? t !== "__proto__" : t === null;
}
function ya(t, e) {
  var r = t.__data__;
  return AS(e) ? r[typeof e == "string" ? "string" : "hash"] : r.map;
}
function LS(t) {
  var e = ya(this, t).delete(t);
  return this.size -= e ? 1 : 0, e;
}
function ES(t) {
  return ya(this, t).get(t);
}
function BS(t) {
  return ya(this, t).has(t);
}
function MS(t, e) {
  var r = ya(this, t), i = r.size;
  return r.set(t, e), this.size += r.size == i ? 0 : 1, this;
}
function ur(t) {
  var e = -1, r = t == null ? 0 : t.length;
  for (this.clear(); ++e < r; ) {
    var i = t[e];
    this.set(i[0], i[1]);
  }
}
ur.prototype.clear = TS;
ur.prototype.delete = LS;
ur.prototype.get = ES;
ur.prototype.has = BS;
ur.prototype.set = MS;
var $S = "Expected a function";
function An(t, e) {
  if (typeof t != "function" || e != null && typeof e != "function")
    throw new TypeError($S);
  var r = function() {
    var i = arguments, n = e ? e.apply(this, i) : i[0], s = r.cache;
    if (s.has(n))
      return s.get(n);
    var a = t.apply(this, i);
    return r.cache = s.set(n, a) || s, a;
  };
  return r.cache = new (An.Cache || ur)(), r;
}
An.Cache = ur;
function FS() {
  this.__data__ = new Ke(), this.size = 0;
}
function OS(t) {
  var e = this.__data__, r = e.delete(t);
  return this.size = e.size, r;
}
function DS(t) {
  return this.__data__.get(t);
}
function IS(t) {
  return this.__data__.has(t);
}
var RS = 200;
function PS(t, e) {
  var r = this.__data__;
  if (r instanceof Ke) {
    var i = r.__data__;
    if (!yn || i.length < RS - 1)
      return i.push([t, e]), this.size = ++r.size, this;
    r = this.__data__ = new ur(i);
  }
  return r.set(t, e), this.size = r.size, this;
}
function vi(t) {
  var e = this.__data__ = new Ke(t);
  this.size = e.size;
}
vi.prototype.clear = FS;
vi.prototype.delete = OS;
vi.prototype.get = DS;
vi.prototype.has = IS;
vi.prototype.set = PS;
var Ws = (function() {
  try {
    var t = Yr(Object, "defineProperty");
    return t({}, "", {}), t;
  } catch {
  }
})();
function rc(t, e, r) {
  e == "__proto__" && Ws ? Ws(t, e, {
    configurable: !0,
    enumerable: !0,
    value: r,
    writable: !0
  }) : t[e] = r;
}
function Jo(t, e, r) {
  (r !== void 0 && !ga(t[e], r) || r === void 0 && !(e in t)) && rc(t, e, r);
}
function NS(t) {
  return function(e, r, i) {
    for (var n = -1, s = Object(e), a = i(e), o = a.length; o--; ) {
      var l = a[++n];
      if (r(s[l], l, s) === !1)
        break;
    }
    return e;
  };
}
var zS = NS(), Ag = typeof exports == "object" && exports && !exports.nodeType && exports, lu = Ag && typeof module == "object" && module && !module.nodeType && module, WS = lu && lu.exports === Ag, cu = WS ? Ne.Buffer : void 0, hu = cu ? cu.allocUnsafe : void 0;
function qS(t, e) {
  if (e)
    return t.slice();
  var r = t.length, i = hu ? hu(r) : new t.constructor(r);
  return t.copy(i), i;
}
var uu = Ne.Uint8Array;
function HS(t) {
  var e = new t.constructor(t.byteLength);
  return new uu(e).set(new uu(t)), e;
}
function YS(t, e) {
  var r = e ? HS(t.buffer) : t.buffer;
  return new t.constructor(r, t.byteOffset, t.length);
}
function jS(t, e) {
  var r = -1, i = t.length;
  for (e || (e = Array(i)); ++r < i; )
    e[r] = t[r];
  return e;
}
var fu = Object.create, US = /* @__PURE__ */ (function() {
  function t() {
  }
  return function(e) {
    if (!qr(e))
      return {};
    if (fu)
      return fu(e);
    t.prototype = e;
    var r = new t();
    return t.prototype = void 0, r;
  };
})();
function Lg(t, e) {
  return function(r) {
    return t(e(r));
  };
}
var Eg = Lg(Object.getPrototypeOf, Object), XS = Object.prototype;
function xa(t) {
  var e = t && t.constructor, r = typeof e == "function" && e.prototype || XS;
  return t === r;
}
function GS(t) {
  return typeof t.constructor == "function" && !xa(t) ? US(Eg(t)) : {};
}
function Ln(t) {
  return t != null && typeof t == "object";
}
var VS = "[object Arguments]";
function du(t) {
  return Ln(t) && Si(t) == VS;
}
var Bg = Object.prototype, KS = Bg.hasOwnProperty, ZS = Bg.propertyIsEnumerable, qs = du(/* @__PURE__ */ (function() {
  return arguments;
})()) ? du : function(t) {
  return Ln(t) && KS.call(t, "callee") && !ZS.call(t, "callee");
}, Hs = Array.isArray, QS = 9007199254740991;
function Mg(t) {
  return typeof t == "number" && t > -1 && t % 1 == 0 && t <= QS;
}
function ba(t) {
  return t != null && Mg(t.length) && !ec(t);
}
function JS(t) {
  return Ln(t) && ba(t);
}
function tv() {
  return !1;
}
var $g = typeof exports == "object" && exports && !exports.nodeType && exports, pu = $g && typeof module == "object" && module && !module.nodeType && module, ev = pu && pu.exports === $g, gu = ev ? Ne.Buffer : void 0, rv = gu ? gu.isBuffer : void 0, ic = rv || tv, iv = "[object Object]", nv = Function.prototype, sv = Object.prototype, Fg = nv.toString, av = sv.hasOwnProperty, ov = Fg.call(Object);
function lv(t) {
  if (!Ln(t) || Si(t) != iv)
    return !1;
  var e = Eg(t);
  if (e === null)
    return !0;
  var r = av.call(e, "constructor") && e.constructor;
  return typeof r == "function" && r instanceof r && Fg.call(r) == ov;
}
var cv = "[object Arguments]", hv = "[object Array]", uv = "[object Boolean]", fv = "[object Date]", dv = "[object Error]", pv = "[object Function]", gv = "[object Map]", mv = "[object Number]", yv = "[object Object]", xv = "[object RegExp]", bv = "[object Set]", wv = "[object String]", Cv = "[object WeakMap]", _v = "[object ArrayBuffer]", kv = "[object DataView]", Sv = "[object Float32Array]", vv = "[object Float64Array]", Tv = "[object Int8Array]", Av = "[object Int16Array]", Lv = "[object Int32Array]", Ev = "[object Uint8Array]", Bv = "[object Uint8ClampedArray]", Mv = "[object Uint16Array]", $v = "[object Uint32Array]", wt = {};
wt[Sv] = wt[vv] = wt[Tv] = wt[Av] = wt[Lv] = wt[Ev] = wt[Bv] = wt[Mv] = wt[$v] = !0;
wt[cv] = wt[hv] = wt[_v] = wt[uv] = wt[kv] = wt[fv] = wt[dv] = wt[pv] = wt[gv] = wt[mv] = wt[yv] = wt[xv] = wt[bv] = wt[wv] = wt[Cv] = !1;
function Fv(t) {
  return Ln(t) && Mg(t.length) && !!wt[Si(t)];
}
function Ov(t) {
  return function(e) {
    return t(e);
  };
}
var Og = typeof exports == "object" && exports && !exports.nodeType && exports, nn = Og && typeof module == "object" && module && !module.nodeType && module, Dv = nn && nn.exports === Og, so = Dv && vg.process, mu = (function() {
  try {
    var t = nn && nn.require && nn.require("util").types;
    return t || so && so.binding && so.binding("util");
  } catch {
  }
})(), yu = mu && mu.isTypedArray, nc = yu ? Ov(yu) : Fv;
function tl(t, e) {
  if (!(e === "constructor" && typeof t[e] == "function") && e != "__proto__")
    return t[e];
}
var Iv = Object.prototype, Rv = Iv.hasOwnProperty;
function Pv(t, e, r) {
  var i = t[e];
  (!(Rv.call(t, e) && ga(i, r)) || r === void 0 && !(e in t)) && rc(t, e, r);
}
function Nv(t, e, r, i) {
  var n = !r;
  r || (r = {});
  for (var s = -1, a = e.length; ++s < a; ) {
    var o = e[s], l = void 0;
    l === void 0 && (l = t[o]), n ? rc(r, o, l) : Pv(r, o, l);
  }
  return r;
}
function zv(t, e) {
  for (var r = -1, i = Array(t); ++r < t; )
    i[r] = e(r);
  return i;
}
var Wv = 9007199254740991, qv = /^(?:0|[1-9]\d*)$/;
function Dg(t, e) {
  var r = typeof t;
  return e = e ?? Wv, !!e && (r == "number" || r != "symbol" && qv.test(t)) && t > -1 && t % 1 == 0 && t < e;
}
var Hv = Object.prototype, Yv = Hv.hasOwnProperty;
function jv(t, e) {
  var r = Hs(t), i = !r && qs(t), n = !r && !i && ic(t), s = !r && !i && !n && nc(t), a = r || i || n || s, o = a ? zv(t.length, String) : [], l = o.length;
  for (var c in t)
    (e || Yv.call(t, c)) && !(a && // Safari 9 has enumerable `arguments.length` in strict mode.
    (c == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
    n && (c == "offset" || c == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
    s && (c == "buffer" || c == "byteLength" || c == "byteOffset") || // Skip index properties.
    Dg(c, l))) && o.push(c);
  return o;
}
function Uv(t) {
  var e = [];
  if (t != null)
    for (var r in Object(t))
      e.push(r);
  return e;
}
var Xv = Object.prototype, Gv = Xv.hasOwnProperty;
function Vv(t) {
  if (!qr(t))
    return Uv(t);
  var e = xa(t), r = [];
  for (var i in t)
    i == "constructor" && (e || !Gv.call(t, i)) || r.push(i);
  return r;
}
function Ig(t) {
  return ba(t) ? jv(t, !0) : Vv(t);
}
function Kv(t) {
  return Nv(t, Ig(t));
}
function Zv(t, e, r, i, n, s, a) {
  var o = tl(t, r), l = tl(e, r), c = a.get(l);
  if (c) {
    Jo(t, r, c);
    return;
  }
  var h = s ? s(o, l, r + "", t, e, a) : void 0, u = h === void 0;
  if (u) {
    var f = Hs(l), d = !f && ic(l), g = !f && !d && nc(l);
    h = l, f || d || g ? Hs(o) ? h = o : JS(o) ? h = jS(o) : d ? (u = !1, h = qS(l, !0)) : g ? (u = !1, h = YS(l, !0)) : h = [] : lv(l) || qs(l) ? (h = o, qs(o) ? h = Kv(o) : (!qr(o) || ec(o)) && (h = GS(l))) : u = !1;
  }
  u && (a.set(l, h), n(h, l, i, s, a), a.delete(l)), Jo(t, r, h);
}
function Rg(t, e, r, i, n) {
  t !== e && zS(e, function(s, a) {
    if (n || (n = new vi()), qr(s))
      Zv(t, e, a, r, Rg, i, n);
    else {
      var o = i ? i(tl(t, a), s, a + "", t, e, n) : void 0;
      o === void 0 && (o = s), Jo(t, a, o);
    }
  }, Ig);
}
function Pg(t) {
  return t;
}
function Qv(t, e, r) {
  switch (r.length) {
    case 0:
      return t.call(e);
    case 1:
      return t.call(e, r[0]);
    case 2:
      return t.call(e, r[0], r[1]);
    case 3:
      return t.call(e, r[0], r[1], r[2]);
  }
  return t.apply(e, r);
}
var xu = Math.max;
function Jv(t, e, r) {
  return e = xu(e === void 0 ? t.length - 1 : e, 0), function() {
    for (var i = arguments, n = -1, s = xu(i.length - e, 0), a = Array(s); ++n < s; )
      a[n] = i[e + n];
    n = -1;
    for (var o = Array(e + 1); ++n < e; )
      o[n] = i[n];
    return o[e] = r(a), Qv(t, this, o);
  };
}
function tT(t) {
  return function() {
    return t;
  };
}
var eT = Ws ? function(t, e) {
  return Ws(t, "toString", {
    configurable: !0,
    enumerable: !1,
    value: tT(e),
    writable: !0
  });
} : Pg, rT = 800, iT = 16, nT = Date.now;
function sT(t) {
  var e = 0, r = 0;
  return function() {
    var i = nT(), n = iT - (i - r);
    if (r = i, n > 0) {
      if (++e >= rT)
        return arguments[0];
    } else
      e = 0;
    return t.apply(void 0, arguments);
  };
}
var aT = sT(eT);
function oT(t, e) {
  return aT(Jv(t, e, Pg), t + "");
}
function lT(t, e, r) {
  if (!qr(r))
    return !1;
  var i = typeof e;
  return (i == "number" ? ba(r) && Dg(e, r.length) : i == "string" && e in r) ? ga(r[e], t) : !1;
}
function cT(t) {
  return oT(function(e, r) {
    var i = -1, n = r.length, s = n > 1 ? r[n - 1] : void 0, a = n > 2 ? r[2] : void 0;
    for (s = t.length > 3 && typeof s == "function" ? (n--, s) : void 0, a && lT(r[0], r[1], a) && (s = n < 3 ? void 0 : s, n = 1), e = Object(e); ++i < n; ) {
      var o = r[i];
      o && t(e, o, i, s);
    }
    return e;
  });
}
var hT = cT(function(t, e, r) {
  Rg(t, e, r);
}), uT = "​", fT = {
  curveBasis: us,
  curveBasisClosed: p_,
  curveBasisOpen: g_,
  curveBumpX: kd,
  curveBumpY: Sd,
  curveBundle: m_,
  curveCardinalClosed: y_,
  curveCardinalOpen: x_,
  curveCardinal: Ld,
  curveCatmullRomClosed: b_,
  curveCatmullRomOpen: w_,
  curveCatmullRom: Bd,
  curveLinear: Bs,
  curveLinearClosed: C_,
  curveMonotoneX: Id,
  curveMonotoneY: Rd,
  curveNatural: Nd,
  curveStep: zd,
  curveStepAfter: qd,
  curveStepBefore: Wd
}, dT = /\s*(?:(\w+)(?=:):|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi, pT = /* @__PURE__ */ p(function(t, e) {
  const r = Ng(t, /(?:init\b)|(?:initialize\b)/);
  let i = {};
  if (Array.isArray(r)) {
    const a = r.map((o) => o.args);
    bs(a), i = $t(i, [...a]);
  } else
    i = r.args;
  if (!i)
    return;
  let n = Ll(t, e);
  const s = "config";
  return i[s] !== void 0 && (n === "flowchart-v2" && (n = "flowchart"), i[n] = i[s], delete i[s]), i;
}, "detectInit"), Ng = /* @__PURE__ */ p(function(t, e = null) {
  try {
    const r = new RegExp(
      `[%]{2}(?![{]${dT.source})(?=[}][%]{2}).*
`,
      "ig"
    );
    t = t.trim().replace(r, "").replace(/'/gm, '"'), R.debug(
      `Detecting diagram directive${e !== null ? " type:" + e : ""} based on the text:${t}`
    );
    let i;
    const n = [];
    for (; (i = en.exec(t)) !== null; )
      if (i.index === en.lastIndex && en.lastIndex++, i && !e || e && i[1]?.match(e) || e && i[2]?.match(e)) {
        const s = i[1] ? i[1] : i[2], a = i[3] ? i[3].trim() : i[4] ? JSON.parse(i[4].trim()) : null;
        n.push({ type: s, args: a });
      }
    return n.length === 0 ? { type: t, args: null } : n.length === 1 ? n[0] : n;
  } catch (r) {
    return R.error(
      `ERROR: ${r.message} - Unable to parse directive type: '${e}' based on the text: '${t}'`
    ), { type: void 0, args: null };
  }
}, "detectDirective"), gT = /* @__PURE__ */ p(function(t) {
  return t.replace(en, "");
}, "removeDirectives"), mT = /* @__PURE__ */ p(function(t, e) {
  for (const [r, i] of e.entries())
    if (i.match(t))
      return r;
  return -1;
}, "isSubstringInArray");
function sc(t, e) {
  if (!t)
    return e;
  const r = `curve${t.charAt(0).toUpperCase() + t.slice(1)}`;
  return fT[r] ?? e;
}
p(sc, "interpolateToCurve");
function zg(t, e) {
  const r = t.trim();
  if (r)
    return e.securityLevel !== "loose" ? Ik.sanitizeUrl(r) : r;
}
p(zg, "formatUrl");
var yT = /* @__PURE__ */ p((t, ...e) => {
  const r = t.split("."), i = r.length - 1, n = r[i];
  let s = window;
  for (let a = 0; a < i; a++)
    if (s = s[r[a]], !s) {
      R.error(`Function name: ${t} not found in window`);
      return;
    }
  s[n](...e);
}, "runFunc");
function ac(t, e) {
  return !t || !e ? 0 : Math.sqrt(Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2));
}
p(ac, "distance");
function Wg(t) {
  let e, r = 0;
  t.forEach((n) => {
    r += ac(n, e), e = n;
  });
  const i = r / 2;
  return oc(t, i);
}
p(Wg, "traverseEdge");
function qg(t) {
  return t.length === 1 ? t[0] : Wg(t);
}
p(qg, "calcLabelPosition");
var bu = /* @__PURE__ */ p((t, e = 2) => {
  const r = Math.pow(10, e);
  return Math.round(t * r) / r;
}, "roundNumber"), oc = /* @__PURE__ */ p((t, e) => {
  let r, i = e;
  for (const n of t) {
    if (r) {
      const s = ac(n, r);
      if (s === 0)
        return r;
      if (s < i)
        i -= s;
      else {
        const a = i / s;
        if (a <= 0)
          return r;
        if (a >= 1)
          return { x: n.x, y: n.y };
        if (a > 0 && a < 1)
          return {
            x: bu((1 - a) * r.x + a * n.x, 5),
            y: bu((1 - a) * r.y + a * n.y, 5)
          };
      }
    }
    r = n;
  }
  throw new Error("Could not find a suitable point for the given distance");
}, "calculatePoint"), xT = /* @__PURE__ */ p((t, e, r) => {
  R.info(`our points ${JSON.stringify(e)}`), e[0] !== r && (e = e.reverse());
  const n = oc(e, 25), s = t ? 10 : 5, a = Math.atan2(e[0].y - n.y, e[0].x - n.x), o = { x: 0, y: 0 };
  return o.x = Math.sin(a) * s + (e[0].x + n.x) / 2, o.y = -Math.cos(a) * s + (e[0].y + n.y) / 2, o;
}, "calcCardinalityPosition");
function Hg(t, e, r) {
  const i = structuredClone(r);
  R.info("our points", i), e !== "start_left" && e !== "start_right" && i.reverse();
  const n = 25 + t, s = oc(i, n), a = 10 + t * 0.5, o = Math.atan2(i[0].y - s.y, i[0].x - s.x), l = { x: 0, y: 0 };
  return e === "start_left" ? (l.x = Math.sin(o + Math.PI) * a + (i[0].x + s.x) / 2, l.y = -Math.cos(o + Math.PI) * a + (i[0].y + s.y) / 2) : e === "end_right" ? (l.x = Math.sin(o - Math.PI) * a + (i[0].x + s.x) / 2 - 5, l.y = -Math.cos(o - Math.PI) * a + (i[0].y + s.y) / 2 - 5) : e === "end_left" ? (l.x = Math.sin(o) * a + (i[0].x + s.x) / 2 - 5, l.y = -Math.cos(o) * a + (i[0].y + s.y) / 2 - 5) : (l.x = Math.sin(o) * a + (i[0].x + s.x) / 2, l.y = -Math.cos(o) * a + (i[0].y + s.y) / 2), l;
}
p(Hg, "calcTerminalLabelPosition");
function Yg(t) {
  let e = "", r = "";
  for (const i of t)
    i !== void 0 && (i.startsWith("color:") || i.startsWith("text-align:") ? r = r + i + ";" : e = e + i + ";");
  return { style: e, labelStyle: r };
}
p(Yg, "getStylesFromArray");
var wu = 0, bT = /* @__PURE__ */ p(() => (wu++, "id-" + Math.random().toString(36).substr(2, 12) + "-" + wu), "generateId");
function jg(t) {
  let e = "";
  const r = "0123456789abcdef", i = r.length;
  for (let n = 0; n < t; n++)
    e += r.charAt(Math.floor(Math.random() * i));
  return e;
}
p(jg, "makeRandomHex");
var wT = /* @__PURE__ */ p((t) => jg(t.length), "random"), CT = /* @__PURE__ */ p(function() {
  return {
    x: 0,
    y: 0,
    fill: void 0,
    anchor: "start",
    style: "#666",
    width: 100,
    height: 100,
    textMargin: 0,
    rx: 0,
    ry: 0,
    valign: void 0,
    text: ""
  };
}, "getTextObj"), _T = /* @__PURE__ */ p(function(t, e) {
  const r = e.text.replace(_i.lineBreakRegex, " "), [, i] = wa(e.fontSize), n = t.append("text");
  n.attr("x", e.x), n.attr("y", e.y), n.style("text-anchor", e.anchor), n.style("font-family", e.fontFamily), n.style("font-size", i), n.style("font-weight", e.fontWeight), n.attr("fill", e.fill), e.class !== void 0 && n.attr("class", e.class);
  const s = n.append("tspan");
  return s.attr("x", e.x + e.textMargin * 2), s.attr("fill", e.fill), s.text(r), n;
}, "drawSimpleText"), kT = An(
  (t, e, r) => {
    if (!t || (r = Object.assign(
      { fontSize: 12, fontWeight: 400, fontFamily: "Arial", joinWith: "<br/>" },
      r
    ), _i.lineBreakRegex.test(t)))
      return t;
    const i = t.split(" ").filter(Boolean), n = [];
    let s = "";
    return i.forEach((a, o) => {
      const l = Xe(`${a} `, r), c = Xe(s, r);
      if (l > e) {
        const { hyphenatedStrings: f, remainingWord: d } = ST(a, e, "-", r);
        n.push(s, ...f), s = d;
      } else c + l >= e ? (n.push(s), s = a) : s = [s, a].filter(Boolean).join(" ");
      o + 1 === i.length && n.push(s);
    }), n.filter((a) => a !== "").join(r.joinWith);
  },
  (t, e, r) => `${t}${e}${r.fontSize}${r.fontWeight}${r.fontFamily}${r.joinWith}`
), ST = An(
  (t, e, r = "-", i) => {
    i = Object.assign(
      { fontSize: 12, fontWeight: 400, fontFamily: "Arial", margin: 0 },
      i
    );
    const n = [...t], s = [];
    let a = "";
    return n.forEach((o, l) => {
      const c = `${a}${o}`;
      if (Xe(c, i) >= e) {
        const u = l + 1, f = n.length === u, d = `${c}${r}`;
        s.push(f ? c : d), a = "";
      } else
        a = c;
    }), { hyphenatedStrings: s, remainingWord: a };
  },
  (t, e, r = "-", i) => `${t}${e}${r}${i.fontSize}${i.fontWeight}${i.fontFamily}`
);
function Ug(t, e) {
  return lc(t, e).height;
}
p(Ug, "calculateTextHeight");
function Xe(t, e) {
  return lc(t, e).width;
}
p(Xe, "calculateTextWidth");
var lc = An(
  (t, e) => {
    const { fontSize: r = 12, fontFamily: i = "Arial", fontWeight: n = 400 } = e;
    if (!t)
      return { width: 0, height: 0 };
    const [, s] = wa(r), a = ["sans-serif", i], o = t.split(_i.lineBreakRegex), l = [], c = dt("body");
    if (!c.remove)
      return { width: 0, height: 0, lineHeight: 0 };
    const h = c.append("svg");
    for (const f of a) {
      let d = 0;
      const g = { width: 0, height: 0, lineHeight: 0 };
      for (const m of o) {
        const y = CT();
        y.text = m || uT;
        const x = _T(h, y).style("font-size", s).style("font-weight", n).style("font-family", f), b = (x._groups || x)[0][0].getBBox();
        if (b.width === 0 && b.height === 0)
          throw new Error("svg element not in render tree");
        g.width = Math.round(Math.max(g.width, b.width)), d = Math.round(b.height), g.height += d, g.lineHeight = Math.round(Math.max(g.lineHeight, d));
      }
      l.push(g);
    }
    h.remove();
    const u = isNaN(l[1].height) || isNaN(l[1].width) || isNaN(l[1].lineHeight) || l[0].height > l[1].height && l[0].width > l[1].width && l[0].lineHeight > l[1].lineHeight ? 0 : 1;
    return l[u];
  },
  (t, e) => `${t}${e.fontSize}${e.fontWeight}${e.fontFamily}`
), vT = class {
  constructor(t = !1, e) {
    this.count = 0, this.count = e ? e.length : 0, this.next = t ? () => this.count++ : () => Date.now();
  }
  static {
    p(this, "InitIDGenerator");
  }
}, Zn, TT = /* @__PURE__ */ p(function(t) {
  return Zn = Zn || document.createElement("div"), t = escape(t).replace(/%26/g, "&").replace(/%23/g, "#").replace(/%3B/g, ";"), Zn.innerHTML = t, unescape(Zn.textContent);
}, "entityDecode");
function cc(t) {
  return "str" in t;
}
p(cc, "isDetailedError");
var AT = /* @__PURE__ */ p((t, e, r, i) => {
  if (!i)
    return;
  const n = t.node()?.getBBox();
  n && t.append("text").text(i).attr("text-anchor", "middle").attr("x", n.x + n.width / 2).attr("y", -r).attr("class", e);
}, "insertTitle"), wa = /* @__PURE__ */ p((t) => {
  if (typeof t == "number")
    return [t, t + "px"];
  const e = parseInt(t ?? "", 10);
  return Number.isNaN(e) ? [void 0, void 0] : t === String(e) ? [e, t + "px"] : [e, t];
}, "parseFontSize");
function hc(t, e) {
  return hT({}, t, e);
}
p(hc, "cleanAndMerge");
var we = {
  assignWithDepth: $t,
  wrapLabel: kT,
  calculateTextHeight: Ug,
  calculateTextWidth: Xe,
  calculateTextDimensions: lc,
  cleanAndMerge: hc,
  detectInit: pT,
  detectDirective: Ng,
  isSubstringInArray: mT,
  interpolateToCurve: sc,
  calcLabelPosition: qg,
  calcCardinalityPosition: xT,
  calcTerminalLabelPosition: Hg,
  formatUrl: zg,
  getStylesFromArray: Yg,
  generateId: bT,
  random: wT,
  runFunc: yT,
  entityDecode: TT,
  insertTitle: AT,
  isLabelCoordinateInPath: Xg,
  parseFontSize: wa,
  InitIDGenerator: vT
}, LT = /* @__PURE__ */ p(function(t) {
  let e = t;
  return e = e.replace(/style.*:\S*#.*;/g, function(r) {
    return r.substring(0, r.length - 1);
  }), e = e.replace(/classDef.*:\S*#.*;/g, function(r) {
    return r.substring(0, r.length - 1);
  }), e = e.replace(/#\w+;/g, function(r) {
    const i = r.substring(1, r.length - 1);
    return /^\+?\d+$/.test(i) ? "ﬂ°°" + i + "¶ß" : "ﬂ°" + i + "¶ß";
  }), e;
}, "encodeEntities"), jr = /* @__PURE__ */ p(function(t) {
  return t.replace(/ﬂ°°/g, "&#").replace(/ﬂ°/g, "&").replace(/¶ß/g, ";");
}, "decodeEntities"), IF = /* @__PURE__ */ p((t, e, {
  counter: r = 0,
  prefix: i,
  suffix: n
}, s) => s || `${i ? `${i}_` : ""}${t}_${e}_${r}${n ? `_${n}` : ""}`, "getEdgeId");
function jt(t) {
  return t ?? null;
}
p(jt, "handleUndefinedAttr");
function Xg(t, e) {
  const r = Math.round(t.x), i = Math.round(t.y), n = e.replace(
    /(\d+\.\d+)/g,
    (s) => Math.round(parseFloat(s)).toString()
  );
  return n.includes(r.toString()) || n.includes(i.toString());
}
p(Xg, "isLabelCoordinateInPath");
const ET = Object.freeze({
  left: 0,
  top: 0,
  width: 16,
  height: 16
}), Ys = Object.freeze({
  rotate: 0,
  vFlip: !1,
  hFlip: !1
}), Gg = Object.freeze({
  ...ET,
  ...Ys
}), BT = Object.freeze({
  ...Gg,
  body: "",
  hidden: !1
}), MT = Object.freeze({
  width: null,
  height: null
}), $T = Object.freeze({
  ...MT,
  ...Ys
}), FT = (t, e, r, i = "") => {
  const n = t.split(":");
  if (t.slice(0, 1) === "@") {
    if (n.length < 2 || n.length > 3) return null;
    i = n.shift().slice(1);
  }
  if (n.length > 3 || !n.length) return null;
  if (n.length > 1) {
    const o = n.pop(), l = n.pop(), c = {
      provider: n.length > 0 ? n[0] : i,
      prefix: l,
      name: o
    };
    return ao(c) ? c : null;
  }
  const s = n[0], a = s.split("-");
  if (a.length > 1) {
    const o = {
      provider: i,
      prefix: a.shift(),
      name: a.join("-")
    };
    return ao(o) ? o : null;
  }
  if (r && i === "") {
    const o = {
      provider: i,
      prefix: "",
      name: s
    };
    return ao(o, r) ? o : null;
  }
  return null;
}, ao = (t, e) => t ? !!((e && t.prefix === "" || t.prefix) && t.name) : !1;
function OT(t, e) {
  const r = {};
  !t.hFlip != !e.hFlip && (r.hFlip = !0), !t.vFlip != !e.vFlip && (r.vFlip = !0);
  const i = ((t.rotate || 0) + (e.rotate || 0)) % 4;
  return i && (r.rotate = i), r;
}
function Cu(t, e) {
  const r = OT(t, e);
  for (const i in BT) i in Ys ? i in t && !(i in r) && (r[i] = Ys[i]) : i in e ? r[i] = e[i] : i in t && (r[i] = t[i]);
  return r;
}
function DT(t, e) {
  const r = t.icons, i = t.aliases || /* @__PURE__ */ Object.create(null), n = /* @__PURE__ */ Object.create(null);
  function s(a) {
    if (r[a]) return n[a] = [];
    if (!(a in n)) {
      n[a] = null;
      const o = i[a] && i[a].parent, l = o && s(o);
      l && (n[a] = [o].concat(l));
    }
    return n[a];
  }
  return (e || Object.keys(r).concat(Object.keys(i))).forEach(s), n;
}
function _u(t, e, r) {
  const i = t.icons, n = t.aliases || /* @__PURE__ */ Object.create(null);
  let s = {};
  function a(o) {
    s = Cu(i[o] || n[o], s);
  }
  return a(e), r.forEach(a), Cu(t, s);
}
function IT(t, e) {
  if (t.icons[e]) return _u(t, e, []);
  const r = DT(t, [e])[e];
  return r ? _u(t, e, r) : null;
}
const RT = /(-?[0-9.]*[0-9]+[0-9.]*)/g, PT = /^-?[0-9.]*[0-9]+[0-9.]*$/g;
function ku(t, e, r) {
  if (e === 1) return t;
  if (r = r || 100, typeof t == "number") return Math.ceil(t * e * r) / r;
  if (typeof t != "string") return t;
  const i = t.split(RT);
  if (i === null || !i.length) return t;
  const n = [];
  let s = i.shift(), a = PT.test(s);
  for (; ; ) {
    if (a) {
      const o = parseFloat(s);
      isNaN(o) ? n.push(s) : n.push(Math.ceil(o * e * r) / r);
    } else n.push(s);
    if (s = i.shift(), s === void 0) return n.join("");
    a = !a;
  }
}
function NT(t, e = "defs") {
  let r = "";
  const i = t.indexOf("<" + e);
  for (; i >= 0; ) {
    const n = t.indexOf(">", i), s = t.indexOf("</" + e);
    if (n === -1 || s === -1) break;
    const a = t.indexOf(">", s);
    if (a === -1) break;
    r += t.slice(n + 1, s).trim(), t = t.slice(0, i).trim() + t.slice(a + 1);
  }
  return {
    defs: r,
    content: t
  };
}
function zT(t, e) {
  return t ? "<defs>" + t + "</defs>" + e : e;
}
function WT(t, e, r) {
  const i = NT(t);
  return zT(i.defs, e + i.content + r);
}
const qT = (t) => t === "unset" || t === "undefined" || t === "none";
function HT(t, e) {
  const r = {
    ...Gg,
    ...t
  }, i = {
    ...$T,
    ...e
  }, n = {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height
  };
  let s = r.body;
  [r, i].forEach((m) => {
    const y = [], x = m.hFlip, b = m.vFlip;
    let C = m.rotate;
    x ? b ? C += 2 : (y.push("translate(" + (n.width + n.left).toString() + " " + (0 - n.top).toString() + ")"), y.push("scale(-1 1)"), n.top = n.left = 0) : b && (y.push("translate(" + (0 - n.left).toString() + " " + (n.height + n.top).toString() + ")"), y.push("scale(1 -1)"), n.top = n.left = 0);
    let k;
    switch (C < 0 && (C -= Math.floor(C / 4) * 4), C = C % 4, C) {
      case 1:
        k = n.height / 2 + n.top, y.unshift("rotate(90 " + k.toString() + " " + k.toString() + ")");
        break;
      case 2:
        y.unshift("rotate(180 " + (n.width / 2 + n.left).toString() + " " + (n.height / 2 + n.top).toString() + ")");
        break;
      case 3:
        k = n.width / 2 + n.left, y.unshift("rotate(-90 " + k.toString() + " " + k.toString() + ")");
    }
    C % 2 === 1 && (n.left !== n.top && (k = n.left, n.left = n.top, n.top = k), n.width !== n.height && (k = n.width, n.width = n.height, n.height = k)), y.length && (s = WT(s, '<g transform="' + y.join(" ") + '">', "</g>"));
  });
  const a = i.width, o = i.height, l = n.width, c = n.height;
  let h, u;
  a === null ? (u = o === null ? "1em" : o === "auto" ? c : o, h = ku(u, l / c)) : (h = a === "auto" ? l : a, u = o === null ? ku(h, c / l) : o === "auto" ? c : o);
  const f = {}, d = (m, y) => {
    qT(y) || (f[m] = y.toString());
  };
  d("width", h), d("height", u);
  const g = [
    n.left,
    n.top,
    l,
    c
  ];
  return f.viewBox = g.join(" "), {
    attributes: f,
    viewBox: g,
    body: s
  };
}
const YT = /\sid="(\S+)"/g, Su = /* @__PURE__ */ new Map();
function jT(t) {
  t = t.replace(/[0-9]+$/, "") || "a";
  const e = Su.get(t) || 0;
  return Su.set(t, e + 1), e ? `${t}${e}` : t;
}
function UT(t) {
  const e = [];
  let r;
  for (; r = YT.exec(t); ) e.push(r[1]);
  if (!e.length) return t;
  const i = "suffix" + (Math.random() * 16777216 | Date.now()).toString(16);
  return e.forEach((n) => {
    const s = jT(n), a = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp('([#;"])(' + a + ')([")]|\\.[a-z])', "g"), "$1" + s + i + "$3");
  }), t = t.replace(new RegExp(i, "g"), ""), t;
}
function XT(t, e) {
  let r = t.indexOf("xlink:") === -1 ? "" : ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  for (const i in e) r += " " + i + '="' + e[i] + '"';
  return '<svg xmlns="http://www.w3.org/2000/svg"' + r + ">" + t + "</svg>";
}
function uc() {
  return { async: !1, breaks: !1, extensions: null, gfm: !0, hooks: null, pedantic: !1, renderer: null, silent: !1, tokenizer: null, walkTokens: null };
}
var Ur = uc();
function Vg(t) {
  Ur = t;
}
var sn = { exec: () => null };
function mt(t, e = "") {
  let r = typeof t == "string" ? t : t.source, i = { replace: (n, s) => {
    let a = typeof s == "string" ? s : s.source;
    return a = a.replace(Zt.caret, "$1"), r = r.replace(n, a), i;
  }, getRegex: () => new RegExp(r, e) };
  return i;
}
var GT = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return !1;
  }
})(), Zt = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceTabs: /^\t+/, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] /, listReplaceTask: /^\[[ xX]\] +/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (t) => new RegExp(`^( {0,3}${t})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (t) => new RegExp(`^ {0,${Math.min(3, t - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (t) => new RegExp(`^ {0,${Math.min(3, t - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (t) => new RegExp(`^ {0,${Math.min(3, t - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (t) => new RegExp(`^ {0,${Math.min(3, t - 1)}}#`), htmlBeginRegex: (t) => new RegExp(`^ {0,${Math.min(3, t - 1)}}<(?:[a-z].*>|!--)`, "i") }, VT = /^(?:[ \t]*(?:\n|$))+/, KT = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, ZT = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, En = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, QT = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, fc = /(?:[*+-]|\d{1,9}[.)])/, Kg = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, Zg = mt(Kg).replace(/bull/g, fc).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), JT = mt(Kg).replace(/bull/g, fc).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), dc = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/, tA = /^[^\n]+/, pc = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, eA = mt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", pc).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), rA = mt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, fc).getRegex(), Ca = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", gc = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, iA = mt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", gc).replace("tag", Ca).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), Qg = mt(dc).replace("hr", En).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Ca).getRegex(), nA = mt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Qg).getRegex(), mc = { blockquote: nA, code: KT, def: eA, fences: ZT, heading: QT, hr: En, html: iA, lheading: Zg, list: rA, newline: VT, paragraph: Qg, table: sn, text: tA }, vu = mt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", En).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Ca).getRegex(), sA = { ...mc, lheading: JT, table: vu, paragraph: mt(dc).replace("hr", En).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", vu).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Ca).getRegex() }, aA = { ...mc, html: mt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", gc).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: sn, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: mt(dc).replace("hr", En).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", Zg).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() }, oA = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, lA = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, Jg = /^( {2,}|\\)\n(?!\s*$)/, cA = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, _a = /[\p{P}\p{S}]/u, yc = /[\s\p{P}\p{S}]/u, tm = /[^\s\p{P}\p{S}]/u, hA = mt(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, yc).getRegex(), em = /(?!~)[\p{P}\p{S}]/u, uA = /(?!~)[\s\p{P}\p{S}]/u, fA = /(?:[^\s\p{P}\p{S}]|~)/u, dA = mt(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", GT ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), rm = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/, pA = mt(rm, "u").replace(/punct/g, _a).getRegex(), gA = mt(rm, "u").replace(/punct/g, em).getRegex(), im = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", mA = mt(im, "gu").replace(/notPunctSpace/g, tm).replace(/punctSpace/g, yc).replace(/punct/g, _a).getRegex(), yA = mt(im, "gu").replace(/notPunctSpace/g, fA).replace(/punctSpace/g, uA).replace(/punct/g, em).getRegex(), xA = mt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, tm).replace(/punctSpace/g, yc).replace(/punct/g, _a).getRegex(), bA = mt(/\\(punct)/, "gu").replace(/punct/g, _a).getRegex(), wA = mt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), CA = mt(gc).replace("(?:-->|$)", "-->").getRegex(), _A = mt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", CA).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), js = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/, kA = mt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", js).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), nm = mt(/^!?\[(label)\]\[(ref)\]/).replace("label", js).replace("ref", pc).getRegex(), sm = mt(/^!?\[(ref)\](?:\[\])?/).replace("ref", pc).getRegex(), SA = mt("reflink|nolink(?!\\()", "g").replace("reflink", nm).replace("nolink", sm).getRegex(), Tu = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, xc = { _backpedal: sn, anyPunctuation: bA, autolink: wA, blockSkip: dA, br: Jg, code: lA, del: sn, emStrongLDelim: pA, emStrongRDelimAst: mA, emStrongRDelimUnd: xA, escape: oA, link: kA, nolink: sm, punctuation: hA, reflink: nm, reflinkSearch: SA, tag: _A, text: cA, url: sn }, vA = { ...xc, link: mt(/^!?\[(label)\]\((.*?)\)/).replace("label", js).getRegex(), reflink: mt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", js).getRegex() }, el = { ...xc, emStrongRDelimAst: yA, emStrongLDelim: gA, url: mt(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", Tu).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: mt(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", Tu).getRegex() }, TA = { ...el, br: mt(Jg).replace("{2,}", "*").getRegex(), text: mt(el.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() }, Qn = { normal: mc, gfm: sA, pedantic: aA }, Ri = { normal: xc, gfm: el, breaks: TA, pedantic: vA }, AA = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }, Au = (t) => AA[t];
function Me(t, e) {
  if (e) {
    if (Zt.escapeTest.test(t)) return t.replace(Zt.escapeReplace, Au);
  } else if (Zt.escapeTestNoEncode.test(t)) return t.replace(Zt.escapeReplaceNoEncode, Au);
  return t;
}
function Lu(t) {
  try {
    t = encodeURI(t).replace(Zt.percentDecode, "%");
  } catch {
    return null;
  }
  return t;
}
function Eu(t, e) {
  let r = t.replace(Zt.findPipe, (s, a, o) => {
    let l = !1, c = a;
    for (; --c >= 0 && o[c] === "\\"; ) l = !l;
    return l ? "|" : " |";
  }), i = r.split(Zt.splitPipe), n = 0;
  if (i[0].trim() || i.shift(), i.length > 0 && !i.at(-1)?.trim() && i.pop(), e) if (i.length > e) i.splice(e);
  else for (; i.length < e; ) i.push("");
  for (; n < i.length; n++) i[n] = i[n].trim().replace(Zt.slashPipe, "|");
  return i;
}
function Pi(t, e, r) {
  let i = t.length;
  if (i === 0) return "";
  let n = 0;
  for (; n < i && t.charAt(i - n - 1) === e; )
    n++;
  return t.slice(0, i - n);
}
function LA(t, e) {
  if (t.indexOf(e[1]) === -1) return -1;
  let r = 0;
  for (let i = 0; i < t.length; i++) if (t[i] === "\\") i++;
  else if (t[i] === e[0]) r++;
  else if (t[i] === e[1] && (r--, r < 0)) return i;
  return r > 0 ? -2 : -1;
}
function Bu(t, e, r, i, n) {
  let s = e.href, a = e.title || null, o = t[1].replace(n.other.outputLinkReplace, "$1");
  i.state.inLink = !0;
  let l = { type: t[0].charAt(0) === "!" ? "image" : "link", raw: r, href: s, title: a, text: o, tokens: i.inlineTokens(o) };
  return i.state.inLink = !1, l;
}
function EA(t, e, r) {
  let i = t.match(r.other.indentCodeCompensation);
  if (i === null) return e;
  let n = i[1];
  return e.split(`
`).map((s) => {
    let a = s.match(r.other.beginningSpace);
    if (a === null) return s;
    let [o] = a;
    return o.length >= n.length ? s.slice(n.length) : s;
  }).join(`
`);
}
var Us = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || Ur;
  }
  space(e) {
    let r = this.rules.block.newline.exec(e);
    if (r && r[0].length > 0) return { type: "space", raw: r[0] };
  }
  code(e) {
    let r = this.rules.block.code.exec(e);
    if (r) {
      let i = r[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: r[0], codeBlockStyle: "indented", text: this.options.pedantic ? i : Pi(i, `
`) };
    }
  }
  fences(e) {
    let r = this.rules.block.fences.exec(e);
    if (r) {
      let i = r[0], n = EA(i, r[3] || "", this.rules);
      return { type: "code", raw: i, lang: r[2] ? r[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : r[2], text: n };
    }
  }
  heading(e) {
    let r = this.rules.block.heading.exec(e);
    if (r) {
      let i = r[2].trim();
      if (this.rules.other.endingHash.test(i)) {
        let n = Pi(i, "#");
        (this.options.pedantic || !n || this.rules.other.endingSpaceChar.test(n)) && (i = n.trim());
      }
      return { type: "heading", raw: r[0], depth: r[1].length, text: i, tokens: this.lexer.inline(i) };
    }
  }
  hr(e) {
    let r = this.rules.block.hr.exec(e);
    if (r) return { type: "hr", raw: Pi(r[0], `
`) };
  }
  blockquote(e) {
    let r = this.rules.block.blockquote.exec(e);
    if (r) {
      let i = Pi(r[0], `
`).split(`
`), n = "", s = "", a = [];
      for (; i.length > 0; ) {
        let o = !1, l = [], c;
        for (c = 0; c < i.length; c++) if (this.rules.other.blockquoteStart.test(i[c])) l.push(i[c]), o = !0;
        else if (!o) l.push(i[c]);
        else break;
        i = i.slice(c);
        let h = l.join(`
`), u = h.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        n = n ? `${n}
${h}` : h, s = s ? `${s}
${u}` : u;
        let f = this.lexer.state.top;
        if (this.lexer.state.top = !0, this.lexer.blockTokens(u, a, !0), this.lexer.state.top = f, i.length === 0) break;
        let d = a.at(-1);
        if (d?.type === "code") break;
        if (d?.type === "blockquote") {
          let g = d, m = g.raw + `
` + i.join(`
`), y = this.blockquote(m);
          a[a.length - 1] = y, n = n.substring(0, n.length - g.raw.length) + y.raw, s = s.substring(0, s.length - g.text.length) + y.text;
          break;
        } else if (d?.type === "list") {
          let g = d, m = g.raw + `
` + i.join(`
`), y = this.list(m);
          a[a.length - 1] = y, n = n.substring(0, n.length - d.raw.length) + y.raw, s = s.substring(0, s.length - g.raw.length) + y.raw, i = m.substring(a.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: n, tokens: a, text: s };
    }
  }
  list(e) {
    let r = this.rules.block.list.exec(e);
    if (r) {
      let i = r[1].trim(), n = i.length > 1, s = { type: "list", raw: "", ordered: n, start: n ? +i.slice(0, -1) : "", loose: !1, items: [] };
      i = n ? `\\d{1,9}\\${i.slice(-1)}` : `\\${i}`, this.options.pedantic && (i = n ? i : "[*+-]");
      let a = this.rules.other.listItemRegex(i), o = !1;
      for (; e; ) {
        let c = !1, h = "", u = "";
        if (!(r = a.exec(e)) || this.rules.block.hr.test(e)) break;
        h = r[0], e = e.substring(h.length);
        let f = r[2].split(`
`, 1)[0].replace(this.rules.other.listReplaceTabs, (b) => " ".repeat(3 * b.length)), d = e.split(`
`, 1)[0], g = !f.trim(), m = 0;
        if (this.options.pedantic ? (m = 2, u = f.trimStart()) : g ? m = r[1].length + 1 : (m = r[2].search(this.rules.other.nonSpaceChar), m = m > 4 ? 1 : m, u = f.slice(m), m += r[1].length), g && this.rules.other.blankLine.test(d) && (h += d + `
`, e = e.substring(d.length + 1), c = !0), !c) {
          let b = this.rules.other.nextBulletRegex(m), C = this.rules.other.hrRegex(m), k = this.rules.other.fencesBeginRegex(m), _ = this.rules.other.headingBeginRegex(m), E = this.rules.other.htmlBeginRegex(m);
          for (; e; ) {
            let B = e.split(`
`, 1)[0], S;
            if (d = B, this.options.pedantic ? (d = d.replace(this.rules.other.listReplaceNesting, "  "), S = d) : S = d.replace(this.rules.other.tabCharGlobal, "    "), k.test(d) || _.test(d) || E.test(d) || b.test(d) || C.test(d)) break;
            if (S.search(this.rules.other.nonSpaceChar) >= m || !d.trim()) u += `
` + S.slice(m);
            else {
              if (g || f.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || k.test(f) || _.test(f) || C.test(f)) break;
              u += `
` + d;
            }
            !g && !d.trim() && (g = !0), h += B + `
`, e = e.substring(B.length + 1), f = S.slice(m);
          }
        }
        s.loose || (o ? s.loose = !0 : this.rules.other.doubleBlankLine.test(h) && (o = !0));
        let y = null, x;
        this.options.gfm && (y = this.rules.other.listIsTask.exec(u), y && (x = y[0] !== "[ ] ", u = u.replace(this.rules.other.listReplaceTask, ""))), s.items.push({ type: "list_item", raw: h, task: !!y, checked: x, loose: !1, text: u, tokens: [] }), s.raw += h;
      }
      let l = s.items.at(-1);
      if (l) l.raw = l.raw.trimEnd(), l.text = l.text.trimEnd();
      else return;
      s.raw = s.raw.trimEnd();
      for (let c = 0; c < s.items.length; c++) if (this.lexer.state.top = !1, s.items[c].tokens = this.lexer.blockTokens(s.items[c].text, []), !s.loose) {
        let h = s.items[c].tokens.filter((f) => f.type === "space"), u = h.length > 0 && h.some((f) => this.rules.other.anyLine.test(f.raw));
        s.loose = u;
      }
      if (s.loose) for (let c = 0; c < s.items.length; c++) s.items[c].loose = !0;
      return s;
    }
  }
  html(e) {
    let r = this.rules.block.html.exec(e);
    if (r) return { type: "html", block: !0, raw: r[0], pre: r[1] === "pre" || r[1] === "script" || r[1] === "style", text: r[0] };
  }
  def(e) {
    let r = this.rules.block.def.exec(e);
    if (r) {
      let i = r[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), n = r[2] ? r[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", s = r[3] ? r[3].substring(1, r[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : r[3];
      return { type: "def", tag: i, raw: r[0], href: n, title: s };
    }
  }
  table(e) {
    let r = this.rules.block.table.exec(e);
    if (!r || !this.rules.other.tableDelimiter.test(r[2])) return;
    let i = Eu(r[1]), n = r[2].replace(this.rules.other.tableAlignChars, "").split("|"), s = r[3]?.trim() ? r[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], a = { type: "table", raw: r[0], header: [], align: [], rows: [] };
    if (i.length === n.length) {
      for (let o of n) this.rules.other.tableAlignRight.test(o) ? a.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? a.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? a.align.push("left") : a.align.push(null);
      for (let o = 0; o < i.length; o++) a.header.push({ text: i[o], tokens: this.lexer.inline(i[o]), header: !0, align: a.align[o] });
      for (let o of s) a.rows.push(Eu(o, a.header.length).map((l, c) => ({ text: l, tokens: this.lexer.inline(l), header: !1, align: a.align[c] })));
      return a;
    }
  }
  lheading(e) {
    let r = this.rules.block.lheading.exec(e);
    if (r) return { type: "heading", raw: r[0], depth: r[2].charAt(0) === "=" ? 1 : 2, text: r[1], tokens: this.lexer.inline(r[1]) };
  }
  paragraph(e) {
    let r = this.rules.block.paragraph.exec(e);
    if (r) {
      let i = r[1].charAt(r[1].length - 1) === `
` ? r[1].slice(0, -1) : r[1];
      return { type: "paragraph", raw: r[0], text: i, tokens: this.lexer.inline(i) };
    }
  }
  text(e) {
    let r = this.rules.block.text.exec(e);
    if (r) return { type: "text", raw: r[0], text: r[0], tokens: this.lexer.inline(r[0]) };
  }
  escape(e) {
    let r = this.rules.inline.escape.exec(e);
    if (r) return { type: "escape", raw: r[0], text: r[1] };
  }
  tag(e) {
    let r = this.rules.inline.tag.exec(e);
    if (r) return !this.lexer.state.inLink && this.rules.other.startATag.test(r[0]) ? this.lexer.state.inLink = !0 : this.lexer.state.inLink && this.rules.other.endATag.test(r[0]) && (this.lexer.state.inLink = !1), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(r[0]) ? this.lexer.state.inRawBlock = !0 : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(r[0]) && (this.lexer.state.inRawBlock = !1), { type: "html", raw: r[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: !1, text: r[0] };
  }
  link(e) {
    let r = this.rules.inline.link.exec(e);
    if (r) {
      let i = r[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(i)) {
        if (!this.rules.other.endAngleBracket.test(i)) return;
        let a = Pi(i.slice(0, -1), "\\");
        if ((i.length - a.length) % 2 === 0) return;
      } else {
        let a = LA(r[2], "()");
        if (a === -2) return;
        if (a > -1) {
          let o = (r[0].indexOf("!") === 0 ? 5 : 4) + r[1].length + a;
          r[2] = r[2].substring(0, a), r[0] = r[0].substring(0, o).trim(), r[3] = "";
        }
      }
      let n = r[2], s = "";
      if (this.options.pedantic) {
        let a = this.rules.other.pedanticHrefTitle.exec(n);
        a && (n = a[1], s = a[3]);
      } else s = r[3] ? r[3].slice(1, -1) : "";
      return n = n.trim(), this.rules.other.startAngleBracket.test(n) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(i) ? n = n.slice(1) : n = n.slice(1, -1)), Bu(r, { href: n && n.replace(this.rules.inline.anyPunctuation, "$1"), title: s && s.replace(this.rules.inline.anyPunctuation, "$1") }, r[0], this.lexer, this.rules);
    }
  }
  reflink(e, r) {
    let i;
    if ((i = this.rules.inline.reflink.exec(e)) || (i = this.rules.inline.nolink.exec(e))) {
      let n = (i[2] || i[1]).replace(this.rules.other.multipleSpaceGlobal, " "), s = r[n.toLowerCase()];
      if (!s) {
        let a = i[0].charAt(0);
        return { type: "text", raw: a, text: a };
      }
      return Bu(i, s, i[0], this.lexer, this.rules);
    }
  }
  emStrong(e, r, i = "") {
    let n = this.rules.inline.emStrongLDelim.exec(e);
    if (!(!n || n[3] && i.match(this.rules.other.unicodeAlphaNumeric)) && (!(n[1] || n[2]) || !i || this.rules.inline.punctuation.exec(i))) {
      let s = [...n[0]].length - 1, a, o, l = s, c = 0, h = n[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (h.lastIndex = 0, r = r.slice(-1 * e.length + s); (n = h.exec(r)) != null; ) {
        if (a = n[1] || n[2] || n[3] || n[4] || n[5] || n[6], !a) continue;
        if (o = [...a].length, n[3] || n[4]) {
          l += o;
          continue;
        } else if ((n[5] || n[6]) && s % 3 && !((s + o) % 3)) {
          c += o;
          continue;
        }
        if (l -= o, l > 0) continue;
        o = Math.min(o, o + l + c);
        let u = [...n[0]][0].length, f = e.slice(0, s + n.index + u + o);
        if (Math.min(s, o) % 2) {
          let g = f.slice(1, -1);
          return { type: "em", raw: f, text: g, tokens: this.lexer.inlineTokens(g) };
        }
        let d = f.slice(2, -2);
        return { type: "strong", raw: f, text: d, tokens: this.lexer.inlineTokens(d) };
      }
    }
  }
  codespan(e) {
    let r = this.rules.inline.code.exec(e);
    if (r) {
      let i = r[2].replace(this.rules.other.newLineCharGlobal, " "), n = this.rules.other.nonSpaceChar.test(i), s = this.rules.other.startingSpaceChar.test(i) && this.rules.other.endingSpaceChar.test(i);
      return n && s && (i = i.substring(1, i.length - 1)), { type: "codespan", raw: r[0], text: i };
    }
  }
  br(e) {
    let r = this.rules.inline.br.exec(e);
    if (r) return { type: "br", raw: r[0] };
  }
  del(e) {
    let r = this.rules.inline.del.exec(e);
    if (r) return { type: "del", raw: r[0], text: r[2], tokens: this.lexer.inlineTokens(r[2]) };
  }
  autolink(e) {
    let r = this.rules.inline.autolink.exec(e);
    if (r) {
      let i, n;
      return r[2] === "@" ? (i = r[1], n = "mailto:" + i) : (i = r[1], n = i), { type: "link", raw: r[0], text: i, href: n, tokens: [{ type: "text", raw: i, text: i }] };
    }
  }
  url(e) {
    let r;
    if (r = this.rules.inline.url.exec(e)) {
      let i, n;
      if (r[2] === "@") i = r[0], n = "mailto:" + i;
      else {
        let s;
        do
          s = r[0], r[0] = this.rules.inline._backpedal.exec(r[0])?.[0] ?? "";
        while (s !== r[0]);
        i = r[0], r[1] === "www." ? n = "http://" + r[0] : n = r[0];
      }
      return { type: "link", raw: r[0], text: i, href: n, tokens: [{ type: "text", raw: i, text: i }] };
    }
  }
  inlineText(e) {
    let r = this.rules.inline.text.exec(e);
    if (r) {
      let i = this.lexer.state.inRawBlock;
      return { type: "text", raw: r[0], text: r[0], escaped: i };
    }
  }
}, ye = class rl {
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || Ur, this.options.tokenizer = this.options.tokenizer || new Us(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: !1, inRawBlock: !1, top: !0 };
    let r = { other: Zt, block: Qn.normal, inline: Ri.normal };
    this.options.pedantic ? (r.block = Qn.pedantic, r.inline = Ri.pedantic) : this.options.gfm && (r.block = Qn.gfm, this.options.breaks ? r.inline = Ri.breaks : r.inline = Ri.gfm), this.tokenizer.rules = r;
  }
  static get rules() {
    return { block: Qn, inline: Ri };
  }
  static lex(e, r) {
    return new rl(r).lex(e);
  }
  static lexInline(e, r) {
    return new rl(r).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(Zt.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let r = 0; r < this.inlineQueue.length; r++) {
      let i = this.inlineQueue[r];
      this.inlineTokens(i.src, i.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, r = [], i = !1) {
    for (this.options.pedantic && (e = e.replace(Zt.tabCharGlobal, "    ").replace(Zt.spaceLine, "")); e; ) {
      let n;
      if (this.options.extensions?.block?.some((a) => (n = a.call({ lexer: this }, e, r)) ? (e = e.substring(n.raw.length), r.push(n), !0) : !1)) continue;
      if (n = this.tokenizer.space(e)) {
        e = e.substring(n.raw.length);
        let a = r.at(-1);
        n.raw.length === 1 && a !== void 0 ? a.raw += `
` : r.push(n);
        continue;
      }
      if (n = this.tokenizer.code(e)) {
        e = e.substring(n.raw.length);
        let a = r.at(-1);
        a?.type === "paragraph" || a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + n.raw, a.text += `
` + n.text, this.inlineQueue.at(-1).src = a.text) : r.push(n);
        continue;
      }
      if (n = this.tokenizer.fences(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.heading(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.hr(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.blockquote(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.list(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.html(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.def(e)) {
        e = e.substring(n.raw.length);
        let a = r.at(-1);
        a?.type === "paragraph" || a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + n.raw, a.text += `
` + n.raw, this.inlineQueue.at(-1).src = a.text) : this.tokens.links[n.tag] || (this.tokens.links[n.tag] = { href: n.href, title: n.title }, r.push(n));
        continue;
      }
      if (n = this.tokenizer.table(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      if (n = this.tokenizer.lheading(e)) {
        e = e.substring(n.raw.length), r.push(n);
        continue;
      }
      let s = e;
      if (this.options.extensions?.startBlock) {
        let a = 1 / 0, o = e.slice(1), l;
        this.options.extensions.startBlock.forEach((c) => {
          l = c.call({ lexer: this }, o), typeof l == "number" && l >= 0 && (a = Math.min(a, l));
        }), a < 1 / 0 && a >= 0 && (s = e.substring(0, a + 1));
      }
      if (this.state.top && (n = this.tokenizer.paragraph(s))) {
        let a = r.at(-1);
        i && a?.type === "paragraph" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + n.raw, a.text += `
` + n.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = a.text) : r.push(n), i = s.length !== e.length, e = e.substring(n.raw.length);
        continue;
      }
      if (n = this.tokenizer.text(e)) {
        e = e.substring(n.raw.length);
        let a = r.at(-1);
        a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + n.raw, a.text += `
` + n.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = a.text) : r.push(n);
        continue;
      }
      if (e) {
        let a = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(a);
          break;
        } else throw new Error(a);
      }
    }
    return this.state.top = !0, r;
  }
  inline(e, r = []) {
    return this.inlineQueue.push({ src: e, tokens: r }), r;
  }
  inlineTokens(e, r = []) {
    let i = e, n = null;
    if (this.tokens.links) {
      let l = Object.keys(this.tokens.links);
      if (l.length > 0) for (; (n = this.tokenizer.rules.inline.reflinkSearch.exec(i)) != null; ) l.includes(n[0].slice(n[0].lastIndexOf("[") + 1, -1)) && (i = i.slice(0, n.index) + "[" + "a".repeat(n[0].length - 2) + "]" + i.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (n = this.tokenizer.rules.inline.anyPunctuation.exec(i)) != null; ) i = i.slice(0, n.index) + "++" + i.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let s;
    for (; (n = this.tokenizer.rules.inline.blockSkip.exec(i)) != null; ) s = n[2] ? n[2].length : 0, i = i.slice(0, n.index + s) + "[" + "a".repeat(n[0].length - s - 2) + "]" + i.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    i = this.options.hooks?.emStrongMask?.call({ lexer: this }, i) ?? i;
    let a = !1, o = "";
    for (; e; ) {
      a || (o = ""), a = !1;
      let l;
      if (this.options.extensions?.inline?.some((h) => (l = h.call({ lexer: this }, e, r)) ? (e = e.substring(l.raw.length), r.push(l), !0) : !1)) continue;
      if (l = this.tokenizer.escape(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.tag(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.link(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(l.raw.length);
        let h = r.at(-1);
        l.type === "text" && h?.type === "text" ? (h.raw += l.raw, h.text += l.text) : r.push(l);
        continue;
      }
      if (l = this.tokenizer.emStrong(e, i, o)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.codespan(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.br(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.del(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (l = this.tokenizer.autolink(e)) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      if (!this.state.inLink && (l = this.tokenizer.url(e))) {
        e = e.substring(l.raw.length), r.push(l);
        continue;
      }
      let c = e;
      if (this.options.extensions?.startInline) {
        let h = 1 / 0, u = e.slice(1), f;
        this.options.extensions.startInline.forEach((d) => {
          f = d.call({ lexer: this }, u), typeof f == "number" && f >= 0 && (h = Math.min(h, f));
        }), h < 1 / 0 && h >= 0 && (c = e.substring(0, h + 1));
      }
      if (l = this.tokenizer.inlineText(c)) {
        e = e.substring(l.raw.length), l.raw.slice(-1) !== "_" && (o = l.raw.slice(-1)), a = !0;
        let h = r.at(-1);
        h?.type === "text" ? (h.raw += l.raw, h.text += l.text) : r.push(l);
        continue;
      }
      if (e) {
        let h = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(h);
          break;
        } else throw new Error(h);
      }
    }
    return r;
  }
}, Xs = class {
  options;
  parser;
  constructor(e) {
    this.options = e || Ur;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: r, escaped: i }) {
    let n = (r || "").match(Zt.notSpaceStart)?.[0], s = e.replace(Zt.endingNewline, "") + `
`;
    return n ? '<pre><code class="language-' + Me(n) + '">' + (i ? s : Me(s, !0)) + `</code></pre>
` : "<pre><code>" + (i ? s : Me(s, !0)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: r }) {
    return `<h${r}>${this.parser.parseInline(e)}</h${r}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let r = e.ordered, i = e.start, n = "";
    for (let o = 0; o < e.items.length; o++) {
      let l = e.items[o];
      n += this.listitem(l);
    }
    let s = r ? "ol" : "ul", a = r && i !== 1 ? ' start="' + i + '"' : "";
    return "<" + s + a + `>
` + n + "</" + s + `>
`;
  }
  listitem(e) {
    let r = "";
    if (e.task) {
      let i = this.checkbox({ checked: !!e.checked });
      e.loose ? e.tokens[0]?.type === "paragraph" ? (e.tokens[0].text = i + " " + e.tokens[0].text, e.tokens[0].tokens && e.tokens[0].tokens.length > 0 && e.tokens[0].tokens[0].type === "text" && (e.tokens[0].tokens[0].text = i + " " + Me(e.tokens[0].tokens[0].text), e.tokens[0].tokens[0].escaped = !0)) : e.tokens.unshift({ type: "text", raw: i + " ", text: i + " ", escaped: !0 }) : r += i + " ";
    }
    return r += this.parser.parse(e.tokens, !!e.loose), `<li>${r}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let r = "", i = "";
    for (let s = 0; s < e.header.length; s++) i += this.tablecell(e.header[s]);
    r += this.tablerow({ text: i });
    let n = "";
    for (let s = 0; s < e.rows.length; s++) {
      let a = e.rows[s];
      i = "";
      for (let o = 0; o < a.length; o++) i += this.tablecell(a[o]);
      n += this.tablerow({ text: i });
    }
    return n && (n = `<tbody>${n}</tbody>`), `<table>
<thead>
` + r + `</thead>
` + n + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let r = this.parser.parseInline(e.tokens), i = e.header ? "th" : "td";
    return (e.align ? `<${i} align="${e.align}">` : `<${i}>`) + r + `</${i}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${Me(e, !0)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: r, tokens: i }) {
    let n = this.parser.parseInline(i), s = Lu(e);
    if (s === null) return n;
    e = s;
    let a = '<a href="' + e + '"';
    return r && (a += ' title="' + Me(r) + '"'), a += ">" + n + "</a>", a;
  }
  image({ href: e, title: r, text: i, tokens: n }) {
    n && (i = this.parser.parseInline(n, this.parser.textRenderer));
    let s = Lu(e);
    if (s === null) return Me(i);
    e = s;
    let a = `<img src="${e}" alt="${i}"`;
    return r && (a += ` title="${Me(r)}"`), a += ">", a;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : Me(e.text);
  }
}, bc = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
}, xe = class il {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || Ur, this.options.renderer = this.options.renderer || new Xs(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new bc();
  }
  static parse(e, r) {
    return new il(r).parse(e);
  }
  static parseInline(e, r) {
    return new il(r).parseInline(e);
  }
  parse(e, r = !0) {
    let i = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let o = s, l = this.options.extensions.renderers[o.type].call({ parser: this }, o);
        if (l !== !1 || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(o.type)) {
          i += l || "";
          continue;
        }
      }
      let a = s;
      switch (a.type) {
        case "space": {
          i += this.renderer.space(a);
          continue;
        }
        case "hr": {
          i += this.renderer.hr(a);
          continue;
        }
        case "heading": {
          i += this.renderer.heading(a);
          continue;
        }
        case "code": {
          i += this.renderer.code(a);
          continue;
        }
        case "table": {
          i += this.renderer.table(a);
          continue;
        }
        case "blockquote": {
          i += this.renderer.blockquote(a);
          continue;
        }
        case "list": {
          i += this.renderer.list(a);
          continue;
        }
        case "html": {
          i += this.renderer.html(a);
          continue;
        }
        case "def": {
          i += this.renderer.def(a);
          continue;
        }
        case "paragraph": {
          i += this.renderer.paragraph(a);
          continue;
        }
        case "text": {
          let o = a, l = this.renderer.text(o);
          for (; n + 1 < e.length && e[n + 1].type === "text"; ) o = e[++n], l += `
` + this.renderer.text(o);
          r ? i += this.renderer.paragraph({ type: "paragraph", raw: l, text: l, tokens: [{ type: "text", raw: l, text: l, escaped: !0 }] }) : i += l;
          continue;
        }
        default: {
          let o = 'Token with "' + a.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return i;
  }
  parseInline(e, r = this.renderer) {
    let i = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let o = this.options.extensions.renderers[s.type].call({ parser: this }, s);
        if (o !== !1 || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(s.type)) {
          i += o || "";
          continue;
        }
      }
      let a = s;
      switch (a.type) {
        case "escape": {
          i += r.text(a);
          break;
        }
        case "html": {
          i += r.html(a);
          break;
        }
        case "link": {
          i += r.link(a);
          break;
        }
        case "image": {
          i += r.image(a);
          break;
        }
        case "strong": {
          i += r.strong(a);
          break;
        }
        case "em": {
          i += r.em(a);
          break;
        }
        case "codespan": {
          i += r.codespan(a);
          break;
        }
        case "br": {
          i += r.br(a);
          break;
        }
        case "del": {
          i += r.del(a);
          break;
        }
        case "text": {
          i += r.text(a);
          break;
        }
        default: {
          let o = 'Token with "' + a.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return i;
  }
}, Gi = class {
  options;
  block;
  constructor(e) {
    this.options = e || Ur;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer() {
    return this.block ? ye.lex : ye.lexInline;
  }
  provideParser() {
    return this.block ? xe.parse : xe.parseInline;
  }
}, BA = class {
  defaults = uc();
  options = this.setOptions;
  parse = this.parseMarkdown(!0);
  parseInline = this.parseMarkdown(!1);
  Parser = xe;
  Renderer = Xs;
  TextRenderer = bc;
  Lexer = ye;
  Tokenizer = Us;
  Hooks = Gi;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, r) {
    let i = [];
    for (let n of e) switch (i = i.concat(r.call(this, n)), n.type) {
      case "table": {
        let s = n;
        for (let a of s.header) i = i.concat(this.walkTokens(a.tokens, r));
        for (let a of s.rows) for (let o of a) i = i.concat(this.walkTokens(o.tokens, r));
        break;
      }
      case "list": {
        let s = n;
        i = i.concat(this.walkTokens(s.items, r));
        break;
      }
      default: {
        let s = n;
        this.defaults.extensions?.childTokens?.[s.type] ? this.defaults.extensions.childTokens[s.type].forEach((a) => {
          let o = s[a].flat(1 / 0);
          i = i.concat(this.walkTokens(o, r));
        }) : s.tokens && (i = i.concat(this.walkTokens(s.tokens, r)));
      }
    }
    return i;
  }
  use(...e) {
    let r = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((i) => {
      let n = { ...i };
      if (n.async = this.defaults.async || n.async || !1, i.extensions && (i.extensions.forEach((s) => {
        if (!s.name) throw new Error("extension name required");
        if ("renderer" in s) {
          let a = r.renderers[s.name];
          a ? r.renderers[s.name] = function(...o) {
            let l = s.renderer.apply(this, o);
            return l === !1 && (l = a.apply(this, o)), l;
          } : r.renderers[s.name] = s.renderer;
        }
        if ("tokenizer" in s) {
          if (!s.level || s.level !== "block" && s.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let a = r[s.level];
          a ? a.unshift(s.tokenizer) : r[s.level] = [s.tokenizer], s.start && (s.level === "block" ? r.startBlock ? r.startBlock.push(s.start) : r.startBlock = [s.start] : s.level === "inline" && (r.startInline ? r.startInline.push(s.start) : r.startInline = [s.start]));
        }
        "childTokens" in s && s.childTokens && (r.childTokens[s.name] = s.childTokens);
      }), n.extensions = r), i.renderer) {
        let s = this.defaults.renderer || new Xs(this.defaults);
        for (let a in i.renderer) {
          if (!(a in s)) throw new Error(`renderer '${a}' does not exist`);
          if (["options", "parser"].includes(a)) continue;
          let o = a, l = i.renderer[o], c = s[o];
          s[o] = (...h) => {
            let u = l.apply(s, h);
            return u === !1 && (u = c.apply(s, h)), u || "";
          };
        }
        n.renderer = s;
      }
      if (i.tokenizer) {
        let s = this.defaults.tokenizer || new Us(this.defaults);
        for (let a in i.tokenizer) {
          if (!(a in s)) throw new Error(`tokenizer '${a}' does not exist`);
          if (["options", "rules", "lexer"].includes(a)) continue;
          let o = a, l = i.tokenizer[o], c = s[o];
          s[o] = (...h) => {
            let u = l.apply(s, h);
            return u === !1 && (u = c.apply(s, h)), u;
          };
        }
        n.tokenizer = s;
      }
      if (i.hooks) {
        let s = this.defaults.hooks || new Gi();
        for (let a in i.hooks) {
          if (!(a in s)) throw new Error(`hook '${a}' does not exist`);
          if (["options", "block"].includes(a)) continue;
          let o = a, l = i.hooks[o], c = s[o];
          Gi.passThroughHooks.has(a) ? s[o] = (h) => {
            if (this.defaults.async && Gi.passThroughHooksRespectAsync.has(a)) return (async () => {
              let f = await l.call(s, h);
              return c.call(s, f);
            })();
            let u = l.call(s, h);
            return c.call(s, u);
          } : s[o] = (...h) => {
            if (this.defaults.async) return (async () => {
              let f = await l.apply(s, h);
              return f === !1 && (f = await c.apply(s, h)), f;
            })();
            let u = l.apply(s, h);
            return u === !1 && (u = c.apply(s, h)), u;
          };
        }
        n.hooks = s;
      }
      if (i.walkTokens) {
        let s = this.defaults.walkTokens, a = i.walkTokens;
        n.walkTokens = function(o) {
          let l = [];
          return l.push(a.call(this, o)), s && (l = l.concat(s.call(this, o))), l;
        };
      }
      this.defaults = { ...this.defaults, ...n };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, r) {
    return ye.lex(e, r ?? this.defaults);
  }
  parser(e, r) {
    return xe.parse(e, r ?? this.defaults);
  }
  parseMarkdown(e) {
    return (r, i) => {
      let n = { ...i }, s = { ...this.defaults, ...n }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === !0 && n.async === !1) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof r > "u" || r === null) return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof r != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(r) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(r) : r, l = await (s.hooks ? await s.hooks.provideLexer() : e ? ye.lex : ye.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(l) : l;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let h = await (s.hooks ? await s.hooks.provideParser() : e ? xe.parse : xe.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(h) : h;
      })().catch(a);
      try {
        s.hooks && (r = s.hooks.preprocess(r));
        let o = (s.hooks ? s.hooks.provideLexer() : e ? ye.lex : ye.lexInline)(r, s);
        s.hooks && (o = s.hooks.processAllTokens(o)), s.walkTokens && this.walkTokens(o, s.walkTokens);
        let l = (s.hooks ? s.hooks.provideParser() : e ? xe.parse : xe.parseInline)(o, s);
        return s.hooks && (l = s.hooks.postprocess(l)), l;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, r) {
    return (i) => {
      if (i.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let n = "<p>An error occurred:</p><pre>" + Me(i.message + "", !0) + "</pre>";
        return r ? Promise.resolve(n) : n;
      }
      if (r) return Promise.reject(i);
      throw i;
    };
  }
}, Nr = new BA();
function xt(t, e) {
  return Nr.parse(t, e);
}
xt.options = xt.setOptions = function(t) {
  return Nr.setOptions(t), xt.defaults = Nr.defaults, Vg(xt.defaults), xt;
};
xt.getDefaults = uc;
xt.defaults = Ur;
xt.use = function(...t) {
  return Nr.use(...t), xt.defaults = Nr.defaults, Vg(xt.defaults), xt;
};
xt.walkTokens = function(t, e) {
  return Nr.walkTokens(t, e);
};
xt.parseInline = Nr.parseInline;
xt.Parser = xe;
xt.parser = xe.parse;
xt.Renderer = Xs;
xt.TextRenderer = bc;
xt.Lexer = ye;
xt.lexer = ye.lex;
xt.Tokenizer = Us;
xt.Hooks = Gi;
xt.parse = xt;
xt.options;
xt.setOptions;
xt.use;
xt.walkTokens;
xt.parseInline;
xe.parse;
ye.lex;
function am(t) {
  for (var e = [], r = 1; r < arguments.length; r++)
    e[r - 1] = arguments[r];
  var i = Array.from(typeof t == "string" ? [t] : t);
  i[i.length - 1] = i[i.length - 1].replace(/\r?\n([\t ]*)$/, "");
  var n = i.reduce(function(o, l) {
    var c = l.match(/\n([\t ]+|(?!\s).)/g);
    return c ? o.concat(c.map(function(h) {
      var u, f;
      return (f = (u = h.match(/[\t ]/g)) === null || u === void 0 ? void 0 : u.length) !== null && f !== void 0 ? f : 0;
    })) : o;
  }, []);
  if (n.length) {
    var s = new RegExp(`
[	 ]{`.concat(Math.min.apply(Math, n), "}"), "g");
    i = i.map(function(o) {
      return o.replace(s, `
`);
    });
  }
  i[0] = i[0].replace(/^\r?\n/, "");
  var a = i[0];
  return e.forEach(function(o, l) {
    var c = a.match(/(?:^|\n)( *)$/), h = c ? c[1] : "", u = o;
    typeof o == "string" && o.includes(`
`) && (u = String(o).split(`
`).map(function(f, d) {
      return d === 0 ? f : "".concat(h).concat(f);
    }).join(`
`)), a += u + i[l + 1];
  }), a;
}
var MA = {
  body: '<g><rect width="80" height="80" style="fill: #087ebf; stroke-width: 0px;"/><text transform="translate(21.16 64.67)" style="fill: #fff; font-family: ArialMT, Arial; font-size: 67.75px;"><tspan x="0" y="0">?</tspan></text></g>',
  height: 80,
  width: 80
}, nl = /* @__PURE__ */ new Map(), om = /* @__PURE__ */ new Map(), $A = /* @__PURE__ */ p((t) => {
  for (const e of t) {
    if (!e.name)
      throw new Error(
        'Invalid icon loader. Must have a "name" property with non-empty string value.'
      );
    if (R.debug("Registering icon pack:", e.name), "loader" in e)
      om.set(e.name, e.loader);
    else if ("icons" in e)
      nl.set(e.name, e.icons);
    else
      throw R.error("Invalid icon loader:", e), new Error('Invalid icon loader. Must have either "icons" or "loader" property.');
  }
}, "registerIconPacks"), lm = /* @__PURE__ */ p(async (t, e) => {
  const r = FT(t, !0, e !== void 0);
  if (!r)
    throw new Error(`Invalid icon name: ${t}`);
  const i = r.prefix || e;
  if (!i)
    throw new Error(`Icon name must contain a prefix: ${t}`);
  let n = nl.get(i);
  if (!n) {
    const a = om.get(i);
    if (!a)
      throw new Error(`Icon set not found: ${r.prefix}`);
    try {
      n = { ...await a(), prefix: i }, nl.set(i, n);
    } catch (o) {
      throw R.error(o), new Error(`Failed to load icon set: ${r.prefix}`);
    }
  }
  const s = IT(n, r.name);
  if (!s)
    throw new Error(`Icon not found: ${t}`);
  return s;
}, "getRegisteredIconData"), FA = /* @__PURE__ */ p(async (t) => {
  try {
    return await lm(t), !0;
  } catch {
    return !1;
  }
}, "isIconAvailable"), Bn = /* @__PURE__ */ p(async (t, e, r) => {
  let i;
  try {
    i = await lm(t, e?.fallbackPrefix);
  } catch (a) {
    R.error(a), i = MA;
  }
  const n = HT(i, e), s = XT(UT(n.body), {
    ...n.attributes,
    ...r
  });
  return de(s, Ht());
}, "getIconSVG");
function cm(t, { markdownAutoWrap: e }) {
  const i = t.replace(/<br\/>/g, `
`).replace(/\n{2,}/g, `
`), n = am(i);
  return e === !1 ? n.replace(/ /g, "&nbsp;") : n;
}
p(cm, "preprocessMarkdown");
function hm(t, e = {}) {
  const r = cm(t, e), i = xt.lexer(r), n = [[]];
  let s = 0;
  function a(o, l = "normal") {
    o.type === "text" ? o.text.split(`
`).forEach((h, u) => {
      u !== 0 && (s++, n.push([])), h.split(" ").forEach((f) => {
        f = f.replace(/&#39;/g, "'"), f && n[s].push({ content: f, type: l });
      });
    }) : o.type === "strong" || o.type === "em" ? o.tokens.forEach((c) => {
      a(c, o.type);
    }) : o.type === "html" && n[s].push({ content: o.text, type: "normal" });
  }
  return p(a, "processNode"), i.forEach((o) => {
    o.type === "paragraph" ? o.tokens?.forEach((l) => {
      a(l);
    }) : o.type === "html" ? n[s].push({ content: o.text, type: "normal" }) : n[s].push({ content: o.raw, type: "normal" });
  }), n;
}
p(hm, "markdownToLines");
function um(t, { markdownAutoWrap: e } = {}) {
  const r = xt.lexer(t);
  function i(n) {
    return n.type === "text" ? e === !1 ? n.text.replace(/\n */g, "<br/>").replace(/ /g, "&nbsp;") : n.text.replace(/\n */g, "<br/>") : n.type === "strong" ? `<strong>${n.tokens?.map(i).join("")}</strong>` : n.type === "em" ? `<em>${n.tokens?.map(i).join("")}</em>` : n.type === "paragraph" ? `<p>${n.tokens?.map(i).join("")}</p>` : n.type === "space" ? "" : n.type === "html" ? `${n.text}` : n.type === "escape" ? n.text : (R.warn(`Unsupported markdown: ${n.type}`), n.raw);
  }
  return p(i, "output"), r.map(i).join("");
}
p(um, "markdownToHTML");
function fm(t) {
  return Intl.Segmenter ? [...new Intl.Segmenter().segment(t)].map((e) => e.segment) : [...t];
}
p(fm, "splitTextToChars");
function dm(t, e) {
  const r = fm(e.content);
  return wc(t, [], r, e.type);
}
p(dm, "splitWordToFitWidth");
function wc(t, e, r, i) {
  if (r.length === 0)
    return [
      { content: e.join(""), type: i },
      { content: "", type: i }
    ];
  const [n, ...s] = r, a = [...e, n];
  return t([{ content: a.join(""), type: i }]) ? wc(t, a, s, i) : (e.length === 0 && n && (e.push(n), r.shift()), [
    { content: e.join(""), type: i },
    { content: r.join(""), type: i }
  ]);
}
p(wc, "splitWordToFitWidthRecursion");
function pm(t, e) {
  if (t.some(({ content: r }) => r.includes(`
`)))
    throw new Error("splitLineToFitWidth does not support newlines in the line");
  return Gs(t, e);
}
p(pm, "splitLineToFitWidth");
function Gs(t, e, r = [], i = []) {
  if (t.length === 0)
    return i.length > 0 && r.push(i), r.length > 0 ? r : [];
  let n = "";
  t[0].content === " " && (n = " ", t.shift());
  const s = t.shift() ?? { content: " ", type: "normal" }, a = [...i];
  if (n !== "" && a.push({ content: n, type: "normal" }), a.push(s), e(a))
    return Gs(t, e, r, a);
  if (i.length > 0)
    r.push(i), t.unshift(s);
  else if (s.content) {
    const [o, l] = dm(e, s);
    r.push([o]), l.content && t.unshift(l);
  }
  return Gs(t, e, r);
}
p(Gs, "splitLineToFitWidthRecursion");
function sl(t, e) {
  e && t.attr("style", e);
}
p(sl, "applyStyle");
async function gm(t, e, r, i, n = !1, s = Ht()) {
  const a = t.append("foreignObject");
  a.attr("width", `${10 * r}px`), a.attr("height", `${10 * r}px`);
  const o = a.append("xhtml:div"), l = pi(e.label) ? await El(e.label.replace(_i.lineBreakRegex, `
`), s) : de(e.label, s), c = e.isNode ? "nodeLabel" : "edgeLabel", h = o.append("span");
  h.html(l), sl(h, e.labelStyle), h.attr("class", `${c} ${i}`), sl(o, e.labelStyle), o.style("display", "table-cell"), o.style("white-space", "nowrap"), o.style("line-height", "1.5"), o.style("max-width", r + "px"), o.style("text-align", "center"), o.attr("xmlns", "http://www.w3.org/1999/xhtml"), n && o.attr("class", "labelBkg");
  let u = o.node().getBoundingClientRect();
  return u.width === r && (o.style("display", "table"), o.style("white-space", "break-spaces"), o.style("width", r + "px"), u = o.node().getBoundingClientRect()), a.node();
}
p(gm, "addHtmlSpan");
function ka(t, e, r) {
  return t.append("tspan").attr("class", "text-outer-tspan").attr("x", 0).attr("y", e * r - 0.1 + "em").attr("dy", r + "em");
}
p(ka, "createTspan");
function mm(t, e, r) {
  const i = t.append("text"), n = ka(i, 1, e);
  Sa(n, r);
  const s = n.node().getComputedTextLength();
  return i.remove(), s;
}
p(mm, "computeWidthOfText");
function OA(t, e, r) {
  const i = t.append("text"), n = ka(i, 1, e);
  Sa(n, [{ content: r, type: "normal" }]);
  const s = n.node()?.getBoundingClientRect();
  return s && i.remove(), s;
}
p(OA, "computeDimensionOfText");
function ym(t, e, r, i = !1) {
  const s = e.append("g"), a = s.insert("rect").attr("class", "background").attr("style", "stroke: none"), o = s.append("text").attr("y", "-10.1");
  let l = 0;
  for (const c of r) {
    const h = /* @__PURE__ */ p((f) => mm(s, 1.1, f) <= t, "checkWidth"), u = h(c) ? [c] : pm(c, h);
    for (const f of u) {
      const d = ka(o, l, 1.1);
      Sa(d, f), l++;
    }
  }
  if (i) {
    const c = o.node().getBBox(), h = 2;
    return a.attr("x", c.x - h).attr("y", c.y - h).attr("width", c.width + 2 * h).attr("height", c.height + 2 * h), s.node();
  } else
    return o.node();
}
p(ym, "createFormattedText");
function Sa(t, e) {
  t.text(""), e.forEach((r, i) => {
    const n = t.append("tspan").attr("font-style", r.type === "em" ? "italic" : "normal").attr("class", "text-inner-tspan").attr("font-weight", r.type === "strong" ? "bold" : "normal");
    i === 0 ? n.text(r.content) : n.text(" " + r.content);
  });
}
p(Sa, "updateTextContentAndStyles");
async function xm(t, e = {}) {
  const r = [];
  t.replace(/(fa[bklrs]?):fa-([\w-]+)/g, (n, s, a) => (r.push(
    (async () => {
      const o = `${s}:${a}`;
      return await FA(o) ? await Bn(o, void 0, { class: "label-icon" }) : `<i class='${de(n, e).replace(":", " ")}'></i>`;
    })()
  ), n));
  const i = await Promise.all(r);
  return t.replace(/(fa[bklrs]?):fa-([\w-]+)/g, () => i.shift() ?? "");
}
p(xm, "replaceIconSubstring");
var fr = /* @__PURE__ */ p(async (t, e = "", {
  style: r = "",
  isTitle: i = !1,
  classes: n = "",
  useHtmlLabels: s = !0,
  isNode: a = !0,
  width: o = 200,
  addSvgBackground: l = !1
} = {}, c) => {
  if (R.debug(
    "XYZ createText",
    e,
    r,
    i,
    n,
    s,
    a,
    "addSvgBackground: ",
    l
  ), s) {
    const h = um(e, c), u = await xm(jr(h), c), f = e.replace(/\\\\/g, "\\"), d = {
      isNode: a,
      label: pi(e) ? f : u,
      labelStyle: r.replace("fill:", "color:")
    };
    return await gm(t, d, o, n, l, c);
  } else {
    const h = e.replace(/<br\s*\/?>/g, "<br/>"), u = hm(h.replace("<br>", "<br/>"), c), f = ym(
      o,
      t,
      u,
      e ? l : !1
    );
    if (a) {
      /stroke:/.exec(r) && (r = r.replace("stroke:", "lineColor:"));
      const d = r.replace(/stroke:[^;]+;?/g, "").replace(/stroke-width:[^;]+;?/g, "").replace(/fill:[^;]+;?/g, "").replace(/color:/g, "fill:");
      dt(f).attr("style", d);
    } else {
      const d = r.replace(/stroke:[^;]+;?/g, "").replace(/stroke-width:[^;]+;?/g, "").replace(/fill:[^;]+;?/g, "").replace(/background:/g, "fill:");
      dt(f).select("rect").attr("style", d.replace(/background:/g, "fill:"));
      const g = r.replace(/stroke:[^;]+;?/g, "").replace(/stroke-width:[^;]+;?/g, "").replace(/fill:[^;]+;?/g, "").replace(/color:/g, "fill:");
      dt(f).select("text").attr("style", g);
    }
    return f;
  }
}, "createText");
function oo(t, e, r) {
  if (t && t.length) {
    const [i, n] = e, s = Math.PI / 180 * r, a = Math.cos(s), o = Math.sin(s);
    for (const l of t) {
      const [c, h] = l;
      l[0] = (c - i) * a - (h - n) * o + i, l[1] = (c - i) * o + (h - n) * a + n;
    }
  }
}
function DA(t, e) {
  return t[0] === e[0] && t[1] === e[1];
}
function IA(t, e, r, i = 1) {
  const n = r, s = Math.max(e, 0.1), a = t[0] && t[0][0] && typeof t[0][0] == "number" ? [t] : t, o = [0, 0];
  if (n) for (const c of a) oo(c, o, n);
  const l = (function(c, h, u) {
    const f = [];
    for (const b of c) {
      const C = [...b];
      DA(C[0], C[C.length - 1]) || C.push([C[0][0], C[0][1]]), C.length > 2 && f.push(C);
    }
    const d = [];
    h = Math.max(h, 0.1);
    const g = [];
    for (const b of f) for (let C = 0; C < b.length - 1; C++) {
      const k = b[C], _ = b[C + 1];
      if (k[1] !== _[1]) {
        const E = Math.min(k[1], _[1]);
        g.push({ ymin: E, ymax: Math.max(k[1], _[1]), x: E === k[1] ? k[0] : _[0], islope: (_[0] - k[0]) / (_[1] - k[1]) });
      }
    }
    if (g.sort(((b, C) => b.ymin < C.ymin ? -1 : b.ymin > C.ymin ? 1 : b.x < C.x ? -1 : b.x > C.x ? 1 : b.ymax === C.ymax ? 0 : (b.ymax - C.ymax) / Math.abs(b.ymax - C.ymax))), !g.length) return d;
    let m = [], y = g[0].ymin, x = 0;
    for (; m.length || g.length; ) {
      if (g.length) {
        let b = -1;
        for (let C = 0; C < g.length && !(g[C].ymin > y); C++) b = C;
        g.splice(0, b + 1).forEach(((C) => {
          m.push({ s: y, edge: C });
        }));
      }
      if (m = m.filter(((b) => !(b.edge.ymax <= y))), m.sort(((b, C) => b.edge.x === C.edge.x ? 0 : (b.edge.x - C.edge.x) / Math.abs(b.edge.x - C.edge.x))), (u !== 1 || x % h == 0) && m.length > 1) for (let b = 0; b < m.length; b += 2) {
        const C = b + 1;
        if (C >= m.length) break;
        const k = m[b].edge, _ = m[C].edge;
        d.push([[Math.round(k.x), y], [Math.round(_.x), y]]);
      }
      y += u, m.forEach(((b) => {
        b.edge.x = b.edge.x + u * b.edge.islope;
      })), x++;
    }
    return d;
  })(a, s, i);
  if (n) {
    for (const c of a) oo(c, o, -n);
    (function(c, h, u) {
      const f = [];
      c.forEach(((d) => f.push(...d))), oo(f, h, u);
    })(l, o, -n);
  }
  return l;
}
function Mn(t, e) {
  var r;
  const i = e.hachureAngle + 90;
  let n = e.hachureGap;
  n < 0 && (n = 4 * e.strokeWidth), n = Math.round(Math.max(n, 0.1));
  let s = 1;
  return e.roughness >= 1 && (((r = e.randomizer) === null || r === void 0 ? void 0 : r.next()) || Math.random()) > 0.7 && (s = n), IA(t, n, i, s || 1);
}
class Cc {
  constructor(e) {
    this.helper = e;
  }
  fillPolygons(e, r) {
    return this._fillPolygons(e, r);
  }
  _fillPolygons(e, r) {
    const i = Mn(e, r);
    return { type: "fillSketch", ops: this.renderLines(i, r) };
  }
  renderLines(e, r) {
    const i = [];
    for (const n of e) i.push(...this.helper.doubleLineOps(n[0][0], n[0][1], n[1][0], n[1][1], r));
    return i;
  }
}
function va(t) {
  const e = t[0], r = t[1];
  return Math.sqrt(Math.pow(e[0] - r[0], 2) + Math.pow(e[1] - r[1], 2));
}
class RA extends Cc {
  fillPolygons(e, r) {
    let i = r.hachureGap;
    i < 0 && (i = 4 * r.strokeWidth), i = Math.max(i, 0.1);
    const n = Mn(e, Object.assign({}, r, { hachureGap: i })), s = Math.PI / 180 * r.hachureAngle, a = [], o = 0.5 * i * Math.cos(s), l = 0.5 * i * Math.sin(s);
    for (const [c, h] of n) va([c, h]) && a.push([[c[0] - o, c[1] + l], [...h]], [[c[0] + o, c[1] - l], [...h]]);
    return { type: "fillSketch", ops: this.renderLines(a, r) };
  }
}
class PA extends Cc {
  fillPolygons(e, r) {
    const i = this._fillPolygons(e, r), n = Object.assign({}, r, { hachureAngle: r.hachureAngle + 90 }), s = this._fillPolygons(e, n);
    return i.ops = i.ops.concat(s.ops), i;
  }
}
class NA {
  constructor(e) {
    this.helper = e;
  }
  fillPolygons(e, r) {
    const i = Mn(e, r = Object.assign({}, r, { hachureAngle: 0 }));
    return this.dotsOnLines(i, r);
  }
  dotsOnLines(e, r) {
    const i = [];
    let n = r.hachureGap;
    n < 0 && (n = 4 * r.strokeWidth), n = Math.max(n, 0.1);
    let s = r.fillWeight;
    s < 0 && (s = r.strokeWidth / 2);
    const a = n / 4;
    for (const o of e) {
      const l = va(o), c = l / n, h = Math.ceil(c) - 1, u = l - h * n, f = (o[0][0] + o[1][0]) / 2 - n / 4, d = Math.min(o[0][1], o[1][1]);
      for (let g = 0; g < h; g++) {
        const m = d + u + g * n, y = f - a + 2 * Math.random() * a, x = m - a + 2 * Math.random() * a, b = this.helper.ellipse(y, x, s, s, r);
        i.push(...b.ops);
      }
    }
    return { type: "fillSketch", ops: i };
  }
}
class zA {
  constructor(e) {
    this.helper = e;
  }
  fillPolygons(e, r) {
    const i = Mn(e, r);
    return { type: "fillSketch", ops: this.dashedLine(i, r) };
  }
  dashedLine(e, r) {
    const i = r.dashOffset < 0 ? r.hachureGap < 0 ? 4 * r.strokeWidth : r.hachureGap : r.dashOffset, n = r.dashGap < 0 ? r.hachureGap < 0 ? 4 * r.strokeWidth : r.hachureGap : r.dashGap, s = [];
    return e.forEach(((a) => {
      const o = va(a), l = Math.floor(o / (i + n)), c = (o + n - l * (i + n)) / 2;
      let h = a[0], u = a[1];
      h[0] > u[0] && (h = a[1], u = a[0]);
      const f = Math.atan((u[1] - h[1]) / (u[0] - h[0]));
      for (let d = 0; d < l; d++) {
        const g = d * (i + n), m = g + i, y = [h[0] + g * Math.cos(f) + c * Math.cos(f), h[1] + g * Math.sin(f) + c * Math.sin(f)], x = [h[0] + m * Math.cos(f) + c * Math.cos(f), h[1] + m * Math.sin(f) + c * Math.sin(f)];
        s.push(...this.helper.doubleLineOps(y[0], y[1], x[0], x[1], r));
      }
    })), s;
  }
}
class WA {
  constructor(e) {
    this.helper = e;
  }
  fillPolygons(e, r) {
    const i = r.hachureGap < 0 ? 4 * r.strokeWidth : r.hachureGap, n = r.zigzagOffset < 0 ? i : r.zigzagOffset, s = Mn(e, r = Object.assign({}, r, { hachureGap: i + n }));
    return { type: "fillSketch", ops: this.zigzagLines(s, n, r) };
  }
  zigzagLines(e, r, i) {
    const n = [];
    return e.forEach(((s) => {
      const a = va(s), o = Math.round(a / (2 * r));
      let l = s[0], c = s[1];
      l[0] > c[0] && (l = s[1], c = s[0]);
      const h = Math.atan((c[1] - l[1]) / (c[0] - l[0]));
      for (let u = 0; u < o; u++) {
        const f = 2 * u * r, d = 2 * (u + 1) * r, g = Math.sqrt(2 * Math.pow(r, 2)), m = [l[0] + f * Math.cos(h), l[1] + f * Math.sin(h)], y = [l[0] + d * Math.cos(h), l[1] + d * Math.sin(h)], x = [m[0] + g * Math.cos(h + Math.PI / 4), m[1] + g * Math.sin(h + Math.PI / 4)];
        n.push(...this.helper.doubleLineOps(m[0], m[1], x[0], x[1], i), ...this.helper.doubleLineOps(x[0], x[1], y[0], y[1], i));
      }
    })), n;
  }
}
const te = {};
class qA {
  constructor(e) {
    this.seed = e;
  }
  next() {
    return this.seed ? (2 ** 31 - 1 & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31 : Math.random();
  }
}
const HA = 0, lo = 1, Mu = 2, Jn = { A: 7, a: 7, C: 6, c: 6, H: 1, h: 1, L: 2, l: 2, M: 2, m: 2, Q: 4, q: 4, S: 4, s: 4, T: 2, t: 2, V: 1, v: 1, Z: 0, z: 0 };
function co(t, e) {
  return t.type === e;
}
function _c(t) {
  const e = [], r = (function(a) {
    const o = new Array();
    for (; a !== ""; ) if (a.match(/^([ \t\r\n,]+)/)) a = a.substr(RegExp.$1.length);
    else if (a.match(/^([aAcChHlLmMqQsStTvVzZ])/)) o[o.length] = { type: HA, text: RegExp.$1 }, a = a.substr(RegExp.$1.length);
    else {
      if (!a.match(/^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/)) return [];
      o[o.length] = { type: lo, text: `${parseFloat(RegExp.$1)}` }, a = a.substr(RegExp.$1.length);
    }
    return o[o.length] = { type: Mu, text: "" }, o;
  })(t);
  let i = "BOD", n = 0, s = r[n];
  for (; !co(s, Mu); ) {
    let a = 0;
    const o = [];
    if (i === "BOD") {
      if (s.text !== "M" && s.text !== "m") return _c("M0,0" + t);
      n++, a = Jn[s.text], i = s.text;
    } else co(s, lo) ? a = Jn[i] : (n++, a = Jn[s.text], i = s.text);
    if (!(n + a < r.length)) throw new Error("Path data ended short");
    for (let l = n; l < n + a; l++) {
      const c = r[l];
      if (!co(c, lo)) throw new Error("Param not a number: " + i + "," + c.text);
      o[o.length] = +c.text;
    }
    if (typeof Jn[i] != "number") throw new Error("Bad segment: " + i);
    {
      const l = { key: i, data: o };
      e.push(l), n += a, s = r[n], i === "M" && (i = "L"), i === "m" && (i = "l");
    }
  }
  return e;
}
function bm(t) {
  let e = 0, r = 0, i = 0, n = 0;
  const s = [];
  for (const { key: a, data: o } of t) switch (a) {
    case "M":
      s.push({ key: "M", data: [...o] }), [e, r] = o, [i, n] = o;
      break;
    case "m":
      e += o[0], r += o[1], s.push({ key: "M", data: [e, r] }), i = e, n = r;
      break;
    case "L":
      s.push({ key: "L", data: [...o] }), [e, r] = o;
      break;
    case "l":
      e += o[0], r += o[1], s.push({ key: "L", data: [e, r] });
      break;
    case "C":
      s.push({ key: "C", data: [...o] }), e = o[4], r = o[5];
      break;
    case "c": {
      const l = o.map(((c, h) => h % 2 ? c + r : c + e));
      s.push({ key: "C", data: l }), e = l[4], r = l[5];
      break;
    }
    case "Q":
      s.push({ key: "Q", data: [...o] }), e = o[2], r = o[3];
      break;
    case "q": {
      const l = o.map(((c, h) => h % 2 ? c + r : c + e));
      s.push({ key: "Q", data: l }), e = l[2], r = l[3];
      break;
    }
    case "A":
      s.push({ key: "A", data: [...o] }), e = o[5], r = o[6];
      break;
    case "a":
      e += o[5], r += o[6], s.push({ key: "A", data: [o[0], o[1], o[2], o[3], o[4], e, r] });
      break;
    case "H":
      s.push({ key: "H", data: [...o] }), e = o[0];
      break;
    case "h":
      e += o[0], s.push({ key: "H", data: [e] });
      break;
    case "V":
      s.push({ key: "V", data: [...o] }), r = o[0];
      break;
    case "v":
      r += o[0], s.push({ key: "V", data: [r] });
      break;
    case "S":
      s.push({ key: "S", data: [...o] }), e = o[2], r = o[3];
      break;
    case "s": {
      const l = o.map(((c, h) => h % 2 ? c + r : c + e));
      s.push({ key: "S", data: l }), e = l[2], r = l[3];
      break;
    }
    case "T":
      s.push({ key: "T", data: [...o] }), e = o[0], r = o[1];
      break;
    case "t":
      e += o[0], r += o[1], s.push({ key: "T", data: [e, r] });
      break;
    case "Z":
    case "z":
      s.push({ key: "Z", data: [] }), e = i, r = n;
  }
  return s;
}
function wm(t) {
  const e = [];
  let r = "", i = 0, n = 0, s = 0, a = 0, o = 0, l = 0;
  for (const { key: c, data: h } of t) {
    switch (c) {
      case "M":
        e.push({ key: "M", data: [...h] }), [i, n] = h, [s, a] = h;
        break;
      case "C":
        e.push({ key: "C", data: [...h] }), i = h[4], n = h[5], o = h[2], l = h[3];
        break;
      case "L":
        e.push({ key: "L", data: [...h] }), [i, n] = h;
        break;
      case "H":
        i = h[0], e.push({ key: "L", data: [i, n] });
        break;
      case "V":
        n = h[0], e.push({ key: "L", data: [i, n] });
        break;
      case "S": {
        let u = 0, f = 0;
        r === "C" || r === "S" ? (u = i + (i - o), f = n + (n - l)) : (u = i, f = n), e.push({ key: "C", data: [u, f, ...h] }), o = h[0], l = h[1], i = h[2], n = h[3];
        break;
      }
      case "T": {
        const [u, f] = h;
        let d = 0, g = 0;
        r === "Q" || r === "T" ? (d = i + (i - o), g = n + (n - l)) : (d = i, g = n);
        const m = i + 2 * (d - i) / 3, y = n + 2 * (g - n) / 3, x = u + 2 * (d - u) / 3, b = f + 2 * (g - f) / 3;
        e.push({ key: "C", data: [m, y, x, b, u, f] }), o = d, l = g, i = u, n = f;
        break;
      }
      case "Q": {
        const [u, f, d, g] = h, m = i + 2 * (u - i) / 3, y = n + 2 * (f - n) / 3, x = d + 2 * (u - d) / 3, b = g + 2 * (f - g) / 3;
        e.push({ key: "C", data: [m, y, x, b, d, g] }), o = u, l = f, i = d, n = g;
        break;
      }
      case "A": {
        const u = Math.abs(h[0]), f = Math.abs(h[1]), d = h[2], g = h[3], m = h[4], y = h[5], x = h[6];
        u === 0 || f === 0 ? (e.push({ key: "C", data: [i, n, y, x, y, x] }), i = y, n = x) : (i !== y || n !== x) && (Cm(i, n, y, x, u, f, d, g, m).forEach((function(b) {
          e.push({ key: "C", data: b });
        })), i = y, n = x);
        break;
      }
      case "Z":
        e.push({ key: "Z", data: [] }), i = s, n = a;
    }
    r = c;
  }
  return e;
}
function Ni(t, e, r) {
  return [t * Math.cos(r) - e * Math.sin(r), t * Math.sin(r) + e * Math.cos(r)];
}
function Cm(t, e, r, i, n, s, a, o, l, c) {
  const h = (u = a, Math.PI * u / 180);
  var u;
  let f = [], d = 0, g = 0, m = 0, y = 0;
  if (c) [d, g, m, y] = c;
  else {
    [t, e] = Ni(t, e, -h), [r, i] = Ni(r, i, -h);
    const N = (t - r) / 2, $ = (e - i) / 2;
    let F = N * N / (n * n) + $ * $ / (s * s);
    F > 1 && (F = Math.sqrt(F), n *= F, s *= F);
    const A = n * n, L = s * s, M = A * L - A * $ * $ - L * N * N, H = A * $ * $ + L * N * N, Y = (o === l ? -1 : 1) * Math.sqrt(Math.abs(M / H));
    m = Y * n * $ / s + (t + r) / 2, y = Y * -s * N / n + (e + i) / 2, d = Math.asin(parseFloat(((e - y) / s).toFixed(9))), g = Math.asin(parseFloat(((i - y) / s).toFixed(9))), t < m && (d = Math.PI - d), r < m && (g = Math.PI - g), d < 0 && (d = 2 * Math.PI + d), g < 0 && (g = 2 * Math.PI + g), l && d > g && (d -= 2 * Math.PI), !l && g > d && (g -= 2 * Math.PI);
  }
  let x = g - d;
  if (Math.abs(x) > 120 * Math.PI / 180) {
    const N = g, $ = r, F = i;
    g = l && g > d ? d + 120 * Math.PI / 180 * 1 : d + 120 * Math.PI / 180 * -1, f = Cm(r = m + n * Math.cos(g), i = y + s * Math.sin(g), $, F, n, s, a, 0, l, [g, N, m, y]);
  }
  x = g - d;
  const b = Math.cos(d), C = Math.sin(d), k = Math.cos(g), _ = Math.sin(g), E = Math.tan(x / 4), B = 4 / 3 * n * E, S = 4 / 3 * s * E, I = [t, e], O = [t + B * C, e - S * b], D = [r + B * _, i - S * k], W = [r, i];
  if (O[0] = 2 * I[0] - O[0], O[1] = 2 * I[1] - O[1], c) return [O, D, W].concat(f);
  {
    f = [O, D, W].concat(f);
    const N = [];
    for (let $ = 0; $ < f.length; $ += 3) {
      const F = Ni(f[$][0], f[$][1], h), A = Ni(f[$ + 1][0], f[$ + 1][1], h), L = Ni(f[$ + 2][0], f[$ + 2][1], h);
      N.push([F[0], F[1], A[0], A[1], L[0], L[1]]);
    }
    return N;
  }
}
const YA = { randOffset: function(t, e) {
  return ot(t, e);
}, randOffsetWithRange: function(t, e, r) {
  return Vs(t, e, r);
}, ellipse: function(t, e, r, i, n) {
  const s = km(r, i, n);
  return al(t, e, n, s).opset;
}, doubleLineOps: function(t, e, r, i, n) {
  return cr(t, e, r, i, n, !0);
} };
function _m(t, e, r, i, n) {
  return { type: "path", ops: cr(t, e, r, i, n) };
}
function ps(t, e, r) {
  const i = (t || []).length;
  if (i > 2) {
    const n = [];
    for (let s = 0; s < i - 1; s++) n.push(...cr(t[s][0], t[s][1], t[s + 1][0], t[s + 1][1], r));
    return e && n.push(...cr(t[i - 1][0], t[i - 1][1], t[0][0], t[0][1], r)), { type: "path", ops: n };
  }
  return i === 2 ? _m(t[0][0], t[0][1], t[1][0], t[1][1], r) : { type: "path", ops: [] };
}
function jA(t, e, r, i, n) {
  return (function(s, a) {
    return ps(s, !0, a);
  })([[t, e], [t + r, e], [t + r, e + i], [t, e + i]], n);
}
function $u(t, e) {
  if (t.length) {
    const r = typeof t[0][0] == "number" ? [t] : t, i = ts(r[0], 1 * (1 + 0.2 * e.roughness), e), n = e.disableMultiStroke ? [] : ts(r[0], 1.5 * (1 + 0.22 * e.roughness), Du(e));
    for (let s = 1; s < r.length; s++) {
      const a = r[s];
      if (a.length) {
        const o = ts(a, 1 * (1 + 0.2 * e.roughness), e), l = e.disableMultiStroke ? [] : ts(a, 1.5 * (1 + 0.22 * e.roughness), Du(e));
        for (const c of o) c.op !== "move" && i.push(c);
        for (const c of l) c.op !== "move" && n.push(c);
      }
    }
    return { type: "path", ops: i.concat(n) };
  }
  return { type: "path", ops: [] };
}
function km(t, e, r) {
  const i = Math.sqrt(2 * Math.PI * Math.sqrt((Math.pow(t / 2, 2) + Math.pow(e / 2, 2)) / 2)), n = Math.ceil(Math.max(r.curveStepCount, r.curveStepCount / Math.sqrt(200) * i)), s = 2 * Math.PI / n;
  let a = Math.abs(t / 2), o = Math.abs(e / 2);
  const l = 1 - r.curveFitting;
  return a += ot(a * l, r), o += ot(o * l, r), { increment: s, rx: a, ry: o };
}
function al(t, e, r, i) {
  const [n, s] = Iu(i.increment, t, e, i.rx, i.ry, 1, i.increment * Vs(0.1, Vs(0.4, 1, r), r), r);
  let a = Ks(n, null, r);
  if (!r.disableMultiStroke && r.roughness !== 0) {
    const [o] = Iu(i.increment, t, e, i.rx, i.ry, 1.5, 0, r), l = Ks(o, null, r);
    a = a.concat(l);
  }
  return { estimatedPoints: s, opset: { type: "path", ops: a } };
}
function Fu(t, e, r, i, n, s, a, o, l) {
  const c = t, h = e;
  let u = Math.abs(r / 2), f = Math.abs(i / 2);
  u += ot(0.01 * u, l), f += ot(0.01 * f, l);
  let d = n, g = s;
  for (; d < 0; ) d += 2 * Math.PI, g += 2 * Math.PI;
  g - d > 2 * Math.PI && (d = 0, g = 2 * Math.PI);
  const m = 2 * Math.PI / l.curveStepCount, y = Math.min(m / 2, (g - d) / 2), x = Ru(y, c, h, u, f, d, g, 1, l);
  if (!l.disableMultiStroke) {
    const b = Ru(y, c, h, u, f, d, g, 1.5, l);
    x.push(...b);
  }
  return a && (o ? x.push(...cr(c, h, c + u * Math.cos(d), h + f * Math.sin(d), l), ...cr(c, h, c + u * Math.cos(g), h + f * Math.sin(g), l)) : x.push({ op: "lineTo", data: [c, h] }, { op: "lineTo", data: [c + u * Math.cos(d), h + f * Math.sin(d)] })), { type: "path", ops: x };
}
function Ou(t, e) {
  const r = wm(bm(_c(t))), i = [];
  let n = [0, 0], s = [0, 0];
  for (const { key: a, data: o } of r) switch (a) {
    case "M":
      s = [o[0], o[1]], n = [o[0], o[1]];
      break;
    case "L":
      i.push(...cr(s[0], s[1], o[0], o[1], e)), s = [o[0], o[1]];
      break;
    case "C": {
      const [l, c, h, u, f, d] = o;
      i.push(...UA(l, c, h, u, f, d, s, e)), s = [f, d];
      break;
    }
    case "Z":
      i.push(...cr(s[0], s[1], n[0], n[1], e)), s = [n[0], n[1]];
  }
  return { type: "path", ops: i };
}
function ho(t, e) {
  const r = [];
  for (const i of t) if (i.length) {
    const n = e.maxRandomnessOffset || 0, s = i.length;
    if (s > 2) {
      r.push({ op: "move", data: [i[0][0] + ot(n, e), i[0][1] + ot(n, e)] });
      for (let a = 1; a < s; a++) r.push({ op: "lineTo", data: [i[a][0] + ot(n, e), i[a][1] + ot(n, e)] });
    }
  }
  return { type: "fillPath", ops: r };
}
function ei(t, e) {
  return (function(r, i) {
    let n = r.fillStyle || "hachure";
    if (!te[n]) switch (n) {
      case "zigzag":
        te[n] || (te[n] = new RA(i));
        break;
      case "cross-hatch":
        te[n] || (te[n] = new PA(i));
        break;
      case "dots":
        te[n] || (te[n] = new NA(i));
        break;
      case "dashed":
        te[n] || (te[n] = new zA(i));
        break;
      case "zigzag-line":
        te[n] || (te[n] = new WA(i));
        break;
      default:
        n = "hachure", te[n] || (te[n] = new Cc(i));
    }
    return te[n];
  })(e, YA).fillPolygons(t, e);
}
function Du(t) {
  const e = Object.assign({}, t);
  return e.randomizer = void 0, t.seed && (e.seed = t.seed + 1), e;
}
function Sm(t) {
  return t.randomizer || (t.randomizer = new qA(t.seed || 0)), t.randomizer.next();
}
function Vs(t, e, r, i = 1) {
  return r.roughness * i * (Sm(r) * (e - t) + t);
}
function ot(t, e, r = 1) {
  return Vs(-t, t, e, r);
}
function cr(t, e, r, i, n, s = !1) {
  const a = s ? n.disableMultiStrokeFill : n.disableMultiStroke, o = ol(t, e, r, i, n, !0, !1);
  if (a) return o;
  const l = ol(t, e, r, i, n, !0, !0);
  return o.concat(l);
}
function ol(t, e, r, i, n, s, a) {
  const o = Math.pow(t - r, 2) + Math.pow(e - i, 2), l = Math.sqrt(o);
  let c = 1;
  c = l < 200 ? 1 : l > 500 ? 0.4 : -16668e-7 * l + 1.233334;
  let h = n.maxRandomnessOffset || 0;
  h * h * 100 > o && (h = l / 10);
  const u = h / 2, f = 0.2 + 0.2 * Sm(n);
  let d = n.bowing * n.maxRandomnessOffset * (i - e) / 200, g = n.bowing * n.maxRandomnessOffset * (t - r) / 200;
  d = ot(d, n, c), g = ot(g, n, c);
  const m = [], y = () => ot(u, n, c), x = () => ot(h, n, c), b = n.preserveVertices;
  return a ? m.push({ op: "move", data: [t + (b ? 0 : y()), e + (b ? 0 : y())] }) : m.push({ op: "move", data: [t + (b ? 0 : ot(h, n, c)), e + (b ? 0 : ot(h, n, c))] }), a ? m.push({ op: "bcurveTo", data: [d + t + (r - t) * f + y(), g + e + (i - e) * f + y(), d + t + 2 * (r - t) * f + y(), g + e + 2 * (i - e) * f + y(), r + (b ? 0 : y()), i + (b ? 0 : y())] }) : m.push({ op: "bcurveTo", data: [d + t + (r - t) * f + x(), g + e + (i - e) * f + x(), d + t + 2 * (r - t) * f + x(), g + e + 2 * (i - e) * f + x(), r + (b ? 0 : x()), i + (b ? 0 : x())] }), m;
}
function ts(t, e, r) {
  if (!t.length) return [];
  const i = [];
  i.push([t[0][0] + ot(e, r), t[0][1] + ot(e, r)]), i.push([t[0][0] + ot(e, r), t[0][1] + ot(e, r)]);
  for (let n = 1; n < t.length; n++) i.push([t[n][0] + ot(e, r), t[n][1] + ot(e, r)]), n === t.length - 1 && i.push([t[n][0] + ot(e, r), t[n][1] + ot(e, r)]);
  return Ks(i, null, r);
}
function Ks(t, e, r) {
  const i = t.length, n = [];
  if (i > 3) {
    const s = [], a = 1 - r.curveTightness;
    n.push({ op: "move", data: [t[1][0], t[1][1]] });
    for (let o = 1; o + 2 < i; o++) {
      const l = t[o];
      s[0] = [l[0], l[1]], s[1] = [l[0] + (a * t[o + 1][0] - a * t[o - 1][0]) / 6, l[1] + (a * t[o + 1][1] - a * t[o - 1][1]) / 6], s[2] = [t[o + 1][0] + (a * t[o][0] - a * t[o + 2][0]) / 6, t[o + 1][1] + (a * t[o][1] - a * t[o + 2][1]) / 6], s[3] = [t[o + 1][0], t[o + 1][1]], n.push({ op: "bcurveTo", data: [s[1][0], s[1][1], s[2][0], s[2][1], s[3][0], s[3][1]] });
    }
  } else i === 3 ? (n.push({ op: "move", data: [t[1][0], t[1][1]] }), n.push({ op: "bcurveTo", data: [t[1][0], t[1][1], t[2][0], t[2][1], t[2][0], t[2][1]] })) : i === 2 && n.push(...ol(t[0][0], t[0][1], t[1][0], t[1][1], r, !0, !0));
  return n;
}
function Iu(t, e, r, i, n, s, a, o) {
  const l = [], c = [];
  if (o.roughness === 0) {
    t /= 4, c.push([e + i * Math.cos(-t), r + n * Math.sin(-t)]);
    for (let h = 0; h <= 2 * Math.PI; h += t) {
      const u = [e + i * Math.cos(h), r + n * Math.sin(h)];
      l.push(u), c.push(u);
    }
    c.push([e + i * Math.cos(0), r + n * Math.sin(0)]), c.push([e + i * Math.cos(t), r + n * Math.sin(t)]);
  } else {
    const h = ot(0.5, o) - Math.PI / 2;
    c.push([ot(s, o) + e + 0.9 * i * Math.cos(h - t), ot(s, o) + r + 0.9 * n * Math.sin(h - t)]);
    const u = 2 * Math.PI + h - 0.01;
    for (let f = h; f < u; f += t) {
      const d = [ot(s, o) + e + i * Math.cos(f), ot(s, o) + r + n * Math.sin(f)];
      l.push(d), c.push(d);
    }
    c.push([ot(s, o) + e + i * Math.cos(h + 2 * Math.PI + 0.5 * a), ot(s, o) + r + n * Math.sin(h + 2 * Math.PI + 0.5 * a)]), c.push([ot(s, o) + e + 0.98 * i * Math.cos(h + a), ot(s, o) + r + 0.98 * n * Math.sin(h + a)]), c.push([ot(s, o) + e + 0.9 * i * Math.cos(h + 0.5 * a), ot(s, o) + r + 0.9 * n * Math.sin(h + 0.5 * a)]);
  }
  return [c, l];
}
function Ru(t, e, r, i, n, s, a, o, l) {
  const c = s + ot(0.1, l), h = [];
  h.push([ot(o, l) + e + 0.9 * i * Math.cos(c - t), ot(o, l) + r + 0.9 * n * Math.sin(c - t)]);
  for (let u = c; u <= a; u += t) h.push([ot(o, l) + e + i * Math.cos(u), ot(o, l) + r + n * Math.sin(u)]);
  return h.push([e + i * Math.cos(a), r + n * Math.sin(a)]), h.push([e + i * Math.cos(a), r + n * Math.sin(a)]), Ks(h, null, l);
}
function UA(t, e, r, i, n, s, a, o) {
  const l = [], c = [o.maxRandomnessOffset || 1, (o.maxRandomnessOffset || 1) + 0.3];
  let h = [0, 0];
  const u = o.disableMultiStroke ? 1 : 2, f = o.preserveVertices;
  for (let d = 0; d < u; d++) d === 0 ? l.push({ op: "move", data: [a[0], a[1]] }) : l.push({ op: "move", data: [a[0] + (f ? 0 : ot(c[0], o)), a[1] + (f ? 0 : ot(c[0], o))] }), h = f ? [n, s] : [n + ot(c[d], o), s + ot(c[d], o)], l.push({ op: "bcurveTo", data: [t + ot(c[d], o), e + ot(c[d], o), r + ot(c[d], o), i + ot(c[d], o), h[0], h[1]] });
  return l;
}
function zi(t) {
  return [...t];
}
function Pu(t, e = 0) {
  const r = t.length;
  if (r < 3) throw new Error("A curve must have at least three points.");
  const i = [];
  if (r === 3) i.push(zi(t[0]), zi(t[1]), zi(t[2]), zi(t[2]));
  else {
    const n = [];
    n.push(t[0], t[0]);
    for (let o = 1; o < t.length; o++) n.push(t[o]), o === t.length - 1 && n.push(t[o]);
    const s = [], a = 1 - e;
    i.push(zi(n[0]));
    for (let o = 1; o + 2 < n.length; o++) {
      const l = n[o];
      s[0] = [l[0], l[1]], s[1] = [l[0] + (a * n[o + 1][0] - a * n[o - 1][0]) / 6, l[1] + (a * n[o + 1][1] - a * n[o - 1][1]) / 6], s[2] = [n[o + 1][0] + (a * n[o][0] - a * n[o + 2][0]) / 6, n[o + 1][1] + (a * n[o][1] - a * n[o + 2][1]) / 6], s[3] = [n[o + 1][0], n[o + 1][1]], i.push(s[1], s[2], s[3]);
    }
  }
  return i;
}
function gs(t, e) {
  return Math.pow(t[0] - e[0], 2) + Math.pow(t[1] - e[1], 2);
}
function XA(t, e, r) {
  const i = gs(e, r);
  if (i === 0) return gs(t, e);
  let n = ((t[0] - e[0]) * (r[0] - e[0]) + (t[1] - e[1]) * (r[1] - e[1])) / i;
  return n = Math.max(0, Math.min(1, n)), gs(t, kr(e, r, n));
}
function kr(t, e, r) {
  return [t[0] + (e[0] - t[0]) * r, t[1] + (e[1] - t[1]) * r];
}
function ll(t, e, r, i) {
  const n = i || [];
  if ((function(o, l) {
    const c = o[l + 0], h = o[l + 1], u = o[l + 2], f = o[l + 3];
    let d = 3 * h[0] - 2 * c[0] - f[0];
    d *= d;
    let g = 3 * h[1] - 2 * c[1] - f[1];
    g *= g;
    let m = 3 * u[0] - 2 * f[0] - c[0];
    m *= m;
    let y = 3 * u[1] - 2 * f[1] - c[1];
    return y *= y, d < m && (d = m), g < y && (g = y), d + g;
  })(t, e) < r) {
    const o = t[e + 0];
    n.length ? (s = n[n.length - 1], a = o, Math.sqrt(gs(s, a)) > 1 && n.push(o)) : n.push(o), n.push(t[e + 3]);
  } else {
    const l = t[e + 0], c = t[e + 1], h = t[e + 2], u = t[e + 3], f = kr(l, c, 0.5), d = kr(c, h, 0.5), g = kr(h, u, 0.5), m = kr(f, d, 0.5), y = kr(d, g, 0.5), x = kr(m, y, 0.5);
    ll([l, f, m, x], 0, r, n), ll([x, y, g, u], 0, r, n);
  }
  var s, a;
  return n;
}
function GA(t, e) {
  return Zs(t, 0, t.length, e);
}
function Zs(t, e, r, i, n) {
  const s = n || [], a = t[e], o = t[r - 1];
  let l = 0, c = 1;
  for (let h = e + 1; h < r - 1; ++h) {
    const u = XA(t[h], a, o);
    u > l && (l = u, c = h);
  }
  return Math.sqrt(l) > i ? (Zs(t, e, c + 1, i, s), Zs(t, c, r, i, s)) : (s.length || s.push(a), s.push(o)), s;
}
function uo(t, e = 0.15, r) {
  const i = [], n = (t.length - 1) / 3;
  for (let s = 0; s < n; s++)
    ll(t, 3 * s, e, i);
  return r && r > 0 ? Zs(i, 0, i.length, r) : i;
}
const oe = "none";
class Qs {
  constructor(e) {
    this.defaultOptions = { maxRandomnessOffset: 2, roughness: 1, bowing: 1, stroke: "#000", strokeWidth: 1, curveTightness: 0, curveFitting: 0.95, curveStepCount: 9, fillStyle: "hachure", fillWeight: -1, hachureAngle: -41, hachureGap: -1, dashOffset: -1, dashGap: -1, zigzagOffset: -1, seed: 0, disableMultiStroke: !1, disableMultiStrokeFill: !1, preserveVertices: !1, fillShapeRoughnessGain: 0.8 }, this.config = e || {}, this.config.options && (this.defaultOptions = this._o(this.config.options));
  }
  static newSeed() {
    return Math.floor(Math.random() * 2 ** 31);
  }
  _o(e) {
    return e ? Object.assign({}, this.defaultOptions, e) : this.defaultOptions;
  }
  _d(e, r, i) {
    return { shape: e, sets: r || [], options: i || this.defaultOptions };
  }
  line(e, r, i, n, s) {
    const a = this._o(s);
    return this._d("line", [_m(e, r, i, n, a)], a);
  }
  rectangle(e, r, i, n, s) {
    const a = this._o(s), o = [], l = jA(e, r, i, n, a);
    if (a.fill) {
      const c = [[e, r], [e + i, r], [e + i, r + n], [e, r + n]];
      a.fillStyle === "solid" ? o.push(ho([c], a)) : o.push(ei([c], a));
    }
    return a.stroke !== oe && o.push(l), this._d("rectangle", o, a);
  }
  ellipse(e, r, i, n, s) {
    const a = this._o(s), o = [], l = km(i, n, a), c = al(e, r, a, l);
    if (a.fill) if (a.fillStyle === "solid") {
      const h = al(e, r, a, l).opset;
      h.type = "fillPath", o.push(h);
    } else o.push(ei([c.estimatedPoints], a));
    return a.stroke !== oe && o.push(c.opset), this._d("ellipse", o, a);
  }
  circle(e, r, i, n) {
    const s = this.ellipse(e, r, i, i, n);
    return s.shape = "circle", s;
  }
  linearPath(e, r) {
    const i = this._o(r);
    return this._d("linearPath", [ps(e, !1, i)], i);
  }
  arc(e, r, i, n, s, a, o = !1, l) {
    const c = this._o(l), h = [], u = Fu(e, r, i, n, s, a, o, !0, c);
    if (o && c.fill) if (c.fillStyle === "solid") {
      const f = Object.assign({}, c);
      f.disableMultiStroke = !0;
      const d = Fu(e, r, i, n, s, a, !0, !1, f);
      d.type = "fillPath", h.push(d);
    } else h.push((function(f, d, g, m, y, x, b) {
      const C = f, k = d;
      let _ = Math.abs(g / 2), E = Math.abs(m / 2);
      _ += ot(0.01 * _, b), E += ot(0.01 * E, b);
      let B = y, S = x;
      for (; B < 0; ) B += 2 * Math.PI, S += 2 * Math.PI;
      S - B > 2 * Math.PI && (B = 0, S = 2 * Math.PI);
      const I = (S - B) / b.curveStepCount, O = [];
      for (let D = B; D <= S; D += I) O.push([C + _ * Math.cos(D), k + E * Math.sin(D)]);
      return O.push([C + _ * Math.cos(S), k + E * Math.sin(S)]), O.push([C, k]), ei([O], b);
    })(e, r, i, n, s, a, c));
    return c.stroke !== oe && h.push(u), this._d("arc", h, c);
  }
  curve(e, r) {
    const i = this._o(r), n = [], s = $u(e, i);
    if (i.fill && i.fill !== oe) if (i.fillStyle === "solid") {
      const a = $u(e, Object.assign(Object.assign({}, i), { disableMultiStroke: !0, roughness: i.roughness ? i.roughness + i.fillShapeRoughnessGain : 0 }));
      n.push({ type: "fillPath", ops: this._mergedShape(a.ops) });
    } else {
      const a = [], o = e;
      if (o.length) {
        const l = typeof o[0][0] == "number" ? [o] : o;
        for (const c of l) c.length < 3 ? a.push(...c) : c.length === 3 ? a.push(...uo(Pu([c[0], c[0], c[1], c[2]]), 10, (1 + i.roughness) / 2)) : a.push(...uo(Pu(c), 10, (1 + i.roughness) / 2));
      }
      a.length && n.push(ei([a], i));
    }
    return i.stroke !== oe && n.push(s), this._d("curve", n, i);
  }
  polygon(e, r) {
    const i = this._o(r), n = [], s = ps(e, !0, i);
    return i.fill && (i.fillStyle === "solid" ? n.push(ho([e], i)) : n.push(ei([e], i))), i.stroke !== oe && n.push(s), this._d("polygon", n, i);
  }
  path(e, r) {
    const i = this._o(r), n = [];
    if (!e) return this._d("path", n, i);
    e = (e || "").replace(/\n/g, " ").replace(/(-\s)/g, "-").replace("/(ss)/g", " ");
    const s = i.fill && i.fill !== "transparent" && i.fill !== oe, a = i.stroke !== oe, o = !!(i.simplification && i.simplification < 1), l = (function(h, u, f) {
      const d = wm(bm(_c(h))), g = [];
      let m = [], y = [0, 0], x = [];
      const b = () => {
        x.length >= 4 && m.push(...uo(x, u)), x = [];
      }, C = () => {
        b(), m.length && (g.push(m), m = []);
      };
      for (const { key: _, data: E } of d) switch (_) {
        case "M":
          C(), y = [E[0], E[1]], m.push(y);
          break;
        case "L":
          b(), m.push([E[0], E[1]]);
          break;
        case "C":
          if (!x.length) {
            const B = m.length ? m[m.length - 1] : y;
            x.push([B[0], B[1]]);
          }
          x.push([E[0], E[1]]), x.push([E[2], E[3]]), x.push([E[4], E[5]]);
          break;
        case "Z":
          b(), m.push([y[0], y[1]]);
      }
      if (C(), !f) return g;
      const k = [];
      for (const _ of g) {
        const E = GA(_, f);
        E.length && k.push(E);
      }
      return k;
    })(e, 1, o ? 4 - 4 * (i.simplification || 1) : (1 + i.roughness) / 2), c = Ou(e, i);
    if (s) if (i.fillStyle === "solid") if (l.length === 1) {
      const h = Ou(e, Object.assign(Object.assign({}, i), { disableMultiStroke: !0, roughness: i.roughness ? i.roughness + i.fillShapeRoughnessGain : 0 }));
      n.push({ type: "fillPath", ops: this._mergedShape(h.ops) });
    } else n.push(ho(l, i));
    else n.push(ei(l, i));
    return a && (o ? l.forEach(((h) => {
      n.push(ps(h, !1, i));
    })) : n.push(c)), this._d("path", n, i);
  }
  opsToPath(e, r) {
    let i = "";
    for (const n of e.ops) {
      const s = typeof r == "number" && r >= 0 ? n.data.map(((a) => +a.toFixed(r))) : n.data;
      switch (n.op) {
        case "move":
          i += `M${s[0]} ${s[1]} `;
          break;
        case "bcurveTo":
          i += `C${s[0]} ${s[1]}, ${s[2]} ${s[3]}, ${s[4]} ${s[5]} `;
          break;
        case "lineTo":
          i += `L${s[0]} ${s[1]} `;
      }
    }
    return i.trim();
  }
  toPaths(e) {
    const r = e.sets || [], i = e.options || this.defaultOptions, n = [];
    for (const s of r) {
      let a = null;
      switch (s.type) {
        case "path":
          a = { d: this.opsToPath(s), stroke: i.stroke, strokeWidth: i.strokeWidth, fill: oe };
          break;
        case "fillPath":
          a = { d: this.opsToPath(s), stroke: oe, strokeWidth: 0, fill: i.fill || oe };
          break;
        case "fillSketch":
          a = this.fillSketch(s, i);
      }
      a && n.push(a);
    }
    return n;
  }
  fillSketch(e, r) {
    let i = r.fillWeight;
    return i < 0 && (i = r.strokeWidth / 2), { d: this.opsToPath(e), stroke: r.fill || oe, strokeWidth: i, fill: oe };
  }
  _mergedShape(e) {
    return e.filter(((r, i) => i === 0 || r.op !== "move"));
  }
}
class VA {
  constructor(e, r) {
    this.canvas = e, this.ctx = this.canvas.getContext("2d"), this.gen = new Qs(r);
  }
  draw(e) {
    const r = e.sets || [], i = e.options || this.getDefaultOptions(), n = this.ctx, s = e.options.fixedDecimalPlaceDigits;
    for (const a of r) switch (a.type) {
      case "path":
        n.save(), n.strokeStyle = i.stroke === "none" ? "transparent" : i.stroke, n.lineWidth = i.strokeWidth, i.strokeLineDash && n.setLineDash(i.strokeLineDash), i.strokeLineDashOffset && (n.lineDashOffset = i.strokeLineDashOffset), this._drawToContext(n, a, s), n.restore();
        break;
      case "fillPath": {
        n.save(), n.fillStyle = i.fill || "";
        const o = e.shape === "curve" || e.shape === "polygon" || e.shape === "path" ? "evenodd" : "nonzero";
        this._drawToContext(n, a, s, o), n.restore();
        break;
      }
      case "fillSketch":
        this.fillSketch(n, a, i);
    }
  }
  fillSketch(e, r, i) {
    let n = i.fillWeight;
    n < 0 && (n = i.strokeWidth / 2), e.save(), i.fillLineDash && e.setLineDash(i.fillLineDash), i.fillLineDashOffset && (e.lineDashOffset = i.fillLineDashOffset), e.strokeStyle = i.fill || "", e.lineWidth = n, this._drawToContext(e, r, i.fixedDecimalPlaceDigits), e.restore();
  }
  _drawToContext(e, r, i, n = "nonzero") {
    e.beginPath();
    for (const s of r.ops) {
      const a = typeof i == "number" && i >= 0 ? s.data.map(((o) => +o.toFixed(i))) : s.data;
      switch (s.op) {
        case "move":
          e.moveTo(a[0], a[1]);
          break;
        case "bcurveTo":
          e.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
          break;
        case "lineTo":
          e.lineTo(a[0], a[1]);
      }
    }
    r.type === "fillPath" ? e.fill(n) : e.stroke();
  }
  get generator() {
    return this.gen;
  }
  getDefaultOptions() {
    return this.gen.defaultOptions;
  }
  line(e, r, i, n, s) {
    const a = this.gen.line(e, r, i, n, s);
    return this.draw(a), a;
  }
  rectangle(e, r, i, n, s) {
    const a = this.gen.rectangle(e, r, i, n, s);
    return this.draw(a), a;
  }
  ellipse(e, r, i, n, s) {
    const a = this.gen.ellipse(e, r, i, n, s);
    return this.draw(a), a;
  }
  circle(e, r, i, n) {
    const s = this.gen.circle(e, r, i, n);
    return this.draw(s), s;
  }
  linearPath(e, r) {
    const i = this.gen.linearPath(e, r);
    return this.draw(i), i;
  }
  polygon(e, r) {
    const i = this.gen.polygon(e, r);
    return this.draw(i), i;
  }
  arc(e, r, i, n, s, a, o = !1, l) {
    const c = this.gen.arc(e, r, i, n, s, a, o, l);
    return this.draw(c), c;
  }
  curve(e, r) {
    const i = this.gen.curve(e, r);
    return this.draw(i), i;
  }
  path(e, r) {
    const i = this.gen.path(e, r);
    return this.draw(i), i;
  }
}
const es = "http://www.w3.org/2000/svg";
class KA {
  constructor(e, r) {
    this.svg = e, this.gen = new Qs(r);
  }
  draw(e) {
    const r = e.sets || [], i = e.options || this.getDefaultOptions(), n = this.svg.ownerDocument || window.document, s = n.createElementNS(es, "g"), a = e.options.fixedDecimalPlaceDigits;
    for (const o of r) {
      let l = null;
      switch (o.type) {
        case "path":
          l = n.createElementNS(es, "path"), l.setAttribute("d", this.opsToPath(o, a)), l.setAttribute("stroke", i.stroke), l.setAttribute("stroke-width", i.strokeWidth + ""), l.setAttribute("fill", "none"), i.strokeLineDash && l.setAttribute("stroke-dasharray", i.strokeLineDash.join(" ").trim()), i.strokeLineDashOffset && l.setAttribute("stroke-dashoffset", `${i.strokeLineDashOffset}`);
          break;
        case "fillPath":
          l = n.createElementNS(es, "path"), l.setAttribute("d", this.opsToPath(o, a)), l.setAttribute("stroke", "none"), l.setAttribute("stroke-width", "0"), l.setAttribute("fill", i.fill || ""), e.shape !== "curve" && e.shape !== "polygon" || l.setAttribute("fill-rule", "evenodd");
          break;
        case "fillSketch":
          l = this.fillSketch(n, o, i);
      }
      l && s.appendChild(l);
    }
    return s;
  }
  fillSketch(e, r, i) {
    let n = i.fillWeight;
    n < 0 && (n = i.strokeWidth / 2);
    const s = e.createElementNS(es, "path");
    return s.setAttribute("d", this.opsToPath(r, i.fixedDecimalPlaceDigits)), s.setAttribute("stroke", i.fill || ""), s.setAttribute("stroke-width", n + ""), s.setAttribute("fill", "none"), i.fillLineDash && s.setAttribute("stroke-dasharray", i.fillLineDash.join(" ").trim()), i.fillLineDashOffset && s.setAttribute("stroke-dashoffset", `${i.fillLineDashOffset}`), s;
  }
  get generator() {
    return this.gen;
  }
  getDefaultOptions() {
    return this.gen.defaultOptions;
  }
  opsToPath(e, r) {
    return this.gen.opsToPath(e, r);
  }
  line(e, r, i, n, s) {
    const a = this.gen.line(e, r, i, n, s);
    return this.draw(a);
  }
  rectangle(e, r, i, n, s) {
    const a = this.gen.rectangle(e, r, i, n, s);
    return this.draw(a);
  }
  ellipse(e, r, i, n, s) {
    const a = this.gen.ellipse(e, r, i, n, s);
    return this.draw(a);
  }
  circle(e, r, i, n) {
    const s = this.gen.circle(e, r, i, n);
    return this.draw(s);
  }
  linearPath(e, r) {
    const i = this.gen.linearPath(e, r);
    return this.draw(i);
  }
  polygon(e, r) {
    const i = this.gen.polygon(e, r);
    return this.draw(i);
  }
  arc(e, r, i, n, s, a, o = !1, l) {
    const c = this.gen.arc(e, r, i, n, s, a, o, l);
    return this.draw(c);
  }
  curve(e, r) {
    const i = this.gen.curve(e, r);
    return this.draw(i);
  }
  path(e, r) {
    const i = this.gen.path(e, r);
    return this.draw(i);
  }
}
var G = { canvas: (t, e) => new VA(t, e), svg: (t, e) => new KA(t, e), generator: (t) => new Qs(t), newSeed: () => Qs.newSeed() }, at = /* @__PURE__ */ p(async (t, e, r) => {
  let i;
  const n = e.useHtmlLabels || Dt(yt()?.htmlLabels);
  r ? i = r : i = "node default";
  const s = t.insert("g").attr("class", i).attr("id", e.domId || e.id), a = s.insert("g").attr("class", "label").attr("style", jt(e.labelStyle));
  let o;
  e.label === void 0 ? o = "" : o = typeof e.label == "string" ? e.label : e.label[0];
  const l = await fr(a, de(jr(o), yt()), {
    useHtmlLabels: n,
    width: e.width || yt().flowchart?.wrappingWidth,
    // @ts-expect-error -- This is currently not used. Should this be `classes` instead?
    cssClasses: "markdown-node-label",
    style: e.labelStyle,
    addSvgBackground: !!e.icon || !!e.img
  });
  let c = l.getBBox();
  const h = (e?.padding ?? 0) / 2;
  if (n) {
    const u = l.children[0], f = dt(l), d = u.getElementsByTagName("img");
    if (d) {
      const g = o.replace(/<img[^>]*>/g, "").trim() === "";
      await Promise.all(
        [...d].map(
          (m) => new Promise((y) => {
            function x() {
              if (m.style.display = "flex", m.style.flexDirection = "column", g) {
                const b = yt().fontSize ? yt().fontSize : window.getComputedStyle(document.body).fontSize, C = 5, [k = Pf.fontSize] = wa(b), _ = k * C + "px";
                m.style.minWidth = _, m.style.maxWidth = _;
              } else
                m.style.width = "100%";
              y(m);
            }
            p(x, "setupImage"), setTimeout(() => {
              m.complete && x();
            }), m.addEventListener("error", x), m.addEventListener("load", x);
          })
        )
      );
    }
    c = u.getBoundingClientRect(), f.attr("width", c.width), f.attr("height", c.height);
  }
  return n ? a.attr("transform", "translate(" + -c.width / 2 + ", " + -c.height / 2 + ")") : a.attr("transform", "translate(0, " + -c.height / 2 + ")"), e.centerLabel && a.attr("transform", "translate(" + -c.width / 2 + ", " + -c.height / 2 + ")"), a.insert("rect", ":first-child"), { shapeSvg: s, bbox: c, halfPadding: h, label: a };
}, "labelHelper"), fo = /* @__PURE__ */ p(async (t, e, r) => {
  const i = r.useHtmlLabels || Dt(yt()?.flowchart?.htmlLabels), n = t.insert("g").attr("class", "label").attr("style", r.labelStyle || ""), s = await fr(n, de(jr(e), yt()), {
    useHtmlLabels: i,
    width: r.width || yt()?.flowchart?.wrappingWidth,
    style: r.labelStyle,
    addSvgBackground: !!r.icon || !!r.img
  });
  let a = s.getBBox();
  const o = r.padding / 2;
  if (Dt(yt()?.flowchart?.htmlLabels)) {
    const l = s.children[0], c = dt(s);
    a = l.getBoundingClientRect(), c.attr("width", a.width), c.attr("height", a.height);
  }
  return i ? n.attr("transform", "translate(" + -a.width / 2 + ", " + -a.height / 2 + ")") : n.attr("transform", "translate(0, " + -a.height / 2 + ")"), r.centerLabel && n.attr("transform", "translate(" + -a.width / 2 + ", " + -a.height / 2 + ")"), n.insert("rect", ":first-child"), { shapeSvg: t, bbox: a, halfPadding: o, label: n };
}, "insertLabel"), Q = /* @__PURE__ */ p((t, e) => {
  const r = e.node().getBBox();
  t.width = r.width, t.height = r.height;
}, "updateNodeBounds"), st = /* @__PURE__ */ p((t, e) => (t.look === "handDrawn" ? "rough-node" : "node") + " " + t.cssClasses + " " + (e || ""), "getNodeClasses");
function ft(t) {
  const e = t.map((r, i) => `${i === 0 ? "M" : "L"}${r.x},${r.y}`);
  return e.push("Z"), e.join(" ");
}
p(ft, "createPathFromPoints");
function hr(t, e, r, i, n, s) {
  const a = [], l = r - t, c = i - e, h = l / s, u = 2 * Math.PI / h, f = e + c / 2;
  for (let d = 0; d <= 50; d++) {
    const g = d / 50, m = t + g * l, y = f + n * Math.sin(u * (m - t));
    a.push({ x: m, y });
  }
  return a;
}
p(hr, "generateFullSineWavePoints");
function xn(t, e, r, i, n, s) {
  const a = [], o = n * Math.PI / 180, h = (s * Math.PI / 180 - o) / (i - 1);
  for (let u = 0; u < i; u++) {
    const f = o + u * h, d = t + r * Math.cos(f), g = e + r * Math.sin(f);
    a.push({ x: -d, y: -g });
  }
  return a;
}
p(xn, "generateCirclePoints");
var ZA = /* @__PURE__ */ p((t, e) => {
  var r = t.x, i = t.y, n = e.x - r, s = e.y - i, a = t.width / 2, o = t.height / 2, l, c;
  return Math.abs(s) * a > Math.abs(n) * o ? (s < 0 && (o = -o), l = s === 0 ? 0 : o * n / s, c = o) : (n < 0 && (a = -a), l = a, c = n === 0 ? 0 : a * s / n), { x: r + l, y: i + c };
}, "intersectRect"), Ti = ZA;
function vm(t, e) {
  e && t.attr("style", e);
}
p(vm, "applyStyle");
async function Tm(t) {
  const e = dt(document.createElementNS("http://www.w3.org/2000/svg", "foreignObject")), r = e.append("xhtml:div"), i = yt();
  let n = t.label;
  t.label && pi(t.label) && (n = await El(t.label.replace(_i.lineBreakRegex, `
`), i));
  const a = '<span class="' + (t.isNode ? "nodeLabel" : "edgeLabel") + '" ' + (t.labelStyle ? 'style="' + t.labelStyle + '"' : "") + // codeql [js/html-constructed-from-input] : false positive
  ">" + n + "</span>";
  return r.html(de(a, i)), vm(r, t.labelStyle), r.style("display", "inline-block"), r.style("padding-right", "1px"), r.style("white-space", "nowrap"), r.attr("xmlns", "http://www.w3.org/1999/xhtml"), e.node();
}
p(Tm, "addHtmlLabel");
var QA = /* @__PURE__ */ p(async (t, e, r, i) => {
  let n = t || "";
  if (typeof n == "object" && (n = n[0]), Dt(yt().flowchart.htmlLabels)) {
    n = n.replace(/\\n|\n/g, "<br />"), R.info("vertexText" + n);
    const s = {
      isNode: i,
      label: jr(n).replace(
        /fa[blrs]?:fa-[\w-]+/g,
        (o) => `<i class='${o.replace(":", " ")}'></i>`
      ),
      labelStyle: e && e.replace("fill:", "color:")
    };
    return await Tm(s);
  } else {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "text");
    s.setAttribute("style", e.replace("color:", "fill:"));
    let a = [];
    typeof n == "string" ? a = n.split(/\\n|\n|<br\s*\/?>/gi) : Array.isArray(n) ? a = n : a = [];
    for (const o of a) {
      const l = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      l.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"), l.setAttribute("dy", "1em"), l.setAttribute("x", "0"), r ? l.setAttribute("class", "title-row") : l.setAttribute("class", "row"), l.textContent = o.trim(), s.appendChild(l);
    }
    return s;
  }
}, "createLabel"), Er = QA, dr = /* @__PURE__ */ p((t, e, r, i, n) => [
  "M",
  t + n,
  e,
  // Move to the first point
  "H",
  t + r - n,
  // Draw horizontal line to the beginning of the right corner
  "A",
  n,
  n,
  0,
  0,
  1,
  t + r,
  e + n,
  // Draw arc to the right top corner
  "V",
  e + i - n,
  // Draw vertical line down to the beginning of the right bottom corner
  "A",
  n,
  n,
  0,
  0,
  1,
  t + r - n,
  e + i,
  // Draw arc to the right bottom corner
  "H",
  t + n,
  // Draw horizontal line to the beginning of the left bottom corner
  "A",
  n,
  n,
  0,
  0,
  1,
  t,
  e + i - n,
  // Draw arc to the left bottom corner
  "V",
  e + n,
  // Draw vertical line up to the beginning of the left top corner
  "A",
  n,
  n,
  0,
  0,
  1,
  t + n,
  e,
  // Draw arc to the left top corner
  "Z"
  // Close the path
].join(" "), "createRoundedRectPathD"), Am = /* @__PURE__ */ p(async (t, e) => {
  R.info("Creating subgraph rect for ", e.id, e);
  const r = yt(), { themeVariables: i, handDrawnSeed: n } = r, { clusterBkg: s, clusterBorder: a } = i, { labelStyles: o, nodeStyles: l, borderStyles: c, backgroundStyles: h } = K(e), u = t.insert("g").attr("class", "cluster " + e.cssClasses).attr("id", e.id).attr("data-look", e.look), f = Dt(r.flowchart.htmlLabels), d = u.insert("g").attr("class", "cluster-label "), g = await fr(d, e.label, {
    style: e.labelStyle,
    useHtmlLabels: f,
    isNode: !0
  });
  let m = g.getBBox();
  if (Dt(r.flowchart.htmlLabels)) {
    const B = g.children[0], S = dt(g);
    m = B.getBoundingClientRect(), S.attr("width", m.width), S.attr("height", m.height);
  }
  const y = e.width <= m.width + e.padding ? m.width + e.padding : e.width;
  e.width <= m.width + e.padding ? e.diff = (y - e.width) / 2 - e.padding : e.diff = -e.padding;
  const x = e.height, b = e.x - y / 2, C = e.y - x / 2;
  R.trace("Data ", e, JSON.stringify(e));
  let k;
  if (e.look === "handDrawn") {
    const B = G.svg(u), S = V(e, {
      roughness: 0.7,
      fill: s,
      // fill: 'red',
      stroke: a,
      fillWeight: 3,
      seed: n
    }), I = B.path(dr(b, C, y, x, 0), S);
    k = u.insert(() => (R.debug("Rough node insert CXC", I), I), ":first-child"), k.select("path:nth-child(2)").attr("style", c.join(";")), k.select("path").attr("style", h.join(";").replace("fill", "stroke"));
  } else
    k = u.insert("rect", ":first-child"), k.attr("style", l).attr("rx", e.rx).attr("ry", e.ry).attr("x", b).attr("y", C).attr("width", y).attr("height", x);
  const { subGraphTitleTopMargin: _ } = tc(r);
  if (d.attr(
    "transform",
    // This puts the label on top of the box instead of inside it
    `translate(${e.x - m.width / 2}, ${e.y - e.height / 2 + _})`
  ), o) {
    const B = d.select("span");
    B && B.attr("style", o);
  }
  const E = k.node().getBBox();
  return e.offsetX = 0, e.width = E.width, e.height = E.height, e.offsetY = m.height - e.padding / 2, e.intersect = function(B) {
    return Ti(e, B);
  }, { cluster: u, labelBBox: m };
}, "rect"), JA = /* @__PURE__ */ p((t, e) => {
  const r = t.insert("g").attr("class", "note-cluster").attr("id", e.id), i = r.insert("rect", ":first-child"), n = 0 * e.padding, s = n / 2;
  i.attr("rx", e.rx).attr("ry", e.ry).attr("x", e.x - e.width / 2 - s).attr("y", e.y - e.height / 2 - s).attr("width", e.width + n).attr("height", e.height + n).attr("fill", "none");
  const a = i.node().getBBox();
  return e.width = a.width, e.height = a.height, e.intersect = function(o) {
    return Ti(e, o);
  }, { cluster: r, labelBBox: { width: 0, height: 0 } };
}, "noteGroup"), tL = /* @__PURE__ */ p(async (t, e) => {
  const r = yt(), { themeVariables: i, handDrawnSeed: n } = r, { altBackground: s, compositeBackground: a, compositeTitleBackground: o, nodeBorder: l } = i, c = t.insert("g").attr("class", e.cssClasses).attr("id", e.id).attr("data-id", e.id).attr("data-look", e.look), h = c.insert("g", ":first-child"), u = c.insert("g").attr("class", "cluster-label");
  let f = c.append("rect");
  const d = u.node().appendChild(await Er(e.label, e.labelStyle, void 0, !0));
  let g = d.getBBox();
  if (Dt(r.flowchart.htmlLabels)) {
    const I = d.children[0], O = dt(d);
    g = I.getBoundingClientRect(), O.attr("width", g.width), O.attr("height", g.height);
  }
  const m = 0 * e.padding, y = m / 2, x = (e.width <= g.width + e.padding ? g.width + e.padding : e.width) + m;
  e.width <= g.width + e.padding ? e.diff = (x - e.width) / 2 - e.padding : e.diff = -e.padding;
  const b = e.height + m, C = e.height + m - g.height - 6, k = e.x - x / 2, _ = e.y - b / 2;
  e.width = x;
  const E = e.y - e.height / 2 - y + g.height + 2;
  let B;
  if (e.look === "handDrawn") {
    const I = e.cssClasses.includes("statediagram-cluster-alt"), O = G.svg(c), D = e.rx || e.ry ? O.path(dr(k, _, x, b, 10), {
      roughness: 0.7,
      fill: o,
      fillStyle: "solid",
      stroke: l,
      seed: n
    }) : O.rectangle(k, _, x, b, { seed: n });
    B = c.insert(() => D, ":first-child");
    const W = O.rectangle(k, E, x, C, {
      fill: I ? s : a,
      fillStyle: I ? "hachure" : "solid",
      stroke: l,
      seed: n
    });
    B = c.insert(() => D, ":first-child"), f = c.insert(() => W);
  } else
    B = h.insert("rect", ":first-child"), B.attr("class", "outer").attr("x", k).attr("y", _).attr("width", x).attr("height", b).attr("data-look", e.look), f.attr("class", "inner").attr("x", k).attr("y", E).attr("width", x).attr("height", C);
  u.attr(
    "transform",
    `translate(${e.x - g.width / 2}, ${_ + 1 - (Dt(r.flowchart.htmlLabels) ? 0 : 3)})`
  );
  const S = B.node().getBBox();
  return e.height = S.height, e.offsetX = 0, e.offsetY = g.height - e.padding / 2, e.labelBBox = g, e.intersect = function(I) {
    return Ti(e, I);
  }, { cluster: c, labelBBox: g };
}, "roundedWithTitle"), eL = /* @__PURE__ */ p(async (t, e) => {
  R.info("Creating subgraph rect for ", e.id, e);
  const r = yt(), { themeVariables: i, handDrawnSeed: n } = r, { clusterBkg: s, clusterBorder: a } = i, { labelStyles: o, nodeStyles: l, borderStyles: c, backgroundStyles: h } = K(e), u = t.insert("g").attr("class", "cluster " + e.cssClasses).attr("id", e.id).attr("data-look", e.look), f = Dt(r.flowchart.htmlLabels), d = u.insert("g").attr("class", "cluster-label "), g = await fr(d, e.label, {
    style: e.labelStyle,
    useHtmlLabels: f,
    isNode: !0,
    width: e.width
  });
  let m = g.getBBox();
  if (Dt(r.flowchart.htmlLabels)) {
    const B = g.children[0], S = dt(g);
    m = B.getBoundingClientRect(), S.attr("width", m.width), S.attr("height", m.height);
  }
  const y = e.width <= m.width + e.padding ? m.width + e.padding : e.width;
  e.width <= m.width + e.padding ? e.diff = (y - e.width) / 2 - e.padding : e.diff = -e.padding;
  const x = e.height, b = e.x - y / 2, C = e.y - x / 2;
  R.trace("Data ", e, JSON.stringify(e));
  let k;
  if (e.look === "handDrawn") {
    const B = G.svg(u), S = V(e, {
      roughness: 0.7,
      fill: s,
      // fill: 'red',
      stroke: a,
      fillWeight: 4,
      seed: n
    }), I = B.path(dr(b, C, y, x, e.rx), S);
    k = u.insert(() => (R.debug("Rough node insert CXC", I), I), ":first-child"), k.select("path:nth-child(2)").attr("style", c.join(";")), k.select("path").attr("style", h.join(";").replace("fill", "stroke"));
  } else
    k = u.insert("rect", ":first-child"), k.attr("style", l).attr("rx", e.rx).attr("ry", e.ry).attr("x", b).attr("y", C).attr("width", y).attr("height", x);
  const { subGraphTitleTopMargin: _ } = tc(r);
  if (d.attr(
    "transform",
    // This puts the label on top of the box instead of inside it
    `translate(${e.x - m.width / 2}, ${e.y - e.height / 2 + _})`
  ), o) {
    const B = d.select("span");
    B && B.attr("style", o);
  }
  const E = k.node().getBBox();
  return e.offsetX = 0, e.width = E.width, e.height = E.height, e.offsetY = m.height - e.padding / 2, e.intersect = function(B) {
    return Ti(e, B);
  }, { cluster: u, labelBBox: m };
}, "kanbanSection"), rL = /* @__PURE__ */ p((t, e) => {
  const r = yt(), { themeVariables: i, handDrawnSeed: n } = r, { nodeBorder: s } = i, a = t.insert("g").attr("class", e.cssClasses).attr("id", e.id).attr("data-look", e.look), o = a.insert("g", ":first-child"), l = 0 * e.padding, c = e.width + l;
  e.diff = -e.padding;
  const h = e.height + l, u = e.x - c / 2, f = e.y - h / 2;
  e.width = c;
  let d;
  if (e.look === "handDrawn") {
    const y = G.svg(a).rectangle(u, f, c, h, {
      fill: "lightgrey",
      roughness: 0.5,
      strokeLineDash: [5],
      stroke: s,
      seed: n
    });
    d = a.insert(() => y, ":first-child");
  } else
    d = o.insert("rect", ":first-child"), d.attr("class", "divider").attr("x", u).attr("y", f).attr("width", c).attr("height", h).attr("data-look", e.look);
  const g = d.node().getBBox();
  return e.height = g.height, e.offsetX = 0, e.offsetY = 0, e.intersect = function(m) {
    return Ti(e, m);
  }, { cluster: a, labelBBox: {} };
}, "divider"), iL = Am, nL = {
  rect: Am,
  squareRect: iL,
  roundedWithTitle: tL,
  noteGroup: JA,
  divider: rL,
  kanbanSection: eL
}, Lm = /* @__PURE__ */ new Map(), sL = /* @__PURE__ */ p(async (t, e) => {
  const r = e.shape || "rect", i = await nL[r](t, e);
  return Lm.set(e.id, i), i;
}, "insertCluster"), qF = /* @__PURE__ */ p(() => {
  Lm = /* @__PURE__ */ new Map();
}, "clear");
function Em(t, e) {
  return t.intersect(e);
}
p(Em, "intersectNode");
var aL = Em;
function Bm(t, e, r, i) {
  var n = t.x, s = t.y, a = n - i.x, o = s - i.y, l = Math.sqrt(e * e * o * o + r * r * a * a), c = Math.abs(e * r * a / l);
  i.x < n && (c = -c);
  var h = Math.abs(e * r * o / l);
  return i.y < s && (h = -h), { x: n + c, y: s + h };
}
p(Bm, "intersectEllipse");
var Mm = Bm;
function $m(t, e, r) {
  return Mm(t, e, e, r);
}
p($m, "intersectCircle");
var oL = $m;
function Fm(t, e, r, i) {
  {
    const n = e.y - t.y, s = t.x - e.x, a = e.x * t.y - t.x * e.y, o = n * r.x + s * r.y + a, l = n * i.x + s * i.y + a, c = 1e-6;
    if (o !== 0 && l !== 0 && cl(o, l))
      return;
    const h = i.y - r.y, u = r.x - i.x, f = i.x * r.y - r.x * i.y, d = h * t.x + u * t.y + f, g = h * e.x + u * e.y + f;
    if (Math.abs(d) < c && Math.abs(g) < c && cl(d, g))
      return;
    const m = n * u - h * s;
    if (m === 0)
      return;
    const y = Math.abs(m / 2);
    let x = s * f - u * a;
    const b = x < 0 ? (x - y) / m : (x + y) / m;
    x = h * a - n * f;
    const C = x < 0 ? (x - y) / m : (x + y) / m;
    return { x: b, y: C };
  }
}
p(Fm, "intersectLine");
function cl(t, e) {
  return t * e > 0;
}
p(cl, "sameSign");
var lL = Fm;
function Om(t, e, r) {
  let i = t.x, n = t.y, s = [], a = Number.POSITIVE_INFINITY, o = Number.POSITIVE_INFINITY;
  typeof e.forEach == "function" ? e.forEach(function(h) {
    a = Math.min(a, h.x), o = Math.min(o, h.y);
  }) : (a = Math.min(a, e.x), o = Math.min(o, e.y));
  let l = i - t.width / 2 - a, c = n - t.height / 2 - o;
  for (let h = 0; h < e.length; h++) {
    let u = e[h], f = e[h < e.length - 1 ? h + 1 : 0], d = lL(
      t,
      r,
      { x: l + u.x, y: c + u.y },
      { x: l + f.x, y: c + f.y }
    );
    d && s.push(d);
  }
  return s.length ? (s.length > 1 && s.sort(function(h, u) {
    let f = h.x - r.x, d = h.y - r.y, g = Math.sqrt(f * f + d * d), m = u.x - r.x, y = u.y - r.y, x = Math.sqrt(m * m + y * y);
    return g < x ? -1 : g === x ? 0 : 1;
  }), s[0]) : t;
}
p(Om, "intersectPolygon");
var cL = Om, U = {
  node: aL,
  circle: oL,
  ellipse: Mm,
  polygon: cL,
  rect: Ti
};
function Dm(t, e) {
  const { labelStyles: r } = K(e);
  e.labelStyle = r;
  const i = st(e);
  let n = i;
  i || (n = "anchor");
  const s = t.insert("g").attr("class", n).attr("id", e.domId || e.id), a = 1, { cssStyles: o } = e, l = G.svg(s), c = V(e, { fill: "black", stroke: "none", fillStyle: "solid" });
  e.look !== "handDrawn" && (c.roughness = 0);
  const h = l.circle(0, 0, a * 2, c), u = s.insert(() => h, ":first-child");
  return u.attr("class", "anchor").attr("style", jt(o)), Q(e, u), e.intersect = function(f) {
    return R.info("Circle intersect", e, a, f), U.circle(e, a, f);
  }, s;
}
p(Dm, "anchor");
function hl(t, e, r, i, n, s, a) {
  const l = (t + r) / 2, c = (e + i) / 2, h = Math.atan2(i - e, r - t), u = (r - t) / 2, f = (i - e) / 2, d = u / n, g = f / s, m = Math.sqrt(d ** 2 + g ** 2);
  if (m > 1)
    throw new Error("The given radii are too small to create an arc between the points.");
  const y = Math.sqrt(1 - m ** 2), x = l + y * s * Math.sin(h) * (a ? -1 : 1), b = c - y * n * Math.cos(h) * (a ? -1 : 1), C = Math.atan2((e - b) / s, (t - x) / n);
  let _ = Math.atan2((i - b) / s, (r - x) / n) - C;
  a && _ < 0 && (_ += 2 * Math.PI), !a && _ > 0 && (_ -= 2 * Math.PI);
  const E = [];
  for (let B = 0; B < 20; B++) {
    const S = B / 19, I = C + S * _, O = x + n * Math.cos(I), D = b + s * Math.sin(I);
    E.push({ x: O, y: D });
  }
  return E;
}
p(hl, "generateArcPoints");
async function Im(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.width + e.padding + 20, o = s.height + e.padding, l = o / 2, c = l / (2.5 + o / 50), { cssStyles: h } = e, u = [
    { x: a / 2, y: -o / 2 },
    { x: -a / 2, y: -o / 2 },
    ...hl(-a / 2, -o / 2, -a / 2, o / 2, c, l, !1),
    { x: a / 2, y: o / 2 },
    ...hl(a / 2, o / 2, a / 2, -o / 2, c, l, !0)
  ], f = G.svg(n), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = ft(u), m = f.path(g, d), y = n.insert(() => m, ":first-child");
  return y.attr("class", "basic label-container"), h && e.look !== "handDrawn" && y.selectAll("path").attr("style", h), i && e.look !== "handDrawn" && y.selectAll("path").attr("style", i), y.attr("transform", `translate(${c / 2}, 0)`), Q(e, y), e.intersect = function(x) {
    return U.polygon(e, u, x);
  }, n;
}
p(Im, "bowTieRect");
function pr(t, e, r, i) {
  return t.insert("polygon", ":first-child").attr(
    "points",
    i.map(function(n) {
      return n.x + "," + n.y;
    }).join(" ")
  ).attr("class", "label-container").attr("transform", "translate(" + -e / 2 + "," + r / 2 + ")");
}
p(pr, "insertPolygonShape");
async function Rm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.height + e.padding, o = 12, l = s.width + e.padding + o, c = 0, h = l, u = -a, f = 0, d = [
    { x: c + o, y: u },
    { x: h, y: u },
    { x: h, y: f },
    { x: c, y: f },
    { x: c, y: u + o },
    { x: c + o, y: u }
  ];
  let g;
  const { cssStyles: m } = e;
  if (e.look === "handDrawn") {
    const y = G.svg(n), x = V(e, {}), b = ft(d), C = y.path(b, x);
    g = n.insert(() => C, ":first-child").attr("transform", `translate(${-l / 2}, ${a / 2})`), m && g.attr("style", m);
  } else
    g = pr(n, l, a, d);
  return i && g.attr("style", i), Q(e, g), e.intersect = function(y) {
    return U.polygon(e, d, y);
  }, n;
}
p(Rm, "card");
function Pm(t, e) {
  const { nodeStyles: r } = K(e);
  e.label = "";
  const i = t.insert("g").attr("class", st(e)).attr("id", e.domId ?? e.id), { cssStyles: n } = e, s = Math.max(28, e.width ?? 0), a = [
    { x: 0, y: s / 2 },
    { x: s / 2, y: 0 },
    { x: 0, y: -s / 2 },
    { x: -s / 2, y: 0 }
  ], o = G.svg(i), l = V(e, {});
  e.look !== "handDrawn" && (l.roughness = 0, l.fillStyle = "solid");
  const c = ft(a), h = o.path(c, l), u = i.insert(() => h, ":first-child");
  return n && e.look !== "handDrawn" && u.selectAll("path").attr("style", n), r && e.look !== "handDrawn" && u.selectAll("path").attr("style", r), e.width = 28, e.height = 28, e.intersect = function(f) {
    return U.polygon(e, a, f);
  }, i;
}
p(Pm, "choice");
async function kc(t, e, r) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.labelStyle = i;
  const { shapeSvg: s, bbox: a, halfPadding: o } = await at(t, e, st(e)), l = r?.padding ?? o, c = a.width / 2 + l;
  let h;
  const { cssStyles: u } = e;
  if (e.look === "handDrawn") {
    const f = G.svg(s), d = V(e, {}), g = f.circle(0, 0, c * 2, d);
    h = s.insert(() => g, ":first-child"), h.attr("class", "basic label-container").attr("style", jt(u));
  } else
    h = s.insert("circle", ":first-child").attr("class", "basic label-container").attr("style", n).attr("r", c).attr("cx", 0).attr("cy", 0);
  return Q(e, h), e.calcIntersect = function(f, d) {
    const g = f.width / 2;
    return U.circle(f, g, d);
  }, e.intersect = function(f) {
    return R.info("Circle intersect", e, c, f), U.circle(e, c, f);
  }, s;
}
p(kc, "circle");
function Nm(t) {
  const e = Math.cos(Math.PI / 4), r = Math.sin(Math.PI / 4), i = t * 2, n = { x: i / 2 * e, y: i / 2 * r }, s = { x: -(i / 2) * e, y: i / 2 * r }, a = { x: -(i / 2) * e, y: -(i / 2) * r }, o = { x: i / 2 * e, y: -(i / 2) * r };
  return `M ${s.x},${s.y} L ${o.x},${o.y}
                   M ${n.x},${n.y} L ${a.x},${a.y}`;
}
p(Nm, "createLine");
function zm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r, e.label = "";
  const n = t.insert("g").attr("class", st(e)).attr("id", e.domId ?? e.id), s = Math.max(30, e?.width ?? 0), { cssStyles: a } = e, o = G.svg(n), l = V(e, {});
  e.look !== "handDrawn" && (l.roughness = 0, l.fillStyle = "solid");
  const c = o.circle(0, 0, s * 2, l), h = Nm(s), u = o.path(h, l), f = n.insert(() => c, ":first-child");
  return f.insert(() => u), a && e.look !== "handDrawn" && f.selectAll("path").attr("style", a), i && e.look !== "handDrawn" && f.selectAll("path").attr("style", i), Q(e, f), e.intersect = function(d) {
    return R.info("crossedCircle intersect", e, { radius: s, point: d }), U.circle(e, s, d);
  }, n;
}
p(zm, "crossedCircle");
function qe(t, e, r, i = 100, n = 0, s = 180) {
  const a = [], o = n * Math.PI / 180, h = (s * Math.PI / 180 - o) / (i - 1);
  for (let u = 0; u < i; u++) {
    const f = o + u * h, d = t + r * Math.cos(f), g = e + r * Math.sin(f);
    a.push({ x: -d, y: -g });
  }
  return a;
}
p(qe, "generateCirclePoints");
async function Wm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = s.width + (e.padding ?? 0), l = s.height + (e.padding ?? 0), c = Math.max(5, l * 0.1), { cssStyles: h } = e, u = [
    ...qe(o / 2, -l / 2, c, 30, -90, 0),
    { x: -o / 2 - c, y: c },
    ...qe(o / 2 + c * 2, -c, c, 20, -180, -270),
    ...qe(o / 2 + c * 2, c, c, 20, -90, -180),
    { x: -o / 2 - c, y: -l / 2 },
    ...qe(o / 2, l / 2, c, 20, 0, 90)
  ], f = [
    { x: o / 2, y: -l / 2 - c },
    { x: -o / 2, y: -l / 2 - c },
    ...qe(o / 2, -l / 2, c, 20, -90, 0),
    { x: -o / 2 - c, y: -c },
    ...qe(o / 2 + o * 0.1, -c, c, 20, -180, -270),
    ...qe(o / 2 + o * 0.1, c, c, 20, -90, -180),
    { x: -o / 2 - c, y: l / 2 },
    ...qe(o / 2, l / 2, c, 20, 0, 90),
    { x: -o / 2, y: l / 2 + c },
    { x: o / 2, y: l / 2 + c }
  ], d = G.svg(n), g = V(e, { fill: "none" });
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const y = ft(u).replace("Z", ""), x = d.path(y, g), b = ft(f), C = d.path(b, { ...g }), k = n.insert("g", ":first-child");
  return k.insert(() => C, ":first-child").attr("stroke-opacity", 0), k.insert(() => x, ":first-child"), k.attr("class", "text"), h && e.look !== "handDrawn" && k.selectAll("path").attr("style", h), i && e.look !== "handDrawn" && k.selectAll("path").attr("style", i), k.attr("transform", `translate(${c}, 0)`), a.attr(
    "transform",
    `translate(${-o / 2 + c - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, k), e.intersect = function(_) {
    return U.polygon(e, f, _);
  }, n;
}
p(Wm, "curlyBraceLeft");
function He(t, e, r, i = 100, n = 0, s = 180) {
  const a = [], o = n * Math.PI / 180, h = (s * Math.PI / 180 - o) / (i - 1);
  for (let u = 0; u < i; u++) {
    const f = o + u * h, d = t + r * Math.cos(f), g = e + r * Math.sin(f);
    a.push({ x: d, y: g });
  }
  return a;
}
p(He, "generateCirclePoints");
async function qm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = s.width + (e.padding ?? 0), l = s.height + (e.padding ?? 0), c = Math.max(5, l * 0.1), { cssStyles: h } = e, u = [
    ...He(o / 2, -l / 2, c, 20, -90, 0),
    { x: o / 2 + c, y: -c },
    ...He(o / 2 + c * 2, -c, c, 20, -180, -270),
    ...He(o / 2 + c * 2, c, c, 20, -90, -180),
    { x: o / 2 + c, y: l / 2 },
    ...He(o / 2, l / 2, c, 20, 0, 90)
  ], f = [
    { x: -o / 2, y: -l / 2 - c },
    { x: o / 2, y: -l / 2 - c },
    ...He(o / 2, -l / 2, c, 20, -90, 0),
    { x: o / 2 + c, y: -c },
    ...He(o / 2 + c * 2, -c, c, 20, -180, -270),
    ...He(o / 2 + c * 2, c, c, 20, -90, -180),
    { x: o / 2 + c, y: l / 2 },
    ...He(o / 2, l / 2, c, 20, 0, 90),
    { x: o / 2, y: l / 2 + c },
    { x: -o / 2, y: l / 2 + c }
  ], d = G.svg(n), g = V(e, { fill: "none" });
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const y = ft(u).replace("Z", ""), x = d.path(y, g), b = ft(f), C = d.path(b, { ...g }), k = n.insert("g", ":first-child");
  return k.insert(() => C, ":first-child").attr("stroke-opacity", 0), k.insert(() => x, ":first-child"), k.attr("class", "text"), h && e.look !== "handDrawn" && k.selectAll("path").attr("style", h), i && e.look !== "handDrawn" && k.selectAll("path").attr("style", i), k.attr("transform", `translate(${-c}, 0)`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) / 2 - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, k), e.intersect = function(_) {
    return U.polygon(e, f, _);
  }, n;
}
p(qm, "curlyBraceRight");
function Pt(t, e, r, i = 100, n = 0, s = 180) {
  const a = [], o = n * Math.PI / 180, h = (s * Math.PI / 180 - o) / (i - 1);
  for (let u = 0; u < i; u++) {
    const f = o + u * h, d = t + r * Math.cos(f), g = e + r * Math.sin(f);
    a.push({ x: -d, y: -g });
  }
  return a;
}
p(Pt, "generateCirclePoints");
async function Hm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = s.width + (e.padding ?? 0), l = s.height + (e.padding ?? 0), c = Math.max(5, l * 0.1), { cssStyles: h } = e, u = [
    ...Pt(o / 2, -l / 2, c, 30, -90, 0),
    { x: -o / 2 - c, y: c },
    ...Pt(o / 2 + c * 2, -c, c, 20, -180, -270),
    ...Pt(o / 2 + c * 2, c, c, 20, -90, -180),
    { x: -o / 2 - c, y: -l / 2 },
    ...Pt(o / 2, l / 2, c, 20, 0, 90)
  ], f = [
    ...Pt(-o / 2 + c + c / 2, -l / 2, c, 20, -90, -180),
    { x: o / 2 - c / 2, y: c },
    ...Pt(-o / 2 - c / 2, -c, c, 20, 0, 90),
    ...Pt(-o / 2 - c / 2, c, c, 20, -90, 0),
    { x: o / 2 - c / 2, y: -c },
    ...Pt(-o / 2 + c + c / 2, l / 2, c, 30, -180, -270)
  ], d = [
    { x: o / 2, y: -l / 2 - c },
    { x: -o / 2, y: -l / 2 - c },
    ...Pt(o / 2, -l / 2, c, 20, -90, 0),
    { x: -o / 2 - c, y: -c },
    ...Pt(o / 2 + c * 2, -c, c, 20, -180, -270),
    ...Pt(o / 2 + c * 2, c, c, 20, -90, -180),
    { x: -o / 2 - c, y: l / 2 },
    ...Pt(o / 2, l / 2, c, 20, 0, 90),
    { x: -o / 2, y: l / 2 + c },
    { x: o / 2 - c - c / 2, y: l / 2 + c },
    ...Pt(-o / 2 + c + c / 2, -l / 2, c, 20, -90, -180),
    { x: o / 2 - c / 2, y: c },
    ...Pt(-o / 2 - c / 2, -c, c, 20, 0, 90),
    ...Pt(-o / 2 - c / 2, c, c, 20, -90, 0),
    { x: o / 2 - c / 2, y: -c },
    ...Pt(-o / 2 + c + c / 2, l / 2, c, 30, -180, -270)
  ], g = G.svg(n), m = V(e, { fill: "none" });
  e.look !== "handDrawn" && (m.roughness = 0, m.fillStyle = "solid");
  const x = ft(u).replace("Z", ""), b = g.path(x, m), k = ft(f).replace("Z", ""), _ = g.path(k, m), E = ft(d), B = g.path(E, { ...m }), S = n.insert("g", ":first-child");
  return S.insert(() => B, ":first-child").attr("stroke-opacity", 0), S.insert(() => b, ":first-child"), S.insert(() => _, ":first-child"), S.attr("class", "text"), h && e.look !== "handDrawn" && S.selectAll("path").attr("style", h), i && e.look !== "handDrawn" && S.selectAll("path").attr("style", i), S.attr("transform", `translate(${c - c / 4}, 0)`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) / 2 - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, S), e.intersect = function(I) {
    return U.polygon(e, d, I);
  }, n;
}
p(Hm, "curlyBraces");
async function Ym(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = 80, o = 20, l = Math.max(a, (s.width + (e.padding ?? 0) * 2) * 1.25, e?.width ?? 0), c = Math.max(o, s.height + (e.padding ?? 0) * 2, e?.height ?? 0), h = c / 2, { cssStyles: u } = e, f = G.svg(n), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = l, m = c, y = g - h, x = m / 4, b = [
    { x: y, y: 0 },
    { x, y: 0 },
    { x: 0, y: m / 2 },
    { x, y: m },
    { x: y, y: m },
    ...xn(-y, -m / 2, h, 50, 270, 90)
  ], C = ft(b), k = f.path(C, d), _ = n.insert(() => k, ":first-child");
  return _.attr("class", "basic label-container"), u && e.look !== "handDrawn" && _.selectChildren("path").attr("style", u), i && e.look !== "handDrawn" && _.selectChildren("path").attr("style", i), _.attr("transform", `translate(${-l / 2}, ${-c / 2})`), Q(e, _), e.intersect = function(E) {
    return U.polygon(e, b, E);
  }, n;
}
p(Ym, "curvedTrapezoid");
var hL = /* @__PURE__ */ p((t, e, r, i, n, s) => [
  `M${t},${e + s}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `a${n},${s} 0,0,0 ${-r},0`,
  `l0,${i}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `l0,${-i}`
].join(" "), "createCylinderPathD"), uL = /* @__PURE__ */ p((t, e, r, i, n, s) => [
  `M${t},${e + s}`,
  `M${t + r},${e + s}`,
  `a${n},${s} 0,0,0 ${-r},0`,
  `l0,${i}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `l0,${-i}`
].join(" "), "createOuterCylinderPathD"), fL = /* @__PURE__ */ p((t, e, r, i, n, s) => [`M${t - r / 2},${-i / 2}`, `a${n},${s} 0,0,0 ${r},0`].join(" "), "createInnerCylinderPathD");
async function jm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + e.padding, e.width ?? 0), l = o / 2, c = l / (2.5 + o / 50), h = Math.max(s.height + c + e.padding, e.height ?? 0);
  let u;
  const { cssStyles: f } = e;
  if (e.look === "handDrawn") {
    const d = G.svg(n), g = uL(0, 0, o, h, l, c), m = fL(0, c, o, h, l, c), y = d.path(g, V(e, {})), x = d.path(m, V(e, { fill: "none" }));
    u = n.insert(() => x, ":first-child"), u = n.insert(() => y, ":first-child"), u.attr("class", "basic label-container"), f && u.attr("style", f);
  } else {
    const d = hL(0, 0, o, h, l, c);
    u = n.insert("path", ":first-child").attr("d", d).attr("class", "basic label-container").attr("style", jt(f)).attr("style", i);
  }
  return u.attr("label-offset-y", c), u.attr("transform", `translate(${-o / 2}, ${-(h / 2 + c)})`), Q(e, u), a.attr(
    "transform",
    `translate(${-(s.width / 2) - (s.x - (s.left ?? 0))}, ${-(s.height / 2) + (e.padding ?? 0) / 1.5 - (s.y - (s.top ?? 0))})`
  ), e.intersect = function(d) {
    const g = U.rect(e, d), m = g.x - (e.x ?? 0);
    if (l != 0 && (Math.abs(m) < (e.width ?? 0) / 2 || Math.abs(m) == (e.width ?? 0) / 2 && Math.abs(g.y - (e.y ?? 0)) > (e.height ?? 0) / 2 - c)) {
      let y = c * c * (1 - m * m / (l * l));
      y > 0 && (y = Math.sqrt(y)), y = c - y, d.y - (e.y ?? 0) > 0 && (y = -y), g.y += y;
    }
    return g;
  }, n;
}
p(jm, "cylinder");
async function Um(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = s.width + e.padding, l = s.height + e.padding, c = l * 0.2, h = -o / 2, u = -l / 2 - c / 2, { cssStyles: f } = e, d = G.svg(n), g = V(e, {});
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const m = [
    { x: h, y: u + c },
    { x: -h, y: u + c },
    { x: -h, y: -u },
    { x: h, y: -u },
    { x: h, y: u },
    { x: -h, y: u },
    { x: -h, y: u + c }
  ], y = d.polygon(
    m.map((b) => [b.x, b.y]),
    g
  ), x = n.insert(() => y, ":first-child");
  return x.attr("class", "basic label-container"), f && e.look !== "handDrawn" && x.selectAll("path").attr("style", f), i && e.look !== "handDrawn" && x.selectAll("path").attr("style", i), a.attr(
    "transform",
    `translate(${h + (e.padding ?? 0) / 2 - (s.x - (s.left ?? 0))}, ${u + c + (e.padding ?? 0) / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, x), e.intersect = function(b) {
    return U.rect(e, b);
  }, n;
}
p(Um, "dividedRectangle");
async function Xm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, halfPadding: a } = await at(t, e, st(e)), l = s.width / 2 + a + 5, c = s.width / 2 + a;
  let h;
  const { cssStyles: u } = e;
  if (e.look === "handDrawn") {
    const f = G.svg(n), d = V(e, { roughness: 0.2, strokeWidth: 2.5 }), g = V(e, { roughness: 0.2, strokeWidth: 1.5 }), m = f.circle(0, 0, l * 2, d), y = f.circle(0, 0, c * 2, g);
    h = n.insert("g", ":first-child"), h.attr("class", jt(e.cssClasses)).attr("style", jt(u)), h.node()?.appendChild(m), h.node()?.appendChild(y);
  } else {
    h = n.insert("g", ":first-child");
    const f = h.insert("circle", ":first-child"), d = h.insert("circle");
    h.attr("class", "basic label-container").attr("style", i), f.attr("class", "outer-circle").attr("style", i).attr("r", l).attr("cx", 0).attr("cy", 0), d.attr("class", "inner-circle").attr("style", i).attr("r", c).attr("cx", 0).attr("cy", 0);
  }
  return Q(e, h), e.intersect = function(f) {
    return R.info("DoubleCircle intersect", e, l, f), U.circle(e, l, f);
  }, n;
}
p(Xm, "doublecircle");
function Gm(t, e, { config: { themeVariables: r } }) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.label = "", e.labelStyle = i;
  const s = t.insert("g").attr("class", st(e)).attr("id", e.domId ?? e.id), a = 7, { cssStyles: o } = e, l = G.svg(s), { nodeBorder: c } = r, h = V(e, { fillStyle: "solid" });
  e.look !== "handDrawn" && (h.roughness = 0);
  const u = l.circle(0, 0, a * 2, h), f = s.insert(() => u, ":first-child");
  return f.selectAll("path").attr("style", `fill: ${c} !important;`), o && o.length > 0 && e.look !== "handDrawn" && f.selectAll("path").attr("style", o), n && e.look !== "handDrawn" && f.selectAll("path").attr("style", n), Q(e, f), e.intersect = function(d) {
    return R.info("filledCircle intersect", e, { radius: a, point: d }), U.circle(e, a, d);
  }, s;
}
p(Gm, "filledCircle");
async function Vm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = s.width + (e.padding ?? 0), l = o + s.height, c = o + s.height, h = [
    { x: 0, y: -l },
    { x: c, y: -l },
    { x: c / 2, y: 0 }
  ], { cssStyles: u } = e, f = G.svg(n), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = ft(h), m = f.path(g, d), y = n.insert(() => m, ":first-child").attr("transform", `translate(${-l / 2}, ${l / 2})`);
  return u && e.look !== "handDrawn" && y.selectChildren("path").attr("style", u), i && e.look !== "handDrawn" && y.selectChildren("path").attr("style", i), e.width = o, e.height = l, Q(e, y), a.attr(
    "transform",
    `translate(${-s.width / 2 - (s.x - (s.left ?? 0))}, ${-l / 2 + (e.padding ?? 0) / 2 + (s.y - (s.top ?? 0))})`
  ), e.intersect = function(x) {
    return R.info("Triangle intersect", e, h, x), U.polygon(e, h, x);
  }, n;
}
p(Vm, "flippedTriangle");
function Km(t, e, { dir: r, config: { state: i, themeVariables: n } }) {
  const { nodeStyles: s } = K(e);
  e.label = "";
  const a = t.insert("g").attr("class", st(e)).attr("id", e.domId ?? e.id), { cssStyles: o } = e;
  let l = Math.max(70, e?.width ?? 0), c = Math.max(10, e?.height ?? 0);
  r === "LR" && (l = Math.max(10, e?.width ?? 0), c = Math.max(70, e?.height ?? 0));
  const h = -1 * l / 2, u = -1 * c / 2, f = G.svg(a), d = V(e, {
    stroke: n.lineColor,
    fill: n.lineColor
  });
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = f.rectangle(h, u, l, c, d), m = a.insert(() => g, ":first-child");
  o && e.look !== "handDrawn" && m.selectAll("path").attr("style", o), s && e.look !== "handDrawn" && m.selectAll("path").attr("style", s), Q(e, m);
  const y = i?.padding ?? 0;
  return e.width && e.height && (e.width += y / 2 || 0, e.height += y / 2 || 0), e.intersect = function(x) {
    return U.rect(e, x);
  }, a;
}
p(Km, "forkJoin");
async function Zm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const n = 80, s = 50, { shapeSvg: a, bbox: o } = await at(t, e, st(e)), l = Math.max(n, o.width + (e.padding ?? 0) * 2, e?.width ?? 0), c = Math.max(s, o.height + (e.padding ?? 0) * 2, e?.height ?? 0), h = c / 2, { cssStyles: u } = e, f = G.svg(a), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = [
    { x: -l / 2, y: -c / 2 },
    { x: l / 2 - h, y: -c / 2 },
    ...xn(-l / 2 + h, 0, h, 50, 90, 270),
    { x: l / 2 - h, y: c / 2 },
    { x: -l / 2, y: c / 2 }
  ], m = ft(g), y = f.path(m, d), x = a.insert(() => y, ":first-child");
  return x.attr("class", "basic label-container"), u && e.look !== "handDrawn" && x.selectChildren("path").attr("style", u), i && e.look !== "handDrawn" && x.selectChildren("path").attr("style", i), Q(e, x), e.intersect = function(b) {
    return R.info("Pill intersect", e, { radius: h, point: b }), U.polygon(e, g, b);
  }, a;
}
p(Zm, "halfRoundedRectangle");
async function Qm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.height + (e.padding ?? 0), o = s.width + (e.padding ?? 0) * 2.5, { cssStyles: l } = e, c = G.svg(n), h = V(e, {});
  e.look !== "handDrawn" && (h.roughness = 0, h.fillStyle = "solid");
  let u = o / 2;
  const f = u / 6;
  u = u + f;
  const d = a / 2, g = d / 2, m = u - g, y = [
    { x: -m, y: -d },
    { x: 0, y: -d },
    { x: m, y: -d },
    { x: u, y: 0 },
    { x: m, y: d },
    { x: 0, y: d },
    { x: -m, y: d },
    { x: -u, y: 0 }
  ], x = ft(y), b = c.path(x, h), C = n.insert(() => b, ":first-child");
  return C.attr("class", "basic label-container"), l && e.look !== "handDrawn" && C.selectChildren("path").attr("style", l), i && e.look !== "handDrawn" && C.selectChildren("path").attr("style", i), e.width = o, e.height = a, Q(e, C), e.intersect = function(k) {
    return U.polygon(e, y, k);
  }, n;
}
p(Qm, "hexagon");
async function Jm(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.label = "", e.labelStyle = r;
  const { shapeSvg: n } = await at(t, e, st(e)), s = Math.max(30, e?.width ?? 0), a = Math.max(30, e?.height ?? 0), { cssStyles: o } = e, l = G.svg(n), c = V(e, {});
  e.look !== "handDrawn" && (c.roughness = 0, c.fillStyle = "solid");
  const h = [
    { x: 0, y: 0 },
    { x: s, y: 0 },
    { x: 0, y: a },
    { x: s, y: a }
  ], u = ft(h), f = l.path(u, c), d = n.insert(() => f, ":first-child");
  return d.attr("class", "basic label-container"), o && e.look !== "handDrawn" && d.selectChildren("path").attr("style", o), i && e.look !== "handDrawn" && d.selectChildren("path").attr("style", i), d.attr("transform", `translate(${-s / 2}, ${-a / 2})`), Q(e, d), e.intersect = function(g) {
    return R.info("Pill intersect", e, { points: h }), U.polygon(e, h, g);
  }, n;
}
p(Jm, "hourglass");
async function ty(t, e, { config: { themeVariables: r, flowchart: i } }) {
  const { labelStyles: n } = K(e);
  e.labelStyle = n;
  const s = e.assetHeight ?? 48, a = e.assetWidth ?? 48, o = Math.max(s, a), l = i?.wrappingWidth;
  e.width = Math.max(o, l ?? 0);
  const { shapeSvg: c, bbox: h, label: u } = await at(t, e, "icon-shape default"), f = e.pos === "t", d = o, g = o, { nodeBorder: m } = r, { stylesMap: y } = ki(e), x = -g / 2, b = -d / 2, C = e.label ? 8 : 0, k = G.svg(c), _ = V(e, { stroke: "none", fill: "none" });
  e.look !== "handDrawn" && (_.roughness = 0, _.fillStyle = "solid");
  const E = k.rectangle(x, b, g, d, _), B = Math.max(g, h.width), S = d + h.height + C, I = k.rectangle(-B / 2, -S / 2, B, S, {
    ..._,
    fill: "transparent",
    stroke: "none"
  }), O = c.insert(() => E, ":first-child"), D = c.insert(() => I);
  if (e.icon) {
    const W = c.append("g");
    W.html(
      `<g>${await Bn(e.icon, {
        height: o,
        width: o,
        fallbackPrefix: ""
      })}</g>`
    );
    const N = W.node().getBBox(), $ = N.width, F = N.height, A = N.x, L = N.y;
    W.attr(
      "transform",
      `translate(${-$ / 2 - A},${f ? h.height / 2 + C / 2 - F / 2 - L : -h.height / 2 - C / 2 - F / 2 - L})`
    ), W.attr("style", `color: ${y.get("stroke") ?? m};`);
  }
  return u.attr(
    "transform",
    `translate(${-h.width / 2 - (h.x - (h.left ?? 0))},${f ? -S / 2 : S / 2 - h.height})`
  ), O.attr(
    "transform",
    `translate(0,${f ? h.height / 2 + C / 2 : -h.height / 2 - C / 2})`
  ), Q(e, D), e.intersect = function(W) {
    if (R.info("iconSquare intersect", e, W), !e.label)
      return U.rect(e, W);
    const N = e.x ?? 0, $ = e.y ?? 0, F = e.height ?? 0;
    let A = [];
    return f ? A = [
      { x: N - h.width / 2, y: $ - F / 2 },
      { x: N + h.width / 2, y: $ - F / 2 },
      { x: N + h.width / 2, y: $ - F / 2 + h.height + C },
      { x: N + g / 2, y: $ - F / 2 + h.height + C },
      { x: N + g / 2, y: $ + F / 2 },
      { x: N - g / 2, y: $ + F / 2 },
      { x: N - g / 2, y: $ - F / 2 + h.height + C },
      { x: N - h.width / 2, y: $ - F / 2 + h.height + C }
    ] : A = [
      { x: N - g / 2, y: $ - F / 2 },
      { x: N + g / 2, y: $ - F / 2 },
      { x: N + g / 2, y: $ - F / 2 + d },
      { x: N + h.width / 2, y: $ - F / 2 + d },
      { x: N + h.width / 2 / 2, y: $ + F / 2 },
      { x: N - h.width / 2, y: $ + F / 2 },
      { x: N - h.width / 2, y: $ - F / 2 + d },
      { x: N - g / 2, y: $ - F / 2 + d }
    ], U.polygon(e, A, W);
  }, c;
}
p(ty, "icon");
async function ey(t, e, { config: { themeVariables: r, flowchart: i } }) {
  const { labelStyles: n } = K(e);
  e.labelStyle = n;
  const s = e.assetHeight ?? 48, a = e.assetWidth ?? 48, o = Math.max(s, a), l = i?.wrappingWidth;
  e.width = Math.max(o, l ?? 0);
  const { shapeSvg: c, bbox: h, label: u } = await at(t, e, "icon-shape default"), f = 20, d = e.label ? 8 : 0, g = e.pos === "t", { nodeBorder: m, mainBkg: y } = r, { stylesMap: x } = ki(e), b = G.svg(c), C = V(e, {});
  e.look !== "handDrawn" && (C.roughness = 0, C.fillStyle = "solid");
  const k = x.get("fill");
  C.stroke = k ?? y;
  const _ = c.append("g");
  e.icon && _.html(
    `<g>${await Bn(e.icon, {
      height: o,
      width: o,
      fallbackPrefix: ""
    })}</g>`
  );
  const E = _.node().getBBox(), B = E.width, S = E.height, I = E.x, O = E.y, D = Math.max(B, S) * Math.SQRT2 + f * 2, W = b.circle(0, 0, D, C), N = Math.max(D, h.width), $ = D + h.height + d, F = b.rectangle(-N / 2, -$ / 2, N, $, {
    ...C,
    fill: "transparent",
    stroke: "none"
  }), A = c.insert(() => W, ":first-child"), L = c.insert(() => F);
  return _.attr(
    "transform",
    `translate(${-B / 2 - I},${g ? h.height / 2 + d / 2 - S / 2 - O : -h.height / 2 - d / 2 - S / 2 - O})`
  ), _.attr("style", `color: ${x.get("stroke") ?? m};`), u.attr(
    "transform",
    `translate(${-h.width / 2 - (h.x - (h.left ?? 0))},${g ? -$ / 2 : $ / 2 - h.height})`
  ), A.attr(
    "transform",
    `translate(0,${g ? h.height / 2 + d / 2 : -h.height / 2 - d / 2})`
  ), Q(e, L), e.intersect = function(M) {
    return R.info("iconSquare intersect", e, M), U.rect(e, M);
  }, c;
}
p(ey, "iconCircle");
async function ry(t, e, { config: { themeVariables: r, flowchart: i } }) {
  const { labelStyles: n } = K(e);
  e.labelStyle = n;
  const s = e.assetHeight ?? 48, a = e.assetWidth ?? 48, o = Math.max(s, a), l = i?.wrappingWidth;
  e.width = Math.max(o, l ?? 0);
  const { shapeSvg: c, bbox: h, halfPadding: u, label: f } = await at(
    t,
    e,
    "icon-shape default"
  ), d = e.pos === "t", g = o + u * 2, m = o + u * 2, { nodeBorder: y, mainBkg: x } = r, { stylesMap: b } = ki(e), C = -m / 2, k = -g / 2, _ = e.label ? 8 : 0, E = G.svg(c), B = V(e, {});
  e.look !== "handDrawn" && (B.roughness = 0, B.fillStyle = "solid");
  const S = b.get("fill");
  B.stroke = S ?? x;
  const I = E.path(dr(C, k, m, g, 5), B), O = Math.max(m, h.width), D = g + h.height + _, W = E.rectangle(-O / 2, -D / 2, O, D, {
    ...B,
    fill: "transparent",
    stroke: "none"
  }), N = c.insert(() => I, ":first-child").attr("class", "icon-shape2"), $ = c.insert(() => W);
  if (e.icon) {
    const F = c.append("g");
    F.html(
      `<g>${await Bn(e.icon, {
        height: o,
        width: o,
        fallbackPrefix: ""
      })}</g>`
    );
    const A = F.node().getBBox(), L = A.width, M = A.height, H = A.x, Y = A.y;
    F.attr(
      "transform",
      `translate(${-L / 2 - H},${d ? h.height / 2 + _ / 2 - M / 2 - Y : -h.height / 2 - _ / 2 - M / 2 - Y})`
    ), F.attr("style", `color: ${b.get("stroke") ?? y};`);
  }
  return f.attr(
    "transform",
    `translate(${-h.width / 2 - (h.x - (h.left ?? 0))},${d ? -D / 2 : D / 2 - h.height})`
  ), N.attr(
    "transform",
    `translate(0,${d ? h.height / 2 + _ / 2 : -h.height / 2 - _ / 2})`
  ), Q(e, $), e.intersect = function(F) {
    if (R.info("iconSquare intersect", e, F), !e.label)
      return U.rect(e, F);
    const A = e.x ?? 0, L = e.y ?? 0, M = e.height ?? 0;
    let H = [];
    return d ? H = [
      { x: A - h.width / 2, y: L - M / 2 },
      { x: A + h.width / 2, y: L - M / 2 },
      { x: A + h.width / 2, y: L - M / 2 + h.height + _ },
      { x: A + m / 2, y: L - M / 2 + h.height + _ },
      { x: A + m / 2, y: L + M / 2 },
      { x: A - m / 2, y: L + M / 2 },
      { x: A - m / 2, y: L - M / 2 + h.height + _ },
      { x: A - h.width / 2, y: L - M / 2 + h.height + _ }
    ] : H = [
      { x: A - m / 2, y: L - M / 2 },
      { x: A + m / 2, y: L - M / 2 },
      { x: A + m / 2, y: L - M / 2 + g },
      { x: A + h.width / 2, y: L - M / 2 + g },
      { x: A + h.width / 2 / 2, y: L + M / 2 },
      { x: A - h.width / 2, y: L + M / 2 },
      { x: A - h.width / 2, y: L - M / 2 + g },
      { x: A - m / 2, y: L - M / 2 + g }
    ], U.polygon(e, H, F);
  }, c;
}
p(ry, "iconRounded");
async function iy(t, e, { config: { themeVariables: r, flowchart: i } }) {
  const { labelStyles: n } = K(e);
  e.labelStyle = n;
  const s = e.assetHeight ?? 48, a = e.assetWidth ?? 48, o = Math.max(s, a), l = i?.wrappingWidth;
  e.width = Math.max(o, l ?? 0);
  const { shapeSvg: c, bbox: h, halfPadding: u, label: f } = await at(
    t,
    e,
    "icon-shape default"
  ), d = e.pos === "t", g = o + u * 2, m = o + u * 2, { nodeBorder: y, mainBkg: x } = r, { stylesMap: b } = ki(e), C = -m / 2, k = -g / 2, _ = e.label ? 8 : 0, E = G.svg(c), B = V(e, {});
  e.look !== "handDrawn" && (B.roughness = 0, B.fillStyle = "solid");
  const S = b.get("fill");
  B.stroke = S ?? x;
  const I = E.path(dr(C, k, m, g, 0.1), B), O = Math.max(m, h.width), D = g + h.height + _, W = E.rectangle(-O / 2, -D / 2, O, D, {
    ...B,
    fill: "transparent",
    stroke: "none"
  }), N = c.insert(() => I, ":first-child"), $ = c.insert(() => W);
  if (e.icon) {
    const F = c.append("g");
    F.html(
      `<g>${await Bn(e.icon, {
        height: o,
        width: o,
        fallbackPrefix: ""
      })}</g>`
    );
    const A = F.node().getBBox(), L = A.width, M = A.height, H = A.x, Y = A.y;
    F.attr(
      "transform",
      `translate(${-L / 2 - H},${d ? h.height / 2 + _ / 2 - M / 2 - Y : -h.height / 2 - _ / 2 - M / 2 - Y})`
    ), F.attr("style", `color: ${b.get("stroke") ?? y};`);
  }
  return f.attr(
    "transform",
    `translate(${-h.width / 2 - (h.x - (h.left ?? 0))},${d ? -D / 2 : D / 2 - h.height})`
  ), N.attr(
    "transform",
    `translate(0,${d ? h.height / 2 + _ / 2 : -h.height / 2 - _ / 2})`
  ), Q(e, $), e.intersect = function(F) {
    if (R.info("iconSquare intersect", e, F), !e.label)
      return U.rect(e, F);
    const A = e.x ?? 0, L = e.y ?? 0, M = e.height ?? 0;
    let H = [];
    return d ? H = [
      { x: A - h.width / 2, y: L - M / 2 },
      { x: A + h.width / 2, y: L - M / 2 },
      { x: A + h.width / 2, y: L - M / 2 + h.height + _ },
      { x: A + m / 2, y: L - M / 2 + h.height + _ },
      { x: A + m / 2, y: L + M / 2 },
      { x: A - m / 2, y: L + M / 2 },
      { x: A - m / 2, y: L - M / 2 + h.height + _ },
      { x: A - h.width / 2, y: L - M / 2 + h.height + _ }
    ] : H = [
      { x: A - m / 2, y: L - M / 2 },
      { x: A + m / 2, y: L - M / 2 },
      { x: A + m / 2, y: L - M / 2 + g },
      { x: A + h.width / 2, y: L - M / 2 + g },
      { x: A + h.width / 2 / 2, y: L + M / 2 },
      { x: A - h.width / 2, y: L + M / 2 },
      { x: A - h.width / 2, y: L - M / 2 + g },
      { x: A - m / 2, y: L - M / 2 + g }
    ], U.polygon(e, H, F);
  }, c;
}
p(iy, "iconSquare");
async function ny(t, e, { config: { flowchart: r } }) {
  const i = new Image();
  i.src = e?.img ?? "", await i.decode();
  const n = Number(i.naturalWidth.toString().replace("px", "")), s = Number(i.naturalHeight.toString().replace("px", ""));
  e.imageAspectRatio = n / s;
  const { labelStyles: a } = K(e);
  e.labelStyle = a;
  const o = r?.wrappingWidth;
  e.defaultWidth = r?.wrappingWidth;
  const l = Math.max(
    e.label ? o ?? 0 : 0,
    e?.assetWidth ?? n
  ), c = e.constraint === "on" && e?.assetHeight ? e.assetHeight * e.imageAspectRatio : l, h = e.constraint === "on" ? c / e.imageAspectRatio : e?.assetHeight ?? s;
  e.width = Math.max(c, o ?? 0);
  const { shapeSvg: u, bbox: f, label: d } = await at(t, e, "image-shape default"), g = e.pos === "t", m = -c / 2, y = -h / 2, x = e.label ? 8 : 0, b = G.svg(u), C = V(e, {});
  e.look !== "handDrawn" && (C.roughness = 0, C.fillStyle = "solid");
  const k = b.rectangle(m, y, c, h, C), _ = Math.max(c, f.width), E = h + f.height + x, B = b.rectangle(-_ / 2, -E / 2, _, E, {
    ...C,
    fill: "none",
    stroke: "none"
  }), S = u.insert(() => k, ":first-child"), I = u.insert(() => B);
  if (e.img) {
    const O = u.append("image");
    O.attr("href", e.img), O.attr("width", c), O.attr("height", h), O.attr("preserveAspectRatio", "none"), O.attr(
      "transform",
      `translate(${-c / 2},${g ? E / 2 - h : -E / 2})`
    );
  }
  return d.attr(
    "transform",
    `translate(${-f.width / 2 - (f.x - (f.left ?? 0))},${g ? -h / 2 - f.height / 2 - x / 2 : h / 2 - f.height / 2 + x / 2})`
  ), S.attr(
    "transform",
    `translate(0,${g ? f.height / 2 + x / 2 : -f.height / 2 - x / 2})`
  ), Q(e, I), e.intersect = function(O) {
    if (R.info("iconSquare intersect", e, O), !e.label)
      return U.rect(e, O);
    const D = e.x ?? 0, W = e.y ?? 0, N = e.height ?? 0;
    let $ = [];
    return g ? $ = [
      { x: D - f.width / 2, y: W - N / 2 },
      { x: D + f.width / 2, y: W - N / 2 },
      { x: D + f.width / 2, y: W - N / 2 + f.height + x },
      { x: D + c / 2, y: W - N / 2 + f.height + x },
      { x: D + c / 2, y: W + N / 2 },
      { x: D - c / 2, y: W + N / 2 },
      { x: D - c / 2, y: W - N / 2 + f.height + x },
      { x: D - f.width / 2, y: W - N / 2 + f.height + x }
    ] : $ = [
      { x: D - c / 2, y: W - N / 2 },
      { x: D + c / 2, y: W - N / 2 },
      { x: D + c / 2, y: W - N / 2 + h },
      { x: D + f.width / 2, y: W - N / 2 + h },
      { x: D + f.width / 2 / 2, y: W + N / 2 },
      { x: D - f.width / 2, y: W + N / 2 },
      { x: D - f.width / 2, y: W - N / 2 + h },
      { x: D - c / 2, y: W - N / 2 + h }
    ], U.polygon(e, $, O);
  }, u;
}
p(ny, "imageSquare");
async function sy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), o = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), l = [
    { x: 0, y: 0 },
    { x: a, y: 0 },
    { x: a + 3 * o / 6, y: -o },
    { x: -3 * o / 6, y: -o }
  ];
  let c;
  const { cssStyles: h } = e;
  if (e.look === "handDrawn") {
    const u = G.svg(n), f = V(e, {}), d = ft(l), g = u.path(d, f);
    c = n.insert(() => g, ":first-child").attr("transform", `translate(${-a / 2}, ${o / 2})`), h && c.attr("style", h);
  } else
    c = pr(n, a, o, l);
  return i && c.attr("style", i), e.width = a, e.height = o, Q(e, c), e.intersect = function(u) {
    return U.polygon(e, l, u);
  }, n;
}
p(sy, "inv_trapezoid");
async function Ta(t, e, r) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.labelStyle = i;
  const { shapeSvg: s, bbox: a } = await at(t, e, st(e)), o = Math.max(a.width + r.labelPaddingX * 2, e?.width || 0), l = Math.max(a.height + r.labelPaddingY * 2, e?.height || 0), c = -o / 2, h = -l / 2;
  let u, { rx: f, ry: d } = e;
  const { cssStyles: g } = e;
  if (r?.rx && r.ry && (f = r.rx, d = r.ry), e.look === "handDrawn") {
    const m = G.svg(s), y = V(e, {}), x = f || d ? m.path(dr(c, h, o, l, f || 0), y) : m.rectangle(c, h, o, l, y);
    u = s.insert(() => x, ":first-child"), u.attr("class", "basic label-container").attr("style", jt(g));
  } else
    u = s.insert("rect", ":first-child"), u.attr("class", "basic label-container").attr("style", n).attr("rx", jt(f)).attr("ry", jt(d)).attr("x", c).attr("y", h).attr("width", o).attr("height", l);
  return Q(e, u), e.calcIntersect = function(m, y) {
    return U.rect(m, y);
  }, e.intersect = function(m) {
    return U.rect(e, m);
  }, s;
}
p(Ta, "drawRect");
async function ay(t, e) {
  const { shapeSvg: r, bbox: i, label: n } = await at(t, e, "label"), s = r.insert("rect", ":first-child");
  return s.attr("width", 0.1).attr("height", 0.1), r.attr("class", "label edgeLabel"), n.attr(
    "transform",
    `translate(${-(i.width / 2) - (i.x - (i.left ?? 0))}, ${-(i.height / 2) - (i.y - (i.top ?? 0))})`
  ), Q(e, s), e.intersect = function(l) {
    return U.rect(e, l);
  }, r;
}
p(ay, "labelRect");
async function oy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = Math.max(s.width + (e.padding ?? 0), e?.width ?? 0), o = Math.max(s.height + (e.padding ?? 0), e?.height ?? 0), l = [
    { x: 0, y: 0 },
    { x: a + 3 * o / 6, y: 0 },
    { x: a, y: -o },
    { x: -(3 * o) / 6, y: -o }
  ];
  let c;
  const { cssStyles: h } = e;
  if (e.look === "handDrawn") {
    const u = G.svg(n), f = V(e, {}), d = ft(l), g = u.path(d, f);
    c = n.insert(() => g, ":first-child").attr("transform", `translate(${-a / 2}, ${o / 2})`), h && c.attr("style", h);
  } else
    c = pr(n, a, o, l);
  return i && c.attr("style", i), e.width = a, e.height = o, Q(e, c), e.intersect = function(u) {
    return U.polygon(e, l, u);
  }, n;
}
p(oy, "lean_left");
async function ly(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = Math.max(s.width + (e.padding ?? 0), e?.width ?? 0), o = Math.max(s.height + (e.padding ?? 0), e?.height ?? 0), l = [
    { x: -3 * o / 6, y: 0 },
    { x: a, y: 0 },
    { x: a + 3 * o / 6, y: -o },
    { x: 0, y: -o }
  ];
  let c;
  const { cssStyles: h } = e;
  if (e.look === "handDrawn") {
    const u = G.svg(n), f = V(e, {}), d = ft(l), g = u.path(d, f);
    c = n.insert(() => g, ":first-child").attr("transform", `translate(${-a / 2}, ${o / 2})`), h && c.attr("style", h);
  } else
    c = pr(n, a, o, l);
  return i && c.attr("style", i), e.width = a, e.height = o, Q(e, c), e.intersect = function(u) {
    return U.polygon(e, l, u);
  }, n;
}
p(ly, "lean_right");
function cy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.label = "", e.labelStyle = r;
  const n = t.insert("g").attr("class", st(e)).attr("id", e.domId ?? e.id), { cssStyles: s } = e, a = Math.max(35, e?.width ?? 0), o = Math.max(35, e?.height ?? 0), l = 7, c = [
    { x: a, y: 0 },
    { x: 0, y: o + l / 2 },
    { x: a - 2 * l, y: o + l / 2 },
    { x: 0, y: 2 * o },
    { x: a, y: o - l / 2 },
    { x: 2 * l, y: o - l / 2 }
  ], h = G.svg(n), u = V(e, {});
  e.look !== "handDrawn" && (u.roughness = 0, u.fillStyle = "solid");
  const f = ft(c), d = h.path(f, u), g = n.insert(() => d, ":first-child");
  return s && e.look !== "handDrawn" && g.selectAll("path").attr("style", s), i && e.look !== "handDrawn" && g.selectAll("path").attr("style", i), g.attr("transform", `translate(-${a / 2},${-o})`), Q(e, g), e.intersect = function(m) {
    return R.info("lightningBolt intersect", e, m), U.polygon(e, c, m);
  }, n;
}
p(cy, "lightningBolt");
var dL = /* @__PURE__ */ p((t, e, r, i, n, s, a) => [
  `M${t},${e + s}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `a${n},${s} 0,0,0 ${-r},0`,
  `l0,${i}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `l0,${-i}`,
  `M${t},${e + s + a}`,
  `a${n},${s} 0,0,0 ${r},0`
].join(" "), "createCylinderPathD"), pL = /* @__PURE__ */ p((t, e, r, i, n, s, a) => [
  `M${t},${e + s}`,
  `M${t + r},${e + s}`,
  `a${n},${s} 0,0,0 ${-r},0`,
  `l0,${i}`,
  `a${n},${s} 0,0,0 ${r},0`,
  `l0,${-i}`,
  `M${t},${e + s + a}`,
  `a${n},${s} 0,0,0 ${r},0`
].join(" "), "createOuterCylinderPathD"), gL = /* @__PURE__ */ p((t, e, r, i, n, s) => [`M${t - r / 2},${-i / 2}`, `a${n},${s} 0,0,0 ${r},0`].join(" "), "createInnerCylinderPathD");
async function hy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0), e.width ?? 0), l = o / 2, c = l / (2.5 + o / 50), h = Math.max(s.height + c + (e.padding ?? 0), e.height ?? 0), u = h * 0.1;
  let f;
  const { cssStyles: d } = e;
  if (e.look === "handDrawn") {
    const g = G.svg(n), m = pL(0, 0, o, h, l, c, u), y = gL(0, c, o, h, l, c), x = V(e, {}), b = g.path(m, x), C = g.path(y, x);
    n.insert(() => C, ":first-child").attr("class", "line"), f = n.insert(() => b, ":first-child"), f.attr("class", "basic label-container"), d && f.attr("style", d);
  } else {
    const g = dL(0, 0, o, h, l, c, u);
    f = n.insert("path", ":first-child").attr("d", g).attr("class", "basic label-container").attr("style", jt(d)).attr("style", i);
  }
  return f.attr("label-offset-y", c), f.attr("transform", `translate(${-o / 2}, ${-(h / 2 + c)})`), Q(e, f), a.attr(
    "transform",
    `translate(${-(s.width / 2) - (s.x - (s.left ?? 0))}, ${-(s.height / 2) + c - (s.y - (s.top ?? 0))})`
  ), e.intersect = function(g) {
    const m = U.rect(e, g), y = m.x - (e.x ?? 0);
    if (l != 0 && (Math.abs(y) < (e.width ?? 0) / 2 || Math.abs(y) == (e.width ?? 0) / 2 && Math.abs(m.y - (e.y ?? 0)) > (e.height ?? 0) / 2 - c)) {
      let x = c * c * (1 - y * y / (l * l));
      x > 0 && (x = Math.sqrt(x)), x = c - x, g.y - (e.y ?? 0) > 0 && (x = -x), m.y += x;
    }
    return m;
  }, n;
}
p(hy, "linedCylinder");
async function uy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = l / 4, h = l + c, { cssStyles: u } = e, f = G.svg(n), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = [
    { x: -o / 2 - o / 2 * 0.1, y: -h / 2 },
    { x: -o / 2 - o / 2 * 0.1, y: h / 2 },
    ...hr(
      -o / 2 - o / 2 * 0.1,
      h / 2,
      o / 2 + o / 2 * 0.1,
      h / 2,
      c,
      0.8
    ),
    { x: o / 2 + o / 2 * 0.1, y: -h / 2 },
    { x: -o / 2 - o / 2 * 0.1, y: -h / 2 },
    { x: -o / 2, y: -h / 2 },
    { x: -o / 2, y: h / 2 * 1.1 },
    { x: -o / 2, y: -h / 2 }
  ], m = f.polygon(
    g.map((x) => [x.x, x.y]),
    d
  ), y = n.insert(() => m, ":first-child");
  return y.attr("class", "basic label-container"), u && e.look !== "handDrawn" && y.selectAll("path").attr("style", u), i && e.look !== "handDrawn" && y.selectAll("path").attr("style", i), y.attr("transform", `translate(0,${-c / 2})`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) + o / 2 * 0.1 / 2 - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) - c / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, y), e.intersect = function(x) {
    return U.polygon(e, g, x);
  }, n;
}
p(uy, "linedWaveEdgedRect");
async function fy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = 5, h = -o / 2, u = -l / 2, { cssStyles: f } = e, d = G.svg(n), g = V(e, {}), m = [
    { x: h - c, y: u + c },
    { x: h - c, y: u + l + c },
    { x: h + o - c, y: u + l + c },
    { x: h + o - c, y: u + l },
    { x: h + o, y: u + l },
    { x: h + o, y: u + l - c },
    { x: h + o + c, y: u + l - c },
    { x: h + o + c, y: u - c },
    { x: h + c, y: u - c },
    { x: h + c, y: u },
    { x: h, y: u },
    { x: h, y: u + c }
  ], y = [
    { x: h, y: u + c },
    { x: h + o - c, y: u + c },
    { x: h + o - c, y: u + l },
    { x: h + o, y: u + l },
    { x: h + o, y: u },
    { x: h, y: u }
  ];
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const x = ft(m), b = d.path(x, g), C = ft(y), k = d.path(C, { ...g, fill: "none" }), _ = n.insert(() => k, ":first-child");
  return _.insert(() => b, ":first-child"), _.attr("class", "basic label-container"), f && e.look !== "handDrawn" && _.selectAll("path").attr("style", f), i && e.look !== "handDrawn" && _.selectAll("path").attr("style", i), a.attr(
    "transform",
    `translate(${-(s.width / 2) - c - (s.x - (s.left ?? 0))}, ${-(s.height / 2) + c - (s.y - (s.top ?? 0))})`
  ), Q(e, _), e.intersect = function(E) {
    return U.polygon(e, m, E);
  }, n;
}
p(fy, "multiRect");
async function dy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = l / 4, h = l + c, u = -o / 2, f = -h / 2, d = 5, { cssStyles: g } = e, m = hr(
    u - d,
    f + h + d,
    u + o - d,
    f + h + d,
    c,
    0.8
  ), y = m?.[m.length - 1], x = [
    { x: u - d, y: f + d },
    { x: u - d, y: f + h + d },
    ...m,
    { x: u + o - d, y: y.y - d },
    { x: u + o, y: y.y - d },
    { x: u + o, y: y.y - 2 * d },
    { x: u + o + d, y: y.y - 2 * d },
    { x: u + o + d, y: f - d },
    { x: u + d, y: f - d },
    { x: u + d, y: f },
    { x: u, y: f },
    { x: u, y: f + d }
  ], b = [
    { x: u, y: f + d },
    { x: u + o - d, y: f + d },
    { x: u + o - d, y: y.y - d },
    { x: u + o, y: y.y - d },
    { x: u + o, y: f },
    { x: u, y: f }
  ], C = G.svg(n), k = V(e, {});
  e.look !== "handDrawn" && (k.roughness = 0, k.fillStyle = "solid");
  const _ = ft(x), E = C.path(_, k), B = ft(b), S = C.path(B, k), I = n.insert(() => E, ":first-child");
  return I.insert(() => S), I.attr("class", "basic label-container"), g && e.look !== "handDrawn" && I.selectAll("path").attr("style", g), i && e.look !== "handDrawn" && I.selectAll("path").attr("style", i), I.attr("transform", `translate(0,${-c / 2})`), a.attr(
    "transform",
    `translate(${-(s.width / 2) - d - (s.x - (s.left ?? 0))}, ${-(s.height / 2) + d - c / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, I), e.intersect = function(O) {
    return U.polygon(e, x, O);
  }, n;
}
p(dy, "multiWaveEdgedRectangle");
async function py(t, e, { config: { themeVariables: r } }) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.labelStyle = i, e.useHtmlLabels || Ht().flowchart?.htmlLabels !== !1 || (e.centerLabel = !0);
  const { shapeSvg: a, bbox: o, label: l } = await at(t, e, st(e)), c = Math.max(o.width + (e.padding ?? 0) * 2, e?.width ?? 0), h = Math.max(o.height + (e.padding ?? 0) * 2, e?.height ?? 0), u = -c / 2, f = -h / 2, { cssStyles: d } = e, g = G.svg(a), m = V(e, {
    fill: r.noteBkgColor,
    stroke: r.noteBorderColor
  });
  e.look !== "handDrawn" && (m.roughness = 0, m.fillStyle = "solid");
  const y = g.rectangle(u, f, c, h, m), x = a.insert(() => y, ":first-child");
  return x.attr("class", "basic label-container"), d && e.look !== "handDrawn" && x.selectAll("path").attr("style", d), n && e.look !== "handDrawn" && x.selectAll("path").attr("style", n), l.attr(
    "transform",
    `translate(${-o.width / 2 - (o.x - (o.left ?? 0))}, ${-(o.height / 2) - (o.y - (o.top ?? 0))})`
  ), Q(e, x), e.intersect = function(b) {
    return U.rect(e, b);
  }, a;
}
p(py, "note");
var mL = /* @__PURE__ */ p((t, e, r) => [
  `M${t + r / 2},${e}`,
  `L${t + r},${e - r / 2}`,
  `L${t + r / 2},${e - r}`,
  `L${t},${e - r / 2}`,
  "Z"
].join(" "), "createDecisionBoxPathD");
async function gy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.width + e.padding, o = s.height + e.padding, l = a + o, c = 0.5, h = [
    { x: l / 2, y: 0 },
    { x: l, y: -l / 2 },
    { x: l / 2, y: -l },
    { x: 0, y: -l / 2 }
  ];
  let u;
  const { cssStyles: f } = e;
  if (e.look === "handDrawn") {
    const d = G.svg(n), g = V(e, {}), m = mL(0, 0, l), y = d.path(m, g);
    u = n.insert(() => y, ":first-child").attr("transform", `translate(${-l / 2 + c}, ${l / 2})`), f && u.attr("style", f);
  } else
    u = pr(n, l, l, h), u.attr("transform", `translate(${-l / 2 + c}, ${l / 2})`);
  return i && u.attr("style", i), Q(e, u), e.calcIntersect = function(d, g) {
    const m = d.width, y = [
      { x: m / 2, y: 0 },
      { x: m, y: -m / 2 },
      { x: m / 2, y: -m },
      { x: 0, y: -m / 2 }
    ], x = U.polygon(d, y, g);
    return { x: x.x - 0.5, y: x.y - 0.5 };
  }, e.intersect = function(d) {
    return this.calcIntersect(e, d);
  }, n;
}
p(gy, "question");
async function my(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0), e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0), e?.height ?? 0), c = -o / 2, h = -l / 2, u = h / 2, f = [
    { x: c + u, y: h },
    { x: c, y: 0 },
    { x: c + u, y: -h },
    { x: -c, y: -h },
    { x: -c, y: h }
  ], { cssStyles: d } = e, g = G.svg(n), m = V(e, {});
  e.look !== "handDrawn" && (m.roughness = 0, m.fillStyle = "solid");
  const y = ft(f), x = g.path(y, m), b = n.insert(() => x, ":first-child");
  return b.attr("class", "basic label-container"), d && e.look !== "handDrawn" && b.selectAll("path").attr("style", d), i && e.look !== "handDrawn" && b.selectAll("path").attr("style", i), b.attr("transform", `translate(${-u / 2},0)`), a.attr(
    "transform",
    `translate(${-u / 2 - s.width / 2 - (s.x - (s.left ?? 0))}, ${-(s.height / 2) - (s.y - (s.top ?? 0))})`
  ), Q(e, b), e.intersect = function(C) {
    return U.polygon(e, f, C);
  }, n;
}
p(my, "rect_left_inv_arrow");
async function yy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  let n;
  e.cssClasses ? n = "node " + e.cssClasses : n = "node default";
  const s = t.insert("g").attr("class", n).attr("id", e.domId || e.id), a = s.insert("g"), o = s.insert("g").attr("class", "label").attr("style", i), l = e.description, c = e.label, h = o.node().appendChild(await Er(c, e.labelStyle, !0, !0));
  let u = { width: 0, height: 0 };
  if (Dt(yt()?.flowchart?.htmlLabels)) {
    const S = h.children[0], I = dt(h);
    u = S.getBoundingClientRect(), I.attr("width", u.width), I.attr("height", u.height);
  }
  R.info("Text 2", l);
  const f = l || [], d = h.getBBox(), g = o.node().appendChild(
    await Er(
      f.join ? f.join("<br/>") : f,
      e.labelStyle,
      !0,
      !0
    )
  ), m = g.children[0], y = dt(g);
  u = m.getBoundingClientRect(), y.attr("width", u.width), y.attr("height", u.height);
  const x = (e.padding || 0) / 2;
  dt(g).attr(
    "transform",
    "translate( " + (u.width > d.width ? 0 : (d.width - u.width) / 2) + ", " + (d.height + x + 5) + ")"
  ), dt(h).attr(
    "transform",
    "translate( " + (u.width < d.width ? 0 : -(d.width - u.width) / 2) + ", 0)"
  ), u = o.node().getBBox(), o.attr(
    "transform",
    "translate(" + -u.width / 2 + ", " + (-u.height / 2 - x + 3) + ")"
  );
  const b = u.width + (e.padding || 0), C = u.height + (e.padding || 0), k = -u.width / 2 - x, _ = -u.height / 2 - x;
  let E, B;
  if (e.look === "handDrawn") {
    const S = G.svg(s), I = V(e, {}), O = S.path(
      dr(k, _, b, C, e.rx || 0),
      I
    ), D = S.line(
      -u.width / 2 - x,
      -u.height / 2 - x + d.height + x,
      u.width / 2 + x,
      -u.height / 2 - x + d.height + x,
      I
    );
    B = s.insert(() => (R.debug("Rough node insert CXC", O), D), ":first-child"), E = s.insert(() => (R.debug("Rough node insert CXC", O), O), ":first-child");
  } else
    E = a.insert("rect", ":first-child"), B = a.insert("line"), E.attr("class", "outer title-state").attr("style", i).attr("x", -u.width / 2 - x).attr("y", -u.height / 2 - x).attr("width", u.width + (e.padding || 0)).attr("height", u.height + (e.padding || 0)), B.attr("class", "divider").attr("x1", -u.width / 2 - x).attr("x2", u.width / 2 + x).attr("y1", -u.height / 2 - x + d.height + x).attr("y2", -u.height / 2 - x + d.height + x);
  return Q(e, E), e.intersect = function(S) {
    return U.rect(e, S);
  }, s;
}
p(yy, "rectWithTitle");
function Vi(t, e, r, i, n, s, a) {
  const l = (t + r) / 2, c = (e + i) / 2, h = Math.atan2(i - e, r - t), u = (r - t) / 2, f = (i - e) / 2, d = u / n, g = f / s, m = Math.sqrt(d ** 2 + g ** 2);
  if (m > 1)
    throw new Error("The given radii are too small to create an arc between the points.");
  const y = Math.sqrt(1 - m ** 2), x = l + y * s * Math.sin(h) * (a ? -1 : 1), b = c - y * n * Math.cos(h) * (a ? -1 : 1), C = Math.atan2((e - b) / s, (t - x) / n);
  let _ = Math.atan2((i - b) / s, (r - x) / n) - C;
  a && _ < 0 && (_ += 2 * Math.PI), !a && _ > 0 && (_ -= 2 * Math.PI);
  const E = [];
  for (let B = 0; B < 20; B++) {
    const S = B / 19, I = C + S * _, O = x + n * Math.cos(I), D = b + s * Math.sin(I);
    E.push({ x: O, y: D });
  }
  return E;
}
p(Vi, "generateArcPoints");
async function xy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = e?.padding ?? 0, o = e?.padding ?? 0, l = (e?.width ? e?.width : s.width) + a * 2, c = (e?.height ? e?.height : s.height) + o * 2, h = e.radius || 5, u = e.taper || 5, { cssStyles: f } = e, d = G.svg(n), g = V(e, {});
  e.stroke && (g.stroke = e.stroke), e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const m = [
    // Top edge (left to right)
    { x: -l / 2 + u, y: -c / 2 },
    // Top-left corner start (1)
    { x: l / 2 - u, y: -c / 2 },
    // Top-right corner start (2)
    ...Vi(l / 2 - u, -c / 2, l / 2, -c / 2 + u, h, h, !0),
    // Top-left arc (2 to 3)
    // Right edge (top to bottom)
    { x: l / 2, y: -c / 2 + u },
    // Top-right taper point (3)
    { x: l / 2, y: c / 2 - u },
    // Bottom-right taper point (4)
    ...Vi(l / 2, c / 2 - u, l / 2 - u, c / 2, h, h, !0),
    // Top-left arc (4 to 5)
    // Bottom edge (right to left)
    { x: l / 2 - u, y: c / 2 },
    // Bottom-right corner start (5)
    { x: -l / 2 + u, y: c / 2 },
    // Bottom-left corner start (6)
    ...Vi(-l / 2 + u, c / 2, -l / 2, c / 2 - u, h, h, !0),
    // Top-left arc (4 to 5)
    // Left edge (bottom to top)
    { x: -l / 2, y: c / 2 - u },
    // Bottom-left taper point (7)
    { x: -l / 2, y: -c / 2 + u },
    // Top-left taper point (8)
    ...Vi(-l / 2, -c / 2 + u, -l / 2 + u, -c / 2, h, h, !0)
    // Top-left arc (4 to 5)
  ], y = ft(m), x = d.path(y, g), b = n.insert(() => x, ":first-child");
  return b.attr("class", "basic label-container outer-path"), f && e.look !== "handDrawn" && b.selectChildren("path").attr("style", f), i && e.look !== "handDrawn" && b.selectChildren("path").attr("style", i), Q(e, b), e.intersect = function(C) {
    return U.polygon(e, m, C);
  }, n;
}
p(xy, "roundedRect");
async function by(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = e?.padding ?? 0, l = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), c = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), h = -s.width / 2 - o, u = -s.height / 2 - o, { cssStyles: f } = e, d = G.svg(n), g = V(e, {});
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const m = [
    { x: h, y: u },
    { x: h + l + 8, y: u },
    { x: h + l + 8, y: u + c },
    { x: h - 8, y: u + c },
    { x: h - 8, y: u },
    { x: h, y: u },
    { x: h, y: u + c }
  ], y = d.polygon(
    m.map((b) => [b.x, b.y]),
    g
  ), x = n.insert(() => y, ":first-child");
  return x.attr("class", "basic label-container").attr("style", jt(f)), i && e.look !== "handDrawn" && x.selectAll("path").attr("style", i), f && e.look !== "handDrawn" && x.selectAll("path").attr("style", i), a.attr(
    "transform",
    `translate(${-l / 2 + 4 + (e.padding ?? 0) - (s.x - (s.left ?? 0))},${-c / 2 + (e.padding ?? 0) - (s.y - (s.top ?? 0))})`
  ), Q(e, x), e.intersect = function(b) {
    return U.rect(e, b);
  }, n;
}
p(by, "shadedProcess");
async function wy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = -o / 2, h = -l / 2, { cssStyles: u } = e, f = G.svg(n), d = V(e, {});
  e.look !== "handDrawn" && (d.roughness = 0, d.fillStyle = "solid");
  const g = [
    { x: c, y: h },
    { x: c, y: h + l },
    { x: c + o, y: h + l },
    { x: c + o, y: h - l / 2 }
  ], m = ft(g), y = f.path(m, d), x = n.insert(() => y, ":first-child");
  return x.attr("class", "basic label-container"), u && e.look !== "handDrawn" && x.selectChildren("path").attr("style", u), i && e.look !== "handDrawn" && x.selectChildren("path").attr("style", i), x.attr("transform", `translate(0, ${l / 4})`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) - (s.x - (s.left ?? 0))}, ${-l / 4 + (e.padding ?? 0) - (s.y - (s.top ?? 0))})`
  ), Q(e, x), e.intersect = function(b) {
    return U.polygon(e, g, b);
  }, n;
}
p(wy, "slopedRect");
async function Cy(t, e) {
  const r = {
    rx: 0,
    ry: 0,
    labelPaddingX: e.labelPaddingX ?? (e?.padding || 0) * 2,
    labelPaddingY: (e?.padding || 0) * 1
  };
  return Ta(t, e, r);
}
p(Cy, "squareRect");
async function _y(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.height + e.padding, o = s.width + a / 4 + e.padding, l = a / 2, { cssStyles: c } = e, h = G.svg(n), u = V(e, {});
  e.look !== "handDrawn" && (u.roughness = 0, u.fillStyle = "solid");
  const f = [
    { x: -o / 2 + l, y: -a / 2 },
    { x: o / 2 - l, y: -a / 2 },
    ...xn(-o / 2 + l, 0, l, 50, 90, 270),
    { x: o / 2 - l, y: a / 2 },
    ...xn(o / 2 - l, 0, l, 50, 270, 450)
  ], d = ft(f), g = h.path(d, u), m = n.insert(() => g, ":first-child");
  return m.attr("class", "basic label-container outer-path"), c && e.look !== "handDrawn" && m.selectChildren("path").attr("style", c), i && e.look !== "handDrawn" && m.selectChildren("path").attr("style", i), Q(e, m), e.intersect = function(y) {
    return U.polygon(e, f, y);
  }, n;
}
p(_y, "stadium");
async function ky(t, e) {
  return Ta(t, e, {
    rx: 5,
    ry: 5
  });
}
p(ky, "state");
function Sy(t, e, { config: { themeVariables: r } }) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.labelStyle = i;
  const { cssStyles: s } = e, { lineColor: a, stateBorder: o, nodeBorder: l } = r, c = t.insert("g").attr("class", "node default").attr("id", e.domId || e.id), h = G.svg(c), u = V(e, {});
  e.look !== "handDrawn" && (u.roughness = 0, u.fillStyle = "solid");
  const f = h.circle(0, 0, 14, {
    ...u,
    stroke: a,
    strokeWidth: 2
  }), d = o ?? l, g = h.circle(0, 0, 5, {
    ...u,
    fill: d,
    stroke: d,
    strokeWidth: 2,
    fillStyle: "solid"
  }), m = c.insert(() => f, ":first-child");
  return m.insert(() => g), s && m.selectAll("path").attr("style", s), n && m.selectAll("path").attr("style", n), Q(e, m), e.intersect = function(y) {
    return U.circle(e, 7, y);
  }, c;
}
p(Sy, "stateEnd");
function vy(t, e, { config: { themeVariables: r } }) {
  const { lineColor: i } = r, n = t.insert("g").attr("class", "node default").attr("id", e.domId || e.id);
  let s;
  if (e.look === "handDrawn") {
    const o = G.svg(n).circle(0, 0, 14, Mk(i));
    s = n.insert(() => o), s.attr("class", "state-start").attr("r", 7).attr("width", 14).attr("height", 14);
  } else
    s = n.insert("circle", ":first-child"), s.attr("class", "state-start").attr("r", 7).attr("width", 14).attr("height", 14);
  return Q(e, s), e.intersect = function(a) {
    return U.circle(e, 7, a);
  }, n;
}
p(vy, "stateStart");
async function Ty(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = (e?.padding || 0) / 2, o = s.width + e.padding, l = s.height + e.padding, c = -s.width / 2 - a, h = -s.height / 2 - a, u = [
    { x: 0, y: 0 },
    { x: o, y: 0 },
    { x: o, y: -l },
    { x: 0, y: -l },
    { x: 0, y: 0 },
    { x: -8, y: 0 },
    { x: o + 8, y: 0 },
    { x: o + 8, y: -l },
    { x: -8, y: -l },
    { x: -8, y: 0 }
  ];
  if (e.look === "handDrawn") {
    const f = G.svg(n), d = V(e, {}), g = f.rectangle(c - 8, h, o + 16, l, d), m = f.line(c, h, c, h + l, d), y = f.line(c + o, h, c + o, h + l, d);
    n.insert(() => m, ":first-child"), n.insert(() => y, ":first-child");
    const x = n.insert(() => g, ":first-child"), { cssStyles: b } = e;
    x.attr("class", "basic label-container").attr("style", jt(b)), Q(e, x);
  } else {
    const f = pr(n, o, l, u);
    i && f.attr("style", i), Q(e, f);
  }
  return e.intersect = function(f) {
    return U.polygon(e, u, f);
  }, n;
}
p(Ty, "subroutine");
async function Ay(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), o = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), l = -a / 2, c = -o / 2, h = 0.2 * o, u = 0.2 * o, { cssStyles: f } = e, d = G.svg(n), g = V(e, {}), m = [
    { x: l - h / 2, y: c },
    { x: l + a + h / 2, y: c },
    { x: l + a + h / 2, y: c + o },
    { x: l - h / 2, y: c + o }
  ], y = [
    { x: l + a - h / 2, y: c + o },
    { x: l + a + h / 2, y: c + o },
    { x: l + a + h / 2, y: c + o - u }
  ];
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const x = ft(m), b = d.path(x, g), C = ft(y), k = d.path(C, { ...g, fillStyle: "solid" }), _ = n.insert(() => k, ":first-child");
  return _.insert(() => b, ":first-child"), _.attr("class", "basic label-container"), f && e.look !== "handDrawn" && _.selectAll("path").attr("style", f), i && e.look !== "handDrawn" && _.selectAll("path").attr("style", i), Q(e, _), e.intersect = function(E) {
    return U.polygon(e, m, E);
  }, n;
}
p(Ay, "taggedRect");
async function Ly(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = l / 4, h = 0.2 * o, u = 0.2 * l, f = l + c, { cssStyles: d } = e, g = G.svg(n), m = V(e, {});
  e.look !== "handDrawn" && (m.roughness = 0, m.fillStyle = "solid");
  const y = [
    { x: -o / 2 - o / 2 * 0.1, y: f / 2 },
    ...hr(
      -o / 2 - o / 2 * 0.1,
      f / 2,
      o / 2 + o / 2 * 0.1,
      f / 2,
      c,
      0.8
    ),
    { x: o / 2 + o / 2 * 0.1, y: -f / 2 },
    { x: -o / 2 - o / 2 * 0.1, y: -f / 2 }
  ], x = -o / 2 + o / 2 * 0.1, b = -f / 2 - u * 0.4, C = [
    { x: x + o - h, y: (b + l) * 1.4 },
    { x: x + o, y: b + l - u },
    { x: x + o, y: (b + l) * 0.9 },
    ...hr(
      x + o,
      (b + l) * 1.3,
      x + o - h,
      (b + l) * 1.5,
      -l * 0.03,
      0.5
    )
  ], k = ft(y), _ = g.path(k, m), E = ft(C), B = g.path(E, {
    ...m,
    fillStyle: "solid"
  }), S = n.insert(() => B, ":first-child");
  return S.insert(() => _, ":first-child"), S.attr("class", "basic label-container"), d && e.look !== "handDrawn" && S.selectAll("path").attr("style", d), i && e.look !== "handDrawn" && S.selectAll("path").attr("style", i), S.attr("transform", `translate(0,${-c / 2})`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) - c / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, S), e.intersect = function(I) {
    return U.polygon(e, y, I);
  }, n;
}
p(Ly, "taggedWaveEdgedRectangle");
async function Ey(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = Math.max(s.width + e.padding, e?.width || 0), o = Math.max(s.height + e.padding, e?.height || 0), l = -a / 2, c = -o / 2, h = n.insert("rect", ":first-child");
  return h.attr("class", "text").attr("style", i).attr("rx", 0).attr("ry", 0).attr("x", l).attr("y", c).attr("width", a).attr("height", o), Q(e, h), e.intersect = function(u) {
    return U.rect(e, u);
  }, n;
}
p(Ey, "text");
var yL = /* @__PURE__ */ p((t, e, r, i, n, s) => `M${t},${e}
    a${n},${s} 0,0,1 0,${-i}
    l${r},0
    a${n},${s} 0,0,1 0,${i}
    M${r},${-i}
    a${n},${s} 0,0,0 0,${i}
    l${-r},0`, "createCylinderPathD"), xL = /* @__PURE__ */ p((t, e, r, i, n, s) => [
  `M${t},${e}`,
  `M${t + r},${e}`,
  `a${n},${s} 0,0,0 0,${-i}`,
  `l${-r},0`,
  `a${n},${s} 0,0,0 0,${i}`,
  `l${r},0`
].join(" "), "createOuterCylinderPathD"), bL = /* @__PURE__ */ p((t, e, r, i, n, s) => [`M${t + r / 2},${-i / 2}`, `a${n},${s} 0,0,0 0,${i}`].join(" "), "createInnerCylinderPathD");
async function By(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a, halfPadding: o } = await at(
    t,
    e,
    st(e)
  ), l = e.look === "neo" ? o * 2 : o, c = s.height + l, h = c / 2, u = h / (2.5 + c / 50), f = s.width + u + l, { cssStyles: d } = e;
  let g;
  if (e.look === "handDrawn") {
    const m = G.svg(n), y = xL(0, 0, f, c, u, h), x = bL(0, 0, f, c, u, h), b = m.path(y, V(e, {})), C = m.path(x, V(e, { fill: "none" }));
    g = n.insert(() => C, ":first-child"), g = n.insert(() => b, ":first-child"), g.attr("class", "basic label-container"), d && g.attr("style", d);
  } else {
    const m = yL(0, 0, f, c, u, h);
    g = n.insert("path", ":first-child").attr("d", m).attr("class", "basic label-container").attr("style", jt(d)).attr("style", i), g.attr("class", "basic label-container"), d && g.selectAll("path").attr("style", d), i && g.selectAll("path").attr("style", i);
  }
  return g.attr("label-offset-x", u), g.attr("transform", `translate(${-f / 2}, ${c / 2} )`), a.attr(
    "transform",
    `translate(${-(s.width / 2) - u - (s.x - (s.left ?? 0))}, ${-(s.height / 2) - (s.y - (s.top ?? 0))})`
  ), Q(e, g), e.intersect = function(m) {
    const y = U.rect(e, m), x = y.y - (e.y ?? 0);
    if (h != 0 && (Math.abs(x) < (e.height ?? 0) / 2 || Math.abs(x) == (e.height ?? 0) / 2 && Math.abs(y.x - (e.x ?? 0)) > (e.width ?? 0) / 2 - u)) {
      let b = u * u * (1 - x * x / (h * h));
      b != 0 && (b = Math.sqrt(Math.abs(b))), b = u - b, m.x - (e.x ?? 0) > 0 && (b = -b), y.x += b;
    }
    return y;
  }, n;
}
p(By, "tiltedCylinder");
async function My(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = s.width + e.padding, o = s.height + e.padding, l = [
    { x: -3 * o / 6, y: 0 },
    { x: a + 3 * o / 6, y: 0 },
    { x: a, y: -o },
    { x: 0, y: -o }
  ];
  let c;
  const { cssStyles: h } = e;
  if (e.look === "handDrawn") {
    const u = G.svg(n), f = V(e, {}), d = ft(l), g = u.path(d, f);
    c = n.insert(() => g, ":first-child").attr("transform", `translate(${-a / 2}, ${o / 2})`), h && c.attr("style", h);
  } else
    c = pr(n, a, o, l);
  return i && c.attr("style", i), e.width = a, e.height = o, Q(e, c), e.intersect = function(u) {
    return U.polygon(e, l, u);
  }, n;
}
p(My, "trapezoid");
async function $y(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = 60, o = 20, l = Math.max(a, s.width + (e.padding ?? 0) * 2, e?.width ?? 0), c = Math.max(o, s.height + (e.padding ?? 0) * 2, e?.height ?? 0), { cssStyles: h } = e, u = G.svg(n), f = V(e, {});
  e.look !== "handDrawn" && (f.roughness = 0, f.fillStyle = "solid");
  const d = [
    { x: -l / 2 * 0.8, y: -c / 2 },
    { x: l / 2 * 0.8, y: -c / 2 },
    { x: l / 2, y: -c / 2 * 0.6 },
    { x: l / 2, y: c / 2 },
    { x: -l / 2, y: c / 2 },
    { x: -l / 2, y: -c / 2 * 0.6 }
  ], g = ft(d), m = u.path(g, f), y = n.insert(() => m, ":first-child");
  return y.attr("class", "basic label-container"), h && e.look !== "handDrawn" && y.selectChildren("path").attr("style", h), i && e.look !== "handDrawn" && y.selectChildren("path").attr("style", i), Q(e, y), e.intersect = function(x) {
    return U.polygon(e, d, x);
  }, n;
}
p($y, "trapezoidalPentagon");
async function Fy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Dt(yt().flowchart?.htmlLabels), l = s.width + (e.padding ?? 0), c = l + s.height, h = l + s.height, u = [
    { x: 0, y: 0 },
    { x: h, y: 0 },
    { x: h / 2, y: -c }
  ], { cssStyles: f } = e, d = G.svg(n), g = V(e, {});
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const m = ft(u), y = d.path(m, g), x = n.insert(() => y, ":first-child").attr("transform", `translate(${-c / 2}, ${c / 2})`);
  return f && e.look !== "handDrawn" && x.selectChildren("path").attr("style", f), i && e.look !== "handDrawn" && x.selectChildren("path").attr("style", i), e.width = l, e.height = c, Q(e, x), a.attr(
    "transform",
    `translate(${-s.width / 2 - (s.x - (s.left ?? 0))}, ${c / 2 - (s.height + (e.padding ?? 0) / (o ? 2 : 1) - (s.y - (s.top ?? 0)))})`
  ), e.intersect = function(b) {
    return R.info("Triangle intersect", e, u, b), U.polygon(e, u, b);
  }, n;
}
p(Fy, "triangle");
async function Oy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = l / 8, h = l + c, { cssStyles: u } = e, d = 70 - o, g = d > 0 ? d / 2 : 0, m = G.svg(n), y = V(e, {});
  e.look !== "handDrawn" && (y.roughness = 0, y.fillStyle = "solid");
  const x = [
    { x: -o / 2 - g, y: h / 2 },
    ...hr(
      -o / 2 - g,
      h / 2,
      o / 2 + g,
      h / 2,
      c,
      0.8
    ),
    { x: o / 2 + g, y: -h / 2 },
    { x: -o / 2 - g, y: -h / 2 }
  ], b = ft(x), C = m.path(b, y), k = n.insert(() => C, ":first-child");
  return k.attr("class", "basic label-container"), u && e.look !== "handDrawn" && k.selectAll("path").attr("style", u), i && e.look !== "handDrawn" && k.selectAll("path").attr("style", i), k.attr("transform", `translate(0,${-c / 2})`), a.attr(
    "transform",
    `translate(${-o / 2 + (e.padding ?? 0) - (s.x - (s.left ?? 0))},${-l / 2 + (e.padding ?? 0) - c - (s.y - (s.top ?? 0))})`
  ), Q(e, k), e.intersect = function(_) {
    return U.polygon(e, x, _);
  }, n;
}
p(Oy, "waveEdgedRectangle");
async function Dy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s } = await at(t, e, st(e)), a = 100, o = 50, l = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), c = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), h = l / c;
  let u = l, f = c;
  u > f * h ? f = u / h : u = f * h, u = Math.max(u, a), f = Math.max(f, o);
  const d = Math.min(f * 0.2, f / 4), g = f + d * 2, { cssStyles: m } = e, y = G.svg(n), x = V(e, {});
  e.look !== "handDrawn" && (x.roughness = 0, x.fillStyle = "solid");
  const b = [
    { x: -u / 2, y: g / 2 },
    ...hr(-u / 2, g / 2, u / 2, g / 2, d, 1),
    { x: u / 2, y: -g / 2 },
    ...hr(u / 2, -g / 2, -u / 2, -g / 2, d, -1)
  ], C = ft(b), k = y.path(C, x), _ = n.insert(() => k, ":first-child");
  return _.attr("class", "basic label-container"), m && e.look !== "handDrawn" && _.selectAll("path").attr("style", m), i && e.look !== "handDrawn" && _.selectAll("path").attr("style", i), Q(e, _), e.intersect = function(E) {
    return U.polygon(e, b, E);
  }, n;
}
p(Dy, "waveRectangle");
async function Iy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, label: a } = await at(t, e, st(e)), o = Math.max(s.width + (e.padding ?? 0) * 2, e?.width ?? 0), l = Math.max(s.height + (e.padding ?? 0) * 2, e?.height ?? 0), c = 5, h = -o / 2, u = -l / 2, { cssStyles: f } = e, d = G.svg(n), g = V(e, {}), m = [
    { x: h - c, y: u - c },
    { x: h - c, y: u + l },
    { x: h + o, y: u + l },
    { x: h + o, y: u - c }
  ], y = `M${h - c},${u - c} L${h + o},${u - c} L${h + o},${u + l} L${h - c},${u + l} L${h - c},${u - c}
                M${h - c},${u} L${h + o},${u}
                M${h},${u - c} L${h},${u + l}`;
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const x = d.path(y, g), b = n.insert(() => x, ":first-child");
  return b.attr("transform", `translate(${c / 2}, ${c / 2})`), b.attr("class", "basic label-container"), f && e.look !== "handDrawn" && b.selectAll("path").attr("style", f), i && e.look !== "handDrawn" && b.selectAll("path").attr("style", i), a.attr(
    "transform",
    `translate(${-(s.width / 2) + c / 2 - (s.x - (s.left ?? 0))}, ${-(s.height / 2) + c / 2 - (s.y - (s.top ?? 0))})`
  ), Q(e, b), e.intersect = function(C) {
    return U.polygon(e, m, C);
  }, n;
}
p(Iy, "windowPane");
async function Sc(t, e) {
  const r = e;
  if (r.alias && (e.label = r.alias), e.look === "handDrawn") {
    const { themeVariables: J } = Ht(), { background: tt } = J, ht = {
      ...e,
      id: e.id + "-background",
      look: "default",
      cssStyles: ["stroke: none", `fill: ${tt}`]
    };
    await Sc(t, ht);
  }
  const i = Ht();
  e.useHtmlLabels = i.htmlLabels;
  let n = i.er?.diagramPadding ?? 10, s = i.er?.entityPadding ?? 6;
  const { cssStyles: a } = e, { labelStyles: o, nodeStyles: l } = K(e);
  if (r.attributes.length === 0 && e.label) {
    const J = {
      rx: 0,
      ry: 0,
      labelPaddingX: n,
      labelPaddingY: n * 1.5
    };
    Xe(e.label, i) + J.labelPaddingX * 2 < i.er.minEntityWidth && (e.width = i.er.minEntityWidth);
    const tt = await Ta(t, e, J);
    if (!Dt(i.htmlLabels)) {
      const ht = tt.select("text"), Z = ht.node()?.getBBox();
      ht.attr("transform", `translate(${-Z.width / 2}, 0)`);
    }
    return tt;
  }
  i.htmlLabels || (n *= 1.25, s *= 1.25);
  let c = st(e);
  c || (c = "node default");
  const h = t.insert("g").attr("class", c).attr("id", e.domId || e.id), u = await ni(h, e.label ?? "", i, 0, 0, ["name"], o);
  u.height += s;
  let f = 0;
  const d = [], g = [];
  let m = 0, y = 0, x = 0, b = 0, C = !0, k = !0;
  for (const J of r.attributes) {
    const tt = await ni(
      h,
      J.type,
      i,
      0,
      f,
      ["attribute-type"],
      o
    );
    m = Math.max(m, tt.width + n);
    const ht = await ni(
      h,
      J.name,
      i,
      0,
      f,
      ["attribute-name"],
      o
    );
    y = Math.max(y, ht.width + n);
    const Z = await ni(
      h,
      J.keys.join(),
      i,
      0,
      f,
      ["attribute-keys"],
      o
    );
    x = Math.max(x, Z.width + n);
    const Bt = await ni(
      h,
      J.comment,
      i,
      0,
      f,
      ["attribute-comment"],
      o
    );
    b = Math.max(b, Bt.width + n);
    const It = Math.max(tt.height, ht.height, Z.height, Bt.height) + s;
    g.push({ yOffset: f, rowHeight: It }), f += It;
  }
  let _ = 4;
  x <= n && (C = !1, x = 0, _--), b <= n && (k = !1, b = 0, _--);
  const E = h.node().getBBox();
  if (u.width + n * 2 - (m + y + x + b) > 0) {
    const J = u.width + n * 2 - (m + y + x + b);
    m += J / _, y += J / _, x > 0 && (x += J / _), b > 0 && (b += J / _);
  }
  const B = m + y + x + b, S = G.svg(h), I = V(e, {});
  e.look !== "handDrawn" && (I.roughness = 0, I.fillStyle = "solid");
  let O = 0;
  g.length > 0 && (O = g.reduce((J, tt) => J + (tt?.rowHeight ?? 0), 0));
  const D = Math.max(E.width + n * 2, e?.width || 0, B), W = Math.max((O ?? 0) + u.height, e?.height || 0), N = -D / 2, $ = -W / 2;
  h.selectAll("g:not(:first-child)").each((J, tt, ht) => {
    const Z = dt(ht[tt]), Bt = Z.attr("transform");
    let It = 0, Se = 0;
    if (Bt) {
      const At = RegExp(/translate\(([^,]+),([^)]+)\)/).exec(Bt);
      At && (It = parseFloat(At[1]), Se = parseFloat(At[2]), Z.attr("class").includes("attribute-name") ? It += m : Z.attr("class").includes("attribute-keys") ? It += m + y : Z.attr("class").includes("attribute-comment") && (It += m + y + x));
    }
    Z.attr(
      "transform",
      `translate(${N + n / 2 + It}, ${Se + $ + u.height + s / 2})`
    );
  }), h.select(".name").attr("transform", "translate(" + -u.width / 2 + ", " + ($ + s / 2) + ")");
  const F = S.rectangle(N, $, D, W, I), A = h.insert(() => F, ":first-child").attr("style", a.join("")), { themeVariables: L } = Ht(), { rowEven: M, rowOdd: H, nodeBorder: Y } = L;
  d.push(0);
  for (const [J, tt] of g.entries()) {
    const Z = (J + 1) % 2 === 0 && tt.yOffset !== 0, Bt = S.rectangle(N, u.height + $ + tt?.yOffset, D, tt?.rowHeight, {
      ...I,
      fill: Z ? M : H,
      stroke: Y
    });
    h.insert(() => Bt, "g.label").attr("style", a.join("")).attr("class", `row-rect-${Z ? "even" : "odd"}`);
  }
  let it = S.line(N, u.height + $, D + N, u.height + $, I);
  h.insert(() => it).attr("class", "divider"), it = S.line(m + N, u.height + $, m + N, W + $, I), h.insert(() => it).attr("class", "divider"), C && (it = S.line(
    m + y + N,
    u.height + $,
    m + y + N,
    W + $,
    I
  ), h.insert(() => it).attr("class", "divider")), k && (it = S.line(
    m + y + x + N,
    u.height + $,
    m + y + x + N,
    W + $,
    I
  ), h.insert(() => it).attr("class", "divider"));
  for (const J of d)
    it = S.line(
      N,
      u.height + $ + J,
      D + N,
      u.height + $ + J,
      I
    ), h.insert(() => it).attr("class", "divider");
  if (Q(e, A), l && e.look !== "handDrawn") {
    const tt = l.split(";")?.filter((ht) => ht.includes("stroke"))?.map((ht) => `${ht}`).join("; ");
    h.selectAll("path").attr("style", tt ?? ""), h.selectAll(".row-rect-even path").attr("style", l);
  }
  return e.intersect = function(J) {
    return U.rect(e, J);
  }, h;
}
p(Sc, "erBox");
async function ni(t, e, r, i = 0, n = 0, s = [], a = "") {
  const o = t.insert("g").attr("class", `label ${s.join(" ")}`).attr("transform", `translate(${i}, ${n})`).attr("style", a);
  e !== Bh(e) && (e = Bh(e), e = e.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  const l = o.node().appendChild(
    await fr(
      o,
      e,
      {
        width: Xe(e, r) + 100,
        style: a,
        useHtmlLabels: r.htmlLabels
      },
      r
    )
  );
  if (e.includes("&lt;") || e.includes("&gt;")) {
    let h = l.children[0];
    for (h.textContent = h.textContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">"); h.childNodes[0]; )
      h = h.childNodes[0], h.textContent = h.textContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  }
  let c = l.getBBox();
  if (Dt(r.htmlLabels)) {
    const h = l.children[0];
    h.style.textAlign = "start";
    const u = dt(l);
    c = h.getBoundingClientRect(), u.attr("width", c.width), u.attr("height", c.height);
  }
  return c;
}
p(ni, "addText");
async function Ry(t, e, r, i, n = r.class.padding ?? 12) {
  const s = i ? 0 : 3, a = t.insert("g").attr("class", st(e)).attr("id", e.domId || e.id);
  let o = null, l = null, c = null, h = null, u = 0, f = 0, d = 0;
  if (o = a.insert("g").attr("class", "annotation-group text"), e.annotations.length > 0) {
    const b = e.annotations[0];
    await Ki(o, { text: `«${b}»` }, 0), u = o.node().getBBox().height;
  }
  l = a.insert("g").attr("class", "label-group text"), await Ki(l, e, 0, ["font-weight: bolder"]);
  const g = l.node().getBBox();
  f = g.height, c = a.insert("g").attr("class", "members-group text");
  let m = 0;
  for (const b of e.members) {
    const C = await Ki(c, b, m, [b.parseClassifier()]);
    m += C + s;
  }
  d = c.node().getBBox().height, d <= 0 && (d = n / 2), h = a.insert("g").attr("class", "methods-group text");
  let y = 0;
  for (const b of e.methods) {
    const C = await Ki(h, b, y, [b.parseClassifier()]);
    y += C + s;
  }
  let x = a.node().getBBox();
  if (o !== null) {
    const b = o.node().getBBox();
    o.attr("transform", `translate(${-b.width / 2})`);
  }
  return l.attr("transform", `translate(${-g.width / 2}, ${u})`), x = a.node().getBBox(), c.attr(
    "transform",
    `translate(0, ${u + f + n * 2})`
  ), x = a.node().getBBox(), h.attr(
    "transform",
    `translate(0, ${u + f + (d ? d + n * 4 : n * 2)})`
  ), x = a.node().getBBox(), { shapeSvg: a, bbox: x };
}
p(Ry, "textHelper");
async function Ki(t, e, r, i = []) {
  const n = t.insert("g").attr("class", "label").attr("style", i.join("; ")), s = Ht();
  let a = "useHtmlLabels" in e ? e.useHtmlLabels : Dt(s.htmlLabels) ?? !0, o = "";
  "text" in e ? o = e.text : o = e.label, !a && o.startsWith("\\") && (o = o.substring(1)), pi(o) && (a = !0);
  const l = await fr(
    n,
    Ol(jr(o)),
    {
      width: Xe(o, s) + 50,
      // Add room for error when splitting text into multiple lines
      classes: "markdown-node-label",
      useHtmlLabels: a
    },
    s
  );
  let c, h = 1;
  if (a) {
    const u = l.children[0], f = dt(l);
    h = u.innerHTML.split("<br>").length, u.innerHTML.includes("</math>") && (h += u.innerHTML.split("<mrow>").length - 1);
    const d = u.getElementsByTagName("img");
    if (d) {
      const g = o.replace(/<img[^>]*>/g, "").trim() === "";
      await Promise.all(
        [...d].map(
          (m) => new Promise((y) => {
            function x() {
              if (m.style.display = "flex", m.style.flexDirection = "column", g) {
                const b = s.fontSize?.toString() ?? window.getComputedStyle(document.body).fontSize, k = parseInt(b, 10) * 5 + "px";
                m.style.minWidth = k, m.style.maxWidth = k;
              } else
                m.style.width = "100%";
              y(m);
            }
            p(x, "setupImage"), setTimeout(() => {
              m.complete && x();
            }), m.addEventListener("error", x), m.addEventListener("load", x);
          })
        )
      );
    }
    c = u.getBoundingClientRect(), f.attr("width", c.width), f.attr("height", c.height);
  } else {
    i.includes("font-weight: bolder") && dt(l).selectAll("tspan").attr("font-weight", ""), h = l.children.length;
    const u = l.children[0];
    (l.textContent === "" || l.textContent.includes("&gt")) && (u.textContent = o[0] + o.substring(1).replaceAll("&gt;", ">").replaceAll("&lt;", "<").trim(), o[1] === " " && (u.textContent = u.textContent[0] + " " + u.textContent.substring(1))), u.textContent === "undefined" && (u.textContent = ""), c = l.getBBox();
  }
  return n.attr("transform", "translate(0," + (-c.height / (2 * h) + r) + ")"), c.height;
}
p(Ki, "addText");
async function Py(t, e) {
  const r = yt(), i = r.class.padding ?? 12, n = i, s = e.useHtmlLabels ?? Dt(r.htmlLabels) ?? !0, a = e;
  a.annotations = a.annotations ?? [], a.members = a.members ?? [], a.methods = a.methods ?? [];
  const { shapeSvg: o, bbox: l } = await Ry(t, e, r, s, n), { labelStyles: c, nodeStyles: h } = K(e);
  e.labelStyle = c, e.cssStyles = a.styles || "";
  const u = a.styles?.join(";") || h || "";
  e.cssStyles || (e.cssStyles = u.replaceAll("!important", "").split(";"));
  const f = a.members.length === 0 && a.methods.length === 0 && !r.class?.hideEmptyMembersBox, d = G.svg(o), g = V(e, {});
  e.look !== "handDrawn" && (g.roughness = 0, g.fillStyle = "solid");
  const m = l.width;
  let y = l.height;
  a.members.length === 0 && a.methods.length === 0 ? y += n : a.members.length > 0 && a.methods.length === 0 && (y += n * 2);
  const x = -m / 2, b = -y / 2, C = d.rectangle(
    x - i,
    b - i - (f ? i : a.members.length === 0 && a.methods.length === 0 ? -i / 2 : 0),
    m + 2 * i,
    y + 2 * i + (f ? i * 2 : a.members.length === 0 && a.methods.length === 0 ? -i : 0),
    g
  ), k = o.insert(() => C, ":first-child");
  k.attr("class", "basic label-container");
  const _ = k.node().getBBox();
  o.selectAll(".text").each((I, O, D) => {
    const W = dt(D[O]), N = W.attr("transform");
    let $ = 0;
    if (N) {
      const M = RegExp(/translate\(([^,]+),([^)]+)\)/).exec(N);
      M && ($ = parseFloat(M[2]));
    }
    let F = $ + b + i - (f ? i : a.members.length === 0 && a.methods.length === 0 ? -i / 2 : 0);
    s || (F -= 4);
    let A = x;
    (W.attr("class").includes("label-group") || W.attr("class").includes("annotation-group")) && (A = -W.node()?.getBBox().width / 2 || 0, o.selectAll("text").each(function(L, M, H) {
      window.getComputedStyle(H[M]).textAnchor === "middle" && (A = 0);
    })), W.attr("transform", `translate(${A}, ${F})`);
  });
  const E = o.select(".annotation-group").node().getBBox().height - (f ? i / 2 : 0) || 0, B = o.select(".label-group").node().getBBox().height - (f ? i / 2 : 0) || 0, S = o.select(".members-group").node().getBBox().height - (f ? i / 2 : 0) || 0;
  if (a.members.length > 0 || a.methods.length > 0 || f) {
    const I = d.line(
      _.x,
      E + B + b + i,
      _.x + _.width,
      E + B + b + i,
      g
    );
    o.insert(() => I).attr("class", "divider").attr("style", u);
  }
  if (f || a.members.length > 0 || a.methods.length > 0) {
    const I = d.line(
      _.x,
      E + B + S + b + n * 2 + i,
      _.x + _.width,
      E + B + S + b + i + n * 2,
      g
    );
    o.insert(() => I).attr("class", "divider").attr("style", u);
  }
  if (a.look !== "handDrawn" && o.selectAll("path").attr("style", u), k.select(":nth-child(2)").attr("style", u), o.selectAll(".divider").select("path").attr("style", u), e.labelStyle ? o.selectAll("span").attr("style", e.labelStyle) : o.selectAll("span").attr("style", u), !s) {
    const I = RegExp(/color\s*:\s*([^;]*)/), O = I.exec(u);
    if (O) {
      const D = O[0].replace("color", "fill");
      o.selectAll("tspan").attr("style", D);
    } else if (c) {
      const D = I.exec(c);
      if (D) {
        const W = D[0].replace("color", "fill");
        o.selectAll("tspan").attr("style", W);
      }
    }
  }
  return Q(e, k), e.intersect = function(I) {
    return U.rect(e, I);
  }, o;
}
p(Py, "classBox");
async function Ny(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const n = e, s = e, a = 20, o = 20, l = "verifyMethod" in e, c = st(e), h = t.insert("g").attr("class", c).attr("id", e.domId ?? e.id);
  let u;
  l ? u = await $e(
    h,
    `&lt;&lt;${n.type}&gt;&gt;`,
    0,
    e.labelStyle
  ) : u = await $e(h, "&lt;&lt;Element&gt;&gt;", 0, e.labelStyle);
  let f = u;
  const d = await $e(
    h,
    n.name,
    f,
    e.labelStyle + "; font-weight: bold;"
  );
  if (f += d + o, l) {
    const E = await $e(
      h,
      `${n.requirementId ? `ID: ${n.requirementId}` : ""}`,
      f,
      e.labelStyle
    );
    f += E;
    const B = await $e(
      h,
      `${n.text ? `Text: ${n.text}` : ""}`,
      f,
      e.labelStyle
    );
    f += B;
    const S = await $e(
      h,
      `${n.risk ? `Risk: ${n.risk}` : ""}`,
      f,
      e.labelStyle
    );
    f += S, await $e(
      h,
      `${n.verifyMethod ? `Verification: ${n.verifyMethod}` : ""}`,
      f,
      e.labelStyle
    );
  } else {
    const E = await $e(
      h,
      `${s.type ? `Type: ${s.type}` : ""}`,
      f,
      e.labelStyle
    );
    f += E, await $e(
      h,
      `${s.docRef ? `Doc Ref: ${s.docRef}` : ""}`,
      f,
      e.labelStyle
    );
  }
  const g = (h.node()?.getBBox().width ?? 200) + a, m = (h.node()?.getBBox().height ?? 200) + a, y = -g / 2, x = -m / 2, b = G.svg(h), C = V(e, {});
  e.look !== "handDrawn" && (C.roughness = 0, C.fillStyle = "solid");
  const k = b.rectangle(y, x, g, m, C), _ = h.insert(() => k, ":first-child");
  if (_.attr("class", "basic label-container").attr("style", i), h.selectAll(".label").each((E, B, S) => {
    const I = dt(S[B]), O = I.attr("transform");
    let D = 0, W = 0;
    if (O) {
      const A = RegExp(/translate\(([^,]+),([^)]+)\)/).exec(O);
      A && (D = parseFloat(A[1]), W = parseFloat(A[2]));
    }
    const N = W - m / 2;
    let $ = y + a / 2;
    (B === 0 || B === 1) && ($ = D), I.attr("transform", `translate(${$}, ${N + a})`);
  }), f > u + d + o) {
    const E = b.line(
      y,
      x + u + d + o,
      y + g,
      x + u + d + o,
      C
    );
    h.insert(() => E).attr("style", i);
  }
  return Q(e, _), e.intersect = function(E) {
    return U.rect(e, E);
  }, h;
}
p(Ny, "requirementBox");
async function $e(t, e, r, i = "") {
  if (e === "")
    return 0;
  const n = t.insert("g").attr("class", "label").attr("style", i), s = yt(), a = s.htmlLabels ?? !0, o = await fr(
    n,
    Ol(jr(e)),
    {
      width: Xe(e, s) + 50,
      // Add room for error when splitting text into multiple lines
      classes: "markdown-node-label",
      useHtmlLabels: a,
      style: i
    },
    s
  );
  let l;
  if (a) {
    const c = o.children[0], h = dt(o);
    l = c.getBoundingClientRect(), h.attr("width", l.width), h.attr("height", l.height);
  } else {
    const c = o.children[0];
    for (const h of c.children)
      h.textContent = h.textContent.replaceAll("&gt;", ">").replaceAll("&lt;", "<"), i && h.setAttribute("style", i);
    l = o.getBBox(), l.height += 6;
  }
  return n.attr("transform", `translate(${-l.width / 2},${-l.height / 2 + r})`), l.height;
}
p($e, "addText");
var wL = /* @__PURE__ */ p((t) => {
  switch (t) {
    case "Very High":
      return "red";
    case "High":
      return "orange";
    case "Medium":
      return null;
    // no stroke
    case "Low":
      return "blue";
    case "Very Low":
      return "lightblue";
  }
}, "colorFromPriority");
async function zy(t, e, { config: r }) {
  const { labelStyles: i, nodeStyles: n } = K(e);
  e.labelStyle = i || "";
  const s = 10, a = e.width;
  e.width = (e.width ?? 200) - 10;
  const {
    shapeSvg: o,
    bbox: l,
    label: c
  } = await at(t, e, st(e)), h = e.padding || 10;
  let u = "", f;
  "ticket" in e && e.ticket && r?.kanban?.ticketBaseUrl && (u = r?.kanban?.ticketBaseUrl.replace("#TICKET#", e.ticket), f = o.insert("svg:a", ":first-child").attr("class", "kanban-ticket-link").attr("xlink:href", u).attr("target", "_blank"));
  const d = {
    useHtmlLabels: e.useHtmlLabels,
    labelStyle: e.labelStyle || "",
    width: e.width,
    img: e.img,
    padding: e.padding || 8,
    centerLabel: !1
  };
  let g, m;
  f ? { label: g, bbox: m } = await fo(
    f,
    "ticket" in e && e.ticket || "",
    d
  ) : { label: g, bbox: m } = await fo(
    o,
    "ticket" in e && e.ticket || "",
    d
  );
  const { label: y, bbox: x } = await fo(
    o,
    "assigned" in e && e.assigned || "",
    d
  );
  e.width = a;
  const b = 10, C = e?.width || 0, k = Math.max(m.height, x.height) / 2, _ = Math.max(l.height + b * 2, e?.height || 0) + k, E = -C / 2, B = -_ / 2;
  c.attr(
    "transform",
    "translate(" + (h - C / 2) + ", " + (-k - l.height / 2) + ")"
  ), g.attr(
    "transform",
    "translate(" + (h - C / 2) + ", " + (-k + l.height / 2) + ")"
  ), y.attr(
    "transform",
    "translate(" + (h + C / 2 - x.width - 2 * s) + ", " + (-k + l.height / 2) + ")"
  );
  let S;
  const { rx: I, ry: O } = e, { cssStyles: D } = e;
  if (e.look === "handDrawn") {
    const W = G.svg(o), N = V(e, {}), $ = I || O ? W.path(dr(E, B, C, _, I || 0), N) : W.rectangle(E, B, C, _, N);
    S = o.insert(() => $, ":first-child"), S.attr("class", "basic label-container").attr("style", D || null);
  } else {
    S = o.insert("rect", ":first-child"), S.attr("class", "basic label-container __APA__").attr("style", n).attr("rx", I ?? 5).attr("ry", O ?? 5).attr("x", E).attr("y", B).attr("width", C).attr("height", _);
    const W = "priority" in e && e.priority;
    if (W) {
      const N = o.append("line"), $ = E + 2, F = B + Math.floor((I ?? 0) / 2), A = B + _ - Math.floor((I ?? 0) / 2);
      N.attr("x1", $).attr("y1", F).attr("x2", $).attr("y2", A).attr("stroke-width", "4").attr("stroke", wL(W));
    }
  }
  return Q(e, S), e.height = _, e.intersect = function(W) {
    return U.rect(e, W);
  }, o;
}
p(zy, "kanbanItem");
async function Wy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, halfPadding: a, label: o } = await at(
    t,
    e,
    st(e)
  ), l = s.width + 10 * a, c = s.height + 8 * a, h = 0.15 * l, { cssStyles: u } = e, f = s.width + 20, d = s.height + 20, g = Math.max(l, f), m = Math.max(c, d);
  o.attr("transform", `translate(${-s.width / 2}, ${-s.height / 2})`);
  let y;
  const x = `M0 0 
    a${h},${h} 1 0,0 ${g * 0.25},${-1 * m * 0.1}
    a${h},${h} 1 0,0 ${g * 0.25},0
    a${h},${h} 1 0,0 ${g * 0.25},0
    a${h},${h} 1 0,0 ${g * 0.25},${m * 0.1}

    a${h},${h} 1 0,0 ${g * 0.15},${m * 0.33}
    a${h * 0.8},${h * 0.8} 1 0,0 0,${m * 0.34}
    a${h},${h} 1 0,0 ${-1 * g * 0.15},${m * 0.33}

    a${h},${h} 1 0,0 ${-1 * g * 0.25},${m * 0.15}
    a${h},${h} 1 0,0 ${-1 * g * 0.25},0
    a${h},${h} 1 0,0 ${-1 * g * 0.25},0
    a${h},${h} 1 0,0 ${-1 * g * 0.25},${-1 * m * 0.15}

    a${h},${h} 1 0,0 ${-1 * g * 0.1},${-1 * m * 0.33}
    a${h * 0.8},${h * 0.8} 1 0,0 0,${-1 * m * 0.34}
    a${h},${h} 1 0,0 ${g * 0.1},${-1 * m * 0.33}
  H0 V0 Z`;
  if (e.look === "handDrawn") {
    const b = G.svg(n), C = V(e, {}), k = b.path(x, C);
    y = n.insert(() => k, ":first-child"), y.attr("class", "basic label-container").attr("style", jt(u));
  } else
    y = n.insert("path", ":first-child").attr("class", "basic label-container").attr("style", i).attr("d", x);
  return y.attr("transform", `translate(${-g / 2}, ${-m / 2})`), Q(e, y), e.calcIntersect = function(b, C) {
    return U.rect(b, C);
  }, e.intersect = function(b) {
    return R.info("Bang intersect", e, b), U.rect(e, b);
  }, n;
}
p(Wy, "bang");
async function qy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, halfPadding: a, label: o } = await at(
    t,
    e,
    st(e)
  ), l = s.width + 2 * a, c = s.height + 2 * a, h = 0.15 * l, u = 0.25 * l, f = 0.35 * l, d = 0.2 * l, { cssStyles: g } = e;
  let m;
  const y = `M0 0 
    a${h},${h} 0 0,1 ${l * 0.25},${-1 * l * 0.1}
    a${f},${f} 1 0,1 ${l * 0.4},${-1 * l * 0.1}
    a${u},${u} 1 0,1 ${l * 0.35},${l * 0.2}

    a${h},${h} 1 0,1 ${l * 0.15},${c * 0.35}
    a${d},${d} 1 0,1 ${-1 * l * 0.15},${c * 0.65}

    a${u},${h} 1 0,1 ${-1 * l * 0.25},${l * 0.15}
    a${f},${f} 1 0,1 ${-1 * l * 0.5},0
    a${h},${h} 1 0,1 ${-1 * l * 0.25},${-1 * l * 0.15}

    a${h},${h} 1 0,1 ${-1 * l * 0.1},${-1 * c * 0.35}
    a${d},${d} 1 0,1 ${l * 0.1},${-1 * c * 0.65}
  H0 V0 Z`;
  if (e.look === "handDrawn") {
    const x = G.svg(n), b = V(e, {}), C = x.path(y, b);
    m = n.insert(() => C, ":first-child"), m.attr("class", "basic label-container").attr("style", jt(g));
  } else
    m = n.insert("path", ":first-child").attr("class", "basic label-container").attr("style", i).attr("d", y);
  return o.attr("transform", `translate(${-s.width / 2}, ${-s.height / 2})`), m.attr("transform", `translate(${-l / 2}, ${-c / 2})`), Q(e, m), e.calcIntersect = function(x, b) {
    return U.rect(x, b);
  }, e.intersect = function(x) {
    return R.info("Cloud intersect", e, x), U.rect(e, x);
  }, n;
}
p(qy, "cloud");
async function Hy(t, e) {
  const { labelStyles: r, nodeStyles: i } = K(e);
  e.labelStyle = r;
  const { shapeSvg: n, bbox: s, halfPadding: a, label: o } = await at(
    t,
    e,
    st(e)
  ), l = s.width + 8 * a, c = s.height + 2 * a, h = 5, u = `
    M${-l / 2} ${c / 2 - h}
    v${-c + 2 * h}
    q0,-${h} ${h},-${h}
    h${l - 2 * h}
    q${h},0 ${h},${h}
    v${c - 2 * h}
    q0,${h} -${h},${h}
    h${-l + 2 * h}
    q-${h},0 -${h},-${h}
    Z
  `, f = n.append("path").attr("id", "node-" + e.id).attr("class", "node-bkg node-" + e.type).attr("style", i).attr("d", u);
  return n.append("line").attr("class", "node-line-").attr("x1", -l / 2).attr("y1", c / 2).attr("x2", l / 2).attr("y2", c / 2), o.attr("transform", `translate(${-s.width / 2}, ${-s.height / 2})`), n.append(() => o.node()), Q(e, f), e.calcIntersect = function(d, g) {
    return U.rect(d, g);
  }, e.intersect = function(d) {
    return U.rect(e, d);
  }, n;
}
p(Hy, "defaultMindmapNode");
async function Yy(t, e) {
  const r = {
    padding: e.padding ?? 0
  };
  return kc(t, e, r);
}
p(Yy, "mindmapCircle");
var CL = [
  {
    semanticName: "Process",
    name: "Rectangle",
    shortName: "rect",
    description: "Standard process shape",
    aliases: ["proc", "process", "rectangle"],
    internalAliases: ["squareRect"],
    handler: Cy
  },
  {
    semanticName: "Event",
    name: "Rounded Rectangle",
    shortName: "rounded",
    description: "Represents an event",
    aliases: ["event"],
    internalAliases: ["roundedRect"],
    handler: xy
  },
  {
    semanticName: "Terminal Point",
    name: "Stadium",
    shortName: "stadium",
    description: "Terminal point",
    aliases: ["terminal", "pill"],
    handler: _y
  },
  {
    semanticName: "Subprocess",
    name: "Framed Rectangle",
    shortName: "fr-rect",
    description: "Subprocess",
    aliases: ["subprocess", "subproc", "framed-rectangle", "subroutine"],
    handler: Ty
  },
  {
    semanticName: "Database",
    name: "Cylinder",
    shortName: "cyl",
    description: "Database storage",
    aliases: ["db", "database", "cylinder"],
    handler: jm
  },
  {
    semanticName: "Start",
    name: "Circle",
    shortName: "circle",
    description: "Starting point",
    aliases: ["circ"],
    handler: kc
  },
  {
    semanticName: "Bang",
    name: "Bang",
    shortName: "bang",
    description: "Bang",
    aliases: ["bang"],
    handler: Wy
  },
  {
    semanticName: "Cloud",
    name: "Cloud",
    shortName: "cloud",
    description: "cloud",
    aliases: ["cloud"],
    handler: qy
  },
  {
    semanticName: "Decision",
    name: "Diamond",
    shortName: "diam",
    description: "Decision-making step",
    aliases: ["decision", "diamond", "question"],
    handler: gy
  },
  {
    semanticName: "Prepare Conditional",
    name: "Hexagon",
    shortName: "hex",
    description: "Preparation or condition step",
    aliases: ["hexagon", "prepare"],
    handler: Qm
  },
  {
    semanticName: "Data Input/Output",
    name: "Lean Right",
    shortName: "lean-r",
    description: "Represents input or output",
    aliases: ["lean-right", "in-out"],
    internalAliases: ["lean_right"],
    handler: ly
  },
  {
    semanticName: "Data Input/Output",
    name: "Lean Left",
    shortName: "lean-l",
    description: "Represents output or input",
    aliases: ["lean-left", "out-in"],
    internalAliases: ["lean_left"],
    handler: oy
  },
  {
    semanticName: "Priority Action",
    name: "Trapezoid Base Bottom",
    shortName: "trap-b",
    description: "Priority action",
    aliases: ["priority", "trapezoid-bottom", "trapezoid"],
    handler: My
  },
  {
    semanticName: "Manual Operation",
    name: "Trapezoid Base Top",
    shortName: "trap-t",
    description: "Represents a manual task",
    aliases: ["manual", "trapezoid-top", "inv-trapezoid"],
    internalAliases: ["inv_trapezoid"],
    handler: sy
  },
  {
    semanticName: "Stop",
    name: "Double Circle",
    shortName: "dbl-circ",
    description: "Represents a stop point",
    aliases: ["double-circle"],
    internalAliases: ["doublecircle"],
    handler: Xm
  },
  {
    semanticName: "Text Block",
    name: "Text Block",
    shortName: "text",
    description: "Text block",
    handler: Ey
  },
  {
    semanticName: "Card",
    name: "Notched Rectangle",
    shortName: "notch-rect",
    description: "Represents a card",
    aliases: ["card", "notched-rectangle"],
    handler: Rm
  },
  {
    semanticName: "Lined/Shaded Process",
    name: "Lined Rectangle",
    shortName: "lin-rect",
    description: "Lined process shape",
    aliases: ["lined-rectangle", "lined-process", "lin-proc", "shaded-process"],
    handler: by
  },
  {
    semanticName: "Start",
    name: "Small Circle",
    shortName: "sm-circ",
    description: "Small starting point",
    aliases: ["start", "small-circle"],
    internalAliases: ["stateStart"],
    handler: vy
  },
  {
    semanticName: "Stop",
    name: "Framed Circle",
    shortName: "fr-circ",
    description: "Stop point",
    aliases: ["stop", "framed-circle"],
    internalAliases: ["stateEnd"],
    handler: Sy
  },
  {
    semanticName: "Fork/Join",
    name: "Filled Rectangle",
    shortName: "fork",
    description: "Fork or join in process flow",
    aliases: ["join"],
    internalAliases: ["forkJoin"],
    handler: Km
  },
  {
    semanticName: "Collate",
    name: "Hourglass",
    shortName: "hourglass",
    description: "Represents a collate operation",
    aliases: ["hourglass", "collate"],
    handler: Jm
  },
  {
    semanticName: "Comment",
    name: "Curly Brace",
    shortName: "brace",
    description: "Adds a comment",
    aliases: ["comment", "brace-l"],
    handler: Wm
  },
  {
    semanticName: "Comment Right",
    name: "Curly Brace",
    shortName: "brace-r",
    description: "Adds a comment",
    handler: qm
  },
  {
    semanticName: "Comment with braces on both sides",
    name: "Curly Braces",
    shortName: "braces",
    description: "Adds a comment",
    handler: Hm
  },
  {
    semanticName: "Com Link",
    name: "Lightning Bolt",
    shortName: "bolt",
    description: "Communication link",
    aliases: ["com-link", "lightning-bolt"],
    handler: cy
  },
  {
    semanticName: "Document",
    name: "Document",
    shortName: "doc",
    description: "Represents a document",
    aliases: ["doc", "document"],
    handler: Oy
  },
  {
    semanticName: "Delay",
    name: "Half-Rounded Rectangle",
    shortName: "delay",
    description: "Represents a delay",
    aliases: ["half-rounded-rectangle"],
    handler: Zm
  },
  {
    semanticName: "Direct Access Storage",
    name: "Horizontal Cylinder",
    shortName: "h-cyl",
    description: "Direct access storage",
    aliases: ["das", "horizontal-cylinder"],
    handler: By
  },
  {
    semanticName: "Disk Storage",
    name: "Lined Cylinder",
    shortName: "lin-cyl",
    description: "Disk storage",
    aliases: ["disk", "lined-cylinder"],
    handler: hy
  },
  {
    semanticName: "Display",
    name: "Curved Trapezoid",
    shortName: "curv-trap",
    description: "Represents a display",
    aliases: ["curved-trapezoid", "display"],
    handler: Ym
  },
  {
    semanticName: "Divided Process",
    name: "Divided Rectangle",
    shortName: "div-rect",
    description: "Divided process shape",
    aliases: ["div-proc", "divided-rectangle", "divided-process"],
    handler: Um
  },
  {
    semanticName: "Extract",
    name: "Triangle",
    shortName: "tri",
    description: "Extraction process",
    aliases: ["extract", "triangle"],
    handler: Fy
  },
  {
    semanticName: "Internal Storage",
    name: "Window Pane",
    shortName: "win-pane",
    description: "Internal storage",
    aliases: ["internal-storage", "window-pane"],
    handler: Iy
  },
  {
    semanticName: "Junction",
    name: "Filled Circle",
    shortName: "f-circ",
    description: "Junction point",
    aliases: ["junction", "filled-circle"],
    handler: Gm
  },
  {
    semanticName: "Loop Limit",
    name: "Trapezoidal Pentagon",
    shortName: "notch-pent",
    description: "Loop limit step",
    aliases: ["loop-limit", "notched-pentagon"],
    handler: $y
  },
  {
    semanticName: "Manual File",
    name: "Flipped Triangle",
    shortName: "flip-tri",
    description: "Manual file operation",
    aliases: ["manual-file", "flipped-triangle"],
    handler: Vm
  },
  {
    semanticName: "Manual Input",
    name: "Sloped Rectangle",
    shortName: "sl-rect",
    description: "Manual input step",
    aliases: ["manual-input", "sloped-rectangle"],
    handler: wy
  },
  {
    semanticName: "Multi-Document",
    name: "Stacked Document",
    shortName: "docs",
    description: "Multiple documents",
    aliases: ["documents", "st-doc", "stacked-document"],
    handler: dy
  },
  {
    semanticName: "Multi-Process",
    name: "Stacked Rectangle",
    shortName: "st-rect",
    description: "Multiple processes",
    aliases: ["procs", "processes", "stacked-rectangle"],
    handler: fy
  },
  {
    semanticName: "Stored Data",
    name: "Bow Tie Rectangle",
    shortName: "bow-rect",
    description: "Stored data",
    aliases: ["stored-data", "bow-tie-rectangle"],
    handler: Im
  },
  {
    semanticName: "Summary",
    name: "Crossed Circle",
    shortName: "cross-circ",
    description: "Summary",
    aliases: ["summary", "crossed-circle"],
    handler: zm
  },
  {
    semanticName: "Tagged Document",
    name: "Tagged Document",
    shortName: "tag-doc",
    description: "Tagged document",
    aliases: ["tag-doc", "tagged-document"],
    handler: Ly
  },
  {
    semanticName: "Tagged Process",
    name: "Tagged Rectangle",
    shortName: "tag-rect",
    description: "Tagged process",
    aliases: ["tagged-rectangle", "tag-proc", "tagged-process"],
    handler: Ay
  },
  {
    semanticName: "Paper Tape",
    name: "Flag",
    shortName: "flag",
    description: "Paper tape",
    aliases: ["paper-tape"],
    handler: Dy
  },
  {
    semanticName: "Odd",
    name: "Odd",
    shortName: "odd",
    description: "Odd shape",
    internalAliases: ["rect_left_inv_arrow"],
    handler: my
  },
  {
    semanticName: "Lined Document",
    name: "Lined Document",
    shortName: "lin-doc",
    description: "Lined document",
    aliases: ["lined-document"],
    handler: uy
  }
], _L = /* @__PURE__ */ p(() => {
  const e = [
    ...Object.entries({
      // States
      state: ky,
      choice: Pm,
      note: py,
      // Rectangles
      rectWithTitle: yy,
      labelRect: ay,
      // Icons
      iconSquare: iy,
      iconCircle: ey,
      icon: ty,
      iconRounded: ry,
      imageSquare: ny,
      anchor: Dm,
      // Kanban diagram
      kanbanItem: zy,
      //Mindmap diagram
      mindmapCircle: Yy,
      defaultMindmapNode: Hy,
      // class diagram
      classBox: Py,
      // er diagram
      erBox: Sc,
      // Requirement diagram
      requirementBox: Ny
    }),
    ...CL.flatMap((r) => [
      r.shortName,
      ..."aliases" in r ? r.aliases : [],
      ..."internalAliases" in r ? r.internalAliases : []
    ].map((n) => [n, r.handler]))
  ];
  return Object.fromEntries(e);
}, "generateShapeMap"), jy = _L();
function kL(t) {
  return t in jy;
}
p(kL, "isValidShape");
var Aa = /* @__PURE__ */ new Map();
async function Uy(t, e, r) {
  let i, n;
  e.shape === "rect" && (e.rx && e.ry ? e.shape = "roundedRect" : e.shape = "squareRect");
  const s = e.shape ? jy[e.shape] : void 0;
  if (!s)
    throw new Error(`No such shape: ${e.shape}. Please check your syntax.`);
  if (e.link) {
    let a;
    r.config.securityLevel === "sandbox" ? a = "_top" : e.linkTarget && (a = e.linkTarget || "_blank"), i = t.insert("svg:a").attr("xlink:href", e.link).attr("target", a ?? null), n = await s(i, e, r);
  } else
    n = await s(t, e, r), i = n;
  return e.tooltip && n.attr("title", e.tooltip), Aa.set(e.id, i), e.haveCallback && i.attr("class", i.attr("class") + " clickable"), i;
}
p(Uy, "insertNode");
var HF = /* @__PURE__ */ p((t, e) => {
  Aa.set(e.id, t);
}, "setNodeElem"), YF = /* @__PURE__ */ p(() => {
  Aa.clear();
}, "clear"), jF = /* @__PURE__ */ p((t) => {
  const e = Aa.get(t.id);
  R.trace(
    "Transforming node",
    t.diff,
    t,
    "translate(" + (t.x - t.width / 2 - 5) + ", " + t.width / 2 + ")"
  );
  const r = 8, i = t.diff || 0;
  return t.clusterNode ? e.attr(
    "transform",
    "translate(" + (t.x + i - t.width / 2) + ", " + (t.y - t.height / 2 - r) + ")"
  ) : e.attr("transform", "translate(" + t.x + ", " + t.y + ")"), i;
}, "positionNode"), SL = /* @__PURE__ */ p((t, e, r, i, n, s) => {
  e.arrowTypeStart && Nu(t, "start", e.arrowTypeStart, r, i, n, s), e.arrowTypeEnd && Nu(t, "end", e.arrowTypeEnd, r, i, n, s);
}, "addEdgeMarkers"), vL = {
  arrow_cross: { type: "cross", fill: !1 },
  arrow_point: { type: "point", fill: !0 },
  arrow_barb: { type: "barb", fill: !0 },
  arrow_circle: { type: "circle", fill: !1 },
  aggregation: { type: "aggregation", fill: !1 },
  extension: { type: "extension", fill: !1 },
  composition: { type: "composition", fill: !0 },
  dependency: { type: "dependency", fill: !0 },
  lollipop: { type: "lollipop", fill: !1 },
  only_one: { type: "onlyOne", fill: !1 },
  zero_or_one: { type: "zeroOrOne", fill: !1 },
  one_or_more: { type: "oneOrMore", fill: !1 },
  zero_or_more: { type: "zeroOrMore", fill: !1 },
  requirement_arrow: { type: "requirement_arrow", fill: !1 },
  requirement_contains: { type: "requirement_contains", fill: !1 }
}, Nu = /* @__PURE__ */ p((t, e, r, i, n, s, a) => {
  const o = vL[r];
  if (!o) {
    R.warn(`Unknown arrow type: ${r}`);
    return;
  }
  const l = o.type, h = `${n}_${s}-${l}${e === "start" ? "Start" : "End"}`;
  if (a && a.trim() !== "") {
    const u = a.replace(/[^\dA-Za-z]/g, "_"), f = `${h}_${u}`;
    if (!document.getElementById(f)) {
      const d = document.getElementById(h);
      if (d) {
        const g = d.cloneNode(!0);
        g.id = f, g.querySelectorAll("path, circle, line").forEach((y) => {
          y.setAttribute("stroke", a), o.fill && y.setAttribute("fill", a);
        }), d.parentNode?.appendChild(g);
      }
    }
    t.attr(`marker-${e}`, `url(${i}#${f})`);
  } else
    t.attr(`marker-${e}`, `url(${i}#${h})`);
}, "addEdgeMarker"), Js = /* @__PURE__ */ new Map(), Nt = /* @__PURE__ */ new Map(), UF = /* @__PURE__ */ p(() => {
  Js.clear(), Nt.clear();
}, "clear"), rs = /* @__PURE__ */ p((t) => t ? t.reduce((r, i) => r + ";" + i, "") : "", "getLabelStyles"), TL = /* @__PURE__ */ p(async (t, e) => {
  let r = Dt(yt().flowchart.htmlLabels);
  const { labelStyles: i } = K(e);
  e.labelStyle = i;
  const n = await fr(t, e.label, {
    style: e.labelStyle,
    useHtmlLabels: r,
    addSvgBackground: !0,
    isNode: !1
  });
  R.info("abc82", e, e.labelType);
  const s = t.insert("g").attr("class", "edgeLabel"), a = s.insert("g").attr("class", "label").attr("data-id", e.id);
  a.node().appendChild(n);
  let o = n.getBBox();
  if (r) {
    const c = n.children[0], h = dt(n);
    o = c.getBoundingClientRect(), h.attr("width", o.width), h.attr("height", o.height);
  }
  a.attr("transform", "translate(" + -o.width / 2 + ", " + -o.height / 2 + ")"), Js.set(e.id, s), e.width = o.width, e.height = o.height;
  let l;
  if (e.startLabelLeft) {
    const c = await Er(
      e.startLabelLeft,
      rs(e.labelStyle)
    ), h = t.insert("g").attr("class", "edgeTerminals"), u = h.insert("g").attr("class", "inner");
    l = u.node().appendChild(c);
    const f = c.getBBox();
    u.attr("transform", "translate(" + -f.width / 2 + ", " + -f.height / 2 + ")"), Nt.get(e.id) || Nt.set(e.id, {}), Nt.get(e.id).startLeft = h, Zi(l, e.startLabelLeft);
  }
  if (e.startLabelRight) {
    const c = await Er(
      e.startLabelRight,
      rs(e.labelStyle)
    ), h = t.insert("g").attr("class", "edgeTerminals"), u = h.insert("g").attr("class", "inner");
    l = h.node().appendChild(c), u.node().appendChild(c);
    const f = c.getBBox();
    u.attr("transform", "translate(" + -f.width / 2 + ", " + -f.height / 2 + ")"), Nt.get(e.id) || Nt.set(e.id, {}), Nt.get(e.id).startRight = h, Zi(l, e.startLabelRight);
  }
  if (e.endLabelLeft) {
    const c = await Er(e.endLabelLeft, rs(e.labelStyle)), h = t.insert("g").attr("class", "edgeTerminals"), u = h.insert("g").attr("class", "inner");
    l = u.node().appendChild(c);
    const f = c.getBBox();
    u.attr("transform", "translate(" + -f.width / 2 + ", " + -f.height / 2 + ")"), h.node().appendChild(c), Nt.get(e.id) || Nt.set(e.id, {}), Nt.get(e.id).endLeft = h, Zi(l, e.endLabelLeft);
  }
  if (e.endLabelRight) {
    const c = await Er(e.endLabelRight, rs(e.labelStyle)), h = t.insert("g").attr("class", "edgeTerminals"), u = h.insert("g").attr("class", "inner");
    l = u.node().appendChild(c);
    const f = c.getBBox();
    u.attr("transform", "translate(" + -f.width / 2 + ", " + -f.height / 2 + ")"), h.node().appendChild(c), Nt.get(e.id) || Nt.set(e.id, {}), Nt.get(e.id).endRight = h, Zi(l, e.endLabelRight);
  }
  return n;
}, "insertEdgeLabel");
function Zi(t, e) {
  yt().flowchart.htmlLabels && t && (t.style.width = e.length * 9 + "px", t.style.height = "12px");
}
p(Zi, "setTerminalWidth");
var AL = /* @__PURE__ */ p((t, e) => {
  R.debug("Moving label abc88 ", t.id, t.label, Js.get(t.id), e);
  let r = e.updatedPath ? e.updatedPath : e.originalPath;
  const i = yt(), { subGraphTitleTotalMargin: n } = tc(i);
  if (t.label) {
    const s = Js.get(t.id);
    let a = t.x, o = t.y;
    if (r) {
      const l = we.calcLabelPosition(r);
      R.debug(
        "Moving label " + t.label + " from (",
        a,
        ",",
        o,
        ") to (",
        l.x,
        ",",
        l.y,
        ") abc88"
      ), e.updatedPath && (a = l.x, o = l.y);
    }
    s.attr("transform", `translate(${a}, ${o + n / 2})`);
  }
  if (t.startLabelLeft) {
    const s = Nt.get(t.id).startLeft;
    let a = t.x, o = t.y;
    if (r) {
      const l = we.calcTerminalLabelPosition(t.arrowTypeStart ? 10 : 0, "start_left", r);
      a = l.x, o = l.y;
    }
    s.attr("transform", `translate(${a}, ${o})`);
  }
  if (t.startLabelRight) {
    const s = Nt.get(t.id).startRight;
    let a = t.x, o = t.y;
    if (r) {
      const l = we.calcTerminalLabelPosition(
        t.arrowTypeStart ? 10 : 0,
        "start_right",
        r
      );
      a = l.x, o = l.y;
    }
    s.attr("transform", `translate(${a}, ${o})`);
  }
  if (t.endLabelLeft) {
    const s = Nt.get(t.id).endLeft;
    let a = t.x, o = t.y;
    if (r) {
      const l = we.calcTerminalLabelPosition(t.arrowTypeEnd ? 10 : 0, "end_left", r);
      a = l.x, o = l.y;
    }
    s.attr("transform", `translate(${a}, ${o})`);
  }
  if (t.endLabelRight) {
    const s = Nt.get(t.id).endRight;
    let a = t.x, o = t.y;
    if (r) {
      const l = we.calcTerminalLabelPosition(t.arrowTypeEnd ? 10 : 0, "end_right", r);
      a = l.x, o = l.y;
    }
    s.attr("transform", `translate(${a}, ${o})`);
  }
}, "positionEdgeLabel"), LL = /* @__PURE__ */ p((t, e) => {
  const r = t.x, i = t.y, n = Math.abs(e.x - r), s = Math.abs(e.y - i), a = t.width / 2, o = t.height / 2;
  return n >= a || s >= o;
}, "outsideNode"), EL = /* @__PURE__ */ p((t, e, r) => {
  R.debug(`intersection calc abc89:
  outsidePoint: ${JSON.stringify(e)}
  insidePoint : ${JSON.stringify(r)}
  node        : x:${t.x} y:${t.y} w:${t.width} h:${t.height}`);
  const i = t.x, n = t.y, s = Math.abs(i - r.x), a = t.width / 2;
  let o = r.x < e.x ? a - s : a + s;
  const l = t.height / 2, c = Math.abs(e.y - r.y), h = Math.abs(e.x - r.x);
  if (Math.abs(n - e.y) * a > Math.abs(i - e.x) * l) {
    let u = r.y < e.y ? e.y - l - n : n - l - e.y;
    o = h * u / c;
    const f = {
      x: r.x < e.x ? r.x + o : r.x - h + o,
      y: r.y < e.y ? r.y + c - u : r.y - c + u
    };
    return o === 0 && (f.x = e.x, f.y = e.y), h === 0 && (f.x = e.x), c === 0 && (f.y = e.y), R.debug(`abc89 top/bottom calc, Q ${c}, q ${u}, R ${h}, r ${o}`, f), f;
  } else {
    r.x < e.x ? o = e.x - a - i : o = i - a - e.x;
    let u = c * o / h, f = r.x < e.x ? r.x + h - o : r.x - h + o, d = r.y < e.y ? r.y + u : r.y - u;
    return R.debug(`sides calc abc89, Q ${c}, q ${u}, R ${h}, r ${o}`, { _x: f, _y: d }), o === 0 && (f = e.x, d = e.y), h === 0 && (f = e.x), c === 0 && (d = e.y), { x: f, y: d };
  }
}, "intersection"), zu = /* @__PURE__ */ p((t, e) => {
  R.warn("abc88 cutPathAtIntersect", t, e);
  let r = [], i = t[0], n = !1;
  return t.forEach((s) => {
    if (R.info("abc88 checking point", s, e), !LL(e, s) && !n) {
      const a = EL(e, i, s);
      R.debug("abc88 inside", s, i, a), R.debug("abc88 intersection", a, e);
      let o = !1;
      r.forEach((l) => {
        o = o || l.x === a.x && l.y === a.y;
      }), r.some((l) => l.x === a.x && l.y === a.y) ? R.warn("abc88 no intersect", a, r) : r.push(a), n = !0;
    } else
      R.warn("abc88 outside", s, i), i = s, n || r.push(s);
  }), R.debug("returning points", r), r;
}, "cutPathAtIntersect");
function Xy(t) {
  const e = [], r = [];
  for (let i = 1; i < t.length - 1; i++) {
    const n = t[i - 1], s = t[i], a = t[i + 1];
    (n.x === s.x && s.y === a.y && Math.abs(s.x - a.x) > 5 && Math.abs(s.y - n.y) > 5 || n.y === s.y && s.x === a.x && Math.abs(s.x - n.x) > 5 && Math.abs(s.y - a.y) > 5) && (e.push(s), r.push(i));
  }
  return { cornerPoints: e, cornerPointPositions: r };
}
p(Xy, "extractCornerPoints");
var Wu = /* @__PURE__ */ p(function(t, e, r) {
  const i = e.x - t.x, n = e.y - t.y, s = Math.sqrt(i * i + n * n), a = r / s;
  return { x: e.x - a * i, y: e.y - a * n };
}, "findAdjacentPoint"), BL = /* @__PURE__ */ p(function(t) {
  const { cornerPointPositions: e } = Xy(t), r = [];
  for (let i = 0; i < t.length; i++)
    if (e.includes(i)) {
      const n = t[i - 1], s = t[i + 1], a = t[i], o = Wu(n, a, 5), l = Wu(s, a, 5), c = l.x - o.x, h = l.y - o.y;
      r.push(o);
      const u = Math.sqrt(2) * 2;
      let f = { x: a.x, y: a.y };
      if (Math.abs(s.x - n.x) > 10 && Math.abs(s.y - n.y) >= 10) {
        R.debug(
          "Corner point fixing",
          Math.abs(s.x - n.x),
          Math.abs(s.y - n.y)
        );
        const d = 5;
        a.x === o.x ? f = {
          x: c < 0 ? o.x - d + u : o.x + d - u,
          y: h < 0 ? o.y - u : o.y + u
        } : f = {
          x: c < 0 ? o.x - u : o.x + u,
          y: h < 0 ? o.y - d + u : o.y + d - u
        };
      } else
        R.debug(
          "Corner point skipping fixing",
          Math.abs(s.x - n.x),
          Math.abs(s.y - n.y)
        );
      r.push(f, l);
    } else
      r.push(t[i]);
  return r;
}, "fixCorners"), ML = /* @__PURE__ */ p((t, e, r) => {
  const i = t - e - r, n = 2, s = 2, a = n + s, o = Math.floor(i / a), l = Array(o).fill(`${n} ${s}`).join(" ");
  return `0 ${e} ${l} ${r}`;
}, "generateDashArray"), $L = /* @__PURE__ */ p(function(t, e, r, i, n, s, a, o = !1) {
  const { handDrawnSeed: l } = yt();
  let c = e.points, h = !1;
  const u = n;
  var f = s;
  const d = [];
  for (const $ in e.cssCompiledStyles)
    Sg($) || d.push(e.cssCompiledStyles[$]);
  R.debug("UIO intersect check", e.points, f.x, u.x), f.intersect && u.intersect && !o && (c = c.slice(1, e.points.length - 1), c.unshift(u.intersect(c[0])), R.debug(
    "Last point UIO",
    e.start,
    "-->",
    e.end,
    c[c.length - 1],
    f,
    f.intersect(c[c.length - 1])
  ), c.push(f.intersect(c[c.length - 1])));
  const g = btoa(JSON.stringify(c));
  e.toCluster && (R.info("to cluster abc88", r.get(e.toCluster)), c = zu(e.points, r.get(e.toCluster).node), h = !0), e.fromCluster && (R.debug(
    "from cluster abc88",
    r.get(e.fromCluster),
    JSON.stringify(c, null, 2)
  ), c = zu(c.reverse(), r.get(e.fromCluster).node).reverse(), h = !0);
  let m = c.filter(($) => !Number.isNaN($.y));
  m = BL(m);
  let y = us;
  switch (y = Bs, e.curve) {
    case "linear":
      y = Bs;
      break;
    case "basis":
      y = us;
      break;
    case "cardinal":
      y = Ld;
      break;
    case "bumpX":
      y = kd;
      break;
    case "bumpY":
      y = Sd;
      break;
    case "catmullRom":
      y = Bd;
      break;
    case "monotoneX":
      y = Id;
      break;
    case "monotoneY":
      y = Rd;
      break;
    case "natural":
      y = Nd;
      break;
    case "step":
      y = zd;
      break;
    case "stepAfter":
      y = qd;
      break;
    case "stepBefore":
      y = Wd;
      break;
    default:
      y = us;
  }
  const { x, y: b } = Bk(e), C = d_().x(x).y(b).curve(y);
  let k;
  switch (e.thickness) {
    case "normal":
      k = "edge-thickness-normal";
      break;
    case "thick":
      k = "edge-thickness-thick";
      break;
    case "invisible":
      k = "edge-thickness-invisible";
      break;
    default:
      k = "edge-thickness-normal";
  }
  switch (e.pattern) {
    case "solid":
      k += " edge-pattern-solid";
      break;
    case "dotted":
      k += " edge-pattern-dotted";
      break;
    case "dashed":
      k += " edge-pattern-dashed";
      break;
    default:
      k += " edge-pattern-solid";
  }
  let _, E = e.curve === "rounded" ? Gy(Vy(m, e), 5) : C(m);
  const B = Array.isArray(e.style) ? e.style : [e.style];
  let S = B.find(($) => $?.startsWith("stroke:")), I = !1;
  if (e.look === "handDrawn") {
    const $ = G.svg(t);
    Object.assign([], m);
    const F = $.path(E, {
      roughness: 0.3,
      seed: l
    });
    k += " transition", _ = dt(F).select("path").attr("id", e.id).attr("class", " " + k + (e.classes ? " " + e.classes : "")).attr("style", B ? B.reduce((L, M) => L + ";" + M, "") : "");
    let A = _.attr("d");
    _.attr("d", A), t.node().appendChild(_.node());
  } else {
    const $ = d.join(";"), F = B ? B.reduce((J, tt) => J + tt + ";", "") : "";
    let A = "";
    e.animate && (A = " edge-animation-fast"), e.animation && (A = " edge-animation-" + e.animation);
    const L = ($ ? $ + ";" + F + ";" : F) + ";" + (B ? B.reduce((J, tt) => J + ";" + tt, "") : "");
    _ = t.append("path").attr("d", E).attr("id", e.id).attr(
      "class",
      " " + k + (e.classes ? " " + e.classes : "") + (A ?? "")
    ).attr("style", L), S = L.match(/stroke:([^;]+)/)?.[1], I = e.animate === !0 || !!e.animation || $.includes("animation");
    const M = _.node(), H = typeof M.getTotalLength == "function" ? M.getTotalLength() : 0, Y = iu[e.arrowTypeStart] || 0, it = iu[e.arrowTypeEnd] || 0;
    if (e.look === "neo" && !I) {
      const tt = `stroke-dasharray: ${e.pattern === "dotted" || e.pattern === "dashed" ? ML(H, Y, it) : `0 ${Y} ${H - Y - it} ${it}`}; stroke-dashoffset: 0;`;
      _.attr("style", tt + _.attr("style"));
    }
  }
  _.attr("data-edge", !0), _.attr("data-et", "edge"), _.attr("data-id", e.id), _.attr("data-points", g), e.showPoints && m.forEach(($) => {
    t.append("circle").style("stroke", "red").style("fill", "red").attr("r", 1).attr("cx", $.x).attr("cy", $.y);
  });
  let O = "";
  (yt().flowchart.arrowMarkerAbsolute || yt().state.arrowMarkerAbsolute) && (O = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.search, O = O.replace(/\(/g, "\\(").replace(/\)/g, "\\)")), R.info("arrowTypeStart", e.arrowTypeStart), R.info("arrowTypeEnd", e.arrowTypeEnd), SL(_, e, O, a, i, S);
  const D = Math.floor(c.length / 2), W = c[D];
  we.isLabelCoordinateInPath(W, _.attr("d")) || (h = !0);
  let N = {};
  return h && (N.updatedPath = c), N.originalPath = e.points, N;
}, "insertEdge");
function Gy(t, e) {
  if (t.length < 2)
    return "";
  let r = "";
  const i = t.length, n = 1e-5;
  for (let s = 0; s < i; s++) {
    const a = t[s], o = t[s - 1], l = t[s + 1];
    if (s === 0)
      r += `M${a.x},${a.y}`;
    else if (s === i - 1)
      r += `L${a.x},${a.y}`;
    else {
      const c = a.x - o.x, h = a.y - o.y, u = l.x - a.x, f = l.y - a.y, d = Math.hypot(c, h), g = Math.hypot(u, f);
      if (d < n || g < n) {
        r += `L${a.x},${a.y}`;
        continue;
      }
      const m = c / d, y = h / d, x = u / g, b = f / g, C = m * x + y * b, k = Math.max(-1, Math.min(1, C)), _ = Math.acos(k);
      if (_ < n || Math.abs(Math.PI - _) < n) {
        r += `L${a.x},${a.y}`;
        continue;
      }
      const E = Math.min(e / Math.sin(_ / 2), d / 2, g / 2), B = a.x - m * E, S = a.y - y * E, I = a.x + x * E, O = a.y + b * E;
      r += `L${B},${S}`, r += `Q${a.x},${a.y} ${I},${O}`;
    }
  }
  return r;
}
p(Gy, "generateRoundedPath");
function ul(t, e) {
  if (!t || !e)
    return { angle: 0, deltaX: 0, deltaY: 0 };
  const r = e.x - t.x, i = e.y - t.y;
  return { angle: Math.atan2(i, r), deltaX: r, deltaY: i };
}
p(ul, "calculateDeltaAndAngle");
function Vy(t, e) {
  const r = t.map((n) => ({ ...n }));
  if (t.length >= 2 && qt[e.arrowTypeStart]) {
    const n = qt[e.arrowTypeStart], s = t[0], a = t[1], { angle: o } = ul(s, a), l = n * Math.cos(o), c = n * Math.sin(o);
    r[0].x = s.x + l, r[0].y = s.y + c;
  }
  const i = t.length;
  if (i >= 2 && qt[e.arrowTypeEnd]) {
    const n = qt[e.arrowTypeEnd], s = t[i - 1], a = t[i - 2], { angle: o } = ul(a, s), l = n * Math.cos(o), c = n * Math.sin(o);
    r[i - 1].x = s.x - l, r[i - 1].y = s.y - c;
  }
  return r;
}
p(Vy, "applyMarkerOffsetsToPoints");
var FL = /* @__PURE__ */ p((t, e, r, i) => {
  e.forEach((n) => {
    VL[n](t, r, i);
  });
}, "insertMarkers"), OL = /* @__PURE__ */ p((t, e, r) => {
  R.trace("Making markers for ", r), t.append("defs").append("marker").attr("id", r + "_" + e + "-extensionStart").attr("class", "marker extension " + e).attr("refX", 18).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("path").attr("d", "M 1,7 L18,13 V 1 Z"), t.append("defs").append("marker").attr("id", r + "_" + e + "-extensionEnd").attr("class", "marker extension " + e).attr("refX", 1).attr("refY", 7).attr("markerWidth", 20).attr("markerHeight", 28).attr("orient", "auto").append("path").attr("d", "M 1,1 V 13 L18,7 Z");
}, "extension"), DL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-compositionStart").attr("class", "marker composition " + e).attr("refX", 18).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("path").attr("d", "M 18,7 L9,13 L1,7 L9,1 Z"), t.append("defs").append("marker").attr("id", r + "_" + e + "-compositionEnd").attr("class", "marker composition " + e).attr("refX", 1).attr("refY", 7).attr("markerWidth", 20).attr("markerHeight", 28).attr("orient", "auto").append("path").attr("d", "M 18,7 L9,13 L1,7 L9,1 Z");
}, "composition"), IL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-aggregationStart").attr("class", "marker aggregation " + e).attr("refX", 18).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("path").attr("d", "M 18,7 L9,13 L1,7 L9,1 Z"), t.append("defs").append("marker").attr("id", r + "_" + e + "-aggregationEnd").attr("class", "marker aggregation " + e).attr("refX", 1).attr("refY", 7).attr("markerWidth", 20).attr("markerHeight", 28).attr("orient", "auto").append("path").attr("d", "M 18,7 L9,13 L1,7 L9,1 Z");
}, "aggregation"), RL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-dependencyStart").attr("class", "marker dependency " + e).attr("refX", 6).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("path").attr("d", "M 5,7 L9,13 L1,7 L9,1 Z"), t.append("defs").append("marker").attr("id", r + "_" + e + "-dependencyEnd").attr("class", "marker dependency " + e).attr("refX", 13).attr("refY", 7).attr("markerWidth", 20).attr("markerHeight", 28).attr("orient", "auto").append("path").attr("d", "M 18,7 L9,13 L14,7 L9,1 Z");
}, "dependency"), PL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-lollipopStart").attr("class", "marker lollipop " + e).attr("refX", 13).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("circle").attr("stroke", "black").attr("fill", "transparent").attr("cx", 7).attr("cy", 7).attr("r", 6), t.append("defs").append("marker").attr("id", r + "_" + e + "-lollipopEnd").attr("class", "marker lollipop " + e).attr("refX", 1).attr("refY", 7).attr("markerWidth", 190).attr("markerHeight", 240).attr("orient", "auto").append("circle").attr("stroke", "black").attr("fill", "transparent").attr("cx", 7).attr("cy", 7).attr("r", 6);
}, "lollipop"), NL = /* @__PURE__ */ p((t, e, r) => {
  t.append("marker").attr("id", r + "_" + e + "-pointEnd").attr("class", "marker " + e).attr("viewBox", "0 0 10 10").attr("refX", 5).attr("refY", 5).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto").append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("class", "arrowMarkerPath").style("stroke-width", 1).style("stroke-dasharray", "1,0"), t.append("marker").attr("id", r + "_" + e + "-pointStart").attr("class", "marker " + e).attr("viewBox", "0 0 10 10").attr("refX", 4.5).attr("refY", 5).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto").append("path").attr("d", "M 0 5 L 10 10 L 10 0 z").attr("class", "arrowMarkerPath").style("stroke-width", 1).style("stroke-dasharray", "1,0");
}, "point"), zL = /* @__PURE__ */ p((t, e, r) => {
  t.append("marker").attr("id", r + "_" + e + "-circleEnd").attr("class", "marker " + e).attr("viewBox", "0 0 10 10").attr("refX", 11).attr("refY", 5).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 11).attr("markerHeight", 11).attr("orient", "auto").append("circle").attr("cx", "5").attr("cy", "5").attr("r", "5").attr("class", "arrowMarkerPath").style("stroke-width", 1).style("stroke-dasharray", "1,0"), t.append("marker").attr("id", r + "_" + e + "-circleStart").attr("class", "marker " + e).attr("viewBox", "0 0 10 10").attr("refX", -1).attr("refY", 5).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 11).attr("markerHeight", 11).attr("orient", "auto").append("circle").attr("cx", "5").attr("cy", "5").attr("r", "5").attr("class", "arrowMarkerPath").style("stroke-width", 1).style("stroke-dasharray", "1,0");
}, "circle"), WL = /* @__PURE__ */ p((t, e, r) => {
  t.append("marker").attr("id", r + "_" + e + "-crossEnd").attr("class", "marker cross " + e).attr("viewBox", "0 0 11 11").attr("refX", 12).attr("refY", 5.2).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 11).attr("markerHeight", 11).attr("orient", "auto").append("path").attr("d", "M 1,1 l 9,9 M 10,1 l -9,9").attr("class", "arrowMarkerPath").style("stroke-width", 2).style("stroke-dasharray", "1,0"), t.append("marker").attr("id", r + "_" + e + "-crossStart").attr("class", "marker cross " + e).attr("viewBox", "0 0 11 11").attr("refX", -1).attr("refY", 5.2).attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 11).attr("markerHeight", 11).attr("orient", "auto").append("path").attr("d", "M 1,1 l 9,9 M 10,1 l -9,9").attr("class", "arrowMarkerPath").style("stroke-width", 2).style("stroke-dasharray", "1,0");
}, "cross"), qL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-barbEnd").attr("refX", 19).attr("refY", 7).attr("markerWidth", 20).attr("markerHeight", 14).attr("markerUnits", "userSpaceOnUse").attr("orient", "auto").append("path").attr("d", "M 19,7 L9,13 L14,7 L9,1 Z");
}, "barb"), HL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-onlyOneStart").attr("class", "marker onlyOne " + e).attr("refX", 0).attr("refY", 9).attr("markerWidth", 18).attr("markerHeight", 18).attr("orient", "auto").append("path").attr("d", "M9,0 L9,18 M15,0 L15,18"), t.append("defs").append("marker").attr("id", r + "_" + e + "-onlyOneEnd").attr("class", "marker onlyOne " + e).attr("refX", 18).attr("refY", 9).attr("markerWidth", 18).attr("markerHeight", 18).attr("orient", "auto").append("path").attr("d", "M3,0 L3,18 M9,0 L9,18");
}, "only_one"), YL = /* @__PURE__ */ p((t, e, r) => {
  const i = t.append("defs").append("marker").attr("id", r + "_" + e + "-zeroOrOneStart").attr("class", "marker zeroOrOne " + e).attr("refX", 0).attr("refY", 9).attr("markerWidth", 30).attr("markerHeight", 18).attr("orient", "auto");
  i.append("circle").attr("fill", "white").attr("cx", 21).attr("cy", 9).attr("r", 6), i.append("path").attr("d", "M9,0 L9,18");
  const n = t.append("defs").append("marker").attr("id", r + "_" + e + "-zeroOrOneEnd").attr("class", "marker zeroOrOne " + e).attr("refX", 30).attr("refY", 9).attr("markerWidth", 30).attr("markerHeight", 18).attr("orient", "auto");
  n.append("circle").attr("fill", "white").attr("cx", 9).attr("cy", 9).attr("r", 6), n.append("path").attr("d", "M21,0 L21,18");
}, "zero_or_one"), jL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-oneOrMoreStart").attr("class", "marker oneOrMore " + e).attr("refX", 18).attr("refY", 18).attr("markerWidth", 45).attr("markerHeight", 36).attr("orient", "auto").append("path").attr("d", "M0,18 Q 18,0 36,18 Q 18,36 0,18 M42,9 L42,27"), t.append("defs").append("marker").attr("id", r + "_" + e + "-oneOrMoreEnd").attr("class", "marker oneOrMore " + e).attr("refX", 27).attr("refY", 18).attr("markerWidth", 45).attr("markerHeight", 36).attr("orient", "auto").append("path").attr("d", "M3,9 L3,27 M9,18 Q27,0 45,18 Q27,36 9,18");
}, "one_or_more"), UL = /* @__PURE__ */ p((t, e, r) => {
  const i = t.append("defs").append("marker").attr("id", r + "_" + e + "-zeroOrMoreStart").attr("class", "marker zeroOrMore " + e).attr("refX", 18).attr("refY", 18).attr("markerWidth", 57).attr("markerHeight", 36).attr("orient", "auto");
  i.append("circle").attr("fill", "white").attr("cx", 48).attr("cy", 18).attr("r", 6), i.append("path").attr("d", "M0,18 Q18,0 36,18 Q18,36 0,18");
  const n = t.append("defs").append("marker").attr("id", r + "_" + e + "-zeroOrMoreEnd").attr("class", "marker zeroOrMore " + e).attr("refX", 39).attr("refY", 18).attr("markerWidth", 57).attr("markerHeight", 36).attr("orient", "auto");
  n.append("circle").attr("fill", "white").attr("cx", 9).attr("cy", 18).attr("r", 6), n.append("path").attr("d", "M21,18 Q39,0 57,18 Q39,36 21,18");
}, "zero_or_more"), XL = /* @__PURE__ */ p((t, e, r) => {
  t.append("defs").append("marker").attr("id", r + "_" + e + "-requirement_arrowEnd").attr("refX", 20).attr("refY", 10).attr("markerWidth", 20).attr("markerHeight", 20).attr("orient", "auto").append("path").attr(
    "d",
    `M0,0
      L20,10
      M20,10
      L0,20`
  );
}, "requirement_arrow"), GL = /* @__PURE__ */ p((t, e, r) => {
  const i = t.append("defs").append("marker").attr("id", r + "_" + e + "-requirement_containsStart").attr("refX", 0).attr("refY", 10).attr("markerWidth", 20).attr("markerHeight", 20).attr("orient", "auto").append("g");
  i.append("circle").attr("cx", 10).attr("cy", 10).attr("r", 9).attr("fill", "none"), i.append("line").attr("x1", 1).attr("x2", 19).attr("y1", 10).attr("y2", 10), i.append("line").attr("y1", 1).attr("y2", 19).attr("x1", 10).attr("x2", 10);
}, "requirement_contains"), VL = {
  extension: OL,
  composition: DL,
  aggregation: IL,
  dependency: RL,
  lollipop: PL,
  point: NL,
  circle: zL,
  cross: WL,
  barb: qL,
  only_one: HL,
  zero_or_one: YL,
  one_or_more: jL,
  zero_or_more: UL,
  requirement_arrow: XL,
  requirement_contains: GL
}, KL = FL, ZL = {
  common: _i,
  getConfig: Ht,
  insertCluster: sL,
  insertEdge: $L,
  insertEdgeLabel: TL,
  insertMarkers: KL,
  insertNode: Uy,
  interpolateToCurve: sc,
  labelHelper: at,
  log: R,
  positionEdgeLabel: AL
}, bn = {}, Ky = /* @__PURE__ */ p((t) => {
  for (const e of t)
    bn[e.name] = e;
}, "registerLayoutLoaders"), QL = /* @__PURE__ */ p(() => {
  Ky([
    {
      name: "dagre",
      loader: /* @__PURE__ */ p(async () => await import("./dagre-6UL2VRFP-OxyUkegX.js"), "loader")
    },
    {
      name: "cose-bilkent",
      loader: /* @__PURE__ */ p(async () => await import("./cose-bilkent-S5V4N54A-nToLjx_x.js"), "loader")
    }
  ]);
}, "registerDefaultLayoutLoaders");
QL();
var XF = /* @__PURE__ */ p(async (t, e) => {
  if (!(t.layoutAlgorithm in bn))
    throw new Error(`Unknown layout algorithm: ${t.layoutAlgorithm}`);
  const r = bn[t.layoutAlgorithm];
  return (await r.loader()).render(t, e, ZL, {
    algorithm: r.algorithm
  });
}, "render"), GF = /* @__PURE__ */ p((t = "", { fallback: e = "dagre" } = {}) => {
  if (t in bn)
    return t;
  if (e in bn)
    return R.warn(`Layout algorithm ${t} is not registered. Using ${e} as fallback.`), e;
  throw new Error(`Both layout algorithms ${t} and ${e} are not registered.`);
}, "getRegisteredLayoutAlgorithm"), Zy = "comm", Qy = "rule", Jy = "decl", JL = "@import", tE = "@namespace", eE = "@keyframes", rE = "@layer", iE = Math.abs, an = String.fromCharCode;
function t0(t) {
  return t.trim();
}
function fl(t, e, r) {
  return t.replace(e, r);
}
function hi(t, e) {
  return t.charCodeAt(e) | 0;
}
function bi(t, e, r) {
  return t.slice(e, r);
}
function Oe(t) {
  return t.length;
}
function nE(t) {
  return t.length;
}
function is(t, e) {
  return e.push(t), t;
}
var La = 1, wi = 1, e0 = 0, pe = 0, Lt = 0, Ai = "";
function vc(t, e, r, i, n, s, a, o) {
  return { value: t, root: e, parent: r, type: i, props: n, children: s, line: La, column: wi, length: a, return: "", siblings: o };
}
function sE() {
  return Lt;
}
function aE() {
  return Lt = pe > 0 ? hi(Ai, --pe) : 0, wi--, Lt === 10 && (wi = 1, La--), Lt;
}
function _e() {
  return Lt = pe < e0 ? hi(Ai, pe++) : 0, wi++, Lt === 10 && (wi = 1, La++), Lt;
}
function sr() {
  return hi(Ai, pe);
}
function ms() {
  return pe;
}
function Ea(t, e) {
  return bi(Ai, t, e);
}
function wn(t) {
  switch (t) {
    // \0 \t \n \r \s whitespace token
    case 0:
    case 9:
    case 10:
    case 13:
    case 32:
      return 5;
    // ! + , / > @ ~ isolate token
    case 33:
    case 43:
    case 44:
    case 47:
    case 62:
    case 64:
    case 126:
    // ; { } breakpoint token
    case 59:
    case 123:
    case 125:
      return 4;
    // : accompanied token
    case 58:
      return 3;
    // " ' ( [ opening delimit token
    case 34:
    case 39:
    case 40:
    case 91:
      return 2;
    // ) ] closing delimit token
    case 41:
    case 93:
      return 1;
  }
  return 0;
}
function oE(t) {
  return La = wi = 1, e0 = Oe(Ai = t), pe = 0, [];
}
function lE(t) {
  return Ai = "", t;
}
function po(t) {
  return t0(Ea(pe - 1, dl(t === 91 ? t + 2 : t === 40 ? t + 1 : t)));
}
function cE(t) {
  for (; (Lt = sr()) && Lt < 33; )
    _e();
  return wn(t) > 2 || wn(Lt) > 3 ? "" : " ";
}
function hE(t, e) {
  for (; --e && _e() && !(Lt < 48 || Lt > 102 || Lt > 57 && Lt < 65 || Lt > 70 && Lt < 97); )
    ;
  return Ea(t, ms() + (e < 6 && sr() == 32 && _e() == 32));
}
function dl(t) {
  for (; _e(); )
    switch (Lt) {
      // ] ) " '
      case t:
        return pe;
      // " '
      case 34:
      case 39:
        t !== 34 && t !== 39 && dl(Lt);
        break;
      // (
      case 40:
        t === 41 && dl(t);
        break;
      // \
      case 92:
        _e();
        break;
    }
  return pe;
}
function uE(t, e) {
  for (; _e() && t + Lt !== 57; )
    if (t + Lt === 84 && sr() === 47)
      break;
  return "/*" + Ea(e, pe - 1) + "*" + an(t === 47 ? t : _e());
}
function fE(t) {
  for (; !wn(sr()); )
    _e();
  return Ea(t, pe);
}
function dE(t) {
  return lE(ys("", null, null, null, [""], t = oE(t), 0, [0], t));
}
function ys(t, e, r, i, n, s, a, o, l) {
  for (var c = 0, h = 0, u = a, f = 0, d = 0, g = 0, m = 1, y = 1, x = 1, b = 0, C = 0, k = "", _ = n, E = s, B = i, S = k; y; )
    switch (g = C, C = _e()) {
      // (
      case 40:
        g != 108 && hi(S, u - 1) == 58 ? (b++, S += "(") : S += po(C);
        break;
      // )
      case 41:
        b--, S += ")";
        break;
      // " ' [
      case 34:
      case 39:
      case 91:
        S += po(C);
        break;
      // \t \n \r \s
      case 9:
      case 10:
      case 13:
      case 32:
        if (b > 0) {
          S += an(C);
          break;
        }
        S += cE(g);
        break;
      // \
      case 92:
        S += hE(ms() - 1, 7);
        continue;
      // /
      case 47:
        switch (sr()) {
          case 42:
          case 47:
            is(pE(uE(_e(), ms()), e, r, l), l), (wn(g || 1) == 5 || wn(sr() || 1) == 5) && Oe(S) && bi(S, -1, void 0) !== " " && (S += " ");
            break;
          default:
            S += "/";
        }
        break;
      // {
      case 123 * m:
        o[c++] = Oe(S) * x;
      // } ; \0
      case 125 * m:
      case 59:
      case 0:
        if (b > 0 && C) {
          S += an(C);
          break;
        }
        switch (C) {
          // \0 }
          case 0:
          case 125:
            y = 0;
          // ;
          case 59 + h:
            x == -1 && (S = fl(S, /\f/g, "")), d > 0 && (Oe(S) - u || m === 0) && is(d > 32 ? Hu(S + ";", i, r, u - 1, l) : Hu(fl(S, " ", "") + ";", i, r, u - 2, l), l);
            break;
          // @ ;
          case 59:
            S += ";";
          // { rule/at-rule
          default:
            if (is(B = qu(S, e, r, c, h, n, o, k, _ = [], E = [], u, s), s), C === 123)
              if (h === 0)
                ys(S, e, B, B, _, s, u, o, E);
              else {
                switch (f) {
                  // c(ontainer)
                  case 99:
                    if (hi(S, 3) === 110) break;
                  // l(ayer)
                  case 108:
                    if (hi(S, 2) === 97) break;
                  default:
                    h = 0;
                  // d(ocument) m(edia) s(upports)
                  case 100:
                  case 109:
                  case 115:
                }
                h ? ys(t, B, B, i && is(qu(t, B, B, 0, 0, n, o, k, n, _ = [], u, E), E), n, E, u, o, i ? _ : E) : ys(S, B, B, B, [""], E, 0, o, E);
              }
        }
        c = h = d = 0, m = x = 1, k = S = "", u = a;
        break;
      // :
      case 58:
        u = 1 + Oe(S), d = g;
      default:
        if (m < 1) {
          if (C == 123)
            --m;
          else if (C == 125 && m++ == 0 && aE() == 125)
            continue;
        }
        switch (S += an(C), C * m) {
          // &
          case 38:
            x = h > 0 ? 1 : (S += "\f", -1);
            break;
          // ,
          case 44:
            if (b > 0) break;
            o[c++] = (Oe(S) - 1) * x, x = 1;
            break;
          // @
          case 64:
            sr() === 45 && (S += po(_e())), f = sr(), h = u = Oe(k = S += fE(ms())), C++;
            break;
          // -
          case 45:
            g === 45 && Oe(S) == 2 && (m = 0);
        }
    }
  return s;
}
function qu(t, e, r, i, n, s, a, o, l, c, h, u) {
  for (var f = n - 1, d = n === 0 ? s : [""], g = nE(d), m = 0, y = 0, x = 0; m < i; ++m)
    for (var b = 0, C = bi(t, f + 1, f = iE(y = a[m])), k = t; b < g; ++b)
      (k = t0(y > 0 ? d[b] + " " + C : fl(C, /&\f/g, d[b]))) && (l[x++] = k);
  return vc(t, e, r, n === 0 ? Qy : o, l, c, h, u);
}
function pE(t, e, r, i) {
  return vc(t, e, r, Zy, an(sE()), bi(t, 2, -2), 0, i);
}
function Hu(t, e, r, i, n) {
  return vc(t, e, r, Jy, bi(t, 0, i), bi(t, i + 1, -1), i, n);
}
function pl(t, e) {
  for (var r = "", i = 0; i < t.length; i++)
    r += e(t[i], i, t, e) || "";
  return r;
}
function gE(t, e, r, i) {
  switch (t.type) {
    case rE:
      if (t.children.length) break;
    case JL:
    case tE:
    case Jy:
      return t.return = t.return || t.value;
    case Zy:
      return "";
    case eE:
      return t.return = t.value + "{" + pl(t.children, i) + "}";
    case Qy:
      if (!Oe(t.value = t.props.join(","))) return "";
  }
  return Oe(r = pl(t.children, i)) ? t.return = t.value + "{" + r + "}" : "";
}
var mE = Lg(Object.keys, Object), yE = Object.prototype, xE = yE.hasOwnProperty;
function bE(t) {
  if (!xa(t))
    return mE(t);
  var e = [];
  for (var r in Object(t))
    xE.call(t, r) && r != "constructor" && e.push(r);
  return e;
}
var gl = Yr(Ne, "DataView"), ml = Yr(Ne, "Promise"), yl = Yr(Ne, "Set"), xl = Yr(Ne, "WeakMap"), Yu = "[object Map]", wE = "[object Object]", ju = "[object Promise]", Uu = "[object Set]", Xu = "[object WeakMap]", Gu = "[object DataView]", CE = Hr(gl), _E = Hr(yn), kE = Hr(ml), SE = Hr(yl), vE = Hr(xl), Sr = Si;
(gl && Sr(new gl(new ArrayBuffer(1))) != Gu || yn && Sr(new yn()) != Yu || ml && Sr(ml.resolve()) != ju || yl && Sr(new yl()) != Uu || xl && Sr(new xl()) != Xu) && (Sr = function(t) {
  var e = Si(t), r = e == wE ? t.constructor : void 0, i = r ? Hr(r) : "";
  if (i)
    switch (i) {
      case CE:
        return Gu;
      case _E:
        return Yu;
      case kE:
        return ju;
      case SE:
        return Uu;
      case vE:
        return Xu;
    }
  return e;
});
var TE = "[object Map]", AE = "[object Set]", LE = Object.prototype, EE = LE.hasOwnProperty;
function Vu(t) {
  if (t == null)
    return !0;
  if (ba(t) && (Hs(t) || typeof t == "string" || typeof t.splice == "function" || ic(t) || nc(t) || qs(t)))
    return !t.length;
  var e = Sr(t);
  if (e == TE || e == AE)
    return !t.size;
  if (xa(t))
    return !bE(t).length;
  for (var r in t)
    if (EE.call(t, r))
      return !1;
  return !0;
}
var r0 = "c4", BE = /* @__PURE__ */ p((t) => /^\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/.test(t), "detector"), ME = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./c4Diagram-YG6GDRKO-Dq-D0CCW.js");
  return { id: r0, diagram: t };
}, "loader"), $E = {
  id: r0,
  detector: BE,
  loader: ME
}, FE = $E, i0 = "flowchart", OE = /* @__PURE__ */ p((t, e) => e?.flowchart?.defaultRenderer === "dagre-wrapper" || e?.flowchart?.defaultRenderer === "elk" ? !1 : /^\s*graph/.test(t), "detector"), DE = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./flowDiagram-NV44I4VS-CDjpB5y_.js");
  return { id: i0, diagram: t };
}, "loader"), IE = {
  id: i0,
  detector: OE,
  loader: DE
}, RE = IE, n0 = "flowchart-v2", PE = /* @__PURE__ */ p((t, e) => e?.flowchart?.defaultRenderer === "dagre-d3" ? !1 : (e?.flowchart?.defaultRenderer === "elk" && (e.layout = "elk"), /^\s*graph/.test(t) && e?.flowchart?.defaultRenderer === "dagre-wrapper" ? !0 : /^\s*flowchart/.test(t)), "detector"), NE = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./flowDiagram-NV44I4VS-CDjpB5y_.js");
  return { id: n0, diagram: t };
}, "loader"), zE = {
  id: n0,
  detector: PE,
  loader: NE
}, WE = zE, s0 = "er", qE = /* @__PURE__ */ p((t) => /^\s*erDiagram/.test(t), "detector"), HE = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./erDiagram-Q2GNP2WA-CYwz-fKp.js");
  return { id: s0, diagram: t };
}, "loader"), YE = {
  id: s0,
  detector: qE,
  loader: HE
}, jE = YE, a0 = "gitGraph", UE = /* @__PURE__ */ p((t) => /^\s*gitGraph/.test(t), "detector"), XE = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./gitGraphDiagram-NY62KEGX-BLdffJC8.js");
  return { id: a0, diagram: t };
}, "loader"), GE = {
  id: a0,
  detector: UE,
  loader: XE
}, VE = GE, o0 = "gantt", KE = /* @__PURE__ */ p((t) => /^\s*gantt/.test(t), "detector"), ZE = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./ganttDiagram-JELNMOA3-Cb_snYdL.js");
  return { id: o0, diagram: t };
}, "loader"), QE = {
  id: o0,
  detector: KE,
  loader: ZE
}, JE = QE, l0 = "info", tB = /* @__PURE__ */ p((t) => /^\s*info/.test(t), "detector"), eB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./infoDiagram-WHAUD3N6-DU4byATk.js");
  return { id: l0, diagram: t };
}, "loader"), rB = {
  id: l0,
  detector: tB,
  loader: eB
}, c0 = "pie", iB = /* @__PURE__ */ p((t) => /^\s*pie/.test(t), "detector"), nB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./pieDiagram-ADFJNKIX-BlbTAzKO.js");
  return { id: c0, diagram: t };
}, "loader"), sB = {
  id: c0,
  detector: iB,
  loader: nB
}, h0 = "quadrantChart", aB = /* @__PURE__ */ p((t) => /^\s*quadrantChart/.test(t), "detector"), oB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./quadrantDiagram-AYHSOK5B-ClupifoO.js");
  return { id: h0, diagram: t };
}, "loader"), lB = {
  id: h0,
  detector: aB,
  loader: oB
}, cB = lB, u0 = "xychart", hB = /* @__PURE__ */ p((t) => /^\s*xychart(-beta)?/.test(t), "detector"), uB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./xychartDiagram-PRI3JC2R-BXfq2Oy0.js");
  return { id: u0, diagram: t };
}, "loader"), fB = {
  id: u0,
  detector: hB,
  loader: uB
}, dB = fB, f0 = "requirement", pB = /* @__PURE__ */ p((t) => /^\s*requirement(Diagram)?/.test(t), "detector"), gB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./requirementDiagram-UZGBJVZJ-CWPRqaYl.js");
  return { id: f0, diagram: t };
}, "loader"), mB = {
  id: f0,
  detector: pB,
  loader: gB
}, yB = mB, d0 = "sequence", xB = /* @__PURE__ */ p((t) => /^\s*sequenceDiagram/.test(t), "detector"), bB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./sequenceDiagram-WL72ISMW-BZGBa1oh.js");
  return { id: d0, diagram: t };
}, "loader"), wB = {
  id: d0,
  detector: xB,
  loader: bB
}, CB = wB, p0 = "class", _B = /* @__PURE__ */ p((t, e) => e?.class?.defaultRenderer === "dagre-wrapper" ? !1 : /^\s*classDiagram/.test(t), "detector"), kB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./classDiagram-2ON5EDUG-BiQuW3Pw.js");
  return { id: p0, diagram: t };
}, "loader"), SB = {
  id: p0,
  detector: _B,
  loader: kB
}, vB = SB, g0 = "classDiagram", TB = /* @__PURE__ */ p((t, e) => /^\s*classDiagram/.test(t) && e?.class?.defaultRenderer === "dagre-wrapper" ? !0 : /^\s*classDiagram-v2/.test(t), "detector"), AB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./classDiagram-v2-WZHVMYZB-BiQuW3Pw.js");
  return { id: g0, diagram: t };
}, "loader"), LB = {
  id: g0,
  detector: TB,
  loader: AB
}, EB = LB, m0 = "state", BB = /* @__PURE__ */ p((t, e) => e?.state?.defaultRenderer === "dagre-wrapper" ? !1 : /^\s*stateDiagram/.test(t), "detector"), MB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./stateDiagram-FKZM4ZOC-t0d0nFEw.js");
  return { id: m0, diagram: t };
}, "loader"), $B = {
  id: m0,
  detector: BB,
  loader: MB
}, FB = $B, y0 = "stateDiagram", OB = /* @__PURE__ */ p((t, e) => !!(/^\s*stateDiagram-v2/.test(t) || /^\s*stateDiagram/.test(t) && e?.state?.defaultRenderer === "dagre-wrapper"), "detector"), DB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./stateDiagram-v2-4FDKWEC3-nK0oTuxI.js");
  return { id: y0, diagram: t };
}, "loader"), IB = {
  id: y0,
  detector: OB,
  loader: DB
}, RB = IB, x0 = "journey", PB = /* @__PURE__ */ p((t) => /^\s*journey/.test(t), "detector"), NB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./journeyDiagram-XKPGCS4Q-DENVVHii.js");
  return { id: x0, diagram: t };
}, "loader"), zB = {
  id: x0,
  detector: PB,
  loader: NB
}, WB = zB, qB = /* @__PURE__ */ p((t, e, r) => {
  R.debug(`rendering svg for syntax error
`);
  const i = __(e), n = i.append("g");
  i.attr("viewBox", "0 0 2412 512"), Uf(i, 100, 512, !0), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m411.313,123.313c6.25-6.25 6.25-16.375 0-22.625s-16.375-6.25-22.625,0l-32,32-9.375,9.375-20.688-20.688c-12.484-12.5-32.766-12.5-45.25,0l-16,16c-1.261,1.261-2.304,2.648-3.31,4.051-21.739-8.561-45.324-13.426-70.065-13.426-105.867,0-192,86.133-192,192s86.133,192 192,192 192-86.133 192-192c0-24.741-4.864-48.327-13.426-70.065 1.402-1.007 2.79-2.049 4.051-3.31l16-16c12.5-12.492 12.5-32.758 0-45.25l-20.688-20.688 9.375-9.375 32.001-31.999zm-219.313,100.687c-52.938,0-96,43.063-96,96 0,8.836-7.164,16-16,16s-16-7.164-16-16c0-70.578 57.422-128 128-128 8.836,0 16,7.164 16,16s-7.164,16-16,16z"
  ), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m459.02,148.98c-6.25-6.25-16.375-6.25-22.625,0s-6.25,16.375 0,22.625l16,16c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688 6.25-6.25 6.25-16.375 0-22.625l-16.001-16z"
  ), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m340.395,75.605c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688 6.25-6.25 6.25-16.375 0-22.625l-16-16c-6.25-6.25-16.375-6.25-22.625,0s-6.25,16.375 0,22.625l15.999,16z"
  ), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m400,64c8.844,0 16-7.164 16-16v-32c0-8.836-7.156-16-16-16-8.844,0-16,7.164-16,16v32c0,8.836 7.156,16 16,16z"
  ), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m496,96.586h-32c-8.844,0-16,7.164-16,16 0,8.836 7.156,16 16,16h32c8.844,0 16-7.164 16-16 0-8.836-7.156-16-16-16z"
  ), n.append("path").attr("class", "error-icon").attr(
    "d",
    "m436.98,75.605c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688l32-32c6.25-6.25 6.25-16.375 0-22.625s-16.375-6.25-22.625,0l-32,32c-6.251,6.25-6.251,16.375-0.001,22.625z"
  ), n.append("text").attr("class", "error-text").attr("x", 1440).attr("y", 250).attr("font-size", "150px").style("text-anchor", "middle").text("Syntax error in text"), n.append("text").attr("class", "error-text").attr("x", 1250).attr("y", 400).attr("font-size", "100px").style("text-anchor", "middle").text(`mermaid version ${r}`);
}, "draw"), b0 = { draw: qB }, HB = b0, YB = {
  db: {},
  renderer: b0,
  parser: {
    parse: /* @__PURE__ */ p(() => {
    }, "parse")
  }
}, jB = YB, w0 = "flowchart-elk", UB = /* @__PURE__ */ p((t, e = {}) => (
  // If diagram explicitly states flowchart-elk
  /^\s*flowchart-elk/.test(t) || // If a flowchart/graph diagram has their default renderer set to elk
  /^\s*(flowchart|graph)/.test(t) && e?.flowchart?.defaultRenderer === "elk" ? (e.layout = "elk", !0) : !1
), "detector"), XB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./flowDiagram-NV44I4VS-CDjpB5y_.js");
  return { id: w0, diagram: t };
}, "loader"), GB = {
  id: w0,
  detector: UB,
  loader: XB
}, VB = GB, C0 = "timeline", KB = /* @__PURE__ */ p((t) => /^\s*timeline/.test(t), "detector"), ZB = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./timeline-definition-IT6M3QCI-CPdx7lqw.js");
  return { id: C0, diagram: t };
}, "loader"), QB = {
  id: C0,
  detector: KB,
  loader: ZB
}, JB = QB, _0 = "mindmap", tM = /* @__PURE__ */ p((t) => /^\s*mindmap/.test(t), "detector"), eM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./mindmap-definition-VGOIOE7T-GOQHtg6m.js");
  return { id: _0, diagram: t };
}, "loader"), rM = {
  id: _0,
  detector: tM,
  loader: eM
}, iM = rM, k0 = "kanban", nM = /* @__PURE__ */ p((t) => /^\s*kanban/.test(t), "detector"), sM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./kanban-definition-3W4ZIXB7-By_Ycdoh.js");
  return { id: k0, diagram: t };
}, "loader"), aM = {
  id: k0,
  detector: nM,
  loader: sM
}, oM = aM, S0 = "sankey", lM = /* @__PURE__ */ p((t) => /^\s*sankey(-beta)?/.test(t), "detector"), cM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./sankeyDiagram-TZEHDZUN-BJ7wgVbt.js");
  return { id: S0, diagram: t };
}, "loader"), hM = {
  id: S0,
  detector: lM,
  loader: cM
}, uM = hM, v0 = "packet", fM = /* @__PURE__ */ p((t) => /^\s*packet(-beta)?/.test(t), "detector"), dM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./diagram-S2PKOQOG-DzLZqTAA.js");
  return { id: v0, diagram: t };
}, "loader"), pM = {
  id: v0,
  detector: fM,
  loader: dM
}, T0 = "radar", gM = /* @__PURE__ */ p((t) => /^\s*radar-beta/.test(t), "detector"), mM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./diagram-QEK2KX5R-Diu6RWGZ.js");
  return { id: T0, diagram: t };
}, "loader"), yM = {
  id: T0,
  detector: gM,
  loader: mM
}, A0 = "block", xM = /* @__PURE__ */ p((t) => /^\s*block(-beta)?/.test(t), "detector"), bM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./blockDiagram-VD42YOAC-Br2pWDHb.js");
  return { id: A0, diagram: t };
}, "loader"), wM = {
  id: A0,
  detector: xM,
  loader: bM
}, CM = wM, L0 = "architecture", _M = /* @__PURE__ */ p((t) => /^\s*architecture/.test(t), "detector"), kM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./architectureDiagram-VXUJARFQ-Dd6KVoID.js");
  return { id: L0, diagram: t };
}, "loader"), SM = {
  id: L0,
  detector: _M,
  loader: kM
}, vM = SM, E0 = "treemap", TM = /* @__PURE__ */ p((t) => /^\s*treemap/.test(t), "detector"), AM = /* @__PURE__ */ p(async () => {
  const { diagram: t } = await import("./diagram-PSM6KHXK-i4TpYolH.js");
  return { id: E0, diagram: t };
}, "loader"), LM = {
  id: E0,
  detector: TM,
  loader: AM
}, Ku = !1, Ba = /* @__PURE__ */ p(() => {
  Ku || (Ku = !0, ks("error", jB, (t) => t.toLowerCase().trim() === "error"), ks(
    "---",
    // --- diagram type may appear if YAML front-matter is not parsed correctly
    {
      db: {
        clear: /* @__PURE__ */ p(() => {
        }, "clear")
      },
      styles: {},
      // should never be used
      renderer: {
        draw: /* @__PURE__ */ p(() => {
        }, "draw")
      },
      parser: {
        parse: /* @__PURE__ */ p(() => {
          throw new Error(
            "Diagrams beginning with --- are not valid. If you were trying to use a YAML front-matter, please ensure that you've correctly opened and closed the YAML front-matter with un-indented `---` blocks"
          );
        }, "parse")
      },
      init: /* @__PURE__ */ p(() => null, "init")
      // no op
    },
    (t) => t.toLowerCase().trimStart().startsWith("---")
  ), So(VB, iM, vM), So(
    FE,
    oM,
    EB,
    vB,
    jE,
    JE,
    rB,
    sB,
    yB,
    CB,
    WE,
    RE,
    JB,
    VE,
    RB,
    FB,
    WB,
    cB,
    uM,
    pM,
    dB,
    CM,
    yM,
    LM
  ));
}, "addDiagrams"), EM = /* @__PURE__ */ p(async () => {
  R.debug("Loading registered diagrams");
  const e = (await Promise.allSettled(
    Object.entries(Or).map(async ([r, { detector: i, loader: n }]) => {
      if (n)
        try {
          Lo(r);
        } catch {
          try {
            const { diagram: s, id: a } = await n();
            ks(a, s, i);
          } catch (s) {
            throw R.error(`Failed to load external diagram with key ${r}. Removing from detectors.`), delete Or[r], s;
          }
        }
    })
  )).filter((r) => r.status === "rejected");
  if (e.length > 0) {
    R.error(`Failed to load ${e.length} external diagrams`);
    for (const r of e)
      R.error(r);
    throw new Error(`Failed to load ${e.length} external diagrams`);
  }
}, "loadRegisteredDiagrams"), BM = "graphics-document document";
function B0(t, e) {
  t.attr("role", BM), e !== "" && t.attr("aria-roledescription", e);
}
p(B0, "setA11yDiagramInfo");
function M0(t, e, r, i) {
  if (t.insert !== void 0) {
    if (r) {
      const n = `chart-desc-${i}`;
      t.attr("aria-describedby", n), t.insert("desc", ":first-child").attr("id", n).text(r);
    }
    if (e) {
      const n = `chart-title-${i}`;
      t.attr("aria-labelledby", n), t.insert("title", ":first-child").attr("id", n).text(e);
    }
  }
}
p(M0, "addSVGa11yTitleDescription");
var bl = class $0 {
  constructor(e, r, i, n, s) {
    this.type = e, this.text = r, this.db = i, this.parser = n, this.renderer = s;
  }
  static {
    p(this, "Diagram");
  }
  static async fromText(e, r = {}) {
    const i = Ht(), n = Ll(e, i);
    e = LT(e) + `
`;
    try {
      Lo(n);
    } catch {
      const c = Qb(n);
      if (!c)
        throw new Of(`Diagram ${n} not found.`);
      const { id: h, diagram: u } = await c();
      ks(h, u);
    }
    const { db: s, parser: a, renderer: o, init: l } = Lo(n);
    return a.parser && (a.parser.yy = s), s.clear?.(), l?.(i), r.title && s.setDiagramTitle?.(r.title), await a.parse(e), new $0(n, e, s, a, o);
  }
  async render(e, r) {
    await this.renderer.draw(this.text, e, r, this);
  }
  getParser() {
    return this.parser;
  }
  getType() {
    return this.type;
  }
}, Zu = [], MM = /* @__PURE__ */ p(() => {
  Zu.forEach((t) => {
    t();
  }), Zu = [];
}, "attachFunctions"), $M = /* @__PURE__ */ p((t) => t.replace(/^\s*%%(?!{)[^\n]+\n?/gm, "").trimStart(), "cleanupComments");
function F0(t) {
  const e = t.match(Ff);
  if (!e)
    return {
      text: t,
      metadata: {}
    };
  let r = Ek(e[1], {
    // To support config, we need JSON schema.
    // https://www.yaml.org/spec/1.2/spec.html#id2803231
    schema: Lk
  }) ?? {};
  r = typeof r == "object" && !Array.isArray(r) ? r : {};
  const i = {};
  return r.displayMode && (i.displayMode = r.displayMode.toString()), r.title && (i.title = r.title.toString()), r.config && (i.config = r.config), {
    text: t.slice(e[0].length),
    metadata: i
  };
}
p(F0, "extractFrontMatter");
var FM = /* @__PURE__ */ p((t) => t.replace(/\r\n?/g, `
`).replace(
  /<(\w+)([^>]*)>/g,
  (e, r, i) => "<" + r + i.replace(/="([^"]*)"/g, "='$1'") + ">"
), "cleanupText"), OM = /* @__PURE__ */ p((t) => {
  const { text: e, metadata: r } = F0(t), { displayMode: i, title: n, config: s = {} } = r;
  return i && (s.gantt || (s.gantt = {}), s.gantt.displayMode = i), { title: n, config: s, text: e };
}, "processFrontmatter"), DM = /* @__PURE__ */ p((t) => {
  const e = we.detectInit(t) ?? {}, r = we.detectDirective(t, "wrap");
  return Array.isArray(r) ? e.wrap = r.some(({ type: i }) => i === "wrap") : r?.type === "wrap" && (e.wrap = !0), {
    text: gT(t),
    directive: e
  };
}, "processDirectives");
function Tc(t) {
  const e = FM(t), r = OM(e), i = DM(r.text), n = hc(r.config, i.directive);
  return t = $M(i.text), {
    code: t,
    title: r.title,
    config: n
  };
}
p(Tc, "preprocessDiagram");
function O0(t) {
  const e = new TextEncoder().encode(t), r = Array.from(e, (i) => String.fromCodePoint(i)).join("");
  return btoa(r);
}
p(O0, "toBase64");
var IM = 5e4, RM = "graph TB;a[Maximum text size in diagram exceeded];style a fill:#faa", PM = "sandbox", NM = "loose", zM = "http://www.w3.org/2000/svg", WM = "http://www.w3.org/1999/xlink", qM = "http://www.w3.org/1999/xhtml", HM = "100%", YM = "100%", jM = "border:0;margin:0;", UM = "margin:0", XM = "allow-top-navigation-by-user-activation allow-popups", GM = 'The "iframe" tag is not supported by your browser.', VM = ["foreignobject"], KM = ["dominant-baseline"];
function Ac(t) {
  const e = Tc(t);
  return Cs(), p1(e.config ?? {}), e;
}
p(Ac, "processAndSetConfigs");
async function D0(t, e) {
  Ba();
  try {
    const { code: r, config: i } = Ac(t);
    return { diagramType: (await R0(r)).type, config: i };
  } catch (r) {
    if (e?.suppressErrors)
      return !1;
    throw r;
  }
}
p(D0, "parse");
var Qu = /* @__PURE__ */ p((t, e, r = []) => `
.${t} ${e} { ${r.join(" !important; ")} !important; }`, "cssImportantStyles"), ZM = /* @__PURE__ */ p((t, e = /* @__PURE__ */ new Map()) => {
  let r = "";
  if (t.themeCSS !== void 0 && (r += `
${t.themeCSS}`), t.fontFamily !== void 0 && (r += `
:root { --mermaid-font-family: ${t.fontFamily}}`), t.altFontFamily !== void 0 && (r += `
:root { --mermaid-alt-font-family: ${t.altFontFamily}}`), e instanceof Map) {
    const a = t.htmlLabels ?? t.flowchart?.htmlLabels ? ["> *", "span"] : ["rect", "polygon", "ellipse", "circle", "path"];
    e.forEach((o) => {
      Vu(o.styles) || a.forEach((l) => {
        r += Qu(o.id, l, o.styles);
      }), Vu(o.textStyles) || (r += Qu(
        o.id,
        "tspan",
        (o?.textStyles || []).map((l) => l.replace("color", "fill"))
      ));
    });
  }
  return r;
}, "createCssStyles"), QM = /* @__PURE__ */ p((t, e, r, i) => {
  const n = ZM(t, r), s = O1(e, n, t.themeVariables);
  return pl(dE(`${i}{${s}}`), gE);
}, "createUserStyles"), JM = /* @__PURE__ */ p((t = "", e, r) => {
  let i = t;
  return !r && !e && (i = i.replace(
    /marker-end="url\([\d+./:=?A-Za-z-]*?#/g,
    'marker-end="url(#'
  )), i = jr(i), i = i.replace(/<br>/g, "<br/>"), i;
}, "cleanUpSvgCode"), t$ = /* @__PURE__ */ p((t = "", e) => {
  const r = e?.viewBox?.baseVal?.height ? e.viewBox.baseVal.height + "px" : YM, i = O0(`<body style="${UM}">${t}</body>`);
  return `<iframe style="width:${HM};height:${r};${jM}" src="data:text/html;charset=UTF-8;base64,${i}" sandbox="${XM}">
  ${GM}
</iframe>`;
}, "putIntoIFrame"), Ju = /* @__PURE__ */ p((t, e, r, i, n) => {
  const s = t.append("div");
  s.attr("id", r), i && s.attr("style", i);
  const a = s.append("svg").attr("id", e).attr("width", "100%").attr("xmlns", zM);
  return n && a.attr("xmlns:xlink", n), a.append("g"), t;
}, "appendDivSvgG");
function wl(t, e) {
  return t.append("iframe").attr("id", e).attr("style", "width: 100%; height: 100%;").attr("sandbox", "");
}
p(wl, "sandboxedIframe");
var e$ = /* @__PURE__ */ p((t, e, r, i) => {
  t.getElementById(e)?.remove(), t.getElementById(r)?.remove(), t.getElementById(i)?.remove();
}, "removeExistingElements"), r$ = /* @__PURE__ */ p(async function(t, e, r) {
  Ba();
  const i = Ac(e);
  e = i.code;
  const n = Ht();
  R.debug(n), e.length > (n?.maxTextSize ?? IM) && (e = RM);
  const s = "#" + t, a = "i" + t, o = "#" + a, l = "d" + t, c = "#" + l, h = /* @__PURE__ */ p(() => {
    const N = dt(f ? o : c).node();
    N && "remove" in N && N.remove();
  }, "removeTempElements");
  let u = dt("body");
  const f = n.securityLevel === PM, d = n.securityLevel === NM, g = n.fontFamily;
  if (r !== void 0) {
    if (r && (r.innerHTML = ""), f) {
      const W = wl(dt(r), a);
      u = dt(W.nodes()[0].contentDocument.body), u.node().style.margin = 0;
    } else
      u = dt(r);
    Ju(u, t, l, `font-family: ${g}`, WM);
  } else {
    if (e$(document, t, l, a), f) {
      const W = wl(dt("body"), a);
      u = dt(W.nodes()[0].contentDocument.body), u.node().style.margin = 0;
    } else
      u = dt("body");
    Ju(u, t, l);
  }
  let m, y;
  try {
    m = await bl.fromText(e, { title: i.title });
  } catch (W) {
    if (n.suppressErrorRendering)
      throw h(), W;
    m = await bl.fromText("error"), y = W;
  }
  const x = u.select(c).node(), b = m.type, C = x.firstChild, k = C.firstChild, _ = m.renderer.getClasses?.(e, m), E = QM(n, b, _, s), B = document.createElement("style");
  B.innerHTML = E, C.insertBefore(B, k);
  try {
    await m.renderer.draw(e, t, uh.version, m);
  } catch (W) {
    throw n.suppressErrorRendering ? h() : HB.draw(e, t, uh.version), W;
  }
  const S = u.select(`${c} svg`), I = m.db.getAccTitle?.(), O = m.db.getAccDescription?.();
  P0(b, S, I, O), u.select(`[id="${t}"]`).selectAll("foreignobject > *").attr("xmlns", qM);
  let D = u.select(c).node().innerHTML;
  if (R.debug("config.arrowMarkerAbsolute", n.arrowMarkerAbsolute), D = JM(D, f, Dt(n.arrowMarkerAbsolute)), f) {
    const W = u.select(c + " svg").node();
    D = t$(D, W);
  } else d || (D = fi.sanitize(D, {
    ADD_TAGS: VM,
    ADD_ATTR: KM,
    HTML_INTEGRATION_POINTS: { foreignobject: !0 }
  }));
  if (MM(), y)
    throw y;
  return h(), {
    diagramType: b,
    svg: D,
    bindFunctions: m.db.bindFunctions
  };
}, "render");
function I0(t = {}) {
  const e = $t({}, t);
  e?.fontFamily && !e.themeVariables?.fontFamily && (e.themeVariables || (e.themeVariables = {}), e.themeVariables.fontFamily = e.fontFamily), f1(e), e?.theme && e.theme in Ye ? e.themeVariables = Ye[e.theme].getThemeVariables(
    e.themeVariables
  ) : e && (e.themeVariables = Ye.default.getThemeVariables(e.themeVariables));
  const r = typeof e == "object" ? u1(e) : Nf();
  Al(r.logLevel), Ba();
}
p(I0, "initialize");
var R0 = /* @__PURE__ */ p((t, e = {}) => {
  const { code: r } = Tc(t);
  return bl.fromText(r, e);
}, "getDiagramFromText");
function P0(t, e, r, i) {
  B0(e, t), M0(e, r, i, e.attr("id"));
}
p(P0, "addA11yInfo");
var zr = Object.freeze({
  render: r$,
  parse: D0,
  getDiagramFromText: R0,
  initialize: I0,
  getConfig: Ht,
  setConfig: zf,
  getSiteConfig: Nf,
  updateSiteConfig: d1,
  reset: /* @__PURE__ */ p(() => {
    Cs();
  }, "reset"),
  globalReset: /* @__PURE__ */ p(() => {
    Cs(di);
  }, "globalReset"),
  defaultConfig: di
});
Al(Ht().logLevel);
Cs(Ht());
var i$ = /* @__PURE__ */ p((t, e, r) => {
  R.warn(t), cc(t) ? (r && r(t.str, t.hash), e.push({ ...t, message: t.str, error: t })) : (r && r(t), t instanceof Error && e.push({
    str: t.message,
    message: t.message,
    hash: t.name,
    error: t
  }));
}, "handleError"), N0 = /* @__PURE__ */ p(async function(t = {
  querySelector: ".mermaid"
}) {
  try {
    await n$(t);
  } catch (e) {
    if (cc(e) && R.error(e.str), Ge.parseError && Ge.parseError(e), !t.suppressErrors)
      throw R.error("Use the suppressErrors option to suppress these errors"), e;
  }
}, "run"), n$ = /* @__PURE__ */ p(async function({ postRenderCallback: t, querySelector: e, nodes: r } = {
  querySelector: ".mermaid"
}) {
  const i = zr.getConfig();
  R.debug(`${t ? "" : "No "}Callback function found`);
  let n;
  if (r)
    n = r;
  else if (e)
    n = document.querySelectorAll(e);
  else
    throw new Error("Nodes and querySelector are both undefined");
  R.debug(`Found ${n.length} diagrams`), i?.startOnLoad !== void 0 && (R.debug("Start On Load: " + i?.startOnLoad), zr.updateSiteConfig({ startOnLoad: i?.startOnLoad }));
  const s = new we.InitIDGenerator(i.deterministicIds, i.deterministicIDSeed);
  let a;
  const o = [];
  for (const l of Array.from(n)) {
    if (R.info("Rendering diagram: " + l.id), l.getAttribute("data-processed"))
      continue;
    l.setAttribute("data-processed", "true");
    const c = `mermaid-${s.next()}`;
    a = l.innerHTML, a = am(we.entityDecode(a)).trim().replace(/<br\s*\/?>/gi, "<br/>");
    const h = we.detectInit(a);
    h && R.debug("Detected early reinit: ", h);
    try {
      const { svg: u, bindFunctions: f } = await H0(c, a, l);
      l.innerHTML = u, t && await t(c), f && f(l);
    } catch (u) {
      i$(u, o, Ge.parseError);
    }
  }
  if (o.length > 0)
    throw o[0];
}, "runThrowsErrors"), z0 = /* @__PURE__ */ p(function(t) {
  zr.initialize(t);
}, "initialize"), s$ = /* @__PURE__ */ p(async function(t, e, r) {
  R.warn("mermaid.init is deprecated. Please use run instead."), t && z0(t);
  const i = { postRenderCallback: r, querySelector: ".mermaid" };
  typeof e == "string" ? i.querySelector = e : e && (e instanceof HTMLElement ? i.nodes = [e] : i.nodes = e), await N0(i);
}, "init"), a$ = /* @__PURE__ */ p(async (t, {
  lazyLoad: e = !0
} = {}) => {
  Ba(), So(...t), e === !1 && await EM();
}, "registerExternalDiagrams"), W0 = /* @__PURE__ */ p(function() {
  if (Ge.startOnLoad) {
    const { startOnLoad: t } = zr.getConfig();
    t && Ge.run().catch((e) => R.error("Mermaid failed to initialize", e));
  }
}, "contentLoaded");
typeof document < "u" && window.addEventListener("load", W0, !1);
var o$ = /* @__PURE__ */ p(function(t) {
  Ge.parseError = t;
}, "setParseErrorHandler"), ta = [], go = !1, q0 = /* @__PURE__ */ p(async () => {
  if (!go) {
    for (go = !0; ta.length > 0; ) {
      const t = ta.shift();
      if (t)
        try {
          await t();
        } catch (e) {
          R.error("Error executing queue", e);
        }
    }
    go = !1;
  }
}, "executeQueue"), l$ = /* @__PURE__ */ p(async (t, e) => new Promise((r, i) => {
  const n = /* @__PURE__ */ p(() => new Promise((s, a) => {
    zr.parse(t, e).then(
      (o) => {
        s(o), r(o);
      },
      (o) => {
        R.error("Error parsing", o), Ge.parseError?.(o), a(o), i(o);
      }
    );
  }), "performCall");
  ta.push(n), q0().catch(i);
}), "parse"), H0 = /* @__PURE__ */ p((t, e, r) => new Promise((i, n) => {
  const s = /* @__PURE__ */ p(() => new Promise((a, o) => {
    zr.render(t, e, r).then(
      (l) => {
        a(l), i(l);
      },
      (l) => {
        R.error("Error parsing", l), Ge.parseError?.(l), o(l), n(l);
      }
    );
  }), "performCall");
  ta.push(s), q0().catch(n);
}), "render"), c$ = /* @__PURE__ */ p(() => Object.keys(Or).map((t) => ({
  id: t
})), "getRegisteredDiagramsMetadata"), Ge = {
  startOnLoad: !0,
  mermaidAPI: zr,
  parse: l$,
  render: H0,
  init: s$,
  run: N0,
  registerExternalDiagrams: a$,
  registerLayoutLoaders: Ky,
  initialize: z0,
  parseError: void 0,
  contentLoaded: W0,
  setParseErrorHandler: o$,
  detectType: Ll,
  registerIconPacks: $A,
  getRegisteredDiagramsMetadata: c$
}, mo = Ge;
const ut = (t) => t.replace(/\s*!important\s*$/i, "").trim(), h$ = (t, e) => {
  let r = e;
  for (; r < t.length && /\s/.test(t[r]); )
    r += 1;
  const i = r;
  for (; r < t.length && /[a-z-]/i.test(t[r]); )
    r += 1;
  if (r === i)
    return !1;
  for (; r < t.length && /\s/.test(t[r]); )
    r += 1;
  return t[r] === ":";
}, ge = (t) => {
  const e = [];
  let r = 0;
  for (; r < t.length; ) {
    for (; r < t.length && /[\s;,]/.test(t[r]); )
      r += 1;
    if (r >= t.length)
      break;
    const i = r;
    for (; r < t.length && t[r] !== ":" && !(t[r] === ";" || t[r] === ","); )
      r += 1;
    if (r >= t.length || t[r] !== ":")
      break;
    const n = t.substring(i, r).trim().toLowerCase();
    r += 1;
    const s = r;
    let a = 0, o = null;
    for (; r < t.length; ) {
      const c = t[r];
      if (o) {
        c === o && t[r - 1] !== "\\" && (o = null), r += 1;
        continue;
      }
      if (c === '"' || c === "'") {
        o = c, r += 1;
        continue;
      }
      if (c === "(") {
        a += 1, r += 1;
        continue;
      }
      if (c === ")") {
        a = Math.max(0, a - 1), r += 1;
        continue;
      }
      if (a === 0 && (c === ";" || c === "," || /\s/.test(c) && h$(t, r)))
        break;
      r += 1;
    }
    const l = ut(t.substring(s, r));
    n && l && e.push({ property: n, value: l }), r < t.length && (t[r] === ";" || t[r] === ",") && (r += 1);
  }
  return e;
}, me = (t) => {
  const e = ut(t);
  if (!e)
    return !1;
  if (typeof CSS < "u" && typeof CSS.supports == "function")
    return CSS.supports("color", e);
  if (typeof document < "u") {
    const r = document.createElement("div");
    return r.style.color = "", r.style.color = e, r.style.color !== "";
  }
  return !1;
}, tf = (t, e) => {
  const r = t.getAttribute("style");
  return r && ge(r).find((i) => i.property === e)?.value || "";
}, yo = (...t) => {
  for (const e of t) {
    const r = ut(e || "");
    if (me(r))
      return r;
  }
}, Lc = (t, e) => {
  const r = t.querySelector("text, foreignObject, div, span, p") || t, i = yo(r.getAttribute?.("fill"), tf(r, "fill"), r.style?.fill);
  if (i)
    return i;
  const n = yo(r.getAttribute?.("color"), tf(r, "color"), r.style?.color);
  if (n)
    return n;
  const s = yo(e);
  if (s)
    return s;
}, Ec = (t, e, r) => {
  switch (e) {
    case gt.FILL:
    case gt.STROKE:
      me(r) && (t[e] = r);
      break;
    case gt.STROKE_WIDTH:
    case gt.STROKE_DASHARRAY:
      t[e] = r;
      break;
  }
}, ea = (t, e, r) => {
  e === Gt.COLOR && me(r) && (t[Gt.COLOR] = r);
}, ra = (t, e, r) => {
  t && ge(t).forEach(({ property: i, value: n }) => {
    Ec(e, i, n), ea(r, i, n);
  });
}, Y0 = (t, e) => {
  t && ge(t).forEach(({ property: r, value: i }) => {
    if (r === "fill" && me(i)) {
      e[Gt.COLOR] = i;
      return;
    }
    ea(e, r, i);
  });
}, j0 = (t, e) => {
  if (!t)
    return;
  [
    [gt.FILL, t.getAttribute("fill")],
    [gt.STROKE, t.getAttribute("stroke")],
    [
      gt.STROKE_WIDTH,
      t.getAttribute("stroke-width")
    ],
    [
      gt.STROKE_DASHARRAY,
      t.getAttribute("stroke-dasharray")
    ]
  ].forEach(([i, n]) => {
    const s = ut(n || "");
    s && Ec(e, i, s);
  });
}, U0 = (t, e) => {
  if (!t)
    return;
  const r = t.getAttribute("fill") || t.getAttribute("color"), i = ut(r || "");
  me(i) && (e[Gt.COLOR] = i);
}, Cl = (t, e, r, i) => {
  if (!(e instanceof Map))
    return;
  const n = e.get(t);
  n && (n.styles?.forEach((s) => {
    ge(s).forEach(({ property: a, value: o }) => {
      Ec(r, a, o), ea(i, a, o);
    });
  }), n.textStyles?.forEach((s) => {
    ge(s).forEach(({ property: a, value: o }) => {
      ea(i, a, o);
    });
  }));
}, u$ = (t, e, r) => {
  const i = t.nodes.map((f) => f.startsWith("flowchart-") ? f.split("-")[1] : f), n = e.querySelector(`[id='${t.id}']`);
  if (!n)
    throw new Error("SubGraph element not found");
  const s = Bc(n, e), a = n.getBBox(), o = {
    width: a.width,
    height: a.height
  }, l = {}, c = {}, h = n.querySelector(":scope > rect, :scope > path, :scope > polygon, :scope > ellipse") || n.querySelector(".cluster > rect, .cluster > path, .cluster > polygon, .cluster > ellipse") || n.querySelector("rect, path, polygon, ellipse");
  ra(n.getAttribute("style"), l, c), ra(h?.getAttribute("style"), l, c), j0(h, l);
  const u = n.querySelector(".cluster-label text, .cluster-label tspan") || n.querySelector("text");
  return Y0(u?.getAttribute("style"), c), U0(u, c), Cl(t.id, r, l, c), t.classes?.forEach((f) => {
    Cl(f, r, l, c);
  }), {
    id: t.id,
    nodeIds: i,
    text: se(t.title),
    labelType: "text",
    ...s,
    ...o,
    containerStyle: l,
    labelStyle: c
  };
}, ef = (t, e, r) => {
  const i = e.querySelector(`[id*="${t.domId}"]`);
  if (!i)
    return;
  let n;
  i.parentElement?.tagName.toLowerCase() === "a" && (n = i.parentElement.getAttribute("xlink:href"));
  const s = Bc(n ? i.parentElement : i, e), a = i.getBBox(), o = {
    width: a.width,
    height: a.height
  }, l = {}, c = {};
  t.classes && r instanceof Map && (Array.isArray(t.classes) ? t.classes : [t.classes]).forEach((f) => {
    Cl(f, r, l, c);
  }), t.styles?.forEach((f) => {
    ra(f, l, c);
  });
  const h = i.querySelector(".label-container");
  return ra(h?.getAttribute("style"), l, c), j0(h, l), Array.from(i.querySelectorAll(".label, .nodeLabel, .label text, .label tspan, .label span, .label div")).forEach((f) => {
    Y0(f.getAttribute("style"), c), U0(f, c);
  }), {
    id: t.id,
    labelType: t.labelType,
    text: se(t.text || ""),
    type: t.type,
    link: n || void 0,
    ...s,
    ...o,
    containerStyle: l,
    labelStyle: c
  };
}, f$ = (t, e, r) => {
  const i = r.querySelector(`[id*="${t.id}"]`);
  if (!i)
    throw new Error("Edge element not found");
  const n = Bc(i, r), s = vf(i, n);
  return t.length = void 0, {
    ...t,
    ...s,
    text: se(t.text)
  };
}, Bc = (t, e) => {
  if (!t)
    throw new Error("Element not found");
  let r = t.parentElement?.parentElement;
  const i = t.childNodes[0];
  let n = { x: 0, y: 0 };
  if (i) {
    const { transformX: l, transformY: c } = $r(i), h = i.getBBox();
    n = {
      x: Number(i.getAttribute("x")) || l + h.x || 0,
      y: Number(i.getAttribute("y")) || c + h.y || 0
    };
  }
  const { transformX: s, transformY: a } = $r(t), o = {
    x: s + n.x,
    y: a + n.y
  };
  for (; r && r.id !== e.id; ) {
    if (r.classList.value === "root" && r.hasAttribute("transform")) {
      const { transformX: l, transformY: c } = $r(r);
      o.x += l, o.y += c;
    }
    r = r.parentElement;
  }
  return o;
}, d$ = (t, e) => {
  const r = t.getVertices(), i = t.getEdges(), n = t.getSubGraphs(), s = t.getClasses(), a = {}, o = s instanceof Map ? s : {};
  r instanceof Map ? r.forEach((u, f) => {
    a[f] = ef(u, e, o);
  }) : typeof r == "object" && r !== null && Object.entries(r).forEach(([u, f]) => {
    a[u] = ef(f, e, o);
  });
  const l = /* @__PURE__ */ new Map(), c = (Array.isArray(i) ? i : []).map((u) => {
    if (!e.querySelector(`[id*="${u.id}"]`))
      return null;
    const f = `${u.start}-${u.end}`, d = l.get(f) || 0;
    return l.set(f, d + 1), f$(u, d, e);
  }).filter((u) => u !== null && u.reflectionPoints.length > 1);
  return {
    type: "flowchart",
    subGraphs: (Array.isArray(n) ? n : []).map((u) => u$(u, e, o)),
    vertices: a,
    edges: c
  };
}, p$ = (t, e) => {
  const r = {};
  e?.label && (r.label = { text: se(e.label), fontSize: 16 });
  const i = t.tagName;
  if (i === "line")
    r.startX = Number(t.getAttribute("x1")), r.startY = Number(t.getAttribute("y1")), r.endX = Number(t.getAttribute("x2")), r.endY = Number(t.getAttribute("y2"));
  else if (i === "path") {
    const a = t.getAttribute("d");
    if (!a)
      throw new Error('Path element does not contain a "d" attribute');
    const o = a.split(/(?=[LC])/), l = o[0].substring(1).split(",").map((u) => parseFloat(u)), c = [];
    o.forEach((u) => {
      const f = u.substring(1).trim().split(" ").map((d) => {
        const [g, m] = d.split(",");
        return [
          parseFloat(g) - l[0],
          parseFloat(m) - l[1]
        ];
      });
      c.push(...f);
    });
    const h = c[c.length - 1];
    r.startX = l[0], r.startY = l[1], r.endX = h[0], r.endY = h[1], r.points = c;
  }
  e?.label && (r.startY = r.startY - 10, r.endY = r.endY - 10);
  const n = t.getAttribute("stroke"), s = (n && n !== "none" ? n : "") || getComputedStyle(t).stroke || "";
  return r.strokeColor = s ? ut(s) : null, r.strokeWidth = Number(t.getAttribute("stroke-width")), r.type = "arrow", r.strokeStyle = e?.strokeStyle || "solid", r.startArrowhead = e?.startArrowhead || null, r.endArrowhead = e?.endArrowhead || null, r;
}, Mc = (t, e, r, i, n) => {
  const s = {};
  return s.type = "arrow", s.startX = t, s.startY = e, s.endX = r, s.endY = i, Object.assign(s, { ...n }), s;
}, ia = (t, e, r, i) => ({
  type: "text",
  x: t,
  y: e,
  text: r,
  width: i?.width || 20,
  height: i?.height || 20,
  fontSize: i?.fontSize || 20,
  id: i?.id,
  color: i?.color,
  groupId: i?.groupId,
  metadata: i?.metadata
}), X0 = (t, e, r) => {
  const i = {}, n = Number(t.getAttribute("x")), s = Number(t.getAttribute("y"));
  i.type = "text", i.text = se(e), r?.id && (i.id = r.id), r?.groupId && (i.groupId = r.groupId);
  const a = t.getBBox();
  i.width = a.width, i.height = a.height, i.x = n - a.width / 2, i.y = s;
  const o = parseInt(getComputedStyle(t).fontSize);
  return i.fontSize = o, i.color = Lc(t), i;
}, Ve = (t, e, r = {}) => {
  const i = {};
  i.type = e;
  const { label: n, subtype: s, id: a, groupId: o } = r;
  i.id = a, o && (i.groupId = o), n && (i.label = {
    text: se(n.text),
    fontSize: 16,
    textAlign: n?.textAlign,
    verticalAlign: n?.verticalAlign
  });
  const l = t.getBBox();
  switch (i.x = l.x, i.y = l.y, i.width = l.width, i.height = l.height, i.subtype = s, s) {
    case "highlight":
      const c = t.getAttribute("fill");
      c && (i.bgColor = ut(c));
      break;
    case "note":
      i.strokeStyle = "dashed";
      break;
  }
  return i;
}, Cn = (t, e, r, i, n, s) => {
  const a = {};
  a.startX = e, a.startY = r, a.endX = i, s?.groupId && (a.groupId = s.groupId), s?.id && (a.id = s.id), a.endY = n;
  const o = t.getAttribute("stroke");
  return a.strokeColor = o ? ut(o) : null, a.strokeWidth = Number(t.getAttribute("stroke-width")), a.type = "line", a;
}, rf = {
  0: "SOLID",
  1: "DOTTED",
  3: "SOLID_CROSS",
  4: "DOTTED_CROSS",
  5: "SOLID_OPEN",
  6: "DOTTED_OPEN",
  24: "SOLID_POINT",
  25: "DOTTED_POINT"
}, Fe = {
  SOLID: 0,
  DOTTED: 1,
  NOTE: 2,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  CRITICAL_START: 27
}, g$ = (t) => {
  let e;
  switch (t) {
    case Fe.SOLID:
    case Fe.SOLID_CROSS:
    case Fe.SOLID_OPEN:
    case Fe.SOLID_POINT:
      e = "solid";
      break;
    case Fe.DOTTED:
    case Fe.DOTTED_CROSS:
    case Fe.DOTTED_OPEN:
    case Fe.DOTTED_POINT:
      e = "dotted";
      break;
    default:
      e = "solid";
      break;
  }
  return e;
}, m$ = (t, e) => {
  if (!!t.nextElementSibling?.classList.contains("sequenceNumber")) {
    const i = t.nextElementSibling?.textContent;
    if (!i)
      throw new Error("sequence number not present");
    const n = 30, s = n / 2, o = {
      type: "rectangle",
      x: e.startX - 10,
      y: e.startY - s,
      label: { text: i, fontSize: 14 },
      bgColor: "#e9ecef",
      height: n,
      subtype: "sequence"
    };
    Object.assign(e, { sequenceNumber: o });
  }
}, nf = (t, e, r) => {
  if (!t)
    throw "root node not found";
  const i = fe(), n = Array.from(t.children), s = [];
  return n.forEach((a, o) => {
    const l = `${r?.id}-${o}`;
    let c;
    switch (a.tagName) {
      case "line":
        const h = Number(a.getAttribute("x1")), u = Number(a.getAttribute("y1")), f = Number(a.getAttribute("x2")), d = Number(a.getAttribute("y2"));
        c = Cn(a, h, u, f, d, { groupId: i, id: l });
        break;
      case "text":
        c = X0(a, e, {
          groupId: i,
          id: l
        });
        break;
      case "circle":
        c = Ve(a, "ellipse", {
          label: a.textContent ? { text: a.textContent } : void 0,
          groupId: i,
          id: l
        });
      default:
        c = Ve(a, mx[a.tagName], {
          label: a.textContent ? { text: a.textContent } : void 0,
          groupId: i,
          id: l
        });
    }
    s.push(c);
  }), s;
}, sf = (t, e) => {
  const r = e.getAttribute("fill"), i = e.getAttribute("stroke"), n = e.getAttribute("stroke-width"), s = e.getAttribute("stroke-dasharray");
  r && r !== "none" && (t.bgColor = ut(r)), i && i !== "none" && (t.strokeColor = ut(i)), n && (t.strokeWidth = Number(n)), s && s.trim() && (t.strokeStyle = "dashed");
}, y$ = (t, e) => {
  const r = Array.from(e.querySelectorAll(".actor-top")), i = Array.from(e.querySelectorAll(".actor-bottom")), n = [], s = [], a = {}, o = t instanceof Map ? Array.from(t.values()) : Object.values(t), l = Array.from(e.querySelectorAll(".actor-line")), c = (h, u) => {
    const f = h.name, d = l.find((m) => m.getAttribute("name") === f);
    if (d)
      return d;
    const g = h.type === "participant" ? u.parentElement?.previousElementSibling : u.previousElementSibling;
    return g ? g.tagName === "line" ? g : g.querySelector("line") : null;
  };
  return o.forEach((h) => {
    const u = r.find((g) => g.getAttribute("name") === h.name), f = i.find((g) => g.getAttribute("name") === h.name);
    if (!u || !f)
      throw "root not found";
    const d = h.description;
    if (h.type === "participant") {
      const g = Ve(u, "rectangle", { id: `${h.name}-top`, label: { text: d }, subtype: "actor" });
      if (sf(g, u), !g)
        throw "Top Node element not found!";
      n.push([g]);
      const m = Ve(f, "rectangle", { id: `${h.name}-bottom`, label: { text: d }, subtype: "actor" });
      a[h.name] = {
        topId: `${h.name}-top`,
        bottomId: `${h.name}-bottom`,
        bindType: "rectangle"
      }, sf(m, f), n.push([m]);
      const y = c(h, u);
      if (y?.tagName !== "line")
        throw "Line not found";
      const x = Number(y.getAttribute("x1"));
      if (!g.height)
        throw "Top node element height is null";
      const b = g.y + g.height, C = m.y, k = Number(y.getAttribute("x2")), _ = Cn(y, x, b, k, C);
      s.push(_);
    } else if (h.type === "actor") {
      const g = nf(u, d, {
        id: `${h.name}-top`
      });
      n.push(g);
      const m = nf(f, d, {
        id: `${h.name}-bottom`
      });
      n.push(m);
      const y = c(h, u);
      if (y?.tagName !== "line")
        throw "Line not found";
      const x = Number(y.getAttribute("x1")), b = Number(y.getAttribute("y1")), C = Number(y.getAttribute("x2")), k = m.find((B) => B.type === "ellipse");
      if (k) {
        const B = k.y, S = Cn(y, x, b, C, B);
        s.push(S);
      }
      const _ = g.find((B) => B.type === "ellipse"), E = m.find((B) => B.type === "ellipse");
      _?.id && E?.id && (a[h.name] = {
        topId: _.id,
        bottomId: E.id,
        bindType: "ellipse"
      });
    }
  }), { nodes: n, lines: s, actorMap: a };
}, x$ = (t, e, r) => {
  const i = [], n = Array.from(e.querySelectorAll('[class*="messageLine"]')), s = Object.keys(rf), a = t.filter((o) => s.includes(o.type.toString()));
  return n.forEach((o, l) => {
    const c = a[l], h = rf[c.type], u = p$(o, {
      label: c?.message,
      strokeStyle: g$(c.type),
      endArrowhead: h === "SOLID_OPEN" || h === "DOTTED_OPEN" ? null : "arrow"
    }), f = r[c.from], d = r[c.to];
    f?.topId && d?.topId && (u.start = { type: f.bindType || "rectangle", id: f.topId }, u.end = { type: d.bindType || "rectangle", id: d.topId }), m$(o, u), i.push(u);
  }), i;
}, b$ = (t, e) => {
  const r = Array.from(e.querySelectorAll(".note")).map((s) => s.parentElement), i = t.filter((s) => s.type === Fe.NOTE), n = [];
  return r.forEach((s, a) => {
    if (!s)
      return;
    const o = s.firstChild, l = i[a].message, c = Ve(o, "rectangle", {
      label: { text: l },
      subtype: "note"
    }), h = o.getAttribute("fill"), u = o.getAttribute("stroke"), f = o.getAttribute("stroke-width"), d = o.getAttribute("stroke-dasharray");
    h && h !== "none" && (c.bgColor = ut(h)), u && u !== "none" && (c.strokeColor = ut(u)), f && (c.strokeWidth = Number(f)), d && d.trim() && (c.strokeStyle = "dashed"), n.push(c);
  }), n;
}, w$ = (t) => {
  const e = Array.from(t.querySelectorAll("[class*=activation]")), r = [];
  return e.forEach((i) => {
    const n = Ve(i, "rectangle", {
      label: { text: "" },
      subtype: "activation"
    });
    (() => {
      const a = i.getAttribute("fill"), o = i.getAttribute("stroke"), l = i.getAttribute("stroke-width"), c = i.getAttribute("stroke-dasharray");
      a && a !== "none" && (n.bgColor = ut(a)), o && o !== "none" && (n.strokeColor = ut(o)), l && (n.strokeWidth = Number(l)), c && c.trim() && (n.strokeStyle = "dashed");
    })(), r.push(n);
  }), r;
}, C$ = (t, e) => {
  const r = Array.from(e.querySelectorAll(".loopLine")), i = [], n = [], s = [];
  r.forEach((h) => {
    const u = Number(h.getAttribute("x1")), f = Number(h.getAttribute("y1")), d = Number(h.getAttribute("x2")), g = Number(h.getAttribute("y2")), m = Cn(h, u, f, d, g);
    m.strokeStyle = "dotted", m.strokeColor = "#adb5bd", m.strokeWidth = 2, i.push(m);
  });
  const a = Array.from(e.querySelectorAll(".loopText")), o = t.filter((h) => h.type === Fe.CRITICAL_START).map((h) => h.message);
  a.forEach((h) => {
    const u = h.textContent || "", f = X0(h, u), d = u.match(/\[(.*?)\]/)?.[1] || "";
    o.includes(d) && (f.x += 16), n.push(f);
  });
  const l = Array.from(e?.querySelectorAll(".labelBox")), c = Array.from(e?.querySelectorAll(".labelText"));
  return l.forEach((h, u) => {
    const f = c[u]?.textContent || "", d = Ve(h, "rectangle", {
      label: { text: f }
    });
    d.strokeColor = "#adb5bd", d.bgColor = "#e9ecef", d.width = void 0, s.push(d);
  }), { lines: i, texts: n, nodes: s };
}, _$ = (t) => {
  const e = Array.from(t.querySelectorAll(".rect")).filter((i) => i.parentElement?.tagName !== "g"), r = [];
  return e.forEach((i) => {
    const n = Ve(i, "rectangle", {
      label: { text: "" },
      subtype: "highlight"
    });
    r.push(n);
  }), r;
}, k$ = (t, e) => {
  const r = t.db, i = [], s = r.getBoxes().map((y) => ({
    ...y,
    fill: ut(y.fill || "")
  })), a = _$(e), o = r.getActors(), { nodes: l, lines: c, actorMap: h } = y$(o, e), u = r.getMessages(), f = x$(u, e, h), d = b$(u, e), g = w$(e), m = C$(u, e);
  return i.push(a), i.push(...l), i.push(d), i.push(g), { type: "sequence", lines: c, arrows: f, nodes: i, loops: m, groups: s };
}, S$ = (t) => {
  const e = {};
  return t && t.forEach((r) => {
    ge(r).forEach(({ property: i, value: n }) => {
      i && n && (e[i] = ut(n));
    });
  }), e;
}, ns = {
  AGGREGATION: 0,
  EXTENSION: 1,
  COMPOSITION: 2,
  DEPENDENCY: 3
}, af = {
  LINE: 0,
  DOTTED_LINE: 1
}, of = 16, v$ = (t) => {
  let e;
  switch (t) {
    case af.LINE:
      e = "solid";
      break;
    case af.DOTTED_LINE:
      e = "dotted";
      break;
    default:
      e = "solid";
  }
  return e;
}, lf = (t) => {
  let e;
  switch (t) {
    case ns.AGGREGATION:
      e = "diamond_outline";
      break;
    case ns.COMPOSITION:
      e = "diamond";
      break;
    case ns.EXTENSION:
      e = "triangle_outline";
      break;
    case "none":
      e = null;
      break;
    case ns.DEPENDENCY:
    default:
      e = "arrow";
      break;
  }
  return e;
}, xo = (t, e) => {
  let r = 0, i = 0, n = t;
  for (; n && n !== e; ) {
    const { transformX: s, transformY: a } = $r(n);
    r += s, i += a, n = n.parentElement;
  }
  return { tx: r, ty: i };
}, cf = /* @__PURE__ */ new Set([
  "triangle_outline",
  "diamond",
  "diamond_outline"
]), G0 = (t, e = 0.5) => {
  if (t.length <= 2)
    return [...t];
  const r = [t[0]];
  for (let i = 1; i < t.length - 1; i++) {
    const n = r[r.length - 1], s = t[i], a = t[i + 1], o = a.x - n.x, l = a.y - n.y, c = Math.hypot(o, l);
    if (!c)
      continue;
    const u = Math.abs(o * (s.y - n.y) - l * (s.x - n.x)) / c, f = ((s.x - n.x) * o + (s.y - n.y) * l) / (c * c);
    u <= e && f >= -e && f <= 1 + e || r.push(s);
  }
  return r.push(t[t.length - 1]), r;
}, V0 = (t) => {
  const e = vl(Sf(t).map((i) => [i.x, i.y])).map(([i, n]) => ({ x: i, y: n })), r = Tl(t);
  return r && e.length >= 2 && (e[0] = {
    x: r.startX,
    y: r.startY
  }, e[e.length - 1] = {
    x: r.endX,
    y: r.endY
  }), G0(e);
}, hf = (t, e, r) => {
  const i = t.x - e.x, n = t.y - e.y, s = Math.hypot(i, n);
  return s ? {
    x: t.x + i / s * r,
    y: t.y + n / s * r
  } : t;
}, T$ = (t, e) => {
  const r = vl(e.map((s) => [s.x, s.y])).map(([s, a]) => ({ x: s, y: a }));
  if (r.length < 2)
    throw new Error("Arrow route must contain at least two points");
  const i = r[0], n = r[r.length - 1];
  t.startX = i.x, t.startY = i.y, t.endX = n.x, t.endY = n.y, t.points = r.map((s) => [
    s.x - i.x,
    s.y - i.y
  ]);
}, A$ = (t) => {
  const e = t.points?.map(([s, a]) => ({ x: t.startX + s, y: t.startY + a })).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
  if (!e || e.length < 2)
    return t;
  const r = [...e], i = !!t.startArrowhead && cf.has(t.startArrowhead), n = !!t.endArrowhead && cf.has(t.endArrowhead);
  if (!i && !n)
    return t;
  if (i && (r[0] = hf(r[0], r[1], of)), n) {
    const s = r.length - 1;
    r[s] = hf(r[s], r[s - 1], of);
  }
  return T$(t, r), t;
}, L$ = (t, e) => {
  const r = ut(t.getAttribute("stroke") || getComputedStyle(t).stroke || ""), i = parseFloat(t.getAttribute("stroke-width") || getComputedStyle(t).strokeWidth || "1");
  me(r) && r !== "none" && (e.strokeColor = r), Number.isFinite(i) && i > 0 && (e.strokeWidth = i);
}, E$ = (t) => {
  const e = [];
  return t.forEach((r) => {
    V0(r).forEach((i) => {
      const n = e[e.length - 1];
      n && n.x === i.x && n.y === i.y || e.push(i);
    });
  }), G0(e);
}, K0 = (t, e, r) => {
  if (t.length < 2)
    throw new Error(`Class diagram edge ${e?.id || "<unknown>"} is missing usable path points`);
  const i = t[0], n = t[t.length - 1], s = Mc(i.x, i.y, n.x, n.y, {
    id: e?.getAttribute("data-id") || e?.id || void 0,
    ...r,
    points: t.map((a) => [
      a.x - i.x,
      a.y - i.y
    ])
  });
  return e && L$(e, s), A$(s);
}, Z0 = (t, e) => K0(E$(t), t[0], e), B$ = (t, e) => {
  const r = V0(t);
  return K0([r[0], r[r.length - 1]], t, e);
}, M$ = (t, e) => Z0([t], e), $$ = (t, e) => [
  `${t}-cyclic-special-1`,
  `${t}-cyclic-special-mid`,
  `${t}-cyclic-special-2`
].map((i) => e.querySelector(`path[id="${i}"][data-edge="true"]`)).filter((i) => i !== null), F$ = (t) => t.points?.map(([e, r]) => ({ x: t.startX + e, y: t.startY + r })).filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y)) || [], uf = (t, e) => {
  const r = F$(t);
  if (r.length < 2)
    return null;
  const i = e === "start", n = i ? r[0] : r[r.length - 1], s = i ? r[1] : r[r.length - 2], a = s.x === n.x ? i ? -1 : 1 : Math.sign(s.x - n.x), o = s.y === n.y ? 1 : Math.sign(s.y - n.y);
  return {
    x: n.x + a * 20,
    y: n.y + (o >= 0 ? 12 : -28)
  };
}, O$ = (t, e) => {
  let r = t;
  for (; r && r !== e; ) {
    if (r.classList.contains("annotation-group") || r.classList.contains("label-group"))
      return "header";
    if (r.classList.contains("members-group"))
      return "members";
    if (r.classList.contains("methods-group"))
      return "methods";
    r = r.parentElement;
  }
  return "other";
}, D$ = (t, e, r) => {
  const i = [], n = [], s = [];
  return Object.values(t).forEach((a) => {
    const { domId: o, id: l } = a, c = fe(), h = S$(
      // @ts-ignore
      a.styles || a.cssStyles
    );
    let u;
    try {
      u = r ? r(l) : void 0;
    } catch {
      u = void 0;
    }
    const f = (L) => {
      const M = new RegExp(`^classId-${L}(?:-|$)`);
      return Array.from(e.querySelectorAll("[id]")).filter((Y) => M.test(Y.id))[0];
    }, d = u && e.querySelector(`#${u}`) || e.querySelector(`#${o}`) || e.querySelector(`[data-id='${l}']`) || f(l);
    if (!d)
      throw Error(`DOM Node with id ${o} not found`);
    const g = d.querySelector("rect") || d, m = g.getBBox(), { tx: y, ty: x } = xo(g, e), b = {
      type: "rectangle",
      id: l,
      groupId: c,
      x: m.x + y,
      y: m.y + x,
      width: m.width,
      height: m.height,
      metadata: { classId: l }
    }, C = g.getAttribute("fill"), k = g.getAttribute("stroke"), _ = g.getAttribute("stroke-width"), E = g.getAttribute("stroke-dasharray"), B = getComputedStyle(g), S = ut(C || h.fill || (C ? B.fill : "")), I = ut(k || h.stroke || (k ? B.stroke : "")), O = _ || h["stroke-width"] || (_ ? B.strokeWidth : ""), D = E || h["stroke-dasharray"] || (E ? B.strokeDasharray === "none" ? "" : B.strokeDasharray : ""), W = (L) => {
      if (!L || !me(L))
        return !1;
      const M = L.toLowerCase();
      return !(M === "none" || M === "transparent" || M === "rgba(0, 0, 0, 0)" || M === "black" || M === "#000" || M === "#000000" || M === "rgb(0, 0, 0)" || M === "rgba(0, 0, 0, 1)");
    };
    W(S) ? b.bgColor = S : b.bgColor = void 0, W(I) ? b.strokeColor = I : b.strokeColor = void 0, O ? b.strokeWidth = Number(O) : b.strokeWidth = void 0, D && D.trim().length > 0 ? b.strokeStyle = "dashed" : b.strokeStyle = void 0, i.push(b), [
      ...Array.from(d.querySelectorAll("line")),
      ...Array.from(d.querySelectorAll("g.divider path"))
    ].forEach((L) => {
      const { tx: M, ty: H } = xo(L, e);
      let Y, it, J, tt;
      if (L.tagName.toLowerCase() === "line")
        Y = Number(L.getAttribute("x1")) + M, it = Number(L.getAttribute("y1")) + H, J = Number(L.getAttribute("x2")) + M, tt = Number(L.getAttribute("y2")) + H;
      else {
        const Z = L.getBBox();
        Y = Z.x + M, J = Z.x + Z.width + M;
        const Bt = Z.y + Z.height / 2 + H;
        it = Bt, tt = Bt;
      }
      if (Y === J && it === tt)
        return;
      const ht = Cn(
        // @ts-ignore
        L,
        Y,
        it,
        J,
        tt,
        {
          groupId: c,
          id: fe()
        }
      );
      b.strokeColor ? ht.strokeColor = b.strokeColor : ht.strokeColor = void 0, b.strokeWidth !== void 0 ? ht.strokeWidth = b.strokeWidth : ht.strokeWidth = void 0, b.strokeStyle ? ht.strokeStyle = b.strokeStyle : ht.strokeStyle = void 0, ht.metadata = { classId: l }, n.push(ht);
    });
    const $ = Array.from(d.querySelectorAll("text, foreignObject")), F = [];
    $.forEach((L) => {
      const M = L.tagName.toLowerCase() === "foreignobject", H = M ? [] : Array.from(L.querySelectorAll("tspan")), Y = H.length ? H.map((Z) => Z.textContent?.trim()).filter(Boolean).join(`
`) : L.textContent?.trim() || "";
      if (!Y)
        return;
      const it = L.getBBox(), { ty: J } = xo(L, e);
      let tt = parseFloat(getComputedStyle(L).fontSize || "");
      if (M && (!Number.isFinite(tt) || !tt)) {
        const Z = L.querySelector("div, span, p");
        Z && (tt = parseFloat(getComputedStyle(Z).fontSize || ""));
      }
      (!Number.isFinite(tt) || tt <= 0) && (tt = Math.max(12, it.height * 0.6)), tt = tt * 0.9;
      const ht = Lc(L, h.color);
      F.push({
        section: O$(L, d),
        text: se(Y),
        x: it.x,
        y: it.y + J,
        width: b && b.width ? Math.max(b.width - 8, it.width) : it.width,
        height: it.height,
        fontSize: tt,
        color: ht
      });
    });
    const A = F.filter((L) => L.section === "header").sort((L, M) => L.y - M.y || L.x - M.x);
    if (!b.label) {
      const L = A.length === 0 && F.length === 1 ? F : A;
      L.length > 0 && (b.label = {
        text: L.map((M) => M.text).join(`
`),
        fontSize: Math.max(...L.map((M) => M.fontSize)),
        color: L.find((M) => M.color)?.color,
        verticalAlign: "top"
      });
    }
    F.filter((L) => A.length > 0 ? L.section !== "header" : !(b.label && F.length === 1)).forEach((L) => {
      const M = ia((b?.x || 0) + 4, L.y, L.text, {
        width: L.width,
        height: L.height,
        fontSize: L.fontSize,
        color: L.color,
        id: fe(),
        groupId: c,
        metadata: { classId: l }
      });
      s.push(M);
    });
  }), { nodes: i, lines: n, text: s };
}, I$ = (t, e, r, i) => {
  const n = Array.from(r.querySelectorAll('.edgePaths path[data-edge="true"]:not([id^="edgeNote"]):not([id*="-cyclic-special-"])'));
  if (t.length === 0)
    return { arrows: [], text: [] };
  const s = [], a = [];
  let o = 0;
  return t.forEach((l) => {
    const { id1: c, id2: h, relation: u } = l, f = e.find((O) => O.id === c), d = e.find((O) => O.id === h);
    if (!f)
      throw new Error(`parseRelations: Cannot find node with id ${c}`);
    if (!d)
      throw new Error(`parseRelations: Cannot find node with id ${h}`);
    const g = v$(u.lineType), m = lf(u.type1), y = lf(u.type2);
    let x;
    if (c === h) {
      const O = $$(c, r);
      if (!O.length)
        throw new Error(`parseRelations: Cannot find rendered SVG edge for relation ${c} -> ${h}`);
      x = Z0(O, {
        strokeStyle: g,
        startArrowhead: m,
        endArrowhead: y,
        label: l.title ? { text: l.title } : void 0,
        start: { type: "rectangle", id: f.id },
        end: { type: "rectangle", id: d.id }
      });
    } else {
      const O = n[o];
      if (!O)
        throw new Error(`parseRelations: Cannot find rendered SVG edge for relation ${c} -> ${h}`);
      o += 1, x = B$(O, {
        strokeStyle: g,
        startArrowhead: m,
        endArrowhead: y,
        label: l.title ? { text: l.title } : void 0,
        start: { type: "rectangle", id: f.id },
        end: { type: "rectangle", id: d.id }
      });
    }
    s.push(x);
    const { relationTitle1: b, relationTitle2: C } = l, k = c === h, _ = 20, E = 15, B = 15;
    let S, I;
    if (b && b !== "none") {
      if (k) {
        const D = uf(x, "start");
        D && (S = D.x, I = D.y);
      } else
        switch (i) {
          case "TB":
            S = x.startX - _, x.endX < x.startX && (S -= B), I = x.startY + E;
            break;
          case "BT":
            S = x.startX + _, x.endX > x.startX && (S += B), I = x.startY - E;
            break;
          case "LR":
            S = x.startX + _, I = x.startY + E, x.endY > x.startY && (I += B);
            break;
          case "RL":
            S = x.startX - _, I = x.startY - E, x.startY > x.endY && (I -= B);
            break;
          default:
            S = x.startX - _, I = x.startY + E;
        }
      S ??= x.startX - _, I ??= x.startY + E;
      const O = ia(S, I, b, {
        fontSize: 16
      });
      a.push(O);
    }
    if (C && C !== "none") {
      if (k) {
        const D = uf(x, "end");
        D && (S = D.x, I = D.y);
      } else
        switch (i) {
          case "TB":
            S = x.endX + _, x.endX < x.startX && (S += B), I = x.endY - E;
            break;
          case "BT":
            S = x.endX - _, x.endX > x.startX && (S -= B), I = x.endY + E;
            break;
          case "LR":
            S = x.endX - _, I = x.endY - E, x.endY > x.startY && (I -= B);
            break;
          case "RL":
            S = x.endX + _, I = x.endY + E, x.startY > x.endY && (I += B);
            break;
          default:
            S = x.endX + _, I = x.endY - E;
        }
      S ??= x.endX + _, I ??= x.endY + E;
      const O = ia(S, I, C, {
        fontSize: 16
      });
      a.push(O);
    }
  }), { arrows: s, text: a };
}, R$ = (t, e, r) => {
  const i = [], n = [];
  return t.forEach((s, a) => {
    const { id: o, text: l, class: c } = s, h = e.querySelector(`#${o}`);
    if (!h)
      throw new Error(`Node with id ${o} not found!`);
    const { transformX: u, transformY: f } = $r(h), d = h.firstChild, g = Ve(d, "rectangle", {
      id: o,
      subtype: "note",
      label: { text: l }
    });
    if (Object.assign(g, {
      x: g.x + u,
      y: g.y + f
    }), i.push(g), c) {
      const m = r.find((E) => E.id === c);
      if (!m)
        throw new Error(`class node with id ${c} not found!`);
      const y = e.querySelector(`path[id="edgeNote${a + 1}"][data-edge="true"]`);
      if (y) {
        n.push(M$(y, {
          strokeStyle: "dotted",
          startArrowhead: null,
          endArrowhead: null,
          start: { id: g.id, type: "rectangle" },
          end: { id: m.id, type: "rectangle" }
        }));
        return;
      }
      const x = g.x + (g.width || 0) / 2, b = g.y + (g.height || 0), C = x, k = m.y, _ = Mc(x, b, C, k, {
        strokeStyle: "dotted",
        startArrowhead: null,
        endArrowhead: null,
        start: { id: g.id, type: "rectangle" },
        end: { id: m.id, type: "rectangle" }
      });
      n.push(_);
    }
  }), { notes: i, connectors: n };
}, P$ = (t, e) => {
  const r = t.db, i = r.getDirection?.() || "TB", n = [], s = [], a = [], o = [], l = r.getNamespaces?.() || [], c = r.getClasses?.() || {}, h = c instanceof Map ? Object.fromEntries(c) : c;
  if (h && Object.keys(h).length) {
    const x = (
      //@ts-ignore
      typeof r.lookUpDomId == "function" ? (
        //@ts-ignore
        r.lookUpDomId.bind(r)
      ) : void 0
    ), b = D$(h, e, x);
    n.push(b.nodes), s.push(...b.lines), a.push(...b.text), o.push(...b.nodes);
  }
  const u = r.getRelations?.() || [], { arrows: f, text: d } = I$(u, o, e, i), g = r.getNotes?.() || [], { notes: m, connectors: y } = R$(g, e, o);
  return n.push(m), f.push(...y), a.push(...d), { type: "class", nodes: n, lines: s, arrows: f, text: a, namespaces: l };
}, ff = 18, N$ = (t) => {
  const e = {};
  return t && t.forEach((r) => {
    ge(r).forEach(({ property: i, value: n }) => {
      i && n && (e[i] = ut(n));
    });
  }), e;
}, z$ = (t) => {
  if (t == null || t === "")
    return;
  const e = typeof t == "number" ? t : parseFloat(ut(t));
  if (!(!Number.isFinite(e) || e <= 0))
    return e;
}, $c = (t, e) => {
  let r = 0, i = 0, n = t;
  for (; n && n !== e; ) {
    const { transformX: s, transformY: a } = $r(n);
    r += s, i += a, n = n.parentElement;
  }
  return { tx: r, ty: i };
}, W$ = (t) => {
  const e = Array.from(t.querySelectorAll("tspan")), r = e.length ? e.map((i) => i.textContent?.trim()).filter(Boolean).join(`
`) : t.textContent?.trim() || "";
  return se(r);
}, q$ = (t) => {
  const e = t.querySelector("text, foreignObject, div, span, p") || t;
  let r = parseFloat(getComputedStyle(e).fontSize || "");
  return (!Number.isFinite(r) || r <= 0) && (r = Math.max(12, t.getBBox().height * 0.75)), r;
}, H$ = (t, e, r) => {
  const i = W$(t);
  if (!i)
    return null;
  const n = t.getBBox(), { tx: s, ty: a } = $c(t, e);
  return {
    className: t.getAttribute("class") || "",
    text: i,
    x: n.x + s,
    y: n.y + a,
    width: n.width,
    height: n.height,
    fontSize: q$(t),
    color: Lc(t, r)
  };
}, Y$ = (t, e, r, i, n, s, a) => {
  const { tx: o, ty: l } = $c(t, e);
  let c = 0, h = 0, u = 0, f = 0;
  if (t.tagName.toLowerCase() === "line")
    c = Number(t.getAttribute("x1")) + o, h = Number(t.getAttribute("y1")) + l, u = Number(t.getAttribute("x2")) + o, f = Number(t.getAttribute("y2")) + l;
  else {
    const g = Tl(t);
    if (!g)
      return null;
    c = g.startX + o, h = g.startY + l, u = g.endX + o, f = g.endY + l;
  }
  const d = {
    type: "line",
    id: fe(),
    groupId: r,
    startX: c,
    startY: h,
    endX: u,
    endY: f,
    metadata: { entityId: i }
  };
  return n && me(n) && n !== "none" && (d.strokeColor = n), s !== void 0 && (d.strokeWidth = s), a && (d.strokeStyle = a), d;
}, df = (t) => {
  switch (t?.toLowerCase()) {
    case "one":
      return "cardinality_one";
    case "many":
      return "cardinality_many";
    case "only_one":
      return "cardinality_exactly_one";
    case "one_or_more":
      return "cardinality_one_or_many";
    case "zero_or_one":
      return "cardinality_zero_or_one";
    case "zero_or_more":
      return "cardinality_zero_or_many";
    default:
      return null;
  }
}, j$ = (t) => {
  switch (t) {
    case "dotted":
      return "dotted";
    case "dashed":
      return "dashed";
    default:
      return "solid";
  }
}, U$ = (t, e) => {
  const r = e.querySelector(`path[id="${t.id}"][data-edge="true"]`);
  return r ? [r] : t.start !== t.end ? [] : [
    `${t.start}-cyclic-special-1`,
    `${t.start}-cyclic-special-mid`,
    `${t.start}-cyclic-special-2`
  ].map((n) => e.querySelector(`path[id="${n}"][data-edge="true"]`)).filter((n) => n !== null);
}, X$ = (t) => {
  const e = [];
  return t.forEach((r) => {
    Sf(r).forEach((i) => {
      const n = e[e.length - 1];
      n && n.x === i.x && n.y === i.y || e.push(i);
    });
  }), e;
}, G$ = (t, e) => {
  const r = e.querySelector(`[id="${t.id}"]`);
  if (!r)
    throw new Error(`ER entity ${t.id} not found in rendered SVG`);
  const i = t.attributes.length ? fe() : void 0, n = r.getBBox(), { tx: s, ty: a } = $c(r, e), o = N$([
    ...t.cssStyles || [],
    ...t.cssCompiledStyles || []
  ]), l = ut(o.fill || ""), c = ut(o.stroke || ""), h = z$(o["stroke-width"]), u = ut(o["stroke-dasharray"] || ""), f = Array.from(r.querySelectorAll("g.label")).map((C) => H$(C, e, o.color)).filter((C) => C !== null), d = f.find((C) => C.className.includes("name")) || f[0], g = f.filter((C) => C !== d), m = d?.text || se(t.alias || t.label || ""), y = {
    type: "rectangle",
    id: t.id,
    groupId: i,
    x: n.x + s,
    y: n.y + a,
    width: n.width,
    height: n.height,
    label: {
      text: m,
      fontSize: t.attributes.length ? ff : d?.fontSize || 16,
      color: d?.color,
      textAlign: "center",
      verticalAlign: t.attributes.length ? "top" : "middle"
    },
    metadata: {
      entityId: t.id,
      entityLabel: t.label,
      entityAlias: t.alias
    }
  };
  me(l) && l !== "none" && (y.bgColor = l), me(c) && c !== "none" && (y.strokeColor = c), h && Number.isFinite(h) && h > 0 && (y.strokeWidth = h), u && u !== "none" && (y.strokeStyle = "dashed");
  const x = Array.from(r.querySelectorAll(".divider path, path.divider, line.divider")).map((C) => Y$(C, e, i, t.id, y.strokeColor, y.strokeWidth, y.strokeStyle)).filter((C) => C !== null), b = g.map((C) => ia(C.x, C.y, C.text, {
    id: fe(),
    groupId: i,
    width: C.width,
    height: C.height,
    fontSize: ff,
    color: C.color,
    metadata: { entityId: t.id }
  }));
  return { container: y, lines: x, text: b };
}, V$ = (t, e) => {
  const r = U$(t, e);
  if (!r.length)
    throw new Error(`ER relationship ${t.id} not found in rendered SVG`);
  const i = X$(r);
  if (i.length < 2)
    throw new Error(`ER relationship ${t.id} is missing usable path points`);
  const n = i[0], s = i[i.length - 1], a = r[0], o = ut(a.getAttribute("stroke") || getComputedStyle(a).stroke || ""), l = Number(a.getAttribute("stroke-width") || getComputedStyle(a).strokeWidth || 1), c = Mc(n.x, n.y, s.x, s.y, {
    id: t.id,
    label: t.label ? {
      text: se(t.label),
      fontSize: 16,
      textAlign: "center"
    } : void 0,
    strokeStyle: j$(t.pattern),
    startArrowhead: df(t.arrowTypeStart),
    endArrowhead: df(t.arrowTypeEnd),
    start: { type: "rectangle", id: t.start },
    end: { type: "rectangle", id: t.end },
    points: i.map((h) => [
      h.x - n.x,
      h.y - n.y
    ])
  });
  return me(o) && o !== "none" && (c.strokeColor = o), Number.isFinite(l) && l > 0 && (c.strokeWidth = l), c;
}, K$ = (t, e) => {
  const r = t.getData(), i = r.nodes, n = r.edges, s = [], a = [], o = [];
  i.forEach((c) => {
    const h = G$(c, e);
    s.push(h.container), a.push(...h.lines), o.push(...h.text);
  });
  const l = n.map((c) => V$(c, e));
  return {
    type: "erd",
    nodes: [s],
    lines: a,
    arrows: l,
    text: o
  };
}, Wr = (t) => {
  const e = ut(t || "");
  return !e || e === "none" || e === "transparent" || e === "rgba(0, 0, 0, 0)" || e === "rgba(0,0,0,0)" ? !1 : me(e);
}, Q0 = (t, e, r) => {
  switch (e) {
    case gt.FILL:
    case gt.STROKE:
      Wr(r) && (t[e] = ut(r));
      break;
    case gt.STROKE_WIDTH:
    case gt.STROKE_DASHARRAY:
      ut(r) && (t[e] = ut(r));
      break;
  }
}, J0 = (t, e, r) => {
  e === Gt.COLOR && Wr(r) && (t[Gt.COLOR] = ut(r));
}, Z$ = (t, e, r) => {
  t && ge(t).forEach(({ property: i, value: n }) => {
    Q0(e, i, n), J0(r, i, n);
  });
}, Q$ = (t, e) => {
  t && ge(t).forEach(({ property: r, value: i }) => {
    if (r === gt.FILL && Wr(i)) {
      e[Gt.COLOR] = ut(i);
      return;
    }
    J0(e, r, i);
  });
}, J$ = (t) => {
  const e = /* @__PURE__ */ new Set();
  return t.filter(Boolean).forEach((r) => {
    ge(r || "").forEach(({ property: i }) => {
      e.add(i);
    });
  }), e;
}, tF = (t, e, r) => {
  if (!t)
    return;
  [
    [gt.FILL, t.getAttribute("fill")],
    [gt.STROKE, t.getAttribute("stroke")],
    [
      gt.STROKE_WIDTH,
      t.getAttribute("stroke-width")
    ],
    [
      gt.STROKE_DASHARRAY,
      t.getAttribute("stroke-dasharray")
    ]
  ].forEach(([n, s]) => {
    if (!r.has(n) || e[n])
      return;
    const a = ut(s || "");
    a && Q0(e, n, a);
  });
}, eF = (t, e, r) => {
  if (!t)
    return;
  const i = [
    t,
    ...Array.from(t.querySelectorAll("text, foreignObject, div, span, p"))
  ];
  for (const n of i) {
    if (e[Gt.COLOR] || (r.has(Gt.COLOR) || r.has(gt.FILL)) && (Q$(n.getAttribute("style"), e), e[Gt.COLOR]))
      break;
    const s = ut(n.getAttribute("fill") || n.getAttribute("color") || "");
    (r.has(Gt.COLOR) || r.has(gt.FILL)) && Wr(s) && (e[Gt.COLOR] = s);
  }
}, Fc = (t, e) => {
  let r = 0, i = 0, n = t;
  for (; n && n !== e; ) {
    const { transformX: s, transformY: a } = $r(n);
    r += s, i += a, n = n.parentElement;
  }
  return { tx: r, ty: i };
}, rF = (t, e) => {
  const r = t.getBBox(), { tx: i, ty: n } = Fc(t, e);
  return {
    x: r.x + i,
    y: r.y + n,
    width: r.width,
    height: r.height
  };
}, iF = (t, e) => {
  const r = t.querySelector("line.divider");
  if (!r)
    return;
  const { tx: i, ty: n } = Fc(r, e);
  return {
    startX: Number(r.getAttribute("x1")) + i,
    startY: Number(r.getAttribute("y1")) + n,
    endX: Number(r.getAttribute("x2")) + i,
    endY: Number(r.getAttribute("y2")) + n
  };
}, nF = (t) => {
  const e = t.getBBox();
  return Math.abs(e.width * e.height);
}, pf = (t, e) => {
  const r = t.getAttribute("style");
  if (!r)
    return;
  const i = ge(r).find((n) => n.property === e);
  if (i)
    return ut(i.value);
}, _l = (t, e) => {
  const r = t.map((n) => ({ element: n, area: nF(n) })).filter(({ area: n }) => Number.isFinite(n) && n > 0);
  return r.length === 0 ? null : r.sort((n, s) => e === "largest" ? s.area - n.area : n.area - s.area)[0].element;
}, sF = (t, e) => {
  if (!t || !e.has(gt.FILL) && !e.has(gt.STROKE))
    return;
  const r = ut(t.getAttribute("fill") || pf(t, gt.FILL) || ""), i = ut(t.getAttribute("stroke") || pf(t, gt.STROKE) || "");
  if (Wr(r))
    return r;
  if (Wr(i))
    return i;
}, aF = (t, e) => {
  const r = Array.from(t.querySelectorAll("circle, ellipse, path")), i = _l(r, "smallest");
  return sF(i, e);
}, oF = (t) => {
  if (t.length < 2)
    return t;
  const e = t.slice(1), r = e.filter((i) => i.trim().length > 0).reduce((i, n) => {
    const s = n.match(/^\s*/)?.[0].length ?? 0;
    return Math.min(i, s);
  }, Number.POSITIVE_INFINITY);
  return !Number.isFinite(r) || r <= 0 ? t.map((i) => i.trimEnd()) : [
    t[0].trimEnd(),
    ...e.map((i) => i.replace(new RegExp(`^\\s{0,${r}}`), "").trimEnd())
  ];
}, lF = (t) => {
  const e = Array.isArray(t.label) ? t.label.map((i) => se(i)) : se(t.label || "").split(`
`);
  return oF(e).join(`
`);
}, cF = (t) => t.description ? (Array.isArray(t.description) ? t.description : [t.description]).map((r) => se(r)).filter((r) => r.length > 0) : [], hF = (t) => {
  const e = /* @__PURE__ */ new Set(), r = (n) => (n && e.add(n), n), i = (n) => {
    const s = n.find((a) => !e.has(a));
    return r(s || null);
  };
  return (n) => {
    const s = [
      `[id='${n.domId}']`,
      `[id='${n.id}']`,
      `[data-id='${n.id}']`
    ];
    for (const a of s) {
      const o = t.querySelector(a);
      if (o)
        return r(o);
    }
    switch (n.shape) {
      case "divider":
        return i(Array.from(t.querySelectorAll("g.statediagram-cluster-alt")));
      case "stateStart":
        return i(Array.from(t.querySelectorAll("g.node.default")).filter((a) => a.querySelector("circle.state-start")));
      case "stateEnd":
        return i(Array.from(t.querySelectorAll("g.node.default")).filter((a) => !a.querySelector("circle.state-start")));
      default:
        return null;
    }
  };
}, uF = (t, e) => {
  switch (e) {
    case "roundedWithTitle":
      return t.querySelector("rect.outer") || t.querySelector("rect") || t;
    case "divider":
      return t.querySelector("rect.divider") || t.querySelector("rect") || t;
    case "rectWithTitle":
      return t.querySelector("rect.outer") || t.querySelector("rect") || t;
    case "stateStart":
      return _l(Array.from(t.querySelectorAll("circle, ellipse, path")), "largest") || t;
    case "stateEnd":
      return _l(Array.from(t.querySelectorAll("circle, ellipse, path")), "largest") || t;
    default:
      return t.querySelector("rect, path, circle, ellipse, polygon") || t;
  }
}, fF = (t, e, r) => {
  const i = r(t);
  if (!i)
    throw new Error(`State node element not found for "${t.id}"`);
  const n = uF(i, t.shape), s = {}, a = {}, o = [
    t.labelStyle,
    ...t.cssCompiledStyles || [],
    ...t.cssStyles || []
  ], l = J$(o);
  o.filter(Boolean).forEach((h) => {
    Z$(h, s, a);
  }), tF(n, s, l), eF(i, a, l);
  const c = rF(n, e);
  return {
    id: t.id,
    shape: t.shape,
    text: lF(t),
    description: cF(t),
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    parentId: t.parentId,
    position: t.position,
    containerStyle: s,
    labelStyle: a,
    dividerLine: t.shape === "rectWithTitle" ? iF(i, e) : void 0,
    endInnerColor: t.shape === "stateEnd" ? aF(i, l) : void 0,
    isRenderable: t.shape !== "noteGroup"
  };
}, dF = (t, e) => {
  const r = e.querySelector(`[id='${t.id}']`);
  if (!r)
    return null;
  const { tx: i, ty: n } = Fc(r, e), s = vf(r, { x: i, y: n }, "MCL");
  if (s.reflectionPoints.length < 2)
    return null;
  const a = {}, o = (c, h) => {
    switch (c) {
      case gt.STROKE:
        Wr(h) && (a.strokeColor = ut(h));
        break;
      case gt.STROKE_WIDTH: {
        const u = parseFloat(ut(h));
        Number.isFinite(u) && u > 0 && (a.strokeWidth = u);
        break;
      }
      case gt.STROKE_DASHARRAY:
        ut(h) && (a.strokeStyle = "dashed");
        break;
    }
  };
  [t.style].filter(Boolean).forEach((c) => {
    ge(c || "").forEach(({ property: h, value: u }) => {
      o(h, u);
    });
  });
  const l = t.arrowhead === "none" || t.classes?.includes("note-edge");
  return {
    id: t.id,
    start: t.start,
    end: t.end,
    text: se(t.label || ""),
    ...s,
    strokeColor: a.strokeColor,
    strokeWidth: a.strokeWidth,
    strokeStyle: l ? "dashed" : a.strokeStyle,
    isNoteEdge: l
  };
}, pF = (t, e) => {
  const { nodes: r, edges: i } = t.getData(), n = hF(e);
  return {
    type: "state",
    nodes: r.map((s) => fF(s, e, n)),
    edges: i.map((s) => dF(s, e)).filter((s) => s !== null)
  };
};
let gf = Promise.resolve();
const gF = (t) => {
  const e = gf.then(t, t);
  return gf = e.then(() => {
  }, () => {
  }), e;
};
let mf = null, mF = 0;
const yF = (t) => JSON.stringify(t), yf = (t) => {
  const e = t.querySelector("svg");
  if (!e)
    throw new Error("SVG element not found");
  const r = e.getBoundingClientRect(), i = r.width, n = r.height;
  e.setAttribute("width", `${i}`), e.setAttribute("height", `${n}`);
  const s = "image/svg+xml", a = unescape(encodeURIComponent(e.outerHTML)), l = `data:image/svg+xml;base64,${btoa(a)}`;
  return {
    type: "graphImage",
    mimeType: s,
    dataURL: l,
    width: i,
    height: n
  };
}, xF = async (t, e = Yn) => gF(async () => {
  const r = e.themeVariables?.fontSize ?? Yn.themeVariables.fontSize, i = {
    ...Yn,
    ...e,
    fontSize: r,
    themeVariables: {
      ...Yn.themeVariables,
      ...e.themeVariables,
      fontSize: r
    }
  }, n = yF(i);
  n !== mf && (mo.initialize(i), mf = n);
  const s = await mo.mermaidAPI.getDiagramFromText(tb(t)), a = `mermaid-to-excalidraw-${mF++}`, o = document.createElement("div");
  o.setAttribute("style", "opacity: 0; position: fixed; z-index: -1; left: -99999px; top: -99999px;");
  const l = `${a}-container`;
  o.id = l, document.getElementById(l)?.remove(), document.body.appendChild(o);
  try {
    const { svg: c } = await mo.render(a, t, o);
    o.innerHTML = c;
    let h;
    try {
      switch (s.type) {
        case "flowchart-v2":
        case "graph": {
          h = d$(s.db, o);
          break;
        }
        case "sequence": {
          h = k$(s, o);
          break;
        }
        case "class":
        case "classDiagram": {
          h = P$(s, o);
          break;
        }
        case "er": {
          h = K$(s.db, o);
          break;
        }
        case "state":
        case "stateDiagram": {
          h = pF(s.db, o);
          break;
        }
        default:
          h = yf(o);
      }
    } catch (u) {
      console.error("Error processing Mermaid diagram:", u), h = yf(o);
    }
    return h;
  } finally {
    o.remove();
  }
}), bF = async (t, e) => {
  const r = e || {}, i = parseInt(r.themeVariables?.fontSize ?? "") || 20, n = await xF(t, {
    ...r,
    themeVariables: {
      ...r.themeVariables
    }
  });
  return nb(n, {
    fontSize: i
  });
}, VF = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  parseMermaidToExcalidraw: bF
}, Symbol.toStringTag, { value: "Module" }));
export {
  Xf as $,
  tn as A,
  cb as B,
  H1 as C,
  hc as D,
  Pf as E,
  Ht as F,
  wT as G,
  __ as H,
  uh as I,
  Lk as J,
  n1 as K,
  pi as L,
  _F as M,
  wa as N,
  k1 as O,
  El as P,
  Bh as Q,
  d_ as R,
  us as S,
  bT as T,
  kn as U,
  M1 as V,
  _n as W,
  X,
  nt as Y,
  uT as Z,
  p as _,
  R1 as a,
  ic as a$,
  c_ as a0,
  Kh as a1,
  Vh as a2,
  FF as a3,
  LF as a4,
  MF as a5,
  BF as a6,
  TF as a7,
  ql as a8,
  $F as a9,
  OA as aA,
  h_ as aB,
  CF as aC,
  ba as aD,
  Hs as aE,
  Pg as aF,
  yx as aG,
  Bn as aH,
  $A as aI,
  MA as aJ,
  Pl as aK,
  ir as aL,
  hn as aM,
  Hh as aN,
  Hw as aO,
  Nv as aP,
  Ig as aQ,
  Eg as aR,
  HS as aS,
  zs as aT,
  YS as aU,
  Ln as aV,
  Sr as aW,
  Ov as aX,
  mu as aY,
  qr as aZ,
  jS as a_,
  AF as aa,
  ti as ab,
  DF as ac,
  OF as ad,
  EF as ae,
  sL as af,
  Uy as ag,
  jF as ah,
  Bk as ai,
  Dt as aj,
  fr as ak,
  tc as al,
  xm as am,
  jr as an,
  Yg as ao,
  ct as ap,
  Ie as aq,
  KL as ar,
  YF as as,
  UF as at,
  qF as au,
  Q as av,
  HF as aw,
  $L as ax,
  AL as ay,
  TL as az,
  I1 as b,
  qS as b0,
  GS as b1,
  vi as b2,
  Pv as b3,
  oT as b4,
  JS as b5,
  tT as b6,
  ec as b7,
  Vu as b8,
  K as b9,
  yl as bA,
  VF as bB,
  Sg as ba,
  ne as bb,
  Iw as bc,
  Rl as bd,
  od as be,
  vn as bf,
  hd as bg,
  vF as bh,
  lb as bi,
  aT as bj,
  Jv as bk,
  lT as bl,
  ga as bm,
  zS as bn,
  rc as bo,
  Dg as bp,
  hT as bq,
  Si as br,
  jv as bs,
  bE as bt,
  An as bu,
  qs as bv,
  ur as bw,
  uu as bx,
  nc as by,
  Mg as bz,
  yt as c,
  dt as d,
  Uf as e,
  $t as f,
  N1 as g,
  Xe as h,
  de as i,
  Ik as j,
  _i as k,
  R as l,
  Ug as m,
  kF as n,
  GF as o,
  z1 as p,
  W1 as q,
  XF as r,
  P1 as s,
  Ek as t,
  we as u,
  kL as v,
  kT as w,
  IF as x,
  D1 as y,
  SF as z
};
