/**
 * Helpers for the AI HR Assistant (Pro feature).
 *
 * - Builds a system prompt scoped to a single company so the LLM has
 *   accurate context (company name, leave types, payroll cadence, etc.)
 *   when answering HR questions.
 * - Calls Anthropic's Messages API via raw fetch (no SDK dep needed).
 *
 * Required env var:
 *   ANTHROPIC_API_KEY    — server-side only; never expose to the client
 *
 * Model defaults to claude-sonnet-4-5 — fast, capable, and cost-efficient
 * for chat-style HR Q&A.
 */
import { prisma } from '@/lib/prisma'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-5'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantReply {
  text: string
  model: string
  inputTokens?: number
  outputTokens?: number
}

/**
 * Build a company-scoped system prompt. Includes the company name,
 * the active leave types, payroll cadence, headcount, and a short
 * Philippine-HR knowledge primer so answers are policy-accurate.
 *
 * Intentionally compact — sub-1k tokens — to keep responses fast.
 */
export async function buildSystemPromptForCompany(companyId: string): Promise<string> {
  // Run lookups in parallel — each is a small, narrow select.
  const [company, payrollConfig, leaveTypes, employeeCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, industry: true, timezone: true },
    }),
    prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: {
        payFrequency: true,
        firstCutoffStartDay: true,
        firstCutoffEndDay: true,
        secondCutoffStartDay: true,
        secondCutoffEndDay: true,
        enableOvertime: true,
        enableNightDifferential: true,
        nightDifferentialStart: true,
        nightDifferentialEnd: true,
        nightDifferentialRate: true,
      },
    }),
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      select: { name: true, code: true, isWithPay: true, daysEntitled: true },
    }),
    prisma.employee.count({ where: { companyId, isActive: true } }),
  ])

  const lines: string[] = []
  lines.push(`You are an AI HR assistant for "${company?.name ?? 'this company'}", a Philippine company${company?.industry ? ` in the ${company.industry} industry` : ''}.`)
  lines.push(`You help HR staff and employees with questions about Philippine labor law, company policies, payroll rules, leave benefits, and day-to-day HR tasks.`)
  lines.push('')
  lines.push(`Active headcount: ${employeeCount}`)

  if (payrollConfig) {
    lines.push(`Pay frequency: ${payrollConfig.payFrequency}`)
    if (payrollConfig.payFrequency === 'SEMI_MONTHLY') {
      lines.push(`Cutoffs: day ${payrollConfig.firstCutoffStartDay}–${payrollConfig.firstCutoffEndDay} and ${payrollConfig.secondCutoffStartDay}–${payrollConfig.secondCutoffEndDay}`)
    }
    if (payrollConfig.enableNightDifferential) {
      lines.push(`Night differential: ${payrollConfig.nightDifferentialStart}–${payrollConfig.nightDifferentialEnd}, rate ${Number(payrollConfig.nightDifferentialRate)}`)
    }
    lines.push(`Overtime enabled: ${payrollConfig.enableOvertime ? 'yes' : 'no'}`)
  }

  if (leaveTypes.length) {
    lines.push('')
    lines.push('Active leave types:')
    for (const lt of leaveTypes) {
      lines.push(`- ${lt.name} (${lt.code}): ${Number(lt.daysEntitled)} days/year, ${lt.isWithPay ? 'with pay' : 'without pay'}`)
    }
  }

  lines.push('')
  lines.push('Key Philippine HR knowledge (be precise — these are statutory):')
  lines.push('- SSS contribution table (2024+): employee 5%, employer 10%, MSC ₱5,000–₱35,000.')
  lines.push('- PhilHealth (2024+): 5% premium split 50/50, MSC ₱10,000–₱100,000.')
  lines.push('- Pag-IBIG (May 2026+): flat 2% employee / 2% employer, capped at ₱200 each (₱10,000 ceiling).')
  lines.push('- 13th-month pay: mandatory, ≥ 1/12 of total basic salary earned in the year, paid by Dec 24.')
  lines.push('- First ₱90,000 of 13th-month pay is income-tax exempt; excess taxable.')
  lines.push('- BIR Annualized Withholding Method (RR 2-98). Annual tax brackets (TRAIN Law):')
  lines.push('  ₱0–250k: 0% / ₱250k–400k: 15% / ₱400k–800k: 20% + ₱22,500 / ₱800k–2M: 25% + ₱102,500 / ₱2M–8M: 30% + ₱402,500 / >₱8M: 35% + ₱2,202,500')
  lines.push('- Service Incentive Leave: 5 days/year after 1 year of service, convertible to cash.')
  lines.push('- Overtime: regular day +25%, rest day/special non-working +30%, regular holiday +100%.')
  lines.push('- Night differential: +10% of hourly wage for hours worked 10pm–6am.')
  lines.push('- DOLE notice for resignation: 30 days. Probation period max: 6 months.')
  lines.push('')
  lines.push('Style: concise, accurate, friendly. When citing law, mention the issuing body (BIR, DOLE, SSS).')
  lines.push('When you are unsure or the question is outside Philippine HR/payroll, say so and ask for clarification.')
  lines.push('Never make up policies that are specific to this company — say "check with your HR team" if asked something that needs internal policy.')
  lines.push('Do not give personal legal advice or rulings — recommend consulting a licensed practitioner for specific cases.')

  return lines.join('\n')
}

/**
 * Call Anthropic's Messages API. Returns the assistant's reply text plus
 * usage info. Throws on auth/network/parse failures so the route can
 * surface a meaningful error.
 */
export async function askAnthropic(opts: {
  systemPrompt: string
  messages: ChatMessage[]
  maxTokens?: number
  model?: string
}): Promise<AssistantReply> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim().replace(/^"|"$/g, '')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const model = opts.model ?? DEFAULT_MODEL
  const body = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.systemPrompt,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 400)}`)
  }

  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
    model?: string
  }

  const text = (data.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim()

  return {
    text: text || '(no response)',
    model: data.model ?? model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  }
}
