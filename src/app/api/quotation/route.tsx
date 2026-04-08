import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Page, Text, View, StyleSheet, Image, renderToBuffer, Font,
} from '@react-pdf/renderer'
import React from 'react'
import path from 'path'
import fs from 'fs'

const MONTHLY_PRICE = 50
const ANNUAL_PRICE_PER_MONTH = 40
const montserratRegularPath = path.join(process.cwd(), 'public', 'fonts', 'montserrat', 'static', 'Montserrat-Regular.ttf')
const montserratBoldPath = path.join(process.cwd(), 'public', 'fonts', 'montserrat', 'static', 'Montserrat-Bold.ttf')
const hasMontserrat = fs.existsSync(montserratRegularPath) && fs.existsSync(montserratBoldPath)
const PDF_FONT_FAMILY = hasMontserrat ? 'Montserrat' : 'Helvetica'
const PDF_FONT_BOLD = hasMontserrat ? 'MontserratBold' : 'Helvetica-Bold'

if (hasMontserrat) {
  const regularSrc = `data:font/ttf;base64,${fs.readFileSync(montserratRegularPath).toString('base64')}`
  const boldSrc = `data:font/ttf;base64,${fs.readFileSync(montserratBoldPath).toString('base64')}`
  Font.register({ family: 'Montserrat', src: regularSrc })
  Font.register({ family: 'MontserratBold', src: boldSrc })
}

const c = {
  teal:      '#0b4a3b',
  tealLight: '#227f84',
  orange:    '#fa5e01',
  slate:     '#1e293b',
  muted:     '#64748b',
  border:    '#e2e8f0',
  bg:        '#f8fafc',
  white:     '#ffffff',
  green:     '#16a34a',
  red:       '#dc2626',
}

const s = StyleSheet.create({
  page:         { fontFamily: PDF_FONT_FAMILY, backgroundColor: c.white, padding: 0, position: 'relative' },
  header:       { backgroundColor: c.teal, paddingHorizontal: 40, paddingVertical: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:   { flexDirection: 'column' },
  logo:         { width: 120, height: 36, objectFit: 'contain' },
  headerLabel:  { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 10, marginTop: 4 },
  headerRight:  { alignItems: 'flex-end' },
  quotationNo:  { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 20 },
  quotationSub: { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 9, marginTop: 2 },
  body:         { paddingHorizontal: 40, paddingVertical: 28, paddingBottom: 24 },
  row:          { flexDirection: 'row', gap: 16, marginBottom: 20 },
  infoBox:      { flex: 1, backgroundColor: c.bg, borderRadius: 8, padding: 14, border: `1px solid ${c.border}` },
  infoLabel:    { fontFamily: PDF_FONT_BOLD, fontSize: 8, color: '#1f2937', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  infoValue:    { fontFamily: PDF_FONT_BOLD, fontSize: 12, color: '#0f172a' },
  infoSub:      { fontFamily: PDF_FONT_BOLD, fontSize: 10, color: '#1f2937', marginTop: 2 },
  sectionTitle: { fontFamily: PDF_FONT_BOLD, fontSize: 12, color: c.teal, marginBottom: 10, borderBottom: `2px solid ${c.teal}`, paddingBottom: 5 },
  tableHead:    { flexDirection: 'row', backgroundColor: c.teal, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 2 },
  tableHeadTxt: { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 9 },
  tableRow:     { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderBottom: `1px solid ${c.border}` },
  tableRowAlt:  { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderBottom: `1px solid ${c.border}`, backgroundColor: c.bg },
  tableTxt:     { fontFamily: PDF_FONT_BOLD, fontSize: 10, color: '#0f172a' },
  tableTxtMuted:{ fontFamily: PDF_FONT_BOLD, fontSize: 9, color: '#1f2937' },
  col1:         { flex: 3 },
  col2:         { flex: 1, textAlign: 'center' },
  col3:         { flex: 1, textAlign: 'right' },
  col4:         { flex: 1.2, textAlign: 'right' },
  totalBox:     { backgroundColor: c.teal, borderRadius: 8, padding: 16, marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:   { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 10 },
  totalAmt:     { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 20 },
  savingsBadge: { backgroundColor: c.orange, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4, alignSelf: 'flex-start' },
  savingsTxt:   { color: c.white, fontFamily: PDF_FONT_BOLD, fontSize: 9 },
  notesBox:     { backgroundColor: '#fffbeb', borderRadius: 8, padding: 14, marginTop: 16, border: `1px solid #fde68a` },
  notesTxt:     { fontFamily: PDF_FONT_BOLD, fontSize: 9, color: '#7c2d12', lineHeight: 1.6 },
  footer:       { borderTop: `1px solid ${c.border}`, marginTop: 24, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  footerTxt:    { fontFamily: PDF_FONT_BOLD, fontSize: 8.5, color: '#1f2937', lineHeight: 1.5 },
  badge:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badgeItem:    { backgroundColor: c.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, border: `1px solid ${c.border}` },
  badgeTxt:     { fontFamily: PDF_FONT_BOLD, fontSize: 8, color: '#475569' },
  featureGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  featureCard:  { width: '47%', backgroundColor: c.bg, borderRadius: 6, padding: 10, border: `1px solid ${c.border}` },
  featureTitle: { fontFamily: PDF_FONT_BOLD, fontSize: 9.5, color: '#0f172a', marginBottom: 3 },
  featureTxt:   { fontFamily: PDF_FONT_BOLD, fontSize: 8.5, color: '#1f2937', lineHeight: 1.5 },
  bullet:       { fontSize: 7.5, color: c.muted, marginBottom: 2 },
  highlight:    { color: c.tealLight, fontWeight: 700 },
  pageNum:      { fontFamily: PDF_FONT_BOLD, fontSize: 8, color: '#1f2937', textAlign: 'right', marginTop: 8 },
  stripe:       { height: 4, backgroundColor: c.orange },
  bottomStripe: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: c.tealLight },
})

function fmt(n: number) {
  return '\u20B1 ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface QuotationInput {
  plan: 'MONTHLY' | 'ANNUAL'
  seats: number
  clientName: string
  clientCompany: string
  clientEmail: string
  validDays: number
  quotationNo: string
  issuedDate: string
  includeSetup: boolean
  setupFee: number
  notes: string
}

function QuotationPDF({ q }: { q: QuotationInput }) {
  const pricePerSeat = q.plan === 'ANNUAL' ? ANNUAL_PRICE_PER_MONTH : MONTHLY_PRICE
  const billingLabel = q.plan === 'ANNUAL' ? 'Annual (billed yearly)' : 'Monthly (billed monthly)'
  const periods      = q.plan === 'ANNUAL' ? 12 : 1
  const periodLabel  = q.plan === 'ANNUAL' ? 'year' : 'month'
  const subtotal     = pricePerSeat * q.seats * periods
  const setupFee     = q.includeSetup ? q.setupFee : 0
  const total        = subtotal + setupFee
  const savings      = q.plan === 'ANNUAL' ? MONTHLY_PRICE * 12 * q.seats - subtotal : 0
  const validUntil   = new Date(q.issuedDate)
  validUntil.setDate(validUntil.getDate() + q.validDays)

  const features = [
    { title: 'Attendance & Time Tracking', desc: 'Fingerprint clock-in, GPS geofencing, facial recognition, and real-time attendance monitoring.' },
    { title: 'Automated Payroll', desc: 'Semi-monthly, monthly, and daily payroll processing with full Philippine deductions.' },
    { title: 'Government Compliance', desc: 'Auto-compute SSS, PhilHealth, Pag-IBIG, and BIR withholding tax with ready-to-file reports.' },
    { title: 'Employee Self-Service Portal', desc: 'Employees can clock in/out, view payslips, file leaves, and track balances on mobile.' },
    { title: 'Leave Management', desc: 'Configurable leave types, approval workflows, and automatic balance tracking.' },
    { title: 'Loan & Deduction Tracking', desc: 'Salary loans and deductions automatically amortized across payroll runs.' },
    { title: 'Government Reports', desc: 'BIR Alphalist, 2316, SSS R3, PhilHealth RF-1, and Pag-IBIG MCRF — print-ready.' },
    { title: 'Admin Dashboard', desc: 'Company-wide analytics, department breakdown, and real-time workforce overview.' },
  ]

  const logoPath = path.join(process.cwd(), 'public', 'invoice-logo.png')
  const logoSrc  = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''

  return (
    <Document title={`Onclock Quotation — ${q.clientCompany}`}>

      {/* ── PAGE 1: Summary ── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.stripe} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {logoSrc ? (
              <Image src={logoSrc} style={s.logo} />
            ) : (
              <Text style={{ color: c.white, fontSize: 18, fontWeight: 900 }}>Onclock</Text>
            )}
            <Text style={s.headerLabel}>Helping Businesses Scale with Modern Web Solutions</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.quotationNo}>QUOTATION</Text>
            <Text style={s.quotationSub}>#{q.quotationNo}</Text>
            <Text style={[s.quotationSub, { marginTop: 6 }]}>Issued: {q.issuedDate}</Text>
            <Text style={s.quotationSub}>Valid until: {validUntil.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Client + Issuer Info */}
          <View style={s.row}>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Prepared For</Text>
              <Text style={s.infoValue}>{q.clientName || '—'}</Text>
              <Text style={s.infoSub}>{q.clientCompany || '—'}</Text>
              {q.clientEmail && <Text style={s.infoSub}>{q.clientEmail}</Text>}
            </View>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Issued By</Text>
              <Text style={s.infoValue}>JCG Web App Solutions</Text>
            </View>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Selected Plan</Text>
              <Text style={s.infoValue}>{billingLabel}</Text>
              <Text style={s.infoSub}>{q.seats} employee seat{q.seats !== 1 ? 's' : ''}</Text>
              <Text style={[s.infoSub, { color: c.tealLight, fontWeight: 700, marginTop: 4 }]}>
                {fmt(pricePerSeat)} / seat / month
              </Text>
            </View>
          </View>

          {/* Line Items Table */}
          <Text style={s.sectionTitle}>Pricing Breakdown</Text>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadTxt, s.col1]}>Description</Text>
            <Text style={[s.tableHeadTxt, s.col2]}>Qty</Text>
            <Text style={[s.tableHeadTxt, s.col3]}>Unit Price</Text>
            <Text style={[s.tableHeadTxt, s.col4]}>Amount</Text>
          </View>

          {/* Row 1: Subscription */}
          <View style={s.tableRow}>
            <View style={s.col1}>
              <Text style={s.tableTxt}>Onclock {q.plan === 'ANNUAL' ? 'Annual' : 'Monthly'} Subscription</Text>
              <Text style={s.tableTxtMuted}>
                {q.seats} seats × {fmt(pricePerSeat)}/mo × {periods} {periods > 1 ? 'months' : 'month'}
              </Text>
            </View>
            <Text style={[s.tableTxt, s.col2]}>{q.seats}</Text>
            <Text style={[s.tableTxt, s.col3]}>{fmt(pricePerSeat * periods)}</Text>
            <Text style={[s.tableTxt, s.col4, { fontWeight: 700 }]}>{fmt(subtotal)}</Text>
          </View>

          {/* Row 2: Setup fee (conditional) */}
          {q.includeSetup && (
            <View style={s.tableRowAlt}>
              <View style={s.col1}>
                <Text style={s.tableTxt}>One-time Setup & Onboarding Fee</Text>
                <Text style={s.tableTxtMuted}>Account configuration, data import, and 1-hour orientation</Text>
              </View>
              <Text style={[s.tableTxt, s.col2]}>1</Text>
              <Text style={[s.tableTxt, s.col3]}>{fmt(setupFee)}</Text>
              <Text style={[s.tableTxt, s.col4, { fontWeight: 700 }]}>{fmt(setupFee)}</Text>
            </View>
          )}

          {/* Savings row */}
          {savings > 0 && (
            <View style={[s.tableRowAlt, { backgroundColor: '#f0fdf4' }]}>
              <View style={s.col1}>
                <Text style={[s.tableTxt, { color: c.green }]}>Annual Plan Discount (20% off monthly rate)</Text>
                <Text style={[s.tableTxtMuted]}>vs. paying {'\u20B1'}{(MONTHLY_PRICE * 12 * q.seats).toLocaleString()} monthly</Text>
              </View>
              <Text style={[s.tableTxt, s.col2]}>—</Text>
              <Text style={[s.tableTxt, s.col3]}>—</Text>
              <Text style={[s.tableTxt, s.col4, { color: c.green, fontWeight: 700 }]}>−{fmt(savings)}</Text>
            </View>
          )}

          {/* Total */}
          <View style={s.totalBox}>
            <View>
              <Text style={s.totalLabel}>TOTAL DUE ({q.plan === 'ANNUAL' ? '1 year' : '1 month'})</Text>
              {savings > 0 && (
                <View style={s.savingsBadge}>
                  <Text style={s.savingsTxt}>You save {fmt(savings)} vs. monthly</Text>
                </View>
              )}
            </View>
            <Text style={s.totalAmt}>{fmt(total)}</Text>
          </View>

          {/* Notes */}
          {q.notes && (
            <View style={s.notesBox}>
              <Text style={[s.notesTxt, { fontWeight: 700, marginBottom: 3 }]}>Notes</Text>
              <Text style={s.notesTxt}>{q.notes}</Text>
            </View>
          )}

          {/* Footer */}
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              <Text style={[s.footerTxt, { fontWeight: 700, color: c.slate, marginBottom: 2 }]}>Terms</Text>
              <Text style={s.footerTxt}>• Payment is due within {q.validDays} days from quotation date.</Text>
              <Text style={s.footerTxt}>• Pricing is in Philippine Peso ({'\u20B1'}), inclusive of all platform fees.</Text>
              <Text style={s.footerTxt}>• Government taxes (VAT) not included unless otherwise stated.</Text>
              <Text style={s.footerTxt}>• Subscription auto-renews unless cancelled 7 days before period end.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.footerTxt}>Compliant with:</Text>
              <View style={s.badge}>
                {['BIR', 'SSS', 'PhilHealth', 'Pag-IBIG', 'DOLE'].map(a => (
                  <View key={a} style={s.badgeItem}>
                    <Text style={s.badgeTxt}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <Text style={s.pageNum}>Page 1 of 2 · Onclock HR & Payroll Platform · onclockph.com</Text>
        </View>
        <View style={s.bottomStripe} fixed />
      </Page>

      {/* ── PAGE 2: Features ── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.stripe} />
        <View style={s.body}>
          <Text style={[s.sectionTitle, { marginTop: 8 }]}>What&apos;s Included in Your Plan</Text>
          <Text style={[s.footerTxt, { marginBottom: 2 }]}>
            All plans include access to the full Onclock platform. Below is a summary of features available to your team.
          </Text>
          <View style={s.featureGrid}>
            {features.map((f) => (
              <View key={f.title} style={s.featureCard}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureTxt}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* Support */}
          <View style={[s.notesBox, { marginTop: 20, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
            <Text style={[s.notesTxt, { fontWeight: 700, color: '#0369a1', marginBottom: 4 }]}>Included Support</Text>
            <Text style={[s.notesTxt, { color: '#0369a1' }]}>• Email and chat support during business hours (Mon–Fri, 8AM–5PM)</Text>
            <Text style={[s.notesTxt, { color: '#0369a1' }]}>• Free onboarding assistance and payroll setup walkthrough</Text>
            <Text style={[s.notesTxt, { color: '#0369a1' }]}>• Software updates and new feature releases at no extra cost</Text>
            <Text style={[s.notesTxt, { color: '#0369a1' }]}>• Data export in Excel/CSV format at any time</Text>
          </View>

          {/* CTA */}
          <View style={[s.totalBox, { marginTop: 20, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
            <Text style={[s.totalLabel, { fontSize: 11, fontWeight: 900, color: c.white }]}>Ready to get started?</Text>
            <Text style={[s.footerTxt, { color: c.white }]}>
              Visit onclockph.com to register your company for free. Your {q.validDays}-day trial starts immediately —
              no credit card required. Upgrade anytime to unlock full payroll and government report generation.
            </Text>
          </View>

          <View style={[s.footer, { marginTop: 20 }]}>
            <View>
              <Text style={[s.footerTxt, { fontWeight: 700, color: c.slate }]}>JCG Web App Solutions</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.footerTxt}>Quotation #{q.quotationNo}</Text>
              <Text style={s.footerTxt}>Valid until {validUntil.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
            </View>
          </View>
          <Text style={s.pageNum}>Page 2 of 2 · Onclock HR & Payroll Platform · onclockph.com</Text>
        </View>
        <View style={s.bottomStripe} fixed />
      </Page>
    </Document>
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as QuotationInput
    const pdfBuffer = await renderToBuffer(<QuotationPDF q={body} />)

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Onclock-Quotation-${body.quotationNo}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[quotation] PDF error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}

