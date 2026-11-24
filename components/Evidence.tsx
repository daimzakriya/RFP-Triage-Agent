"use client";

import { createContext, useContext } from "react";
import type { VerifiedEvidence } from "@/lib/schema";

/** Opens the source viewer at a page with a quote highlighted. */
export const SourceContext = createContext<(ev: VerifiedEvidence) => void>(() => {});

const CHECK_TEXT: Record<VerifiedEvidence["check"], string> = {
  verified: "Quote found on this page",
  relocated: "Quote found (page corrected)",
  approximate: "Close match only: check the source",
  unverified: "Quote NOT found in the document: check manually",
};
const ICON: Record<VerifiedEvidence["check"], string> = {
  verified: "✓",
  relocated: "✓",
  approximate: "≈",
  unverified: "!",
};

export function EvidenceList({ evidence }: { evidence: VerifiedEvidence[] }) {
  const open = useContext(SourceContext);
  if (!evidence.length) return null;
  return (
    <span className="ev">
      {evidence.map((e, i) => (
        <button
          key={i}
          type="button"
          className={`ev-btn ${e.check === "relocated" ? "verified" : e.check}`}
          title={`${CHECK_TEXT[e.check]}: “${e.quote}”`}
          aria-label={`Source page ${e.page}. ${CHECK_TEXT[e.check]}. Open source.`}
          onClick={() => open(e)}
        >
          p.{e.page} {ICON[e.check]}
        </button>
      ))}
    </span>
  );
}
