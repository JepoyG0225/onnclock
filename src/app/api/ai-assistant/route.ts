/**
 * AI HR Assistant — chat endpoint (Pro feature).
 *
 * POST /api/ai-assistant
 *   Body: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
 *   The route prepends a company-scoped system prompt and forwards the
 *   conversation to Anthropic. Returns the assistant reply plus model +
 *   token usage info.
 *
 * Access:
 *   - Requires authentication (any role — HR + employees can ask)
 *   - Pro-gated via requireHrisProOrTrialApi
 *   - Requires ANTHROPIC_API_KEY env var on the server
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { askAnthropic, buildSystemPromptForCompany, type ChatMessage } from '@/lib/ai/hr-assistant'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(8000),
  })).min(1).max(40),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const proGate = await requireHrisProOrTrialApi(ctx.companyId)
  if (proGate) return proGate

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  // Ensure the last message is from the user — the API requires that.
  const messages: ChatMessage[] = parsed.data.messages
  if (messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })
  }

  try {
    const systemPrompt = await buildSystemPromptForCompany(ctx.companyId)
    const reply = await askAnthropic({ systemPrompt, messages })
    return NextResponse.json({
      reply: reply.text,
      model: reply.model,
      usage: { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai-assistant] error', msg)
    // Hide internal details from clients but expose a useful hint for the
    // common "key missing" case.
    if (/ANTHROPIC_API_KEY/.test(msg)) {
      return NextResponse.json({
        error: 'AI Assistant is not configured. Ask your administrator to set ANTHROPIC_API_KEY.',
      }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI Assistant failed to respond. Please try again in a moment.' }, { status: 502 })
  }
}
