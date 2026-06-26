// ── Personal Injury Roadmap ──────────────────────────────────────────────────
//
// Turns a PI matter into a staged map — "here is the whole path, and here is
// where you are" — so injured people know what an expert attorney would do
// next. Evidence-based completion signals; writes nothing. Mirrors
// lib/family-roadmap.ts.

import { assignStageStatuses } from "./roadmap-status.ts";

export type PiPath =
  | "auto_accident"
  | "premises"
  | "medical_malpractice"
  | "wrongful_death"
  | "general";

export type StageStatus = "done" | "current" | "upcoming";

export interface RoadmapStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

export interface PiRoadmap {
  path: PiPath;
  pathLabel: string;
  /** True when the matter shows severe-injury / SOL-urgency signals. */
  urgent: boolean;
  urgentNote?: string;
  stages: RoadmapStage[];
  disclaimer: string;
}

export interface PiRoadmapInput {
  matterText?: string | null;
  facts?: string[];
  documents?: { title: string; status: string }[];
}

const DISCLAIMER =
  "This roadmap is general legal information about the typical Texas personal-injury process, not legal advice. Every claim is different, insurers vary, and your specific facts control. Use it as a map, not a guarantee.";

const URGENT_NOTE =
  "Statutes of limitations and disappearing evidence make timing critical in injury cases. Texas generally gives you two years to sue — but do not wait. Get medical care, preserve evidence, and understand your deadline now.";

interface Signals {
  hasMedicalTreatment: boolean;
  hasPoliceReport: boolean;
  hasPhotos: boolean;
  hasInsurerContact: boolean;
  hasPreservationLetter: boolean;
  hasDemand: boolean;
  hasAttorney: boolean;
  hasLitigation: boolean;
}

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

function deriveSignals(input: PiRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const facts = input.facts ?? [];
  const text = [input.matterText ?? "", ...facts, ...docs.map((d) => d.title)].join(" \n ").toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const docTitle = (re: RegExp) => docs.some((d) => re.test(d.title.toLowerCase()));
  const docDone = (re: RegExp) =>
    docs.some((d) => re.test(d.title.toLowerCase()) && DONE_DOC_STATUSES.has(d.status));

  return {
    hasMedicalTreatment: has(/treated|hospital|er |emergency room|doctor|surgery|physical therapy|mri|x-ray|medical bill/),
    hasPoliceReport: has(/police report|crash report|incident report|officer/),
    hasPhotos: has(/photo|picture|video|dash cam|surveillance/),
    hasInsurerContact: has(/adjuster|insurance company|claim number|recorded statement/),
    hasPreservationLetter: docDone(/preserv|spoliation/) || has(/preservation letter|preserve evidence/),
    hasDemand: docDone(/demand|settlement demand/) || has(/demand letter|settlement demand|counter-offer/),
    hasAttorney: has(/attorney|lawyer|letter of representation|retained counsel/),
    hasLitigation: has(/lawsuit|petition filed|litigation|sued|filed suit/),
  };
}

export function detectPiPath(matterText: string | null | undefined): PiPath {
  const t = (matterText ?? "").toLowerCase();
  if (/wrongful death|died|fatal|killed/.test(t)) return "wrongful_death";
  if (/malpractice|med mal|surgical|misdiagnosis|doctor mistake|hospital negligence/.test(t)) return "medical_malpractice";
  if (/slip and fall|trip and fall|premises|fell at|store accident|wet floor/.test(t)) return "premises";
  if (/car accident|auto accident|crash|rear.end|truck accident|motorcycle|pedestrian/.test(t)) return "auto_accident";
  return "general";
}

const PATH_LABELS: Record<PiPath, string> = {
  auto_accident: "Auto / motor-vehicle accident",
  premises: "Premises liability",
  medical_malpractice: "Medical malpractice",
  wrongful_death: "Wrongful death",
  general: "Personal injury claim",
};

interface StageBlueprint {
  key: string;
  title: string;
  body: string;
  tip?: string;
  complete: (s: Signals) => boolean;
}

function immediateStages(): StageBlueprint[] {
  return [
    {
      key: "treatment",
      title: "Get medical care",
      body: "Treat every injury promptly and follow your doctors. Medical records are the backbone of your damages — gaps give insurers an excuse to lowball.",
      tip: "Go to the ER after a crash even if you feel 'okay' — adrenaline masks injuries.",
      complete: (s) => s.hasMedicalTreatment,
    },
    {
      key: "document",
      title: "Document the incident",
      body: "Police report, photos of vehicles/scene/injuries, witness names, and your own written timeline while memory is fresh.",
      complete: (s) => s.hasPoliceReport && s.hasPhotos,
    },
    {
      key: "preserve",
      title: "Preserve evidence",
      body: "Send a preservation letter for surveillance video, vehicle black-box data, or corporate records before they are deleted.",
      complete: (s) => s.hasPreservationLetter,
    },
  ];
}

function claimStages(): StageBlueprint[] {
  return [
    {
      key: "insurance",
      title: "Handle the insurers carefully",
      body: "Notify your own insurer (check PIP/UM). You are generally not required to give a recorded statement to the other party's insurer — communicate deliberately.",
      complete: (s) => s.hasInsurerContact,
    },
    {
      key: "damages",
      title: "Build your damages file",
      body: "Collect medical bills/records, proof of lost wages, and receipts for out-of-pocket costs. You cannot evaluate a fair settlement without the full picture.",
      complete: (s) => s.hasMedicalTreatment && s.hasDemand,
    },
    {
      key: "demand",
      title: "Demand & negotiate",
      body: "A structured written demand with evidence often moves insurers more than phone arguments. Counter lowball offers with numbers, not frustration.",
      complete: (s) => s.hasDemand,
    },
    {
      key: "resolve",
      title: "Settle or litigate",
      body: "If negotiation fails, filing suit before the two-year deadline protects your rights. Most cases still settle — but the lawsuit is the leverage.",
      tip: "Run the limitations screener and do not let the adjuster run out the clock.",
      complete: (s) => s.hasLitigation || s.hasAttorney,
    },
  ];
}

function medMalStages(): StageBlueprint[] {
  return [
    {
      key: "records",
      title: "Obtain complete medical records",
      body: "Pull records from every provider involved. Malpractice cases turn on what the chart says happened.",
      complete: (s) => s.hasMedicalTreatment,
    },
    {
      key: "timeline",
      title: "Build a medical timeline",
      body: "Symptoms → visits → what went wrong → subsequent treatment. Identify the exact acts you believe were negligent.",
      complete: (s) => s.hasMedicalTreatment && s.hasAttorney,
    },
    {
      key: "expert",
      title: "Expert review & pre-suit requirements",
      body: "Texas malpractice litigation requires expert support early. These cases are complex — experienced malpractice counsel is essential.",
      tip: "Malpractice has a ten-year statute of repose — do not assume you have unlimited time.",
      complete: (s) => s.hasAttorney || s.hasLitigation,
    },
  ];
}

function wrongfulDeathStages(): StageBlueprint[] {
  return [
    {
      key: "standing",
      title: "Identify beneficiaries",
      body: "Determine which family members have standing (spouse, children, parents) and coordinate so the insurer cannot divide you.",
      complete: (s) => s.hasAttorney,
    },
    {
      key: "proof",
      title: "Gather core proof",
      body: "Death certificate, autopsy, police/crash report, and evidence preservation — immediately.",
      complete: (s) => s.hasPoliceReport && s.hasPreservationLetter,
    },
    ...claimStages(),
  ];
}

function blueprintsFor(path: PiPath): StageBlueprint[] {
  switch (path) {
    case "medical_malpractice":
      return medMalStages();
    case "wrongful_death":
      return wrongfulDeathStages();
    case "auto_accident":
    case "premises":
    case "general":
      return [...immediateStages(), ...claimStages()];
  }
}

export function buildPiRoadmap(input: PiRoadmapInput): PiRoadmap {
  const path = detectPiPath(input.matterText);
  const signals = deriveSignals(input);
  const blueprints = blueprintsFor(path);
  const statuses = assignStageStatuses(blueprints.map((b) => b.complete(signals)));

  const stages: RoadmapStage[] = blueprints.map((b, i) => ({
    key: b.key,
    title: b.title,
    body: b.body,
    status: statuses[i],
    ...(b.tip ? { tip: b.tip } : {}),
  }));

  const urgentText = [(input.matterText ?? ""), ...(input.facts ?? [])].join(" ").toLowerCase();
  const urgent =
    /statute of limitations|deadline|two year|2 year|years ago|denied|surgery|hospital|wrongful death|fatal/.test(
      urgentText
    );

  return {
    path,
    pathLabel: PATH_LABELS[path],
    urgent,
    ...(urgent ? { urgentNote: URGENT_NOTE } : {}),
    stages,
    disclaimer: DISCLAIMER,
  };
}
