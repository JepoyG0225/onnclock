/**
 * AI HR Assistant — Nexa (Pro feature)
 *
 * Uses Anthropic tool use so Nexa can query live company records
 * (employees, payroll, leaves, attendance, loans) and answer questions
 * about them accurately instead of relying solely on a static prompt.
 *
 * Tool flow:
 *   1. First call includes tool definitions + company context system prompt.
 *   2. If the model returns tool_use blocks, we execute each tool against
 *      Prisma and append a tool_result turn.
 *   3. We loop up to MAX_TOOL_ROUNDS until the model produces a text reply.
 */
import { prisma } from '@/lib/prisma'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL     = 'claude-sonnet-4-5'
const MAX_TOOL_ROUNDS   = 4   // guard against infinite loops

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

// ─── Tool definitions (sent to Anthropic) ────────────────────────────────────

const HR_TOOLS = [
  {
    name: 'search_employees',
    description:
      'Search or list company employees. Use this whenever asked about who works here, headcount by department/position, or to find a specific person by name.',
    input_schema: {
      type: 'object',
      properties: {
        name:           { type: 'string',  description: 'Partial name to search (first or last name)' },
        department:     { type: 'string',  description: 'Filter by department name' },
        position:       { type: 'string',  description: 'Filter by position/job title' },
        includeInactive:{ type: 'boolean', description: 'Include inactive/resigned employees (default false)' },
      },
    },
  },
  {
    name: 'get_employee_details',
    description:
      'Get comprehensive details for a single employee: personal info, salary, position, leave balances, active loans, recent payslips.',
    input_schema: {
      type: 'object',
      properties: {
        employeeNo: { type: 'string', description: 'Exact employee number (e.g. EMP-001)' },
        name:       { type: 'string', description: 'Employee name to look up (will match first/last)' },
      },
    },
  },
  {
    name: 'get_payroll_summary',
    description:
      'Retrieve recent payroll runs with gross pay, deductions, net pay and employee count.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many recent runs to return (default 5, max 10)' },
      },
    },
  },
  {
    name: 'get_leave_requests',
    description:
      'Fetch leave requests. Can filter by status and/or employee name.',
    input_schema: {
      type: 'object',
      properties: {
        status:       { type: 'string', enum: ['PENDING','APPROVED','REJECTED','ALL'], description: 'Leave status filter (default PENDING)' },
        employeeName: { type: 'string', description: 'Filter by employee name' },
        limit:        { type: 'number', description: 'Max records (default 20)' },
      },
    },
  },
  {
    name: 'get_attendance_today',
    description:
      'Get today\'s time-in/out records — who has clocked in, who hasn\'t, total count.',
    input_schema: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Filter by department (optional)' },
      },
    },
  },
  {
    name: 'get_loans',
    description:
      'List employee loans (SSS loan, Pag-IBIG loan, company loan, cash advance).',
    input_schema: {
      type: 'object',
      properties: {
        employeeName: { type: 'string', description: 'Filter by employee name' },
        status:       { type: 'string', enum: ['ACTIVE','PAID','ALL'], description: 'Loan status (default ACTIVE)' },
      },
    },
  },
  {
    name: 'get_departments',
    description:
      'List all departments with their headcount.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  companyId: string,
): Promise<string> {
  try {
    switch (name) {

      case 'search_employees': {
        const nameQ  = (input.name       as string | undefined)?.trim()
        const deptQ  = (input.department as string | undefined)?.trim()
        const posQ   = (input.position   as string | undefined)?.trim()
        const incInactive = Boolean(input.includeInactive)

        const employees = await prisma.employee.findMany({
          where: {
            companyId,
            isActive: incInactive ? undefined : true,
            ...(nameQ ? {
              OR: [
                { firstName: { contains: nameQ, mode: 'insensitive' } },
                { lastName:  { contains: nameQ, mode: 'insensitive' } },
              ],
            } : {}),
            ...(deptQ ? { department: { name: { contains: deptQ, mode: 'insensitive' } } } : {}),
            ...(posQ  ? { position:   { title: { contains: posQ,  mode: 'insensitive' } } } : {}),
          },
          select: {
            employeeNo:       true,
            firstName:        true,
            lastName:         true,
            employmentStatus: true,
            employmentType:   true,
            hireDate:         true,
            isActive:         true,
            basicSalary:      true,
            rateType:         true,
            department:       { select: { name: true } },
            position:         { select: { title: true } },
          },
          orderBy: { lastName: 'asc' },
          take: 80,
        })

        if (!employees.length) return 'No employees found matching the criteria.'

        const rows = employees.map(e =>
          `${e.employeeNo} | ${e.firstName} ${e.lastName} | ${e.position?.title ?? '—'} | ${e.department?.name ?? '—'} | ₱${Number(e.basicSalary).toLocaleString()} ${e.rateType.toLowerCase()} | ${e.employmentStatus} | ${e.isActive ? 'Active' : 'Inactive'}`
        )
        return `Employees (${employees.length}):\nNo | Name | Position | Department | Salary | Status | Active\n${rows.join('\n')}`
      }

      case 'get_employee_details': {
        const empNo = (input.employeeNo as string | undefined)?.trim()
        const nameQ = (input.name       as string | undefined)?.trim()

        const emp = await prisma.employee.findFirst({
          where: {
            companyId,
            ...(empNo ? { employeeNo: { equals: empNo, mode: 'insensitive' } } : {}),
            ...(nameQ && !empNo ? {
              OR: [
                { firstName: { contains: nameQ, mode: 'insensitive' } },
                { lastName:  { contains: nameQ, mode: 'insensitive' } },
              ],
            } : {}),
          },
          select: {
            id:               true,
            employeeNo:       true,
            firstName:        true,
            lastName:         true,
            workEmail:        true,
            mobileNo:         true,
            employmentStatus: true,
            employmentType:   true,
            hireDate:         true,
            basicSalary:      true,
            rateType:         true,
            isActive:         true,
            department:       { select: { name: true } },
            position:         { select: { title: true } },
            leaveBalances: {
              select: {
                entitled:  true,
                used:      true,
                pending:   true,
                leaveType: { select: { name: true, code: true } },
              },
            },
            loans: {
              where:  { status: 'ACTIVE' },
              select: { loanType: true, balance: true, monthlyAmortization: true },
            },
            payslips: {
              orderBy: { createdAt: 'desc' },
              take:    3,
              select:  { grossPay: true, totalDeductions: true, netPay: true, createdAt: true },
            },
          },
        })

        if (!emp) return `No employee found matching "${empNo ?? nameQ}".`

        const lines = [
          `Employee: ${emp.firstName} ${emp.lastName} (${emp.employeeNo})`,
          `Position: ${emp.position?.title ?? '—'} | Department: ${emp.department?.name ?? '—'}`,
          `Status: ${emp.employmentStatus} / ${emp.employmentType} | Hired: ${emp.hireDate?.toLocaleDateString('en-PH')}`,
          `Salary: ₱${Number(emp.basicSalary).toLocaleString()} ${emp.rateType.toLowerCase()} | Active: ${emp.isActive ? 'Yes' : 'No'}`,
          `Email: ${emp.workEmail ?? '—'} | Mobile: ${emp.mobileNo ?? '—'}`,
        ]

        if (emp.leaveBalances.length) {
          lines.push('\nLeave Balances:')
          emp.leaveBalances.forEach(lb => {
            const remaining = Number(lb.entitled) - Number(lb.used) - Number(lb.pending)
            lines.push(`  ${lb.leaveType.name}: ${remaining.toFixed(1)} days remaining (entitled ${Number(lb.entitled)}, used ${Number(lb.used)})`)
          })
        }

        if (emp.loans.length) {
          lines.push('\nActive Loans:')
          emp.loans.forEach(l => lines.push(`  ${l.loanType}: balance ₱${Number(l.balance).toLocaleString()}, amortization ₱${Number(l.monthlyAmortization).toLocaleString()}/mo`))
        }

        if (emp.payslips.length) {
          lines.push('\nRecent Payslips:')
          emp.payslips.forEach(p => lines.push(
            `  ${new Date(p.createdAt).toLocaleDateString('en-PH')}: Gross ₱${Number(p.grossPay).toLocaleString()} | Deductions ₱${Number(p.totalDeductions).toLocaleString()} | Net ₱${Number(p.netPay).toLocaleString()}`
          ))
        }

        return lines.join('\n')
      }

      case 'get_payroll_summary': {
        const limit = Math.min(10, Number(input.limit ?? 5) || 5)
        const runs = await prisma.payrollRun.findMany({
          where:   { companyId },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          select: {
            periodLabel:     true,
            status:          true,
            totalGross:      true,
            totalDeductions: true,
            totalNetPay:     true,
            createdAt:       true,
            _count:          { select: { payslips: true } },
          },
        })

        if (!runs.length) return 'No payroll runs found.'

        const rows = runs.map(r =>
          `${r.periodLabel} | ${r.status} | ${r._count.payslips} employees | Gross ₱${Number(r.totalGross).toLocaleString()} | Deductions ₱${Number(r.totalDeductions).toLocaleString()} | Net ₱${Number(r.totalNetPay).toLocaleString()} | ${new Date(r.createdAt).toLocaleDateString('en-PH')}`
        )
        return `Payroll Runs (${runs.length}):\nPeriod | Status | Employees | Gross | Deductions | Net Pay | Date\n${rows.join('\n')}`
      }

      case 'get_leave_requests': {
        const status    = (input.status as string | undefined) ?? 'PENDING'
        const nameQ     = (input.employeeName as string | undefined)?.trim()
        const limit     = Math.min(50, Number(input.limit ?? 20) || 20)

        const leaves = await prisma.leaveRequest.findMany({
          where: {
            employee: {
              companyId,
              ...(nameQ ? {
                OR: [
                  { firstName: { contains: nameQ, mode: 'insensitive' } },
                  { lastName:  { contains: nameQ, mode: 'insensitive' } },
                ],
              } : {}),
            },
            ...(status !== 'ALL' ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          select: {
            status:    true,
            startDate: true,
            endDate:   true,
            totalDays: true,
            reason:    true,
            createdAt: true,
            employee:  { select: { firstName: true, lastName: true, employeeNo: true } },
            leaveType: { select: { name: true } },
          },
        })

        if (!leaves.length) return `No leave requests found (status: ${status}).`

        const rows = leaves.map(l =>
          `${l.employee.firstName} ${l.employee.lastName} (${l.employee.employeeNo}) | ${l.leaveType.name} | ${l.startDate.toLocaleDateString('en-PH')} – ${l.endDate.toLocaleDateString('en-PH')} (${Number(l.totalDays)}d) | ${l.status}${l.reason ? ` | Reason: ${l.reason}` : ''}`
        )
        return `Leave Requests — ${status} (${leaves.length}):\nEmployee | Type | Dates | Status\n${rows.join('\n')}`
      }

      case 'get_attendance_today': {
        const deptQ   = (input.department as string | undefined)?.trim()
        const phNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
        const todayPH = new Date(phNow.getFullYear(), phNow.getMonth(), phNow.getDate())
        const tomorrowPH = new Date(todayPH.getTime() + 86400000)

        const records = await prisma.dTRRecord.findMany({
          where: {
            date: { gte: todayPH, lt: tomorrowPH },
            employee: {
              companyId,
              isActive: true,
              ...(deptQ ? { department: { name: { contains: deptQ, mode: 'insensitive' } } } : {}),
            },
          },
          select: {
            timeIn:      true,
            timeOut:     true,
            lateMinutes: true,
            employee: {
              select: {
                firstName:  true,
                lastName:   true,
                employeeNo: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { timeIn: 'asc' },
          take: 100,
        })

        // Employees who haven't clocked in
        const activeCount = await prisma.employee.count({
          where: {
            companyId, isActive: true,
            ...(deptQ ? { department: { name: { contains: deptQ, mode: 'insensitive' } } } : {}),
          },
        })
        const clockedInCount  = records.filter(r => r.timeIn).length
        const notClockedCount = activeCount - clockedInCount

        const rows = records.map(r =>
          `${r.employee.firstName} ${r.employee.lastName} (${r.employee.employeeNo}) | ${r.employee.department?.name ?? '—'} | In: ${r.timeIn ? new Date(r.timeIn).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'} | Out: ${r.timeOut ? new Date(r.timeOut).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : 'Still in'} | ${(r.lateMinutes ?? 0) > 0 ? `LATE ${r.lateMinutes}min` : 'On time'}`
        )

        return [
          `Today's Attendance (${todayPH.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}):`,
          `Clocked in: ${clockedInCount} / ${activeCount} active employees (${notClockedCount} not yet in)`,
          '',
          ...(rows.length ? [`Records:\n${rows.join('\n')}`] : ['No records yet.']),
        ].join('\n')
      }

      case 'get_loans': {
        const nameQ  = (input.employeeName as string | undefined)?.trim()
        const statusRaw = (input.status as string | undefined) ?? 'ACTIVE'
        // Map 'PAID' → 'FULLY_PAID' for convenience
        const statusMapped = statusRaw === 'PAID' ? 'FULLY_PAID' : statusRaw

        const loans = await prisma.employeeLoan.findMany({
          where: {
            companyId,
            ...(statusMapped !== 'ALL' ? { status: statusMapped as 'ACTIVE' | 'FULLY_PAID' | 'CANCELLED' } : {}),
            ...(nameQ ? {
              employee: {
                OR: [
                  { firstName: { contains: nameQ, mode: 'insensitive' } },
                  { lastName:  { contains: nameQ, mode: 'insensitive' } },
                ],
              },
            } : {}),
          },
          select: {
            loanType:            true,
            principalAmount:     true,
            balance:             true,
            monthlyAmortization: true,
            status:              true,
            startDate:           true,
            employee: { select: { firstName: true, lastName: true, employeeNo: true } },
          },
          orderBy: { startDate: 'desc' },
          take: 50,
        })

        if (!loans.length) return `No loans found (status: ${statusRaw}).`

        const rows = loans.map(l =>
          `${l.employee.firstName} ${l.employee.lastName} (${l.employee.employeeNo}) | ${l.loanType} | Principal ₱${Number(l.principalAmount).toLocaleString()} | Balance ₱${Number(l.balance).toLocaleString()} | ₱${Number(l.monthlyAmortization).toLocaleString()}/mo | ${l.status}`
        )
        return `Loans — ${statusRaw} (${loans.length}):\nEmployee | Type | Principal | Balance | Amortization | Status\n${rows.join('\n')}`
      }

      case 'get_departments': {
        const depts = await prisma.department.findMany({
          where: { companyId },
          select: {
            name:      true,
            _count:    { select: { employees: true } },
          },
          orderBy: { name: 'asc' },
        })

        if (!depts.length) return 'No departments found.'
        const rows = depts.map(d => `  ${d.name}: ${d._count.employees} employee(s)`)
        return `Departments (${depts.length}):\n${rows.join('\n')}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    console.error(`[nexa-tool:${name}]`, err)
    return `Tool "${name}" encountered an error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

export async function buildSystemPromptForCompany(companyId: string): Promise<string> {
  const [company, payrollConfig, leaveTypes, employeeCount] = await Promise.all([
    prisma.company.findUnique({
      where:  { id: companyId },
      select: { name: true, industry: true, timezone: true },
    }),
    prisma.payrollCycleConfig.findUnique({
      where:  { companyId },
      select: {
        payFrequency:           true,
        firstCutoffStartDay:    true,
        firstCutoffEndDay:      true,
        secondCutoffStartDay:   true,
        secondCutoffEndDay:     true,
        enableOvertime:         true,
        enableNightDifferential:true,
        nightDifferentialStart: true,
        nightDifferentialEnd:   true,
        nightDifferentialRate:  true,
      },
    }),
    prisma.leaveType.findMany({
      where:  { companyId, isActive: true },
      select: { name: true, code: true, isWithPay: true, daysEntitled: true },
    }),
    prisma.employee.count({ where: { companyId, isActive: true } }),
  ])

  const lines: string[] = []
  lines.push(`You are Nexa, an AI HR assistant for "${company?.name ?? 'this company'}"${company?.industry ? ` (${company.industry})` : ''}.`)
  lines.push(`You help HR staff and employees with questions about their company's records AND about Philippine labor law, payroll, and HR policy.`)
  lines.push(`You have access to live company data through tools — use them proactively whenever someone asks about specific employees, payroll figures, attendance, leaves, or loans.`)
  lines.push(`Current active headcount: ${employeeCount}`)
  lines.push('')

  if (payrollConfig) {
    lines.push(`Pay frequency: ${payrollConfig.payFrequency}`)
    if (payrollConfig.payFrequency === 'SEMI_MONTHLY') {
      lines.push(`Cutoffs: day ${payrollConfig.firstCutoffStartDay}–${payrollConfig.firstCutoffEndDay} and ${payrollConfig.secondCutoffStartDay}–${payrollConfig.secondCutoffEndDay}`)
    }
    if (payrollConfig.enableNightDifferential) {
      lines.push(`Night differential: ${payrollConfig.nightDifferentialStart}–${payrollConfig.nightDifferentialEnd} @ ${Number(payrollConfig.nightDifferentialRate)}x`)
    }
    lines.push(`Overtime enabled: ${payrollConfig.enableOvertime ? 'yes' : 'no'}`)
    lines.push('')
  }

  if (leaveTypes.length) {
    lines.push('Leave types:')
    for (const lt of leaveTypes) {
      lines.push(`  ${lt.name} (${lt.code}): ${Number(lt.daysEntitled)} days/yr, ${lt.isWithPay ? 'with pay' : 'no pay'}`)
    }
    lines.push('')
  }

  lines.push('Philippine statutory reference:')
  lines.push('- SSS (2024+): employee 5%, employer 10%, MSC ₱5k–₱35k.')
  lines.push('- PhilHealth (2024+): 5% premium 50/50, MSC ₱10k–₱100k.')
  lines.push('- Pag-IBIG (2026+): 2%/2%, capped ₱200 each (₱10k ceiling).')
  lines.push('- 13th month: mandatory, ≥1/12 basic earned, due Dec 24. First ₱90k tax-exempt.')
  lines.push('- BIR TRAIN brackets: ₱0–250k 0% / ₱250–400k 15% / ₱400–800k 20%+₱22.5k / ₱800k–2M 25%+₱102.5k / >₱2M 30–35%')
  lines.push('- OT: +25% regular day, +30% rest/special, +100% regular holiday. Night diff: +10% (10pm–6am).')
  lines.push('- Resignation notice: 30 days (DOLE). Probation max: 6 months.')
  lines.push('')
  lines.push('Style: concise, friendly, accurate. When citing law name the source (DOLE, BIR, SSS). For ambiguous internal policy questions, use tools to check actual records or say "check with HR."')

  return lines.join('\n')
}

// ─── Anthropic caller with tool-use loop ─────────────────────────────────────

export async function askAnthropic(opts: {
  systemPrompt: string
  messages:     ChatMessage[]
  companyId:    string
  maxTokens?:   number
  model?:       string
}): Promise<AssistantReply> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim().replace(/^"|"$/g, '')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const model     = opts.model ?? DEFAULT_MODEL
  const maxTokens = opts.maxTokens ?? 1536

  // We maintain a mutable messages array in the Anthropic multi-turn format
  // (content blocks, not just strings) to support tool-result turns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentMessages: any[] = opts.messages.map(m => ({ role: m.role, content: m.content }))

  let lastTextReply = ''
  let lastModel     = model
  let totalInput    = 0
  let totalOutput   = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system:     opts.systemPrompt,
        tools:      HR_TOOLS,
        messages:   currentMessages,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 400)}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    lastModel   = data.model ?? model
    totalInput  += data.usage?.input_tokens  ?? 0
    totalOutput += data.usage?.output_tokens ?? 0

    const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> =
      data.content ?? []

    // Collect any text content
    const textParts = content.filter(c => c.type === 'text' && c.text).map(c => c.text as string)
    if (textParts.length) lastTextReply = textParts.join('\n').trim()

    // If no tool calls, we're done
    const toolUseBlocks = content.filter(c => c.type === 'tool_use')
    if (!toolUseBlocks.length || data.stop_reason !== 'tool_use') break

    // Append the assistant's tool_use turn
    currentMessages.push({ role: 'assistant', content })

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async block => {
        const result = await executeTool(
          block.name!,
          (block.input ?? {}) as Record<string, unknown>,
          opts.companyId,
        )
        return {
          type:        'tool_result',
          tool_use_id: block.id,
          content:     result,
        }
      })
    )

    // Append tool results as a user turn
    currentMessages.push({ role: 'user', content: toolResults })
  }

  return {
    text:         lastTextReply || '(no response)',
    model:        lastModel,
    inputTokens:  totalInput,
    outputTokens: totalOutput,
  }
}
