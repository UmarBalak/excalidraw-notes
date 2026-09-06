const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");

const CREATE_INSTRUCTIONS = `
Create a complete Excalidraw diagram for the requested topic.

Return a useful mix of these element skeletons when the topic needs them:
- "text" for titles, captions, explanations, and free-form text.
- "rectangle", "ellipse", or "diamond" for labelled blocks or nodes.
- "arrow" for all relationships between blocks.

Every array item must follow this JSON shape:
{
  "id": "unique-stable-id",
  "type": "text | rectangle | ellipse | diamond | arrow | line",
  "x": 100,
  "y": 100,
  "width": 160,
  "height": 70
}

Element rules:
1. Every item requires a unique string "id" and a valid "type".
2. Position and size values must be numbers. Use positive width and height for blocks.
3. A standalone text item uses "text": "short text" and may use "fontSize": 16.
4. A labelled block uses "label": { "text": "short label" }. Do not put a label in "text".
5. An arrow uses "start": { "id": "existing-block-id" } and "end": { "id": "existing-block-id" }.
6. Arrow and line IDs must be unique. Never reference an ID that is not in the same array.
7. Use simple ASCII text, short labels, and explicit directed arrows.

Layout rules:
- Add one title text item near x:40, y:25.
- Create 3 to 8 meaningful blocks arranged with clear spacing.
- Connect related blocks with arrows in the correct direction.
- Add free-form explanatory text when it improves understanding.
- Add a notes rectangle on the right when the topic benefits from key details.
- Keep all coordinates within x:0..1200 and y:0..600.
- Do not overlap blocks, labels, or arrows unnecessarily.

Example valid output:
[
  { "id": "title", "type": "text", "x": 40, "y": 25, "text": "System flow", "fontSize": 28 },
  { "id": "input", "type": "rectangle", "x": 60, "y": 150, "width": 160, "height": 70, "label": { "text": "Input" } },
  { "id": "decision", "type": "diamond", "x": 300, "y": 150, "width": 160, "height": 90, "label": { "text": "Validate?" } },
  { "id": "output", "type": "ellipse", "x": 550, "y": 150, "width": 160, "height": 70, "label": { "text": "Output" } },
  { "id": "input-to-decision", "type": "arrow", "start": { "id": "input" }, "end": { "id": "decision" } },
  { "id": "decision-to-output", "type": "arrow", "start": { "id": "decision" }, "end": { "id": "output" } },
  { "id": "caption", "type": "text", "x": 60, "y": 270, "text": "The request is validated before processing.", "fontSize": 16 },
  { "id": "notes", "type": "rectangle", "x": 760, "y": 80, "width": 380, "height": 430, "label": { "text": "KEY NOTES\\n\\n- Important concept\\n- Main dependency\\n- Expected result" } }
]
`;

const EDIT_INSTRUCTIONS = `
Update the CURRENT scene according to the EDIT INSTRUCTION.

The input scene and output must use this Excalidraw skeleton contract:
- Every item has a unique string "id" and a valid "type".
- Supported types are "text", "rectangle", "ellipse", "diamond", and "arrow". Do not use "line", "freedraw", "image", "frame", or any other type.
- Standalone text uses "text". Labelled blocks use "label": { "text": "..." }.
- Arrows use "start": { "id": "..." } and "end": { "id": "..." }.

Editing rules:
1. Return the COMPLETE updated JSON array, including every element that should remain.
2. Preserve unchanged IDs, types, positions, sizes, labels, text, and arrow endpoints exactly.
3. Only add, remove, or modify what the instruction requests.
4. When removing a block, also remove every arrow whose start or end references it.
5. When adding an item, create a unique ID, place it in free space, and connect it with arrows when appropriate.
6. When changing a label or free-form text, preserve its ID, type, position, and size.
7. Never invent an arrow endpoint ID. Every arrow endpoint must reference an item in the returned array.
8. Keep coordinates within x:0..1200 and y:0..600 and avoid new overlaps.
9. Return only the JSON array. Do not return an explanation, markdown, or code fence.
`;

const OUTPUT_RULES = `
Return ONLY a valid JSON array.
Do not include markdown.
Do not include triple backticks.
Do not explain the response.
Do not include any text outside the JSON array.
The array must contain Excalidraw element skeletons compatible with convertToExcalidrawElements(...).
`;

const RESPONSE_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: 30,
  items: {
    type: "object",
    properties: {
      id: {
        type: "string"
      },
      type: {
        type: "string",
        enum: ["text", "rectangle", "ellipse", "diamond", "arrow"]
      },
      x: {
        type: "number"
      },
      y: {
        type: "number"
      },
      width: {
        type: "number"
      },
      height: {
        type: "number"
      },
      text: {
        type: "string"
      },
      fontSize: {
        type: "number"
      },
      label: {
        type: "object",
        properties: {
          text: {
            type: "string"
          }
        },
        required: ["text"]
      },
      start: {
        type: "object",
        properties: {
          id: {
            type: "string"
          }
        },
        required: ["id"]
      },
      end: {
        type: "object",
        properties: {
          id: {
            type: "string"
          }
        },
        required: ["id"]
      }
    },
    required: ["id", "type", "x", "y"]
  }
};

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
  "arrow"
]);

const BLOCK_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond"
]);

const MAX_ELEMENTS = 30;
const MAX_TEXT_LENGTH = 1200;
const MAX_LABEL_LENGTH = 180;
const MAX_COORDINATE_X = 1200;
const MAX_COORDINATE_Y = 600;
const MAX_BLOCK_WIDTH = 600;
const MAX_BLOCK_HEIGHT = 500;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .trim();

  if (!text || text.length > maxLength) {
    return null;
  }

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
    throw new Error(
      `Generated diagram must have between 1 and ${MAX_ELEMENTS} elements.`
    );
  }

  const uniqueIds = new Set();
  const cleanedElements = [];

  for (const rawElement of value) {
    if (!rawElement || typeof rawElement !== "object") {
      continue;
    }

    const id = cleanText(rawElement.id, 100);
    const type = rawElement.type;

    if (!id || !ALLOWED_TYPES.has(type) || uniqueIds.has(id)) {
      continue;
    }

    if (
      !validCoordinate(rawElement.x, MAX_COORDINATE_X) ||
      !validCoordinate(rawElement.y, MAX_COORDINATE_Y)
    ) {
      continue;
    }

    uniqueIds.add(id);

    if (type === "text") {
      const text = cleanText(rawElement.text, MAX_TEXT_LENGTH);

      if (!text) {
        uniqueIds.delete(id);
        continue;
      }

      const fontSize =
        isFiniteNumber(rawElement.fontSize) &&
        rawElement.fontSize >= 10 &&
        rawElement.fontSize <= 48
          ? rawElement.fontSize
          : 16;

      cleanedElements.push({
        id,
        type,
        x: rawElement.x,
        y: rawElement.y,
        text,
        fontSize
      });

      continue;
    }

    if (BLOCK_TYPES.has(type)) {
      const labelText = cleanText(
        rawElement.label?.text,
        MAX_LABEL_LENGTH
      );

      if (
        !validDimension(rawElement.width, MAX_BLOCK_WIDTH) ||
        !validDimension(rawElement.height, MAX_BLOCK_HEIGHT) ||
        !labelText
      ) {
        uniqueIds.delete(id);
        continue;
      }

      cleanedElements.push({
        id,
        type,
        x: rawElement.x,
        y: rawElement.y,
        width: rawElement.width,
        height: rawElement.height,
        label: {
          text: labelText
        }
      });

      continue;
    }

    if (type === "arrow") {
      const startId = cleanText(rawElement.start?.id, 100);
      const endId = cleanText(rawElement.end?.id, 100);

      if (!startId || !endId || startId === endId) {
        uniqueIds.delete(id);
        continue;
      }

      cleanedElements.push({
        id,
        type,
        x: rawElement.x,
        y: rawElement.y,
        start: {
          id: startId
        },
        end: {
          id: endId
        }
      });
    }
  }

  const validBlockIds = new Set(
    cleanedElements
      .filter((element) => BLOCK_TYPES.has(element.type))
      .map((element) => element.id)
  );

  const finalElements = cleanedElements.filter((element) => {
    if (element.type !== "arrow") {
      return true;
    }

    return (
      validBlockIds.has(element.start.id) &&
      validBlockIds.has(element.end.id)
    );
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
          jsonBody: { error: "Topic must be 180 characters or fewer." }
        };
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.error("Missing GEMINI_API_KEY application setting.");
        return {
          status: 500,
          jsonBody: { error: "AI generation is not configured yet." }
        };
      }

      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
      const isEdit = existingElements.length > 0;

      console.info("Generate request started:", JSON.stringify({
        requestId,
        model,
        mode: isEdit ? "edit" : "create",
        topicLength: topic.length,
        existingElementCount: existingElements.length,
      }));

      const promptParts = [
        "You are a diagram generator for an Excalidraw-based note-taking application.",
        OUTPUT_RULES
      ];

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
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            generationConfig: {
              temperature: 0.25,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA
            }
          })
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error(
          "Gemini request failed:",
          JSON.stringify({
            requestId,
            status: geminiResponse.status,
            model,
            error: geminiData?.error?.status,
            message: geminiData?.error?.message
          })
        );

        return {
          status: 502,
          jsonBody: { error: "The AI provider could not generate a diagram." }
        };
      }

      const generatedText =
        geminiData?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || "")
          .join("") || "";

      console.info("Gemini response received:", JSON.stringify({
        requestId,
        status: geminiResponse.status,
        finishReason: geminiData?.candidates?.[0]?.finishReason,
        outputLength: generatedText.length,
      }));

      let skeleton;

      try {
        skeleton = extractJsonArray(generatedText);
      } catch (error) {
        console.error("Gemini response parsing failed:", JSON.stringify({
          requestId,
          message: error?.message,
          outputPreview: generatedText.slice(0, 1000),
        }));
        throw error;
      }

      if (!Array.isArray(skeleton)) {
        throw new Error("The generated content was not an array.");
      }

      skeleton = sanitizeSkeleton(skeleton);

      console.info("Generate request completed:", JSON.stringify({
        requestId,
        elementCount: skeleton.length,
        durationMs: Date.now() - startedAt,
      }));

      return { status: 200, jsonBody: skeleton };
    } catch (error) {
      console.error(
        "Generate function error:",
        JSON.stringify({
          requestId,
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          durationMs: Date.now() - startedAt,
        })
      );

      return {
        status: 500,
        jsonBody: { error: "Unable to generate a diagram right now." }
      };
    }
  }
});