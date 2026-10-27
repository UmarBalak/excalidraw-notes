"use strict";

// Generic UI composition. The model supplies semantic regions and component
// slots; this module owns deterministic sizing and positions. It is deliberately
// not a catalogue of page-specific layouts.
const { snap, slug, clamp } = require("./layout-patterns");

const COMPONENTS = {
  heading: { w: 320, h: 56, visual: "primary", role: "primary" },
  text: { w: 280, h: 64, visual: "default", role: "supporting" },
  button: { w: 152, h: 44, visual: "primary", role: "supporting" },
  input: { w: 280, h: 64, visual: "default", role: "supporting" },
  select: { w: 280, h: 64, visual: "default", role: "supporting" },
  toggle: { w: 236, h: 48, visual: "default", role: "supporting" },
  badge: { w: 124, h: 36, visual: "secondary", role: "supporting" },
  card: { w: 288, h: 156, visual: "default", role: "secondary" },
  metric: { w: 224, h: 112, visual: "default", role: "primary" },
  chart: { w: 456, h: 232, visual: "default", role: "secondary" },
  table: { w: 560, h: 244, visual: "default", role: "secondary" },
  list: { w: 304, h: 192, visual: "default", role: "secondary" },
  navigation: { w: 216, h: 280, visual: "default", role: "secondary" },
  tabs: { w: 384, h: 48, visual: "secondary", role: "supporting" },
  avatar: { w: 80, h: 80, visual: "secondary", role: "supporting", shape: "ellipse" },
  image: { w: 256, h: 168, visual: "default", role: "secondary" },
  code: { w: 456, h: 192, visual: "default", role: "secondary" },
  divider: { w: 320, h: 12, visual: "default", role: "supporting" },
  "empty-state": { w: 320, h: 152, visual: "secondary", role: "secondary" }
};

function clean(value, fallback = "", max = 500) {
  if (typeof value !== "string") return fallback;
  const out = value.replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").trim();
  return out ? out.slice(0, max) : fallback;
}

function componentSize(component) {
  const type = String(component.type || "card").toLowerCase();
  const preset = COMPONENTS[type] || COMPONENTS.card;
  const label = clean(component.label, type.replace(/-/g, " "), 180);
  const detail = clean(component.detail, "", 320);
  const text = [label, detail].filter(Boolean).join("\n");
  const longest = Math.max(1, ...text.split("\n").map((line) => line.length));
  const width = snap(clamp(Math.max(preset.w, longest * 9 + 40), 120, 720));
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(18, (width - 36) / 9))), 0);
  const height = snap(clamp(Math.max(preset.h, lines * 24 + 28), 40, 360));
  return { ...preset, type, id: slug(component.id), label: text, w: width, h: height };
}

function wireframeToOperations(rawSpec, tokens = {}) {
  const spec = rawSpec && typeof rawSpec === "object" ? rawSpec : {};
  const usedIds = new Set();
  const operations = [];
  const add = (element) => {
    if (!element?.id || usedIds.has(element.id) || operations.length >= 190) return;
    usedIds.add(element.id);
    operations.push({ op: "add", element });
  };
  const addText = (id, value, x, y, fontSize = 18) => {
    const text = clean(value, "", 500);
    if (text) add({ id, kind: "text", text, position: { x: snap(x), y: snap(y) }, style: { fontSize } });
  };

  const regions = (Array.isArray(spec.regions) ? spec.regions : []).slice(0, 12).map((region, index) => ({
    id: slug(region.id || `region-${index + 1}`),
    label: clean(region.label, "", 100),
    row: Number.isInteger(region.row) && region.row >= 0 ? region.row : Math.floor(index / 2),
    col: Number.isInteger(region.col) && region.col >= 0 ? region.col : index % 2,
    layout: ["row", "column", "grid"].includes(region.layout) ? region.layout : "grid",
    columns: clamp(Number.isInteger(region.columns) ? region.columns : 2, 1, 6),
    components: (Array.isArray(region.components) ? region.components : []).slice(0, 40).map(componentSize)
  })).filter((region) => region.components.length);

  // Backwards compatibility for the previous fixed-screen request shape.
  if (!regions.length) {
    const fallbackTitle = clean(spec.title, "Application Wireframe");
    const items = [];
    const screenType = String(spec.screenType || "generic").toLowerCase();
    if (screenType === "dashboard") {
      for (const metric of (Array.isArray(spec.metrics) ? spec.metrics : []).slice(0, 4)) {
        items.push({ id: `metric-${items.length + 1}`, type: "metric", label: clean(metric.label, "Metric"), detail: [metric.value, metric.trend].filter(Boolean).join(" · ") });
      }
      for (const panel of (Array.isArray(spec.panels) ? spec.panels : []).slice(0, 4)) items.push({ id: `panel-${items.length + 1}`, type: panel.type === "chart" ? "chart" : "card", label: clean(panel.title, "Panel"), detail: (panel.items || []).map((x) => clean(x)).join("\n") });
    } else if (screenType === "form" || screenType === "settings" || screenType === "login") {
      for (const field of (Array.isArray(spec.fields) ? spec.fields : []).slice(0, 8)) items.push({ id: `field-${items.length + 1}`, type: "input", label: clean(field.label, "Field"), detail: clean(field.placeholder, "") });
      for (const action of (Array.isArray(spec.actions) ? spec.actions : ["Save", "Cancel"]).slice(0, 3)) items.push({ id: `action-${items.length + 1}`, type: "button", label: clean(action, "Action") });
    }
    if (!items.length) items.push({ id: "main-content", type: "card", label: fallbackTitle, detail: clean(spec.subtitle, "Main content area") });
    regions.push({ id: "main", label: "", row: 0, col: 0, layout: "grid", columns: screenType === "dashboard" ? 2 : 1, components: items.map(componentSize) });
  }

  // Lay out each region locally, then lay regions out on a responsive grid.
  const localLayouts = [];
  for (const region of regions) {
    const cells = region.components.map((component, index) => {
      const row = region.layout === "row" ? 0 : region.layout === "column" ? index : Math.floor(index / region.columns);
      const col = region.layout === "row" ? index : region.layout === "column" ? 0 : index % region.columns;
      return { id: component.id, row, col, w: component.w, h: component.h };
    });
    const rows = Math.max(...cells.map((cell) => cell.row)) + 1;
    const cols = Math.max(...cells.map((cell) => cell.col)) + 1;
    const rowHeights = Array(rows).fill(0), colWidths = Array(cols).fill(0);
    for (const cell of cells) { rowHeights[cell.row] = Math.max(rowHeights[cell.row], cell.h); colWidths[cell.col] = Math.max(colWidths[cell.col], cell.w); }
    const ys = [], xs = [];
    rowHeights.reduce((cursor, h, i) => (ys[i] = cursor, cursor + h + 24), 0);
    colWidths.reduce((cursor, w, i) => (xs[i] = cursor, cursor + w + 24), 0);
    const positions = new Map();
    for (const cell of cells) positions.set(cell.id, { x: xs[cell.col] + (colWidths[cell.col] - cell.w) / 2, y: ys[cell.row] + (rowHeights[cell.row] - cell.h) / 2, w: cell.w, h: cell.h });
    localLayouts.push({ region, positions, w: Math.max(...[...positions.values()].map((b) => b.x + b.w)), h: Math.max(...[...positions.values()].map((b) => b.y + b.h)) });
  }

  const rowCount = Math.max(...localLayouts.map((item) => item.region.row)) + 1;
  const colCount = Math.max(...localLayouts.map((item) => item.region.col)) + 1;
  const rowHeights = Array(rowCount).fill(0), colWidths = Array(colCount).fill(0);
  for (const item of localLayouts) { rowHeights[item.region.row] = Math.max(rowHeights[item.region.row], item.h + 64); colWidths[item.region.col] = Math.max(colWidths[item.region.col], item.w + 64); }
  const ys = [], xs = [];
  rowHeights.reduce((cursor, h, i) => (ys[i] = cursor, cursor + h + 64), 0);
  colWidths.reduce((cursor, w, i) => (xs[i] = cursor, cursor + w + 64), 0);
  addText("title", clean(spec.title, "Application Wireframe"), 64, 24, 30);
  addText("subtitle", clean(spec.subtitle, "Composed from reusable UI primitives"), 64, 72, 18);

  for (const item of localLayouts) {
    const region = item.region;
    const x0 = 64 + xs[region.col] + 32, y0 = 152 + ys[region.row] + 32;
    const groupId = `ui-region-${region.id}`;
    if (region.label) addText(`${groupId}-label`, region.label, x0, y0 - 28, 18);
    const childIds = [];
    for (const component of region.components) {
      const pos = item.positions.get(component.id);
      const id = `ui-component-${component.id}`;
      const nativeId = usedIds.has(id) ? `${id}-${operations.length}` : id;
      add({ id: nativeId, kind: "node", type: component.shape || "rectangle", label: component.label, role: component.role, position: { x: snap(x0 + pos.x), y: snap(y0 + pos.y) }, size: { width: pos.w, height: pos.h }, style: { visual: component.visual } });
      childIds.push(nativeId);
    }
    if (childIds.length) add({ id: groupId, kind: "group", label: region.label, children: childIds, style: { visual: "group" } });
  }
  return { version: 2, operations };
}

module.exports = { wireframeToOperations, COMPONENTS };
