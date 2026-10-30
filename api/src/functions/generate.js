const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");

const MAX_PROMPT_LENGTH = 180;
const MAX_MERMAID_LENGTH = 24_000;

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;

const openai = new OpenAI({
  baseURL: endpoint || "https://example.com/openai/v1",
  apiKey: apiKey || "unconfigured-key",
});

function buildMermaidPrompt(instruction, existingMermaid) {
  const isEdit = Boolean(existingMermaid);

  return [
    "You design clear, accurate technical diagrams in Mermaid.",
    "Return exactly one JSON object with one property: {\"mermaid\": \"...\"}.",
    "The value must be valid Mermaid source only. Do not use Markdown fences or add commentary.",
    "Prefer a concise flowchart (flowchart TD or flowchart LR). Use sequenceDiagram, classDiagram, stateDiagram, or erDiagram only when the request clearly calls for it.",
    "Use meaningful, factual labels. Keep node labels brief, avoid HTML, click directives, links, init directives, class/style directives, and raw CSS.",
    "Keep the diagram readable: normally 3–16 nodes, with only meaningful relationships.",
    isEdit
      ? [
          "You are editing the existing Mermaid diagram below.",
          "Apply the user's requested change while preserving unrelated information and a coherent layout.",
          "Existing Mermaid:",
          existingMermaid,
        ].join("\n")
      : "You are creating a new Mermaid diagram.",
    "User request:",
    instruction,
  ].join("\n\n");
}

function extractMermaid(responseText) {
  let parsed;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("The AI did not return the expected Mermaid response.");
  }

  if (!parsed || typeof parsed.mermaid !== "string") {
    throw new Error("The AI response did not contain Mermaid code.");
  }

  const mermaid = parsed.mermaid
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!mermaid) {
    throw new Error("The AI returned empty Mermaid code.");
  }

  if (mermaid.length > MAX_MERMAID_LENGTH) {
    throw new Error("The generated Mermaid diagram is too large.");
  }

  return mermaid;
}

async function createMermaid(instruction, existingMermaid) {
  const response = await openai.responses.create({
    model: deploymentName,
    input: buildMermaidPrompt(instruction, existingMermaid),
    max_output_tokens: existingMermaid ? 4_000 : 3_000,
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error(
      `The model did not finish: ${response.incomplete_details?.reason || "unknown reason"}.`,
    );
  }

  if (!response.output_text) {
    throw new Error("The model returned no visible text.");
  }

  return extractMermaid(response.output_text);
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
        console.error("Missing Azure OpenAI configuration.", {
          requestId,
          hasKey: Boolean(apiKey),
          hasEndpoint: Boolean(endpoint),
          hasDeployment: Boolean(deploymentName),
        });
        return {
          status: 500,
          jsonBody: { error: "AI generation is not configured yet." },
        };
      }

      const body = await request.json();
      const topic = String(body?.topic || "").trim();
      const existingMermaid =
        typeof body?.existingMermaid === "string"
          ? body.existingMermaid.trim()
          : "";

      if (!topic) {
        return {
          status: 400,
          jsonBody: { error: "A diagram request is required." },
        };
      }

      if (topic.length > MAX_PROMPT_LENGTH) {
        return {
          status: 400,
          jsonBody: {
            error: `Diagram requests must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
          },
        };
      }

      if (existingMermaid.length > MAX_MERMAID_LENGTH) {
        return {
          status: 400,
          jsonBody: { error: "The existing Mermaid diagram is too large to edit." },
        };
      }

      const mermaid = await createMermaid(topic, existingMermaid);

      console.info("Mermaid generation completed.", {
        requestId,
        mode: existingMermaid ? "edit" : "create",
        mermaidLength: mermaid.length,
        durationMs: Date.now() - startedAt,
      });

      return { status: 200, jsonBody: { mermaid } };
    } catch (error) {
      console.error("Mermaid generation failed.", {
        requestId,
        message: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
      return {
        status: 500,
        jsonBody: {
          error: "Unable to generate a Mermaid diagram right now.",
          debug: error?.message || String(error),
        },
      };
    }
  },
});

module.exports = {
  buildMermaidPrompt,
  extractMermaid,
};
