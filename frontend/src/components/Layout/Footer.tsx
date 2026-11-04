import BrandLogo from '@/components/common/BrandLogo'
import { Link } from 'react-router-dom'
import { Zap, Shield, Phone, Mail, ExternalLink } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  const columns = [
    {
      heading: 'Games',
      links: [
        { label: 'MegaDraw', href: '/games/megadraw' },
        { label: 'Powerball', href: '/games/powerball' },
        { label: 'Saturday Lotto', href: '/games/saturday-lotto' },
        { label: 'Set for Life', href: '/games/set-for-life' },
        { label: 'Weekday Windfall', href: '/games/weekday-windfall' },
      ],
    },
    {
      heading: 'Support',
      links: [
        { label: 'Help Centre', href: '/support' },
        { label: 'FAQ', href: '/faq' },
        { label: 'Contact Us', href: '/contact' },
        { label: 'Results', href: '/results' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Terms & Conditions', href: '/terms' },
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Responsible Gaming', href: '/responsible-gaming' },
      ],
    },
  ]

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand Column */}
          <div>
            <Link to="/" className="footer-logo">
              <BrandLogo />
            </Link>
            <p className="footer-desc">
              World's premier online lottery platform. Play MegaDraw, Powerball, Saturday Lotto and more — safely and securely.
            </p>
            <div className="responsible-gaming-banner">
              <Shield size={14} />
              <span>18+ only | Gamble Responsibly | <a href="/responsible-gaming" style={{ color: 'inherit', textDecoration: 'underline' }}>Get Help</a></span>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a href="/contact" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={14} /> Contact support
              </a>
              <a href="mailto:support@luckylottoplay.live" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={14} /> support@luckylottoplay.live
              </a>
            </div>
          </div>

          {/* Link Columns */}
          {columns.map((col) => (
            <div key={col.heading}>
              <div className="footer-heading">{col.heading}</div>
              <nav className="footer-links">
                {col.links.map((link) => (
                  <Link key={link.href} to={link.href} className="footer-link">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-text">
            © {currentYear} Lucky Lotto Play All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
