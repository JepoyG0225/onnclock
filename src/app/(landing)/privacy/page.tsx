import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — OnClock',
  description: 'How OnClock collects, uses, and protects your personal information.',
}

const EFFECTIVE_DATE = 'May 28, 2026'

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective date: {EFFECTIVE_DATE}</p>

        <Section title="Who we are">
          OnClock (&quot;OnClock,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides workforce management
          software — including a web portal and mobile and desktop apps — used by employers
          to manage employee time, attendance, leaves, schedules, and payroll. This policy
          explains what personal information we collect, why we collect it, and how we use
          and share it.
        </Section>

        <Section title="The information we collect">
          We collect personal information in three ways:
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><b>Information your employer provides about you</b> — name, email,
                employee number, department, position, hire date, employment status,
                compensation details, and similar HR records.</li>
            <li><b>Information you provide directly</b> — when you sign in, file a leave
                request, submit a time correction, upload a payslip attachment, or
                contact support.</li>
            <li><b>Information collected automatically when you use the app</b> —
                described in the next section.</li>
          </ul>
        </Section>

        <Section title="Information collected automatically">
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><b>Location</b> — when you clock in or out, we capture your device&apos;s
                precise location to verify that you are within your employer&apos;s configured
                geofence. Location is recorded only at the moment of the clock-in/out event,
                not continuously in the background.</li>
            <li><b>Photos</b> — if your employer requires a verification selfie at clock-in,
                we capture a still image using your device camera and store it with the
                attendance record.</li>
            <li><b>Screen captures (Desktop monitoring app only)</b> — if your employer
                enables the screen-monitoring feature, the OnClock Desktop app captures
                periodic screenshots while you are clocked in. The desktop app shows a
                visible indicator while monitoring is active. Mobile apps do not capture
                screenshots.</li>
            <li><b>Device and usage information</b> — IP address, device identifier,
                operating system, browser, app version, and basic interaction logs used
                to operate and secure the service.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          We use the information described above to:
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Authenticate you and provide access to your employer&apos;s OnClock account.</li>
            <li>Record attendance, leaves, schedules, and payroll on behalf of your employer.</li>
            <li>Verify attendance using geofence and (where enabled) selfie or screen
                capture.</li>
            <li>Notify you about approvals, requests, and other workplace events.</li>
            <li>Improve, secure, and maintain the OnClock service.</li>
            <li>Comply with applicable laws and respond to lawful requests.</li>
          </ul>
        </Section>

        <Section title="How we share your information">
          We share your personal information only as follows:
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><b>With your employer</b> — your employer is the controller of your
                workplace data and has access to your attendance, leaves, payroll, and
                related records.</li>
            <li><b>With service providers</b> — vendors who help us host and operate the
                service (cloud hosting, database, email delivery, payments, push
                notifications, error monitoring). These vendors are bound by contract to
                use the information only for OnClock&apos;s purposes.</li>
            <li><b>For legal reasons</b> — when required by law, regulation, court order,
                or to protect the rights, property, or safety of OnClock, our customers,
                or others.</li>
            <li><b>With your consent</b> — for any other purpose disclosed at the time
                you provide the information.</li>
          </ul>
          <p className="mt-2">We do not sell your personal information.</p>
        </Section>

        <Section title="How long we keep it">
          We retain personal information for as long as your employer maintains an active
          account, plus a reasonable archival period to comply with legal,
          accounting, and audit obligations. Your employer can request earlier deletion
          of specific records.
        </Section>

        <Section title="Your choices and rights">
          Depending on where you live, you may have the right to access, correct, export,
          or delete your personal information, and to object to or restrict certain
          processing. Because your employer is the primary data controller for your
          workplace records, please direct such requests to your employer first. You can
          also email us at <Mail /> and we will assist or pass the request along.
        </Section>

        <Section title="Security">
          We use industry-standard administrative, technical, and physical safeguards to
          protect your personal information, including encryption in transit, encrypted
          credentials storage, and access controls. No method of transmission or storage
          is perfectly secure, but we work continuously to keep your data safe.
        </Section>

        <Section title="Children">
          OnClock is intended for use by adult employees. We do not knowingly collect
          personal information from anyone under 16.
        </Section>

        <Section title="Changes to this policy">
          We may update this policy from time to time. We will post the new effective
          date at the top of the page and, when changes are material, notify users
          through the app or by email.
        </Section>

        <Section title="Contact us">
          Questions about this policy? Email <Mail /> or write to OnClock PH at our
          registered office in the Philippines.
        </Section>

        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <Link href="/" className="text-[#2E4156] hover:underline">← Back to home</Link>
          {' · '}
          <Link href="/terms" className="text-[#2E4156] hover:underline">Terms of Service</Link>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

function Mail() {
  return (
    <a href="mailto:support@onclockph.com" className="text-[#2E4156] underline">support@onclockph.com</a>
  )
}
