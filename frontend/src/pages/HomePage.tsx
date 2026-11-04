import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { gamesService } from '@/services/games.service'
import { cmsService } from '@/services/index'
import JackpotCounter from '@/components/UI/JackpotCounter'
import CountdownTimer from '@/components/UI/CountdownTimer'
import LoadingScreen from '@/components/UI/LoadingScreen'
import GoldCoin from '@/components/common/GoldCoin'
import { ChevronRight, Zap, Shield, Users, Trophy, Star, ArrowRight, Play } from 'lucide-react'
import { motion } from 'framer-motion'

export default function HomePage() {
  const { data: gamesData, isLoading: isLoadingGames } = useQuery({
    queryKey: ['games'],
    queryFn: () => gamesService.getAll(),
    select: (r) => r.data?.data || [],
  })

  const { data: banners } = useQuery({
    queryKey: ['banners-home'],
    queryFn: () => cmsService.getBanners('HOME'),
    select: (r) => r.data?.data || [],
  })

  const { data: settingsData } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => cmsService.getPublicSettings(),
    select: (r) => r.data?.data || [],
  })

  const settings = settingsData?.reduce((acc: any, s: any) => {
    acc[s.key] = s.value
    return acc
  }, {}) || {}

  if (isLoadingGames) {
    return <LoadingScreen message="Loading Lucky Lotto Play..." />
  }

  const featuredGames = gamesData?.filter((g: any) => g.isFeatured).slice(0, 3) || []
  const allGames = gamesData || []

  const totalJackpot = allGames.reduce((sum: number, g: any) => sum + Number(g.jackpotAmount || 0), 0)

  const features = [
    { icon: <Shield size={28} />, title: 'Safe & Secure', desc: 'Bank-grade SSL encryption and licensed by global authorities.', color: '#10b981' },
    { icon: <Zap size={28} />, title: 'Instant Prizes', desc: 'Prizes automatically credited to your wallet after each draw.', color: '#f5a623' },
    { icon: <Users size={28} />, title: '100K+ Members', desc: 'Join hundreds of thousands of globals playing online.', color: '#6366f1' },
    { icon: <Trophy size={28} />, title: <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GoldCoin size={20} />50M+ Paid Out</span>, desc: 'Verified winners from every major global lottery.', color: '#3b82f6' },
  ]

  const gameCategories = [
    { label: 'All Games', filter: null },
    { label: 'Featured', filter: 'featured' },
    { label: 'Tuesday', filter: 'tuesday' },
    { label: 'Thursday', filter: 'thursday' },
    { label: 'Saturday', filter: 'saturday' },
  ]

  const heroBanner = banners?.[0]

  const topGame = featuredGames[0] || allGames[0]
  const topGameJackpot = topGame ? Number(topGame.jackpotAmount) / 1_000_000 : 0
  const isTopGameMillion = topGameJackpot >= 1
  const topGameJackpotStr = topGameJackpot >= 1 ? `${parseFloat(topGameJackpot.toFixed(topGameJackpot >= 10 ? 0 : 1))}` : `${(Number(topGame?.jackpotAmount || 0) / 1_000).toFixed(0)}K`

  return (
    <div className="page-wrapper">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="hero" style={{ background: 'transparent', padding: '0', overflow: 'hidden' }}>
        <div className="container">
          {topGame ? (
            <div className="oz-hero-card">
              <div className="oz-hero-left">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <img src={`/${topGame.slug}-logo.png`} alt={topGame.name} style={{ height: '80px', objectFit: 'contain', marginBottom: '24px' }} 
                       onError={(e) => {
                         e.currentTarget.style.display = 'none';
                         const span = document.createElement('span');
                         span.textContent = topGame.name;
                         span.style.fontSize = '32px';
                         span.style.fontWeight = '900';
                         span.style.fontFamily = 'var(--font-display)';
                         e.currentTarget.parentElement?.appendChild(span);
                       }} />
                </div>
                
                {topGame.nextDraw && (
                  <>
                    <div style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
                      {new Date(topGame.nextDraw.scheduledAt).toDateString() === new Date().toDateString() ? 'Today' : new Date(topGame.nextDraw.scheduledAt).toLocaleDateString('en-US', { weekday: 'short' })} {new Date(topGame.nextDraw.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: '14px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Entries Close:</span>
                      <CountdownTimer targetDate={topGame.nextDraw.scheduledAt} size="sm" />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <Link to={`/games/${topGame.slug}`} className="oz-btn-yellow">Buy Tickets</Link>
                  <Link to={`/games/${topGame.slug}?quickpick=true`} className="oz-btn-white">QuickPick</Link>
                </div>
              </div>

              <div className="oz-hero-right" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="animate-coin-flip" style={{ 
                    marginRight: 'clamp(8px, 2vw, 16px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    filter: 'drop-shadow(0 4px 14px rgba(245, 166, 35, 0.5))'
                  }}>
                    <GoldCoin size="clamp(60px, 15vw, 120px)" />
                  </span>
                  <span style={{ 
                    fontSize: 'clamp(80px, 22vw, 160px)', fontWeight: 900, lineHeight: 0.85, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
                    background: 'linear-gradient(to bottom, #ffe885, #f5a623)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    filter: 'drop-shadow(0 4px 12px rgba(245, 166, 35, 0.4))'
                  }}>
                    {topGameJackpotStr}
                  </span>
                </div>
                {isTopGameMillion && (
                  <div style={{ 
                    fontSize: 'clamp(36px, 10vw, 72px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'var(--font-display)', lineHeight: 1, marginTop: '12px',
                    background: 'linear-gradient(to bottom, #ffe885, #f5a623)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    filter: 'drop-shadow(0 4px 12px rgba(245, 166, 35, 0.43))'
                  }}>
                    MILLION
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="oz-hero-card" style={{ minHeight: '390px', background: '#2b5de4', boxShadow: 'none' }}>
              <div className="oz-hero-left" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="skeleton-blue" style={{ width: '200px', height: '60px', borderRadius: '12px' }} />
                <div className="skeleton-blue" style={{ width: '150px', height: '24px', borderRadius: '6px' }} />
                <div className="skeleton-blue" style={{ width: '250px', height: '32px', borderRadius: '8px' }} />
                <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                  <div className="skeleton-blue" style={{ width: '120px', height: '44px', borderRadius: '24px' }} />
                  <div className="skeleton-blue" style={{ width: '120px', height: '44px', borderRadius: '24px' }} />
                </div>
              </div>
              <div className="oz-hero-right" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', gap: '12px' }}>
                <div className="skeleton-blue" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
                <div className="skeleton-blue" style={{ width: '160px', height: '80px', borderRadius: '12px' }} />
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '60px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Lucky Lotto Play is your way to play lotto online</h2>
          </div>
        </div>
      </section>

      {/* ── Featured Games ────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">Featured Games</h2>
              <div className="section-subtitle">World's favourite lotteries, online and easy</div>
            </div>
            <Link to="/games" className="btn btn-outline btn-sm">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid-3">
            {featuredGames.length > 0 ? featuredGames.map((game: any, i: number) => (
              <GameCard key={game.id} game={game} index={i} />
            )) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card" style={{ height: '320px' }}>
                  <div className="skeleton" style={{ height: '130px' }} />
                  <div style={{ padding: '20px' }}>
                    <div className="skeleton" style={{ height: '20px', marginBottom: '12px' }} />
                    <div className="skeleton" style={{ height: '32px', marginBottom: '12px' }} />
                    <div className="skeleton" style={{ height: '36px', borderRadius: '8px' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section className="section-sm" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 className="section-title">Why Lucky Lotto Play?</h2>
            <div className="section-subtitle">Trusted by globals for safe and fair online lottery</div>
          </div>
          <div className="grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', justifyContent: 'center' }}>
            {features.map((f, idx) => (
              <div key={idx} className="card card-body" style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '20px',
                  background: `rgba(${hexToRgb(f.color)}, 0.12)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color, margin: '0 auto 16px',
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', marginBottom: '8px' }}>{f.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 className="section-title">How It Works</h2>
            <div className="section-subtitle">Three simple steps to win big</div>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', justifyContent: 'center' }}>
            {[
              { step: '01', title: 'Create Account', desc: 'Sign up for free in 2 minutes. Verify your email and you\'re ready to play.', icon: '👤' },
              { step: '02', title: 'Choose Numbers', desc: 'Pick your lucky numbers or use Quick Pick for a random selection.', icon: '🎯' },
              { step: '03', title: 'Win Prizes', desc: 'Prizes are automatically credited after each draw. Withdraw anytime.', icon: '🏆' },
            ].map((s) => (
              <div key={s.step} className="card card-body" style={{ position: 'relative', paddingTop: '28px' }}>
                <div style={{
                  position: 'absolute', top: '-16px', left: '20px',
                  background: 'var(--gradient-brand)', color: 'white',
                  borderRadius: '12px', padding: '4px 12px',
                  fontSize: '12px', fontWeight: 800, letterSpacing: '0.05em',
                }}>
                  STEP {s.step}
                </div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>{s.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '8px' }}>{s.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '48px' }}>
            <Link to="/register" className="btn btn-primary btn-xl">
              Start Playing Today <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Recent Results Preview ────────────────────────────────── */}
      <section className="section-sm" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">Latest Results</h2>
              <div className="section-subtitle">Recent winning numbers from every draw</div>
            </div>
            <Link to="/results" className="btn btn-outline btn-sm">
              All Results <ChevronRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {allGames.length > 0 ? (
              allGames.slice(0, 3).map((game: any) => (
                <Link key={game.id} to={`/games/${game.slug}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '20px',
                    padding: '20px', flexWrap: 'wrap',
                  }}>
                    <div style={{ minWidth: '180px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px' }}>{game.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {game.nextDraw ? `Draw #${game.nextDraw.drawNumber}` : 'No upcoming draw'}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {game.nextDraw?.winningNumbers ? (
                        <>
                          {(game.nextDraw.winningNumbers as number[]).map((n: number) => (
                            <div key={n} className="number-ball winning sm">{n}</div>
                          ))}
                        </>
                      ) : (
                        <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Draw not yet held</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '22px', whiteSpace: 'nowrap' }}>
                      <GoldCoin size={24} />
                      <span style={{ background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        {(Number(game.jackpotAmount) / 1_000_000).toFixed(0)}M
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card" style={{ height: '80px', display: 'flex', alignItems: 'center', padding: '20px', gap: '20px' }}>
                  <div style={{ minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="skeleton" style={{ width: '120px', height: '20px' }} />
                    <div className="skeleton" style={{ width: '80px', height: '14px' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <div key={j} className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                    ))}
                  </div>
                  <div className="skeleton" style={{ width: '80px', height: '28px', borderRadius: '6px' }} />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────── */}
      <section style={{ background: 'var(--gradient-hero)', padding: '80px 0' }}>
        <div className="container" style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
            LIMITED TIME
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span>Get a</span>
            <GoldCoin size="clamp(32px, 6vw, 48px)" />
            <span style={{ background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>10 Welcome Bonus</span>
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', marginBottom: '36px', maxWidth: '480px', margin: '0 auto 36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
            Register today and get <GoldCoin size={20} /> 10 free credit to start playing. No deposit required.
          </p>
          <Link to="/register" className="btn btn-gold btn-xl">
            Claim Bonus <ArrowRight size={18} />
          </Link>
          <div style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            18+ | T&C Apply | Gamble Responsibly
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Game Card ────────────────────────────────────────────────────────────────

function GameCard({ game }: { game: any; index: number }) {
  const getGameStyle = (slug: string) => {
    switch (slug) {
      case 'saturday-lotto': return { bg: '#ff5a4d', title: 'white', prize: 'white' }
      case 'megadraw': return { bg: '#00c853', title: 'white', prize: '#ffeb3b' }
      case 'powerball': return { bg: '#0077b6', title: 'white', prize: '#ffeb3b' }
      case 'weekday-windfall': return { bg: '#9b5de5', title: 'white', prize: 'white' }
      case 'set-for-life': return { bg: '#fca311', title: 'white', prize: 'white' }
      case 'super66': return { bg: '#c026d3', title: 'white', prize: 'white' }
      case 'lucky-lotteries-mega-jackpot': return { bg: '#eab308', title: 'white', prize: 'white' }
      case 'lucky-lotteries-super-jackpot': return { bg: '#14b8a6', title: 'white', prize: 'white' }
      case 'lotto-strike': return { bg: '#6366f1', title: 'white', prize: 'white' }
      default: return { bg: '#3b82f6', title: 'white', prize: 'white' }
    }
  }

  const style = getGameStyle(game.slug)
  const jackpot = Number(game.jackpotAmount) / 1_000_000
  const jackpotStr = jackpot >= 1 ? `${parseFloat(jackpot.toFixed(jackpot >= 10 ? 0 : 1))}` : `${(Number(game.jackpotAmount) / 1_000).toFixed(0)}K`
  const isMillion = jackpot >= 1

  const getNextDrawText = (dateStr: string) => {
    if (!dateStr) return 'Coming Soon'
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today ' + date.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow ' + date.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})
    }
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const diffTime = Math.abs(date.getTime() - today.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 7) return 'This ' + days[date.getDay()]
    return date.toLocaleDateString()
  }

  return (
    <Link to={`/games/${game.slug}`} className="game-card-new" style={{ 
      textDecoration: 'none', 
      background: style.bg, 
      borderRadius: '24px', 
      padding: '32px 20px', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      textAlign: 'center',
      minHeight: '280px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      color: 'white',
      border: 'none'
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontStyle: 'italic', fontWeight: 900, marginBottom: '12px', color: style.title, display: 'flex', justifyContent: 'center' }}>
        <img 
          src={`/${game.slug}-logo.png`} 
          alt={game.name} 
          style={{ height: '130px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            if (e.currentTarget.nextElementSibling) {
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block';
            }
          }}
        />
        <span style={{ display: 'none' }}>{game.name}</span>
      </div>
      
      <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '24px', opacity: 0.9, color: 'white' }}>
        {game.nextDraw ? getNextDrawText(game.nextDraw.scheduledAt) : 'Coming Soon'}
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: style.prize, textShadow: style.prize === '#ffeb3b' ? '0 2px 10px rgba(0,0,0,0.1)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span className="animate-coin-flip" style={{ display: 'inline-flex' }}>
            <GoldCoin size="clamp(40px, 8vw, 52px)" />
          </span>
          <span className="animated-jackpot" style={{ fontSize: 'clamp(48px, 12vw, 64px)', fontWeight: 900, lineHeight: 1, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {jackpotStr}
          </span>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px', fontFamily: 'var(--font-display)' }}>
          {isMillion ? 'Million' : ''}
        </div>
      </div>
    </Link>
  )
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0'
}
