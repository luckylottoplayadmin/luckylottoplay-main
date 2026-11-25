import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamesService } from '@/services/games.service'
import { Pagination } from '@/components/UI'
import NumberBall from '@/components/UI/NumberBall'
import { Calendar, Search } from 'lucide-react'
import { FadeInUp } from '@/components/UI/MotionPrimitives'

export default function ResultsPage() {
  const [page, setPage] = useState(1)
  
  const { data: drawsData, isLoading } = useQuery({
    queryKey: ['results', page],
    queryFn: () => gamesService.getDraws({ page, limit: 10, status: 'COMPLETED' }),
    select: (r) => r.data,
  })
  const filteredDraws = drawsData?.data?.filter((draw: any) => new Date(draw.scheduledAt).getTime() <= Date.now()) || []

  return (
    <div className="page-wrapper section">
      <div className="container">
        <FadeInUp className="section-header">
          <div>
            <h1 className="section-title">Latest Results</h1>
            <div className="section-subtitle">Winning numbers from recent draws</div>
          </div>
        </FadeInUp>

        <FadeInUp delay={0.1} className="card">
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Draw No.</th>
                  <th>Date Drawn</th>
                  <th>Winning Numbers</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}><div className="btn-spinner" style={{ borderColor: 'var(--color-primary)', width: '24px', height: '24px' }} /></td></tr>
                ) : filteredDraws.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No completed draws found.</td></tr>
                ) : (
                  filteredDraws.map((draw: any) => (
                    <tr key={draw.id}>
                      <td style={{ fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: '16px' }}>{draw.game.name}</td>
                      <td>#{draw.drawNumber}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(draw.drawnAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {draw.winningNumbers?.map((n: number) => (
                            <NumberBall key={n} number={n} size="sm" variant="winning" />
                          ))}
                          {draw.supplementary?.map((n: number) => (
                            <NumberBall key={`s${n}`} number={n} size="sm" variant="supplementary" />
                          ))}
                          {draw.powerball && (
                            <NumberBall number={draw.powerball} size="sm" variant="powerball" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {drawsData?.pagination && drawsData.pagination.pages > 1 && (
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <Pagination page={drawsData.pagination.page} pages={drawsData.pagination.pages} onPage={setPage} />
            </div>
          )}
        </FadeInUp>
      </div>
    </div>
  )
}
