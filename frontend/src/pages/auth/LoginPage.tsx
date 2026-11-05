import BrandLogo from '@/components/common/BrandLogo'
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { Eye, EyeOff, Mail, Lock, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  totp: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, isAuthenticated } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [needs2FA, setNeeds2FA] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  if (isAuthenticated) return null

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (r) => {
      if (r.data.requiresTOTP) {
        setNeeds2FA(true)
        toast.error('Please enter your 2FA authenticator code')
        return
      }
      const { user, accessToken, refreshToken } = r.data.data!
      setAuth(user, accessToken, refreshToken)
      toast.success(`Welcome back, ${user.firstName}!`)
      navigate(user.role !== 'USER' ? '/admin' : '/')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Login failed'
      if (msg.includes('2FA') || msg.includes('TOTP')) setNeeds2FA(true)
      else toast.error(msg)
    },
  })

  const requestOtpMutation = useMutation({
    mutationFn: () => {
      const { email, password } = getValues()
      return authService.requestEmailOtp({ email, password })
    },
    onSuccess: () => toast.success('Verification code sent to your email'),
    onError: () => toast.error('Failed to send verification code'),
  })

  const onSubmit = (data: FormData) => mutation.mutate(data as any)

  return (
    <main className="login-page-main" style={{
      minHeight: '100vh',
      background: 'var(--gradient-hero)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'white', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 900 }}>
            <BrandLogo />
          </Link>
          <h1 style={{ color: '#E2E8F0', fontSize: '15px', marginTop: '6px', fontWeight: 500 }}>
            Sign in to your account
          </h1>
        </div>

        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email Address<span className="required" aria-hidden="true">*</span></label>
                <div className="input-wrapper has-icon-left">
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    {...register('email')}
                    type="email"
                    className={`form-input ${errors.email ? 'error' : ''}`}
                    placeholder="you@example.com"
                    autoComplete="email"
                    id="email"
                  />
                </div>
                {errors.email && <span className="form-error" role="alert">{errors.email.message}</span>}
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Password<span className="required" aria-hidden="true">*</span>
                </label>
                <div className="input-wrapper has-icon-left has-icon-right">
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    id="password"
                  />
                  <button
                    type="button"
                    className="input-icon-right"
                    aria-label={showPassword ? "Hide password text" : "Show password text"}
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <span className="form-error" role="alert">{errors.password.message}</span>}
              </div>

              {/* 2FA */}
              {needs2FA && (
                <div className="form-group">
                  <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label htmlFor="totp">Verification Code (2FA or Email)</label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: 0, height: 'auto', color: 'var(--color-accent)' }}
                      onClick={() => requestOtpMutation.mutate()}
                      disabled={requestOtpMutation.isPending}
                    >
                      {requestOtpMutation.isPending ? 'Sending...' : 'Send Code via Email'}
                    </button>
                  </div>
                  <input {...register('totp')} type="text" className="form-input" placeholder="000000" maxLength={6} inputMode="numeric" id="totp" />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Link to="/forgot-password" style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? <><div className="btn-spinner" /> Signing in...</> : 'Sign In'}
              </button>
            </form>

            <div className="divider-label">
              <span>New to Lucky Lotto Play?</span>
            </div>

            <Link to="/register" className="btn btn-outline btn-full">
              Create Free Account
            </Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#94A3B8' }}>
          18+ only | Gamble Responsibly
        </div>
      </div>
    </main>
  )
}
