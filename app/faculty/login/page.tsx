"use client";
/**
 * Faculty Login / Signup Page
 * Sleek glassmorphic dark theme, with dynamic transitions and pending approval warning.
 */
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BRANCHES as BRANCH_LIST } from "@/lib/constants";

const $ = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at top right, #111827, #030712)", fontFamily: "Inter, sans-serif", padding: 20, color: "#fff", position: "relative" as const, overflow: "hidden" },
  glow: { position: "absolute" as const, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(40, 215, 214, 0.08) 0%, transparent 70%)", top: "10%", right: "10%", pointerEvents: "none" as const },
  glow2: { position: "absolute" as const, width: 450, height: 450, borderRadius: "50%", background: "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)", bottom: "10%", left: "5%", pointerEvents: "none" as const },
  card: { background: "rgba(255, 255, 255, 0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 24, padding: "40px", maxWidth: 450, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", zIndex: 10, transition: "all 0.3s ease" } as React.CSSProperties,
  h1: { fontSize: 32, fontWeight: 900, textAlign: "center" as const, margin: "0 0 8px 0", background: "linear-gradient(135deg, #fff 30%, #28D7D6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.03em" },
  sub: { fontSize: 14, color: "rgba(216, 234, 242, 0.6)", textAlign: "center" as const, marginBottom: 32 },
  lbl: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "rgba(216, 234, 242, 0.75)", marginBottom: 8, display: "block" },
  inp: { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" as const, marginBottom: 20, transition: "all 0.25s" } as React.CSSProperties,
  btn: { width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #28D7D6, #0066cc)", color: "#000", fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 20px rgba(40, 215, 214, 0.35)", transition: "all 0.25s", display: "flex", justifyContent: "center", alignItems: "center" } as React.CSSProperties,
  toggleText: { textAlign: "center" as const, fontSize: 13, color: "rgba(216, 234, 242, 0.5)", marginTop: 20 },
  toggleBtn: { background: "none", border: "none", color: "#28D7D6", fontWeight: 800, cursor: "pointer", padding: "0 4px", fontSize: 13 },
  error: { background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 12, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 20, lineHeight: 1.5 } as React.CSSProperties,
  success: { background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 12, padding: "12px 16px", color: "#34d399", fontSize: 13, marginBottom: 20, lineHeight: 1.5 } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxHeight: 150, overflowY: "auto" as const, background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: 12, marginBottom: 20, border: "1px solid rgba(255,255,255,0.05)" } as React.CSSProperties,
};

export default function FacultyLoginPage() {
  const { push } = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const handleBranchToggle = (id: string) => {
    setSelectedBranches(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSuccess("");
    setLoading(true);

    const endpoint = isLogin ? "/py-api/faculty/login" : "/py-api/faculty/signup";
    const body = isLogin 
      ? { email, password }
      : { name, email, password, branches: selectedBranches };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Something went wrong. Please try again.");
      }

      if (isLogin) {
        localStorage.setItem("faculty_token", data.access_token);
        localStorage.setItem("faculty_info", JSON.stringify(data));
        push("/faculty/dashboard");
      } else {
        setSuccess("Registration request submitted! Please wait for Admin approval.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={$.container}>
      <div style={$.glow} />
      <div style={$.glow2} />

      <div style={$.card}>
        <h1 style={$.h1}>{isLogin ? "Faculty Portal" : "Join Faculty"}</h1>
        <p style={$.sub}>{isLogin ? "Secure dashboard access for verified professors" : "Register your academic account below"}</p>

        {err && <div style={$.error}>{err}</div>}
        {success && <div style={$.success}>{success}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <label style={$.lbl}>Full Name</label>
              <input
                style={$.inp}
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Dr. Eleanor Vance"
              />
            </>
          )}

          <label style={$.lbl}>Email Address</label>
          <input
            style={$.inp}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="faculty@college.edu"
          />

          <label style={$.lbl}>Password</label>
          <input
            style={$.inp}
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••••"
          />

          {!isLogin && (
            <>
              <label style={$.lbl}>Managed Branches (Select all that apply)</label>
              <div style={$.grid}>
                {BRANCH_LIST.map(b => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "rgba(216,234,242,0.8)" }}>
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(b.id)}
                      onChange={() => handleBranchToggle(b.id)}
                      style={{ accentColor: "#28D7D6", width: 15, height: 15 }}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </>
          )}

          <button style={$.btn} type="submit" disabled={loading}>
            {loading ? "Authenticating..." : isLogin ? "Access Dashboard" : "Request Registration"}
          </button>
        </form>

        <div style={$.toggleText}>
          {isLogin ? "Need a faculty account?" : "Already have an account?"}
          <button style={$.toggleBtn} onClick={() => { setIsLogin(!isLogin); setErr(""); setSuccess(""); }}>
            {isLogin ? "Create one" : "Login here"}
          </button>
        </div>
      </div>
    </div>
  );
}
