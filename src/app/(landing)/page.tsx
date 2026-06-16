import Link from 'next/link'
import Image from 'next/image'
import {
  Fingerprint, MapPin, Map, Calculator, FileText, Shield,
  CheckCircle, ArrowRight, Clock, Users, TrendingUp, Star,
  Zap, Globe, Lock, BarChart3, ChevronRight, Phone,
  CalendarDays, Timer, Wallet, Banknote, Send, Receipt,
  UserPlus, Award, AlertTriangle, UserCheck, Megaphone,
  Network, Package, FolderOpen, ClipboardList, Smartphone,
  CreditCard,
} from 'lucide-react'
import { LandingNav } from './landing-nav'

// ─── Data ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Fingerprint,
    color: '#032b63',
    bg: 'rgba(3,43,99,0.10)',
    title: 'Biometric Clock-In / Out',
    desc: 'Eliminate buddy punching with WebAuthn biometric authentication — fingerprint or Face ID, on any device, no hardware needed.',
    badge: 'Anti-Buddy Punch',
  },
  {
    icon: MapPin,
    color: '#0284c7',
    bg: 'rgba(2,132,199,0.10)',
    title: 'GPS Geofencing',
    desc: 'Define a perimeter around your office or job site. Employees outside the allowed radius are blocked from clocking in.',
    badge: 'Location Enforced',
  },
  {
    icon: Map,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.10)',
    title: 'Live Attendance Map',
    desc: "Watch your team's real-time locations on an interactive map. See who's clocked in, where they are, and their selfie — at a glance.",
    badge: 'Real-Time',
  },
  {
    icon: Calculator,
    color: '#ea580c',
    bg: 'rgba(234,88,12,0.10)',
    title: 'Automated Payroll',
    desc: 'Semi-monthly, monthly, weekly or daily runs computed automatically — OT, night differential, absences, loans, and all statutory deductions.',
    badge: 'Zero Manual Work',
  },
  {
    icon: ClipboardList,
    color: '#0f766e',
    bg: 'rgba(15,118,110,0.10)',
    title: 'Daily Time Records (DTR)',
    desc: 'Complete audit trail of every clock-in and clock-out. Export DTR reports per employee or per period in seconds.',
    badge: 'Full Audit Trail',
  },
  {
    icon: Timer,
    color: '#b45309',
    bg: 'rgba(180,83,9,0.10)',
    title: 'Overtime Management',
    desc: 'Employees file OT requests from the portal. Managers approve or reject. Approved OT flows directly into payroll computation.',
    badge: 'Auto-Computed',
  },
  {
    icon: CalendarDays,
    color: '#6d28d9',
    bg: 'rgba(109,40,217,0.10)',
    title: 'Leave Management',
    desc: 'Configure leave types, accrual rules, and approval chains. Employees file and track leaves from their portal — balance always up to date.',
    badge: 'Multi-Type',
  },
  {
    icon: Clock,
    color: '#0e7490',
    bg: 'rgba(14,116,144,0.10)',
    title: 'Time Correction Requests',
    desc: 'Employees can request missed clock-ins or corrections. Managers approve with a full history log — no more manual edits.',
    badge: 'Approval Workflow',
  },
  {
    icon: FileText,
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.10)',
    title: 'Government Reports',
    desc: 'Generate BIR Alphalist, SSS R3, PhilHealth RF-1, and Pag-IBIG MCRF — correctly formatted and ready to submit, no re-encoding.',
    badge: 'Ready to File',
  },
  {
    icon: TrendingUp,
    color: '#059669',
    bg: 'rgba(5,150,105,0.10)',
    title: '13th Month Pay',
    desc: 'Monthly basic pay is tracked automatically. One click generates the 13th month report per DOLE guidelines, pro-rated for mid-year hires.',
    badge: 'DOLE Compliant',
  },
  {
    icon: Receipt,
    color: '#4f46e5',
    bg: 'rgba(79,70,229,0.10)',
    title: 'Tax Annualization',
    desc: 'Year-end tax annualization computed automatically. Generates BIR Form 2316 for every employee — ready for signature.',
    badge: 'BIR Form 2316',
  },
  {
    icon: Banknote,
    color: '#065f46',
    bg: 'rgba(6,95,70,0.10)',
    title: 'Loan Management',
    desc: 'Track SSS, Pag-IBIG, and in-house loans. Amortizations auto-deducted from payroll every cutoff — no manual tracking.',
    badge: 'Auto-Deducted',
  },
  {
    icon: Wallet,
    color: '#92400e',
    bg: 'rgba(146,64,14,0.10)',
    title: 'Cash Advance',
    desc: 'Employees request cash advances from the portal. Approved amounts auto-deducted on the next payroll run.',
    badge: 'Portal Filing',
  },
  {
    icon: Send,
    color: '#1d4ed8',
    bg: 'rgba(29,78,216,0.10)',
    title: 'Payroll Disbursement',
    desc: 'Send net pay directly to employee bank accounts via InstaPay or PesoNet — right from the platform, no bank visit needed.',
    badge: 'InstaPay / PesoNet',
  },
  {
    icon: UserPlus,
    color: '#0284c7',
    bg: 'rgba(2,132,199,0.10)',
    title: 'Recruitment & ATS',
    desc: 'Post job openings, receive applicants, move candidates through stages, and send offer letters — all in one pipeline.',
    badge: 'End-to-End',
  },
  {
    icon: UserCheck,
    color: '#0f766e',
    bg: 'rgba(15,118,110,0.10)',
    title: 'Onboarding & Offboarding',
    desc: 'Structured checklists for new hires and departing employees. Track document submission, task completion, and clearance — paperless.',
    badge: 'Checklist-Driven',
  },
  {
    icon: Award,
    color: '#d97706',
    bg: 'rgba(217,119,6,0.10)',
    title: 'Performance Reviews',
    desc: 'Schedule review cycles, assign KPIs, and capture 360° feedback. Track improvement over time with a clear historical record.',
    badge: 'KPI Tracking',
  },
  {
    icon: AlertTriangle,
    color: '#b91c1c',
    bg: 'rgba(185,28,28,0.10)',
    title: 'Disciplinary Records',
    desc: 'Log incidents, notices to explain, and sanctions. Full digital paper trail ensures due process and protects your company.',
    badge: 'Full Paper Trail',
  },
  {
    icon: BarChart3,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.10)',
    title: 'Analytics & Dashboards',
    desc: 'Headcount trends, late/absent patterns, payroll cost breakdowns, and workforce insights — visual and exportable.',
    badge: 'Data-Driven',
  },
  {
    icon: Network,
    color: '#0f766e',
    bg: 'rgba(15,118,110,0.10)',
    title: 'Org Chart',
    desc: 'Auto-generated organizational chart reflecting your live department and position structure — always current.',
    badge: 'Live Structure',
  },
  {
    icon: Megaphone,
    color: '#ea580c',
    bg: 'rgba(234,88,12,0.10)',
    title: 'Announcements',
    desc: 'Broadcast company-wide or department-specific announcements. Employees see updates on their portal dashboard.',
    badge: 'Company-Wide',
  },
  {
    icon: Package,
    color: '#475569',
    bg: 'rgba(71,85,105,0.10)',
    title: 'Asset Management',
    desc: 'Track company assets assigned to employees — laptops, vehicles, equipment. Know who has what at any time.',
    badge: 'Assigned Tracking',
  },
  {
    icon: Smartphone,
    color: '#032b63',
    bg: 'rgba(3,43,99,0.10)',
    title: 'Employee Self-Service Portal',
    desc: 'Employees view payslips, file leaves, check balances, submit requests, and clock in — all from their phone browser, no app install.',
    badge: 'Mobile-First',
  },
  {
    icon: FolderOpen,
    color: '#b45309',
    bg: 'rgba(180,83,9,0.10)',
    title: 'Employee 201 Files',
    desc: 'Centralized digital records for every employee — contracts, IDs, certifications, and HR documents, always accessible.',
    badge: 'Paperless HR',
  },
]

const complianceItems = [
  { name: 'BIR', label: 'Bureau of Internal Revenue', detail: 'Alphalist, 2316, 1601-C', logo: '/icons/bir.png' },
  { name: 'SSS', label: 'Social Security System', detail: 'R3 Contribution Report', logo: '/icons/sss.png' },
  { name: 'PhilHealth', label: 'Philippine Health Insurance', detail: 'RF-1 Remittance', logo: '/icons/PHIC.svg' },
  { name: 'Pag-IBIG', label: 'Home Development Mutual Fund', detail: 'MCRF Contribution', logo: '/icons/pagibig.png' },
  { name: 'DOLE', label: 'Dept. of Labor & Employment', detail: '13th Month, Leave Laws', logo: '/icons/dole.png' },
]

const steps = [
  { n: '01', title: 'Set Up Your Company', desc: 'Register your company, add departments, positions and work schedules. Import existing employees via CSV or add them one by one.' },
  { n: '02', title: 'Employees Enroll Fingerprint', desc: 'Each employee opens the mobile portal, taps "Enroll Fingerprint" and uses their device sensor once. That\'s it — no hardware, no app install.' },
  { n: '03', title: 'Payroll Runs Itself', desc: 'DTR records feed automatically into payroll. Approve the computed run, lock it, and download payslips. Government reports generated on demand.' },
]

const testimonials = [
  {
    name: 'Maria Santos',
    role: 'HR Manager',
    company: 'BPO Solutions Manila',
    avatar: 'MS',
    color: '#032b63',
    text: 'We used to spend 3 days every cut-off manually computing timesheets. Onclock cut that to 20 minutes. The fingerprint feature alone eliminated all our buddy-punching disputes.',
    rating: 5,
  },
  {
    name: 'Roberto Cruz',
    role: 'Business Owner',
    company: 'Cruz Construction Corp.',
    avatar: 'RC',
    color: '#021e47',
    text: 'Geofencing is a game-changer for us. Our workers are on multiple sites and we can actually see who is where, in real time. No more "I forgot to time in" excuses.',
    rating: 5,
  },
  {
    name: 'Ana Reyes',
    role: 'Finance Officer',
    company: 'Reyes Trading Inc.',
    avatar: 'AR',
    color: '#7c3aed',
    text: "BIR filing used to stress me out every quarter. Now I just click 'Generate Alphalist' and it's done. Completely accurate, properly formatted, ready to upload.",
    rating: 5,
  },
]

const stats = [
  { value: '₱0', label: 'Hardware Cost', sub: 'Works on any smartphone' },
  { value: '100%', label: 'Philippine Compliant', sub: 'BIR, SSS, PhilHealth, Pag-IBIG' },
  { value: '< 1 min', label: 'To Clock In', sub: 'Fingerprint + GPS, done' },
  { value: '3 days → 20 min', label: 'Payroll Processing', sub: 'Per customer reported time' },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <LandingNav />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-0 overflow-hidden" style={{ background: 'linear-gradient(160deg, #f0fafa 0%, #e8f5f5 40%, #f8fcfc 100%)' }}>
        {/* decorative blobs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: '#0055d4' }} />
        <div className="absolute top-1/2 -left-32 w-72 h-72 rounded-full opacity-10 blur-3xl" style={{ background: '#021e47' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Left copy */}
            <div className="flex-1 text-center lg:text-left pt-8 lg:pt-16 pb-8">
              {/* pill badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6 border"
                style={{ background: 'rgba(46,65,86,0.12)', borderColor: 'rgba(170,183,183,0.45)', color: '#032b63' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#032b63] animate-pulse" />
                Built exclusively for Philippine businesses
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight text-slate-900 mb-6">
                Payroll and Attendance
                <span className="block" style={{ color: '#032b63' }}>Management</span>
                <span className="block text-slate-700">Made Easy</span>
              </h1>

              <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Fingerprint clock-in, GPS geofencing, live attendance maps, and fully automated payroll — all pre-configured for BIR, SSS, PhilHealth, and Pag-IBIG compliance.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-base shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                  style={{ background: 'linear-gradient(135deg, #ff5900, #ea580c)' }}
                >
                  Start Free — No Credit Card
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-slate-700 font-bold text-base border-2 border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Sign In
                </Link>
              </div>

              {/* trust line */}
              <div className="mt-6 flex items-center gap-4 justify-center lg:justify-start text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />No hardware needed</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />DOLE compliant</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />Free to start</span>
              </div>
            </div>

            {/* Right — App mockup */}
            <div className="flex-1 flex justify-center lg:justify-end w-full max-w-lg lg:max-w-none pb-0">
              <div className="relative w-full max-w-md">
                {/* Phone frame */}
                <div className="relative mx-auto" style={{ width: 280 }}>
                  {/* Glow */}
                  <div className="absolute inset-0 rounded-[2.5rem] blur-2xl opacity-30 scale-110" style={{ background: 'linear-gradient(135deg, #032b63, #021e47)' }} />
                  {/* Phone shell */}
                  <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-800" style={{ background: '#0f172a' }}>
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-6 pt-4 pb-2">
                      <span className="text-white text-[10px] font-bold">9:41</span>
                      <div className="w-24 h-5 bg-slate-800 rounded-full" />
                      <div className="flex gap-1">
                        <div className="w-3 h-1.5 bg-white/60 rounded-sm" />
                        <div className="w-1 h-1.5 bg-white/40 rounded-sm" />
                      </div>
                    </div>
                    {/* App screen */}
                    <div className="bg-slate-50 mx-1 rounded-2xl overflow-hidden pb-6" style={{ minHeight: 520 }}>
                      {/* App header */}
                      <div className="px-5 py-4 text-center" style={{ background: 'linear-gradient(135deg, #032b63, #021e47)' }}>
                        <p className="text-white/80 text-[10px] font-semibold">Good morning,</p>
                        <p className="text-white font-black text-sm">Juan dela Cruz</p>
                      </div>
                      {/* Clock display */}
                      <div className="text-center py-5">
                        <p className="text-3xl font-black tabular-nums" style={{ color: '#032b63' }}>09:00:00</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Mon, Mar 31 2025</p>
                      </div>
                      {/* Enrolled badge */}
                      <div className="mx-4 mb-4 rounded-xl px-3 py-2 flex items-center gap-2"
                        style={{ background: 'rgba(16,185,129,0.10)' }}>
                        <Fingerprint className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-emerald-700">Fingerprint enrolled — ready to clock</span>
                      </div>
                      {/* Geofence badge */}
                      <div className="mx-4 mb-5 rounded-xl px-3 py-2 flex items-center gap-2"
                        style={{ background: 'rgba(46,65,86,0.12)' }}>
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#032b63' }} />
                        <span className="text-[10px] font-semibold" style={{ color: '#032b63' }}>Inside allowed zone (45m from office)</span>
                      </div>
                      {/* Clock In button */}
                      <div className="flex justify-center mb-5">
                        <div className="w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1.5 shadow-lg"
                          style={{ background: '#021e47', boxShadow: '0 0 0 8px rgba(34,127,132,0.15)' }}>
                          <Clock className="w-6 h-6 text-white" />
                          <span className="text-white text-xs font-bold">Clock In</span>
                        </div>
                      </div>
                      {/* Stats row */}
                      <div className="mx-4 grid grid-cols-3 gap-2">
                        {['Clock In', 'Clock Out', 'Total Hrs'].map((l, i) => (
                          <div key={i} className="bg-white rounded-xl p-2 text-center shadow-sm">
                            <p className="text-[11px] font-bold text-slate-700">--</p>
                            <p className="text-[9px] text-slate-400">{l}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="py-3 flex justify-center">
                      <div className="w-20 h-1 bg-white/30 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Floating cards */}
                <div className="absolute -left-8 top-16 bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 border border-slate-100 hidden sm:flex">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(46,65,86,0.12)' }}>
                    <FileText className="w-4 h-4" style={{ color: '#032b63' }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">File Leave & View Payslip</p>
                    <p className="text-[10px] text-slate-400">From the employee portal</p>
                  </div>
                </div>

                <div className="absolute -right-6 top-1/2 bg-white rounded-2xl shadow-xl px-4 py-3 border border-slate-100 hidden sm:block">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[10px] font-bold text-slate-800">Buddy Punch Blocked</p>
                  </div>
                  <p className="text-[9px] text-slate-400">Fingerprint mismatch detected</p>
                </div>

                <div className="absolute -left-4 bottom-16 bg-white rounded-2xl shadow-xl px-4 py-3 border border-slate-100 hidden sm:flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.10)' }}>
                    <Map className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Live Location Tracking</p>
                    <p className="text-[10px] text-slate-400">Real-time employee map</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave bottom */}
        <div className="relative mt-12 h-16 overflow-hidden">
          <svg viewBox="0 0 1440 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0 64L1440 64L1440 20C1200 60 960 0 720 20C480 40 240 0 0 20L0 64Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────────── */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s, i) => (
              <div key={i} className="text-center p-6 rounded-2xl border border-slate-100 hover:border-[#AAB7B7] hover:shadow-md transition-all">
                <p className="text-2xl font-black mb-1" style={{ color: '#032b63' }}>{s.value}</p>
                <p className="text-sm font-bold text-slate-700 mb-0.5">{s.label}</p>
                <p className="text-xs text-slate-400">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section id="features" className="py-20" style={{ background: '#f8fafb' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4 border"
              style={{ background: 'rgba(46,65,86,0.12)', borderColor: 'rgba(34,127,132,0.2)', color: '#032b63' }}>
              <Zap className="w-3 h-3" /> Everything you need
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Designed for the Way<br />Philippine Businesses Work
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-lg">
              From fingerprint authentication to government-ready reports — every feature built with Philippine labor laws and business realities in mind.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border border-slate-100 group flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: f.bg }}>
                    <f.icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 text-right leading-tight" style={{ background: f.bg, color: f.color }}>
                    {f.badge}
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-900 mb-1.5 group-hover:text-[#021e47] transition-colors">{f.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed flex-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINGERPRINT SPOTLIGHT ─────────────────────────────────────── */}
      <section className="py-20 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-14">
            {/* Visual */}
            <div className="flex-1 flex justify-center">
              <div className="relative">
                {/* Card */}
                <div className="w-80 bg-white rounded-3xl shadow-2xl p-8 border border-slate-100">
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(34,127,132,0.15), rgba(11,74,59,0.15))' }}>
                      <Fingerprint className="w-10 h-10" style={{ color: '#032b63' }} />
                    </div>
                    <p className="font-black text-slate-900 text-lg">Verifying identity…</p>
                    <p className="text-sm text-slate-400 mt-1">Touch your fingerprint sensor</p>
                  </div>
                  {/* Animated scan lines */}
                  <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div className="absolute inset-y-0 left-0 rounded-full w-2/3 animate-pulse" style={{ background: 'linear-gradient(90deg, #032b63, #021e47)' }} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      Credential ID matched
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      Location verified (38m from office)
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#032b63] border-t-transparent animate-spin flex-shrink-0" />
                      Logging attendance…
                    </div>
                  </div>
                  <div className="mt-5 p-3 rounded-xl text-center text-xs font-bold text-emerald-700" style={{ background: 'rgba(16,185,129,0.10)' }}>
                    ✓ Clocked In — 09:01 AM
                  </div>
                </div>

                {/* Blocked attempt card */}
                <div className="absolute -right-10 -bottom-8 w-56 bg-white rounded-2xl shadow-xl p-4 border border-red-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-100">
                      <Lock className="w-3.5 h-3.5 text-red-500" />
                    </div>
                    <p className="text-xs font-bold text-red-600">Attempt Blocked</p>
                  </div>
                  <p className="text-[10px] text-slate-500">Another employee tried to clock in as <strong>Juan</strong> — fingerprint mismatch. Logged.</p>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="flex-1 lg:max-w-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5 border"
                style={{ background: 'rgba(46,65,86,0.12)', borderColor: 'rgba(34,127,132,0.2)', color: '#032b63' }}>
                <Shield className="w-3 h-3" /> Zero buddy punching
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-5">
                Stop Paying for Hours<br />Nobody Worked
              </h2>
              <p className="text-slate-500 text-lg mb-6 leading-relaxed">
                Buddy punching costs Philippine companies billions annually. Onclock uses WebAuthn — the same biometric standard as banking apps — so only the right person can clock in for themselves.
              </p>
              <ul className="space-y-4 mb-8">
                {[
                  'Works on any Android or iOS device with a fingerprint sensor or Face ID',
                  'No special hardware — the employee\'s own phone is the authenticator',
                  'Cryptographically verified — impossible to spoof or replay',
                  'Admin can reset or re-enroll any employee from the portal',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-[#032b63] flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all"
                style={{ background: 'linear-gradient(135deg, #032b63, #021e47)' }}>
                Eliminate buddy punching today <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── GEOFENCING SPOTLIGHT ──────────────────────────────────────── */}
      <section className="py-20 overflow-hidden" style={{ background: '#f0fafa' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-14">
            {/* Visual — map mockup */}
            <div className="flex-1 flex justify-center">
              <div className="relative w-80 h-80">
                {/* Map bg */}
                <div className="w-full h-full rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
                  style={{ background: 'linear-gradient(135deg, #e8f4f8, #d4eaf0)' }}>
                  {/* Grid lines */}
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="absolute border-slate-300/30 border-b w-full" style={{ top: `${i * 20}%` }} />
                  ))}
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="absolute border-slate-300/30 border-r h-full" style={{ left: `${i * 20}%` }} />
                  ))}
                  {/* Geofence circle */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <div className="w-48 h-48 rounded-full border-4 border-dashed opacity-60 animate-pulse"
                        style={{ borderColor: '#032b63', background: 'rgba(46,65,86,0.12)' }} />
                      {/* Office pin */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full shadow-lg flex items-center justify-center border-2 border-white"
                          style={{ background: '#0055d4' }}>
                          <MapPin className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      {/* Employee dots inside */}
                      {[
                        { top: '25%', left: '35%', name: 'J', color: '#10b981' },
                        { top: '55%', left: '60%', name: 'M', color: '#10b981' },
                        { top: '35%', left: '65%', name: 'R', color: '#10b981' },
                      ].map((e) => (
                        <div key={e.name} className="absolute w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shadow border-2 border-white"
                          style={{ background: e.color, top: e.top, left: e.left }}>
                          {e.name}
                        </div>
                      ))}
                      {/* Employee dot outside — blocked */}
                      <div className="absolute w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shadow border-2 border-white"
                        style={{ background: '#ef4444', top: '-10%', left: '-10%' }}>
                        X
                      </div>
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-4 border border-slate-100 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />3 inside zone
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500" />1 blocked
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="flex-1 lg:max-w-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5 border"
                style={{ background: 'rgba(11,74,59,0.08)', borderColor: 'rgba(11,74,59,0.20)', color: '#021e47' }}>
                <MapPin className="w-3 h-3" /> GPS Geofencing
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-5">
                Clock-Ins Only From<br />Where You Allow
              </h2>
              <p className="text-slate-500 text-lg mb-6 leading-relaxed">
                Draw a radius around your office on the map. Employees outside that boundary simply cannot clock in — enforced at the app level and verified server-side.
              </p>
              <ul className="space-y-4 mb-8">
                {[
                  'Admin sets the geofence center + radius in Settings — takes 30 seconds',
                  'Live distance indicator shown to employee before clocking',
                  'Works for multiple locations and job sites',
                  'Integrates with the live attendance map for full visibility',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ────────────────────────────────────────────────── */}
      <section id="compliance" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4 border"
              style={{ background: 'rgba(46,65,86,0.12)', borderColor: 'rgba(34,127,132,0.2)', color: '#032b63' }}>
              <Globe className="w-3 h-3" /> Philippine Statutory Compliance
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Every Government Requirement,<br />Already Handled
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-lg">
              Stop worrying about contribution tables and filing formats. Onclock keeps up with regulatory changes so you don't have to.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-14">
            {complianceItems.map((c) => (
              <div key={c.name} className="rounded-3xl p-6 border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all text-center bg-white">
                <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-white shadow-md border border-slate-100 overflow-hidden p-2">
                  <Image
                    src={c.logo}
                    alt={c.name}
                    width={64}
                    height={64}
                    className="object-contain w-full h-full"
                  />
                </div>
                <p className="text-xs font-bold text-slate-800 mb-1">{c.label}</p>
                <p className="text-[11px] text-slate-400">{c.detail}</p>
              </div>
            ))}
          </div>

          {/* Payroll highlight */}
          <div className="rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #021e47, #032b63)' }}>
            <div className="flex flex-col lg:flex-row items-center gap-8 p-8 lg:p-12">
              <div className="flex-1 text-white">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-[#c4d9ff]" />
                  <span className="text-[#c4d9ff] text-sm font-bold">Automated Payroll Engine</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black mb-4">
                  From DTR to Payslip<br />in Under a Minute
                </h3>
                <p className="text-[#c4d9ff] leading-relaxed mb-6">
                  Attendance records feed directly into payroll. The engine computes SSS, PhilHealth, Pag-IBIG, withholding tax, OT, night differential, late deductions, loan amortizations — everything — before you approve.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {['Semi-monthly', 'Monthly', 'Weekly', 'Daily'].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-[#c4d9ff]">
                      <ChevronRight className="w-3.5 h-3.5 text-[#c4d9ff]" />
                      {f} payroll runs
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex justify-center">
                {/* Payslip mockup */}
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Juan dela Cruz</p>
                      <p className="text-[10px] text-slate-400">Software Engineer</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">APPROVED</span>
                  </div>
                  <div className="space-y-2 border-t border-slate-100 pt-4 mb-4">
                    {[
                      { label: 'Basic Pay', val: '₱15,000.00', pos: true },
                      { label: 'OT Pay', val: '₱1,800.00', pos: true },
                      { label: 'SSS', val: '-₱675.00', pos: false },
                      { label: 'PhilHealth', val: '-₱375.00', pos: false },
                      { label: 'Pag-IBIG', val: '-₱100.00', pos: false },
                      { label: 'W/Tax', val: '-₱812.50', pos: false },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between text-[11px]">
                        <span className="text-slate-500">{r.label}</span>
                        <span className={r.pos ? 'text-slate-800 font-semibold' : 'text-red-500 font-semibold'}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Net Pay</span>
                    <span className="text-base font-black" style={{ color: '#032b63' }}>₱14,837.50</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20" style={{ background: '#f8fafb' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Up and Running in a Day</h2>
            <p className="text-slate-500 text-lg">No lengthy onboarding. No consultants. Just three steps.</p>
          </div>
          <div className="relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-8 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#c4d9ff] to-transparent" style={{ marginLeft: '10%', marginRight: '10%' }} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {steps.map((s) => (
                <div key={s.n} className="relative text-center lg:text-left">
                  <div className="flex justify-center lg:justify-start mb-5">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #032b63, #021e47)' }}>
                      {s.n}
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mb-3">{s.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4 border"
              style={{ background: 'rgba(46,65,86,0.12)', borderColor: 'rgba(34,127,132,0.2)', color: '#032b63' }}>
              <Star className="w-3 h-3" /> Trusted by PH businesses
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900">What HR Managers Are Saying</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white rounded-3xl p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-100">
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-6 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                    style={{ background: t.color }}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role} · {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="py-24" style={{ background: 'linear-gradient(135deg, #021e47, #032b63)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6 border border-white/20 text-white/80">
            <Zap className="w-3 h-3" /> Start in minutes
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
            Ready to Automate<br />Your Payroll and<br />Attendance Management?
          </h2>
          <p className="text-[#c4d9ff] text-lg mb-10 max-w-2xl mx-auto">
            Join businesses across the Philippines that have eliminated buddy punching, automated payroll, and stayed fully compliant — without expensive hardware or consultants.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-white font-bold text-base shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
              style={{ background: 'linear-gradient(135deg, #ff5900, #ea580c)' }}
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:hello@onclock.ph"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-white font-bold text-base border-2 border-orange-300/60 bg-orange-500/20 hover:bg-orange-500/30 transition-all"
            >
              <Phone className="w-4 h-4" />
              Talk to Sales
            </a>
          </div>
          <p className="text-[#c4d9ff] text-xs mt-6">No credit card required · Free plan available · Cancel anytime</p>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-2">
              <Image src="/onclock-logo.png" alt="Onclock" width={120} height={40} className="object-contain h-8 w-auto mb-4 brightness-0 invert opacity-80" />
              <p className="text-sm leading-relaxed max-w-xs mb-5">
                The complete HR & Payroll platform built exclusively for Philippine businesses — from fingerprint attendance to BIR filing.
              </p>
              <div className="flex gap-3">
                {['FB', 'IG', 'LI'].map(s => (
                  <div key={s} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 hover:bg-[#021e47] hover:text-white transition-colors cursor-pointer">{s}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-bold mb-4">Product</p>
              <ul className="space-y-2.5 text-sm">
                {['Features', 'Pricing', 'Compliance', 'Security', 'Changelog'].map(l => (
                  <li key={l}><a href="#" className="hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-white text-sm font-bold mb-4">Company</p>
              <ul className="space-y-2.5 text-sm">
                {['About', 'Blog', 'Careers', 'Privacy Policy', 'Terms of Service'].map(l => (
                  <li key={l}><a href="#" className="hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <p>© 2025 Onclock. All rights reserved. Made with ❤️ in the Philippines.</p>
            <div className="flex gap-4">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />BIR Compliant</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />DOLE Aligned</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}


