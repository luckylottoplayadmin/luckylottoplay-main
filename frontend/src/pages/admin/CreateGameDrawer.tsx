import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { X, Save, DollarSign, Settings, Hash, Clock } from 'lucide-react'
import GoldCoin from '../../components/common/GoldCoin'
import toast from 'react-hot-toast'

const gameSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  drawSchedule: z.string().min(1, 'Cron schedule is required'),
  ticketPrice: z.number().min(0),
  jackpotAmount: z.number().min(0),
  minJackpot: z.number().min(0),
  minNumbers: z.number().min(1),
  maxNumbers: z.number().min(1),
  numberPool: z.number().min(1),
  hasPowerball: z.boolean(),
  powerballPool: z.number().optional()
})

type GameFormValues = z.infer<typeof gameSchema>

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CreateGameDrawer({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient()
  
  const { register, handleSubmit, watch, formState: { errors } } = useForm<GameFormValues>({
    resolver: zodResolver(gameSchema),
    defaultValues: {
      drawSchedule: '0 20 * * *', // default 8pm every day
      ticketPrice: 2,
      jackpotAmount: 1000000,
      minJackpot: 1000000,
      minNumbers: 6,
      maxNumbers: 6,
      numberPool: 45,
      hasPowerball: false,
      powerballPool: 20
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: GameFormValues) => {
      return api.post('/admin/games', data)
    },
    onSuccess: () => {
      toast.success('Game created successfully!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'games'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create game')
    }
  })

  const onSubmit = (data: GameFormValues) => {
    createMutation.mutate(data)
  }

  const hasPowerball = watch('hasPowerball')

  if (!isOpen) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={onClose} />
      
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: '600px', backgroundColor: 'var(--bg-primary)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.3s ease-out' }}>
        
        {/* Header */}
        <div style={{ padding: 'var(--space-lg) var(--space-xl)', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Create New Game</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
        </div>

        {/* Scrollable Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)' }}>
          <form id="create-game-form" onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            
            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginTop: 0 }}><Settings size={18}/> Basic Info</h3>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Game Name</label>
                <input type="text" className={`form-input ${errors.name ? 'error' : ''}`} {...register('name')} placeholder="e.g., Powerball" />
                {errors.name && <div className="form-error">{errors.name.message}</div>}
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">URL Slug</label>
                <input type="text" className={`form-input ${errors.slug ? 'error' : ''}`} {...register('slug')} placeholder="e.g., powerball" />
                {errors.slug && <div className="form-error">{errors.slug.message}</div>}
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Short Description</label>
                <input type="text" className="form-input" {...register('shortDescription')} placeholder="Brief summary of the game..." />
              </div>
            </section>

            <hr style={{ borderTop: '1px solid var(--border-color)', margin: 'var(--space-md) 0' }} />

            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginTop: 0 }}><Clock size={18}/> Schedule</h3>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Draw Schedule (Cron Expression)</label>
                <input type="text" className={`form-input ${errors.drawSchedule ? 'error' : ''}`} {...register('drawSchedule')} placeholder="0 20 * * *" />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>E.g. "0 20 * * *" for 8:00 PM daily.</div>
                {errors.drawSchedule && <div className="form-error">{errors.drawSchedule.message}</div>}
              </div>
            </section>

            <hr style={{ borderTop: '1px solid var(--border-color)', margin: 'var(--space-md) 0' }} />

            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginTop: 0 }}><DollarSign size={18}/> Pricing & Jackpot</h3>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Ticket Price (<GoldCoin size={13} />)</label>
                  <input type="number" step="0.01" className={`form-input ${errors.ticketPrice ? 'error' : ''}`} {...register('ticketPrice', { valueAsNumber: true })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Starting Jackpot (<GoldCoin size={13} />)</label>
                  <input type="number" className={`form-input ${errors.jackpotAmount ? 'error' : ''}`} {...register('jackpotAmount', { valueAsNumber: true })} />
                </div>
              </div>
            </section>

            <hr style={{ borderTop: '1px solid var(--border-color)', margin: 'var(--space-md) 0' }} />

            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', marginTop: 0 }}><Hash size={18}/> Game Rules (Numbers)</h3>
              
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Numbers to Pick</label>
                  <input type="number" className={`form-input ${errors.minNumbers ? 'error' : ''}`} {...register('minNumbers', { valueAsNumber: true })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">From Pool of (Max)</label>
                  <input type="number" className={`form-input ${errors.numberPool ? 'error' : ''}`} {...register('numberPool', { valueAsNumber: true })} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" {...register('hasPowerball')} />
                  <strong>Has Secondary Pool (Powerball/Bonus)</strong>
                </label>
              </div>

              {hasPowerball && (
                <div className="form-group" style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <label className="form-label">Secondary Pool Size</label>
                  <input type="number" className={`form-input ${errors.powerballPool ? 'error' : ''}`} {...register('powerballPool', { valueAsNumber: true })} />
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>E.g. Pick 1 from 20.</div>
                </div>
              )}
            </section>

          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--space-lg) var(--space-xl)', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="create-game-form" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <div className="btn-spinner" /> : <><Save size={18} /> Create Game</>}
          </button>
        </div>

      </div>
    </>
  )
}
