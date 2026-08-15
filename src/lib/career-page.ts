export type CareerHeroContent = {
  subtext: string
  ctaLabel: string
  ctaUrl: string
}

const PREFIX = '__CAREER_HERO_V1__'

export function parseCareerHeroContent(value: string | null | undefined): CareerHeroContent {
  const fallback = { subtext: value ?? '', ctaLabel: 'View open positions', ctaUrl: '#open-positions' }
  if (!value?.startsWith(PREFIX)) return fallback
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as Partial<CareerHeroContent>
    return {
      subtext: typeof parsed.subtext === 'string' ? parsed.subtext : '',
      ctaLabel: typeof parsed.ctaLabel === 'string' ? parsed.ctaLabel : fallback.ctaLabel,
      ctaUrl: typeof parsed.ctaUrl === 'string' ? parsed.ctaUrl : fallback.ctaUrl,
    }
  } catch {
    return fallback
  }
}

export function serializeCareerHeroContent(content: CareerHeroContent) {
  return `${PREFIX}${JSON.stringify(content)}`
}
