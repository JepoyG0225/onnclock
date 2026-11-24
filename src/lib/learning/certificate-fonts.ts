export const certificateFontIds = ['montserrat', 'playfair-display', 'cormorant-garamond', 'cinzel', 'dancing-script', 'great-vibes'] as const
export type CertificateFontId = typeof certificateFontIds[number]

export const certificateFonts: Record<CertificateFontId, { label: string; style: string; family: string; regular: string; bold: string | null }> = {
  montserrat: { label: 'Montserrat', style: 'Modern', family: 'Certificate Montserrat', regular: 'regular.woff', bold: 'bold.woff' },
  'playfair-display': { label: 'Playfair Display', style: 'Elegant serif', family: 'Certificate Playfair', regular: 'playfair-display/regular.woff', bold: 'playfair-display/bold.woff' },
  'cormorant-garamond': { label: 'Cormorant Garamond', style: 'Classic serif', family: 'Certificate Cormorant', regular: 'cormorant-garamond/regular.woff', bold: 'cormorant-garamond/bold.woff' },
  cinzel: { label: 'Cinzel', style: 'Formal', family: 'Certificate Cinzel', regular: 'cinzel/regular.woff', bold: 'cinzel/bold.woff' },
  'dancing-script': { label: 'Dancing Script', style: 'Handwritten', family: 'Certificate Dancing', regular: 'dancing-script/regular.woff', bold: 'dancing-script/bold.woff' },
  'great-vibes': { label: 'Great Vibes', style: 'Calligraphy', family: 'Certificate Vibes', regular: 'great-vibes/regular.woff', bold: null },
}
export function certificateFont(id?: CertificateFontId) {
  return certificateFonts[id ?? 'montserrat']
}
