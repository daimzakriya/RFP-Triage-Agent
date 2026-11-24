"use client";

import { useState } from "react";
import { daysUntil, formatIsoLong } from "@/lib/dates";
import type { Requirement, TriageReport } from "@/lib/schema";
import { EvidenceList } from "./Evidence";

const FACT_LABELS: Record<keyof TriageReport["facts"], string> = {
  agency: "Agency",
  scope: "Scope of work",
  contract_type: "Contract type",
  contract_value: "Contract value",
  work_location: "Work location",
  period_of_performance: "Contract term",
  submission_method: "How to submit",
};

const REQ_LABELS: Record<Requirement["category"], string> = {
  set_aside: "Set-asides & preferences",
  past_performance: "Experience & past performance",
  certification: "Certifications",
  security_clearance: "Security clearances & background checks",
  registration: "Registrations",
  staffing: "Staffing & key personnel",
  skill: "Required skills & capabilities",
  technical: "Technical mandates",
  insurance_bonding: "Insurance & bonding",
  other: "Other",
};
const REQ_ORDER = Object.keys(REQ_LABELS) as Requirement["category"][];

export function DaysLeft({ iso }: { iso: string }) {
  const n = daysUntil(iso);
  const cls = n < 0 ? "" : n <= 7 ? "urgent" : n <= 21 ? "soon" : "";
  const txt = n < 0 ? `${-n}d ago` : n === 0 ? "today" : `in ${n}d`;
  return <span className={`days ${cls}`}>{txt}</span>;
}

function StatusChip({ status, needsReview }: { status: string; needsReview?: boolean }) {
  if (status === "ambiguous") return <span className="chip chip-warn">ambiguous</span>;
  if (needsReview) return <span className="chip chip-warn">check source</span>;
  return null;
}

export function Report({ report, onDownloadIcs }: { report: TriageReport; onDownloadIcs: () => void }) {
  const r = report;
  const bid = r.decision === "BID";
  const [copied, setCopied] = useState(false);
  const warnings = r.review_flags.filter((f) => f.level === "warning");
  const infos = r.review_flags.filter((f) => f.level === "info");

  const grouped = REQ_ORDER.map((cat) => ({ cat, items: r.requirements.filter((q) => q.category === cat) })).filter((g) => g.items.length);

  function copyQuestions() {
    const text = `Subject: ${r.solicitation_number || r.title}: Questions\n\nHello,\n\nWe have the following questions about ${r.solicitation_number ? `RFP ${r.solicitation_number}` : "this solicitation"}:\n\n${r.open_questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n")}\n\nThank you,\n`;
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  return (
    <div>
      {/* ---------- decision ---------- */}
      <section className="card" aria-labelledby="decision-h">
        <div className="hero">
          <div className={`verdict ${bid ? "bid" : "nobid"}`}>
            <div className="label" style={{ color: "inherit" }}>Recommendation</div>
            <div className="word" id="decision-h">{bid ? "BID" : "NO BID"}</div>
            <div className="score">
              <b>{r.fit_score}</b> / 10 fit
            </div>
            <div className="gauge" aria-hidden="true">
              <span style={{ width: `${r.fit_score * 10}%` }} />
            </div>
            {r.fastNoBid && <div style={{ marginTop: 10 }}><span className="chip chip-nobid">⚡ fast no-bid</span></div>}
          </div>
          <div>
            <div className="label">{r.solicitation_number || "No solicitation number"} · {r.facts.agency.value}</div>
            <h2 style={{ marginTop: 4 }}>{r.title}</h2>
            {r.decisionNote && <div className="alert alert-info" style={{ margin: "10px 0" }}>{r.decisionNote}</div>}
            <h3 style={{ marginTop: 14 }}>Three strongest reasons</h3>
            <ol className="reasons">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ol>
            {r.change_mind.length > 0 && (
              <>
                <h3 style={{ marginTop: 12 }}>What would change our mind</h3>
                <ul className="reasons">{r.change_mind.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ---------- review flags ---------- */}
      <section className="card" aria-labelledby="review-h">
        <div className="card-head">
          <h2 id="review-h">Check before you trust it</h2>
          <span className="small muted">
            {r.evidence_stats.verified}/{r.evidence_stats.total} source quotes found word for word
            {r.evidence_stats.unverified > 0 && <> · <b style={{ color: "var(--nobid)" }}>{r.evidence_stats.unverified} not found</b></>}
          </span>
        </div>
        {r.review_flags.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>No conflicts, ambiguities or unverified quotes were found.</p>
        ) : (
          <ul className="flags">
            {[...warnings, ...infos].map((f, i) => (
              <li key={i} className={`alert ${f.level === "warning" ? "alert-warn" : "alert-info"}`}>
                <span aria-hidden="true">{f.level === "warning" ? "⚠" : "ℹ"}</span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div>
          {/* ---------- summary & facts ---------- */}
          <section className="card" aria-labelledby="summary-h">
            <div className="label"><span className="num">01</span>Summary</div>
            <h2 id="summary-h" className="sr-only">Summary</h2>
            <p style={{ marginTop: 6 }}>{r.summary}</p>
            <div className="kv" style={{ marginTop: 8 }}>
              {(Object.keys(FACT_LABELS) as (keyof typeof FACT_LABELS)[]).map((k) => {
                const f = r.facts[k];
                return (
                  <div key={k} style={{ display: "contents" }}>
                    <div className="k">{FACT_LABELS[k]}</div>
                    <div className={f.needsReview ? "review" : ""}>
                      {f.status === "not_stated" ? <span className="not-stated">Not stated</span> : f.value}{" "}
                      <StatusChip status={f.status} needsReview={f.needsReview} />
                      <EvidenceList evidence={f.evidence} />
                      {f.note && <div className="note">{f.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- requirements ---------- */}
          <section className="card" aria-labelledby="req-h">
            <div className="label"><span className="num">03</span>Requirements</div>
            <h2 id="req-h" className="sr-only">Requirements</h2>
            {grouped.length === 0 && <p className="not-stated">No requirements stated.</p>}
            {grouped.map((g) => (
              <div className="req-group" key={g.cat}>
                <h3 style={{ marginTop: 10 }}>{REQ_LABELS[g.cat]}</h3>
                <ul className="req-list">
                  {g.items.map((q, i) => (
                    <li key={i} className={q.needsReview ? "review" : ""}>
                      <span className={`chip ${q.mandatory ? "chip-accent" : "chip-neutral"}`} style={{ marginRight: 6 }}>
                        {q.mandatory ? "must" : "scored"}
                      </span>
                      {q.text}
                      <EvidenceList evidence={q.evidence} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>

        <div>
          {/* ---------- dates ---------- */}
          <section className="card" aria-labelledby="dates-h">
            <div className="card-head">
              <div className="label"><span className="num">02</span>Key dates</div>
              <button className="btn btn-sm no-print" onClick={onDownloadIcs}>＋ Add to calendar</button>
            </div>
            <h2 id="dates-h" className="sr-only">Key dates</h2>
            <ol className="timeline">
              {r.deadlines.map((d, i) => (
                <li key={i} className={d.needsReview ? "review" : ""}>
                  <div className="date">
                    {d.date ? formatIsoLong(d.date) : <span className="not-stated">Not stated</span>}
                    {d.date && <small><DaysLeft iso={d.date} /></small>}
                  </div>
                  <div>
                    <strong>{d.label}</strong>{" "}
                    {d.mandatory && <span className="chip chip-nobid">mandatory</span>}{" "}
                    <StatusChip status={d.status} needsReview={d.needsReview} />
                    {(d.time || d.timezone) && <div className="small muted">{[d.time, d.timezone].filter(Boolean).join(" ")}</div>}
                    <EvidenceList evidence={d.evidence} />
                    {d.note && <div className="note">{d.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ---------- fit ---------- */}
          <section className="card" aria-labelledby="fit-h">
            <div className="card-head">
              <div className="label"><span className="num">04</span>Fit score</div>
              <span className="score"><b>{r.fit_score}</b> / 10</span>
            </div>
            <h2 id="fit-h" className="sr-only">Fit score breakdown</h2>
            {r.fit_factors.map((f) => (
              <div className="factor" key={f.id}>
                <strong className="small">{f.label}</strong>
                <div className="bar" aria-hidden="true"><span style={{ width: `${(f.points / f.max) * 100}%` }} /></div>
                <span className="days" style={{ textAlign: "right" }}>{f.points}/{f.max}</span>
                <p>{f.reason}</p>
              </div>
            ))}
            <p className="small muted" style={{ marginBottom: 0 }}>
              BID needs at least 6/10, no blocking deal-breaker, and agreement from the model's judgement.
            </p>
          </section>

          {/* ---------- deal-breakers & questions ---------- */}
          <section className="card" aria-labelledby="db-h">
            <div className="label"><span className="num">05</span>Deal-breakers</div>
            <h2 id="db-h" className="sr-only">Deal-breakers</h2>
            {r.deal_breakers.length === 0 ? (
              <p className="small muted">None found.</p>
            ) : (
              <ul className="req-list">
                {r.deal_breakers.map((d, i) => (
                  <li key={i} className={d.needsReview ? "review" : ""}>
                    <span className={`chip ${d.severity === "blocking" ? "chip-nobid" : "chip-warn"}`} style={{ marginRight: 6 }}>
                      {d.severity === "blocking" ? "blocking" : "verify"}
                    </span>
                    {d.text}
                    <EvidenceList evidence={d.evidence} />
                  </li>
                ))}
              </ul>
            )}
            <div className="card-head" style={{ marginTop: 16, marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>Questions to ask the agency</h3>
              {r.open_questions.length > 0 && (
                <button className="btn btn-sm no-print" onClick={copyQuestions} aria-live="polite">
                  {copied ? "Copied ✓" : "Copy as email"}
                </button>
              )}
            </div>
            {r.open_questions.length === 0 ? (
              <p className="small muted">None.</p>
            ) : (
              <ol className="reasons small">{r.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
            )}
          </section>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 14 }}>
        {r.document.fileName} · {r.document.pageCount} pages · analysed by {r.model.provider} ({r.model.name})
        {r.model.latencyMs ? ` in ${(r.model.latencyMs / 1000).toFixed(1)}s` : ""} · {new Date(r.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
