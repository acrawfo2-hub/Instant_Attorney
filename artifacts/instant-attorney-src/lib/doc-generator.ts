import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { CaseFile, FactItem, Profile, WizardType } from "./types";

export interface DocGenInput {
  docType: WizardType;
  wizardData: Record<string, unknown>;
  caseFile: CaseFile;
  facts: FactItem[];
  profile: Profile;
}

export async function generateDocument(input: DocGenInput): Promise<Buffer> {
  switch (input.docType) {
    case "intake_summary":
      return generateIntakeSummary(input);
    case "demand_letter":
      return generateDemandLetter(input);
    case "complaint_letter":
      return generateComplaintLetter(input);
    case "draft_contract":
      return generateDraftContract(input);
    case "draft_waiver":
      return generateDraftWaiver(input);
    case "wills_trusts":
      return generateWillsTrusts(input);
    case "doc_review":
      return generateDocReview(input);
    default:
      throw new Error(`Unknown doc type: ${input.docType}`);
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function firmHeader(): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: "CRAWFORD LAW PLLC", bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: "Attorney-Client Privileged & Confidential", italics: true, size: 20 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1 } },
      text: "",
    }),
    new Paragraph({ text: "" }),
  ];
}

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
}

function body(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    bullet: { level: 0 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ text: "" });
}

function str(v: unknown): string {
  return v ? String(v) : "Not provided";
}

function bullets(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

async function pack(doc: Document): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(doc));
}

// ── Intake Summary ───────────────────────────────────────────────────────────

async function generateIntakeSummary({ wizardData, caseFile, facts, profile }: DocGenInput): Promise<Buffer> {
  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");

  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        new Paragraph({ text: "CLIENT INTAKE SUMMARY", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        heading("Client Information"),
        body(`Name: ${str(wizardData.client_name || profile.full_name)}`),
        body(`Email: ${profile.email}`),
        body(`Phone: ${str(wizardData.client_phone || profile.phone)}`),
        spacer(),

        heading("Matter"),
        body(`Type: ${caseFile.matter_type ?? "Not classified"} — ${caseFile.matter_subtype ?? ""}`),
        spacer(),

        heading("Client's Narrative"),
        body(str(wizardData.narrative || caseFile.summary)),
        spacer(),

        heading("Key Parties"),
        ...bullets(wizardData.parties).map(bullet),
        spacer(),

        heading("Timeline of Events"),
        ...bullets(wizardData.timeline).map(bullet),
        spacer(),

        heading("Client Goals"),
        ...(caseFile.goals?.map(bullet) ?? [body("None stated")]),
        spacer(),

        heading("Confirmed Facts"),
        ...(confirmed.length ? confirmed.map((f) => bullet(f.description)) : [body("None confirmed yet")]),
        spacer(),

        heading("Outstanding Fact Gaps"),
        ...(gaps.length ? gaps.map((f) => bullet(f.description)) : [body("None identified")]),
        spacer(),

        heading("Documents in Client's Possession"),
        ...bullets(wizardData.documents_held).map(bullet),
        spacer(),

        heading("Prior Legal Representation"),
        body(str(wizardData.prior_counsel)),
        spacer(),

        heading("Urgency / Deadlines"),
        body(str(wizardData.urgency_flags)),
        spacer(),

        heading("Attorney Notes"),
        body("[To be completed by reviewing attorney]"),
        spacer(),

        new Paragraph({
          children: [new TextRun({
            text: `Prepared: ${new Date().toLocaleDateString()} | DRAFT — PENDING ATTORNEY REVIEW`,
            italics: true,
            size: 18,
          })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Demand Letter ────────────────────────────────────────────────────────────

async function generateDemandLetter({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        body(new Date().toLocaleDateString()),
        spacer(),
        body(str(wizardData.recipient_name)),
        body(str(wizardData.recipient_address)),
        spacer(),
        body(`RE: Formal Demand — ${str(wizardData.subject)}`),
        spacer(),
        body(`Dear ${str(wizardData.recipient_salutation)},`),
        spacer(),

        heading("Background"),
        body(str(wizardData.factual_background)),
        spacer(),

        heading("Legal Basis"),
        body(str(wizardData.legal_basis)),
        spacer(),

        heading("Demand"),
        body(str(wizardData.specific_demands)),
        spacer(),

        body(`Please respond in writing by ${str(wizardData.response_deadline)}.`),
        spacer(),
        body(str(wizardData.consequences)),
        spacer(),
        body("This letter is written without prejudice to any and all rights, remedies, and claims, all of which are expressly reserved."),
        spacer(),
        body("Sincerely,"),
        spacer(),
        body("___________________________"),
        body(str(wizardData.sender_name)),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SENDING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Complaint Letter ─────────────────────────────────────────────────────────

async function generateComplaintLetter({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        body(new Date().toLocaleDateString()),
        spacer(),
        body(`To: ${str(wizardData.agency_name)}`),
        spacer(),
        body(`RE: Complaint — ${str(wizardData.complaint_type)}`),
        spacer(),

        heading("Complainant"),
        body(str(wizardData.complainant_name)),
        body(str(wizardData.complainant_contact)),
        spacer(),

        heading("Respondent"),
        body(str(wizardData.respondent_name)),
        body(str(wizardData.respondent_address)),
        spacer(),

        heading("Nature of Complaint"),
        body(str(wizardData.complaint_narrative)),
        spacer(),

        heading("Protected Right at Issue"),
        body(str(wizardData.protected_right)),
        spacer(),

        heading("Supporting Evidence"),
        ...bullets(wizardData.evidence).map(bullet),
        spacer(),

        heading("Witnesses"),
        ...bullets(wizardData.witnesses).map(bullet),
        spacer(),

        heading("Relief Requested"),
        body(str(wizardData.relief_requested)),
        spacer(),

        body("I declare that the information above is true and correct to the best of my knowledge."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Name: ${str(wizardData.complainant_name)}`),
        body(`Date: ${new Date().toLocaleDateString()}`),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE FILING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Draft Contract ───────────────────────────────────────────────────────────

async function generateDraftContract({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        new Paragraph({ text: str(wizardData.contract_type).toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`This ${str(wizardData.contract_type)} ("Agreement") is entered into as of ${str(wizardData.effective_date)}, by and between:`),
        spacer(),
        body(`${str(wizardData.party_one_name)} ("${str(wizardData.party_one_role)}")`),
        body(`and`),
        body(`${str(wizardData.party_two_name)} ("${str(wizardData.party_two_role)}")`),
        spacer(),

        heading("1. Term"),
        body(str(wizardData.term)),
        spacer(),

        heading("2. Obligations"),
        body(str(wizardData.obligations)),
        spacer(),

        heading("3. Compensation / Consideration"),
        body(str(wizardData.compensation)),
        spacer(),

        heading("4. Confidentiality"),
        body(str(wizardData.confidentiality) || "The parties agree to keep the terms of this Agreement confidential."),
        spacer(),

        heading("5. Intellectual Property"),
        body(str(wizardData.ip_provisions) || "Not applicable."),
        spacer(),

        heading("6. Termination"),
        body(str(wizardData.termination)),
        spacer(),

        heading("7. Dispute Resolution"),
        body(str(wizardData.dispute_resolution)),
        spacer(),

        heading("8. Governing Law"),
        body(`This Agreement shall be governed by the laws of the State of ${str(wizardData.governing_law)}.`),
        spacer(),

        body("IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above."),
        spacer(),
        new Paragraph({
          children: [],
        }),

        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [body(`${str(wizardData.party_one_name)}`), body("Signature: _________________"), body("Date: _________________")] }),
                new TableCell({ children: [body(`${str(wizardData.party_two_name)}`), body("Signature: _________________"), body("Date: _________________")] }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SIGNING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Draft Waiver ─────────────────────────────────────────────────────────────

async function generateDraftWaiver({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        new Paragraph({ text: str(wizardData.waiver_type).toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`I, ${str(wizardData.releasor_name)} ("Releasor"), in consideration of ${str(wizardData.consideration)}, hereby release and discharge ${str(wizardData.releasee_name)} ("Releasee") from any and all claims, demands, damages, actions, and causes of action arising from or related to:`),
        spacer(),
        body(str(wizardData.covered_activities)),
        spacer(),

        heading("Scope of Release"),
        body(str(wizardData.rights_released)),
        spacer(),

        heading("Duration"),
        body(str(wizardData.duration)),
        spacer(),

        body("By signing below, I acknowledge that I have read and understood this release, that I have had the opportunity to consult with legal counsel, and that I am signing voluntarily."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Printed Name: ${str(wizardData.releasor_name)}`),
        body(`Date: ${new Date().toLocaleDateString()}`),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SIGNING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Wills & Trusts ───────────────────────────────────────────────────────────

async function generateWillsTrusts({ wizardData }: DocGenInput): Promise<Buffer> {
  const instrument = str(wizardData.instrument_type);

  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        new Paragraph({ text: instrument.toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`I, ${str(wizardData.testator_name)}, a resident of the State of ${str(wizardData.state)}, being of sound mind and disposing memory, hereby make, publish, and declare this my Last Will and Testament, hereby revoking all prior wills and codicils.`),
        spacer(),

        heading("Executor"),
        body(`I appoint ${str(wizardData.executor_name)} as Executor of this Will.`),
        body(`Alternate Executor: ${str(wizardData.alternate_executor)}`),
        spacer(),

        heading("Beneficiaries"),
        ...bullets(wizardData.beneficiaries).map(bullet),
        spacer(),

        heading("Specific Bequests"),
        ...bullets(wizardData.specific_bequests).map(bullet),
        spacer(),

        heading("Residuary Estate"),
        body(str(wizardData.residuary_clause)),
        spacer(),

        ...(wizardData.guardian_name ? [
          heading("Guardianship"),
          body(`I appoint ${str(wizardData.guardian_name)} as guardian of my minor children.`),
          spacer(),
        ] : []),

        body("IN WITNESS WHEREOF, I have set my hand to this Will on this date."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Printed Name: ${str(wizardData.testator_name)}`),
        body(`Date: _________________`),
        spacer(),

        heading("Witnesses"),
        body("Witness 1 Signature: ___________________ Name: ___________________ Date: ___"),
        body("Witness 2 Signature: ___________________ Name: ___________________ Date: ___"),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW. NOT A VALID LEGAL DOCUMENT UNTIL PROPERLY EXECUTED.", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Document Review ──────────────────────────────────────────────────────────

async function generateDocReview({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        ...firmHeader(),
        new Paragraph({ text: "DOCUMENT REVIEW ANALYSIS", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        heading("Document Reviewed"),
        body(str(wizardData.document_type)),
        body(`Parties: ${str(wizardData.parties)}`),
        spacer(),

        heading("Summary"),
        body(str(wizardData.summary)),
        spacer(),

        heading("Fit to Case"),
        body(str(wizardData.fit_to_case)),
        spacer(),

        heading("Favorable Provisions"),
        ...bullets(wizardData.favorable).map(bullet),
        spacer(),

        heading("Unfavorable Provisions"),
        ...bullets(wizardData.unfavorable).map(bullet),
        spacer(),

        heading("Red Flags"),
        ...bullets(wizardData.red_flags).map((b) =>
          new Paragraph({ children: [new TextRun({ text: b, color: "CC0000", bold: true })], bullet: { level: 0 } })
        ),
        spacer(),

        heading("Recommended Edits"),
        body(str(wizardData.recommended_edits)),
        spacer(),

        heading("Attorney Review Notes"),
        body("[To be completed by reviewing attorney]"),
        spacer(),

        new Paragraph({
          children: [new TextRun({
            text: `Analysis prepared: ${new Date().toLocaleDateString()} | DRAFT — PENDING ATTORNEY REVIEW`,
            italics: true,
            size: 18,
          })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}
