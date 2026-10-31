const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");
const { specToOperations, buildPatternInstructions, validatePatternSpec, slug } = require("./layout-patterns");
const { irToElements, TONE_NAMES, THEMES } = require("./excalidraw-render");

const MAX_PROMPT_LENGTH = 8_000; // Character cap; UI and API enforce the same limit.
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
- First infer the user's intended deliverable from the wording: architecture/technical diagram, conceptual explanation,
  process flow, comparison, timeline, network/layer illustration, UI wireframe, or content-rich visual document.
  Select a general visual grammar based on the information structure, not a hardcoded topic-to-template mapping.
- Treat the user's request length as independent from the required output quality. A request under 10 words can still
  express a complete intent. Do not ask for clarification merely because it is short. Infer sensible scope and defaults:
  a bare topic usually means a useful conceptual overview; "architecture" or "workflow" means a system/process diagram;
  "compare" means a comparison; "write/create an article" means an organised explanatory visual document.
- For underspecified requests, make conservative, conventional assumptions and keep the result focused. Do not invent
  proprietary implementation details, numerical claims, named services, or domain-specific facts not supported by the
  request or reliable general knowledge. Prefer a clear representative model over an exhaustive catalogue.
- For article, guide, tutorial, or broad explanatory requests, do not force everything into one flowchart. Organise the
  canvas into a small number of meaningful sections/regions, give each section a clear purpose, and use concise cards,
  diagrams, comparisons, sequences, or callouts where each best explains the content. Keep each card focused on one idea.
  Use short headings and concise explanatory text; move detail into notes instead of overcrowding node labels.
- For long requests, preserve explicit requirements and named entities. Prioritise the user's requested scope over
  generic defaults. Structure the content before drawing it: identify the central idea, major sections, dependencies,
  examples, caveats, and conclusion where relevant. Avoid repeating the same explanation in multiple cards.
- For explicit comparisons, prefer pattern "comparison" for two alternatives or "cards" for three or more; align like-for-like attributes, use concise text boxes, and do not add arrows unless they express a real relationship. For concept explanations, summaries, pros/cons, or key points, prefer "cards" rather than Mermaid.
- Choose a visual representation that matches the semantics: sequence for ordered steps, layers-net for neural layers,
  comparison for alternatives, tree for hierarchy, hub for central relationships, cycle for feedback loops, and composite
  for multiple related subsystems or mixed section types. These are reusable grammars, not topic-specific templates.
- Establish a readable global composition: strong title/subtitle, meaningful section hierarchy, consistent reading
  direction, related material close together, and enough separation between independent regions. Avoid long crossing
  relationships when a local grouping or clearer region placement can express the same meaning.
- Every edge must communicate a real relationship. Use direction consistently; label only relationships that benefit
  from a short label. Do not add decorative arrows or connect nodes merely because they appear next to each other.
- Every node may carry an optional "tone" from: ${TONE_NAMES.join("|")}. Use tone for meaning, never decoration:
  accent = the focal/primary component, danger = risky/critical/hardware/failure, warn = decision/caution,
  info/violet/success = distinct layers or stages, muted = external/optional, default = everything else.
  Use semantic tones wherever they clarify meaning. Keep equivalent roles consistent; do not impose an arbitrary tone-count limit.
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
You are the semantic diagram author for an Excalidraw workspace. Produce a diagram that explains the user's intent,
not merely a syntactically valid collection of nodes.

INTENT AND SCOPE
- Infer the likely deliverable even when the request is fewer than 10 words. Do not ask for clarification just because
  the request is short. A bare topic usually calls for a focused conceptual overview; architecture/workflow requests
  call for components and relationships; comparison requests call for comparable alternatives; ordered procedures
  call for a sequence. Use conservative defaults and avoid unsupported specifics.
- For long requests, preserve explicit scope and constraints. Do not drop requested mechanisms to make the diagram smaller.
- Choose by semantics: flowchart TD/LR, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram. Use the simplest
  diagram type that faithfully represents the information. Do not use C4, mindmap, gantt, timeline, gitGraph,
  quadrant, sankey or architecture-beta.

READABILITY
- Give the diagram one clear reading direction and a specific title/purpose where the syntax supports it.
- Group only genuinely related components into subgraphs; use concise, meaningful group labels.
- Keep related nodes near each other by expressing coherent local flows. Avoid unnecessary long cross-region edges.
- Every arrow must represent a real data, control, dependency, sequence, or feedback relationship. Do not add decorative
  edges. Use direction consistently and label only important transfers with short labels.
- Avoid duplicate nodes, redundant edges, unexplained abbreviations, oversized labels, and excessive detail.
- When a topic has distinct phases (for example, preparation and runtime), separate those phases clearly and connect
  them with only the necessary cross-phase relationships.
- For neural networks, show layer boundaries and meaningful connectivity; dense connectivity is intentional when the
  architecture requires it. For comparisons, make the alternatives structurally comparable.

SYNTAX AND SAFETY
- One diagram declaration; flowchart labels always quoted like A["Label"]; ASCII ids; no raw HTML, fences, click,
  init, class or style directives. Never include executable or embedded content.
- For edits, the supplied Mermaid is the source of truth; preserve unaffected structure and IDs.
- Also return "tones": a map of node id -> one of ${TONE_NAMES.join("|")} based on semantic meaning. Use consistent
  tones for equivalent roles; do not impose an arbitrary tone-count limit.
Output exactly: {"mermaid":"...","tones":{"id":"tone"}}
`.trim();

// Non-Mermaid fallback for requests best expressed as text cards.
const CARDS_PROMPT = `
You are a visual-content planner for an Excalidraw canvas. Return a concise, useful visual composition as JSON.
Use the reusable cards grammar for information that is explanatory, comparative, descriptive, or non-sequential.
Do not turn a comparison, list of concepts, article section, or set of key points into a flowchart.
For comparisons, use pattern "comparison" with exactly two groups and align equivalent attributes by row.
For concept summaries, pros/cons, multi-option comparisons, or key-point collections, use pattern "cards" with 1-3 columns.
Each card is one text box: use a short heading followed by a compact explanation or a few concise points in its label.
Use notes for selection guidance, caveats, or a small supporting explanation. Keep edges empty unless a real relationship is essential.
Use no topic-specific templates. Infer the visual grammar from the request's intent and information structure.
A short prompt is valid; infer a focused, conventional scope without asking for more words.
Return exactly one JSON object with pattern, title, subtitle, columns (for cards), groups (for comparison), nodes, edges, and optional notes.
Node shape: {"id":"stable-id","label":"Heading\nConcise explanation","role":"primary|secondary|supporting|hero"}.
Comparison groups shape: [{"id":"a","label":"Option A","nodes":[...]},{"id":"b","label":"Option B","nodes":[...]}].
Do not invent precise metrics or unsupported factual claims. Return JSON only.
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
    "The user request may be very short or long. Infer intent from the words they chose; do not demand a minimum word count. Preserve explicit requirements, use sensible defaults for missing details, and do not silently truncate the request.",
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

// Derive semantic roles from node labels when the planner does not provide
// an explicit tone. The renderer remains the sole owner of actual colours.
function inferSemanticTone(label) {
  const value = String(label || "").toLowerCase();
  if (/error|fail|exception|invalid|denied|critical|attack|threat/.test(value)) return "danger";
  if (/decision|condition|branch|check|validate|approval|warning|risk/.test(value)) return "warn";
  if (/database|storage|cache|repository|warehouse|persist|vector store/.test(value)) return "violet";
  if (/success|complete|response|output|result|healthy|approved/.test(value)) return "success";
  if (/external|third.party|vendor|optional|legacy|internet/.test(value)) return "muted";
  if (/input|source|client|user|request|event|sensor/.test(value)) return "info";
  if (/process|service|worker|compute|model|transform|controller|engine/.test(value)) return "accent";
  return "default";
}

function mermaidStyles(mermaid, tones) {
  const explicit = tones && typeof tones === "object" ? tones : {};
  const labels = new Map();
  for (const m of mermaid.matchAll(/([A-Za-z][A-Za-z0-9_-]*)\s*[\[\(\{]+"?([^"\]\)\}\r\n]+)"?[\]\)\}]+/g)) {
    labels.set(m[1], m[2]);
  }
  return [...labels.entries()].map(([id, label]) => ({
    id,
    label,
    tone: TONE_NAMES.includes(explicit[id]) ? explicit[id] : inferSemanticTone(label),
  }));
}

function mermaidResult(parsed, themeName = "dark") {
  const mermaid = cleanMermaid(parsed.mermaid);
  const theme = THEMES[themeName] || THEMES.dark;
  return {
    kind: "mermaid",
    mermaid,
    styles: mermaidStyles(mermaid, parsed.tones),
    // Renderer-owned tokens keep client-side Mermaid styling in sync with IR.
    themeTones: theme.tones,
    themeEdges: { edge: theme.edge, text: theme.text },
  };
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
async function createDiagram({ operation = "create", topic, existingMermaid, existingSpec, theme }) {
  // Creation is always independent. Existing canvas/source data is only
  // considered when the caller explicitly requests an edit.
  if (operation === "create") {
    existingMermaid = "";
    existingSpec = null;
  }

  if (operation === "edit" && !existingMermaid && !existingSpec) {
    throw new Error("Editing requires the source of the selected diagram.");
  }

  // Editing Mermaid output stays on the Mermaid path. Create requests never
  // reach this branch because their existing source was cleared above.
  if (operation === "edit" && existingMermaid) {
    const parsed = await callJson(
      MERMAID_PROMPT,
      userBlock(topic, existingMermaid, "existing_mermaid"),
      4_000,
    );
    return mermaidResult(parsed, theme);
  }

  const existing = existingSpec ? JSON.stringify(existingSpec) : "";
  const plan = await callJson(PLANNER_PROMPT, userBlock(topic, existing, "existing_spec"), 6_000);

  if (plan.pattern === "mermaid" && typeof plan.mermaid === "string") {
    try { return mermaidResult(plan, theme); } catch { /* fall through to dedicated Mermaid call */ }
  }

  let scene = null;
  try { scene = sceneResult(plan, theme); } catch (err) {
    console.warn("Scene render failed, falling back to Mermaid.", { message: err?.message });
  }
  if (scene) return scene;

  // If the planner cannot select a specialised grammar, fall back to a text-card
  // composition. Mermaid is used only when the planner explicitly selects it.
  const cardPlan = await callJson(CARDS_PROMPT, userBlock(topic, "", "existing_spec"), 4_000);
  const cards = sceneResult(cardPlan, theme);
  if (cards) return cards;
  throw new Error("The planner could not produce a valid visual composition. Try a more specific request.");
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

      const operation = body?.operation === "edit" ? "edit" : "create";
      const result = await createDiagram({ operation, topic, existingMermaid, existingSpec, theme });

      console.info("Diagram generation completed.", {
        requestId,
        operation,
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

module.exports = { PLANNER_PROMPT, MERMAID_PROMPT, CARDS_PROMPT, MAX_PROMPT_LENGTH, sceneResult, cleanMermaid, mermaidStyles, normalizeFlowchartLabels };
