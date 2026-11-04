export default function BrandLogo() {
  return (
    <span aria-label="Lucky Lotto Play" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
      <img src="/lucky-lotto-logo.png" alt="" width={44} height={44} style={{ display: 'block', flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontFamily: 'var(--font-display)', lineHeight: 1.05 }}>
        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase' }}>Lucky</span>
        <span style={{ fontSize: '21px', fontWeight: 900, color: 'var(--color-secondary)' }}>Lotto Play</span>
      </span>
    </span>
  )
}
