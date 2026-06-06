import { useState } from "react";

export default function PasswordScreen({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setLoading(true);
    await onUnlock(password);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#12121a",
    border: shake ? "1px solid #ef4444" : "1px solid #22222e",
    borderRadius: 10,
    padding: "13px 16px",
    color: "#ddd",
    fontSize: 14,
    outline: "none",
    fontFamily: "Outfit, sans-serif",
    transition: "border-color .15s",
    textAlign: "center",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08080e", padding: 20 }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "#0e0e16", borderRadius: 16,
        padding: "40px 32px", border: "1px solid #16161f",
        animation: shake ? "headShake .4s ease" : undefined,
      }}>
        <style>{`@keyframes headShake { 0%,100%{transform:translateX(0)} 15%,45%,75%{transform:translateX(-6px)} 30%,60%{transform:translateX(6px)} }`}</style>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, color: "#6c5ce7", marginBottom: 10 }}>⬢</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#f0f0f0", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Service Jobs
          </h1>
          <p style={{ fontSize: 12, color: "#3a3a48" }}>Enter password to access your board</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6c5ce7")}
            onBlur={(e) => (e.currentTarget.style.borderColor = shake ? "#ef4444" : "#22222e")}
            placeholder="Password"
            style={inputStyle}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "13px", borderRadius: 10, border: "none",
              background: loading ? "#3a3a50" : "#6c5ce7",
              color: "#fff", cursor: loading ? "wait" : "pointer",
              fontSize: 14, fontWeight: 700, fontFamily: "Outfit, sans-serif",
              transition: "background .15s",
            }}
          >
            {loading ? "Unlocking…" : "Unlock"}
          </button>
        </div>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: "#2a2a38" }}>
          Same password = same board on any device
        </p>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 9, color: "#1a1a25", letterSpacing: "1.5px", fontWeight: 600 }}>
          OBSIDIAN CODE
        </div>
      </div>
    </div>
  );
}
