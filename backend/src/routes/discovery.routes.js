// backend/src/routes/discovery.routes.js
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");

// GET /discovery (JWT protected in index.js)
router.get("/", async (req, res) => {
  const me = req.user.userId;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        p.id AS profile_id,
        p.user_id,
        p.first_name,
        p.last_name,
        p.birth_date,
        p.gender,
        p.city,
        p.country,
        p.religion,
        p.hobbies,
        p.bio,
        p.created_at,
        p.updated_at
      FROM profiles p
      WHERE p.user_id <> $1::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM swipes s
          WHERE s.swiper_user_id = $1::uuid
            AND s.target_user_id = p.user_id
        )
      ORDER BY p.created_at DESC
      LIMIT 50;
      `,
      [me]
    );

    return res.json({ ok: true, count: rows.length, profiles: rows });
  } catch (err) {
    console.error("GET /discovery error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
