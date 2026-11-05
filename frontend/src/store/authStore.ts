/**
 * Auth Store - Zustand
 * Manages authentication state, user info, and session lifecycle
 *
 * Hardened Security Architecture (Finding F-01 Remediation):
 * - Access token is kept in application memory ONLY (never written to localStorage)
 * - Refresh token is an HttpOnly, Secure, Host-Only (__Host-refresh) cookie
 *   managed exclusively by the server on https://api.luckylottoplay.live
 * - Only non-sensitive user profile metadata and isAuthenticated flag are persisted
 *   so the UI knows whether to initiate a session restoration on page reload
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

// ── Extract and buffer legacy refresh token in memory BEFORE Zustand migrates localStorage ──
let memoryLegacyRefreshToken: string | null = null

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem('auth-store')
    if (raw) {
      const parsed = JSON.parse(raw)
      const token = parsed?.state?.refreshToken || parsed?.refreshToken
      if (typeof token === 'string' && token.trim().length > 0) {
        memoryLegacyRefreshToken = token.trim()
      }
    }
  }
} catch {
  // Ignore localStorage parsing errors
}

/**
 * Retrieve the buffered legacy refresh token for one-time exchange against /auth/refresh
 */
export function getLegacyRefreshToken(): string | null {
  return memoryLegacyRefreshToken
}

/**
 * Permanently purge legacy refresh token from memory and persistent storage
 */
export function clearLegacyRefreshToken(): void {
  memoryLegacyRefreshToken = null
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('auth-store')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.state?.refreshToken || parsed?.state?.accessToken || parsed?.refreshToken || parsed?.accessToken) {
          delete parsed?.state?.refreshToken
          delete parsed?.state?.accessToken
          delete parsed?.refreshToken
          delete parsed?.accessToken
          window.localStorage.setItem('auth-store', JSON.stringify(parsed))
        }
      }
    }
  } catch {}
}

interface AuthStore {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  setAuth: (user: User, accessToken: string) => void
  updateUser: (updates: Partial<User>) => void
  setToken: (accessToken: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (user, accessToken) => {
        set({ user, accessToken, isAuthenticated: true })
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setToken: (accessToken) => {
        set({ accessToken })
      },

      logout: () => {
        clearLegacyRefreshToken()
        set({ user: null, accessToken: null, isAuthenticated: false })
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-store',
      version: 3,
      // Capture and drop any legacy persisted tokens during migration and hydration
      migrate: (persisted: any) => {
        const candidate = persisted?.refreshToken || persisted?.state?.refreshToken
        if (candidate && !memoryLegacyRefreshToken && typeof candidate === 'string') {
          memoryLegacyRefreshToken = candidate.trim()
        }
        return {
          user: persisted?.user ?? null,
          isAuthenticated: !!persisted?.isAuthenticated,
        }
      },
      merge: (persisted: any, current) => ({
        ...current,
        user: persisted?.user ?? null,
        isAuthenticated: !!persisted?.isAuthenticated,
        accessToken: null,
      }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
