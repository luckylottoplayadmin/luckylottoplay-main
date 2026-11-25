import clsx from 'clsx'
import { motion } from 'framer-motion'

interface NumberBallProps {
  number: number
  variant?: 'default' | 'selected' | 'winning' | 'supplementary' | 'powerball' | 'disabled'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClick?: (n: number) => void
  clickable?: boolean
}

export default function NumberBall({
  number,
  variant = 'default',
  size = 'md',
  onClick,
  clickable,
}: NumberBallProps) {
  const isInteractive = Boolean(clickable || onClick) && variant !== 'disabled'

  return (
    <motion.div
      whileHover={isInteractive ? { scale: 1.16, y: -2 } : { scale: 1.08 }}
      whileTap={isInteractive ? { scale: 0.92 } : undefined}
      transition={{ type: 'spring', stiffness: 450, damping: 22 }}
      className={clsx(
        'number-ball',
        variant !== 'default' && variant,
        size !== 'md' && size,
        String(number).length > 2 && 'raffle-pill',
        (clickable || onClick) && 'clickable'
      )}
      onClick={() => onClick?.(number)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(number)}
      aria-pressed={variant === 'selected'}
      aria-label={`Number ${number}`}
    >
      {number}
    </motion.div>
  )
}
