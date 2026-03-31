import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchLeadsData } from "../_lib/hubspot.js";
import { getPreviousPeriod } from "../_lib/vigencia.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" },
    });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" },
    });
    return;
  }

  try {
    const prev = getPreviousPeriod(from, to);
    const data = await fetchLeadsData(from, to, prev.from, prev.to);
    res.json(data);
  } catch (err: unknown) {
    console.error("Error fetching leads data:", err);
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch leads data",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
