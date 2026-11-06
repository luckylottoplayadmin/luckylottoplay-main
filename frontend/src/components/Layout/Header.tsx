import BrandLogo from '@/components/common/BrandLogo'
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { authService } from '@/services/auth.service'
import { notificationsService } from '@/services/index'
import { walletService } from '@/services/wallet.service'
import { useQuery } from '@tanstack/react-query'
import {
  Sun, Moon, Bell, Wallet, LogOut, User, ChevronDown,
  Trophy, Ticket, Settings, Menu, X, LayoutDashboard, Zap, MessageCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import GoldCoin from '@/components/common/GoldCoin'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const { data: unreadData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
    select: (r) => r.data?.data?.count ?? 0,
  })

  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => walletService.get(),
    enabled: isAuthenticated,
    select: (r) => r.data?.data,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  const handleLogout = async () => {
    try { await authService.logout() } catch {}
    logout()
    navigate('/')
    toast.success('Logged out successfully')
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const navLinks = [
    { href: '/games', label: 'Games' },
    { href: '/results', label: 'Results' },
    { href: '/jackpots', label: 'Jackpots' },
    { href: '/promotions', label: 'Promotions' },
  ]

  const balance = (walletData?.balance ?? user?.wallet?.balance ?? 0)

  return (
    <>
      <header className="header">
      <div className="container">
        <div className="header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Mobile Menu Toggle */}
            <button
              className="btn btn-ghost btn-icon mobile-only"
              id="mobile-nav-toggle"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              style={{ padding: '4px', marginLeft: '-8px' }}
              aria-label="Toggle mobile navigation"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Logo */}
            <Link to="/" className="logo" aria-label="Lucky Lotto Play Homepage">
              <BrandLogo />
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="nav" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="header-actions">
            {/* Theme Toggle */}
            <button
              className="btn btn-ghost btn-icon desktop-only"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {isAuthenticated ? (
              <>
                {/* Wallet */}
                <Link to="/wallet" className="wallet-chip">
                  <GoldCoin size={17} />
                  <span>{Number(balance).toFixed(2)}</span>
                  <span style={{ opacity: 0.95, fontSize: '12px', marginLeft: '2px', color: 'var(--color-secondary)' }}>Coins</span>
                </Link>

                {/* Notifications */}
                <Link to="/notifications" className="btn btn-ghost btn-icon desktop-only" style={{ position: 'relative' }} aria-label="View notifications">
                  <Bell size={18} />
                  {(unreadData ?? 0) > 0 && (
                    <span style={{
                      position: 'absolute', top: '6px', right: '6px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#ef4444', border: '2px solid var(--bg-primary)',
                    }} />
                  )}
                </Link>

                {/* User Menu */}
                <div ref={userMenuRef} style={{ position: 'relative' }} className="desktop-only">
                  <button
                    className="btn btn-ghost"
                    style={{ gap: '8px', padding: '7px 12px' }}
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    aria-label="User Account Menu"
                    aria-expanded={userMenuOpen}
                  >
                    <div className="avatar avatar-sm">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>
                      {user?.firstName}
                    </span>
                    <ChevronDown size={14} style={{
                      transform: userMenuOpen ? 'rotate(180deg)' : '',
                      transition: 'transform 0.2s',
                    }} />
                  </button>

                  {userMenuOpen && (
                    <div className="card" style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                      width: '220px', zIndex: 200, padding: '6px',
                    }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{user?.firstName} {user?.lastName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{user?.email}</div>
                      </div>

                      {[
                        { icon: <User size={15} />, label: 'Profile', href: '/profile' },
                        { icon: <Ticket size={15} />, label: 'My Tickets', href: '/tickets' },
                        { icon: <Trophy size={15} />, label: 'Affiliate', href: '/affiliate' },
                        { icon: <MessageCircle size={15} />, label: 'Support', href: '/support' },
                        ...(user?.role !== 'USER' || (user?.roles && user.roles.length > 0) ? [{ icon: <LayoutDashboard size={15} />, label: 'Admin Panel', href: '/admin' }] : []),
                        { icon: <Settings size={15} />, label: 'Settings', href: '/profile/security' },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="sidebar-link"
                          style={{ padding: '8px 12px', borderRadius: '8px', color: 'var(--text-secondary)', background: 'transparent' }}
                          onClick={() => setUserMenuOpen(false)}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      ))}

                      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '6px', paddingTop: '6px' }}>
                        <button
                          className="sidebar-link"
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', color: '#ef4444', background: 'transparent', border: 'none' }}
                          onClick={handleLogout}
                        >
                          <LogOut size={15} />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="desktop-only" style={{ display: 'flex', gap: '8px' }}>
                <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
                <Link to="/register" className="btn btn-gold btn-sm">Get Started</Link>
              </div>
            )}

          </div>
        </div>
      </div>
    </header>

      {/* Mobile Nav */}
      {mobileNavOpen && (
        <>
          <div className="admin-sidebar-overlay" style={{ zIndex: 99 }} onClick={() => setMobileNavOpen(false)} />
          <div style={{
            position: 'fixed', top: 'var(--header-height)', left: 0, bottom: 0, width: '280px',
            background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)',
            padding: 'var(--space-lg)', boxShadow: 'var(--shadow-xl)', zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
                  style={{ display: 'block', padding: '12px 16px', fontSize: '16px' }}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div style={{ height: '1px', background: 'var(--border-color)' }} />

            <button 
              className="btn btn-ghost" 
              style={{ justifyContent: 'flex-start', padding: '12px', width: '100%', border: 'none' }} 
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={20} style={{ marginRight: '8px' }} /> : <Moon size={20} style={{ marginRight: '8px' }} />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>

            {isAuthenticated ? (
              <>
                <Link to="/notifications" className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => setMobileNavOpen(false)}>
                  <Bell size={20} style={{ marginRight: '8px' }} />
                  Notifications
                  {(unreadData ?? 0) > 0 && (
                    <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>
                      {unreadData}
                    </span>
                  )}
                </Link>

                <div style={{ height: '1px', background: 'var(--border-color)' }} />
                
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Account</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {[
                    { icon: <User size={18} />, label: 'Profile', href: '/profile' },
                    { icon: <Ticket size={18} />, label: 'My Tickets', href: '/tickets' },
                    { icon: <Trophy size={18} />, label: 'Affiliate', href: '/affiliate' },
                    { icon: <MessageCircle size={18} />, label: 'Support', href: '/support' },
                    ...(user?.role !== 'USER' || (user?.roles && user.roles.length > 0) ? [{ icon: <LayoutDashboard size={18} />, label: 'Admin Panel', href: '/admin' }] : []),
                    { icon: <Settings size={18} />, label: 'Settings', href: '/profile/security' },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="sidebar-link"
                      style={{ padding: '12px', borderRadius: '8px', color: 'var(--text-primary)', background: 'transparent' }}
                      onClick={() => setMobileNavOpen(false)}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                  
                  <button
                    className="sidebar-link"
                    style={{ padding: '12px', borderRadius: '8px', color: '#ef4444', background: 'transparent', border: 'none', textAlign: 'left' }}
                    onClick={() => { handleLogout(); setMobileNavOpen(false); }}
                  >
                    <LogOut size={18} />
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                <Link to="/login" className="btn btn-ghost" onClick={() => setMobileNavOpen(false)}>Sign In</Link>
                <Link to="/register" className="btn btn-gold" onClick={() => setMobileNavOpen(false)}>Get Started</Link>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
