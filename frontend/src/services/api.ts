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
import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  // MED-01: Required for the browser to send HttpOnly cookies on same-origin requests
  withCredentials: true,
})

// ── Request Interceptor: Attach access token from memory ──────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // MED-01: Read from Zustand memory — NOT from localStorage
  const token = useAuthStore.getState().accessToken
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response Interceptor: Handle 401 + token refresh ─────────────────────────
let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Don't intercept auth endpoints to avoid infinite loops
    if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const storedRefreshToken = useAuthStore.getState().refreshToken
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refreshToken: storedRefreshToken },
          {
            withCredentials: true,
            headers: storedRefreshToken ? { 'X-Refresh-Token': storedRefreshToken } : {},
          },
        )
        const newToken = data.data.accessToken
        const newRefreshToken = data.data.refreshToken || storedRefreshToken

        // Update in-memory and persistent store with the new access token
        useAuthStore.getState().setToken(newToken, newRefreshToken)

        processQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
