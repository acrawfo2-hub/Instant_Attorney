/**
 * Cross-specialty statute lookup for UI chips.
 * Resolves a statute key to { code, official_url, topic } from the registries.
 */

import { getDebtStatute } from "./debt-statutes.ts";
import { getFamilyStatute } from "./family-statutes.ts";
import { getHoaStatute } from "./hoa-statutes.ts";
import { getEmploymentStatute } from "./employment-statutes.ts";
import { getEstateStatute } from "./estate-statutes.ts";
import { getDefamationStatute } from "./defamation-statutes.ts";
import { getTaxStatute } from "./tax-statutes.ts";
import { getLienStatute } from "./lien-statutes.ts";
import { getPiStatute } from "./pi-statutes.ts";

export interface StatuteChipData {
  key: string;
  code: string;
  topic: string;
  official_url: string;
}

type Getter = (key: string) => { code: string; topic: string; official_url: string } | undefined;

const GETTERS: Getter[] = [
  getDebtStatute,
  getFamilyStatute,
  getHoaStatute,
  getEmploymentStatute,
  getEstateStatute,
  getDefamationStatute,
  getTaxStatute,
  getLienStatute,
  getPiStatute,
];

export function resolveStatute(key: string): StatuteChipData | null {
  for (const get of GETTERS) {
    try {
      const s = get(key);
      if (s?.official_url) {
        return { key, code: s.code, topic: s.topic, official_url: s.official_url };
      }
    } catch {
      // Some getters throw on unknown keys — ignore.
    }
  }
  return null;
}

export function resolveStatutes(keys: string[]): StatuteChipData[] {
  const out: StatuteChipData[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const s = resolveStatute(key);
    if (s) out.push(s);
  }
  return out;
}
