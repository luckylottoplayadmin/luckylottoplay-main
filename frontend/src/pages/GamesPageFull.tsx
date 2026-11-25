import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { gamesService } from '@/services/games.service'
import CountdownTimer from '@/components/UI/CountdownTimer'
import GoldCoin from '@/components/common/GoldCoin'
import { Search, Filter, Zap, ChevronRight } from 'lucide-react'
import { FadeInUp, StaggerContainer, StaggerItem } from '@/components/UI/MotionPrimitives'

export default function GamesPageFull() {
  const [search, setSearch] = useState('')

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => gamesService.getAll(),
    select: (r) => r.data?.data || [],
  })

  const filtered = games.filter((g: any) =>
    g.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-wrapper">
      {/* Hero */}
      <div className="section" style={{ paddingBottom: 0 }}>
        <div className="container">
          <FadeInUp className="animated-hero-bg" style={{ padding: '50px 40px', color: 'white', borderRadius: '24px', boxShadow: '0 20px 44px rgba(15, 37, 96, 0.22)', position: 'relative', overflow: 'hidden' }}>
            <div className="ambient-orb ambient-orb-1" aria-hidden="true" />
            <div className="ambient-orb ambient-orb-2" aria-hidden="true" />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '52px', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '12px', position: 'relative', zIndex: 1 }}>
              All <span style={{ background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Lottery</span> Games
            </h1>
            <p style={{ fontSize: '18px', opacity: 0.8, maxWidth: '500px', position: 'relative', zIndex: 1 }}>
              World's biggest jackpots across 9 games. Pick your lucky numbers today.
            </p>
          </FadeInUp>
        </div>
      </div>

      <div className="section">
        <div className="container">
          {/* Search */}
          <FadeInUp delay={0.1} className="input-wrapper has-icon-left" style={{ maxWidth: '400px', margin: '0 auto 32px auto' }}>
            <span className="input-icon"><Search size={16} /></span>
            <input
              type="search"
              className="form-input"
              placeholder="Search games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FadeInUp>

          {/* Games Grid */}
          {isLoading ? (
            <div className="grid-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="card" style={{ height: '340px' }}>
                  <div className="skeleton" style={{ height: '140px' }} />
                  <div style={{ padding: '20px' }}>
                    <div className="skeleton" style={{ height: '18px', marginBottom: '12px' }} />
                    <div className="skeleton" style={{ height: '32px', marginBottom: '12px' }} />
                    <div className="skeleton" style={{ height: '36px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StaggerContainer className="grid-3">
              {filtered.map((game: any, i: number) => (
                <StaggerItem key={game.id}>
                  <GameCard game={game} index={i} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}

          {filtered.length === 0 && !isLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No games found</div>
              <div className="empty-state-desc">Try a different search term</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GameCard({ game }: { game: any; index: number }) {
  const getGameStyle = (slug: string) => {
    switch (slug) {
      case 'saturday-lotto': return { bg: 'linear-gradient(145deg, #ff6b5e 0%, #e63946 100%)', title: 'white', prize: 'white' }
      case 'megadraw': return { bg: 'linear-gradient(145deg, #00d95a 0%, #00963f 100%)', title: 'white', prize: '#ffeb3b' }
      case 'powerball': return { bg: 'linear-gradient(145deg, #008cd6 0%, #005587 100%)', title: 'white', prize: '#ffeb3b' }
      case 'weekday-windfall': return { bg: 'linear-gradient(145deg, #a86cf0 0%, #7236c4 100%)', title: 'white', prize: 'white' }
      case 'set-for-life': return { bg: 'linear-gradient(145deg, #ffb42b 0%, #e07b00 100%)', title: 'white', prize: 'white' }
      case 'super66': return { bg: 'linear-gradient(145deg, #d938ec 0%, #9317a6 100%)', title: 'white', prize: 'white' }
      case 'lucky-lotteries-mega-jackpot': return { bg: 'linear-gradient(145deg, #f5c31b 0%, #ca8a04 100%)', title: 'white', prize: 'white' }
      case 'lucky-lotteries-super-jackpot': return { bg: 'linear-gradient(145deg, #22d3be 0%, #0d9488 100%)', title: 'white', prize: 'white' }
      case 'lotto-strike': return { bg: 'linear-gradient(145deg, #7478ff 0%, #4338ca 100%)', title: 'white', prize: 'white' }
      default: return { bg: 'linear-gradient(145deg, #4b91ff 0%, #1d4ed8 100%)', title: 'white', prize: 'white' }
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
      minHeight: '300px',
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
            <GoldCoin size={52} />
          </span>
          <span className="animated-jackpot" style={{ fontSize: '64px', fontWeight: 900, lineHeight: 1, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
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
