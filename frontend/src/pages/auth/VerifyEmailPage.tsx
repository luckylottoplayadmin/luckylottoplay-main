import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { Zap, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const email = params.get('email')
  const token = params.get('token')
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: () => authService.verifyEmail(email || '', token!),
    onSuccess: () => setDone(true),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Verification failed'),
  })

  useEffect(() => {
    if (token) mutation.mutate()
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'white', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 900 }}>
            <Zap size={24} style={{ color: 'var(--color-secondary)' }} />
            Lucky <span style={{ color: 'var(--color-secondary)' }}>Lotto Play</span>
          </Link>
        </div>
        <div className="card card-body" style={{ textAlign: 'center' }}>
          {done ? (
            <>
              <CheckCircle size={52} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '8px' }}>Email Verified!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Your account is now active.</p>
              <Link to="/login" className="btn btn-primary btn-full">Sign In Now</Link>
            </>
          ) : mutation.isPending ? (
            <div>
              <div className="btn-spinner" style={{ margin: '0 auto 16px', width: '40px', height: '40px', borderWidth: '3px', borderTopColor: 'var(--color-primary)' }} />
              <p>Verifying your email...</p>
            </div>
          ) : (
            <>
              <h2 style={{ marginBottom: '12px' }}>Verification Failed</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>The link may have expired or is invalid.</p>
              <Link to="/login" className="btn btn-primary btn-full">Back to Sign In</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
