/**
 * Default scorecard competencies. Used to seed a company's editable competency
 * library on first access, and as the historical label source for the original
 * hardcoded keys. Companies can add/edit/delete from here via Settings.
 */
export interface DefaultCompetency {
  key: string
  label: string
  description: string
}

export const DEFAULT_COMPETENCIES: DefaultCompetency[] = [
  { key: 'jobKnowledge',  label: 'Job Knowledge',   description: 'Understanding of role responsibilities and technical skills' },
  { key: 'qualityOfWork', label: 'Quality of Work', description: 'Accuracy, thoroughness, and attention to detail' },
  { key: 'productivity',  label: 'Productivity',    description: 'Volume and efficiency of work output' },
  { key: 'communication', label: 'Communication',   description: 'Clarity, listening, and collaboration with others' },
  { key: 'teamwork',      label: 'Teamwork',        description: 'Contribution to team goals and positive work relationships' },
  { key: 'initiative',    label: 'Initiative',      description: 'Proactiveness, creativity, and going beyond what is required' },
  { key: 'reliability',   label: 'Reliability',     description: 'Consistency, punctuality, and dependability' },
]
