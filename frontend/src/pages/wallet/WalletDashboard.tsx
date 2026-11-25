// All stub pages for routes that exist but need their own file

// GamesPage now imports from GamesPageFull

// Wallet Dashboard
import { useQuery } from '@tanstack/react-query'
import { walletService } from '@/services/wallet.service'
import { Link } from 'react-router-dom'
import { Wallet, ArrowUpRight, ArrowDownLeft, Clock, CreditCard } from 'lucide-react'
import GoldCoin from '@/components/common/GoldCoin'
import { useAuthStore } from '@/store/authStore'
import { FadeInUp, StaggerContainer, StaggerItem } from '@/components/UI/MotionPrimitives'

export function WalletDashboard() {
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => walletService.get(),
    select: (r) => r.data?.data,
  })

  const { data: recent } = useQuery({
    queryKey: ['transactions', { page: 1, limit: 5 }],
    queryFn: () => walletService.getTransactions({ limit: 5 }),
    select: (r) => r.data?.data || [],
  })

  return (
    <div className="page-wrapper section">
      <div className="container">
        <FadeInUp>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '36px', marginBottom: '24px', letterSpacing: '-0.03em' }}>
            My Wallet
          </h1>
        </FadeInUp>

        {/* Balance Card */}
        <FadeInUp delay={0.05} className="wallet-balance-card" style={{ marginBottom: '24px' }}>
          <div className="ambient-orb ambient-orb-1" aria-hidden="true" />
          <div className="ambient-orb ambient-orb-2" aria-hidden="true" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ opacity: 0.7, fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
              Available Balance
            </div>
            <div className="wallet-amount" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="animate-coin-flip" style={{ display: 'inline-flex' }}>
                <GoldCoin size={36} />
              </span>
              <span>{Number(wallet?.balance || 0).toFixed(2)}</span>
              <span className="wallet-currency" style={{ marginLeft: '4px' }}>Coins</span>
            </div>
            {Number(wallet?.bonusBalance || 0) > 0 && (
              <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.7 }}>
                + {Number(wallet?.bonusBalance).toFixed(2)} bonus coins
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
              <Link to="/wallet/deposit" className="btn btn-gold btn-sm">
                <ArrowDownLeft size={15} /> Deposit
              </Link>
              <Link to="/wallet/withdraw" className="btn btn-outline btn-sm" style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'white' }}>
                <ArrowUpRight size={15} /> Withdraw
              </Link>
            </div>
          </div>
        </FadeInUp>

        {/* Quick Stats */}
        <StaggerContainer className="grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
          {[
            { label: 'Total Deposited', value: `${Number(wallet?.totalDeposited || 0).toFixed(2)} Coins`, icon: <ArrowDownLeft size={20} /> },
            { label: 'Total Withdrawn', value: `${Number(wallet?.totalWithdrawn || 0).toFixed(2)} Coins`, icon: <ArrowUpRight size={20} /> },
            { label: 'Total Spent', value: `${Number(wallet?.totalSpent || 0).toFixed(2)} Coins`, icon: <CreditCard size={20} /> },
            { label: 'Total Won', value: `${Number(wallet?.totalWon || 0).toFixed(2)} Coins`, icon: <Wallet size={20} />, variant: 'green' },
          ].map((s) => (
            <StaggerItem key={s.label}>
              <div className={`stat-card ${(s as any).variant || ''}`} style={{ height: '100%' }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value" style={{ fontSize: '24px' }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Recent Transactions */}
        <FadeInUp delay={0.12} className="card">
          <div className="card-header">
            <h2 style={{ fontWeight: 700, fontSize: '18px' }}>Recent Transactions</h2>
            <Link to="/wallet/transactions" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {(recent || []).map((tx: any) => (
                  <tr key={tx.id}>
                    <td style={{ fontWeight: 600 }}>{tx.type.replace(/_/g, ' ')}</td>
                    <td style={{ fontWeight: 700, color: !['WITHDRAWAL', 'TICKET_PURCHASE'].includes(tx.type) ? '#10b981' : '#ef4444' }}>
                      {!['WITHDRAWAL', 'TICKET_PURCHASE'].includes(tx.type) ? '+' : '-'}{Math.abs(tx.amount).toFixed(2)} Coins
                    </td>
                    <td><span className={`badge badge-${tx.status === 'COMPLETED' ? 'success' : tx.status === 'PENDING' ? 'warning' : 'danger'}`}>{tx.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{new Date(tx.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {(!recent || recent.length === 0) && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </FadeInUp>
      </div>
    </div>
  )
}

export default WalletDashboard
