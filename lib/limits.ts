/** Input limits shared by the browser (PDF reading) and the API route. */
export const LIMITS = {
  maxFileBytes: 30 * 1024 * 1024, // 30 MB
  maxPages: 150, // the brief says "up to about 100 pages"; this leaves headroom
  maxChars: 600_000, // ~150k tokens, well inside Gemini's context window
  minCharsPerPage: 120, // below this on average, the PDF is probably scanned
} as const;
