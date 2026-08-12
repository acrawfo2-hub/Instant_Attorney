import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseAccount,
  validateTempPassword,
  REPAIRS,
  MIN_TEMP_PASSWORD_LENGTH,
  type AccountSnapshot,
  type AuthUserFacts,
  type ProfileFacts,
  type SubscriptionFacts,
} from "./account-diagnosis.ts";

const NOW = new Date("2026-08-08T12:00:00Z");

function authUser(over: Partial<AuthUserFacts> = {}): AuthUserFacts {
  return {
    id: "u1",
    email: "client@example.com",
    emailConfirmedAt: "2026-01-01T00:00:00Z",
    lastSignInAt: "2026-08-01T00:00:00Z",
    bannedUntil: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function profile(over: Partial<ProfileFacts> = {}): ProfileFacts {
  return {
    id: "u1",
    email: "client@example.com",
    fullName: "A Client",
    isAttorney: false,
    accountType: "client",
    attorneyUserStatus: null,
    ...over,
  };
}

function subscription(over: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    status: "active",
    plan: "phase2",
    currentPeriodEnd: "2026-12-01T00:00:00Z",
    stripeCustomerId: "cus_1",
    consultCredits: 0,
    ...over,
  };
}

function snapshot(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    query: "client@example.com",
    authUser: authUser(),
    profile: profile(),
    subscription: subscription(),
    authError: null,
    profileError: null,
    subscriptionError: null,
    capturedAt: NOW.toISOString(),
    ...over,
  };
}

const ids = (s: AccountSnapshot) => diagnoseAccount(s, NOW).findings.map((f) => f.id);

test("a fully provisioned account is healthy", () => {
  const d = diagnoseAccount(snapshot(), NOW);
  assert.equal(d.status, "healthy");
  assert.match(d.headline, /Healthy/);
  assert.deepEqual(d.findings, []);
});

test("no auth user reports no account and offers no repairs", () => {
  const d = diagnoseAccount(snapshot({ authUser: null, profile: null, subscription: null }), NOW);
  assert.equal(d.status, "no-account");
  assert.match(d.headline, /No account exists for client@example\.com/);
  assert.deepEqual(d.repairs, []);
});

test("an unconfirmed email blocks sign-in and offers confirm-email", () => {
  const d = diagnoseAccount(snapshot({ authUser: authUser({ emailConfirmedAt: null }) }), NOW);
  assert.equal(d.status, "blocked-signin");
  assert.ok(d.findings.some((f) => f.id === "email-unconfirmed" && f.repair === "confirm-email"));
  assert.equal(d.repairs[0], "confirm-email");
});

test("a future ban blocks sign-in; a past ban does not", () => {
  const banned = diagnoseAccount(
    snapshot({ authUser: authUser({ bannedUntil: "2026-08-09T00:00:00Z" }) }),
    NOW
  );
  assert.equal(banned.status, "blocked-signin");
  assert.ok(banned.repairs.includes("clear-lockout"));

  const expired = diagnoseAccount(
    snapshot({ authUser: authUser({ bannedUntil: "2026-08-07T00:00:00Z" }) }),
    NOW
  );
  assert.equal(expired.status, "healthy");
});

test("sign-in blockers outrank app blockers in the headline", () => {
  const d = diagnoseAccount(
    snapshot({ authUser: authUser({ emailConfirmedAt: null }), subscription: null }),
    NOW
  );
  assert.equal(d.status, "blocked-signin");
  assert.match(d.headline, /Cannot sign in/);
  // The app blocker is still reported, just not the verdict.
  assert.ok(d.findings.some((f) => f.id === "no-subscription"));
});

test("the stage-46 case — unconfirmed email plus no profile row — names both", () => {
  const d = diagnoseAccount(
    snapshot({ authUser: authUser({ emailConfirmedAt: null }), profile: null, subscription: null }),
    NOW
  );
  assert.deepEqual(ids(snapshot({ authUser: authUser({ emailConfirmedAt: null }), profile: null, subscription: null })), [
    "email-unconfirmed",
    "no-profile",
  ]);
  assert.ok(d.repairs.includes("confirm-email"));
  assert.ok(d.repairs.includes("create-profile"));
  // No subscription finding: a missing profile makes the grant impossible anyway
  // (subscriptions.user_id references profiles(id)), so fix the profile first.
  assert.ok(!d.repairs.includes("grant-subscription"));
});

test("a missing subscription locks the app but not sign-in", () => {
  const d = diagnoseAccount(snapshot({ subscription: null }), NOW);
  assert.equal(d.status, "blocked-app");
  assert.match(d.headline, /Signs in, but the app is locked/);
  assert.equal(d.repairs[0], "grant-subscription");
});

test("only active, trialing and bypass unlock the product", () => {
  for (const status of ["active", "trialing", "bypass"]) {
    assert.equal(
      diagnoseAccount(snapshot({ subscription: subscription({ status }) }), NOW).status,
      "healthy",
      `${status} should unlock`
    );
  }
  for (const status of ["canceled", "past_due", "incomplete"]) {
    const d = diagnoseAccount(snapshot({ subscription: subscription({ status }) }), NOW);
    assert.equal(d.status, "blocked-app", `${status} should not unlock`);
    assert.ok(d.repairs.includes("grant-subscription"));
  }
});

test("an active subscription past its period end warns without blocking", () => {
  const d = diagnoseAccount(
    snapshot({ subscription: subscription({ currentPeriodEnd: "2026-07-01T00:00:00Z" }) }),
    NOW
  );
  assert.equal(d.status, "healthy");
  assert.ok(d.findings.some((f) => f.id === "subscription-period-lapsed" && f.severity === "warn"));
});

test("a bypass subscription is never judged on its billing period", () => {
  const d = diagnoseAccount(
    snapshot({ subscription: subscription({ status: "bypass", currentPeriodEnd: null }) }),
    NOW
  );
  assert.equal(d.status, "healthy");
  assert.deepEqual(d.findings, []);
});

test("attorney-side accounts skip the subscription gate", () => {
  const attorney = diagnoseAccount(
    snapshot({ profile: profile({ isAttorney: true }), subscription: null }),
    NOW
  );
  assert.equal(attorney.status, "healthy");

  const approved = diagnoseAccount(
    snapshot({
      profile: profile({ accountType: "attorney_user", attorneyUserStatus: "approved" }),
      subscription: null,
    }),
    NOW
  );
  assert.equal(approved.status, "healthy");
});

test("a pending attorney signup locks the app", () => {
  const d = diagnoseAccount(
    snapshot({
      profile: profile({ accountType: "attorney_user", attorneyUserStatus: "pending" }),
      subscription: null,
    }),
    NOW
  );
  assert.equal(d.status, "blocked-app");
  assert.ok(d.findings.some((f) => f.id === "attorney-pending"));
});

test("a failed profile read is a warning, not a missing profile", () => {
  const d = diagnoseAccount(
    snapshot({ profile: null, profileError: 'infinite recursion detected in policy for relation "profiles"' }),
    NOW
  );
  assert.ok(d.findings.some((f) => f.id === "profile-read-failed"));
  assert.ok(!d.findings.some((f) => f.id === "no-profile"));
  assert.ok(!d.repairs.includes("create-profile"));
});

test("a failed auth read reports unknown rather than guessing", () => {
  const d = diagnoseAccount(snapshot({ authError: "fetch failed" }), NOW);
  assert.equal(d.status, "unknown");
  assert.deepEqual(d.repairs, []);
});

test("a failed subscription read never invents an entitlement finding", () => {
  const d = diagnoseAccount(
    snapshot({ subscription: null, subscriptionError: "PGRST205: table not found" }),
    NOW
  );
  assert.ok(d.findings.some((f) => f.id === "subscription-read-failed"));
  assert.ok(!d.findings.some((f) => f.id === "no-subscription"));
});

test("profile email drifting from the login email is flagged", () => {
  const d = diagnoseAccount(
    snapshot({ profile: profile({ email: "old@example.com" }) }),
    NOW
  );
  assert.ok(d.findings.some((f) => f.id === "email-drift"));
});

test("email comparison is case-insensitive", () => {
  const d = diagnoseAccount(
    snapshot({ profile: profile({ email: "Client@Example.com" }) }),
    NOW
  );
  assert.ok(!d.findings.some((f) => f.id === "email-drift"));
});

test("the credential tools are always offered while the account exists", () => {
  const healthy = diagnoseAccount(snapshot(), NOW);
  for (const id of ["send-reset-link", "set-temp-password"] as const) {
    assert.ok(healthy.repairs.includes(id), `${id} should always be offered`);
  }
});

test("repairs are de-duplicated and finding-driven ones come first", () => {
  const d = diagnoseAccount(
    snapshot({ authUser: authUser({ emailConfirmedAt: null, bannedUntil: "2026-09-01T00:00:00Z" }) }),
    NOW
  );
  assert.equal(new Set(d.repairs).size, d.repairs.length);
  assert.ok(d.repairs.indexOf("clear-lockout") < d.repairs.indexOf("send-reset-link"));
});

test("every offered repair has a spec", () => {
  const cases = [
    snapshot(),
    snapshot({ subscription: null }),
    snapshot({ profile: null, subscription: null }),
    snapshot({ authUser: authUser({ emailConfirmedAt: null, bannedUntil: "2026-09-01T00:00:00Z" }) }),
  ];
  for (const s of cases) {
    for (const id of diagnoseAccount(s, NOW).repairs) {
      assert.ok(REPAIRS[id], `missing spec for ${id}`);
      assert.equal(REPAIRS[id].id, id);
    }
  }
});

test("credential-changing repairs demand a typed reason", () => {
  for (const id of ["set-temp-password", "confirm-email", "grant-subscription"] as const) {
    assert.equal(REPAIRS[id].requiresReason, true, `${id} must require a reason`);
  }
});

test("validateTempPassword enforces the minimum length", () => {
  assert.equal(validateTempPassword("x".repeat(MIN_TEMP_PASSWORD_LENGTH)), null);
  assert.match(validateTempPassword("short")!, /at least/);
  assert.match(validateTempPassword(undefined)!, /at least/);
  assert.match(validateTempPassword(12345678901234)!, /at least/);
});
