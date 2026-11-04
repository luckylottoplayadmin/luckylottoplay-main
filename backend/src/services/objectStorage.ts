import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { FastifyRequest } from 'fastify'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const KYC_LINK_SECONDS = 300

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode })
}

export function storageConfig() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) fail('File storage is not configured', 503)
  const parsed = new URL(endpoint)
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.neon.tech') || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail('Invalid Neon storage endpoint', 503)
  }
  return { endpoint: parsed.origin, region, credentials: { accessKeyId, secretAccessKey },
    kycBucket: process.env.NEON_KYC_BUCKET || 'lottery-kyc',
    bannerBucket: process.env.NEON_BANNER_BUCKET || 'lottery-banners' }
}

export function storageClient() {
  const { endpoint, region, credentials } = storageConfig()
  return new S3Client({ endpoint, region, credentials, forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
}

export async function readImageUpload(request: FastifyRequest) {
  const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 } })
  if (!file) fail('Choose an image to upload')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) fail('Use a JPEG, PNG or WebP image')
  const input = await file.toBuffer()
  if (file.file.truncated || input.length > MAX_UPLOAD_BYTES) fail('Image must be 5 MB or smaller', 413)
  try {
    const image = sharp(input, { limitInputPixels: 25_000_000, animated: false })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) fail('Unsupported image')
    // Decode, strip metadata and re-encode; never trust a filename or browser MIME type.
    return await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer()
  } catch {
    fail('Invalid image. Use a JPEG, PNG or WebP image')
  }
}

export function privateKycKey(reference: string, userId?: string): string {
  const { kycBucket } = storageConfig()
  const prefix = `neon://${kycBucket}/`
  if (!reference?.startsWith(prefix)) fail('Upload your document using this application')
  const key = reference.slice(prefix.length)
  if (!/^kyc\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}\.jpg$/.test(key)) fail('Invalid document reference')
  if (userId && !key.startsWith(`kyc/${userId}/`)) fail('Document does not belong to this account', 403)
  return key
}

export async function uploadKycImage(userId: string, image: Buffer) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) fail('Invalid account', 403)
  const { kycBucket } = storageConfig()
  const key = `kyc/${userId}/${randomUUID()}.jpg`
  await storageClient().send(new PutObjectCommand({ Bucket: kycBucket, Key: key, Body: image,
    ContentType: 'image/jpeg', CacheControl: 'private, no-store' }))
  return `neon://${kycBucket}/${key}`
}

export async function validateOwnedKycImage(reference: string, userId: string) {
  const key = privateKycKey(reference, userId)
  const info = await storageClient().send(new HeadObjectCommand({ Bucket: storageConfig().kycBucket, Key: key }))
  if (!info.ContentLength || info.ContentLength > MAX_UPLOAD_BYTES || info.ContentType !== 'image/jpeg') fail('Invalid stored document')
}

export async function signKycRecord<T extends { documentUrl: string; selfieUrl?: string | null }>(record: T) {
  const sign = async (reference?: string | null) => {
    // Historical documents are deliberately not migrated or served.
    if (!reference || !reference.startsWith(`neon://${storageConfig().kycBucket}/`)) return null
    const key = privateKycKey(reference)
    return getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: storageConfig().kycBucket, Key: key,
      ResponseCacheControl: 'private, no-store', ResponseContentDisposition: 'inline', ResponseContentType: 'image/jpeg' }),
      { expiresIn: KYC_LINK_SECONDS })
  }
  return { ...record, documentUrl: await sign(record.documentUrl), selfieUrl: await sign(record.selfieUrl),
    documentLinksExpireAt: new Date(Date.now() + KYC_LINK_SECONDS * 1000).toISOString() }
}

export function redactKycRecord<T>(record: T) {
  return { ...record, documentUrl: null, selfieUrl: null }
}

export async function uploadBannerImage(image: Buffer) {
  const { endpoint, bannerBucket } = storageConfig()
  const key = `banners/${randomUUID()}.jpg`
  await storageClient().send(new PutObjectCommand({ Bucket: bannerBucket, Key: key, Body: image,
    ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }))
  return `${endpoint}/${encodeURIComponent(bannerBucket)}/${key}`
}
