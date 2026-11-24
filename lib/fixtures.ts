/**
 * OFFLINE TEST FIXTURES. Hand-written model answers for the two challenge
 * sample RFPs, used by unit tests and by RFP_FIXTURE_MODE=1 for local UI work
 * without an API key. They are never used in normal operation.
 */
import rfp1 from "@/fixtures/sample-rfp-1.model.json";
import rfp2 from "@/fixtures/sample-rfp-2.model.json";

const FIXTURES = [
  { marker: "PA-DPI-2026-114", name: "sample-rfp-1.model.json", json: rfp1 as unknown },
  { marker: "LC-FM-2027-03", name: "sample-rfp-2.model.json", json: rfp2 as unknown },
];

export function findFixture(pages: string[]) {
  const head = pages.slice(0, 2).join("\n");
  return FIXTURES.find((f) => head.includes(f.marker)) ?? null;
}
