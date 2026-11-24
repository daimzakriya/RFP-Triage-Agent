/**
 * The company profile every RFP is judged against.
 * Source: idiaz.io Internship Challenge 2026 brief, page 3 ("Judge fit against").
 * Anything not listed here is unknown to the agent and must be treated as
 * "verify with the team", never assumed true or false.
 */
export const COMPANY_PROFILE = {
  name: "idiaz.io",
  description:
    "A US-registered, AI-native engineering studio with a small senior team.",
  builds: [
    "Automation platforms",
    "Compliance tooling",
    "AI-integrated ops software",
    "Web and mobile apps",
  ],
  knownFacts: [
    "Registered in the United States.",
    "Small team (very likely qualifies as a small business, but exact headcount and revenue are not in the profile).",
    "Senior engineers; AI-native delivery.",
  ],
  unknownFacts: [
    "Years in business",
    "State registrations outside its home state",
    "Past public-sector references",
    "Insurance coverage limits",
    "Security certifications (SOC 2, ISO 27001, FedRAMP)",
    "Security clearances held by staff",
    "Bonding capacity",
    "Socio-economic certifications (8(a), WOSB, SDVOSB, HUBZone, MBE/WBE)",
  ],
} as const;

export function profileAsPromptText(): string {
  const p = COMPANY_PROFILE;
  return [
    `${p.name}: ${p.description}`,
    `What we build: ${p.builds.join("; ")}.`,
    `Known facts: ${p.knownFacts.join(" ")}`,
    `NOT known (treat as "verify", never assume either way): ${p.unknownFacts.join("; ")}.`,
  ].join("\n");
}
