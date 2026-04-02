# Architecture Reference — Autopista MCP

> This document contains architecture documentation, reference tables, and operational runbooks.
> For coding rules and patterns that guide AI-assisted development, see [AGENTS.md](../AGENTS.md).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      dashboard/                              │
│   Vite SPA: React + Recharts + Vanilla CSS                  │
│   Talks to /api/dashboard/* via JWT-authenticated fetch      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     src/http.ts (Express 5)                  │
│   /api/dashboard/*  → Dashboard API (JWT auth)               │
│   /mcp              → MCP Streamable HTTP (OAuth 2.1)        │
│   /api-docs         → Swagger UI                             │
│   /health, /version → Observability                          │
└──────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│  src/dashboard/          │  │  src/connectors/            │
│  Dashboard-specific      │  │  MCP tool connectors        │
│  queries, config, cache  │  │  hubspot/ mixpanel/         │
│  auth, vigencia logic    │  │  meta-ads/ google-ads/      │
└──────────────────────────┘  │  knowledge/                 │
                              └────────────────────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │  External APIs         │
                              │  HubSpot · Mixpanel    │
                              │  Meta · Google · OpenAI │
                              └────────────────────────┘
```

**Dual transport**: The MCP server supports `stdio` (direct integration with Claude, etc.) and `http` (standalone server with OAuth 2.1). Transport is selected via `TRANSPORT` env var.

---

## Folder Structure

```
autopista-mcp/
├── src/                              # Backend TypeScript source
│   ├── index.ts                      # Entry point (transport router)
│   ├── mcp.ts                        # MCP server factory (registers tools)
│   ├── http.ts                       # Express HTTP server (middlewares, routing)
│   ├── shared/                       # Cross-cutting utilities
│   │   ├── config.ts                 # Environment variable management
│   │   ├── logger.ts                 # Pino structured logger
│   │   └── swagger.ts               # OpenAPI spec generation
│   ├── auth/                         # Authentication layer
│   │   ├── keycloak-provider.ts      # OAuth 2.1 provider (MCP auth)
│   │   ├── clients-store.ts          # In-memory OAuth client store
│   │   └── audit-logger.ts           # MCP access audit middleware
│   ├── dashboard/                    # Dashboard API layer
│   │   ├── dashboard-router.ts       # Express router (all /api/dashboard/* endpoints)
│   │   ├── dashboard-auth.ts         # JWT auth (dual-mode: local + Keycloak)
│   │   ├── dashboard-cache.ts        # In-memory TTL cache
│   │   ├── dashboard-config.ts       # Runtime config with file persistence
│   │   ├── hubspot-queries.ts        # HubSpot data fetching and aggregation
│   │   └── vigencia.ts              # Fiscal period (vigencia) logic
│   └── connectors/                   # MCP tool connectors
│       ├── hubspot/                  # HubSpot CRM connector
│       │   ├── client.ts            # HubSpot API client
│       │   ├── tools.ts             # MCP tools (search, deals, etc.)
│       │   └── audio-transcriber.ts  # Whisper audio transcription
│       ├── mixpanel/                 # Mixpanel analytics connector
│       │   ├── client.ts            # Mixpanel API client
│       │   └── tools.ts             # MCP tools (segmentation, funnels)
│       ├── meta-ads/                 # Meta Ads connector
│       │   ├── client.ts            # Meta Marketing API client
│       │   └── tools.ts             # MCP tools (campaigns, insights)
│       ├── google-ads/              # Google Ads connector
│       │   ├── client.ts            # Google Ads API client
│       │   └── tools.ts             # MCP tools (campaigns, metrics)
│       └── knowledge/               # Static knowledge base
│           ├── data.ts              # Business domain knowledge
│           └── tools.ts             # MCP tools (query knowledge)
├── dashboard/                        # Frontend SPA (Growth Dashboard)
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Main dashboard application
│   │   ├── index.css                 # Global styles (Vanilla CSS)
│   │   ├── auth/                     # Auth UI components
│   │   │   ├── AuthContext.tsx       # React auth context + JWT management
│   │   │   └── LoginPage.tsx         # Login form UI
│   │   ├── components/              # Reusable UI components
│   │   │   ├── DailyTimeline.tsx    # Daily evolution timeline chart
│   │   │   ├── ChatDrawer.tsx       # AI chat sidebar
│   │   │   └── ChatMessage.tsx      # Individual chat message
│   │   └── hooks/                   # Custom React hooks
│   │       └── useChat.ts           # AI chat logic
│   ├── api/                         # Vercel serverless functions (optional)
│   ├── vite.config.ts               # Vite config (proxy /api → backend)
│   └── vercel.json                  # Vercel deployment config
├── data/                            # Runtime config persistence (Docker volume)
│   └── dashboard-config.json        # Persisted excluded owners config
├── docs/                            # Documentation
│   └── architecture.md              # This file
├── Dockerfile                       # Multi-stage production build
├── .gitlab-ci.yml                   # GitLab CI/CD pipeline
├── .env.example                     # Environment variable reference
└── tsconfig.json                    # TypeScript configuration
```

---

## Dashboard API

### Data Flow

```
Dashboard SPA  →  /api/dashboard/leads?from=&to=  →  dashboardCache check
                                                           │
                                                     cache miss?
                                                           │
                                                           ▼
                                                   fetchLeadsData()
                                                   (hubspot-queries.ts)
                                                           │
                                                           ▼
                                                   HubSpot CRM API
                                                   (batch search, paginated)
                                                           │
                                                           ▼
                                                   Aggregate + filter
                                                   (exclude owners, MAX_AGE)
                                                           │
                                                           ▼
                                                   Cache result (smart TTL)
                                                           │
                                                           ▼
                                                   JSON response
```

### Endpoint Reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/dashboard/auth/login` | POST | Public | Local credential login → JWT |
| `/api/dashboard/auth/me` | GET | Bearer | Verify token, return user info |
| `/api/dashboard/auth/config` | GET | Public | Auth mode configuration |
| `/api/dashboard/vigencias` | GET | Bearer | Fiscal period boundaries |
| `/api/dashboard/leads` | GET | Bearer | Lead aggregation by period |
| `/api/dashboard/breakdown` | GET | Bearer | Dimensional drill-down |
| `/api/dashboard/cross-data` | GET | Bearer | Cross-dimensional analysis |
| `/api/dashboard/owners` | GET | Bearer | HubSpot owner name resolution |
| `/api/dashboard/config` | GET | Bearer | Runtime configuration |
| `/api/dashboard/config/excluded-owners` | PUT | Bearer | Update excluded owners |
| `/api/dashboard/cache/stats` | GET | Bearer | Cache statistics |
| `/api/dashboard/cache` | DELETE | Bearer | Clear cache |
| `/mcp` | POST/GET/DELETE | OAuth 2.1 | MCP protocol endpoint |
| `/health` | GET | Public | Dependency health check |

---

## Authentication Architecture

### Dual-Mode JWT Authentication (Dashboard)

| Mode | Token Source | Verification | Use Case |
|---|---|---|---|
| **Local** | `POST /auth/login` | HMAC-SHA256 with `JWT_SECRET` | Dev, simple deployments |
| **Keycloak OIDC** | Keycloak login flow | RS256 with remote JWKS | Production, SSO |

Verification order (fast path first):
1. Try local JWT (sync, no I/O) → accept if valid
2. Try Keycloak JWT (async, JWKS fetch) → accept if valid
3. Reject with 401

### MCP Authentication (OAuth 2.1)

The MCP endpoint (`/mcp`) is protected by full OAuth 2.1 via Keycloak:

- **Authorization Code Flow** with PKCE
- **Token exchange** proxied through Keycloak
- **Role-based access** via `KEYCLOAK_REQUIRED_ROLE`
- **Audit logging** on every MCP request

---

## Environment Variables

| Variable | Required | Context |
|---|---|---|
| `MIXPANEL_SERVICE_ACCOUNT_USERNAME` | Always | Mixpanel auth |
| `MIXPANEL_SERVICE_ACCOUNT_SECRET` | Always | Mixpanel auth |
| `MIXPANEL_PROJECT_ID` | Always | Mixpanel project |
| `HUBSPOT_ACCESS_TOKEN` | Always | HubSpot private app |
| `KEYCLOAK_URL` | HTTP mode only | OAuth 2.1 provider |
| `KEYCLOAK_REALM` | HTTP mode only | Keycloak realm |
| `KEYCLOAK_CLIENT_ID` | HTTP mode only | OAuth client |
| `KEYCLOAK_CLIENT_SECRET` | HTTP mode only | OAuth client secret |
| `MCP_BASE_URL` | HTTP mode only | Public server URL |
| `DASHBOARD_API_KEY` | Optional | Legacy API key auth |
| `META_ADS_ACCESS_TOKEN` | Optional | Meta Ads connector |
| `GOOGLE_ADS_*` | Optional | Google Ads connector |
| `OPENAI_API_KEY` | Optional | Whisper transcription |
| `JWT_SECRET` | Optional | Dashboard JWT signing (auto-generated if not set) |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Optional | Local dashboard login |

> **Security**: NEVER expose `HUBSPOT_ACCESS_TOKEN`, `KEYCLOAK_CLIENT_SECRET`, or any secret to frontend code.

Use `shared/config.ts` for all env var access:

```typescript
required("VAR")            // Throws on startup if missing
requiredForHttp("VAR")     // Only required when TRANSPORT=http
optional("VAR", "default") // Falls back to default
```

---

## Performance Budgets

### API Performance

| Metric | Target | Current |
|---|---|---|
| Dashboard `/leads` response (cached) | < 50ms | ✅ |
| Dashboard `/leads` response (cold) | < 8s | ✅ |
| HubSpot API calls per dashboard load | ≤ 20 | ~17 |
| Cache hit rate (steady-state) | > 80% | ✅ |

### Frontend Performance

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 3s |
| JavaScript bundle size | < 500KB gzipped |
| CSS total size | < 100KB |

### Cache Memory

- **LRU capacity**: 50 entries (configurable)
- **Max entry size**: Not enforced — monitor for large cross-data responses
- **Memory ceiling**: Monitor Node.js RSS; alert if > 512MB

---

## Development Workflow

### Local Development

```bash
# Terminal 1: Backend (HTTP mode with hot rebuild)
TRANSPORT=http PORT=3000 npx tsx src/index.ts

# Terminal 2: Frontend (Vite dev server, proxies /api → backend)
cd dashboard && npm run dev
```

### Build & Deploy

```bash
# Backend build
npm run build           # TypeScript → dist/

# Frontend build
cd dashboard && npm run build  # Vite → dashboard/dist/

# Docker build (production, includes frontend)
docker build -t autopista-mcp .
```

### Pre-Commit Checklist

```bash
npm run build           # TypeScript must compile
npm test                # Tests must pass
cd dashboard && npm run lint  # ESLint must pass
```

### Code Review Standards

- **PR size**: Aim for < 400 lines of meaningful change. Split larger work into stacked PRs
- **Review focus**: Security (auth bypass, secret exposure), performance (new API calls, unbounded queries), type safety (`any` usage), and API compatibility (breaking response changes)
- **Required approvals**: 1 reviewer minimum; 2 for auth, security, or API surface changes
- **Self-review**: Author must review their own diff before requesting review

### Docker & GitLab CI

- **Dockerfile**: Multi-stage build (builder → runtime), non-root user
- **GitLab CI**: Uses shared K8S pipeline template
- **GitOps**: Deploys to K8s via manifest repo (`autopista-mcp-conf`)

---

## Incident Response

| Scenario | Action |
|---|---|
| HubSpot API down | Dashboard serves cached data; health check reports degraded; no user action needed |
| Bad deploy to K8s | Revert via GitLab CI rollback; GitOps will auto-sync previous manifest |
| Cache serving stale data | Hit `DELETE /api/dashboard/cache` to force refresh |
| Auth system (Keycloak) down | Local JWT auth continues working; warn in logs |

---

## Testing Strategy

| Layer | What to Test | Tool |
|---|---|---|
| Business logic | Vigencia calculations, cache TTL, filter builders, goal progress | Vitest |
| API endpoints | Response shapes, auth rejection, input validation, error codes | Vitest + supertest |
| Connectors | Client methods with mocked HTTP (no real API calls in tests) | Vitest + msw |
| Frontend | Auth flow, error states, data rendering edge cases | Vitest + React Testing Library |

### Test File Naming

```
src/dashboard/vigencia.test.ts       # Co-located with source
src/dashboard/dashboard-cache.test.ts
dashboard/src/auth/AuthContext.test.tsx
```

### What NOT to Test

- HubSpot/Mixpanel API behavior (that's their responsibility)
- CSS visual appearance (manual review)
- MCP protocol internals (SDK responsibility)

---

## Business Domain Context

### Vigencias (Fiscal Periods)

Medicus uses custom fiscal periods called "vigencias" that run from the 21st of one month to the 22nd of the next:

```typescript
// Example: Vigencia "Enero 2026" = Dec 21, 2025 → Jan 22, 2026
// The vigencia.ts module handles all boundary calculations
```

- **Start day** and **end day** are configurable per-year
- Previous period comparison is automatic for % change calculations
- Multi-year support (2025, 2026)

### Owner Exclusion

Certain HubSpot owners (admin accounts, bots, duplicates) must be excluded from lead reports. This is managed via runtime config to avoid redeployments.

### Canal (Channel) Mapping

Raw HubSpot channel values are mapped to display names:
- `"REDES"` → `"Forms META"`
- `"CHENGO"` → `"Whatsapp Chengo"`
- `"WEB MEDICUS / COTI ONLINE"` → `"Cotizador WEB"`

---

## Runtime Configuration

Dashboard config that needs to change without redeployment uses the `DashboardConfig` class:

- **Persisted to disk** (`data/dashboard-config.json`) via atomic writes
- **Survives restarts** when `data/` is mounted as a Docker volume
- **Auto-invalidates cache** when config changes
- **Graceful degradation** — if disk I/O fails, in-memory state is preserved

```typescript
// Read config
const excludedIds = dashboardConfig.getExcludedOwnerIds();

// Update config (always provide cache-clear callback)
dashboardConfig.setExcludedOwnerIds(newIds, () => dashboardCache.clear());
```
