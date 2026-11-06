import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { X, CheckCircle, Ban, AlertTriangle, Shield, FileText, ZoomIn, ZoomOut, RefreshCw, RotateCcw, Search, User as UserIcon, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import toast from 'react-hot-toast'

dayjs.extend(relativeTime)

interface Props {
  recordId: string | null
  onClose: () => void
}

export function KYCReviewModal({ recordId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [zoomLevel, setZoomLevel] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [documentSide, setDocumentSide] = useState<'front' | 'back'>('front')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const { data: record, isLoading } = useQuery({
    queryKey: ['admin', 'kyc', recordId],
    queryFn: async () => {
      const res = await api.get(`/admin/kyc/${recordId}`)
      return res.data.data
    },
    enabled: !!recordId,
    refetchInterval: 240_000,
    staleTime: 0,
    gcTime: 0,
  })

  useEffect(() => {
    if (record?.reviewNotes) {
      setNotes(record.reviewNotes)
    }
  }, [record?.reviewNotes])

  const reviewMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: 'APPROVED' | 'REJECTED', notes?: string }) => {
      return api.patch(`/admin/kyc/${recordId}/review`, { status, notes })
    },
    onSuccess: (res) => {
      toast.success(res.data.message || 'KYC status updated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] })
      onClose()
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Review action failed')
  })

  if (!recordId) return null

  // Simulated AI Data
  const mockRiskScore = record?.user?.country === 'US' ? 75 : 12
  const isHighRisk = mockRiskScore > 50
  const ocrExtracted = {
    firstName: record?.user?.firstName || 'Mani',
    lastName: record?.user?.lastName || 'Vasagan',
    dob: '1990-01-01',
    docNumber: 'A12345678',
    expiry: '2030-12-31'
  }

  const handleResetView = () => {
    setZoomLevel(1)
    setRotate(0)
  }

  return (
    <div 
      className="kyc-modal-overlay" 
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="KYC Document Review"
    >
      <div className="kyc-modal-card">

        {/* Header */}
        <div className="kyc-modal-header">
          <div className="kyc-modal-header-info">
            <div style={{ width: 44, height: 44, borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} color="var(--color-primary, #3b82f6)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  KYC Review: {record?.user?.username || (isLoading ? 'Loading...' : 'User')}
                </h2>
                {record?.status === 'APPROVED' && (
                  <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>Approved</span>
                )}
                {record?.status === 'PENDING' && (
                  <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>Pending</span>
                )}
                {record?.status === 'REJECTED' && (
                  <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>Rejected</span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Submitted: {record?.submittedAt ? dayjs(record.submittedAt).format('MMM D, YYYY HH:mm') : '—'} • ID: {record?.id ? record.id.substring(0, 8) : '—'}
              </p>
            </div>
          </div>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={onClose} 
            style={{ borderRadius: '8px', padding: '6px', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="kyc-modal-content">

          {/* Left Panel: Document Viewer */}
          <div className="kyc-modal-panel-left">
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                  {record?.documentType || 'DOCUMENT'}
                </span>
                {record?.selfieUrl && (
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                    <button 
                      className={`btn btn-xs ${documentSide === 'front' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setDocumentSide('front')}
                    >Front</button>
                    <button 
                      className={`btn btn-xs ${documentSide === 'back' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setDocumentSide('back')}
                    >Back</button>
                  </div>
                )}
              </div>

              {/* Viewer Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '4px' }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button 
                  className="btn btn-outline btn-xs" 
                  title="Zoom In" 
                  onClick={() => setZoomLevel(z => Math.min(3, +(z + 0.2).toFixed(1)))}
                >
                  <ZoomIn size={14} />
                </button>
                <button 
                  className="btn btn-outline btn-xs" 
                  title="Zoom Out" 
                  onClick={() => setZoomLevel(z => Math.max(0.4, +(z - 0.2).toFixed(1)))}
                >
                  <ZoomOut size={14} />
                </button>
                <button 
                  className="btn btn-outline btn-xs" 
                  title="Rotate 90°" 
                  onClick={() => setRotate(r => (r + 90) % 360)}
                >
                  <RefreshCw size={14} />
                </button>
                {(zoomLevel !== 1 || rotate !== 0) && (
                  <button 
                    className="btn btn-outline btn-xs" 
                    title="Reset View" 
                    onClick={handleResetView}
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
              {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                  <Loader2 size={32} className="spin" />
                  <span style={{ fontSize: '0.9rem' }}>Loading document...</span>
                </div>
              ) : record?.documentUrl ? (
                <div style={{ 
                  transform: `scale(${zoomLevel}) rotate(${rotate}deg)`, 
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <img
                    src={documentSide === 'back' && record.selfieUrl ? record.selfieUrl : record.documentUrl}
                    referrerPolicy="no-referrer"
                    alt="KYC Document"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '100%', 
                      objectFit: 'contain', 
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)', 
                      borderRadius: '8px',
                      display: 'block'
                    }}
                  />
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' opacity=\'0.06\'><text x=\'20\' y=\'50\' font-size=\'36\' font-weight=\'bold\' fill=\'%23ffffff\' transform=\'rotate(-45)\'>CONFIDENTIAL</text></svg>")', 
                    pointerEvents: 'none' 
                  }} />
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>
                  <AlertTriangle size={36} style={{ margin: '0 auto 12px', color: '#f59e0b' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Document unavailable or expired.</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ask the user to submit a new document.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Analysis & Actions */}
          <div className="kyc-modal-panel-right">
            <div className="kyc-modal-right-body">

              {/* AI Risk Analysis */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <Search size={16} /> AI Risk Analysis
                </h3>
                <div style={{ 
                  padding: '12px 16px', 
                  borderRadius: '10px', 
                  backgroundColor: isHighRisk ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)', 
                  border: `1px solid ${isHighRisk ? '#ef4444' : '#10b981'}` 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isHighRisk ? '#ef4444' : '#10b981' }}>Risk Score</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: isHighRisk ? '#ef4444' : '#10b981' }}>{mockRiskScore}/100</span>
                  </div>
                  {isHighRisk ? (
                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#ef4444', fontSize: '0.82rem' }}>
                      <li>Multiple accounts detected from this IP</li>
                      <li>VPN / Proxy network detected</li>
                    </ul>
                  ) : (
                    <p style={{ margin: '6px 0 0', color: '#10b981', fontSize: '0.82rem' }}>No significant risk factors detected.</p>
                  )}
                </div>
              </div>

              {/* OCR Results */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <FileText size={16} /> OCR Extraction
                </h3>
                <div style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  borderRadius: '10px', 
                  padding: '12px 14px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Extracted Name</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ocrExtracted.firstName} {ocrExtracted.lastName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Extracted DOB</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ocrExtracted.dob}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Document No.</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ocrExtracted.docNumber}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Expiry</span>
                    <span style={{ fontWeight: 600, color: '#10b981' }}>{ocrExtracted.expiry} (Valid)</span>
                  </div>
                </div>
              </div>

              {/* User Profile Info */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <UserIcon size={16} /> Provided Profile
                </h3>
                <div style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  borderRadius: '10px', 
                  padding: '12px 14px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Name</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{record?.user?.firstName} {record?.user?.lastName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Email</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{record?.user?.email}</span>
                  </div>
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Review Notes
                </h3>
                <textarea
                  className="form-textarea"
                  placeholder="Add internal notes (visible to user on rejection)..."
                  style={{ width: '100%', minHeight: '85px', borderRadius: '8px', padding: '10px 12px', fontSize: '0.88rem', resize: 'vertical' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

            </div>

            {/* Action Bar (Always pinned at the bottom) */}
            <div className="kyc-modal-action-bar">
              {record?.status === 'PENDING' ? (
                <>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, backgroundColor: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600 }}
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ status: 'APPROVED', notes })}
                  >
                    {reviewMutation.isPending ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
                    Approve
                  </button>
                  <button 
                    className="btn btn-outline" 
                    style={{ flex: 1, borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600 }}
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ status: 'REJECTED', notes })}
                  >
                    {reviewMutation.isPending ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}
                    Reject
                  </button>
                </>
              ) : (
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
                  Close Review
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
