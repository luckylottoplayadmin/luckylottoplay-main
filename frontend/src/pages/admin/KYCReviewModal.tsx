import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { X, CheckCircle, Ban, AlertTriangle, Shield, FileText, Image as ImageIcon, ZoomIn, Search, RefreshCw, ZoomOut, User as UserIcon } from 'lucide-react'
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

  const reviewMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: 'APPROVED' | 'REJECTED', notes?: string }) => {
      return api.patch(`/admin/kyc/${recordId}/review`, { status, notes })
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
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

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-md)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '1200px', height: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>

        {/* Header */}
        <div className="kyc-modal-header">
          <div className="kyc-modal-header-info">
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={24} color="var(--primary-color)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>KYC Review: {record?.user?.username || 'Loading...'}</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Submitted: {dayjs(record?.submittedAt).format('MMM D, YYYY HH:mm')} • ID: {record?.id.substring(0,8)}</p>
            </div>
            {record?.status === 'APPROVED' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>Approved</span>}
            {record?.status === 'PENDING' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>Pending</span>}
            {record?.status === 'REJECTED' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>Rejected</span>}
          </div>
          <button className="close-btn" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
        </div>

        {/* Content Area */}
        <div className="kyc-modal-content">

          {/* Left Panel: Document Viewer */}
          <div className="kyc-modal-panel-left">
            <div style={{ padding: '8px var(--space-md)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
              <span style={{ fontWeight: 600 }}>{record?.documentType}</span>
              {record?.selfieUrl && <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setDocumentSide('front')} aria-pressed={documentSide === 'front'}>Front</button>
                <button className="btn btn-outline btn-sm" onClick={() => setDocumentSide('back')} aria-pressed={documentSide === 'back'}>Back</button>
              </div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => setZoomLevel(z => z + 0.2)}><ZoomIn size={16}/></button>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => setZoomLevel(z => Math.max(0.2, z - 0.2))}><ZoomOut size={16}/></button>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => setRotate(r => r + 90)}><RefreshCw size={16}/></button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isLoading ? <div className="loading-spinner"></div> : (
                record?.documentUrl ? (
                  // Render the actual uploaded image
                  <div style={{ transform: `scale(${zoomLevel}) rotate(${rotate}deg)`, transition: 'transform 0.2s', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={documentSide === 'back' && record.selfieUrl ? record.selfieUrl : record.documentUrl}
                      referrerPolicy="no-referrer"
                      alt="KYC Document"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', borderRadius: '8px' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' opacity=\'0.05\'><text x=\'20\' y=\'50\' font-size=\'40\' transform=\'rotate(-45)\'>CONFIDENTIAL</text></svg>")', pointerEvents: 'none' }}></div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>Document unavailable. Ask the customer to submit a new document for review.</div>
                )
              )}
            </div>
          </div>

          {/* Right Panel: Analysis & Actions */}
          <div className="kyc-modal-panel-right">
            <div style={{ padding: 'var(--space-lg)', flex: 1 }}>

              {/* Simulated Fraud Engine */}
              <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={18} /> AI Risk Analysis
              </h3>
              <div style={{ padding: 'var(--space-md)', borderRadius: '8px', backgroundColor: isHighRisk ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${isHighRisk ? '#ef4444' : '#10b981'}`, marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: isHighRisk ? '#ef4444' : '#10b981' }}>Risk Score</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: isHighRisk ? '#ef4444' : '#10b981' }}>{mockRiskScore}/100</span>
                </div>
                {isHighRisk && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: '20px', color: '#ef4444', fontSize: '0.85rem' }}>
                    <li>Multiple accounts detected from this IP</li>
                    <li>VPN / Proxy network detected</li>
                  </ul>
                )}
                {!isHighRisk && <p style={{ margin: '8px 0 0', color: '#10b981', fontSize: '0.85rem' }}>No significant risk factors detected.</p>}
              </div>

              {/* OCR Results */}
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} /> OCR Extraction
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Extracted Name</span>
                  <span style={{ fontWeight: 500 }}>{ocrExtracted.firstName} {ocrExtracted.lastName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Extracted DOB</span>
                  <span style={{ fontWeight: 500 }}>{ocrExtracted.dob}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Document No.</span>
                  <span style={{ fontWeight: 500 }}>{ocrExtracted.docNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Expiry</span>
                  <span style={{ fontWeight: 500, color: '#10b981' }}>{ocrExtracted.expiry} (Valid)</span>
                </div>
              </div>

              {/* User Profile Info */}
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserIcon size={18} /> Provided Profile
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                  <span style={{ fontWeight: 500 }}>{record?.user?.firstName} {record?.user?.lastName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Email</span>
                  <span style={{ fontWeight: 500 }}>{record?.user?.email}</span>
                </div>
              </div>

              {/* Internal Notes */}
              <h3>Review Notes</h3>
              <textarea
                id="reviewNotes"
                className="form-textarea"
                placeholder="Add internal notes (visible to user on rejection)..."
                style={{ width: '100%', minHeight: '80px', borderRadius: '8px', padding: '12px' }}
                defaultValue={record?.reviewNotes || ''}
              ></textarea>
            </div>

            {/* Action Bar */}
            <div style={{ padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', gap: 'var(--space-md)' }}>
              {record?.status === 'PENDING' ? (
                <>
                  <button className="btn btn-primary" style={{ flex: 1, backgroundColor: '#10b981', borderColor: '#10b981' }} onClick={() => {
                    const notes = (document.getElementById('reviewNotes') as HTMLTextAreaElement).value
                    reviewMutation.mutate({ status: 'APPROVED', notes })
                  }}>Approve</button>
                  <button className="btn btn-outline" style={{ flex: 1, borderColor: '#ef4444', color: '#ef4444' }} onClick={() => {
                    const notes = (document.getElementById('reviewNotes') as HTMLTextAreaElement).value
                    reviewMutation.mutate({ status: 'REJECTED', notes })
                  }}>Reject</button>
                </>
              ) : (
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Close Review</button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
