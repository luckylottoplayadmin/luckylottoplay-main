import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supportService } from '@/services/index'
import { ChevronDown, Search, Mail, Phone, MessageSquare } from 'lucide-react'

export function FAQPage() {
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: faqs = [] } = useQuery({
    queryKey: ['faqs'],
    queryFn: () => supportService.getFaqs(),
    select: (r) => r.data?.data || [],
  })

  const filtered = faqs.filter((f: any) => f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '800px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 className="section-title">Frequently Asked Questions</h1>
          <div className="section-subtitle">Find answers to common questions about playing on Lucky Lotto Play</div>
          <div className="input-wrapper has-icon-left" style={{ maxWidth: '400px', margin: '24px auto 0' }}>
            <span className="input-icon"><Search size={16} /></span>
            <input type="text" className="form-input" placeholder="Search FAQs..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((faq: any) => (
            <div key={faq.id} className="card" style={{ overflow: 'hidden' }}>
              <button
                style={{ width: '100%', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 700, fontSize: '16px' }}
                onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
              >
                {faq.question}
                <ChevronDown size={20} style={{ transform: openId === faq.id ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }} />
              </button>
              {openId === faq.id && (
                <div style={{ padding: '0 20px 20px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No FAQs found matching your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}

import toast from 'react-hot-toast'

export function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' })

  const mutation = useMutation({
    mutationFn: (data: { name: string; email: string; subject: string; message: string }) => supportService.submitContact(data),
    onSuccess: () => {
      toast.success('Your message has been sent successfully!')
      setFormData({ name: '', email: '', subject: '', message: '' })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to send message')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      return toast.error('Please fill in all fields')
    }
    mutation.mutate(formData)
  }

  return (
    <div className="page-wrapper section">
      <div className="container" style={{ maxWidth: '800px' }}>
        <h1 className="section-title" style={{ textAlign: 'center' }}>Contact Us</h1>
        <div className="section-subtitle" style={{ textAlign: 'center', marginBottom: '48px' }}>We're here to help 24/7</div>

        <div className="grid-3" style={{ marginBottom: '48px' }}>
          <div className="card card-body" style={{ textAlign: 'center' }}>
            <Phone size={32} style={{ color: 'var(--color-primary)', margin: '0 auto 16px' }} />
            <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Phone Support</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Available 8am-8pm AEST</p>
            <a href="/contact" style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-primary)' }}>Contact support</a>
          </div>
          <div className="card card-body" style={{ textAlign: 'center' }}>
            <Mail size={32} style={{ color: 'var(--color-primary)', margin: '0 auto 16px' }} />
            <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Email</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>We reply within 24 hours</p>
            <a href="mailto:support@luckylottoplay.live" style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>support@luckylottoplay.live</a>
          </div>
          <div className="card card-body" style={{ textAlign: 'center' }}>
            <MessageSquare size={32} style={{ color: 'var(--color-primary)', margin: '0 auto 16px' }} />
            <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Live Chat</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Available 24/7</p>
            <button className="btn btn-outline btn-sm" onClick={() => toast.success('Live Chat widget initialized!')}>Start Chat</button>
          </div>
        </div>

        <div className="card card-body">
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '20px' }}>Send us a message</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your Name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="How can we help?"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea
                className="form-input"
                rows={5}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Describe your inquiry..."
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={mutation.isPending}
              style={{ alignSelf: 'flex-start' }}
            >
              {mutation.isPending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
export default FAQPage
