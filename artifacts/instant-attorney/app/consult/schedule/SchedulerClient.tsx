"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CaseFile } from "@/lib/types";

type CaseFileMini = Pick<CaseFile, "id" | "title" | "matter_type" | "matter_subtype">;

// Generate all 30-min slots for a date in CST (returns UTC ISO strings)
function getSlotsForDate(year: number, month: number, day: number): string[] {
  const slots: string[] = [];
  const minAllowed = Date.now() + 24 * 60 * 60 * 1000;
  for (let h = 8; h < 20; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) continue; // last slot 19:30 ends 20:00 ✓, but 19:30 start is fine
      // Build a CST datetime string and convert to UTC
      const cstStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      // Use a trick: parse as if UTC, then adjust for CST offset
      // CST = UTC-6, CDT = UTC-5 — use Intl to get the actual offset
      const probe = new Date(`${cstStr}Z`); // treat as UTC first
      const localOffset = getCSTPOffset(probe);
      const utcMs = probe.getTime() + localOffset * 60 * 1000;
      const utcDate = new Date(utcMs);
      if (utcDate.getTime() < minAllowed) continue;
      slots.push(utcDate.toISOString());
    }
  }
  return slots;
}

// Returns CST/CDT offset in minutes from UTC (positive = west, so CST=360, CDT=300)
// We need to subtract this from UTC to get CST: UTC - offset = CST → CST + offset = UTC
function getCSTPOffset(d: Date): number {
  const cstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const cstParts = cstFormatter.formatToParts(d);
  const utcParts = utcFormatter.formatToParts(d);
  const cstH = parseInt(cstParts.find(p => p.type === "hour")!.value);
  const cstM = parseInt(cstParts.find(p => p.type === "minute")!.value);
  const utcH = parseInt(utcParts.find(p => p.type === "hour")!.value);
  const utcM = parseInt(utcParts.find(p => p.type === "minute")!.value);
  return (utcH * 60 + utcM) - (cstH * 60 + cstM);
}

function fmtSlot(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function fmtSlotTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Get Mon–Sun week day names for header
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface CalDay { year: number; month: number; day: number; inMonth: boolean; disabled: boolean }

function buildCalendar(year: number, month: number): CalDay[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const cells: CalDay[] = [];
  // Pad with days from previous month
  for (let i = 0; i < firstDow; i++) {
    const d = new Date(year, month, 1 - (firstDow - i));
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), inMonth: false, disabled: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isPast = date < minDate && date.toDateString() !== minDate.toDateString();
    // A day is disabled if weekend or all slots would be in the past
    // For simplicity: disable if the day ends (20:00 CST) before minAllowed
    const dayEnd = new Date(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T20:00:00`);
    const offset = getCSTPOffset(dayEnd);
    const dayEndUTC = new Date(dayEnd.getTime() + offset * 60 * 1000);
    const disabled = isWeekend || dayEndUTC.getTime() < Date.now() + 24 * 60 * 60 * 1000;
    cells.push({ year, month, day: d, inMonth: true, disabled });
  }
  return cells;
}

export default function SchedulerClient({ caseFiles }: { caseFiles: CaseFileMini[] }) {
  const router = useRouter();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [caseFileId, setCaseFileId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const calDays = useMemo(() => buildCalendar(viewYear, viewMonth), [viewYear, viewMonth]);
  const slots = useMemo(() =>
    selectedDate ? getSlotsForDate(selectedDate.year, selectedDate.month, selectedDate.day) : [],
    [selectedDate]
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function toggleSlot(iso: string) {
    setPicks(prev => {
      if (prev.includes(iso)) return prev.filter(p => p !== iso);
      if (prev.length >= 3) return prev; // already 3
      return [...prev, iso];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (picks.length !== 3) { setError("Please select exactly 3 time slots."); return; }
    if (!phone.trim()) { setError("Phone number is required."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedTimes: picks, clientPhone: phone, caseFileId: caseFileId || undefined, notes: notes || undefined }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Submission failed");
      }
      router.push("/dashboard?consult=scheduled");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const isDateSelected = (cell: CalDay) =>
    selectedDate?.year === cell.year && selectedDate?.month === cell.month && selectedDate?.day === cell.day;

  return (
    <div className="cs-scheduler">
      {/* Calendar + Slots */}
      <div className="cs-picker-row">
        {/* Calendar */}
        <div className="cs-calendar-panel">
          <div className="cs-cal-nav">
            <button className="cs-cal-nav-btn" onClick={prevMonth} type="button">‹</button>
            <span className="cs-cal-month">{MONTHS[viewMonth]} {viewYear}</span>
            <button className="cs-cal-nav-btn" onClick={nextMonth} type="button">›</button>
          </div>
          <div className="cs-cal-grid">
            {WEEKDAYS.map(d => <div key={d} className="cs-cal-dow">{d}</div>)}
            {calDays.map((cell, i) => (
              <button
                key={i}
                type="button"
                className={[
                  "cs-day",
                  !cell.inMonth ? "cs-day-other" : "",
                  cell.disabled ? "cs-day-disabled" : "",
                  isDateSelected(cell) ? "cs-day-selected" : "",
                  !cell.disabled && picks.some(p => {
                    const pd = new Date(p);
                    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(pd);
                    const pYear = parseInt(parts.find(x => x.type === "year")!.value);
                    const pMonth = parseInt(parts.find(x => x.type === "month")!.value) - 1;
                    const pDay = parseInt(parts.find(x => x.type === "day")!.value);
                    return pYear === cell.year && pMonth === cell.month && pDay === cell.day;
                  }) ? "cs-day-has-pick" : "",
                ].join(" ").trim()}
                disabled={cell.disabled || !cell.inMonth}
                onClick={() => !cell.disabled && cell.inMonth && setSelectedDate({ year: cell.year, month: cell.month, day: cell.day })}
              >
                {cell.day}
              </button>
            ))}
          </div>
        </div>

        {/* Time Slots */}
        <div className="cs-slots-panel">
          {!selectedDate ? (
            <div className="cs-slots-empty">← Select a date to see available times</div>
          ) : (
            <>
              <div className="cs-slots-date">
                {new Date(selectedDate.year, selectedDate.month, selectedDate.day)
                  .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </div>
              {slots.length === 0 ? (
                <div className="cs-slots-empty">No available slots on this date.</div>
              ) : (
                <div className="cs-slots-grid">
                  {slots.map(iso => {
                    const selected = picks.includes(iso);
                    const maxed = picks.length >= 3 && !selected;
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`cs-slot${selected ? " cs-slot-selected" : ""}${maxed ? " cs-slot-maxed" : ""}`}
                        onClick={() => toggleSlot(iso)}
                        disabled={maxed}
                      >
                        {fmtSlotTime(iso)} CST
                        {selected && <span className="cs-slot-check"> ✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Selected chips */}
      <div className="cs-chips-area">
        <div className="cs-chips-label">
          Selected times <span className="cs-chips-count">{picks.length}/3</span>
        </div>
        {picks.length === 0 ? (
          <span className="cs-chips-empty">No times selected yet</span>
        ) : (
          <div className="cs-chips">
            {picks.map((iso, i) => (
              <div key={iso} className="cs-chip">
                <span className="cs-chip-num">{i + 1}</span>
                {fmtSlot(iso)}
                <button type="button" className="cs-chip-remove" onClick={() => setPicks(p => p.filter(x => x !== iso))}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form */}
      <form className="cs-form" onSubmit={handleSubmit}>
        <div className="cs-form-row">
          <div className="cs-form-field">
            <label className="cs-form-label">Your Phone Number <span className="cs-form-req">*</span></label>
            <input
              type="tel"
              className="cs-form-input"
              placeholder="(512) 555-0100"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
            <span className="cs-form-hint">Andrew will call you at this number.</span>
          </div>
          {caseFiles.length > 0 && (
            <div className="cs-form-field">
              <label className="cs-form-label">Related File <span className="cs-form-optional">(optional)</span></label>
              <select className="cs-form-input cs-form-select" value={caseFileId} onChange={e => setCaseFileId(e.target.value)}>
                <option value="">— Select a file —</option>
                {caseFiles.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.title ?? (f.matter_type ? `${f.matter_type}${f.matter_subtype ? ` — ${f.matter_subtype}` : ""}` : "Untitled file")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="cs-form-field">
          <label className="cs-form-label">Anything to flag before the call? <span className="cs-form-optional">(optional)</span></label>
          <textarea
            className="cs-form-input cs-form-textarea"
            placeholder="Brief note on urgency, key questions, or context…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {error && <div className="cs-form-error">{error}</div>}

        <button
          type="submit"
          className="cs-submit-btn"
          disabled={picks.length !== 3 || !phone.trim() || submitting}
        >
          {submitting ? "Submitting…" : picks.length === 3 ? "Submit 3 Times for Confirmation →" : `Select ${3 - picks.length} more time${3 - picks.length !== 1 ? "s" : ""} to continue`}
        </button>
      </form>
    </div>
  );
}
