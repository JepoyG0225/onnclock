import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const companySchema = z.object({
  name: z.string().min(2).optional(),
  industry: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().optional().nullable(),
  logoUrl: z.string().max(1_500_000).optional().nullable(),
  portalUrl: z.string().optional().nullable(),
  tinNo: z.string().optional().nullable(),
  sssNo: z.string().optional().nullable(),
  philhealthNo: z.string().optional().nullable(),
  pagibigNo: z.string().optional().nullable(),
  birNo: z.string().optional().nullable(),
  fingerprintRequired: z.boolean().optional(),
  geofenceEnabled: z.boolean().optional(),
  geofenceLat: z.number().optional().nullable(),
  geofenceLng: z.number().optional().nullable(),
  geofenceRadiusMeters: z.number().int().optional().nullable(),
})

function isDataImageUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

function getImageExtension(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

async function persistLogo(companyId: string, dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')

  const mime = match[1]
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')

  const maxBytes = 2 * 1024 * 1024
  if (buffer.length > maxBytes) throw new Error('Logo exceeds 2MB limit')

  const ext = getImageExtension(mime)
  const bucket = process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
  const objectPath = `companies/${companyId}/logo.${ext}`

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType: mime, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  if (!data?.publicUrl) throw new Error('Storage public URL not available')

  return `${data.publicUrl}?v=${Date.now()}`
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    include: { contributionConfig: true },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const baseDomain = process.env.PORTAL_BASE_DOMAIN
  const derivedPortalUrl = baseDomain ? `https://${baseDomain}/portal` : null

  return NextResponse.json({
    ...company,
    tinNo: company.tin ?? null,
    sssNo: company.sssRegistrationNo ?? null,
    portalUrl: company.portalUrl ?? derivedPortalUrl,
    portalSubdomain: company.portalSubdomain ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = companySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    let nextLogoUrl: string | null | undefined = parsed.data.logoUrl ?? null
    if (typeof nextLogoUrl === 'string' && isDataImageUrl(nextLogoUrl)) {
      try {
        const stored = await persistLogo(ctx.companyId, nextLogoUrl)
        nextLogoUrl = stored
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Logo upload failed'
        return NextResponse.json({ error: msg }, { status: 400 })
      }
    }

    const updated = await prisma.company.update({
      where: { id: ctx.companyId },
      data: {
        name: parsed.data.name,
        industry: parsed.data.industry ?? null,
        address: parsed.data.address ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        website: parsed.data.website ?? null,
        portalUrl: parsed.data.portalUrl ?? undefined,
        logoUrl: nextLogoUrl ?? null,
        tin: parsed.data.tinNo ?? null,
        sssRegistrationNo: parsed.data.sssNo ?? null,
        philhealthNo: parsed.data.philhealthNo ?? null,
        pagibigNo: parsed.data.pagibigNo ?? null,
        birNo: parsed.data.birNo ?? null,
        fingerprintRequired: parsed.data.fingerprintRequired ?? true,
        geofenceEnabled: parsed.data.geofenceEnabled ?? false,
        geofenceLat: parsed.data.geofenceLat ?? null,
        geofenceLng: parsed.data.geofenceLng ?? null,
        geofenceRadiusMeters: parsed.data.geofenceRadiusMeters ?? null,
      },
    })

    return NextResponse.json({
      ...updated,
      tinNo: updated.tin ?? null,
      sssNo: updated.sssRegistrationNo ?? null,
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const code = e.code
      const meta = e.meta as Record<string, unknown> | undefined
      console.error('[PATCH /api/settings]', code, meta)
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'Duplicate value for a unique field.', code, meta },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: e.message, code, meta }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[PATCH /api/settings]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
