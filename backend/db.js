// backend/db.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("connect", () => {
  console.log("✅ PG connected");
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

module.exports = { pool };
