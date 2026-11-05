import api from './api'
import type { ApiResponse, User } from '@/types'

export interface LoginPayload { email: string; password: string; totp?: string }
export interface RegisterPayload {
  email: string; username: string; password: string
  firstName: string; lastName: string
  country?: string; phone?: string
  dateOfBirth?: string; referralCode?: string
}

export const authService = {
  login: (payload: LoginPayload) =>
    api.post<ApiResponse<{ accessToken: string; refreshToken?: string; user: User }>>('/auth/login', payload),

  requestEmailOtp: (payload: LoginPayload) =>
    api.post<ApiResponse>('/auth/request-email-otp', payload),

  register: (payload: RegisterPayload) =>
    api.post<ApiResponse<{ id: string; email: string }>>('/auth/register', payload),

  logout: () => api.post('/auth/logout'),

  refresh: () =>
    api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {}),

  verifyEmail: (email: string, token: string) =>
    api.post<ApiResponse>('/auth/verify-email', { email, token }),

  resendVerification: (email: string) =>
    api.post<ApiResponse>('/auth/resend-verification', { email }),

  forgotPassword: (email: string) =>
    api.post<ApiResponse>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<ApiResponse>('/auth/reset-password', { token, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<ApiResponse>('/auth/change-password', { currentPassword, newPassword }),

  setup2FA: () =>
    api.post<ApiResponse<{ secret: string; qrCode: string }>>('/auth/2fa/setup'),

  confirm2FA: (token: string) =>
    api.post<ApiResponse>('/auth/2fa/confirm', { token }),

  disable2FA: (password: string, token: string) =>
    api.delete<ApiResponse>('/auth/2fa', { data: { password, token } }),

  getSessions: () =>
    api.get<ApiResponse<any[]>>('/auth/sessions'),

  revokeSession: (id: string) =>
    api.delete<ApiResponse>(`/auth/sessions/${id}`),
}
