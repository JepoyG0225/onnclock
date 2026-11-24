import { requireLearningAuth } from '@/lib/learning/access'

export async function LearningAccess({ children }: { children: React.ReactNode }) {
  const { error } = await requireLearningAuth()
  if (error) {
    const body = await error.json()
    return <div className="p-6"><h1 className="text-xl font-bold">Learning &amp; Certifications</h1><p className="mt-3">{body.error}</p></div>
  }
  return <>{children}</>
}
