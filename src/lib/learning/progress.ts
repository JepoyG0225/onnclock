type Progress = { lessonId: string; status: string; updatedAt: Date }

export function summarizeLearningProgress(
  status: string,
  lessonIds: string[],
  progress: Progress[],
  lastAttemptAt?: Date | null,
) {
  const currentLessons = new Set(lessonIds)
  const records = progress.filter(p => currentLessons.has(p.lessonId))
  const completedLessons = new Set(records.filter(p => p.status === 'COMPLETED').map(p => p.lessonId)).size
  const activeRecords = records.filter(p => p.status !== 'NOT_STARTED')
  const activity = [...activeRecords.map(p => p.updatedAt.getTime()), ...(lastAttemptAt ? [lastAttemptAt.getTime()] : [])]
  return {
    totalLessons: currentLessons.size,
    completedLessons,
    percent: currentLessons.size ? Math.round(completedLessons / currentLessons.size * 100) : null,
    status: status === 'ASSIGNED' && activity.length ? 'IN_PROGRESS' : status,
    lastActivityAt: activity.length ? new Date(Math.max(...activity)).toISOString() : null,
  }
}
