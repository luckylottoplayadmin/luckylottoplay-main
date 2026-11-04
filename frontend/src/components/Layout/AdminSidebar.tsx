import BrandLogo from '@/components/common/BrandLogo'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../utils/rbac'
import {
  LayoutDashboard, Users, ShieldCheck, Dices,
  Gamepad2, Wallet, BarChart3, FileText,
  HeadphonesIcon, ClipboardList, Settings, Trophy, Zap, ArrowRightLeft
} from 'lucide-react'

const sections = [
  {
    label: 'Overview',
    links: [
      { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={16} />, module: 'Dashboard' },
      { href: '/admin/reports', label: 'Reports', icon: <BarChart3 size={16} />, module: 'Reports' },
    ],
  },
  {
    label: 'Users',
    links: [
      { href: '/admin/users', label: 'All Users', icon: <Users size={16} />, module: 'Users' },
      { href: '/admin/kyc', label: 'KYC Queue', icon: <ShieldCheck size={16} />, module: 'KYC' },
      { href: '/admin/affiliates', label: 'Affiliates', icon: <Trophy size={16} />, module: 'Affiliates' },
    ],
  },
  {
    label: 'Lottery',
    links: [
      { href: '/admin/games', label: 'Games', icon: <Gamepad2 size={16} />, module: 'Games' },
      { href: '/admin/draws', label: 'Draws', icon: <Dices size={16} />, module: 'Draws' },
      { href: '/admin/jackpot', label: 'Jackpot Management', icon: <Zap size={16} />, module: 'Jackpot' },
    ],
  },
  {
    label: 'Finance',
    links: [
      { href: '/admin/wallet', label: 'Wallets & Deposits', icon: <Wallet size={16} />, module: 'Wallets' },
      { href: '/admin/withdrawals', label: 'Withdrawals', icon: <ArrowRightLeft size={16} />, module: 'Withdrawals' },
    ],
  },
  {
    label: 'Content',
    links: [
      { href: '/admin/cms', label: 'CMS / Banners', icon: <FileText size={16} />, module: 'CMS' },
      { href: '/admin/support', label: 'Support', icon: <HeadphonesIcon size={16} />, module: 'Support' },
      { href: '/admin/audit', label: 'Audit Logs', icon: <ClipboardList size={16} />, module: 'Audit Logs' },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/admin/settings', label: 'Settings', icon: <Settings size={16} />, module: 'Settings' },
    ],
  },
]

export default function AdminSidebar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const location = useLocation()
  const { user } = useAuthStore()

  const isActive = (href: string) =>
    location.pathname === href || (href !== '/admin' && location.pathname.startsWith(href))

  // Filter sections and links based on user permissions
  const filteredSections = sections.map(section => ({
    ...section,
    links: section.links.filter(link => hasPermission(user, link.module, 'View'))
  })).filter(section => section.links.length > 0)

  return (
    <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`} aria-label="Admin Navigation">
      <div style={{ padding: '0 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} aria-label="Lucky Lotto Play Homepage">
          <BrandLogo />
        </Link>
        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.05em', marginTop: '4px' }}>
          ADMIN PANEL
        </div>
      </div>

      {filteredSections.map((section) => (
        <div key={section.label} className="sidebar-section">
          <div className="sidebar-label">{section.label}</div>
          {section.links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
              onClick={() => { if (onClose) onClose(); }}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  )
}
