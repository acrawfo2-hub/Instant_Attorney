"use client";

export default function ReviewSlaClock({
  submittedAt,
  compact = false,
}: {
  submittedAt: string;
  compact?: boolean;
}) {
  const submitted = new Date(submittedAt);
  const deadline = new Date(submitted.getTime() + 48 * 60 * 60 * 1000);
  const msLeft = deadline.getTime() - Date.now();
  const submittedLabel = submitted.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (msLeft <= 0) {
    return (
      <div className={compact ? "sla-clock sla-clock-compact" : "sla-clock"}>
        <span className="sla-clock-overdue">Review window exceeded — attorney notified at submission</span>
        {!compact && <span className="sla-clock-submitted">Submitted {submittedLabel}</span>}
      </div>
    );
  }

  const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className={compact ? "sla-clock sla-clock-compact" : "sla-clock"}>
      <span className="sla-clock-time">
        {hoursLeft}h {minutesLeft}m remaining in 48-hour review window
      </span>
      <span className="sla-clock-submitted">Submitted {submittedLabel}</span>
    </div>
  );
}
