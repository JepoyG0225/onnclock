import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
function key() {
  const secret = process.env.PAYMONGO_KYB_ENCRYPTION_KEY
  if (!secret || secret.length < 32) throw new Error('Company wallet encryption is not configured.')
  return createHash('sha256').update(secret).digest()
}
export function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.')
}
export function unseal<T>(value: string): T {
  const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64url'))
  const cipher = createDecipheriv('aes-256-gcm', key(), iv)
  cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')) as T
}
