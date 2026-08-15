declare module 'word-extractor' {
  class WordExtractor {
    extract(source: Buffer): Promise<{ getBody(options?: { filterUnicode?: boolean }): string }>
  }
  export = WordExtractor
}
