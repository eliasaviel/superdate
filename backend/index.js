// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

// Routes
const authRoutes = require("./src/routes/auth.routes");

const app = express();

// =====================
// MIDDLEWARE (ORDER MATTERS)
// =====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- DB --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// -------------------- JWT --------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";

// Make these available to routes/controllers
app.locals.pool = pool;
app.locals.JWT_SECRET = JWT_SECRET;

// -------------------- Auth middleware --------------------
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

// -------------------- Routes --------------------

// Health check
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Auth routes
app.use("/auth", authRoutes);

// -------- ME --------
app.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const u = await pool.query(
      "SELECT id, phone, email, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (u.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const p = await pool.query(
      "SELECT * FROM profiles WHERE user_id = $1",
      [userId]
    );

    res.json({
      ok: true,
      user: u.rows[0],
      profile: p.rowCount ? p.rows[0] : null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Create or update profile
app.put("/me/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      first_name,
      last_name,
      birth_date,
      country,
      city,
      gender,
      religion,
      hobbies,
      bio,
    } = req.body || {};

    const existing = await pool.query(
      "SELECT id FROM profiles WHERE user_id = $1",
      [userId]
    );

    let profile;

    if (existing.rowCount === 0) {
      const created = await pool.query(
        `
        INSERT INTO profiles
        (user_id, first_name, last_name, birth_date, country, city, gender, religion, hobbies, bio, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
        RETURNING *
        `,
        [
          userId,
          first_name || null,
          last_name || null,
          birth_date || null,
          country || null,
          city || null,
          gender || null,
          religion || null,
          hobbies || null,
          bio || null,
        ]
      );
      profile = created.rows[0];
    } else {
      const updated = await pool.query(
        `
        UPDATE profiles SET
          first_name = $2,
          last_name = $3,
          birth_date = $4,
          country = $5,
          city = $6,
          gender = $7,
          religion = $8,
          hobbies = $9,
          bio = $10,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
        `,
        [
          userId,
          first_name || null,
          last_name || null,
          birth_date || null,
          country || null,
          city || null,
          gender || null,
          religion || null,
          hobbies || null,
          bio || null,
        ]
      );
      profile = updated.rows[0];
    }

    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -------- SEARCH --------
app.get("/search", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const gender = req.query.gender || null;
    const religion = req.query.religion || null;
    const city = req.query.city || null;
    const minAge = req.query.minAge ? parseInt(req.query.minAge, 10) : null;
    const maxAge = req.query.maxAge ? parseInt(req.query.maxAge, 10) : null;

    const where = [];
    const params = [];

    // exclude myself
    params.push(userId);
    where.push(`p.user_id <> $${params.length}`);

    if (gender) {
      params.push(gender);
      where.push(`p.gender = $${params.length}`);
    }
    if (religion) {
      params.push(religion);
      where.push(`p.religion = $${params.length}`);
    }
    if (city) {
      params.push(city);
      where.push(`p.city = $${params.length}`);
    }
    if (minAge !== null) {
      params.push(minAge);
      where.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) >= $${params.length}`);
    }
    if (maxAge !== null) {
      params.push(maxAge);
      where.push(`EXTRACT(YEAR FROM AGE(p.birth_date)) <= $${params.length}`);
    }

    const sql = `
      SELECT
        p.user_id,
        p.first_name,
        p.last_name,
        p.birth_date,
        EXTRACT(YEAR FROM AGE(p.birth_date))::int AS age,
        p.country,
        p.city,
        p.gender,
        p.religion,
        p.hobbies,
        p.bio
      FROM profiles p
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rowCount, results: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -------------------- Start --------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Superdate API running on port ${PORT}`)
);
