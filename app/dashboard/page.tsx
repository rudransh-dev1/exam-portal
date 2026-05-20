"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
export const dynamic = 'force-dynamic';
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import nextDynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig, apiFetch, fetchProfile, fetchActiveEvents, fetchEventHistory } from "@/lib/api";

// Styles
import "./theme.css";
import styles from "./dashboard.module.css";
import { 
  Zap, 
  ShieldCheck, 
  Activity, 
  Clock, 
  Trophy, 
  AlertCircle,
  LayoutDashboard,
  Code2,
  BrainCircuit,
  CalendarDays,
  History as HistoryIcon,
  User as UserIcon,
  Search,
  CheckCircle2
} from "lucide-react";

// Components
const Background = nextDynamic(() => import("@/components/dashboard/Background"), { ssr: false });
const Mountain = nextDynamic(() => import("@/components/dashboard/Mountain"), { 
  ssr: false,
  loading: () => <div style={{ height: '150px' }} />
});
const FloatingDiamond = nextDynamic(() => import("@/components/dashboard/FloatingDiamond"), { ssr: false });
const Sidebar = nextDynamic(() => import("@/components/dashboard/Sidebar"), { ssr: false });
const ExamCard = nextDynamic(() => import("@/components/dashboard/ExamCard"), { ssr: false });
const ProfileChip = nextDynamic(() => import("@/components/dashboard/ProfileChip"), { ssr: false });

interface ExamNode {
  id: string; exam_name: string; branch: string; is_active: boolean;
  duration_minutes: number; scheduled_start: string | null;
  question_count?: number; category: string;
  submitted?: boolean; score?: number; total_marks?: number;
  max_attempts?: number; attempt_count?: number;
}
interface StudentInfo {
  id: string; name: string; email: string; branch: string; usn?: string;
}
interface ProfileData {
  name: string; email: string; course: string; photo: string | null;
}

const NAV_ITEMS = [
  { id: "Home", icon: <LayoutDashboard size={18} />, label: "Home" },
  { id: "Aptitude", icon: <BrainCircuit size={18} />, label: "Aptitude Test" },
  { id: "Programming", icon: <Code2 size={18} />, label: "Programming" },
  { id: "Events", icon: <CalendarDays size={18} />, label: "Events" },
  { id: "Others", icon: <Zap size={18} />, label: "Other Quiz" },
  { id: "Profile", icon: <UserIcon size={18} />, label: "Profile" },
  { id: "History", icon: <HistoryIcon size={18} />, label: "History" },
];

function getNormalizedCategory(rawCat: string | undefined | null): string {
  const c = (rawCat || "Others").trim().toLowerCase();
  if (c.includes("apti")) return "Aptitude";
  if (c.includes("prog") || c.includes("prragm") || c.includes("progarrmign") || c.includes("coding")) return "Programming";
  if (c === "events" || c === "event") return "Events";
  return "Others";
}


function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}


/* ══ Inline 3D Tree of Life Orb ══ */
function TreeOfLifeOrb({ size = 120, label = "Loading…", sublabel = "" }: { size?: number; label?: string; sublabel?: string }) {
  const s = size;
  const ring1 = s * 1.22;
  const ring2 = s * 1.48;
  const orbImgStyle = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    backgroundImage: `url(https://media.base44.com/images/public/69fd11b7a90f528525fa294d/4c5cd2498_image.png)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    animation: `tol-spin 6s linear infinite`,
    willChange: "transform" as React.CSSProperties["willChange"],
    boxShadow: `0 0 ${s*0.25}px rgba(30,220,160,0.35), 0 0 ${s*0.5}px rgba(30,220,160,0.12), inset 0 0 ${s*0.18}px rgba(255,200,80,0.25)`
  };
  return (
    <>
      <style>{`
        @keyframes tol-spin { from { transform: rotateY(0deg) rotateX(8deg); } to { transform: rotateY(360deg) rotateX(8deg); } }
        @keyframes tol-ring1 { from { transform: rotateZ(0deg) rotateX(72deg); } to { transform: rotateZ(360deg) rotateX(72deg); } }
        @keyframes tol-ring2 { from { transform: rotateZ(0deg) rotateX(55deg); } to { transform: rotateZ(-360deg) rotateX(55deg); } }
        @keyframes tol-glow { 0%,100% { opacity:0.55; transform:scale(1); } 50% { opacity:0.85; transform:scale(1.12); } }
        @keyframes tol-float { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-8px); } }
      `}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20, userSelect:"none" }}>
        <div style={{ animation:"tol-float 3.5s ease-in-out infinite", position:"relative", width:ring2, height:ring2, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ position:"absolute", width:s*1.6, height:s*1.6, borderRadius:"50%", background:"radial-gradient(circle, rgba(30,220,160,0.18) 0%, rgba(60,120,255,0.08) 50%, transparent 75%)", animation:"tol-glow 2.8s ease-in-out infinite", pointerEvents:"none" }} />
          <div style={{ position:"absolute", width:ring2, height:ring2, borderRadius:"50%", border:"1.5px solid rgba(100,220,180,0.28)", animation:"tol-ring2 8s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position:"absolute", width:ring1, height:ring1, borderRadius:"50%", border:"1.5px solid rgba(180,140,80,0.4)", animation:"tol-ring1 5s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ width:s, height:s, borderRadius:"50%", perspective:s*3, perspectiveOrigin:"50% 50%", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }}>
            <div style={orbImgStyle} />
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#c0e8d8", fontSize:15, fontWeight:700, letterSpacing:"0.08em", textShadow:"0 0 12px rgba(60,200,140,0.5)" }}>{label}</div>
          {sublabel && <div style={{ color:"#4a8878", fontSize:12, marginTop:4 }}>{sublabel}</div>}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { push, replace } = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeNav, setActiveNav] = useState("Home");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [warpActive, setWarpActive] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [theme, setTheme] = useState<'galaxy' | 'classic'>('galaxy');
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [historyMode, setHistoryMode] = useState<'All' | 'Aptitude' | 'Programming' | 'Events' | 'Others'>('All');
  const [activeEvents, setActiveEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  useEffect(() => {
    if (activeEvents.length > 0 && !selectedEvent) {
      setSelectedEvent(activeEvents[0]);
    }
  }, [activeEvents, selectedEvent]);

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");
    console.log("[DASHBOARD] Session check:", { hasStudent: !!raw, hasToken: !!token });
    
    if (!raw || !token) { 
      console.warn("[DASHBOARD] Auth missing, redirecting to login.");
      replace("/login"); 
      return; 
    }
    const s: StudentInfo = JSON.parse(raw);
    setStudent(s);
    
    const prof: ProfileData = {
      name: s.name || "Student", 
      email: s.email || "",
      course: s.branch || "", 
      photo: null,
    };
    setProfile(prof); setDraft(prof);
    setWarpActive(false);

    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam === "History") {
      setActiveNav("History");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [replace]);

  const loadExams = useCallback(async () => {
    try {
      const configs = await fetchPublicExamConfig();
      const active = configs.filter((c: any) => 
        c.is_active === true || 
        c.is_active === "true" || 
        c.is_active === 1 || 
        c.is_active === "1"
      );

      const studentRaw = sessionStorage.getItem("exam_student");
      const studentObj = studentRaw ? JSON.parse(studentRaw) : null;
      const studentId = studentObj?.id;
      
      let submittedMap: Record<string, { score: number; total_marks: number; attempt_count: number }> = {};
      
      const isValidUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

      if (studentId && isValidUUID(studentId)) {
        try {
          const [statusResp, historyResp] = await Promise.all([
            apiFetch<{ data: any[] }>("/exam/status").catch(() => ({ data: [] })),
            apiFetch<{ results: any[] }>("/exam/history").catch(() => ({ results: [] }))
          ]);

          const statusData = statusResp.data || [];
          const resultsData = historyResp.results || [];
          
          if (resultsData.length > 0) {
            const histRecords: any[] = [];
            resultsData.forEach((r: any) => {
              if (r.exam_title) {
                const title = r.exam_title.trim().toLowerCase();
                const displayScore = r.correct_count ?? r.score ?? 0;
                const displayTotal = r.total_questions ?? r.total_marks ?? 0;

                if (!submittedMap[title]) {
                  submittedMap[title] = { score: displayScore, total_marks: displayTotal, attempt_count: 0 };
                }
                submittedMap[title].attempt_count++;
                
                if (submittedMap[title].attempt_count === 1) {
                  submittedMap[title].score = displayScore;
                  submittedMap[title].total_marks = displayTotal;
                }

                histRecords.push({
                  id: r.id,
                  examName: r.exam_title,
                  score: displayScore,
                  totalMarks: displayTotal,
                  timestamp: r.submitted_at,
                  category: getNormalizedCategory(r.category)
                });
              }
            });
            setLocalHistory(histRecords);
          }

          if (statusData) {
            statusData.forEach((s: any) => {
              if ((s.status === "submitted" || s.status === "TERMINATED") && s.exam_title) {
                const title = s.exam_title.trim().toLowerCase();
                if (!submittedMap[title]) {
                  submittedMap[title] = { score: 0, total_marks: 0, attempt_count: 1 };
                }
              }
            });
          }
        } catch (dbErr) {
          console.error("[DASHBOARD] History sync error:", dbErr);
        }
      }

      const nodes: ExamNode[] = []; 
      const seen = new Set<string>();
      
      if (active.length > 0) {
        for (const cfg of active) {
          const cfgTitle = (cfg.exam_title || "").trim().toLowerCase();
          if (seen.has(cfgTitle)) continue;
          seen.add(cfgTitle);

          const sub = submittedMap[cfgTitle] || { score: 0, total_marks: 0, attempt_count: 0 };
          
          nodes.push({
            id: cfg.id || cfg.exam_title,
            exam_name: cfg.exam_title,
            branch: cfg.branch || "GLOBAL", 
            is_active: cfg.is_active,
            duration_minutes: cfg.duration_minutes,
            scheduled_start: cfg.scheduled_start,
            question_count: cfg.total_questions || 0,
            category: getNormalizedCategory(cfg.category),
            submitted: sub.attempt_count > 0,
            score: sub.score,
            total_marks: sub.total_marks || cfg.total_marks || 0,
            max_attempts: cfg.max_attempts || 1,
            attempt_count: sub.attempt_count
          });
        }
      }
      setAllExams(nodes);
      try {
        const evs = await fetchActiveEvents();
        setActiveEvents(evs || []);
      } catch (evErr) {
        console.error("[DASHBOARD] Failed loading active events:", evErr);
      }
    } catch (err) {
      console.error("[DASHBOARD] loadExams failed:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchPublicExamConfig, apiFetch]);

  const refreshData = useCallback(async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      console.log("[DASHBOARD] Refreshing all data...");
      const freshProfile = await fetchProfile().catch(() => null);
      if (freshProfile && freshProfile.id) {
        setStudent(freshProfile);
        sessionStorage.setItem("exam_student", JSON.stringify(freshProfile));
        
        const prof: ProfileData = {
          name: freshProfile.name || "Student", 
          email: freshProfile.email || "",
          course: freshProfile.branch || "", 
          photo: profile.photo || null,
        };
        setProfile(prof);
        setDraft(prof);
      }
      await loadExams();
    } catch (e) {
      console.error("[Dashboard] Refresh failed:", e);
    } finally {
      if (isManual) setLoading(false);
    }
  }, [loadExams, profile.photo]);

  useEffect(() => {
    refreshData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("[DASHBOARD] Tab visible, refreshing...");
        refreshData();
      }
    };
    const handleFocus = () => {
      console.log("[DASHBOARD] Window focus, refreshing...");
      refreshData();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshData]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && NAV_ITEMS.find(n => n.id === tab)) {
        setActiveNav(tab);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const deleteHistoryItem = useCallback(async (r: any, i: number) => {
    if (!confirm(`Delete "${r.examName || "this result"}" from your history? This cannot be undone.`)) return;
    try {
      const token = sessionStorage.getItem("exam_token") || "";
      if (r.id) {
        // Delete from backend
        await fetch(`/api/exam/history/${r.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
      }
      // Remove from local state
      setLocalHistory(prev => prev.filter((_: any, idx: number) => idx !== i));
    } catch (err) {
      console.warn("Delete failed:", err);
      setLocalHistory(prev => prev.filter((_: any, idx: number) => idx !== i));
    }
  }, []);


  const onHistoryUpdated = useCallback(() => loadExams(), [loadExams]);

  useEffect(() => {
    loadExams();
    const ch1 = supabase.channel("ec").on("postgres_changes", { event: "*", schema: "public", table: "exam_config" }, () => loadExams()).subscribe();
    const ch2 = supabase.channel("qc").on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => loadExams()).subscribe();
    window.addEventListener("exam-history-updated", onHistoryUpdated);
    return () => { 
      supabase.removeChannel(ch1); 
      supabase.removeChannel(ch2); 
      window.removeEventListener("exam-history-updated", onHistoryUpdated);
    };
  }, [loadExams, onHistoryUpdated]);

  const filteredExams = useMemo(() => allExams.filter(e => {
    // ── Branch Filter ──
    if (student) {
      const sb = student.branch.trim().toUpperCase();
      const eb = (e.branch || "GLOBAL").trim().toUpperCase();
      
      // Split by comma and check for exact match or special keywords
      const branches = eb.split(',').map(b => b.trim());
      const branchMatch = 
        eb === "GLOBAL" || 
        eb === "ALL" || 
        eb === "" || 
        branches.includes(sb) || 
        branches.includes("ALL") || 
        branches.includes("GLOBAL") ||
        eb.includes(sb); // Fallback for partial matches

      if (!branchMatch) return false;
    }

    // Exclude exams based on attempt limits
    const maxA = e.max_attempts || 1;
    const currentA = e.attempt_count || 0;
    
    if (currentA >= maxA) return false;
    if (e.submitted && maxA <= 1) return false;

    if (activeNav === "Home") return true;
    if (["Profile", "History", "Insights"].includes(activeNav)) return false;
    const normCategory = getNormalizedCategory(e.category);
    if (activeNav === "Others") return !["Aptitude", "Programming", "Events"].includes(normCategory);
    return normCategory === activeNav;
  }), [allExams, activeNav, localHistory, student]);

  const activeExams = useMemo(() => filteredExams.filter(e => !e.scheduled_start || new Date(e.scheduled_start).getTime() <= Date.now()), [filteredExams]);
  const upcomingExams = useMemo(() => filteredExams.filter(e => e.scheduled_start && new Date(e.scheduled_start).getTime() > Date.now()), [filteredExams]);

  const { completedCount, avgScore, performanceLocked, lastFive } = useMemo(() => {
    const history = localHistory;
    const count = history.length;
    
    let avg = 0;
    if (count > 0) {
      const totalScore = history.reduce((a, r) => a + (r.score || 0), 0);
      const totalPossible = history.reduce((a, r) => a + (r.totalMarks || 1), 0);
      avg = Math.round((totalScore / totalPossible) * 100);
    }

    return {
      completedCount: count,
      avgScore: avg,
      performanceLocked: count < 3,
      lastFive: history.slice(-5).map(h => ({
        name: h.examName,
        percentage: Math.round((h.score / (h.totalMarks || 1)) * 100)
      }))
    };
  }, [localHistory]);



  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;

    // Check status in database before launch
    const token = sessionStorage.getItem("exam_token");
    if (token) {
      try {
        const res = await fetch(`/api/exam/status?_=${Date.now()}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const statusData = await res.json();
        const myStatus = statusData.data?.find((s: any) => s.exam_title === exam.exam_name);
        
        if (myStatus && myStatus.status === "TERMINATED") {
          alert("You have been terminated from this exam due to violations.");
          setActiveNav("History");
          return;
        }

        if ((exam.attempt_count || 0) >= (exam.max_attempts || 1)) {
          setActiveNav("History");
          return;
        }
      } catch (e) {
        console.error("[Dashboard] Pre-launch check failed:", e);
      }
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err: any) {
      console.warn("[Dashboard] Fullscreen blocked:", err.message);
    }

    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise((r: any) => setTimeout(r, 1200));
    push("/instructions");
  }, [push]);

  const handleLogout = () => { 
    // Total Wipeout: Clear all traces of the current student session
    sessionStorage.clear();
    localStorage.clear();
    
    // Clear cookies just in case (for future-proofing)
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    replace("/login"); 
  };

  const handleSaveProfile = () => {
    localStorage.setItem("nexus_profile", JSON.stringify({ name: draft.name, email: draft.email, course: draft.course }));
    if (draft.photo) localStorage.setItem("nexus_profile_photo", draft.photo); else localStorage.removeItem("nexus_profile_photo");
    setProfile({ ...draft }); setEditingProfile(false);
  };
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { const r = new FileReader(); r.onloadend = () => setDraft(d => ({ ...d, photo: r.result as string })); r.readAsDataURL(f); }
  };

  const headerText = () => {
    switch (activeNav) {
      case "Home": return { title: "Upcoming Exams", sub: "View your scheduled assessments" };
      case "Profile": return { title: "Profile", sub: "View your candidate information" };
      case "Events": return { title: "Active Events", sub: "Special challenges and hackathons" };
      case "History": return { title: "History", sub: "Review your previous assessments" };
      case "Others": return { title: "Other Quiz", sub: "Explore additional assessments" };
      default: return { title: activeNav, sub: "System ready for authorization" };
    }
  };
  const hdr = headerText();

  return (
    <div className={styles.page} data-theme={theme}>
      <Background />
      
      <div className={styles.layout}>
        <Sidebar 
          items={NAV_ITEMS} 
          activeItem={activeNav} 
          onItemClick={setActiveNav}
          onLogout={handleLogout}
        />

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerInfo}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {activeNav !== "Home" && (
                  <button className={styles.backBtnSmall} onClick={() => setActiveNav("Home")}>
                    ←
                  </button>
                )}
                <h1 className={styles.pageTitle}>{hdr.title}</h1>
                <button 
                  className={styles.refreshBtn} 
                  onClick={() => refreshData(true)}
                  disabled={loading}
                  title="Force Sync"
                >
                  {loading ? "⌛" : "↻"}
                </button>
              </div>
              <p className={styles.pageSub}>{hdr.sub}</p>
            </div>
            <div className={styles.headerActions}>
              <ProfileChip 
                user={{ id: student?.id || "", name: profile.name, usn: student?.usn, photo: profile.photo }}
                onProfileClick={() => setActiveNav("Profile")}
                onLogout={handleLogout}
              />
            </div>
          </header>

          <div className={styles.content}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeNav}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {activeNav === "Home" && (
                  <div className={styles.homeGrid}>
                    {/* ── COMMAND CENTER STATUS ── */}
                    <div className={styles.statsOverview}>
                      <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: "var(--nexus-accent)" }}>
                          <Activity size={24} />
                        </div>
                        <div className={styles.statMeta}>
                          <span className={styles.statLabel}>System Status</span>
                          <span className={styles.statValue}>OPTIMAL</span>
                        </div>
                        <div className={styles.statGlow} />
                      </div>
                      <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: "#3b82f6" }}>
                          <ShieldCheck size={24} />
                        </div>
                        <div className={styles.statMeta}>
                          <span className={styles.statLabel}>Security Node</span>
                          <span className={styles.statValue}>ENCRYPTED</span>
                        </div>
                      </div>
                      <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ color: "#8b5cf6" }}>
                          <Trophy size={24} />
                        </div>
                        <div className={styles.statMeta}>
                          <span className={styles.statLabel}>Rank</span>
                          <span className={styles.statValue}>Top 5%</span>
                        </div>
                      </div>
                    </div>
                    {/* ── ACTIVE EVENTS ── */}
                    {activeEvents.length > 0 && (
                      <section className={styles.examSection} style={{ marginBottom: "40px" }}>
                        <div className={styles.sectionHeader}>
                          <div>
                            <h2 className={styles.sectionTitle} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#e879f9" }}>
                              <span style={{ fontSize: "22px" }}>🏆</span> Special Event Quests
                            </h2>
                            <p className={styles.sectionSub}>High-priority multiplayer & round challenges</p>
                          </div>
                          <div className={styles.liveStatusBadge} style={{ background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)", border: "none", boxShadow: "0 0 15px rgba(236,72,153,0.4)" }}>EVENT ACTIVE</div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px", marginTop: "16px" }}>
                          {activeEvents.map((evt: any) => (
                            <div key={evt.id} style={{
                              background: "rgba(30, 20, 50, 0.4)",
                              backdropFilter: "blur(24px)",
                              border: "1px solid rgba(168, 85, 247, 0.2)",
                              borderRadius: "16px",
                              padding: "24px",
                              position: "relative",
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              gap: "16px",
                              transition: "all 0.3s ease",
                              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.cssText = "background: rgba(30, 20, 50, 0.4); backdrop-filter: blur(24px); border: 1px solid rgba(236, 72, 153, 0.5); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; transition: all 0.3s ease; box-shadow: 0 8px 32px 0 rgba(236, 72, 153, 0.15); transform: translateY(-4px);";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.cssText = "background: rgba(30, 20, 50, 0.4); backdrop-filter: blur(24px); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; transition: all 0.3s ease; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); transform: translateY(0px);";
                            }}>
                              <div style={{ position: "absolute", top: 0, right: 0, width: "100px", height: "100px", background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
                              
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", textShadow: "0 0 10px rgba(255,255,255,0.1)" }}>{evt.name}</h3>
                                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 8px", borderRadius: "100px", background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.3)", color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    By {evt.created_by_name || "Faculty"}
                                  </span>
                                </div>
                                
                                <p style={{ fontSize: "0.9rem", color: "#a1a1aa", marginTop: "8px", lineHeight: "1.4" }}>
                                  {evt.description || "Compete with other nodes in a fast-paced coding, aptitude, and jumbled challenge!"}
                                </p>
                              </div>

                              <div>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                                  {evt.rounds && evt.rounds.map((rnd: any) => (
                                    <span key={rnd.id} style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "#e4e4e7" }}>
                                      Round {rnd.round_number}: {rnd.round_type.toUpperCase()}
                                    </span>
                                  ))}
                                  {(!evt.rounds || evt.rounds.length === 0) && (
                                    <span style={{ fontSize: "11px", opacity: 0.5 }}>No rounds added yet</span>
                                  )}
                                </div>

                                <button onClick={() => push(`/events/play/${evt.id}`)} style={{
                                  width: "100%",
                                  padding: "12px",
                                  borderRadius: "10px",
                                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                                  border: "none",
                                  color: "#fff",
                                  fontWeight: 700,
                                  fontSize: "14px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "8px",
                                  boxShadow: "0 4px 15px rgba(168, 85, 247, 0.3)",
                                  transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(236, 72, 153, 0.5)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.boxShadow = "0 4px 15px rgba(168, 85, 247, 0.3)";
                                }}>
                                  🚀 Launch Event Quest
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                {/* ── LIVE ASSESSMENTS ── */}
                <section className={styles.examSection}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>Live Assessments</h2>
                      <p className={styles.sectionSub}>Available for immediate authorization</p>
                    </div>
                    <div className={styles.liveStatusBadge}>SYSTEM LIVE</div>
                  </div>

                  <div className={styles.cardsGrid}>
                    {activeExams.map((exam) => (
                      <ExamCard 
                        key={exam.id} 
                        exam={exam} 
                        onLaunch={() => handleLaunch(exam)} 
                      />
                    ))}
                    {activeExams.length === 0 && (
                      <div className={styles.emptyStateSimple}>
                        No live exams available at this moment.
                      </div>
                    )}
                  </div>
                </section>

                {/* ── UPCOMING ── */}
                {upcomingExams.length > 0 && (
                  <section className={styles.examSection}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h2 className={styles.sectionTitle}>Upcoming Schedule</h2>
                        <p className={styles.sectionSub}>Prepare for your next challenge</p>
                      </div>
                    </div>
                    <div className={styles.cardsGrid}>
                      {upcomingExams.map((exam) => (
                        <ExamCard 
                          key={exam.id} 
                          exam={exam} 
                          isUpcoming={true}
                          timeUntil={getTimeUntil(exam.scheduled_start)}
                          onLaunch={() => {}} 
                        />
                      ))}
                    </div>
                  </section>
                )}

                {activeExams.length === 0 && upcomingExams.length === 0 && (
                  <motion.div 
                    className={styles.noExamsMsg}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                     <div style={{fontSize: "64px", marginBottom: "24px", filter: "drop-shadow(0 0 20px rgba(40, 215, 214, 0.4))"}}>✨</div>
                     <h3 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '8px' }}>All Clear!</h3>
                     <p style={{ opacity: 0.7, maxWidth: '300px', margin: '0 auto 24px' }}>No active or upcoming exams found for your node. You're all caught up!</p>
                     <button onClick={loadExams} className={styles.refreshBtn} style={{ width: 'auto', padding: '0 24px', fontSize: '14px', fontWeight: 700 }}>
                       Check for Updates
                     </button>
                  </motion.div>
                )}
              </div>
            )}
            
            {activeNav !== "Home" && !["Profile", "History", "Events"].includes(activeNav) && (
              <div className={styles.cardsGrid}>
                 {filteredExams.length > 0 ? (
                    filteredExams.map((exam: any) => (
                       <ExamCard key={exam.id} exam={exam} onLaunch={() => handleLaunch(exam)} />
                    ))
                 ) : (
                   <div className={styles.comingSoonCard}>
                     <div className={styles.comingSoonIcon}>🚀</div>
                     <h3>Coming Soon</h3>
                     <p>Stay tuned! New challenges in {activeNav} are being prepared for your node.</p>
                   </div>
                 )}
              </div>
            )}

            {/* EVENTS MULTIPLAYER & ROUNDS OUTLINE */}
            {activeNav === "Events" && (
              <div className={styles.eventsLayout}>
                {/* Left Column - List of Active Events */}
                <div className={styles.eventsListCol}>
                  {activeEvents.length === 0 ? (
                    <div className={styles.emptyStateSimple}>
                      No active events available at this moment.
                    </div>
                  ) : (
                    activeEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className={`${styles.eventListCard} ${selectedEvent?.id === evt.id ? styles.eventListCardActive : ""}`}
                        onClick={() => setSelectedEvent(evt)}
                      >
                        <div className={styles.eventListCardTitle}>{evt.name}</div>
                        <div style={{ fontSize: "12px", opacity: 0.7, color: "#a1a1aa", lineHeight: "1.4" }}>
                          {evt.description ? (evt.description.length > 80 ? evt.description.substring(0, 80) + "..." : evt.description) : "Click to view event details"}
                        </div>
                        <div className={styles.eventListCardMeta}>
                          <span className={styles.eventListCardRounds}>
                            🎯 {evt.rounds?.length || 0} Rounds
                          </span>
                          <span className={styles.eventListCardCreator}>
                            By {evt.created_by_name || "Faculty"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Right Column - Selected Event Detail & Timeline */}
                <div className={styles.eventDetailCol}>
                  {selectedEvent ? (
                    <>
                      <div className={styles.eventDetailHeader}>
                        <div>
                          <h2 className={styles.eventDetailTitle}>{selectedEvent.name}</h2>
                          <div style={{ fontSize: "12px", color: "var(--nexus-accent)", fontWeight: 700, marginTop: "6px", textTransform: "uppercase" }}>
                            QUEST AUTHORIZATION REQUIRED
                          </div>
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "20px", background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.3)", color: "#c084fc", textTransform: "uppercase" }}>
                          By {selectedEvent.created_by_name || "Faculty"}
                        </span>
                      </div>

                      <p className={styles.eventDetailDesc}>
                        {selectedEvent.description || "Enter the multiplayer challenge! Run through successive rounds of coding, aptitude, and jumbled lines logic to secure your high score."}
                      </p>

                      <div className={styles.roundsOutlineTitle}>Event Quest Journey</div>
                      <div className={styles.roundsOutlineTimeline}>
                        {selectedEvent.rounds && selectedEvent.rounds.length > 0 ? (
                          selectedEvent.rounds.map((rnd: any) => (
                            <div key={rnd.id} className={styles.roundTimelineItem}>
                              <div className={styles.roundTimelineBadge}>
                                {rnd.round_type === "mcq" ? "📝" : rnd.round_type === "programming" ? "💻" : "🔀"}
                              </div>
                              <div className={styles.roundTimelineContent}>
                                <div className={styles.roundTimelineTitle}>Round {rnd.round_number}: {rnd.title}</div>
                                <span className={styles.roundTimelineType}>
                                  {rnd.round_type === "mcq" ? "Multiple Choice Quiz" : rnd.round_type === "programming" ? "Compiler Coding Challenge" : "Drag-and-Drop Code Jumble"}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px", textAlign: "center", opacity: 0.6, fontSize: "13px" }}>
                            No rounds configured for this event.
                          </div>
                        )}
                      </div>

                      {selectedEvent.rounds && selectedEvent.rounds.length > 0 && (
                        <button
                          className={styles.eventLaunchButton}
                          onClick={() => {
                            if (document.documentElement.requestFullscreen) {
                              document.documentElement.requestFullscreen().catch(() => {});
                            }
                            push(`/events/play/${selectedEvent.id}`);
                          }}
                        >
                          🚀 Authorize & Enter Event Quest
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, opacity: 0.5, gap: "16px" }}>
                      <span style={{ fontSize: "40px" }}>🎯</span>
                      <div>Select an event from the list to view its details.</div>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* PROFILE */}
            {activeNav === "Profile" && (
              <div className={styles.profileStack}>
                {!editingProfile ? (
                  <>
                    <div className={styles.profileBanner}>
                      <div className={styles.profileLeft}>
                        <div className={styles.profileAvatarLarge}>
                          {profile.photo ? <img src={profile.photo} alt="" /> : (profile.name?.[0] || "S")}
                        </div>
                        <div className={styles.profileMeta}>
                          <h2 className={styles.profileName}>{profile.name || "Student"}</h2>
                          <p className={styles.profileEmail}>✉ {profile.email || "—"}</p>
                        </div>
                      </div>
                      <button className={styles.editBtn} onClick={() => setEditingProfile(true)}>
                        <span className={styles.editIcon}>✏️</span> Edit Profile
                      </button>
                    </div>

                    <div className={styles.profileDetailsCard}>
                      <h3 className={styles.detailsTitle}>Personal Information</h3>
                      <div className={styles.detailsGrid}>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>👤</span>
                          <div className={styles.detailContent}>
                            <label>Full Name</label>
                            <p>{profile.name || "—"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>✉</span>
                          <div className={styles.detailContent}>
                            <label>Email</label>
                            <p>{profile.email || "—"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>📂</span>
                          <div className={styles.detailContent}>
                            <label>Branch</label>
                            <p>{student?.branch || "DS"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>💳</span>
                          <div className={styles.detailContent}>
                            <label>USN</label>
                            <p>{student?.usn || student?.id || "—"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.editForm}>
                    <div className={styles.field}>
                      <label>Name</label>
                      <input value={draft.name} onChange={(e: any) => setDraft((d: any) => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div className={styles.field}>
                      <label>Email</label>
                      <input value={draft.email} onChange={(e: any) => setDraft((d: any) => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div className={styles.field}>
                      <label>Profile Photo</label>
                      <input type="file" accept="image/*" onChange={handlePhotoChange} />
                      <p style={{fontSize:'13px', opacity:0.5, marginTop: '4px'}}>Stored locally in your secure environment.</p>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.saveBtn} onClick={handleSaveProfile}>Save Changes</button>
                      <button className={styles.cancelBtn} onClick={() => setEditingProfile(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeNav === "History" && (
              <div className={styles.historyContainer}>
                <div className={styles.historyCard}>
                  <div className={styles.historyHeader}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3>Assessment History</h3>
                        <p>Review your completed exams and scores</p>
                      </div>
                      <div className={styles.historySelectContainer}>
                        <select 
                          className={styles.historySelect}
                          value={historyMode}
                          onChange={(e: any) => setHistoryMode(e.target.value as any)}
                        >
                          <option value="All">All Categories</option>
                          <option value="Aptitude">Aptitude</option>
                          <option value="Programming">Programming</option>
                          <option value="Events">Events</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className={styles.historyList}>
                    {(() => {
                      const filteredHistory = localHistory.filter(h => {
                        if (historyMode === 'All') return true;
                        return h.category === historyMode;
                      });

                      if (filteredHistory.length === 0) {
                        return (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ display:"flex", flexDirection: "column", alignItems: "center", justifyContent:"center", padding:"48px 0", gap: "16px" }}
                          >
                            <TreeOfLifeOrb size={100} label={historyMode === 'Events' ? "No Events Found" : "No Exams Found"} sublabel={historyMode === 'Events' ? "You haven't participated in any events yet." : "Complete an exam to see your history here."} />
                          </motion.div>
                        );
                      }

                      const deleteBtnStyle: React.CSSProperties = {
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: 700,
                        transition: "all 0.15s",
                        flexShrink: 0,
                      };

                      return filteredHistory.map((r: any, i: number) => (
                        <motion.div 
                          key={r.id || i} 
                          className={styles.historyItem}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <div className={styles.historyLeft}>
                            <span className={styles.historyIcon}>📋</span>
                            <div className={styles.historyInfo}>
                              <div className={styles.historyName}>{r.examName || "Nexus Assessment"}</div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <div className={styles.historyDate} suppressHydrationWarning>{new Date(r.timestamp).toLocaleDateString()}</div>
                                <span style={{ 
                                  fontSize: '13px', 
                                  padding: '1px 5px', 
                                  borderRadius: '3px', 
                                  background: `var(--category-${(r.category || 'others').toLowerCase()})`,
                                  color: '#fff',
                                  fontWeight: 800,
                                  textTransform: 'uppercase'
                                }}>{r.category || 'Others'}</span>
                              </div>
                            </div>
                          </div>
                          <div className={styles.historyRight}>
                            <div className={styles.historyScore}>
                              <span className={styles.scoreLabel}>Final Score</span>
                              <div className={styles.scoreValue}>{r.score ?? 0} / {r.totalMarks ?? 0}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className={styles.historyStatus}>COMPLETED</div>
                              <button
                                onClick={() => deleteHistoryItem(r, i)}
                                title="Delete this result"
                                style={deleteBtnStyle}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            )}

              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <button className={styles.themeToggle} onClick={() => setTheme(t => t === 'galaxy' ? 'classic' : 'galaxy')}>
        {theme === 'galaxy' ? '✨' : '🏢'}
      </button>

      {warpActive && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"radial-gradient(ellipse at 50% 40%, #0d1530 0%, #060912 100%)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:["radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.45), transparent)","radial-gradient(1px 1px at 25% 60%, rgba(255,255,255,0.3), transparent)","radial-gradient(1px 1px at 45% 25%, rgba(255,255,255,0.5), transparent)","radial-gradient(1px 1px at 65% 75%, rgba(255,255,255,0.35), transparent)","radial-gradient(1px 1px at 80% 40%, rgba(255,255,255,0.4), transparent)"].join(",") }} />
          <TreeOfLifeOrb size={130} label="Entering Exam…" sublabel="Calibrating your node" />
        </div>
      )}
    </div>
  );
}


