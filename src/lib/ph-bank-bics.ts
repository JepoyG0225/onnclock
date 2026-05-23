/**
 * Common Philippine bank BIC (SWIFT) codes for PayMongo disbursements.
 * Source: BSP / PayMongo institution list.
 */
export const PH_BANK_BICS: Record<string, string> = {
  'BDO Unibank':           'BNORPHMMXXX',
  'BPI':                   'BOPIPHMMXXX',
  'Metrobank':             'MBTCPHMM',
  'UnionBank':             'UBPHPHMMXXX',
  'Security Bank':         'SETCPHMM',
  'Landbank':              'TLBAPHMM',
  'PNB':                   'PNBMPHMMXXX',
  'RCBC':                  'RCBCPHMM',
  'Chinabank':             'CHBKPHMMXXX',
  'EastWest Bank':         'EWBCPHMM',
  'PSBank':                'PSBCPHMM',
  'AUB':                   'AUBBPHMMXXX',
  'DBP':                   'DBPMPHMM',
  'Maybank Philippines':   'MBBEPHMMXXX',
  'CTBC Bank':             'CTCBPHM2XXX',
  'GCash (Globe Fintech)': 'GCSHPHM2XXX',
  'Maya (Voyager)':        'PAEYPHM2XXX',
  'GoTyme Bank':           'GTBKPHMM',
  'Tonik Bank':            'TNKBPHMM',
  'SeaBank':               'SEABPHM2XXX',
  'OwnBank':               'OWNBPHMM',
  'ShopeePay':             'AIRAPH22XXX',
}

/** Bank name options for the employee bank form dropdown. */
export const PH_BANK_NAMES = Object.keys(PH_BANK_BICS)

/** Look up BIC by bank name (case-insensitive partial match). */
export function lookupBic(bankName: string): string | undefined {
  const lower = bankName.toLowerCase()
  const match = Object.entries(PH_BANK_BICS).find(([name]) =>
    name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase()),
  )
  return match?.[1]
}

/** Determine disbursement channel based on amount. */
export function disbursementChannel(amountPeso: number): 'instapay' | 'pesonet' {
  return amountPeso <= 50_000 ? 'instapay' : 'pesonet'
}
