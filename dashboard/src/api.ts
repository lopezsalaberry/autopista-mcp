/**
 * API communication layer for the Growth Dashboard.
 *
 * NOTE: This module uses a module-level singleton for the auth token.
 * This works because ESM guarantees a single module instance across
 * all importers in the same bundle. The App component calls
 * setAuthToken() on every token change via useEffect.
 */

export const API_BASE = '/api/dashboard'

// Module-level auth token — set by App component, used by all fetchApi calls
let _authToken: string | null = null

export function setAuthToken(token: string | null) {
  _authToken = token
}

/**
 * Authenticated fetch wrapper.
 * Automatically injects the Bearer token and handles error responses.
 */
export async function fetchApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {}
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`

  // 120s allows YTD cross-data to fully paginate on first load;
  // server-side cache (1h TTL) ensures this cost is paid only once.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('signal timed out')), 120_000)
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  const combinedSignal = controller.signal

  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: combinedSignal, headers })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || `API error: ${res.status}`)
    }
    return res.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Authenticated fetch with custom options (for PUT/POST/DELETE).
 * Used by SettingsPage for saving exclusions.
 */
export async function fetchApiMutate<T>(
  path: string,
  options: { method: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `API error: ${res.status}`)
  }
  return res.json()
}
