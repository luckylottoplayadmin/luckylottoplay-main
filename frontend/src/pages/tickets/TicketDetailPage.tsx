import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ticketsService } from '@/services/index'
import NumberBall from '@/components/UI/NumberBall'
import Spinner from '@/components/UI/Spinner'
import { ArrowLeft, Ticket, Calendar, CheckCircle, Info, Clock, Receipt } from 'lucide-react'
import GoldCoin from '@/components/common/GoldCoin'

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsService.getById(id!),
    select: (r) => r.data?.data,
    enabled: !!id,
  })

  if (isLoading) return <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><Spinner size="lg" /></div>
  if (!ticket) return <div className="page-wrapper"><div className="container" style={{ padding: '40px 0' }}>Ticket not found</div></div>

  const isWinner = ticket.status === 'WON'
  const isPaid = isWinner && ticket.winningEntries?.length > 0 && ticket.winningEntries.every((w: any) => w.isPaid)

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '800px' }}>
        <Link to="/tickets" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Back to My Tickets
        </Link>

        <div className="card">
          <div className="card-header" style={{ borderBottom: 'none', paddingBottom: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  <Ticket size={24} />
                </div>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '24px' }}>{ticket.game.name}</h1>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ticket #{ticket.ticketNumber}</div>
                </div>
              </div>
              <span className={`badge badge-${isWinner ? 'success' : ticket.status === 'LOST' ? 'danger' : ticket.status === 'ACTIVE' ? 'primary' : 'neutral'}`} style={{ fontSize: '14px', padding: '6px 12px' }}>
                {ticket.status}
              </span>
            </div>
          </div>

          <div className="card-body">
            {isWinner && (
              <div className="alert alert-success" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '18px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={20} /> Winner!
                  </div>
                  <div style={{ fontSize: '14px' }}>Congratulations! This ticket won <strong>${Number(ticket.prizeAmount).toFixed(2)}</strong>.</div>
                </div>
                <span className="badge badge-success" style={{ background: 'transparent', border: '1px solid currentColor' }}>
                  {isPaid ? 'Prize credited automatically' : 'Contact support for payout status'}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} /> Purchased
                </div>
                <div style={{ fontWeight: 600 }}>{new Date(ticket.purchasedAt).toLocaleDateString()}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Ticket size={14} /> Draws
                </div>
                <div style={{ fontWeight: 600 }}>{ticket.draws} Draw(s)</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Receipt size={14} /> Total Cost
                </div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><GoldCoin size={15} /> {Number(ticket.totalCost).toFixed(2)}</div>
              </div>
              {ticket.draw && (
                <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} /> Draw Date & Time
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(ticket.draw.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              )}
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', marginBottom: '16px' }}>Your Numbers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ticket.numbers?.map((line: any) => (
                <div key={line.lineIndex} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: '60px', fontWeight: 700, color: 'var(--text-muted)', fontSize: '13px' }}>
                    Line {line.lineIndex}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                    {line.numbers.map((n: number) => (
                      <NumberBall key={n} number={n} size="sm" variant={ticket.draw?.winningNumbers?.includes(n) ? 'winning' : 'default'} />
                    ))}
                    {line.powerball && (
                      <NumberBall number={line.powerball} size="sm" variant={ticket.draw?.powerball === line.powerball ? 'winning' : 'powerball'} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {ticket.draw && (
              <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', marginBottom: '16px' }}>Draw Results</h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {ticket.draw.winningNumbers?.map((n: number) => (
                    <NumberBall key={n} number={n} size="sm" variant="winning" />
                  ))}
                  {ticket.draw.powerball && (
                    <NumberBall number={ticket.draw.powerball} size="sm" variant="powerball" />
                  )}
                  {(!ticket.draw.winningNumbers || ticket.draw.winningNumbers.length === 0) && (
                    <span style={{ color: 'var(--text-muted)' }}>Draw pending or results not yet published.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
