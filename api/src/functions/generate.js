const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");

// ====================== PROMPTS ======================
const CREATE_INSTRUCTIONS = `
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
- Leave AT LEAST 60px horizontal gap and 40px vertical gap between any two blocks that aren't directly connected, so arrows between OTHER blocks have a clean path.
- Never place a block directly between two blocks that have an arrow connecting them.
- Only connect blocks that are actually adjacent in your chosen structure — don't add arrows just to use space.

Supported element types (use only these):
- "text"          → free-form text / titles / captions
- "rectangle"     → processes, actions, components
- "ellipse"       → entry points, external systems, start/end states
- "diamond"       → decisions, conditionals
- "arrow"         → directed connections between blocks

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

4. Arrows (must reference existing block ids):
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
- Every arrow MUST reference real block ids that exist in the same list.
- Prefer fewer perfect elements over many broken ones.

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
- Place it in genuinely empty space — at least 60px horizontal / 40px vertical gap from every other block, and never between two blocks that already have an arrow connecting them.
- Connect it with an arrow only if that reflects a real relationship, not just to use space.

Rules:
- Supported types only: text, rectangle, ellipse, diamond, arrow.
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
    // Fallback for a model that ignores instructions and adds stray text
    // around otherwise-valid JSON — slice out the widest bracketed span.
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

  // Accept either shape: a bare array (older providers) or the
  // { elements: [...] } object this prompt now asks for.
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

function sanitizeSkeleton(value) {
  if (!Array.isArray(value)) {
    throw new Error("Generated content must be an array.");
  }

  if (value.length < 1 || value.length > MAX_ELEMENTS) {
    throw new Error(`Diagram must have between 1 and ${MAX_ELEMENTS} elements.`);
  }

  const uniqueIds = new Set();
  const cleanedElements = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;

    let id = cleanText(raw.id, 100);
    const type = raw.type;

    if (!id || !ALLOWED_TYPES.has(type) || uniqueIds.has(id)) continue;

    let x = isFiniteNumber(raw.x) ? Math.max(0, Math.min(raw.x, MAX_COORDINATE_X)) : 40;
    let y = isFiniteNumber(raw.y) ? Math.max(0, Math.min(raw.y, MAX_COORDINATE_Y)) : 40;

    uniqueIds.add(id);

    if (type === "text") {
      const text =
        cleanText(raw.text, MAX_TEXT_LENGTH) ||
        cleanText(raw.label?.text, MAX_TEXT_LENGTH);

      if (!text) {
        uniqueIds.delete(id);
        continue;
      }

      const fontSize =
        isFiniteNumber(raw.fontSize) && raw.fontSize >= 12 && raw.fontSize <= 36
          ? Math.round(raw.fontSize)
          : 16;

      cleanedElements.push({ id, type, x, y, text, fontSize });
      continue;
    }

    if (BLOCK_TYPES.has(type)) {
      const labelText =
        cleanText(raw.label?.text, MAX_LABEL_LENGTH) ||
        cleanText(raw.text, MAX_LABEL_LENGTH) ||
        cleanText(raw.label, MAX_LABEL_LENGTH);

      if (!labelText) {
        uniqueIds.delete(id);
        continue;
      }

      let width = isFiniteNumber(raw.width) ? raw.width : 160;
      let height = isFiniteNumber(raw.height) ? raw.height : 70;

      width = Math.max(80, Math.min(width, MAX_BLOCK_WIDTH));
      height = Math.max(40, Math.min(height, MAX_BLOCK_HEIGHT));

      cleanedElements.push({
        id,
        type,
        x,
        y,
        width,
        height,
        label: { text: labelText },
      });
      continue;
    }

    if (type === "arrow") {
      const startId = cleanText(raw.start?.id, 100) || cleanText(raw.start, 100);
      const endId = cleanText(raw.end?.id, 100) || cleanText(raw.end, 100);

      if (!startId || !endId || startId === endId) {
        uniqueIds.delete(id);
        continue;
      }

      cleanedElements.push({
        id,
        type,
        x: 0,
        y: 0,
        start: { id: startId },
        end: { id: endId },
      });
    }
  }

  const validBlockIds = new Set(
    cleanedElements.filter((el) => BLOCK_TYPES.has(el.type)).map((el) => el.id)
  );

  const finalElements = cleanedElements.filter((el) => {
    if (el.type !== "arrow") return true;
    return validBlockIds.has(el.start.id) && validBlockIds.has(el.end.id);
  });

  if (finalElements.length === 0) {
    console.error("All elements rejected. Raw preview:", JSON.stringify(value).slice(0, 1200));
    throw new Error("No valid Excalidraw elements were generated.");
  }

  return finalElements;
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

      const response = await openai.responses.create({
        model: deploymentName,
        input: finalPrompt,
        max_output_tokens: 8000,
        text: { format: { type: "json_object" } },
      });

      if (response.status === "incomplete") {
        console.error("Responses API returned incomplete:", {
          requestId,
          reason: response.incomplete_details?.reason,
          outputTypes: (response.output || []).map((o) => o.type),
        });
        throw new Error(
          `The model didn't finish generating (${response.incomplete_details?.reason || "unknown reason"}). Try again.`
        );
      }

      const generatedText = response.output_text || "";

      if (!generatedText) {
        console.error("Responses API returned no text output:", {
          requestId,
          outputTypes: (response.output || []).map((o) => o.type),
        });
        throw new Error(
          "The model returned no visible text (only internal reasoning). Try again."
        );
      }

      let skeleton;
      try {
        skeleton = extractElementsArray(generatedText);
      } catch (err) {
        console.error("JSON extraction failed:", {
          requestId,
          message: err.message,
          preview: generatedText.slice(0, 800),
        });
        throw err;
      }

      skeleton = sanitizeSkeleton(skeleton);

      console.info("Generate request completed:", {
        requestId,
        elementCount: skeleton.length,
        durationMs: Date.now() - startedAt,
      });

      return { status: 200, jsonBody: skeleton };
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