const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");

const CREATE_INSTRUCTIONS = `
You are a diagram generator for an Excalidraw-based note-taking application.

Return ONLY a valid JSON array of element skeletons. No markdown, no code fences, no explanation.

Supported element types (use only these):
- "text"          → free-form text / titles / captions
- "rectangle"     → labelled blocks
- "ellipse"       → labelled blocks
- "diamond"       → labelled decision nodes
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
     "fontSize": 20          // optional, 12–36
   }

3. Labelled blocks (rectangle / ellipse / diamond):
   {
     "id": "unique-id",
     "type": "rectangle",    // or "ellipse" / "diamond"
     "x": 60,
     "y": 140,
     "width": 160,
     "height": 70,
     "label": { "text": "Short label" }
   }

4. Arrows (must reference existing block ids):
   {
     "id": "arrow-unique-id",
     "type": "arrow",
     "x": 0,                 // can be 0
     "y": 0,                 // can be 0
     "start": { "id": "source-block-id" },
     "end":   { "id": "target-block-id" }
   }

Layout rules:
- One clear title text element near top-left (x≈40, y≈25, larger fontSize).
- 3–8 meaningful blocks with good spacing.
- Connect related blocks with directed arrows.
- Add free-form explanatory text where it helps understanding.
- Optionally add a notes rectangle on the right side.
- Keep everything inside x: 0–1200, y: 0–600.
- No overlapping elements.
- Use only simple ASCII text.
- Never invent an arrow endpoint that does not exist in the same array.
`;

const EDIT_INSTRUCTIONS = `
You are updating an existing Excalidraw diagram.

Return the COMPLETE updated JSON array (not a diff).
Keep every unchanged element exactly as-is (same id, type, position, size, label/text, arrow endpoints).
Only add, remove, or modify what the user asked for.

Rules:
- Supported types only: text, rectangle, ellipse, diamond, arrow.
- When removing a block, also remove every arrow that references it.
- When adding elements, give them unique new ids and place them in free space.
- Never invent an arrow start/end id that is not present in the returned array.
- Keep coordinates inside x:0–1200, y:0–600.
- Return ONLY the JSON array. No markdown, no explanation.
`;

const OUTPUT_RULES = `
CRITICAL OUTPUT RULES:
- Return ONLY a valid JSON array.
- Do not wrap in markdown or code fences.
- Do not add any text before or after the array.
`;

function extractJsonArray(value) {
  const cleaned = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const startIndex = cleaned.indexOf("[");
  const endIndex = cleaned.lastIndexOf("]");

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("Gemini did not return a JSON array.");
  }

  return JSON.parse(cleaned.slice(startIndex, endIndex + 1));
}

const ALLOWED_TYPES = new Set([
  "text",
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
]);

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

function validCoordinate(value, maxValue) {
  return isFiniteNumber(value) && value >= 0 && value <= maxValue;
}

function validDimension(value, maxValue) {
  return isFiniteNumber(value) && value > 0 && value <= maxValue;
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

    const id = cleanText(raw.id, 100);
    const type = raw.type;

    if (!id || !ALLOWED_TYPES.has(type) || uniqueIds.has(id)) continue;
    if (!validCoordinate(raw.x, MAX_COORDINATE_X) || !validCoordinate(raw.y, MAX_COORDINATE_Y)) {
      continue;
    }

    uniqueIds.add(id);

    if (type === "text") {
      const text = cleanText(raw.text, MAX_TEXT_LENGTH);
      if (!text) {
        uniqueIds.delete(id);
        continue;
      }
      const fontSize =
        isFiniteNumber(raw.fontSize) && raw.fontSize >= 12 && raw.fontSize <= 36
          ? raw.fontSize
          : 16;

      cleanedElements.push({ id, type, x: raw.x, y: raw.y, text, fontSize });
      continue;
    }

    if (BLOCK_TYPES.has(type)) {
      const labelText = cleanText(raw.label?.text, MAX_LABEL_LENGTH);
      if (
        !validDimension(raw.width, MAX_BLOCK_WIDTH) ||
        !validDimension(raw.height, MAX_BLOCK_HEIGHT) ||
        !labelText
      ) {
        uniqueIds.delete(id);
        continue;
      }

      cleanedElements.push({
        id,
        type,
        x: raw.x,
        y: raw.y,
        width: raw.width,
        height: raw.height,
        label: { text: labelText },
      });
      continue;
    }

    if (type === "arrow") {
      const startId = cleanText(raw.start?.id, 100);
      const endId = cleanText(raw.end?.id, 100);
      if (!startId || !endId || startId === endId) {
        uniqueIds.delete(id);
        continue;
      }

      cleanedElements.push({
        id,
        type,
        x: raw.x ?? 0,
        y: raw.y ?? 0,
        start: { id: startId },
        end: { id: endId },
      });
    }
  }

  // Second pass: only keep arrows whose endpoints actually exist
  const validBlockIds = new Set(
    cleanedElements.filter((el) => BLOCK_TYPES.has(el.type)).map((el) => el.id)
  );

  const finalElements = cleanedElements.filter((el) => {
    if (el.type !== "arrow") return true;
    return validBlockIds.has(el.start.id) && validBlockIds.has(el.end.id);
  });

  if (finalElements.length === 0) {
    throw new Error("No valid Excalidraw elements were generated.");
  }

  return finalElements;
}

app.http("generate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate",

  handler: async (request) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
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

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("Missing GEMINI_API_KEY");
        return {
          status: 500,
          jsonBody: { error: "AI generation is not configured yet." },
        };
      }

      // Prefer a stable, cheap model. Change via Azure App Setting if needed.
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
      const isEdit = existingElements.length > 0;

      console.info("Generate request started:", {
        requestId,
        model,
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

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              // Intentionally NO responseSchema – keeps it future-proof
            },
          }),
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error("Gemini request failed:", {
          requestId,
          status: geminiResponse.status,
          error: geminiData?.error,
        });

        return {
          status: 502,
          jsonBody: {
            error: "The AI provider could not generate a diagram.",
            debug: {
              geminiStatus: geminiResponse.status,
              geminiErrorStatus: geminiData?.error?.status,
              geminiMessage: geminiData?.error?.message,
              model,
            },
          },
        };
      }

      const generatedText =
        geminiData?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || "")
          .join("") || "";

      let skeleton;
      try {
        skeleton = extractJsonArray(generatedText);
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