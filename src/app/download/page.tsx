import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

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
    <div className="min-h-screen bg-[#eef2f7] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h1 className="text-2xl font-black text-slate-900">OnClock Desktop Downloads</h1>
          <p className="text-sm text-slate-500 mt-1">Choose your account type, then choose your device platform.</p>
        </div>

        {sections.map((section) => (
          <section key={section.id} id={section.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{section.subtitle}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {platforms.map((platform) => (
                <a
                  key={platform.key}
                  href={`/api/desktop-app/download/${section.role}/${platform.key}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-[#2E4156] hover:text-[#1A2D42] transition-colors"
                >
                  <Image src={platform.icon} alt={platform.label} width={16} height={16} />
                  Download for {platform.label}
                </a>
              ))}
            </div>
          </section>
        ))}

        <div className="text-center">
          <Link href="/login" className="text-sm font-semibold text-[#2E4156] hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
