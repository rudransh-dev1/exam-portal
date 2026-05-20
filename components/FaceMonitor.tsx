"use client";

import { useEffect, useState } from "react";
import { useFullscreen } from "@/hooks/useFullscreen";
import fm from "./FaceMonitor.module.css";

interface FaceMonitorProps {
  onViolation: (type: string, metadata?: Record<string, unknown>) => void;
  isSubmitted: boolean;
}

export default function FaceMonitor({ onViolation, isSubmitted }: FaceMonitorProps) {
  const { enter: enterFullscreen } = useFullscreen();

  useEffect(() => {
    // We trigger fullscreen once when the component mounts and is not submitted
    // Wait a brief moment to ensure user interaction has registered if needed
    if (!isSubmitted) {
      const timer = setTimeout(() => {
        enterFullscreen();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isSubmitted, enterFullscreen]);

  return (
    <div className="face-monitor" style={{ display: 'none' }}>
      {/* Camera and audio monitoring have been disabled as per requirements */}
    </div>
  );
}