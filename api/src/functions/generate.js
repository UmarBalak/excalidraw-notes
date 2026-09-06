const { app } = require("@azure/functions");

const CREATE_INSTRUCTIONS = `
Create an educational diagram and concise note layout for the requested topic.

LAYOUT REQUIREMENTS

1. Title:
Create exactly one text element near the top-left.

Example:
{
  "id": "title",
  "type": "text",
  "x": 40,
  "y": 25,
  "text": "Topic title",
  "fontSize": 28
}

2. Diagram:
Create 3 to 6 labelled nodes on the left side.

- Use "rectangle" or "ellipse" node types.
- Put nodes inside x:40 to x:570 and y:110 to y:530.
- Each node must contain:
  "id": "a-simple-unique-id",
  "type": "rectangle",
  "x": 60,
  "y": 140,
  "width": 140,
  "height": 70,
  "label": { "text": "Node label" }

- Use arrows to connect the nodes.
- Arrow start and end ids must match actual node ids exactly. Never reference an id that is not one of the node ids you created.

Example arrow:
{
  "id": "arrow-input-process",
  "type": "arrow",
  "start": { "id": "input" },
  "end": { "id": "process" }
}

3. Notes:
Create exactly one large rectangle on the right.

It must use:
- x: 650
- y: 80
- width: 500
- height: 455

Its label must begin with "KEY NOTES" and contain 4 to 7 short bullet points.

Example:
{
  "id": "notes",
  "type": "rectangle",
  "x": 650,
  "y": 80,
  "width": 500,
  "height": 455,
  "label": {
    "text": "KEY NOTES\\n\\n• First important concept\\n• Second important concept\\n• Third important concept\\n• Fourth important concept"
  }
}

4. General:
- Keep all coordinates inside x:0 to x:1200 and y:0 to y:600.
- Avoid overlapping nodes.
- Keep labels short.
- Make the diagram accurate and useful.
- Use simple ASCII text only.
`;

const EDIT_INSTRUCTIONS = `
You are given the CURRENT scene as a JSON array (element skeletons) and an EDIT INSTRUCTION describing one change to make to it.

RULES:
- Return the COMPLETE updated array representing the new full scene — every element that should still exist, not just the changed ones.
- Copy every unchanged element's id, position, size, and content EXACTLY as given. Do not reword or reposition anything that wasn't asked to change.
- Only add, remove, or modify what the instruction specifically requests.
- If asked to remove something, delete that element AND any arrow whose start or end id pointed at it.
- If asked to add something, give it a new unique id that doesn't collide with any existing id, place it in free space near related content, and connect it with an arrow if that fits.
- If asked to edit text (a label or the notes block), keep the same id, position, and size — only change the text/label content.
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
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      type: { type: "STRING" },
      x: { type: "NUMBER" },
      y: { type: "NUMBER" },
      width: { type: "NUMBER" },
      height: { type: "NUMBER" },
      text: { type: "STRING" },
      fontSize: { type: "NUMBER" },
      label: {
        type: "OBJECT",
        properties: { text: { type: "STRING" } }
      },
      start: {
        type: "OBJECT",
        properties: { id: { type: "STRING" } }
      },
      end: {
        type: "OBJECT",
        properties: { id: { type: "STRING" } }
      }
    },
    required: ["id", "type"]
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

function sanitizeSkeleton(skeleton) {
  const ids = new Set(skeleton.map((el) => el?.id).filter(Boolean));
  return skeleton.filter((el) => {
    if (el?.type !== "arrow") return true;
    return ids.has(el?.start?.id) && ids.has(el?.end?.id);
  });
}

app.http("generate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate",

  handler: async (request) => {
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

      let skeleton = extractJsonArray(generatedText);

      if (!Array.isArray(skeleton)) {
        throw new Error("The generated content was not an array.");
      }

      skeleton = sanitizeSkeleton(skeleton);

      return { status: 200, jsonBody: skeleton };
    } catch (error) {
      console.error(
        "Generate function error:",
        JSON.stringify({
          name: error?.name,
          message: error?.message,
          stack: error?.stack
        })
      );

      return {
        status: 500,
        jsonBody: { error: "Unable to generate a diagram right now." }
      };
    }
  }
});