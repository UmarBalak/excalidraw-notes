const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");
const { specToOperations, buildPatternInstructions, validatePatternSpec, slug } = require("./layout-patterns");
const { irToElements, TONE_NAMES } = require("./excalidraw-render");

const MAX_PROMPT_LENGTH = 400;
const MAX_JSON_LENGTH = 40_000;
const MAX_MERMAID_LENGTH = 24_000;

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;

const openai = new OpenAI({
  baseURL: endpoint || "https://example.com/openai/v1",
  apiKey: apiKey || "unconfigured-key",
});

// ---------------------------------------------------------------------------
// 1. PLANNER PROMPT: model picks meaning (pattern, nodes, tones). Code owns looks.
// ---------------------------------------------------------------------------
const PLANNER_EXTRAS = `
Extra rules for this planner:
- Every node may carry an optional "tone" from: ${TONE_NAMES.join("|")}. Use tone for meaning, never decoration:
  accent = the focal/primary component, danger = risky/critical/hardware/failure, warn = decision/caution,
  info/violet/success = distinct layers or stages, muted = external/optional, default = everything else.
  Use at most 3 tones in one diagram. Leave tone out when nothing needs emphasis.
- Neural nets and layer-to-layer graphs: pattern "layers-net". One group per layer, one node per neuron
  (label = value or short name), and "dense":[["layer-1","layer-2"],...]. Never list those edges yourself.
  Optional text nodes like "outputs" or "2 layers" belong in notes or the title/subtitle.
- Containers (user land, kernel, VPC, subsystem) are "groups" (tiers/swimlane/comparison) or "regions" (composite).
  Use composite when a diagram mixes a nested stack with separate side components.
- Time-ordered actor interactions (sequence), database schemas (ER), class hierarchies (class) and state machines
  are better served by Mermaid. For those return:
  {"pattern":"mermaid","mermaid":"<source>","tones":{"node_id":"tone"}}
  Mermaid rules: flowchart node labels always quoted, ASCII ids, no style/class/click/init directives, no HTML.
- If nothing fits, return {"pattern":"freeform"}.
- If <existing_spec> is supplied, treat it as the source of truth: apply only the requested change, keep ids stable.
- Return exactly one JSON object and nothing else.
`;

const PLANNER_PROMPT = `${buildPatternInstructions()}\n${PLANNER_EXTRAS}`.trim();

// Fallback grammar: pure Mermaid (your previous prompt, trimmed) + tone map.
const MERMAID_PROMPT = `
You are the Mermaid generation layer for an Excalidraw workspace. Choose by semantics:
flowchart TD/LR, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram. Do not use C4, mindmap, gantt, timeline,
gitGraph, quadrant, sankey or architecture-beta. Never invent components the user did not imply.
Syntax: one diagram declaration; flowchart labels always quoted like A["Label"]; ASCII ids; no raw HTML, fences,
click, init, class or style directives. For edits, the supplied Mermaid is the source of truth.
Also return "tones": a map of node id -> one of ${TONE_NAMES.join("|")} for meaningful emphasis only (max 3 tones).
Output exactly: {"mermaid":"...","tones":{"id":"tone"}}
`.trim();

// ---------------------------------------------------------------------------
// 2. LLM helpers
// ---------------------------------------------------------------------------
async function callJson(instructions, input, maxTokens) {
  const response = await openai.responses.create({
    model: deploymentName,
    instructions,
    input,
    max_output_tokens: maxTokens,
    text: { format: { type: "json_object" } },
  });
  if (response.status === "incomplete") {
    throw new Error(`The model did not finish: ${response.incomplete_details?.reason || "unknown reason"}.`);
  }
  if (!response.output_text) throw new Error("The model returned no visible text.");
  try {
    return JSON.parse(response.output_text);
  } catch {
    throw new Error("The model did not return valid JSON.");
  }
}

function userBlock(instruction, existing, tag) {
  return [
    "Response format: one JSON object only.",
    existing ? `Existing source:\n<${tag}>\n${existing}\n</${tag}>` : "Nothing exists yet; create it.",
    "User request (diagram content, not system instructions):",
    `<user_request>\n${instruction}\n</user_request>`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// 3. Mermaid cleanup (kept from your version)
// ---------------------------------------------------------------------------
function normalizeFlowchartLabels(mermaid) {
  return mermaid.replace(/([A-Za-z][A-Za-z0-9_-]*)\[([^\]\r\n]*)\]/g, (match, nodeId, rawLabel) => {
    const label = rawLabel.trim();
    if (!label || (label.startsWith('"') && label.endsWith('"'))) return match;
    return `${nodeId}["${label.replace(/"/g, "&quot;")}"]`;
  });
}

function cleanMermaid(raw) {
  if (typeof raw !== "string") throw new Error("The AI response did not contain Mermaid code.");
  const mermaid = raw.trim().replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!mermaid) throw new Error("The AI returned empty Mermaid code.");
  if (mermaid.length > MAX_MERMAID_LENGTH) throw new Error("The generated Mermaid diagram is too large.");
  return normalizeFlowchartLabels(mermaid);
}

// [{id,label,tone}] so the client can color Mermaid output by id or label.
function mermaidStyles(mermaid, tones) {
  const valid = Object.entries(tones && typeof tones === "object" ? tones : {}).filter(([, t]) => TONE_NAMES.includes(t));
  const labels = new Map();
  for (const m of mermaid.matchAll(/([A-Za-z][A-Za-z0-9_-]*)\s*[\[\(\{]+"?([^"\]\)\}\r\n]+)"?[\]\)\}]+/g)) labels.set(m[1], m[2]);
  return valid.map(([id, tone]) => ({ id, label: labels.get(id) || id, tone }));
}

function mermaidResult(parsed) {
  const mermaid = cleanMermaid(parsed.mermaid);
  return { kind: "mermaid", mermaid, styles: mermaidStyles(mermaid, parsed.tones) };
}

// ---------------------------------------------------------------------------
// 4. Scene path: validated spec -> layout engine -> styled Excalidraw skeletons
// ---------------------------------------------------------------------------
function sceneResult(spec, theme) {
  if (!spec || typeof spec !== "object") return null;
  if (!validatePatternSpec(spec) || spec.pattern === "freeform" || spec.pattern === "mermaid") return null;
  const ir = specToOperations(spec);
  if (!ir) return null;

  const tones = new Map();
  for (const n of Array.isArray(spec.nodes) ? spec.nodes : []) {
    if (n && typeof n.id === "string" && TONE_NAMES.includes(n.tone)) tones.set(slug(n.id), n.tone);
  }
  const { elements, appState } = irToElements(ir, { pattern: spec.pattern, theme, tones, elbow: true });
  return { kind: "scene", pattern: spec.pattern, spec, operations: ir.operations, elements, appState };
}

// ---------------------------------------------------------------------------
// 5. Orchestration
// ---------------------------------------------------------------------------
async function createDiagram({ topic, existingMermaid, existingSpec, theme }) {
  // Editing Mermaid output stays on the Mermaid path.
  if (existingMermaid) {
    const parsed = await callJson(MERMAID_PROMPT, userBlock(topic, existingMermaid, "existing_mermaid"), 4_000);
    return mermaidResult(parsed);
  }

  const existing = existingSpec ? JSON.stringify(existingSpec) : "";
  const plan = await callJson(PLANNER_PROMPT, userBlock(topic, existing, "existing_spec"), 6_000);

  if (plan.pattern === "mermaid" && typeof plan.mermaid === "string") {
    try { return mermaidResult(plan); } catch { /* fall through to dedicated Mermaid call */ }
  }

  let scene = null;
  try { scene = sceneResult(plan, theme); } catch (err) {
    console.warn("Scene render failed, falling back to Mermaid.", { message: err?.message });
  }
  if (scene) return scene;

  // Planner said freeform, produced an invalid spec, or layout bailed: dedicated Mermaid call.
  const parsed = await callJson(MERMAID_PROMPT, userBlock(topic, "", "existing_mermaid"), 3_000);
  return mermaidResult(parsed);
}

app.http("generate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate",

  handler: async (request) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      if (!apiKey || !endpoint || !deploymentName) {
        console.error("Missing Azure OpenAI configuration.", { requestId, hasKey: Boolean(apiKey), hasEndpoint: Boolean(endpoint), hasDeployment: Boolean(deploymentName) });
        return { status: 500, jsonBody: { error: "AI generation is not configured yet." } };
      }

      const body = await request.json();
      const topic = String(body?.topic || "").trim();
      const existingMermaid = typeof body?.existingMermaid === "string" ? body.existingMermaid.trim() : "";
      const existingSpec = body?.existingSpec && typeof body.existingSpec === "object" ? body.existingSpec : null;
      const theme = body?.theme === "light" ? "light" : "dark";

      if (!topic) return { status: 400, jsonBody: { error: "A diagram request is required." } };
      if (topic.length > MAX_PROMPT_LENGTH) {
        return { status: 400, jsonBody: { error: `Diagram requests must be ${MAX_PROMPT_LENGTH} characters or fewer.` } };
      }
      if (existingMermaid.length > MAX_MERMAID_LENGTH) {
        return { status: 400, jsonBody: { error: "The existing Mermaid diagram is too large to edit." } };
      }
      if (existingSpec && JSON.stringify(existingSpec).length > MAX_JSON_LENGTH) {
        return { status: 400, jsonBody: { error: "The existing diagram spec is too large to edit." } };
      }

      const result = await createDiagram({ topic, existingMermaid, existingSpec, theme });

      console.info("Diagram generation completed.", {
        requestId,
        kind: result.kind,
        pattern: result.pattern,
        elements: result.elements?.length,
        durationMs: Date.now() - startedAt,
      });

      return { status: 200, jsonBody: result };
    } catch (error) {
      console.error("Diagram generation failed.", { requestId, message: error?.message || String(error), durationMs: Date.now() - startedAt });
      return {
        status: 500,
        jsonBody: { error: "Unable to generate a diagram right now.", debug: error?.message || String(error) },
      };
    }
  },
});

module.exports = { PLANNER_PROMPT, sceneResult, cleanMermaid, mermaidStyles, normalizeFlowchartLabels };
