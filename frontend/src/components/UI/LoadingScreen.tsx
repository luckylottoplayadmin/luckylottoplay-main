import { motion } from 'framer-motion'

interface LoadingScreenProps {
  message?: string
}

export default function LoadingScreen({ message = 'Loading Lucky Lotto Play Platform...' }: LoadingScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '20px',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Glowing aura */}
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,166,35,0.4) 0%, rgba(26,58,143,0.1) 70%, transparent 100%)',
          }}
        />

        {/* Animated brand logo */}
        <motion.div
          animate={{ rotateY: [0, 360] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          style={{
            filter: 'drop-shadow(0 6px 20px rgba(245, 166, 35, 0.6))',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img src="/lucky-lotto-logo.png" alt="" width={80} height={80} />
        </motion.div>
      </div>

      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '24px', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
          Lucky Lotto Play
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
          {message}
        </p>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '180px', height: '4px', background: 'var(--bg-secondary)', borderRadius: '99px', overflow: 'hidden', position: 'relative' }}>
        <motion.div
          animate={{ x: ['-100%', '100%'] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          style={{
            width: '60%',
            height: '100%',
            background: 'var(--gradient-gold)',
            borderRadius: '99px',
          }}
        />
      </div>
    </div>
  )
}
