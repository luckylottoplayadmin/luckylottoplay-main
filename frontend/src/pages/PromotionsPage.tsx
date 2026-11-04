import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, Zap, ShieldCheck, Copy, Check } from 'lucide-react'
import GoldCoin from '@/components/common/GoldCoin'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

export default function PromotionsPage() {
  const { user } = useAuthStore()
  const [copied, setCopied] = useState(false)
  const [optedIn, setOptedIn] = useState(false)

  const referralLink = user ? `${window.location.origin}/register?ref=${user.id}` : `${window.location.origin}/register`

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    toast.success('Referral link copied to clipboard!')
    setTimeout(() => setCopied(false), 3000)
  }

  const handleOptIn = () => {
    setOptedIn(true)
    toast.success('Successfully opted into Powerball Double Jackpots!')
  }

  const promos = [
    {
      id: 1,
      title: <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><GoldCoin size={20} /> 10 Welcome Bonus</span>,
      desc: <>Sign up today and get <GoldCoin size={15} style={{ display: 'inline-block', verticalAlign: '-2px', margin: '0 2px' }} />10 free credit added to your wallet. No deposit required.</>,
      icon: <Gift size={32} style={{ color: '#f5a623' }} />,
      cta: user ? 'Bonus Active in Wallet' : 'Claim Bonus',
      link: user ? '/wallet' : '/register',
      isButton: false,
      terms: 'New users only. Credit expires in 7 days.'
    },
    {
      id: 2,
      title: <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>Refer a Friend, Get <GoldCoin size={20} /> 20</span>,
      desc: <>Invite your friends to Lucky Lotto Play. When they make their first deposit, you both get <GoldCoin size={15} style={{ display: 'inline-block', verticalAlign: '-2px', margin: '0 2px' }} />20 bonus credit.</>,
      icon: <Zap size={32} style={{ color: 'var(--color-primary)' }} />,
      cta: copied ? 'Link Copied!' : 'Get Referral Link',
      action: handleCopyReferral,
      isButton: true,
      terms: <>Minimum <GoldCoin size={13} style={{ display: 'inline-block', verticalAlign: '-2px', margin: '0 2px' }} />20 deposit required by referred user.</>
    },
    {
      id: 3,
      title: 'Powerball Double Jackpots',
      desc: 'For a limited time, all division 2-9 prizes in Powerball are doubled. Opt-in required.',
      icon: <ShieldCheck size={32} style={{ color: '#10b981' }} />,
      cta: optedIn ? 'Opted In ✓' : 'Opt In Now',
      action: handleOptIn,
      disabled: optedIn,
      isButton: true,
      terms: 'Valid for next 3 draws only.'
    }
  ]

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '1000px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 className="section-title">Promotions & Offers</h1>
          <div className="section-subtitle">Take advantage of our latest bonuses and special offers</div>
        </div>

        <div className="grid-3">
          {promos.map((p) => (
            <div key={p.id} className="card card-body" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '16px' }}>{p.icon}</div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>{p.title}</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', flex: 1 }}>{p.desc}</p>
              
              {p.isButton ? (
                <button
                  onClick={p.action}
                  disabled={p.disabled}
                  className="btn btn-outline btn-full"
                  style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {p.cta === 'Link Copied!' && <Check size={16} />}
                  {p.cta}
                </button>
              ) : (
                <Link to={p.link} className="btn btn-outline btn-full" style={{ marginBottom: '12px' }}>
                  {p.cta}
                </Link>
              )}
              
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>T&Cs Apply. {p.terms}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
