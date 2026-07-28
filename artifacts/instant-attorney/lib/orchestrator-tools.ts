import Anthropic from "@anthropic-ai/sdk";
import { runMeansTest, formatMeansTest, type MeansTestInput } from "./bankruptcy-means-test.ts";
import { estimateChildSupport, formatChildSupportEstimate, type ChildSupportInput } from "./family-support-calc.ts";
import { screenPiSol, formatPiSol, type PiSolInput } from "./pi-sol-calc.ts";
import { screenMaintenance, formatMaintenanceScreen, type MaintenanceInput } from "./family-maintenance-calc.ts";
import { assessDefamation, type DefamationInput } from "./defamation-assessment.ts";
import { assessNoncompete, type NoncompeteInput } from "./noncompete-assessment.ts";
import { dividePropertyEstate, formatPropertyDivisionEstimate, type PropertyDivisionInput, type PropertyItem } from "./family-property-calc.ts";
import { generatePossessionSchedule, formatPossessionSchedule, type PossessionInput } from "./family-possession-calc.ts";
import { checkExemptions, type ExemptionAsset, type AssetCategory } from "./bankruptcy-exemptions.ts";
import { estimateProbateVsTrust, type EstateProfile, type EstateSize } from "./estate-probate-estimate.ts";
import { computePiFaultImpact } from "./pi-fault-calc.ts";
import { matchFormsByText, getGovernmentForm, isKnownFormKey, GOVERNMENT_FORMS } from "./government-forms.ts";
import { loadMatterTasks, formatMatterTasks } from "./matter-assessment.ts";
import { buildFileContext, WHAT_IF_SYSTEM_PROMPT } from "./prompts.ts";
import { parseWhatIfResponse } from "./what-if.ts";
import { maxOutputTokensFor } from "./token-limits.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import type { CaseFile, FactItem } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Per-call context. Pure calculators ignore it; assess_matter reads the file. */
export interface ToolContext {
  db: Db;
  userId: string;
  caseFileId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator tools (plan Phase 2). The freestyle assistant can CALL these
// instead of the user hunting for a calculator page. Every tool is a thin wrapper
// over a pure, unit-tested lib function: the model decides WHEN to call and with
// WHAT params; the server runs the real deterministic function and returns the
// result. The model never re-derives a calculation in prose.
//
// Phase 2 is READ-ONLY: tools compute and return, with no side effects. Writing
// results into the Living File is a separate, gated tool (update_living_file,
// Phase 4). Adding a calculator is one entry here — see the map below.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolResult {
  /** What the model reads back as the tool_result (human-readable + disclaimer). */
  forModel: string;
  /** Optional deadline signal (e.g. PiSolResult.urgency) for downstream ranking. */
  urgency?: string;
  /** The full typed result, persisted to orchestrator_tool_calls for audit. */
  raw: unknown;
}

// A missing-params result: the model relays a natural question instead of guessing.
function needParams(missing: string[]): ToolResult {
  return {
    forModel: JSON.stringify({ error: "need", missing, note: "Ask the user for these, then call again." }),
    raw: { error: "need", missing },
  };
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const boolOf = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined;
const strOf = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

// Match a model-supplied description against the open "still needed" items:
// exact, then substring either way, then significant-word overlap. Returns the
// best match, or undefined if nothing is close enough (the model then retries).
const STOP = new Set(["the", "a", "an", "of", "your", "for", "and", "to", "with", "any", "all", "document", "documents", "copy", "copies"]);
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
function matchRequest<T extends { id: string; description: string }>(rows: T[], query: string): T | undefined {
  const q = query.toLowerCase().trim();
  const exact = rows.find((r) => r.description.toLowerCase().trim() === q);
  if (exact) return exact;
  const sub = rows.find((r) => {
    const d = r.description.toLowerCase();
    return d.includes(q) || q.includes(d);
  });
  if (sub) return sub;
  const qw = words(query);
  if (qw.length === 0) return undefined;
  let best: { row: T; score: number } | undefined;
  for (const r of rows) {
    const rw = new Set(words(r.description));
    if (rw.size === 0) continue;
    const shared = qw.filter((w) => rw.has(w)).length;
    const score = shared / Math.min(qw.length, rw.size);
    if (shared >= 1 && score >= 0.5 && (!best || score > best.score)) best = { row: r, score };
  }
  return best?.row;
}

interface ToolDef {
  def: Anthropic.Tool;
  run: (input: Record<string, unknown>, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
}

const TOOLS: Record<string, ToolDef> = {
  run_means_test: {
    def: {
      name: "run_means_test",
      description:
        "Run the Chapter 7 bankruptcy means-test income (median) screen for a Texas household. Use when the user is weighing bankruptcy and their household size and income are known or can be asked for.",
      input_schema: {
        type: "object",
        properties: {
          householdSize: { type: "integer", minimum: 1, description: "People in the household." },
          annualIncome: { type: "number", description: "Annualized current monthly income. Provide this OR averageMonthlyIncome." },
          averageMonthlyIncome: { type: "number", description: "Average monthly income over the prior 6 months (CMI)." },
          medianOverride: { type: "number", description: "Override the state median with the current U.S. Trustee figure." },
        },
        required: ["householdSize"],
      },
    },
    run: (input) => {
      const householdSize = num(input.householdSize);
      const annualIncome = num(input.annualIncome);
      const averageMonthlyIncome = num(input.averageMonthlyIncome);
      if (householdSize === undefined) return needParams(["householdSize"]);
      if (annualIncome === undefined && averageMonthlyIncome === undefined) return needParams(["annualIncome or averageMonthlyIncome"]);
      const args: MeansTestInput = { householdSize, annualIncome, averageMonthlyIncome, medianOverride: num(input.medianOverride) };
      const result = runMeansTest(args);
      return { forModel: formatMeansTest(result), raw: result };
    },
  },

  estimate_child_support: {
    def: {
      name: "estimate_child_support",
      description:
        "Estimate Texas guideline monthly child support. Use when a family matter needs a support number and the obligor's net monthly resources and the number of children are known or can be asked for.",
      input_schema: {
        type: "object",
        properties: {
          netMonthlyResources: { type: "number", description: "Obligor's monthly net resources (per Tex. Fam. Code §154.061–154.070)." },
          childrenBeforeCourt: { type: "integer", minimum: 1, description: "Children before the court in this suit." },
          otherChildren: { type: "integer", minimum: 0, description: "Other children the obligor has a duty to support (default 0)." },
          capOverride: { type: "number", description: "Override the statutory net-resources cap with the current OAG figure." },
        },
        required: ["netMonthlyResources", "childrenBeforeCourt"],
      },
    },
    run: (input) => {
      const netMonthlyResources = num(input.netMonthlyResources);
      const childrenBeforeCourt = num(input.childrenBeforeCourt);
      const missing: string[] = [];
      if (netMonthlyResources === undefined) missing.push("netMonthlyResources");
      if (childrenBeforeCourt === undefined) missing.push("childrenBeforeCourt");
      if (missing.length) return needParams(missing);
      const args: ChildSupportInput = {
        netMonthlyResources: netMonthlyResources!,
        childrenBeforeCourt: childrenBeforeCourt!,
        otherChildren: num(input.otherChildren),
        capOverride: num(input.capOverride),
      };
      const result = estimateChildSupport(args);
      return { forModel: formatChildSupportEstimate(result), raw: result };
    },
  },

  screen_pi_sol: {
    def: {
      name: "screen_pi_sol",
      description:
        "Screen the Texas statute-of-limitations deadline for a personal-injury claim. Use whenever a PI matter has a triggering-event date — a live deadline is high-priority.",
      input_schema: {
        type: "object",
        properties: {
          incidentDate: { type: "string", description: "YYYY-MM-DD of the triggering event." },
          claimType: {
            type: "string",
            enum: ["general_pi", "auto_accident", "premises", "wrongful_death", "medical_malpractice"],
            description: "The kind of personal-injury claim.",
          },
          treatmentEndDate: { type: "string", description: "Medical-malpractice only: date treatment ended (YYYY-MM-DD)." },
        },
        required: ["incidentDate", "claimType"],
      },
    },
    run: (input) => {
      const incidentDate = strOf(input.incidentDate);
      const claimType = strOf(input.claimType);
      const missing: string[] = [];
      if (!incidentDate) missing.push("incidentDate");
      if (!claimType) missing.push("claimType");
      if (missing.length) return needParams(missing);
      const CLAIM_TYPES = ["general_pi", "auto_accident", "premises", "wrongful_death", "medical_malpractice"];
      if (!CLAIM_TYPES.includes(claimType!)) {
        return needParams([`claimType (one of: ${CLAIM_TYPES.join(", ")})`]);
      }
      const args = { incidentDate: incidentDate!, claimType: claimType!, treatmentEndDate: strOf(input.treatmentEndDate) ?? null } as PiSolInput;
      const result = screenPiSol(args);
      return { forModel: formatPiSol(result), urgency: result.urgency, raw: result };
    },
  },

  estimate_maintenance: {
    def: {
      name: "estimate_maintenance",
      description:
        "Screen eligibility and the statutory cap for Texas spousal maintenance. Use for a divorce/family matter when maintenance is in question.",
      input_schema: {
        type: "object",
        properties: {
          marriageYears: { type: "number", description: "Length of the marriage in years." },
          lacksMinimumNeeds: { type: "boolean", description: "The spouse seeking maintenance lacks sufficient property/income for minimum reasonable needs (gateway threshold)." },
          familyViolence: { type: "boolean", description: "The other spouse has a qualifying family-violence conviction/deferred adjudication." },
          seekingSpouseDisability: { type: "boolean", description: "The seeking spouse has an incapacitating disability." },
          childWithDisabilityCare: { type: "boolean", description: "The seeking spouse cares for a child of the marriage with a disability." },
          payorAverageMonthlyGrossIncome: { type: "number", description: "Payor's average monthly gross income (for the §8.055 cap)." },
        },
        required: ["marriageYears", "lacksMinimumNeeds"],
      },
    },
    run: (input) => {
      const marriageYears = num(input.marriageYears);
      const lacksMinimumNeeds = boolOf(input.lacksMinimumNeeds);
      const missing: string[] = [];
      if (marriageYears === undefined) missing.push("marriageYears");
      if (lacksMinimumNeeds === undefined) missing.push("lacksMinimumNeeds");
      if (missing.length) return needParams(missing);
      const args: MaintenanceInput = {
        marriageYears: marriageYears!,
        lacksMinimumNeeds: lacksMinimumNeeds!,
        familyViolence: boolOf(input.familyViolence),
        seekingSpouseDisability: boolOf(input.seekingSpouseDisability),
        childWithDisabilityCare: boolOf(input.childWithDisabilityCare),
        payorAverageMonthlyGrossIncome: num(input.payorAverageMonthlyGrossIncome),
      };
      const result = screenMaintenance(args);
      return { forModel: formatMaintenanceScreen(result), raw: result };
    },
  },

  assess_defamation: {
    def: {
      name: "assess_defamation",
      description:
        "Screen a potential Texas defamation claim element-by-element (falsity, publication, fault, per-se, SOL). Answer only the parts the user has told you; leave the rest out.",
      input_schema: {
        type: "object",
        properties: {
          statementType: { type: "string", description: "fact or opinion." },
          isFalse: { type: "boolean", description: "Is the statement actually false?" },
          publishedToOthers: { type: "boolean", description: "Communicated to at least one other person?" },
          aboutYou: { type: "boolean", description: "Does it identify/concern the user?" },
          plaintiffStatus: { type: "string", description: "private_figure, public_official, or public_figure." },
          perSeCategory: { type: "string", description: "Per-se category, if any." },
          matterOfPublicConcern: { type: "boolean" },
          monthsSincePublished: { type: "number", description: "Months since publication (1-year SOL)." },
          speakerKnown: { type: "boolean", description: "Is the speaker known (vs. anonymous)?" },
        },
        required: [],
      },
    },
    run: (input) => {
      const args: DefamationInput = {
        statementType: strOf(input.statementType) as DefamationInput["statementType"],
        isFalse: boolOf(input.isFalse),
        publishedToOthers: boolOf(input.publishedToOthers),
        aboutYou: boolOf(input.aboutYou),
        plaintiffStatus: strOf(input.plaintiffStatus) as DefamationInput["plaintiffStatus"],
        perSeCategory: strOf(input.perSeCategory) as DefamationInput["perSeCategory"],
        matterOfPublicConcern: boolOf(input.matterOfPublicConcern),
        monthsSincePublished: num(input.monthsSincePublished),
        speakerKnown: boolOf(input.speakerKnown),
      };
      const result = assessDefamation(args);
      return { forModel: `${result.headline}\n\n${result.disclaimer}`, raw: result };
    },
  },

  assess_noncompete: {
    def: {
      name: "assess_noncompete",
      description:
        "Screen a Texas non-compete's likely enforceability under Tex. Bus. & Com. Code § 15.50 (ancillary agreement + consideration, protectable interest, and reasonableness of time/geography/activity). Texas courts REFORM overbroad covenants rather than void them. Answer only the parts the user has told you; leave the rest unset.",
      input_schema: {
        type: "object",
        properties: {
          ancillaryToAgreement: { type: "boolean", description: "Tied to an otherwise enforceable agreement (e.g. received confidential info, training, or equity)?" },
          receivedConsideration: { type: "boolean", description: "Did the employee actually receive something giving rise to the employer's interest?" },
          protectableInterest: { type: "boolean", description: "Does the employer have a legitimate interest (trade secrets, client goodwill, confidential info)?" },
          timeMonths: { type: "number", description: "Restriction length in months." },
          geography: { type: "string", enum: ["reasonable", "broad", "none_specified", "unsure"], description: "Geographic reach relative to where the employee actually worked." },
          activityScope: { type: "string", enum: ["narrow", "broad", "unsure"], description: "Scope of restricted activity relative to the employee's actual role." },
        },
        required: [],
      },
    },
    run: (input) => {
      const args: NoncompeteInput = {
        ancillaryToAgreement: boolOf(input.ancillaryToAgreement),
        receivedConsideration: boolOf(input.receivedConsideration),
        protectableInterest: boolOf(input.protectableInterest),
        timeMonths: num(input.timeMonths),
        geography: strOf(input.geography) as NoncompeteInput["geography"],
        activityScope: strOf(input.activityScope) as NoncompeteInput["activityScope"],
      };
      const r = assessNoncompete(args);
      const factorLines = r.factors.map((f) => `- ${f.factor} [${f.status}]: ${f.note}`).join("\n");
      const warnLines = r.warnings.length ? `\n\nWarnings:\n${r.warnings.map((w) => `- ${w.severe ? "(!) " : ""}${w.text}`).join("\n")}` : "";
      const levers = r.negotiationLevers.length ? `\n\nNegotiation levers:\n${r.negotiationLevers.map((l) => `- ${l}`).join("\n")}` : "";
      const forModel = `${r.headline}\n\nFactors:\n${factorLines}\n\n${r.reformationNote}${warnLines}${levers}\n\n${r.disclaimer}`;
      return { forModel, raw: r };
    },
  },

  estimate_property_split: {
    def: {
      name: "estimate_property_split",
      description:
        "Estimate a Texas community-property division. Provide the marital estate as a list of items (assets and debts), each tagged community or separate. Use for divorce property questions.",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "The marital estate — assets and debts.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "e.g. 'Marital home equity'." },
                value: { type: "number", description: "Positive dollar amount." },
                kind: { type: "string", enum: ["asset", "debt"] },
                characterization: { type: "string", enum: ["community", "separate"] },
                owner: { type: "string", enum: ["a", "b"], description: "Required for separate property: which spouse owns it." },
              },
              required: ["label", "value", "kind", "characterization"],
            },
          },
          communityShareToA: { type: "number", description: "Fraction of the net community estate to spouse A (0–1, default 0.5)." },
        },
        required: ["items"],
      },
    },
    run: (input) => {
      const raw = Array.isArray(input.items) ? input.items : null;
      if (!raw || raw.length === 0) return needParams(["items (a list of assets and debts)"]);
      const items: PropertyItem[] = [];
      for (const it of raw) {
        const o = it as Record<string, unknown>;
        const label = strOf(o.label);
        const value = num(o.value);
        if (label === undefined || value === undefined) continue;
        const item: PropertyItem = {
          label,
          value,
          kind: o.kind === "debt" ? "debt" : "asset",
          characterization: o.characterization === "separate" ? "separate" : "community",
        };
        if (item.characterization === "separate") item.owner = o.owner === "b" ? "b" : "a";
        items.push(item);
      }
      if (items.length === 0) return needParams(["valid items (each needs a label and a value)"]);
      const args: PropertyDivisionInput = { items, communityShareToA: num(input.communityShareToA) };
      const result = dividePropertyEstate(args);
      return { forModel: formatPropertyDivisionEstimate(result), raw: result };
    },
  },

  possession_schedule: {
    def: {
      name: "possession_schedule",
      description:
        "Generate the Texas Standard Possession Order calendar for a date range. Use for custody/visitation questions.",
      input_schema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Range start, YYYY-MM-DD." },
          endDate: { type: "string", description: "Range end, YYYY-MM-DD." },
          distance: { type: "string", enum: ["within_100", "over_100"], description: "Whether the parents live within 100 miles of each other." },
          expanded: { type: "boolean", description: "Expanded SPO election (longer weekends)." },
        },
        required: ["startDate", "endDate", "distance"],
      },
    },
    run: (input) => {
      const startDate = strOf(input.startDate);
      const endDate = strOf(input.endDate);
      const distance = input.distance === "over_100" ? "over_100" : input.distance === "within_100" ? "within_100" : undefined;
      const missing: string[] = [];
      if (!startDate) missing.push("startDate");
      if (!endDate) missing.push("endDate");
      if (!distance) missing.push("distance (within_100 or over_100)");
      if (missing.length) return needParams(missing);
      const args: PossessionInput = { startDate: startDate!, endDate: endDate!, distance: distance!, expanded: boolOf(input.expanded) };
      const result = generatePossessionSchedule(args);
      return { forModel: formatPossessionSchedule(result), raw: result };
    },
  },

  estimate_bankruptcy_exemptions: {
    def: {
      name: "estimate_bankruptcy_exemptions",
      description:
        "Screen which assets are protected by Texas bankruptcy exemptions and which are at risk. Provide the assets as a list. Use when the user worries about losing property in bankruptcy.",
      input_schema: {
        type: "object",
        properties: {
          assets: {
            type: "array",
            description: "The user's assets.",
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["homestead", "vehicle", "household_goods", "tools_of_trade", "jewelry", "firearms", "retirement", "wages", "life_insurance", "cash_bank", "other_nonexempt"],
                },
                value: { type: "number", description: "Fair value in dollars." },
                label: { type: "string" },
              },
              required: ["category", "value"],
            },
          },
          isSingle: { type: "boolean", description: "Single filer (vs. married/family) — affects the personal-property cap." },
        },
        required: ["assets", "isSingle"],
      },
    },
    run: (input) => {
      const raw = Array.isArray(input.assets) ? input.assets : null;
      const isSingle = boolOf(input.isSingle);
      const missing: string[] = [];
      if (!raw || raw.length === 0) missing.push("assets (a list of the user's assets)");
      if (isSingle === undefined) missing.push("isSingle");
      if (missing.length) return needParams(missing);
      const CATS = ["homestead", "vehicle", "household_goods", "tools_of_trade", "jewelry", "firearms", "retirement", "wages", "life_insurance", "cash_bank", "other_nonexempt"];
      const assets: ExemptionAsset[] = [];
      for (const a of raw!) {
        const o = a as Record<string, unknown>;
        const category = strOf(o.category);
        const value = num(o.value);
        if (!category || !CATS.includes(category) || value === undefined) continue;
        assets.push({ category: category as AssetCategory, value, label: strOf(o.label) });
      }
      if (assets.length === 0) return needParams(["valid assets (each needs a known category and a value)"]);
      const result = checkExemptions(assets, isSingle!);
      return { forModel: `${result.summary}\n\n${result.disclaimer}`, raw: result };
    },
  },

  estimate_probate: {
    def: {
      name: "estimate_probate",
      description:
        "Compare the likely cost/route of Texas probate vs. a living trust vs. non-probate transfers for an estate. Use for estate-planning questions about avoiding probate.",
      input_schema: {
        type: "object",
        properties: {
          married: { type: "boolean" },
          ownsHome: { type: "boolean", description: "Owns a home or other Texas real estate." },
          outOfStateRealEstate: { type: "boolean", description: "Owns real estate in another state (ancillary probate)." },
          estateSize: { type: "string", enum: ["modest", "moderate", "substantial"], description: "modest <~$250k, moderate ~$250k–$1M, substantial >~$1M." },
          useNonProbateTools: { type: "boolean", description: "Willing to use TOD deeds + POD/beneficiary designations." },
        },
        required: ["married", "ownsHome", "estateSize"],
      },
    },
    run: (input) => {
      const married = boolOf(input.married);
      const ownsHome = boolOf(input.ownsHome);
      const estateSize = strOf(input.estateSize);
      const missing: string[] = [];
      if (married === undefined) missing.push("married");
      if (ownsHome === undefined) missing.push("ownsHome");
      if (!estateSize || !["modest", "moderate", "substantial"].includes(estateSize)) missing.push("estateSize (modest, moderate, or substantial)");
      if (missing.length) return needParams(missing);
      const profile: EstateProfile = {
        married: married!,
        ownsHome: ownsHome!,
        outOfStateRealEstate: boolOf(input.outOfStateRealEstate) ?? false,
        estateSize: estateSize as EstateSize,
        useNonProbateTools: boolOf(input.useNonProbateTools) ?? false,
      };
      const result = estimateProbateVsTrust(profile);
      return {
        forModel: `${result.verdict}\n\nThis is a general planning comparison, not legal advice — the right route depends on the specifics, which an attorney should confirm.`,
        raw: result,
      };
    },
  },

  estimate_pi_fault: {
    def: {
      name: "estimate_pi_fault",
      description:
        "Apply Texas proportionate-responsibility (modified comparative fault, 51% bar) to a personal-injury recovery. Use when the user's own share of fault affects what they could recover.",
      input_schema: {
        type: "object",
        properties: {
          totalDamages: { type: "number", description: "Total damages in dollars." },
          claimantFaultPct: { type: "number", description: "The claimant's assigned fault percentage (0–100)." },
        },
        required: ["totalDamages", "claimantFaultPct"],
      },
    },
    run: (input) => {
      const totalDamages = num(input.totalDamages);
      const claimantFaultPct = num(input.claimantFaultPct);
      const missing: string[] = [];
      if (totalDamages === undefined) missing.push("totalDamages");
      if (claimantFaultPct === undefined) missing.push("claimantFaultPct");
      if (missing.length) return needParams(missing);
      const result = computePiFaultImpact({ totalDamages: totalDamages!, claimantFaultPct: claimantFaultPct! });
      return { forModel: `${result.guidance}\n\n${result.disclaimer}`, raw: result };
    },
  },

  assess_matter: {
    def: {
      name: "assess_matter",
      description:
        "Get the prioritized state of THIS client's matter: what's DOABLE NOW, what's BLOCKED (and on what), and what's DONE. Call this when the user asks what to do next or where things stand, or to ground your guidance in the current file rather than guessing.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    run: async (_input, ctx) => {
      const tasks = await loadMatterTasks(ctx.db, ctx.caseFileId);
      if (!tasks) return { forModel: JSON.stringify({ error: "failed", message: "Could not read the file." }), raw: null };
      const body = formatMatterTasks(tasks);
      const forModel = body
        ? `${body}\n\n(You also have calculator tools — means test, child support, PI statute-of-limitations, spousal maintenance, defamation. If a doable-now item or the matter generally calls for one of those figures, offer to run it.)`
        : "The file has no open or completed items yet — help the user get the basics down first.";
      return { forModel, raw: tasks };
    },
  },

  // ── Write tools (Phase 4) — these change the client's file. The prompt requires
  // the model to CONFIRM with the user before calling them; never speculative. ──
  record_fact: {
    def: {
      name: "record_fact",
      description:
        "Save a fact the user has CONFIRMED into their Living File — a date, name, amount, or an estimate result they asked to keep. Only call this AFTER the user agrees to save it. Never record speculation, guesses, or unconfirmed claims.",
      input_schema: {
        type: "object",
        properties: { description: { type: "string", description: "The fact, as one concise sentence." } },
        required: ["description"],
      },
    },
    run: async (input, ctx) => {
      const description = strOf(input.description);
      if (!description) return needParams(["description"]);
      const { data: existing } = await ctx.db
        .from("fact_items").select("description").eq("case_file_id", ctx.caseFileId).eq("status", "confirmed");
      const set = new Set(((existing ?? []) as { description: string }[]).map((f) => f.description.toLowerCase()));
      if (set.has(description.toLowerCase())) {
        return { forModel: JSON.stringify({ ok: true, note: "That's already in the file." }), raw: { deduped: true } };
      }
      const { error } = await ctx.db.from("fact_items").insert({
        case_file_id: ctx.caseFileId, user_id: ctx.userId, description, status: "confirmed",
      });
      if (error) {
        console.error("[orchestrator-tools] record_fact insert error:", error);
        return { forModel: JSON.stringify({ error: "failed", message: "Could not save to the file." }), raw: null };
      }
      return { forModel: JSON.stringify({ ok: true, saved: description }), raw: { saved: description } };
    },
  },

  request_document: {
    def: {
      name: "request_document",
      description:
        "Add a document to the client's 'still needed' checklist so they know to upload it. Use when a fact needs proof or a specific record would move the matter forward. Tell the user you're adding it.",
      input_schema: {
        type: "object",
        properties: {
          description: { type: "string", description: "What document is needed, e.g. 'Signed lease agreement'." },
          reason: { type: "string", description: "Why it's needed (optional, shown to the client)." },
        },
        required: ["description"],
      },
    },
    run: async (input, ctx) => {
      const description = strOf(input.description);
      if (!description) return needParams(["description"]);
      const { data: existing } = await ctx.db
        .from("requested_attachments").select("description").eq("case_file_id", ctx.caseFileId);
      const set = new Set(((existing ?? []) as { description: string }[]).map((r) => r.description.toLowerCase()));
      if (set.has(description.toLowerCase())) {
        return { forModel: JSON.stringify({ ok: true, note: "Already on the checklist." }), raw: { deduped: true } };
      }
      const { error } = await ctx.db.from("requested_attachments").insert({
        case_file_id: ctx.caseFileId, user_id: ctx.userId, description,
        reason: strOf(input.reason) ?? null, status: "requested", source: "ai",
      });
      if (error) {
        console.error("[orchestrator-tools] request_document insert error:", error);
        return { forModel: JSON.stringify({ error: "failed", message: "Could not add it to the checklist." }), raw: null };
      }
      return { forModel: JSON.stringify({ ok: true, requested: description }), raw: { requested: description } };
    },
  },

  resolve_document_request: {
    def: {
      name: "resolve_document_request",
      description:
        "Check a document off the client's 'still needed' list. Call this when the client has PROVIDED a needed document (uploaded it, shared it in the chat, or given you the information it holds), OR when a needed document is NO LONGER RELEVANT because the plan changed. Match by the item's description. Tell the client what you checked off. Keep the file honest — don't leave a 'still needed' item up once it's handled.",
      input_schema: {
        type: "object",
        properties: {
          description: { type: "string", description: "The needed document to resolve, matching the 'still needed' item as closely as you can, e.g. 'Pay stubs'." },
          resolution: {
            type: "string",
            enum: ["received", "no_longer_needed"],
            description: "received = the client provided it; no_longer_needed = the approach changed and it's no longer required.",
          },
        },
        required: ["description", "resolution"],
      },
    },
    run: async (input, ctx) => {
      const description = strOf(input.description);
      const resolution = strOf(input.resolution);
      if (!description) return needParams(["description"]);
      if (resolution !== "received" && resolution !== "no_longer_needed") {
        return needParams(["resolution (received or no_longer_needed)"]);
      }
      const { data: openRows } = await ctx.db
        .from("requested_attachments")
        .select("id, description")
        .eq("case_file_id", ctx.caseFileId)
        .eq("user_id", ctx.userId)
        .eq("status", "requested");
      const rows = (openRows ?? []) as { id: string; description: string }[];
      if (rows.length === 0) {
        return { forModel: JSON.stringify({ ok: false, note: "There are no open document requests to resolve." }), raw: { matched: false } };
      }
      const match = matchRequest(rows, description);
      if (!match) {
        return {
          forModel: JSON.stringify({ ok: false, note: "No clear match on the 'still needed' list.", open: rows.map((r) => r.description) }),
          raw: { matched: false, open: rows.map((r) => r.description) },
        };
      }
      const newStatus = resolution === "received" ? "uploaded" : "waived";
      const { error } = await ctx.db
        .from("requested_attachments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", match.id)
        .eq("user_id", ctx.userId);
      if (error) {
        console.error("[orchestrator-tools] resolve_document_request error:", error);
        return { forModel: JSON.stringify({ error: "failed", message: "Could not update the checklist." }), raw: null };
      }
      return { forModel: JSON.stringify({ ok: true, resolved: match.description, as: resolution }), raw: { id: match.id, resolution } };
    },
  },

  add_government_form: {
    def: {
      name: "add_government_form",
      description:
        "Add an official government form to the client's file so it appears in their forms checklist and (where supported) the guided fill flow. Pass form_key from this catalog:\n" +
        GOVERNMENT_FORMS.map((f) => `- ${f.key}: ${f.form_number} — ${f.title}. Needed when: ${f.who_needs_it}`).join("\n") +
        "\nOnly for these official forms; for anything else use request_document. Tell the client you've added it.",
      input_schema: {
        type: "object",
        properties: {
          form_key: { type: "string", enum: GOVERNMENT_FORMS.map((f) => f.key), description: "The catalog key of the form to add." },
          query: { type: "string", description: "Fallback: a form name/description if you're unsure of the key." },
          reason: { type: "string", description: "Why this client needs it (optional, shown to the client)." },
        },
        required: [],
      },
    },
    run: async (input, ctx) => {
      const key = strOf(input.form_key);
      let form = key && isKnownFormKey(key) ? getGovernmentForm(key) : undefined;
      if (!form) {
        const query = strOf(input.query);
        if (query) form = matchFormsByText(query)[0];
      }
      if (!form) {
        return {
          forModel: JSON.stringify({ ok: false, note: "No matching official form in the catalog. If the client already has the form, use request_document instead." }),
          raw: { matched: false },
        };
      }
      const { error } = await ctx.db.from("form_instruments").upsert(
        {
          case_file_id: ctx.caseFileId,
          user_id: ctx.userId,
          form_key: form.key,
          reason: strOf(input.reason) ?? null,
          status: "needed",
          source: "registry",
        },
        { onConflict: "case_file_id,form_key", ignoreDuplicates: true },
      );
      if (error) {
        console.error("[orchestrator-tools] add_government_form upsert error:", error);
        return { forModel: JSON.stringify({ error: "failed", message: "Could not add the form." }), raw: null };
      }
      return { forModel: JSON.stringify({ ok: true, added: form.title, form_key: form.key }), raw: { form_key: form.key, title: form.title } };
    },
  },

  // Generative, unlike the deterministic calculators: reuses the What-If Game's
  // specialized strategist prompt to produce a structured, saved set of "what if…"
  // scenarios for THIS file. The orchestrator presents them and talks through the
  // client's preferences (saving any firm one with record_fact). Scenarios persist
  // to what_if_sessions, kept clear of legal_strategy.
  run_what_if: {
    def: {
      name: "run_what_if",
      description:
        "Pressure-test the matter with a structured set of 'what if…' strategy scenarios (the What-If Game), generated for THIS client's file. Use when the client wants to think a few steps ahead or weigh contingencies, or to surface possibilities they haven't considered — not for a quick single question you can just answer. Returns scenarios to talk through; it decides nothing. Optionally focus it on a specific situation.",
      input_schema: {
        type: "object",
        properties: {
          scenario: { type: "string", description: "Optional: a specific situation to pressure-test. Omit to generate from the file as a whole." },
        },
        required: [],
      },
    },
    run: async (input, ctx) => {
      const scenarioText = strOf(input.scenario) ?? "";
      const { data: caseFile } = await ctx.db.from("case_files").select("*").eq("id", ctx.caseFileId).maybeSingle();
      if (!caseFile) return { forModel: JSON.stringify({ error: "no_file", note: "No case file in context." }), raw: null };
      const { data: factRows } = await ctx.db.from("fact_items").select("*").eq("case_file_id", ctx.caseFileId);
      const fileContext = buildFileContext(caseFile as CaseFile, (factRows ?? []) as FactItem[]);

      const parts = [fileContext];
      if (scenarioText) parts.push(`THE USER DESCRIBES THEIR SITUATION:\n${scenarioText}`);
      parts.push("Generate the What-If scenarios now as JSON only.");

      const MODEL = "claude-sonnet-4-6";
      let text = "";
      try {
        const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: Math.min(maxOutputTokensFor(MODEL), 8000),
          system: WHAT_IF_SYSTEM_PROMPT,
          messages: [{ role: "user", content: parts.join("\n\n") }],
        });
        const finalMsg = await stream.finalMessage();
        text = finalMsg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        // Meter this tool's own model call: run_what_if runs a full Sonnet
        // generation inside the orchestrator loop, so its tokens must land on
        // the ledger like any other AI spend or the margin silently leaks.
        await recordAiFromMessage(ctx.db, finalMsg, {
          userId: ctx.userId,
          actorId: ctx.userId,
          caseFileId: ctx.caseFileId,
          feature: "what_if",
          metadata: { source: "orchestrator_tool", tool: "run_what_if" },
        });
      } catch (err) {
        console.error("[orchestrator-tools] run_what_if generation error:", err);
        return { forModel: JSON.stringify({ error: "failed", message: "Could not generate scenarios right now." }), raw: null };
      }

      const parsed = parseWhatIfResponse(text);
      if (parsed.scenarios.length === 0) {
        return { forModel: JSON.stringify({ ok: false, note: "No scenarios generated — add a bit more detail about the situation and try again." }), raw: parsed };
      }

      // Persist to the What-If store (best-effort; never blocks the tool result).
      try {
        await ctx.db.from("what_if_sessions").insert({
          user_id: ctx.userId,
          case_file_id: ctx.caseFileId,
          scenario_input: scenarioText || null,
          scenarios: parsed.scenarios,
        });
      } catch (err) {
        console.error("[orchestrator-tools] run_what_if session persist skipped:", err);
      }

      const list = parsed.scenarios
        .map((s, i) => `${i + 1}. ${s.question}\n   Why it matters: ${s.why_it_matters}`)
        .join("\n");
      const forModel =
        `${parsed.intro}\n\n${list}\n\n` +
        "Present these to the client conversationally, one or a few at a time, and talk through their preferences. When a preference is firm, offer to save it with record_fact so it becomes a contingency preference on the file. These are strategy prompts, not advice or documents.";
      return { forModel, urgency: undefined, raw: parsed };
    },
  },
};

// Tools that mutate the client's record (or, for run_what_if, persist a client-
// side What-If session). The attorney associate (work-product, not the client
// channel) gets the read-only set only.
const WRITE_TOOL_NAMES = new Set(["record_fact", "request_document", "resolve_document_request", "add_government_form", "run_what_if"]);

/** All tool definitions — the consumer orchestrator, which may write to its own file. */
export const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.def);

/** Analysis-only tools (calculators + assess_matter) — no writes. For the attorney associate. */
export const READ_ONLY_TOOLS: Anthropic.Tool[] = Object.entries(TOOLS)
  .filter(([name]) => !WRITE_TOOL_NAMES.has(name))
  .map(([, t]) => t.def);

/** True if a name is a known orchestrator tool. */
export function isOrchestratorTool(name: string): boolean {
  return name in TOOLS;
}

/**
 * Run a tool by name. Calculators are deterministic and side-effect free;
 * assess_matter reads the file via ctx. Unknown tools and thrown errors return a
 * structured result the model can recover from rather than hard-failing the turn.
 */
export async function dispatchTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { forModel: JSON.stringify({ error: "unknown_tool", name }), raw: null };
  try {
    return await tool.run((input ?? {}) as Record<string, unknown>, ctx);
  } catch (err) {
    console.error(`[orchestrator-tools] ${name} failed:`, err);
    return { forModel: JSON.stringify({ error: "failed", message: "The tool could not run with those inputs." }), raw: null };
  }
}
