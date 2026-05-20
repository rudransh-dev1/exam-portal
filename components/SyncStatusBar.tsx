/**
 * SyncStatusBar.tsx
 * Floating status bar shown during exam — shows sync state + offline warnings.
 * Includes "Download Backup" button.
 */
"use client";
import React from "react";
import s from "./SyncStatusBar.module.css";

type SyncStatus = "idle" | "syncing" | "offline" | "degraded" | "error";

interface Props {
  syncStatus:    SyncStatus;
  lastSyncedAt:  Date | null;
  offlineMsg:    string | null;
}

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; dot: string }> = {
  idle:     { label: "Saved",         color: "#10b981", dot: "🟢" },
  syncing:  { label: "Saving...",     color: "#f59e0b", dot: "🟡" },
  offline:  { label: "Offline",       color: "#ef4444", dot: "🔴" },
  degraded: { label: "Degraded",      color: "#f97316", dot: "🟠" },
  error:    { label: "Sync Error",    color: "#ef4444", dot: "🔴" },
};

export default function SyncStatusBar({ syncStatus, lastSyncedAt, offlineMsg }: Props) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const cfg = STATUS_CONFIG[syncStatus];

  return (
    <>
      {/* Floating status pill */}
      <div className={`${s.wrapper} ${isMobile ? s.wrapperMobile : s.wrapperDesktop}`}>
        {/* Offline / degraded banner */}
        {offlineMsg && (
          <div className={s.banner}>
            <div className={s.bannerInner}>
              <span>⚠️</span>
              <div>
                {offlineMsg}
              </div>
            </div>
          </div>
        )}

        {/* Status pill */}
        <div className={s.pill} style={{ borderColor: `${cfg.color}66` }}>
          <div className={s.dot} style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.color}` }} />
          <span className={s.label} style={{ color: cfg.color }}>{cfg.label}</span>
          {lastSyncedAt && syncStatus === "idle" && (
            <span className={s.syncTime} suppressHydrationWarning>
              Synced {lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
