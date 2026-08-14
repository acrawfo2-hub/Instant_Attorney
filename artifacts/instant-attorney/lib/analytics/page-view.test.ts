import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePageView } from "./page-view.ts";

const visitorId = "20b48476-2c82-4daa-8145-b68f03ca53a8";
const sessionId = "a9ab73f6-8323-4bba-99c4-ccae0d41499c";

test("page view sanitizer removes sensitive URL material and reduces referrer to host", () => {
  assert.deepEqual(
    sanitizePageView({
      path: "/login?email=client@example.com#reset",
      visitorId,
      sessionId,
      referrer: "https://www.google.com/search?q=private+issue",
      utmSource: " google ",
    }),
    {
      pagePath: "/login",
      visitorId,
      sessionId,
      referrerHost: "www.google.com",
      utmSource: "google",
      utmMedium: null,
      utmCampaign: null,
    },
  );
});

test("page view sanitizer rejects invalid identifiers and external-looking paths", () => {
  assert.equal(sanitizePageView({ path: "/", visitorId: "bad", sessionId }), null);
  assert.equal(sanitizePageView({ path: "//tracker.example", visitorId, sessionId }), null);
});
