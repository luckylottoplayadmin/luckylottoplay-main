import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import BannerImageUpload from '../../components/UI/BannerImageUpload'
import { X, Save, Image as ImageIcon, Link, LayoutTemplate, MapPin, Calendar, Clock, Crosshair } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  bannerId: string | null
  onClose: () => void
}

export function BannerEditorDrawer({ bannerId, onClose }: Props) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageUrl: '',
    mobileUrl: '',
    linkUrl: '',
    backgroundColor: '',
    position: 'HOME',
    isActive: true,
    sortOrder: 0,
    startDate: '',
    endDate: ''
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'cms', 'banners', bannerId],
    queryFn: async () => {
      if (!bannerId) return null
      const res = await api.get(`/admin/cms/banners`)
      const banner = res.data.data.find((b: any) => b.id === bannerId)
      return banner
    },
    enabled: !!bannerId
  })

  useEffect(() => {
    if (data) {
      setFormData({
        title: data.title,
        description: data.description || '',
        imageUrl: data.imageUrl || '',
        mobileUrl: data.mobileUrl || '',
        linkUrl: data.linkUrl || '',
        backgroundColor: data.backgroundColor || '',
        position: data.position,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        startDate: data.startDate ? new Date(data.startDate).toISOString().slice(0, 16) : '',
        endDate: data.endDate ? new Date(data.endDate).toISOString().slice(0, 16) : ''
      })
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
      }
      if (bannerId) {
        return api.put(`/admin/cms/banners/${bannerId}`, payload)
      } else {
        return api.post(`/admin/cms/banners`, payload)
      }
    },
    onSuccess: () => {
      toast.success(bannerId ? 'Banner updated successfully' : 'Banner created successfully')
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'banners'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'analytics'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || err.message || 'Failed to save banner')
    }
  })

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={onClose} />

      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: '800px', backgroundColor: 'var(--bg-primary)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.3s ease-out' }}>

        {/* Header */}
        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{bannerId ? 'Edit Banner Configuration' : 'Create New Banner'}</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Targeted campaigns & creative assets</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>
              <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(p => ({...p, isActive: e.target.checked}))} />
              Active
            </label>
            <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              <Save size={18} style={{ marginRight: '6px' }} /> {mutation.isPending ? 'Saving...' : 'Save Banner'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>

            {/* Left Col: Creative & Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><LayoutTemplate size={16}/> Banner Details</h3>

                <div className="form-group">
                  <label className="form-label">Internal Name / Title</label>
                  <input type="text" className="form-input" placeholder="e.g. Summer Jackpot Promo" value={formData.title} onChange={e => setFormData(p => ({...p, title: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description (Optional)</label>
                  <textarea className="form-input" style={{ minHeight: '60px' }} value={formData.description} onChange={e => setFormData(p => ({...p, description: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Destination Link URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link size={16} color="var(--text-muted)"/>
                    <input type="text" className="form-input" placeholder="https://..." value={formData.linkUrl} onChange={e => setFormData(p => ({...p, linkUrl: e.target.value}))} />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><ImageIcon size={16}/> Media Assets</h3>

                <div className="form-group">
                  <label className="form-label">Desktop Image URL</label>
                  <BannerImageUpload
                    value={formData.imageUrl}
                    onChange={url => setFormData(p => ({...p, imageUrl: url}))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Image URL (Optional)</label>
                  <BannerImageUpload
                    value={formData.mobileUrl}
                    onChange={url => setFormData(p => ({...p, mobileUrl: url}))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Background Color (Fallback)</label>
                  <input type="color" className="form-input" style={{ padding: '0', height: '44px' }} value={formData.backgroundColor || '#000000'} onChange={e => setFormData(p => ({...p, backgroundColor: e.target.value}))} />
                </div>

                {formData.imageUrl && (
                  <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: formData.backgroundColor || 'var(--bg-overlay)', padding: '16px', display: 'flex', justifyContent: 'center' }}>
                    <img src={formData.imageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>

            </div>

            {/* Right Col: Placement & Targeting */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16}/> Placement Options</h3>

                <div className="form-group">
                  <label className="form-label">Zone / Position</label>
                  <select className="form-select" value={formData.position} onChange={e => setFormData(p => ({...p, position: e.target.value}))}>
                    <option value="HOME">Homepage Hero Carousel</option>
                    <option value="HOME_BOTTOM">Homepage Bottom</option>
                    <option value="SIDEBAR">Global Sidebar</option>
                    <option value="POPUP">Welcome Popup Campaign</option>
                    <option value="GAMES_LIST">Games Directory Header</option>
                    <option value="RESULTS">Draw Results Banner</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Sort Order (Lower = First)</label>
                  <input type="number" className="form-input" value={formData.sortOrder} onChange={e => setFormData(p => ({...p, sortOrder: Number(e.target.value)}))} />
                </div>
              </div>

              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={16}/> Scheduling</h3>

                <div className="form-group">
                  <label className="form-label">Start Date & Time (Optional)</label>
                  <input type="datetime-local" className="form-input" value={formData.startDate} onChange={e => setFormData(p => ({...p, startDate: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date & Time (Optional)</label>
                  <input type="datetime-local" className="form-input" value={formData.endDate} onChange={e => setFormData(p => ({...p, endDate: e.target.value}))} />
                </div>
              </div>

              {/* Mock Advanced Targeting */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px dashed var(--primary-color)' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-color)' }}><Crosshair size={16}/> Advanced Targeting (A/B)</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configure advanced segment rules for this campaign.</div>

                <div className="form-group">
                  <label className="form-label">Target Audience</label>
                  <select className="form-select" disabled>
                    <option>All Users</option>
                    <option>Logged Out (Acquisition)</option>
                    <option>Logged In (Retention)</option>
                    <option>VIP Level 3+</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">A/B Traffic Split</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="range" disabled min="0" max="100" value="100" style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>100%</span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </>
  )
}
