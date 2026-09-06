const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

const DATABASE_ID = "ExcalidrawNotesDB";
const CONTAINER_ID = "Scenes";

function getAuthenticatedUser(request) {
  const encodedPrincipal = request.headers.get("x-ms-client-principal");

  if (!encodedPrincipal) {
    return null;
  }

  try {
    const principal = JSON.parse(
      Buffer.from(encodedPrincipal, "base64").toString("utf8"),
    );

    return principal?.userId ? String(principal.userId) : null;
  } catch (error) {
    console.error("Could not parse x-ms-client-principal:", error);
    return null;
  }
}

function getScenesContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error("COSMOS_CONNECTION_STRING is missing.");
  }

  const client = new CosmosClient(connectionString);
  return client.database(DATABASE_ID).container(CONTAINER_ID);
}

app.http("listScenes", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "listScenes",

  handler: async (request) => {
    try {
      const userId = getAuthenticatedUser(request);

      if (!userId) {
        return {
          status: 401,
          jsonBody: { error: "Authentication is required." },
        };
      }

      const container = getScenesContainer();
      const querySpec = {
        query:
          "SELECT c.topic, c.updatedAt FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC",
        parameters: [{ name: "@userId", value: userId }],
      };
      const { resources } = await container.items
        .query(querySpec, { partitionKey: userId })
        .fetchAll();

      return {
        status: 200,
        jsonBody: resources,
      };
    } catch (error) {
      console.error("listScenes failed:", error);

      return {
        status: 500,
        jsonBody: { error: "Unable to list workspaces right now." },
      };
    }
  },
});
