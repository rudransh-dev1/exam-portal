"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LazyMotion, domAnimation, m } from "framer-motion";
import Background from "@/components/dashboard/Background";
import s from "./login.module.css";

export default function AdminLoginPage() {
  const { push } = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      if (!r.ok) {
        setError((await r.json()).detail || "Login failed");
        return;
      }
      const d = await r.json();
      sessionStorage.setItem("examguard_admin_jwt", d.access_token);
      sessionStorage.setItem("examguard_admin_auth", "true");
      push("/admin");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
    <div className={s.page}>
      <Background />
      
      <m.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={s.card}
      >
        <div className={s.header}>
          <div className={s.headerIcon}>⚡</div>
          <h1 className={s.headerTitle}>
            EXAM Admin
          </h1>
          <p className={s.headerSubtitle}>
            Control Node — Staff Authorization
          </p>
        </div>

        <form onSubmit={login} className={s.form}>
          <div>
            <label htmlFor="admin-email" className={s.label}>
              Administrator Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="admin@nexus.local"
              required
              className={s.input}
            />
          </div>

          <div>
            <label htmlFor="admin-pass" className={s.label}>
              Access Key
            </label>
            <input
              id="admin-pass"
              type="password"
              value={pass}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPass(e.target.value)}
              placeholder="••••••••••••"
              required
              className={s.input}
            />
          </div>

          {error && (
            <m.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={s.error}
            >
              {error}
            </m.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={s.submitBtn}
          >
            {loading ? "Authorizing..." : "Initialize Access"}
          </button>
        </form>

        <p className={s.footer}>
          NEXUS Orbital Command · Secure Environment
        </p>
      </m.div>
    </div>
    </LazyMotion>
  );
}
