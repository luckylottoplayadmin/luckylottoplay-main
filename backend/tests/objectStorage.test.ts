import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
const { send, presign } = vi.hoisted(() => ({ send: vi.fn(), presign: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(public input: any) {} }
  return { S3Client: class { send = send }, PutObjectCommand: Command, HeadObjectCommand: Command, GetObjectCommand: Command }
})
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: presign }))
import { privateKycKey, validateOwnedKycImage, uploadKycImage, uploadBannerImage, signKycRecord, readImageUpload } from '../src/services/objectStorage'
const ref = 'neon://lottery-kyc/kyc/user-1/11111111-1111-4111-8111-111111111111.jpg'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AWS_ENDPOINT_URL_S3', 'https://br-test.storage.c-3.ap-southeast-1.aws.neon.tech')
  vi.stubEnv('AWS_REGION', 'ap-southeast-1')
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key')
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret')
  send.mockResolvedValue({ ContentLength: 50, ContentType: 'image/jpeg' })
  presign.mockResolvedValue('https://storage.example/signed-test-only')
})
afterEach(() => vi.unstubAllEnvs())

describe('private KYC storage', () => {
  it('omits historical external document links without reading or signing the old files', async () => {
    const record = await signKycRecord({ documentUrl: 'https://legacy.example/document.jpg', selfieUrl: 'https://legacy.example/selfie.jpg' })
    expect(record.documentUrl).toBeNull()
    expect(record.selfieUrl).toBeNull()
    expect(send).not.toHaveBeenCalled()
    expect(presign).not.toHaveBeenCalled()
  })
  it('rejects external URLs, foreign buckets, traversal and another account before reading storage', async () => {
    for (const value of ['https://example.com/document.jpg', ref.replace('lottery-kyc','lottery-banners'), ref.replace('user-1','../user-1')]) {
      expect(() => privateKycKey(value, 'user-1')).toThrow()
    }
    await expect(validateOwnedKycImage(ref, 'user-2')).rejects.toMatchObject({ statusCode: 403 })
    expect(send).not.toHaveBeenCalled()
  })
  it('requires the private object to exist and be a bounded JPEG', async () => {
    send.mockResolvedValueOnce({ ContentLength: 50, ContentType: 'text/html' })
    await expect(validateOwnedKycImage(ref, 'user-1')).rejects.toThrow('Invalid stored document')
    send.mockRejectedValueOnce(new Error('Not found'))
    await expect(validateOwnedKycImage(ref, 'user-1')).rejects.toThrow('Not found')
  })
  it('uploads to a private per-user key without exposing a public URL', async () => {
    const reference = await uploadKycImage('user-1', Buffer.from('image'))
    expect(reference).toMatch(/^neon:\/\/lottery-kyc\/kyc\/user-1\/[a-f0-9-]+\.jpg$/)
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'lottery-kyc', CacheControl: 'private, no-store' })
  })
  it('never serves old external document URLs', async () => {
    const record = await signKycRecord({ documentUrl: 'https://old-storage.example/document.jpg', selfieUrl: null })
    expect(record.documentUrl).toBeNull()
    expect(presign).not.toHaveBeenCalled()
  })
  it('signs review links for five minutes without caching identity images', async () => {
    const record = await signKycRecord({ documentUrl: ref, selfieUrl: null })
    expect(record.documentUrl).toContain('signed-test-only')
    expect(record.selfieUrl).toBeNull()
    expect(presign.mock.calls[0][2]).toEqual({ expiresIn: 300 })
    expect(presign.mock.calls[0][1].input.ResponseCacheControl).toBe('private, no-store')
  })
})

describe('image upload validation', () => {
  function request(mimetype: string, bytes: Buffer, truncated = false): any {
    return { file: vi.fn().mockResolvedValue({ mimetype, toBuffer: async () => bytes, file: { truncated } }) }
  }
  it('rejects active content and images whose declared MIME type is forged', async () => {
    await expect(readImageUpload(request('image/svg+xml', Buffer.from('<svg/>')))).rejects.toThrow('Use a JPEG')
    await expect(readImageUpload(request('image/jpeg', Buffer.from('<html>bad</html>')))).rejects.toThrow('Invalid image')
    await expect(readImageUpload(request('image/png', Buffer.alloc(1), true))).rejects.toMatchObject({ statusCode: 413 })
  })
  it('decodes real image bytes and returns a normalized JPEG', async () => {
    const input = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer()
    const output = await readImageUpload(request('image/png', input))
    expect((await sharp(output).metadata()).format).toBe('jpeg')
  })
  it('stores banners under versioned public keys and long cache lifetimes', async () => {
    const url = await uploadBannerImage(Buffer.from('image'))
    expect(url).toMatch(/\/lottery-banners\/banners\/[a-f0-9-]+\.jpg$/)
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'lottery-banners', CacheControl: 'public, max-age=31536000, immutable' })
  })
})
