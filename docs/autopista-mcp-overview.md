# Autopista MCP - Servidor de Analytics y CRM para Modelos de IA

## Que es este proyecto?

Autopista MCP es un servidor que implementa el protocolo **MCP (Model Context Protocol)** de Anthropic, permitiendo que modelos de IA (Claude, GPT, Gemini, o cualquier cliente compatible) consulten datos de **Mixpanel** y **HubSpot** del ecosistema Medicus de forma segura y controlada.

En vez de darle las credenciales de Mixpanel/HubSpot a cada usuario, el servidor centraliza el acceso: las credenciales viven en el entorno de produccion y los usuarios se autentican con sus cuentas de Keycloak para poder operar.

### Que problema resuelve?

Hoy, si alguien necesita datos de analytics o del CRM, tiene que:
1. Entrar a Mixpanel/HubSpot manualmente
2. Saber armar las consultas correctas
3. Exportar datos y procesarlos

Con Autopista MCP, cualquier persona autorizada puede **preguntarle a un modelo de IA en lenguaje natural** y obtener respuestas basadas en datos reales. Por ejemplo:
- "Cuantos usuarios visitaron arma-tu-plan esta semana?"
- "Mostrame el funnel de conversion del cotizador"
- "Busca los deals del pipeline Retail que estan en Primer Contacto"
- "Cuantos contactos nuevos se crearon en marzo?"

---

## Como lo van a usar las personas?

### Opcion 1: Desde claude.ai (web)
1. Ir a Settings > Connectors > Add custom connector
2. Ingresar la URL del servidor: `https://mcp.medicus.com.ar/mcp`
3. Al conectar, el navegador redirige a la pagina de login de Keycloak
4. El usuario se loguea con sus credenciales de Medicus
5. Listo - ya puede hacer preguntas sobre analytics y CRM directamente en el chat

### Opcion 2: Desde Claude Code (terminal)
```bash
claude mcp add --transport stdio autopista -- node /ruta/a/autopista-mcp/dist/index.js
```
No requiere autenticacion porque corre localmente con las credenciales del entorno.

### Opcion 3: Desde cualquier cliente MCP compatible
Cursor, VS Code con extensiones MCP, o cualquier herramienta que soporte el protocolo MCP puede conectarse al endpoint HTTP con autenticacion OAuth 2.1.

---

## Herramientas disponibles (17 tools)

### Mixpanel Analytics (6 herramientas)
| Herramienta | Descripcion |
|-------------|-------------|
| `mixpanel_segmentation` | Conteos de eventos por tiempo/propiedad (tendencias, comparar periodos) |
| `mixpanel_export_events` | Exportar eventos crudos con todas sus propiedades |
| `mixpanel_profiles` | Consultar perfiles de usuario |
| `mixpanel_funnels` | Datos de conversion de funnels existentes |
| `mixpanel_retention` | Analisis de retencion por cohortes |
| `mixpanel_jql` | Consultas avanzadas en JavaScript Query Language |

### HubSpot CRM (7 herramientas)
| Herramienta | Descripcion |
|-------------|-------------|
| `hubspot_search_contacts` | Buscar contactos por texto libre o filtros |
| `hubspot_get_contact` | Obtener un contacto por ID |
| `hubspot_search_deals` | Buscar deals/negocios por filtros |
| `hubspot_get_deal` | Obtener un deal por ID |
| `hubspot_list_pipelines` | Listar pipelines y sus stages |
| `hubspot_list_owners` | Listar asesores/owners del CRM |
| `hubspot_get_properties` | Listar propiedades disponibles de un objeto |

### Base de Conocimiento Medicus (4 herramientas)
| Herramienta | Descripcion |
|-------------|-------------|
| `medicus_ecosystem_overview` | Vista panoramica de todo el ecosistema (proyectos, flujos) |
| `medicus_project_info` | Detalle de un proyecto especifico (eventos, operaciones) |
| `medicus_search_events` | Buscar eventos de Mixpanel en todos los proyectos |
| `medicus_search_hubspot_ops` | Buscar operaciones de HubSpot en todos los proyectos |

---

## Seguridad

### Autenticacion - OAuth 2.1 con Keycloak
- Los usuarios **deben loguearse con su cuenta de Medicus** (Keycloak) antes de poder usar el MCP
- Las credenciales de Mixpanel y HubSpot **nunca se exponen** al usuario - viven exclusivamente en el servidor
- Los tokens JWT se validan contra el JWKS de Keycloak en cada request
- Soporte para **revocacion de tokens** centralizada desde Keycloak
- Dynamic Client Registration (DCR) para que cualquier cliente MCP compatible se pueda conectar

### Auditoria
- Cada operacion registra: **quien** (usuario, email, roles), **que** (metodo, herramienta), **cuando** (timestamp), **desde donde** (traceId, correlationId)
- Logging estructurado con Pino en formato JSON
- Campos sensibles (tokens, passwords, secrets) se redactan automaticamente en los logs

### Proteccion de endpoints
- **Rate limiting**: 100 requests/minuto por IP
- **Helmet.js**: Headers de seguridad HTTP
- **CORS**: Configurado para origenes permitidos
- **Compresion GZIP**: Habilitada
- **Body limit**: 10MB maximo por request
- Los endpoints `/health`, `/version` y `/api-docs` son publicos
- El endpoint `/mcp` (donde ocurren las consultas) esta protegido con Bearer token

### Gestion de secretos
- Variables de entorno para todas las credenciales (nunca hardcodeadas)
- Archivo `.env` excluido del repositorio (`.gitignore`)
- En produccion: secretos inyectados via Docker environment / Kubernetes secrets

---

## Alineacion con API Standards de Medicus

| Requisito | Estado | Detalle |
|-----------|--------|---------|
| `GET /health` | Cumple | Verifica Mixpanel, HubSpot y Keycloak. Retorna 200/503 con estado de cada dependencia |
| `GET /version` | Cumple | Retorna version y environment |
| Swagger/OpenAPI | Cumple | Disponible en `/api-docs`, OpenAPI 3.0.3 con ejemplos |
| Docker multi-stage | Cumple | `node:24-alpine`, builder + runtime separados |
| Usuario no-root | Cumple | Usuario `nodejs` (UID 1001) |
| Health check Docker | Cumple | `wget` al `/health` cada 30s |
| `.dockerignore` | Cumple | Excluye node_modules, .git, .env, dist, coverage |
| Trazabilidad (X-Trace-Id) | Cumple | UUID generado por request, propagado en headers |
| Trazabilidad (X-Correlation-Id) | Cumple | UUID para agrupar requests relacionados |
| Logging estructurado | Cumple | Pino con timestamp ISO, level, traceId, correlationId |
| Validacion de inputs | Cumple | Zod en todas las herramientas MCP |
| Rate limiting | Cumple | 100 req/min por IP |
| Manejo de errores estandar | Cumple | Formato `{ error: { code, message, traceId, timestamp } }` |
| HTTPS/TLS | Pendiente | Requiere configuracion en el deploy (reverse proxy / load balancer) |
| Arquitectura por complejidad | Cumple | Baja complejidad (~5 endpoints) → estructura MVC simplificada con separacion por connectors |

---

## Arquitectura

```
┌──────────────────────────────────────────────────────┐
│                    Clientes MCP                       │
│  (claude.ai, Claude Desktop, Cursor, VS Code, etc.)  │
└───────────────┬──────────────────────┬───────────────┘
                │ HTTP + OAuth 2.1     │ stdio (local)
                ▼                      ▼
┌──────────────────────────────────────────────────────┐
│              autopista-mcp server                     │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Mixpanel    │  │   HubSpot    │  │ Knowledge   │ │
│  │  Connector   │  │  Connector   │  │ Connector   │ │
│  │  (6 tools)   │  │  (7 tools)   │  │ (4 tools)   │ │
│  └──────┬──────┘  └──────┬───────┘  └─────────────┘ │
│         │                │                            │
│  ┌──────┴──────┐  ┌──────┴───────┐                   │
│  │  Auth       │  │  Middleware   │                   │
│  │  (Keycloak) │  │  (rate limit, │                  │
│  │             │  │   helmet,     │                   │
│  │             │  │   audit log)  │                   │
│  └─────────────┘  └──────────────┘                   │
└───────────────┬──────────────────────┬───────────────┘
                │                      │
                ▼                      ▼
        Mixpanel API            HubSpot API
```

### Stack tecnologico
- **Runtime**: Node.js 22+ con TypeScript 5.9
- **Protocolo**: MCP SDK v1.27 (stdio + Streamable HTTP)
- **HTTP**: Express 5
- **Auth**: OAuth 2.1 con Keycloak (jose para JWT/JWKS)
- **Validacion**: Zod
- **Logging**: Pino + pino-http
- **Seguridad**: Helmet, CORS, express-rate-limit
- **Container**: Docker con node:24-alpine

---

## Endpoints

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/health` | No | Estado del servidor y dependencias |
| GET | `/version` | No | Version y ambiente |
| GET | `/api-docs` | No | Documentacion Swagger UI |
| POST | `/mcp` | Si (Bearer) | Endpoint principal MCP (JSON-RPC 2.0) |
| GET | `/mcp` | Si (Bearer) | SSE stream para respuestas MCP |
| DELETE | `/mcp` | Si (Bearer) | Cerrar sesion MCP |
| GET | `/authorize` | No | Inicio del flujo OAuth (redirect a Keycloak) |
| POST | `/token` | No | Intercambio de codigo por access token |
| POST | `/register` | No | Dynamic Client Registration |
| POST | `/revoke` | No | Revocacion de tokens |
| GET | `/.well-known/oauth-authorization-server` | No | Metadata OAuth (discovery) |
| GET | `/.well-known/oauth-protected-resource/mcp` | No | Metadata del recurso protegido |
| GET | `/oauth/callback` | No | Callback de Keycloak (interno) |

---

## Configuracion para despliegue

### Variables de entorno requeridas

```
# Mixpanel
MIXPANEL_SERVICE_ACCOUNT_USERNAME=...
MIXPANEL_SERVICE_ACCOUNT_SECRET=...
MIXPANEL_PROJECT_ID=...
MIXPANEL_REGION=us

# HubSpot
HUBSPOT_ACCESS_TOKEN=...

# Keycloak (solo modo HTTP)
KEYCLOAK_URL=https://keycloak.apps.medicus.com.ar
KEYCLOAK_REALM=medicus
KEYCLOAK_CLIENT_ID=autopista-mcp
KEYCLOAK_CLIENT_SECRET=...

# Server
MCP_BASE_URL=https://mcp.medicus.com.ar
TRANSPORT=http
APP_PORT=3000
NODE_ENV=production
LOG_LEVEL=warn
```

### Prerequisito: configurar client en Keycloak
1. Crear client `autopista-mcp` en realm `medicus`
2. Client Protocol: openid-connect
3. Access Type: confidential
4. Standard Flow: enabled
5. Valid Redirect URIs: `https://mcp.medicus.com.ar/oauth/callback`
6. Copiar el client secret a `KEYCLOAK_CLIENT_SECRET`

### Deploy con Docker
```bash
docker build -t autopista-mcp .
docker run -p 3000:3000 --env-file .env autopista-mcp
```

---

## Preguntas frecuentes

**Quien puede usarlo?**
Cualquier persona con cuenta en el Keycloak de Medicus. Al conectar un cliente MCP, se le pide loguearse.

**Las credenciales de Mixpanel/HubSpot se comparten?**
No. Las credenciales viven en el servidor. Los usuarios solo reciben un token JWT temporal de Keycloak para autenticarse.

**Funciona con cualquier modelo de IA?**
Si, con cualquier cliente que soporte el protocolo MCP: Claude (claude.ai, Claude Desktop, Claude Code), Cursor, VS Code, y otros.

**Puede modificar datos en HubSpot?**
Con las herramientas actuales, solo tiene acceso de **lectura**. No crea, modifica ni elimina contactos, deals u otros registros.

**Donde veo los logs de quien lo uso?**
En los logs estructurados del servidor (JSON). Cada acceso registra usuario, email, roles, herramienta usada, traceId y timestamp.
