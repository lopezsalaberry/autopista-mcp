import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseDashboardUsers, signJwt, JWT_EXPIRY } from "../../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } });
    return;
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: "username and password required" },
    });
    return;
  }

  const users = parseDashboardUsers();

  if (users.length === 0) {
    res.status(503).json({
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "No dashboard users configured. Set DASHBOARD_USER/DASHBOARD_PASSWORD env vars.",
      },
    });
    return;
  }

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos" },
    });
    return;
  }

  const token = signJwt({ sub: user.username, name: user.displayName, type: "local" });

  res.json({
    token,
    user: { username: user.username, displayName: user.displayName },
    expiresIn: JWT_EXPIRY,
  });
}
