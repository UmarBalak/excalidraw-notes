const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

const DATABASE_ID = "ExcalidrawNotesDB";
const CONTAINER_ID = "Scenes";
const MAX_TOPIC_LENGTH = 180;
const MAX_ELEMENTS = 5000;

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

function validateScene(topic, elements) {
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

      const validationError = validateScene(topic, elements);

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