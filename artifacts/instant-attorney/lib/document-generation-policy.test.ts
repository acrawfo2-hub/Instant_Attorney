import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateDocumentOutcomes,
  evaluateGenerationEligibility,
  mayPersistGeneration,
  orderGenerationQueue,
  supersedeJobs,
  type GenerationEligibilityInput,
  type GenerationPolicyConfig,
} from "./document-generation-policy.ts";

const config: GenerationPolicyConfig = { confidenceFloor: "medium", minimumFactCoverage: 0.75, maximumEstimatedModelCost: 2 };
const valid: GenerationEligibilityInput = {
  userDraftingIntent: "package", planConfidence: "high", documentPriority: 0,
  requiredFactCoverage: 0.9, estimatedModelCost: 1, activeJobCount: 0,
  duplicatesWorkspaceDraft: false, duplicatesPromotedDocument: false, instrumentConfirmed: false,
};

test("enforces confidence, confirmation, duplication, and the three-job cap", () => {
  assert.equal(evaluateGenerationEligibility({ ...valid, planConfidence: "low" }, config).eligible, false);
  assert.deepEqual(evaluateGenerationEligibility({ ...valid, planConfidence: "medium" }, config), {
    eligible: false, requiresConfirmation: true, code: "confirmation_required",
  });
  assert.equal(evaluateGenerationEligibility({ ...valid, activeJobCount: 3 }, config).eligible, false);
  assert.equal(evaluateGenerationEligibility({ ...valid, duplicatesWorkspaceDraft: true }, config).eligible, false);
  assert.equal(evaluateGenerationEligibility({ ...valid, duplicatesPromotedDocument: true }, config).eligible, false);
});

test("records an auditable launch reason and keeps the lead first", () => {
  const direct = evaluateGenerationEligibility({ ...valid, userDraftingIntent: "single_document" }, config);
  assert.equal(direct.eligible && direct.launchReason, "user_requested");
  const confirmed = evaluateGenerationEligibility({ ...valid, planConfidence: "medium", instrumentConfirmed: true }, config);
  assert.equal(confirmed.eligible && confirmed.launchReason, "package_confirmed");
  assert.deepEqual(orderGenerationQueue([
    { id: "later", documentKey: "b", revision: 1, status: "queued", schedulingPriority: 2 },
    { id: "lead", documentKey: "a", revision: 1, status: "queued", schedulingPriority: 0 },
  ]).map((job) => job.id), ["lead", "later"]);
});

test("cancels obsolete queued jobs and rejects superseded worker writes", () => {
  const [queued, running] = supersedeJobs([
    { id: "q", documentKey: "old", revision: 1, status: "queued", schedulingPriority: 0 },
    { id: "r", documentKey: "kept", revision: 1, status: "running", schedulingPriority: 1 },
  ], 2, new Set(["kept"]));
  assert.equal(queued.status, "cancelled");
  assert.equal(running.status, "superseded");
  assert.equal(mayPersistGeneration(running, 2), false);
  assert.equal(mayPersistGeneration({ ...running, revision: 2, status: "running" }, 2), true);
});

test("aggregates the complete usage funnel by document type", () => {
  const metrics = aggregateDocumentOutcomes([
    { documentType: "motion", outcome: "generated" },
    { documentType: "motion", outcome: "opened" },
    { documentType: "letter", outcome: "discarded" },
  ]);
  assert.equal(metrics.motion.generated, 1);
  assert.equal(metrics.motion.opened, 1);
  assert.equal(metrics.motion.promoted, 0);
  assert.equal(metrics.letter.discarded, 1);
});
