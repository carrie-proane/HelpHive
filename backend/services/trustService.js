const HIGH_TRUST_THRESHOLD = 0.8;

function evaluateTaskStatus(task = {}, reporter = {}) {
  if (Number(reporter.trust_score ?? reporter.trustScore ?? 0) >= HIGH_TRUST_THRESHOLD) {
    return "auto_accepted";
  }

  if (Number(task.confirmation_count ?? task.confirmationCount ?? 0) >= 2) {
    return "confirmed";
  }

  return "pending";
}

async function updateTrustScore(userId, wasValid, queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new Error("A database client is required to update trust scores.");
  }

  const current = await queryable.query(
    `
      SELECT reports_total, reports_confirmed
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [userId]
  );

  if (!current.rows.length) {
    return null;
  }

  const reportsTotal = Number(current.rows[0].reports_total || 0);
  const reportsConfirmed = Number(current.rows[0].reports_confirmed || 0);
  const newTotal = reportsTotal + 1;
  const newConfirmed = reportsConfirmed + (wasValid ? 1 : 0);
  const trustScore = (newConfirmed + 1) / (newTotal + 2);

  const updated = await queryable.query(
    `
      UPDATE users
      SET trust_score = $2,
          reports_total = $3,
          reports_confirmed = $4
      WHERE id = $1
      RETURNING trust_score, reports_total, reports_confirmed
    `,
    [userId, trustScore, newTotal, newConfirmed]
  );

  return updated.rows[0] || null;
}

module.exports = {
  HIGH_TRUST_THRESHOLD,
  evaluateTaskStatus,
  updateTrustScore
};
