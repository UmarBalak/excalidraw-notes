"use strict";
/*
 * layout-patterns.js
 *
 * The LLM picks a PATTERN and fills SLOTS (labels, order, lane, edges).
 * This module owns every coordinate, size, gap and arrow port.
 *
 *   LLM  ->  spec (no x/y)  ->  specToOperations()  ->  IR v2 ops  ->  your existing pipeline
 */

// ------------------------------------------------------------------
// 1. DESIGN TOKENS  (all numbers snap to an 8px grid)
// ------------------------------------------------------------------
const T = {
  grid: 8,
  margin: 60,
  titleY: 28,
  originY: 150,            // diagram starts below title + subtitle
  font: 18,
  charW: 0.56,             // avg glyph width / fontSize (Excalidraw Helvetica/Virgil)
  padX: 20,
  padY: 14,
  groupPad: 40,            // MUST match recomputeNativeGroupBounds padding
  size: {                  // by role: min/max width, base height
    hero:       { minW: 220, maxW: 280, h: 96 },
    primary:    { minW: 160, maxW: 220, h: 76 },
    secondary:  { minW: 140, maxW: 190, h: 64 },
    supporting: { minW: 120, maxW: 170, h: 56 },
    external:   { minW: 130, maxW: 180, h: 60 },
    decision:   { minW: 170, maxW: 240, h: 112 }
  },
  gap: {
    flowX: 140, flowY: 96,       // rank-based flows (room for a labeled arrow)
    tierY: 136,                  // 2*groupPad + 56 visible gap between tier bands
    laneY: 136,
    compareX: 220,
    layerX: 220, layerY: 36,
    treeX: 48, treeY: 90,
    hub: 150,
    cycle: 130
  },
  note: { w: 320, gap: 32, offset: 100 }
};

const snap = (v) => Math.round(v / T.grid) * T.grid;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slug = (s) => String(s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

// ------------------------------------------------------------------
// 2. TEXT-AWARE NODE SIZING  (no more labels spilling out of boxes)
// ------------------------------------------------------------------
function wrapLabel(text, maxPx, fs = T.font) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length * fs * T.charW > maxPx && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function sizeNode(n) {
  const role = T.size[n.role] ? n.role : "primary";
  const isDiamond = n.type === "diamond";
  const isEllipse = n.type === "ellipse";
  const base = isDiamond ? T.size.decision : T.size[role];
  const textW = (s) => s.length * T.font * T.charW;
  const probe = wrapLabel(n.label, base.maxW - 2 * T.padX);
  const longest = Math.max(...probe.map(textW));
  let w = clamp(longest + 2 * T.padX, base.minW, base.maxW);
  let lines = wrapLabel(n.label, w - 2 * T.padX);
  let h = Math.max(base.h, lines.length * T.font * 1.3 + 2 * T.padY);
  if (isDiamond) { w = clamp(longest * 1.5 + 40, 170, 260); h = Math.max(112, lines.length * T.font * 1.3 * 1.9); }
  if (isEllipse) { w *= 1.15; h *= 1.1; }
  if (n.size) { w = n.size.width || w; h = n.size.height || h; }   // internal overrides (e.g. neurons)
  return { w: snap(w), h: snap(h) };
}

// ------------------------------------------------------------------
// 3. GENERIC LAYOUT PRIMITIVES
// ------------------------------------------------------------------

/* cells: [{id,w,h,row,col}] -> Map(id -> {x,y,w,h}) */
function gridLayout(cells, { gapX, gapY, centerRows = false, centerCols = false }) {
  // LLM-produced specifications can be incomplete. Never let an empty or
  // malformed grid turn into Array(-Infinity) / RangeError.
  cells = (Array.isArray(cells) ? cells : []).filter((c) =>
    c && typeof c.id === "string" &&
    Number.isInteger(c.row) && c.row >= 0 &&
    Number.isInteger(c.col) && c.col >= 0 &&
    Number.isFinite(c.w) && c.w > 0 &&
    Number.isFinite(c.h) && c.h > 0
  );
  if (!cells.length) return new Map();

  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const rowH = Array(rows).fill(0), colW = Array(cols).fill(0);
  for (const c of cells) { rowH[c.row] = Math.max(rowH[c.row], c.h); colW[c.col] = Math.max(colW[c.col], c.w); }
  const rowY = [], colX = [];
  rowH.reduce((y, h, i) => (rowY[i] = y, y + h + gapY), 0);
  colW.reduce((x, w, i) => (colX[i] = x, x + w + gapX), 0);
  const out = new Map();

  if (centerRows) {
    const byRow = new Map();
    for (const c of cells) (byRow.get(c.row) || byRow.set(c.row, []).get(c.row)).push(c);
    const widths = [...byRow.values()].map((r) => r.reduce((s, c) => s + c.w, 0) + gapX * (r.length - 1));
    const maxW = Math.max(...widths);
    for (const [r, list] of byRow) {
      list.sort((a, b) => a.col - b.col);
      let x = (maxW - (list.reduce((s, c) => s + c.w, 0) + gapX * (list.length - 1))) / 2;
      for (const c of list) { out.set(c.id, { x, y: rowY[r] + (rowH[r] - c.h) / 2, w: c.w, h: c.h }); x += c.w + gapX; }
    }
    return out;
  }
  if (centerCols) {
    const byCol = new Map();
    for (const c of cells) (byCol.get(c.col) || byCol.set(c.col, []).get(c.col)).push(c);
    const heights = [...byCol.values()].map((r) => r.reduce((s, c) => s + c.h, 0) + gapY * (r.length - 1));
    const maxH = Math.max(...heights);
    for (const [col, list] of byCol) {
      list.sort((a, b) => a.row - b.row);
      let y = (maxH - (list.reduce((s, c) => s + c.h, 0) + gapY * (list.length - 1))) / 2;
      for (const c of list) { out.set(c.id, { x: colX[col] + (colW[col] - c.w) / 2, y, w: c.w, h: c.h }); y += c.h + gapY; }
    }
    return out;
  }
  for (const c of cells) {
    out.set(c.id, { x: colX[c.col] + (colW[c.col] - c.w) / 2, y: rowY[c.row] + (rowH[c.row] - c.h) / 2, w: c.w, h: c.h });
  }
  return out;
}

/* Longest-path ranking; DFS back-edges are returned as feedback. */
function rankGraph(ids, edges) {
  const adj = new Map(ids.map((i) => [i, []]));
  for (const e of edges) if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
  const state = new Map(), back = new Set();
  const dfs = (u) => {
    state.set(u, 1);
    for (const v of adj.get(u)) {
      if (state.get(v) === 1) back.add(`${u}>${v}`);
      else if (!state.get(v)) dfs(v);
    }
    state.set(u, 2);
  };
  const hasIn = new Set(edges.map((e) => e.to));
  [...ids.filter((i) => !hasIn.has(i)), ...ids].forEach((i) => { if (!state.get(i)) dfs(i); });
  const rank = new Map(ids.map((i) => [i, 0]));
  const fwd = edges.filter((e) => adj.has(e.from) && adj.has(e.to) && !back.has(`${e.from}>${e.to}`));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of fwd) if (rank.get(e.to) < rank.get(e.from) + 1) { rank.set(e.to, rank.get(e.from) + 1); changed = true; }
    if (!changed) break;
  }
  return { rank, back };
}

/* Order nodes inside each rank by barycenter of neighbours (2 sweeps) to cut crossings. */
function orderRanks(ids, rank, edges, back) {
  const layers = new Map();
  ids.forEach((id) => { const r = rank.get(id); (layers.get(r) || layers.set(r, []).get(r)).push(id); });
  const pos = new Map();
  const reindex = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  reindex();
  const fwd = edges.filter((e) => !back.has(`${e.from}>${e.to}`));
  const sweep = (dirDown) => {
    const keys = [...layers.keys()].sort((a, b) => (dirDown ? a - b : b - a));
    for (const k of keys) {
      const l = layers.get(k);
      const bary = (id) => {
        const nb = fwd.filter((e) => (dirDown ? e.to === id : e.from === id)).map((e) => pos.get(dirDown ? e.from : e.to)).filter((v) => v !== undefined);
        return nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(id);
      };
      l.sort((a, b) => bary(a) - bary(b));
      l.forEach((id, i) => pos.set(id, i));
    }
  };
  sweep(true); sweep(false); sweep(true);
  return layers;
}

// ------------------------------------------------------------------
// 4. PATTERN ENGINES   each returns { boxes: Map, groups: [{id,label,children}] }
// ------------------------------------------------------------------
const PATTERNS = {};

PATTERNS.pipeline = {
  when: "Linear ordered steps (ETL, request lifecycle, compile stages, CI/CD).",
  schema: `nodes in order; optional "perRow" (default: auto, max 4 per row; rows snake).`,
  layout(spec, nodes, sizes) {
    const n = nodes.length, LR = spec.direction !== "TB";
    const per = spec.perRow || (LR ? (n <= 5 ? n : Math.ceil(n / Math.ceil(n / 4))) : (n <= 7 ? n : Math.ceil(n / 2)));
    const cells = nodes.map((nd, i) => {
      const a = Math.floor(i / per), b = i % per, snaked = a % 2 ? per - 1 - b : b;
      return LR ? { id: nd.id, ...sizes.get(nd.id), row: a, col: snaked } : { id: nd.id, ...sizes.get(nd.id), row: snaked, col: a };
    });
    return { boxes: gridLayout(cells, { gapX: T.gap.flowX, gapY: T.gap.flowY }) };
  }
};

PATTERNS.flow = {
  when: "Flowcharts / DAGs with branches, decisions, merges, optional loop-backs.",
  schema: `nodes + edges (ranks computed automatically). Back-edges become "feedback". direction LR|TB.`,
  layout(spec, nodes, sizes, edges) {
    const LR = spec.direction !== "TB";
    const ids = nodes.map((n) => n.id);
    const { rank, back } = rankGraph(ids, edges);
    const layers = orderRanks(ids, rank, edges, back);
    const cells = [];
    layers.forEach((list, r) => list.forEach((id, i) => {
      const s = sizes.get(id);
      cells.push(LR ? { id, ...s, col: r, row: i } : { id, ...s, row: r, col: i });
    }));
    const boxes = gridLayout(cells, { gapX: T.gap.flowX, gapY: T.gap.flowY, centerCols: LR, centerRows: !LR });
    return { boxes, back };
  }
};

PATTERNS.tiers = {
  when: "Layered architecture (presentation/app/data tiers, OSI, network zones).",
  schema: `groups = tiers top->bottom, each {id,label,nodes:[ids]}; node order = left->right. Edges go between tiers.`,
  layout(spec, nodes, sizes) {
    const cells = [];
    (spec.groups || []).forEach((g, r) => (g.nodes || []).forEach((id, c) => sizes.has(id) && cells.push({ id, ...sizes.get(id), row: r, col: c })));
    const boxes = gridLayout(cells, { gapX: 80, gapY: T.gap.tierY, centerRows: true });
    return { boxes, groups: spec.groups };
  }
};

PATTERNS.swimlane = {
  when: "Cross-actor processes (customer / system / DB lanes, auth handshakes, approvals).",
  schema: `groups = lanes top->bottom {id,label,nodes}; edges define order (column = rank). Optional node.col to force a step.`,
  layout(spec, nodes, sizes, edges) {
    const ids = nodes.map((n) => n.id);
    const { rank, back } = rankGraph(ids, edges);
    const laneOf = new Map();
    (spec.groups || []).forEach((g, r) => (g.nodes || []).forEach((id) => laneOf.set(id, r)));
    const cells = nodes.filter((n) => laneOf.has(n.id)).map((n) => ({ id: n.id, ...sizes.get(n.id), row: laneOf.get(n.id), col: Number.isInteger(n.col) ? n.col : rank.get(n.id) }));
    const boxes = gridLayout(cells, { gapX: T.gap.flowX, gapY: T.gap.laneY });
    return { boxes, groups: spec.groups, back };
  }
};

PATTERNS.comparison = {
  when: "A vs B (two approaches, before/after, SQL vs NoSQL).",
  schema: `exactly 2 groups {id,label,nodes}; nodes at same index are aligned rows. Optional cross edges (compares_with).`,
  layout(spec, nodes, sizes) {
    const cells = [];
    (spec.groups || []).slice(0, 2).forEach((g, c) => (g.nodes || []).forEach((id, r) => sizes.has(id) && cells.push({ id, ...sizes.get(id), row: r, col: c })));
    const boxes = gridLayout(cells, { gapX: T.gap.compareX, gapY: 64 });
    return { boxes, groups: (spec.groups || []).slice(0, 2) };
  }
};

PATTERNS["layers-net"] = {
  when: "Neural nets / layer-to-layer graphs. Code draws the dense edges; LLM never lists them.",
  schema: `groups = layers left->right {id,label,nodes}; "dense":[["layerA","layerB"],...] -> auto all-to-all (sampled when >36). Node role "supporting".`,
  layout(spec, nodes, sizes) {
    const cells = [];
    (spec.groups || []).forEach((g, c) => (g.nodes || []).forEach((id, r) => sizes.has(id) && cells.push({ id, ...sizes.get(id), row: r, col: c })));
    const boxes = gridLayout(cells, { gapX: T.gap.layerX, gapY: T.gap.layerY, centerCols: true });
    return { boxes, groups: spec.groups, straight: true };
  }
};

PATTERNS.tree = {
  when: "Hierarchies: taxonomy, org chart, syntax tree, decomposition. edges = parent -> child.",
  schema: `nodes + edges (parent->child). direction TB (default) | LR.`,
  layout(spec, nodes, sizes, edges) {
    const LR = spec.direction === "LR";
    const S = (id) => { const s = sizes.get(id); return LR ? { w: s.h, h: s.w } : s; };   // transpose for LR
    const kids = new Map(nodes.map((n) => [n.id, []]));
    const hasParent = new Set();
    for (const e of edges) if (kids.has(e.from) && kids.has(e.to) && !hasParent.has(e.to)) { kids.get(e.from).push(e.to); hasParent.add(e.to); }
    const roots = nodes.map((n) => n.id).filter((id) => !hasParent.has(id));
    const pos = new Map(), depthH = [];
    let cursor = 0;
    const gx = LR ? T.gap.treeX : T.gap.treeX + 24;
    const walk = (id, d) => {
      const s = S(id);
      depthH[d] = Math.max(depthH[d] || 0, s.h);
      const ch = kids.get(id);
      if (!ch.length) { pos.set(id, { cx: cursor + s.w / 2, d }); cursor += s.w + gx; return; }
      ch.forEach((c) => walk(c, d + 1));
      const a = pos.get(ch[0]).cx, b = pos.get(ch[ch.length - 1]).cx;
      pos.set(id, { cx: (a + b) / 2, d });
    };
    roots.forEach((r) => walk(r, 0));
    const depthY = []; depthH.reduce((y, h, i) => (depthY[i] = y, y + h + T.gap.treeY), 0);
    const boxes = new Map();
    for (const [id, p] of pos) {
      const s = S(id);
      const x = p.cx - s.w / 2, y = depthY[p.d] + (depthH[p.d] - s.h) / 2;
      const real = sizes.get(id);
      boxes.set(id, LR ? { x: y, y: x, w: real.w, h: real.h } : { x, y, w: real.w, h: real.h });
    }
    return { boxes };
  }
};

PATTERNS.hub = {
  when: "One central concept with spokes and no sequence (system context, feature map).",
  schema: `node role "hero" = hub (else first node). Other nodes become spokes. Edges hub<->spoke.`,
  layout(spec, nodes, sizes) {
    const hub = nodes.find((n) => n.role === "hero") || nodes[0];
    const spokes = nodes.filter((n) => n !== hub);
    const sides = { top: [], right: [], bottom: [], left: [] };
    const order = ["top", "right", "bottom", "left"];
    spokes.forEach((n, i) => sides[order[i % 4]].push(n.id));
    const H = sizes.get(hub.id), g = T.gap.hub;
    const boxes = new Map();
    boxes.set(hub.id, { x: 0, y: 0, w: H.w, h: H.h });
    const rowOf = (ids, y) => {
      const tot = ids.reduce((s, id) => s + sizes.get(id).w, 0) + g * 0.6 * (ids.length - 1);
      let x = H.w / 2 - tot / 2;
      ids.forEach((id) => { const s = sizes.get(id); boxes.set(id, { x, y, w: s.w, h: s.h }); x += s.w + g * 0.6; });
    };
    const colOf = (ids, xFn) => {
      const tot = ids.reduce((s, id) => s + sizes.get(id).h, 0) + 40 * (ids.length - 1);
      let y = H.h / 2 - tot / 2;
      ids.forEach((id) => { const s = sizes.get(id); boxes.set(id, { x: xFn(s), y, w: s.w, h: s.h }); y += s.h + 40; });
    };
    const maxH = (ids) => Math.max(0, ...ids.map((id) => sizes.get(id).h));
    rowOf(sides.top, -g - maxH(sides.top));
    rowOf(sides.bottom, H.h + g);
    colOf(sides.left, (s) => -g * 1.3 - s.w);
    colOf(sides.right, () => H.w + g * 1.3);
    return { boxes };
  }
};

PATTERNS.cycle = {
  when: "Genuine loops: training loop, PDCA, event loop, lifecycle. nodes in loop order, clockwise.",
  schema: `nodes in order; last connects back to first (code adds it if you omit it).`,
  layout(spec, nodes, sizes) {
    const n = nodes.length;
    if (n < 4) {
      const cells = nodes.map((nd, i) => ({ id: nd.id, ...sizes.get(nd.id), row: 0, col: i }));
      return { boxes: gridLayout(cells, { gapX: T.gap.cycle, gapY: 0 }), closeLoop: true };
    }
    const a = Math.max(2, Math.ceil(n / 3)), r = n - 2 * a, right = Math.ceil(r / 2), left = Math.floor(r / 2);
    const cells = [];
    let i = 0;
    for (let c = 0; c < a; c++) cells.push({ id: nodes[i++].id, row: 0, col: c });                          // top  L->R
    for (let k = 0; k < right; k++) cells.push({ id: nodes[i++].id, row: 1 + k, col: a - 1 });              // right T->B
    const bottomRow = 1 + Math.max(right, left);
    for (let c = a - 1; c >= 0; c--) cells.push({ id: nodes[i++].id, row: bottomRow, col: c });             // bottom R->L
    for (let k = left - 1; k >= 0; k--) cells.push({ id: nodes[i++].id, row: 1 + k, col: 0 });              // left B->T
    cells.forEach((c) => Object.assign(c, sizes.get(c.id)));
    return { boxes: gridLayout(cells, { gapX: T.gap.cycle, gapY: 90 }), closeLoop: true };
  }
};

// ------------------------------------------------------------------
// 5. EDGES: port selection + fan-out slots (this is what removes crossings)
// ------------------------------------------------------------------
function choosePorts(a, b, dir, kind) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const hOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const vOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (kind === "feedback" || kind === "skip") return dir === "LR" ? ["bottom", "bottom"] : ["right", "right"];
  if (vOv > 0 && hOv <= 0) return ax < bx ? ["right", "left"] : ["left", "right"];
  if (hOv > 0 && vOv <= 0) return ay < by ? ["bottom", "top"] : ["top", "bottom"];
  if (dir === "LR") return ax < bx ? ["right", "left"] : ["left", "right"];
  return ay < by ? ["bottom", "top"] : ["top", "bottom"];
}

/* spread edges that share a port along that side, ordered by the other end's position */
function assignAnchors(edges, boxes) {
  const groups = new Map();
  const add = (key, e, end) => (groups.get(key) || groups.set(key, []).get(key)).push({ e, end });
  edges.forEach((e) => { add(`${e.from}:${e.fromSide}`, e, "from"); add(`${e.to}:${e.toSide}`, e, "to"); });
  for (const [key, list] of groups) {
    const side = key.split(":")[1];
    const vertical = side === "left" || side === "right";
    const other = (it) => { const b = boxes.get(it.end === "from" ? it.e.to : it.e.from); return vertical ? b.y + b.h / 2 : b.x + b.w / 2; };
    list.sort((p, q) => other(p) - other(q));
    list.forEach((it, i) => { it.e[it.end === "from" ? "fromAnchor" : "toAnchor"] = list.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (list.length - 1); });
  }
}

// ------------------------------------------------------------------
// 6. SPEC -> IR v2 OPERATIONS
// ------------------------------------------------------------------
function validatePatternSpec(rawSpec) {
  if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec)) return false;
  const pattern = rawSpec.pattern;
  if (pattern === "wireframe") {
    const supportedScreens = new Set(["dashboard", "login", "settings", "form", "kanban", "data-table", "chat", "generic"]);
    return supportedScreens.has(String(rawSpec.screenType || "generic").toLowerCase());
  }
  if (!PATTERNS[pattern]) return false;

  const rawNodes = Array.isArray(rawSpec.nodes) ? rawSpec.nodes : [];
  if (!rawNodes.length || rawNodes.length > 100) return false;
  const nodeIds = new Set();
  for (const node of rawNodes) {
    if (!node || typeof node.id !== "string" || !node.id.trim() || typeof node.label !== "string" || !node.label.trim()) return false;
    const id = slug(node.id);
    if (nodeIds.has(id)) return false; // detect collisions after slug normalization
    nodeIds.add(id);
  }

  const rawGroups = Array.isArray(rawSpec.groups) ? rawSpec.groups : [];
  const groupIds = new Set();
  for (const group of rawGroups) {
    if (!group || typeof group.id !== "string" || !group.id.trim()) return false;
    const id = slug(group.id);
    if (groupIds.has(id) || nodeIds.has(id)) return false;
    groupIds.add(id);
  }

  if (["tiers", "swimlane", "comparison", "layers-net"].includes(pattern)) {
    if (!rawGroups.length) return false;
    if (pattern === "comparison" && rawGroups.length !== 2) return false;
    if (pattern === "layers-net" && rawGroups.length < 2) return false;
    const membership = new Map();
    for (const group of rawGroups) {
      const members = Array.isArray(group.nodes) ? group.nodes : [];
      for (const rawId of members) {
        const id = slug(rawId);
        if (!nodeIds.has(id) || membership.has(id)) return false;
        membership.set(id, group.id);
      }
    }
    if (membership.size !== nodeIds.size) return false;
  }

  const rawEdges = Array.isArray(rawSpec.edges) ? rawSpec.edges : [];
  for (const edge of rawEdges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") return false;
    if (!nodeIds.has(slug(edge.from)) || !nodeIds.has(slug(edge.to))) return false;
  }

  // A tree cannot contain a directed cycle. Reject it instead of allowing
  // recursive tree placement to overflow the stack.
  if (pattern === "tree") {
    const adjacency = new Map([...nodeIds].map((id) => [id, []]));
    const parentOf = new Set();
    for (const edge of rawEdges) {
      const from = slug(edge.from), to = slug(edge.to);
      if (parentOf.has(to)) return false; // hierarchies must have at most one parent per node
      parentOf.add(to);
      adjacency.get(from).push(to);
    }
    const state = new Map();
    const visit = (id) => {
      if (state.get(id) === 1) return false;
      if (state.get(id) === 2) return true;
      state.set(id, 1);
      for (const child of adjacency.get(id) || []) if (!visit(child)) return false;
      state.set(id, 2);
      return true;
    };
    for (const id of nodeIds) if (!visit(id)) return false;
  }

  if (pattern !== "pipeline" && pattern !== "cycle" && rawNodes.length > 1 && rawEdges.length === 0 && !(Array.isArray(rawSpec.dense) && rawSpec.dense.length)) return false;
  return true;
}

function normalizeSpec(spec) {
  const nodes = (Array.isArray(spec.nodes) ? spec.nodes : []).map((n) => ({ ...n, id: slug(n.id) }));
  const ids = new Set(nodes.map((n) => n.id));
  const groups = (Array.isArray(spec.groups) ? spec.groups : []).map((g) => ({ ...g, id: slug(g.id), nodes: (Array.isArray(g.nodes) ? g.nodes : []).map(slug).filter((i) => ids.has(i)) }));
  let edges = (Array.isArray(spec.edges) ? spec.edges : []).map((e) => ({ ...e, from: slug(e.from), to: slug(e.to) })).filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  for (const pair of (Array.isArray(spec.dense) ? spec.dense : [])) {        // layers-net auto edges
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const A = groups.find((g) => g.id === slug(pair[0])), B = groups.find((g) => g.id === slug(pair[1]));
    if (!A || !B) continue;
    const all = A.nodes.flatMap((a) => B.nodes.map((b) => ({ from: a, to: b, kind: "data" })));
    const keep = all.length <= 36 ? all : all.filter((_, i) => i % Math.ceil(all.length / 24) === 0);
    edges = edges.concat(keep);
  }
  return { ...spec, nodes, groups, edges };
}

function specToOperations(rawSpec) {
  if (!validatePatternSpec(rawSpec)) return null;
  if (rawSpec.pattern === "wireframe") {
    try {
      return require("./wireframe-kit").wireframeToOperations(rawSpec, T);
    } catch (error) {
      return null;
    }
  }
  const spec = normalizeSpec(rawSpec);
  const engine = PATTERNS[spec.pattern];
  if (!engine || spec.nodes.length === 0) return null;                   // caller falls back to freeform prompt

  const sizes = new Map(spec.nodes.map((n) => {
    const s = sizeNode(spec.pattern === "layers-net" ? { size: { width: 72, height: 72 }, ...n, type: n.type || "ellipse", label: n.label } : n);
    return [n.id, s];
  }));
  if (spec.pattern === "layers-net") spec.nodes.forEach((n) => { n.type = n.type || "ellipse"; });

  const dir = spec.pattern === "tiers" ? "TB"
            : spec.pattern === "tree" ? (spec.direction === "LR" ? "LR" : "TB")
            : spec.pattern === "cycle" || spec.pattern === "hub" || spec.pattern === "comparison" ? "TB"
            : spec.pattern === "layers-net" || spec.pattern === "swimlane" ? "LR"
            : spec.direction === "TB" ? "TB" : "LR";

  let out;
  try {
    out = engine.layout(spec, spec.nodes, sizes, spec.edges);
  } catch (error) {
    return null;
  }
  const boxes = out?.boxes;
  if (!(boxes instanceof Map) || boxes.size !== spec.nodes.length) return null;

  // normalise to origin
  const xs = [...boxes.values()].map((b) => b.x), ys = [...boxes.values()].map((b) => b.y);
  const hasGroups = (out.groups || []).length > 0;
  const shiftX = T.margin + (hasGroups ? T.groupPad : 0) - Math.min(...xs);
  const shiftY = T.originY + (hasGroups ? T.groupPad : 0) - Math.min(...ys);
  for (const b of boxes.values()) { b.x = snap(b.x + shiftX); b.y = snap(b.y + shiftY); }

  // close loop for cycles
  let edges = spec.edges.map((e) => ({ ...e }));
  if (out.closeLoop && spec.nodes.length > 1) {
    const first = spec.nodes[0].id, last = spec.nodes[spec.nodes.length - 1].id;
    if (!edges.some((e) => e.from === last && e.to === first)) edges.push({ from: last, to: first, kind: spec.nodes.length < 4 ? "feedback" : "flow" });
    if (spec.pattern === "cycle" && !edges.some((e) => e.from !== last)) {
      for (let i = 0; i < spec.nodes.length - 1; i++) edges.unshift({ from: spec.nodes[i].id, to: spec.nodes[i + 1].id, kind: "flow" });
    }
  }
  if (spec.pattern === "pipeline" && edges.length === 0) {
    for (let i = 0; i < spec.nodes.length - 1; i++) edges.push({ from: spec.nodes[i].id, to: spec.nodes[i + 1].id, kind: "flow" });
  }

  // edge kinds + ports + anchors
  edges.forEach((e) => {
    if (out.back && out.back.has(`${e.from}>${e.to}`)) e.kind = "feedback";
    e.kind = e.kind || "flow";
    const [fs, ts] = choosePorts(boxes.get(e.from), boxes.get(e.to), dir, e.kind);
    e.fromSide = fs; e.toSide = ts;
  });
  assignAnchors(edges, boxes);

  const ops = [];
  const add = (element) => ops.push({ op: "add", element });

  // title block
  const diagramRight = Math.max(...[...boxes.values()].map((b) => b.x + b.w));
  const diagramBottom = Math.max(...[...boxes.values()].map((b) => b.y + b.h));
  if (spec.title) add({ id: "title", kind: "text", text: spec.title, position: { x: T.margin, y: T.titleY }, style: { fontSize: 32 } });
  if (spec.subtitle) add({ id: "subtitle", kind: "text", text: spec.subtitle, position: { x: T.margin, y: T.titleY + 48 }, style: { fontSize: 18 } });

  // groups (bounds mirror recomputeNativeGroupBounds; label is a separate top-left text so it never sits on a node)
  for (const g of out.groups || []) {
    const kids = g.nodes.map((id) => boxes.get(id)).filter(Boolean);
    if (!kids.length) continue;
    const gx = Math.min(...kids.map((b) => b.x)) - T.groupPad, gy = Math.min(...kids.map((b) => b.y)) - T.groupPad;
    add({ id: g.id, kind: "group", label: "", children: g.nodes, style: { visual: "group" } });
    if (g.label) add({ id: `${g.id}-label`, kind: "text", text: g.label, position: { x: gx + 16, y: gy + 8 }, style: { fontSize: 16 } });
  }

  const layerOf = {};
  for (const n of spec.nodes) {
    const b = boxes.get(n.id);
    if (!b) continue;
    const type = n.type || (n.role === "decision" ? "diamond" : n.role === "external" ? "ellipse" : "rectangle");
    add({ id: n.id, kind: "node", type, label: n.label, role: n.role || "primary", position: { x: b.x, y: b.y }, size: { width: b.w, height: b.h },
          style: { visual: n.visual || (n.role === "hero" ? "primary" : n.role === "external" ? "external" : n.role === "decision" ? "decision" : n.role === "secondary" ? "secondary" : "primary") } });
  }

  const REL = { flow: "leads_to", feedback: "leads_to", skip: "skip", data: "sends_to" };
  edges.forEach((e, i) => {
    if (!boxes.has(e.from) || !boxes.has(e.to)) return;
    add({
      id: `edge-${i}-${e.from}-${e.to}`.slice(0, 80), kind: "relationship", type: "arrow", from: e.from, to: e.to,
      relationshipType: e.relationshipType || REL[e.kind] || "leads_to",
      label: e.label && e.label.length <= 14 ? e.label : undefined,
      edgeKind: e.kind, fromSide: e.fromSide, toSide: e.toSide, fromAnchor: e.fromAnchor, toAnchor: e.toAnchor,
      route: out.straight ? "straight" : "orthogonal"
    });
  });

  // notes: right column if the diagram is narrow, else below
  const noteX = diagramRight + T.note.offset, wide = diagramRight > 2400;
  let ny = wide ? diagramBottom + 100 : T.originY, nx = wide ? T.margin : noteX;
  (spec.notes || []).forEach((n, i) => {
    const items = (n.items || []).slice(0, 8);
    const h = clamp(snap(60 + items.reduce((s, t) => s + Math.ceil(String(t).length / 34) * 24, 0)), 120, 520);
    add({ id: `note-${i}-${slug(n.title)}`.slice(0, 60), kind: "note", title: n.title, items, position: { x: nx, y: ny }, size: { width: T.note.w, height: h }, style: { visual: "annotation" } });
    if (wide) nx += T.note.w + T.note.gap; else ny += h + T.note.gap;
  });

  // Reject accidental element-id collisions before the main sanitizer silently
  // drops later additions (e.g. a node named "title" colliding with the title).
  const operationIds = ops.map((op) => op?.element?.id).filter(Boolean);
  if (ops.length > 200 || new Set(operationIds).size !== operationIds.length) return null;
  return { version: 2, operations: ops };
}

// ------------------------------------------------------------------
// 7. PROMPT (generated from the catalogue so docs and code never drift)
// ------------------------------------------------------------------
function buildPatternInstructions() {
  const catalogue = Object.entries(PATTERNS).map(([id, p]) => `- ${id}: ${p.when}\n    ${p.schema}`).join("\n");
  return `
You are the semantic planning layer for an Excalidraw canvas generator. Produce a compact, accurate specification; deterministic application code chooses coordinates, dimensions, and arrow geometry. Never output x/y coordinates or sizes.

First infer the user's actual learning or design objective, intended audience, requested depth, and explicit deliverables. Use specific concepts and real semantic relationships. Do not invent infrastructure or add filler merely to make a canvas look full. Keep titles informative and labels concise. Include equations, mechanisms, caveats, or notes only when they help explain the requested topic.

Return ONLY one JSON object matching this shape for a technical diagram:
{
  "pattern": "<supported pattern id | wireframe | freeform>",
  "direction": "LR" | "TB",
  "title": "specific title",
  "subtitle": "short statement of what the canvas explains",
  "groups": [{ "id": "kebab-id", "label": "Tier / Lane / Layer name", "nodes": ["node-id"] }],
  "nodes": [{ "id": "kebab-id", "label": "concrete concise label", "role": "hero|primary|secondary|supporting|external|decision" }],
  "edges": [{ "from": "id", "to": "id", "label": "short optional label", "kind": "flow|feedback|skip|data" }],
  "dense": [["layer-a", "layer-b"]],
  "notes": [{ "title": "topic-specific title", "items": ["specific point"] }]
}

PATTERNS:
${catalogue}

UI WIREFRAME MODE:
Choose pattern "wireframe" when the user asks for a UI, website, app screen, dashboard, settings page, form, Kanban board, data table, login screen, or chat interface. For wireframe output, use this schema instead of nodes/groups/edges:
{
  "pattern": "wireframe",
  "screenType": "dashboard|login|settings|form|kanban|data-table|chat|generic",
  "title": "screen title",
  "subtitle": "short purpose",
  "navigation": ["Overview", "Reports"],
  "metrics": [{"label":"Revenue", "value":"$42.8k", "trend":"+12%"}],
  "panels": [{"title":"Revenue Trend", "type":"chart|table|list|text", "items":["specific short item"]}],
  "fields": [{"label":"Email", "placeholder":"name@example.com", "type":"text|password|select|date"}],
  "actions": ["Save changes", "Cancel"],
  "columns": ["Order", "Customer", "Status"],
  "tasks": [{"title":"Implement search", "status":"In progress"}],
  "messages": [{"sender":"Assistant", "text":"How can I help?"}]
}
Supply only fields relevant to the selected screen type. These content fields are slots; do not supply geometry.

FREEFORM:
If none of the supported diagram patterns fits and it is not a UI wireframe, return {"pattern":"freeform"} only. The caller will use the legacy full-IR prompt.

RULES
1. Choose the best single primary pattern. Prefer a pattern that matches the semantics rather than the topic's keywords. Use wireframe only for actual interface layouts.
2. IDs must be unique kebab-case after normalization. Every edge must reference existing nodes. Never create decorative or uncertain connections.
3. Use role "decision" only for a real condition. Use "feedback" for genuine loop-back edges and "skip" for true bypass/residual paths.
4. For tiers, swimlane, comparison, and layers-net, put every node in exactly one group. Comparison must have exactly two groups. Layers-net must have two or more groups.
5. Keep nodes sufficient to explain the subject, without a fixed node count. Simple requests should stay simple; detailed requests should include the necessary mechanisms.
6. Notes should add useful detail beyond the node labels. Do not include generic notes.
7. Do not include markdown, code fences, or explanation outside the JSON.
`;
}

module.exports = { T, PATTERNS, specToOperations, buildPatternInstructions, validatePatternSpec, sizeNode, gridLayout, rankGraph, snap, slug, clamp };
