const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeToken(userId) {
  return `mock.${userId}.${Date.now()}`;
}

function getUserIdFromToken(token) {
  if (!token || !token.startsWith("mock.")) return null;
  const parts = token.split(".");
  return parts[1] || null;
}

// In-memory "DB"
const db = {
  usersByPhone: new Map(), // phone -> { id, phone, pin, email, created_at }
  profilesByUserId: new Map(), // userId -> profile
};

function ensureUser(phone, pin) {
  let u = db.usersByPhone.get(phone);
  if (!u) {
    u = {
      id: `u_${Math.random().toString(16).slice(2, 10)}`,
      phone,
      pin,
      email: null,
      created_at: new Date().toISOString(),
    };
    db.usersByPhone.set(phone, u);
  }
  return u;
}

export const api = {
  // AUTH
  register: async (phone, pin) => {
    await sleep(200);
    const u = ensureUser(phone, pin);
    // (optional) validate pin
    if (!pin || String(pin).length !== 4) {
      throw new Error("PIN must be 4 digits");
    }
    return { ok: true, token: makeToken(u.id) };
  },

  login: async (phone, pin) => {
    await sleep(200);
    const u = db.usersByPhone.get(phone);
    if (!u || String(u.pin) !== String(pin)) {
      throw new Error("Invalid phone or PIN");
    }
    return { ok: true, token: makeToken(u.id) };
  },

  // ME
  me: async (token) => {
    await sleep(150);
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error("Missing/invalid token");

    // find user by id (reverse search)
    let found = null;
    for (const u of db.usersByPhone.values()) {
      if (u.id === userId) {
        found = u;
        break;
      }
    }
    if (!found) throw new Error("User not found");

    const profile = db.profilesByUserId.get(userId) || null;

    return { ok: true, user: found, profile };
  },

  saveProfile: async (token, payload) => {
    await sleep(200);
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error("Missing/invalid token");

    const current = db.profilesByUserId.get(userId) || { user_id: userId };
    const next = {
      ...current,
      ...payload,
      user_id: userId,
      updated_at: new Date().toISOString(),
      created_at: current.created_at || new Date().toISOString(),
    };
    db.profilesByUserId.set(userId, next);
    return { ok: true, profile: next };
  },

  // DISCOVERY
  discovery: async (token) => {
    await sleep(250);
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error("Missing/invalid token");

    const results = [];
    for (const [uid, p] of db.profilesByUserId.entries()) {
      if (uid === userId) continue;
      results.push({
        user_id: uid,
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        birth_date: p.birth_date || null,
        age: null,
        country: p.country || "",
        city: p.city || "",
        gender: p.gender || "",
        religion: p.religion || "",
        hobbies: p.hobbies || "",
        bio: p.bio || "",
      });
    }
    return { ok: true, count: results.length, results };
  },

  swipe: async (token, payload) => {
    await sleep(150);
    const userId = getUserIdFromToken(token);
    if (!userId) throw new Error("Missing/invalid token");
    return { ok: true, saved: payload };
  },
};
