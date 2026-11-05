/**
 * Axios API Client
 * - Auto-attaches JWT access token (from Zustand memory, never localStorage)
 * - Handles token refresh on 401 (refresh token is an HttpOnly cookie)
 * - Centralized error handling
 *
 * MED-01 Security hardening:
 * - Access token is read from Zustand in-memory store, not localStorage
 * - Refresh call uses `withCredentials: true` so the browser automatically
 *   sends the HttpOnly refreshToken cookie — the token itself is never
 *   accessible to JavaScript
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore, getLegacyRefreshToken, clearLegacyRefreshToken } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  // Required for the browser to send HttpOnly (__Host-refresh) cookies on cross-origin / same-site requests
  withCredentials: true,
})

let refreshPromise: Promise<string> | null = null

/**
 * Perform a single, deduplicated session refresh using the __Host-refresh cookie or buffered legacy token.
 * Returns the fresh accessToken and updates user state in store.
 */
export async function refreshSession(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const legacyToken = getLegacyRefreshToken()
      const { data } = await axios.post(
        `${BASE_URL}/auth/refresh`,
        legacyToken ? { refreshToken: legacyToken } : {},
        { withCredentials: true },
      )
      const newToken = data?.data?.accessToken
      const user = data?.data?.user

      if (!newToken) {
        throw new Error('No access token returned from refresh')
      }

      // Successful refresh: clear legacy credentials immediately
      clearLegacyRefreshToken()

      // Update in-memory auth state
      useAuthStore.getState().setToken(newToken)
      if (user) {
        useAuthStore.getState().updateUser(user)
      }

      return newToken
    } catch (err) {
      clearLegacyRefreshToken()
      useAuthStore.getState().logout()
      throw err
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ── Request Interceptor: Attach access token (or await refresh on reload) ─────
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Never intercept auth endpoints to avoid loops
  if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register') || config.url?.includes('/auth/refresh')) {
    return config
  }

  let token = useAuthStore.getState().accessToken

  // If authenticated in store (or legacy token pending) but memory token is missing, restore session first
  if (!token && (useAuthStore.getState().isAuthenticated || !!getLegacyRefreshToken())) {
    try {
      token = await refreshSession()
    } catch {
      // Refresh failed; request will proceed unauthenticated and get rejected with 401
    }
  }

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response Interceptor: Handle 401 + deduplicated token refresh ─────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Don't intercept auth endpoints
    if (originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh')) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const newToken = await refreshSession()
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
