import React, { useEffect, useMemo, useState } from "react";

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

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [phone, setPhone] = useState("+972");
  const [pin, setPin] = useState("1234");

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
  });

  const isAuthed = useMemo(() => !!token, [token]);
  const [status, setStatus] = useState("");

  async function refreshMe(t = token) {
    if (!t) return;
    const data = await apiFetch("/me", { token: t });
    setMe(data.user);
    if (data.profile) {
      setProfile((p) => ({
        ...p,
        ...data.profile,
        // birth_date can come as full ISO -> keep just YYYY-MM-DD for <input type="date">
        birth_date: data.profile.birth_date
          ? String(data.profile.birth_date).slice(0, 10)
          : "",
      }));
    }
    return data;
  }

  useEffect(() => {
    if (token) {
      refreshMe().catch((e) => setStatus(`❌ ${e.message}`));
    } else {
      setMe(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onRegister(e) {
    e.preventDefault();
    setStatus("Registering...");
    try {
      const data = await apiFetch("/auth/register", {
        method: "POST",
        body: { phone, pin },
      });
      setToken(data.token);
      setTokenState(data.token);
      setStatus("✅ Registered + logged in");
      await refreshMe(data.token);
    } catch (e2) {
      setStatus(`❌ ${e2.message}`);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setStatus("Logging in...");
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: { phone, pin },
      });
      setToken(data.token);
      setTokenState(data.token);
      setStatus("✅ Logged in");
      await refreshMe(data.token);
    } catch (e2) {
      setStatus(`❌ ${e2.message}`);
    }
  }

  async function onSaveProfile(e) {
    e.preventDefault();
    setStatus("Saving profile...");
    try {
      const data = await apiFetch("/me/profile", {
        token,
        method: "PUT",
        body: {
          ...profile,
          birth_date: profile.birth_date || null,
        },
      });
      setStatus("✅ Profile saved");
      // refresh /me to see everything
      await refreshMe();
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
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ marginTop: 0 }}>Superdate Frontend (MVP)</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          API: <code>{API}</code>
        </p>

        <div style={styles.status}>{status}</div>

        {!isAuthed ? (
          <div style={styles.grid2}>
            <form onSubmit={onRegister} style={styles.box}>
              <h2 style={styles.h2}>Register</h2>

              <label style={styles.label}>Phone</label>
              <input
                style={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+972501234567"
              />

              <label style={styles.label}>4-digit PIN</label>
              <input
                style={styles.input}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                maxLength={4}
              />

              <button style={styles.btn} type="submit">
                Register
              </button>
            </form>

            <form onSubmit={onLogin} style={styles.box}>
              <h2 style={styles.h2}>Login</h2>

              <label style={styles.label}>Phone</label>
              <input
                style={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+972501234567"
              />

              <label style={styles.label}>4-digit PIN</label>
              <input
                style={styles.input}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                maxLength={4}
              />

              <button style={styles.btn} type="submit">
                Login
              </button>
            </form>
          </div>
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
                <pre style={styles.pre}>
                  {JSON.stringify(me, null, 2)}
                </pre>
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
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, city: e.target.value }))
                      }
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
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, bio: e.target.value }))
                  }
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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    display: "flex",
    justifyContent: "center",
    padding: 24,
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "min(1000px, 100%)",
    background: "#111a2e",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: 16,
  },
  grid2Inner: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  box: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 16,
    background: "#0f1730",
  },
  h2: { margin: "0 0 12px 0", fontSize: 18 },
  label: { display: "block", fontSize: 12, opacity: 0.85, marginTop: 10 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b1220",
    color: "white",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#0b1220",
    color: "white",
    outline: "none",
    resize: "vertical",
  },
  btn: {
    marginTop: 14,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "white",
    color: "black",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "white",
    cursor: "pointer",
  },
  pre: {
    margin: 0,
    background: "#0b1220",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "auto",
    maxHeight: 260,
  },
  row: {
    marginTop: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  status: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    minHeight: 18,
  },
};
