const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateTaskStatus,
  updateTrustScore
} = require("../services/trustService");

test("evaluateTaskStatus keeps a new reporter with no history pending", () => {
  assert.equal(
    evaluateTaskStatus({ confirmation_count: 1 }, { trust_score: 0.5 }),
    "pending"
  );
});

test("evaluateTaskStatus auto-accepts a high-trust reporter", () => {
  assert.equal(
    evaluateTaskStatus({ confirmation_count: 1 }, { trust_score: 0.8 }),
    "auto_accepted"
  );
});

test("evaluateTaskStatus confirms after two independent confirmations", () => {
  assert.equal(
    evaluateTaskStatus({ confirmation_count: 2 }, { trust_score: 0.5 }),
    "confirmed"
  );
});

test("updateTrustScore applies Laplace smoothing for a rejected report", async () => {
  const calls = [];
  const queryable = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("SELECT reports_total")) {
        return { rows: [{ reports_total: 0, reports_confirmed: 0 }] };
      }
      return {
        rows: [
          {
            trust_score: 1 / 3,
            reports_total: 1,
            reports_confirmed: 0
          }
        ]
      };
    }
  };

  const updated = await updateTrustScore("user_1", false, queryable);

  assert.equal(updated.trust_score, 1 / 3);
  assert.equal(calls[1].params[1], 1 / 3);
  assert.equal(calls[1].params[2], 1);
  assert.equal(calls[1].params[3], 0);
});
