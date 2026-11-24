/**
 * Deterministic checks on the model's output. The model is asked to quote its
 * sources; this module confirms those quotes really exist in the extracted
 * PDF text and that every date it reports is written on the page it cites.
 * Anything that fails is flagged for human review instead of being trusted.
 */
import { dateVariants, dateVariantsNoYear, findDates, formatIsoLong, normalize } from "./dates";
import type {
  Deadline,
  Evidence,
  ReviewFlag,
  Verified,
  VerifiedEvidence,
} from "./schema";

export class DocumentIndex {
  readonly norm: string[];
  readonly words: Set<string>[];
  constructor(readonly pages: string[]) {
    this.norm = pages.map(normalize);
    this.words = this.norm.map((p) => new Set(tokens(p)));
  }
  get pageCount() {
    return this.pages.length;
  }
}

function tokens(s: string): string[] {
  return s.split(/[^a-z0-9$%.]+/i).filter((w) => w.length > 1);
}

/** Split a quote on ellipses so "Proposals due ... 3:00 PM" checks each piece. */
function quoteSegments(quote: string): string[] {
  return normalize(quote)
    .replace(/^["']|["']$/g, "")
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function foundOnPage(idx: DocumentIndex, segments: string[], page: number): boolean {
  const text = idx.norm[page - 1];
  return !!text && segments.length > 0 && segments.every((s) => text.includes(s));
}

function overlapOnPage(idx: DocumentIndex, quote: string, page: number): number {
  const words = idx.words[page - 1];
  const q = tokens(normalize(quote));
  if (!words || q.length === 0) return 0;
  return q.filter((w) => words.has(w)).length / q.length;
}

export function verifyEvidence(idx: DocumentIndex, ev: Evidence): VerifiedEvidence {
  const segments = quoteSegments(ev.quote);
  const page = Math.min(Math.max(1, ev.page), idx.pageCount);

  if (ev.page <= idx.pageCount && foundOnPage(idx, segments, ev.page)) {
    return { ...ev, check: "verified" };
  }
  for (let p = 1; p <= idx.pageCount; p++) {
    if (foundOnPage(idx, segments, p)) return { ...ev, page: p, citedPage: ev.page, check: "relocated" };
  }
  if (overlapOnPage(idx, ev.quote, page) >= 0.85) return { ...ev, page, check: "approximate" };
  return { ...ev, check: "unverified" };
}

function evidenceNeedsReview(evs: VerifiedEvidence[]) {
  return evs.some((e) => e.check === "unverified" || e.check === "approximate");
}

/** Verify any object that carries `evidence` + optional `status`. */
export function verifyItem<T extends { evidence: Evidence[]; status?: string }>(
  idx: DocumentIndex,
  item: T,
  field: string,
  flags: ReviewFlag[],
): Verified<T> {
  const evidence = item.evidence.map((e) => verifyEvidence(idx, e));
  let needsReview = evidenceNeedsReview(evidence);

  const unverified = evidence.filter((e) => e.check === "unverified");
  if (unverified.length) {
    flags.push({
      level: "warning",
      field,
      message: `Source quote not found in the document (p. ${unverified.map((e) => e.page).join(", ")}). Check this item manually.`,
    });
  }
  if (item.status === "stated" && evidence.length === 0) {
    needsReview = true;
    flags.push({ level: "warning", field, message: "Reported as stated, but no source quote was given." });
  }
  if (item.status === "ambiguous") needsReview = true;

  return { ...item, evidence, needsReview };
}

/* ---------------------------- deadlines ---------------------------- */

export const REQUIRED_DEADLINES: { kind: Deadline["kind"]; label: string }[] = [
  { kind: "questions_due", label: "Questions / Q&A cut-off" },
  { kind: "proposal_due", label: "Proposal due" },
  { kind: "site_visit", label: "Site visit / walk-through" },
  { kind: "work_start", label: "Work start" },
];

function lineAround(text: string, needle: string): string {
  const i = text.indexOf(needle);
  if (i < 0) return "";
  const start = text.lastIndexOf("\n", i) + 1;
  const end = text.indexOf("\n", i + needle.length);
  return text.slice(start, end < 0 ? undefined : end);
}

export function verifyDeadline(
  idx: DocumentIndex,
  d: Deadline,
  flags: ReviewFlag[],
): Verified<Deadline> {
  const field = `deadlines.${d.kind}`;
  const v = verifyItem(idx, d, field, flags);
  if (!d.date) return v;

  const variants = dateVariants(d.date);
  const weak = dateVariantsNoYear(d.date);
  const quotes = v.evidence.map((e) => normalize(e.quote));
  const evPages = [...new Set(v.evidence.map((e) => e.page))];

  const inQuote = quotes.some((q) => variants.some((x) => q.includes(x)) || weak.some((x) => q.includes(x)));
  const onPage = evPages.some((p) => {
    const t = idx.norm[p - 1] ?? "";
    return variants.some((x) => t.includes(x));
  });

  if (!inQuote && !onPage) {
    v.needsReview = true;
    flags.push({
      level: "warning",
      field,
      message: `${formatIsoLong(d.date)} is not written in the cited source text. Confirm this date against the document.`,
    });
  }

  // Revised dates: the source line lists more than one calendar date
  // (e.g. a struck-through original next to the new date).
  for (const e of v.evidence) {
    const raw = idx.pages[e.page - 1] ?? "";
    const firstSeg = e.quote.split(/\.\.\.|…/)[0].trim().slice(0, 40);
    const line = lineAround(raw, firstSeg) || e.quote;
    const dates = findDates(line);
    if (dates.length > 1 && dates.includes(d.date)) {
      const others = dates.filter((x) => x !== d.date).map(formatIsoLong);
      flags.push({
        level: "info",
        field,
        message: `The source line also shows ${others.join(", ")}. This usually means a date was revised (for example, struck through by an addendum). Using ${formatIsoLong(d.date)}. Confirm it is the controlling date.`,
      });
      break;
    }
  }
  return v;
}

/** Add "Not stated" rows for the key dates the brief requires, if the model omitted them. */
export function fillMissingDeadlines(list: Deadline[]): Deadline[] {
  const out = [...list];
  for (const req of REQUIRED_DEADLINES) {
    if (!out.some((d) => d.kind === req.kind)) {
      out.push({
        kind: req.kind,
        label: req.label,
        date: null,
        time: null,
        timezone: null,
        mandatory: false,
        status: "not_stated",
        note: "Not stated in the document.",
        evidence: [],
      });
    }
  }
  return out;
}

/** Document-level scan for addenda that change dates. */
export function detectAddenda(idx: DocumentIndex): ReviewFlag | null {
  for (let p = 0; p < idx.pageCount; p++) {
    const t = idx.norm[p];
    if (/addend(um|a)\b/.test(t) && /(extended|revised|changed|postponed|moved) (from|to)/.test(t)) {
      return {
        level: "info",
        field: "document",
        message: `An addendum on page ${p + 1} changes the schedule. The dates shown use the revised schedule. Check the agency's portal for any later addenda.`,
      };
    }
  }
  return null;
}

/* ------------------------- requirement coverage ------------------------- */

/**
 * Safety net for "no requirement is missed": if the document clearly talks
 * about a topic (e.g. insurance limits) but no extracted requirement mentions
 * it, flag the page for a human to check. Patterns run on normalized text.
 */
const COVERAGE: { topic: string; doc: RegExp; req: RegExp }[] = [
  { topic: "insurance requirements", doc: /\b(general|professional|cyber|automobile|umbrella) liability\b|\binsurance\b.{0,80}\$[\d,]+/, req: /insurance|liability|\bcgl\b|workers.? comp/ },
  { topic: "bond requirements", doc: /\b(bid|performance|payment|fidelity|surety) bond\b|\bbid guarant(y|ee)\b/, req: /bond|guarant/ },
  { topic: "wage requirements", doc: /\b(prevailing|living|minimum) wage\b|davis-bacon/, req: /wage|davis-bacon/ },
  { topic: "security clearance or background checks", doc: /\bsecurity clearance\b|\b(must|shall|required to) (pass|undergo|complete|obtain)[^.]{0,60}background check|\bfingerprint/, req: /clearance|background|fingerprint/ },
  { topic: "set-aside or preference rules", doc: /\bset[- ]aside\b|\b8\(a\)|\bhubzone\b|\bsdvosb\b|\bwosb\b|\bmbe\/wbe\b|\bprice preference\b/, req: /set[- ]aside|small business|8\(a\)|hubzone|sdvosb|wosb|mbe|wbe|preference/ },
  { topic: "certification requirements", doc: /\bsoc 2\b|\biso 27001\b|\bfedramp\b|\bcmmi\b|\bstatewide certification\b/, req: /soc 2|iso|fedramp|cmmi|certif/ },
  { topic: "years-in-business or experience minimums", doc: /\b(at least|minimum of) (\w+ )?\(?\d+\)? (continuous )?years\b/, req: /year/ },
];

export function checkRequirementCoverage(
  idx: DocumentIndex,
  requirements: { text: string; evidence: { quote: string }[] }[],
): ReviewFlag[] {
  const reqText = normalize(requirements.map((r) => `${r.text} ${r.evidence.map((e) => e.quote).join(" ")}`).join(" "));
  const flags: ReviewFlag[] = [];
  for (const c of COVERAGE) {
    if (c.req.test(reqText)) continue;
    const pages = idx.norm.map((t, i) => (c.doc.test(t) ? i + 1 : 0)).filter(Boolean);
    if (pages.length) {
      flags.push({
        level: "warning",
        field: "requirements",
        message: `The document mentions ${c.topic} (p. ${pages.slice(0, 4).join(", ")}), but no matching requirement was extracted. Check that section.`,
      });
    }
  }
  return flags;
}
