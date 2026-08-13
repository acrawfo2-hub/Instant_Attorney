/** A pinned, attorney-reviewable description of an instrument's legal requirements. */
export interface InstrumentAuthorityProfile {
  id: string;
  exactName: string;
  aliases: string[];
  jurisdiction: string;
  issuer?: string;
  authorities: Array<{ title: string; url: string }>;
  retrievedAt: string;
  effectiveAt: string;
  requiredSections: string[];
  requiredClauses: string[];
  formalities: string[];
  outputProfile: {
    format: string;
    filingOrDelivery: string;
    copiesOrAttachments: string[];
  };
  /** A normalized, immutable extract; drafting never depends on live page text. */
  authoritySnapshot: string;
  reusableStatus: "attorney_confirmed" | "pending_attorney_confirmation";
  attorneyConfirmedAt?: string;
}

export const APPROVED_INSTRUMENT_AUTHORITY_DOMAINS = [
  "foia.gov",
  "justice.gov",
  "statutes.capitol.texas.gov",
  "txcourts.gov",
] as const;

const retrievedAt = "2026-08-11";

export const INSTRUMENT_AUTHORITIES: readonly InstrumentAuthorityProfile[] = [
  {
    id: "federal-foia-request",
    exactName: "Freedom of Information Act Request",
    aliases: ["federal foia request", "foia request", "freedom of information act request"],
    jurisdiction: "United States (federal)",
    issuer: "The federal agency that maintains the requested records",
    authorities: [
      { title: "5 U.S.C. § 552", url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552" },
      { title: "FOIA.gov request guidance", url: "https://www.foia.gov/how-to.html" },
    ],
    retrievedAt,
    effectiveAt: "2016-06-30 (FOIA Improvement Act amendments)",
    requiredSections: ["Request identification", "Reasonably described records", "Requester contact information"],
    requiredClauses: ["Statement that the request is made under FOIA"],
    formalities: ["Submit to the component or agency likely to maintain the records", "Follow that agency's published submission channel and regulations"],
    outputProfile: { format: "Agency-directed letter or portal-ready request", filingOrDelivery: "Agency FOIA office or designated electronic portal", copiesOrAttachments: ["Optional fee-waiver support", "Optional expedited-processing support"] },
    authoritySnapshot: "5 U.S.C. 552(a)(3): a request must reasonably describe the records and comply with published agency rules for time, place, fees, and procedure. Fee waiver and expedited processing require the statutory showings; they are not universal request elements.",
    reusableStatus: "attorney_confirmed",
    attorneyConfirmedAt: retrievedAt,
  },
  {
    id: "texas-public-information-act-request",
    exactName: "Texas Public Information Act Request",
    aliases: ["texas public information act request", "texas pia request", "texas open records request"],
    jurisdiction: "Texas",
    issuer: "The governmental body's public information officer",
    authorities: [{ title: "Texas Government Code Chapter 552", url: "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.552.htm" }],
    retrievedAt,
    effectiveAt: "2025-09-01 statutory text",
    requiredSections: ["Governmental body", "Requested public information", "Requester contact or delivery details"],
    requiredClauses: ["Request for existing public information under Texas Government Code Chapter 552"],
    formalities: ["Submit by a method designated in Government Code § 552.234", "Describe existing information sufficiently for identification; the Act does not require creation of new information"],
    outputProfile: { format: "Written request suitable for the body's designated channel", filingOrDelivery: "Public information officer or § 552.234 designated address/portal", copiesOrAttachments: ["Optional clarification of date range and preferred format"] },
    authoritySnapshot: "Gov't Code §§ 552.221 and 552.234 govern prompt production and designated submission methods. A request concerns public information already in existence; optional narrowing and format preferences improve administration but are not mandatory clauses.",
    reusableStatus: "attorney_confirmed",
    attorneyConfirmedAt: retrievedAt,
  },
  {
    id: "texas-district-court-original-petition",
    exactName: "Plaintiff's Original Petition",
    aliases: ["texas district court original petition", "plaintiff's original petition", "texas original petition"],
    jurisdiction: "Texas district court",
    issuer: "Texas district court and district clerk",
    authorities: [{ title: "Texas Rules of Civil Procedure", url: "https://www.txcourts.gov/media/1457525/texas-rules-of-civil-procedure.pdf" }],
    retrievedAt,
    effectiveAt: "2026-01-01 rules edition",
    requiredSections: ["Style and caption", "Parties", "Jurisdiction", "Venue", "Short statement of claim", "Relief sought", "Signature and contact block"],
    requiredClauses: ["Rule 47 damages-range statement when monetary relief is sought", "Discovery-control-plan allegation", "Demand for relief"],
    formalities: ["File with the proper district clerk and pay or obtain waiver of fees", "Arrange issuance and service of citation under Rules 99 and 106", "Attorney or self-represented party signs under Rule 57"],
    outputProfile: { format: "Numbered, court-file-ready pleading with Rule 79 caption", filingOrDelivery: "Proper Texas district clerk", copiesOrAttachments: ["Civil case information or local cover items if required", "Exhibits necessary to the pleaded claim", "Proposed citation/service materials"] },
    authoritySnapshot: "TRCP 45 and 47 require a plain, concise claim and relief statement; Rules 78-79 govern petition naming and caption; Rule 190 requires a discovery-control-plan allegation; Rules 21, 57, 99, and 106 govern filing/signature and citation/service. Local requirements remain a blocking verification item.",
    reusableStatus: "attorney_confirmed",
    attorneyConfirmedAt: retrievedAt,
  },
  {
    id: "texas-will",
    exactName: "Last Will and Testament (Texas)",
    aliases: ["texas will", "last will and testament", "last will and testament texas"],
    jurisdiction: "Texas",
    authorities: [{ title: "Texas Estates Code Chapters 251-257", url: "https://statutes.capitol.texas.gov/Docs/ES/htm/ES.251.htm" }],
    retrievedAt,
    effectiveAt: "2025-09-01 statutory text",
    requiredSections: ["Testator identification and testamentary declaration", "Dispositive provisions", "Residuary disposition", "Executor appointment", "Execution block"],
    requiredClauses: ["Revocation of prior wills", "Beneficiary and alternate disposition sufficient to avoid unintended lapse or intestacy"],
    formalities: ["Testator age/capacity must satisfy Estates Code § 251.001", "Written attested will signed by testator (or directed signer) and two credible witnesses age 14 or older under § 251.051", "Self-proving affidavit is optional and must comply with §§ 251.101-.107"],
    outputProfile: { format: "Execution-ready will with separate attestation and optional self-proving affidavit", filingOrDelivery: "Execute; retain original for probate (no lifetime filing generally required)", copiesOrAttachments: ["Optional self-proving affidavit", "Optional tangible-personal-property memorandum if appropriate"] },
    authoritySnapshot: "Estates Code § 251.051 supplies written-will signature and two-witness formalities. §§ 251.101-.107 provide optional self-proof. Dispositive choices beyond legally sufficient testamentary intent are drafting preferences and client decisions, not statutory boilerplate.",
    reusableStatus: "attorney_confirmed",
    attorneyConfirmedAt: retrievedAt,
  },
  {
    id: "texas-revocable-living-trust",
    exactName: "Revocable Living Trust Agreement (Texas)",
    aliases: ["texas revocable living trust", "revocable living trust", "texas living trust"],
    jurisdiction: "Texas",
    authorities: [{ title: "Texas Property Code Title 9, Subtitle B", url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.112.htm" }],
    retrievedAt,
    effectiveAt: "2025-09-01 statutory text",
    requiredSections: ["Settlor, trustee, and beneficiaries", "Trust property", "Trust purposes and operative duties", "Revocation/amendment mechanics", "Successor trustees", "Distribution and termination", "Execution block"],
    requiredClauses: ["Manifestation of intent to create a trust", "Definite beneficiary unless a statutory exception applies", "Trustee duties tied to identified trust property"],
    formalities: ["Comply with Property Code § 112.004 writing requirement when applicable", "Fund the trust through valid transfers or declarations", "Use separate deed/assignment formalities for each asset class; record real-property conveyances where required"],
    outputProfile: { format: "Signed trust agreement plus asset-specific funding schedule", filingOrDelivery: "No general court filing; execute and complete separate funding instruments", copiesOrAttachments: ["Schedule of trust property", "Certification of trust", "Asset assignments or deeds"] },
    authoritySnapshot: "Property Code §§ 112.001-.008 address creation, intent, beneficiary, writing, and consideration. Chapter 113 supplies trustee administration rules. A signed instrument alone does not silently transfer assets; funding documents and asset-specific formalities must be identified as separate requirements.",
    reusableStatus: "attorney_confirmed",
    attorneyConfirmedAt: retrievedAt,
  },
] as const;

export type InstrumentAuthorityResolution =
  | { status: "resolved"; profile: InstrumentAuthorityProfile }
  | { status: "blocking_gap"; requestedInstrument: string; reason: string };

export function isApprovedAuthorityUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return APPROVED_INSTRUMENT_AUTHORITY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * The only promotion path for a newly researched profile. Callers must retain
 * the returned normalized snapshot; a URL alone is never reusable authority.
 */
export function confirmInstrumentAuthority(
  candidate: InstrumentAuthorityProfile,
  confirmation: { attorneyId: string; confirmedAt: string }
): InstrumentAuthorityProfile {
  if (!confirmation.attorneyId.trim() || Number.isNaN(Date.parse(confirmation.confirmedAt))) {
    throw new Error("A dated attorney confirmation is required before profile promotion");
  }
  if (!candidate.authorities.length || candidate.authorities.some((a) => !isApprovedAuthorityUrl(a.url))) {
    throw new Error("Instrument profiles may use only approved official authority domains");
  }
  if (!candidate.authoritySnapshot.trim()) {
    throw new Error("A pinned normalized authority snapshot is required before profile promotion");
  }
  return { ...candidate, reusableStatus: "attorney_confirmed", attorneyConfirmedAt: confirmation.confirmedAt };
}

export function resolveInstrumentAuthority(name: string): InstrumentAuthorityResolution {
  const normalized = name.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const profile = INSTRUMENT_AUTHORITIES.find((candidate) =>
    candidate.exactName.toLowerCase() === normalized || candidate.aliases.includes(normalized)
  );
  if (profile) return { status: "resolved", profile };
  return {
    status: "blocking_gap",
    requestedInstrument: name || "Unspecified instrument",
    reason: "No pinned authoritative instrument profile is registered. Official sources must be captured from an approved domain, normalized into a snapshot, and confirmed by an attorney before reusable promotion.",
  };
}

export function formatInstrumentAuthorityBlock(resolution: InstrumentAuthorityResolution): string {
  if (resolution.status === "blocking_gap") {
    return `=== BEGIN INSTRUMENT AUTHORITY (PINNED) ===\nSTATUS: BLOCKING GAP\nINSTRUMENT: ${resolution.requestedInstrument}\nREASON: ${resolution.reason}\nREQUIRED ACTION: Do not state legal requirements or produce a purportedly compliant instrument. Emit this authority failure as a BLOCKING gap.\n=== END INSTRUMENT AUTHORITY (PINNED) ===`;
  }
  const p = resolution.profile;
  return `=== BEGIN INSTRUMENT AUTHORITY (PINNED) ===\nSTATUS: RESOLVED / ${p.reusableStatus}\nEXACT INSTRUMENT: ${p.exactName}\nJURISDICTION: ${p.jurisdiction}\nISSUING COURT OR AGENCY: ${p.issuer ?? "Not applicable"}\nRETRIEVED: ${p.retrievedAt}\nEFFECTIVE: ${p.effectiveAt}\nAUTHORITIES:\n${p.authorities.map((a) => `- ${a.title}: ${a.url}`).join("\n")}\nREQUIRED SECTIONS:\n${p.requiredSections.map((x) => `- ${x}`).join("\n")}\nREQUIRED CLAUSES:\n${p.requiredClauses.map((x) => `- ${x}`).join("\n")}\nEXECUTION OR FILING FORMALITIES:\n${p.formalities.map((x) => `- ${x}`).join("\n")}\nOUTPUT PROFILE:\n- Format: ${p.outputProfile.format}\n- Filing/delivery: ${p.outputProfile.filingOrDelivery}\n- Copies/attachments: ${p.outputProfile.copiesOrAttachments.join("; ")}\nPINNED NORMALIZED EXTRACT:\n${p.authoritySnapshot}\n=== END INSTRUMENT AUTHORITY (PINNED) ===`;
}
