import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "1.0.0";
  }
}

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Autopista MCP",
    version: getVersion(),
    description: "Servidor MCP (Model Context Protocol) que expone herramientas de consulta para Mixpanel Analytics y HubSpot CRM del ecosistema Medicus. Soporta transporte stdio (Claude Code/Desktop) y HTTP Streamable (claude.ai web).",
    contact: {
      name: "Equipo de Desarrollo Medicus",
      email: "desarrollo@medicus.com.ar",
    },
    license: {
      name: "UNLICENSED",
    },
  },
  servers: [
    { url: "http://localhost:3000", description: "Local development" },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health Check",
        description: "Valida el estado del servidor y sus dependencias (Mixpanel, HubSpot).",
        tags: ["Infraestructura"],
        responses: {
          "200": {
            description: "Servicio saludable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "healthy",
                  version: "1.0.0",
                  timestamp: "2026-03-17T10:30:00Z",
                  dependencies: {
                    mixpanel: "healthy",
                    hubspot: "healthy",
                  },
                },
              },
            },
          },
          "503": {
            description: "Servicio con problemas",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "unhealthy",
                  version: "1.0.0",
                  timestamp: "2026-03-17T10:30:00Z",
                  dependencies: {
                    mixpanel: "unhealthy",
                    hubspot: "healthy",
                  },
                },
              },
            },
          },
        },
      },
    },
    "/version": {
      get: {
        summary: "Version Check",
        description: "Retorna la version actual y el ambiente de ejecucion.",
        tags: ["Infraestructura"],
        responses: {
          "200": {
            description: "Informacion de version",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VersionResponse" },
                example: {
                  version: "1.0.0",
                  environment: "production",
                },
              },
            },
          },
        },
      },
    },
    "/mcp": {
      post: {
        summary: "MCP Streamable HTTP Endpoint",
        description: "Endpoint principal del protocolo MCP (JSON-RPC 2.0). Los clientes MCP (claude.ai, Claude Desktop) se conectan aqui para descubrir y ejecutar herramientas.",
        tags: ["MCP Protocol"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/JsonRpcRequest" },
              example: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Respuesta JSON-RPC 2.0",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JsonRpcResponse" },
              },
            },
          },
          "400": { description: "Request invalido" },
          "429": { description: "Rate limit excedido" },
        },
      },
      get: {
        summary: "MCP SSE Stream",
        description: "Endpoint GET para Server-Sent Events del protocolo MCP.",
        tags: ["MCP Protocol"],
        responses: {
          "200": { description: "SSE stream" },
          "405": { description: "Method not allowed (si no hay sesion activa)" },
        },
      },
      delete: {
        summary: "MCP Session Cleanup",
        description: "Cierra la sesion MCP activa.",
        tags: ["MCP Protocol"],
        responses: {
          "200": { description: "Sesion cerrada" },
          "405": { description: "Method not allowed" },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "unhealthy"] },
          version: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          dependencies: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["healthy", "unhealthy", "degraded"],
            },
          },
        },
      },
      VersionResponse: {
        type: "object",
        properties: {
          version: { type: "string" },
          environment: { type: "string" },
        },
      },
      JsonRpcRequest: {
        type: "object",
        properties: {
          jsonrpc: { type: "string", example: "2.0" },
          id: { type: "number" },
          method: { type: "string", example: "tools/list" },
          params: { type: "object" },
        },
        required: ["jsonrpc", "method"],
      },
      JsonRpcResponse: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { type: "number" },
          result: { type: "object" },
          error: { type: "object" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
              traceId: { type: "string" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: "Infraestructura", description: "Health check, version y documentacion" },
    { name: "MCP Protocol", description: "Endpoint del protocolo Model Context Protocol (JSON-RPC 2.0)" },
  ],
};
