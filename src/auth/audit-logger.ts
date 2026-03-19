import type { Request, Response, NextFunction } from "express";
import { logger } from "../shared/logger.js";

interface AuthenticatedRequest extends Request {
  auth?: {
    token: string;
    clientId: string;
    scopes: string[];
    expiresAt?: number;
    extra?: Record<string, unknown>;
  };
}

export function auditLogger(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    next();
    return;
  }

  logger.info({
    audit: true,
    userId: auth.extra?.sub,
    username: auth.extra?.preferredUsername,
    email: auth.extra?.email,
    roles: auth.extra?.roles,
    clientId: auth.clientId,
    method: req.method,
    path: req.path,
    traceId: req.headers["x-trace-id"],
    correlationId: req.headers["x-correlation-id"],
    mcpSessionId: req.headers["mcp-session-id"],
  }, `MCP access: ${auth.extra?.preferredUsername || auth.extra?.sub || "unknown"}`);

  next();
}
