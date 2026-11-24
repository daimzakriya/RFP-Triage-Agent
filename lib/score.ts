/**
 * Fit rubric and decision rule. The model judges each factor and explains it;
 * this code clamps the points, adds them up and applies one transparent
 * decision rule, so the score can't drift from its explanation.
 */
import type { FitFactor, ModelOutput, ScoredFactor } from "./schema";

export const RUBRIC: Record<FitFactor["id"], { label: string; max: number; guide: string }> = {
  service_match: {
    label: "Service match",
    max: 4,
    guide:
      "Is the core work something idiaz.io builds (automation platforms, compliance tooling, AI-integrated ops software, web/mobile apps)? 4 = squarely our work; 2 = software is a minor part; 0 = not software (construction, janitorial, goods, staffing).",
  },
  team_fit: {
    label: "Team & delivery fit",
    max: 2,
    guide:
      "Can a small senior remote-friendly team deliver it? Penalise large on-site labour, 24/7 staffing, or heavy hardware/field work.",
  },
  eligibility: {
    label: "Eligibility & compliance",
    max: 2,
    guide:
      "Set-asides, registrations, certifications, clearances, insurance, bonds, past-performance minimums. 2 = nothing we clearly can't meet; 1 = several items to verify; 0 = a requirement we clearly can't meet.",
  },
  commercial: {
    label: "Contract value & terms",
    max: 1,
    guide: "Is the value/term worth a proposal and are the terms reasonable for a small firm? 0.5 if value is not stated.",
  },
  timeline: {
    label: "Timeline",
    max: 1,
    guide: "Is there enough time to write a good proposal and to deliver on the schedule?",
  },
};

export const BID_THRESHOLD = 6;

export function scoreFactors(factors: FitFactor[]): { score: number; scored: ScoredFactor[] } {
  const scored: ScoredFactor[] = (Object.keys(RUBRIC) as FitFactor["id"][]).map((id) => {
    const f = factors.find((x) => x.id === id);
    const { label, max } = RUBRIC[id];
    const points = f ? Math.min(max, Math.max(0, Math.round(f.points * 2) / 2)) : 0;
    return { id, label, max, points, reason: f?.reason ?? "Not assessed by the model; scored 0." };
  });
  let score = scored.reduce((n, f) => n + f.points, 0);
  const service = scored.find((f) => f.id === "service_match")!;
  if (service.points === 0) score = Math.min(score, 2); // not our kind of work: cap
  return { score: Math.round(score * 10) / 10, scored };
}

export function decide(model: ModelOutput, score: number, serviceMatch: number) {
  const blocking = model.deal_breakers.filter((d) => d.severity === "blocking");
  const fastNoBid = serviceMatch === 0;
  const ruleSaysBid = !fastNoBid && blocking.length === 0 && score >= BID_THRESHOLD;
  // Conservative: BID only when the rule and the model's judgement agree.
  const decision: "BID" | "NO_BID" = ruleSaysBid && model.recommendation === "BID" ? "BID" : "NO_BID";

  let note: string | null = null;
  if (fastNoBid) {
    note = "Fast no-bid: the core work is outside idiaz.io's services.";
  } else if (ruleSaysBid && model.recommendation === "NO_BID") {
    note = `The score (${score}/10) clears the bid threshold, but the model's judgement is NO_BID. Review the reasons before overriding.`;
  } else if (!ruleSaysBid && model.recommendation === "BID") {
    note =
      blocking.length > 0
        ? "The model leaned BID, but there is a blocking deal-breaker, so the decision is NO_BID."
        : `The model leaned BID, but the score is below ${BID_THRESHOLD}/10, so the decision is NO_BID.`;
  }
  return { decision, fastNoBid, note };
}
