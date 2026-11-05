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
        set({ user: null, accessToken: null, isAuthenticated: false })
      },

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-store',
      version: 3,
      // Drop any legacy persisted tokens during migration and hydration
      migrate: (persisted: any) => ({
        user: persisted?.user ?? null,
        isAuthenticated: !!persisted?.isAuthenticated,
      }),
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
