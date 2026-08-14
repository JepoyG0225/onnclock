import Link from 'next/link'

export const metadata = {
  title: 'Support — OnClock',
  description: 'Get help with OnClock — contact support, FAQs, and account help.',
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
        <h1 className="text-3xl font-bold text-slate-900">Support</h1>
        <p className="mt-2 text-slate-600">
          Need help with OnClock? You&apos;re in the right place.
        </p>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Contact us</h2>
          <p className="mt-2 text-slate-700">
            Email us anytime and we&apos;ll get back to you within one business day.
          </p>
          <a
            href="mailto:support@onclockph.com"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#000000] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#000000] transition"
          >
            support@onclockph.com
          </a>
        </section>

        <Section title="Frequently asked questions">
          <Faq q="I can't log in — what should I do?">
            Make sure you&apos;re using the email address your employer registered for
            you. If you forgot your password, tap <b>Forgot password</b> on the login
            screen to reset it. If your account is still locked, ask your HR
            administrator to reset it.
          </Faq>
          <Faq q="The app says I'm outside the allowed clock-in area.">
            Your employer has configured a geofence around your workplace. Make sure
            location services are enabled for OnClock in your phone&apos;s Settings, and
            that you&apos;re physically within the allowed area when you tap Clock In.
          </Faq>
          <Faq q="Where can I see my payslip?">
            Open the OnClock app and go to <b>Payslips</b>. You&apos;ll see all payslips
            issued by your employer. Tap one to view or download as PDF.
          </Faq>
          <Faq q="How do I request a leave or time correction?">
            From the main menu, tap <b>Leaves</b> or <b>Time Corrections</b>, then
            fill out the form. Your HR administrator will receive the request for
            approval.
          </Faq>
          <Faq q="The app crashed or doesn't work right.">
            Try closing and reopening the app. If it still doesn&apos;t work, email
            us at <a className="text-[#000000] underline" href="mailto:support@onclockph.com">support@onclockph.com</a>
            with details of what you were doing — we&apos;ll investigate quickly.
          </Faq>
          <Faq q="I no longer work for my employer — what happens to my account?">
            Your employer will deactivate your account when your employment ends.
            You can request to have your data deleted by emailing us.
          </Faq>
        </Section>

        <Section title="For employers / admins">
          If you administer your company&apos;s OnClock account and need help with
          payroll, schedules, billing, or feature configuration, please email
          {' '}<a className="text-[#000000] underline" href="mailto:support@onclockph.com">support@onclockph.com</a>{' '}
          and we&apos;ll route you to the right team.
        </Section>

        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <Link href="/" className="text-[#000000] hover:underline">← Back to home</Link>
          {' · '}
          <Link href="/privacy" className="text-[#000000] hover:underline">Privacy Policy</Link>
          {' · '}
          <Link href="/terms" className="text-[#000000] hover:underline">Terms of Service</Link>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-900">{q}</p>
      <div className="mt-1 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </div>
  )
}
