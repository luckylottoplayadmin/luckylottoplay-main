import { ReactNode } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const

interface FadeInUpProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  delay?: number
  duration?: number
  y?: number
}

export function FadeInUp({
  children,
  delay = 0,
  duration = 0.5,
  y = 22,
  ...rest
}: FadeInUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

interface StaggerContainerProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  staggerDelay?: number
  delayChildren?: number
}

export function StaggerContainer({
  children,
  staggerDelay = 0.07,
  delayChildren = 0.05,
  ...rest
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.08 }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

interface StaggerItemProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  y?: number
}

export function StaggerItem({ children, y = 20, ...rest }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.45, ease: EASE_OUT_EXPO },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
