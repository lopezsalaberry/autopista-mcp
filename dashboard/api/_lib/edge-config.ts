/**
 * Edge Config helpers for reading/writing dashboard configuration.
 *
 * - READ  uses @vercel/edge-config SDK (ultra-fast, ~1ms from edge)
 * - WRITE uses Vercel REST API (PATCH /v1/edge-config/{id}/items)
 *
 * Required env vars:
 *   EDGE_CONFIG          – connection string (auto-set when you link an Edge Config to a project)
 *   EDGE_CONFIG_ID       – the Edge Config ID (e.g. "ecfg_...")
 *   VERCEL_API_TOKEN     – a Vercel API token with write access
 *
 * Falls back to EXCLUDED_OWNER_IDS from constants.ts when Edge Config is unavailable.
 */

import { createClient } from "@vercel/edge-config";
import { EXCLUDED_OWNER_IDS } from "./constants.js";

const EDGE_CONFIG_KEY = "excludedOwnerIds";

function getClient() {
  const connectionString = process.env.EDGE_CONFIG;
  if (!connectionString) return null;
  return createClient(connectionString);
}

/**
 * Read excluded owner IDs. Returns the Edge Config value if available,
 * otherwise falls back to the hardcoded list in constants.ts.
 */
export async function getExcludedOwnerIds(): Promise<string[]> {
  try {
    const client = getClient();
    if (!client) return EXCLUDED_OWNER_IDS;

    const ids = await client.get<string[]>(EDGE_CONFIG_KEY);
    return ids && ids.length > 0 ? ids : EXCLUDED_OWNER_IDS;
  } catch {
    console.warn("[edge-config] Failed to read excludedOwnerIds, using fallback");
    return EXCLUDED_OWNER_IDS;
  }
}

/**
 * Write excluded owner IDs to Edge Config via the Vercel REST API.
 * Throws if the required env vars are missing or the API call fails.
 */
export async function setExcludedOwnerIds(ids: string[]): Promise<void> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const apiToken = process.env.VERCEL_API_TOKEN;

  if (!edgeConfigId || !apiToken) {
    throw new Error(
      "Missing EDGE_CONFIG_ID or VERCEL_API_TOKEN environment variables"
    );
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  let url = `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`;
  if (teamId) url += `?teamId=${teamId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          operation: "upsert",
          key: EDGE_CONFIG_KEY,
          value: ids,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Edge Config write failed (${res.status}): ${body}`);
  }
}
