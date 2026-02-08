import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import styles from "./appStyle";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getToken() {
  return localStorage.getItem("token") || "";
}
function setToken(token) {
  localStorage.setItem("token", token);
}
function clearToken() {
  localStorage.removeItem("token");
}

// If you still use apiFetch elsewhere you can keep it.
// (You currently don't use apiFetch directly in this App.jsx flow.)
async function apiFetch(path, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function normalizeILPhone(v) {
  return String(v || "").trim().replace(/\s+/g, "");
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function getAgeFromDOB(dob) {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return NaN;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const RELIGION_LEVELS = [
  { id: 1, label: "Atheist" },
  { id: 2, label: "Secular" },
  { id: 3, label: "Traditional" },
  { id: 4, label: "Religious" },
  { id: 5, label: "Ultra-Orthodox" },
];

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [profiles, setProfiles] = useState([]);

  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    country: "Israel",
    city: "",
    gender: "",
    religion: "",
    hobbies: "",
    bio: "",
    // new fields we’ll start storing in profile (backend must accept these eventually)
    email: "",
    interested_in: "",
    occupation: "",
    religion_level: "",
    pictures: [], // we'll keep as local URLs for now
  });

  // ===== Auth / entry flow =====
  // entryMode: null | "login" | "register"
  const [entryMode, setEntryMode] = useState(null);

  // login inputs
  const [loginPhone, setLoginPhone] = useState("+972");
  const [loginPin, setLoginPin] = useState("1234");

  // register wizard
  const [regStep, setRegStep] = useState(1); // 1..3
  const [regLoading, setRegLoading] = useState(false);

  // Step 1 - basic data
  const [reg1, setReg1] = useState({
    first_name: "",
    last_name: "",
    phone: "+972",
    email: "",
    birth_date: "", // YYYY-MM-DD
    pin: "",
    confirm_pin: "",
  });

  // Step 2 - profile build
  const [reg2, setReg2] = useState({
    gender: "",
    interested_in: "",
    hobbies: "",
    occupation: "",
    religion: "",
    religion_level: "2",
    bio: "",
    pictures: [], // array of { url, name }
  });

  // Step 3 - in-depth interview setup (MVP: keep it simple)
  const [reg3, setReg3] = useState({
    wantsInterview: true,
    preferredDays: "Any",
    preferredTime: "Evening",
    notes: "",
  });

  const isAuthed = useMemo(() => !!token, [token]);
  const [status, setStatus] = useState("");

  async function refreshMe(t = token) {
    if (!t) return;
    const data = await api.me(t); // ✅ mock or real
    setMe(data.user);
    if (data.profile) {
      setProfile((p) => ({
        ...p,
        ...data.profile,
        birth_date: data.profile.birth_date
          ? String(data.profile.birth_date).slice(0, 10)
          : "",
      }));
    }
    return data;
  }

  async function refreshDiscovery(t = token) {
    if (!t) return;
    const r = await api.discovery(t);
    setProfiles(r.results || []);
    return r;
  }

  useEffect(() => {
    if (token) {
      refreshMe().catch((e) => setStatus(`❌ ${e.message}`));
    } else {
      setMe(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProfiles([]);
      return;
    }

    refreshDiscovery().catch((e) =>
      setStatus(`❌ Discovery failed: ${e.message}`)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onLogin(e) {
    e.preventDefault();
    setStatus("");
    const p = normalizeILPhone(loginPhone);

    if (!p || p.length < 9) return setStatus("❌ Enter a valid phone number");
    if (!loginPin || loginPin.length !== 4) return setStatus("❌ PIN must be 4 digits");

    setRegLoading(true);
    setStatus("Logging in...");
    try {
      const data = await api.login(p, loginPin); // ✅ mock or real
      setToken(data.token);
      setTokenState(data.token);
      setStatus("✅ Logged in");
      await refreshMe(data.token);
    } catch (e2) {
      setStatus(`❌ ${e2.message}`);
    } finally {
      setRegLoading(false);
    }
  }

  async function onSaveProfile(e) {
    e.preventDefault();
    setStatus("Saving profile...");
    try {
      const data = await api.saveProfile(token, {
        ...profile,
        birth_date: profile.birth_date || null,
      });

      setStatus("✅ Profile saved");
      await refreshMe(); // works with mock or real
      return data;
    } catch (e2) {
      setStatus(`❌ ${e2.message}`);
    }
  }

  function onLogout() {
    clearToken();
    setTokenState("");
    setMe(null);
    setStatus("Logged out");
    setEntryMode(null);
    setRegStep(1);
  }

  // ===== Register wizard actions =====
  function validateStep1() {
    const p = normalizeILPhone(reg1.phone);
    if (!reg1.first_name.trim()) return "First name is required";
    if (!reg1.last_name.trim()) return "Last name is required";
    if (!p || p.length < 9) return "Enter a valid phone number";
    if (!reg1.email.trim() || !isEmail(reg1.email)) return "Enter a valid email";
    if (!reg1.birth_date) return "Date of birth is required";
    const age = getAgeFromDOB(reg1.birth_date);
    if (!Number.isFinite(age)) return "Invalid date of birth";
    if (age < 18) return "You must be at least 18 years old";
    if (!reg1.pin || reg1.pin.length !== 4) return "PIN must be exactly 4 digits";
    if (reg1.confirm_pin !== reg1.pin) return "PINs do not match";
    return "";
  }

  function validateStep2() {
    if (!reg2.gender.trim()) return "Gender is required";
    if (!reg2.interested_in.trim()) return "Interested in is required";
    if (!reg2.bio.trim()) return "Bio is required";
    // pictures optional for now
    return "";
  }

  function addPicturesFromFileList(fileList) {
    const files = Array.from(fileList || []);
    const mapped = files.slice(0, 6).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      file: f, // keep ref for later upload endpoints
    }));
    setReg2((r) => ({
      ...r,
      pictures: [...r.pictures, ...mapped].slice(0, 6),
    }));
  }

  function removePicture(idx) {
    setReg2((r) => {
      const copy = [...r.pictures];
      const removed = copy.splice(idx, 1)[0];
      try {
        if (removed?.url) URL.revokeObjectURL(removed.url);
      } catch {}
      return { ...r, pictures: copy };
    });
  }

  async function submitRegistration() {
    setStatus("");
    // Step 1 validation
    const e1 = validateStep1();
    if (e1) {
      setStatus(`❌ ${e1}`);
      setRegStep(1);
      return;
    }
    // Step 2 validation
    const e2 = validateStep2();
    if (e2) {
      setStatus(`❌ ${e2}`);
      setRegStep(2);
      return;
    }

    const phone = normalizeILPhone(reg1.phone);

    setRegLoading(true);
    setStatus("Creating account...");
    try {
      // 1) Create account with current backend contract (phone+pin)
      const data = await api.register(phone, reg1.pin);

      // 2) Save profile using existing endpoint (store step1 + step2)
      const payloadProfile = {
        first_name: reg1.first_name.trim(),
        last_name: reg1.last_name.trim(),
        birth_date: reg1.birth_date,
        email: reg1.email.trim(),
        gender: reg2.gender.trim(),
        interested_in: reg2.interested_in.trim(),
        hobbies: reg2.hobbies.trim(),
        occupation: reg2.occupation.trim(),
        religion: reg2.religion.trim(),
        religion_level: reg2.religion_level, // "1".."5"
        bio: reg2.bio.trim(),
        // for now we store picture URLs (local) just so UI keeps them;
        // later we’ll replace with real uploads to backend/S3.
        pictures: reg2.pictures.map((p) => ({ name: p.name, url: p.url })),
      };

      setToken(data.token);
      setTokenState(data.token);

      await api.saveProfile(data.token, {
        ...payloadProfile,
        birth_date: payloadProfile.birth_date || null,
      });

      setStatus("✅ Registered + profile saved");

      // 3) Step 3 (MVP) – just show next action; later we’ll POST to /interview
      if (reg3.wantsInterview) {
        setStatus(
          "✅ Registered + profile saved. Next: We’ll schedule your in-depth interview (Step 3)."
        );
      } else {
        setStatus("✅ Registered + profile saved. You can set interview later.");
      }

      await refreshMe(data.token);
      setEntryMode(null);
      setRegStep(1);
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    } finally {
      setRegLoading(false);
    }
  }

  // ===== UI =====
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ marginTop: 0 }}>Superdate Frontend (MVP)</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          API: <code>{API}</code>
        </p>

        <div style={styles.status}>{status}</div>

        {!isAuthed ? (
          <>
            {/* Entry screen */}
            {!entryMode ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <button
                    style={styles.btn}
                    onClick={() => {
                      setEntryMode("login");
                      setStatus("");
                    }}
                  >
                    Login
                  </button>
                  <button
                    style={styles.btnSecondary}
                    onClick={() => {
                      setEntryMode("register");
                      setRegStep(1);
                      setStatus("");
                    }}
                  >
                    Register
                  </button>
                </div>

                <div style={{ marginTop: 14, opacity: 0.8, fontSize: 13 }}>
                  Tip: You’ll create your profile in 2 steps and then optionally schedule an in-depth interview.
                </div>
              </div>
            ) : null}

            {/* Login screen */}
            {entryMode === "login" ? (
              <form onSubmit={onLogin} style={{ ...styles.box, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <h2 style={styles.h2}>Login</h2>
                  <button
                    type="button"
                    style={styles.btnSecondary}
                    onClick={() => {
                      setEntryMode(null);
                      setStatus("");
                    }}
                  >
                    Back
                  </button>
                </div>

                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="+972501234567"
                />

                <label style={styles.label}>4-digit PIN</label>
                <input
                  style={styles.input}
                  value={loginPin}
                  onChange={(e) =>
                    setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                  type="password"
                />

                <button style={styles.btn} type="submit" disabled={regLoading}>
                  {regLoading ? "Logging in..." : "Login"}
                </button>
              </form>
            ) : null}

            {/* Register wizard */}
            {entryMode === "register" ? (
              <div style={{ ...styles.box, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <h2 style={styles.h2} style={{ ...styles.h2, marginBottom: 4 }}>
                      Register
                    </h2>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      Step {regStep} / 3
                    </div>
                  </div>

                  <button
                    type="button"
                    style={styles.btnSecondary}
                    onClick={() => {
                      setEntryMode(null);
                      setRegStep(1);
                      setStatus("");
                    }}
                  >
                    Cancel
                  </button>
                </div>

                {/* Step tabs */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={regStep === 1 ? styles.chipActive : styles.chip}
                    onClick={() => setRegStep(1)}
                  >
                    1. Basics
                  </button>
                  <button
                    type="button"
                    style={regStep === 2 ? styles.chipActive : styles.chip}
                    onClick={() => setRegStep(2)}
                  >
                    2. Profile
                  </button>
                  <button
                    type="button"
                    style={regStep === 3 ? styles.chipActive : styles.chip}
                    onClick={() => setRegStep(3)}
                  >
                    3. Interview
                  </button>
                </div>

                {/* Step 1 */}
                {regStep === 1 ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={styles.grid2Inner}>
                      <div>
                        <label style={styles.label}>First name</label>
                        <input
                          style={styles.input}
                          value={reg1.first_name}
                          onChange={(e) => setReg1((r) => ({ ...r, first_name: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Last name</label>
                        <input
                          style={styles.input}
                          value={reg1.last_name}
                          onChange={(e) => setReg1((r) => ({ ...r, last_name: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Phone</label>
                        <input
                          style={styles.input}
                          value={reg1.phone}
                          onChange={(e) => setReg1((r) => ({ ...r, phone: e.target.value }))}
                          placeholder="+972501234567"
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Email</label>
                        <input
                          style={styles.input}
                          value={reg1.email}
                          onChange={(e) => setReg1((r) => ({ ...r, email: e.target.value }))}
                          placeholder="name@example.com"
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Date of birth</label>
                        <input
                          style={styles.input}
                          type="date"
                          value={reg1.birth_date}
                          onChange={(e) => setReg1((r) => ({ ...r, birth_date: e.target.value }))}
                        />
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                          (Displayed as DD-MM-YYYY on Israeli systems; sent as YYYY-MM-DD)
                        </div>
                      </div>

                      <div>
                        <label style={styles.label}>4-digit PIN</label>
                        <input
                          style={styles.input}
                          value={reg1.pin}
                          onChange={(e) =>
                            setReg1((r) => ({
                              ...r,
                              pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                            }))
                          }
                          maxLength={4}
                          inputMode="numeric"
                          type="password"
                          placeholder="1234"
                        />

                        <label style={styles.label}>Confirm PIN</label>
                        <input
                          style={styles.input}
                          value={reg1.confirm_pin}
                          onChange={(e) =>
                            setReg1((r) => ({
                              ...r,
                              confirm_pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                            }))
                          }
                          maxLength={4}
                          inputMode="numeric"
                          type="password"
                          placeholder="1234"
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button
                        type="button"
                        style={styles.btn}
                        onClick={() => {
                          const err = validateStep1();
                          if (err) return setStatus(`❌ ${err}`);
                          setStatus("");
                          setRegStep(2);
                        }}
                      >
                        Continue to Step 2
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Step 2 */}
                {regStep === 2 ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={styles.grid2Inner}>
                      <div>
                        <label style={styles.label}>Gender</label>
                        <input
                          style={styles.input}
                          value={reg2.gender}
                          onChange={(e) => setReg2((r) => ({ ...r, gender: e.target.value }))}
                          placeholder="male / female / non-binary / ..."
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Interested in</label>
                        <input
                          style={styles.input}
                          value={reg2.interested_in}
                          onChange={(e) =>
                            setReg2((r) => ({ ...r, interested_in: e.target.value }))
                          }
                          placeholder="women / men / everyone / ..."
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Hobbies</label>
                        <input
                          style={styles.input}
                          value={reg2.hobbies}
                          onChange={(e) => setReg2((r) => ({ ...r, hobbies: e.target.value }))}
                          placeholder="music, gym, cooking..."
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Occupation</label>
                        <input
                          style={styles.input}
                          value={reg2.occupation}
                          onChange={(e) => setReg2((r) => ({ ...r, occupation: e.target.value }))}
                          placeholder="Data Analyst, Teacher..."
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Religion</label>
                        <input
                          style={styles.input}
                          value={reg2.religion}
                          onChange={(e) => setReg2((r) => ({ ...r, religion: e.target.value }))}
                          placeholder="Jewish, Muslim, Christian..."
                        />
                      </div>

                      <div>
                        <label style={styles.label}>Religion level</label>
                        <select
                          style={styles.input}
                          value={reg2.religion_level}
                          onChange={(e) =>
                            setReg2((r) => ({ ...r, religion_level: e.target.value }))
                          }
                        >
                          {RELIGION_LEVELS.map((x) => (
                            <option key={x.id} value={String(x.id)}>
                              {x.id} - {x.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label style={styles.label}>Bio</label>
                    <textarea
                      style={styles.textarea}
                      value={reg2.bio}
                      onChange={(e) => setReg2((r) => ({ ...r, bio: e.target.value }))}
                      rows={4}
                      placeholder="A few lines about you..."
                    />

                    <label style={styles.label}>Pictures (up to 6)</label>
                    <input
                      style={styles.input}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addPicturesFromFileList(e.target.files)}
                    />

                    {reg2.pictures.length ? (
                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        {reg2.pictures.map((p, idx) => (
                          <div
                            key={p.url}
                            style={{
                              width: 110,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.12)",
                              overflow: "hidden",
                              background: "#0b1220",
                            }}
                          >
                            <div style={{ height: 110, overflow: "hidden" }}>
                              <img
                                src={p.url}
                                alt={p.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                            <button
                              type="button"
                              style={{ ...styles.btnSecondary, width: "100%", borderRadius: 0 }}
                              onClick={() => removePicture(idx)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        Pictures are optional for MVP (we’ll add real upload to backend next).
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button type="button" style={styles.btnSecondary} onClick={() => setRegStep(1)}>
                        Back
                      </button>
                      <button
                        type="button"
                        style={styles.btn}
                        onClick={() => {
                          const err = validateStep2();
                          if (err) return setStatus(`❌ ${err}`);
                          setStatus("");
                          setRegStep(3);
                        }}
                      >
                        Continue to Step 3
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Step 3 */}
                {regStep === 3 ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 10 }}>
                      Step 3 is where SUPERDATE becomes unique: an in-depth interview setup.
                      For MVP, we’ll collect preferences and store them (backend endpoint comes next).
                    </div>

                    <label style={styles.label}>
                      Do you want to schedule an in-depth interview now?
                    </label>
                    <select
                      style={styles.input}
                      value={reg3.wantsInterview ? "yes" : "no"}
                      onChange={(e) =>
                        setReg3((r) => ({ ...r, wantsInterview: e.target.value === "yes" }))
                      }
                    >
                      <option value="yes">Yes (recommended)</option>
                      <option value="no">Not now</option>
                    </select>

                    {reg3.wantsInterview ? (
                      <div style={styles.grid2Inner}>
                        <div>
                          <label style={styles.label}>Preferred days</label>
                          <input
                            style={styles.input}
                            value={reg3.preferredDays}
                            onChange={(e) =>
                              setReg3((r) => ({ ...r, preferredDays: e.target.value }))
                            }
                            placeholder="Sun-Thu / Weekends / Any"
                          />
                        </div>
                        <div>
                          <label style={styles.label}>Preferred time</label>
                          <input
                            style={styles.input}
                            value={reg3.preferredTime}
                            onChange={(e) =>
                              setReg3((r) => ({ ...r, preferredTime: e.target.value }))
                            }
                            placeholder="Morning / Evening / Any"
                          />
                        </div>
                      </div>
                    ) : null}

                    <label style={styles.label}>Notes</label>
                    <textarea
                      style={styles.textarea}
                      value={reg3.notes}
                      onChange={(e) => setReg3((r) => ({ ...r, notes: e.target.value }))}
                      rows={3}
                      placeholder="Anything we should know before the interview?"
                    />

                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button type="button" style={styles.btnSecondary} onClick={() => setRegStep(2)}>
                        Back
                      </button>

                      <button
                        type="button"
                        style={styles.btn}
                        disabled={regLoading}
                        onClick={submitRegistration}
                      >
                        {regLoading ? "Creating account..." : "Finish Registration"}
                      </button>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                      After this works, we’ll add a real backend endpoint to save interview preferences.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div style={styles.row}>
              <div>
                <div style={{ fontWeight: 700 }}>Logged in ✅</div>
                <div style={{ opacity: 0.85 }}>
                  User: <code>{me?.phone}</code>
                </div>
              </div>
              <button style={styles.btnSecondary} onClick={onLogout}>
                Logout
              </button>
            </div>

            <div style={styles.grid2}>
              <div style={styles.box}>
                <h2 style={styles.h2}>/me</h2>
                <pre style={styles.pre}>{JSON.stringify(me, null, 2)}</pre>
              </div>

              <div style={styles.box}>
                <h2 style={styles.h2}>/discovery</h2>

                <button
                  style={styles.btnSecondary}
                  onClick={() =>
                    refreshDiscovery().catch((e) => setStatus(`❌ ${e.message}`))
                  }
                >
                  Refresh Discovery
                </button>

                <div style={{ marginTop: 12 }}>
                  {profiles.length === 0 ? (
                    <div style={{ opacity: 0.8 }}>No profiles yet</div>
                  ) : (
                    profiles.map((p) => (
                      <div
                        key={p.user_id}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.08)",
                          marginBottom: 10,
                          background: "#0b1220",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {p.first_name} {p.last_name}{" "}
                          {p.age ? <span style={{ opacity: 0.8 }}>({p.age})</span> : null}
                        </div>
                        <div style={{ opacity: 0.85 }}>
                          {p.city ? `${p.city} • ` : ""}
                          {p.gender || ""} {p.religion ? `• ${p.religion}` : ""}
                        </div>
                        {p.bio ? (
                          <div style={{ marginTop: 6, opacity: 0.9 }}>{p.bio}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <form onSubmit={onSaveProfile} style={styles.box}>
                <h2 style={styles.h2}>Edit Profile</h2>

                <div style={styles.grid2Inner}>
                  <div>
                    <label style={styles.label}>First name</label>
                    <input
                      style={styles.input}
                      value={profile.first_name || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, first_name: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Last name</label>
                    <input
                      style={styles.input}
                      value={profile.last_name || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, last_name: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Birth date</label>
                    <input
                      style={styles.input}
                      type="date"
                      value={profile.birth_date || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, birth_date: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label style={styles.label}>City</label>
                    <input
                      style={styles.input}
                      value={profile.city || ""}
                      onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Country</label>
                    <input
                      style={styles.input}
                      value={profile.country || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, country: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Gender</label>
                    <input
                      style={styles.input}
                      value={profile.gender || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, gender: e.target.value }))
                      }
                      placeholder="male / female / ..."
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Religion</label>
                    <input
                      style={styles.input}
                      value={profile.religion || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, religion: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Hobbies</label>
                    <input
                      style={styles.input}
                      value={profile.hobbies || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, hobbies: e.target.value }))
                      }
                      placeholder="music, gym, startups"
                    />
                  </div>
                </div>

                <label style={styles.label}>Bio</label>
                <textarea
                  style={styles.textarea}
                  value={profile.bio || ""}
                  onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                  rows={4}
                />

                <button style={styles.btn} type="submit">
                  Save Profile
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
