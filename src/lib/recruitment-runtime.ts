import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export function recruitmentModelsReady(): boolean {
  const db = prisma as unknown as Record<string, unknown>
  return Boolean(
    db.jobPost &&
    db.jobApplication &&
    db.onboardingProcess &&
    db.onboardingTemplate &&
    db.onboardingStepProgress
  )
}

export function recruitmentModelsUnavailableResponse() {
  return NextResponse.json(
    {
      error:
        'Recruitment module is temporarily unavailable because Prisma Client is outdated. Stop running Node processes, run `npx prisma generate`, and restart the app.',
      code: 'RECRUITMENT_MODELS_UNAVAILABLE',
    },
    { status: 503 }
  )
}
