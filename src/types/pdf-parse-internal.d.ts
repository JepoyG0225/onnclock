declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string
  }

  export default function parsePdf(
    data: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>
}
