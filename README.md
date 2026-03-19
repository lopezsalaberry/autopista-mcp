# Autopista MCP

## Descripcion

Servidor MCP (Model Context Protocol) que expone herramientas de consulta para Mixpanel Analytics y HubSpot CRM del ecosistema Medicus. Permite a Claude consultar eventos, contactos, deals y metricas directamente desde la conversacion.

Soporta dos modos de transporte:
- **stdio**: Para Claude Code y Claude Desktop (local)
- **HTTP Streamable**: Para claude.ai web y despliegues remotos

### Herramientas disponibles (17 tools)

**Mixpanel (6)**: segmentation, export_events, profiles, funnels, retention, jql
**HubSpot (7)**: search_contacts, get_contact, search_deals, get_deal, list_pipelines, list_owners, get_properties
**Knowledge (4)**: project_info, search_events, search_hubspot_ops, ecosystem_overview

## Requisitos Previos

- Node.js >= 22.x
- Cuenta de servicio de Mixpanel (rol Analyst)
- Private App de HubSpot (scopes read-only)
- Docker (para despliegue remoto)

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

Variables de entorno requeridas:

| Variable | Descripcion |
|----------|-------------|
| `MIXPANEL_SERVICE_ACCOUNT_USERNAME` | Username del service account de Mixpanel |
| `MIXPANEL_SERVICE_ACCOUNT_SECRET` | Secret del service account |
| `MIXPANEL_PROJECT_ID` | ID numerico del proyecto en Mixpanel |
| `MIXPANEL_REGION` | Region de datos: `us` o `eu` (default: `us`) |
| `HUBSPOT_ACCESS_TOKEN` | PAT de la private app de HubSpot |
| `TRANSPORT` | Modo de transporte: `stdio` o `http` (default: `stdio`) |
| `APP_PORT` | Puerto HTTP (default: `3000`, solo en modo http) |
| `NODE_ENV` | Ambiente: `development`, `staging`, `production` |
| `LOG_LEVEL` | Nivel de log: `debug`, `info`, `warn`, `error` |

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
        "HUBSPOT_ACCESS_TOKEN": "..."
      }
    }
  }
}
```

### Registrar en claude.ai (web)

1. Desplegar con Docker en un servidor accesible
2. Ir a Settings > Connectors > Add custom connector
3. Pegar la URL: `https://tu-servidor/mcp`

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
