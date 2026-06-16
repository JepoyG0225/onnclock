/**
 * Sanitize a string for embedding in a PDF generated with pdf-lib's
 * built-in StandardFonts (Helvetica family). Those fonts use WinAnsi
 * (Windows-1252) encoding, which CANNOT encode characters outside
 * Latin-1 — including the Philippine peso sign (U+20B1, ₱), euro
 * (U+20AC, €), smart quotes, em dashes, ellipsis, NBSP, and anything
 * above U+00FF (CJK, emoji, etc.).
 *
 * This helper:
 *   - Substitutes peso / euro / yen signs with their 3-letter ISO code
 *   - Maps smart quotes, em/en dashes, and ellipsis to ASCII equivalents
 *   - Collapses non-breaking spaces to regular spaces
 *   - Replaces any remaining character above U+00FF with "?" so the
 *     PDF render never crashes on unexpected input
 *
 * Latin-1 characters (n with tilde, accented vowels, etc.) are left
 * alone because they ARE in WinAnsi's set.
 *
 * Use this everywhere a dynamic string flows into pdf-lib's drawText
 * with a StandardFont. If you embed a custom TTF font instead, you can
 * skip this and let pdf-lib subset the font for any glyph in the string.
 */
export function pdfTextSafe(text: string): string {
  return text
    .replace(/₱/g, 'PHP ')          // ₱ peso sign
    .replace(/€/g, 'EUR ')          // € euro
    .replace(/¥/g, 'JPY ')          // ¥ yen
    .replace(/ /g, ' ')             // NBSP -> regular space
    .replace(/[–—]/g, '-')     // en/em dash -> hyphen
    .replace(/[‘’]/g, "'")     // smart single quotes
    .replace(/[“”]/g, '"')     // smart double quotes
    .replace(/…/g, '...')           // ellipsis
    // Anything past Latin-1 that we didn't explicitly map — replace with ?
    // (covers CJK ideographs, emoji, mathematical symbols, etc.).
    .replace(/[Ā-￿]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
}
