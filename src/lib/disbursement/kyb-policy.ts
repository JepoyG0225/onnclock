import { z } from 'zod'

export const businessTypes = ['sole_proprietor', 'partnership', 'corporation', 'opc'] as const
export const documentLabels: Record<string, string> = {
  bir_certificate_of_registration: 'BIR Certificate of Registration',
  dti_registration: 'DTI Business Name Registration',
  sec_registration: 'SEC Registration Certificate',
  articles_of_partnerships: 'Articles of Partnership',
  partnership_resolution: 'Notarized Partnership Resolution',
  articles_of_incorporation: 'Articles of Incorporation',
  by_laws: 'Notarized By-Laws',
  latest_gis: 'Latest General Information Sheet',
  sec_certificate: "Notarized Secretary’s Certificate",
  appointment_of_officers: 'OPC Appointment of Officers',
  others: 'Additional document requested by PayMongo',
}
export function requiredDocuments(type: string) {
  const common = ['bir_certificate_of_registration']
  if (type === 'sole_proprietor') return [...common, 'dti_registration']
  if (type === 'partnership') return [...common, 'sec_registration', 'articles_of_partnerships', 'partnership_resolution']
  if (type === 'opc') return [...common, 'sec_registration', 'articles_of_incorporation', 'appointment_of_officers', 'sec_certificate']
  if (type === 'corporation') return [...common, 'sec_registration', 'articles_of_incorporation', 'by_laws', 'latest_gis', 'sec_certificate']
  return []
}
export type Field = { key: string; label: string; options?: string[]; type?: string; hint?: string }
export const businessFields: Field[] = [
  { key: 'businessType', label: 'Business type', options: [...businessTypes] },
  { key: 'legalName', label: 'Registered legal name' }, { key: 'tradeName', label: 'Trade name' },
  { key: 'registrationNumber', label: 'SEC / DTI registration number' },
  { key: 'businessTin', label: 'Business TIN' }, { key: 'description', label: 'Business activities' },
  { key: 'industry', label: 'Merchant category code', hint: 'Four-digit MCC for your business, as required by PayMongo.' },
  { key: 'age', label: 'Business age', options: ['less_than_1_year', 'between_1_and_2_years', 'between_2_and_5_years', 'greater_than_5_years'] },
  { key: 'size', label: 'Number of employees', options: ['less_than_10', 'between_10_and_50', 'between_51_and_250', 'greater_than_250'] },
  { key: 'volume', label: 'Estimated monthly volume (PHP)', options: ['less_than_100K', 'between_100K_and_300K', 'between_300K_and_500K', 'between_500K_and_1M', 'between_1M_and_3M', 'greater_than_3M'] },
  { key: 'businessLine1', label: 'Business street address' }, { key: 'businessCity', label: 'Business city' },
  { key: 'businessState', label: 'Business province code', hint: 'ISO subdivision code, e.g. PH-00 for NCR. Confirm the code with PayMongo.' },
  { key: 'businessPostal', label: 'Business postal code' },
]
export const personFields: Field[] = [
  { key: 'firstName', label: 'Representative first name' }, { key: 'lastName', label: 'Representative last name' },
  { key: 'email', label: 'Representative email', type: 'email' }, { key: 'mobile', label: 'Mobile number', hint: 'International format, e.g. +639171234567' },
  { key: 'birthDate', label: 'Date of birth', type: 'date' }, { key: 'birthCity', label: 'City of birth' },
  { key: 'birthCountry', label: 'Country of birth (2-letter code)' },
  { key: 'nationality', label: 'Nationality (3-letter code)', hint: 'PHL for Filipino' },
  { key: 'natureOfWork', label: 'Nature of work', options: ['employed_locally', 'retired', 'pensioner', 'ofw', 'ofw_beneficiary', 'student', 'self_employed', 'unemployed_spouse_income', 'unemployed_other_income'] },
  { key: 'sourceOfFunds', label: 'Source of funds', options: ['salary', 'pension', 'allowance', 'commission', 'donation', 'other'] },
  { key: 'fundsName', label: 'Employer / business or source of funds' },
  { key: 'personTin', label: 'Representative TIN' },
  { key: 'personLine1', label: 'Residential street address' }, { key: 'personCity', label: 'Residential city' },
  { key: 'personState', label: 'Residential province code' }, { key: 'personPostal', label: 'Residential postal code' },
]
const fields = [...businessFields, ...personFields]
export const draftSchema = z.object(Object.fromEntries(fields.map(f => [f.key, z.string().trim().max(1000).optional()])))
export const profileSchema = z.object(Object.fromEntries(fields.map(f => [
  f.key, f.options ? z.enum(f.options as [string, ...string[]]) : z.string().trim().min(1, `${f.label} is required`).max(1000),
]))).superRefine((v, ctx) => {
  const check = (key: string, valid: boolean, message: string) => { if (!valid) ctx.addIssue({ code: 'custom', path: [key], message }) }
  check('email', z.string().email().safeParse(v.email).success, 'Enter a valid email.')
  check('mobile', /^\+[1-9]\d{7,14}$/.test(v.mobile), 'Use international phone format.')
  check('industry', /^\d{4}$/.test(v.industry), 'Enter a four-digit MCC.')
  check('nationality', /^[A-Z]{3}$/.test(v.nationality), 'Enter a three-letter country code.')
  check('birthCountry', /^[A-Z]{2}$/.test(v.birthCountry), 'Enter a two-letter country code.')
  const date = new Date(`${v.birthDate}T00:00:00Z`)
  check('birthDate', /^\d{4}-\d{2}-\d{2}$/.test(v.birthDate) && !isNaN(+date) && date.toISOString().slice(0, 10) === v.birthDate && +date < Date.now(), 'Enter a valid date of birth.')
})
export function accountProfile(p: Record<string, string>) {
  const [year, month, day] = p.birthDate.split('-').map(Number)
  const address = (prefix: string) => ({ line1: p[`${prefix}Line1`], city: p[`${prefix}City`], state: p[`${prefix}State`], postal_code: p[`${prefix}Postal`], country: 'PH' })
  return {
    person: {
      first_name: p.firstName, last_name: p.lastName, email_address: p.email, mobile_number: p.mobile,
      date_of_birth: { year, month, day }, nationality: p.nationality, nature_of_work: p.natureOfWork,
      place_of_birth: { city: p.birthCity, country: p.birthCountry },
      source_of_funds: p.sourceOfFunds,
      source_of_funds_salary: p.sourceOfFunds === 'salary' ? p.fundsName : null,
      source_of_funds_other: p.sourceOfFunds === 'other' ? p.fundsName : null,
      tin: p.personTin, address: address('person'),
    },
    business: {
      type: p.businessType === 'opc' ? 'corporation' : p.businessType,
      legal_name: p.legalName, trade_name: p.tradeName, registration_number: p.registrationNumber,
      tin: p.businessTin, description: p.description, industry: p.industry, age: p.age,
      size: p.size, estimated_monthly_volume: p.volume, address: address('business'),
    },
  }
}
export function walletBlockReason(input: {
  activationStatus: string; identityStatus: string; kybStatus: string; walletStatus?: string | null; walletType?: string | null
}) {
  if (input.activationStatus !== 'activated') return 'Complete account activation with PayMongo.'
  if (input.identityStatus !== 'passed') return 'The authorized representative must pass identity verification.'
  if (input.kybStatus !== 'completed') return 'PayMongo must approve the company’s business verification documents.'
  if (input.walletStatus !== 'activated') return 'Activate the wallet and sign PayMongo’s Statement of Acceptance.'
  // Explicit allowlist. Unknown/legacy provider values require confirmation, not optimistic enablement.
  if (!['default', 'upgraded', 'custom', 'fully_verified', 'enabled'].includes(input.walletType ?? '')) return 'PayMongo must enable this wallet for external bank transfers.'
  return null
}
