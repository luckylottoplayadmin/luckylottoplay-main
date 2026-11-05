import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { walletService } from '@/services/wallet.service'
import { ArrowUpRight, Info, ShieldAlert } from 'lucide-react'
import GoldCoin from '@/components/common/GoldCoin'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function WithdrawPage() {
  const [amount, setAmount] = useState('')
  const [totp, setTotp] = useState('')
  const { user } = useAuthStore()
  const couponAppUrl = import.meta.env.VITE_COUPON_APP_URL || 'https://couponworld.live'

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => walletService.get(),
    select: (r) => r.data?.data,
  })

  const transferMutation = useMutation({
    mutationFn: () => walletService.transferToCouponWallet(Number(amount), totp),
    onSuccess: (response) => {
      if (response.data?.data?.status === 'PENDING') {
        toast(response.data.message || 'Transfer pending confirmation. Please do not submit it again.')
      } else {
        toast.success('Transferred to Coupon Wallet successfully!')
      }
      setAmount('')
      setTotp('')
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error || 'Transfer failed'
      if (err.response?.data?.code === 'KYC_REQUIRED') {
        toast.error('Please complete KYC verification before withdrawing funds')
      } else {
        toast.error(errMsg)
      }
    },
  })

  const requestOtpMutation = useMutation({
    mutationFn: () => walletService.requestEmailOtp(),
    onSuccess: () => toast.success('Verification code sent to your email'),
    onError: () => toast.error('Failed to send verification code'),
  })

  const available = Number(wallet?.balance || 0)
  const isKycVerified = user?.kycStatus === 'APPROVED'
  const isEmailVerified = user?.emailVerified
  const is2FAEnabled = user?.twoFactorEnabled
  const isInvalid = !amount || Number(amount) < 50 || Number(amount) > available || !isKycVerified || !isEmailVerified || totp.length !== 6

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '640px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '36px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ArrowUpRight size={32} style={{ color: 'var(--color-accent)' }} />
          Transfer to Coupon Wallet
        </h1>

        <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {!isEmailVerified && (
            <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldAlert size={24} style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '15px' }}>Email not verified</strong>
                  <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px' }}>
                    You must verify your email address before withdrawing or transferring funds.
                  </div>
                </div>
              </div>
              <Link to="/profile" className="btn btn-sm btn-gold" style={{ whiteSpace: 'nowrap' }}>
                Verify Email
              </Link>
            </div>
          )}

          {!isKycVerified && (
            <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldAlert size={24} style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '15px' }}>Please complete KYC verification</strong>
                  <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px' }}>
                    Identity verification is required before withdrawing or transferring funds.
                  </div>
                </div>
              </div>
              <Link to="/profile/kyc" className="btn btn-sm btn-gold" style={{ whiteSpace: 'nowrap' }}>
                Verify Now
              </Link>
            </div>
          )}

          {!is2FAEnabled && (
            <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldAlert size={24} style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '15px' }}>Authenticator App Not Setup</strong>
                  <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px' }}>
                    You will need to request an Email OTP to proceed, or setup an Authenticator App in your profile.
                  </div>
                </div>
              </div>
              <Link to="/profile/security" className="btn btn-sm btn-gold" style={{ whiteSpace: 'nowrap' }}>
                Setup App
              </Link>
            </div>
          )}

          <div className="alert alert-info" role="note" aria-label="How withdrawals work">
            <Info size={18} className="alert-icon" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <strong>How withdrawals work</strong>
              <div style={{ fontSize: '13px', lineHeight: 1.6, marginTop: '6px' }}>
                First, create a <strong>CouponWorld</strong> account using the <strong>same email address</strong> as your Lucky Lotto Play account.
                {user?.email && <div style={{ marginTop: '4px', overflowWrap: 'anywhere' }}>Use this email: <strong>{user.email}</strong></div>}
                <p style={{ margin: '8px 0 0' }}>
                  Enter the amount and verification code below, then select <strong>Transfer Now</strong>.
                  Your funds will be transferred to your <strong>CouponWorld wallet</strong>, where you can complete your withdrawal.
                </p>
              </div>
              <a href={couponAppUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-gold" style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Open CouponWorld <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="alert alert-info">
            <Info size={18} className="alert-icon" />
            <div>
              <strong>Available to Transfer: {available.toFixed(2)} Coins</strong>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Bonus balances cannot be transferred. Your transfer status will appear after submission.</div>
            </div>
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Amount to Transfer (Min <GoldCoin size={14} /> 50)
            </div>
            <div className="input-wrapper">
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                <GoldCoin size={16} />
              </span>
              <input
                type="number"
                className="form-input"
                style={{ paddingLeft: '34px' }}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="50"
                max={available}
                disabled={!isKycVerified}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)' }}
                onClick={() => setAmount(String(available))}
                disabled={!isKycVerified}
              >
                Max
              </button>
            </div>
            {Number(amount) > available && (
              <span className="form-error" style={{ display: 'block', marginTop: '6px' }}>Amount exceeds available balance.</span>
            )}
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Verification Code (2FA or Email)</span>
              <button 
                className="btn btn-ghost btn-sm" 
                style={{ padding: 0, height: 'auto', color: 'var(--color-accent)' }}
                onClick={() => requestOtpMutation.mutate()}
                disabled={requestOtpMutation.isPending || !isKycVerified}
              >
                {requestOtpMutation.isPending ? 'Sending...' : 'Send Code via Email'}
              </button>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="6-digit code"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={!isKycVerified}
            />
          </div>

          <button
            className="btn btn-primary btn-lg btn-full"
            onClick={() => transferMutation.mutate()}
            disabled={transferMutation.isPending || isInvalid}
          >
            {transferMutation.isPending ? <><div className="btn-spinner" /> Processing...</> : 'Transfer Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
