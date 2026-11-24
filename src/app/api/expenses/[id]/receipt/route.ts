import { publicExpense, storedItems } from '@/lib/expenses/items'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { expenseAccess } from '@/lib/expenses/access'
import { receiptStorage, receiptMime, RECEIPT_LIMIT } from '@/lib/expenses/storage'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error, employeeId, canReadAll } = await expenseAccess()
  if (error || !ctx) return error!
  const { id } = await params
  const claim = await prisma.expenseClaim.findFirst({ where: { id, companyId: ctx.companyId, ...(!canReadAll ? { employeeId: employeeId ?? '__none__' } : { OR: [{ status: { not: 'DRAFT' as const } }, { employeeId: employeeId ?? '__none__' }] }) } })
  if (!claim) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 })
  const itemId = _req.nextUrl.searchParams.get('itemId')
  const item = itemId ? storedItems(claim.items).find(row => row.id === itemId) : null
  if (itemId && !item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 })
  const receipt = item ? { receiptPath: item.receiptPath, receiptFileName: item.receiptFileName, receiptUrl: null } : claim
  if (receipt.receiptPath) {
    if (!receipt.receiptPath.startsWith(`${ctx.companyId}/${id}/`)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 })
    const storage = await receiptStorage()
    const result = await storage.createSignedUrl(receipt.receiptPath, 60, { download: receipt.receiptFileName || 'receipt' })
    if (result.error) return NextResponse.json({ error: 'Could not open receipt.' }, { status: 503 })
    return new NextResponse(null, { status: 302, headers: { Location: result.data.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
  }
  // Existing legacy uploads are retained; new claims never accept external URLs.
  if (receipt.receiptUrl && /^https:\/\//.test(receipt.receiptUrl)) return new NextResponse(null, { status: 302, headers: { Location: receipt.receiptUrl, 'Cache-Control': 'private, no-store' } })
  return NextResponse.json({ error: 'No receipt attached.' }, { status: 404 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error, employeeId } = await expenseAccess()
  if (error || !ctx) return error!
  const { id } = await params
  const claim = await prisma.expenseClaim.findFirst({ where: { id, companyId: ctx.companyId, employeeId: employeeId ?? '__none__', status: { in: ['DRAFT', 'REJECTED'] } } })
  if (!claim) return NextResponse.json({ error: 'Only your draft or rejected claim can receive a receipt.' }, { status: 403 })
  const form = await req.formData().catch(() => null)
  const itemId = form?.get('itemId')
  const items = storedItems(claim.items)
  const item = typeof itemId === 'string' ? items.find(row => row.id === itemId) : null
  if ((items.length || itemId) && !item) return NextResponse.json({ error: 'Choose a valid expense item for this receipt.' }, { status: 422 })
  const file = form?.get('file')
  if (!(file instanceof File) || !file.size || file.size > RECEIPT_LIMIT) return NextResponse.json({ error: 'Choose a PDF, JPG, PNG or WEBP receipt up to 4 MB.' }, { status: 422 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = receiptMime(bytes)
  if (!mime) return NextResponse.json({ error: 'The receipt must contain a PDF or supported image.' }, { status: 422 })
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
  const path = `${ctx.companyId}/${id}/${randomUUID()}.${ext}`
  const storage = await receiptStorage()
  const uploaded = await storage.upload(path, bytes, { contentType: mime, upsert: false })
  if (uploaded.error) return NextResponse.json({ error: 'Receipt upload failed. Your draft is saved; please retry.' }, { status: 503 })
  try {
    const updated = await prisma.expenseClaim.updateMany({ where: { id, companyId: ctx.companyId, employeeId: employeeId!, status: claim.status, updatedAt: claim.updatedAt }, data: { ...(item ? { items: items.map(row => row.id === item.id ? { ...row, receiptPath: path, receiptFileName: file.name.slice(0,200) } : row) } : { receiptPath: path, receiptUrl: null, receiptFileName: file.name.slice(0,200) }), history: [...(Array.isArray(claim.history) ? claim.history : []), { action: 'RECEIPT_UPLOADED', ...(item ? { itemId: item.id } : {}), at: new Date().toISOString(), actor: ctx.email }] } })
    if (!updated.count) { await storage.remove([path]); return NextResponse.json({ error: 'Claim changed during upload. Refresh and try again.' }, { status: 409 }) }
  } catch (e) { await storage.remove([path]); throw e }
  const previousPath = item ? item.receiptPath : claim.receiptPath
  if (previousPath?.startsWith(`${ctx.companyId}/${id}/`)) await storage.remove([previousPath])
  const updated = await prisma.expenseClaim.findUniqueOrThrow({ where: { id } })
  return NextResponse.json({ success: true, claim: publicExpense(updated) })
}
