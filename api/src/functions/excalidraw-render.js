"use strict";
/*
 * excalidraw-render.js
 *
 * Turns IR v2 operations (from layout-patterns.js / wireframe-kit.js) into
 * Excalidraw element SKELETONS with colors, hand-drawn style, dashed containers
 * and bound arrows. Pass the result to convertToExcalidrawElements() on the client.
 *
 * Also exports styleMermaidSkeletons() so Mermaid diagrams get the same look.
 *
 * The LLM only ever picks a semantic "tone". This file owns every color.
 */

const THEMES = {
  dark: {
    background: "#121212",
    text: "#e5e5e5",
    tones: {
      default: { stroke: "#e5e5e5", fill: "transparent", text: "#e5e5e5" },
      accent:  { stroke: "#4caf50", fill: "transparent", text: "#4caf50" },
      danger:  { stroke: "#ff6b6b", fill: "transparent", text: "#ff6b6b" },
      warn:    { stroke: "#f59f00", fill: "transparent", text: "#f59f00" },
      info:    { stroke: "#1c7ed6", fill: "#1e3a5f",     text: "#e5e5e5" },
      violet:  { stroke: "#9775fa", fill: "#3b2a6b",     text: "#e5e5e5" },
      success: { stroke: "#2f9e44", fill: "#0b3d1e",     text: "#e5e5e5" },
      muted:   { stroke: "#868e96", fill: "transparent", text: "#adb5bd" }
    },
    edge: "#c9c9c9",
    edgeDense: "#6b6b6b",
    container: "#e5e5e5"
  },
  light: {
    background: "#ffffff",
    text: "#1e1e1e",
    tones: {
      default: { stroke: "#1e1e1e", fill: "transparent", text: "#1e1e1e" },
      accent:  { stroke: "#2f9e44", fill: "#d3f9d8",     text: "#1e1e1e" },
      danger:  { stroke: "#e03131", fill: "#ffe3e3",     text: "#1e1e1e" },
      warn:    { stroke: "#e8590c", fill: "#fff4e6",     text: "#1e1e1e" },
      info:    { stroke: "#1971c2", fill: "#d0ebff",     text: "#1e1e1e" },
      violet:  { stroke: "#6741d9", fill: "#e5dbff",     text: "#1e1e1e" },
      success: { stroke: "#2f9e44", fill: "#b2f2bb",     text: "#1e1e1e" },
      muted:   { stroke: "#868e96", fill: "#f1f3f5",     text: "#495057" }
    },
    edge: "#343a40",
    edgeDense: "#adb5bd",
    container: "#495057"
  }
};

const TONE_NAMES = ["default", "accent", "danger", "warn", "info", "violet", "success", "muted"];
// Colors cycled across groups/regions/lanes when the LLM gives no explicit tone.
const CATEGORICAL = ["info", "violet", "success", "warn", "accent", "danger"];

const BASE = { roughness: 1, fontFamily: 5, strokeWidth: 2, opacity: 100 };

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function toneFor(op, ctx) {
  const id = op.id;
  if (ctx.toneById.has(id)) return ctx.toneById.get(id);
  const group = ctx.groupOfNode.get(id);
  if (ctx.pattern === "layers-net" && group) {
    const last = ctx.groupOrder.length - 1;
    return group.index === 0 ? "info" : group.index === last ? "success" : "violet";
  }
  if (ctx.pattern === "wireframe") return op.style?.visual === "primary" ? "accent" : op.style?.visual === "secondary" ? "muted" : "default";
  if (op.role === "decision" || op.style?.visual === "decision") return "warn";
  if (op.role === "external" || op.style?.visual === "external") return "muted";
  if (op.role === "hero") return "accent";
  if (op.role === "secondary" || op.style?.visual === "secondary") return "violet";
  if (op.role === "supporting" || op.style?.visual === "supporting") return "info";
  const label = String(op.label || "").toLowerCase();
  if (/error|fail|exception|invalid|denied|critical|attack|threat/.test(label)) return "danger";
  if (/decision|condition|branch|check|validate|approval|warning|risk/.test(label)) return "warn";
  if (/database|storage|cache|repository|warehouse|persist|vector store/.test(label)) return "violet";
  if (/success|complete|response|output|result|healthy|approved/.test(label)) return "success";
  if (/external|third.party|vendor|optional|legacy|internet/.test(label)) return "muted";
  if (/input|source|client|user|request|event|sensor/.test(label)) return "info";
  if (/process|service|worker|compute|model|transform|controller|engine/.test(label)) return "accent";
  if (group && ["tiers", "swimlane", "composite", "comparison"].includes(ctx.pattern)) {
    return CATEGORICAL[group.index % CATEGORICAL.length];
  }
  return "default";
}

function portPoint(box, side, anchor = 0.5) {
  const a = Math.min(0.9, Math.max(0.1, anchor));
  switch (side) {
    case "left": return { x: box.x, y: box.y + box.h * a };
    case "right": return { x: box.x + box.w, y: box.y + box.h * a };
    case "top": return { x: box.x + box.w * a, y: box.y };
    default: return { x: box.x + box.w * a, y: box.y + box.h };
  }
}

/**
 * @param {{operations: object[]}} ir        output of specToOperations()
 * @param {object} opts
 * @param {string} opts.pattern              spec.pattern (colors layers-net by depth)
 * @param {"dark"|"light"} [opts.theme]
 * @param {Map|object} [opts.tones]          nodeId -> tone name chosen by the LLM
 * @param {boolean} [opts.elbow]             use elbow arrows for orthogonal routes
 * @returns {{elements: object[], appState: object}}
 */
function irToElements(ir, opts = {}) {
  const theme = THEMES[opts.theme] || THEMES.dark;
  const ops = (ir?.operations || []).map((o) => o.element).filter(Boolean);
  const toneById = opts.tones instanceof Map ? opts.tones : new Map(Object.entries(opts.tones || {}));

  const nodes = ops.filter((e) => e.kind === "node");
  const boxes = new Map(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height }]));

  const groups = ops.filter((e) => e.kind === "group");
  const groupOfNode = new Map();
  groups.forEach((g, index) => (g.children || []).forEach((c) => groupOfNode.set(c, { id: g.id, index })));
  const ctx = { pattern: opts.pattern, toneById, groupOfNode, groupOrder: groups.map((g) => g.id) };

  const out = [];
  const T = (name) => theme.tones[name] || theme.tones.default;

  // 1) group containers first (bottom of z-order). Padding matches layout-patterns T.groupPad.
  const PAD = 40;
  for (const g of groups) {
    const kids = (g.children || []).map((id) => boxes.get(id)).filter(Boolean);
    if (!kids.length) continue;
    const x = Math.min(...kids.map((b) => b.x)) - PAD, y = Math.min(...kids.map((b) => b.y)) - PAD;
    const w = Math.max(...kids.map((b) => b.x + b.w)) + PAD - x, h = Math.max(...kids.map((b) => b.y + b.h)) + PAD - y;
    out.push({
      ...BASE, type: "rectangle", id: `box-${g.id}`, x, y, width: w, height: h,
      strokeColor: theme.container, backgroundColor: "transparent", strokeStyle: "dashed", strokeWidth: 1.5,
      roundness: { type: 3 }
    });
  }

  // 2) text, nodes, notes
  for (const el of ops) {
    if (el.kind === "text") {
      out.push({ type: "text", id: `text-${el.id}`, x: el.position.x, y: el.position.y, text: el.text, fontSize: num(el.style?.fontSize, 18), fontFamily: BASE.fontFamily, strokeColor: theme.text });
    } else if (el.kind === "node") {
      const tone = T(toneFor(el, ctx));
      const type = ["rectangle", "ellipse", "diamond"].includes(el.type) ? el.type : "rectangle";
      out.push({
        ...BASE, type, id: el.id, x: el.position.x, y: el.position.y, width: el.size.width, height: el.size.height,
        strokeColor: tone.stroke, backgroundColor: tone.fill, fillStyle: "solid",
        roundness: type === "rectangle" ? { type: 3 } : undefined,
        label: el.label ? { text: el.label, fontSize: 18, fontFamily: BASE.fontFamily, strokeColor: tone.text } : undefined
      });
    } else if (el.kind === "note") {
      const body = [el.title, ...(el.items || []).map((i) => `• ${i}`)].join("\n");
      out.push({
        ...BASE, type: "rectangle", id: `note-${el.id}`, x: el.position.x, y: el.position.y, width: el.size.width, height: el.size.height,
        strokeColor: T("muted").stroke, backgroundColor: "transparent", strokeStyle: "dotted", roundness: { type: 3 },
        label: { text: body, fontSize: 16, fontFamily: BASE.fontFamily, strokeColor: T("muted").text, textAlign: "left", verticalAlign: "top" }
      });
    }
  }

  // 3) arrows last so they draw above shapes
  for (const el of ops) {
    if (el.kind !== "relationship") continue;
    const a = boxes.get(el.from), b = boxes.get(el.to);
    if (!a || !b) continue;
    const p1 = portPoint(a, el.fromSide, el.fromAnchor), p2 = portPoint(b, el.toSide, el.toAnchor);
    const dense = el.edgeKind === "data" && el.route === "straight";
    const dashed = el.edgeKind === "feedback" || el.edgeKind === "skip";
    out.push({
      ...BASE, type: "arrow", id: el.id, x: p1.x, y: p1.y,
      points: [[0, 0], [p2.x - p1.x, p2.y - p1.y]],
      start: { id: el.from }, end: { id: el.to },
      endArrowhead: "arrow", startArrowhead: null,
      strokeColor: dense ? theme.edgeDense : theme.edge,
      strokeWidth: dense ? 1 : 2, strokeStyle: dashed ? "dashed" : "solid",
      roughness: dense ? 0 : BASE.roughness, opacity: dense ? 60 : 100,
      ...(opts.elbow && el.route === "orthogonal" ? { elbowed: true } : {}),
      label: el.label ? { text: el.label, fontSize: 14, fontFamily: BASE.fontFamily, strokeColor: theme.text } : undefined
    });
  }

  return { elements: out, appState: { viewBackgroundColor: theme.background } };
}

/**
 * Post-style skeletons from parseMermaidToExcalidraw(), run on the client BEFORE
 * convertToExcalidrawElements(). `styles` comes from the server: [{id,label,tone}].
 * Matches by skeleton id first, then by label text.
 */
function styleMermaidSkeletons(skeletons, styles = [], themeName = "dark") {
  const theme = THEMES[themeName] || THEMES.dark;
  const byId = new Map(styles.map((s) => [s.id, s.tone]));
  const byLabel = new Map(styles.filter((s) => s.label).map((s) => [s.label.trim().toLowerCase(), s.tone]));
  return skeletons.map((el) => {
    const next = { ...el, roughness: 1, fontFamily: 5, strokeColor: el.strokeColor || theme.text };
    if (["rectangle", "ellipse", "diamond"].includes(el.type)) {
      const text = (el.label?.text || el.text || "").trim().toLowerCase();
      const name = byId.get(el.id) || byLabel.get(text);
      const tone = theme.tones[name] || theme.tones.default;
      next.strokeColor = tone.stroke; next.backgroundColor = tone.fill; next.fillStyle = "solid";
      if (el.type === "rectangle") next.roundness = { type: 3 };
      if (el.label) next.label = { ...el.label, fontFamily: 5, strokeColor: tone.text };
    } else if (el.type === "arrow") {
      next.strokeColor = theme.edge;
    }
    return next;
  });
}

module.exports = { THEMES, TONE_NAMES, irToElements, styleMermaidSkeletons };
