import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import pinoHttp from "pino-http";
// @ts-ignore - pino-http types mismatch with ESM
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createMcpServer } from "./mcp.js";
import { logger } from "./shared/logger.js";
import { swaggerSpec } from "./shared/swagger.js";
import { config } from "./shared/config.js";
import { KeycloakOAuthProvider } from "./auth/keycloak-provider.js";
import { auditLogger } from "./auth/audit-logger.js";
import dashboardRouter from "./dashboard/dashboard-router.js";

const VERSION = "1.0.0";

export function createApp(): express.Express {
  const app = express();

  // --- Middlewares de seguridad ---
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "10mb" }));

  // --- Rate limiting ---
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Demasiadas peticiones, intente nuevamente en un momento",
        timestamp: new Date().toISOString(),
      },
    },
  }));

  // --- Trazabilidad ---
  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers["x-trace-id"] as string) || randomUUID();
    const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
    req.headers["x-trace-id"] = traceId;
    req.headers["x-correlation-id"] = correlationId;
    res.setHeader("X-Trace-Id", traceId);
    res.setHeader("X-Correlation-Id", correlationId);
    next();
  });

  // TYPE: pinoHttp has ESM/CJS dual-export interop — need to handle both default and direct export
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinoHttpFn = (pinoHttp as Record<string, unknown>).default ?? pinoHttp;
  app.use((pinoHttpFn as (opts: Record<string, unknown>) => import("express").RequestHandler)({ logger }));

  // --- Dashboard API (autenticacion propia via API key) ---
  app.use("/api/dashboard", dashboardRouter);

  // --- OAuth 2.1 con Keycloak ---
  const keycloakProvider = new KeycloakOAuthProvider({
    keycloakUrl: config.KEYCLOAK_URL,
    realm: config.KEYCLOAK_REALM,
    clientId: config.KEYCLOAK_CLIENT_ID,
    clientSecret: config.KEYCLOAK_CLIENT_SECRET,
    mcpBaseUrl: config.MCP_BASE_URL,
    requiredRole: config.KEYCLOAK_REQUIRED_ROLE,
  });

  const mcpBaseUrl = new URL(config.MCP_BASE_URL);
  const mcpResourceUrl = new URL(`${config.MCP_BASE_URL}/mcp`);

  // Monta endpoints OAuth: /authorize, /token, /register, /revoke, /.well-known/*
  app.use(mcpAuthRouter({
    provider: keycloakProvider,
    issuerUrl: mcpBaseUrl,
    baseUrl: mcpBaseUrl,
    resourceServerUrl: mcpResourceUrl,
    resourceName: "Autopista MCP - Medicus Analytics & CRM",
    serviceDocumentationUrl: new URL(`${config.MCP_BASE_URL}/api-docs`),
    scopesSupported: ["openid", "mcp:read"],
  }));

  // Callback de Keycloak (redirige al usuario de vuelta al cliente MCP)
  app.get("/oauth/callback", (req: Request, res: Response) => {
    keycloakProvider.handleCallback(
      { query: req.query as Record<string, string | undefined> },
      res,
    );
  });

  // Middleware de autenticacion para /mcp
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpResourceUrl);
  const authMiddleware = requireBearerAuth({
    verifier: keycloakProvider,
    requiredScopes: [],
    resourceMetadataUrl,
  });

  // --- Swagger ---
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // --- Health Check ---
  app.get("/health", async (_req: Request, res: Response) => {
    const dependencies: Record<string, string> = {};
    let allHealthy = true;

    // Check Mixpanel (segmentation endpoint con rango minimo)
    try {
      const today = new Date().toISOString().split("T")[0];
      const mpUrl = new URL("https://mixpanel.com/api/query/segmentation");
      mpUrl.searchParams.set("project_id", config.MIXPANEL_PROJECT_ID);
      mpUrl.searchParams.set("event", "___health_check___");
      mpUrl.searchParams.set("from_date", today);
      mpUrl.searchParams.set("to_date", today);
      const mpRes = await fetch(mpUrl.toString(), {
        headers: {
          Authorization: "Basic " + Buffer.from(`${config.MIXPANEL_SERVICE_ACCOUNT_USERNAME}:${config.MIXPANEL_SERVICE_ACCOUNT_SECRET}`).toString("base64"),
        },
        signal: AbortSignal.timeout(5000),
      });
      dependencies.mixpanel = mpRes.ok ? "healthy" : "unhealthy";
    } catch {
      dependencies.mixpanel = "unhealthy";
      allHealthy = false;
    }

    // Check HubSpot
    try {
      const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
        headers: { Authorization: `Bearer ${config.HUBSPOT_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      });
      dependencies.hubspot = hsRes.ok ? "healthy" : "unhealthy";
    } catch {
      dependencies.hubspot = "unhealthy";
      allHealthy = false;
    }

    // Check Keycloak
    try {
      const kcRes = await fetch(
        `${config.KEYCLOAK_URL}/realms/${config.KEYCLOAK_REALM}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(5000) },
      );
      dependencies.keycloak = kcRes.ok ? "healthy" : "unhealthy";
    } catch {
      dependencies.keycloak = "unhealthy";
      allHealthy = false;
    }

    if (Object.values(dependencies).includes("unhealthy")) {
      allHealthy = false;
    }

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: allHealthy ? "healthy" : "unhealthy",
      version: VERSION,
      timestamp: new Date().toISOString(),
      dependencies,
    });
  });

  // --- Version ---
  app.get("/version", (_req: Request, res: Response) => {
    res.json({
      version: VERSION,
      environment: process.env.NODE_ENV || "development",
    });
  });

  // --- MCP Streamable HTTP (protegido con OAuth) ---
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", authMiddleware, auditLogger, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createMcpServer();
    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", authMiddleware, auditLogger, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }
    res.status(400).json({
      error: {
        code: "NO_SESSION",
        message: "No hay sesion MCP activa. Envie un POST /mcp primero.",
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.delete("/mcp", authMiddleware, auditLogger, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }
    res.status(400).json({
      error: {
        code: "NO_SESSION",
        message: "No hay sesion MCP activa para cerrar.",
        timestamp: new Date().toISOString(),
      },
    });
  });

  // --- Error handler ---
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const traceId = req.headers["x-trace-id"] as string;
    logger.error({ err, traceId }, "Error no manejado");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor",
        traceId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}
