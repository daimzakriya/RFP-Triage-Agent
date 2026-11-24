"use client";

import { useEffect, useMemo, useRef } from "react";
import type { VerifiedEvidence } from "@/lib/schema";

/** Shows the extracted text of the cited page with the quote highlighted. */
export function SourceViewer({
  evidence,
  pages,
  onClose,
}: {
  evidence: VerifiedEvidence | null;
  pages: string[] | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (evidence && !d.open) d.showModal();
    if (!evidence && d.open) d.close();
  }, [evidence]);

  useEffect(() => {
    ref.current?.querySelector("mark")?.scrollIntoView({ block: "center" });
  }, [evidence]);

  const content = useMemo(() => {
    if (!evidence || !pages) return null;
    const text = pages[evidence.page - 1] ?? "";
    // Highlight the first quote segment, tolerant of whitespace differences.
    const seg = evidence.quote.split(/\.\.\.|…/)[0].trim();
    const pattern = seg
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/[‘’']/g, "[‘’']")
      .replace(/[“”"]/g, '[“”"]')
      .replace(/[-–—]/g, "[-–—]")
      .replace(/\s+/g, "\\s+");
    let m: RegExpExecArray | null = null;
    try {
      m = new RegExp(pattern, "i").exec(text);
    } catch {
      /* ignore */
    }
    if (!m) return <pre>{text}</pre>;
    return (
      <pre>
        {text.slice(0, m.index)}
        <mark>{m[0]}</mark>
        {text.slice(m.index + m[0].length)}
      </pre>
    );
  }, [evidence, pages]);

  return (
    <dialog ref={ref} className="viewer" onClose={onClose} aria-labelledby="viewer-title">
      <header>
        <strong id="viewer-title">Source · page {evidence?.page}</strong>
        <button className="btn btn-sm" onClick={onClose} autoFocus>
          Close
        </button>
      </header>
      <div className="body">
        {evidence && (
          <>
            <blockquote className="quote">“{evidence.quote}”</blockquote>
            <p className="small muted" style={{ marginTop: 0 }}>
              {evidence.check === "verified" && "This quote was found word for word on this page."}
              {evidence.check === "relocated" && `The model cited page ${evidence.citedPage}; the quote was found on page ${evidence.page}.`}
              {evidence.check === "approximate" && "Only a close match was found on this page. Read the text below to confirm."}
              {evidence.check === "unverified" && "This quote could not be found anywhere in the document. Treat the related item as unconfirmed."}
            </p>
            {content ?? <p className="muted small">The page text isn't stored for this item. Re-run the analysis to view sources.</p>}
          </>
        )}
      </div>
    </dialog>
  );
}
