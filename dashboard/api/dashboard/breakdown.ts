import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchBreakdown } from "../lib/hubspot.js";

const VALID_DIMENSIONS = ["categoria_de_venta", "categoria", "canal", "campana"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { from, to, dimension } = req.query as {
    from?: string;
    to?: string;
    dimension?: string;
  };

  if (!from || !to || !dimension) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from, to, and dimension are required" },
    });
    return;
  }

  if (!VALID_DIMENSIONS.includes(dimension)) {
    res.status(400).json({
      error: {
        code: "INVALID_DIMENSION",
        message: `dimension must be one of: ${VALID_DIMENSIONS.join(", ")}`,
      },
    });
    return;
  }

  // Parse parent filters from query string (e.g., &canal=REDES&categoria_de_venta=Pago)
  const parentFilters: Record<string, string> = {};
  for (const dim of VALID_DIMENSIONS) {
    if (dim !== dimension && req.query[dim]) {
      parentFilters[dim] = req.query[dim] as string;
    }
  }

  try {
    const data = await fetchBreakdown(from, to, dimension, parentFilters);
    res.json(data);
  } catch (err: unknown) {
    console.error("Error fetching breakdown:", err);
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch breakdown data",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
