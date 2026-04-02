import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { login, error: authError, authConfig } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const error = localError || authError

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setLocalError('Completá usuario y contraseña')
      return
    }
    setLocalError(null)
    setLoading(true)
    try {
      await login(username.trim(), password.trim())
    } catch {
      // error is handled by AuthContext
    } finally {
      setLoading(false)
    }
  }

  const handleKeycloakLogin = () => {
    if (!authConfig?.keycloak) return
    const { url, realm, clientId } = authConfig.keycloak
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback')
    const authUrl = `${url}/realms/${realm}/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid`
    window.location.href = authUrl
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header gradient bar */}
        <div className="login-header">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.15"/>
              <path d="M8 16L14 10L20 16L14 22Z" fill="white" fillOpacity="0.9"/>
              <path d="M14 16L20 10L26 16L20 22Z" fill="white" fillOpacity="0.6"/>
            </svg>
          </div>
          <h1>Growth Dashboard</h1>
          <p>Medicus — Leads & Conversión</p>
        </div>

        <div className="login-body">
          {/* Keycloak SSO button (if configured) */}
          {authConfig?.hasKeycloak && (
            <>
              <button
                className="login-sso-btn"
                onClick={handleKeycloakLogin}
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 1L1 5v8l8 4 8-4V5L9 1z" />
                  <path d="M1 5l8 4m0 0l8-4M9 9v8" />
                </svg>
                Iniciar sesión con Medicus SSO
              </button>
              <div className="login-divider">
                <span>o</span>
              </div>
            </>
          )}

          {/* Local login form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="login-username">Usuario</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => {
                  setUsername(e.target.value)
                  setLocalError(null)
                }}
                placeholder="Ingresá tu usuario"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value)
                  setLocalError(null)
                }}
                placeholder="Ingresá tu contraseña"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="login-error">
                <span className="login-error-icon">⚠</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? (
                <span className="login-spinner" />
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>

        <div className="login-footer">
          <span>Medicus © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  )
}
