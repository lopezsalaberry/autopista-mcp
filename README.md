# Autopista MCP

## Descripcion

Servidor MCP (Model Context Protocol) que expone herramientas de consulta para Mixpanel Analytics y HubSpot CRM del ecosistema Medicus. Permite a Claude consultar eventos, contactos, deals, engagements, custom objects y metricas directamente desde la conversacion.

Soporta dos modos de transporte:
- **stdio**: Para Claude Code y Claude Desktop (local)
- **HTTP Streamable**: Para claude.ai web y despliegues remotos, protegido con OAuth 2.1 via Keycloak

### Herramientas disponibles (31 tools)

**Mixpanel (6)**: segmentation, export_events, profiles, funnels, retention, jql

**HubSpot - Contactos (9)**: search_contacts, get_contact, get_contact_notes, get_contact_calls, get_contact_emails, get_contact_tasks, get_contact_meetings, get_contact_deals, get_contact_communications

**HubSpot - Deals (8)**: search_deals, get_deal, get_deal_notes, get_deal_calls, get_deal_emails, get_deal_tasks, get_deal_meetings, get_deal_communications, get_deal_contacts

**HubSpot - Metadata (4)**: list_pipelines, list_owners, get_owner, get_properties

**HubSpot - Custom Objects (3)**: list_schemas, get_contact_custom_objects, get_deal_custom_objects

**Knowledge (4)**: project_info, search_events, search_hubspot_ops, ecosystem_overview

### Transcripcion automatica de audios

Cuando se consultan comunicaciones (WhatsApp via TimelinesAI), los archivos de audio `.oga` se transcriben automaticamente a texto usando OpenAI Whisper. La transcripcion reemplaza las referencias a `[attachment.oga]` por `[Audio transcripto]: "texto"`. Requiere `OPENAI_API_KEY` y el scope `files` en la Private App de HubSpot.

## Requisitos Previos

- Node.js >= 22.x
- Cuenta de servicio de Mixpanel (rol Analyst)
- Private App de HubSpot (scopes: CRM read-only + `files`)
- Docker (para despliegue remoto)
- Keycloak (solo en modo HTTP)

## Clonar el repositorio

```bash
git clone https://gitlab.medicus.com.ar/servicios/autopista-mcp.git
cd autopista-mcp
```

## Instalacion y configuracion

```bash
npm install
cp .env.example .env
# Editar .env con las credenciales reales
```

Variables de entorno:

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `MIXPANEL_SERVICE_ACCOUNT_USERNAME` | Si | Username del service account de Mixpanel |
| `MIXPANEL_SERVICE_ACCOUNT_SECRET` | Si | Secret del service account |
| `MIXPANEL_PROJECT_ID` | Si | ID numerico del proyecto en Mixpanel |
| `MIXPANEL_REGION` | No | Region de datos: `us` o `eu` (default: `us`) |
| `HUBSPOT_ACCESS_TOKEN` | Si | PAT de la private app de HubSpot |
| `OPENAI_API_KEY` | No | API key de OpenAI para transcripcion de audios via Whisper |
| `KEYCLOAK_URL` | HTTP | URL base de Keycloak |
| `KEYCLOAK_REALM` | HTTP | Realm de Keycloak |
| `KEYCLOAK_CLIENT_ID` | HTTP | Client ID del client en Keycloak |
| `KEYCLOAK_CLIENT_SECRET` | HTTP | Client Secret |
| `KEYCLOAK_REQUIRED_ROLE` | No | Rol requerido para acceder. `*` = todos los autenticados (default: `*`) |
| `MCP_BASE_URL` | HTTP | URL publica del MCP server |
| `TRANSPORT` | No | Modo de transporte: `stdio` o `http` (default: `stdio`) |
| `APP_PORT` | No | Puerto HTTP (default: `3000`, solo en modo http) |
| `LOG_LEVEL` | No | Nivel de log: `debug`, `info`, `warn`, `error` |

## Ejecucion

### Modo stdio (Claude Code / Claude Desktop)

```bash
npm run build
npm start
```

### Modo HTTP (claude.ai / despliegue remoto)

```bash
npm run build
TRANSPORT=http npm start
```

### Docker

```bash
docker build -t autopista-mcp .
docker run -p 3000:3000 --env-file .env -e TRANSPORT=http autopista-mcp
```

### Registrar en Claude Code

```bash
claude mcp add --transport stdio autopista -- node /ruta/completa/dist/index.js
```

### Registrar en Claude Desktop

Editar `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "autopista": {
      "command": "node",
      "args": ["/ruta/completa/autopista-mcp/dist/index.js"],
      "env": {
        "MIXPANEL_SERVICE_ACCOUNT_USERNAME": "...",
        "MIXPANEL_SERVICE_ACCOUNT_SECRET": "...",
        "MIXPANEL_PROJECT_ID": "...",
        "HUBSPOT_ACCESS_TOKEN": "...",
        "OPENAI_API_KEY": "..."
      }
    }
  }
}
```

### Registrar en claude.ai (web)

1. Desplegar con Docker en un servidor accesible
2. Ir a Settings > Connectors > Add custom connector
3. Pegar la URL: `https://tu-servidor/mcp`
4. El usuario se autentica via Keycloak con sus credenciales de Medicus

## Autenticacion y autorizacion (modo HTTP)

El modo HTTP usa OAuth 2.1 con Keycloak como proveedor de identidad:

1. El cliente MCP se conecta a `/mcp`
2. El server responde con 401 e inicia el flujo OAuth
3. El usuario es redirigido al login de Keycloak de Medicus
4. Tras autenticarse, Keycloak devuelve un JWT con los roles del usuario
5. El server valida el JWT y verifica que el usuario tenga el rol configurado en `KEYCLOAK_REQUIRED_ROLE`

Configuracion del rol:
- `KEYCLOAK_REQUIRED_ROLE=*` → cualquier usuario autenticado tiene acceso
- `KEYCLOAK_REQUIRED_ROLE=mcp-user` → solo usuarios con el rol `mcp-user` en Keycloak

## Testing

```bash
# Verificar build
npm run build

# Test con MCP Inspector
npm run inspect

# Health check (modo HTTP)
curl http://localhost:3000/health
```

## API Documentation

Acceder a la documentacion en: http://localhost:3000/api-docs (solo en modo HTTP)
