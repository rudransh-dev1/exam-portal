"use client";
/**
 * EventsAdminTab.tsx
 * Dynamic event management — create events, add rounds (MCQ / Programming / Jumble)
 */
import React, { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/api";

/* ─── Types ─────────────────────────────────── */
interface EventRound {
  id: string;
  event_id: string;
  round_number: number;
  round_type: "mcq" | "programming" | "jumble";
  title: string;
  config_json: any;
  created_at?: string;
}

interface EventItem {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_by: string;
  created_by_name: string;
  round_count: number;
  rounds?: EventRound[];
  created_at: string;
}

/* ─── Styles ─────────────────────────────────── */
const $ = {
  wrap: { padding: "24px 32px", color: "#D8EAF2", fontFamily: "Inter,sans-serif", maxWidth: 1100, background: "transparent" } as React.CSSProperties,
  h2: { fontSize: 28, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.02em" } as React.CSSProperties,
  sub: { fontSize: 13, color: "rgba(216, 234, 242, 0.5)", marginBottom: 32, letterSpacing: "0.01em" } as React.CSSProperties,
  card: { background: "rgba(255, 255, 255, 0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(230, 180, 130, 0.08)", borderRadius: 20, padding: "24px", marginBottom: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", cursor: "pointer", transition: "all 0.25s ease" } as React.CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 800, color: "#28D7D6", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" as const } as React.CSSProperties,
  lbl: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "rgba(216, 234, 242, 0.75)", marginBottom: 8, display: "block" },
  inp: { width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "Inter,sans-serif", outline: "none", boxSizing: "border-box" as const, marginBottom: 16, transition: "all 0.2s" } as React.CSSProperties,
  ta: { width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const, marginBottom: 16 } as React.CSSProperties,
  btnPrimary: { padding: "12px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#28D7D6,#0066cc)", color: "#000", fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: "0 4px 15px rgba(40, 215, 214, 0.3)", transition: "all 0.2s" } as React.CSSProperties,
  btnAdd: { padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(40, 215, 214, 0.3)", background: "rgba(40, 215, 214, 0.05)", color: "#28D7D6", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif", transition: "all 0.2s" } as React.CSSProperties,
  btnDel: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif" } as React.CSSProperties,
  btnBack: { padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "rgba(216, 234, 242, 0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif" } as React.CSSProperties,
  badge: { padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 } as React.CSSProperties,
  info: { fontSize: 13, color: "rgba(216, 234, 242, 0.5)", lineHeight: 1.6, marginBottom: 16 },
  saved: { color: "#34d399", fontSize: 14, fontWeight: 800, textShadow: "0 0 10px rgba(52, 211, 153, 0.3)" },
};

const ROUND_ICONS: Record<string, string> = { mcq: "📝", programming: "💻", jumble: "🔀" };
const ROUND_LABELS: Record<string, string> = { mcq: "MCQ Round", programming: "Programming Round", jumble: "Jumble Round" };

export default function EventsAdminTab() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await adminFetch<EventItem[]>("/py-api/admin/events");
      setEvents(data || []);
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEventDetail = useCallback(async (eventId: string) => {
    try {
      const data = await adminFetch<EventItem>(`/py-api/admin/events/${eventId}`);
      setSelectedEvent(data);
    } catch (err) {
      console.error("Failed to load event:", err);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await adminFetch("/py-api/admin/events", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      setShowCreate(false);
      fetchEvents();
    } catch (err: any) {
      alert("Failed to create event: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Delete this event and all its rounds? This cannot be undone.")) return;
    try {
      await adminFetch(`/py-api/admin/events/${eventId}`, { method: "DELETE" });
      setSelectedEvent(null);
      fetchEvents();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleToggleActive = async (eventId: string, currentActive: boolean) => {
    try {
      await adminFetch(`/py-api/admin/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ is_active: !currentActive }) });
      fetchEvents();
      if (selectedEvent?.id === eventId) fetchEventDetail(eventId);
    } catch (err: any) {
      alert("Failed to toggle: " + err.message);
    }
  };

  const handleAddRound = async (eventId: string, roundType: string) => {
    try {
      const defaultConfigs: Record<string, any> = {
        mcq: { questions: [] },
        programming: { title: "Coding Challenge", description: "", starterCode: "", testCases: [], language: "python", hint: "" },
        jumble: { title: "Code Jumble", description: "Drag lines into correct order", lines: [] },
      };
      await adminFetch(`/py-api/admin/events/${eventId}/rounds`, {
        method: "POST",
        body: JSON.stringify({
          round_type: roundType,
          title: ROUND_LABELS[roundType] || "New Round",
          config_json: defaultConfigs[roundType] || {},
        }),
      });
      fetchEventDetail(eventId);
    } catch (err: any) {
      alert("Failed to add round: " + err.message);
    }
  };

  const handleDeleteRound = async (eventId: string, roundId: string) => {
    if (!confirm("Delete this round?")) return;
    try {
      await adminFetch(`/py-api/admin/events/${eventId}/rounds/${roundId}`, { method: "DELETE" });
      fetchEventDetail(eventId);
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleSaveRound = async (eventId: string, roundId: string, updates: any) => {
    try {
      await adminFetch(`/py-api/admin/events/${eventId}/rounds/${roundId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      fetchEventDetail(eventId);
    } catch (err: any) {
      alert("Save failed: " + err.message);
    }
  };

  // ── EVENT DETAIL VIEW ──
  if (selectedEvent) {
    const ev = selectedEvent;
    return (
      <div style={$.wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <button style={$.btnBack} onClick={() => { setSelectedEvent(null); setExpandedRound(null); fetchEvents(); }}>← Back to Events</button>
          <h2 style={$.h2}>{ev.name}</h2>
          <span style={{ ...$.badge, background: ev.is_active ? "rgba(40,215,214,0.1)" : "rgba(239,68,68,0.1)", color: ev.is_active ? "#28D7D6" : "#ef4444", border: `1px solid ${ev.is_active ? "rgba(40,215,214,0.3)" : "rgba(239,68,68,0.3)"}` }}>
            {ev.is_active ? "✅ Active" : "🚫 Inactive"}
          </span>
          <button style={{ ...$.btnBack, borderColor: ev.is_active ? "rgba(239,68,68,0.3)" : "rgba(40,215,214,0.3)", color: ev.is_active ? "#ef4444" : "#28D7D6" }} onClick={() => handleToggleActive(ev.id, ev.is_active)}>
            {ev.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
        {ev.created_by_name && <div style={$.info}>Created by: <strong>{ev.created_by_name}</strong></div>}

        {/* Add Round Buttons */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {["mcq", "programming", "jumble"].map(type => (
            <button key={type} style={$.btnAdd} onClick={() => handleAddRound(ev.id, type)}>
              {ROUND_ICONS[type]} ➕ Add {ROUND_LABELS[type]}
            </button>
          ))}
        </div>

        {/* Rounds List */}
        {(!ev.rounds || ev.rounds.length === 0) ? (
          <div style={{ ...$.card, cursor: "default", textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No rounds yet</div>
            <div style={$.info}>Click one of the buttons above to add an MCQ, Programming, or Jumble round.</div>
          </div>
        ) : (
          ev.rounds.map(round => (
            <div key={round.id} style={{ ...$.card, cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expandedRound === round.id ? 16 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{ROUND_ICONS[round.round_type]}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Round {round.round_number}: {round.title}</div>
                    <div style={{ fontSize: 12, color: "rgba(216,234,242,0.5)" }}>{ROUND_LABELS[round.round_type]}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={$.btnBack} onClick={() => setExpandedRound(expandedRound === round.id ? null : round.id)}>
                    {expandedRound === round.id ? "▲ Collapse" : "✏️ Edit"}
                  </button>
                  <button style={$.btnDel} onClick={() => handleDeleteRound(ev.id, round.id)}>✕</button>
                </div>
              </div>

              {expandedRound === round.id && (
                <RoundEditor
                  round={round}
                  onSave={(updates) => handleSaveRound(ev.id, round.id, updates)}
                />
              )}
            </div>
          ))
        )}

        <div style={{ marginTop: 32, borderTop: "1px solid rgba(239,68,68,0.15)", paddingTop: 24 }}>
          <button style={$.btnDel} onClick={() => handleDeleteEvent(ev.id)}>🗑️ Delete Entire Event</button>
        </div>
      </div>
    );
  }

  // ── EVENTS LIST VIEW ──
  return (
    <div style={$.wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <h2 style={$.h2}>🎯 Events</h2>
        <button style={$.btnPrimary} onClick={() => setShowCreate(true)}>➕ Add Event</button>
      </div>
      <div style={$.sub}>Create and manage events with multiple rounds (MCQ, Programming, Jumble).</div>

      {/* Create Event Modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowCreate(false)}>
          <div style={{ ...$.card, cursor: "default", maxWidth: 440, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ ...$.cardTitle, marginBottom: 20 }}>Create New Event</div>
            <label style={$.lbl}>Event Name</label>
            <input
              style={$.inp}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. PyHunt 2025, Code Sprint, Quiz Night..."
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={$.btnBack} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={$.btnPrimary} onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={$.info}>Loading events...</div>
      ) : events.length === 0 ? (
        <div style={{ ...$.card, cursor: "default", textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎪</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No events created yet</div>
          <div style={$.info}>Click "Add Event" to create your first event.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {events.map(ev => (
            <div
              key={ev.id}
              style={$.card}
              onClick={() => { fetchEventDetail(ev.id); }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-4px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{ev.name}</div>
                <span style={{ ...$.badge, background: ev.is_active ? "rgba(40,215,214,0.1)" : "rgba(239,68,68,0.1)", color: ev.is_active ? "#28D7D6" : "#ef4444", border: `1px solid ${ev.is_active ? "rgba(40,215,214,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                  {ev.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              {ev.description && <div style={{ fontSize: 13, color: "rgba(216,234,242,0.5)", marginBottom: 12 }}>{ev.description}</div>}
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ ...$.badge, background: "rgba(139,92,246,0.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}>
                  🎯 {ev.round_count} round{ev.round_count !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 12, color: "rgba(216,234,242,0.4)" }}>
                  by {ev.created_by_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Round Editor ─────────────────────────────── */
function RoundEditor({ round, onSave }: { round: EventRound; onSave: (updates: any) => void }) {
  const config = typeof round.config_json === "string" ? JSON.parse(round.config_json) : (round.config_json || {});
  const [localConfig, setLocalConfig] = useState(config);
  const [title, setTitle] = useState(round.title);
  const [saved, setSaved] = useState(false);

  const doSave = () => {
    onSave({ title, config_json: localConfig });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (round.round_type === "mcq") return <MCQEditor config={localConfig} setConfig={setLocalConfig} title={title} setTitle={setTitle} onSave={doSave} saved={saved} />;
  if (round.round_type === "programming") return <ProgrammingEditor config={localConfig} setConfig={setLocalConfig} title={title} setTitle={setTitle} onSave={doSave} saved={saved} />;
  if (round.round_type === "jumble") return <JumbleEditor config={localConfig} setConfig={setLocalConfig} title={title} setTitle={setTitle} onSave={doSave} saved={saved} />;
  return <div style={$.info}>Unknown round type: {round.round_type}</div>;
}

/* ─── MCQ Editor ─────────────────────────────── */
function MCQEditor({ config, setConfig, title, setTitle, onSave, saved }: any) {
  const questions = config.questions || [];
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const addQ = () => {
    const q = { id: `q${Date.now()}`, question: "New question?", options: [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }], correct: "A", explanation: "", marks: 1 };
    setConfig({ ...config, questions: [...questions, q] });
    setEditIdx(questions.length);
  };

  const updateQ = (i: number, field: string, val: any) => {
    const qs = [...questions];
    qs[i] = { ...qs[i], [field]: val };
    setConfig({ ...config, questions: qs });
  };

  const delQ = (i: number) => {
    setConfig({ ...config, questions: questions.filter((_: any, j: number) => j !== i) });
    setEditIdx(null);
  };

  return (
    <div>
      <label style={$.lbl}>Round Title</label>
      <input style={$.inp} value={title} onChange={e => setTitle(e.target.value)} />

      <div style={{ ...$.cardTitle, color: "#a78bfa", marginTop: 16 }}>📝 Questions ({questions.length})</div>
      {questions.map((q: any, i: number) => (
        <div key={q.id || i} style={{ padding: 16, background: "rgba(0,0,0,0.15)", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#a78bfa" }}>Q{i + 1}. {q.question?.substring(0, 60)}{q.question?.length > 60 ? "..." : ""}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={$.btnBack} onClick={() => setEditIdx(editIdx === i ? null : i)}>{editIdx === i ? "▲" : "✏️"}</button>
              <button style={{ ...$.btnDel, padding: "6px 12px", fontSize: 12 }} onClick={() => delQ(i)}>✕</button>
            </div>
          </div>
          {editIdx === i && (
            <div style={{ marginTop: 12 }}>
              <label style={$.lbl}>Question Text</label>
              <textarea style={{ ...$.ta, minHeight: 60 }} value={q.question} onChange={e => updateQ(i, "question", e.target.value)} />
              <label style={$.lbl}>Options</label>
              {(q.options || []).map((opt: any, oi: number) => (
                <div key={opt.label} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "#28D7D6", fontWeight: 800, width: 20 }}>{opt.label}.</span>
                  <input style={{ ...$.inp, margin: 0, flex: 1 }} value={opt.text} onChange={e => {
                    const opts = [...q.options];
                    opts[oi] = { ...opts[oi], text: e.target.value };
                    updateQ(i, "options", opts);
                  }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={$.lbl}>Correct</label>
                  <select style={{ ...$.inp, width: "100%" }} value={q.correct} onChange={e => updateQ(i, "correct", e.target.value)}>
                    {(q.options || []).map((o: any) => <option key={o.label} value={o.label}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={$.lbl}>Marks</label>
                  <input type="number" style={{ ...$.inp, width: "100%" }} value={q.marks || 1} onChange={e => updateQ(i, "marks", +e.target.value)} />
                </div>
              </div>
              <label style={$.lbl}>Explanation</label>
              <input style={$.inp} value={q.explanation || ""} onChange={e => updateQ(i, "explanation", e.target.value)} placeholder="Why is this correct?" />
            </div>
          )}
        </div>
      ))}
      <button style={{ ...$.btnAdd, marginBottom: 20 }} onClick={addQ}>+ Add Question</button>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button style={$.btnPrimary} onClick={onSave}>💾 Save Round</button>
        {saved && <span style={$.saved}>✓ Saved!</span>}
      </div>
    </div>
  );
}

/* ─── Programming Editor ─────────────────────── */
function ProgrammingEditor({ config, setConfig, title, setTitle, onSave, saved }: any) {
  const testCases = config.testCases || [];
  const lang = config.language || "python";

  const addTC = () => setConfig({ ...config, testCases: [...testCases, { input: "", expected: "" }] });
  const delTC = (i: number) => setConfig({ ...config, testCases: testCases.filter((_: any, j: number) => j !== i) });
  const updateTC = (i: number, f: string, v: string) => {
    const tcs = [...testCases]; tcs[i] = { ...tcs[i], [f]: v }; setConfig({ ...config, testCases: tcs });
  };

  return (
    <div>
      <label style={$.lbl}>Round Title</label>
      <input style={$.inp} value={title} onChange={e => setTitle(e.target.value)} />

      <label style={$.lbl}>🌐 Language</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["python", "c", "cpp", "java"].map(l => (
          <button key={l} onClick={() => setConfig({ ...config, language: l })} style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: lang === l ? "rgba(40,215,214,0.15)" : "rgba(255,255,255,0.03)",
            color: lang === l ? "#28D7D6" : "rgba(216,234,242,0.5)",
            border: `1px solid ${lang === l ? "rgba(40,215,214,0.4)" : "rgba(255,255,255,0.1)"}`,
          }}>
            {l === "python" ? "🐍" : l === "java" ? "☕" : "⚙️"} {l.toUpperCase()}
          </button>
        ))}
      </div>

      <label style={$.lbl}>Coding Challenge Prompt</label>
      <textarea style={{ ...$.ta, minHeight: 120 }} value={config.description || ""} onChange={e => setConfig({ ...config, description: e.target.value })} placeholder="Describe the problem..." />

      <label style={$.lbl}>Expected Target Output (Optional)</label>
      <input style={$.inp} value={config.targetOutput || ""} onChange={e => setConfig({ ...config, targetOutput: e.target.value })} placeholder="e.g., hello" />

      <label style={$.lbl}>Starter Code Template</label>
      <textarea style={{ ...$.ta, minHeight: 150, fontFamily: "'JetBrains Mono',monospace", background: "#0d1117", color: "#e6edf3", border: "1px solid rgba(40,215,214,0.15)" }} value={config.starterCode || ""} onChange={e => setConfig({ ...config, starterCode: e.target.value })} />

      <div style={{ ...$.cardTitle, color: "#28D7D6", marginTop: 16 }}>🧪 Test Cases ({testCases.length})</div>
      {testCases.map((tc: any, i: number) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <input style={{ ...$.inp, flex: 1, margin: 0 }} value={tc.input} onChange={e => updateTC(i, "input", e.target.value)} placeholder="Input" />
          <input style={{ ...$.inp, flex: 1, margin: 0 }} value={tc.expected} onChange={e => updateTC(i, "expected", e.target.value)} placeholder="Expected Output" />
          <button style={{ ...$.btnDel, padding: "8px 12px" }} onClick={() => delTC(i)}>✕</button>
        </div>
      ))}
      <button style={{ ...$.btnAdd, marginBottom: 20 }} onClick={addTC}>+ Add Test Case</button>

      <label style={$.lbl}>Hint (Optional)</label>
      <input style={$.inp} value={config.hint || ""} onChange={e => setConfig({ ...config, hint: e.target.value })} placeholder="Optional hint for students..." />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button style={$.btnPrimary} onClick={onSave}>💾 Save Round</button>
        {saved && <span style={$.saved}>✓ Saved!</span>}
      </div>
    </div>
  );
}

/* ─── Jumble Editor ──────────────────────────── */
function JumbleEditor({ config, setConfig, title, setTitle, onSave, saved }: any) {
  return (
    <div>
      <label style={$.lbl}>Round Title</label>
      <input style={$.inp} value={title} onChange={e => setTitle(e.target.value)} />

      <label style={$.lbl}>Description</label>
      <textarea style={{ ...$.ta, minHeight: 80 }} value={config.description || ""} onChange={e => setConfig({ ...config, description: e.target.value })} placeholder="Drag lines into correct order..." />

      <label style={$.lbl}>Code Lines — Enter in CORRECT order (one per line). Students see them shuffled.</label>
      <textarea
        style={{ ...$.ta, minHeight: 200, fontFamily: "'JetBrains Mono',monospace", background: "#0d1117", color: "#e6edf3", border: "1px solid rgba(40,215,214,0.15)" }}
        value={(config.lines || []).join("\n")}
        onChange={e => setConfig({ ...config, lines: e.target.value.split("\n") })}
        placeholder={"def hello():\n    print('Hello World')\n\nhello()"}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button style={$.btnPrimary} onClick={onSave}>💾 Save Round</button>
        {saved && <span style={$.saved}>✓ Saved!</span>}
      </div>
    </div>
  );
}
