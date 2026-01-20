require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";

// -------------------- helpers --------------------
function normalizePhone(phone) {
  return String(phone || "").trim();
}

function isValidPin(pin) {
  return /^[0-9]{4}$/.test(pin);
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

// -------------------- routes --------------------

// Health check
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -------- AUTH --------

// Register (phone + 4-digit PIN)
app.post("/auth/register", async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || "").trim();

  if (!phone)
    return res.status(400).json({ ok: false, error: "phone is required" });
  if (!isValidPin(pin))
    return res.status(400).json({ ok: false, error: "pin must be 4 digits" });

  const existing = await pool.query(
    "SELECT id, phone, email, pin_hash FROM users WHERE phone = $1",
    [phone]
  );

  const pinHash = await bcrypt.hash(pin, 10);

  if (existing.rowCount > 0) {
    if (existing.rows[0].pin_hash) {
      return res
        .status(409)
        .json({ ok: false, error: "User already registered. Use /auth/login" });
    }

    const updated = await pool.query(
      "UPDATE users SET pin_hash = $1 WHERE phone = $2 RETURNING id, phone, email",
      [pinHash, phone]
    );
    const user = updated.rows[0];
    return res.json({ ok: true, token: signToken(user), user });
  }

  const created = await pool.query(
    "INSERT INTO users (phone, pin_hash) VALUES ($1, $2) RETURNING id, phone, email",
    [phone, pinHash]
  );
  const user = created.rows[0];
  return res.json({ ok: true, token: signToken(user), user });
});

// Login
app.post("/auth/login", async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || "").trim();

  if (!phone)
    return res.status(400).json({ ok: false, error: "phone is required" });
  if (!isValidPin(pin))
    return res.status(400).json({ ok: false, error: "pin must be 4 digits" });

  const r = await pool.query(
    "SELECT id, phone, email, pin_hash FROM users WHERE phone = $1",
    [phone]
  );

  if (r.rowCount === 0)
    return res.status(401).json({ ok: false, error: "Invalid phone or PIN" });

  const userRow = r.rows[0];
  const ok = await bcrypt.compare(pin, userRow.pin_hash || "");
  if (!ok)
    return res.status(401).json({ ok: false, error: "Invalid phone or PIN" });

  const user = { id: userRow.id, phone: userRow.phone, email: userRow.email };
  return res.json({ ok: true, token: signToken(user), user });
});

// -------- ME --------

app.get("/me", requireAuth, async (req, res) => {
  const userId = req.user.userId;

  const u = await pool.query(
    "SELECT id, phone, email, created_at FROM users WHERE id = $1",
    [userId]
  );
  if (u.rowCount === 0)
    return res.status(404).json({ ok: false, error: "User not found" });

  const p = await pool.query(
    "SELECT * FROM profiles WHERE user_id = $1",
    [userId]
  );

  res.json({
    ok: true,
    user: u.rows[0],
    profile: p.rowCount ? p.rows[0] : null,
  });
});

// Create or update profile
app.put("/me/profile", requireAuth, async (req, res) => {
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
  } = req.body;

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
});

// -------- SEARCH --------

app.get("/search", requireAuth, async (req, res) => {
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
});

// --------------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Superdate API running on port ${PORT}`)
);
