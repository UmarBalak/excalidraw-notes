const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

const DATABASE_ID = "ExcalidrawNotesDB";
const CONTAINER_ID = "Scenes";
const MAX_TOPIC_LENGTH = 180;
const MAX_ELEMENTS = 5000;
const MAX_MERMAID_LENGTH = 24000;
const MAX_GENERATED_DIAGRAMS = 100;
const MAX_GENERATED_DIAGRAM_SOURCE_LENGTH = 24000;
const MAX_GENERATED_DIAGRAM_IDS = 5000;

function getAuthenticatedUser(request) {
  const encodedPrincipal = request.headers.get("x-ms-client-principal");

  if (!encodedPrincipal) {
    return null;
  }

  try {
    const decodedPrincipal = Buffer.from(
      encodedPrincipal,
      "base64",
    ).toString("utf8");

    const principal = JSON.parse(decodedPrincipal);

    if (!principal?.userId) {
      return null;
    }

    return {
      userId: String(principal.userId),
      userDetails: String(principal.userDetails || ""),
      identityProvider: String(principal.identityProvider || "")
    };
  } catch (error) {
    console.error("Could not parse x-ms-client-principal:", error);
    return null;
  }
}

// Cosmos DB forbids "/", "\", "?", "#" in item ids outright, and anything
// unusual (quotes, newlines, tabs) has been observed to break the SDK's
// request-signing — so this strips everything except a safe character set
// BEFORE the id is ever built. Must stay identical in getScene.js, or a
// saved scene becomes unfindable because the two ids no longer match.
function sanitizeTopicForId(topic) {
  const stripped = topic
    .toLowerCase()
    .replace(/["'/\\?#\r\n\t]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 100);

  return encodeURIComponent(stripped);
}

function createSceneId(userId, topic) {
  return `${userId}:${sanitizeTopicForId(topic)}`;
}

function getScenesContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error(
      "COSMOS_CONNECTION_STRING is missing from Azure Static Web App Configuration.",
    );
  }

  const client = new CosmosClient(connectionString);

  return client.database(DATABASE_ID).container(CONTAINER_ID);
}

function validateScene(topic, elements, mermaid, mermaidElementIds, generatedDiagrams) {
  if (!topic) {
    return "A workspace topic is required.";
  }

  if (topic.length > MAX_TOPIC_LENGTH) {
    return `Topic must be ${MAX_TOPIC_LENGTH} characters or fewer.`;
  }

  if (!sanitizeTopicForId(topic)) {
    return "Workspace name must contain at least one letter or number.";
  }

  if (!Array.isArray(elements)) {
    return "Canvas elements must be an array.";
  }

  if (elements.length > MAX_ELEMENTS) {
    return `Canvas is too large. Maximum allowed elements: ${MAX_ELEMENTS}.`;
  }

  if (typeof mermaid !== "string") {
    return "Mermaid source must be a string.";
  }

  if (mermaid.length > MAX_MERMAID_LENGTH) {
    return `Mermaid source is too large. Maximum allowed length: ${MAX_MERMAID_LENGTH}.`;
  }

  if (!Array.isArray(mermaidElementIds) || !mermaidElementIds.every((id) => typeof id === "string")) {
    return "Mermaid element IDs must be an array of strings.";
  }

  if (!Array.isArray(generatedDiagrams)) {
    return "Generated diagrams must be an array.";
  }

  if (generatedDiagrams.length > MAX_GENERATED_DIAGRAMS) {
    return `Too many generated diagrams. Maximum allowed: ${MAX_GENERATED_DIAGRAMS}.`;
  }

  for (const diagram of generatedDiagrams) {
    if (!diagram || typeof diagram !== "object" || Array.isArray(diagram)) {
      return "Each generated diagram must be an object.";
    }
    if (typeof diagram.id !== "string" || !diagram.id || diagram.id.length > 128) {
      return "Each generated diagram must have a valid ID.";
    }
    if (!["mermaid", "scene"].includes(diagram.kind)) {
      return "Generated diagram kind must be mermaid or scene.";
    }
    if (typeof diagram.source !== "string" || diagram.source.length > MAX_GENERATED_DIAGRAM_SOURCE_LENGTH) {
      return "Generated diagram source is invalid or too large.";
    }
    if (!Array.isArray(diagram.elementIds) ||
        diagram.elementIds.length > MAX_GENERATED_DIAGRAM_IDS ||
        !diagram.elementIds.every((id) => typeof id === "string" && id.length <= 128)) {
      return "Generated diagram element IDs are invalid.";
    }
    if (diagram.spec != null && (typeof diagram.spec !== "object" || Array.isArray(diagram.spec))) {
      return "Generated diagram spec must be an object or null.";
    }
  }

  return null;
}

app.http("saveScene", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "saveScene",

  handler: async (request) => {
    try {
      const user = getAuthenticatedUser(request);

      if (!user) {
        return {
          status: 401,
          jsonBody: {
            error: "Authentication is required to save a workspace."
          }
        };
      }

      const body = await request.json();

      const topic = String(body?.topic || "").trim();
      const elements = body?.elements;
      const appState = body?.appState || null;
      const mermaid = typeof body?.mermaid === "string" ? body.mermaid : "";
      const mermaidElementIds = Array.isArray(body?.mermaidElementIds)
        ? body.mermaidElementIds
        : [];
      // Older clients do not send generatedDiagrams. Keep them compatible.
      const generatedDiagrams = Array.isArray(body?.generatedDiagrams)
        ? body.generatedDiagrams
        : [];

      const validationError = validateScene(
        topic,
        elements,
        mermaid,
        mermaidElementIds,
        generatedDiagrams,
      );

      if (validationError) {
        return {
          status: 400,
          jsonBody: {
            error: validationError
          }
        };
      }

      const container = getScenesContainer();
      const id = createSceneId(user.userId, topic);
      const now = new Date().toISOString();

      let previousScene = null;

      try {
        const result = await container.item(id, user.userId).read();
        previousScene = result.resource || null;
      } catch (error) {
        if (error.code !== 404) {
          throw error;
        }
      }

      const scene = {
        id,
        userId: user.userId,
        topic,
        normalizedTopic: topic.toLowerCase(),
        createdAt: previousScene?.createdAt || now,
        updatedAt: now,
        elements,
        mermaid,
        mermaidElementIds,
        generatedDiagrams,
        appState,
        owner: {
          identityProvider: user.identityProvider,
          userDetails: user.userDetails
        }
      };

      await container.items.upsert(scene);

      return {
        status: 200,
        jsonBody: {
          ok: true,
          id,
          topic,
          updatedAt: now
        }
      };
    } catch (error) {
      console.error("saveScene failed:", JSON.stringify({
        name: error?.name,
        message: error?.message,
        code: error?.code,
        statusCode: error?.statusCode,
        substatus: error?.substatus,
        stack: error?.stack,
      }));

      return {
        status: 500,
        jsonBody: {
          error: "Unable to save the workspace right now.",
          debug: error?.message || String(error)
        }
      };
    }
  }
});
