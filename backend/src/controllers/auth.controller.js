const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  try {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
      return res.status(400).json({
        message: "Phone and PIN required",
      });
    }

    const pool = req.app.locals.pool;

    const existing = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    await pool.query(
      `
      INSERT INTO users (phone, password_hash, created_at)
      VALUES ($1, $2, NOW())
      `,
      [phone, pinHash]
    );

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
      return res.status(400).json({
        message: "Phone and PIN required",
      });
    }

    const pool = req.app.locals.pool;
    const JWT_SECRET = req.app.locals.JWT_SECRET;

    const userRes = await pool.query(
      "SELECT id, password_hash FROM users WHERE phone = $1",
      [phone]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const user = userRes.rows[0];

    const match = await bcrypt.compare(pin, user.password_hash);
    if (!match) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
