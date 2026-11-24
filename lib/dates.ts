const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/-\s*\n\s*/g, "") // hyphenated line breaks
    .replace(/\s+/g, " ")
    .trim();
}

/** All the ways an ISO date (YYYY-MM-DD) is commonly written in an RFP, normalized. */
export function dateVariants(iso: string): string[] {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return [];
  const full = MONTHS[m - 1];
  const abbr = MONTH_ABBR[m - 1];
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const ordinal = d + (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");
  return [
    `${full} ${d}, ${y}`,
    `${full} ${d} ${y}`,
    `${full} ${ordinal}, ${y}`,
    `${abbr}. ${d}, ${y}`,
    `${abbr} ${d}, ${y}`,
    `${d} ${full} ${y}`,
    `${m}/${d}/${y}`,
    `${mm}/${dd}/${y}`,
    `${m}/${d}/${String(y).slice(2)}`,
    `${iso}`,
  ];
}

/** Weaker match: month + day without the year (e.g. "December 3" in a sentence). */
export function dateVariantsNoYear(iso: string): string[] {
  const [, m, d] = iso.split("-").map(Number);
  return [`${MONTHS[m - 1]} ${d}`, `${MONTH_ABBR[m - 1]}. ${d}`, `${MONTH_ABBR[m - 1]} ${d}`];
}

const MONTH_RE = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?";
const FULL_DATE_RE = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;

/** Find every full calendar date in a piece of text, returned as ISO strings. */
export function findDates(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(FULL_DATE_RE)) {
    const key = m[1].toLowerCase().slice(0, 3);
    const month = MONTH_ABBR.indexOf(key) + 1;
    if (month > 0) found.add(isoOf(+m[3], month, +m[2]));
  }
  for (const m of text.matchAll(NUMERIC_DATE_RE)) {
    found.add(isoOf(+m[3], +m[1], +m[2]));
  }
  return [...found];
}

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function formatIsoLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${d}, ${y}`;
}

/** Whole days from `today` (local) to the ISO date. Negative = past. */
export function daysUntil(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

export function formatIsoShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const a = MONTH_ABBR[m - 1];
  return `${a[0].toUpperCase()}${a.slice(1)} ${d}, ${y}`;
}
