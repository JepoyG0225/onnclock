import { NextRequest, NextResponse } from 'next/server'
// Import the parser implementation directly. The package entry point contains
// demo code that Turbopack can mistakenly execute while evaluating the route.
import pdf from 'pdf-parse/lib/pdf-parse.js'
import WordExtractor from 'word-extractor'
import { requireAuth } from '@/lib/api-auth'
import { requireHrisProApi } from '@/lib/hris-pro'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const allowedExtensions = new Set(['pdf', 'doc', 'docx'])

export async function POST(request: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error
  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Select a PDF or Word document.' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'The document must be 10 MB or smaller.' }, { status: 413 })
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!allowedExtensions.has(extension)) return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are supported.' }, { status: 415 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    let content = ''
    if (extension === 'pdf') {
      content = (await pdf(buffer)).text
    } else {
      const document = await new WordExtractor().extract(buffer)
      content = document.getBody()
    }
    content = content.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
    if (content.length < 10) return NextResponse.json({ error: 'No editable text could be extracted. Scanned PDFs need OCR before upload.' }, { status: 422 })
    return NextResponse.json({ content, fileName: file.name.replace(/\.(pdf|docx?)$/i, '') })
  } catch {
    return NextResponse.json({ error: 'The document could not be converted. It may be encrypted, scanned, or damaged.' }, { status: 422 })
  }
}
