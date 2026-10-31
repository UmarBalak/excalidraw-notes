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

function sizeNetworkNode(n) {
  if (n.size && Number.isFinite(n.size.width) && Number.isFinite(n.size.height)) {
    return { w: snap(clamp(n.size.width, 88, 168)), h: snap(clamp(n.size.height, 88, 128)) };
  }
  const lines = wrapLabel(n.label, 116, T.font);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const w = snap(clamp(longest * T.font * T.charW + 36, 96, 160));
  const h = snap(clamp(Math.max(88, lines.length * T.font * 1.3 + 28), 88, 120));
  return { w, h };
}

// ------------------------------------------------------------------
// 3. GENERIC LAYOUT PRIMITIVES
// ------------------------------------------------------------------

/* cells: [{id,w,h,row,col}] -> Map(id -> {x,y,w,h}) */
function gridLayout(cells, { gapX, gapY, centerRows = false, centerCols = false }) {
  cells = (Array.isArray(cells) ? cells : []).filter((c) => c && typeof c.id === "string" && Number.isInteger(c.row) && c.row >= 0 && Number.isInteger(c.col) && c.col >= 0 && Number.isFinite(c.w) && c.w > 0 && Number.isFinite(c.h) && c.h > 0);
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

// Generic hybrid/multi-region grammar. Regions are semantic partitions, not topics.
PATTERNS.composite = {
  when: "Hybrid diagrams made of multiple parallel regions, lanes, or subgraphs with meaningful cross-region edges.",
  schema: `regions = [{id,label,row,col,direction,nodes:[node ids]}]. row/col are non-negative relative grid coordinates; direction is LR or TB. Every node belongs to exactly one region. Use arbitrary region names for any domain. Use cross-region edges whenever semantically accurate.`,
  layout(spec, nodes, sizes, edges) {
    const regions = (spec.regions || []).map((region, i) => ({
      ...region, id: slug(region.id),
      row: Number.isInteger(region.row) && region.row >= 0 ? region.row : 0,
      col: Number.isInteger(region.col) && region.col >= 0 ? region.col : i,
      direction: region.direction === "TB" ? "TB" : "LR",
      nodes: (region.nodes || []).map(slug).filter((id) => sizes.has(id))
    }));
    const boxes = new Map(), groups = [], prepared = [];
    for (const region of regions) {
      const members = region.nodes.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
      if (!members.length) continue;
      const ids = members.map((n) => n.id), memberSet = new Set(ids);
      const localEdges = edges.filter((e) => memberSet.has(e.from) && memberSet.has(e.to));
      let localBoxes;
      if (localEdges.length === 0) {
        const cells = members.map((n, i) => ({ id: n.id, ...sizes.get(n.id), row: region.direction === "LR" ? 0 : i, col: region.direction === "LR" ? i : 0 }));
        localBoxes = gridLayout(cells, { gapX: 88, gapY: 72, centerRows: region.direction === "LR", centerCols: region.direction === "TB" });
      } else {
        const { rank, back } = rankGraph(ids, localEdges);
        const layers = orderRanks(ids, rank, localEdges, back);
        const cells = [];
        layers.forEach((layer, r) => layer.forEach((id, i) => {
          cells.push(region.direction === "LR" ? { id, ...sizes.get(id), col: r, row: i } : { id, ...sizes.get(id), row: r, col: i });
        }));
        localBoxes = gridLayout(cells, { gapX: region.direction === "LR" ? 144 : 96, gapY: region.direction === "LR" ? 96 : 128, centerCols: region.direction === "LR", centerRows: region.direction === "TB" });
      }
      const list = [...localBoxes.values()];
      if (!list.length) continue;
      const w = Math.max(...list.map((b) => b.x + b.w));
      const h = Math.max(...list.map((b) => b.y + b.h));
      prepared.push({ region, localBoxes, w, h, cellW: w + T.groupPad * 2, cellH: h + T.groupPad * 2 });
    }
    if (!prepared.length) return { boxes, groups };
    const rows = Math.max(...prepared.map((r) => r.region.row)) + 1;
    const cols = Math.max(...prepared.map((r) => r.region.col)) + 1;
    const rowH = Array(rows).fill(0), colW = Array(cols).fill(0);
    prepared.forEach((item) => { rowH[item.region.row] = Math.max(rowH[item.region.row], item.cellH); colW[item.region.col] = Math.max(colW[item.region.col], item.cellW); });
    const rowY = [], colX = [];
    rowH.reduce((y, h, i) => (rowY[i] = y, y + h + 176), 0);
    colW.reduce((x, w, i) => (colX[i] = x, x + w + 176), 0);
    for (const item of prepared) {
      const r = item.region;
      const offsetX = colX[r.col] + (colW[r.col] - item.cellW) / 2 + T.groupPad;
      const offsetY = rowY[r.row] + (rowH[r.row] - item.cellH) / 2 + T.groupPad;
      for (const [id, b] of item.localBoxes) boxes.set(id, { x: offsetX + b.x, y: offsetY + b.y, w: b.w, h: b.h });
      groups.push({ id: r.id, label: typeof r.label === "string" ? r.label.slice(0, 100) : "", nodes: r.nodes.filter((id) => boxes.has(id)) });
    }
    return { boxes, groups };
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
function portPoint(box, side, anchor = 0.5) {
  const a = clamp(anchor, 0.1, 0.9);
  if (side === "left") return { x: box.x, y: box.y + box.h * a };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h * a };
  if (side === "top") return { x: box.x + box.w * a, y: box.y };
  return { x: box.x + box.w * a, y: box.y + box.h };
}

function segmentHitsBox(a, b, box, padding = 10) {
  const left = box.x - padding, right = box.x + box.w + padding;
  const top = box.y - padding, bottom = box.y + box.h + padding;
  // Axis-aligned orthogonal segments are sufficient for the candidate routes.
  if (Math.abs(a.x - b.x) < 0.001) {
    const x = a.x;
    return x > left && x < right && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
  }
  if (Math.abs(a.y - b.y) < 0.001) {
    const y = a.y;
    return y > top && y < bottom && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
  }
  return false;
}

function routeObstructionCount(points, boxes, sourceId, targetId) {
  let hits = 0;
  for (const [id, box] of boxes) {
    if (id === sourceId || id === targetId) continue;
    for (let i = 0; i < points.length - 1; i++) {
      if (segmentHitsBox(points[i], points[i + 1], box)) { hits++; break; }
    }
  }
  return hits;
}

/*
 * Select ports from actual geometry, not only the diagram's global direction.
 * This matters for composite diagrams where a connection may travel vertically
 * between regions even when each region is laid out left-to-right.
 */
function choosePorts(a, b, dir, kind, boxes, fromId, toId) {
  if (kind === "feedback" || kind === "skip") {
    return dir === "LR" ? ["bottom", "bottom"] : ["right", "right"];
  }
  const sides = ["left", "right", "top", "bottom"];
  const normals = {
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }
  };
  let best = null;
  for (const fromSide of sides) for (const toSide of sides) {
    const p1 = portPoint(a, fromSide), p2 = portPoint(b, toSide);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const length = Math.abs(dx) + Math.abs(dy);
    const n1 = normals[fromSide], n2 = normals[toSide];
    const sourceDot = dx * n1.x + dy * n1.y;
    const targetDot = -dx * n2.x - dy * n2.y;
    const directionPenalty = (sourceDot < 0 ? 260 : 0) + (targetDot < 0 ? 260 : 0);
    const horizontalFirst = [p1, { x: p2.x, y: p1.y }, p2];
    const verticalFirst = [p1, { x: p1.x, y: p2.y }, p2];
    const obstacles = Math.min(
      routeObstructionCount(horizontalFirst, boxes, fromId, toId),
      routeObstructionCount(verticalFirst, boxes, fromId, toId)
    );
    const preferredAxisPenalty = dir === "LR"
      ? ((fromSide === "top" || fromSide === "bottom") ? 10 : 0)
      : ((fromSide === "left" || fromSide === "right") ? 10 : 0);
    const score = length + directionPenalty + obstacles * 900 + preferredAxisPenalty;
    if (!best || score < best.score) best = { score, fromSide, toSide };
  }
  return [best.fromSide, best.toSide];
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
    list.sort((p, q) => other(p) - other(q) || String(p.e.from).localeCompare(String(q.e.from)) || String(p.e.to).localeCompare(String(q.e.to)));
    list.forEach((it, i) => { it.e[it.end === "from" ? "fromAnchor" : "toAnchor"] = list.length === 1 ? 0.5 : 0.14 + (0.72 * i) / (list.length - 1); });
  }
}

// ------------------------------------------------------------------
// 6. SPEC -> IR v2 OPERATIONS
// ------------------------------------------------------------------
function validatePatternSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (raw.pattern === "freeform") return true;
  if (raw.pattern === "wireframe") {
    const regions = raw.regions;
    if (Array.isArray(regions) && regions.length) {
      if (regions.length > 12) return false;
      const regionIds = new Set(), componentIds = new Set();
      let count = 0;
      for (const region of regions) {
        if (!region || typeof region.id !== "string" || !region.id.trim()) return false;
        const rid = slug(region.id);
        if (regionIds.has(rid)) return false;
        regionIds.add(rid);
        if (region.row !== undefined && (!Number.isInteger(region.row) || region.row < 0 || region.row > 7)) return false;
        if (region.col !== undefined && (!Number.isInteger(region.col) || region.col < 0 || region.col > 7)) return false;
        if (region.layout !== undefined && !["row", "column", "grid"].includes(region.layout)) return false;
        if (!Array.isArray(region.components) || !region.components.length) return false;
        for (const component of region.components) {
          if (!component || typeof component.id !== "string" || !component.id.trim() || typeof component.label !== "string" || !component.label.trim()) return false;
          const cid = slug(component.id);
          if (componentIds.has(cid)) return false;
          componentIds.add(cid);
          if (++count > 120) return false;
        }
      }
      return true;
    }
    return ["dashboard", "login", "settings", "form", "kanban", "data-table", "chat", "generic"].includes(String(raw.screenType || "generic").toLowerCase());
  }
  if (!PATTERNS[raw.pattern]) return false;
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (!rawNodes.length || rawNodes.length > 100) return false;
  const ids = new Set();
  for (const node of rawNodes) {
    if (!node || typeof node.id !== "string" || !node.id.trim() || typeof node.label !== "string" || !node.label.trim()) return false;
    const id = slug(node.id);
    if (ids.has(id)) return false;
    ids.add(id);
  }
  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  const groupIds = new Set();
  for (const group of groups) {
    if (!group || typeof group.id !== "string" || !group.id.trim()) return false;
    const id = slug(group.id);
    if (groupIds.has(id) || ids.has(id)) return false;
    groupIds.add(id);
  }
  const edges = Array.isArray(raw.edges) ? raw.edges : [];
  for (const edge of edges) if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string" || !ids.has(slug(edge.from)) || !ids.has(slug(edge.to))) return false;
  if (["tiers", "swimlane", "comparison", "layers-net"].includes(raw.pattern)) {
    if (!groups.length || (raw.pattern === "comparison" && groups.length !== 2) || (raw.pattern === "layers-net" && groups.length < 2)) return false;
    const membership = new Set();
    for (const group of groups) for (const rawId of (Array.isArray(group.nodes) ? group.nodes : [])) {
      const id = slug(rawId);
      if (!ids.has(id) || membership.has(id)) return false;
      membership.add(id);
    }
    if (membership.size !== ids.size) return false;
  }
  if (raw.pattern === "composite") {
    const regions = Array.isArray(raw.regions) ? raw.regions : [];
    if (regions.length < 2 || regions.length > 12) return false;
    const regionIds = new Set(), members = new Set();
    for (const region of regions) {
      if (!region || typeof region.id !== "string" || !region.id.trim()) return false;
      const id = slug(region.id);
      if (regionIds.has(id) || ids.has(id) || groupIds.has(id)) return false;
      regionIds.add(id);
      if (!Number.isInteger(region.row) || region.row < 0 || region.row > 7 || !Number.isInteger(region.col) || region.col < 0 || region.col > 7) return false;
      if (!Array.isArray(region.nodes) || !region.nodes.length) return false;
      for (const rawId of region.nodes) {
        const nid = slug(rawId);
        if (!ids.has(nid) || members.has(nid)) return false;
        members.add(nid);
      }
    }
    if (members.size !== ids.size) return false;
  }
  if (raw.pattern === "tree") {
    const parent = new Set(), adj = new Map([...ids].map((id) => [id, []]));
    for (const edge of edges) {
      const a = slug(edge.from), b = slug(edge.to);
      if (parent.has(b)) return false;
      parent.add(b); adj.get(a).push(b);
    }
    const state = new Map();
    const visit = (id) => { if (state.get(id) === 1) return false; if (state.get(id) === 2) return true; state.set(id, 1); for (const next of adj.get(id)) if (!visit(next)) return false; state.set(id, 2); return true; };
    for (const id of ids) if (!visit(id)) return false;
  }
  return true;
}

function normalizeSpec(spec) {
  const nodes = (spec.nodes || []).filter((n) => n && n.id && n.label).map((n) => ({ ...n, id: slug(n.id) }));
  const ids = new Set(nodes.map((n) => n.id));
  const groups = (Array.isArray(spec.groups) ? spec.groups : []).map((g) => ({ ...g, id: slug(g.id), nodes: (Array.isArray(g.nodes) ? g.nodes : []).map(slug).filter((i) => ids.has(i)) }));
  const regions = (Array.isArray(spec.regions) ? spec.regions : []).map((r, i) => ({ ...r, id: slug(r.id), row: Number.isInteger(r.row) && r.row >= 0 ? r.row : 0, col: Number.isInteger(r.col) && r.col >= 0 ? r.col : i, nodes: (Array.isArray(r.nodes) ? r.nodes : []).map(slug).filter((i) => ids.has(i)) }));
  let edges = (Array.isArray(spec.edges) ? spec.edges : []).map((e) => ({ ...e, from: slug(e.from), to: slug(e.to) })).filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  for (const pair of spec.dense || []) {                                  // layers-net auto edges
    const A = groups.find((g) => g.id === slug(pair[0])), B = groups.find((g) => g.id === slug(pair[1]));
    if (!A || !B) continue;
    const all = A.nodes.flatMap((a) => B.nodes.map((b) => ({ from: a, to: b, kind: "data" })));
    const keep = all.length <= 36 ? all : all.filter((_, i) => i % Math.ceil(all.length / 24) === 0);
    edges = edges.concat(keep);
  }
  return { ...spec, nodes, groups, regions, edges };
}

function specToOperations(rawSpec) {
  if (!validatePatternSpec(rawSpec)) return null;
  if (rawSpec.pattern === "freeform") return null;
  if (rawSpec.pattern === "wireframe") {
    try { return require("./wireframe-kit").wireframeToOperations(rawSpec, T); } catch (_) { return null; }
  }
  const spec = normalizeSpec(rawSpec);
  const engine = PATTERNS[spec.pattern];
  if (!engine || spec.nodes.length === 0) return null;                   // caller falls back to freeform prompt

  const sizes = new Map(spec.nodes.map((n) => {
    const s = spec.pattern === "layers-net" ? sizeNetworkNode({ ...n, type: n.type || "ellipse" }) : sizeNode(n);
    return [n.id, s];
  }));
  if (spec.pattern === "layers-net") spec.nodes.forEach((n) => { n.type = n.type || "ellipse"; });

  const dir = spec.pattern === "tiers" || spec.pattern === "tree" ? (spec.direction === "LR" ? "LR" : "TB")
            : spec.pattern === "cycle" || spec.pattern === "hub" || spec.pattern === "comparison" ? "TB"
            : spec.pattern === "layers-net" || spec.pattern === "swimlane" ? "LR"
            : spec.direction === "TB" ? "TB" : "LR";

  const out = engine.layout(spec, spec.nodes, sizes, spec.edges);
  const boxes = out?.boxes;
  if (!(boxes instanceof Map) || boxes.size !== spec.nodes.length || [...boxes.values()].some((b) => ![b.x, b.y, b.w, b.h].every(Number.isFinite))) return null;

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
    const [fs, ts] = choosePorts(boxes.get(e.from), boxes.get(e.to), dir, e.kind, boxes, e.from, e.to);
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
      label: e.label && e.label.length <= 24 ? e.label : undefined,
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

  if (ops.length > 200) return null;
  const operationIds = ops.map((op) => op?.element?.id).filter(Boolean);
  if (new Set(operationIds).size !== operationIds.length) return null;
  return { version: 2, operations: ops };
}

// ------------------------------------------------------------------
// 7. PROMPT (generated from the catalogue so docs and code never drift)
// ------------------------------------------------------------------
function buildPatternInstructions() {
  const catalogue = Object.entries(PATTERNS).map(([id, p]) => `- ${id}: ${p.when}\n    ${p.schema}`).join("\n");
  return `
You are the semantic planning layer for a dynamic Excalidraw canvas generator. Decide what the canvas should explain. Do not output pixel coordinates or dimensions; deterministic application code handles geometry.
Return ONLY one JSON object.

For a technical diagram:
{
  "pattern": "pipeline|flow|tiers|swimlane|comparison|layers-net|tree|hub|cycle|composite|freeform",
  "direction": "LR|TB",
  "title": "specific title",
  "subtitle": "short purpose",
  "groups": [{"id":"stable-kebab-id","label":"region/group label","nodes":["node-id"]}],
  "regions": [{"id":"region-id","label":"semantic region","row":0,"col":0,"direction":"LR|TB","nodes":["node-id"]}],
  "nodes": [{"id":"stable-kebab-id","label":"specific concise label","role":"hero|primary|secondary|supporting|external|decision"}],
  "edges": [{"from":"node-id","to":"node-id","label":"optional short label","kind":"flow|feedback|skip|data"}],
  "dense": [["layer-a","layer-b"]],
  "notes": [{"title":"specific note","items":["useful detail"]}]
}

Available reusable grammars:
${catalogue}

For UI requests, use this open-ended composition schema rather than choosing from a fixed list of screen types:
{
  "pattern":"wireframe",
  "title":"specific screen title",
  "subtitle":"short purpose",
  "regions":[
    {"id":"stable-region-id","label":"section purpose","row":0,"col":0,"layout":"row|column|grid","columns":2,
     "components":[{"id":"stable-component-id","type":"heading|text|button|input|select|toggle|badge|card|metric|chart|table|list|navigation|tabs|avatar|image|code|divider|empty-state","label":"visible content","detail":"optional supporting text"}]}
  ]
}

Composition rules:
1. Choose a reusable visual grammar from the meaning/structure, not the topic name. These patterns are foundations, not an exhaustive list.
2. Choose composite for hybrid diagrams with multiple regions, parallel subsystems, or distinct local flow structures. The model can define arbitrary region labels and relative row/column positions. Every node must belong to exactly one region.
3. Choose wireframe for actual interface layouts; compose arbitrary regions from generic UI primitives. Do not assume every UI has a preexisting template.
4. Use only semantically valid nodes and connections. Avoid invented components and decorative arrows.
5. Keep labels compact. Put explanations in notes rather than long node labels. Include the mechanisms and detail explicitly requested by the user.
6. For grouped patterns, every node must belong to exactly one group. IDs must be unique after slug normalization.
7. If none of the supported diagram grammars fits, return {"pattern":"freeform"}; the caller will use the full Canvas IR prompt.
8. Return JSON only, no markdown or explanation outside it.
`;
}

module.exports = { T, PATTERNS, specToOperations, buildPatternInstructions, validatePatternSpec, sizeNode, sizeNetworkNode, gridLayout, rankGraph, snap, slug, clamp };
