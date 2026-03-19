import { randomUUID } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InMemoryClientsStore } from "./clients-store.js";
import { logger } from "../shared/logger.js";

interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  clientState?: string;
  codeChallenge: string;
  scopes?: string[];
  createdAt: number;
}

export interface KeycloakConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  mcpBaseUrl: string;
  requiredRole?: string;
}

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

export class KeycloakOAuthProvider implements OAuthServerProvider {
  skipLocalPkceValidation = true;

  private _clientsStore: InMemoryClientsStore;
  private pendingAuthorizations = new Map<string, PendingAuthorization>();
  private jwks: ReturnType<typeof createRemoteJWKSet>;

  private authorizationUrl: string;
  private tokenUrl: string;
  private revocationUrl: string;
  private jwksUrl: string;
  private issuer: string;
  private callbackUrl: string;
  private keycloakClientId: string;
  private keycloakClientSecret: string;
  private requiredRole: string;

  constructor(config: KeycloakConfig) {
    const base = `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect`;

    this.authorizationUrl = `${base}/auth`;
    this.tokenUrl = `${base}/token`;
    this.revocationUrl = `${base}/revoke`;
    this.jwksUrl = `${base}/certs`;
    this.issuer = `${config.keycloakUrl}/realms/${config.realm}`;
    this.callbackUrl = `${config.mcpBaseUrl}/oauth/callback`;
    this.keycloakClientId = config.clientId;
    this.keycloakClientSecret = config.clientSecret;
    this.requiredRole = config.requiredRole || "*";

    this._clientsStore = new InMemoryClientsStore();
    this.jwks = createRemoteJWKSet(new URL(this.jwksUrl));
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    _client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.cleanupPendingAuthorizations();

    const proxyState = randomUUID();

    this.pendingAuthorizations.set(proxyState, {
      clientId: _client.client_id,
      redirectUri: params.redirectUri,
      clientState: params.state,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes,
      createdAt: Date.now(),
    });

    const targetUrl = new URL(this.authorizationUrl);
    targetUrl.searchParams.set("client_id", this.keycloakClientId);
    targetUrl.searchParams.set("redirect_uri", this.callbackUrl);
    targetUrl.searchParams.set("response_type", "code");
    targetUrl.searchParams.set("state", proxyState);
    targetUrl.searchParams.set("code_challenge", params.codeChallenge);
    targetUrl.searchParams.set("code_challenge_method", "S256");

    if (params.scopes?.length) {
      targetUrl.searchParams.set("scope", ["openid", ...params.scopes].join(" "));
    } else {
      targetUrl.searchParams.set("scope", "openid");
    }

    logger.info({ proxyState, clientId: _client.client_id }, "Redirigiendo a Keycloak para autenticacion");
    res.redirect(targetUrl.toString());
  }

  /**
   * Express handler para GET /oauth/callback
   * Keycloak redirige aqui despues de que el usuario se loguea
   */
  handleCallback = (
    req: { query: Record<string, string | undefined> },
    res: Response,
  ): void => {
    const code = req.query.code;
    const proxyState = req.query.state;
    const error = req.query.error;
    const errorDescription = req.query.error_description;

    if (error) {
      logger.warn({ error, errorDescription }, "Error de autenticacion en Keycloak");

      if (proxyState) {
        const pending = this.pendingAuthorizations.get(proxyState);
        if (pending) {
          this.pendingAuthorizations.delete(proxyState);
          const redirectUrl = new URL(pending.redirectUri);
          redirectUrl.searchParams.set("error", error);
          if (errorDescription) {
            redirectUrl.searchParams.set("error_description", errorDescription);
          }
          if (pending.clientState) {
            redirectUrl.searchParams.set("state", pending.clientState);
          }
          res.redirect(redirectUrl.toString());
          return;
        }
      }

      res.status(400).json({
        error: { code: "AUTH_ERROR", message: errorDescription || error },
      });
      return;
    }

    if (!code || !proxyState) {
      res.status(400).json({
        error: { code: "INVALID_CALLBACK", message: "Faltan parametros code o state" },
      });
      return;
    }

    const pending = this.pendingAuthorizations.get(proxyState);
    if (!pending) {
      res.status(400).json({
        error: { code: "INVALID_STATE", message: "State invalido o expirado" },
      });
      return;
    }

    this.pendingAuthorizations.delete(proxyState);

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (pending.clientState) {
      redirectUrl.searchParams.set("state", pending.clientState);
    }

    logger.info({ clientId: pending.clientId }, "Callback OAuth exitoso, redirigiendo al cliente MCP");
    res.redirect(redirectUrl.toString());
  };

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string,
  ): Promise<string> {
    return "";
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.keycloakClientId,
      client_secret: this.keycloakClientSecret,
      code: authorizationCode,
      redirect_uri: this.callbackUrl,
    });

    if (codeVerifier) {
      params.set("code_verifier", codeVerifier);
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Error al intercambiar codigo con Keycloak");
      throw new Error(`Token exchange con Keycloak fallo: ${response.status}`);
    }

    const data = await response.json();
    return OAuthTokensSchema.parse(data);
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.keycloakClientId,
      client_secret: this.keycloakClientSecret,
      refresh_token: refreshToken,
    });

    if (scopes?.length) {
      params.set("scope", scopes.join(" "));
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Error al refrescar token con Keycloak");
      throw new Error(`Token refresh con Keycloak fallo: ${response.status}`);
    }

    const data = await response.json();
    return OAuthTokensSchema.parse(data);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
    });

    const roles = ((payload as Record<string, unknown>).realm_access as { roles?: string[] })?.roles || [];

    if (this.requiredRole !== "*" && !roles.includes(this.requiredRole)) {
      const user = (payload as Record<string, unknown>).preferred_username || payload.sub;
      logger.warn({ user, roles, requiredRole: this.requiredRole }, "Acceso denegado: rol faltante");
      throw new Error(`Acceso denegado: se requiere el rol '${this.requiredRole}'`);
    }

    return {
      token,
      clientId: (payload.azp as string) || this.keycloakClientId,
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
      expiresAt: payload.exp!,
      extra: {
        sub: payload.sub,
        preferredUsername: (payload as Record<string, unknown>).preferred_username,
        email: (payload as Record<string, unknown>).email,
        name: (payload as Record<string, unknown>).name,
        roles,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const params = new URLSearchParams({
      client_id: this.keycloakClientId,
      client_secret: this.keycloakClientSecret,
      token: request.token,
    });

    if (request.token_type_hint) {
      params.set("token_type_hint", request.token_type_hint);
    }

    const response = await fetch(this.revocationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Error al revocar token en Keycloak");
    }
  }

  private cleanupPendingAuthorizations(): void {
    const now = Date.now();
    for (const [state, pending] of this.pendingAuthorizations) {
      if (now - pending.createdAt > PENDING_AUTH_TTL_MS) {
        this.pendingAuthorizations.delete(state);
      }
    }
  }
}
