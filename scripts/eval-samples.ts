/**
 * Runs the full pipeline on the sample RFPs and checks the result against
 * evals/expected.json (hand-checked ground truth).
 *
 *   npm run eval              -> live Gemini call (needs GEMINI_API_KEY in .env.local or env)
 *   npm run eval -- --fixture -> offline, replays the recorded fixture answers
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { analyzeDocument, buildReport } from "../lib/analyze";
import { findFixture } from "../lib/fixtures";
import { extractPdfPages } from "../lib/pdf";
import type { TriageReport } from "../lib/schema";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const useFixture = process.argv.includes("--fixture");
const expected = JSON.parse(readFileSync("evals/expected.json", "utf8")) as Record<string, any>;
let failures = 0;

function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

for (const [file, exp] of Object.entries(expected)) {
  if (file.startsWith("_")) continue;
  console.log(`\n${file}`);
  const t0 = Date.now();
  const { pages } = await extractPdfPages(new Uint8Array(await readFile(file)));
  let report: TriageReport;
  if (useFixture) {
    const fx = findFixture(pages)!;
    report = buildReport({ pages, fileName: file, modelJson: fx.json, model: { provider: "fixture", name: fx.name, latencyMs: 0 } });
  } else {
    try {
      report = await analyzeDocument(pages, file);
    } catch (err) {
      check(false, "analysis completed", (err as Error).message);
      continue;
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${report.decision}  fit ${report.fit_score}/10  via ${report.model.name}  in ${secs}s`);

  check(report.decision === exp.decision, "decision", report.decision);
  if (exp.minScore != null) check(report.fit_score >= exp.minScore, `fit score >= ${exp.minScore}`, String(report.fit_score));
  if (exp.maxScore != null) check(report.fit_score <= exp.maxScore, `fit score <= ${exp.maxScore}`, String(report.fit_score));
  if (exp.fastNoBid) check(report.fastNoBid, "fast no-bid");
  for (const [kind, date] of Object.entries(exp.deadlines as Record<string, string | null>)) {
    const d = report.deadlines.find((x) => x.kind === kind);
    check((d?.date ?? null) === date, `date ${kind}`, `got ${d?.date ?? "Not stated"}, want ${date ?? "Not stated"}`);
  }
  const reqText = report.requirements.map((r) => `${r.text} ${r.evidence.map((e) => e.quote).join(" ")}`).join(" ").toLowerCase();
  for (const term of exp.mustMentionRequirements as string[]) {
    check(term.split("|").some((t) => reqText.includes(t)), `requirement mentions "${term.replace(/\|/g, '" or "')}"`);
  }
  const s = report.evidence_stats;
  check(s.unverified === 0, "all evidence quotes found in the PDF", `${s.verified}/${s.total} verified, ${s.approximate} approx, ${s.unverified} unverified`);
  check(Number(secs) <= 90, "finished in about a minute (<= 90 s)", `${secs}s`);
  for (const f of report.review_flags) console.log(`  flag[${f.level}] ${f.field}: ${f.message}`);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
