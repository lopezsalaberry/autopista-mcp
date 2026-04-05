import type { VercelRequest, VercelResponse } from "@vercel/node";
import { EXCLUDED_OWNER_IDS } from "../_lib/constants.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.json({
    excludedOwnerIds: EXCLUDED_OWNER_IDS,
  });
}
