/**
 * Shared auth utilities for Vercel serverless functions.
 * Mirrors the logic from src/dashboard/dashboard-auth.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ─── Configuration ──────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const JWT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

export interface DashboardUser {
  username: string;
  password: string;
  displayName: string;
}

export interface JwtPayload {
  sub: string;
  name: string;
  iat: number;
  exp: number;
  iss: string;
  type: "local" | "keycloak";
}

export function parseDashboardUsers(): DashboardUser[] {
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

// ─── JWT ────────────────────────────────────────────────────

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export function signJwt(payload: Omit<JwtPayload, "iat" | "exp" | "iss">): string {
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

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    const sigBuf = Buffer.from(signature, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload: JwtPayload = JSON.parse(base64UrlDecode(body));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

export const JWT_EXPIRY = JWT_EXPIRY_SECONDS;
