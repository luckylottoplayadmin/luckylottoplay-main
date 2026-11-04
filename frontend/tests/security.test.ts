// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { sanitizeSupportMessage } from '../src/lib/sanitizeSupportMessage'

let storageBrowser: JSDOM

beforeEach(() => {
  // Keep browser storage independent of Node's native Web Storage globals.
  storageBrowser = new JSDOM('', { url: 'https://app.example.test' })
  vi.stubGlobal('localStorage', storageBrowser.window.localStorage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  storageBrowser.window.close()
  vi.resetModules()
})

it('preserves editor formatting while stripping executable HTML and dangerous URLs', () => {
  const html = sanitizeSupportMessage('<p><strong>Hello</strong><img src=x onerror=alert(1)></p><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">link</a><iframe src="https://evil.example"></iframe>')
  const container = document.createElement('div')
  container.innerHTML = html
  expect(container.querySelector('strong')?.textContent).toBe('Hello')
  expect(container.querySelector('img, script, iframe, [onclick], [onerror]')).toBeNull()
  expect(container.querySelector('a')?.getAttribute('href')).toBeNull()
})

it('drops legacy stored bearer tokens and keeps newly issued tokens only in memory', async () => {
  localStorage.setItem('auth-store', JSON.stringify({ state: {
    user: { id: 'user-1' }, isAuthenticated: true, accessToken: 'legacy-stolen-token',
  }, version: 0 }))
  const { useAuthStore } = await import('../src/store/authStore')
  expect(useAuthStore.getState().accessToken).toBeNull()
  expect(localStorage.getItem('auth-store')).not.toContain('legacy-stolen-token')
  useAuthStore.getState().setToken('new-token')
  expect(useAuthStore.getState().accessToken).toBe('new-token')
  expect(localStorage.getItem('auth-store')).not.toContain('new-token')
  expect(JSON.parse(localStorage.getItem('auth-store')!).state).not.toHaveProperty('accessToken')
})
