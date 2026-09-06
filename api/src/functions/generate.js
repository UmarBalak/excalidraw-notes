const { app } = require("@azure/functions");

const SYSTEM_PROMPT = `
You are a diagram generator for an Excalidraw-based note-taking application.

Return ONLY a valid JSON array.
Do not include markdown.
Do not include triple backticks.
Do not explain the response.
Do not include any text outside the JSON array.

The array must contain Excalidraw element skeletons compatible with:
convertToExcalidrawElements(...)

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
- Arrow start and end ids must match actual node ids exactly.

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
- Return valid JSON only.
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

app.http("generate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate",

  handler: async (request) => {
    try {
      const body = await request.json();
      const topic = String(body?.topic || "").trim();

      if (!topic) {
        return {
          status: 400,
          jsonBody: {
            error: "Topic is required."
          }
        };
      }

      if (topic.length > 180) {
        return {
          status: 400,
          jsonBody: {
            error: "Topic must be 180 characters or fewer."
          }
        };
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.error("Missing GEMINI_API_KEY application setting.");

        return {
          status: 500,
          jsonBody: {
            error: "AI generation is not configured yet."
          }
        };
      }

      /*
       * Keep this environment-configurable because available Gemini models
       * can differ across Google AI Studio projects and change over time.
       *
       * In Azure:
       * GEMINI_MODEL = gemini-2.5-flash-lite
       */
      const model =
        process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${SYSTEM_PROMPT}\n\nRequested topic: ${topic}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.25,
              responseMimeType: "application/json"
            }
          })
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error(
          "Gemini request failed:",
          geminiResponse.status,
          JSON.stringify(geminiData)
        );

        return {
          status: 502,
          jsonBody: {
            error: "The AI provider could not generate a diagram."
          }
        };
      }

      const generatedText =
        geminiData?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || "")
          .join("") || "";

      const skeleton = extractJsonArray(generatedText);

      if (!Array.isArray(skeleton)) {
        throw new Error("The generated content was not an array.");
      }

      return {
        status: 200,
        jsonBody: skeleton
      };
    } catch (error) {
      console.error("Generate function error:", error);

      return {
        status: 500,
        jsonBody: {
          error: "Unable to generate a diagram right now."
        }
      };
    }
  }
});