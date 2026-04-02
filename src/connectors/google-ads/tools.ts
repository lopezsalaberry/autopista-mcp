import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logger } from "../../shared/logger.js";
import { GoogleAdsClient } from "./client.js";

function json(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

function wrapTool<T>(fn: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return json(await fn(args));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "MCP tool error");
      return error(message);
    }
  };
}

export function registerGoogleAdsTools(server: McpServer, client: GoogleAdsClient) {
  server.tool(
    "google_ads_account_metrics",
    "Obtener metricas generales de la cuenta de Google Ads por rango de fecha. Devuelve spend, impressions, clicks, conversions, CTR, CPC y CPM por dia.",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
    },
    wrapTool(async (args) => {
      const data = await client.accountMetrics(args);
      return { total: data.length, metrics: data };
    }),
  );

  server.tool(
    "google_ads_campaign_metrics",
    "Obtener metricas por campaña de Google Ads. Devuelve spend, impressions, clicks, conversions, CTR, CPC desglosado por campaña y dia. Ideal para comparar rendimiento entre campañas de Search, Display, Video, etc.",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
      campaign_ids: z.array(z.string()).optional()
        .describe("IDs de campañas especificas (si no se especifica, devuelve todas)"),
      status: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional()
        .describe("Filtrar por estado de campaña"),
    },
    wrapTool(async (args) => {
      const data = await client.campaignMetrics(args);
      return { total: data.length, metrics: data };
    }),
  );

  server.tool(
    "google_ads_keyword_metrics",
    "Obtener metricas por keyword de Google Ads. Muestra rendimiento de cada palabra clave: impressions, clicks, spend, conversions, CTR y CPC. Util para optimizacion de Search campaigns.",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
      campaign_ids: z.array(z.string()).optional()
        .describe("Filtrar por IDs de campaña"),
    },
    wrapTool(async (args) => {
      const data = await client.keywordMetrics(args);
      return { total: data.length, keywords: data };
    }),
  );

  server.tool(
    "google_ads_query",
    "Ejecutar una consulta GAQL (Google Ads Query Language) personalizada. Permite consultas avanzadas sobre cualquier recurso de Google Ads. Referencia: https://developers.google.com/google-ads/api/fields/v18/overview",
    {
      query: z.string().describe(
        "Consulta GAQL. Ejemplo:\n" +
        "SELECT campaign.name, metrics.clicks, metrics.impressions\n" +
        "FROM campaign\n" +
        "WHERE segments.date DURING LAST_7_DAYS\n" +
        "ORDER BY metrics.clicks DESC",
      ),
    },
    wrapTool(async (args) => {
      const data = await client.customQuery(args.query);
      return { total: data.length, results: data };
    }),
  );
}
