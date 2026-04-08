// Philippines HR & Payroll - Regulatory Constants (2024)
// Single source of truth for all government-mandated rates and tables

// ─────────────────────────────────────────────
// BIR TRAIN LAW - Withholding Tax on Compensation
// Effective January 1, 2023 onwards (RA 10963 as amended by RA 11976)
// ─────────────────────────────────────────────

export interface TaxBracket {
  from: number
  to: number
  baseTax: number
  rate: number
  excessOver: number
}

export const BIR_ANNUAL_TAX_TABLE_2023: TaxBracket[] = [
  { from: 0,          to: 250_000,    baseTax: 0,          rate: 0,    excessOver: 0 },
  { from: 250_001,    to: 400_000,    baseTax: 0,          rate: 0.15, excessOver: 250_000 },
  { from: 400_001,    to: 800_000,    baseTax: 22_500,     rate: 0.20, excessOver: 400_000 },
  { from: 800_001,    to: 2_000_000,  baseTax: 102_500,    rate: 0.25, excessOver: 800_000 },
  { from: 2_000_001,  to: 8_000_000,  baseTax: 402_500,    rate: 0.30, excessOver: 2_000_000 },
  { from: 8_000_001,  to: Infinity,   baseTax: 2_202_500,  rate: 0.35, excessOver: 8_000_000 },
]

// ─────────────────────────────────────────────
// SSS 2024
// ─────────────────────────────────────────────

export const SSS_2024 = {
  EMPLOYEE_RATE: 0.045,     // 4.5%
  EMPLOYER_RATE: 0.095,     // 9.5%
  EC_LOW: 10,               // EC for MSC < ₱14,750
  EC_HIGH: 30,              // EC for MSC >= ₱14,750
  EC_THRESHOLD_MSC: 14_750,
  MIN_MSC: 4_000,
  MAX_MSC: 30_000,
  MSC_STEP: 500,
} as const

// ─────────────────────────────────────────────
// PHILHEALTH 2024
// ─────────────────────────────────────────────

export const PHILHEALTH_2024 = {
  RATE: 0.05,               // 5% total
  EMPLOYEE_RATE: 0.025,     // 2.5% employee share
  EMPLOYER_RATE: 0.025,     // 2.5% employer share
  MAX_SALARY: 100_000,      // salary ceiling for premium computation
  MIN_PREMIUM_TOTAL: 500,   // minimum total premium per month
} as const

// ─────────────────────────────────────────────
// PAG-IBIG (HDMF) 2024
// ─────────────────────────────────────────────

export const PAGIBIG_2024 = {
  EMPLOYEE_LOW_RATE: 0.01,  // 1% if monthly salary <= threshold
  EMPLOYEE_HIGH_RATE: 0.02, // 2% if monthly salary > threshold
  EMPLOYER_RATE: 0.02,      // 2% always
  THRESHOLD: 1_500,         // salary threshold for employee rate
  MAX_EMPLOYEE: 100,        // max employee contribution
  MAX_EMPLOYER: 100,        // max employer contribution
} as const

// ─────────────────────────────────────────────
// 13TH MONTH PAY
// ─────────────────────────────────────────────

export const THIRTEENTH_MONTH = {
  TAX_EXEMPT_LIMIT: 90_000, // First ₱90k is tax-exempt (RA 10963)
  DEADLINE_MONTH: 12,
  DEADLINE_DAY: 24,
} as const

// ─────────────────────────────────────────────
// DE MINIMIS BENEFITS - BIR Annual Limits
// ─────────────────────────────────────────────

export const DE_MINIMIS_ANNUAL_LIMITS = {
  RICE_SUBSIDY: 24_000,         // ₱2,000/month × 12
  CLOTHING_ALLOWANCE: 6_000,    // annual
  MEDICAL_CASH: 10_000,         // annual
  LAUNDRY_ALLOWANCE: 3_600,     // ₱300/month × 12
  EMPLOYEES_ACHIEVEMENT: 10_000, // annual
  UNIFORM_ALLOWANCE: 6_000,     // annual
} as const

// ─────────────────────────────────────────────
// OVERTIME MULTIPLIERS (DOLE Labor Code)
// ─────────────────────────────────────────────

export const OT_RATES = {
  REGULAR_DAY_OT: 1.25,          // Regular weekday OT: basic rate × 125%
  REST_DAY: 1.30,                 // Rest day work: basic rate × 130%
  REST_DAY_OT: 1.69,              // Rest day + OT: 130% × 130%
  REGULAR_HOLIDAY: 2.00,          // Regular holiday present: 200%
  REGULAR_HOLIDAY_OT: 2.60,       // Regular holiday + OT: 200% × 130%
  SPECIAL_HOLIDAY: 1.30,          // Special non-working holiday present: 130%
  SPECIAL_HOLIDAY_OT: 1.69,       // Special + OT: 130% × 130%
  NIGHT_DIFFERENTIAL: 0.10,       // +10% for hours 10PM-6AM
} as const

// ─────────────────────────────────────────────
// WORKING DAYS (Standard Philippine Calendar)
// ─────────────────────────────────────────────

export const WORKING_DAYS_PER_YEAR = 261   // approx. 5-day work week
export const WORKING_HOURS_PER_DAY = 8
export const WORKING_DAYS_PER_MONTH = 22   // average

// ─────────────────────────────────────────────
// PH PUBLIC HOLIDAYS 2025
// ─────────────────────────────────────────────

export interface PHHoliday {
  name: string
  date: string    // YYYY-MM-DD
  type: 'REGULAR' | 'SPECIAL_NON_WORKING' | 'SPECIAL_WORKING'
}

export const PH_HOLIDAYS_2025: PHHoliday[] = [
  { name: "New Year's Day",                  date: "2025-01-01", type: "REGULAR" },
  { name: "EDSA People Power Revolution",    date: "2025-02-25", type: "SPECIAL_NON_WORKING" },
  { name: "Araw ng Kagitingan",              date: "2025-04-09", type: "REGULAR" },
  { name: "Maundy Thursday",                 date: "2025-04-17", type: "REGULAR" },
  { name: "Good Friday",                     date: "2025-04-18", type: "REGULAR" },
  { name: "Black Saturday",                  date: "2025-04-19", type: "SPECIAL_NON_WORKING" },
  { name: "Labor Day",                       date: "2025-05-01", type: "REGULAR" },
  { name: "Independence Day",                date: "2025-06-12", type: "REGULAR" },
  { name: "Ninoy Aquino Day",                date: "2025-08-21", type: "SPECIAL_NON_WORKING" },
  { name: "National Heroes Day",             date: "2025-08-25", type: "REGULAR" },
  { name: "All Saints Day",                  date: "2025-11-01", type: "SPECIAL_NON_WORKING" },
  { name: "All Souls Day",                   date: "2025-11-02", type: "SPECIAL_NON_WORKING" },
  { name: "Bonifacio Day",                   date: "2025-11-30", type: "REGULAR" },
  { name: "Immaculate Conception Day",       date: "2025-12-08", type: "SPECIAL_NON_WORKING" },
  { name: "Christmas Day",                   date: "2025-12-25", type: "REGULAR" },
  { name: "Rizal Day",                       date: "2025-12-30", type: "REGULAR" },
  { name: "Last Day of Year",                date: "2025-12-31", type: "SPECIAL_NON_WORKING" },
]

export const PH_HOLIDAYS_2026: PHHoliday[] = [
  { name: "New Year's Day",                  date: "2026-01-01", type: "REGULAR" },
  { name: "EDSA People Power Revolution",    date: "2026-02-25", type: "SPECIAL_NON_WORKING" },
  { name: "Araw ng Kagitingan",              date: "2026-04-09", type: "REGULAR" },
  { name: "Maundy Thursday",                 date: "2026-04-02", type: "REGULAR" },
  { name: "Good Friday",                     date: "2026-04-03", type: "REGULAR" },
  { name: "Black Saturday",                  date: "2026-04-04", type: "SPECIAL_NON_WORKING" },
  { name: "Labor Day",                       date: "2026-05-01", type: "REGULAR" },
  { name: "Independence Day",                date: "2026-06-12", type: "REGULAR" },
  { name: "Ninoy Aquino Day",                date: "2026-08-21", type: "SPECIAL_NON_WORKING" },
  { name: "National Heroes Day",             date: "2026-08-31", type: "REGULAR" },
  { name: "All Saints Day",                  date: "2026-11-01", type: "SPECIAL_NON_WORKING" },
  { name: "All Souls Day",                   date: "2026-11-02", type: "SPECIAL_NON_WORKING" },
  { name: "Bonifacio Day",                   date: "2026-11-30", type: "REGULAR" },
  { name: "Immaculate Conception Day",       date: "2026-12-08", type: "SPECIAL_NON_WORKING" },
  { name: "Christmas Day",                   date: "2026-12-25", type: "REGULAR" },
  { name: "Rizal Day",                       date: "2026-12-30", type: "REGULAR" },
  { name: "Last Day of Year",                date: "2026-12-31", type: "SPECIAL_NON_WORKING" },
]

// ─────────────────────────────────────────────
// DOLE LEAVE TYPES (Default Seed Data)
// ─────────────────────────────────────────────

export const DEFAULT_LEAVE_TYPES = [
  {
    name: "Service Incentive Leave",
    code: "SIL",
    daysEntitled: 5,
    isWithPay: true,
    isMandatory: true,
    description: "5 days SIL per year for employees with at least 1 year of service (Art. 95, Labor Code)",
  },
  {
    name: "Vacation Leave",
    code: "VL",
    daysEntitled: 5,
    isWithPay: true,
    isMandatory: false,
    carryOver: true,
    maxCarryOver: 15,
    description: "Company-provided vacation leave",
  },
  {
    name: "Sick Leave",
    code: "SL",
    daysEntitled: 5,
    isWithPay: true,
    isMandatory: false,
    description: "Company-provided sick leave",
  },
  {
    name: "Maternity Leave",
    code: "ML",
    daysEntitled: 105,
    isWithPay: true,
    isMandatory: true,
    genderRestriction: "FEMALE",
    requiresDocuments: true,
    description: "105 days paid maternity leave (RA 11210). Additional 15 days for single mothers. C-section: 120 days.",
  },
  {
    name: "Paternity Leave",
    code: "PL",
    daysEntitled: 7,
    isWithPay: true,
    isMandatory: true,
    genderRestriction: "MALE",
    requiresDocuments: true,
    description: "7 days paternity leave for first 4 deliveries (RA 8187)",
  },
  {
    name: "Solo Parent Leave",
    code: "SPL",
    daysEntitled: 7,
    isWithPay: true,
    isMandatory: true,
    requiresDocuments: true,
    description: "7 additional leave days per year for solo parents with Solo Parent ID (RA 8972)",
  },
  {
    name: "VAWC Leave",
    code: "VAWC",
    daysEntitled: 10,
    isWithPay: true,
    isMandatory: true,
    genderRestriction: "FEMALE",
    requiresDocuments: true,
    description: "10 days leave for victims of Violence Against Women and Children (RA 9262)",
  },
  {
    name: "Bereavement Leave",
    code: "BL",
    daysEntitled: 3,
    isWithPay: true,
    isMandatory: false,
    description: "Leave for death of immediate family members",
  },
  {
    name: "Emergency Leave",
    code: "EL",
    daysEntitled: 3,
    isWithPay: false,
    isMandatory: false,
    description: "Emergency leave (without pay)",
  },
]

// ─────────────────────────────────────────────
// MINIMUM WAGE BY REGION (2024)
// ─────────────────────────────────────────────

export const MINIMUM_WAGE_2024: Record<string, number> = {
  NCR: 610,               // Metro Manila
  Region_I: 420,
  Region_II: 400,
  Region_III: 480,
  Region_IV_A: 470,
  Region_IV_B: 360,
  Region_V: 380,
  Region_VI: 460,
  Region_VII: 470,
  Region_VIII: 395,
  Region_IX: 393,
  Region_X: 440,
  Region_XI: 450,
  Region_XII: 400,
  Region_XIII: 380,
  ARMM: 305,
  CAR: 370,
}

// ─────────────────────────────────────────────
// DOCUMENT TYPES
// ─────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  "NBI_CLEARANCE",
  "POLICE_CLEARANCE",
  "BIRTH_CERTIFICATE",
  "MARRIAGE_CONTRACT",
  "DIPLOMA",
  "TRANSCRIPT_OF_RECORDS",
  "RESUME",
  "MEDICAL_CERTIFICATE",
  "PRE_EMPLOYMENT_MEDICAL",
  "SSS_FORM",
  "PHILHEALTH_MDR",
  "PAGIBIG_MEMBERSHIP",
  "TIN_CARD",
  "BARANGAY_CLEARANCE",
  "GOVERNMENT_ID",
  "EMPLOYMENT_CONTRACT",
  "GOVERNMENT_SERVICE_RECORD",
  "OTHER",
] as const
