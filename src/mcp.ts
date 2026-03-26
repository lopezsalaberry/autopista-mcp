import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./shared/config.js";
import { MixpanelClient } from "./connectors/mixpanel/client.js";
import { HubSpotClient } from "./connectors/hubspot/client.js";
import { MetaAdsClient } from "./connectors/meta-ads/client.js";
import { GoogleAdsClient } from "./connectors/google-ads/client.js";
import { registerMixpanelTools } from "./connectors/mixpanel/tools.js";
import { registerHubSpotTools } from "./connectors/hubspot/tools.js";
import { registerMetaAdsTools } from "./connectors/meta-ads/tools.js";
import { registerGoogleAdsTools } from "./connectors/google-ads/tools.js";
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

  // Meta Ads (opcional)
  if (config.META_ADS_ACCESS_TOKEN && config.META_ADS_ACCOUNT_ID) {
    const metaAdsClient = new MetaAdsClient({
      accessToken: config.META_ADS_ACCESS_TOKEN,
      adAccountId: config.META_ADS_ACCOUNT_ID,
    });
    registerMetaAdsTools(server, metaAdsClient);
  }

  // Google Ads (opcional)
  if (config.GOOGLE_ADS_DEVELOPER_TOKEN && config.GOOGLE_ADS_CUSTOMER_ID && config.GOOGLE_ADS_REFRESH_TOKEN) {
    const googleAdsClient = new GoogleAdsClient({
      clientId: config.GOOGLE_ADS_CLIENT_ID,
      clientSecret: config.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: config.GOOGLE_ADS_REFRESH_TOKEN,
      developerToken: config.GOOGLE_ADS_DEVELOPER_TOKEN,
      customerId: config.GOOGLE_ADS_CUSTOMER_ID,
      loginCustomerId: config.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    });
    registerGoogleAdsTools(server, googleAdsClient);
  }

  return server;
}
