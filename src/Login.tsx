import React, { useState } from "react";

type Props = {
  onLoggedIn: (user: { id: number; username: string; role: string; posisi?: string | null }) => void;
};

export default function Login({ onLoggedIn }: Props) {
  const API_BASE = (import.meta.env.VITE_API_URL as string) || (location.port === '3200' ? `${location.protocol}//${location.hostname}:3300` : `${location.protocol}//${location.hostname}:5174`);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpiredPopup, setShowExpiredPopup] = useState(false);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const submit = () => {
    setError(null);
    if (!username || !password) { setError("Isi username dan password"); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    })
      .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => Promise.reject(j.error || "login_gagal")))
      .then(user => onLoggedIn(user))
      .catch((err) => {
        if (err === 'user_expired') {
          setShowExpiredPopup(true);
        } else if (err === 'user_active_elsewhere') {
          setError("User sedang digunakan pada perangkat lain.");
        } else {
          setError(typeof err === 'string' ? err : "Username atau password salah");
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f3f4f6 0%,#ffffff 100%)" }}>
      {showExpiredPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: '#fff', maxWidth: 480, width: '100%', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Username Kadaluarsa</h3>
              <button onClick={() => setShowExpiredPopup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '16px', overflowY: 'auto', fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
              <div style={{ marginBottom: 12 }}>
                Silahkan lakukan perpanjangan dengan memilih paket berikut:
              </div>
              
              <div style={{ fontWeight: 700, marginBottom: 2 }}>1. Full Kriteria</div>
              <div style={{ color: '#4b5563', marginBottom: 2, paddingLeft: 12, fontSize: 11 }}>(Engine, Powertrain, Chassis/Tool, Electrical, Cabin/Rear Body)</div>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: 24 }}>
                <li style={{ marginBottom: 2 }}>Biaya 1 bulan &nbsp;&nbsp;&nbsp; = Rp. 1.000.000</li>
                <li style={{ marginBottom: 2 }}>Biaya 6 bulan &nbsp;&nbsp;&nbsp; = Rp. 5.000.000</li>
                <li style={{ marginBottom: 2 }}>Biaya 12 bulan &nbsp; = Rp. 10.000.000</li>
              </ul>

              <div style={{ fontWeight: 700, marginBottom: 2 }}>2. Pilih 1 Kriteria</div>
              <div style={{ color: '#4b5563', marginBottom: 2, paddingLeft: 12, fontSize: 11 }}>(Engine, Powertrain, Chassis/Tool, Electrical, Cabin/Rear Body)</div>
              <ul style={{ margin: '0 0 16px 0', paddingLeft: 24 }}>
                <li style={{ marginBottom: 2 }}>Biaya 1 bulan &nbsp;&nbsp;&nbsp; = Rp. 500.000</li>
                <li style={{ marginBottom: 2 }}>Biaya 6 bulan &nbsp;&nbsp;&nbsp; = Rp. 2.500.000</li>
                <li style={{ marginBottom: 2 }}>Biaya 12 bulan &nbsp; = Rp. 5.000.000</li>
              </ul>

              <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Pembayaran melalui transfer via bank :</div>
                <div style={{ display: 'grid', gap: 2 }}>
                  <div><span style={{ fontWeight: 600, width: 60, display: 'inline-block' }}>BCA</span> : 8190459161 a.n Rizkiana Suprapto</div>
                  <div><span style={{ fontWeight: 600, width: 60, display: 'inline-block' }}>Mandiri</span> : 1100015570929 a.n Rizkiana Suprapto</div>
                  <div><span style={{ fontWeight: 600, width: 60, display: 'inline-block' }}>BNI</span> : 732596996 a.n Rizkiana Suprapto</div>
                </div>
              </div>

              <div style={{ background: '#eff6ff', padding: 10, borderRadius: 6 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Konfirmasi pembayaran ke :</div>
                <div style={{ display: 'grid', gap: 2 }}>
                  <div>1. Hendra Mulyadi (0812 2231 907)</div>
                  <div>2. Usman Gumanti (0821 7444 0227)</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', textAlign: 'right', background: '#f9fafb' }}>
              <button onClick={() => setShowExpiredPopup(false)} style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Tutup</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ width: 380, maxWidth: "92vw", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", padding: 22 }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 4, marginBottom: 8 }}>
          <img src="/eparthino.png" alt="Logo Mesin" style={{ width: 160, height: 160, objectFit: "contain" }} />
          <div style={{ fontSize: 18, fontWeight: 800 }}>Aplikasi Eparts Katalog</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>PT. Jaya Indah Motor (HINO)</div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { 
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passwordRef.current?.focus();
                }
              }}
              style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10, background: "#fafafa", fontSize: 14 }}
            />
            <input
              ref={passwordRef}
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) submit(); }}
              style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10, background: "#fafafa", fontSize: 14 }}
            />
          </div>
          {error && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#7f1d1d", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}>{error}</div>
          )}
          <button
            disabled={loading}
            onClick={submit}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", background: loading ? "#93c5fd" : "linear-gradient(90deg,#2563eb,#1d4ed8)", color: "#fff", fontWeight: 700, letterSpacing: 0.2 }}
          >
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}
