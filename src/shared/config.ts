import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../../.env"), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${name}`);
  }
  return value;
}

function requiredForHttp(name: string): string {
  const transport = process.env.TRANSPORT || "stdio";
  if (transport !== "http") return "";
  return required(name);
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  MIXPANEL_SERVICE_ACCOUNT_USERNAME: required("MIXPANEL_SERVICE_ACCOUNT_USERNAME"),
  MIXPANEL_SERVICE_ACCOUNT_SECRET: required("MIXPANEL_SERVICE_ACCOUNT_SECRET"),
  MIXPANEL_PROJECT_ID: required("MIXPANEL_PROJECT_ID"),
  MIXPANEL_REGION: optional("MIXPANEL_REGION", "us") as "us" | "eu",

  HUBSPOT_ACCESS_TOKEN: required("HUBSPOT_ACCESS_TOKEN"),

  // OpenAI Whisper - Transcripcion de audios en comunicaciones (opcional)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  // Dashboard API key (opcional - si no se define, las rutas quedan abiertas en dev)
  DASHBOARD_API_KEY: process.env.DASHBOARD_API_KEY || "",

  // Keycloak OAuth 2.1 (solo requerido en modo HTTP)
  KEYCLOAK_URL: requiredForHttp("KEYCLOAK_URL"),
  KEYCLOAK_REALM: requiredForHttp("KEYCLOAK_REALM"),
  KEYCLOAK_CLIENT_ID: requiredForHttp("KEYCLOAK_CLIENT_ID"),
  KEYCLOAK_CLIENT_SECRET: requiredForHttp("KEYCLOAK_CLIENT_SECRET"),
  KEYCLOAK_REQUIRED_ROLE: process.env.KEYCLOAK_REQUIRED_ROLE || "*",
  MCP_BASE_URL: requiredForHttp("MCP_BASE_URL"),
};
