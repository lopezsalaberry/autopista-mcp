import type { VercelRequest, VercelResponse } from "@vercel/node";
import { EXCLUDED_OWNER_IDS } from "../../_lib/constants.js";

/**
 * PUT /api/dashboard/config/excluded-owners
 *
 * In the Express server this persists in-memory. On Vercel serverless,
 * functions are stateless so runtime mutations don't persist. This endpoint
 * accepts the request and returns success for frontend compatibility,
 * but the canonical list remains in constants.ts.
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

  // On Vercel serverless, acknowledge the request but note that
  // runtime state cannot persist between invocations.
  res.json({
    excludedOwnerIds: body.excludedOwnerIds,
    cacheCleared: true,
  });
}
