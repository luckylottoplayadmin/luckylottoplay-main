import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { Mail, Zap, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: authService.forgotPassword,
    onSuccess: () => setSent(true),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send email'),
  })

  return (
    <main className="forgot-password-main" style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px 20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'white', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 900 }} aria-label="Lucky Lotto Play Homepage">
            <Zap size={24} style={{ color: 'var(--color-secondary)' }} />
            Lucky <span style={{ color: 'var(--color-secondary)' }}>Lotto Play</span>
          </Link>
          <h1 className="sr-only">Forgot Password</h1>
        </div>

        <div className="card card-body">
          {sent ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle size={52} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '8px' }}>Email Sent!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                Check your inbox for a password reset link. It expires in 30 minutes.
              </p>
              <Link to="/login" className="btn btn-primary btn-full">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '6px' }}>Forgot Password?</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                Enter your email and we'll send you a reset link.
              </p>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" htmlFor="forgot-email">Email Address</label>
                <div className="input-wrapper has-icon-left">
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    id="forgot-email"
                  />
                </div>
              </div>
              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={() => mutation.mutate(email)}
                disabled={mutation.isPending || !email}
              >
                {mutation.isPending ? <><div className="btn-spinner" /> Sending...</> : 'Send Reset Link'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <Link to="/login" style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 600 }}>← Back to Sign In</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
