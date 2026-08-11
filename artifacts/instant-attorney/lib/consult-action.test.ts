import { test } from "node:test";
import assert from "node:assert/strict";
import { getConsultAction } from "./consult-action.ts";
import type { ConsultRequest } from "./types.ts";

const request = (status: ConsultRequest["status"], id = "consult-1") =>
  ({ id, status }) as ConsultRequest;

test("scheduling destination follows subscription state", () => {
  assert.deepEqual(getConsultAction(null, true), {
    label: "Schedule attorney time",
    href: "/consult/schedule",
  });
  assert.deepEqual(getConsultAction(undefined, false), {
    label: "Schedule attorney time",
    href: "/register?upgrade=consult",
  });
});

test("pending and attorney-proposed requests lead to appointment management", () => {
  assert.deepEqual(getConsultAction(request("pending"), true), {
    label: "Manage appointment",
    href: "/dashboard#consult-status",
  });
  assert.deepEqual(getConsultAction(request("attorney_proposed"), true), {
    label: "Respond to proposed time",
    href: "/dashboard#consult-status",
  });
});

test("a confirmed request leads to its appointment page", () => {
  assert.deepEqual(getConsultAction(request("confirmed", "confirmed-1"), false), {
    label: "View confirmed appointment",
    href: "/consult/confirmed-1/session",
  });
});
