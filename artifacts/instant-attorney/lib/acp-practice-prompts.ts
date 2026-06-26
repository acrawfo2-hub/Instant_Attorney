import type { AcpPracticeArea } from "./acp-matter-areas.ts";
import { ACP_PRACTICE_SECTIONS } from "./acp-practice-sections.generated.ts";

/** Substitute ${name()} placeholders in a practice section template. */
function fillPracticeTemplate(
  template: string,
  values: Record<string, string>,
): string {
  let out = template;
  for (const [name, value] of Object.entries(values)) {
    out = out.split(`\${${name}()}`).join(value);
  }
  return out;
}

async function loadHoaSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./hoa-statutes.ts"),
    import("./hoa-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.hoa, {
    hoaStatutesForPrompt: statutes.hoaStatutesForPrompt(),
    hoaInstrumentsForPrompt: instruments.hoaInstrumentsForPrompt(),
  });
}

async function loadFamilySection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./family-statutes.ts"),
    import("./family-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.family, {
    familyStatutesForPrompt: statutes.familyStatutesForPrompt(),
    familyInstrumentsForPrompt: instruments.familyInstrumentsForPrompt(),
  });
}

async function loadDebtSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./debt-statutes.ts"),
    import("./debt-instruments.ts"),
  ]);
  const base = fillPracticeTemplate(ACP_PRACTICE_SECTIONS.debt, {
    debtStatutesForPrompt: statutes.debtStatutesForPrompt(),
    debtInstrumentsForPrompt: instruments.debtInstrumentsForPrompt(),
  });
  // Bankruptcy guidance lives in the tax block in the legacy monolith — append for debt matters.
  const bankruptcyIdx = ACP_PRACTICE_SECTIONS.tax.indexOf("BANKRUPTCY —");
  const bankruptcy =
    bankruptcyIdx >= 0
      ? "\n\n" + ACP_PRACTICE_SECTIONS.tax.slice(bankruptcyIdx).trim()
      : "";
  return base + bankruptcy;
}

async function loadTaxSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./tax-statutes.ts"),
    import("./tax-instruments.ts"),
  ]);
  let section: string = ACP_PRACTICE_SECTIONS.tax;
  const bankruptcyIdx = section.indexOf("BANKRUPTCY —");
  if (bankruptcyIdx >= 0) section = section.slice(0, bankruptcyIdx).trimEnd();
  return fillPracticeTemplate(section, {
    taxStatutesForPrompt: statutes.taxStatutesForPrompt(),
    taxInstrumentsForPrompt: instruments.taxInstrumentsForPrompt(),
  });
}

async function loadEmploymentSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./employment-statutes.ts"),
    import("./employment-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.employment, {
    employmentStatutesForPrompt: statutes.employmentStatutesForPrompt(),
    employmentInstrumentsForPrompt: instruments.employmentInstrumentsForPrompt(),
  });
}

async function loadDefamationSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./defamation-statutes.ts"),
    import("./defamation-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.defamation, {
    defamationStatutesForPrompt: statutes.defamationStatutesForPrompt(),
    defamationInstrumentsForPrompt: instruments.defamationInstrumentsForPrompt(),
  });
}

async function loadPiSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./pi-statutes.ts"),
    import("./pi-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.personal_injury, {
    piStatutesForPrompt: statutes.piStatutesForPrompt(),
    piInstrumentsForPrompt: instruments.piInstrumentsForPrompt(),
  });
}

async function loadEstateSection(): Promise<string> {
  const [statutes, instruments] = await Promise.all([
    import("./estate-statutes.ts"),
    import("./estate-instruments.ts"),
  ]);
  return fillPracticeTemplate(ACP_PRACTICE_SECTIONS.estate, {
    estateStatutesForPrompt: statutes.estateStatutesForPrompt(),
    estateInstrumentsForPrompt: instruments.estateInstrumentsForPrompt(),
  });
}

const SECTION_LOADERS: Record<AcpPracticeArea, () => Promise<string>> = {
  hoa: loadHoaSection,
  family: loadFamilySection,
  debt: loadDebtSection,
  tax: loadTaxSection,
  employment: loadEmploymentSection,
  defamation: loadDefamationSection,
  personal_injury: loadPiSection,
  estate: loadEstateSection,
};

/** Stable order when multiple practice areas match. */
const AREA_ORDER: AcpPracticeArea[] = [
  "employment",
  "family",
  "hoa",
  "debt",
  "tax",
  "defamation",
  "personal_injury",
  "estate",
];

/**
 * Load only the practice-area deep dives that match the matter. Statute/instrument
 * modules are imported on demand to shrink cold starts when areas are irrelevant.
 */
export async function loadAcpPracticePrompt(areas: AcpPracticeArea[]): Promise<string> {
  if (!areas.length) return "";

  const ordered = AREA_ORDER.filter((a) => areas.includes(a));
  const parts = await Promise.all(ordered.map((a) => SECTION_LOADERS[a]()));
  return parts.join("\n\n");
}
