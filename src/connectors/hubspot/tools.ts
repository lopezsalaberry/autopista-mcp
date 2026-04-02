import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logger } from "../../shared/logger.js";
import { HubSpotClient } from "./client.js";

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

const filterSchema = z.object({
  propertyName: z.string().describe("Nombre de la propiedad (ej: 'email', 'firstname', 'hs_lead_status')"),
  operator: z.string().describe("Operador: EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN, HAS_PROPERTY, NOT_HAS_PROPERTY, IN"),
  value: z.string().describe("Valor a comparar"),
});

export function registerHubSpotTools(server: McpServer, client: HubSpotClient) {
  server.tool(
    "hubspot_search_contacts",
    "Buscar contactos en HubSpot CRM. Puede buscar por texto libre (query) o con filtros estructurados por propiedades. Soporta paginacion.",
    {
      query: z.string().optional().describe("Busqueda de texto libre (busca en nombre, email, telefono, empresa)"),
      filters: z.array(filterSchema).optional().describe("Filtros estructurados. Ej: [{propertyName:'email', operator:'EQ', value:'test@mail.com'}]"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar (ej: ['email','firstname','lastname','phone','hs_lead_status']). Si no se especifica, retorna las default."),
      limit: z.number().optional().describe("Max resultados (default: 10, max: 100)"),
      after: z.string().optional().describe("Cursor de paginacion (viene en paging.next.after de la respuesta anterior)"),
    },
    wrapTool(async (args) => client.searchContacts(args)),
  );

  server.tool(
    "hubspot_get_contact",
    "Obtener un contacto especifico de HubSpot por su ID. Retorna todas las propiedades solicitadas del contacto.",
    {
      id: z.string().describe("ID del contacto en HubSpot"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar (ej: ['email','firstname','lastname','phone','hs_lead_status','hubspot_owner_id'])"),
    },
    wrapTool(async (args) => client.getContact(args.id, args.properties)),
  );

  server.tool(
    "hubspot_search_deals",
    "Buscar deals (negocios/oportunidades) en HubSpot CRM. Puede buscar por texto o filtros por propiedades como pipeline, stage, monto, etc.",
    {
      query: z.string().optional().describe("Busqueda de texto libre"),
      filters: z.array(filterSchema).optional().describe("Filtros estructurados. Ej: [{propertyName:'dealstage', operator:'EQ', value:'closedwon'}]"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar (ej: ['dealname','amount','dealstage','pipeline','closedate','hubspot_owner_id'])"),
      limit: z.number().optional().describe("Max resultados (default: 10, max: 100)"),
      after: z.string().optional().describe("Cursor de paginacion"),
    },
    wrapTool(async (args) => client.searchDeals(args)),
  );

  server.tool(
    "hubspot_get_deal",
    "Obtener un deal especifico de HubSpot por su ID.",
    {
      id: z.string().describe("ID del deal en HubSpot"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar"),
    },
    wrapTool(async (args) => client.getDeal(args.id, args.properties)),
  );

  server.tool(
    "hubspot_list_pipelines",
    "Listar todos los pipelines de HubSpot y sus stages. Util para entender el flujo de ventas y los posibles estados de un deal.",
    {
      objectType: z.string().optional().describe("Tipo de objeto (default: 'deals')"),
    },
    wrapTool(async (args) => client.listPipelines(args.objectType)),
  );

  server.tool(
    "hubspot_list_owners",
    "Listar los owners (asesores/vendedores) de HubSpot. Retorna nombre, email y equipos asignados.",
    {
      limit: z.number().optional().describe("Max resultados (default: 100)"),
    },
    wrapTool(async (args) => client.listOwners(args.limit)),
  );

  server.tool(
    "hubspot_get_properties",
    "Listar las definiciones de propiedades de un tipo de objeto en HubSpot. Util para saber que propiedades existen, sus tipos y opciones validas.",
    {
      objectType: z.string().describe("Tipo de objeto: 'contacts', 'deals', 'companies', 'notes'"),
    },
    wrapTool(async (args) => client.getProperties(args.objectType)),
  );

  // ── Engagement tools ──────────────────────────────────────────

  server.tool(
    "hubspot_get_contact_notes",
    "Obtener todas las notas asociadas a un contacto. Retorna el cuerpo de la nota, timestamp, owner y adjuntos.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max notas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactNotes(args.contactId, args.limit)),
  );

  server.tool(
    "hubspot_get_contact_calls",
    "Obtener todas las llamadas asociadas a un contacto. Retorna titulo, notas, direccion, disposicion, duracion, estado y grabacion.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max llamadas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactCalls(args.contactId, args.limit)),
  );

  server.tool(
    "hubspot_get_contact_emails",
    "Obtener todos los emails asociados a un contacto. Retorna asunto, cuerpo, direccion, estado, remitente y destinatario.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max emails a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactEmails(args.contactId, args.limit)),
  );

  server.tool(
    "hubspot_get_contact_tasks",
    "Obtener todas las tareas asociadas a un contacto. Retorna asunto, cuerpo, estado, prioridad, tipo y owner.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max tareas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactTasks(args.contactId, args.limit)),
  );

  server.tool(
    "hubspot_get_contact_meetings",
    "Obtener todas las reuniones asociadas a un contacto. Retorna titulo, cuerpo, horarios, resultado, ubicacion y owner.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max reuniones a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactMeetings(args.contactId, args.limit)),
  );

  server.tool(
    "hubspot_get_contact_deals",
    "Obtener todos los deals/negocios asociados a un contacto. Retorna nombre, monto, etapa, pipeline, fecha de cierre y owner.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      properties: z.array(z.string()).optional().describe("Propiedades del deal a retornar (default: dealname, amount, dealstage, pipeline, closedate, hubspot_owner_id, createdate)"),
      limit: z.number().optional().describe("Max deals a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactDeals(args.contactId, args.properties, args.limit)),
  );

  server.tool(
    "hubspot_get_owner",
    "Obtener un owner/asesor especifico de HubSpot por su ID. Retorna nombre, email y equipos.",
    {
      ownerId: z.string().describe("ID del owner en HubSpot"),
    },
    wrapTool(async (args) => client.getOwner(args.ownerId)),
  );

  // ── Communications (WhatsApp / SMS / Messaging) ─────────

  server.tool(
    "hubspot_get_contact_communications",
    "Obtener todas las comunicaciones (WhatsApp, SMS, mensajeria) asociadas a un contacto. Retorna canal, cuerpo del mensaje, timestamp y owner.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      limit: z.number().optional().describe("Max comunicaciones a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getContactCommunications(args.contactId, args.limit)),
  );

  // ── Deal engagement tools ───────────────────────────────

  server.tool(
    "hubspot_get_deal_notes",
    "Obtener todas las notas asociadas a un deal/negocio. Retorna cuerpo, timestamp, owner y adjuntos.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max notas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealNotes(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_calls",
    "Obtener todas las llamadas asociadas a un deal/negocio.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max llamadas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealCalls(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_emails",
    "Obtener todos los emails asociados a un deal/negocio.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max emails a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealEmails(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_tasks",
    "Obtener todas las tareas asociadas a un deal/negocio.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max tareas a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealTasks(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_meetings",
    "Obtener todas las reuniones asociadas a un deal/negocio.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max reuniones a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealMeetings(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_communications",
    "Obtener todas las comunicaciones (WhatsApp, SMS, mensajeria) asociadas a un deal/negocio.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      limit: z.number().optional().describe("Max comunicaciones a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealCommunications(args.dealId, args.limit)),
  );

  server.tool(
    "hubspot_get_deal_contacts",
    "Obtener todos los contactos asociados a un deal/negocio. Util para ver quienes participan en una oportunidad.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      properties: z.array(z.string()).optional().describe("Propiedades del contacto a retornar (default: email, firstname, lastname, phone, hs_lead_status, lifecyclestage)"),
      limit: z.number().optional().describe("Max contactos a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getDealContacts(args.dealId, args.properties, args.limit)),
  );

  // ── Property History ────────────────────────────────────

  server.tool(
    "hubspot_get_property_history",
    "Obtener el historial de cambios de propiedades de un contacto o deal. Muestra quien cambio el valor, cuando, desde que fuente (workflow, API, manual) y el valor anterior. Ideal para diagnosticar problemas de asignacion, cambios de etapa, y bugs de workflows.",
    {
      objectType: z.string().describe("Tipo de objeto: 'contacts' o 'deals'"),
      objectId: z.string().describe("ID del objeto en HubSpot"),
      properties: z.array(z.string()).describe("Propiedades de las que se quiere ver el historial (ej: ['hubspot_owner_id', 'hs_lead_status', 'dealstage'])"),
    },
    wrapTool(async (args) => client.getPropertyHistory(args.objectType, args.objectId, args.properties)),
  );

  // ── Lists ─────────────────────────────────────────────

  server.tool(
    "hubspot_search_lists",
    "Buscar listas de HubSpot por nombre. Retorna ID, nombre, tamaño, tipo (DYNAMIC/STATIC) y fechas. Util para encontrar listas de enrollment de workflows, segmentos, etc.",
    {
      query: z.string().describe("Texto a buscar en el nombre de la lista"),
      limit: z.number().optional().describe("Max resultados (default: 25)"),
    },
    wrapTool(async (args) => client.searchLists(args.query, args.limit)),
  );

  server.tool(
    "hubspot_get_list",
    "Obtener una lista especifica de HubSpot por su ID. Retorna nombre, tamaño, tipo y filtros de la lista.",
    {
      listId: z.string().describe("ID de la lista en HubSpot"),
    },
    wrapTool(async (args) => client.getList(args.listId)),
  );

  server.tool(
    "hubspot_get_list_members",
    "Obtener los contactos que pertenecen a una lista de HubSpot. Retorna IDs de contactos con paginacion.",
    {
      listId: z.string().describe("ID de la lista en HubSpot"),
      limit: z.number().optional().describe("Max miembros a retornar (default: 100)"),
      after: z.string().optional().describe("Cursor de paginacion"),
    },
    wrapTool(async (args) => client.getListMembers(args.listId, args.limit, args.after)),
  );

  // ── Companies ─────────────────────────────────────────

  server.tool(
    "hubspot_search_companies",
    "Buscar empresas en HubSpot CRM. Puede buscar por texto libre o con filtros estructurados. Util para investigar cuentas de empresas, PYMES y corporativos.",
    {
      query: z.string().optional().describe("Busqueda de texto libre"),
      filters: z.array(filterSchema).optional().describe("Filtros estructurados"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar (ej: ['name','domain','industry','hubspot_owner_id'])"),
      limit: z.number().optional().describe("Max resultados (default: 10)"),
      after: z.string().optional().describe("Cursor de paginacion"),
    },
    wrapTool(async (args) => client.searchCompanies(args)),
  );

  server.tool(
    "hubspot_get_company",
    "Obtener una empresa especifica de HubSpot por su ID.",
    {
      id: z.string().describe("ID de la empresa en HubSpot"),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar"),
    },
    wrapTool(async (args) => client.getCompany(args.id, args.properties)),
  );

  // ── Marketing Emails ──────────────────────────────────

  server.tool(
    "hubspot_list_marketing_emails",
    "Listar emails de marketing de HubSpot. Retorna nombre, asunto, tipo, estado, fecha de envio y estadisticas (opens, clicks, bounces).",
    {
      limit: z.number().optional().describe("Max emails a retornar (default: 50)"),
      after: z.string().optional().describe("Cursor de paginacion"),
    },
    wrapTool(async (args) => client.listMarketingEmails(args.limit, args.after)),
  );

  server.tool(
    "hubspot_get_marketing_email",
    "Obtener un email de marketing especifico con toda su configuracion.",
    {
      emailId: z.string().describe("ID del email de marketing"),
    },
    wrapTool(async (args) => client.getMarketingEmail(args.emailId)),
  );

  server.tool(
    "hubspot_get_marketing_email_stats",
    "Obtener estadisticas de un email de marketing: envios, aperturas, clicks, bounces, unsubs, etc.",
    {
      emailId: z.string().describe("ID del email de marketing"),
    },
    wrapTool(async (args) => client.getMarketingEmailStats(args.emailId)),
  );

  // ── Workflows (Automation Flows) ────────────────────────

  server.tool(
    "hubspot_list_workflows",
    "Listar todos los workflows (flujos de automatizacion) de HubSpot. Retorna ID, nombre, tipo, estado (activo/inactivo) y triggers de enrollment. Util para ver que automatizaciones existen y cuales estan activas.",
    {
      limit: z.number().optional().describe("Max workflows a retornar (default: 100)"),
      after: z.string().optional().describe("Cursor de paginacion"),
    },
    wrapTool(async (args) => client.listWorkflows(args.limit, args.after)),
  );

  server.tool(
    "hubspot_get_workflow",
    "Obtener un workflow especifico de HubSpot por su ID. Retorna la configuracion completa: triggers de enrollment, acciones, condiciones, delays y configuracion de re-enrollment.",
    {
      flowId: z.string().describe("ID del workflow en HubSpot"),
    },
    wrapTool(async (args) => client.getWorkflow(args.flowId)),
  );

  // ── Custom objects & schemas ────────────────────────────

  server.tool(
    "hubspot_list_schemas",
    "Listar todos los schemas de objetos custom en HubSpot. Retorna ID, nombre, propiedades y asociaciones de cada custom object (ej: integrantes, DDJJ, pagos, cotizaciones).",
    {},
    wrapTool(async () => client.listSchemas()),
  );

  server.tool(
    "hubspot_get_contact_custom_objects",
    "Obtener objetos custom asociados a un contacto. Util para obtener integrantes del grupo familiar, DDJJ, pagos, cotizaciones, etc. Primero usar hubspot_list_schemas para conocer los tipos disponibles y sus propiedades.",
    {
      contactId: z.string().describe("ID del contacto en HubSpot"),
      customObjectType: z.string().describe("Tipo del custom object (ej: '2-12345678' o el nombre del schema). Usar hubspot_list_schemas para obtener los tipos disponibles."),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar del custom object. Usar hubspot_list_schemas para ver propiedades disponibles."),
      limit: z.number().optional().describe("Max objetos a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getAssociatedCustomObjects(
      "contacts", args.contactId, args.customObjectType, args.properties, args.limit,
    )),
  );

  server.tool(
    "hubspot_get_deal_custom_objects",
    "Obtener objetos custom asociados a un deal/negocio. Util para obtener integrantes, DDJJ, pagos, cotizaciones asociadas al negocio. Primero usar hubspot_list_schemas para conocer los tipos disponibles.",
    {
      dealId: z.string().describe("ID del deal en HubSpot"),
      customObjectType: z.string().describe("Tipo del custom object (ej: '2-12345678' o el nombre del schema). Usar hubspot_list_schemas para obtener los tipos disponibles."),
      properties: z.array(z.string()).optional().describe("Propiedades a retornar del custom object. Usar hubspot_list_schemas para ver propiedades disponibles."),
      limit: z.number().optional().describe("Max objetos a retornar (default: 100)"),
    },
    wrapTool(async (args) => client.getAssociatedCustomObjects(
      "deals", args.dealId, args.customObjectType, args.properties, args.limit,
    )),
  );
}
