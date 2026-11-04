import { api } from './api'

export async function uploadKycDocument(file: File | Blob): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'document.jpg')
  const response = await api.post('/users/me/kyc/upload', form, {
    headers: { 'Content-Type': undefined },
  })
  return response.data.data.reference
}

export async function uploadBanner(file: File | Blob): Promise<string> {
  const form = new FormData()
  form.append('file', file, 'banner.jpg')
  const response = await api.post('/admin/cms/uploads', form, {
    headers: { 'Content-Type': undefined },
  })
  return response.data.data.url
}
