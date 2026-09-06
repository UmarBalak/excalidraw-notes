const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

function getAuthenticatedUserId(request) {
  const encodedPrincipal = request.headers.get("x-ms-client-principal");

  if (!encodedPrincipal) {
    return null;
  }

  try {
    const principalJson = Buffer.from(
      encodedPrincipal,
      "base64"
    ).toString("utf8");

    const principal = JSON.parse(principalJson);

    return principal?.userId || null;
  } catch (error) {
    console.error("Unable to parse Azure client principal:", error);
    return null;
  }
}

function getScenesContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error(
      "COSMOS_CONNECTION_STRING application setting is missing."
    );
  }

  const client = new CosmosClient(connectionString);

  return client.database("ExcalidrawNotesDB").container("Scenes");
}

function buildSceneId(userId, topic) {
  return `${userId}:${encodeURIComponent(topic.toLowerCase())}`;
}

app.http("getScene", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getScene",

  handler: async (request) => {
    try {
      /*
       * Static Web Apps route protection verifies authentication first.
       * This check is still important because it prevents accidental data
       * leakage if routing rules are later changed incorrectly.
       */
      const userId = getAuthenticatedUserId(request);

      if (!userId) {
        return {
          status: 401,
          jsonBody: {
            error: "Authentication is required."
          }
        };
      }

      const topic = String(request.query.get("topic") || "").trim();

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

      const container = getScenesContainer();
      const id = buildSceneId(userId, topic);

      try {
        /*
         * This requires:
         * Database: NotesDB
         * Container: Scenes
         * Partition key: /userId
         */
        const response = await container.item(id, userId).read();

        return {
          status: 200,
          jsonBody: response.resource || null
        };
      } catch (error) {
        /*
         * No stored item is normal when a user types a new topic for the
         * first time. Return null instead of treating it as an error.
         */
        if (error.code === 404) {
          return {
            status: 200,
            jsonBody: null
          };
        }

        throw error;
      }
    } catch (error) {
      console.error("Get scene function error:", error);

      return {
        status: 500,
        jsonBody: {
          error: "Unable to load this workspace."
        }
      };
    }
  }
});