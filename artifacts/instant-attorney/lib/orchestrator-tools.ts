import type Anthropic from "@anthropic-ai/sdk";
import { runMeansTest, formatMeansTest, type MeansTestInput } from "./bankruptcy-means-test.ts";
import { estimateChildSupport, formatChildSupportEstimate, type ChildSupportInput } from "./family-support-calc.ts";
import { screenPiSol, formatPiSol, type PiSolInput } from "./pi-sol-calc.ts";
import { screenMaintenance, formatMaintenanceScreen, type MaintenanceInput } from "./family-maintenance-calc.ts";
import { assessDefamation, type DefamationInput } from "./defamation-assessment.ts";

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

interface ToolDef {
  def: Anthropic.Tool;
  run: (input: Record<string, unknown>) => ToolResult;
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
};

/** The Anthropic tool definitions to pass to the model (freestyle/orchestrator only). */
export const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.def);

/** True if a name is a known orchestrator tool. */
export function isOrchestratorTool(name: string): boolean {
  return name in TOOLS;
}

/**
 * Run a tool by name. Deterministic and side-effect free (Phase 2). Unknown tools
 * and thrown errors return a structured result the model can recover from rather
 * than hard-failing the turn.
 */
export function dispatchTool(name: string, input: unknown): ToolResult {
  const tool = TOOLS[name];
  if (!tool) return { forModel: JSON.stringify({ error: "unknown_tool", name }), raw: null };
  try {
    return tool.run((input ?? {}) as Record<string, unknown>);
  } catch (err) {
    console.error(`[orchestrator-tools] ${name} failed:`, err);
    return { forModel: JSON.stringify({ error: "failed", message: "The tool could not run with those inputs." }), raw: null };
  }
}
