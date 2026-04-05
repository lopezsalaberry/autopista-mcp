import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchLeadsData, fetchCrossData, fetchVentaOnline } from "../_lib/hubspot.js";
import { getPreviousPeriod } from "../_lib/vigencia.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { from, to } = req.query as { from?: string; to?: string };
  const previousFrom = req.query.previousFrom as string | undefined;
  const previousTo = req.query.previousTo as string | undefined;

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" },
    });
    return;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" },
    });
    return;
  }

  if ((previousFrom && !dateRe.test(previousFrom)) || (previousTo && !dateRe.test(previousTo))) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "previousFrom/previousTo must be in YYYY-MM-DD format" },
    });
    return;
  }

  const MAX_RANGE_DAYS = 400;
  const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
    res.status(400).json({
      error: { code: "RANGE_TOO_LARGE", message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
    });
    return;
  }

  try {
    const prev = (previousFrom && previousTo)
      ? { from: previousFrom, to: previousTo }
      : getPreviousPeriod(from, to);

    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();

    const [leadsData, crossData, ventaOnlineData] = await Promise.all([
      fetchLeadsData(from, to, prev.from, prev.to),
      fetchCrossData(fromMs, toMs),
      fetchVentaOnline(from, to).catch((err: unknown) => {
        console.warn("Venta online fetch failed (non-critical):", err);
        return { total: 0, period: { from, to } };
      }),
    ]);

    res.json({
      ...leadsData,
      crossData,
      ventaOnline: ventaOnlineData.total,
      _meta: {
        fetchedAt: new Date().toISOString(),
        version: "v1",
      },
    });
  } catch (err: unknown) {
    console.error("Error fetching unified dashboard data:", err);
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch dashboard data",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
