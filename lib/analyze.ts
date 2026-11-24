import { callGemini, LlmError } from "./gemini";
import { systemPrompt, userPrompt } from "./prompt";
import { ModelOutputSchema, type FactKey, type ModelOutput, type ReviewFlag, type TriageReport } from "./schema";
import { decide, scoreFactors } from "./score";
import { checkRequirementCoverage, detectAddenda, DocumentIndex, fillMissingDeadlines, verifyDeadline, verifyItem } from "./verify";

const FACT_LABELS: Record<FactKey, string> = {
  agency: "Agency",
  scope: "Scope of work",
  contract_type: "Contract type",
  contract_value: "Contract value",
  work_location: "Work location",
  period_of_performance: "Contract term",
  submission_method: "How to submit",
};
export { FACT_LABELS };

/** Pure function: model JSON + document text -> verified, scored report. */
export function buildReport(args: {
  pages: string[];
  fileName: string;
  modelJson: unknown;
  model: { provider: string; name: string; latencyMs: number };
}): TriageReport {
  const parsed = ModelOutputSchema.safeParse(args.modelJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LlmError(`The model's answer did not match the report schema (${issue.path.join(".")}: ${issue.message}).`);
  }
  const m: ModelOutput = parsed.data;
  const idx = new DocumentIndex(args.pages);
  const flags: ReviewFlag[] = [];

  if (!m.is_rfp) {
    flags.push({ level: "warning", field: "document", message: "This document doesn't look like an RFP or solicitation. Treat the report with caution." });
  }

  const facts = Object.fromEntries(
    (Object.keys(m.facts) as FactKey[]).map((k) => [k, verifyItem(idx, m.facts[k], `facts.${k}`, flags)]),
  ) as TriageReport["facts"];

  const deadlines = fillMissingDeadlines(m.deadlines)
    .map((d) => verifyDeadline(idx, d, flags))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const requirements = m.requirements.map((r, i) => verifyItem(idx, r, `requirements[${i}]`, flags));
  const deal_breakers = m.deal_breakers.map((d, i) => verifyItem(idx, d, `deal_breakers[${i}]`, flags));
  const ambiguities = m.ambiguities.map((a, i) => verifyItem(idx, a, `ambiguities[${i}]`, flags));

  flags.push(...checkRequirementCoverage(idx, requirements));
  for (const a of ambiguities) flags.push({ level: "warning", field: "ambiguity", message: a.text });
  const addendum = detectAddenda(idx);
  if (addendum) flags.unshift(addendum);

  const { score, scored } = scoreFactors(m.fit_factors);
  const service = scored.find((f) => f.id === "service_match")!.points;
  const { decision, fastNoBid, note } = decide(m, score, service);

  const all = [facts, deadlines, requirements, deal_breakers, ambiguities].flatMap((g) =>
    Object.values(g).flatMap((x: { evidence: { check: string }[] }) => x.evidence),
  );

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    document: {
      fileName: args.fileName,
      pageCount: args.pages.length,
      characters: args.pages.reduce((n, p) => n + p.length, 0),
      truncated: false,
    },
    model: args.model,
    decision,
    fastNoBid,
    modelRecommendation: m.recommendation,
    decisionNote: note,
    fit_score: score,
    fit_factors: scored,
    title: m.title,
    solicitation_number: m.solicitation_number,
    summary: m.summary,
    facts,
    deadlines: deadlines.map((d) => ({ what: d.label, ...d })),
    requirements,
    reasons: m.reasons.slice(0, 3),
    change_mind: m.change_mind,
    deal_breakers,
    open_questions: m.open_questions,
    ambiguities,
    review_flags: flags,
    evidence_stats: {
      total: all.length,
      verified: all.filter((e) => e.check === "verified" || e.check === "relocated").length,
      approximate: all.filter((e) => e.check === "approximate").length,
      unverified: all.filter((e) => e.check === "unverified").length,
    },
  };
}

export async function analyzeDocument(pages: string[], fileName: string, signal?: AbortSignal): Promise<TriageReport> {
  const system = systemPrompt();
  const user = userPrompt(pages);
  const res = await callGemini(system, user, signal);
  return buildReport({ pages, fileName, modelJson: res.json, model: { provider: "Google Gemini", name: res.model, latencyMs: res.latencyMs } });
}
