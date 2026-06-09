"use client";

import { useState, useEffect } from "react";

const SLA_HOURS = 48;

function computeRemaining(createdAt: string) {
  const deadline = new Date(createdAt).getTime() + SLA_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const ms = deadline - now;
  return ms;
}

export default function SlaCountdown({ createdAt }: { createdAt: string }) {
  const [ms, setMs] = useState(() => computeRemaining(createdAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setMs(computeRemaining(createdAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (ms <= 0) {
    return <span className="atty-sla atty-sla-overdue">SLA overdue</span>;
  }

  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const urgent = hours < 4;
  const warning = !urgent && hours < 12;

  const label = hours > 0
    ? `${hours}h ${mins}m left`
    : `${mins}m ${secs.toString().padStart(2, "0")}s left`;

  return (
    <span className={`atty-sla ${urgent ? "atty-sla-urgent" : warning ? "atty-sla-warning" : "atty-sla-ok"}`}>
      ⏱ {label}
    </span>
  );
}
