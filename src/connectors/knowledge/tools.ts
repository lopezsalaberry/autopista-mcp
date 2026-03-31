import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { projects, searchEvents, searchHubSpotOps, reportFormats } from "./data.js";

function json(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function registerKnowledgeTools(server: McpServer) {
  server.tool(
    "medicus_project_info",
    "Obtener informacion completa de un proyecto de Medicus: que eventos de Mixpanel trackea, que operaciones de HubSpot realiza, el journey del usuario paso a paso, y notas de configuracion. Proyectos disponibles: arma-tu-plan, portal-socios, whatsapp-flow, huspot-api, asignaciones-dashboard, bases-recontacto, cruce-mios, onboarding-api.",
    {
      project: z.string().describe("Nombre del proyecto (ej: 'arma-tu-plan', 'portal-socios', 'whatsapp-flow', 'huspot-api')"),
      section: z.enum(["all", "events", "hubspot", "journey", "notes"]).optional().describe("Seccion especifica a retornar (default: all)"),
    },
    async (args) => {
      const project = projects[args.project];
      if (!project) {
        const available = Object.keys(projects).join(", ");
        return {
          content: [{ type: "text", text: `Proyecto '${args.project}' no encontrado. Proyectos disponibles: ${available}` }],
          isError: true,
        };
      }

      const section = args.section || "all";

      if (section === "all") {
        return json({
          name: project.name,
          description: project.description,
          framework: project.framework,
          role: project.role,
          totalMixpanelEvents: project.mixpanelEvents.length,
          totalHubSpotOperations: project.hubspotOperations.length,
          mixpanelEvents: project.mixpanelEvents,
          hubspotOperations: project.hubspotOperations,
          userJourney: project.userJourney,
          notes: project.notes,
        });
      }

      if (section === "events") {
        return json({
          project: project.name,
          totalEvents: project.mixpanelEvents.length,
          events: project.mixpanelEvents,
        });
      }

      if (section === "hubspot") {
        return json({
          project: project.name,
          totalOperations: project.hubspotOperations.length,
          operations: project.hubspotOperations,
        });
      }

      if (section === "journey") {
        return json({
          project: project.name,
          journey: project.userJourney?.length ? project.userJourney : "Este proyecto no tiene un user journey definido (es un servicio backend o herramienta interna).",
        });
      }

      if (section === "notes") {
        return json({
          project: project.name,
          notes: project.notes,
        });
      }

      return json(project);
    },
  );

  server.tool(
    "medicus_search_events",
    "Buscar eventos de Mixpanel en TODOS los proyectos de Medicus por nombre, trigger, componente o paso del flujo. Util para encontrar en que proyecto se trackea un evento especifico o que eventos se disparan en un paso determinado.",
    {
      query: z.string().describe("Texto a buscar (ej: 'cotizador', 'paso_3', 'biometrica', 'pago', 'empresas', 'error')"),
    },
    async (args) => {
      const results = searchEvents(args.query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No se encontraron eventos que coincidan con '${args.query}'. Intenta con otro termino.` }],
        };
      }

      return json({
        query: args.query,
        totalResults: results.length,
        results: results.map((r) => ({
          project: r.project,
          eventName: r.event.name,
          trigger: r.event.trigger,
          properties: r.event.properties,
          component: r.event.component,
          step: r.event.step,
        })),
      });
    },
  );

  server.tool(
    "medicus_search_hubspot_ops",
    "Buscar operaciones de HubSpot en TODOS los proyectos de Medicus por endpoint, descripcion o trigger. Util para entender que proyecto hace que operacion en el CRM.",
    {
      query: z.string().describe("Texto a buscar (ej: 'prospecto', 'ddjj', 'firma', 'contacto', 'scoring')"),
    },
    async (args) => {
      const results = searchHubSpotOps(args.query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No se encontraron operaciones HubSpot que coincidan con '${args.query}'.` }],
        };
      }

      return json({
        query: args.query,
        totalResults: results.length,
        results: results.map((r) => ({
          project: r.project,
          method: r.operation.method,
          endpoint: r.operation.endpoint,
          description: r.operation.description,
          trigger: r.operation.trigger,
          dataFlow: r.operation.dataFlow,
        })),
      });
    },
  );

  server.tool(
    "medicus_report_format",
    "Obtener las instrucciones detalladas para generar un reporte de Medicus. IMPORTANTE: Siempre consultar esta herramienta ANTES de generar un reporte de alta, investigacion de contacto, analisis de proceso de afiliacion, consulta de metricas/funnel de conversion, o consulta de MQLs. Contiene el formato exacto, las queries de Mixpanel y HubSpot necesarias, y el orden de la informacion. Tipos disponibles: 'alta', 'metricas', 'mqls'.",
    {
      type: z.string().describe("Tipo de reporte: 'alta' (reporte de alta exitosa o fallida), 'metricas' (funnel de conversion y metricas de adquisicion), 'mqls' (Marketing Qualified Leads con filtros de categoria, owners excluidos y edad)"),
    },
    async (args) => {
      const format = reportFormats[args.type];
      if (!format) {
        const available = Object.keys(reportFormats).join(", ");
        return {
          content: [{ type: "text", text: `Tipo de reporte '${args.type}' no encontrado. Tipos disponibles: ${available}` }],
          isError: true,
        };
      }

      return json(format);
    },
  );

  server.tool(
    "medicus_ecosystem_overview",
    "Obtener una vista panoramica del ecosistema completo de Medicus: todos los proyectos, cuantos eventos trackean, cuantas operaciones HubSpot tienen, y el flujo de negocio completo desde la primera visita hasta la afiliacion.",
    {},
    async () => {
      const overview = Object.entries(projects).map(([key, p]) => ({
        project: key,
        description: p.description,
        role: p.role,
        framework: p.framework,
        mixpanelEvents: p.mixpanelEvents.length,
        hubspotOperations: p.hubspotOperations.length,
        hasUserJourney: (p.userJourney?.length ?? 0) > 0,
      }));

      const totalEvents = overview.reduce((sum, p) => sum + p.mixpanelEvents, 0);
      const totalHubSpotOps = overview.reduce((sum, p) => sum + p.hubspotOperations, 0);

      return json({
        summary: {
          totalProjects: overview.length,
          totalMixpanelEvents: totalEvents,
          totalHubSpotOperations: totalHubSpotOps,
          projectsWithMixpanel: overview.filter((p) => p.mixpanelEvents > 0).map((p) => p.project),
          projectsWithHubSpot: overview.filter((p) => p.hubspotOperations > 0).map((p) => p.project),
        },
        projects: overview,
        businessFlow: [
          "1. ENTRADA: Usuario llega via web (arma-tu-plan) o WhatsApp (whatsapp-flow)",
          "2. COTIZACION: Selecciona cobertura, cartilla, plan → eventos Mixpanel trackean cada paso",
          "3. CREACION EN CRM: Prospecto creado en HubSpot via huspot-api (gateway central)",
          "4. ASIGNACION: asignaciones-dashboard calcula scoring y asigna asesor al contacto",
          "5. REGISTRO: Usuario redirigido a portal-socios para completar alta online",
          "6. PORTAL: DNI, biometria, DDJJ, documentos, firma, pago → todo trackeado en Mixpanel con checkIn/checkOut",
          "7. AFILIACION: prospectos-nest-js transforma prospecto en afiliado via Oracle PL/SQL",
          "8. MEDICARD: Se emite la credencial de socio",
          "",
          "HERRAMIENTAS INTERNAS:",
          "- bases-recontacto: Cruza listas de contactos contra HubSpot",
          "- cruce-mios: Reconcilia contactos de campana MIOS",
          "- asignaciones-dashboard: Scoring y asignacion de asesores",
        ],
        dataSources: {
          "HubSpot CRM": "Fuente de verdad del pipeline de ventas (contactos, deals, notas)",
          "Oracle DB": "Fuente de verdad de afiliados/socios activos",
          "Mixpanel": "Analytics de comportamiento de usuario en frontends",
        },
      });
    },
  );
}
