import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { walletService } from '@/services/wallet.service'
import { ArrowDownLeft, Ticket, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

export default function DepositPage() {
  const [code, setCode] = useState('')
  const [successData, setSuccessData] = useState<{ amount: number; code: string } | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const loadingSteps = [
    'Validating coupon code...',
    'Checking database entries...',
    'Securing ledger transactions...',
    'Crediting coins to your balance...'
  ]

  const mutation = useMutation({
    mutationFn: () => walletService.redeemCoupon(code),
    onSuccess: (r) => {
      setSuccessData({ amount: r.data.data.amount, code: code })
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Redemption failed'),
  })

  useEffect(() => {
    let interval: any
    if (mutation.isPending) {
      setLoadingStep(0)
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % loadingSteps.length)
      }, 1500)
    } else {
      setLoadingStep(0)
    }
    return () => clearInterval(interval)
  }, [mutation.isPending])

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '500px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '36px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ArrowDownLeft size={32} style={{ color: 'var(--color-accent)' }} />
          Add Funds
        </h1>

        <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Ticket size={48} style={{ color: 'var(--color-primary)', marginBottom: '16px', opacity: 0.8 }} />
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Redeem Coupon</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
              Enter your promotional coupon code below to instantly add funds to your wallet balance.
            </p>
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: '8px' }}>Coupon Code</div>
            <div className="input-wrapper">
              <input
                type="text"
                className="form-input"
                placeholder="e.g. FREE50"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}
              />
            </div>
          </div>

          <button
            className="btn btn-gold btn-lg btn-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || code.length < 3}
          >
            {mutation.isPending ? <><div className="btn-spinner" /> Processing...</> : 'Redeem Code'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <a 
              href={import.meta.env.VITE_COUPON_BUY_URL || 'https://couponworld.live/dashboard/marketplace/coupon/e3648e73-1c92-4252-a666-b67f2f11b781'} 
              target="_blank" 
              rel="noreferrer" 
              style={{ color: 'var(--color-primary)', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}
            >
              Need a coupon? Buy one here &rarr;
            </a>
          </div>
        </div>
      </div>

      {/* Loading Overlay Screen */}
      {mutation.isPending && (
        <div className="coupon-loading-overlay">
          <div className="coupon-loading-card">
            <div className="spinner-container-outer">
              <div className="double-ring-spinner" />
              <Ticket size={36} className="spinner-icon-inner" />
            </div>
            <h3 className="loading-step-text">
              {loadingSteps[loadingStep]}
            </h3>
            <p className="loading-subtext">Please don't close this page or press back.</p>
          </div>
        </div>
      )}

      {/* Success Modal Overlay Window */}
      {successData && (
        <div className="coupon-success-overlay">
          <div className="coupon-success-card">
            <div className="sparkle-container">
              <div className="success-sparkle success-sparkle-1" />
              <div className="success-sparkle success-sparkle-2" />
              <div className="success-sparkle success-sparkle-3" />
              <div className="success-sparkle success-sparkle-4" />
              <div className="success-sparkle success-sparkle-5" />
            </div>
            
            <div className="success-icon-wrapper">
              <CheckCircle2 size={40} />
            </div>
            
            <h2 className="coupon-success-title">Redeemed Successfully!</h2>
            
            <p className="coupon-success-desc">
              Your promotional code has been accepted.
            </p>

            <div style={{ margin: '8px 0' }}>
              <span className="coupon-code-badge">
                <Ticket size={16} />
                {successData.code.toUpperCase()}
              </span>
            </div>

            <div>
              <div className="coupon-success-amount">
                +{successData.amount.toFixed(2)} Coins
              </div>
            </div>

            <p className="loading-subtext">
              Funds have been added to your wallet balance.
            </p>

            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '12px' }}>
              <button
                className="btn btn-outline btn-full"
                onClick={() => setSuccessData(null)}
              >
                Redeem Another
              </button>
              <button
                className="btn btn-gold btn-full"
                onClick={() => navigate('/wallet')}
              >
                Go to Wallet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

