'use client'

import { useState, useEffect } from 'react'
import { Clock, FileText, Calendar, MapPin, Fingerprint, Shield, ChevronLeft, ChevronRight, Wifi, Battery } from 'lucide-react'

const SCREENS = [
  { id: 'clock', label: 'Clock In/Out' },
  { id: 'payslip', label: 'Payslip' },
  { id: 'leave', label: 'Leave Status' },
]

function useTime() {
  const [time, setTime] = useState<Date | null>(null)
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return time
}

function ClockScreen({ time }: { time: Date | null }) {
  const hh = time ? String(time.getHours()).padStart(2, '0') : '--'
  const mm = time ? String(time.getMinutes()).padStart(2, '0') : '--'
  const ss = time ? String(time.getSeconds()).padStart(2, '0') : '--'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dateStr = time
    ? `${days[time.getDay()]}, ${months[time.getMonth()]} ${time.getDate()} ${time.getFullYear()}`
    : '--'

  return (
    <div className="flex flex-col h-full px-3 pb-3 pt-2">
      {/* Greeting */}
      <div className="text-center mb-2">
        <p className="text-[8px] text-teal-300/70 font-semibold">Good morning,</p>
        <p className="text-[9px] text-white font-black">Maria R.</p>
      </div>

      {/* Live Clock */}
      <div className="text-center mb-1">
        <p className="text-[26px] font-black text-teal-300 tabular-nums leading-none tracking-tight">
          {hh}:{mm}
        </p>
        <p className="text-[7px] text-white/40 mt-0.5">{dateStr}</p>
        <p className="text-[9px] font-bold text-white/30 tabular-nums">:{ss}</p>
      </div>

      {/* Clock In button */}
      <div className="flex justify-center my-2">
        <div
          className="w-[70px] h-[70px] rounded-full flex flex-col items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #0b4a3b, #227f84)',
            boxShadow: '0 0 0 8px rgba(34,127,132,0.15), 0 0 0 16px rgba(34,127,132,0.07), 0 8px 20px rgba(0,0,0,0.5)',
          }}
        >
          <Clock className="w-6 h-6 text-white mb-0.5" />
          <span className="text-[7px] font-black text-white tracking-wider">CLOCK IN</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-0 mt-1 bg-white/5 rounded-xl overflow-hidden">
        <div className="flex-1 text-center py-2">
          <p className="text-[9px] font-black text-teal-300">8:02</p>
          <p className="text-[7px] text-white/40">Time In</p>
        </div>
        <div className="w-px bg-white/10" />
        <div className="flex-1 text-center py-2">
          <p className="text-[9px] font-black text-white/50">--:--</p>
          <p className="text-[7px] text-white/40">Time Out</p>
        </div>
        <div className="w-px bg-white/10" />
        <div className="flex-1 text-center py-2">
          <p className="text-[9px] font-black text-orange-400">0.0h</p>
          <p className="text-[7px] text-white/40">Hours</p>
        </div>
      </div>

      {/* Geofence status */}
      <div className="flex items-center gap-1.5 mt-2 bg-emerald-500/15 rounded-lg px-2.5 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        <p className="text-[7px] text-emerald-300 font-semibold">Within office zone · GPS Active</p>
      </div>
    </div>
  )
}

function PayslipScreen() {
  return (
    <div className="flex flex-col h-full px-3 pb-3 pt-2">
      <p className="text-[8px] text-white/40 font-semibold uppercase tracking-wide mb-2">Payslip · March 2026</p>

      {/* Net Pay */}
      <div className="bg-gradient-to-br from-teal-600/30 to-teal-800/30 rounded-xl p-2.5 mb-2 text-center">
        <p className="text-[7px] text-teal-300/70 font-semibold">NET PAY</p>
        <p className="text-[20px] font-black text-teal-300 leading-tight">₱ 24,850</p>
        <p className="text-[7px] text-white/30">After deductions</p>
      </div>

      {/* Line items */}
      {[
        { label: 'Basic Pay', amount: '₱ 28,000', color: 'text-white' },
        { label: 'SSS',       amount: '− ₱ 1,125', color: 'text-red-400' },
        { label: 'PhilHealth', amount: '− ₱ 700',  color: 'text-red-400' },
        { label: 'Pag-IBIG',  amount: '− ₱ 200',  color: 'text-red-400' },
        { label: 'Withholding Tax', amount: '− ₱ 1,125', color: 'text-red-400' },
      ].map((item) => (
        <div key={item.label} className="flex justify-between items-center py-0.5">
          <p className="text-[7px] text-white/50">{item.label}</p>
          <p className={`text-[7px] font-bold ${item.color}`}>{item.amount}</p>
        </div>
      ))}

      {/* Divider */}
      <div className="border-t border-white/10 my-1.5" />

      {/* Days worked */}
      <div className="flex gap-1">
        <div className="flex-1 bg-white/5 rounded-lg p-1.5 text-center">
          <p className="text-[9px] font-black text-white">22</p>
          <p className="text-[6px] text-white/40">Days Worked</p>
        </div>
        <div className="flex-1 bg-white/5 rounded-lg p-1.5 text-center">
          <p className="text-[9px] font-black text-orange-400">2</p>
          <p className="text-[6px] text-white/40">Late Days</p>
        </div>
        <div className="flex-1 bg-white/5 rounded-lg p-1.5 text-center">
          <p className="text-[9px] font-black text-emerald-400">0</p>
          <p className="text-[6px] text-white/40">Absences</p>
        </div>
      </div>
    </div>
  )
}

function LeaveScreen() {
  return (
    <div className="flex flex-col h-full px-3 pb-3 pt-2">
      <p className="text-[8px] text-white/40 font-semibold uppercase tracking-wide mb-2">Leave Balances</p>

      {/* Leave bars */}
      {[
        { type: 'Vacation Leave',  used: 3,  total: 15, color: '#7dd8db' },
        { type: 'Sick Leave',      used: 1,  total: 10, color: '#f97316' },
        { type: 'Emergency Leave', used: 0,  total: 3,  color: '#a78bfa' },
      ].map((leave) => (
        <div key={leave.type} className="mb-2.5">
          <div className="flex justify-between mb-1">
            <p className="text-[7px] text-white/60 font-semibold">{leave.type}</p>
            <p className="text-[7px] font-black" style={{ color: leave.color }}>{leave.total - leave.used} left</p>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${((leave.total - leave.used) / leave.total) * 100}%`,
                background: leave.color,
              }}
            />
          </div>
          <p className="text-[6px] text-white/30 mt-0.5">{leave.used} used of {leave.total} days</p>
        </div>
      ))}

      {/* Latest leave request */}
      <div className="mt-auto">
        <p className="text-[7px] text-white/30 uppercase tracking-wide mb-1">Latest Request</p>
        <div className="bg-white/5 rounded-xl px-2.5 py-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-3 h-3 text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[7px] font-bold text-white truncate">Vacation · Apr 3–4</p>
            <p className="text-[6px] text-white/40">2 days · Pending approval</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Fingerprint, label: 'Fingerprint Clock-In',  sub: 'No buddy punching' },
  { icon: MapPin,      label: 'GPS Geofencing',        sub: 'Live location tracking' },
  { icon: FileText,    label: 'Automated Payroll',     sub: 'BIR, SSS, PhilHealth ready' },
  { icon: Shield,      label: '100% Compliant',        sub: 'DOLE labor law compliant' },
]

export default function AuthLeftPanel() {
  const time = useTime()
  const [activeScreen, setActiveScreen] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  function goTo(nextFn: (prev: number) => number, dir: 'left' | 'right') {
    setTransitioning(true)
    setDirection(dir)
    setTimeout(() => {
      setActiveScreen(nextFn)
      setTransitioning(false)
    }, 300)
  }

  function navTo(idx: number) {
    if (idx === activeScreen) return
    const dir = idx > activeScreen ? 'left' : 'right'
    goTo(() => idx, dir)
  }

  // Auto-cycle screens every 4s
  useEffect(() => {
    const t = setInterval(() => {
      setTransitioning(true)
      setDirection('left')
      setTimeout(() => {
        setActiveScreen(prev => (prev + 1) % SCREENS.length)
        setTransitioning(false)
      }, 300)
    }, 4000)
    return () => clearInterval(t)
  }, [])
  const statusTime = time
    ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : '--:--'

  return (
    <div
      className="hidden lg:flex flex-col w-[58%] relative overflow-hidden"
      style={{ background: 'linear-gradient(150deg, #062d24 0%, #0b4a3b 45%, #227f84 100%)' }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-[-80px] right-[-80px] w-96 h-96 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #227f84, transparent)' }} />
      <div className="absolute bottom-[-60px] left-[-60px] w-72 h-72 rounded-full opacity-15"
        style={{ background: 'radial-gradient(circle, #fa5e01, transparent)' }} />

      <div className="relative z-10 flex flex-col h-full px-10 py-10">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/onclock-login.png" alt="Onclock" style={{ height: 40 }} />
        </div>

        {/* Headline */}
        <div className="mb-10">
          <h1 className="text-3xl font-black text-white leading-tight">
            Payroll & Time Keeping<br />
            <span style={{ color: '#7dd8db' }}>Management Made Easy</span>
          </h1>
          <p className="text-white/50 text-sm mt-2 leading-relaxed max-w-xs">
            Automate timekeeping, payroll, and government compliance — all in one platform.
          </p>
        </div>

        {/* ── PHONE + FEATURES ── */}
        <div className="flex items-center gap-8 flex-1">

          {/* Phone with float animation */}
          <div
            className="flex-shrink-0"
            style={{
              animation: 'phoneFloat 4s ease-in-out infinite',
            }}
          >
            {/* Phone outer glow */}
            <div
              style={{
                borderRadius: 28,
                padding: 3,
                background: 'linear-gradient(135deg, rgba(125,216,219,0.4), rgba(34,127,132,0.15))',
                boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(34,127,132,0.2)',
              }}
            >
              {/* Phone body */}
              <div
                style={{
                  width: 160,
                  height: 300,
                  borderRadius: 26,
                  background: 'linear-gradient(180deg, #0f1e1a 0%, #0a1612 100%)',
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {/* Status bar */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-2 pb-1 z-20"
                  style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }}>
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                    {statusTime}
                  </span>
                  <div className="flex items-center gap-1">
                    <Wifi style={{ width: 8, height: 8, color: 'rgba(255,255,255,0.5)' }} />
                    <Battery style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.5)' }} />
                  </div>
                </div>

                {/* Dynamic Island / Notch */}
                <div
                  className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30"
                  style={{
                    width: 52,
                    height: 14,
                    borderRadius: 999,
                    background: '#000',
                  }}
                />

                {/* Screen label pill */}
                <div
                  className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(125,216,219,0.15)', border: '1px solid rgba(125,216,219,0.2)' }}
                >
                  <span style={{ fontSize: 6, color: '#7dd8db', fontWeight: 700, letterSpacing: '0.05em' }}>
                    {SCREENS[activeScreen].label.toUpperCase()}
                  </span>
                </div>

                {/* Screen content with slide transition */}
                <div
                  className="absolute inset-0 pt-12"
                  style={{
                    opacity: transitioning ? 0 : 1,
                    transform: transitioning
                      ? `translateX(${direction === 'left' ? '-12px' : '12px'})`
                      : 'translateX(0)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                  }}
                >
                  {activeScreen === 0 && <ClockScreen time={time} />}
                  {activeScreen === 1 && <PayslipScreen />}
                  {activeScreen === 2 && <LeaveScreen />}
                </div>

                {/* Bottom home indicator */}
                <div
                  className="absolute bottom-1.5 left-1/2 -translate-x-1/2"
                  style={{ width: 40, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }}
                />
              </div>
            </div>

            {/* Screen dots + nav */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => navTo((activeScreen - 1 + SCREENS.length) % SCREENS.length)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              {SCREENS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => navTo(i)}
                  style={{
                    width: i === activeScreen ? 20 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === activeScreen ? '#7dd8db' : 'rgba(255,255,255,0.2)',
                    transition: 'all 0.3s ease',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              <button
                onClick={() => navTo((activeScreen + 1) % SCREENS.length)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Feature bullets */}
          <div className="flex-1 space-y-4">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3"
                style={{
                  animation: `featureFadeIn 0.5s ease forwards`,
                  animationDelay: `${i * 0.1}s`,
                  opacity: 0,
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(125,216,219,0.15)', border: '1px solid rgba(125,216,219,0.1)' }}
                >
                  <f.icon className="w-4 h-4 text-teal-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">{f.label}</p>
                  <p className="text-xs text-white/40">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance logos */}
        <div className="flex items-center gap-3 flex-wrap mt-8">
          <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Compliant with</span>
          {[
            { src: '/icons/bir.png',     alt: 'BIR' },
            { src: '/icons/sss.png',     alt: 'SSS' },
            { src: '/icons/PHIC.svg',    alt: 'PhilHealth' },
            { src: '/icons/pagibig.png', alt: 'Pag-IBIG' },
            { src: '/icons/dole.png',    alt: 'DOLE' },
          ].map((item) => (
            <div
              key={item.alt}
              className="w-9 h-9 rounded-xl flex items-center justify-center p-1.5 overflow-hidden"
              style={{
                background: '#ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt={item.alt} className="w-full h-full object-contain" />
            </div>
          ))}
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes phoneFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25%       { transform: translateY(-8px) rotate(0.5deg); }
          75%       { transform: translateY(-4px) rotate(-0.3deg); }
        }
        @keyframes featureFadeIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
