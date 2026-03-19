import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MixpanelClient } from "./client.js";

function json(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

export function registerMixpanelTools(server: McpServer, client: MixpanelClient) {
  server.tool(
    "mixpanel_segmentation",
    "Consultar conteos de un evento en Mixpanel a lo largo del tiempo, con opcion de segmentar por propiedades. Ideal para ver tendencias, comparar periodos o desglosar por propiedad (navegador, ciudad, UTM, etc).",
    {
      event: z.string().describe("Nombre del evento (ej: 'cotizador__paso_1__view')"),
      from_date: z.string().describe("Fecha inicio en formato yyyy-mm-dd"),
      to_date: z.string().describe("Fecha fin en formato yyyy-mm-dd"),
      unit: z.enum(["minute", "hour", "day", "week", "month"]).optional().describe("Granularidad temporal (default: day)"),
      type: z.enum(["general", "unique", "average"]).optional().describe("general=total eventos, unique=usuarios unicos, average=promedio por usuario"),
      on: z.string().optional().describe("Propiedad para segmentar (ej: 'properties[\"$browser\"]' o 'properties[\"utm_source\"]')"),
      where: z.string().optional().describe("Filtro de expresion (ej: 'properties[\"$city\"]==\"Buenos Aires\"')"),
    },
    async (args) => {
      try {
        const data = await client.segmentation(args);
        return json(data);
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  server.tool(
    "mixpanel_export_events",
    "Exportar eventos crudos de Mixpanel. Devuelve cada evento individual con todas sus propiedades. Usar para analisis detallado de eventos especificos. ATENCION: limitar el rango de fechas y usar limit para evitar respuestas enormes.",
    {
      from_date: z.string().describe("Fecha inicio yyyy-mm-dd"),
      to_date: z.string().describe("Fecha fin yyyy-mm-dd"),
      event: z.array(z.string()).optional().describe("Lista de nombres de eventos a exportar (si no se especifica, exporta todos)"),
      where: z.string().optional().describe("Filtro (ej: 'properties[\"$city\"]==\"Buenos Aires\"')"),
      limit: z.number().optional().describe("Maximo de eventos a devolver (default: 100, max recomendado: 1000)"),
    },
    async (args) => {
      try {
        const limit = args.limit || 100;
        const data = await client.exportEvents({ ...args, limit });
        return json({ total: data.length, events: data });
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  server.tool(
    "mixpanel_profiles",
    "Consultar perfiles de usuario en Mixpanel. Permite filtrar por propiedades del perfil y obtener datos demograficos, ultimo evento, etc.",
    {
      where: z.string().optional().describe("Filtro de perfil (ej: 'properties[\"$city\"]==\"Buenos Aires\"' o 'properties[\"$last_seen\"]>\"2026-01-01\"')"),
      output_properties: z.array(z.string()).optional().describe("Propiedades a incluir en la respuesta (ej: ['$email', '$name', '$city'])"),
      page_size: z.number().optional().describe("Resultados por pagina (default: 25, max: 1000)"),
    },
    async (args) => {
      try {
        const data = await client.profiles(args);
        return json(data);
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  server.tool(
    "mixpanel_funnels",
    "Obtener datos de conversion de un funnel existente en Mixpanel. Requiere el funnel_id que se puede ver en la URL de Mixpanel al abrir el funnel.",
    {
      funnel_id: z.number().describe("ID del funnel (visible en la URL de Mixpanel)"),
      from_date: z.string().describe("Fecha inicio yyyy-mm-dd"),
      to_date: z.string().describe("Fecha fin yyyy-mm-dd"),
      length: z.number().optional().describe("Ventana de conversion en dias"),
      unit: z.enum(["day", "week", "month"]).optional().describe("Granularidad temporal"),
      on: z.string().optional().describe("Propiedad para segmentar"),
      where: z.string().optional().describe("Filtro de expresion"),
    },
    async (args) => {
      try {
        const data = await client.funnels(args);
        return json(data);
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  server.tool(
    "mixpanel_retention",
    "Obtener datos de retencion de cohortes en Mixpanel. Muestra que porcentaje de usuarios que hicieron un evento inicial vuelven a hacer otro evento en periodos posteriores.",
    {
      from_date: z.string().describe("Fecha inicio yyyy-mm-dd"),
      to_date: z.string().describe("Fecha fin yyyy-mm-dd"),
      born_event: z.string().optional().describe("Evento inicial que define la cohorte (ej: 'Sign Up')"),
      event: z.string().optional().describe("Evento de retorno que se mide"),
      retention_type: z.enum(["birth", "compounded"]).optional().describe("birth=desde primer evento, compounded=acumulativo"),
      unit: z.enum(["day", "week", "month"]).optional().describe("Granularidad de los periodos"),
    },
    async (args) => {
      try {
        const data = await client.retention(args);
        return json(data);
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  server.tool(
    "mixpanel_jql",
    "Ejecutar una consulta JQL (JavaScript Query Language) personalizada en Mixpanel. Permite consultas complejas que no se pueden hacer con los otros endpoints. El script debe definir una funcion main() que retorne datos.",
    {
      script: z.string().describe("Script JQL. Ejemplo:\nfunction main() {\n  return Events({\n    from_date: '2026-01-01',\n    to_date: '2026-01-31'\n  }).groupBy(['name'], mixpanel.reducer.count())\n}"),
    },
    async (args) => {
      try {
        const data = await client.jql(args.script);
        return json(data);
      } catch (e: any) {
        return error(e.message);
      }
    },
  );
}
