import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { X, Play, Hash, Users, Ticket, Award, RefreshCw, Radio, CheckCircle, Shield } from 'lucide-react'
import GoldCoin from '../../components/common/GoldCoin'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

interface Props {
  drawId: string | null
  onClose: () => void
}

export function DrawExecutionDrawer({ drawId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EXECUTE' | 'WINNERS'>('OVERVIEW')

  const { data: record, isLoading } = useQuery({
    queryKey: ['admin', 'draws', drawId],
    queryFn: async () => {
      const res = await api.get(`/admin/draws/${drawId}`)
      return res.data.data
    },
    enabled: !!drawId,
  })

  // Simulated live execution states
  const [isSimulating, setIsSimulating] = useState(false)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([])
  const [drawnPowerball, setDrawnPowerball] = useState<number | null>(null)
  
  // Execution Form
  const [manualNumbers, setManualNumbers] = useState('')
  const [manualPb, setManualPb] = useState('')
  const [manualSupp, setManualSupp] = useState('')

  const executeMutation = useMutation({
    mutationFn: async (data: { winningNumbers: number[], powerball: number | null, supplementary?: number[] }) => {
      return api.patch(`/admin/draws/${drawId}/execute`, data)
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'draws'] })
      setActiveTab('WINNERS')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Execution failed')
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      return api.patch(`/admin/draws/${drawId}/publish`)
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'draws'] })
      onClose()
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Publish failed')
  })

  useEffect(() => {
    if (record?.status === 'COMPLETED' && record.winningNumbers) {
      setDrawnNumbers(record.winningNumbers)
      setDrawnPowerball(record.powerball)
    }
  }, [record])

  const startSimulation = () => {
    setIsSimulating(true)
    setDrawnNumbers([])
    setDrawnPowerball(null)
    
    // Simulate drawing balls every 1 second
    const targetLength = record?.game?.minNumbers || 6
    const pool = record?.game?.numberPool || 45
    let currentNumbers: number[] = []
    
    const interval = setInterval(() => {
      if (currentNumbers.length < targetLength) {
        let n: number
        do {
          n = Math.floor(Math.random() * pool) + 1
        } while (currentNumbers.includes(n))
        currentNumbers.push(n)
        setDrawnNumbers([...currentNumbers])
      } else {
        clearInterval(interval)
        if (record?.game?.hasPowerball) {
          setTimeout(() => {
            const pb = Math.floor(Math.random() * (record?.game?.powerballPool || 20)) + 1
            setDrawnPowerball(pb)
            setIsSimulating(false)
            // Auto submit to backend
            executeMutation.mutate({ winningNumbers: currentNumbers, powerball: pb })
          }, 1000)
        } else {
          setIsSimulating(false)
          executeMutation.mutate({ winningNumbers: currentNumbers, powerball: null })
        }
      }
    }, 1000)
  }

  const handleManualSubmit = () => {
    const nums = manualNumbers.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))
    const pb = manualPb ? parseInt(manualPb.trim()) : null
    
    if (nums.length !== record?.game?.minNumbers) {
      return toast.error(`Please enter exactly ${record?.game?.minNumbers} numbers.`)
    }
    
    executeMutation.mutate({ winningNumbers: nums, powerball: pb,
      supplementary: record?.game?.hasSupplementary ? manualSupp.split(',').map(n => Number(n.trim())) : undefined })
  }

  if (!drawId) return null

  const isCompleted = record?.status === 'COMPLETED'
  const isScheduled = record?.status === 'SCHEDULED'
  
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={onClose} />
      
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: '800px', backgroundColor: 'var(--bg-primary)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.3s ease-out' }}>
        
        {/* Header */}
        <div style={{ padding: 'var(--space-xl)', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', right: 'var(--space-xl)', top: 'var(--space-xl)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
            <div style={{ width: 80, height: 80, borderRadius: '12px', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white', fontWeight: 600 }}>
              <Radio size={40} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Draw #{record?.drawNumber}</h1>
                <span style={{ padding: '4px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: isCompleted ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: isCompleted ? '#10b981' : '#f59e0b' }}>
                  {record?.status}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                {record?.game?.name} • {dayjs(record?.scheduledAt).format('MMM D, YYYY h:mm A')}
              </p>
            </div>
          </div>

          <div className="grid-4" style={{ gap: 'var(--space-md)' }}>
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Jackpot</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}><GoldCoin size={18} />{Number(record?.jackpotAmount || 0).toLocaleString()}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Tickets Sold</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{record?._count?.tickets?.toLocaleString() || 0}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Total Sales</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><GoldCoin size={18} />{Number(record?.totalSales || 0).toLocaleString()}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Draw Method</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>System</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 var(--space-xl)' }}>
          <button className={`tab-btn ${activeTab === 'OVERVIEW' ? 'active' : ''}`} onClick={() => setActiveTab('OVERVIEW')} style={{ padding: '16px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'OVERVIEW' ? '2px solid var(--primary-color)' : '2px solid transparent', color: activeTab === 'OVERVIEW' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Overview</button>
          <button className={`tab-btn ${activeTab === 'EXECUTE' ? 'active' : ''}`} onClick={() => setActiveTab('EXECUTE')} style={{ padding: '16px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'EXECUTE' ? '2px solid var(--primary-color)' : '2px solid transparent', color: activeTab === 'EXECUTE' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Live Draw</button>
          <button className={`tab-btn ${activeTab === 'WINNERS' ? 'active' : ''}`} onClick={() => setActiveTab('WINNERS')} disabled={!isCompleted} style={{ padding: '16px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'WINNERS' ? '2px solid var(--primary-color)' : '2px solid transparent', color: activeTab === 'WINNERS' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', opacity: isCompleted ? 1 : 0.5 }}>Winners & Publishing</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)' }}>
          {isLoading ? (
            <div className="loading-spinner" style={{ margin: '40px auto' }}></div>
          ) : (
            <>
              {activeTab === 'OVERVIEW' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
                  <section>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0 }}><Ticket size={18}/> Draw Details</h3>
                    <div className="card" style={{ padding: 'var(--space-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Game Name</div>
                        <div style={{ fontWeight: 500 }}>{record?.game?.name}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Draw Date</div>
                        <div style={{ fontWeight: 500 }}>{dayjs(record?.scheduledAt).format('MMMM D, YYYY - h:mm A')}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Rule Set</div>
                        <div style={{ fontWeight: 500 }}>Pick {record?.game?.minNumbers} from {record?.game?.numberPool}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Secondary Pool</div>
                        <div style={{ fontWeight: 500 }}>{record?.game?.hasPowerball ? `Pick 1 from ${record?.game?.powerballPool}` : 'None'}</div>
                      </div>
                    </div>
                  </section>
                  
                  {isCompleted && (
                    <section>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Hash size={18}/> Winning Numbers</h3>
                      <div className="card" style={{ padding: 'var(--space-lg)' }}>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {record?.winningNumbers?.map((n: number, i: number) => (
                            <div key={i} style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                              {n}
                            </div>
                          ))}
                          {record?.game?.hasPowerball && record?.powerball && (
                            <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#ef4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', boxShadow: '0 4px 12px rgba(239,68,68,0.3)', marginLeft: '16px' }}>
                              {record.powerball}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'EXECUTE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
                  {isCompleted ? (
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '16px', border: '1px dashed #10b981' }}>
                      <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px' }} />
                      <h2 style={{ margin: '0 0 8px' }}>Draw Already Completed</h2>
                      <p style={{ color: 'var(--text-secondary)' }}>Winning numbers have been generated and recorded.</p>
                    </div>
                  ) : (
                    <>
                      {/* Live Random Draw card removed as requested */}

                      <div className="card" style={{ padding: 'var(--space-lg)' }}>
                        <h3 style={{ marginTop: 0 }}>Manual Entry Override</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>Input winning numbers manually in case of offline physical draws.</p>
                        
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">Primary Numbers (comma separated)</label>
                            <input type="text" className="form-input" placeholder={record?.game?.minNumbers === 1 ? "e.g. 45" : "e.g. 5, 12, 23, 34, 41, 45"} value={manualNumbers} onChange={e => setManualNumbers(e.target.value)} />
                          </div>
                          {record?.game?.hasSupplementary && (
                            <div style={{ flex: 1 }}>
                              <label className="form-label">Supplementary Numbers (comma separated)</label>
                              <input className="form-input" value={manualSupp} onChange={e => setManualSupp(e.target.value)} />
                            </div>
                          )}
                          {record?.game?.hasPowerball && (
                            <div style={{ width: '150px' }}>
                              <label className="form-label">Powerball</label>
                              <input type="text" className="form-input" placeholder="e.g. 7" value={manualPb} onChange={e => setManualPb(e.target.value)} />
                            </div>
                          )}
                          <button className="btn btn-outline" onClick={handleManualSubmit} disabled={executeMutation.isPending}>
                            Submit Numbers
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'WINNERS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
                  <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                    <Shield size={48} color="#8b5cf6" style={{ margin: '0 auto 16px' }} />
                    <h2 style={{ marginTop: 0 }}>Publish Results</h2>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 24px' }}>
                      Prizes are credited automatically when the draw settles. Publishing makes the completed results available without issuing another payout.
                    </p>
                    <button 
                      className="btn btn-primary btn-lg" 
                      onClick={() => publishMutation.mutate()}
                      disabled={record?.publishedAt || publishMutation.isPending}
                    >
                      {record?.publishedAt ? 'Results Published' : 'Publish Results'}
                    </button>
                  </div>

                  <section>
                    <h3>Simulated Winner Report</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>This table is simulated for the UI preview based on the Game's prize divisions.</p>
                    <div className="card" style={{ overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <tr>
                            <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Division</th>
                            <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Winning Tickets</th>
                            <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Prize Per Winner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {record?.game?.prizeDivisions?.map((div: any, i: number) => (
                            <tr key={div.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{div.divisionName}</td>
                              <td style={{ padding: '12px 16px' }}>{div.isJackpot ? '0' : Math.floor(Math.random() * 50) + (10-i)}</td>
                              <td style={{ padding: '12px 16px', fontWeight: 600, color: div.isJackpot ? '#f59e0b' : 'var(--text-primary)' }}>
                                {div.isJackpot ? 'Rollover' : div.fixedPrize ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <GoldCoin size={14} />{Number(div.fixedPrize).toFixed(2)}
                                  </span>
                                ) : 'Calculated'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
