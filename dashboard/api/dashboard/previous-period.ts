import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPreviousPeriod } from "../lib/vigencia.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" },
    });
    return;
  }

  const prev = getPreviousPeriod(from, to);
  res.json({ current: { from, to }, previous: prev });
}
