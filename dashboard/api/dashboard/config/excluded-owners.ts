import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setExcludedOwnerIds } from "../../_lib/edge-config.js";

/**
 * PUT /api/dashboard/config/excluded-owners
 *
 * Persists excluded owner IDs to Vercel Edge Config so they survive
 * across serverless invocations and are read at ~1ms latency.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "PUT") {
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "PUT only" } });
    return;
  }

  const body = req.body;

  if (!body || !body.excludedOwnerIds) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "excludedOwnerIds array is required" },
    });
    return;
  }

  if (!Array.isArray(body.excludedOwnerIds)) {
    res.status(400).json({
      error: { code: "INVALID_FORMAT", message: "excludedOwnerIds must be an array" },
    });
    return;
  }

  if (body.excludedOwnerIds.length === 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "excludedOwnerIds cannot be empty (at least 1 owner must be excluded)",
      },
    });
    return;
  }

  try {
    await setExcludedOwnerIds(body.excludedOwnerIds);
    res.json({
      excludedOwnerIds: body.excludedOwnerIds,
      cacheCleared: true,
    });
  } catch (err) {
    console.error("[excluded-owners] Edge Config write failed:", err);
    res.status(500).json({
      error: {
        code: "EDGE_CONFIG_WRITE_FAILED",
        message: err instanceof Error ? err.message : "Failed to persist exclusions",
      },
    });
  }
}
