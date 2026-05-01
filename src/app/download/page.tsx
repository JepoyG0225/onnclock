import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle, Download } from 'lucide-react'
import { LandingNav } from '@/app/(landing)/landing-nav'

export const metadata: Metadata = {
  title: 'Download OnClock Desktop Apps',
  description: 'Download the OnClock desktop app for Admin and Employee on Windows and macOS.',
}

const sections = [
  {
    id: 'admin',
    title: 'Download Desktop App for Admin',
    subtitle: 'Use this app for Company Admin and HR operations.',
    role: 'admin',
  },
  {
    id: 'employee',
    title: 'Download Desktop App for Employee',
    subtitle: 'Use this app for employee clock-in, monitoring, and attendance.',
    role: 'employee',
  },
] as const

const platforms = [
  { key: 'windows', label: 'Windows', icon: '/platform-icons/windows.svg' },
  { key: 'mac', label: 'macOS', icon: '/platform-icons/mac-21.png' },
] as const

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#f5f8fb]">
      <LandingNav />

      <main className="pt-28 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <section className="rounded-3xl bg-gradient-to-r from-[#1A2D42] to-[#2E4156] px-6 py-10 sm:px-10 text-white shadow-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <Download className="w-3.5 h-3.5" />
              Desktop Installer Hub
            </p>
            <h1 className="mt-4 text-3xl sm:text-4xl font-black">Download OnClock Desktop Apps</h1>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-2xl">
              Select the app type first, then choose your operating system. Each button routes to a dedicated installer link.
            </p>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            {sections.map((section) => (
              <article key={section.id} id={section.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-slate-900">{section.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{section.subtitle}</p>
                <div className="mt-5 space-y-3">
                  {platforms.map((platform) => (
                    <a
                      key={platform.key}
                      href={`/api/desktop-app/download/${section.role}/${platform.key}`}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-[#2E4156] hover:bg-white transition-all"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Image src={platform.icon} alt={platform.label} width={18} height={18} />
                        {platform.label}
                      </span>
                      <span className="text-xs text-slate-500">Download</span>
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />Separate links per app type</span>
            <span className="inline-flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />Windows and macOS installers</span>
            <Link href="/login" className="font-semibold text-[#2E4156] hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-2">
              <Image src="/onclock-logo.png" alt="Onclock" width={120} height={40} className="object-contain h-8 w-auto mb-4 brightness-0 invert opacity-80" />
              <p className="text-sm leading-relaxed max-w-xs mb-5">
                The complete HR & Payroll platform built exclusively for Philippine businesses — from fingerprint attendance to BIR filing.
              </p>
            </div>
            <div>
              <p className="text-white text-sm font-bold mb-4">Product</p>
              <ul className="space-y-2.5 text-sm">
                {['Features', 'Pricing', 'Compliance', 'Security', 'Changelog'].map((item) => (
                  <li key={item}><a href="#" className="hover:text-white transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-white text-sm font-bold mb-4">Company</p>
              <ul className="space-y-2.5 text-sm">
                {['About', 'Blog', 'Careers', 'Privacy Policy', 'Terms of Service'].map((item) => (
                  <li key={item}><a href="#" className="hover:text-white transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <p>© 2026 Onclock. All rights reserved. Made in the Philippines.</p>
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
