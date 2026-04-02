import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logger } from "../../shared/logger.js";
import { MetaAdsClient } from "./client.js";

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

export function registerMetaAdsTools(server: McpServer, client: MetaAdsClient) {
  server.tool(
    "meta_ads_get_campaigns",
    "Listar campañas de Meta Ads (Facebook/Instagram). Devuelve nombre, estado, objetivo, presupuesto y fechas de cada campaña.",
    {
      status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional()
        .describe("Filtrar por estado (default: todas)"),
      limit: z.number().optional().describe("Max campañas a devolver (default: 100)"),
    },
    wrapTool(async (args) => {
      const data = await client.getCampaigns(args);
      return { total: data.length, campaigns: data };
    }),
  );

  server.tool(
    "meta_ads_account_insights",
    "Obtener metricas generales de la cuenta de Meta Ads por rango de fecha. Incluye spend, impressions, reach, clicks, CPC, CPM, CTR y acciones (conversiones). Permite desglosar por dia y por breakdowns (age, gender, country, publisher_platform, etc).",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
      time_increment: z.string().optional()
        .describe("Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)"),
      breakdowns: z.string().optional()
        .describe("Desglosar por: 'age', 'gender', 'country', 'publisher_platform', 'device_platform'. Se pueden combinar con coma."),
    },
    wrapTool(async (args) => {
      const data = await client.getAccountInsights(args);
      return { total: data.length, insights: data };
    }),
  );

  server.tool(
    "meta_ads_campaign_insights",
    "Obtener metricas por campaña de Meta Ads. Devuelve spend, impressions, reach, clicks, CPC, CPM, CTR y conversiones desglosado por campaña. Ideal para comparar rendimiento entre campañas.",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
      time_increment: z.string().optional()
        .describe("Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)"),
      campaign_ids: z.array(z.string()).optional()
        .describe("IDs de campañas especificas (si no se especifica, devuelve todas)"),
    },
    wrapTool(async (args) => {
      const data = await client.getCampaignInsights(args);
      return { total: data.length, insights: data };
    }),
  );

  server.tool(
    "meta_ads_adset_insights",
    "Obtener metricas por conjunto de anuncios (ad set) de Meta Ads. Desglose mas granular que por campaña: muestra spend, clicks, conversiones por cada ad set.",
    {
      since: z.string().describe("Fecha inicio yyyy-mm-dd"),
      until: z.string().describe("Fecha fin yyyy-mm-dd"),
      time_increment: z.string().optional()
        .describe("Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)"),
      campaign_ids: z.array(z.string()).optional()
        .describe("Filtrar por IDs de campaña (si no se especifica, devuelve todos los ad sets)"),
    },
    wrapTool(async (args) => {
      const data = await client.getAdSetInsights(args);
      return { total: data.length, insights: data };
    }),
  );
}
