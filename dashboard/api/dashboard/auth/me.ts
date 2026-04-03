import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt } from "../../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authorization header required (Bearer token)" },
    });
    return;
  }

  const payload = verifyJwt(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" },
    });
    return;
  }

  res.json({
    user: {
      username: payload.sub,
      displayName: payload.name,
      type: payload.type,
    },
  });
}
