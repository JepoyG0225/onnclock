import { faceBetaAvailable } from '@/lib/face/availability'
import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { FACE_MODEL_ID } from '@/lib/face/face-api'
import { z } from 'zod'

export const KIOSK_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-onclock-office-kiosk' : 'onclock-office-kiosk'
export const hashKioskSecret = (value: string) => createHash('sha256').update(value).digest('hex')
export const kioskSecret = () => randomBytes(32).toString('base64url')
export const kioskError = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}
export async function kioskAuth(req: NextRequest) {
  if (!sameOrigin(req)) return null
  const token = req.cookies.get(KIOSK_COOKIE)?.value
  if (!token) return null
  const device = await prisma.officeKiosk.findUnique({ where: { tokenHash: hashKioskSecret(token) }, include: { company: { select: { faceRecognitionRequired: true, name: true, logoUrl: true } } } })
  return device && (await faceBetaAvailable(device.companyId)) && device.company.faceRecognitionRequired ? device : null
}
export const descriptorSchema = z.array(z.number().finite().min(-5).max(5)).length(128).refine(a => a.some(v => v !== 0))
export const kioskScanSchema = z.object({
  challengeId: z.string().uuid(),
  model: z.literal(FACE_MODEL_ID),
  embeddings: z.array(descriptorSchema).min(3).max(5),
  photo: z.string().max(2_000_000).startsWith('data:image/jpeg;base64,'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().max(100000).optional(),
})
// All samples must match the claimed employee, not just the best frame.
// References are normalized by the existing employee enrollment endpoint.
export function kioskFaceMatches(reference: unknown, frames: number[][]) {
  const parsed = descriptorSchema.safeParse(reference)
  if (!parsed.success || frames.length < 3) return false
  const norm = (a: number[]) => Math.sqrt(a.reduce((sum, v) => sum + v * v, 0))
  const ref = parsed.data, refNorm = norm(ref)
  return frames.every(frame => {
    if (!descriptorSchema.safeParse(frame).success) return false
    const similarity = frame.reduce((sum, v, i) => sum + v * ref[i], 0) / (norm(frame) * refNorm)
    return similarity >= 0.92
  })
}

export const KIOSK_REPEAT_WINDOW_MS = 120_000
export function identifyKioskEmployee<T extends { faceEmbedding: unknown }>(candidates: T[], frames: number[][]): T | null {
  if (frames.length < 3 || !frames.every(frame => descriptorSchema.safeParse(frame).success)) return null
  const normalize = (values: number[]) => {
    const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
    return values.map(value => value / length)
  }
  const samples = frames.map(normalize)
  const ranked = candidates.flatMap(employee => {
    const parsed = descriptorSchema.safeParse(employee.faceEmbedding)
    if (!parsed.success) return []
    const reference = normalize(parsed.data)
    const scores = samples.map(frame => frame.reduce((sum, value, i) => sum + value * reference[i], 0))
    return [{ employee, scores, minimum: Math.min(...scores) }]
  }).sort((a, b) => b.minimum - a.minimum)
  const top = ranked[0]
  if (!top || top.minimum < 0.92) return null
  // Every frame must agree, with a clear margin over every other employee.
  if (ranked.slice(1).some(other => top.scores.some((score, i) => score - other.scores[i] < 0.03))) return null
  return top.employee
}
