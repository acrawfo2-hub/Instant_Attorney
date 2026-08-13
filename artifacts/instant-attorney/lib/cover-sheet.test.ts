import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverActionHref,
  coverCaption,
  coverCatch,
  coverGoal,
  coverStanding,
  matchingAction,
} from "./cover-sheet.ts";
import type { DeckAction } from "./file-deck.ts";

test("caption names the matter and the forum, and says so when either is unknown", () => {
  assert.equal(coverCaption("divorce", "Texas"), "divorce · Texas");
  assert.equal(coverCaption("child_custody", "Harris County, Texas"), "child custody · Harris County, Texas");
  assert.equal(coverCaption(null, null), "Intake in progress · State not confirmed");
  assert.equal(coverCaption("", "Unconfirmed"), "Intake in progress · State not confirmed");
  assert.equal(coverCaption(null, "Unconfirmed — defaulting to Texas"), "Intake in progress · State not confirmed");
});

test("standing is the file summary only, capped at three sentences", () => {
  assert.equal(coverStanding(null), "");
  assert.equal(
    coverStanding("Wife filed last month. Two children. You want primary custody. Extra sentence four."),
    "Wife filed last month. Two children. You want primary custody.",
  );
});

test("goal is the first stored goal, or an honest empty", () => {
  assert.equal(coverGoal(["Keep the house", "Fair support"]), "Keep the house");
  assert.equal(coverGoal([]), "We'll pin this down as we talk.");
  assert.equal(coverGoal(null), "We'll pin this down as we talk.");
});

test("the catch never goes silent", () => {
  assert.deepEqual(coverCatch("Date you were served", "He will claim no notice"), {
    kind: "gap",
    text: "Date you were served",
  });
  assert.deepEqual(coverCatch(null, "No written agreement"), {
    kind: "risk",
    text: "No written agreement",
  });
  assert.deepEqual(coverCatch(null, null), {
    kind: "untested",
    text: "We have not pressure-tested this yet.",
  });
});

test("cover actions open the draft or the upload when that is the job", () => {
  const chat = "/chat?caseFileId=cf1";
  assert.equal(
    coverActionHref(chat, "cf1", { kind: "draft", draftId: "w1", ask: "Finish the letter" }),
    "/chat?caseFileId=cf1&draft=w1",
  );
  assert.equal(
    coverActionHref(chat, "cf1", { kind: "upload", ask: "Upload pay stubs" }),
    "/dashboard/cf1?view=documents#uploads",
  );
  assert.equal(
    coverActionHref(chat, "cf1", { kind: "chat", ask: "Draft my answer" }),
    "/chat?caseFileId=cf1&ask=Draft%20my%20answer",
  );
  assert.equal(coverActionHref(chat, "cf1", null, "What should I do next?"), "/chat?caseFileId=cf1&ask=What%20should%20I%20do%20next%3F");
  assert.equal(coverActionHref(chat, "cf1", null), chat);
});

test("matchingAction finds the deck row for the next-step title", () => {
  const actions = [
    { id: "a", label: "Fill in the answer", kind: "draft", draftId: "w1", ask: "x", urgency: "normal", blocked: false },
  ] as DeckAction[];
  assert.equal(matchingAction(actions, "Fill in the answer")?.draftId, "w1");
  assert.equal(matchingAction(actions, "Something else"), null);
});
