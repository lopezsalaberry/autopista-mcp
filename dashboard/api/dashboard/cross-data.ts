import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchCrossData } from "../_lib/hubspot.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required" },
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
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
    const data = await fetchCrossData(fromMs, toMs);
    res.json(data);
  } catch (err: unknown) {
    console.error("Error fetching cross data:", err);
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch cross data",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
