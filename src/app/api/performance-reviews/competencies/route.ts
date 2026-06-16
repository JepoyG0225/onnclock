import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_COMPETENCIES } from '@/lib/performance/competencies'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

interface CompetencyDTO {
  id: string
  key: string
  label: string
  description: string | null
  sortOrder: number
  isActive: boolean
}

function slugify(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return base || 'competency'
}

// Seed the editable defaults the first time a company touches its library.
async function ensureSeeded(companyId: string) {
  const count = await prisma.performanceCompetency.count({ where: { companyId } })
  if (count > 0) return
  await prisma.performanceCompetency.createMany({
    data: DEFAULT_COMPETENCIES.map((c, i) => ({
      companyId, key: c.key, label: c.label, description: c.description, sortOrder: i,
    })),
    skipDuplicates: true,
  })
}

// GET — any authenticated company user (reviewers/employees need labels too).
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  try {
    await ensureSeeded(ctx.companyId)
    const rows = await prisma.performanceCompetency.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    const competencies: CompetencyDTO[] = rows.map(r => ({
      id: r.id, key: r.key, label: r.label, description: r.description, sortOrder: r.sortOrder, isActive: r.isActive,
    }))
    return NextResponse.json({ competencies })
  } catch (err) {
    // Table not migrated yet — fall back to virtual defaults so scorecards
    // still render. Mutations will surface the real error once attempted.
    console.error('[performance competencies GET] falling back to defaults', err)
    const competencies: CompetencyDTO[] = DEFAULT_COMPETENCIES.map((c, i) => ({
      id: c.key, key: c.key, label: c.label, description: c.description, sortOrder: i, isActive: true,
    }))
    return NextResponse.json({ competencies })
  }
}

// POST — create a competency (HR only).
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error
  await ensureSeeded(ctx.companyId)

  const { label, description } = (await req.json()) as { label?: string; description?: string | null }
  if (!label || !label.trim()) {
    return NextResponse.json({ error: 'Label is required' }, { status: 422 })
  }

  // Generate a stable unique key (used as the competencyScores JSON key).
  const existing = await prisma.performanceCompetency.findMany({
    where: { companyId: ctx.companyId }, select: { key: true, sortOrder: true },
  })
  const taken = new Set(existing.map(e => e.key))
  let key = slugify(label)
  if (taken.has(key)) {
    let n = 2
    while (taken.has(`${key}-${n}`)) n++
    key = `${key}-${n}`
  }
  const maxOrder = existing.reduce((m, e) => Math.max(m, e.sortOrder), -1)

  const created = await prisma.performanceCompetency.create({
    data: {
      companyId: ctx.companyId,
      key,
      label: label.trim(),
      description: description?.trim() || null,
      sortOrder: maxOrder + 1,
    },
  })
  return NextResponse.json({ competency: created })
}

// PATCH — edit a competency, or reorder the whole list (HR only).
export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const body = (await req.json()) as {
    id?: string
    label?: string
    description?: string | null
    isActive?: boolean
    reorder?: string[]
  }

  // Bulk reorder: array of ids in the desired order.
  if (Array.isArray(body.reorder)) {
    await prisma.$transaction(
      body.reorder.map((id, i) =>
        prisma.performanceCompetency.updateMany({
          where: { id, companyId: ctx.companyId },
          data: { sortOrder: i },
        }),
      ),
    )
    return NextResponse.json({ ok: true })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const data: Record<string, unknown> = {}
  if (body.label !== undefined) {
    if (!body.label.trim()) return NextResponse.json({ error: 'Label cannot be empty' }, { status: 422 })
    data.label = body.label.trim()
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.isActive !== undefined) data.isActive = body.isActive

  const result = await prisma.performanceCompetency.updateMany({
    where: { id: body.id, companyId: ctx.companyId },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE — soft-delete (isActive=false) so historical reviews keep their label.
export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.performanceCompetency.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { isActive: false },
  })
  return NextResponse.json({ ok: true })
}
