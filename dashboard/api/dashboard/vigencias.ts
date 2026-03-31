import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllVigencias, type VigenciaConfig } from "../_lib/vigencia.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const startDay = parseInt(req.query.startDay as string) || 21;
  const endDay = parseInt(req.query.endDay as string) || 22;

  const config: Partial<VigenciaConfig> = { startDay, endDay };

  res.json({
    year,
    config: { startDay, endDay },
    vigencias: getAllVigencias(year, config),
  });
}
