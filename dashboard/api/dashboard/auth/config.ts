import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseDashboardUsers } from "../../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const hasLocalLogin = parseDashboardUsers().length > 0;

  res.json({
    hasLocalLogin,
    hasKeycloak: false,
    keycloak: null,
  });
}
