import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!
const VERIFY_TOKEN      = process.env.FACEBOOK_VERIFY_TOKEN!
const PAGE_ID           = process.env.FACEBOOK_PAGE_ID ?? ''

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── System prompt — OnClock knowledge base ──────────────────────────────────

const SYSTEM_PROMPT = `You are the friendly and professional customer support assistant for OnClock PH — a Philippine HR and Payroll Management System available at onclockph.com.

Your job is to answer questions from potential customers and existing users who message the OnClock Facebook page.

## About OnClock
OnClock is a cloud-based HR & Payroll platform built exclusively for Philippine businesses. It automates timekeeping, payroll computation, and government compliance.

Website: https://onclockph.com
Sign up: https://onclockph.com/register
Sign in: https://onclockph.com/login
Contact: hello@onclock.ph

## Pricing
- Free 14-day trial, no credit card required
- Plans start at ₱50/seat/month
- Upgrades available from the Billing settings inside the platform

## Key Features
**Attendance & Time**
- Biometric clock-in/out via fingerprint or Face ID (WebAuthn, no hardware needed)
- GPS Geofencing — employees can only clock in within your office radius
- Live attendance map — see who's clocked in and where in real time
- Daily Time Records (DTR) with full audit trail
- Overtime filing and approval workflow
- Time correction requests
- Biometric device integration

**Payroll**
- Automated payroll runs: semi-monthly, monthly, weekly, or daily
- Handles OT, night differential, absences, tardiness, holiday pay
- 13th month pay computation (DOLE compliant, pro-rated for new hires)
- Tax annualization and BIR Form 2316 generation
- Payslips downloadable by employees from their portal
- Payroll disbursement directly to employee bank accounts via InstaPay and PesoNet

**Government Compliance**
- BIR: Alphalist, 1601-C, Form 2316
- SSS: R3 Contribution Report
- PhilHealth: RF-1 Remittance
- Pag-IBIG: MCRF Contribution
- All reports correctly formatted, ready to submit

**Leave Management**
- Multiple leave types (vacation, sick, emergency, etc.)
- Accrual rules and carry-over settings
- Approval workflow via manager
- Leave balances visible to employees in real time

**Loans & Finance**
- SSS, Pag-IBIG, and in-house loans tracked with auto-deduction from payroll
- Cash advance requests filed through employee portal

**People & HR**
- Recruitment and applicant tracking system (ATS)
- Onboarding and offboarding checklists
- Performance reviews and KPI tracking
- Disciplinary records management
- Employee 201 files (digital, paperless)
- Org chart (auto-generated)
- Asset management

**Employee Self-Service Portal**
- Accessible from any phone browser — no app install needed
- Clock in/out, view payslips, file leaves, check balances, request time corrections

**Desktop App**
- Available for Windows and macOS
- Admin desktop app for HR managers
- PIN-based quick login after first setup

## How to get started
1. Go to https://onclockph.com/register
2. Create a free company account (14-day trial)
3. Add employees and configure settings
4. Employees enroll fingerprint from their phone — takes 30 seconds

## Response Guidelines
- Be warm, helpful, and concise
- Answer in the same language the user writes in (Filipino/Tagalog or English)
- If asked about pricing details beyond what's above, direct them to the website or suggest they start the free trial
- If you genuinely don't know something specific (e.g. a very technical or account-specific question), say you'll connect them with the team and provide hello@onclock.ph
- Keep replies short and conversational — this is Messenger, not email
- Never make up features or pricing that aren't listed above
- If someone wants to sign up, send them to: https://onclockph.com/register`

// ─── Send a message back to the user via Messenger ───────────────────────────

async function sendMessage(recipientId: string, text: string) {
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  })
}

// ─── Generate AI reply ────────────────────────────────────────────────────────

async function generateReply(userMessage: string): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    const block = msg.content[0]
    return block.type === 'text' ? block.text : "Hi! Thanks for reaching out. For assistance, please email us at hello@onclock.ph."
  } catch {
    return "Hi! Thanks for your message. Our team will get back to you shortly. You can also reach us at hello@onclock.ph. 😊"
  }
}

// ─── GET — webhook verification ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[FB webhook] Verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }
  console.log(`[FB webhook] Verification failed — received token: ${token}`)
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST — incoming messages ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.object !== 'page') {
    return NextResponse.json({ status: 'ignored' })
  }

  const entries = (body.entry as Array<{ messaging?: Array<{
    sender: { id: string }
    recipient: { id: string }
    message?: { text?: string; is_echo?: boolean }
    postback?: { payload: string; title: string }
  }>}>) ?? []

  // Process in background — respond 200 immediately so Facebook doesn't retry
  void (async () => {
    for (const entry of entries) {
      for (const event of entry.messaging ?? []) {
        // Skip echo messages (sent by the page itself)
        if (event.message?.is_echo) continue

        // Skip messages sent by the page
        const senderId = event.sender.id
        if (PAGE_ID && senderId === PAGE_ID) continue
        const text = event.message?.text ?? event.postback?.title

        if (!text) continue

        console.log(`[FB webhook] Message from ${senderId}: ${text}`)

        const reply = await generateReply(text)
        await sendMessage(senderId, reply)

        console.log(`[FB webhook] Replied to ${senderId}`)
      }
    }
  })()

  return NextResponse.json({ status: 'ok' })
}
