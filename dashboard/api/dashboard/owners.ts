import type { VercelRequest, VercelResponse } from "@vercel/node";

const API = "https://api.hubapi.com";

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  return token;
}

function normalizeName(first?: string, last?: string, email?: string, id?: string): string {
  const raw = [first, last].filter(Boolean).join(" ").trim();
  if (raw) {
    return raw.replace(/\b\w+/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
  }
  if (email) {
    const prefix = email.split("@")[0].replace(/[._]/g, " ");
    return prefix.replace(/\b\w+/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
  }
  return id || "Desconocido";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const response = await fetch(`${API}/crm/v3/owners?limit=500`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Owners API: ${response.status}`);
    }

    const data = await response.json();
    const names: Record<string, string> = {};
    const teams: Record<string, string> = {};

    for (const o of (data.results || []) as Array<{
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      teams?: Array<{ id: string; name: string; primary?: boolean }>;
    }>) {
      names[o.id] = normalizeName(o.firstName, o.lastName, o.email, o.id);
      if (o.teams && o.teams.length > 0) {
        const primary = o.teams.find(t => t.primary) || o.teams[0];
        let teamName = primary.name.trim();
        if (teamName.startsWith("Equipo de ")) teamName = teamName.substring("Equipo de ".length);
        if (teamName.startsWith("Equipo ")) teamName = teamName.substring("Equipo ".length);
        teams[o.id] = teamName.trim();
      }
    }

    res.json({ names, teams });
  } catch (err: unknown) {
    console.error("Error fetching HubSpot owners:", err);
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch owners",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
