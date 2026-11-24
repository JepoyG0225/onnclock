import LeaveEncashmentsForm from '@/components/leaves/LeaveEncashmentsForm'

export default async function LeaveEncashmentsPage({ searchParams }: { searchParams: Promise<{ year?: string; balanceId?: string }> }) {
  const params = await searchParams
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()))
  const requested = Number(params.year ?? currentYear)
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2200 ? requested : currentYear
  return <LeaveEncashmentsForm key={`${year}:${params.balanceId ?? ''}`} initialYear={year} initialBalanceId={params.balanceId ?? ''} />
}
