/**
 * Dashboard runtime configuration with file persistence.
 *
 * Manages mutable config values (e.g., excluded owner IDs) that can be
 * updated via API without redeployment. Persists to a JSON file for
 * survival across container restarts (requires volume mount in Docker).
 *
 * Design decisions:
 * - Atomic writes (write to .tmp → rename) to prevent corruption
 * - Graceful degradation: if file I/O fails, in-memory state is preserved
 * - Cache auto-invalidation on config change
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default excluded owner IDs — admin, bot, and duplicate accounts. */
const DEFAULT_EXCLUDED_OWNER_IDS = [
  "2058415376",   // (deactivated)
  "79635496",     // Atencion Al Asociado
  "78939002",     // Hernán F. Blanco
  "79868309",     // Hernán Blanco (duplicate)
  "79868347",     // Hernán Blanco (duplicate)
  "83194003",     // (deactivated)
  "83194004",     // (deactivated)
  "83194005",     // hernanfblanco@somosmedicus.com.ar
  "83194006",     // Hernán Blanco (medicusdigital)
  "83194007",     // (deactivated)
  "83194008",     // (deactivated)
  "596180848",    // (deactivated)
  "350718277",    // Agustina Herrera
  "1031288250",   // (deactivated)
  "85138563",     // Agente (chatbot)
];

interface ConfigData {
  excludedOwnerIds: string[];
  updatedAt: string;
}

export class DashboardConfig {
  private excludedOwnerIds: string[];
  private updatedAt: string;
  private readonly filePath: string;

  constructor(dataDir?: string) {
    const resolvedDir = dataDir || join(__dirname, "../../data");
    this.filePath = join(resolvedDir, "dashboard-config.json");
    const loaded = this.loadFromDisk();
    this.excludedOwnerIds = loaded.excludedOwnerIds;
    this.updatedAt = loaded.updatedAt;
    logger.info(
      { filePath: this.filePath, excludedCount: this.excludedOwnerIds.length },
      "Dashboard config loaded",
    );
  }

  private loadFromDisk(): ConfigData {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.excludedOwnerIds) && parsed.excludedOwnerIds.length > 0) {
          return {
            excludedOwnerIds: parsed.excludedOwnerIds.map(String),
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          };
        }
        logger.warn("Config file has invalid excludedOwnerIds, using defaults");
      }
    } catch (err) {
      logger.warn({ err }, "Failed to load dashboard config, using defaults");
    }
    return {
      excludedOwnerIds: [...DEFAULT_EXCLUDED_OWNER_IDS],
      updatedAt: new Date().toISOString(),
    };
  }

  private saveToDisk(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const tmpPath = this.filePath + ".tmp";
      writeFileSync(
        tmpPath,
        JSON.stringify(
          {
            excludedOwnerIds: this.excludedOwnerIds,
            updatedAt: this.updatedAt,
          },
          null,
          2,
        ),
      );
      renameSync(tmpPath, this.filePath); // atomic on POSIX
      logger.info({ count: this.excludedOwnerIds.length }, "Dashboard config persisted");
    } catch (err) {
      // In-memory state is still valid — degraded but functional
      logger.error({ err }, "Failed to persist dashboard config to disk");
    }
  }

  /** Get the current list of excluded owner IDs. */
  getExcludedOwnerIds(): string[] {
    return this.excludedOwnerIds;
  }

  /** Get the full config snapshot. */
  getConfig(): ConfigData {
    return {
      excludedOwnerIds: [...this.excludedOwnerIds],
      updatedAt: this.updatedAt,
    };
  }

  /** Get the default excluded owner IDs (for UI reference). */
  getDefaults(): string[] {
    return [...DEFAULT_EXCLUDED_OWNER_IDS];
  }

  /**
   * Update the excluded owner IDs list.
   * This clears the dashboard cache to ensure fresh HubSpot queries.
   * @param ids - Array of owner ID strings (must be non-empty, numeric)
   * @param clearCacheFn - Callback to clear the dashboard cache
   */
  setExcludedOwnerIds(ids: string[], clearCacheFn: () => void): void {
    // Deduplicate
    this.excludedOwnerIds = [...new Set(ids.map(String))];
    this.updatedAt = new Date().toISOString();
    this.saveToDisk();
    clearCacheFn();
    logger.info(
      { count: this.excludedOwnerIds.length, updatedAt: this.updatedAt },
      "Excluded owner IDs updated, cache cleared",
    );
  }
}
