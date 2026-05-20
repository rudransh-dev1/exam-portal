// v3.0.0 — Nexus Portal: Premium Dynamic Auth
"use client";

import React, { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Hexagon, Lock, Mail, User, Shield, AlertTriangle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { loginStudent, submitSupportRequest } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";
import GoldenOrb from "@/components/GoldenOrb";
import Image from "next/image";
import styles from "./login.module.css";

export default function LoginPage() {
  const { push, prefetch } = useRouter();

  // View State
  const [view, setView] = useState<"login" | "signup" | "forgot" | "support">("login");

  // Shared & Form State
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("CS");
  const [supportMsg, setSupportMsg] = useState("");

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    prefetch("/dashboard");

    const savedUsn = localStorage.getItem("nexus_usn");
    if (savedUsn) {
      setUsn(savedUsn);
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [prefetch]);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !password.trim()) {
      setError("Please enter your credentials.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const data = await loginStudent(usn.trim(), password);
      sessionStorage.setItem("exam_token", data.access_token);
      sessionStorage.setItem("exam_student", JSON.stringify({
        id: data.student_id,
        name: data.student_name,
        usn: usn.trim().toUpperCase(),
        branch: data.branch
      }));
      localStorage.setItem("nexus_usn", usn.trim().toUpperCase());
      push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !password.trim() || !name.trim() || !email.trim()) {
      setError("Please fill all mandatory fields.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const data = await loginStudent(usn.trim(), password, {
        name: name.trim(),
        email: email.trim(),
        branch
      });
      sessionStorage.setItem("exam_token", data.access_token);
      sessionStorage.setItem("exam_student", JSON.stringify({
        id: data.student_id,
        name: data.student_name,
        usn: usn.trim().toUpperCase(),
        branch: data.branch
      }));
      localStorage.setItem("nexus_usn", usn.trim().toUpperCase());
      push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSupportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !supportMsg.trim()) {
      setError("Identification and description are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await submitSupportRequest(usn.trim(), supportMsg.trim());
      setSupportSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
      setLoading(false);
    }
  }

  const selectedBranchName = BRANCHES.find(b => b.id === branch)?.name || branch;

  const resetViews = () => {
    setView("login");
    setError("");
    setSupportSuccess(false);
    setSupportMsg("");
  };

  return (
    <div className={styles.container}>


      <button className={styles.helpBtn} onClick={() => setView("support")}>
        <Shield size={14} /> Get Help
      </button>

      <div className={styles.card}>
        <div className={styles.header}>
          <Hexagon className={styles.logoIcon} size={48} strokeWidth={1.5} />
          <h1 className={styles.title}>
            {view === "login" && "IP NEXUS EXAM"}
            {view === "signup" && "REGISTRATION"}
            {view === "forgot" && "RECOVERY"}
            {view === "support" && "HELP DESK"}
          </h1>
          <p className={styles.subtitle}>
            {view === "login" && "Secure Online Examination Portal"}
            {view === "signup" && "Join the Nexus Network"}
            {view === "forgot" && "Regain Access"}
            {view === "support" && "Emergency Assistance"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {view === "login" && (
            <motion.div key="login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handleLoginSubmit} className={styles.form}>
                <div className={styles.inputWrap}>
                  <User className={styles.inputIcon} size={18} />
                  <input type="text" className={styles.inputField} placeholder="USN (e.g. 1RM25XY000)" value={usn} onChange={(e) => setUsn(e.target.value.toUpperCase())} required />
                </div>
                <div className={styles.inputWrap}>
                  <Lock className={styles.inputIcon} size={18} />
                  <input type={showPassword ? "text" : "password"} className={styles.inputField} placeholder="Access Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className={styles.passToggle} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {error && <div className={styles.error}><AlertTriangle size={14}/> {error}</div>}

                <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Verifying…" : "Authenticate"}</button>

                <div className={styles.linksRow}>
                  <button className={styles.link} type="button" onClick={() => setView("forgot")}>Forgot Password?</button>
                </div>

                <div className={styles.signupPrompt}>
                  <span className={styles.signupLabel}>Sign up to continue</span>
                  <button className={styles.signupLink} type="button" onClick={() => setView("signup")}>Create Account</button>
                </div>
              </form>
            </motion.div>
          )}

          {view === "signup" && (
            <motion.div key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handleSignupSubmit} className={styles.form}>
                <div className={styles.inputWrap}>
                  <User className={styles.inputIcon} size={18} />
                  <input type="text" className={styles.inputField} placeholder="USN Number" value={usn} onChange={(e) => setUsn(e.target.value.toUpperCase())} required />
                </div>
                <div className={styles.inputWrap}>
                  <User className={styles.inputIcon} size={18} />
                  <input type="text" className={styles.inputField} placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className={styles.inputWrap}>
                  <Mail className={styles.inputIcon} size={18} />
                  <input type="email" className={styles.inputField} placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className={styles.inputWrap}>
                  <Lock className={styles.inputIcon} size={18} />
                  <input type="password" className={styles.inputField} placeholder="Create Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className={styles.selectContainer} ref={selectRef}>
                  <div
                    className={styles.selectTrigger}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectOpen(!selectOpen)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectOpen(!selectOpen); } }}
                  >
                    <span className={styles.selectedText}>{selectedBranchName}</span>
                  </div>
                  {selectOpen && (
                    <div className={styles.dropdown}>
                      {BRANCHES.map(b => (
                        <div
                          key={b.id}
                          className={styles.option}
                          role="option"
                          tabIndex={0}
                          aria-selected={branch === b.id}
                          onClick={() => { setBranch(b.id); setSelectOpen(false); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBranch(b.id); setSelectOpen(false); } }}
                        >{b.name}</div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <div className={styles.error}><AlertTriangle size={14}/> {error}</div>}
                <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Processing…" : "Sign Up"}</button>
                <div className={styles.backRow}>
                  <button className={styles.link} onClick={() => setView("login")}>Back to Login</button>
                </div>
              </form>
            </motion.div>
          )}

          {view === "forgot" && (
            <motion.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className={styles.recoveryText}>
                Please contact an <span className={styles.recoveryHighlight}>Administrator</span> or Faculty member to securely reset your credentials.
              </div>
              <button className={styles.submitBtn} onClick={() => setView("login")}>Understood</button>
            </motion.div>
          )}

          {view === "support" && (
            <motion.div key="support" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {!supportSuccess ? (
                <form onSubmit={handleSupportSubmit} className={styles.form}>
                  <p className={styles.recoveryText}>Describe your issue and an administrator will assist you shortly.</p>
                  <div className={styles.inputWrap}>
                    <User className={styles.inputIcon} size={18} />
                    <input type="text" className={styles.inputField} placeholder="USN / Email ID" value={usn} onChange={(e) => setUsn(e.target.value)} required />
                  </div>
                  <div className={styles.textareaWrap}>
                    <textarea className={styles.textareaField} placeholder="Describe your problem…" value={supportMsg} onChange={(e) => setSupportMsg(e.target.value)} required />
                  </div>
                  {error && <div className={styles.error}><AlertTriangle size={14}/> {error}</div>}
                  <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Sending…" : "Submit Request"}</button>
                  <div className={styles.backRow}>
                    <button type="button" className={styles.link} onClick={resetViews}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={styles.success}>
                  <Shield className={styles.successIcon} size={48} />
                  <h2 className={styles.successTitle}>Request Sent</h2>
                  <p className={styles.successText}>Your SOS signal has been received. Please wait for an administrator to contact you.</p>
                  <button className={styles.submitBtn} onClick={resetViews}>Back to Login</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.info}>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#22c55e" }} /> Secure Connection</div>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#eab308" }} /> Single Device</div>
        </div>
      </div>
    </div>
  );
}

