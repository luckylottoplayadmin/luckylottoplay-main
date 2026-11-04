import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { X, ShieldAlert, CheckCircle, Ban, AlertTriangle, Key, DollarSign, History, Shield, FileText, User as UserIcon } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import toast from 'react-hot-toast'
import { useRoles } from '../../hooks/useRBAC'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../utils/rbac'

dayjs.extend(relativeTime)

interface Props {
  userId: string | null
  onClose: () => void
}

export function UserProfileModal({ userId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'INFO' | 'WALLET' | 'SECURITY' | 'KYC'>('INFO')
  const [viewerDoc, setViewerDoc] = useState<string | null>(null)
  const { data: roles } = useRoles()
  const { user: currentUser } = useAuthStore()

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${userId}`)
      return res.data.data
    },
    enabled: !!userId,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: string, reason?: string }) => {
      return api.patch(`/admin/users/${userId}/status`, { status, reason })
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update status')
  })

  const walletMutation = useMutation({
    mutationFn: async ({ type, amount, reason }: { type: 'CREDIT' | 'DEBIT', amount: number, reason: string }) => {
      return api.post(`/admin/users/${userId}/wallet/adjust`, { type, amount, reason })
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Wallet adjustment failed')
  })

  if (!userId) return null

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-md)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
        
        {/* Header */}
        <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserIcon size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{user?.username || 'Loading...'}</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{user?.email} • ID: {user?.id.substring(0,8)}</p>
            </div>
            {user?.status === 'ACTIVE' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>Active</span>}
            {user?.status === 'SUSPENDED' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>Suspended</span>}
            {user?.status === 'BANNED' && <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>Banned</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 var(--space-lg)' }}>
          <TabButton active={activeTab === 'INFO'} onClick={() => setActiveTab('INFO')} icon={<UserIcon size={16}/>}>Info & Actions</TabButton>
          <TabButton active={activeTab === 'WALLET'} onClick={() => setActiveTab('WALLET')} icon={<DollarSign size={16}/>}>Wallet & Tx</TabButton>
          <TabButton active={activeTab === 'SECURITY'} onClick={() => setActiveTab('SECURITY')} icon={<Shield size={16}/>}>Security</TabButton>
          <TabButton active={activeTab === 'KYC'} onClick={() => setActiveTab('KYC')} icon={<FileText size={16}/>}>KYC</TabButton>
        </div>

        {/* Content Area */}
        <div style={{ padding: 'var(--space-lg)', overflowY: 'auto', flex: 1 }}>
          {isLoading ? <div className="loading-spinner" style={{ margin: 'auto' }}></div> : (
            <>
              {activeTab === 'INFO' && (
                <div className="modal-2-col">
                  <div style={{ flex: 2 }}>
                    <h3 style={{ marginTop: 0 }}>Personal Information</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                      <InfoRow label="First Name" value={user?.firstName || '-'} />
                      <InfoRow label="Last Name" value={user?.lastName || '-'} />
                      <InfoRow label="Phone" value={user?.phoneNumber || '-'} />
                      <InfoRow label="Registered" value={dayjs(user?.createdAt).format('MMM D, YYYY HH:mm')} />
                      <InfoRow label="Role" value={user?.role} />
                      <InfoRow label="Email Verified" value={user?.emailVerified ? 'Yes' : 'No'} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                      {user.status === 'ACTIVE' ? (
                        <>
                          <button className="btn btn-outline" style={{ borderColor: '#f59e0b', color: '#f59e0b' }} onClick={() => statusMutation.mutate({ status: 'SUSPENDED', reason: 'Admin Action' })}>Suspend User</button>
                          <button className="btn btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => statusMutation.mutate({ status: 'BANNED', reason: 'Admin Action' })}>Ban User</button>
                        </>
                      ) : (
                        <button className="btn btn-primary" onClick={() => statusMutation.mutate({ status: 'ACTIVE', reason: 'Admin Action' })}>Activate User</button>
                      )}
                      <button className="btn btn-outline" onClick={() => toast('Force logout initiated')}>Force Logout</button>
                      <button className="btn btn-outline" onClick={() => toast('Password reset link sent')}>Send Password Reset</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'WALLET' && (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                    <div className="card-body" style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: 'var(--space-md)' }}>
                      <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Current Balance</p>
                      <h2 style={{ margin: 0 }}>${Number(user?.wallet?.balance || 0).toFixed(2)}</h2>
                    </div>
                    <div className="card-body" style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: 'var(--space-md)' }}>
                      <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Deposited</p>
                      <h2 style={{ margin: 0 }}>${Number(user?.wallet?.totalDeposited || 0).toFixed(2)}</h2>
                    </div>
                  </div>

                  <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Manual Adjustment</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', flex: '1 1 250px', gap: 'var(--space-md)' }}>
                      <input type="number" id="adjAmount" placeholder="Amount" className="input" style={{ width: 100 }} />
                      <input type="text" id="adjReason" placeholder="Reason for adjustment" className="input" style={{ flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', flex: '1 1 200px', gap: 'var(--space-md)' }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                        const amt = Number((document.getElementById('adjAmount') as HTMLInputElement).value)
                        const rsn = (document.getElementById('adjReason') as HTMLInputElement).value
                        if (amt > 0 && rsn) walletMutation.mutate({ type: 'CREDIT', amount: amt, reason: rsn })
                      }}>Credit</button>
                      <button className="btn btn-outline" style={{ flex: 1, borderColor: '#ef4444', color: '#ef4444' }} onClick={() => {
                        const amt = Number((document.getElementById('adjAmount') as HTMLInputElement).value)
                        const rsn = (document.getElementById('adjReason') as HTMLInputElement).value
                        if (amt > 0 && rsn) walletMutation.mutate({ type: 'DEBIT', amount: amt, reason: rsn })
                      }}>Debit</button>
                    </div>
                  </div>

                  <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Recent Transactions</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 0' }}>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user?.transactions?.map((tx: any) => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px 0' }}>{dayjs(tx.createdAt).format('MMM D, HH:mm')}</td>
                          <td>{tx.type.replace('_', ' ')}</td>
                          <td style={{ fontWeight: 600, color: ['DEPOSIT', 'BONUS_CREDIT', 'PRIZE'].includes(tx.type) ? '#10b981' : '#ef4444' }}>
                            {['DEPOSIT', 'BONUS_CREDIT', 'PRIZE'].includes(tx.type) ? '+' : '-'}${Number(tx.amount || 0).toFixed(2)}
                          </td>
                          <td>{tx.status}</td>
                        </tr>
                      ))}
                      {(!user?.transactions || user.transactions.length === 0) && (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No recent transactions</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'SECURITY' && (
                <div>
                  <h3 style={{ marginTop: 0 }}>Active Sessions</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {user?.sessions?.map((s: any) => (
                      <div key={s.id} style={{ padding: 'var(--space-md)', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>IP: {s.ipAddress}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.userAgent || 'Unknown Device'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Last active: {dayjs(s.lastUsedAt).fromNow()}</div>
                        </div>
                        <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => toast('Session revoked')}>Revoke</button>
                      </div>
                    ))}
                    {(!user?.sessions || user.sessions.length === 0) && <p style={{ color: 'var(--text-secondary)' }}>No active sessions.</p>}
                  </div>

                  {hasPermission(currentUser, 'Users', 'Assign') && (
                    <>
                      <h3 style={{ marginTop: '32px' }}>Role Assignment (RBAC)</h3>
                      {user?.roles && user.roles.length > 0 && (
                        <div style={{ marginBottom: '16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Currently Assigned:</span>{' '}
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                            {user.roles.map((r: any) => r.role?.name).join(', ')}
                          </span>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '2px 8px', fontSize: '0.75rem', marginLeft: '8px', border: '1px solid var(--danger-color)', color: 'var(--danger-color)' }}
                            onClick={async () => {
                              try {
                                const roleId = user.roles[0].roleId;
                                await api.delete(`/rbac/users/${userId}/roles/${roleId}`);
                                toast.success('Role removed');
                                queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId] });
                              } catch (err) {
                                toast.error('Failed to remove role');
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                        <select 
                          id="roleSelect" 
                          className="input" 
                          defaultValue={user?.roles?.[0]?.roleId || ''}
                          style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Select a custom role...</option>
                          {roles?.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.department || 'General'})</option>
                          ))}
                        </select>
                        <button 
                          className="btn btn-primary" 
                          onClick={async () => {
                            const roleId = (document.getElementById('roleSelect') as HTMLSelectElement).value;
                            if (!roleId) return toast.error('Please select a role');
                            try {
                              await api.post(`/rbac/users/${userId}/roles`, { roleId });
                              toast.success('Role assigned successfully!');
                              queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId] })
                            } catch (err: any) {
                              toast.error('Failed to assign role');
                            }
                          }}
                        >
                          Assign Role
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'KYC' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                    <h3 style={{ margin: 0 }}>KYC Records</h3>
                    <div style={{ fontSize: '0.9rem' }}>Current Status: <strong>{user?.kycStatus}</strong></div>
                  </div>
                  {user?.kycRecords?.map((k: any) => (
                    <div key={k.id} style={{ padding: 'var(--space-md)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: 'var(--space-md)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong>{k.documentType}</strong>
                        <span>{k.status}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Submitted: {dayjs(k.submittedAt).format('MMM D, YYYY')}</div>
                      <div style={{ marginTop: 'var(--space-sm)' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={async () => {
                            try {
                              const response = await api.get(`/admin/kyc/${k.id}`)
                              setViewerDoc(response.data.data.documentUrl)
                            } catch (error: any) {
                              toast.error(error.response?.data?.error || 'Unable to open KYC document')
                            }
                          }}
                        >
                          View Document Attachment
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!user?.kycRecords || user.kycRecords.length === 0) && <p style={{ color: 'var(--text-secondary)' }}>No KYC records submitted.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mock Document Viewer Sub-Modal */}
      {viewerDoc && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1001, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)' }}>
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <h3 style={{ color: 'white', margin: 0 }}>Document Viewer: {viewerDoc}</h3>
            <button onClick={() => setViewerDoc(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={28} /></button>
          </div>
          <div style={{ width: '100%', maxWidth: '800px', height: '600px', backgroundColor: '#1e1e1e', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px dashed var(--border-color)', color: 'var(--text-secondary)' }}>
             <FileText size={64} style={{ marginBottom: '16px', opacity: 0.5 }} />
             <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Mock Document Viewer</h2>
             <p style={{ margin: 0 }}>Filename: <strong>{viewerDoc}</strong></p>
             <p style={{ fontSize: '0.85rem', marginTop: '16px', opacity: 0.7 }}>Actual file storage integration (e.g. AWS S3) is pending.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children, icon }: any) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        flex: 1, padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        background: 'none', border: 'none', borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
        color: active ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: active ? 600 : 500, cursor: 'pointer'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function InfoRow({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div style={{ padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
  )
}
