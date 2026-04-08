import { Font } from '@react-pdf/renderer'
import path from 'path'

const FAMILY = 'Montserrat'
const FLAG = '__pdf_montserrat_registered__'

type GlobalWithPdfFlag = typeof globalThis & { [FLAG]?: boolean }

export function registerPdfFonts() {
  const g = globalThis as GlobalWithPdfFlag
  if (g[FLAG]) return

  const fontsDir = path.join(process.cwd(), 'public', 'fonts', 'montserrat')
  const regular = path.join(fontsDir, 'Montserrat-Variable.ttf')
  const italic = path.join(fontsDir, 'Montserrat-Italic-Variable.ttf')

  Font.register({
    family: FAMILY,
    fonts: [
      { src: regular, fontWeight: 400, fontStyle: 'normal' },
      { src: italic, fontWeight: 400, fontStyle: 'italic' },
      { src: regular, fontWeight: 600, fontStyle: 'normal' },
      { src: italic, fontWeight: 600, fontStyle: 'italic' },
      { src: regular, fontWeight: 700, fontStyle: 'normal' },
      { src: italic, fontWeight: 700, fontStyle: 'italic' },
    ],
  })

  // Keep words intact for payroll codes and names.
  Font.registerHyphenationCallback(word => [word])
  g[FLAG] = true
}

