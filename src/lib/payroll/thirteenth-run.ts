export const THIRTEENTH_RUN = 'THIRTEENTH_MONTH'
export const DOLE_THIRTEENTH_SOURCE = 'https://dole.gov.ph/php_assets/uploads/2026/11/LA-21-26-Guidelines-on-the-Payment-of-Thirteenth-Month-Pay.pdf'
export function thirteenthDeadline(year: number, now = new Date()) {
  const localDay = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const days = Math.round((Date.parse(`${year}-12-24T00:00:00Z`) - Date.parse(`${localDay}T00:00:00Z`)) / 86400000)
  return { days, label: days > 0 ? `${days} day${days===1?'':'s'} remaining` : days === 0 ? 'Due today' : `${Math.abs(days)} day${days===-1?'':'s'} overdue`, date: `December 24, ${year}` }
}
export function thirteenthTaxSplit(amount: number, priorBenefits: number) {
  const exempt = Math.min(amount, Math.max(0, 90000 - priorBenefits))
  return { exempt: Number(exempt.toFixed(2)), taxable: Number((amount - exempt).toFixed(2)) }
}
