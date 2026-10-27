"use strict";

/*
 * Deterministic UI wireframes for the Excalidraw IR.
 * The model supplies semantic slots; this module owns all geometry.
 * Values shown without model-provided content are intentionally placeholders.
 */

const { clamp, snap, slug } = require("./layout-patterns");

const clean = (value, fallback = "", maxLength = 140) => {
  if (typeof value !== "string") return fallback;
  const s = value.replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
  return s ? s.slice(0, maxLength) : fallback;
};
const list = (value, max = 8) => Array.isArray(value) ? value.slice(0, max) : [];
const slugId = (value) => slug(value).slice(0, 54) || "item";

function wireframeToOperations(rawSpec, T = {}) {
  const spec = rawSpec && typeof rawSpec === "object" ? rawSpec : {};
  const screenType = ["dashboard", "login", "settings", "form", "kanban", "data-table", "chat", "generic"]
    .includes(String(spec.screenType || "generic").toLowerCase())
    ? String(spec.screenType || "generic").toLowerCase() : "generic";
  const ops = [];
  const ids = new Set();
  const add = (element) => {
    if (!element || !element.id || ids.has(element.id) || ops.length >= 190) return;
    ids.add(element.id);
    ops.push({ op: "add", element });
  };
  const text = (id, value, x, y, fontSize = 18) => {
    const content = clean(value, "", 500);
    if (!content) return;
    add({ id, kind: "text", text: content, position: { x: snap(x), y: snap(y) }, style: { fontSize } });
  };
  const box = (id, label, x, y, width, height, visual = "default", role = "secondary") => {
    const content = clean(label, " ", 900);
    add({
      id, kind: "node", type: "rectangle", label: content,
      role, position: { x: snap(x), y: snap(y) },
      size: { width: snap(width), height: snap(height) },
      style: { visual }
    });
  };
  const safeArray = (values, max = 8, fallback = []) => {
    const source = list(values, max).map((v) => typeof v === "string" ? clean(v) : v).filter(Boolean);
    return source.length ? source : fallback;
  };
  const title = clean(spec.title, "Application Wireframe");
  const subtitle = clean(spec.subtitle, "Low-fidelity layout generated from reusable UI patterns");
  text("title", title, 60, 24, 30);
  text("subtitle", subtitle, 60, 72, 18);

  const nav = safeArray(spec.navigation, 7, ["Overview", "Activity", "Reports", "Settings"]);
  const metrics = list(spec.metrics, 4);
  const panels = list(spec.panels, 4);
  const fields = list(spec.fields, 8);
  const actions = safeArray(spec.actions, 3, ["Save", "Cancel"]);
  const columns = safeArray(spec.columns, 6, ["Name", "Status", "Updated"]);
  const tasks = list(spec.tasks, 12);
  const messages = list(spec.messages, 8);

  const header = (label = "Workspace") => {
    box("ui-topbar", label, 60, 124, 1320, 52, "secondary", "primary");
    box("ui-topbar-search", "Search", 1020, 132, 150, 36, "default", "supporting");
    box("ui-topbar-profile", "Profile", 1190, 132, 150, 36, "default", "supporting");
  };
  const sidebar = (items = nav) => {
    const label = ["NAVIGATION", ...items.map((item) => `- ${clean(item)}`)].join("\n");
    box("ui-sidebar", label, 60, 192, 220, 650, "default", "secondary");
  };
  const sectionHeading = (label, x = 312, y = 190) => text("ui-section-heading", label, x, y, 24);
  const appShell = () => { header(); sidebar(); };
  const mainX = 312, mainW = 1068;

  if (screenType === "login") {
    // Focused single-card composition: no sidebar or app shell clutter.
    box("ui-login-card", "", 450, 180, 540, 600, "default", "primary");
    text("ui-login-heading", clean(spec.title, "Welcome back"), 510, 225, 26);
    text("ui-login-description", clean(spec.subtitle, "Sign in to continue"), 510, 270, 16);
    const loginFields = fields.length ? fields : [
      { label: "Email address", placeholder: "name@example.com", type: "text" },
      { label: "Password", placeholder: "Enter password", type: "password" }
    ];
    loginFields.slice(0, 4).forEach((f, i) => {
      const label = clean(f?.label, `Field ${i + 1}`);
      box(`ui-login-field-${i + 1}`, `${label}\n${clean(f?.placeholder, "Enter " + label.toLowerCase())}`, 510, 320 + i * 92, 420, 68, "default", "supporting");
    });
    box("ui-login-primary-action", clean(actions[0], "Sign in"), 510, 320 + Math.min(loginFields.length, 4) * 92, 420, 48, "primary", "primary");
    if (actions[1]) text("ui-login-secondary-action", actions[1], 510, 720, 15);
  } else if (screenType === "dashboard") {
    appShell();
    sectionHeading(clean(spec.title, "Overview"));
    const defaults = [
      { label: "Active users", value: "Value", trend: "Trend" },
      { label: "New signups", value: "Value", trend: "Trend" },
      { label: "Conversion", value: "Value", trend: "Trend" },
      { label: "Revenue", value: "Value", trend: "Trend" }
    ];
    (metrics.length ? metrics : defaults).slice(0, 4).forEach((m, i) => {
      const x = mainX + i * 267;
      const label = clean(m?.label, `Metric ${i + 1}`);
      const value = clean(m?.value, "Value");
      const trend = clean(m?.trend, "Trend unavailable");
      box(`ui-metric-${i + 1}`, `${label}\n${value}\n${trend}`, x, 232, 246, 112, "default", "primary");
    });
    const p1 = panels[0] || { title: "Trend analysis", type: "chart", items: ["Chart placeholder"] };
    const p2 = panels[1] || { title: "Recent activity", type: "list", items: ["Activity item", "Activity item", "Activity item"] };
    const panelText = (p) => [clean(p?.title, "Panel"), ...(list(p?.items, 4).map((v) => `- ${clean(v)}`))].join("\n");
    box("ui-dashboard-panel-1", `${panelText(p1)}\n[${clean(p1?.type, "chart")} area]`, mainX, 368, 680, 230, "default", "secondary");
    box("ui-dashboard-panel-2", panelText(p2), 1012, 368, 368, 230, "default", "secondary");
    const tableTitle = clean(panels[2]?.title, "Recent records");
    box("ui-dashboard-table", `${tableTitle}\n${columns.join("     ")}\nRow data placeholder\nRow data placeholder\nRow data placeholder`, mainX, 622, mainW, 220, "default", "secondary");
  } else if (screenType === "kanban") {
    appShell();
    sectionHeading(clean(spec.title, "Project Board"));
    const laneNames = safeArray(spec.columns, 4, ["To do", "In progress", "Done"]);
    const laneGap = 18, laneW = (mainW - laneGap * (laneNames.length - 1)) / laneNames.length;
    laneNames.forEach((lane, i) => {
      const x = mainX + i * (laneW + laneGap);
      const laneTasks = tasks.filter((t) => clean(t?.status).toLowerCase() === lane.toLowerCase());
      const shown = laneTasks.length ? laneTasks : (tasks.length ? [] : [{ title: "Task placeholder" }]);
      const contents = [lane, ...shown.slice(0, 5).map((t) => `- ${clean(t?.title, "Task")}`)].join("\n\n");
      box(`ui-kanban-lane-${i + 1}`, contents, x, 236, laneW, 590, "default", "secondary");
    });
  } else if (screenType === "settings" || screenType === "form") {
    appShell();
    sectionHeading(clean(spec.title, screenType === "settings" ? "Settings" : "Details"));
    const sectionTitle = clean(panels[0]?.title, screenType === "settings" ? "Preferences" : "Information");
    const body = fields.length ? fields : [
      { label: "Name", placeholder: "Enter name" },
      { label: "Email address", placeholder: "Enter email" },
      { label: "Description", placeholder: "Add a description" }
    ];
    box("ui-form-section", sectionTitle, mainX, 232, mainW, 72, "default", "primary");
    body.slice(0, 7).forEach((field, i) => {
      const y = 322 + i * 64;
      const label = clean(field?.label, `Field ${i + 1}`);
      box(`ui-form-field-${i + 1}`, `${label}\n${clean(field?.placeholder, "Enter " + label.toLowerCase())}`, mainX, y, mainW, 52, "default", "supporting");
    });
    const bottomY = 322 + Math.min(body.length, 7) * 64;
    actions.slice(0, 3).forEach((action, i) => box(`ui-form-action-${i + 1}`, action, mainX + mainW - (i + 1) * 150, bottomY, 132, 42, i === 0 ? "primary" : "default", "supporting"));
  } else if (screenType === "data-table") {
    appShell();
    sectionHeading(clean(spec.title, "Records"));
    box("ui-table-search", "Search records", mainX, 232, 320, 44, "default", "supporting");
    box("ui-table-filter", "Filters", 650, 232, 140, 44, "default", "supporting");
    box("ui-table-primary-action", clean(actions[0], "Add record"), 1190, 232, 190, 44, "primary", "supporting");
    const panelTitle = clean(panels[0]?.title, "All records");
    const rows = list(panels[0]?.items, 7).map((item) => `- ${clean(item)}`);
    box("ui-data-table", [panelTitle, columns.join("     "), ... (rows.length ? rows : ["Row placeholder", "Row placeholder", "Row placeholder", "Row placeholder"])].join("\n\n"), mainX, 300, mainW, 530, "default", "secondary");
  } else if (screenType === "chat") {
    header();
    box("ui-chat-conversations", ["CONVERSATIONS", ...nav.map((item) => `- ${clean(item)}`)].join("\n"), 60, 192, 280, 650, "default", "secondary");
    text("ui-chat-heading", clean(spec.title, "Assistant"), 380, 204, 24);
    const chatMessages = messages.length ? messages : [
      { sender: "Assistant", text: "Start a conversation" },
      { sender: "You", text: "Type a message below" }
    ];
    chatMessages.slice(0, 8).forEach((m, i) => {
      const y = 260 + i * 62;
      const sender = clean(m?.sender, i % 2 ? "You" : "Assistant");
      box(`ui-chat-message-${i + 1}`, `${sender}: ${clean(m?.text, "Message text")}`, sender.toLowerCase() === "you" ? 760 : 380, y, 560, 48, sender.toLowerCase() === "you" ? "secondary" : "default", "supporting");
    });
    box("ui-chat-composer", "Write a message...", 380, 780, 920, 54, "default", "supporting");
    box("ui-chat-send", clean(actions[0], "Send"), 1310, 780, 70, 54, "primary", "supporting");
  } else {
    appShell();
    sectionHeading(clean(spec.title, "Application"));
    const comps = panels.length ? panels : [{ title: "Main content", type: "panel", items: ["Content placeholder"] }];
    comps.slice(0, 4).forEach((panel, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      box(`ui-generic-panel-${i + 1}`, [clean(panel?.title, `Panel ${i + 1}`), ...list(panel?.items, 4).map((item) => `- ${clean(item)}`)].join("\n"), mainX + col * 544, 232 + row * 270, 524, 240, "default", "secondary");
    });
  }

  return { version: 2, operations: ops.slice(0, 200) };
}

module.exports = { wireframeToOperations };
