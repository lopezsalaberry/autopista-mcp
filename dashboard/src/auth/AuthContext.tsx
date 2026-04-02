import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface User {
  username: string
  displayName: string
  type?: 'local' | 'keycloak'
}

interface AuthConfig {
  hasLocalLogin: boolean
  hasKeycloak: boolean
  keycloak: {
    url: string
    realm: string
    clientId: string
  } | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  authConfig: AuthConfig | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  error: string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_BASE = '/api/dashboard'
const TOKEN_KEY = 'medicus-dashboard-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)

  // Fetch auth configuration on mount
  useEffect(() => {
    fetch(`${API_BASE}/auth/config`)
      .then(r => r.json())
      .then(config => setAuthConfig(config))
      .catch(() => {
        // If config endpoint fails, assume local login only
        setAuthConfig({ hasLocalLogin: true, hasKeycloak: false, keycloak: null })
      })
  }, [])

  // Try to restore session from stored token
  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setIsLoading(false)
      return
    }

    // Verify the stored token is still valid
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('Token expired')
        return r.json()
      })
      .then(data => {
        setToken(stored)
        setUser(data.user)
      })
      .catch(() => {
        // Token expired or invalid — clear it
        sessionStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Error de autenticación')
      }

      setToken(data.token)
      setUser(data.user)
      sessionStorage.setItem(TOKEN_KEY, data.token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    sessionStorage.removeItem(TOKEN_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      authConfig,
      login,
      logout,
      error,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
