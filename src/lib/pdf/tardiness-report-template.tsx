import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { registerPdfFonts } from './register-pdf-fonts'

registerPdfFonts()

const ORANGE = '#fa5e01'
const TEAL   = '#1A2D42'
const MUTED  = '#64748b'
const BORDER = '#e2e8f0'
const RED    = '#dc2626'
const AMBER  = '#d97706'
const LIGHT_RED = '#fef2f2'
const LIGHT  = '#f8fafc'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Montserrat',
    fontWeight: 400,
    fontSize: 8,
    padding: 28,
    backgroundColor: '#fff',
    color: TEAL,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: ORANGE,
  },
  companyName: { fontSize: 13, fontWeight: 700, color: TEAL },
  reportTitle: { fontSize: 16, fontWeight: 700, color: ORANGE, marginBottom: 2 },
  reportSubtitle: { fontSize: 8, color: MUTED },
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 14 },
  metaBlock: { flexDirection: 'column', gap: 2 },
  metaLabel: { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 9, fontWeight: 600, color: TEAL },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statLabel: { fontSize: 7, color: MUTED, marginBottom: 2 },
  statValue: { fontSize: 12, fontWeight: 700, color: TEAL },
  statValueRed: { fontSize: 12, fontWeight: 700, color: RED },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: TEAL,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: LIGHT,
  },
  tableRowWarning: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: LIGHT_RED,
  },
  thText: { fontSize: 7, fontWeight: 700, color: '#fff' },
  tdText: { fontSize: 8, color: TEAL },
  tdMuted: { fontSize: 7, color: MUTED },
  tdRed: { fontSize: 8, fontWeight: 700, color: RED },
  tdAmber: { fontSize: 8, fontWeight: 600, color: AMBER },
  colName: { flex: 3 },
  colDept: { flex: 2 },
  colNum: { flex: 1, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: MUTED },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: TEAL,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noData: {
    padding: 20,
    textAlign: 'center',
    color: MUTED,
    fontSize: 8,
  },
})

export interface TardinessRow {
  employeeName: string
  employeeNo: string
  department: string
  tardyDays: number
  totalLate: number
  avgLatePerDay: number
  totalUndertime: number
  absentDays: number
}

interface Props {
  companyName: string
  weekStart: string
  weekEnd: string
  generatedAt: string
  rows: TardinessRow[]
}

function fmtMin(min: number): string {
  if (min <= 0) return '—'
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`
  return `${min}m`
}

export function TardinessReportDocument({ companyName, weekStart, weekEnd, generatedAt, rows }: Props) {
  const totalTardyDays = rows.reduce((s, r) => s + r.tardyDays, 0)
  const totalLateMin = rows.reduce((s, r) => s + r.totalLate, 0)
  const totalAbsences = rows.reduce((s, r) => s + r.absentDays, 0)
  const affectedEmployees = rows.filter(r => r.tardyDays > 0 || r.absentDays > 0).length

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>{companyName}</Text>
            <Text style={s.reportSubtitle}>Tardiness & Attendance Report</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.reportTitle}>TARDINESS REPORT</Text>
            <Text style={s.reportSubtitle}>Week of {weekStart} – {weekEnd}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Period</Text>
            <Text style={s.metaValue}>{weekStart} – {weekEnd}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Generated</Text>
            <Text style={s.metaValue}>{generatedAt}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Affected Employees</Text>
            <Text style={s.metaValue}>{affectedEmployees}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Employees w/ Tardiness</Text>
            <Text style={rows.filter(r => r.tardyDays > 0).length > 0 ? s.statValueRed : s.statValue}>
              {rows.filter(r => r.tardyDays > 0).length}
            </Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Total Tardy Days</Text>
            <Text style={totalTardyDays > 0 ? s.statValueRed : s.statValue}>{totalTardyDays}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Total Late Minutes</Text>
            <Text style={totalLateMin > 0 ? s.statValueRed : s.statValue}>{fmtMin(totalLateMin)}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Total Absences</Text>
            <Text style={totalAbsences > 0 ? s.statValueRed : s.statValue}>{totalAbsences}</Text>
          </View>
        </View>

        {/* Table */}
        <Text style={s.sectionTitle}>Employee Tardiness Breakdown</Text>

        {rows.length === 0 ? (
          <Text style={s.noData}>No tardiness or absences recorded for this period.</Text>
        ) : (
          <View>
            {/* Table Header */}
            <View style={s.tableHeader}>
              <Text style={[s.thText, s.colName]}>Employee</Text>
              <Text style={[s.thText, s.colDept]}>Department</Text>
              <Text style={[s.thText, s.colNum]}>Tardy Days</Text>
              <Text style={[s.thText, s.colNum]}>Total Late</Text>
              <Text style={[s.thText, s.colNum]}>Avg Late</Text>
              <Text style={[s.thText, s.colNum]}>Undertime</Text>
              <Text style={[s.thText, s.colNum]}>Absences</Text>
            </View>

            {/* Table Rows */}
            {rows.map((row, i) => {
              const isHighRisk = row.tardyDays >= 3 || row.totalLate >= 60 || row.absentDays >= 2
              const rowStyle = isHighRisk ? s.tableRowWarning : i % 2 === 0 ? s.tableRow : s.tableRowAlt
              return (
                <View key={`${row.employeeNo}-${i}`} style={rowStyle}>
                  <View style={s.colName}>
                    <Text style={s.tdText}>{row.employeeName}</Text>
                    <Text style={s.tdMuted}>{row.employeeNo}</Text>
                  </View>
                  <Text style={[s.tdText, s.colDept]}>{row.department}</Text>
                  <Text style={[row.tardyDays >= 3 ? s.tdRed : s.tdAmber, s.colNum]}>
                    {row.tardyDays > 0 ? String(row.tardyDays) : '—'}
                  </Text>
                  <Text style={[row.totalLate >= 60 ? s.tdRed : row.totalLate > 0 ? s.tdAmber : s.tdMuted, s.colNum]}>
                    {fmtMin(row.totalLate)}
                  </Text>
                  <Text style={[s.tdText, s.colNum]}>
                    {row.tardyDays > 0 ? `${Math.round(row.avgLatePerDay)}m` : '—'}
                  </Text>
                  <Text style={[s.tdText, s.colNum]}>{fmtMin(row.totalUndertime)}</Text>
                  <Text style={[row.absentDays >= 2 ? s.tdRed : row.absentDays > 0 ? s.tdAmber : s.tdMuted, s.colNum]}>
                    {row.absentDays > 0 ? String(row.absentDays) : '—'}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{companyName} — Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
