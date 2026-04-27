import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const companyModelFields = new Set(
  (Prisma.dmmf.datamodel.models.find((m) => m.name === 'Company')?.fields ?? []).map((f) => f.name)
)

function companyFieldSupported(field: string): boolean {
  return companyModelFields.has(field)
}

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
  selfieRequired: z.boolean().optional(),
  screenCaptureEnabled: z.boolean().optional(),
  screenCaptureFrequencyMinutes: z.number().int().min(1).max(60).optional(),
  geofenceEnabled: z.boolean().optional(),
  geofenceLat: z.number().optional().nullable(),
  geofenceLng: z.number().optional().nullable(),
  geofenceRadiusMeters: z.number().int().optional().nullable(),
  defaultBreakMinutes: z.number().int().min(0).max(720).optional(),
  careerBannerUrl: z.string().max(1_500_000).optional().nullable(),
  careerTagline: z.string().max(200).optional().nullable(),
  careerDescription: z.string().max(2000).optional().nullable(),
  careerSocialFacebook: z.string().max(300).optional().nullable(),
  careerSocialLinkedin: z.string().max(300).optional().nullable(),
  careerSocialTwitter: z.string().max(300).optional().nullable(),
  careerSocialInstagram: z.string().max(300).optional().nullable(),
})

function normalizeBreakMinutes(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.max(0, Math.min(720, Math.round(n)))
}

async function readCompanyDefaultBreakMinutes(companyId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ defaultBreakMinutes: number | null }>>`
      SELECT "defaultBreakMinutes"
      FROM "companies"
      WHERE "id" = ${companyId}
      LIMIT 1
    `
    return normalizeBreakMinutes(rows?.[0]?.defaultBreakMinutes)
  } catch {
    return 60
  }
}

async function writeCompanyDefaultBreakMinutes(companyId: string, minutes: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "companies"
    SET "defaultBreakMinutes" = ${normalizeBreakMinutes(minutes)}
    WHERE "id" = ${companyId}
  `
}

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

async function persistBanner(companyId: string, dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')

  const mime = match[1]
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')

  const maxBytes = 4 * 1024 * 1024
  if (buffer.length > maxBytes) throw new Error('Banner exceeds 4MB limit')

  const ext = getImageExtension(mime)
  const bucket = process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
  const objectPath = `companies/${companyId}/career-banner.${ext}`

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
  const defaultBreakMinutes = await readCompanyDefaultBreakMinutes(ctx.companyId)

  return NextResponse.json({
    ...company,
    defaultBreakMinutes,
    tinNo: company.tin ?? null,
    sssNo: company.sssRegistrationNo ?? null,
    portalUrl: company.portalUrl ?? derivedPortalUrl,
    portalSubdomain: company.portalSubdomain ?? null,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    const canManageSettings = ['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(ctx.role) || ctx.actorRole === 'SUPER_ADMIN'
    if (!canManageSettings) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = companySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const hasField = (field: keyof z.infer<typeof companySchema>) =>
      Object.prototype.hasOwnProperty.call(parsed.data, field)
    const requestedDefaultBreakMinutes = hasField('defaultBreakMinutes')
      ? normalizeBreakMinutes(parsed.data.defaultBreakMinutes)
      : undefined

    const subscription = await prisma.subscription.findUnique({
      where: { companyId: ctx.companyId },
      select: { pricePerSeat: true },
    })
    const isScreenCaptureEntitled = Number(subscription?.pricePerSeat ?? 0) >= 70
    if ((parsed.data.screenCaptureEnabled ?? false) && !isScreenCaptureEntitled) {
      return NextResponse.json(
        { error: 'Screen capture security requires the Php 70 per employee plan.' },
        { status: 403 }
      )
    }

    const companyUpdateData: Record<string, unknown> = {}

    if (hasField('name')) companyUpdateData.name = parsed.data.name
    if (hasField('industry')) companyUpdateData.industry = parsed.data.industry ?? null
    if (hasField('address')) companyUpdateData.address = parsed.data.address ?? null
    if (hasField('phone')) companyUpdateData.phone = parsed.data.phone ?? null
    if (hasField('email')) companyUpdateData.email = parsed.data.email ?? null
    if (hasField('website')) companyUpdateData.website = parsed.data.website ?? null
    if (hasField('portalUrl')) companyUpdateData.portalUrl = parsed.data.portalUrl ?? null
    if (hasField('tinNo')) companyUpdateData.tin = parsed.data.tinNo ?? null
    if (hasField('sssNo')) companyUpdateData.sssRegistrationNo = parsed.data.sssNo ?? null
    if (hasField('philhealthNo')) companyUpdateData.philhealthNo = parsed.data.philhealthNo ?? null
    if (hasField('pagibigNo')) companyUpdateData.pagibigNo = parsed.data.pagibigNo ?? null
    if (hasField('birNo')) companyUpdateData.birNo = parsed.data.birNo ?? null

    if (hasField('logoUrl')) {
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
      companyUpdateData.logoUrl = nextLogoUrl ?? null
    }

    if (companyFieldSupported('fingerprintRequired') && hasField('fingerprintRequired')) {
      companyUpdateData.fingerprintRequired = parsed.data.fingerprintRequired
    }
    if (companyFieldSupported('selfieRequired') && hasField('selfieRequired')) {
      companyUpdateData.selfieRequired = parsed.data.selfieRequired
    }
    if (companyFieldSupported('screenCaptureEnabled') && hasField('screenCaptureEnabled')) {
      companyUpdateData.screenCaptureEnabled = isScreenCaptureEntitled
        ? parsed.data.screenCaptureEnabled
        : false
    }
    if (companyFieldSupported('screenCaptureFrequencyMinutes') && hasField('screenCaptureFrequencyMinutes')) {
      companyUpdateData.screenCaptureFrequencyMinutes = parsed.data.screenCaptureFrequencyMinutes
    }
    if (companyFieldSupported('geofenceEnabled') && hasField('geofenceEnabled')) {
      companyUpdateData.geofenceEnabled = parsed.data.geofenceEnabled
    }
    if (companyFieldSupported('geofenceLat') && hasField('geofenceLat')) {
      companyUpdateData.geofenceLat = parsed.data.geofenceLat ?? null
    }
    if (companyFieldSupported('geofenceLng') && hasField('geofenceLng')) {
      companyUpdateData.geofenceLng = parsed.data.geofenceLng ?? null
    }
    if (companyFieldSupported('geofenceRadiusMeters') && hasField('geofenceRadiusMeters')) {
      companyUpdateData.geofenceRadiusMeters = parsed.data.geofenceRadiusMeters ?? null
    }
    if (companyFieldSupported('defaultBreakMinutes') && hasField('defaultBreakMinutes')) {
      companyUpdateData.defaultBreakMinutes = requestedDefaultBreakMinutes
    }

    // Career page branding
    if (companyFieldSupported('careerBannerUrl') && 'careerBannerUrl' in parsed.data) {
      const rawBanner = parsed.data.careerBannerUrl ?? null
      if (typeof rawBanner === 'string' && isDataImageUrl(rawBanner)) {
        try {
          companyUpdateData.careerBannerUrl = await persistBanner(ctx.companyId, rawBanner)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Banner upload failed'
          return NextResponse.json({ error: msg }, { status: 400 })
        }
      } else {
        companyUpdateData.careerBannerUrl = rawBanner
      }
    }
    if (companyFieldSupported('careerTagline') && hasField('careerTagline')) companyUpdateData.careerTagline = parsed.data.careerTagline ?? null
    if (companyFieldSupported('careerDescription') && hasField('careerDescription')) companyUpdateData.careerDescription = parsed.data.careerDescription ?? null
    if (companyFieldSupported('careerSocialFacebook') && hasField('careerSocialFacebook')) companyUpdateData.careerSocialFacebook = parsed.data.careerSocialFacebook ?? null
    if (companyFieldSupported('careerSocialLinkedin') && hasField('careerSocialLinkedin')) companyUpdateData.careerSocialLinkedin = parsed.data.careerSocialLinkedin ?? null
    if (companyFieldSupported('careerSocialTwitter') && hasField('careerSocialTwitter')) companyUpdateData.careerSocialTwitter = parsed.data.careerSocialTwitter ?? null
    if (companyFieldSupported('careerSocialInstagram') && hasField('careerSocialInstagram')) companyUpdateData.careerSocialInstagram = parsed.data.careerSocialInstagram ?? null

    const updated = await prisma.company.update({
      where: { id: ctx.companyId },
      data: companyUpdateData,
    })

    if (requestedDefaultBreakMinutes !== undefined && !companyFieldSupported('defaultBreakMinutes')) {
      await writeCompanyDefaultBreakMinutes(ctx.companyId, requestedDefaultBreakMinutes)
    }

    const defaultBreakMinutes = requestedDefaultBreakMinutes ?? await readCompanyDefaultBreakMinutes(ctx.companyId)

    return NextResponse.json({
      ...updated,
      defaultBreakMinutes,
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
