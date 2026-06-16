import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — OnClock',
  description: 'The rules and conditions for using OnClock.',
}

const EFFECTIVE_DATE = 'May 28, 2026'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
        <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Effective date: {EFFECTIVE_DATE}</p>

        <Section title="Acceptance of terms">
          By accessing or using the OnClock service (the web portal, mobile apps,
          or desktop apps), you agree to be bound by these Terms of Service. If you
          are using OnClock as an employee, your employer is the customer of OnClock
          and is responsible for your account.
        </Section>

        <Section title="The service">
          OnClock provides workforce management software for employers, including
          time and attendance tracking, leaves, schedules, payroll, and related
          features. The exact features available to you depend on your employer&apos;s
          subscription plan and configuration.
        </Section>

        <Section title="Your account">
          You must provide accurate information when registering and keep your
          login credentials confidential. You are responsible for all activity that
          occurs under your account. Notify your employer or OnClock immediately if
          you suspect unauthorized use.
        </Section>

        <Section title="Acceptable use">
          You agree not to:
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>use the service in violation of any law;</li>
            <li>interfere with or disrupt the service or servers;</li>
            <li>reverse-engineer, decompile, or attempt to extract the source code,
                except where this restriction is prohibited by applicable law;</li>
            <li>misrepresent your identity or your location when clocking in;</li>
            <li>use the service to harass, abuse, or harm another person.</li>
          </ul>
        </Section>

        <Section title="Subscription and fees">
          Subscriptions are sold to employers, not individual employees. Pricing,
          renewal terms, and refund policies are governed by the separate
          subscription agreement between OnClock and the employer.
        </Section>

        <Section title="Intellectual property">
          The OnClock service, including all software, designs, text, and logos, is
          owned by OnClock or its licensors and protected by intellectual property
          laws. Subject to these Terms, OnClock grants you a limited, non-exclusive,
          non-transferable license to use the service for its intended purpose.
        </Section>

        <Section title="Termination">
          OnClock may suspend or terminate your access to the service if you
          violate these Terms or if your employer&apos;s subscription is cancelled.
          You can stop using the service at any time. Provisions that, by their
          nature, should survive termination (e.g. intellectual property, limitation
          of liability) will continue to apply.
        </Section>

        <Section title="Disclaimers">
          The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties
          of any kind, whether express or implied, including warranties of
          merchantability, fitness for a particular purpose, and non-infringement.
          OnClock does not warrant that the service will be uninterrupted, error-free,
          or completely secure.
        </Section>

        <Section title="Limitation of liability">
          To the maximum extent permitted by law, OnClock will not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or for
          any loss of profits or revenue, arising out of or relating to your use of
          the service. Our total liability for any claim relating to the service is
          limited to the amount your employer paid for the service in the twelve
          months preceding the claim.
        </Section>

        <Section title="Governing law">
          These Terms are governed by the laws of the Philippines, without regard
          to its conflict-of-law principles. Any disputes shall be brought
          exclusively in the courts of the Philippines.
        </Section>

        <Section title="Changes to these terms">
          We may update these Terms from time to time. Material changes will be
          announced through the app or by email; the new effective date will appear
          at the top of this page. Continued use of the service after the change
          means you accept the updated Terms.
        </Section>

        <Section title="Contact">
          Questions? Email <a href="mailto:support@onclockph.com" className="text-[#2E4156] underline">support@onclockph.com</a>.
        </Section>

        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <Link href="/" className="text-[#2E4156] hover:underline">← Back to home</Link>
          {' · '}
          <Link href="/privacy" className="text-[#2E4156] hover:underline">Privacy Policy</Link>
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
