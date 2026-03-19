import { randomUUID } from "crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

const MAX_CLIENTS = 1000;
const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, { data: OAuthClientInformationFull; createdAt: number }>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const entry = this.clients.get(clientId);
    if (!entry) return undefined;

    if (Date.now() - entry.createdAt > CLIENT_TTL_MS) {
      this.clients.delete(clientId);
      return undefined;
    }

    return entry.data;
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    if (this.clients.size >= MAX_CLIENTS) {
      this.cleanup();
    }

    const clientId = randomUUID();
    const clientSecret = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: now,
      client_secret_expires_at: 0,
    };

    this.clients.set(clientId, { data: fullClient, createdAt: Date.now() });
    return fullClient;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.clients) {
      if (now - entry.createdAt > CLIENT_TTL_MS) {
        this.clients.delete(id);
      }
    }
  }
}
