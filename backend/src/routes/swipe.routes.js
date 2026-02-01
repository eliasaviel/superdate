// backend/src/routes/swipe.routes.js
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");

// POST /swipe  (JWT protected in index.js)
// body: { target_user_id, action }
router.post("/", async (req, res) => {
  const swiper_user_id = req.user.userId;
  const { target_user_id, action } = req.body;

  if (!target_user_id || !action) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  if (!["like", "pass"].includes(action)) {
    return res.status(400).json({ ok: false, error: "invalid_action" });
  }

  if (swiper_user_id === target_user_id) {
    return res.status(400).json({ ok: false, error: "cannot_swipe_self" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert swipe
    const swipeRes = await client.query(
      `
      INSERT INTO swipes (swiper_user_id, target_user_id, action)
      VALUES ($1::uuid, $2::uuid, $3)
      ON CONFLICT (swiper_user_id, target_user_id)
      DO UPDATE SET action = EXCLUDED.action, created_at = now()
      RETURNING *;
      `,
      [swiper_user_id, target_user_id, action]
    );

    let is_mutual = false;
    let match = null;

    if (action === "like") {
      // Mutual like?
      const mutual = await client.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM swipes s1
          JOIN swipes s2
            ON s2.swiper_user_id = $2::uuid
           AND s2.target_user_id = $1::uuid
          WHERE s1.swiper_user_id = $1::uuid
            AND s1.target_user_id = $2::uuid
            AND s1.action = 'like'
            AND s2.action = 'like'
        ) AS is_mutual;
        `,
        [swiper_user_id, target_user_id]
      );

      is_mutual = mutual.rows[0].is_mutual === true;

      if (is_mutual) {
        const matchRes = await client.query(
          `
          INSERT INTO matches (user_low_id, user_high_id)
          VALUES (
            LEAST($1::uuid, $2::uuid),
            GREATEST($1::uuid, $2::uuid)
          )
          ON CONFLICT (user_low_id, user_high_id) DO NOTHING
          RETURNING *;
          `,
          [swiper_user_id, target_user_id]
        );

        match = matchRes.rows[0] || null;
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, swipe: swipeRes.rows[0], is_mutual, match });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /swipe error:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});

module.exports = router;
