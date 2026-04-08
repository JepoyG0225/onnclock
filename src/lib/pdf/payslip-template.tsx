import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { registerPdfFonts } from './register-pdf-fonts'

registerPdfFonts()

// ─── Brand Colors ────────────────────────────────────────────────────────────
const ORANGE = '#fa5e01'
const TEAL   = '#0a353b'
const BLUE   = '#43a8da'
const LIGHT  = '#f0f7fa'
const MUTED  = '#64748b'
const BORDER = '#e2e8f0'

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Montserrat',
    fontWeight: 400,
    fontSize: 8,
    padding: 18,
    backgroundColor: '#fff',
    color: TEAL,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: ORANGE,
  },
  headerAccentBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: ORANGE,
    marginRight: 8,
    alignSelf: 'stretch',
  },
  companyBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontWeight: 700,
    color: TEAL,
    letterSpacing: 0.5,
  },
  companyMeta: {
    color: MUTED,
    marginTop: 2,
    fontSize: 7.5,
  },
  payslipBadge: {
    backgroundColor: ORANGE,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    alignItems: 'flex-end',
  },
  payslipBadgeText: {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: 2,
  },
  payslipPeriod: {
    color: MUTED,
    marginTop: 4,
    textAlign: 'right',
    fontSize: 7.5,
  },

  // ── Employee Box ─────────────────────────────────────────────────────────────
  empBox: {
    backgroundColor: LIGHT,
    padding: 10,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    marginBottom: 12,
  },
  empName: {
    fontSize: 11,
    fontWeight: 700,
    color: TEAL,
    marginBottom: 3,
  },
  empRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 2,
  },
  empLabel: {
    color: MUTED,
    fontSize: 7,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empValue: {
    color: TEAL,
    fontSize: 7.5,
    marginTop: 1,
    fontWeight: 600,
  },

  // ── Two-column layout ─────────────────────────────────────────────────────
  twoCol: {
    flexDirection: 'row',
    gap: 14,
  },
  col: {
    flex: 1,
  },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  sectionTitle: {
    fontSize: 7,
    fontWeight: 700,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Rows ─────────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    paddingHorizontal: 3,
  },
  rowAlt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    backgroundColor: '#fafafa',
    borderRadius: 2,
  },
  rowLabel: {
    color: '#374151',
    fontWeight: 400,
  },
  rowValue: {
    color: TEAL,
    fontWeight: 600,
    textAlign: 'right',
  },
  rowValueRed: {
    color: '#dc2626',
    fontWeight: 600,
    textAlign: 'right',
  },

  // ── Total Row ─────────────────────────────────────────────────────────────────
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: LIGHT,
    borderRadius: 3,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: BLUE,
  },
  totalLabel: {
    fontWeight: 700,
    color: TEAL,
    fontSize: 8.5,
  },
  totalValue: {
    fontWeight: 700,
    color: TEAL,
    textAlign: 'right',
    fontSize: 8.5,
  },
  totalValueRed: {
    fontWeight: 700,
    color: '#dc2626',
    textAlign: 'right',
    fontSize: 8.5,
  },

  // ── Net Pay ──────────────────────────────────────────────────────────────────
  netPayWrapper: {
    marginTop: 12,
    backgroundColor: TEAL,
    borderRadius: 6,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netPayAccent: {
    width: 3,
    height: 28,
    backgroundColor: ORANGE,
    borderRadius: 2,
    marginRight: 10,
  },
  netPayLabelBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  netPayLabel: {
    fontWeight: 700,
    fontSize: 10,
    color: '#fff',
    letterSpacing: 1,
  },
  netPaySub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 7,
    marginTop: 2,
  },
  netPayValue: {
    fontWeight: 700,
    fontSize: 16,
    color: ORANGE,
    textAlign: 'right',
  },

  // ── YTD ──────────────────────────────────────────────────────────────────────
  ytdBox: {
    marginTop: 10,
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 8,
    flexDirection: 'row',
    gap: 20,
  },
  ytdItem: {
    flex: 1,
  },
  ytdLabel: {
    color: MUTED,
    fontSize: 7,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ytdValue: {
    color: TEAL,
    fontWeight: 700,
    fontSize: 9,
    marginTop: 2,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerNote: {
    color: MUTED,
    fontSize: 6.5,
    fontStyle: 'italic',
    flex: 1,
  },
  signatureLine: {
    borderTopWidth: 0.5,
    borderTopColor: TEAL,
    width: 120,
    paddingTop: 3,
    textAlign: 'center',
    color: MUTED,
    fontSize: 6.5,
  },
})

// ─── Peso formatter (₱ from Montserrat latin-ext) ───────────────────────────
function P(value: number) {
  const formatted = value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `\u20B1${formatted}` // U+20B1 = ₱
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PayslipData {
  company: { name: string; address: string | null; tinNo: string | null }
  employee: {
    firstName: string; lastName: string; employeeNo: string | null
    department: string | null; position: string | null
    tinNo: string | null; sssNo: string | null
    philhealthNo: string | null; pagibigNo: string | null
  }
  period: { start: string; end: string; payDate: string }
  earnings: {
    basicPay: number; regularOtAmount: number; restDayOtAmount: number
    holidayOtAmount: number; nightDiffAmount: number
    allowancesTotal: number; deMinimisTotal: number
  }
  deductions: {
    sssEmployee: number; philhealthEmployee: number; pagibigEmployee: number
    withholdingTax: number; lateDeduction: number; undertimeDeduction: number
    absenceDeduction: number; loanDeductions: number; otherDeductions: number
  }
  totals: { grossPay: number; totalDeductions: number; netPay: number }
  ytd: { grossPay: number; withholdingTax: number }
}

// ─── Component ───────────────────────────────────────────────────────────────
export function PayslipDocument({ data }: { data: PayslipData }) {
  const e = data.earnings
  const d = data.deductions

  const earningsRows = [
    ['Basic Pay', e.basicPay],
    ...(e.regularOtAmount   > 0 ? [['Regular Overtime (125%)', e.regularOtAmount]]   : []),
    ...(e.restDayOtAmount   > 0 ? [['Rest Day OT (130%)', e.restDayOtAmount]]         : []),
    ...(e.holidayOtAmount   > 0 ? [['Holiday OT', e.holidayOtAmount]]                 : []),
    ...(e.nightDiffAmount   > 0 ? [['Night Differential (10%)', e.nightDiffAmount]]   : []),
    ...(e.allowancesTotal   > 0 ? [['Allowances', e.allowancesTotal]]                 : []),
    ...(e.deMinimisTotal    > 0 ? [['De Minimis Benefits', e.deMinimisTotal]]          : []),
  ] as [string, number][]

  const deductionRows = [
    ['SSS (Employee Share)', d.sssEmployee],
    ['PhilHealth (Employee)', d.philhealthEmployee],
    ['Pag-IBIG (Employee)', d.pagibigEmployee],
    ...(d.withholdingTax  > 0 ? [['Withholding Tax (BIR)', d.withholdingTax]]          : []),
    ...(d.lateDeduction   > 0 ? [['Late / Undertime', d.lateDeduction + d.undertimeDeduction]] : []),
    ...(d.absenceDeduction > 0 ? [['Absences', d.absenceDeduction]]                    : []),
    ...(d.loanDeductions  > 0 ? [['Loan Amortizations', d.loanDeductions]]             : []),
    ...(d.otherDeductions > 0 ? [['Other Deductions', d.otherDeductions]]              : []),
  ] as [string, number][]

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Company Header ── */}
        <View style={s.header}>
          <View style={s.companyBlock}>
            <View style={s.headerAccentBar} />
            <View>
              <Text style={s.companyName}>{data.company.name}</Text>
              {data.company.address && (
                <Text style={s.companyMeta}>{data.company.address}</Text>
              )}
              {data.company.tinNo && (
                <Text style={s.companyMeta}>TIN: {data.company.tinNo}</Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={s.payslipBadge}>
              <Text style={s.payslipBadgeText}>PAYSLIP</Text>
            </View>
            <Text style={s.payslipPeriod}>
              Period: {data.period.start} – {data.period.end}
            </Text>
            <Text style={s.payslipPeriod}>Pay Date: {data.period.payDate}</Text>
          </View>
        </View>

        {/* ── Employee Info ── */}
        <View style={s.empBox}>
          <Text style={s.empName}>
            {data.employee.lastName}, {data.employee.firstName}
          </Text>
          <View style={s.empRow}>
            {(
              [
                ['Employee No.', data.employee.employeeNo ?? '—'] as [string, string],
                ...(data.employee.department ? [['Department', data.employee.department] as [string, string]] : []),
                ...(data.employee.position   ? [['Position',   data.employee.position]   as [string, string]] : []),
              ]
            ).map(([lbl, val]) => (
              <View key={lbl}>
                <Text style={s.empLabel}>{lbl}</Text>
                <Text style={s.empValue}>{val}</Text>
              </View>
            ))}
          </View>
          <View style={{ ...s.empRow, marginTop: 5, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: BORDER }}>
            {[
              ['TIN', data.employee.tinNo],
              ['SSS', data.employee.sssNo],
              ['PhilHealth', data.employee.philhealthNo],
              ['Pag-IBIG', data.employee.pagibigNo],
            ].map(([lbl, val]) => (
              <View key={lbl as string}>
                <Text style={s.empLabel}>{lbl as string}</Text>
                <Text style={s.empValue}>{val ?? '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Earnings & Deductions ── */}
        <View style={s.twoCol}>
          {/* Earnings */}
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={{ ...s.sectionDot, backgroundColor: BLUE }} />
                <Text style={s.sectionTitle}>Earnings</Text>
              </View>
              {earningsRows.map(([label, value], i) => (
                <View key={label} style={i % 2 === 0 ? s.row : s.rowAlt}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowValue}>{P(value)}</Text>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Gross Pay</Text>
                <Text style={s.totalValue}>{P(data.totals.grossPay)}</Text>
              </View>
            </View>
          </View>

          {/* Deductions */}
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={{ ...s.sectionDot, backgroundColor: '#ef4444' }} />
                <Text style={s.sectionTitle}>Deductions</Text>
              </View>
              {deductionRows.map(([label, value], i) => (
                <View key={label} style={i % 2 === 0 ? s.row : s.rowAlt}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowValueRed}>{P(value)}</Text>
                </View>
              ))}
              <View style={{ ...s.totalRow, borderLeftColor: '#ef4444' }}>
                <Text style={s.totalLabel}>Total Deductions</Text>
                <Text style={s.totalValueRed}>{P(data.totals.totalDeductions)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Net Pay ── */}
        <View style={s.netPayWrapper}>
          <View style={s.netPayAccent} />
          <View style={s.netPayLabelBlock}>
            <View>
              <Text style={s.netPayLabel}>NET PAY</Text>
              <Text style={s.netPaySub}>Take-home for this period</Text>
            </View>
          </View>
          <Text style={s.netPayValue}>{P(data.totals.netPay)}</Text>
        </View>

        {/* ── Year-to-Date ── */}
        <View style={s.ytdBox}>
          <View style={s.ytdItem}>
            <Text style={s.ytdLabel}>YTD Gross Pay</Text>
            <Text style={s.ytdValue}>{P(data.ytd.grossPay)}</Text>
          </View>
          <View style={s.ytdItem}>
            <Text style={s.ytdLabel}>YTD Tax Withheld</Text>
            <Text style={s.ytdValue}>{P(data.ytd.withholdingTax)}</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerNote}>
            This is a computer-generated payslip. No signature required.{'\n'}
            For inquiries, contact your HR or Payroll department.
          </Text>
          <View>
            <View style={s.signatureLine}>
              <Text>Authorized by HR / Payroll</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}

