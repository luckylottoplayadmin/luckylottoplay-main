import BrandLogo from '@/components/common/BrandLogo'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

const schema = z.object({
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const token = params.get('token') || ''

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: ({ password }: FormData) => authService.resetPassword(token, password),
    onSuccess: () => { toast.success('Password reset! Please sign in.'); navigate('/login') },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Reset failed'),
  })

  return (
    <main className="reset-password-main" style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'white', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 900 }} aria-label="Lucky Lotto Play Homepage">
            <BrandLogo />
          </Link>
          <h1 className="sr-only">Reset Password</h1>
        </div>
        <div className="card card-body">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '20px' }}>Reset Password</h2>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New Password</label>
              <div className="input-wrapper has-icon-left has-icon-right">
                <span className="input-icon"><Lock size={16} /></span>
                <input {...register('password')} type={show ? 'text' : 'password'} className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Min 8 characters" id="new-password" />
                <button type="button" className="input-icon-right" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="form-error" role="alert">{errors.password.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
              <input {...register('confirmPassword')} type="password" className={`form-input ${errors.confirmPassword ? 'error' : ''}`} placeholder="Repeat password" id="confirm-password" />
              {errors.confirmPassword && <span className="form-error" role="alert">{errors.confirmPassword.message}</span>}
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={mutation.isPending}>
              {mutation.isPending ? <><div className="btn-spinner" /> Resetting...</> : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
