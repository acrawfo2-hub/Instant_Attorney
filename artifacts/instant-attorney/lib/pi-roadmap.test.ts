import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPiRoadmap, detectPiPath } from "./pi-roadmap.ts";

test("detectPiPath routes common matter types", () => {
  assert.equal(detectPiPath("car accident on I-35"), "auto_accident");
  assert.equal(detectPiPath("slip and fall at grocery store"), "premises");
  assert.equal(detectPiPath("medical malpractice surgical error"), "medical_malpractice");
  assert.equal(detectPiPath("wrongful death fatal crash"), "wrongful_death");
});

test("buildPiRoadmap returns stages with exactly one current", () => {
  const roadmap = buildPiRoadmap({
    matterText: "rear-ended in a car accident, treating at hospital",
    facts: ["Went to ER after crash"],
    documents: [],
  });
  assert.equal(roadmap.path, "auto_accident");
  assert.ok(roadmap.stages.length >= 4);
  const currents = roadmap.stages.filter((s) => s.status === "current");
  assert.equal(currents.length, 1);
  assert.ok(roadmap.disclaimer.length > 20);
});

test("urgent banner on deadline language", () => {
  const roadmap = buildPiRoadmap({ matterText: "car accident two years ago worried about statute of limitations" });
  assert.equal(roadmap.urgent, true);
  assert.ok(roadmap.urgentNote);
});
