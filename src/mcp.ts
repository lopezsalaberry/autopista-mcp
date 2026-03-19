import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./shared/config.js";
import { MixpanelClient } from "./connectors/mixpanel/client.js";
import { HubSpotClient } from "./connectors/hubspot/client.js";
import { registerMixpanelTools } from "./connectors/mixpanel/tools.js";
import { registerHubSpotTools } from "./connectors/hubspot/tools.js";
import { registerKnowledgeTools } from "./connectors/knowledge/tools.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "autopista-mcp",
    version: "1.0.0",
  });

  const mixpanelClient = new MixpanelClient({
    username: config.MIXPANEL_SERVICE_ACCOUNT_USERNAME,
    secret: config.MIXPANEL_SERVICE_ACCOUNT_SECRET,
    projectId: config.MIXPANEL_PROJECT_ID,
    region: config.MIXPANEL_REGION,
  });

  const hubspotClient = new HubSpotClient(
    config.HUBSPOT_ACCESS_TOKEN,
    config.OPENAI_API_KEY || undefined,
  );

  registerMixpanelTools(server, mixpanelClient);
  registerHubSpotTools(server, hubspotClient);
  registerKnowledgeTools(server);

  return server;
}
