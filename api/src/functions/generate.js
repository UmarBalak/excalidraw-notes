const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");

// ====================== PROMPTS ======================
const CREATE_INSTRUCTIONS = `
HARD REQUIREMENT: If you create N labelled blocks (rectangle/ellipse/diamond), you MUST also create at least N-1 arrow elements connecting them. A diagram with blocks but no arrows is INVALID and will be discarded. Arrows are not optional decoration — they are as important as the blocks themselves.

You are a diagram generator for an Excalidraw-based note-taking application. Your goal is a diagram that ARGUES the topic's structure visually, not one that just labels generic boxes.

STEP 1 — BE SPECIFIC, NOT GENERIC
Use real terminology from the topic itself in every label — actual component names, actual step names, actual relationships. Never use placeholder labels like "Input", "Process", "Output", "Component A/B/C", or "Step 1/2/3" unless those are literally the real names of things in this topic. A diagram of "Uber's business model" should name Rider, Driver, Payment System — not "User", "System", "Backend".

STEP 2 — CHOOSE A STRUCTURE THAT MATCHES THE TOPIC
Pick ONE of these based on how the topic's pieces actually relate — don't default to a generic left-to-right row every time:
- Sequence: steps happen in order (arrows chain left→right or top→bottom)
- Fan-out: one thing leads to several others (arrows radiate from one central node)
- Convergence: several things feed into one outcome (arrows merge toward one node)
- Comparison: two parallel structures shown side by side to contrast them
- Cycle: a loop that returns to its start (arrows form a closed loop)
- Hub: a central node connected to several others, no strong direction implied

STEP 3 — LAYOUT DISCIPLINE (this is what stops arrows crossing through boxes)
- Arrange blocks on a clear grid: pick 2-3 x-ranges (columns) and 1-3 y-ranges (rows). Place every block at the start of a column/row band, not at an arbitrary offset.
- Leave AT LEAST 60px horizontal gap and 40px vertical gap between any two blocks that aren't directly connected.
- Never place a block directly between two blocks that have an arrow connecting them.

Supported element types (use only these):
- "text"          → free-form text / titles / captions
- "rectangle"     → processes, actions, components
- "ellipse"       → entry points, external systems, start/end states
- "diamond"       → decisions, conditionals
- "arrow"         → directed connections between blocks — REQUIRED, see hard requirement above

Exact shape rules:

1. Every element MUST have:
   - "id": unique string
   - "type": one of the types above
   - "x": number
   - "y": number

2. Free-form text:
   {
     "id": "unique-id",
     "type": "text",
     "x": 40,
     "y": 25,
     "text": "Your text here",
     "fontSize": 20
   }

3. Labelled blocks (rectangle / ellipse / diamond) — size by importance, not uniformly:
   - Hero (the single most important block): width 220-260, height 100-120
   - Primary (main blocks): width 160-180, height 70-90
   - Secondary (supporting blocks): width 120-140, height 50-70
   {
     "id": "unique-id",
     "type": "rectangle",
     "x": 60,
     "y": 140,
     "width": 160,
     "height": 70,
     "label": { "text": "Short, specific label" }
   }

4. Arrows — use exactly this shape, with "start" and "end" as objects containing "id" (must reference existing block ids):
   {
     "id": "arrow-unique-id",
     "type": "arrow",
     "x": 0,
     "y": 0,
     "start": { "id": "source-block-id" },
     "end":   { "id": "target-block-id" }
   }

VERY IMPORTANT:
- For every rectangle / ellipse / diamond you MUST use "label": { "text": "Short label" }
- Free-form text elements use top-level "text".
- Every arrow MUST reference real block ids that exist in the same list, using the exact "start": { "id": "..." } / "end": { "id": "..." } shape shown above.
- Prefer fewer perfect elements over many broken ones — but never fewer arrows than blocks minus one.

Layout rules:
- One clear title text element near top-left (x≈40, y≈25, larger fontSize).
- 3–8 meaningful blocks with good spacing, following the grid and gap rules above.
- Connect related blocks with directed arrows that match your chosen structure from Step 2.
- Add free-form explanatory text where it helps.
- Optionally add a notes rectangle on the right side, with 2-4 SPECIFIC facts about this exact topic — not generic filler.
- Keep everything inside x: 0–1200, y: 0–600.
- No overlapping elements.
- Use only simple ASCII text.

Example valid output:
{
  "elements": [
    { "id": "title", "type": "text", "x": 40, "y": 25, "text": "System flow", "fontSize": 28 },
    { "id": "input", "type": "ellipse", "x": 60, "y": 150, "width": 160, "height": 70, "label": { "text": "Input" } },
    { "id": "decision", "type": "diamond", "x": 300, "y": 150, "width": 160, "height": 90, "label": { "text": "Validate?" } },
    { "id": "output", "type": "ellipse", "x": 550, "y": 150, "width": 160, "height": 70, "label": { "text": "Output" } },
    { "id": "input-to-decision", "type": "arrow", "x": 0, "y": 0, "start": { "id": "input" }, "end": { "id": "decision" } },
    { "id": "decision-to-output", "type": "arrow", "x": 0, "y": 0, "start": { "id": "decision" }, "end": { "id": "output" } },
    { "id": "caption", "type": "text", "x": 60, "y": 270, "text": "The request is validated before processing.", "fontSize": 16 },
    { "id": "notes", "type": "rectangle", "x": 760, "y": 80, "width": 380, "height": 430, "label": { "text": "KEY NOTES\\n\\n- Important concept\\n- Main dependency\\n- Expected result" } }
  ]
}
`;

const EDIT_INSTRUCTIONS = `
You are updating an existing Excalidraw diagram.

Return the COMPLETE updated element list (not a diff), in the required object shape.
Keep every unchanged element exactly as-is — same id, position, size, label.
Only add, remove, or modify what the user asked for.

When adding a new block:
- Use a SPECIFIC label tied to this exact topic, never a generic placeholder.
- Place it in genuinely empty space — at least 60px horizontal / 40px vertical gap from every other block.
- Connect it with an arrow if that reflects a real relationship — new unconnected blocks should be rare.

Rules:
- Supported types only: text, rectangle, ellipse, diamond, arrow.
- Arrows use "start": { "id": "..." } and "end": { "id": "..." }.
- When removing a block, also remove every arrow that references it.
- When adding elements, give them unique new ids.
- Never invent an arrow start/end id that is not present.
- Keep coordinates inside x:0–1200, y:0–600.

VERY IMPORTANT:
- Blocks must use "label": { "text": "..." }
- Free-form text uses top-level "text"
`;

const OUTPUT_RULES = `
CRITICAL OUTPUT RULES:
- Return ONLY a valid JSON object of this exact shape: { "elements": [ ... ] }
- The "elements" value is the array of element skeletons described below.
- Do not return a bare array as the top-level response — it must be wrapped in an object with an "elements" key.
- Do not add any other top-level keys.
- Do not wrap in markdown or code fences.
- Do not add any text before or after the JSON object.
`;

const ARROW_ONLY_INSTRUCTIONS = `
These blocks already exist on an Excalidraw canvas. Your ONLY job is to connect them with arrows based on their real relationships — do not create, rename, or describe the blocks themselves.

Return ONLY a JSON object of this shape: { "elements": [ ... ] }
Every item must be an arrow, using exactly this shape:
{ "id": "unique-arrow-id", "type": "arrow", "x": 0, "y": 0, "start": { "id": "<one of the given block ids>" }, "end": { "id": "<one of the given block ids>" } }

- "start" and "end" ids MUST come from the block id list given to you — never invent an id.
- Create at least (number of blocks - 1) arrows connecting them meaningfully.
- Do not return any element type other than "arrow".
- Do not add markdown, code fences, or explanation.
`;

// ====================== SANITIZER ======================
function extractElementsArray(value) {
  const cleaned = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");

    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    } else if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    } else {
      throw new Error("Model did not return valid JSON.");
    }
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.elements)) {
    return parsed.elements;
  }

  throw new Error(
    'Model returned JSON, but not an array or an object with an "elements" array.'
  );
}

const ALLOWED_TYPES = new Set(["text", "rectangle", "ellipse", "diamond", "arrow"]);
const BLOCK_TYPES = new Set(["rectangle", "ellipse", "diamond"]);
const MAX_ELEMENTS = 40;
const MAX_TEXT_LENGTH = 1200;
const MAX_LABEL_LENGTH = 200;
const MAX_COORDINATE_X = 1200;
const MAX_COORDINATE_Y = 600;
const MAX_BLOCK_WIDTH = 600;
const MAX_BLOCK_HEIGHT = 500;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[^\x20-\x7E\n\r\t]/g, "").trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function extractEndpointId(value) {
  if (value && typeof value === "object") {
    return cleanText(value.id, 100);
  }
  return cleanText(value, 100);
}

// Picks the point on `from`'s boundary closest to `to`'s center — used to
// give arrows a real start/end point instead of leaving them at (0,0) and
// hoping Excalidraw's own binding-based auto-routing figures it out.
function edgePoint(from, to) {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;
  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? from.x + from.width : from.x,
      y: fromCenterY,
    };
  }

  return {
    x: fromCenterX,
    y: dy >= 0 ? from.y + from.height : from.y,
  };
}

function sanitizeSkeleton(value, { knownBlocks = new Map(), requestId = "" } = {}) {
  if (!Array.isArray(value)) {
    throw new Error("Generated content must be an array.");
  }

  if (value.length < 1 || value.length > MAX_ELEMENTS) {
    throw new Error(`Diagram must have between 1 and ${MAX_ELEMENTS} elements.`);
  }

  const uniqueIds = new Set();
  const cleanedElements = [];
  const arrowCandidates = [];
  const arrowRejectionReasons = [];
  let rawArrowAttempts = 0;

  // PASS 1 — clean text/blocks fully, validate arrow endpoint ids but defer
  // their geometry until every block's real position is known.
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;

    const id = cleanText(raw.id, 100);
    const type = raw.type;

    if (!id || !ALLOWED_TYPES.has(type) || uniqueIds.has(id)) continue;

    if (type === "text") {
      const x = isFiniteNumber(raw.x) ? Math.max(0, Math.min(raw.x, MAX_COORDINATE_X)) : 40;
      const y = isFiniteNumber(raw.y) ? Math.max(0, Math.min(raw.y, MAX_COORDINATE_Y)) : 40;

      const text =
        cleanText(raw.text, MAX_TEXT_LENGTH) ||
        cleanText(raw.label?.text, MAX_TEXT_LENGTH);

      if (!text) continue;

      const fontSize =
        isFiniteNumber(raw.fontSize) && raw.fontSize >= 12 && raw.fontSize <= 36
          ? Math.round(raw.fontSize)
          : 16;

      uniqueIds.add(id);
      cleanedElements.push({ id, type, x, y, text, fontSize });
      continue;
    }

    if (BLOCK_TYPES.has(type)) {
      const x = isFiniteNumber(raw.x) ? Math.max(0, Math.min(raw.x, MAX_COORDINATE_X)) : 40;
      const y = isFiniteNumber(raw.y) ? Math.max(0, Math.min(raw.y, MAX_COORDINATE_Y)) : 40;

      const labelText =
        cleanText(raw.label?.text, MAX_LABEL_LENGTH) ||
        cleanText(raw.text, MAX_LABEL_LENGTH) ||
        cleanText(raw.label, MAX_LABEL_LENGTH);

      if (!labelText) continue;

      let width = isFiniteNumber(raw.width) ? raw.width : 160;
      let height = isFiniteNumber(raw.height) ? raw.height : 70;
      width = Math.max(80, Math.min(width, MAX_BLOCK_WIDTH));
      height = Math.max(40, Math.min(height, MAX_BLOCK_HEIGHT));

      uniqueIds.add(id);
      cleanedElements.push({ id, type, x, y, width, height, label: { text: labelText } });
      continue;
    }

    if (type === "arrow") {
      rawArrowAttempts += 1;

      const startId = extractEndpointId(raw.start ?? raw.from ?? raw.source ?? raw.startId);
      const endId = extractEndpointId(raw.end ?? raw.to ?? raw.target ?? raw.endId);

      if (!startId || !endId) {
        arrowRejectionReasons.push({ id, reason: "missing start or end id" });
        continue;
      }
      if (startId === endId) {
        arrowRejectionReasons.push({ id, reason: "start equals end" });
        continue;
      }

      uniqueIds.add(id);
      arrowCandidates.push({ id, startId, endId });
    }
  }

  // PASS 2 — now that every block's real position is known, compute actual
  // edge-to-edge geometry for each arrow instead of leaving it at (0,0).
  const blockById = new Map();
  for (const el of cleanedElements) {
    if (BLOCK_TYPES.has(el.type)) blockById.set(el.id, el);
  }
  for (const [blockId, block] of knownBlocks) {
    if (!blockById.has(blockId)) blockById.set(blockId, block);
  }

  const arrows = [];
  for (const candidate of arrowCandidates) {
    const startBlock = blockById.get(candidate.startId);
    const endBlock = blockById.get(candidate.endId);

    if (!startBlock || !endBlock) {
      arrowRejectionReasons.push({
        id: candidate.id,
        reason: "start/end id does not match any known block",
        startId: candidate.startId,
        endId: candidate.endId,
      });
      continue;
    }

    const startPoint = edgePoint(startBlock, endBlock);
    const endPoint = edgePoint(endBlock, startBlock);

    arrows.push({
      id: candidate.id,
      type: "arrow",
      x: startPoint.x,
      y: startPoint.y,
      points: [
        [0, 0],
        [endPoint.x - startPoint.x, endPoint.y - startPoint.y],
      ],
      start: { id: candidate.startId },
      end: { id: candidate.endId },
    });
  }

  const finalElements = [...cleanedElements, ...arrows];
  const blockCount = cleanedElements.filter((el) => BLOCK_TYPES.has(el.type)).length;
  const arrowCount = arrows.length;

  console.info("Sanitize summary:", {
    requestId,
    rawElementCount: value.length,
    rawArrowAttempts,
    keptArrowCount: arrowCount,
    keptBlockCount: blockCount,
    arrowRejectionReasons: arrowRejectionReasons.slice(0, 10),
  });

  if (finalElements.length === 0) {
    console.error("All elements rejected. Raw preview:", JSON.stringify(value).slice(0, 1200));
    throw new Error("No valid Excalidraw elements were generated.");
  }

  return { elements: finalElements, blockCount, arrowCount };
}

// ====================== OPENAI CLIENT (Foundry v1 surface) ======================
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;

if (endpoint && !endpoint.includes("/openai/v1")) {
  console.warn(
    "AZURE_OPENAI_ENDPOINT does not contain '/openai/v1' — copy the exact base_url from Foundry's 'View code' sample for this deployment."
  );
}

const openai = new OpenAI({
  baseURL: endpoint,
  apiKey: apiKey,
});

async function callModel(promptText, maxOutputTokens) {
  const response = await openai.responses.create({
    model: deploymentName,
    input: promptText,
    max_output_tokens: maxOutputTokens,
    text: { format: { type: "json_object" } },
  });

  if (response.status === "incomplete") {
    throw new Error(
      `The model didn't finish generating (${response.incomplete_details?.reason || "unknown reason"}).`
    );
  }

  const text = response.output_text || "";

  if (!text) {
    throw new Error("The model returned no visible text (only internal reasoning).");
  }

  return text;
}

// One focused follow-up call used only when a create-mode generation comes
// back with blocks but no arrows.
async function requestArrowsForBlocks(elements, requestId) {
  const blockSummaries = elements
    .filter((el) => BLOCK_TYPES.has(el.type))
    .map((el) => ({ id: el.id, label: el.label?.text }));

  const prompt = [
    ARROW_ONLY_INSTRUCTIONS,
    `Blocks:\n${JSON.stringify(blockSummaries)}`,
  ].join("\n\n");

  const text = await callModel(prompt, 2000);
  const rawArrows = extractElementsArray(text);

  const knownBlocks = new Map(
    elements.filter((el) => BLOCK_TYPES.has(el.type)).map((el) => [el.id, el])
  );

  const { elements: arrowsOnly } = sanitizeSkeleton(rawArrows, { knownBlocks, requestId });
  return arrowsOnly.filter((el) => el.type === "arrow");
}

// ====================== AZURE FUNCTION ======================
app.http("generate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate",

  handler: async (request) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      if (!apiKey || !endpoint || !deploymentName) {
        console.error("Missing Azure OpenAI configuration:", {
          hasKey: !!apiKey,
          hasEndpoint: !!endpoint,
          hasDeployment: !!deploymentName,
        });
        return {
          status: 500,
          jsonBody: { error: "AI generation is not configured yet." },
        };
      }

      const body = await request.json();
      const topic = String(body?.topic || "").trim();
      const existingElements = Array.isArray(body?.existingElements)
        ? body.existingElements
        : [];

      if (!topic) {
        return { status: 400, jsonBody: { error: "Topic is required." } };
      }
      if (topic.length > 180) {
        return {
          status: 400,
          jsonBody: { error: "Topic must be 180 characters or fewer." },
        };
      }

      const isEdit = existingElements.length > 0;

      console.info("Generate request started:", {
        requestId,
        model: deploymentName,
        mode: isEdit ? "edit" : "create",
        topicLength: topic.length,
        existingCount: existingElements.length,
      });

      const promptParts = [OUTPUT_RULES];

      if (isEdit) {
        promptParts.push(EDIT_INSTRUCTIONS);
        promptParts.push(`Current scene:\n${JSON.stringify(existingElements)}`);
        promptParts.push(`Edit instruction: ${topic}`);
      } else {
        promptParts.push(CREATE_INSTRUCTIONS);
        promptParts.push(`Requested topic: ${topic}`);
      }

      const finalPrompt = promptParts.join("\n\n");
      const generatedText = await callModel(finalPrompt, 8000);

      let rawSkeleton;
      try {
        rawSkeleton = extractElementsArray(generatedText);
      } catch (err) {
        console.error("JSON extraction failed:", {
          requestId,
          message: err.message,
          preview: generatedText.slice(0, 800),
        });
        throw err;
      }

      let { elements, blockCount, arrowCount } = sanitizeSkeleton(rawSkeleton, { requestId });

      if (!isEdit && blockCount >= 2 && arrowCount === 0) {
        console.warn("No arrows in initial generation — requesting a connection pass.", {
          requestId,
          blockCount,
        });

        try {
          const arrows = await requestArrowsForBlocks(elements, requestId);
          elements = [...elements, ...arrows];
          console.info("Connection pass added arrows:", { requestId, arrowsAdded: arrows.length });
        } catch (retryError) {
          console.error("Connection pass failed, returning blocks without arrows:", {
            requestId,
            message: retryError.message,
          });
        }
      }

      console.info("Generate request completed:", {
        requestId,
        elementCount: elements.length,
        durationMs: Date.now() - startedAt,
      });

      return { status: 200, jsonBody: elements };
    } catch (error) {
      console.error("Generate function error:", {
        requestId,
        message: error?.message,
        durationMs: Date.now() - startedAt,
      });

      return {
        status: 500,
        jsonBody: {
          error: "Unable to generate a diagram right now.",
          debug: error?.message || String(error),
        },
      };
    }
  },
});