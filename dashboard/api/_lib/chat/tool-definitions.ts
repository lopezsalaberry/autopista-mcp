// Anthropic API tool definitions — one entry per MCP tool
// Auto-translated from Zod schemas in src/connectors/*/tools.ts

export const CHAT_TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  // ────────────────────────────────────────────────────────────────
  // Mixpanel tools (6)
  // ────────────────────────────────────────────────────────────────
  {
    name: "mixpanel_segmentation",
    description:
      "Consultar conteos de un evento en Mixpanel a lo largo del tiempo, con opcion de segmentar por propiedades. Ideal para ver tendencias, comparar periodos o desglosar por propiedad (navegador, ciudad, UTM, etc).",
    input_schema: {
      type: "object" as const,
      properties: {
        event: {
          type: "string",
          description: "Nombre del evento (ej: 'cotizador__paso_1__view')",
        },
        from_date: {
          type: "string",
          description: "Fecha inicio en formato yyyy-mm-dd",
        },
        to_date: {
          type: "string",
          description: "Fecha fin en formato yyyy-mm-dd",
        },
        unit: {
          type: "string",
          enum: ["minute", "hour", "day", "week", "month"],
          description: "Granularidad temporal (default: day)",
        },
        type: {
          type: "string",
          enum: ["general", "unique", "average"],
          description:
            "general=total eventos, unique=usuarios unicos, average=promedio por usuario",
        },
        on: {
          type: "string",
          description:
            'Propiedad para segmentar (ej: \'properties["$browser"]\' o \'properties["utm_source"]\')',
        },
        where: {
          type: "string",
          description:
            'Filtro de expresion (ej: \'properties["$city"]=="Buenos Aires"\')',
        },
      },
      required: ["event", "from_date", "to_date"],
    },
  },
  {
    name: "mixpanel_export_events",
    description:
      "Exportar eventos crudos de Mixpanel. Devuelve cada evento individual con todas sus propiedades. Usar para analisis detallado de eventos especificos. ATENCION: limitar el rango de fechas y usar limit para evitar respuestas enormes.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_date: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        to_date: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        event: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de nombres de eventos a exportar (si no se especifica, exporta todos)",
        },
        where: {
          type: "string",
          description:
            "Filtro (ej: 'properties[\"$city\"]==\"Buenos Aires\"')",
        },
        limit: {
          type: "number",
          description:
            "Maximo de eventos a devolver (default: 100, max recomendado: 1000)",
        },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "mixpanel_profiles",
    description:
      "Consultar perfiles de usuario en Mixpanel. Permite filtrar por propiedades del perfil y obtener datos demograficos, ultimo evento, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        where: {
          type: "string",
          description:
            "Filtro de perfil (ej: 'properties[\"$city\"]==\"Buenos Aires\"' o 'properties[\"$last_seen\"]>\"2026-01-01\"')",
        },
        output_properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a incluir en la respuesta (ej: ['$email', '$name', '$city'])",
        },
        page_size: {
          type: "number",
          description: "Resultados por pagina (default: 25, max: 1000)",
        },
      },
      required: [],
    },
  },
  {
    name: "mixpanel_funnels",
    description:
      "Obtener datos de conversion de un funnel existente en Mixpanel. Requiere el funnel_id que se puede ver en la URL de Mixpanel al abrir el funnel.",
    input_schema: {
      type: "object" as const,
      properties: {
        funnel_id: {
          type: "number",
          description: "ID del funnel (visible en la URL de Mixpanel)",
        },
        from_date: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        to_date: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        length: {
          type: "number",
          description: "Ventana de conversion en dias",
        },
        unit: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Granularidad temporal",
        },
        on: {
          type: "string",
          description: "Propiedad para segmentar",
        },
        where: {
          type: "string",
          description: "Filtro de expresion",
        },
      },
      required: ["funnel_id", "from_date", "to_date"],
    },
  },
  {
    name: "mixpanel_retention",
    description:
      "Obtener datos de retencion de cohortes en Mixpanel. Muestra que porcentaje de usuarios que hicieron un evento inicial vuelven a hacer otro evento en periodos posteriores.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_date: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        to_date: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        born_event: {
          type: "string",
          description:
            "Evento inicial que define la cohorte (ej: 'Sign Up')",
        },
        event: {
          type: "string",
          description: "Evento de retorno que se mide",
        },
        retention_type: {
          type: "string",
          enum: ["birth", "compounded"],
          description:
            "birth=desde primer evento, compounded=acumulativo",
        },
        unit: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Granularidad de los periodos",
        },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "mixpanel_jql",
    description:
      "Ejecutar una consulta JQL (JavaScript Query Language) personalizada en Mixpanel. Permite consultas complejas que no se pueden hacer con los otros endpoints. El script debe definir una funcion main() que retorne datos.",
    input_schema: {
      type: "object" as const,
      properties: {
        script: {
          type: "string",
          description:
            "Script JQL. Ejemplo:\nfunction main() {\n  return Events({\n    from_date: '2026-01-01',\n    to_date: '2026-01-31'\n  }).groupBy(['name'], mixpanel.reducer.count())\n}",
        },
      },
      required: ["script"],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // HubSpot tools (33)
  // ────────────────────────────────────────────────────────────────
  {
    name: "hubspot_search_contacts",
    description:
      "Buscar contactos en HubSpot CRM. Puede buscar por texto libre (query) o con filtros estructurados por propiedades. Soporta paginacion.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Busqueda de texto libre (busca en nombre, email, telefono, empresa)",
        },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              propertyName: {
                type: "string",
                description:
                  "Nombre de la propiedad (ej: 'email', 'firstname', 'hs_lead_status')",
              },
              operator: {
                type: "string",
                description:
                  "Operador: EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN, HAS_PROPERTY, NOT_HAS_PROPERTY, IN",
              },
              value: {
                type: "string",
                description: "Valor a comparar",
              },
            },
            required: ["propertyName", "operator", "value"],
          },
          description:
            "Filtros estructurados. Ej: [{propertyName:'email', operator:'EQ', value:'test@mail.com'}]",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar (ej: ['email','firstname','lastname','phone','hs_lead_status']). Si no se especifica, retorna las default.",
        },
        limit: {
          type: "number",
          description: "Max resultados (default: 10, max: 100)",
        },
        after: {
          type: "string",
          description:
            "Cursor de paginacion (viene en paging.next.after de la respuesta anterior)",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_contact",
    description:
      "Obtener un contacto especifico de HubSpot por su ID. Retorna todas las propiedades solicitadas del contacto.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar (ej: ['email','firstname','lastname','phone','hs_lead_status','hubspot_owner_id'])",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "hubspot_search_deals",
    description:
      "Buscar deals (negocios/oportunidades) en HubSpot CRM. Puede buscar por texto o filtros por propiedades como pipeline, stage, monto, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Busqueda de texto libre",
        },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              propertyName: {
                type: "string",
                description:
                  "Nombre de la propiedad (ej: 'email', 'firstname', 'hs_lead_status')",
              },
              operator: {
                type: "string",
                description:
                  "Operador: EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN, HAS_PROPERTY, NOT_HAS_PROPERTY, IN",
              },
              value: {
                type: "string",
                description: "Valor a comparar",
              },
            },
            required: ["propertyName", "operator", "value"],
          },
          description:
            "Filtros estructurados. Ej: [{propertyName:'dealstage', operator:'EQ', value:'closedwon'}]",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar (ej: ['dealname','amount','dealstage','pipeline','closedate','hubspot_owner_id'])",
        },
        limit: {
          type: "number",
          description: "Max resultados (default: 10, max: 100)",
        },
        after: {
          type: "string",
          description: "Cursor de paginacion",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_deal",
    description:
      "Obtener un deal especifico de HubSpot por su ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "Propiedades a retornar",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "hubspot_list_pipelines",
    description:
      "Listar todos los pipelines de HubSpot y sus stages. Util para entender el flujo de ventas y los posibles estados de un deal.",
    input_schema: {
      type: "object" as const,
      properties: {
        objectType: {
          type: "string",
          description: "Tipo de objeto (default: 'deals')",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_list_owners",
    description:
      "Listar los owners (asesores/vendedores) de HubSpot. Retorna nombre, email y equipos asignados.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max resultados (default: 100)",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_properties",
    description:
      "Listar las definiciones de propiedades de un tipo de objeto en HubSpot. Util para saber que propiedades existen, sus tipos y opciones validas.",
    input_schema: {
      type: "object" as const,
      properties: {
        objectType: {
          type: "string",
          description:
            "Tipo de objeto: 'contacts', 'deals', 'companies', 'notes'",
        },
      },
      required: ["objectType"],
    },
  },
  {
    name: "hubspot_get_contact_notes",
    description:
      "Obtener todas las notas asociadas a un contacto. Retorna el cuerpo de la nota, timestamp, owner y adjuntos.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max notas a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_contact_calls",
    description:
      "Obtener todas las llamadas asociadas a un contacto. Retorna titulo, notas, direccion, disposicion, duracion, estado y grabacion.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max llamadas a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_contact_emails",
    description:
      "Obtener todos los emails asociados a un contacto. Retorna asunto, cuerpo, direccion, estado, remitente y destinatario.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max emails a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_contact_tasks",
    description:
      "Obtener todas las tareas asociadas a un contacto. Retorna asunto, cuerpo, estado, prioridad, tipo y owner.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max tareas a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_contact_meetings",
    description:
      "Obtener todas las reuniones asociadas a un contacto. Retorna titulo, cuerpo, horarios, resultado, ubicacion y owner.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max reuniones a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_contact_deals",
    description:
      "Obtener todos los deals/negocios asociados a un contacto. Retorna nombre, monto, etapa, pipeline, fecha de cierre y owner.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades del deal a retornar (default: dealname, amount, dealstage, pipeline, closedate, hubspot_owner_id, createdate)",
        },
        limit: {
          type: "number",
          description: "Max deals a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_owner",
    description:
      "Obtener un owner/asesor especifico de HubSpot por su ID. Retorna nombre, email y equipos.",
    input_schema: {
      type: "object" as const,
      properties: {
        ownerId: {
          type: "string",
          description: "ID del owner en HubSpot",
        },
      },
      required: ["ownerId"],
    },
  },
  {
    name: "hubspot_get_contact_communications",
    description:
      "Obtener todas las comunicaciones (WhatsApp, SMS, mensajeria) asociadas a un contacto. Retorna canal, cuerpo del mensaje, timestamp y owner.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max comunicaciones a retornar (default: 100)",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "hubspot_get_deal_notes",
    description:
      "Obtener todas las notas asociadas a un deal/negocio. Retorna cuerpo, timestamp, owner y adjuntos.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max notas a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_calls",
    description:
      "Obtener todas las llamadas asociadas a un deal/negocio.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max llamadas a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_emails",
    description:
      "Obtener todos los emails asociados a un deal/negocio.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max emails a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_tasks",
    description:
      "Obtener todas las tareas asociadas a un deal/negocio.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max tareas a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_meetings",
    description:
      "Obtener todas las reuniones asociadas a un deal/negocio.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max reuniones a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_communications",
    description:
      "Obtener todas las comunicaciones (WhatsApp, SMS, mensajeria) asociadas a un deal/negocio.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max comunicaciones a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_deal_contacts",
    description:
      "Obtener todos los contactos asociados a un deal/negocio. Util para ver quienes participan en una oportunidad.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades del contacto a retornar (default: email, firstname, lastname, phone, hs_lead_status, lifecyclestage)",
        },
        limit: {
          type: "number",
          description: "Max contactos a retornar (default: 100)",
        },
      },
      required: ["dealId"],
    },
  },
  {
    name: "hubspot_get_property_history",
    description:
      "Obtener el historial de cambios de propiedades de un contacto o deal. Muestra quien cambio el valor, cuando, desde que fuente (workflow, API, manual) y el valor anterior. Ideal para diagnosticar problemas de asignacion, cambios de etapa, y bugs de workflows.",
    input_schema: {
      type: "object" as const,
      properties: {
        objectType: {
          type: "string",
          description: "Tipo de objeto: 'contacts' o 'deals'",
        },
        objectId: {
          type: "string",
          description: "ID del objeto en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades de las que se quiere ver el historial (ej: ['hubspot_owner_id', 'hs_lead_status', 'dealstage'])",
        },
      },
      required: ["objectType", "objectId", "properties"],
    },
  },
  {
    name: "hubspot_search_lists",
    description:
      "Buscar listas de HubSpot por nombre. Retorna ID, nombre, tamano, tipo (DYNAMIC/STATIC) y fechas. Util para encontrar listas de enrollment de workflows, segmentos, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Texto a buscar en el nombre de la lista",
        },
        limit: {
          type: "number",
          description: "Max resultados (default: 25)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "hubspot_get_list",
    description:
      "Obtener una lista especifica de HubSpot por su ID. Retorna nombre, tamano, tipo y filtros de la lista.",
    input_schema: {
      type: "object" as const,
      properties: {
        listId: {
          type: "string",
          description: "ID de la lista en HubSpot",
        },
      },
      required: ["listId"],
    },
  },
  {
    name: "hubspot_get_list_members",
    description:
      "Obtener los contactos que pertenecen a una lista de HubSpot. Retorna IDs de contactos con paginacion.",
    input_schema: {
      type: "object" as const,
      properties: {
        listId: {
          type: "string",
          description: "ID de la lista en HubSpot",
        },
        limit: {
          type: "number",
          description: "Max miembros a retornar (default: 100)",
        },
        after: {
          type: "string",
          description: "Cursor de paginacion",
        },
      },
      required: ["listId"],
    },
  },
  {
    name: "hubspot_search_companies",
    description:
      "Buscar empresas en HubSpot CRM. Puede buscar por texto libre o con filtros estructurados. Util para investigar cuentas de empresas, PYMES y corporativos.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Busqueda de texto libre",
        },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              propertyName: {
                type: "string",
                description:
                  "Nombre de la propiedad (ej: 'email', 'firstname', 'hs_lead_status')",
              },
              operator: {
                type: "string",
                description:
                  "Operador: EQ, NEQ, LT, LTE, GT, GTE, CONTAINS_TOKEN, NOT_CONTAINS_TOKEN, HAS_PROPERTY, NOT_HAS_PROPERTY, IN",
              },
              value: {
                type: "string",
                description: "Valor a comparar",
              },
            },
            required: ["propertyName", "operator", "value"],
          },
          description: "Filtros estructurados",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar (ej: ['name','domain','industry','hubspot_owner_id'])",
        },
        limit: {
          type: "number",
          description: "Max resultados (default: 10)",
        },
        after: {
          type: "string",
          description: "Cursor de paginacion",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_company",
    description:
      "Obtener una empresa especifica de HubSpot por su ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ID de la empresa en HubSpot",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "Propiedades a retornar",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "hubspot_list_marketing_emails",
    description:
      "Listar emails de marketing de HubSpot. Retorna nombre, asunto, tipo, estado, fecha de envio y estadisticas (opens, clicks, bounces).",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max emails a retornar (default: 50)",
        },
        after: {
          type: "string",
          description: "Cursor de paginacion",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_marketing_email",
    description:
      "Obtener un email de marketing especifico con toda su configuracion.",
    input_schema: {
      type: "object" as const,
      properties: {
        emailId: {
          type: "string",
          description: "ID del email de marketing",
        },
      },
      required: ["emailId"],
    },
  },
  {
    name: "hubspot_get_marketing_email_stats",
    description:
      "Obtener estadisticas de un email de marketing: envios, aperturas, clicks, bounces, unsubs, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        emailId: {
          type: "string",
          description: "ID del email de marketing",
        },
      },
      required: ["emailId"],
    },
  },
  {
    name: "hubspot_list_workflows",
    description:
      "Listar todos los workflows (flujos de automatizacion) de HubSpot. Retorna ID, nombre, tipo, estado (activo/inactivo) y triggers de enrollment. Util para ver que automatizaciones existen y cuales estan activas.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max workflows a retornar (default: 100)",
        },
        after: {
          type: "string",
          description: "Cursor de paginacion",
        },
      },
      required: [],
    },
  },
  {
    name: "hubspot_get_workflow",
    description:
      "Obtener un workflow especifico de HubSpot por su ID. Retorna la configuracion completa: triggers de enrollment, acciones, condiciones, delays y configuracion de re-enrollment.",
    input_schema: {
      type: "object" as const,
      properties: {
        flowId: {
          type: "string",
          description: "ID del workflow en HubSpot",
        },
      },
      required: ["flowId"],
    },
  },
  {
    name: "hubspot_list_schemas",
    description:
      "Listar todos los schemas de objetos custom en HubSpot. Retorna ID, nombre, propiedades y asociaciones de cada custom object (ej: integrantes, DDJJ, pagos, cotizaciones).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "hubspot_get_contact_custom_objects",
    description:
      "Obtener objetos custom asociados a un contacto. Util para obtener integrantes del grupo familiar, DDJJ, pagos, cotizaciones, etc. Primero usar hubspot_list_schemas para conocer los tipos disponibles y sus propiedades.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string",
          description: "ID del contacto en HubSpot",
        },
        customObjectType: {
          type: "string",
          description:
            "Tipo del custom object (ej: '2-12345678' o el nombre del schema). Usar hubspot_list_schemas para obtener los tipos disponibles.",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar del custom object. Usar hubspot_list_schemas para ver propiedades disponibles.",
        },
        limit: {
          type: "number",
          description: "Max objetos a retornar (default: 100)",
        },
      },
      required: ["contactId", "customObjectType"],
    },
  },
  {
    name: "hubspot_get_deal_custom_objects",
    description:
      "Obtener objetos custom asociados a un deal/negocio. Util para obtener integrantes, DDJJ, pagos, cotizaciones asociadas al negocio. Primero usar hubspot_list_schemas para conocer los tipos disponibles.",
    input_schema: {
      type: "object" as const,
      properties: {
        dealId: {
          type: "string",
          description: "ID del deal en HubSpot",
        },
        customObjectType: {
          type: "string",
          description:
            "Tipo del custom object (ej: '2-12345678' o el nombre del schema). Usar hubspot_list_schemas para obtener los tipos disponibles.",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Propiedades a retornar del custom object. Usar hubspot_list_schemas para ver propiedades disponibles.",
        },
        limit: {
          type: "number",
          description: "Max objetos a retornar (default: 100)",
        },
      },
      required: ["dealId", "customObjectType"],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // Knowledge tools (5)
  // ────────────────────────────────────────────────────────────────
  {
    name: "medicus_project_info",
    description:
      "Obtener informacion completa de un proyecto de Medicus: que eventos de Mixpanel trackea, que operaciones de HubSpot realiza, el journey del usuario paso a paso, y notas de configuracion. Proyectos disponibles: arma-tu-plan, portal-socios, whatsapp-flow, huspot-api, asignaciones-dashboard, bases-recontacto, cruce-mios, onboarding-api.",
    input_schema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description:
            "Nombre del proyecto (ej: 'arma-tu-plan', 'portal-socios', 'whatsapp-flow', 'huspot-api')",
        },
        section: {
          type: "string",
          enum: ["all", "events", "hubspot", "journey", "notes"],
          description:
            "Seccion especifica a retornar (default: all)",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "medicus_search_events",
    description:
      "Buscar eventos de Mixpanel en TODOS los proyectos de Medicus por nombre, trigger, componente o paso del flujo. Util para encontrar en que proyecto se trackea un evento especifico o que eventos se disparan en un paso determinado.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Texto a buscar (ej: 'cotizador', 'paso_3', 'biometrica', 'pago', 'empresas', 'error')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "medicus_search_hubspot_ops",
    description:
      "Buscar operaciones de HubSpot en TODOS los proyectos de Medicus por endpoint, descripcion o trigger. Util para entender que proyecto hace que operacion en el CRM.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Texto a buscar (ej: 'prospecto', 'ddjj', 'firma', 'contacto', 'scoring')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "medicus_report_format",
    description:
      "Obtener las instrucciones detalladas para generar un reporte de Medicus. IMPORTANTE: Siempre consultar esta herramienta ANTES de generar un reporte de alta, investigacion de contacto, analisis de proceso de afiliacion, consulta de metricas/funnel de conversion, o consulta de MQLs. Contiene el formato exacto, las queries de Mixpanel y HubSpot necesarias, y el orden de la informacion. Tipos disponibles: 'alta', 'metricas', 'mqls'.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description:
            "Tipo de reporte: 'alta' (reporte de alta exitosa o fallida), 'metricas' (funnel de conversion y metricas de adquisicion), 'mqls' (Marketing Qualified Leads con filtros de categoria, owners excluidos y edad)",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "medicus_ecosystem_overview",
    description:
      "Obtener una vista panoramica del ecosistema completo de Medicus: todos los proyectos, cuantos eventos trackean, cuantas operaciones HubSpot tienen, y el flujo de negocio completo desde la primera visita hasta la afiliacion.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // Meta Ads tools (4)
  // ────────────────────────────────────────────────────────────────
  {
    name: "meta_ads_get_campaigns",
    description:
      "Listar campanas de Meta Ads (Facebook/Instagram). Devuelve nombre, estado, objetivo, presupuesto y fechas de cada campana.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"],
          description: "Filtrar por estado (default: todas)",
        },
        limit: {
          type: "number",
          description: "Max campanas a devolver (default: 100)",
        },
      },
      required: [],
    },
  },
  {
    name: "meta_ads_account_insights",
    description:
      "Obtener metricas generales de la cuenta de Meta Ads por rango de fecha. Incluye spend, impressions, reach, clicks, CPC, CPM, CTR y acciones (conversiones). Permite desglosar por dia y por breakdowns (age, gender, country, publisher_platform, etc).",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        time_increment: {
          type: "string",
          description:
            "Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)",
        },
        breakdowns: {
          type: "string",
          description:
            "Desglosar por: 'age', 'gender', 'country', 'publisher_platform', 'device_platform'. Se pueden combinar con coma.",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "meta_ads_campaign_insights",
    description:
      "Obtener metricas por campana de Meta Ads. Devuelve spend, impressions, reach, clicks, CPC, CPM, CTR y conversiones desglosado por campana. Ideal para comparar rendimiento entre campanas.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        time_increment: {
          type: "string",
          description:
            "Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)",
        },
        campaign_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs de campanas especificas (si no se especifica, devuelve todas)",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "meta_ads_adset_insights",
    description:
      "Obtener metricas por conjunto de anuncios (ad set) de Meta Ads. Desglose mas granular que por campana: muestra spend, clicks, conversiones por cada ad set.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        time_increment: {
          type: "string",
          description:
            "Granularidad: '1' (diario), '7' (semanal), 'monthly', 'all_days' (default: all_days)",
        },
        campaign_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Filtrar por IDs de campana (si no se especifica, devuelve todos los ad sets)",
        },
      },
      required: ["since", "until"],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // Google Ads tools (4)
  // ────────────────────────────────────────────────────────────────
  {
    name: "google_ads_account_metrics",
    description:
      "Obtener metricas generales de la cuenta de Google Ads por rango de fecha. Devuelve spend, impressions, clicks, conversions, CTR, CPC y CPM por dia.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "google_ads_campaign_metrics",
    description:
      "Obtener metricas por campana de Google Ads. Devuelve spend, impressions, clicks, conversions, CTR, CPC desglosado por campana y dia. Ideal para comparar rendimiento entre campanas de Search, Display, Video, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        campaign_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs de campanas especificas (si no se especifica, devuelve todas)",
        },
        status: {
          type: "string",
          enum: ["ENABLED", "PAUSED", "REMOVED"],
          description: "Filtrar por estado de campana",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "google_ads_keyword_metrics",
    description:
      "Obtener metricas por keyword de Google Ads. Muestra rendimiento de cada palabra clave: impressions, clicks, spend, conversions, CTR y CPC. Util para optimizacion de Search campaigns.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Fecha inicio yyyy-mm-dd",
        },
        until: {
          type: "string",
          description: "Fecha fin yyyy-mm-dd",
        },
        campaign_ids: {
          type: "array",
          items: { type: "string" },
          description: "Filtrar por IDs de campana",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "google_ads_query",
    description:
      "Ejecutar una consulta GAQL (Google Ads Query Language) personalizada. Permite consultas avanzadas sobre cualquier recurso de Google Ads. Referencia: https://developers.google.com/google-ads/api/fields/v18/overview",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Consulta GAQL. Ejemplo:\nSELECT campaign.name, metrics.clicks, metrics.impressions\nFROM campaign\nWHERE segments.date DURING LAST_7_DAYS\nORDER BY metrics.clicks DESC",
        },
      },
      required: ["query"],
    },
  },
];
