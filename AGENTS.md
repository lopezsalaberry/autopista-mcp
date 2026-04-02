# Coding Rules — Autopista MCP

> Prescriptive rules for AI-assisted code generation. For architecture reference, diagrams, endpoint tables, env vars, and deployment docs, see [docs/architecture.md](docs/architecture.md).

---

## Stack (no alternatives)

- **Backend**: Node.js 24, TypeScript 5 (strict), Express 5, Pino logger, Zod validation
- **Frontend**: React 19, Vite 6, Vanilla CSS (no Tailwind, no CSS-in-JS), Recharts
- **MCP**: `@modelcontextprotocol/sdk`, Keycloak OAuth 2.1
- **Auth**: JWT dual-mode — local HMAC-SHA256 + Keycloak OIDC (RS256/JWKS)
- **Security**: Helmet, express-rate-limit (100 req/min/IP)
- **Deploy**: Docker multi-stage, GitLab CI, K8s via GitOps

---

## Critical Rules

### NEVER

1. Expose API keys or secrets to frontend code
2. Skip JWT authentication on dashboard API routes
3. Use `console.log`/`console.error` in server-side code — use Pino logger
4. Make unbounded HubSpot API queries — always paginate with limits
5. Hardcode owner IDs or business logic that can change — use runtime config
6. Commit `.env` files — only `.env.example`
7. Add libraries without evaluating bundle impact and license (MIT/Apache only)
8. Use `catch (e: any)` — always `catch (err: unknown)` with type narrowing
9. Call external APIs without `AbortSignal.timeout()`
10. Swallow errors silently — log server-side, show UI state client-side

### ALWAYS

1. Validate input parameters (dates, dimensions, IDs) with proper error messages
2. Return structured error responses: `{ error: { code, message, timestamp } }`
3. Use `dashboardCache` with `computeCacheTTL(from, to)` for HubSpot queries
4. Apply `getExcludedOwnerIds()` when querying lead/contact data
5. Use `AbortSignal.timeout()` on every external API call
6. Log errors with context objects: `logger.error({ err, context }, "message")`
7. Use TypeScript strict mode — zero tolerance for `any`
8. Filter contacts by `MAX_AGE` (currently 64) for lead reporting
9. Propagate trace/correlation IDs for request traceability
10. Use the `wrapTool()` helper for MCP tool handlers
11. Wrap major React sections in Error Boundaries

---

## Banned Patterns

```typescript
// ❌ NEVER: `any` in catch blocks
} catch (e: any) {
  return error(e.message);
}

// ✅ ALWAYS: `unknown` with type narrowing + logging
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err }, "Operation failed");
  return error(message);
}

// ❌ NEVER: `as any` to bypass types
const data = await res.json() as any;

// ✅ ALWAYS: Define proper interfaces
interface HubSpotSearchResponse {
  total: number;
  results: HubSpotContact[];
  paging?: { next?: { after: string } };
}
const data: HubSpotSearchResponse = await res.json();

// ❌ NEVER: console.log in server code
console.log("Fetched leads:", leads.length);

// ✅ ALWAYS: Structured Pino logger
import { logger } from "../shared/logger.js";
logger.info({ from, to, count: leads.length }, "Leads data fetched");
```

**Type Safety Escalation:**

| Pattern | Verdict |
|---|---|
| `as any` for library interop | Acceptable only with `// TYPE: [reason]` comment |
| `as any` for API responses | Unacceptable — define an interface |
| `catch (e: any)` | Unacceptable — always use `unknown` |
| `@ts-ignore` / `@ts-expect-error` | Requires explanatory comment |

---

## Required Patterns

### MCP Tool Handlers

All tool handlers MUST use `wrapTool()` for consistent error handling and logging:

```typescript
function wrapTool<T>(fn: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return json(await fn(args));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "MCP tool error");
      return error(message);
    }
  };
}

server.tool("tool-name", "Description", schema, wrapTool(async (args) => {
  return await client.someMethod(args);
}));
```

### Backend Error Handling

```typescript
router.get("/endpoint", async (req: Request, res: Response) => {
  try {
    if (!from || !to) {
      res.status(400).json({
        error: { code: "INVALID_PARAMS", message: "from and to are required" },
      });
      return;
    }
    const data = await fetchData(from, to);
    res.json(data);
  } catch (err: unknown) {
    logger.error({ err, from, to }, "Error fetching data");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
    });
  }
});
```

### Frontend Error Handling

```typescript
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { logout(); return; }
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Error desconocido");
  }
  const data = await res.json();
} catch (err) {
  setError(err instanceof Error ? err.message : "Error desconocido");
}
```

Frontend errors MUST surface to the user via UI state (error banners, retry buttons). `console.warn` alone is not acceptable.

### External API Calls

Every call to HubSpot, Mixpanel, Meta, Google, or Keycloak MUST implement:

```typescript
// 1. Timeout (mandatory)
const res = await fetch(url, {
  signal: AbortSignal.timeout(15_000),
  headers: { Authorization: `Bearer ${token}` },
});

// 2. Retry on 429 with backoff
if (res.status === 429 && attempt < MAX_RETRIES) {
  const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
  await new Promise(r => setTimeout(r, retryAfter * 1000 * (attempt + 1)));
  continue;
}

// 3. Concurrency control
const MAX_CONCURRENT = 4;
```

**Standard timeouts:** Health checks: 5s · Dashboard queries: 15s · MCP tools: 30s · Pagination: 15s/page

**Graceful degradation:** When external APIs are down, serve stale cache with a warning rather than failing entirely.

### Caching

| Period Type | TTL | Rationale |
|---|---|---|
| Historical (`to < today`) | 1 hour | Data doesn't change |
| Active period | 5 minutes | Balance freshness vs API limits |
| Today (`from === to`) | 2 minutes | Near real-time feel |

Always use `dashboardCache.set(key, data, computeCacheTTL(from, to))`.

---

## Connector Pattern

Each external service follows `connectors/[service]/{client.ts, tools.ts}`:
- `client.ts` — API client (HTTP, auth, pagination, rate limiting)
- `tools.ts` — MCP tool registrations using `wrapTool()`

Register in `mcp.ts`, gate behind env vars:

```typescript
if (config.NEW_API_TOKEN) {
  const client = new NewClient({ token: config.NEW_API_TOKEN });
  registerNewTools(server, client);
}
```

---

## Naming Conventions

### Files

| Type | Convention | Example |
|---|---|---|
| Backend modules | kebab-case | `dashboard-router.ts`, `audit-logger.ts` |
| React components | PascalCase | `ChatDrawer.tsx`, `LoginPage.tsx` |
| Hooks | camelCase with `use` | `useChat.ts` |
| Config files | kebab-case | `dashboard-config.ts` |

### Code

| Type | Convention | Example |
|---|---|---|
| Classes | PascalCase | `DashboardCache`, `HubSpotClient` |
| Functions | camelCase | `fetchLeadsData`, `computeCacheTTL` |
| Constants | UPPER_SNAKE_CASE | `MAX_AGE`, `ALL_CANALES` |
| Interfaces/Types | PascalCase | `VigenciaConfig`, `AuthenticatedRequest` |
| Config keys | UPPER_SNAKE_CASE | `HUBSPOT_ACCESS_TOKEN` |
| MCP tool names | snake_case with object prefix | `hubspot_search_contacts` |

### Import Ordering

Imports MUST follow this order, separated by blank lines:

```typescript
// 1. Node.js builtins
import { readFile } from "node:fs/promises";

// 2. External dependencies
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// 3. Internal shared modules
import { logger } from "../shared/logger.js";
import { config } from "../shared/config.js";

// 4. Relative imports (same feature area)
import { HubSpotClient } from "./client.js";
```

---

## File Size & Structure

- **Soft limit**: 500 lines per file
- **Hard limit**: 800 lines — must split

Extract when: >500 lines, multiple data-fetching concerns, reusable UI patterns, complex business logic, or CSS >500 lines.

### Frontend Rules

- **Vanilla CSS only** with CSS custom properties for theming
- **State management**: React Context for auth, `useState`/`useEffect` for everything else. No Redux/Zustand.
- **Error Boundaries**: Wrap major sections so a crash in one panel doesn't kill the dashboard
- **API calls**: Always include JWT via `Authorization: Bearer ${token}`. On 401, call `logout()`.

---

## Security Checklist

- All dashboard routes protected by `dashboardAuth` middleware (except `/auth/*`)
- MCP endpoint protected by OAuth 2.1 middleware + audit logger
- Input validation on all query params and request bodies
- Rate limiting: 100 req/min per IP at Express level
- Trace/correlation IDs on every request (`x-trace-id`, `x-correlation-id`)
- Logger auto-redacts: `authorization`, `x-api-key`, `password`, `secret`, `token`, `accessToken`
- Lock files committed and reviewed. `npm audit` before releases. New deps require license + bundle eval.

---

## Dependency Management

- **Lock files** — `package-lock.json` MUST be committed and reviewed on dependency changes
- **Security audits** — Run `npm audit` before each release; fix critical/high findings
- **New dependencies** — Evaluate bundle size, maintenance activity, license (MIT/Apache only), and security posture. Document rationale in PR
- **Updates** — Review `npm outdated` monthly; apply security patches immediately

---

## CI Gate

```bash
npm run build                    # TypeScript must compile
npm test                         # All tests pass
cd dashboard && npm run lint     # ESLint clean
```
