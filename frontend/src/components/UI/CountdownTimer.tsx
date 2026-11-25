import { useCountdown } from '@/hooks/useCountdown'
import { motion } from 'framer-motion'

interface CountdownTimerProps {
  targetDate: string | Date | null
  size?: 'sm' | 'md' | 'lg'
  label?: string
  onExpired?: () => void
}

export default function CountdownTimer({ targetDate, size = 'md', label, onExpired }: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate)

  if (isExpired) {
    return (
      <div className="countdown">
        <span className="badge badge-danger">Draw Closed</span>
      </div>
    )
  }

  const valueStyle = size === 'sm'
    ? { fontSize: '16px', minWidth: '36px', padding: '5px 3px' }
    : size === 'lg'
    ? { fontSize: '32px', minWidth: '72px', padding: '12px 8px' }
    : {}

  const labelStyle = size === 'lg' ? { fontSize: '12px' } : {}

  const sepStyle = size === 'sm'
    ? { fontSize: '16px', fontWeight: 800, margin: '0 3px' }
    : size === 'lg'
    ? { fontSize: '28px', fontWeight: 800, margin: '0 6px' }
    : { fontSize: '20px', fontWeight: 800, margin: '0 4px' }

  return (
    <div>
      {label && <div className="jackpot-label" style={{ marginBottom: '8px' }}>{label}</div>}
      <div className="countdown" style={{ alignItems: 'center' }}>
        {days > 0 && (
          <>
            <div className="countdown-unit">
              <div className="countdown-value" style={valueStyle}>{String(days).padStart(2, '0')}</div>
              <div className="countdown-label" style={labelStyle}>Days</div>
            </div>
            <div className="countdown-sep" style={sepStyle}>:</div>
          </>
        )}
        <div className="countdown-unit">
          <div className="countdown-value" style={valueStyle}>{String(hours).padStart(2, '0')}</div>
          <div className="countdown-label" style={labelStyle}>Hrs</div>
        </div>
        <div className="countdown-sep" style={sepStyle}>:</div>
        <div className="countdown-unit">
          <div className="countdown-value" style={valueStyle}>{String(minutes).padStart(2, '0')}</div>
          <div className="countdown-label" style={labelStyle}>Min</div>
        </div>
        <div className="countdown-sep" style={sepStyle}>:</div>
        <div className="countdown-unit">
          <motion.div
            key={seconds}
            initial={{ y: -4, opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="countdown-value"
            style={valueStyle}
          >
            {String(seconds).padStart(2, '0')}
          </motion.div>
          <div className="countdown-label" style={labelStyle}>Sec</div>
        </div>
      </div>
    </div>
  )
}
