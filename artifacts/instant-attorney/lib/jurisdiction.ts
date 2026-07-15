/**
 * Firm licensing / UPL gate helpers.
 * Crawford Law PLLC is licensed in Texas and Illinois only.
 */

export const LICENSED_STATES = ["TX", "IL"] as const;
export type LicensedState = (typeof LICENSED_STATES)[number];

/** US state / territory codes we accept in the picker (plus Out of US). */
export const US_STATE_OPTIONS: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "OTHER", name: "Outside the United States" },
];

export function isLicensedState(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  return (LICENSED_STATES as readonly string[]).includes(c);
}

export function normalizeStateCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c === "OTHER" || US_STATE_OPTIONS.some((s) => s.code === c)) return c;
  return null;
}

export function jurisdictionNotice(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  if (isLicensedState(stateCode)) return null;
  const name = US_STATE_OPTIONS.find((s) => s.code === stateCode)?.name ?? stateCode;
  return (
    `Crawford Law PLLC is licensed in Texas and Illinois only. Your matter appears to involve ${name}. ` +
    `We can still share general legal information, but we cannot form an attorney-client relationship or ` +
    `provide representation for this matter. Please consult a licensed attorney in your jurisdiction.`
  );
}
