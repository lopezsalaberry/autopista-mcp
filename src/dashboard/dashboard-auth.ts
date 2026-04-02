/**
 * Dashboard Authentication — dual-mode (local credentials + Keycloak OIDC).
 *
 * Local login:   POST /api/dashboard/auth/login  { username, password }  → JWT
 * Token verify:  Authorization: Bearer <jwt>
 *
 * If KEYCLOAK_URL is configured, Keycloak JWTs are also accepted.
 * JWT_SECRET is used for local tokens (generated at startup if not set).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { logger } from "../shared/logger.js";

// ─── Configuration ──────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const JWT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

const DASHBOARD_USERS = parseDashboardUsers();

function parseDashboardUsers(): Array<{ username: string; password: string; displayName: string }> {
  // Support multiple users via DASHBOARD_USERS=user1:pass1:Name1,user2:pass2:Name2
  // Or single user via DASHBOARD_USER + DASHBOARD_PASSWORD
  const multiUser = process.env.DASHBOARD_USERS;
  if (multiUser) {
    return multiUser.split(",").map(entry => {
      const [username, password, ...nameParts] = entry.trim().split(":");
      return {
        username: username.trim(),
        password: password.trim(),
        displayName: nameParts.join(":").trim() || username.trim(),
      };
    }).filter(u => u.username && u.password);
  }

  const username = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;
  if (username && password) {
    return [{
      username,
      password,
      displayName: process.env.DASHBOARD_DISPLAY_NAME || username,
    }];
  }

  return [];
}

// ─── Minimal JWT implementation (no deps beyond crypto) ─────

interface JwtPayload {
  sub: string;
  name: string;
  iat: number;
  exp: number;
  iss: string;
  type: "local" | "keycloak";
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function signJwt(payload: Omit<JwtPayload, "iat" | "exp" | "iss">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
    iss: "medicus-dashboard",
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

function verifyLocalJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    // Timing-safe comparison
    const sigBuf = Buffer.from(signature, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload: JwtPayload = JSON.parse(base64UrlDecode(body));

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Keycloak JWT verification (when configured) ────────────

async function verifyKeycloakJwt(token: string): Promise<JwtPayload | null> {
  const kcUrl = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM;
  if (!kcUrl || !realm) return null;

  try {
    // Decode header to get kid
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(base64UrlDecode(parts[0]));
    if (header.alg !== "RS256") return null;

    // For Keycloak verification, use the jose library (already a project dependency)
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const JWKS = createRemoteJWKSet(
      new URL(`${kcUrl}/realms/${realm}/protocol/openid-connect/certs`),
    );

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${kcUrl}/realms/${realm}`,
    });

    return {
      sub: payload.sub || "keycloak-user",
      name: (payload as Record<string, unknown>).preferred_username as string || (payload as Record<string, unknown>).name as string || payload.sub || "Keycloak User",
      iat: payload.iat || 0,
      exp: payload.exp || 0,
      iss: payload.iss || "keycloak",
      type: "keycloak",
    };
  } catch (err) {
    logger.debug({ err }, "Keycloak JWT verification failed");
    return null;
  }
}

// ─── Unified Auth Middleware ────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export async function dashboardAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authorization header required (Bearer token)",
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  // Try local JWT first (fast, no I/O)
  const localPayload = verifyLocalJwt(token);
  if (localPayload) {
    req.user = localPayload;
    next();
    return;
  }

  // Try Keycloak JWT (if configured)
  const kcPayload = await verifyKeycloakJwt(token);
  if (kcPayload) {
    req.user = kcPayload;
    next();
    return;
  }

  res.status(401).json({
    error: {
      code: "INVALID_TOKEN",
      message: "Token is invalid or expired",
      timestamp: new Date().toISOString(),
    },
  });
}

// ─── Auth Router (login/logout/status) ──────────────────────

export const authRouter = Router();

// POST /auth/login — local credential login
authRouter.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: "username and password required" },
    });
    return;
  }

  if (DASHBOARD_USERS.length === 0) {
    res.status(503).json({
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "No dashboard users configured. Set DASHBOARD_USER/DASHBOARD_PASSWORD in .env",
      },
    });
    return;
  }

  const user = DASHBOARD_USERS.find(
    u => u.username === username && u.password === password,
  );

  if (!user) {
    logger.warn({ username, ip: req.ip }, "Failed dashboard login attempt");
    res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos" },
    });
    return;
  }

  const token = signJwt({
    sub: user.username,
    name: user.displayName,
    type: "local",
  });

  logger.info({ username: user.username, ip: req.ip }, "Dashboard login successful");

  res.json({
    token,
    user: {
      username: user.username,
      displayName: user.displayName,
    },
    expiresIn: JWT_EXPIRY_SECONDS,
  });
});

// GET /auth/me — verify token and return user info
authRouter.get("/me", dashboardAuth as unknown as import("express").RequestHandler, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: {
      username: req.user!.sub,
      displayName: req.user!.name,
      type: req.user!.type,
    },
  });
});

// GET /auth/config — return auth configuration (public, no auth needed)
authRouter.get("/config", (_req: Request, res: Response) => {
  const hasLocalLogin = DASHBOARD_USERS.length > 0;
  const kcUrl = process.env.KEYCLOAK_URL;
  const kcRealm = process.env.KEYCLOAK_REALM;
  const kcClientId = process.env.KEYCLOAK_DASHBOARD_CLIENT_ID;
  const hasKeycloak = Boolean(kcUrl && kcRealm && kcClientId);

  res.json({
    hasLocalLogin,
    hasKeycloak,
    keycloak: hasKeycloak ? {
      url: kcUrl,
      realm: kcRealm,
      clientId: kcClientId,
    } : null,
  });
});
