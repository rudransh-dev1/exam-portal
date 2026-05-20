"use client";
/**
 * Faculty Dashboard
 * Premium administrative space for approved faculty.
 * Includes Stats, Question Bank management, Event Management, and Student Monitoring.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/api";
import nextDynamic from "next/dynamic";

const AdminBackground = nextDynamic(() => import("@/components/admin/AdminBackground"), { ssr: false });
const EventsAdminTab  = nextDynamic(() => import("@/components/admin/EventsAdminTab"),  { ssr: false });

/* ─── Styles ─────────────────────────────────── */
const $ = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top right, #090e1a, #02040a)", color: "#D8EAF2", fontFamily: "Inter, sans-serif", paddingBottom: 60, position: "relative" as const },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(20px)", zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  title: { fontSize: 20, fontWeight: 900, color: "#fff", margin: 0, background: "linear-gradient(135deg, #fff, #28D7D6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.02em" },
  subtitle: { fontSize: 11, color: "rgba(216,234,242,0.4)", margin: "2px 0 0 0" },
  nav: { display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)" },
  navBtn: { padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.25s" } as React.CSSProperties,
  logoutBtn: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)", color: "#f87171", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" } as React.CSSProperties,
  content: { padding: "40px", maxWidth: 1200, margin: "0 auto", position: "relative" as const, zIndex: 10 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 40 },
  statCard: { background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 20, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" } as React.CSSProperties,
  statVal: { fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 6, display: "flex", alignItems: "baseline", gap: 8 },
  statLbl: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "rgba(216,234,242,0.5)" },
  card: { background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 20, padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" } as React.CSSProperties,
  h2: { fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 0 8px 0" },
  lbl: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "rgba(216, 234, 242, 0.75)", marginBottom: 8, display: "block" },
  inp: { width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const, marginBottom: 16 } as React.CSSProperties,
  btnPrimary: { padding: "12px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#28D7D6,#0066cc)", color: "#000", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 15px rgba(40, 215, 214, 0.3)", transition: "all 0.2s" } as React.CSSProperties,
  badge: { padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 } as React.CSSProperties,
};

type FacultyTab = "overview" | "questions" | "events" | "students";

export default function FacultyDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FacultyTab>("overview");
  const [faculty, setFaculty] = useState<any>(null);
  const [stats, setStats] = useState({ active_students: 0, question_count: 0, branch_count: 0, branches: [] });
  const [loading, setLoading] = useState(true);

  // Verification & Auth check
  useEffect(() => {
    const token = localStorage.getItem("faculty_token");
    if (!token) {
      router.push("/faculty/login");
      return;
    }
    const info = localStorage.getItem("faculty_info");
    if (info) {
      setFaculty(JSON.parse(info));
    }
    fetchStats();
  }, [router]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("faculty_token");
      const res = await fetch("/py-api/faculty/dashboard", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("faculty_token");
        router.push("/faculty/login");
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("faculty_token");
    localStorage.removeItem("faculty_info");
    router.push("/faculty/login");
  };

  if (loading) {
    return (
      <div style={{ ...$.page, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Initializing Portal Session...</div>
      </div>
    );
  }

  return (
    <div style={$.page}>
      <AdminBackground />

      <header style={$.header}>
        <div style={$.headerLeft}>
          <div style={{ fontSize: 24 }}>👩‍🏫</div>
          <div>
            <h1 style={$.title}>Faculty Administration</h1>
            <p style={$.subtitle}>Logged in as <strong>{faculty?.name || "Professor"}</strong></p>
          </div>
        </div>

        <nav style={$.nav}>
          {(["overview", "questions", "events", "students"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                ...$.navBtn,
                background: activeTab === t ? "rgba(40, 215, 214, 0.15)" : "transparent",
                color: activeTab === t ? "#28D7D6" : "rgba(216,234,242,0.6)",
              }}
            >
              {t === "overview" ? "📊 Overview" : t === "questions" ? "📚 Question Bank" : t === "events" ? "🎯 Events" : "👥 Students"}
            </button>
          ))}
        </nav>

        <button style={$.logoutBtn} onClick={handleLogout}>🚪 Logout</button>
      </header>

      <main style={$.content}>
        {activeTab === "overview" && (
          <div>
            {/* Stats section */}
            <div style={$.statsGrid}>
              <div style={$.statCard}>
                <div style={$.statVal}>{stats.active_students}</div>
                <div style={$.statLbl}>Active Students in Branch</div>
              </div>
              <div style={$.statCard}>
                <div style={$.statVal}>{stats.question_count}</div>
                <div style={$.statLbl}>Questions Created</div>
              </div>
              <div style={$.statCard}>
                <div style={$.statVal}>{stats.branch_count}</div>
                <div style={$.statLbl}>Managed Branches</div>
              </div>
            </div>

            {/* Welcome Greeting */}
            <div style={$.card}>
              <h2 style={$.h2}>Welcome Back, {faculty?.name}!</h2>
              <p style={{ color: "rgba(216, 234, 242, 0.65)", lineHeight: 1.6, fontSize: 14 }}>
                This is your dedicated secure platform area. As a verified faculty advisor, you have direct capabilities to manage your question repositories, assemble multiplayer interactive coding events, customize multi-lingual compile suites, and perform live tracking on examinees.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                {stats.branches?.map((br: string) => (
                  <span key={br} style={{ ...$.badge, background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>{br}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "questions" && <FacultyQuestionsTab />}

        {activeTab === "events" && <EventsAdminTab />}

        {activeTab === "students" && <FacultyStudentsTab />}
      </main>
    </div>
  );
}

/* ─── Faculty Questions Bank ─────────────────── */
function FacultyQuestionsTab() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingQ, setEditingQ] = useState<any | null>(null);

  // Form Fields
  const [examName, setExamName] = useState("");
  const [qText, setQText] = useState("");
  const [options, setOptions] = useState([{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }]);
  const [correct, setCorrect] = useState("A");
  const [marks, setMarks] = useState(1);
  const [branch, setBranch] = useState("CS");

  const loadQuestions = useCallback(async () => {
    try {
      const token = localStorage.getItem("faculty_token");
      const res = await fetch("/py-api/faculty/questions", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("faculty_token");
    const payload = {
      exam_name: examName.trim(),
      question_text: qText.trim(),
      options,
      correct_option: correct,
      marks,
      branch,
      category: "Programming"
    };

    try {
      const endpoint = editingQ ? `/py-api/faculty/questions/${editingQ.id}` : "/py-api/faculty/questions";
      const method = editingQ ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowAdd(false);
        setEditingQ(null);
        // Clear
        setQText("");
        setOptions([{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }]);
        loadQuestions();
      }
    } catch (e) {
      alert("Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (q: any) => {
    setEditingQ(q);
    setExamName(q.exam_name);
    setQText(q.question_text);
    setOptions(q.options || [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }]);
    setCorrect(q.correct_option);
    setMarks(q.marks);
    setBranch(q.branch);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      const token = localStorage.getItem("faculty_token");
      await fetch(`/py-api/faculty/questions/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      loadQuestions();
    } catch (e) {
      alert("Delete failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={$.h2}>📚 Question Bank</h2>
        <button style={$.btnPrimary} onClick={() => { setEditingQ(null); setShowAdd(true); }}>➕ Add Question</button>
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAdd(false)}>
          <form style={{ ...$.card, cursor: "default", maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            <h3 style={{ ...$.h2, fontSize: 20 }}>{editingQ ? "Modify Question" : "Create Question"}</h3>

            <label style={$.lbl}>Exam/Quiz Assignment Name</label>
            <input style={$.inp} required value={examName} onChange={e => setExamName(e.target.value)} placeholder="e.g., Python Programming Final" />

            <label style={$.lbl}>Question Text</label>
            <textarea style={{ ...$.inp, height: 100, resize: "vertical" }} required value={qText} onChange={e => setQText(e.target.value)} placeholder="Enter query details..." />

            <label style={$.lbl}>Option Values</label>
            {options.map((opt, i) => (
              <div key={opt.label} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: "#28D7D6", fontWeight: 900, width: 20 }}>{opt.label}.</span>
                <input style={{ ...$.inp, margin: 0, flex: 1 }} required value={opt.text} onChange={e => {
                  const copy = [...options];
                  copy[i] = { ...copy[i], text: e.target.value };
                  setOptions(copy);
                }} placeholder={`Choice ${opt.label}`} />
              </div>
            ))}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={$.lbl}>Correct Answer</label>
                <select style={$.inp} value={correct} onChange={e => setCorrect(e.target.value)}>
                  {options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={$.lbl}>Score Weight</label>
                <input style={$.inp} type="number" required value={marks} onChange={e => setMarks(Number(e.target.value))} />
              </div>
              <div>
                <label style={$.lbl}>Target Branch</label>
                <input style={$.inp} required value={branch} onChange={e => setBranch(e.target.value.toUpperCase())} placeholder="e.g. CS" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" style={{ ...$.btnPrimary, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }} onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" style={$.btnPrimary} disabled={saving}>{saving ? "Saving..." : "Save Question"}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div>Retrieving entries...</div>
      ) : questions.length === 0 ? (
        <div style={{ ...$.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>No questions logged yet</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {questions.map(q => (
            <div key={q.id} style={$.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <span style={{ ...$.badge, background: "rgba(40,215,214,0.12)", color: "#28D7D6", border: "1px solid rgba(40,215,214,0.3)", marginRight: 8 }}>{q.exam_name}</span>
                  <span style={{ ...$.badge, background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>{q.branch}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...$.btnPrimary, padding: "6px 12px", fontSize: 12 }} onClick={() => handleEdit(q)}>✏️ Edit</button>
                  <button style={{ ...$.btnPrimary, padding: "6px 12px", fontSize: 12, background: "rgba(239, 68, 68, 0.1)", color: "#f87171", boxShadow: "none" }} onClick={() => handleDelete(q.id)}>✕ Remove</button>
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{q.question_text}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {q.options?.map((o: any) => (
                  <div key={o.label} style={{ fontSize: 13, color: o.label === q.correct_option ? "#28D7D6" : "rgba(216,234,242,0.6)", fontWeight: o.label === q.correct_option ? 800 : 500 }}>
                    {o.label}. {o.text} {o.label === q.correct_option && "✓"}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Faculty Students Monitoring ────────────── */
function FacultyStudentsTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      const token = localStorage.getItem("faculty_token");
      const res = await fetch("/py-api/faculty/students", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setStudents(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  return (
    <div>
      <h2 style={{ ...$.h2, marginBottom: 24 }}>👥 Student Performance</h2>
      {loading ? (
        <div>Refreshing monitor feed...</div>
      ) : students.length === 0 ? (
        <div style={{ ...$.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>No registered students in your managed branches.</div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", color: "#c8daf0", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(40,215,214,0.15)" }}>
              <th style={{ padding: 12 }}>USN NO</th>
              <th style={{ padding: 12 }}>STUDENT</th>
              <th style={{ padding: 12 }}>BRANCH</th>
              <th style={{ padding: 12 }}>CURRENT STATUS</th>
              <th style={{ padding: 12 }}>VIOLATIONS</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td style={{ padding: 12, fontWeight: 800 }}>{s.usn}</td>
                <td style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, color: "#fff" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(216,234,242,0.4)" }}>{s.email}</div>
                </td>
                <td style={{ padding: 12 }}><span style={{ ...$.badge, background: "rgba(255,255,255,0.06)", color: "#fff" }}>{s.branch}</span></td>
                <td style={{ padding: 12 }}>
                  <span style={{ ...$.badge, background: s.status === "active" ? "rgba(40,215,214,0.1)" : s.status === "submitted" ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.05)", color: s.status === "active" ? "#28D7D6" : s.status === "submitted" ? "#10b981" : "rgba(216,234,242,0.4)" }}>
                    {s.status === "active" ? "Active" : s.status === "submitted" ? "Submitted" : "Not Started"}
                  </span>
                </td>
                <td style={{ padding: 12, color: s.warnings > 0 ? "#ef4444" : "rgba(216,234,242,0.4)", fontWeight: 800 }}>{s.warnings || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
