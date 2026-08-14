import assert from "node:assert/strict";
import test from "node:test";
import { categoryPriority, validateSupportTicket } from "./tickets.ts";

test("validates and normalizes a login ticket without retaining query parameters", () => {
  const result = validateSupportTicket({
    email: " Client@Example.com ",
    category: "login",
    subject: "Cannot sign in",
    description: "The sign-in page says my account is unavailable.",
    pagePath: "/login?email=secret",
  });
  assert.equal(result.ok, true);
  if (result.ok)
    assert.deepEqual(result.ticket, {
      email: "client@example.com",
      category: "login",
      subject: "Cannot sign in",
      description: "The sign-in page says my account is unavailable.",
      pagePath: "/login",
    });
  assert.equal(categoryPriority("login"), "urgent");
});

test("rejects secrets and bot submissions", () => {
  assert.equal(
    validateSupportTicket({
      email: "a@b.com",
      category: "password",
      subject: "Password issue",
      description: "My password is hunter12345 and it will not work.",
    }).ok,
    false,
  );
  assert.equal(
    validateSupportTicket({
      email: "a@b.com",
      category: "other",
      subject: "Something broke",
      description: "This is a sufficiently detailed request for help.",
      website: "spam",
    }).ok,
    false,
  );
});
