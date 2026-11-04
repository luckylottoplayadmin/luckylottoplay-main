import React from 'react'
import { ShieldCheck, Lock, AlertCircle, Scale, FileText, CheckCircle2 } from 'lucide-react'

export function TermsPage() {
  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', color: 'var(--color-primary)' }}>
            <Scale size={32} />
          </div>
          <div>
            <h1 className="section-title" style={{ margin: 0 }}>Terms & Conditions</h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Last updated: July 25, 2026</div>
          </div>
        </div>

        <div className="card card-body" style={{ color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px' }}>
          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="var(--color-primary)" /> 1. Introduction & Acceptance of Terms
            </h2>
            <p>
              Welcome to <strong>Lucky Lotto Play</strong> ("Platform", "we", "us", or "our"). By registering an account, accessing, or utilizing any portion of our online lottery services, you agree to be bound by these Terms and Conditions, our Privacy Policy, and all applicable jurisdictional laws and regulations. If you do not agree with any part of these terms, you must refrain from using the Platform immediately.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="var(--color-primary)" /> 2. Account Eligibility & Registration Requirements
            </h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Age Requirement:</strong> You must be at least 18 years of age (or the legal age of majority in your legal jurisdiction) to register an account and participate in draws.</li>
              <li><strong>Verification (KYC):</strong> Identity verification is required. Users must provide valid government-issued ID and address proof before processing any financial withdrawals.</li>
              <li><strong>One Account Per User:</strong> Each individual is permitted to register and maintain only one account. Duplicate accounts created to exploit bonuses or referrals will be permanently suspended and forfeited.</li>
              <li><strong>Account Security:</strong> You are solely responsible for maintaining the confidentiality of your login credentials and two-factor authentication (2FA) secrets.</li>
            </ul>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>3. Ticket Purchases & Draw Operations</h2>
            <p>
              All ticket sales are final once confirmed. Ticket purchases are automatically registered against the scheduled draw numbers. Draws are conducted transparently using certified Random Number Generators (RNG) or official draw feeds. In the event of draw postponement or technical disruption, tickets remain valid for the next rescheduled draw.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>4. Winnings & Prize Payouts</h2>
            <p>
              Prizes are automatically credited to your platform wallet balance upon completion of draw audit procedures. Jackpot and major tier wins may require secondary identity and compliance verification prior to distribution. All local tax obligations arising from winnings are the sole responsibility of the player.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>5. Affiliate & Referral Program Rules</h2>
            <p>
              Members may earn commissions through valid user referrals. Self-referral, automated spam, or deceptive advertising tactics are strictly prohibited and will lead to termination of affiliate status and forfeiture of accrued commission balances.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>6. Limitation of Liability</h2>
            <p>
              Lucky Lotto Play shall not be liable for any indirect, incidental, or consequential damages arising from service interruptions, network failure, or unauthorized access to user accounts caused by third-party negligence.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: '#10b981' }}>
            <Lock size={32} />
          </div>
          <div>
            <h1 className="section-title" style={{ margin: 0 }}>Privacy Policy</h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Last updated: July 25, 2026</div>
          </div>
        </div>

        <div className="card card-body" style={{ color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px' }}>
          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>1. Data We Collect</h2>
            <p>
              We collect personal details essential for identity verification, account security, and payment handling:
            </p>
            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
              <li>Full Legal Name, Email Address, Contact Number, and Date of Birth</li>
              <li>Government Identification Documents (for KYC verification)</li>
              <li>Device IP address, login timestamps, and geolocation data</li>
              <li>Transaction history, deposits, and withdrawal records</li>
            </ul>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>2. How Your Information Is Used</h2>
            <p>
              Your data is processed strictly for legal compliance (Anti-Money Laundering & Know Your Customer regulations), transaction processing, fraud prevention, and system maintenance. We never sell your personal data to third-party marketers.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>3. Data Security & Encryption</h2>
            <p>
              All personal and financial details are protected using enterprise-grade TLS encryption, hashed credentials (Argon2id), and secured database storage with restricted administrative role access.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function ResponsibleGamingPage() {
  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', color: '#f59e0b' }}>
            <AlertCircle size={32} />
          </div>
          <div>
            <h1 className="section-title" style={{ margin: 0 }}>Responsible Gaming</h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Committed to Player Welfare</div>
          </div>
        </div>

        <div className="card card-body" style={{ color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px' }}>
          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>Play Responsibly</h2>
            <p>
              At Lucky Lotto Play, we believe lottery games should always be fun, safe, and controlled entertainment. We encourage all players to set personal budgets, avoid chasing losses, and take breaks.
            </p>
          </section>

          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.5 }} />

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '12px' }}>Protection & Limit Tools</h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Deposit & Spending Limits:</strong> Set daily, weekly, or monthly deposit ceilings within your profile settings.</li>
              <li><strong>Self-Exclusion:</strong> Temporarily pause or permanently close your account whenever you need a break.</li>
              <li><strong>Underage Prevention:</strong> Strict mandatory KYC checks ensure no individuals under 18 can play or withdraw.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default TermsPage
