import type Anthropic from "@anthropic-ai/sdk";
import { runMeansTest, formatMeansTest, type MeansTestInput } from "./bankruptcy-means-test.ts";
import { estimateChildSupport, formatChildSupportEstimate, type ChildSupportInput } from "./family-support-calc.ts";
import { screenPiSol, formatPiSol, type PiSolInput } from "./pi-sol-calc.ts";
import { screenMaintenance, formatMaintenanceScreen, type MaintenanceInput } from "./family-maintenance-calc.ts";
import { assessDefamation, type DefamationInput } from "./defamation-assessment.ts";
import { dividePropertyEstate, formatPropertyDivisionEstimate, type PropertyDivisionInput, type PropertyItem } from "./family-property-calc.ts";
import { generatePossessionSchedule, formatPossessionSchedule, type PossessionInput } from "./family-possession-calc.ts";
import { checkExemptions, type ExemptionAsset, type AssetCategory } from "./bankruptcy-exemptions.ts";
import { estimateProbateVsTrust, type EstateProfile, type EstateSize } from "./estate-probate-estimate.ts";
import { computePiFaultImpact } from "./pi-fault-calc.ts";
import { matchFormsByText, getGovernmentForm, isKnownFormKey, GOVERNMENT_FORMS } from "./government-forms.ts";
import { loadMatterTasks, formatMatterTasks } from "./matter-assessment.ts";

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
};

// Tools that mutate the client's record. The attorney associate (work-product,
// not the client channel) gets the read-only set only.
const WRITE_TOOL_NAMES = new Set(["record_fact", "request_document", "add_government_form"]);

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
